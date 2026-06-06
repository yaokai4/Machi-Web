#!/usr/bin/env python3

import json
import os
import sys
import unittest
from pathlib import Path
from typing import Optional

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import serialize_post


def post_row(*, content_type: str, attributes: Optional[dict] = None) -> dict:
    return {
        "id": "post-private",
        "author_id": "user-secret",
        "content": "private author test",
        "content_type": content_type,
        "attributes": json.dumps(attributes or {}, ensure_ascii=False),
        "created_at": "2026-06-07T00:00:00+00:00",
        "updated_at": "2026-06-07T00:00:00+00:00",
        "status": "active",
    }


def author_payload() -> dict:
    return {
        "id": "user-secret",
        "handle": "real_handle",
        "display_name": "Real User",
    }


class AnonymousPostPrivacyTests(unittest.TestCase):
    def test_anonymous_post_masks_author_for_other_viewers(self) -> None:
        payload = serialize_post(
            post_row(content_type="anonymous", attributes={"anonymous": True}),
            {"viewer": {"id": "other-user"}, "author": author_payload()},
        )

        self.assertEqual(payload["author_id"], "")
        self.assertEqual(payload["author"]["id"], "anonymous")
        self.assertEqual(payload["author"]["handle"], "anonymous")
        self.assertNotIn("user-secret", json.dumps(payload))
        self.assertFalse(payload["canEdit"])

    def test_anonymous_post_keeps_owner_management_context(self) -> None:
        payload = serialize_post(
            post_row(content_type="anonymous", attributes={"anonymous": True}),
            {"viewer": {"id": "user-secret"}, "author": author_payload()},
        )

        self.assertEqual(payload["author_id"], "user-secret")
        self.assertEqual(payload["author"]["handle"], "real_handle")
        self.assertTrue(payload["canEdit"])

    def test_anonymous_attribute_masks_other_content_types(self) -> None:
        payload = serialize_post(
            post_row(content_type="warning", attributes={"anonymous": True}),
            {"viewer": {"id": "other-user"}, "author": author_payload()},
        )

        self.assertTrue(payload["is_anonymous"])
        self.assertEqual(payload["author_id"], "")
        self.assertEqual(payload["author"]["display_name"], "匿名用户")


if __name__ == "__main__":
    unittest.main()
