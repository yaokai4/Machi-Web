#!/usr/bin/env python3
"""Regression coverage for Machi member-gated listing publishing."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class FakeCursor:
    def __init__(self, row: dict):
        self.row = row

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, monthly_count: int = 0):
        self.monthly_count = monthly_count
        self.statements: list[tuple[str, list]] = []

    def execute(self, statement, params=()):
        params_list = list(params)
        self.statements.append((statement, params_list))
        if "FROM city_listings" in statement:
            return FakeCursor({"c": self.monthly_count})
        return FakeCursor({})


def low_trust_controls() -> dict:
    return {
        "can_publish_secondhand": True,
        "secondhand_requires_review": False,
        "high_risk_requires_review": False,
    }


class ListingMembershipPublishTests(unittest.TestCase):
    def user(self) -> dict:
        return {"id": "user-1", "created_at": "2026-06-01T00:00:00+00:00"}

    @patch("server.reputation_effective_limits", return_value=low_trust_controls())
    @patch("server.reputation_ensure_user", return_value={"level": 1, "reputation_score": 0, "risk_score": 0})
    @patch("server.has_active_membership", return_value=False)
    def test_rental_requires_machi_membership_not_level(self, *_mocks) -> None:
        with self.assertRaises(server.APIError) as ctx:
            server.reputation_validate_listing_publish(FakeConnection(), self.user(), "rental")

        self.assertEqual(ctx.exception.code, "MEMBERSHIP_REQUIRED")
        self.assertNotEqual(ctx.exception.code, "REPUTATION_LIMITED")

    @patch("server.reputation_effective_limits", return_value=low_trust_controls())
    @patch("server.reputation_ensure_user", return_value={"level": 1, "reputation_score": 0, "risk_score": 0})
    @patch("server.has_active_membership", return_value=True)
    def test_member_can_publish_hiring_without_level_three(self, *_mocks) -> None:
        requires_review, reason = server.reputation_validate_listing_publish(FakeConnection(), self.user(), "hiring")

        self.assertTrue(requires_review)
        self.assertEqual(reason, "高信任频道审核")

    @patch("server.reputation_effective_limits", return_value=low_trust_controls())
    @patch("server.reputation_ensure_user", return_value={"level": 1, "reputation_score": 0, "risk_score": 0})
    @patch("server.has_active_membership", return_value=True)
    def test_membership_quota_combines_job_and_hiring(self, *_mocks) -> None:
        conn = FakeConnection(monthly_count=3)

        with self.assertRaises(server.APIError) as ctx:
            server.reputation_validate_listing_publish(conn, self.user(), "job")

        self.assertEqual(ctx.exception.code, "MEMBERSHIP_LISTING_QUOTA_EXCEEDED")
        _, params = conn.statements[-1]
        self.assertEqual(set(params[1:-1]), {"hiring", "job"})

    @patch("server.reputation_effective_limits", return_value=low_trust_controls())
    @patch("server.reputation_ensure_user", return_value={"level": 1, "reputation_score": 0, "risk_score": 0})
    @patch("server.has_active_membership", return_value=True)
    def test_existing_public_listing_edit_does_not_consume_quota(self, *_mocks) -> None:
        requires_review, _ = server.reputation_validate_listing_publish(
            FakeConnection(monthly_count=99),
            self.user(),
            "local_service",
            enforce_quota=False,
        )

        self.assertTrue(requires_review)


if __name__ == "__main__":
    unittest.main(verbosity=2)
