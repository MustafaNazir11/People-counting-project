from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

from app.auth.auth import SECRET_KEY, ALGORITHM

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme)
):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub")
    role = payload.get("role")
    if (
        not isinstance(user_id, str)
        or not user_id.isdecimal()
        or int(user_id) < 1
        or not isinstance(role, str)
        or not role
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    return {
        "id": int(user_id),
        "role": role
    }


@router.get("/protected")
async def protected_route(
    current_user: dict = Depends(get_current_user)
):

    return {
        "message": "You are authenticated",
        "user": current_user
    }