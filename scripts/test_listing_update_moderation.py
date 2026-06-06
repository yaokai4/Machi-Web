#!/usr/bin/env python3

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import resolve_listing_owner_update_publication


def listing_row(status: str = "pending_review", listing_type: str = "secondhand") -> dict:
    return {
        "id": "listing-1",
        "type": listing_type,
        "status": status,
        "published_at": None,
    }


class ListingUpdateModerationTests(unittest.TestCase):
    @patch("server._site_settings", return_value={"listing_review_enabled": "1"})
    @patch("server.reputation_validate_listing_publish", return_value=(True, "声望抽检"))
    def test_pending_listing_cannot_be_published_by_owner(self, validate, _settings) -> None:
        result = resolve_listing_owner_update_publication(
            object(),
            {"id": "owner"},
            listing_row(),
            requested_status="published",
            content_changed=False,
        )

        self.assertEqual(result["status"], "pending_review")
        self.assertEqual(result["verification_status"], "pending")
        self.assertTrue(result["requires_review"])
        validate.assert_called_once()

    @patch("server.reputation_validate_listing_publish")
    def test_approved_listing_can_change_to_reserved_without_re_review(self, validate) -> None:
        result = resolve_listing_owner_update_publication(
            object(),
            {"id": "owner"},
            listing_row(status="published"),
            requested_status="reserved",
            content_changed=False,
        )

        self.assertEqual(result, {"status": "reserved"})
        validate.assert_not_called()

    @patch("server._site_settings", return_value={"listing_review_enabled": "1"})
    @patch("server.reputation_validate_listing_publish", return_value=(True, "高信任频道审核"))
    def test_public_content_edit_returns_to_review(self, _validate, _settings) -> None:
        result = resolve_listing_owner_update_publication(
            object(),
            {"id": "owner"},
            listing_row(status="published", listing_type="local_service"),
            requested_status=None,
            content_changed=True,
        )

        self.assertEqual(result["status"], "pending_review")
        self.assertIsNone(result["published_at"])
        self.assertTrue(result["requires_review"])

    @patch("server._site_settings", return_value={"listing_review_enabled": "0"})
    @patch("server.reputation_validate_listing_publish", return_value=(True, "声望抽检"))
    def test_review_disabled_allows_publication(self, _validate, _settings) -> None:
        result = resolve_listing_owner_update_publication(
            object(),
            {"id": "owner"},
            listing_row(status="draft"),
            requested_status="published",
            content_changed=False,
        )

        self.assertEqual(result["status"], "published")
        self.assertFalse(result["requires_review"])
        self.assertTrue(result["published_at"])


if __name__ == "__main__":
    unittest.main()
