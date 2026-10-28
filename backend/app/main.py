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
from app.routers import auth, sensors, stores, vs125 , platform_admin

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


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
app.include_router(vs125.router)
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