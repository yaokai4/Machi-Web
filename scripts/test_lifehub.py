"""City-life OS foundation tests (onboarding profile · north-star · recommendations).

Run: python3 scripts/test_lifehub.py
"""
import os
import sqlite3
import sys
import unittest
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server_lifehub as lh  # noqa: E402

DDL = """
CREATE TABLE user_life_profiles (
    user_id TEXT PRIMARY KEY, life_stage TEXT NOT NULL DEFAULT '',
    primary_intent TEXT NOT NULL DEFAULT '', secondary_intents TEXT NOT NULL DEFAULT '[]',
    onboarding_completed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE local_action_events (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_type TEXT NOT NULL,
    target_kind TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
"""


class LifeProfileTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(DDL)
        self.now = datetime.now(timezone.utc).isoformat()

    def test_upsert_and_get(self):
        p = lh.upsert_life_profile(self.conn, "u1", life_stage="finding_housing",
                                   primary_intent="housing", secondary_intents=["job", "bogus"], now=self.now)
        self.assertEqual(p["lifeStage"], "finding_housing")
        self.assertEqual(p["primaryIntent"], "housing")
        self.assertEqual(p["secondaryIntents"], ["job"])  # bogus dropped
        self.assertTrue(p["onboardingCompleted"])
        # merge: partial update keeps prior values
        p2 = lh.upsert_life_profile(self.conn, "u1", primary_intent="services", now=self.now)
        self.assertEqual(p2["lifeStage"], "finding_housing")  # preserved
        self.assertEqual(p2["primaryIntent"], "services")     # updated

    def test_invalid_values_dropped_not_raised(self):
        p = lh.upsert_life_profile(self.conn, "u2", life_stage="nonsense", primary_intent="nope", now=self.now)
        self.assertEqual(p["lifeStage"], "")
        self.assertEqual(p["primaryIntent"], "")

    def test_get_missing_is_empty(self):
        p = lh.get_life_profile(self.conn, "ghost")
        self.assertFalse(p["onboardingCompleted"])


class NorthStarTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(DDL)
        self.now = datetime.now(timezone.utc).isoformat()

    def test_record_and_weekly_summary(self):
        lh.record_local_action(self.conn, "u1", "guide_todo_done", now=self.now)
        lh.record_local_action(self.conn, "u1", "listing_favorited", now=self.now)
        lh.record_local_action(self.conn, "u1", "bogus_type", now=self.now)  # dropped
        s = lh.weekly_action_summary(self.conn, "u1", now=self.now)
        self.assertEqual(s["weeklySolvedActions"], 2)
        self.assertEqual(s["byType"].get("guide_todo_done"), 1)

    def test_old_events_excluded(self):
        old = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        lh.record_local_action(self.conn, "u1", "guide_todo_done", now=old)
        s = lh.weekly_action_summary(self.conn, "u1", now=self.now)
        self.assertEqual(s["weeklySolvedActions"], 0)


class RecommendationTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row

    def test_housing_seeker_gets_rental_with_reason(self):
        recs = lh.recommendations_for(self.conn, "u1", {"lifeStage": "finding_housing", "primaryIntent": "housing"})
        rental = [r for r in recs if r["target"]["ref"] == "rental"]
        self.assertTrue(rental, "housing seeker should get a rental card")
        self.assertIn("找房", rental[0]["reason"])

    def test_newcomer_gets_guide_plan(self):
        recs = lh.recommendations_for(self.conn, "u2", {"lifeStage": "arrived_7d", "primaryIntent": "procedures"})
        self.assertTrue(any(r["kind"] == "guide_plan" for r in recs))

    def test_every_card_has_reason_and_target(self):
        recs = lh.recommendations_for(self.conn, "u3", {"lifeStage": "settled", "primaryIntent": "social"})
        for r in recs:
            self.assertTrue(r["reason"])
            self.assertTrue(r["target"]["kind"] and r["target"]["ref"])


if __name__ == "__main__":
    unittest.main()
