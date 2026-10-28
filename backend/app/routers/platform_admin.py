
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy import select
import secrets, hashlib
from jose import jwt, JWTError
from app.schemas import *
from app.database import AsyncSessionLocal
from app.models import *
from app.auth.auth import (
    SECRET_KEY,
    ALGORITHM,
    verify_password,
    create_platform_admin_access_token,
    hash_password
)

router = APIRouter(
    prefix="/platform-admin",
    tags=["Platform Admin"],
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/platform-admin/login",
    scheme_name="PlatformAdminBearer",
)


@router.post("/login")
async def platform_admin_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    email = form_data.username.strip().lower()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PlatformAdmin).where(
                PlatformAdmin.email == email
            )
        )
        admin = result.scalar_one_or_none()

        if (
            admin is None
            or not admin.is_active
            or not verify_password(
                form_data.password,
                admin.password_hash,
            )
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials or inactive account",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = create_platform_admin_access_token(admin.id)

        return {
            "access_token": token,
            "token_type": "bearer",
            "admin": {
                "id": admin.id,
                "name": admin.name,
                "email": admin.email,
                "role": "platform_admin",
            },
        }


async def get_current_platform_admin(
    token: str = Depends(oauth2_scheme),
):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired platform-admin token",
        )

    admin_id = payload.get("sub")

    if (
        payload.get("token_type") != "platform_admin"
        or payload.get("role") != "platform_admin"
        or not isinstance(admin_id, str)
        or not admin_id.isdecimal()
        or int(admin_id) < 1
    ):
        raise HTTPException(
            status_code=403,
            detail="Platform administrator access required",
        )

    async with AsyncSessionLocal() as db:
        admin = await db.get(PlatformAdmin, int(admin_id))

        if admin is None or not admin.is_active:
            raise HTTPException(
                status_code=403,
                detail="Platform administrator is inactive or unavailable",
            )

        return {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email,
            "role": "platform_admin",
        }


@router.get("/me")
async def platform_admin_me(
    admin: dict = Depends(get_current_platform_admin),
):
    return admin



@router.get("/organizations")
async def list_organizations(
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Organization).order_by(Organization.id)
        )

        organizations = result.scalars().all()

        return {
            "total": len(organizations),
            "organizations": [
                {
                    "id": org.id,
                    "name": org.name,
                    "is_active": org.is_active,
                    "created_at": (
                        org.created_at.isoformat()
                        if org.created_at
                        else None
                    ),
                    "updated_at": (
                        org.updated_at.isoformat()
                        if org.updated_at
                        else None
                    ),
                }
                for org in organizations
            ],
        }


@router.post("/organizations", status_code=201)
async def create_organization(
    data: OrganizationCreateRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=422,
            detail="Organization name cannot be empty",
        )

    async with AsyncSessionLocal() as db:
        organization = Organization(
            name=name,
            is_active=True,
        )

        db.add(organization)
        await db.commit()
        await db.refresh(organization)

        return {
            "message": "Organization created successfully",
            "organization": {
                "id": organization.id,
                "name": organization.name,
                "is_active": organization.is_active,
                "created_at": (
                    organization.created_at.isoformat()
                    if organization.created_at
                    else None
                ),
            },
        }

