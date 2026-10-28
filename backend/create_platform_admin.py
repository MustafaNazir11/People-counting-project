
import asyncio
from getpass import getpass
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import PlatformAdmin
from app.auth.auth import hash_password


async def create_platform_admin():
    print("\n=== Create Platform Administrator ===")

    name = input("Administrator name: ").strip()
    email = input("Administrator email: ").strip().lower()
    password = getpass("Administrator password: ")
    confirm_password = getpass("Confirm password: ")

    if not name or not email or not password:
        print("Error: All fields are required.")
        return

    if "@" not in email:
        print("Error: Enter a valid email address.")
        return

    if len(password) < 8:
        print("Error: Use a password of at least 8 characters.")
        return

    if password != confirm_password:
        print("Error: Passwords do not match.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PlatformAdmin).where(
                PlatformAdmin.email == email
            )
        )

        if result.scalar_one_or_none():
            print("Error: This administrator email already exists.")
            return

        admin = PlatformAdmin(
            name=name,
            email=email,
            password_hash=hash_password(password),
            is_active=True,
        )

        db.add(admin)
        await db.commit()

        print("\nPlatform administrator created successfully.")
        print(f"Email: {email}")


if __name__ == "__main__":
    asyncio.run(create_platform_admin())
