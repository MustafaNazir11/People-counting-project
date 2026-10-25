
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Store, UserStoreAccess
from app.auth.dependencies import get_current_user

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@router.get("/")
async def get_stores(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Store)
        .join(
            UserStoreAccess,
            UserStoreAccess.store_id == Store.id,
        )
        .where(UserStoreAccess.user_id == current_user["id"])
    )

    stores = result.scalars().all()

    return [
        {
            "id": store.id,
            "name": store.name,
            "location": store.location,
        }
        for store in stores
    ]
