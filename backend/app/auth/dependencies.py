
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy import select

from app.auth.auth import SECRET_KEY, ALGORITHM
from app.database import AsyncSessionLocal
from app.models import User, Organization

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
):
    # 1. Validate JWT
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )
    if payload.get("token_type") == "platform_admin":
        raise HTTPException(
            status_code=401,
            detail="Invalid token type",
        )
    # 2. Validate user ID from token
    user_id = payload.get("sub")

    if (
        not isinstance(user_id, str)
        or not user_id.isdecimal()
        or int(user_id) < 1
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )

    # Validate required role claim before querying the database.
    token_role = payload.get("role")

    if not isinstance(token_role, str) or not token_role.strip():
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )

    # 3. Load current user from PostgreSQL
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.id == int(user_id))
        )
        user = result.scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                status_code=403,
                detail="User account is disabled or unavailable",
            )

        # 4. Check organization status
        organization = await db.get(
            Organization,
            user.organization_id,
        )

        if organization is None or not organization.is_active:
            raise HTTPException(
                status_code=403,
                detail="Organization access is disabled",
            )

        # 5. Return database-backed identity and permissions
        return {
            "id": user.id,
            "role": user.role,
            "organization_id": user.organization_id,
        }


@router.get("/protected")
async def protected_route(
    current_user: dict = Depends(get_current_user),
):
    return {
        "message": "You are authenticated",
        "user": current_user,
    }
