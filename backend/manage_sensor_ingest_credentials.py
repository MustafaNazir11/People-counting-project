import argparse
import asyncio
from datetime import datetime, timezone
import secrets

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import Sensor, SensorIngestCredential
from app.services.vs125_service import hash_ingest_token


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rotate or revoke a sensor's VS125 ingest credential."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    rotate = commands.add_parser(
        "rotate",
        help="revoke active credentials and create a replacement",
    )
    rotate.add_argument("--sensor-id", type=int, required=True)

    revoke = commands.add_parser(
        "revoke",
        help="revoke active credentials for one sensor",
    )
    revoke.add_argument("--sensor-id", type=int, required=True)
    revoke.add_argument("--credential-id", type=int)
    return parser.parse_args()


async def manage_credential(args: argparse.Namespace) -> None:
    try:
        async with AsyncSessionLocal() as db:
            async with db.begin():
                sensor_result = await db.execute(
                    select(Sensor)
                    .where(Sensor.id == args.sensor_id)
                    .with_for_update()
                )
                if sensor_result.scalar_one_or_none() is None:
                    raise ValueError(f"Sensor {args.sensor_id} does not exist.")

                credential_query = select(SensorIngestCredential).where(
                    SensorIngestCredential.sensor_id == args.sensor_id,
                    SensorIngestCredential.revoked_at.is_(None),
                )
                if args.command == "revoke" and args.credential_id is not None:
                    credential_query = credential_query.where(
                        SensorIngestCredential.id == args.credential_id
                    )

                credentials = (
                    await db.execute(credential_query.with_for_update())
                ).scalars().all()
                revoked_at = datetime.now(timezone.utc)
                for credential in credentials:
                    credential.revoked_at = revoked_at

                if args.command == "rotate":
                    token = f"vs125_{secrets.token_urlsafe(32)}"
                    db.add(
                        SensorIngestCredential(
                            sensor_id=args.sensor_id,
                            token_hash=hash_ingest_token(token),
                        )
                    )
        if args.command == "rotate":
            print("New sensor credential (shown once):")
            print(token)
        else:
            print(f"Revoked {len(credentials)} credential(s).")
    finally:
        await engine.dispose()


def main() -> None:
    args = parse_arguments()
    asyncio.run(manage_credential(args))


if __name__ == "__main__":
    main()
