
from datetime import date, datetime, time, timedelta, timezone
import logging
import os
import secrets
import base64
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select, desc
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import AsyncSessionLocal
from app.models import Sensor, Store, UserStoreAccess, SensorLineReading, Organization, SensorConfiguration, SensorDeviceInfo
from app.auth.dependencies import get_current_user
from app.services.vs125 import (
    SensorPayload,
    ingest_readings,
    resolve_ingest_sensor_id,
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
    """Receive VS125 device data using configured HTTP Basic credentials."""

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
        decoded = base64.b64decode(
            authorization.split(" ", 1)[1],
            validate=True,
        ).decode("utf-8")
        username, password = decoded.split(":", 1)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        ) from exc

    if not (
        secrets.compare_digest(username, expected_username)
        and secrets.compare_digest(password, expected_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        data = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=422,
            detail="Expected a JSON object",
        )

    # Allow the device's connectivity test without writing database records.
    if data.get("event") == "test":
        return {
            "status": "ok",
            "message": "test received",
            "records_saved": 0,
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
    config_keys = {
        "lineInfo",
        "regionInfo",
        "gazeDetect",
        "detectExclusion",
        "time_info",
    }
    is_config = isinstance(device, dict) or any(
        key in data for key in config_keys
    )

    reading_data = (
        data.get("line_periodic_total_data")
        or data.get("line_periodic_data")
        or []
    )
    if not isinstance(reading_data, list):
        raise HTTPException(
            status_code=422,
            detail="Reading data must be a list",
        )

    now = datetime.now(timezone.utc)
    reading_rows = []

    def count_value(obj, key):
        value = obj.get(key, 0) if isinstance(obj, dict) else 0

        # Do not silently turn malformed counts into zero.
        if isinstance(value, bool):
            raise ValueError(f"Invalid count: {key}")

        try:
            count = int(value or 0)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid count: {key}") from exc

        if count < 0:
            raise ValueError(f"Negative count: {key}")

        return count

    try:
        for line in reading_data:
            if not isinstance(line, dict):
                raise ValueError("Each reading must be an object")

            total = line.get("total") or {}
            group = line.get("group") or {}

            if not isinstance(total, dict) or not isinstance(group, dict):
                raise ValueError("Reading totals must be objects")

            line_uuid = line.get("line_uuid")
            if not isinstance(line_uuid, str) or not line_uuid.strip():
                raise ValueError("Each reading must include a line_uuid")

            reading_rows.append(
                SensorLineReading(
                    sensor_id=sensor_id,
                    line_id=count_value(line, "line"),
                    line_name=str(line.get("line_name") or "Unknown"),
                    line_uuid=line_uuid,
                    # The device payload shown so far has no confirmed
                    # event identifier, so don't invent one.
                    source_event_id=None,
                    individuals_in=count_value(total, "in"),
                    individuals_out=count_value(total, "out"),
                    male_in=count_value(total, "male_in"),
                    male_out=count_value(total, "male_out"),
                    female_in=count_value(total, "female_in"),
                    female_out=count_value(total, "female_out"),
                    group_in=count_value(group, "in"),
                    group_out=count_value(group, "out"),
                    recorded_at=now,
                    received_at=now,
                )
            )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        async with AsyncSessionLocal() as db:
            # Verify the configured sensor belongs to an active store
            # and organization before accepting data.
            result = await db.execute(
                select(Sensor.id)
                .join(Store, Store.id == Sensor.store_id)
                .join(
                    Organization,
                    Organization.id == Store.organization_id,
                )
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

            device_saved = False
            config_saved = False

            if is_config:
                device = device if isinstance(device, dict) else {}

                field_map = {
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
                        "cpu",
                        "ram",
                        "storage",
                        "device_tilt_pitch_roll",
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

                statement = pg_insert(SensorConfiguration).values(
                    sensor_id=sensor_id,
                    configuration=data,
                    fetched_at=now,
                )
                statement = statement.on_conflict_do_update(
                    index_elements=[SensorConfiguration.sensor_id],
                    set_={
                        "configuration": data,
                        "fetched_at": now,
                    },
                )
                await db.execute(statement)
                config_saved = True

            if reading_rows:
                db.add_all(reading_rows)

            await db.commit()

    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        logger.exception("VS125 webhook database save failed")
        raise HTTPException(
            status_code=503,
            detail="Could not store VS125 webhook data",
        ) from exc

    return {
        "status": "saved",
        "sensor_id": sensor_id,
        "device_info_saved": device_saved,
        "configuration_saved": config_saved,
        "records_saved": len(reading_rows),
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
