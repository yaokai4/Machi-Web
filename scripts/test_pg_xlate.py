#!/usr/bin/env python3
"""Unit tests for the SQLite->Postgres dialect shim (_pg_xlate) used by the
optional PostgreSQL backend. Pure function; no DB / psycopg2 needed.

Run:  cd web && python3 scripts/test_pg_xlate.py
"""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import _pg_xlate  # noqa: E402


class PgXlateTests(unittest.TestCase):
    def test_like_becomes_ilike_and_qmark_becomes_pct_s(self):
        self.assertEqual(
            _pg_xlate("SELECT * FROM t WHERE x LIKE ?", True),
            "SELECT * FROM t WHERE x ILIKE %s",
        )

    def test_scalar_max_min_become_greatest_least(self):
        out = _pg_xlate("UPDATE t SET c = MAX(0, favorite_count - 1) WHERE id = ?", True)
        self.assertIn("GREATEST(0, favorite_count - 1)", out)
        self.assertIn("WHERE id = %s", out)
        self.assertIn("LEAST(a, b)", _pg_xlate("SELECT MIN(a, b)", False))

    def test_aggregate_max_is_left_untouched(self):
        # 1-arg MAX(col) is an aggregate, not the scalar 2-arg form.
        self.assertEqual(_pg_xlate("SELECT MAX(col) FROM t", False), "SELECT MAX(col) FROM t")

    def test_insert_or_ignore_becomes_on_conflict_do_nothing(self):
        out = _pg_xlate("INSERT OR IGNORE INTO t (a) VALUES (?)", True)
        self.assertTrue(out.startswith("INSERT INTO t"))
        self.assertIn("ON CONFLICT DO NOTHING", out)
        self.assertIn("VALUES (%s)", out)

    def test_pragma_becomes_noop(self):
        self.assertEqual(_pg_xlate("PRAGMA foreign_keys = ON", False), "SELECT 1")

    def test_literal_percent_is_escaped_when_params_present(self):
        self.assertEqual(_pg_xlate("SELECT '%x%'", True), "SELECT '%%x%%'")

    def test_no_param_query_is_not_percent_mangled(self):
        # Without params psycopg2 does no % interpolation, so we must not escape.
        self.assertEqual(_pg_xlate("SELECT '100%' AS x", False), "SELECT '100%' AS x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
