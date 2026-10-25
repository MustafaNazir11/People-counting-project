
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Sensor, Store, UserStoreAccess
from app.auth.dependencies import get_current_user

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


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
        .where(UserStoreAccess.user_id == current_user["id"])
    )

    sensors = result.scalars().all()

    return [
        {
            "id": sensor.id,
            "name": sensor.name,
            "store_id": sensor.store_id,
            "status": sensor.status,
        }
        for sensor in sensors
    ]
