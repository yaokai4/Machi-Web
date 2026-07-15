#!/usr/bin/env python3
"""Regression coverage for protecting administrator accounts from self-delete."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def fake_handler(user_id: str):
    req = server.Handler.__new__(server.Handler)
    req.current_session = lambda _conn: {"user_id": user_id}
    req.sent = None
    req.send_json = lambda payload, _status=200: setattr(req, "sent", payload)
    req._clear_session_cookie = lambda: None
    return req


class AdminSelfDeleteGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db_path = server.DB_PATH
        server.DB_PATH = Path(self.tmp.name) / "kaix-test.db"
        server.init_db()

    def tearDown(self) -> None:
        server.DB_PATH = self.original_db_path
        self.tmp.cleanup()

    def insert_user(self, conn, *, role: str) -> tuple[str, str]:
        now = server.now_iso()
        user_id = str(uuid.uuid4())
        handle = f"delete_{role}_{uuid.uuid4().hex[:8]}"
        token = f"session-{uuid.uuid4()}"
        conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, handle, handle, server.hash_password("Passw0rd!"), role, now, now, now),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (token, user_id, now, now, "2999-01-01T00:00:00+00:00"),
        )
        return user_id, token

    def test_admin_self_delete_is_rejected_without_mutation(self) -> None:
        with server.db() as conn:
            user_id, token = self.insert_user(conn, role="admin")

            with self.assertRaises(server.APIError) as raised:
                fake_handler(user_id).api_delete_me(conn)

            self.assertEqual(raised.exception.status, 403)
            self.assertEqual(raised.exception.code, "admin_self_delete_forbidden")
            user = conn.execute("SELECT handle, role, deleted_at FROM users WHERE id = ?", (user_id,)).fetchone()
            self.assertEqual(user["role"], "admin")
            self.assertIsNone(user["deleted_at"])
            self.assertTrue(conn.execute("SELECT 1 FROM sessions WHERE token = ?", (token,)).fetchone())

    def test_member_self_delete_still_anonymizes_account(self) -> None:
        with server.db() as conn:
            user_id, token = self.insert_user(conn, role="member")

            req = fake_handler(user_id)
            req.api_delete_me(conn)

            user = conn.execute("SELECT handle, display_name, deleted_at FROM users WHERE id = ?", (user_id,)).fetchone()
            self.assertTrue(user["handle"].startswith("deleted_"))
            self.assertEqual(user["display_name"], "已注销用户")
            self.assertIsNotNone(user["deleted_at"])
            self.assertFalse(conn.execute("SELECT 1 FROM sessions WHERE token = ?", (token,)).fetchone())
            self.assertEqual(req.sent, {"ok": True})

    def test_google_identity_cannot_be_rebound_to_another_active_account(self) -> None:
        with server.db() as conn:
            owner_id, _ = self.insert_user(conn, role="member")
            target_id, _ = self.insert_user(conn, role="member")
            google_sub = "google-identity-already-owned"
            conn.execute("UPDATE users SET google_sub = ? WHERE id = ?", (google_sub, owner_id))

            with self.assertRaises(server.APIError) as raised:
                fake_handler(target_id)._link_google_to_user(conn, target_id, {"sub": google_sub})

            self.assertEqual(raised.exception.status, 409)
            self.assertEqual(raised.exception.code, "google_already_linked")
            self.assertEqual(
                conn.execute("SELECT google_sub FROM users WHERE id = ?", (owner_id,)).fetchone()["google_sub"],
                google_sub,
            )
            self.assertEqual(
                conn.execute("SELECT google_sub FROM users WHERE id = ?", (target_id,)).fetchone()["google_sub"],
                "",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
