from datetime import datetime, timezone
import hashlib
import os
import secrets
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Request, HTTPException
from app.database import AsyncSessionLocal
from app.models import (
    Sensor,
    SensorConfiguration,
    SensorDeviceInfo,
    SensorIngestCredential,
    SensorLineReading,
)
from app.services.milesight import (
    MilesightClient,
    get_client,
    normalize_milesight_config,
)

import logging

router = APIRouter(prefix="/vs125", tags=["VS125"])

logger = logging.getLogger(__name__)

def hash_ingest_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def resolve_ingest_sensor_id(
    db: AsyncSession,
    token: str | None,
) -> int | None:
    if token is None:
        return None

    token = token.strip()
    if not 40 <= len(token) <= 128:
        return None

    result = await db.execute(
        select(SensorIngestCredential.sensor_id)
        .join(Sensor, Sensor.id == SensorIngestCredential.sensor_id)
        .where(
            SensorIngestCredential.token_hash == hash_ingest_token(token),
            SensorIngestCredential.revoked_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
@router.post("/webhook")
async def receive_vs125_data(request: Request):
    """Receive VS125 readings using an individual sensor token."""

    auth_header = request.headers.get("Authorization", "")
    provided_token = (
        auth_header[7:].strip()
        if auth_header.lower().startswith("bearer ")
        else ""
    )

    if not provided_token:
        raise HTTPException(
            status_code=401,
            detail="Missing sensor credentials",
        )

    try:
        data = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=422,
            detail="JSON body must be an object",
        )

    try:
        payload = validate_reading_payload(data)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Invalid VS125 payload",
                "errors": exc.errors(),
            },
        ) from exc

    async with AsyncSessionLocal() as db:
        sensor_id = await resolve_ingest_sensor_id(
            db, provided_token
        )

        if sensor_id is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or revoked sensor credentials",
            )

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
                detail="Sensor, store, or organization is disabled",
            )

        if not payload.line_periodic_total_data:
            return {
                "code": 0,
                "message": "ok",
                "readings_saved": 0,
            }

        received_at = datetime.now(timezone.utc)

        rows = [
            SensorLineReading(
                sensor_id=sensor_id,
                line_id=line.line,
                line_name=line.line_name,
                line_uuid=line.line_uuid,
                individuals_in=line.in_count,
                individuals_out=line.out_count,
                male_in=line.male_in,
                male_out=line.male_out,
                female_in=line.female_in,
                female_out=line.female_out,
                group_in=line.group_in,
                group_out=line.group_out,
                recorded_at=received_at,
                received_at=received_at,
            )
            for line in payload.line_periodic_total_data
        ]

        try:
            db.add_all(rows)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.exception(
                "Failed to store VS125 webhook readings"
            )
            raise HTTPException(
                status_code=500,
                detail="Could not store VS125 readings",
            ) from exc

    logger.info(
        "Stored %d reading(s) for sensor_id=%d",
        len(rows),
        sensor_id,
    )

    return {
        "code": 0,
        "message": "ok",
        "readings_saved": len(rows),
    }

