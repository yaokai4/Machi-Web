#!/usr/bin/env python3
"""Expire Machi Verified memberships whose period has ended.

Flips any active / grace_period membership whose current_period_end is in
the past to `expired`, records a `membership_expired` entitlement event,
and refreshes the user cache columns so the blue badge disappears and
member-only publishing is blocked immediately.

Already-published content is never touched.

Intended to run from cron, e.g. hourly:
    KAIX_DB_PATH=/var/lib/machi/kaix.db \\
        python3 scripts/expire_memberships.py

Note: membership status is ALSO checked lazily on every read
(get_user_membership_status), so a missed cron run never lets an expired
member keep access — this script just keeps the cache columns tidy.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def main() -> None:
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        n = server.expire_due_memberships(conn)
    print(f"memberships: expired {n} lapsed membership(s)")


if __name__ == "__main__":
    main()
