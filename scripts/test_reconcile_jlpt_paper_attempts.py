#!/usr/bin/env python3
"""Regression tests for supervised JLPT parent-attempt reconciliation."""
from __future__ import annotations

import os
import tempfile
import unittest
import uuid
from pathlib import Path


_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_reconcile_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402
from scripts import reconcile_jlpt_paper_attempts as reconcile  # noqa: E402


class JLPTPaperReconciliationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        now = server.now_iso()
        self.user_id = str(uuid.uuid4())
        handle = "recon" + uuid.uuid4().hex[:8]
        self.conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
            (self.user_id, handle, handle, f"{handle}@example.com", now, now, now),
        )
        question_ids = [
            row["id"]
            for row in self.conn.execute(
                "SELECT id FROM jlpt_questions WHERE status='published' "
                "AND review_status='approved' ORDER BY id LIMIT 2"
            ).fetchall()
        ]
        self.assertEqual(2, len(question_ids))
        suffix = uuid.uuid4().hex[:10]
        self.paper_id = "recon-paper-" + suffix
        self.written_id = "recon-written-" + suffix
        self.listening_id = "recon-listening-" + suffix
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.paper_id,
                "level": "N5",
                "title": "Reconciliation paper",
                "kind": "paper",
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
                "parentExamId": self.paper_id,
                "sortOrder": 0,
                "coinCost": 100,
                "questionIds": question_ids[:1],
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
                "parentExamId": self.paper_id,
                "sortOrder": 1,
                "coinCost": 0,
                "questionIds": question_ids[1:],
                "status": "published",
            },
            now=now,
        )
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()

    def _paid_start(self) -> dict:
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "topup",
            1_000,
            source_type="test_fixture",
            idempotency_key=f"reconcile-credit:{self.user_id}",
        )
        return server.start_jlpt_exam_atomic(
            self.conn,
            user_id=self.user_id,
            exam=jlpt.get_exam(self.conn, self.paper_id),
            request_key="reconciliation-start",
            now=server.now_iso(),
        )["exam"]

    def _apply(self, case_id: str) -> dict:
        return reconcile.reconcile_cases(
            self.conn,
            apply=True,
            case_ids=[case_id],
            confirmation=reconcile.confirmation_phrase([case_id]),
            actor="reconciliation-test",
            reason="fault injection repair",
        )

    def test_clean_parent_attempt_has_no_reconciliation_case(self) -> None:
        started = self._paid_start()
        attempt_id = started["paperAttempt"]["id"]
        self.assertFalse(
            [
                case
                for case in reconcile.scan_reconciliation_cases(self.conn)
                if case.get("attemptId") == attempt_id
            ]
        )

    def test_linked_paid_session_can_hydrate_unfinalized_parent_payment(self) -> None:
        started = self._paid_start()
        attempt_id = started["paperAttempt"]["id"]
        self.conn.execute(
            "UPDATE jlpt_paper_attempts SET payment_status='pending', "
            "charged_coin_cost=0, wallet_ledger_entry_id='' WHERE id=?",
            (attempt_id,),
        )
        self.conn.commit()
        cases = reconcile.scan_reconciliation_cases(self.conn)
        case = next(
            item
            for item in cases
            if item["caseType"] == "session_without_parent_payment"
            and item["attemptId"] == attempt_id
        )
        report = self._apply(case["caseId"])
        self.assertEqual("applied", report["status"])
        attempt = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_paper_attempts WHERE id=?", (attempt_id,)
            ).fetchone()
        )
        self.assertEqual("paid", attempt["payment_status"])
        self.assertEqual(100, attempt["charged_coin_cost"])
        self.assertEqual(started["walletLedgerEntryId"], attempt["wallet_ledger_entry_id"])
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM jlpt_paper_reconciliation_audit "
                "WHERE case_id=? AND status='applied'",
                (case["caseId"],),
            ).fetchone()["c"],
        )

    def test_paid_parent_with_missing_first_session_is_refunded_and_revoked(self) -> None:
        started = self._paid_start()
        attempt_id = started["paperAttempt"]["id"]
        self.conn.execute(
            "DELETE FROM jlpt_exam_sessions WHERE id=?", (started["sessionId"],)
        )
        self.conn.commit()
        case = next(
            item
            for item in reconcile.scan_reconciliation_cases(self.conn)
            if item["caseType"] == "parent_debit_without_session"
            and item["attemptId"] == attempt_id
        )
        report = self._apply(case["caseId"])
        self.assertEqual("applied", report["status"])
        attempt = dict(
            self.conn.execute(
                "SELECT * FROM jlpt_paper_attempts WHERE id=?", (attempt_id,)
            ).fetchone()
        )
        self.assertEqual("refunded", attempt["status"])
        self.assertEqual("refunded", attempt["payment_status"])
        self.assertEqual(
            1_000, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"]
        )

    def test_orphan_exam_debit_is_refunded_once_with_audit(self) -> None:
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "topup",
            1_000,
            source_type="test_fixture",
            idempotency_key=f"orphan-credit:{self.user_id}",
        )
        orphan = server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "spend",
            -80,
            source_type="jlpt_exam",
            source_order_id="missing-session-" + uuid.uuid4().hex,
            idempotency_key="jlpt_exam:missing:" + uuid.uuid4().hex,
        )["entry"]
        case = next(
            item
            for item in reconcile.scan_reconciliation_cases(self.conn)
            if item["caseType"] == "orphan_exam_debit"
            and item["walletLedgerEntryId"] == orphan["id"]
        )
        report = self._apply(case["caseId"])
        self.assertEqual("applied", report["status"])
        self.assertEqual(
            1_000, server.get_wallet_snapshot(self.conn, self.user_id)["balancePoints"]
        )
        self.assertFalse(
            [
                item
                for item in reconcile.scan_reconciliation_cases(self.conn)
                if item["caseId"] == case["caseId"]
            ]
        )
        self.assertEqual(
            1,
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id=? "
                "AND idempotency_key=?",
                (self.user_id, "jlpt_reconcile_orphan_debit:" + orphan["id"]),
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
