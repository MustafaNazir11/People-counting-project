import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
from sqlalchemy.dialects import postgresql

from app.main import app
from app.routers.vs125 import get_db
from app.services.vs125 import hash_ingest_token


def valid_payload():
    return {
        "line_periodic_total_data": [
            {
                "line": 1,
                "line_name": "Entrance",
                "line_uuid": "line-uuid-1",
                "in": 2,
                "out": 1,
                "male_in": 1,
                "male_out": 1,
                "female_in": 1,
                "female_out": 0,
                "group_in": 0,
                "group_out": 0,
            },
        ],
    }


class SensorIngestAuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = SimpleNamespace(
            execute=AsyncMock(),
            commit=AsyncMock(),
            rollback=AsyncMock(),
        )

        async def override_get_db():
            yield self.db

        app.dependency_overrides[get_db] = override_get_db
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        app.dependency_overrides.pop(get_db, None)

    async def test_missing_credential_is_rejected(self):
        response = await self.client.post(
            "/sensors/vs125/ingest?sensor_id=99",
            headers={"Idempotency-Key": "event-1"},
            json=valid_payload(),
        )

        self.assertEqual(response.status_code, 401)
        self.db.execute.assert_not_awaited()

    async def test_invalid_credential_is_rejected(self):
        self.db.execute.return_value = SimpleNamespace(
            scalar_one_or_none=lambda: None
        )
        response = await self.client.post(
            "/sensors/vs125/ingest",
            headers={
                "X-Sensor-Token": f"vs125_{'x' * 43}",
                "Idempotency-Key": "event-1",
            },
            json=valid_payload(),
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.db.execute.await_count, 1)
        self.db.commit.assert_not_awaited()

    async def test_credential_selects_sensor_and_ignores_spoofed_sensor_id(self):
        token = f"vs125_{'a' * 43}"
        self.db.execute.side_effect = [
            SimpleNamespace(scalar_one_or_none=lambda: 17),
            SimpleNamespace(rowcount=1),
        ]
        response = await self.client.post(
            "/sensors/vs125/ingest?sensor_id=99",
            headers={
                "X-Sensor-Token": token,
                "Idempotency-Key": "device-event-1",
            },
            json=valid_payload(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["records_saved"], 1)
        auth_statement = self.db.execute.await_args_list[0].args[0]
        auth_params = auth_statement.compile(
            dialect=postgresql.dialect()
        ).params
        self.assertIn(hash_ingest_token(token), auth_params.values())
        self.assertIn(
            "sensor_ingest_credentials.revoked_at IS NULL",
            str(auth_statement.compile(dialect=postgresql.dialect())),
        )

        insert_statement = self.db.execute.await_args_list[1].args[0]
        insert_params = insert_statement.compile(
            dialect=postgresql.dialect()
        ).params
        self.assertIn(17, insert_params.values())
        self.assertNotIn(99, insert_params.values())
        self.assertIn("device-event-1", insert_params.values())
        self.db.commit.assert_awaited_once()

    async def test_invalid_payload_is_rejected_before_database_query(self):
        invalid = valid_payload()
        invalid["line_periodic_total_data"][0]["in"] = -1
        response = await self.client.post(
            "/sensors/vs125/ingest",
            headers={
                "X-Sensor-Token": f"vs125_{'a' * 43}",
                "Idempotency-Key": "device-event-1",
            },
            json=invalid,
        )

        self.assertEqual(response.status_code, 422)
        self.db.execute.assert_not_awaited()

    async def test_legacy_webhook_is_not_mounted(self):
        paths = {
            route.path for route in app.routes if hasattr(route, "path")
        }

        assert "/vs125/webhook" not in paths


if __name__ == "__main__":
    unittest.main()
