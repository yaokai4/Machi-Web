#!/usr/bin/env python3
"""Regression tests for PAY-01 JLPT exam price persistence.

The suite exercises the real SQLite startup path, the v119/v120 upgrade paths,
the admin exam-upsert handler, and the PostgreSQL migration adapter contract.
It never opens the configured application database.

Run:  python3 scripts/test_jlpt_payment_hardening.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
import uuid
from pathlib import Path


_TMP_DIR = tempfile.TemporaryDirectory(prefix="machi-jlpt-payment-test-")
os.environ["KAIX_DB_PATH"] = str(Path(_TMP_DIR.name) / "fresh.db")
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402
import jlpt_seed  # noqa: E402


EXPECTED_MOCK_V1_COSTS = {
    "N5": 100,
    "N4": 150,
    "N3": 250,
    "N2": 350,
    "N1": 400,
}


def _migration_sql(version: int) -> str:
    return next((sql for v, _note, sql in server.MIGRATIONS if v == version), "")


def _mock_v1_rows(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        str(row["level"]): int(row["coin_cost"])
        for row in conn.execute(
            "SELECT level, coin_cost FROM jlpt_exams "
            "WHERE id LIKE 'mockv1-%' ORDER BY level"
        )
    }


def _make_admin(conn: sqlite3.Connection) -> str:
    uid = str(uuid.uuid4())
    handle = "payadmin_" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, "
        "joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'x', 'admin', ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", now, now, now),
    )
    return uid


def _admin_upsert(conn: sqlite3.Connection, admin_id: str, exam: dict) -> dict:
    handler = server.Handler.__new__(server.Handler)
    captured: dict = {}
    handler.send_json = (  # type: ignore[method-assign]
        lambda data, status=200: captured.update(data=data, status=status)
    )
    handler.current_session = (  # type: ignore[method-assign]
        lambda _conn: {"user_id": admin_id}
    )
    handler.read_json = lambda: {"exam": exam}  # type: ignore[method-assign]
    handler.headers = {}
    handler.client_address = ("127.0.0.1", 0)
    handler.api_admin_jlpt_exam_upsert(conn)
    return captured


class JlptPaymentHardeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()
        cls.conn = server.db()
        cls.admin_id = _make_admin(cls.conn)
        cls.conn.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        _TMP_DIR.cleanup()

    def test_fresh_database_seeds_all_five_mock_prices(self) -> None:
        self.assertEqual(_mock_v1_rows(self.conn), EXPECTED_MOCK_V1_COSTS)

    def test_fingerprint_reinstall_preserves_an_existing_admin_price(self) -> None:
        exam_id = "mockv1-n2"
        self.conn.execute(
            "UPDATE jlpt_exams SET coin_cost = 777 WHERE id = ?", (exam_id,)
        )
        self.conn.execute(
            "UPDATE jlpt_questions SET tags = 'stale-fingerprint' "
            "WHERE id = 'mockv1-bank-fingerprint'"
        )
        self.conn.commit()
        try:
            result = jlpt_seed.ensure_jlpt_mock_v1(self.conn)
            self.conn.commit()
            self.assertTrue(result.get("installed"), result)
            self.assertFalse(result.get("skipped"), result)
            price = self.conn.execute(
                "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
            ).fetchone()["coin_cost"]
            self.assertEqual(
                price,
                777,
                "a bank content refresh must not overwrite an existing admin price",
            )
        finally:
            self.conn.execute(
                "UPDATE jlpt_exams SET coin_cost = ? WHERE id = ?",
                (EXPECTED_MOCK_V1_COSTS["N2"], exam_id),
            )
            self.conn.commit()

    def test_admin_upsert_distinguishes_omitted_price_from_explicit_zero(self) -> None:
        exam_id = "pay01-admin-upsert"
        base = {
            "id": exam_id,
            "level": "N2",
            "title": "PAY-01 price contract",
            "kind": "mock",
            "section": "",
            "questionCount": 20,
            "durationSeconds": 3600,
            "passScore": 60,
            "isMemberOnly": False,
            "status": "published",
            "sortOrder": 9000,
            "scoreMode": "percent",
            "parentExamId": "",
            "coinCost": 350,
        }
        response = _admin_upsert(self.conn, self.admin_id, base)
        self.assertEqual(response.get("status"), 200, response)

        without_price = dict(base)
        without_price.pop("coinCost")
        without_price["title"] = "PAY-01 title-only update"
        response = _admin_upsert(self.conn, self.admin_id, without_price)
        self.assertEqual(response.get("status"), 200, response)
        preserved = self.conn.execute(
            "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
        ).fetchone()["coin_cost"]
        self.assertEqual(preserved, 350, "omitting coinCost must preserve the stored price")

        explicit_free = dict(without_price)
        explicit_free["coinCost"] = 0
        response = _admin_upsert(self.conn, self.admin_id, explicit_free)
        self.assertEqual(response.get("status"), 200, response)
        cleared = self.conn.execute(
            "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
        ).fetchone()["coin_cost"]
        self.assertEqual(cleared, 0, "an explicit zero must make the exam free")

    def test_sqlite_v119_upgrade_backfills_existing_mock_rows(self) -> None:
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        try:
            conn.execute(
                "CREATE TABLE jlpt_exams (id TEXT PRIMARY KEY, level TEXT NOT NULL, "
                "kind TEXT NOT NULL)"
            )
            conn.executemany(
                "INSERT INTO jlpt_exams (id, level, kind) VALUES (?, ?, 'mock')",
                [(f"mockv1-{level.lower()}", level) for level in EXPECTED_MOCK_V1_COSTS],
            )
            conn.execute(
                "INSERT INTO jlpt_exams (id, level, kind) VALUES "
                "('custom-free-n1', 'N1', 'mock')"
            )
            conn.executescript(_migration_sql(120))
            self.assertEqual(_mock_v1_rows(conn), EXPECTED_MOCK_V1_COSTS)
            self.assertEqual(
                conn.execute(
                    "SELECT coin_cost FROM jlpt_exams WHERE id='custom-free-n1'"
                ).fetchone()["coin_cost"],
                0,
            )
        finally:
            conn.close()

    def test_sqlite_v120_upgrade_repairs_pre_fix_fresh_database(self) -> None:
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        try:
            conn.execute(
                "CREATE TABLE jlpt_exams (id TEXT PRIMARY KEY, level TEXT NOT NULL, "
                "kind TEXT NOT NULL, coin_cost INTEGER NOT NULL DEFAULT 0)"
            )
            conn.executemany(
                "INSERT INTO jlpt_exams (id, level, kind, coin_cost) VALUES (?, ?, 'mock', 0)",
                [(f"mockv1-{level.lower()}", level) for level in EXPECTED_MOCK_V1_COSTS],
            )
            conn.execute(
                "INSERT INTO jlpt_exams (id, level, kind, coin_cost) VALUES "
                "('custom-free-n1', 'N1', 'mock', 0)"
            )
            repair_sql = _migration_sql(121)
            conn.executescript(repair_sql or "SELECT 1;")
            self.assertEqual(_mock_v1_rows(conn), EXPECTED_MOCK_V1_COSTS)
            self.assertEqual(
                conn.execute(
                    "SELECT coin_cost FROM jlpt_exams WHERE id='custom-free-n1'"
                ).fetchone()["coin_cost"],
                0,
                "the repair must not price unrelated free exams",
            )
        finally:
            conn.close()

    def test_postgres_adapter_accepts_the_repair_migration_contract(self) -> None:
        repair_sql = _migration_sql(121)
        self.assertTrue(repair_sql, "PAY-01 repair migration is missing")
        translated = server._pg_xlate(repair_sql, False)
        self.assertNotIn("PRAGMA", translated.upper())
        self.assertNotIn("INSERT OR", translated.upper())
        self.assertNotIn("?", translated)
        for level, cost in EXPECTED_MOCK_V1_COSTS.items():
            self.assertIn(f"WHEN '{level}' THEN {cost}", translated)

        class Cursor:
            executed = ""

            def execute(self, sql: str) -> None:
                self.executed = sql

        class Connection:
            cursor_instance = Cursor()

            def cursor(self) -> Cursor:
                return self.cursor_instance

        class Psycopg:
            class IntegrityError(Exception):
                pass

            class OperationalError(Exception):
                pass

            class DatabaseError(Exception):
                pass

        pg_conn = object.__new__(server._PgConn)
        pg_conn._c = Connection()
        pg_conn._psycopg2 = Psycopg()
        cursor = pg_conn.executescript(repair_sql)
        self.assertIs(cursor, pg_conn._c.cursor_instance)
        self.assertEqual(cursor.executed, translated)


if __name__ == "__main__":
    unittest.main(verbosity=2)
