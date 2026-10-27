
from datetime import date, datetime, time, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.database import AsyncSessionLocal
from app.models import Sensor, Store, UserStoreAccess, SensorLineReading
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
        .join(UserStoreAccess, UserStoreAccess.store_id == Store.id)
        .where(UserStoreAccess.user_id == current_user["id"])
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
