import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.routers.sensors import get_accessible_sensor


class AccessibleSensorTests(unittest.IsolatedAsyncioTestCase):
    async def test_lookup_scopes_sensor_to_assigned_store(self):
        sensor = SimpleNamespace(id=9, store_id=21)
        result = SimpleNamespace(scalar_one_or_none=lambda: sensor)
        db = SimpleNamespace(execute=AsyncMock(return_value=result))

        found = await get_accessible_sensor(9, 7, db)

        self.assertIs(found, sensor)
        statement = db.execute.await_args.args[0]
        compiled = statement.compile(dialect=postgresql.dialect())
        self.assertIn("user_store_access.user_id", str(compiled))
        self.assertIn("sensors.id", str(compiled))
        self.assertIn(7, compiled.params.values())
        self.assertIn(9, compiled.params.values())

    async def test_inaccessible_sensor_is_reported_as_not_found(self):
        result = SimpleNamespace(scalar_one_or_none=lambda: None)
        db = SimpleNamespace(execute=AsyncMock(return_value=result))

        with self.assertRaises(HTTPException) as caught:
            await get_accessible_sensor(9, 7, db)

        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(caught.exception.detail, "Sensor not found")

