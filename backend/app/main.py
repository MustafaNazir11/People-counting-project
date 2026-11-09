from contextlib import asynccontextmanager
import logging
import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import models
from app.auth.dependencies import get_current_user
from app.database import Base, engine
from app.routers import auth, sensors, stores, platform_admin
from app.routers import vs125_router
from app.services.midnight_reset import run_midnight_reset
from app.routers.sensors import mark_stale_sensors_offline

logger = logging.getLogger(__name__)


async def _schedule_midnight_reset():
    """Fire run_midnight_reset every day at 00:01 UTC."""
    import asyncio
    from datetime import datetime, timezone

    while True:
        now = datetime.now(timezone.utc)
        # Seconds until next 00:01 UTC
        next_run = now.replace(hour=0, minute=1, second=0, microsecond=0)
        if next_run <= now:
            next_run = next_run.replace(day=next_run.day + 1)
        wait_seconds = (next_run - now).total_seconds()
        logger.info("Midnight reset scheduler: next run in %.0f s (at %s UTC)", wait_seconds, next_run.isoformat())
        await asyncio.sleep(wait_seconds)
        try:
            summary = await run_midnight_reset(triggered_by="scheduler")
            logger.info("Midnight reset finished: %s", summary)
        except Exception:
            logger.exception("Midnight reset job failed")


async def _schedule_sensor_status_check():
    """Periodically mark sensors offline when they stop reporting."""
    import asyncio

    while True:
        await asyncio.sleep(60)
        try:
            summary = await mark_stale_sensors_offline()
            if summary["marked_offline"]:
                logger.info("Sensor status check: %s", summary)
        except Exception:
            logger.exception("Sensor status check failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent column migrations — safe to run on every startup.
        await conn.execute(
            text(
                "ALTER TABLE sensor_line_readings "
                "ADD COLUMN IF NOT EXISTS is_correction BOOLEAN NOT NULL DEFAULT false, "
                "ADD COLUMN IF NOT EXISTS correction_reason VARCHAR(255)"
            )
        )
    reset_task = asyncio.create_task(_schedule_midnight_reset())
    status_task = asyncio.create_task(_schedule_sensor_status_check())
    yield
    reset_task.cancel()
    status_task.cancel()


def configured_cors_origins() -> list[str]:
    configured = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173",
    )
    origins = [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]
    if not origins or "*" in origins:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS must contain explicit frontend origins."
        )
    return origins


app = FastAPI(title="Backend API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(sensors.router, prefix="/sensors", tags=["sensors"])
app.include_router(vs125_router.router)
app.include_router(platform_admin.router)


@app.get("/protected")
async def protected_route(current_user=Depends(get_current_user)):
    return {
        "message": "You are authenticated",
        "user": current_user
    }

@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def readiness_check():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.error("Database readiness check failed (%s)", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "component": "database"},
        )
    return {"status": "ready"}