class LineReading(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    line: int = Field(ge=0)
    line_name: str = Field(min_length=1, max_length=255)
    line_uuid: str = Field(min_length=1, max_length=100)
    in_count: int = Field(alias="in", ge=0)
    out_count: int = Field(alias="out", ge=0)
    male_in: int = Field(ge=0)
    male_out: int = Field(ge=0)
    female_in: int = Field(ge=0)
    female_out: int = Field(ge=0)
    group_in: int = Field(ge=0)
    group_out: int = Field(ge=0)


class SensorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_periodic_total_data: list[LineReading] = Field(max_length=4)


def validate_reading_payload(payload: dict[str, Any]) -> SensorPayload:
    return SensorPayload.model_validate(payload)


def validate_idempotency_key(value: str) -> str:
    key = value.strip()
    if not key or len(key) > 255:
        raise ValueError("Idempotency-Key must contain 1 to 255 characters.")
    return key


def normalize_device_information(
    response: dict[str, Any],
) -> dict[str, Any] | None:
    if "status" in response and response["status"] != "Success":
        raise ValueError("Milesight device-information request failed.")

    data = response.get("data", response)
    if not isinstance(data, dict):
        return None

    allowed_fields = {
        "device_sn",
        "ip_address",
        "device_mac",
        "device_wlan_mac",
        "firmware_version",
        "hardware_version",
        "tsl_version",
        "cus_site_id",
        "cus_device_id",
        "running_time",
        "cpu",
        "ram",
        "storage",
        "device_tilt_pitch_roll",
    }
    normalized = {
        key: value
        for key, value in data.items()
        if key in allowed_fields and value is not None
    }
    if not normalized:
        return None

    for key in (
        "device_sn",
        "ip_address",
        "device_mac",
        "device_wlan_mac",
        "firmware_version",
        "hardware_version",
        "tsl_version",
        "cus_site_id",
        "cus_device_id",
    ):
        if key in normalized and not isinstance(normalized[key], str):
            raise ValueError(f"Device information field {key} must be text.")
    if "running_time" in normalized and (
        isinstance(normalized["running_time"], bool)
        or not isinstance(normalized["running_time"], int)
    ):
        raise ValueError("Device information running_time must be an integer.")
    for key in ("cpu", "ram", "storage", "device_tilt_pitch_roll"):
        if key in normalized and not isinstance(normalized[key], (dict, list)):
            raise ValueError(f"Device information field {key} must be an object or array.")
    return normalized


async def sync_device_information(
    db: AsyncSession,
    sensor_id: int,
    response: dict[str, Any],
) -> bool:
    values = normalize_device_information(response)
    if values is None:
        return False

    updated_at = datetime.now(timezone.utc)
    statement = insert(SensorDeviceInfo).values(
        sensor_id=sensor_id,
        updated_at=updated_at,
        **values,
    )
    statement = statement.on_conflict_do_update(
        index_elements=[SensorDeviceInfo.sensor_id],
        set_={**values, "updated_at": updated_at},
    )
    try:
        await db.execute(statement)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return True


async def sync_saved_configuration(
    db: AsyncSession,
    sensor_id: int,
    response: dict[str, Any],
) -> dict[str, Any]:
    values = normalize_milesight_config(response)
    fetched_at = datetime.now(timezone.utc)
    statement = insert(SensorConfiguration).values(
        sensor_id=sensor_id,
        configuration=values,
        fetched_at=fetched_at,
    )
    statement = statement.on_conflict_do_update(
        index_elements=[SensorConfiguration.sensor_id],
        set_={
            "configuration": values,
            "fetched_at": fetched_at,
        },
    )
    try:
        await db.execute(statement)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return values


async def refresh_sensor_data(
    db: AsyncSession,
    sensor_id: int,
    idempotency_key: str,
    device_id: str | None = None,
    client: MilesightClient | None = None,
) -> dict[str, Any]:
    milesight = client or get_client()
    device_response = await milesight.get_device_information(device_id)
    configuration_response = await milesight.get_device_configuration(device_id)
    readings_response = await milesight.get_line_readings(device_id)

    device_info = normalize_device_information(device_response)
    configuration = normalize_milesight_config(configuration_response)
    try:
        readings = validate_reading_payload(readings_response)
    except ValidationError as exc:
        raise ValueError(
            "Milesight readings do not match the configured VS125 payload schema."
        ) from exc

    key = validate_idempotency_key(idempotency_key)
    now = datetime.now(timezone.utc)
    statements = []
    if device_info is not None:
        info_updated_at = datetime.now(timezone.utc)
        device_statement = insert(SensorDeviceInfo).values(
            sensor_id=sensor_id,
            updated_at=info_updated_at,
            **device_info,
        )
        statements.append(
            device_statement.on_conflict_do_update(
                index_elements=[SensorDeviceInfo.sensor_id],
                set_={**device_info, "updated_at": info_updated_at},
            )
        )
    config_statement = insert(SensorConfiguration).values(
        sensor_id=sensor_id,
        configuration=configuration,
        fetched_at=now,
    )
    statements.append(
        config_statement.on_conflict_do_update(
            index_elements=[SensorConfiguration.sensor_id],
            set_={
                "configuration": configuration,
                "fetched_at": now,
            },
        )
    )
    readings_statement = _build_readings_insert(
        sensor_id,
        key,
        readings,
        now,
    )
    if readings_statement is not None:
        statements.append(readings_statement)

    try:
        readings_saved = 0
        for statement in statements:
            result = await db.execute(statement)
            if statement is readings_statement and result.rowcount is not None:
                readings_saved = result.rowcount
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "device_info_saved": device_info is not None,
        "configuration_saved": True,
        "readings": readings,
        "readings_saved": readings_saved,
    }


def _build_readings_insert(
    sensor_id: int,
    idempotency_key: str,
    payload: SensorPayload,
    recorded_at: datetime,
):
    values = [
        {
            "sensor_id": sensor_id,
            "source_event_id": idempotency_key,
            "line_id": line.line,
            "line_name": line.line_name,
            "line_uuid": line.line_uuid,
            "individuals_in": line.in_count,
            "individuals_out": line.out_count,
            "male_in": line.male_in,
            "male_out": line.male_out,
            "female_in": line.female_in,
            "female_out": line.female_out,
            "group_in": line.group_in,
            "group_out": line.group_out,
            "recorded_at": recorded_at,
            "received_at": recorded_at,
        }
        for line in payload.line_periodic_total_data
    ]
    if not values:
        return None

    return insert(SensorLineReading).values(values).on_conflict_do_nothing(
        constraint="uq_sensor_reading_source_event_line"
    )


async def ingest_readings(
    db: AsyncSession,
    sensor_id: int,
    idempotency_key: str,
    payload: SensorPayload,
) -> int:
    key = validate_idempotency_key(idempotency_key)
    now = datetime.now(timezone.utc)
    statement = _build_readings_insert(sensor_id, key, payload, now)
    if statement is None:
        return 0

    try:
        result = await db.execute(statement)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return result.rowcount or 0


def constant_time_token_matches(provided: str, expected: str | None) -> bool:
    return bool(
        expected
        and secrets.compare_digest(provided, expected)
    )