@router.patch("/organizations/{organization_id}/status")
async def update_organization_status(
    organization_id: int,
    data: OrganizationStatusRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        organization = await db.get(
            Organization,
            organization_id,
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found",
            )

        organization.is_active = data.is_active

        await db.commit()
        await db.refresh(organization)

        return {
            "message": (
                "Organization activated successfully"
                if organization.is_active
                else "Organization suspended successfully"
            ),
            "organization": {
                "id": organization.id,
                "name": organization.name,
                "is_active": organization.is_active,
                "updated_at": (
                    organization.updated_at.isoformat()
                    if organization.updated_at
                    else None
                ),
            },
        }

@router.get("/organizations/{organization_id}/stores")
async def list_organization_stores(
    organization_id: int,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        organization = await db.get(
            Organization,
            organization_id,
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found",
            )

        result = await db.execute(
            select(Store)
            .where(Store.organization_id == organization_id)
            .order_by(Store.id)
        )

        stores = result.scalars().all()

        return {
            "organization_id": organization.id,
            "organization_name": organization.name,
            "organization_is_active": organization.is_active,
            "total": len(stores),
            "stores": [
                {
                    "id": store.id,
                    "name": store.name,
                    "location": store.location,
                    "is_active": store.is_active,
                    "created_at": (
                        store.created_at.isoformat()
                        if store.created_at
                        else None
                    ),
                }
                for store in stores
            ],
        }


@router.post(
    "/organizations/{organization_id}/stores",
    status_code=201,
)
async def create_organization_store(
    organization_id: int,
    data: StoreCreateRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=422,
            detail="Store name cannot be empty",
        )

    async with AsyncSessionLocal() as db:
        organization = await db.get(
            Organization,
            organization_id,
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found",
            )

        if not organization.is_active:
            raise HTTPException(
                status_code=409,
                detail="Cannot create a store for a suspended organization",
            )

        store = Store(
            organization_id=organization_id,
            name=name,
            location=(
                data.location.strip()
                if data.location and data.location.strip()
                else None
            ),
            is_active=True,
        )

        db.add(store)
        await db.commit()
        await db.refresh(store)

        return {
            "message": "Store created successfully",
            "store": {
                "id": store.id,
                "organization_id": store.organization_id,
                "name": store.name,
                "location": store.location,
                "is_active": store.is_active,
                "created_at": (
                    store.created_at.isoformat()
                    if store.created_at
                    else None
                ),
            },
        }


@router.patch("/stores/{store_id}/status")
async def update_store_status(
    store_id: int,
    data: StoreStatusRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        store = await db.get(Store, store_id)

        if store is None:
            raise HTTPException(
                status_code=404,
                detail="Store not found",
            )

        organization = await db.get(
            Organization,
            store.organization_id,
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Store organization not found",
            )

        if data.is_active and not organization.is_active:
            raise HTTPException(
                status_code=409,
                detail="Cannot activate a store while its organization is suspended",
            )

        store.is_active = data.is_active

        await db.commit()
        await db.refresh(store)

        return {
            "message": (
                "Store activated successfully"
                if store.is_active
                else "Store deactivated successfully"
            ),
            "store": {
                "id": store.id,
                "organization_id": store.organization_id,
                "name": store.name,
                "is_active": store.is_active,
            },
        }



@router.post(
    "/organizations/{organization_id}/managers",
    status_code=201,
)
async def create_organization_manager(
    organization_id: int,
    data: ManagerCreateRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    name = data.name.strip()
    email = data.email.strip().lower()

    if data.role not in {"org_admin", "store_user"}:
        raise HTTPException(
            status_code=422,
            detail="Role must be org_admin or store_user",
        )

    if not name or not email or not email.count("@") == 1:
        raise HTTPException(
            status_code=422,
            detail="Enter a valid name and email",
        )

    if data.role == "org_admin" and data.store_ids:
        raise HTTPException(
            status_code=422,
            detail="An org_admin has access to all organization stores and does not need store_ids",
        )

    async with AsyncSessionLocal() as db:
        organization = await db.get(
            Organization,
            organization_id,
        )

        if organization is None:
            raise HTTPException(
                status_code=404,
                detail="Organization not found",
            )

        if not organization.is_active:
            raise HTTPException(
                status_code=409,
                detail="Cannot create a manager for a suspended organization",
            )

        existing = await db.execute(
            select(User).where(User.email == email)
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Email is already registered",
            )

        stores = []

        if data.role == "store_user":
            if not data.store_ids:
                raise HTTPException(
                    status_code=422,
                    detail="A store_user must be assigned at least one store",
                )

            if len(set(data.store_ids)) != len(data.store_ids):
                raise HTTPException(
                    status_code=422,
                    detail="Duplicate store IDs are not allowed",
                )

            result = await db.execute(
                select(Store).where(
                    Store.id.in_(data.store_ids),
                    Store.organization_id == organization_id,
                    Store.is_active.is_(True),
                )
            )
            stores = result.scalars().all()

            if len(stores) != len(data.store_ids):
                raise HTTPException(
                    status_code=422,
                    detail="Every store must exist, be active, and belong to this organization",
                )

        user = User(
            name=name,
            email=email,
            password_hash=hash_password(data.password),
            organization_id=organization_id,
            role=data.role,
            is_active=True,
        )

        db.add(user)
        await db.flush()

        for store in stores:
            db.add(
                UserStoreAccess(
                    user_id=user.id,
                    store_id=store.id,
                )
            )

        await db.commit()
        await db.refresh(user)

        return {
            "message": "Manager created successfully",
            "manager": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "organization_id": user.organization_id,
                "role": user.role,
                "is_active": user.is_active,
                "assigned_store_ids": [
                    store.id for store in stores
                ],
            },
        }


@router.patch("/managers/{manager_id}/status")
async def update_manager_status(
    manager_id: int,
    data: ManagerStatusRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        manager = await db.get(User, manager_id)

        if manager is None:
            raise HTTPException(
                status_code=404,
                detail="Manager not found",
            )

        if data.is_active:
            organization = await db.get(
                Organization,
                manager.organization_id,
            )

            if organization is None or not organization.is_active:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot activate a manager while their organization is unavailable",
                )

        manager.is_active = data.is_active

        await db.commit()
        await db.refresh(manager)

        return {
            "message": (
                "Manager activated successfully"
                if manager.is_active
                else "Manager deactivated successfully"
            ),
            "manager": {
                "id": manager.id,
                "name": manager.name,
                "email": manager.email,
                "organization_id": manager.organization_id,
                "role": manager.role,
                "is_active": manager.is_active,
            },
        }

@router.post("/stores/{store_id}/sensors", status_code=201)
async def create_sensor(
    store_id: int,
    data: SensorCreateRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        store = await db.get(Store, store_id)

        if store is None:
            raise HTTPException(
                status_code=404,
                detail="Store not found",
            )

        organization = await db.get(
            Organization, store.organization_id
        )

        if organization is None or not organization.is_active:
            raise HTTPException(
                status_code=409,
                detail="Cannot register a sensor for an inactive organization",
            )

        if not store.is_active:
            raise HTTPException(
                status_code=409,
                detail="Cannot register a sensor for an inactive store",
            )

        existing = await db.execute(
            select(Sensor).where(
                Sensor.milesight_device_id == data.milesight_device_id
            )
        )

        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="This Milesight device is already registered",
            )

        sensor = Sensor(
            store_id=store.id,
            device_id=data.milesight_device_id,
            name=data.name,
            status="offline",
            milesight_device_id=data.milesight_device_id,
            serial_number=data.serial_number,
            model=data.model,
            firmware_version=data.firmware_version,
            ip_address=data.ip_address,
            is_enabled=True,
        )

        db.add(sensor)
        await db.flush()

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(
            raw_token.encode("utf-8")
        ).hexdigest()

        credential = SensorIngestCredential(
            sensor_id=sensor.id,
            token_hash=token_hash,
        )

        db.add(credential)
        await db.commit()
        await db.refresh(sensor)

        return {
            "message": "Sensor registered successfully",
            "sensor": {
                "id": sensor.id,
                "name": sensor.name,
                "store_id": sensor.store_id,
                "milesight_device_id": sensor.milesight_device_id,
                "serial_number": sensor.serial_number,
                "model": sensor.model,
                "status": sensor.status,
                "is_enabled": sensor.is_enabled,
            },
            "ingest_token": raw_token,
            "token_note": "Save this token securely. It is shown only during registration.",
        }

@router.get("/stores/{store_id}/sensors")
async def list_store_sensors(
    store_id: int,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        store = await db.get(Store, store_id)

        if store is None:
            raise HTTPException(
                status_code=404,
                detail="Store not found",
            )

        result = await db.execute(
            select(Sensor)
            .where(Sensor.store_id == store_id)
            .order_by(Sensor.id)
        )

        sensors = result.scalars().all()

        return {
            "store_id": store_id,
            "total_sensors": len(sensors),
            "sensors": [
                {
                    "id": sensor.id,
                    "device_id": sensor.device_id,
                    "name": sensor.name,
                    "milesight_device_id": sensor.milesight_device_id,
                    "serial_number": sensor.serial_number,
                    "model": sensor.model,
                    "firmware_version": sensor.firmware_version,
                    "ip_address": sensor.ip_address,
                    "status": sensor.status,
                    "is_enabled": sensor.is_enabled,
                    "last_seen_at": sensor.last_seen_at,
                    "config_synced_at": sensor.config_synced_at,
                    "created_at": sensor.created_at,
                }
                for sensor in sensors
            ],
        }


@router.patch("/sensors/{sensor_id}/status")
async def update_sensor_status(
    sensor_id: int,
    data: SensorStatusRequest,
    admin: dict = Depends(get_current_platform_admin),
):
    async with AsyncSessionLocal() as db:
        sensor = await db.get(Sensor, sensor_id)

        if sensor is None:
            raise HTTPException(
                status_code=404,
                detail="Sensor not found",
            )

        if data.is_enabled:
            store = await db.get(Store, sensor.store_id)

            if store is None or not store.is_active:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot enable a sensor for an inactive store",
                )

            organization = await db.get(
                Organization, store.organization_id
            )

            if organization is None or not organization.is_active:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot enable a sensor for an inactive organization",
                )

        sensor.is_enabled = data.is_enabled
        await db.commit()
        await db.refresh(sensor)

        return {
            "message": (
                "Sensor enabled successfully"
                if sensor.is_enabled
                else "Sensor disabled successfully"
            ),
            "sensor": {
                "id": sensor.id,
                "name": sensor.name,
                "store_id": sensor.store_id,
                "is_enabled": sensor.is_enabled,
                "status": sensor.status,
            },
        }