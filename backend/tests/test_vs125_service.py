import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.services.milesight import (
    MilesightClient,
    MilesightConfigurationError,
    MilesightSettings,
    normalize_milesight_config,
)
from app.services.vs125_service import (
    SensorPayload,
    ingest_readings,
    normalize_device_information,
    refresh_sensor_data,
    sync_device_information,
    validate_reading_payload,
)


def settings(**overrides):
    values = {
        "base_url": "https://example.invalid",
        "access_token": "test-token-not-a-real-credential",
        "default_device_id": "test-device",
        "device_info_path": None,
        "device_config_path": (
            "/device/openapi/v1/devices/{device_id}/config"
        ),
        "readings_path": None,
        "timeout_seconds": 3,
    }
    values.update(overrides)
    return MilesightSettings(**values)


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


class FakeSession:
    def __init__(self, rowcounts):
        self.rowcounts = iter(rowcounts)
        self.statements = []
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def execute(self, statement):
        self.statements.append(statement)
        return SimpleNamespace(rowcount=next(self.rowcounts))


class MilesightClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetches_config_from_repository_confirmed_path(self):
        async def handler(request):
            self.assertEqual(
                request.url.path,
                "/device/openapi/v1/devices/test-device/config",
            )
            self.assertEqual(
                request.headers["Authorization"],
                "Bearer test-token-not-a-real-credential",
            )
            return httpx.Response(200, json={"status": "Success"})

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            response = await MilesightClient(
                settings(),
                http_client=http_client,
            ).get_device_configuration()

        self.assertEqual(response, {"status": "Success"})

    async def test_unconfigured_vendor_endpoint_fails_explicitly(self):
        client = MilesightClient(settings())
        with self.assertRaises(MilesightConfigurationError):
            await client.get_device_information()
        with self.assertRaises(MilesightConfigurationError):
            await client.get_line_readings()

    async def test_http_failure_is_propagated_without_exposing_token(self):
        async def handler(_request):
            return httpx.Response(503, json={"detail": "Unavailable"})

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            client = MilesightClient(settings(), http_client=http_client)
            with self.assertRaises(httpx.HTTPStatusError) as caught:
                await client.get_device_configuration()

        self.assertEqual(caught.exception.response.status_code, 503)
        self.assertNotIn(
            "test-token-not-a-real-credential",
            str(caught.exception),
        )

    async def test_vendor_authentication_failure_is_propagated(self):
        async def handler(_request):
            return httpx.Response(401, json={"detail": "Unauthorized"})

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            client = MilesightClient(settings(), http_client=http_client)
            with self.assertRaises(httpx.HTTPStatusError) as caught:
                await client.get_device_configuration()

        self.assertEqual(caught.exception.response.status_code, 401)
        self.assertNotIn(
            "test-token-not-a-real-credential",
            str(caught.exception),
        )

    async def test_invalid_json_response_is_rejected(self):
        async def handler(_request):
            return httpx.Response(200, text="not-json")

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            client = MilesightClient(settings(), http_client=http_client)
            with self.assertRaisesRegex(ValueError, "invalid JSON"):
                await client.get_device_configuration()

    async def test_timeout_is_propagated(self):
        async def handler(_request):
            raise httpx.ReadTimeout("timed out")

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            client = MilesightClient(settings(), http_client=http_client)
            with self.assertRaises(httpx.TimeoutException):
                await client.get_device_configuration()

    async def test_connection_failure_is_propagated(self):
        async def handler(request):
            raise httpx.ConnectError("connection failed", request=request)

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as http_client:
            client = MilesightClient(settings(), http_client=http_client)
            with self.assertRaises(httpx.RequestError):
                await client.get_device_configuration()

    def test_normalizes_configuration_and_removes_secret_values(self):
        response = {
            "status": "Success",
            "data": {
                "values": [
                    {"key": "report_interval", "value": 60},
                    {"key": "wifi_password", "value": "private"},
                    {"key": "network", "value": {"token": "private", "mode": "wifi"}},
                ],
            },
        }

        self.assertEqual(
            normalize_milesight_config(response),
            {"report_interval": 60, "network": {"mode": "wifi"}},
        )


