
from datetime import date, datetime, time, timedelta, timezone
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Sensor, Store, UserStoreAccess, SensorLineReading
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/sensors/vs125", tags=["VS125"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class LineReading(BaseModel):
    line: int
    line_name: str
    line_uuid: str
    in_count: int = Field(alias="in", ge=0)
    out_count: int = Field(alias="out", ge=0)
    male_in: int = Field(ge=0)
    male_out: int = Field(ge=0)
    female_in: int = Field(ge=0)
    female_out: int = Field(ge=0)
    group_in: int = Field(ge=0)
    group_out: int = Field(ge=0)


class SensorPayload(BaseModel):
    line_periodic_total_data: list[LineReading] = Field(max_length=4)


@router.post("/ingest")
async def ingest_vs125(
    payload: SensorPayload,
    sensor_id: int,
    x_sensor_token: str = Header(),
    db: AsyncSession = Depends(get_db),
):
    expected_token = os.getenv("VS125_INGEST_TOKEN")
    if not expected_token or not secrets.compare_digest(
        x_sensor_token, expected_token
    ):
        raise HTTPException(status_code=401, detail="Invalid sensor token")

    sensor = await db.get(sensor, sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail="sensor not found")

    now = datetime.now(timezone.utc)
    records = []

    for line in payload.line_periodic_total_data:
        records.append(
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
                recorded_at=now,
                received_at=now,
            )
        )

    db.add_all(records)
    await db.commit()

    return {"status": "saved", "records_saved": len(records)}

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
