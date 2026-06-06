#!/usr/bin/env python3

import os
import sqlite3
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import APIError, validate_listing_media_for_create


class ListingMediaSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            """
            CREATE TABLE media (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                type TEXT NOT NULL,
                url TEXT NOT NULL,
                thumb_url TEXT NOT NULL,
                mime TEXT NOT NULL,
                width INTEGER NOT NULL DEFAULT 0,
                height INTEGER NOT NULL DEFAULT 0,
                duration REAL NOT NULL DEFAULT 0,
                byte_size INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE TABLE uploaded_files (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                purpose TEXT NOT NULL,
                status TEXT NOT NULL,
                deleted_at TEXT
            );
            """
        )

    def tearDown(self) -> None:
        self.conn.close()

    def add_media(self, media_id: str, purpose: str, *, owner: str = "owner", status: str = "ready") -> None:
        self.conn.execute(
            """
            INSERT INTO media (
                id, owner_id, type, url, thumb_url, mime, created_at
            ) VALUES (?, ?, 'image', ?, ?, 'image/jpeg', '2026-06-07T00:00:00+00:00')
            """,
            (media_id, owner, f"https://cdn.example/{media_id}.jpg", f"https://cdn.example/{media_id}.jpg"),
        )
        self.conn.execute(
            "INSERT INTO uploaded_files (id, user_id, purpose, status) VALUES (?, ?, ?, ?)",
            (media_id, owner, purpose, status),
        )

    def test_accepts_ready_media_for_matching_listing_channel(self) -> None:
        self.add_media("file-good", "secondhand_image")

        media = validate_listing_media_for_create(
            self.conn,
            "owner",
            "secondhand",
            {"media_ids": ["file-good"]},
        )

        self.assertEqual([item["id"] for item in media], ["file-good"])

    def test_rejects_private_message_media(self) -> None:
        self.add_media("file-private", "message_image")

        with self.assertRaises(APIError) as raised:
            validate_listing_media_for_create(
                self.conn,
                "owner",
                "secondhand",
                {"media_ids": ["file-private"]},
            )

        self.assertEqual(raised.exception.code, "listing_media_forbidden")

    def test_rejects_arbitrary_external_media_urls(self) -> None:
        with self.assertRaises(APIError) as raised:
            validate_listing_media_for_create(
                self.conn,
                "owner",
                "secondhand",
                {"media": [{"url": "https://tracker.example/pixel.jpg"}]},
            )

        self.assertEqual(raised.exception.code, "unified_upload_required")

    def test_rejects_media_over_channel_limit(self) -> None:
        with self.assertRaises(APIError) as raised:
            validate_listing_media_for_create(
                self.conn,
                "owner",
                "secondhand",
                {"media_ids": [f"file-{index}" for index in range(11)]},
            )

        self.assertEqual(raised.exception.code, "listing_media_limit")


if __name__ == "__main__":
    unittest.main()
