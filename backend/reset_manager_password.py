
import asyncio
from getpass import getpass

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User
from app.auth.auth import hash_password


async def reset_password():
    email = input("Enter the manager's registered email: ").strip()
    new_password = getpass("Enter the new password: ")
    confirm_password = getpass("Confirm the new password: ")

    if not new_password:
        print("Password cannot be empty.")
        return

    if new_password != confirm_password:
        print("Passwords do not match.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()

        if user is None:
            print("No account found with that email.")
            return

        user.password_hash = hash_password(new_password)
        await db.commit()

        print(f"Password reset successfully for {user.email}")


if __name__ == "__main__":
    asyncio.run(reset_password())

