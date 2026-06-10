#!/usr/bin/env python3
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class FakeCursor:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, session):
        self.session = session
        self.statements = []

    def execute(self, statement, params=()):
        self.statements.append((statement, params))
        if statement.startswith("SELECT * FROM sessions"):
            token = params[0] if params else ""
            return FakeCursor(self.session if token == self.session.get("token") else None)
        return FakeCursor(None)


def handler(headers=None):
    value = server.Handler.__new__(server.Handler)
    value.headers = headers or {}
    return value


class AuthCookieTests(unittest.TestCase):
    def session(self):
        return {
            "token": "session-token",
            "user_id": "user-1",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        }

    def test_cookie_has_browser_security_attributes(self):
        value = handler()
        with patch.object(server, "PRODUCTION", True):
            value._set_session_cookie("abc")
        cookie = value._pending_session_cookie
        self.assertIn("machi_session=abc", cookie)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertIn("Secure", cookie)
        self.assertIn("Path=/", cookie)

    def test_cookie_authenticates_without_authorization_header(self):
        value = handler({"Cookie": "other=x; machi_session=session-token"})
        result = value.current_session(FakeConnection(self.session()))
        self.assertEqual(result["user_id"], "user-1")
        self.assertFalse(getattr(value, "_pending_session_cookie", ""))

    def test_bearer_session_is_queued_for_cookie_migration(self):
        value = handler({"Authorization": "Bearer session-token"})
        result = value.current_session(FakeConnection(self.session()))
        self.assertEqual(result["user_id"], "user-1")
        self.assertIn("machi_session=session-token", value._pending_session_cookie)

    def test_invalid_cookie_is_cleared(self):
        value = handler({"Cookie": "machi_session=invalid"})
        result = value.current_session(FakeConnection(self.session()))
        self.assertIsNone(result)
        self.assertIn("Max-Age=0", value._pending_session_cookie)

    def test_web_oauth_redirect_never_contains_session_token(self):
        value = handler()
        web = value._oauth_callback_location("web", token="secret", redirect="/home")
        ios = value._oauth_callback_location("ios", token="secret", redirect="machi://auth/google")
        self.assertNotIn("secret", web)
        self.assertIn("secret", ios)


if __name__ == "__main__":
    unittest.main(verbosity=2)
