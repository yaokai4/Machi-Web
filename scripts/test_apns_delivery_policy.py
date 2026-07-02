#!/usr/bin/env python3
"""APNs delivery-policy gates (B3): JST quiet hours + per-user daily cap.

Runs the real server_apns._deliver() with the network stubbed and the JST
clock pinned. Verifies:
  * quiet hours [22:00, 09:00) JST drop social pushes but transactional
    types (message) still deliver; the window edges behave (08:59 vs 09:00)
  * daily cap: the 2nd capped push in the same JST day is dropped, and
    saved_search / system share ONE per-user budget
  * transactional and social types are never capped
  * a quiet-hour drop does NOT burn the daily budget (quiet gate runs first)
  * the ledger holds one atomically-incremented row per (user, jst_date)
    and the budget resets on the next JST day

Run:  cd web && python3 scripts/test_apns_delivery_policy.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_apns_policy_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_apns  # noqa: E402

SENT: list[str] = []


def _make_user(conn) -> str:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _job(recipient_id: str, ntype: str) -> dict:
    return {"recipient_id": recipient_id, "ntype": ntype, "actor_id": "",
            "content": "policy probe content", "post_id": "",
            "conversation_id": "", "message_id": "", "listing_id": ""}


def _at(hour: int, minute: int = 0, day: int = 2) -> None:
    server_apns._now_jst = lambda: datetime(2026, 7, day, hour, minute, tzinfo=server_apns._JST)


def _ledger(conn) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT user_id, jst_date, count FROM apns_push_ledger ORDER BY jst_date")]


def main() -> None:
    server.init_db()
    # Wire the module by hand (no APNs creds → configure() starts no worker)
    # and stub the network + JWT so _deliver() runs its full real path.
    server_apns.configure(server.db, server.DB_LOCK)
    server_apns._provider_jwt = lambda: "test-jwt"
    server_apns._post_one = lambda token, payload, jwt: (SENT.append(payload), (200, ""))[1]

    conn = server.db()
    try:
        uid = _make_user(conn)
        server_apns.register_token(conn, uid, "ab" * 32, "ios", server.now_iso())

        # --- quiet hours: 23:00 JST drops social, keeps transactional ---
        _at(23)
        server_apns._deliver(_job(uid, "like"))
        assert len(SENT) == 0, "social push must be muted during JST quiet hours"
        server_apns._deliver(_job(uid, "message"))
        assert len(SENT) == 1, "DM (transactional) must deliver during quiet hours"
        server_apns._deliver(_job(uid, "booking"))
        assert len(SENT) == 2, "booking (transactional) must deliver during quiet hours"
        server_apns._deliver(_job(uid, "guide_reminder"))
        assert len(SENT) == 2, "guide_reminder is quiet-gated at night"

        # quiet drop of a capped type must NOT burn the daily budget
        server_apns._deliver(_job(uid, "saved_search"))
        assert len(SENT) == 2, "capped type is also quiet-gated at night"
        assert _ledger(conn) == [], "a quiet-hour drop must not touch the ledger"

        # --- window edges: 08:59 still quiet, 09:00 open ---
        _at(8, 59)
        server_apns._deliver(_job(uid, "follow"))
        assert len(SENT) == 2, "08:59 JST is still inside the quiet window"
        _at(9)
        server_apns._deliver(_job(uid, "follow"))
        assert len(SENT) == 3, "09:00 JST ends the quiet window"

        # --- daily cap: 2nd capped push same JST day is dropped ---
        SENT.clear()
        _at(12)
        server_apns._deliver(_job(uid, "saved_search"))
        assert len(SENT) == 1, "first capped push of the day must deliver"
        server_apns._deliver(_job(uid, "saved_search"))
        assert len(SENT) == 1, "second capped push same JST day must be dropped"
        server_apns._deliver(_job(uid, "system"))
        assert len(SENT) == 1, "saved_search and system share one daily budget"

        # transactional + social types are exempt from the cap
        server_apns._deliver(_job(uid, "message"))
        server_apns._deliver(_job(uid, "message"))
        assert len(SENT) == 3, "transactional pushes are never capped"
        server_apns._deliver(_job(uid, "booking"))
        server_apns._deliver(_job(uid, "booking"))
        assert len(SENT) == 5, "booking pushes are never capped"
        server_apns._deliver(_job(uid, "like"))
        server_apns._deliver(_job(uid, "like"))
        assert len(SENT) == 7, "social pushes are quiet-gated but not capped"
        server_apns._deliver(_job(uid, "guide_reminder"))
        server_apns._deliver(_job(uid, "guide_reminder"))
        assert len(SENT) == 9, "guide_reminder must not consume the shared daily cap"

        # --- ledger: one row per (user, jst_date), every attempt counted ---
        rows = _ledger(conn)
        assert rows == [{"user_id": uid, "jst_date": "2026-07-02", "count": 3}], \
            f"unexpected ledger state: {rows}"

        # --- budget resets on the next JST day ---
        _at(12, day=3)
        server_apns._deliver(_job(uid, "saved_search"))
        assert len(SENT) == 10, "budget must reset on the next JST day"
        assert len(_ledger(conn)) == 2, "next JST day gets its own ledger row"
    finally:
        conn.close()
        for ext in ("", "-wal", "-shm"):
            try:
                os.remove(_TMP_DB + ext)
            except FileNotFoundError:
                pass
    print("OK")


if __name__ == "__main__":
    main()
