from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    organization_id: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str