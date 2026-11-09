
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.database import AsyncSessionLocal
from app.models import (
    Sensor,
    SensorConfiguration,
    SensorDeviceInfo,
    SensorLineReading,
    Store,
    UserStoreAccess,
)
from app.auth.dependencies import get_current_user


router = APIRouter()
logger = logging.getLogger(__name__)


# Seconds without a sensor report before a sensor is considered offline.
# Default: 300 (5 minutes). Minimum: 30.
def _offline_timeout_seconds() -> int:
    try:
        return max(30, int(os.getenv("SENSOR_OFFLINE_TIMEOUT_SECONDS", "300")))
    except (TypeError, ValueError):
        return 300


def compute_effective_status(
    last_seen_at: datetime | None,
    now: datetime | None = None,
) -> str:
    """
    Return ``"online"`` if *last_seen_at* falls within the offline timeout,
    otherwise ``"offline"``.  A sensor that has never reported is always
    offline.
    """
    if last_seen_at is None:
        return "offline"

    if now is None:
        now = datetime.now(timezone.utc)

    # Normalise both values to timezone-aware UTC for the comparison.
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    age = (now - last_seen_at).total_seconds()
    return "online" if age <= _offline_timeout_seconds() else "offline"


async def mark_stale_sensors_offline() -> dict:
    """
    Background-task helper: update the ``status`` column to ``"offline"``
    for every sensor whose ``last_seen_at`` is older than the timeout (or
    has never reported).  Returns a small summary dict.
    """
    threshold_seconds = _offline_timeout_seconds()
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Sensor.id, Sensor.name).where(
                Sensor.status == "online",
                Sensor.is_enabled.is_(True),
            )
        )
        candidates = result.all()

        stale_ids = []
        for row in candidates:
            ls_result = await db.execute(
                select(Sensor.last_seen_at).where(Sensor.id == row.id)
            )
            last_seen = ls_result.scalar_one_or_none()

            if last_seen is None:
                stale_ids.append(row.id)
                continue

            ls_aware = last_seen
            if ls_aware.tzinfo is None:
                ls_aware = ls_aware.replace(tzinfo=timezone.utc)
            if (now - ls_aware).total_seconds() > threshold_seconds:
                stale_ids.append(row.id)

        if stale_ids:
            await db.execute(
                update(Sensor)
                .where(Sensor.id.in_(stale_ids))
                .values(status="offline")
            )
            await db.commit()
            logger.info(
                "Sensor status: marked %d sensor(s) offline (timeout=%ds): %s",
                len(stale_ids),
                threshold_seconds,
                stale_ids,
            )

    return {
        "checked": len(candidates),
        "marked_offline": len(stale_ids),
        "timeout_seconds": threshold_seconds,
    }



async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def get_accessible_sensor(
    sensor_id: int,
    user_id: int,
    db: AsyncSession,
):
    result = await db.execute(
        select(Sensor)
        .join(Store, Sensor.store_id == Store.id)
        .join(
            UserStoreAccess,
            UserStoreAccess.store_id == Store.id,
        )
        .where(
            Sensor.id == sensor_id,
            UserStoreAccess.user_id == user_id,
        )
    )

    sensor = result.scalar_one_or_none()

    if sensor is None:
        # Do not disclose whether an inaccessible sensor exists.
        raise HTTPException(
            status_code=404,
            detail="Sensor not found",
        )

    return sensor



@router.get("/")
async def get_sensors(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Sensor)
        .join(Store, Sensor.store_id == Store.id)
        .join(
            UserStoreAccess,
            UserStoreAccess.store_id == Store.id,
        )
        .where(
            UserStoreAccess.user_id == current_user["id"]
        )
        .order_by(Sensor.id)
    )

    sensors = result.scalars().all()

    now = datetime.now(timezone.utc)
    return [
        {
            "id": sensor.id,
            "name": sensor.name,
            "store_id": sensor.store_id,
            "status": compute_effective_status(sensor.last_seen_at, now),
        }
        for sensor in sensors
    ]


