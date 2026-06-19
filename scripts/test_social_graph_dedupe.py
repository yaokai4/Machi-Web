#!/usr/bin/env python3
"""Regression coverage for social graph endpoints used by iOS messages/profile.

The test intentionally uses a tiny legacy-style schema without UNIQUE
constraints on follows. Production has a migration that cleans and constrains
this table, but the handlers should still tolerate old duplicated rows so the
iOS app never shows duplicate contacts or crashes on a transient migration gap.

Run: cd web && python3 scripts/test_social_graph_dedupe.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class CapturingHandler:
    def __new__(cls, user_id: str = "u-me"):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.send_json = lambda payload, status=200: handler.payloads.append(payload)
        handler.current_session = lambda conn: {"user_id": user_id}
        return handler


class SocialGraphDedupeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                handle TEXT NOT NULL,
                display_name TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL DEFAULT '',
                bio TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                avatar_symbol TEXT NOT NULL DEFAULT 'person.fill',
                avatar_color TEXT NOT NULL DEFAULT 'indigo',
                avatar_url TEXT NOT NULL DEFAULT '',
                cover_url TEXT NOT NULL DEFAULT '',
                membership_tier TEXT NOT NULL DEFAULT 'free',
                is_verified INTEGER NOT NULL DEFAULT 0,
                role TEXT NOT NULL DEFAULT 'member',
                joined_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00+00:00',
                created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00+00:00',
                updated_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00+00:00',
                deleted_at TEXT
            );
            CREATE TABLE follows (
                id TEXT PRIMARY KEY,
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE blocks (
                id TEXT PRIMARY KEY,
                blocker_id TEXT NOT NULL,
                blocked_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        for uid, handle, name in (
            ("u-me", "me", "Machi Me"),
            ("u-alpha", "alpha", "Alpha"),
            ("u-bravo", "bravo", "Bravo"),
            ("u-blocked", "blocked", "Blocked"),
        ):
            self.conn.execute(
                "INSERT INTO users (id, handle, display_name) VALUES (?, ?, ?)",
                (uid, handle, name),
            )
        self._follow("u-me", "u-alpha", "f1")
        self._follow("u-me", "u-alpha", "f2")
        self._follow("u-alpha", "u-me", "f3")
        self._follow("u-alpha", "u-me", "f4")
        self._follow("u-me", "u-bravo", "f5")
        self._follow("u-me", "u-bravo", "f6")
        self._follow("u-me", "u-blocked", "f7")
        self._follow("u-blocked", "u-me", "f8")
        self.conn.execute(
            "INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES ('b1', 'u-me', 'u-blocked', '2026-01-01')"
        )

    def tearDown(self) -> None:
        self.conn.close()

    def _follow(self, follower: str, following: str, fid: str) -> None:
        self.conn.execute(
            "INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, '2026-01-01')",
            (fid, follower, following),
        )

    def test_mutual_message_friends_dedupes_and_excludes_blocks(self) -> None:
        handler = CapturingHandler()
        handler.api_mutual_message_friends(self.conn, {})

        items = handler.payloads[-1]["items"]
        self.assertEqual([item["id"] for item in items], ["u-alpha"])
        self.assertTrue(items[0]["isFollowing"])

    def test_mutual_message_friends_search_uses_same_dedupe(self) -> None:
        handler = CapturingHandler()
        handler.api_mutual_message_friends(self.conn, {"q": "alp"})

        self.assertEqual([item["handle"] for item in handler.payloads[-1]["items"]], ["alpha"])

    def test_relationship_lists_dedupe_legacy_duplicate_follows(self) -> None:
        handler = CapturingHandler()
        handler.api_relationship(self.conn, "u-me", "following")
        following_ids = [item["id"] for item in handler.payloads[-1]["items"]]
        self.assertEqual(following_ids.count("u-alpha"), 1)
        self.assertEqual(following_ids.count("u-bravo"), 1)

        handler = CapturingHandler()
        handler.api_relationship(self.conn, "u-me", "followers")
        follower_ids = [item["id"] for item in handler.payloads[-1]["items"]]
        self.assertEqual(follower_ids.count("u-alpha"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
