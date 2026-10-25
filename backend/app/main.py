from fastapi import FastAPI, Depends

from app.auth.dependencies import get_current_user
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, stores, vs125, sensors
from contextlib import asynccontextmanager

from app.database import Base, engine
from app import models
from app.routers import sensors

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Backend API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stores.router, prefix="/stores", tags=["Stores"])
app.include_router(sensors.router, prefix="/sensors", tags=["sensors"])
app.include_router(vs125.router)

@app.get("/protected")
async def protected_route(current_user=Depends(get_current_user)):
    return {
        "message": "You are authenticated",
        "user": current_user
    }

@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}