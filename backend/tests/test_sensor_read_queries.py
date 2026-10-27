import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from sqlalchemy.dialects import postgresql

from app.routers.sensors import get_sensor_details
from app.routers.vs125 import get_vs125_readings


def result_with_scalar(value):
    return SimpleNamespace(scalar_one_or_none=lambda: value)


class SensorReadQueryTests(unittest.IsolatedAsyncioTestCase):
    async def test_readings_endpoint_does_not_select_pending_migration_column(self):
        db = SimpleNamespace(
            execute=AsyncMock(return_value=SimpleNamespace(all=lambda: []))
        )

        response = await get_vs125_readings(
            limit=1000,
            current_user={"id": 7},
            db=db,
        )

        self.assertEqual(response, {"count": 0, "readings": []})
        statement = db.execute.await_args.args[0]
        compiled = statement.compile(dialect=postgresql.dialect())
        self.assertNotIn("source_event_id", str(compiled))

    async def test_sensor_details_does_not_select_pending_migration_column(self):
        sensor = SimpleNamespace(
            id=9,
            store_id=21,
            name="Test sensor",
            status="offline",
            milesight_device_id=None,
            serial_number=None,
            model=None,
            firmware_version=None,
            ip_address=None,
            last_seen_at=None,
            config_synced_at=None,
            created_at=None,
        )
        empty_rows = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
        db = SimpleNamespace(
            execute=AsyncMock(
                side_effect=[
                    result_with_scalar(sensor),
                    result_with_scalar(None),
                    result_with_scalar(None),
                    empty_rows,
                ]
            )
        )

        response = await get_sensor_details(
            sensor_id=9,
            current_user={"id": 7},
            db=db,
        )

        self.assertEqual(response["latest_readings"], [])
        statement = db.execute.await_args_list[-1].args[0]
        compiled = statement.compile(dialect=postgresql.dialect())
        self.assertNotIn("source_event_id", str(compiled))


if __name__ == "__main__":
    unittest.main()
