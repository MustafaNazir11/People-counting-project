import unittest
from unittest.mock import patch

import httpx

from app.main import app, configured_cors_origins


class AppHttpTests(unittest.IsolatedAsyncioTestCase):
    async def test_health_endpoint(self):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    async def test_local_frontend_origin_is_allowed_by_cors(self):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.options(
                "/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )

    def test_production_cors_origins_are_explicit_and_normalized(self):
        with patch.dict(
            "os.environ",
            {
                "CORS_ALLOWED_ORIGINS": (
                    " https://dashboard.example.com/ , "
                    "https://admin.example.com "
                )
            },
        ):
            self.assertEqual(
                configured_cors_origins(),
                [
                    "https://dashboard.example.com",
                    "https://admin.example.com",
                ],
            )

    def test_wildcard_cors_origin_is_rejected(self):
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": "*"}):
            with self.assertRaisesRegex(RuntimeError, "explicit frontend origins"):
                configured_cors_origins()
