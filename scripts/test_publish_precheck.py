#!/usr/bin/env python3
"""Listing publish precheck (modify#9): GET /api/listing_publish_precheck.

Returns all publish blockers (membership / reputation / quota) + remedy BEFORE
the user fills the form, calling the SAME gate as api_create_listing but turning
raised APIErrors into structured blockers. Verifies:
  * secondhand (free, open) → canPublish True, no membership requirement
  * rental for a non-member → MEMBERSHIP_REQUIRED blocker w/ remedy, required=True
  * reputation context is always present

Run:  cd web && python3 scripts/test_publish_precheck.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_precheck_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")
# Force the paywall (no free-first allowance) so a non-member rental is blocked.
os.environ["LISTING_FREE_FIRST_PER_TYPE"] = "0"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn) -> dict:
    uid = str(uuid.uuid4())
    h = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, h, h, f"{h}@example.com", "x", now, now, now),
    )
    return {"id": uid, "handle": h, "display_name": h}


def _precheck(conn, user, listing_type):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: user  # type: ignore[method-assign]
    h.api_listing_publish_precheck(conn, {"type": listing_type})
    return cap["data"]["precheck"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        user = _make_user(conn)

        # secondhand: free + open → publishable, no membership requirement
        r = _precheck(conn, user, "secondhand")
        assert r["canPublish"] is True, r
        assert r["blockers"] == [], r["blockers"]
        assert r["membership"]["required"] is False, r["membership"]
        assert "canPublishSecondhand" in r["reputation"], r["reputation"]

        # rental: requires membership; non-member with no free allowance → blocked
        r = _precheck(conn, user, "rental")
        assert r["canPublish"] is False, r
        assert r["membership"]["required"] is True and r["membership"]["hasActive"] is False, r["membership"]
        codes = [b["code"] for b in r["blockers"]]
        assert "MEMBERSHIP_REQUIRED" in codes, codes
        blk = next(b for b in r["blockers"] if b["code"] == "MEMBERSHIP_REQUIRED")
        assert blk["remedy"] == "join_membership", blk
        assert blk["message"], "blocker must carry a human message"
        # rental is a default-review channel
        assert r["requiresReview"] is True, r
        assert r["membership"]["freeFirst"]["limit"] == 0, r["membership"]

        print("test_publish_precheck: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
