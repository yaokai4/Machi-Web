#!/usr/bin/env python3
"""Regression coverage for admin user ban / restore operations."""

from __future__ import annotations

import tempfile
import unittest
import uuid
from pathlib import Path

import os
import sys

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def fake_handler(admin_id: str):
    req = server.Handler.__new__(server.Handler)
    req.current_session = lambda _conn: {"user_id": admin_id}
    req.sent = None
    req.send_json = lambda payload, _status=200: setattr(req, "sent", payload)
    return req


class AdminUserRestoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db_path = server.DB_PATH
        server.DB_PATH = Path(self.tmp.name) / "kaix-test.db"
        server.init_db()

    def tearDown(self) -> None:
        server.DB_PATH = self.original_db_path
        self.tmp.cleanup()

    def test_admin_can_ban_and_restore_user(self) -> None:
        now = server.now_iso()
        user_id = str(uuid.uuid4())
        token = "target-session"
        expires = "2999-01-01T00:00:00+00:00"
        with server.db() as conn:
            admin = conn.execute("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").fetchone()
            self.assertIsNotNone(admin)
            conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, 'member', ?, ?, ?)",
                (user_id, "restorecase", "Restore Case", server.hash_password("Passw0rd!"), now, now, now),
            )
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                (token, user_id, now, now, expires),
            )

            req = fake_handler(admin["id"])
            req.api_admin_delete_user(conn, user_id)
            banned = conn.execute("SELECT deleted_at FROM users WHERE id = ?", (user_id,)).fetchone()
            self.assertTrue(banned["deleted_at"])
            self.assertFalse(conn.execute("SELECT 1 FROM sessions WHERE token = ?", (token,)).fetchone())

            req = fake_handler(admin["id"])
            req.api_admin_restore_user(conn, user_id)
            restored = conn.execute("SELECT deleted_at FROM users WHERE id = ?", (user_id,)).fetchone()
            self.assertIsNone(restored["deleted_at"])
            self.assertEqual(req.sent["user"]["handle"], "restorecase")


if __name__ == "__main__":
    unittest.main(verbosity=2)
