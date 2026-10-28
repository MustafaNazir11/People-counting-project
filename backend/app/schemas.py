from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    organization_id: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OrganizationCreateRequest(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=255,
        strip_whitespace=True,
    )


class OrganizationStatusRequest(BaseModel):
    is_active: bool



class StoreCreateRequest(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=255,
        strip_whitespace=True,
    )
    location: str | None = Field(
        default=None,
        max_length=500,
    )

class StoreStatusRequest(BaseModel):
    is_active: bool



class ManagerCreateRequest(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=255,
        strip_whitespace=True,
    )
    email: str = Field(
        min_length=3,
        max_length=255,
    )
    password: str = Field(
        min_length=8,
        max_length=128,
    )
    role: str = "store_user"
    store_ids: list[int] = []


class ManagerStatusRequest(BaseModel):
    is_active: bool


class SensorCreateRequest(BaseModel):
    name: str
    store_id: int
    milesight_device_id: str
    serial_number: str | None = None
    model: str = "VS125"
    firmware_version: str | None = None
    ip_address: str | None = None

class SensorStatusRequest(BaseModel):
    is_enabled: bool