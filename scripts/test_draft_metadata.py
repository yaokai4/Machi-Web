#!/usr/bin/env python3
"""Draft metadata persistence tests.

Run: cd web && python3 scripts/test_draft_metadata.py
"""

import json
import os
import sqlite3
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import Handler, ensure_draft_schema_extensions  # noqa: E402


class DraftMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            """
            CREATE TABLE drafts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                media_ids TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            """
        )
        ensure_draft_schema_extensions(self.conn)
        self.handler = Handler.__new__(Handler)
        self.handler.require_user = lambda conn: {"id": "user-1"}  # type: ignore[method-assign]
        self.sent = None
        self.handler.send_json = lambda data, status=200: setattr(self, "sent", (status, data))  # type: ignore[method-assign]

    def tearDown(self) -> None:
        self.conn.close()

    def save(self, payload: dict) -> dict:
        self.handler.read_json = lambda: payload  # type: ignore[method-assign]
        self.handler.api_save_draft(self.conn)
        self.assertIsNotNone(self.sent)
        status, data = self.sent
        self.assertEqual(status, 200)
        return data

    def list_items(self) -> list[dict]:
        self.handler.api_list_drafts(self.conn)
        self.assertIsNotNone(self.sent)
        status, data = self.sent
        self.assertEqual(status, 200)
        return data["items"]

    def test_save_and_list_structured_metadata(self) -> None:
        result = self.save({
            "id": "draft-1",
            "content": "搬家出清",
            "media_ids": ["m1", "m2"],
            "tags": ["搬家"],
            "country": "JP",
            "province": "13",
            "city": "Tokyo",
            "region_code": "jp.tokyo",
            "content_type": "secondhand",
            "attributes": {
                "title": "折叠桌",
                "price": "3500",
                "condition": "9成新",
                "unknown": "ignored",
            },
            "language": "zh-Hans",
        })
        self.assertEqual(result, {"id": "draft-1"})

        items = self.list_items()
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["media_ids"], ["m1", "m2"])
        self.assertEqual(item["tags"], ["搬家"])
        self.assertEqual(item["country"], "jp")
        self.assertEqual(item["city"], "tokyo")
        self.assertEqual(item["region_code"], "jp.tokyo")
        self.assertEqual(item["content_type"], "secondhand")
        self.assertEqual(item["language"], "zh-Hans")
        self.assertEqual(item["attributes"]["title"], "折叠桌")
        self.assertEqual(item["attributes"]["price"], 3500.0)
        self.assertNotIn("unknown", item["attributes"])

    def test_update_preserves_metadata_columns_without_duplicate_rows(self) -> None:
        self.save({
            "id": "draft-1",
            "content": "初稿",
            "content_type": "dynamic",
            "attributes": {"note": "one"},
        })
        self.save({
            "id": "draft-1",
            "content": "修改后",
            "media_ids": ["m3"],
            "content_type": "dynamic",
            "attributes": {"note": "two"},
            "language": "ja",
        })

        rows = self.conn.execute("SELECT * FROM drafts").fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "修改后")
        self.assertEqual(rows[0]["media_ids"], "m3")
        self.assertEqual(rows[0]["language"], "ja")
        self.assertEqual(json.loads(rows[0]["attributes"]), {"note": "two"})


if __name__ == "__main__":
    unittest.main()
