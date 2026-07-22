#!/usr/bin/env python3
"""Supervised repair for legacy-v120 zero-priced canonical JLPT mock exams.

The command is a read-only dry run unless all three operator gates are met:

1. ``--apply`` is present;
2. every row to change is selected with ``--exam-id``;
3. the operator types the exact, candidate-specific confirmation phrase.

Only the five canonical ``mockv1-*`` IDs with matching level/kind and a current
zero price can become candidates.  Apply runs update + before/after audit rows
in one transaction.  Every audit row stores parameterized rollback instructions.

Examples:

    python3 scripts/repair_jlpt_mock_prices.py
    python3 scripts/repair_jlpt_mock_prices.py --apply \
        --exam-id mockv1-n5 --exam-id mockv1-n4 --report /secure/path/report.json
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server_jlpt import MOCK_V1_COIN_COSTS  # noqa: E402


CANONICAL_TARGETS: tuple[dict[str, Any], ...] = tuple(
    {
        "id": f"mockv1-{level.lower()}",
        "level": level,
        "kind": "mock",
        "proposedCoinCost": cost,
    }
    for level, cost in MOCK_V1_COIN_COSTS.items()
)
_TARGET_BY_ID = {target["id"]: target for target in CANONICAL_TARGETS}
AUDIT_TABLE = "jlpt_price_repair_audit"


def _dict_row(row: Any) -> dict[str, Any]:
    return dict(row) if row is not None else {}


def _ordered_unique_ids(values: Iterable[str]) -> list[str]:
    requested = {str(value).strip() for value in values if str(value).strip()}
    canonical = [target["id"] for target in CANONICAL_TARGETS if target["id"] in requested]
    extras = sorted(requested - set(canonical))
    return canonical + extras


def confirmation_phrase(confirmed_ids: Iterable[str]) -> str:
    ids = _ordered_unique_ids(confirmed_ids)
    return "APPLY JLPT PRICE REPAIR: " + ",".join(ids)


def inspect_candidates(conn: Any) -> list[dict[str, Any]]:
    ids = [target["id"] for target in CANONICAL_TARGETS]
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT id, level, kind, coin_cost FROM jlpt_exams WHERE id IN ({placeholders})",
        tuple(ids),
    ).fetchall()
    by_id = {str(_dict_row(row).get("id")): _dict_row(row) for row in rows}
    candidates: list[dict[str, Any]] = []
    for target in CANONICAL_TARGETS:
        row = by_id.get(target["id"])
        if not row:
            continue
        if (
            str(row.get("level") or "").upper() != target["level"]
            or str(row.get("kind") or "").lower() != target["kind"]
            or int(row.get("coin_cost") or 0) != 0
        ):
            continue
        candidates.append(
            {
                **target,
                "beforeCoinCost": 0,
            }
        )
    return candidates


def _base_report(conn: Any, candidates: list[dict[str, Any]]) -> dict[str, Any]:
    backend = "SQLite" if isinstance(conn, sqlite3.Connection) else type(conn).__name__
    return {
        "runId": str(uuid.uuid4()),
        "backend": backend,
        "status": "dry-run",
        "candidates": candidates,
        "confirmedIds": [],
        "changes": [],
        "rollback": [],
        "evidenceLimit": (
            f"This report records the {backend} execution only. "
            "PostgreSQL requires a separately supervised run against a live PostgreSQL database; "
            "adapter or translation stubs are not production proof."
        ),
    }


def repair_mock_prices(
    conn: Any,
    *,
    apply: bool = False,
    confirmed_ids: Iterable[str] = (),
    confirmation: str = "",
) -> dict[str, Any]:
    """Inspect or explicitly repair a confirmed subset of canonical candidates."""
    candidates = inspect_candidates(conn)
    report = _base_report(conn, candidates)
    if not apply:
        return report

    confirmed = _ordered_unique_ids(confirmed_ids)
    report["confirmedIds"] = confirmed
    if not confirmed:
        report.update(status="refused", reason="No candidate IDs were explicitly confirmed")
        return report
    if confirmation != confirmation_phrase(confirmed):
        report.update(status="cancelled", reason="Confirmation phrase did not match")
        return report

    eligible = {candidate["id"] for candidate in candidates}
    invalid = [exam_id for exam_id in confirmed if exam_id not in eligible]
    if invalid:
        report.update(
            status="refused",
            reason="Confirmed IDs are not current canonical zero-price candidates",
            refusedIds=invalid,
        )
        return report

    applied_at = datetime.now(timezone.utc).isoformat()
    conn.execute("BEGIN IMMEDIATE")
    try:
        # Re-read under the write transaction so an operator cannot confirm a
        # stale dry-run and overwrite a price changed in the meantime.
        locked_candidates = {item["id"] for item in inspect_candidates(conn)}
        stale = [exam_id for exam_id in confirmed if exam_id not in locked_candidates]
        if stale:
            raise RuntimeError(f"candidate state changed before apply: {', '.join(stale)}")

        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {AUDIT_TABLE} ("
            "run_id TEXT NOT NULL, exam_id TEXT NOT NULL, level TEXT NOT NULL, "
            "before_coin_cost INTEGER NOT NULL, after_coin_cost INTEGER NOT NULL, "
            "rollback_json TEXT NOT NULL, applied_at TEXT NOT NULL, "
            "PRIMARY KEY (run_id, exam_id))"
        )
        for exam_id in confirmed:
            target = _TARGET_BY_ID[exam_id]
            before = 0
            after = int(target["proposedCoinCost"])
            cursor = conn.execute(
                "UPDATE jlpt_exams SET coin_cost=? "
                "WHERE id=? AND level=? AND kind='mock' AND coin_cost=0",
                (after, exam_id, target["level"]),
            )
            if cursor.rowcount != 1:
                raise RuntimeError(f"candidate changed during apply: {exam_id}")
            rollback = {
                "sql": "UPDATE jlpt_exams SET coin_cost=? WHERE id=? AND coin_cost=?",
                "params": [before, exam_id, after],
            }
            change = {
                "id": exam_id,
                "level": target["level"],
                "beforeCoinCost": before,
                "afterCoinCost": after,
                "rollback": rollback,
            }
            report["changes"].append(change)
            report["rollback"].append(rollback)
            conn.execute(
                f"INSERT INTO {AUDIT_TABLE} "
                "(run_id, exam_id, level, before_coin_cost, after_coin_cost, rollback_json, applied_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    report["runId"], exam_id, target["level"], before, after,
                    json.dumps(rollback, ensure_ascii=False, separators=(",", ":")), applied_at,
                ),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    report["status"] = "applied"
    report["appliedAt"] = applied_at
    return report


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
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
    import server

    return server.db()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="", help="explicit SQLite DB path; default uses configured backend")
    parser.add_argument("--apply", action="store_true", help="enable writes after candidate selection and confirmation")
    parser.add_argument(
        "--exam-id", action="append", default=[],
        help="canonical candidate ID to apply; repeat once per confirmed row",
    )
    parser.add_argument("--report", default="", help="optional JSON report output path")
    args = parser.parse_args(argv)

    conn = _open_connection(args.db)
    try:
        dry_run = repair_mock_prices(conn)
        print("Canonical zero-price candidates:")
        for item in dry_run["candidates"]:
            print(
                f"  {item['id']} level={item['level']} "
                f"before={item['beforeCoinCost']} proposed={item['proposedCoinCost']}"
            )
        if not args.apply:
            report = dry_run
        elif not args.exam_id:
            print("REFUSED: --apply also requires at least one --exam-id", file=sys.stderr)
            return 2
        else:
            phrase = confirmation_phrase(args.exam_id)
            typed = input(f"Type exactly to apply the selected rows:\n{phrase}\n> ")
            report = repair_mock_prices(
                conn,
                apply=True,
                confirmed_ids=args.exam_id,
                confirmation=typed,
            )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.report:
            _write_report(Path(args.report), report)
        return 0 if report["status"] in {"dry-run", "applied"} else 3
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
