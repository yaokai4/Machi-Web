#!/usr/bin/env python3
"""Regression tests for PAY-01 JLPT exam price persistence.

The suite exercises the real SQLite startup path, the v119/v120 upgrade paths,
the admin exam-upsert handler, and the PostgreSQL migration adapter contract.
It never opens the configured application database.

Run:  python3 scripts/test_jlpt_payment_hardening.py
"""
from __future__ import annotations

import json
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
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402
import jlpt_seed  # noqa: E402
import repair_jlpt_mock_prices as price_repair  # noqa: E402


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


def _legacy_v120_connection() -> sqlite3.Connection:
    """A pre-fix fresh DB: migration 120 ran before mockv1 seed insertion."""
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute(
        "CREATE TABLE jlpt_exams (id TEXT PRIMARY KEY, level TEXT NOT NULL, "
        "kind TEXT NOT NULL, coin_cost INTEGER NOT NULL DEFAULT 0)"
    )
    conn.executemany(
        "INSERT INTO jlpt_exams (id, level, kind, coin_cost) VALUES (?, ?, 'mock', 0)",
        [(f"mockv1-{level.lower()}", level) for level in EXPECTED_MOCK_V1_COSTS],
    )
    conn.executemany(
        "INSERT INTO jlpt_exams (id, level, kind, coin_cost) VALUES (?, ?, ?, ?)",
        [
            ("custom-free-n1", "N1", "mock", 0),
            ("mockv1-n5-copy", "N5", "mock", 0),
            ("mockv1-n3-section", "N3", "section", 0),
        ],
    )
    return conn


