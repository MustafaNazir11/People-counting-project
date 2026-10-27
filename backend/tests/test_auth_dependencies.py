import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from jose import jwt

from app.auth import dependencies


TEST_SECRET = "test-only-signing-secret-that-is-at-least-32-characters"


def make_token(claims):
    return jwt.encode(claims, TEST_SECRET, algorithm=dependencies.ALGORITHM)


class CurrentUserTests(unittest.IsolatedAsyncioTestCase):
    async def test_accepts_valid_token(self):
        token = make_token({
            "sub": "42",
            "role": "store_user",
            "exp": int(time.time()) + 60,
        })

        with patch.object(dependencies, "SECRET_KEY", TEST_SECRET):
            user = await dependencies.get_current_user(token)

        self.assertEqual(user, {"id": 42, "role": "store_user"})

    async def test_rejects_invalid_signature(self):
        token = jwt.encode(
            {"sub": "42", "role": "store_user", "exp": int(time.time()) + 60},
            "different-test-secret-that-is-at-least-32-characters",
            algorithm=dependencies.ALGORITHM,
        )

        with patch.object(dependencies, "SECRET_KEY", TEST_SECRET):
            with self.assertRaises(HTTPException) as caught:
                await dependencies.get_current_user(token)

        self.assertEqual(caught.exception.status_code, 401)

    async def test_rejects_expired_token(self):
        token = make_token({
            "sub": "42",
            "role": "store_user",
            "exp": int(time.time()) - 60,
        })

        with patch.object(dependencies, "SECRET_KEY", TEST_SECRET):
            with self.assertRaises(HTTPException) as caught:
                await dependencies.get_current_user(token)

        self.assertEqual(caught.exception.status_code, 401)

    async def test_rejects_malformed_user_id_without_server_error(self):
        token = make_token({
            "sub": "not-an-id",
            "role": "store_user",
            "exp": int(time.time()) + 60,
        })

        with patch.object(dependencies, "SECRET_KEY", TEST_SECRET):
            with self.assertRaises(HTTPException) as caught:
                await dependencies.get_current_user(token)

        self.assertEqual(caught.exception.status_code, 401)

    async def test_rejects_tokens_without_role(self):
        token = make_token({
            "sub": "42",
            "exp": int(time.time()) + 60,
        })

        with patch.object(dependencies, "SECRET_KEY", TEST_SECRET):
            with self.assertRaises(HTTPException) as caught:
                await dependencies.get_current_user(token)

        self.assertEqual(caught.exception.status_code, 401)
