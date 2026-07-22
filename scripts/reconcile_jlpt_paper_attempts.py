#!/usr/bin/env python3
"""Audit and supervised repair for JLPT parent-attempt payment/session drift.

Dry-run is the default. Writes require ``--apply``, explicit ``--case-id`` values,
and the exact case-specific confirmation phrase printed by the dry run. The tool
only auto-repairs deterministic cases:

* a linked paid child session whose parent payment snapshot was not finalized;
* a paid parent whose first child session is missing (exact refund/revocation);
* an orphan JLPT debit whose referenced session and parent attempt do not exist.

Ambiguous legacy or mismatched rows are reported but deliberately left for
manual investigation. Every applied repair has both a wallet-ledger trail where
money moves and a ``jlpt_paper_reconciliation_audit`` before/after record.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _dict(row: Any) -> dict[str, Any]:
    return dict(row) if row is not None else {}


def _stable_ids(values: Iterable[str]) -> list[str]:
    return sorted({str(value).strip() for value in values if str(value).strip()})


def confirmation_phrase(case_ids: Iterable[str]) -> str:
    return "APPLY JLPT ATTEMPT RECONCILIATION: " + ",".join(_stable_ids(case_ids))


def _ledger(conn: Any, ledger_id: str, user_id: str) -> dict[str, Any]:
    if not ledger_id:
        return {}
    return _dict(
        conn.execute(
            "SELECT * FROM wallet_ledger_entries WHERE id=? AND user_id=?",
            (ledger_id, user_id),
        ).fetchone()
    )


def _valid_session_debit(
    conn: Any, session: dict[str, Any]
) -> tuple[bool, dict[str, Any]]:
    charged = int(session.get("charged_coin_cost") or 0)
    if str(session.get("payment_status") or "") == "not_required" and charged == 0:
        return True, {}
    ledger = _ledger(
        conn,
        str(session.get("wallet_ledger_entry_id") or ""),
        str(session.get("user_id") or ""),
    )
    valid = bool(
        str(session.get("payment_status") or "") == "paid"
        and charged > 0
        and ledger
        and int(ledger.get("points_delta") or 0) == -charged
        and str(ledger.get("source_type") or "") == "jlpt_exam"
        and str(ledger.get("source_order_id") or "") == str(session.get("id") or "")
    )
    return valid, ledger


def scan_reconciliation_cases(conn: Any) -> list[dict[str, Any]]:
    """Return stable, evidence-rich cases without mutating the database."""
    cases: list[dict[str, Any]] = []
    attempts = [
        _dict(row)
        for row in conn.execute(
            "SELECT * FROM jlpt_paper_attempts ORDER BY started_at, id"
        ).fetchall()
    ]
    attempt_ids = {str(row.get("id") or "") for row in attempts}

    # A session that claims a parent attempt which does not exist is never safe
    # to auto-adopt: its paper, section order and price provenance are ambiguous.
    for row in conn.execute(
        "SELECT * FROM jlpt_exam_sessions WHERE COALESCE(paper_attempt_id, '')<>'' "
        "ORDER BY started_at, id"
    ).fetchall():
        session = _dict(row)
        attempt_id = str(session.get("paper_attempt_id") or "")
        if attempt_id not in attempt_ids:
            cases.append(
                {
                    "caseId": f"session-missing-parent:{session['id']}",
                    "caseType": "session_missing_parent_attempt",
                    "repairable": False,
                    "action": "manual_investigation",
                    "attemptId": attempt_id,
                    "sessionId": str(session.get("id") or ""),
                    "userId": str(session.get("user_id") or ""),
                }
            )

    referenced_debits: set[str] = set()
    for attempt in attempts:
        attempt_id = str(attempt.get("id") or "")
        user_id = str(attempt.get("user_id") or "")
        payment_status = str(attempt.get("payment_status") or "")
        debit_id = str(attempt.get("wallet_ledger_entry_id") or "")
        if debit_id:
            referenced_debits.add(debit_id)
        section_rows = [
            _dict(row)
            for row in conn.execute(
                "SELECT * FROM jlpt_paper_section_attempts WHERE paper_attempt_id=? "
                "ORDER BY sort_order, section_exam_id",
                (attempt_id,),
            ).fetchall()
        ]
        first = section_rows[0] if section_rows else {}
        first_session_id = str(first.get("session_id") or "")
        first_session = _dict(
            conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE id=? AND paper_attempt_id=?",
                (first_session_id, attempt_id),
            ).fetchone()
        ) if first_session_id else {}

        if payment_status == "paid":
            debit = _ledger(conn, debit_id, user_id)
            charged = int(attempt.get("charged_coin_cost") or 0)
            debit_valid = bool(
                debit
                and charged > 0
                and int(debit.get("points_delta") or 0) == -charged
                and str(debit.get("source_type") or "") == "jlpt_exam"
            )
            if not debit_valid:
                cases.append(
                    {
                        "caseId": f"parent-debit-mismatch:{attempt_id}",
                        "caseType": "parent_debit_mismatch",
                        "repairable": False,
                        "action": "manual_investigation",
                        "attemptId": attempt_id,
                        "userId": user_id,
                        "chargedCoinCost": charged,
                        "walletLedgerEntryId": debit_id,
                    }
                )
            elif not first_session:
                cases.append(
                    {
                        "caseId": f"debit-without-session:{attempt_id}",
                        "caseType": "parent_debit_without_session",
                        "repairable": True,
                        "action": "refund_parent_attempt",
                        "attemptId": attempt_id,
                        "userId": user_id,
                        "chargedCoinCost": charged,
                        "walletLedgerEntryId": debit_id,
                    }
                )

        if payment_status not in ("paid", "not_required", "refunded") and first_session:
            valid, session_debit = _valid_session_debit(conn, first_session)
            if valid:
                if session_debit:
                    referenced_debits.add(str(session_debit.get("id") or ""))
                cases.append(
                    {
                        "caseId": f"session-without-parent-payment:{attempt_id}:{first_session['id']}",
                        "caseType": "session_without_parent_payment",
                        "repairable": True,
                        "action": "hydrate_parent_payment",
                        "attemptId": attempt_id,
                        "sessionId": str(first_session.get("id") or ""),
                        "userId": user_id,
                        "chargedCoinCost": int(first_session.get("charged_coin_cost") or 0),
                        "walletLedgerEntryId": str(
                            first_session.get("wallet_ledger_entry_id") or ""
                        ),
                    }
                )
            else:
                cases.append(
                    {
                        "caseId": f"session-payment-evidence-missing:{first_session['id']}",
                        "caseType": "session_payment_evidence_missing",
                        "repairable": False,
                        "action": "manual_investigation",
                        "attemptId": attempt_id,
                        "sessionId": str(first_session.get("id") or ""),
                        "userId": user_id,
                    }
                )

    # A debit with no referenced session can only be credited automatically if
    # no parent attempt claims it and no prior reconciliation credit exists.
    for row in conn.execute(
        "SELECT * FROM wallet_ledger_entries WHERE source_type='jlpt_exam' "
        "AND points_delta<0 ORDER BY created_at, id"
    ).fetchall():
        debit = _dict(row)
        debit_id = str(debit.get("id") or "")
        session_id = str(debit.get("source_order_id") or "")
        if debit_id in referenced_debits:
            continue
        session = conn.execute(
            "SELECT id FROM jlpt_exam_sessions WHERE id=?", (session_id,)
        ).fetchone()
        prior_refund = conn.execute(
            "SELECT id FROM wallet_ledger_entries WHERE user_id=? AND idempotency_key=?",
            (
                debit.get("user_id"),
                "jlpt_reconcile_orphan_debit:" + debit_id,
            ),
        ).fetchone()
        if not session and not prior_refund:
            cases.append(
                {
                    "caseId": f"orphan-exam-debit:{debit_id}",
                    "caseType": "orphan_exam_debit",
                    "repairable": True,
                    "action": "refund_orphan_debit",
                    "attemptId": "",
                    "sessionId": session_id,
                    "userId": str(debit.get("user_id") or ""),
                    "chargedCoinCost": -int(debit.get("points_delta") or 0),
                    "walletLedgerEntryId": debit_id,
                }
            )

    return sorted(cases, key=lambda item: str(item["caseId"]))


def _audit(
    conn: Any,
    *,
    run_id: str,
    case: dict[str, Any],
    actor: str,
    reason: str,
    before: dict[str, Any],
    after: dict[str, Any],
    rollback: dict[str, Any],
) -> None:
    conn.execute(
        "INSERT INTO jlpt_paper_reconciliation_audit "
        "(run_id, case_id, case_type, action, status, actor, reason, before_json, "
        "after_json, rollback_json, created_at) VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?)",
        (
            run_id,
            case["caseId"],
            case["caseType"],
            case["action"],
            actor,
            reason,
            json.dumps(before, ensure_ascii=False, sort_keys=True),
            json.dumps(after, ensure_ascii=False, sort_keys=True),
            json.dumps(rollback, ensure_ascii=False, sort_keys=True),
            server.now_iso(),
        ),
    )


@server.money_atomic
def _hydrate_parent_payment(
    conn: Any,
    *,
    run_id: str,
    case: dict[str, Any],
    actor: str,
    reason: str,
) -> dict[str, Any]:
    attempt = _dict(
        conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE id=?", (case["attemptId"],)
        ).fetchone()
    )
    session = _dict(
        conn.execute(
            "SELECT * FROM jlpt_exam_sessions WHERE id=? AND paper_attempt_id=?",
            (case["sessionId"], case["attemptId"]),
        ).fetchone()
    )
    if not attempt or not session:
        raise RuntimeError("reconciliation candidate disappeared")
    if str(attempt.get("payment_status") or "") in ("paid", "not_required", "refunded"):
        raise RuntimeError("parent payment state changed before apply")
    valid, _ = _valid_session_debit(conn, session)
    if not valid:
        raise RuntimeError("session payment evidence changed before apply")
    before = attempt.copy()
    charged = int(session.get("charged_coin_cost") or 0)
    payment_status = str(session.get("payment_status") or "")
    unlock_source = "coin_per_attempt" if charged > 0 else "free"
    updated = conn.execute(
        "UPDATE jlpt_paper_attempts SET base_coin_cost_snapshot=?, charged_coin_cost=?, "
        "pricing_tier=?, membership_snapshot=?, unlock_source=?, payment_status=?, "
        "wallet_ledger_entry_id=?, updated_at=? WHERE id=? "
        "AND payment_status NOT IN ('paid','not_required','refunded')",
        (
            int(session.get("base_coin_cost_snapshot") or 0),
            charged,
            str(session.get("pricing_tier") or "legacy"),
            1 if str(session.get("pricing_tier") or "") == "member" else 0,
            unlock_source,
            payment_status,
            str(session.get("wallet_ledger_entry_id") or ""),
            server.now_iso(),
            case["attemptId"],
        ),
    )
    if getattr(updated, "rowcount", 0) != 1:
        raise RuntimeError("failed to hydrate parent payment snapshot")
    after = _dict(
        conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE id=?", (case["attemptId"],)
        ).fetchone()
    )
    rollback = {
        "manualOnly": True,
        "sql": "Restore jlpt_paper_attempts payment snapshot from before_json after incident review",
    }
    _audit(
        conn,
        run_id=run_id,
        case=case,
        actor=actor,
        reason=reason,
        before=before,
        after=after,
        rollback=rollback,
    )
    return {"caseId": case["caseId"], "status": "applied", "after": after}


@server.money_atomic
def _refund_parent_without_session(
    conn: Any,
    *,
    run_id: str,
    case: dict[str, Any],
    actor: str,
    reason: str,
) -> dict[str, Any]:
    before = _dict(
        conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE id=?", (case["attemptId"],)
        ).fetchone()
    )
    outcome = server.refund_jlpt_paper_attempt_atomic(
        conn,
        attempt_id=case["attemptId"],
        reason=reason or "reconciliation: debit without first section session",
        actor=actor,
    )
    if not outcome.get("applied"):
        raise RuntimeError("parent refund was not applied")
    after = _dict(
        conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE id=?", (case["attemptId"],)
        ).fetchone()
    )
    _audit(
        conn,
        run_id=run_id,
        case=case,
        actor=actor,
        reason=reason,
        before=before,
        after=after,
        rollback={"manualOnly": True, "reason": "Wallet refund cannot be silently reversed"},
    )
    return {"caseId": case["caseId"], "status": "applied", "after": after}


@server.money_atomic
def _refund_orphan_debit(
    conn: Any,
    *,
    run_id: str,
    case: dict[str, Any],
    actor: str,
    reason: str,
) -> dict[str, Any]:
    debit = _dict(
        conn.execute(
            "SELECT * FROM wallet_ledger_entries WHERE id=? AND user_id=?",
            (case["walletLedgerEntryId"], case["userId"]),
        ).fetchone()
    )
    if (
        not debit
        or str(debit.get("source_type") or "") != "jlpt_exam"
        or int(debit.get("points_delta") or 0) >= 0
        or conn.execute(
            "SELECT id FROM jlpt_exam_sessions WHERE id=?",
            (str(debit.get("source_order_id") or ""),),
        ).fetchone()
        or conn.execute(
            "SELECT id FROM jlpt_paper_attempts WHERE wallet_ledger_entry_id=?",
            (debit["id"],),
        ).fetchone()
    ):
        raise RuntimeError("orphan debit evidence changed before apply")
    amount = -int(debit["points_delta"])
    refund = server.wallet_post_ledger(
        conn,
        case["userId"],
        "refund_credit",
        amount,
        source_type="jlpt_reconciliation",
        source_order_id=str(debit.get("source_order_id") or ""),
        source_transaction_id=str(debit.get("id") or ""),
        product_id=str(debit.get("product_id") or ""),
        idempotency_key="jlpt_reconcile_orphan_debit:" + str(debit["id"]),
        metadata={
            "reason": reason,
            "actor": actor,
            "originalLedgerEntryId": debit["id"],
            "missingSessionId": str(debit.get("source_order_id") or ""),
        },
        created_by=actor,
    )
    if not (refund.get("entry") or {}).get("id"):
        raise RuntimeError("orphan debit refund ledger was not created")
    after = {"refundEntry": refund["entry"], "wallet": refund["wallet"]}
    _audit(
        conn,
        run_id=run_id,
        case=case,
        actor=actor,
        reason=reason,
        before={"debit": debit},
        after=after,
        rollback={"manualOnly": True, "reason": "Wallet refund cannot be silently reversed"},
    )
    return {"caseId": case["caseId"], "status": "applied", "after": after}


def reconcile_cases(
    conn: Any,
    *,
    apply: bool = False,
    case_ids: Iterable[str] = (),
    confirmation: str = "",
    actor: str = "",
    reason: str = "",
) -> dict[str, Any]:
    cases = scan_reconciliation_cases(conn)
    run_id = str(uuid.uuid4())
    report: dict[str, Any] = {
        "runId": run_id,
        "status": "dry-run",
        "cases": cases,
        "selectedCaseIds": [],
        "changes": [],
    }
    if not apply:
        return report
    selected = _stable_ids(case_ids)
    report["selectedCaseIds"] = selected
    if not selected:
        report.update(status="refused", reason="No case IDs were explicitly selected")
        return report
    if confirmation != confirmation_phrase(selected):
        report.update(status="cancelled", reason="Confirmation phrase did not match")
        return report
    by_id = {str(case["caseId"]): case for case in cases}
    invalid = [case_id for case_id in selected if case_id not in by_id]
    unsafe = [case_id for case_id in selected if case_id in by_id and not by_id[case_id]["repairable"]]
    if invalid or unsafe:
        report.update(
            status="refused",
            reason="Selected cases are stale, unknown, or require manual investigation",
            invalidCaseIds=invalid,
            unsafeCaseIds=unsafe,
        )
        return report
    actor = str(actor or "operator").strip()[:200]
    reason = str(reason or "supervised JLPT reconciliation").strip()[:500]
    actions = {
        "hydrate_parent_payment": _hydrate_parent_payment,
        "refund_parent_attempt": _refund_parent_without_session,
        "refund_orphan_debit": _refund_orphan_debit,
    }
    for case_id in selected:
        case = by_id[case_id]
        action = actions[case["action"]]
        report["changes"].append(
            action(
                conn,
                run_id=run_id,
                case=case,
                actor=actor,
                reason=reason,
            )
        )
    report["status"] = "applied"
    return report


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def _open_connection(db_path: str) -> Any:
    if db_path:
        conn = sqlite3.connect(Path(db_path).expanduser().resolve(), isolation_level=None)
        conn.row_factory = sqlite3.Row
        return conn
    return server.db()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="", help="explicit SQLite path; default uses configured backend")
    parser.add_argument("--apply", action="store_true", help="enable selected supervised repairs")
    parser.add_argument("--case-id", action="append", default=[], help="case ID to repair; repeatable")
    parser.add_argument("--confirm", default="", help="exact confirmation phrase from dry run")
    parser.add_argument("--actor", default="", help="operator identity stored in the audit")
    parser.add_argument("--reason", default="", help="incident/support reason stored in the audit")
    parser.add_argument("--report", default="", help="optional atomic JSON report path")
    args = parser.parse_args(argv)

    conn = _open_connection(args.db)
    try:
        report = reconcile_cases(
            conn,
            apply=args.apply,
            case_ids=args.case_id,
            confirmation=args.confirm,
            actor=args.actor,
            reason=args.reason,
        )
    finally:
        conn.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not args.apply and report["cases"]:
        repairable = [case["caseId"] for case in report["cases"] if case["repairable"]]
        if repairable:
            print("\nConfirmation phrase for all repairable cases:")
            print(confirmation_phrase(repairable))
    if args.report:
        _write_report(Path(args.report), report)
    return 0 if report["status"] in ("dry-run", "applied") else 2


if __name__ == "__main__":
    raise SystemExit(main())
