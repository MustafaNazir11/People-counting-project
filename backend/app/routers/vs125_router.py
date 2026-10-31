from datetime import date, datetime, time, timedelta, timezone
import json
import logging
import os
import secrets
import base64
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select, desc, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import AsyncSessionLocal
from app.models import (
    Sensor, Store, UserStoreAccess, SensorLineReading, Organization,
    SensorConfiguration, SensorDeviceInfo, SensorLineTotalSnapshot,
)
from app.auth.dependencies import get_current_user
from app.services.vs125_service import (
    SensorPayload,
    ingest_readings,
    resolve_ingest_sensor_id,
    ingest_device_report,
)

router = APIRouter(prefix="/sensors/vs125", tags=["VS125"])
logger = logging.getLogger(__name__)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@router.post("/ingest")
async def ingest_vs125(
    payload: SensorPayload,
    x_sensor_token: str | None = Header(default=None),
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    try:
        sensor_id = await resolve_ingest_sensor_id(db, x_sensor_token)
    except SQLAlchemyError as exc:
        logger.error(
            "Sensor credential lookup failed (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Sensor credential storage is unavailable.",
        ) from exc
    if sensor_id is None:
        raise HTTPException(status_code=401, detail="Invalid sensor token")

    try:
        result = await db.execute(
            select(Sensor.id)
            .join(Store, Sensor.store_id == Store.id)
            .join(
                Organization,
                Store.organization_id == Organization.id,
            )
            .where(
                Sensor.id == sensor_id,
                Sensor.is_enabled.is_(True),
                Store.is_active.is_(True),
                Organization.is_active.is_(True),
            )
        )

        sensor_is_allowed = result.scalar_one_or_none()

    except SQLAlchemyError as exc:
        logger.error(
            "Sensor access check failed (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Sensor access validation is unavailable.",
        ) from exc

    if sensor_is_allowed is None:
        raise HTTPException(
            status_code=403,
            detail="Sensor, store, or organization is inactive or unavailable.",
        )

    try:
        records_saved = await ingest_readings(
            db,
            sensor_id,
            idempotency_key,
            payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        logger.error(
            "VS125 reading persistence failed (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Sensor reading storage is unavailable.",
        ) from exc

    return {
        "status": "saved",
        "records_saved": records_saved,
        "duplicate": records_saved == 0 and bool(payload.line_periodic_total_data),
    }



@router.post("/device-webhook")
async def vs125_device_webhook(request: Request):
    """Receive actual VS125 HTTP reports (Basic authentication)."""

    expected_username = os.getenv("VS125_TEST_USERNAME", "")
    expected_password = os.getenv("VS125_TEST_PASSWORD", "")
    if not expected_username or not expected_password:
        raise HTTPException(
            status_code=503,
            detail="VS125 credentials are not configured",
        )

    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Basic "):
        raise HTTPException(
            status_code=401,
            detail="Basic authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )

    try:
        data = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    logger.warning(
        "VS125 incoming payload: %s",
        json.dumps(data, indent=2)
    )

    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Expected a JSON object")

    # Milesight sends this as a connectivity test. It must not create records.
    if data.get("event") == "test":
        return {
            "status": "ok",
            "message": "test received",
            "periodic_records_saved": 0,
            "total_snapshots_upserted": 0,
        }

    try:
        sensor_id = int(os.getenv("VS125_SENSOR_ID", "").strip())
        if sensor_id <= 0:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail="Invalid VS125_SENSOR_ID",
        ) from exc

    device = data.get("device_info")
    if device is not None and not isinstance(device, dict):
        raise HTTPException(status_code=422, detail="device_info must be an object")

    config_keys = {"lineInfo", "regionInfo", "gazeDetect", "detectExclusion"}
    is_config = any(key in data for key in config_keys)

    try:
        async with AsyncSessionLocal() as db:
            # Keep the existing sensor -> store -> organization activation check.
            result = await db.execute(
                select(Sensor.id)
                .join(Store, Store.id == Sensor.store_id)
                .join(Organization, Organization.id == Store.organization_id)
                .where(
                    Sensor.id == sensor_id,
                    Sensor.is_enabled.is_(True),
                    Store.is_active.is_(True),
                    Organization.is_active.is_(True),
                )
            )
            if result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=403,
                    detail="Sensor, store, or organization is inactive or unavailable",
                )

            now = datetime.now(timezone.utc)
            device_saved = False
            config_saved = False

            if isinstance(device, dict):
                field_map = {
                    "device_name": "device_name",
                    "device_sn": "device_sn",
                    "ip_address": "ip_address",
                    "device_mac": "device_mac",
                    "wlan_mac": "device_wlan_mac",
                    "firmware_version": "firmware_version",
                    "hardware_version": "hardware_version",
                    "tsl_version": "tsl_version",
                    "cus_site_id": "cus_site_id",
                    "cus_device_id": "cus_device_id",
                    "running_time": "running_time",
                    "cpu": "cpu",
                    "ram": "ram",
                    "storage": "storage",
                    "device_tilt_pitch_roll": "device_tilt_pitch_roll",
                }
                values = {"sensor_id": sensor_id, "updated_at": now}
                for source_key, target in field_map.items():
                    value = device.get(source_key)
                    if value is None:
                        continue
                    if target == "running_time":
                        if (
                            isinstance(value, int)
                            and not isinstance(value, bool)
                            and value >= 0
                        ):
                            values[target] = value
                    elif target in {
                        "cpu", "ram", "storage", "device_tilt_pitch_roll"
                    }:
                        if isinstance(value, (dict, list)):
                            values[target] = value
                    elif isinstance(value, str):
                        values[target] = value

                if len(values) > 2:
                    statement = pg_insert(SensorDeviceInfo).values(**values)
                    statement = statement.on_conflict_do_update(
                        index_elements=[SensorDeviceInfo.sensor_id],
                        set_={
                            key: value
                            for key, value in values.items()
                            if key != "sensor_id"
                        },
                    )
                    await db.execute(statement)
                    device_saved = True

            # time_info is report timing metadata, not sensor configuration.
            if is_config:
                statement = pg_insert(SensorConfiguration).values(
                    sensor_id=sensor_id,
                    configuration={
                        key: data[key] for key in config_keys if key in data
                    },
                    fetched_at=now,
                )
                statement = statement.on_conflict_do_update(
                    index_elements=[SensorConfiguration.sensor_id],
                    set_={
                        "configuration": {
                            key: data[key] for key in config_keys if key in data
                        },
                        "fetched_at": now,
                    },
                )
                await db.execute(statement)
                config_saved = True

            counts = await ingest_device_report(db, sensor_id, data)

            # Mark the sensor online and refresh its last-seen metadata.
            sensor_updates = {
                "status": "online",
                "last_seen_at": now,
            }
            if isinstance(device, dict):
                if isinstance(device.get("device_sn"), str):
                    sensor_updates["serial_number"] = device["device_sn"]
                if isinstance(device.get("ip_address"), str):
                    sensor_updates["ip_address"] = device["ip_address"]
                if isinstance(device.get("firmware_version"), str):
                    sensor_updates["firmware_version"] = device["firmware_version"]

            await db.execute(
                update(Sensor)
                .where(Sensor.id == sensor_id)
                .values(**sensor_updates)
            )
            await db.commit()

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        logger.exception("VS125 webhook database save failed")
        raise HTTPException(
            status_code=503,
            detail="Could not store VS125 webhook data",
        ) from exc

    logger.info(
        "VS125 report processed sensor_id=%s periodic_saved=%s total_snapshots=%s",
        sensor_id,
        counts["periodic_records_saved"],
        counts["total_snapshots_upserted"],
    )
    return {
        "status": "saved",
        "sensor_id": sensor_id,
        "device_info_saved": device_saved,
        "configuration_saved": config_saved,
        **counts,
    }


@router.get("/readings")
async def get_vs125_readings(
    sensor_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=1000, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=400,
            detail="end_date must be on or after start_date",
        )


    query = (
        select(SensorLineReading, Store.id, Store.name)
        .options(
            load_only(
                SensorLineReading.id,
                SensorLineReading.sensor_id,
                SensorLineReading.line_id,
                SensorLineReading.line_name,
                SensorLineReading.individuals_in,
                SensorLineReading.individuals_out,
                SensorLineReading.male_in,
                SensorLineReading.male_out,
                SensorLineReading.female_in,
                SensorLineReading.female_out,
                SensorLineReading.group_in,
                SensorLineReading.group_out,
                SensorLineReading.children,
                SensorLineReading.period_start_at,
                SensorLineReading.recorded_at,
                SensorLineReading.received_at,
            )
        )
        .join(Sensor, Sensor.id == SensorLineReading.sensor_id)
        .join(Store, Store.id == Sensor.store_id)
        .where(
            Store.organization_id == current_user["organization_id"],
            Store.is_active.is_(True),
            Sensor.is_enabled.is_(True),
        )
    )

    if current_user["role"] != "org_admin":
        query = (
            query
            .join(
                UserStoreAccess,
                UserStoreAccess.store_id == Store.id,
            )
            .where(
                UserStoreAccess.user_id == current_user["id"]
            )
        )

    if sensor_id is not None:
        query = query.where(
            SensorLineReading.sensor_id == sensor_id
        )
    if start_date is not None:
        start_at = datetime.combine(
            start_date, time.min, tzinfo=timezone.utc
        )
        query = query.where(SensorLineReading.recorded_at >= start_at)
    if end_date is not None:
        end_at = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        )
        query = query.where(SensorLineReading.recorded_at < end_at)

    query = query.order_by(
        desc(SensorLineReading.received_at)
    ).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return {
        "count": len(rows),
        "readings": [
            {
                "id": row.id,
                "sensor_id": row.sensor_id,
                "store_id": store_id,
                "store_name": store_name,
                "line_id": row.line_id,
                "line_name": row.line_name,
                "individuals_in": row.individuals_in,
                "individuals_out": row.individuals_out,
                "male_in": row.male_in,
                "male_out": row.male_out,
                "female_in": row.female_in,
                "female_out": row.female_out,
                "group_in": row.group_in,
                "group_out": row.group_out,
                "children": row.children,
                "period_start_at": (
                    row.period_start_at.isoformat()
                    if row.period_start_at else None
                ),
                "recorded_at": (
                    row.recorded_at.isoformat()
                    if row.recorded_at else None
                ),
                "received_at": (
                    row.received_at.isoformat()
                    if row.received_at else None
                ),
            }
            for row, store_id, store_name in rows
        ],
    }