@router.get("/{sensor_id}/details")
async def get_sensor_details(
    sensor_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sensor = await get_accessible_sensor(
        sensor_id=sensor_id,
        user_id=current_user["id"],
        db=db,
    )

    result = await db.execute(
        select(SensorDeviceInfo).where(
            SensorDeviceInfo.sensor_id == sensor.id
        )
    )
    info = result.scalar_one_or_none()

    result = await db.execute(
        select(SensorConfiguration).where(
            SensorConfiguration.sensor_id == sensor.id
        )
    )
    saved_configuration = result.scalar_one_or_none()

    result = await db.execute(
        select(SensorLineReading)
        .options(
            load_only(
                SensorLineReading.id,
                SensorLineReading.line_id,
                SensorLineReading.line_name,
                SensorLineReading.line_uuid,
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
        .where(SensorLineReading.sensor_id == sensor.id)
        .order_by(
            desc(SensorLineReading.recorded_at),
            desc(SensorLineReading.received_at),
            desc(SensorLineReading.id),
        )
        .limit(5)
    )
    latest_readings = result.scalars().all()

    return {
        "id": sensor.id,
        "name": sensor.name,
        "store_id": sensor.store_id,
        "status": compute_effective_status(
            sensor.last_seen_at, datetime.now(timezone.utc)
        ),
        "serial_number": sensor.serial_number,
        "model": sensor.model,
        "firmware_version": sensor.firmware_version,
        "ip_address": sensor.ip_address,
        "last_seen_at": (
            sensor.last_seen_at.isoformat()
            if sensor.last_seen_at
            else None
        ),
        "config_synced_at": (
            saved_configuration.fetched_at.isoformat()
            if saved_configuration and saved_configuration.fetched_at
            else None
        ),
        "created_at": (
            sensor.created_at.isoformat()
            if sensor.created_at
            else None
        ),
        "device_info": (
            {
                "device_name": sensor.name,
                "device_info_id": info.id,
                "device_sn": sensor.serial_number,
                "ip_address": sensor.ip_address,
                "device_mac": info.device_mac,
                "device_wlan_mac": info.device_wlan_mac,
                "firmware_version": sensor.firmware_version,
                "hardware_version": info.hardware_version,
                "tsl_version": info.tsl_version,
                "cus_site_id": info.cus_site_id,
                "cus_device_id": info.cus_device_id,
                "running_time": info.running_time,
                "cpu": info.cpu,
                "ram": info.ram,
                "storage": info.storage,
                "device_tilt_pitch_roll": (
                    info.device_tilt_pitch_roll
                ),
                "updated_at": (
                    info.updated_at.isoformat()
                    if info.updated_at
                    else None
                ),
            }
            if info is not None
            else None
        ),
        "configuration": (
            {
                "values": saved_configuration.configuration,
                "fetched_at": (
                    saved_configuration.fetched_at.isoformat()
                    if saved_configuration.fetched_at
                    else None
                ),
            }
            if saved_configuration is not None
            else None
        ),
        "latest_readings": [
            {
                "id": reading.id,
                "line_id": reading.line_id,
                "line_name": reading.line_name,
                "line_uuid": reading.line_uuid,
                "individuals_in": reading.individuals_in,
                "individuals_out": reading.individuals_out,
                "male_in": reading.male_in,
                "male_out": reading.male_out,
                "female_in": reading.female_in,
                "female_out": reading.female_out,
                "group_in": reading.group_in,
                "group_out": reading.group_out,
                "recorded_at": (
                    reading.recorded_at.isoformat()
                    if reading.recorded_at
                    else None
                ),
                "received_at": (
                    reading.received_at.isoformat()
                    if reading.received_at
                    else None
                ),
            }
            for reading in latest_readings
        ],
    }


@router.get("/{sensor_id}/history")
async def sensor_history(sensor_id: int):
    raise HTTPException(
        status_code=501,
        detail=(
            "Milesight history is unavailable until the endpoint "
            "parameters and response schema are verified."
        ),
    )