class PayloadAndPersistenceTests(unittest.IsolatedAsyncioTestCase):
    def test_accepts_existing_vs125_ingest_schema(self):
        parsed = validate_reading_payload(valid_payload())
        self.assertIsInstance(parsed, SensorPayload)
        self.assertEqual(parsed.line_periodic_total_data[0].in_count, 2)

    def test_rejects_invalid_counts_and_unknown_fields(self):
        invalid_count = valid_payload()
        invalid_count["line_periodic_total_data"][0]["in"] = -1
        with self.assertRaises(ValidationError):
            validate_reading_payload(invalid_count)

        unknown_field = valid_payload()
        unknown_field["unexpected"] = True
        with self.assertRaises(ValidationError):
            validate_reading_payload(unknown_field)

    def test_missing_device_metadata_is_empty_not_fabricated(self):
        self.assertIsNone(normalize_device_information({"data": {}}))
        self.assertIsNone(
            normalize_device_information(
                {"status": "Success", "data": None},
            )
        )

    async def test_missing_device_metadata_does_not_write_row(self):
        db = FakeSession([])
        saved = await sync_device_information(db, 9, {"data": {}})
        self.assertFalse(saved)
        self.assertEqual(db.statements, [])
        db.commit.assert_not_awaited()

    async def test_duplicate_event_and_line_is_ignored_by_unique_constraint(self):
        db = FakeSession([0])
        count = await ingest_readings(
            db,
            9,
            "stable-event-1",
            validate_reading_payload(valid_payload()),
        )

        statement = db.statements[0]
        self.assertEqual(count, 0)
        compiled = statement.compile(dialect=postgresql.dialect())
        self.assertIn(
            "ON CONFLICT ON CONSTRAINT uq_sensor_reading_source_event_line",
            str(compiled),
        )
        self.assertEqual(
            compiled.params["source_event_id_m0"],
            "stable-event-1",
        )
        db.commit.assert_awaited_once()
        db.rollback.assert_not_awaited()

    async def test_replaying_event_does_not_add_readings_twice(self):
        db = FakeSession([1, 0])
        payload = validate_reading_payload(valid_payload())

        first_count = await ingest_readings(db, 9, "retry-event", payload)
        retry_count = await ingest_readings(db, 9, "retry-event", payload)

        self.assertEqual(first_count, 1)
        self.assertEqual(retry_count, 0)
        self.assertEqual(len(db.statements), 2)
        self.assertEqual(db.commit.await_count, 2)

    async def test_new_event_inserts_records(self):
        db = FakeSession([1])
        count = await ingest_readings(
            db,
            9,
            "stable-event-2",
            validate_reading_payload(valid_payload()),
        )
        self.assertEqual(count, 1)

    async def test_distinct_event_ids_are_stored_on_the_reading_rows(self):
        db = FakeSession([1, 1])
        payload = validate_reading_payload(valid_payload())

        await ingest_readings(db, 9, "event-one", payload)
        await ingest_readings(db, 9, "event-two", payload)

        event_ids = []
        for statement in db.statements:
            compiled = statement.compile(dialect=postgresql.dialect())
            event_ids.append(
                next(
                    value
                    for name, value in compiled.params.items()
                    if name.startswith("source_event_id")
                )
            )
        self.assertEqual(event_ids, ["event-one", "event-two"])

    async def test_ingest_rolls_back_when_database_write_fails(self):
        db = FakeSession([])
        db.execute = AsyncMock(side_effect=RuntimeError("database error"))

        with self.assertRaisesRegex(RuntimeError, "database error"):
            await ingest_readings(
                db,
                9,
                "failed-event",
                validate_reading_payload(valid_payload()),
            )

        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()

    async def test_refresh_validates_all_cloud_data_before_persisting(self):
        db = FakeSession([1, 1, 1])
        client = SimpleNamespace(
            get_device_information=AsyncMock(
                return_value={"data": {"device_sn": "sn-from-response"}},
            ),
            get_device_configuration=AsyncMock(
                return_value={
                    "status": "Success",
                    "data": {"values": [{"key": "mode", "value": "count"}]},
                },
            ),
            get_line_readings=AsyncMock(return_value=valid_payload()),
        )

        refreshed = await refresh_sensor_data(
            db,
            sensor_id=9,
            idempotency_key="cloud-event",
            device_id="configured-device",
            client=client,
        )

        self.assertTrue(refreshed["device_info_saved"])
        self.assertEqual(refreshed["readings_saved"], 1)
        self.assertEqual(len(db.statements), 3)
        self.assertEqual(db.commit.await_count, 1)

    async def test_refresh_rolls_back_when_database_write_fails(self):
        db = FakeSession([])
        db.execute = AsyncMock(side_effect=RuntimeError("database error"))
        client = SimpleNamespace(
            get_device_information=AsyncMock(return_value={"data": {}}),
            get_device_configuration=AsyncMock(
                return_value={
                    "status": "Success",
                    "data": {"values": []},
                },
            ),
            get_line_readings=AsyncMock(return_value=valid_payload()),
        )

        with self.assertRaisesRegex(RuntimeError, "database error"):
            await refresh_sensor_data(
                db,
                sensor_id=9,
                idempotency_key="failed-cloud-event",
                client=client,
            )

        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()

    async def test_invalid_cloud_readings_do_not_partially_persist(self):
        db = FakeSession([])
        client = SimpleNamespace(
            get_device_information=AsyncMock(return_value={"data": {}}),
            get_device_configuration=AsyncMock(
                return_value={
                    "status": "Success",
                    "data": {"values": []},
                },
            ),
            get_line_readings=AsyncMock(return_value={"unexpected": True}),
        )

        with self.assertRaises(ValueError):
            await refresh_sensor_data(
                db,
                sensor_id=9,
                idempotency_key="cloud-event-invalid",
                client=client,
            )

        self.assertEqual(db.statements, [])
        db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