@router.get("/totals")
async def get_vs125_totals(
    sensor_id: int | None = None,
    limit: int = Query(default=1000, ge=1, le=2000),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the newest cumulative counter snapshot for each sensor line."""

    query = (
        select(SensorLineTotalSnapshot, Store.id, Store.name)
        .join(Sensor, Sensor.id == SensorLineTotalSnapshot.sensor_id)
        .join(Store, Store.id == Sensor.store_id)
        .where(
            Store.organization_id == current_user["organization_id"],
            Store.is_active.is_(True),
            Sensor.is_enabled.is_(True),
        )
    )

    if current_user["role"] != "org_admin":
        query = (
            query.join(UserStoreAccess, UserStoreAccess.store_id == Store.id)
            .where(UserStoreAccess.user_id == current_user["id"])
        )

    if sensor_id is not None:
        query = query.where(SensorLineTotalSnapshot.sensor_id == sensor_id)

    query = query.order_by(
        desc(SensorLineTotalSnapshot.recorded_at),
        desc(SensorLineTotalSnapshot.id),
    ).limit(limit)

    result = await db.execute(query)
    latest_by_line = {}
    for row, store_id, store_name in result.all():
        key = (row.sensor_id, row.line_uuid)
        if key in latest_by_line:
            continue
        latest_by_line[key] = {
            "id": row.id,
            "sensor_id": row.sensor_id,
            "store_id": store_id,
            "store_name": store_name,
            "line_id": row.line_id,
            "line_name": row.line_name,
            "line_uuid": row.line_uuid,
            "individuals_in": row.individuals_in,
            "individuals_out": row.individuals_out,
            "male_in": row.male_in,
            "male_out": row.male_out,
            "female_in": row.female_in,
            "female_out": row.female_out,
            "group_in": row.group_in,
            "group_out": row.group_out,
            "capacity_counted": row.capacity_counted,
            "children": row.children,
            "period_start_at": (
                row.period_start_at.isoformat()
                if row.period_start_at else None
            ),
            "recorded_at": (
                row.recorded_at.isoformat()
                if row.recorded_at else None
            ),
            "received_at": (
                row.received_at.isoformat()
                if row.received_at else None
            ),
            "is_retransmission": row.is_retransmission,
        }

    snapshots = list(latest_by_line.values())
    return {
        "count": len(snapshots),
        "snapshots": snapshots,
    }

