#!/usr/bin/env python3
"""Regression tests for atomic JLPT exam start + wallet debit.

The contract keeps attempt creation, immutable price snapshot, ledger debit and
payment state in one transaction.  It also serializes starts per user/exam so
concurrent requests without an Idempotency-Key cannot create two paid attempts.

Run: ``python3 scripts/test_jlpt_exam_payment_atomic.py`` from ``web/``.
"""
from __future__ import annotations

import os
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_atomic_start_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402


class JLPTExamPaymentAtomicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        now = server.now_iso()
        self.user_id = str(uuid.uuid4())
        handle = "atomic" + uuid.uuid4().hex[:8]
        self.conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
            (self.user_id, handle, handle, f"{handle}@example.com", now, now, now),
        )
        self.question_ids = [
            dict(row)["id"]
            for row in self.conn.execute(
                "SELECT id FROM jlpt_questions WHERE level='N5' AND status='published' "
                "AND review_status='approved' ORDER BY id LIMIT 3"
            ).fetchall()
        ]
        self.assertEqual(3, len(self.question_ids))
        self.exam_id = "atomic-" + uuid.uuid4().hex[:12]
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.exam_id,
                "level": "N5",
                "title": "Atomic paid start",
                "kind": "mock",
                "status": "published",
                "coinCost": 100,
                "questionIds": self.question_ids,
            },
            now=now,
        )
        self.conn.commit()
        self.exam = jlpt.get_exam(self.conn, self.exam_id)

    def tearDown(self) -> None:
        self.conn.close()

    def _credit(self, amount: int = 1_000) -> None:
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "topup",
            amount,
            source_type="test_fixture",
            idempotency_key=f"atomic-credit:{self.user_id}",
        )

    def _start(self, *, key: str = "", member: bool = False, conn=None):
        return server.start_jlpt_exam_atomic(
            conn or self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=member,
            request_key=key,
            now=server.now_iso(),
        )

    def _handler_start(self, *, key: str = "") -> dict:
        handler = server.Handler.__new__(server.Handler)
        captured: dict = {}
        handler.send_json = (  # type: ignore[method-assign]
            lambda data, status=200: captured.update(data=data, status=status)
        )
        handler.current_session = (  # type: ignore[method-assign]
            lambda _conn: {"user_id": self.user_id}
        )
        handler.read_json = lambda: {"examId": self.exam_id}  # type: ignore[method-assign]
        handler.headers = {"Idempotency-Key": key} if key else {}
        handler.client_address = ("127.0.0.1", 0)
        handler.api_guide_jlpt_exam_start(self.conn)
        return captured

    def test_paid_start_persists_attempt_price_ledger_and_payment_together(self) -> None:
        self._credit()
        result = self._start(key="paid-start-1")
        self.assertEqual("started", result["status"])
        started = result["exam"]
        self.assertFalse(started["resumed"])
        self.assertEqual(100, started["coinCharged"])
        self.assertEqual("paid", started["paymentStatus"])
        self.assertEqual(900, started["coinBalance"])
        self.assertEqual(
            {"baseCoins": 100, "chargedCoins": 100, "pricingTier": "standard"},
            started["priceSnapshot"],
        )

        session = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?", (started["sessionId"],)
            ).fetchone()
        )
        self.assertEqual(100, session["base_coin_cost_snapshot"])
        self.assertEqual(100, session["charged_coin_cost"])
        self.assertEqual("standard", session["pricing_tier"])
        self.assertEqual("paid", session["payment_status"])
        self.assertTrue(session["wallet_ledger_entry_id"])
        self.assertTrue(session["start_request_key"])
        ledger = dict(
            self.conn.execute(
                "SELECT * FROM wallet_ledger_entries WHERE id=?",
                (session["wallet_ledger_entry_id"],),
            ).fetchone()
        )
        self.assertEqual(-100, ledger["points_delta"])
        self.assertEqual(started["sessionId"], ledger["source_order_id"])

    def test_http_handler_uses_the_atomic_contract_and_records_header_key(self) -> None:
        self._credit()
        response = self._handler_start(key="http-start")
        self.assertEqual(200, response["status"])
        self.assertEqual("paid", response["data"]["paymentStatus"])
        self.assertTrue(response["data"]["startIdempotencyRecorded"])
        self.assertEqual(100, response["data"]["priceSnapshot"]["chargedCoins"])
        session = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?",
                (response["data"]["sessionId"],),
            ).fetchone()
        )
        self.assertNotEqual("http-start", session["start_request_key"])
        self.assertEqual(64, len(session["start_request_key"]))

    def test_same_or_different_retry_resumes_one_session_without_double_debit(self) -> None:
        self._credit()
        first = self._start(key="retry-key")["exam"]
        same_key = self._start(key="retry-key")["exam"]
        different_key = self._start(key="another-key")["exam"]
        self.assertEqual(first["sessionId"], same_key["sessionId"])
        self.assertEqual(first["sessionId"], different_key["sessionId"])
        self.assertTrue(same_key["resumed"])
        self.assertTrue(different_key["resumed"])
        self.assertEqual("paid", same_key["paymentStatus"])
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        debits = self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
            "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
            (self.user_id,),
        ).fetchone()["c"]
        self.assertEqual(1, debits)
        active = self.conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_exam_sessions "
            "WHERE user_id=? AND exam_id=? AND status='in_progress'",
            (self.user_id, self.exam_id),
        ).fetchone()["c"]
        self.assertEqual(1, active)

    def test_resume_alias_key_remains_bound_after_submit_and_never_recharges(self) -> None:
        self._credit()
        first = self._start(key="original-key")["exam"]
        alias = self._start(key="resume-alias")["exam"]
        self.assertEqual(first["sessionId"], alias["sessionId"])
        self.assertTrue(alias["startIdempotencyRecorded"])

        self.conn.execute("BEGIN IMMEDIATE")
        session = jlpt.get_session(
            self.conn, session_id=first["sessionId"], user_id=self.user_id
        )
        result = jlpt.submit_exam_session(
            self.conn, session=session, exam=self.exam, now=server.now_iso()
        )
        self.assertIsNotNone(result)
        self.conn.commit()

        replay = self._start(key="resume-alias")
        self.assertEqual("already_completed", replay["status"])
        self.assertEqual(first["sessionId"], replay["sessionId"])
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchone()["c"],
        )
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_same_idempotency_key_after_deadline_settles_original_without_new_charge(self) -> None:
        self._credit()
        self.conn.execute(
            "UPDATE jlpt_exams SET duration_seconds=1 WHERE id=?", (self.exam_id,)
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        first = server.start_jlpt_exam_atomic(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            request_key="deadline-retry",
            now="2026-01-01T00:00:00+00:00",
        )["exam"]
        replay = server.start_jlpt_exam_atomic(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            request_key="deadline-retry",
            now="2026-01-01T00:00:10+00:00",
        )
        self.assertEqual("already_completed", replay["status"])
        self.assertEqual(first["sessionId"], replay["sessionId"])
        rows = [
            dict(row)
            for row in self.conn.execute(
                "SELECT id, status FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchall()
        ]
        self.assertEqual([{"id": first["sessionId"], "status": "submitted"}], rows)
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_timed_out_grading_failure_rolls_back_auto_finalize_and_new_start(self) -> None:
        self._credit()
        self.conn.execute(
            "UPDATE jlpt_exams SET duration_seconds=1 WHERE id=?", (self.exam_id,)
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        first = server.start_jlpt_exam_atomic(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            request_key="timeout-original",
            now="2026-01-01T00:00:00+00:00",
        )["exam"]
        self.conn.execute(
            "CREATE TRIGGER fail_timed_out_grade BEFORE UPDATE OF total, correct, score "
            "ON jlpt_exam_sessions WHEN OLD.id='" + first["sessionId"] + "' "
            "BEGIN SELECT RAISE(ABORT, 'forced grading failure'); END"
        )
        try:
            with self.assertRaises(Exception):
                server.start_jlpt_exam_atomic(
                    self.conn,
                    user_id=self.user_id,
                    exam=self.exam,
                    is_member=False,
                    request_key="timeout-new-key",
                    now="2026-01-01T00:00:10+00:00",
                )
        finally:
            self.conn.execute("DROP TRIGGER fail_timed_out_grade")
        row = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?", (first["sessionId"],)
            ).fetchone()
        )
        self.assertEqual("in_progress", row["status"])
        self.assertEqual("", row["submitted_at"])
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchone()["c"],
        )

    def test_membership_hint_cannot_forge_discount(self) -> None:
        self._credit()
        started = self._start(key="forged-member", member=True)["exam"]
        self.assertEqual(100, started["coinCharged"])
        self.assertEqual("standard", started["priceSnapshot"]["pricingTier"])

    def test_authoritative_membership_overrides_stale_nonmember_hint(self) -> None:
        self._credit()
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        started = self._start(key="real-member", member=False)["exam"]
        self.assertEqual(50, started["coinCharged"])
        self.assertEqual("member", started["priceSnapshot"]["pricingTier"])

    def test_expired_membership_does_not_lock_an_already_paid_active_attempt(self) -> None:
        self._credit()
        self.conn.execute(
            "UPDATE jlpt_exams SET is_member_only=1 WHERE id=?", (self.exam_id,)
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        first = self._start(key="member-only-first")["exam"]

        self.conn.execute(
            "UPDATE user_memberships SET status='expired', current_period_end=?, "
            "expires_at=?, updated_at=? WHERE user_id=?",
            (
                "2020-01-01T00:00:00+00:00",
                "2020-01-01T00:00:00+00:00",
                server.now_iso(),
                self.user_id,
            ),
        )
        resumed = self._start(key="member-only-resume")
        self.assertEqual("started", resumed["status"])
        self.assertEqual(first["sessionId"], resumed["exam"]["sessionId"])
        self.assertTrue(resumed["exam"]["resumed"])
        self.assertEqual(950, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])

    def test_submit_racing_expired_member_resume_cannot_open_fresh_member_attempt(self) -> None:
        self._credit()
        self.conn.execute(
            "UPDATE jlpt_exams SET is_member_only=1 WHERE id=?", (self.exam_id,)
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        first = self._start(key="member-race-first")["exam"]
        self.conn.execute(
            "UPDATE user_memberships SET status='expired', current_period_end=?, "
            "expires_at=?, updated_at=? WHERE user_id=?",
            (
                "2020-01-01T00:00:00+00:00",
                "2020-01-01T00:00:00+00:00",
                server.now_iso(),
                self.user_id,
            ),
        )

        original_start = jlpt.start_exam_session

        def submit_then_start(connection, **kwargs):
            connection.execute(
                "UPDATE jlpt_exam_sessions SET status='submitted', submitted_at=? "
                "WHERE id=? AND status='in_progress'",
                (server.now_iso(), first["sessionId"]),
            )
            return original_start(connection, **kwargs)

        jlpt.start_exam_session = submit_then_start
        try:
            raced = self._start(key="member-race-second")
        finally:
            jlpt.start_exam_session = original_start

        self.assertEqual("member_required", raced["status"])
        self.assertEqual(
            950,
            server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"],
        )
        rows = self.conn.execute(
            "SELECT id, status FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
            (self.user_id, self.exam_id),
        ).fetchall()
        self.assertEqual(
            [(first["sessionId"], "submitted")],
            [(r["id"], r["status"]) for r in rows],
        )

    def test_insufficient_balance_leaves_no_session_or_debit(self) -> None:
        result = self._start(key="insufficient")
        self.assertEqual("insufficient", result["status"])
        self.assertEqual(100, result["requiredCoins"])
        self.assertEqual(0, result["balance"])
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchone()["c"],
        )
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam'",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_failure_after_debit_rolls_back_session_ledger_and_balance(self) -> None:
        self._credit()
        before = server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"]
        before_entries = self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id=?",
            (self.user_id,),
        ).fetchone()["c"]
        self.conn.execute(
            "CREATE TRIGGER fail_atomic_start BEFORE UPDATE OF payment_status "
            "ON jlpt_exam_sessions WHEN NEW.payment_status='paid' "
            "BEGIN SELECT RAISE(ABORT, 'forced post-debit failure'); END"
        )
        try:
            with self.assertRaises(Exception):
                self._start(key="forced-failure")
        finally:
            self.conn.execute("DROP TRIGGER fail_atomic_start")

        self.assertEqual(before, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            before_entries,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id=?",
                (self.user_id,),
            ).fetchone()["c"],
        )
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchone()["c"],
        )

    def test_member_price_is_snapshotted_and_free_exam_has_no_ledger(self) -> None:
        self._credit()
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        paid = self._start(key="member", member=True)["exam"]
        self.assertEqual(50, paid["coinCharged"])
        self.assertEqual("member", paid["priceSnapshot"]["pricingTier"])

        free_exam_id = "free-" + uuid.uuid4().hex[:12]
        jlpt.upsert_exam(
            self.conn,
            {
                "id": free_exam_id,
                "level": "N5",
                "title": "Free exam",
                "kind": "mock",
                "status": "published",
                "coinCost": 0,
                "questionIds": self.question_ids,
            },
            now=server.now_iso(),
        )
        free_exam = jlpt.get_exam(self.conn, free_exam_id)
        free = server.start_jlpt_exam_atomic(
            self.conn,
            user_id=self.user_id,
            exam=free_exam,
            is_member=False,
            request_key="free",
            now=server.now_iso(),
        )["exam"]
        self.assertEqual(0, free["coinCharged"])
        self.assertEqual("not_required", free["paymentStatus"])
        self.assertEqual("free", free["priceSnapshot"]["pricingTier"])
        row = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?", (free["sessionId"],)
            ).fetchone()
        )
        self.assertEqual("", row["wallet_ledger_entry_id"])

    def test_two_concurrent_starts_create_one_paid_attempt(self) -> None:
        self._credit()
        self.conn.close()
        barrier = threading.Barrier(2)

        def run(key: str) -> str:
            conn = server.db()
            try:
                barrier.wait(timeout=5)
                result = self._start(key=key, conn=conn)
                return result["exam"]["sessionId"]
            finally:
                conn.close()

        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                ids = list(pool.map(run, ("concurrent-a", "concurrent-b")))
        finally:
            self.conn = server.db()
        self.assertEqual(1, len(set(ids)))
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.exam_id),
            ).fetchone()["c"],
        )
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
                (self.user_id,),
            ).fetchone()["c"],
        )


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        try:
            os.unlink(_TMP_DB)
        except FileNotFoundError:
            pass
