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
    SensorLineTotalSnapshot,
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


def _report_datetime(value: Any, field_name: str, fallback: datetime) -> datetime:
    """Parse Milesight ISO-8601 timestamps, preserving their UTC offset."""
    if value is None:
        return fallback
    if not isinstance(value, str):
        raise ValueError(f"time_info.{field_name} must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"time_info.{field_name} is not a valid ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _read_count(container: Any, key: str, *, suffix: str = "") -> int:
    if not isinstance(container, dict):
        raise ValueError(f"VS125 count container for {key} must be an object")

    field = f"{key}{suffix}"

    if field not in container:
        raise ValueError(
            f"Missing VS125 field: {field}. Available fields: {list(container.keys())}"
        )

    value = container[field]

    if isinstance(value, bool):
        raise ValueError(f"Invalid VS125 count: {field}")

    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid VS125 count: {field}") from exc

    if count < 0:
        raise ValueError(f"VS125 count cannot be negative: {field}")

    return count

def _normalize_device_line(
    line: Any,
    *,
    cumulative: bool,
    sensor_id: int,
    period_start: datetime,
    period_end: datetime,
    received_at: datetime,
    is_retransmission: bool,
) -> dict[str, Any]:
    if not isinstance(line, dict):
        raise ValueError("Each VS125 line report must be an object")

    total = line.get("total") or {}
    group = line.get("group") or {}
    children = line.get("children") or {}
    if not all(isinstance(part, dict) for part in (total, group, children)):
        raise ValueError("VS125 total, group and children fields must be objects")

    line_uuid = line.get("line_uuid")
    if not isinstance(line_uuid, str) or not line_uuid.strip():
        raise ValueError("Each VS125 line must contain a valid line_uuid")

    line_id = _read_count({"line": line.get("line", 0)}, "line")
    line_name = line.get("line_name")
    if not isinstance(line_name, str) or not line_name.strip():
        raise ValueError("Each VS125 line must contain a valid line_name")

    suffix = "_counted" if cumulative else ""
    return {
        "sensor_id": sensor_id,
        "line_id": line_id,
        "line_name": line_name.strip(),
        "line_uuid": line_uuid.strip(),
        # Choose count source based on whether this is cumulative total or periodic interval.
        count_source = total 
        "individuals_in": _read_count(count_source, "in", suffix=suffix),
        "individuals_out": _read_count(count_source, "out", suffix=suffix),
        "male_in": _read_count(count_source, "male_in", suffix=suffix),
        "male_out": _read_count(count_source, "male_out", suffix=suffix),
        "female_in": _read_count(count_source, "female_in", suffix=suffix),
        "female_out": _read_count(count_source, "female_out", suffix=suffix),
        "group_in": _read_count(group, "in", suffix=suffix) if cumulative else 0,
        "group_out": _read_count(group, "out", suffix=suffix) if cumulative else 0,
        "children": children,
        "period_start_at": period_start,
        "recorded_at": period_end,
        "received_at": received_at,
        "is_retransmission": is_retransmission,
        "capacity_counted": (
            _read_count(total, "capacity", suffix=suffix)
            if cumulative and "capacity_counted" in total
            else None
        ),
        "raw_data": line,
    }


async def ingest_device_report(
    db: AsyncSession,
    sensor_id: int,
    data: dict[str, Any],
) -> dict[str, int]:
    """
    Persist the actual VS125 HTTP report:
      - line_periodic_data -> interval readings for footfall analytics
      - line_total_data -> cumulative counter snapshots
    """
    received_at = datetime.now(timezone.utc)
    time_info = data.get("time_info") or {}
    if not isinstance(time_info, dict):
        raise ValueError("time_info must be an object")

    period_start = _report_datetime(
        time_info.get("start_time"), "start_time", received_at
    )
    period_end = _report_datetime(
        time_info.get("end_time"), "end_time", received_at
    )
    if period_end < period_start:
        raise ValueError("VS125 report end_time is earlier than start_time")

    retransmission = data.get("isRetransmission", False)
    if not isinstance(retransmission, bool):
        raise ValueError("isRetransmission must be a boolean")

    # Actual VS125 payload uses line_periodic_data. The alternate key is
    # retained for older firmware/integrations already sending this shape.
    periodic_data = data.get("line_periodic_data")
    if periodic_data is None:
        periodic_data = data.get("line_periodic_total_data", [])
    total_data = data.get("line_total_data", [])

    if not isinstance(periodic_data, list) or not isinstance(total_data, list):
        raise ValueError("VS125 periodic and total readings must be arrays")

    periodic_values = [
        _normalize_device_line(
            line,
            cumulative=False,
            sensor_id=sensor_id,
            period_start=period_start,
            period_end=period_end,
            received_at=received_at,
            is_retransmission=retransmission,
        )
        for line in periodic_data
    ]
    total_values = [
        _normalize_device_line(
            line,
            cumulative=True,
            sensor_id=sensor_id,
            period_start=period_start,
            period_end=period_end,
            received_at=received_at,
            is_retransmission=retransmission,
        )
        for line in total_data
    ]

    # Deterministic event key: the VS125 report window is stable across
    # retransmissions, unlike a random key generated by the receiving server.
    event_material = (
        f"{sensor_id}|{period_start.isoformat()}|{period_end.isoformat()}"
    )
    source_event_id = "vs125:" + hashlib.sha256(
        event_material.encode("utf-8")
    ).hexdigest()

    periodic_saved = 0
    totals_upserted = 0

    if periodic_values:
        periodic_rows = [
            {
                key: value
                for key, value in row.items()
                if key not in {
                    "is_retransmission",
                    "capacity_counted",
                    "raw_data",
                }
            }
            | {
                "source_event_id": source_event_id,
            }
            for row in periodic_values
        ]
        # `children` is retained in its own JSONB column. Replayed windows
        # are ignored by the existing unique constraint.
        statement = insert(SensorLineReading).values(periodic_rows)
        statement = statement.on_conflict_do_nothing(
            constraint="uq_sensor_reading_source_event_line"
        )
        result = await db.execute(statement)
        periodic_saved = result.rowcount or 0

    if total_values:
        statement = insert(SensorLineTotalSnapshot).values(total_values)
        statement = statement.on_conflict_do_update(
            constraint="uq_sensor_total_snapshot_sensor_line_time",
            set_={
                "line_id": statement.excluded.line_id,
                "line_name": statement.excluded.line_name,
                "individuals_in": statement.excluded.individuals_in,
                "individuals_out": statement.excluded.individuals_out,
                "male_in": statement.excluded.male_in,
                "male_out": statement.excluded.male_out,
                "female_in": statement.excluded.female_in,
                "female_out": statement.excluded.female_out,
                "group_in": statement.excluded.group_in,
                "group_out": statement.excluded.group_out,
                "capacity_counted": statement.excluded.capacity_counted,
                "children": statement.excluded.children,
                "raw_data": statement.excluded.raw_data,
                "is_retransmission": statement.excluded.is_retransmission,
                "period_start_at": statement.excluded.period_start_at,
                "received_at": statement.excluded.received_at,
            },
        )
        result = await db.execute(statement)
        totals_upserted = result.rowcount or 0

    return {
        "periodic_records_saved": periodic_saved,
        "total_snapshots_upserted": totals_upserted,
        "periodic_lines_received": len(periodic_values),
        "total_lines_received": len(total_values),
    }

