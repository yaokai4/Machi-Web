#!/usr/bin/env python3
"""Regression tests for one-payment, resumable JLPT full-paper attempts."""

from __future__ import annotations

import os
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_paper_attempt_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402


class JLPTPaperAttemptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        now = server.now_iso()
        self.user_id = str(uuid.uuid4())
        handle = "paper" + uuid.uuid4().hex[:8]
        self.conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
            (self.user_id, handle, handle, f"{handle}@example.com", now, now, now),
        )
        question_ids = [
            dict(row)["id"]
            for row in self.conn.execute(
                "SELECT id FROM jlpt_questions WHERE level='N5' AND status='published' "
                "AND review_status='approved' ORDER BY id LIMIT 3"
            ).fetchall()
        ]
        self.assertEqual(3, len(question_ids))
        suffix = uuid.uuid4().hex[:10]
        self.paper_id = "paper-" + suffix
        self.written_id = "paper-written-" + suffix
        self.listening_id = "paper-listening-" + suffix
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.paper_id,
                "level": "N5",
                "title": "N5 complete paper",
                "kind": "paper",
                "questionCount": 3,
                "coinCost": 0,
                "status": "published",
            },
            now=now,
        )
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.written_id,
                "level": "N5",
                "title": "Written",
                "kind": "section",
                "durationSeconds": 3600,
                "coinCost": 100,
                "parentExamId": self.paper_id,
                "sortOrder": 0,
                "questionIds": question_ids[:2],
                "status": "published",
            },
            now=now,
        )
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.listening_id,
                "level": "N5",
                "title": "Listening",
                "kind": "section",
                "section": "listening",
                "durationSeconds": 1800,
                "coinCost": 0,
                "parentExamId": self.paper_id,
                "sortOrder": 1,
                "questionIds": question_ids[2:],
                "status": "published",
            },
            now=now,
        )
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()

    def _credit(self, amount: int = 1_000) -> None:
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "topup",
            amount,
            source_type="test_fixture",
            idempotency_key=f"paper-credit:{self.user_id}",
        )

    def _start(
        self,
        exam_id: str,
        key: str = "",
        *,
        confirmed_charge_coins: int | None = None,
        conn=None,
    ) -> dict:
        connection = conn or self.conn
        return server.start_jlpt_exam_atomic(
            connection,
            user_id=self.user_id,
            exam=jlpt.get_exam(connection, exam_id),
            request_key=key,
            now=server.now_iso(),
            confirmed_charge_coins=confirmed_charge_coins,
        )

    def _submit(self, session_id: str) -> tuple[dict, dict]:
        session = jlpt.get_session(
            self.conn, session_id=session_id, user_id=self.user_id
        )
        server.lock_jlpt_paper_attempt_for_submit(
            self.conn,
            session=session,
            user_id=self.user_id,
            now=server.now_iso(),
        )
        exam = jlpt.get_exam(self.conn, session["exam_id"])
        result = jlpt.submit_exam_session(
            self.conn, session=session, exam=exam, now=server.now_iso()
        )
        self.assertIsNotNone(result)
        progress = server.sync_jlpt_paper_attempt_after_submit(
            self.conn, session_id=session_id, user_id=self.user_id, now=server.now_iso()
        )
        self.conn.commit()
        return result, progress

    def test_first_section_creates_paid_parent_attempt_and_links_session(self) -> None:
        self._credit()
        outcome = self._start(self.written_id, "paper-first")
        self.assertEqual("started", outcome["status"])
        exam = outcome["exam"]
        paper = exam["paperAttempt"]
        self.assertEqual(self.paper_id, paper["paperExamId"])
        self.assertEqual(self.written_id, paper["currentSectionExamId"])
        self.assertEqual(0, paper["currentSectionIndex"])
        self.assertEqual(2, paper["sectionCount"])
        self.assertEqual(100, paper["baseCoinCost"])
        self.assertEqual(100, paper["chargedCoinCost"])
        self.assertEqual("paid", paper["paymentStatus"])
        self.assertEqual("coin_per_attempt", paper["unlockSource"])
        self.assertEqual(900, exam["coinBalance"])

        session = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?", (exam["sessionId"],)
            ).fetchone()
        )
        self.assertEqual(paper["id"], session["paper_attempt_id"])
        rows = self.conn.execute(
            "SELECT * FROM jlpt_paper_section_attempts WHERE paper_attempt_id=? ORDER BY sort_order",
            (paper["id"],),
        ).fetchall()
        self.assertEqual(2, len(rows))
        self.assertEqual(exam["sessionId"], dict(rows[0])["session_id"])
        self.assertEqual("in_progress", dict(rows[0])["status"])
        self.assertEqual("pending", dict(rows[1])["status"])

    def test_lost_parent_start_response_replays_same_confirmed_price(self) -> None:
        self._credit()
        first = self._start(
            self.paper_id,
            "lost-parent-response",
            confirmed_charge_coins=100,
        )
        replay = self._start(
            self.paper_id,
            "lost-parent-response",
            confirmed_charge_coins=100,
        )

        self.assertEqual("started", first["status"])
        self.assertEqual("started", replay["status"])
        self.assertEqual(first["exam"]["sessionId"], replay["exam"]["sessionId"])
        self.assertEqual(
            first["exam"]["paperAttempt"]["id"],
            replay["exam"]["paperAttempt"]["id"],
        )
        self.assertTrue(replay["exam"]["resumed"])
        self.assertEqual(100, replay["exam"]["coinCharged"])
        self.assertEqual(
            900,
            server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"],
        )
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
                (self.user_id,),
            ).fetchone()["c"],
        )
    def test_later_section_reuses_entitlement_and_refresh_resumes(self) -> None:
        self._credit()
        first = self._start(self.written_id, "paper-first")["exam"]
        paper_id = first["paperAttempt"]["id"]
        self._submit(first["sessionId"])

        second = self._start(self.listening_id, "paper-second")["exam"]
        self.assertEqual(paper_id, second["paperAttempt"]["id"])
        self.assertEqual(1, second["paperAttempt"]["currentSectionIndex"])
        self.assertEqual(0, second["coinCharged"])
        self.assertEqual(100, second["paperAttempt"]["chargedCoinCost"])
        self.assertEqual(900, second["coinBalance"])

        resumed = self._start(self.paper_id, "paper-refresh")["exam"]
        self.assertTrue(resumed["resumed"])
        self.assertEqual(second["sessionId"], resumed["sessionId"])
        self.assertEqual(paper_id, resumed["paperAttempt"]["id"])
        self.assertEqual(900, resumed["coinBalance"])

    def test_direct_later_section_is_rejected_without_charge_or_attempt(self) -> None:
        self._credit()
        outcome = self._start(self.listening_id, "skip-written")
        self.assertEqual("section_out_of_order", outcome["status"])
        self.assertEqual(self.written_id, outcome["currentSectionExamId"])
        self.assertEqual(1_000, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_paper_attempts WHERE user_id=?",
                (self.user_id,),
            ).fetchone()["c"],
        )
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id=?",
                (self.user_id, self.written_id),
            ).fetchone()["c"],
        )

    def test_multiple_charging_sections_fail_closed(self) -> None:
        self._credit()
        self.conn.execute(
            "UPDATE jlpt_exams SET coin_cost=25 WHERE id=?", (self.listening_id,)
        )
        outcome = self._start(self.written_id, "bad-pricing")
        self.assertEqual("invalid_paper_pricing", outcome["status"])
        self.assertEqual(1_000, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=? AND exam_id IN (?, ?)",
                (self.user_id, self.written_id, self.listening_id),
            ).fetchone()["c"],
        )

    def test_paid_attempt_keeps_its_snapshot_when_live_section_price_changes(self) -> None:
        self._credit()
        first = self._start(self.written_id, "snapshot-first")["exam"]
        attempt_id = first["paperAttempt"]["id"]
        self.conn.execute(
            "UPDATE jlpt_exams SET coin_cost=25 WHERE id=?", (self.listening_id,)
        )
        self._submit(first["sessionId"])

        second = self._start(self.listening_id, "snapshot-second")
        self.assertEqual("started", second["status"])
        self.assertEqual(attempt_id, second["exam"]["paperAttempt"]["id"])
        self.assertEqual(100, second["exam"]["paperAttempt"]["baseCoinCost"])
        self.assertEqual(100, second["exam"]["paperAttempt"]["chargedCoinCost"])
        self.assertEqual(0, second["exam"]["coinCharged"])
        self.assertEqual(900, second["exam"]["coinBalance"])

    def test_submit_advances_and_completes_the_exact_parent_attempt(self) -> None:
        self._credit()
        first = self._start(self.paper_id, "paper-entry")["exam"]
        _, progress = self._submit(first["sessionId"])
        self.assertEqual("in_progress", progress["status"])
        self.assertEqual(self.listening_id, progress["currentSectionExamId"])
        self.assertEqual(1, progress["currentSectionIndex"])

        second = self._start(self.paper_id, "paper-next")["exam"]
        _, completed = self._submit(second["sessionId"])
        self.assertEqual("completed", completed["status"])
        self.assertEqual("", completed["currentSectionExamId"])
        self.assertEqual(2, completed["currentSectionIndex"])
        row = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_paper_attempts WHERE id=?",
                (completed["id"],),
            ).fetchone()
        )
        self.assertEqual("completed", row["status"])
        self.assertTrue(row["completed_at"])
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])

        exact_result = jlpt.paper_result(
            self.conn,
            user_id=self.user_id,
            paper_id=self.paper_id,
            paper_attempt_id=completed["id"],
        )
        self.assertIsNotNone(exact_result)
        self.assertTrue(exact_result["complete"])
        self.assertEqual(completed["id"], exact_result["paperAttemptId"])
        self.assertEqual("completed", exact_result["paperAttemptStatus"])
        self.assertEqual(
            [first["sessionId"], second["sessionId"]],
            [section["sessionId"] for section in exact_result["sections"]],
        )

        # A newer retry with only its written section submitted must not replace
        # or contaminate the latest complete result.
        retry = self._start(self.paper_id, "paper-retry")["exam"]
        retry_attempt_id = retry["paperAttempt"]["id"]
        self.assertNotEqual(completed["id"], retry_attempt_id)
        self._submit(retry["sessionId"])
        default_result = jlpt.paper_result(
            self.conn, user_id=self.user_id, paper_id=self.paper_id
        )
        self.assertEqual(completed["id"], default_result["paperAttemptId"])
        self.assertTrue(default_result["complete"])
        retry_result = jlpt.paper_result(
            self.conn,
            user_id=self.user_id,
            paper_id=self.paper_id,
            paper_attempt_id=retry_attempt_id,
        )
        self.assertEqual(retry_attempt_id, retry_result["paperAttemptId"])
        self.assertFalse(retry_result["complete"])
        self.assertEqual([True, False], [s["done"] for s in retry_result["sections"]])

    def test_failure_after_debit_rolls_back_parent_session_ledger_and_balance(self) -> None:
        self._credit()
        before_entries = self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id=?",
            (self.user_id,),
        ).fetchone()["c"]
        self.conn.execute(
            "CREATE TRIGGER fail_paper_payment BEFORE UPDATE OF payment_status "
            "ON jlpt_paper_attempts WHEN NEW.payment_status='paid' "
            "BEGIN SELECT RAISE(ABORT, 'forced parent finalize failure'); END"
        )
        try:
            with self.assertRaises(Exception):
                self._start(self.written_id, "paper-fault")
        finally:
            self.conn.execute("DROP TRIGGER fail_paper_payment")

        self.assertEqual(1_000, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
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
                "SELECT COUNT(*) AS c FROM jlpt_paper_attempts WHERE user_id=?",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_parent_attempt_refund_is_exact_idempotent_and_audited(self) -> None:
        self._credit()
        first = self._start(self.paper_id, "refund-start")["exam"]
        attempt_id = first["paperAttempt"]["id"]
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "spend",
            -900,
            source_type="test_fixture",
            idempotency_key=f"drain-after-jlpt:{attempt_id}",
        )
        self.assertEqual(
            0, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"]
        )

        refunded = server.refund_jlpt_paper_attempt_atomic(
            self.conn,
            attempt_id=attempt_id,
            reason="forced media outage",
            actor="support-test",
        )
        self.assertTrue(refunded["applied"])
        self.assertEqual("refunded", refunded["status"])
        self.assertEqual(100, refunded["wallet"]["balancePoints"])
        refund_row = dict(
            self.conn.execute(
                "SELECT * FROM wallet_ledger_entries WHERE id=?",
                (refunded["refundLedgerEntryId"],),
            ).fetchone()
        )
        self.assertEqual("refund_credit", refund_row["entry_type"])
        self.assertEqual(100, refund_row["points_delta"])
        self.assertEqual("jlpt_paper_refund", refund_row["source_type"])
        self.assertEqual(attempt_id, refund_row["source_order_id"])
        attempt = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_paper_attempts WHERE id=?", (attempt_id,)
            ).fetchone()
        )
        self.assertEqual("refunded", attempt["status"])
        self.assertEqual("refunded", attempt["payment_status"])
        self.assertEqual("forced media outage", attempt["refund_reason"])
        session = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=?", (first["sessionId"],)
            ).fetchone()
        )
        self.assertEqual("cancelled", session["status"])

        duplicate = server.refund_jlpt_paper_attempt_atomic(
            self.conn,
            attempt_id=attempt_id,
            reason="duplicate callback",
            actor="support-test",
        )
        self.assertFalse(duplicate["applied"])
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(100, duplicate["wallet"]["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE idempotency_key=?",
                ("jlpt_paper_refund:" + attempt_id,),
            ).fetchone()["c"],
        )

    def test_parent_attempt_refund_finalize_failure_rolls_back_credit(self) -> None:
        self._credit()
        first = self._start(self.paper_id, "refund-fault-start")["exam"]
        attempt_id = first["paperAttempt"]["id"]
        self.conn.execute(
            "CREATE TRIGGER fail_paper_refund BEFORE UPDATE OF payment_status "
            "ON jlpt_paper_attempts WHEN NEW.payment_status='refunded' "
            "BEGIN SELECT RAISE(ABORT, 'forced refund finalize failure'); END"
        )
        try:
            with self.assertRaises(Exception):
                server.refund_jlpt_paper_attempt_atomic(
                    self.conn,
                    attempt_id=attempt_id,
                    reason="fault injection",
                    actor="support-test",
                )
        finally:
            self.conn.execute("DROP TRIGGER fail_paper_refund")
        self.assertEqual(
            900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"]
        )
        attempt = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_paper_attempts WHERE id=?", (attempt_id,)
            ).fetchone()
        )
        self.assertEqual("paid", attempt["payment_status"])
        self.assertEqual("", attempt["refund_ledger_entry_id"])
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE idempotency_key=?",
                ("jlpt_paper_refund:" + attempt_id,),
            ).fetchone()["c"],
        )
    def test_concurrent_first_section_starts_charge_once(self) -> None:
        self._credit()
        self.conn.commit()
        self.conn.close()
        barrier = threading.Barrier(2)

        def run(key: str) -> str:
            connection = server.db()
            try:
                barrier.wait(timeout=5)
                result = self._start(self.written_id, key, conn=connection)
                return result["exam"]["paperAttempt"]["id"]
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            attempt_ids = list(pool.map(run, ["parallel-a", "parallel-b"]))
        self.conn = server.db()
        self.assertEqual(1, len(set(attempt_ids)))
        self.assertEqual(900, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries "
                "WHERE user_id=? AND source_type='jlpt_exam' AND points_delta < 0",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_preflight_is_the_single_authoritative_price_and_resume_contract(self) -> None:
        locked = server.jlpt_exam_access_preflight(
            self.conn,
            user_id=self.user_id,
            exam_id=self.paper_id,
            now=server.now_iso(),
        )
        self.assertEqual("ok", locked["status"])
        self.assertEqual("COIN_PER_ATTEMPT", locked["accessDecision"])
        self.assertEqual(100, locked["baseCoinCost"])
        self.assertEqual(50, locked["memberCoinCost"])
        self.assertEqual(100, locked["requiredCoins"])
        self.assertEqual(0, locked["balance"])
        self.assertEqual(100, locked["shortfall"])
        self.assertFalse(locked["canStart"])
        self.assertTrue(locked["oneTimePaperPayment"])
        self.assertEqual(self.written_id, locked["currentSectionExamId"])
        self.assertEqual("coins", locked["unlockSource"])
        self.assertTrue(locked["refundPolicyCode"])
        self.assertTrue(locked["confirmationCopyKey"])

        self._credit()
        first = self._start(self.paper_id, "preflight-start")["exam"]
        resumed = server.jlpt_exam_access_preflight(
            self.conn,
            user_id=self.user_id,
            exam_id=self.listening_id,
            now=server.now_iso(),
        )
        self.assertEqual(0, resumed["requiredCoins"])
        self.assertEqual(0, resumed["shortfall"])
        self.assertTrue(resumed["canStart"])
        self.assertEqual("paper_attempt", resumed["unlockSource"])
        self.assertEqual(first["sessionId"], resumed["resumeSessionId"])
        self.assertEqual(first["paperAttempt"]["id"], resumed["paperAttempt"]["id"])

    def test_parent_start_rejects_stale_confirmation_before_attempt_or_debit(self) -> None:
        self._credit()
        preflight = server.jlpt_exam_access_preflight(
            self.conn,
            user_id=self.user_id,
            exam_id=self.paper_id,
            now=server.now_iso(),
        )
        self.assertEqual(100, preflight["requiredCoins"])
        self.conn.execute(
            "UPDATE jlpt_exams SET coin_cost=120 WHERE id=?", (self.written_id,)
        )
        stale = self._start(
            self.paper_id,
            "stale-paper-confirmation",
            confirmed_charge_coins=100,
        )
        self.assertEqual("price_changed", stale["status"])
        self.assertEqual(120, stale["requiredCoins"])
        self.assertEqual(
            1_000,
            server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"],
        )
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_paper_attempts WHERE user_id=?",
                (self.user_id,),
            ).fetchone()["c"],
        )
        self.assertEqual(
            0,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_exam_sessions WHERE user_id=?",
                (self.user_id,),
            ).fetchone()["c"],
        )

    def test_member_preflight_uses_authoritative_membership_price(self) -> None:
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        self._credit(50)
        preflight = server.jlpt_exam_access_preflight(
            self.conn,
            user_id=self.user_id,
            exam_id=self.written_id,
            now=server.now_iso(),
        )
        self.assertEqual(50, preflight["requiredCoins"])
        self.assertEqual("member", preflight["pricingTier"])
        self.assertEqual(50, preflight["balance"])
        self.assertTrue(preflight["canStart"])

    def test_member_only_parent_attempt_survives_membership_expiry_between_sections(self) -> None:
        self.conn.execute(
            "UPDATE jlpt_exams SET is_member_only=1 WHERE id IN (?, ?, ?)",
            (self.paper_id, self.written_id, self.listening_id),
        )
        server.activate_or_extend_membership(
            self.conn,
            self.user_id,
            server.MEMBERSHIP_PLAN_KEY,
            "test_fixture",
        )
        self._credit(50)
        first = self._start(self.paper_id, "member-paper-first")["exam"]
        self.assertEqual(50, first["coinCharged"])
        attempt_id = first["paperAttempt"]["id"]

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
        self._submit(first["sessionId"])
        second = self._start(self.paper_id, "member-paper-second")
        self.assertEqual("started", second["status"])
        self.assertEqual(attempt_id, second["exam"]["paperAttempt"]["id"])
        self.assertEqual(0, second["exam"]["coinCharged"])
        self.assertEqual(0, second["exam"]["coinBalance"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
