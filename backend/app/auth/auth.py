"""Authentication and token utilities belong here."""

import os
from pathlib import Path
from jose import jwt
from datetime import datetime, timedelta

from pwdlib import PasswordHash
from dotenv import load_dotenv

password_hash = PasswordHash.recommended()

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return password_hash.verify(
        plain_password,
        hashed_password
    )

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY must be set to a randomly generated secret "
        "of at least 32 characters in backend/.env or the environment."
    )

ALGORITHM = "HS256"


def create_access_token(
    user_id: int,
    role: str
):
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=24)
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )