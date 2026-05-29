#!/usr/bin/env python3
"""Prune visitor_logs rows older than the retention window.

Intended to run from cron, e.g. daily:
    KAIX_DB_PATH=/var/lib/machi/kaix.db \\
        python3 scripts/cleanup_visitor_logs.py

The retention window defaults to KAIX_VISITOR_LOG_RETENTION_DAYS.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Prune old visitor access logs.")
    parser.add_argument(
        "--days",
        type=int,
        default=server.VISITOR_LOG_RETENTION_DAYS,
        help=(
            "Retention window in days "
            f"(default: {server.VISITOR_LOG_RETENTION_DAYS} / KAIX_VISITOR_LOG_RETENTION_DAYS)."
        ),
    )
    args = parser.parse_args()
    days = max(1, args.days)

    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        deleted = server.cleanup_visitor_logs(conn, days)
    print(f"visitor_logs: deleted {deleted} row(s) older than {days} day(s)")


if __name__ == "__main__":
    main()