def _admin_upsert(conn: sqlite3.Connection, admin_id: str, exam: dict) -> dict:
    handler = server.Handler.__new__(server.Handler)
    captured: dict = {}
    handler.send_json = (  # type: ignore[method-assign]
        lambda data, status=200: captured.update(data=data, status=status)
    )
    handler.send_error_json = (  # type: ignore[method-assign]
        lambda message, status=400, code="bad_request", detail=None: captured.update(
            data={"error": {"message": message, "code": code, "detail": detail}},
            status=status,
        )
    )
    handler.current_session = (  # type: ignore[method-assign]
        lambda _conn: {"user_id": admin_id}
    )
    handler.read_json = lambda: {"exam": exam}  # type: ignore[method-assign]
    handler.headers = {}
    handler.client_address = ("127.0.0.1", 0)
    try:
        handler.api_admin_jlpt_exam_upsert(conn)
    except Exception as exc:
        # Direct method invocation bypasses Handler._dispatch(), whose generic
        # exception boundary would turn this into HTTP 500. Preserve that
        # distinction so invalid inputs fail as 500-vs-400, not as a test error.
        captured.update(
            data={"error": {"message": f"{type(exc).__name__}: {exc}", "code": "server_error"}},
            status=500,
        )
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

        null_price = dict(without_price)
        null_price["coinCost"] = None
        null_price["title"] = "PAY-01 null-price update"
        response = _admin_upsert(self.conn, self.admin_id, null_price)
        self.assertEqual(response.get("status"), 200, response)
        preserved = self.conn.execute(
            "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
        ).fetchone()["coin_cost"]
        self.assertEqual(preserved, 350, "coinCost: null must behave like omission")

        explicit_free = dict(without_price)
        explicit_free["coinCost"] = 0
        response = _admin_upsert(self.conn, self.admin_id, explicit_free)
        self.assertEqual(response.get("status"), 200, response)
        cleared = self.conn.execute(
            "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
        ).fetchone()["coin_cost"]
        self.assertEqual(cleared, 0, "an explicit zero must make the exam free")

    def test_admin_upsert_rejects_non_numeric_or_non_finite_prices(self) -> None:
        exam_id = "pay01-invalid-price"
        base = {
            "id": exam_id,
            "level": "N2",
            "title": "PAY-01 strict price contract",
            "kind": "mock",
            "questionCount": 20,
            "coinCost": 350,
        }
        response = _admin_upsert(self.conn, self.admin_id, base)
        self.assertEqual(response.get("status"), 200, response)

        for invalid in ("0", "free", float("nan"), float("inf"), True, False):
            with self.subTest(invalid=repr(invalid)):
                payload = dict(base)
                payload["coinCost"] = invalid
                response = _admin_upsert(self.conn, self.admin_id, payload)
                self.assertEqual(response.get("status"), 400, response)
                stored = self.conn.execute(
                    "SELECT coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
                ).fetchone()["coin_cost"]
                self.assertEqual(stored, 350, "invalid input must not alter the stored price")

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

    def test_automatic_repair_migration_121_is_absent(self) -> None:
        self.assertEqual(
            _migration_sql(121),
            "",
            "unknown-provenance zero prices must never be changed by startup migration",
        )

    def test_legacy_v120_repair_defaults_to_a_read_only_dry_run(self) -> None:
        conn = _legacy_v120_connection()
        try:
            before = [tuple(row) for row in conn.execute(
                "SELECT id, level, kind, coin_cost FROM jlpt_exams ORDER BY id"
            )]
            report = price_repair.repair_mock_prices(conn)
            after = [tuple(row) for row in conn.execute(
                "SELECT id, level, kind, coin_cost FROM jlpt_exams ORDER BY id"
            )]
            self.assertEqual(before, after, "dry-run must not write any exam row")
            self.assertEqual(report["status"], "dry-run")
            self.assertEqual(
                {item["id"] for item in report["candidates"]},
                {f"mockv1-{level.lower()}" for level in EXPECTED_MOCK_V1_COSTS},
            )
            self.assertEqual(report["changes"], [])
            self.assertIn("PostgreSQL", report["evidenceLimit"])
            audit_table = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' "
                "AND name='jlpt_price_repair_audit'"
            ).fetchone()
            self.assertIsNone(audit_table, "dry-run must not create an audit table")
        finally:
            conn.close()

    def test_explicit_repair_changes_only_confirmed_candidates_and_records_rollback(self) -> None:
        conn = _legacy_v120_connection()
        try:
            conn.execute(
                "UPDATE jlpt_exams SET coin_cost=777 WHERE id='mockv1-n4'"
            )
            confirmed = ["mockv1-n5", "mockv1-n2"]
            report = price_repair.repair_mock_prices(
                conn,
                apply=True,
                confirmed_ids=confirmed,
                confirmation=price_repair.confirmation_phrase(confirmed),
            )
            self.assertEqual(report["status"], "applied")
            self.assertEqual(
                {row["id"] for row in report["changes"]}, set(confirmed)
            )
            prices = {
                row["id"]: row["coin_cost"]
                for row in conn.execute("SELECT id, coin_cost FROM jlpt_exams")
            }
            self.assertEqual(prices["mockv1-n5"], 100)
            self.assertEqual(prices["mockv1-n2"], 350)
            self.assertEqual(prices["mockv1-n3"], 0, "unconfirmed candidate changed")
            self.assertEqual(prices["mockv1-n1"], 0, "unconfirmed candidate changed")
            self.assertEqual(prices["mockv1-n4"], 777, "non-zero price changed")
            self.assertEqual(prices["custom-free-n1"], 0, "non-canonical free exam changed")
            self.assertEqual(prices["mockv1-n5-copy"], 0, "lookalike exam changed")

            audit_rows = [dict(row) for row in conn.execute(
                "SELECT * FROM jlpt_price_repair_audit WHERE run_id=? ORDER BY exam_id",
                (report["runId"],),
            )]
            self.assertEqual(len(audit_rows), 2)
            self.assertEqual(
                {(row["before_coin_cost"], row["after_coin_cost"]) for row in audit_rows},
                {(0, 100), (0, 350)},
            )
            for row in audit_rows:
                rollback = json.loads(row["rollback_json"])
                self.assertEqual(rollback["params"][0], 0)
                self.assertEqual(rollback["params"][1], row["exam_id"])
        finally:
            conn.close()

    def test_repair_cancellation_or_invalid_candidate_never_writes(self) -> None:
        conn = _legacy_v120_connection()
        try:
            before = [tuple(row) for row in conn.execute(
                "SELECT id, coin_cost FROM jlpt_exams ORDER BY id"
            )]
            cancelled = price_repair.repair_mock_prices(
                conn,
                apply=True,
                confirmed_ids=["mockv1-n5"],
                confirmation="CANCEL",
            )
            self.assertEqual(cancelled["status"], "cancelled")

            invalid_ids = ["custom-free-n1"]
            refused = price_repair.repair_mock_prices(
                conn,
                apply=True,
                confirmed_ids=invalid_ids,
                confirmation=price_repair.confirmation_phrase(invalid_ids),
            )
            self.assertEqual(refused["status"], "refused")
            after = [tuple(row) for row in conn.execute(
                "SELECT id, coin_cost FROM jlpt_exams ORDER BY id"
            )]
            self.assertEqual(before, after)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
