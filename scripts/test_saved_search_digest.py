#!/usr/bin/env python3
"""Saved-search DAILY digest (N4 follow-up): cadence='daily' must NOT ping
instantly on publish, but instead batch new matches into one digest via
server.run_saved_search_digests (called by the retention janitor).

Verifies:
  * a 'daily' search is skipped by notify_saved_search_matches (instant-only)
  * an 'instant' search still fires on publish (no regression)
  * run_saved_search_digests batches N new matches into ONE notification,
    bumps match_count by N, and stamps last_notified_at
  * the ~20h gate prevents a second digest on the next sweep
  * digest honours vertical + location + keyword filters (osaka misses tokyo)
  * a daily search with zero matches still advances last_notified_at

Run:  cd web && python3 scripts/test_saved_search_digest.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_ss_digest_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


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


def _make_search(conn, uid, *, vertical="rental", city="tokyo", keyword="", cadence="daily") -> str:
    sid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO saved_searches (id, user_id, vertical, city_slug, region_code, country_code, "
        "keyword, category, filter_json, label, cadence, last_notified_at, match_count, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, '', '', ?, '', '', ?, ?, '', 0, ?, ?)",
        (sid, uid, vertical, city, keyword, vertical or "search", cadence, now, now),
    )
    return sid


def _make_listing(conn, *, seller_id, ltype="rental", city="tokyo", region="jp-13",
                  country="jp", title="駅近の良いお部屋", description="", category="") -> dict:
    lid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO city_listings (id, country_code, city_id, city_slug, region_code, language, type, "
        "category, title, description, status, verification_status, seller_user_id, contact_method, "
        "published_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, 'zh-CN', ?, ?, ?, ?, 'published', 'unverified', ?, 'app_message', ?, ?, ?)",
        (lid, country, city, city, region, ltype, category, title, description, seller_id, now, now, now),
    )
    return dict(conn.execute("SELECT * FROM city_listings WHERE id = ?", (lid,)).fetchone())


def _digest_notifs(conn, uid) -> int:
    return conn.execute(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'saved_search'",
        (uid,),
    ).fetchone()["c"]


def _row(conn, sid) -> dict:
    return dict(conn.execute("SELECT * FROM saved_searches WHERE id = ?", (sid,)).fetchone())


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        daily_user = _make_user(conn)
        instant_user = _make_user(conn)
        seller = _make_user(conn)

        daily_sid = _make_search(conn, daily_user, vertical="rental", city="tokyo", keyword="駅近", cadence="daily")
        _make_search(conn, instant_user, vertical="rental", city="tokyo", keyword="駅近", cadence="instant")

        # --- publish: instant fires, daily does NOT ---
        l1 = _make_listing(conn, seller_id=seller, city="tokyo", title="駅近の良いお部屋 A")
        notified = server.notify_saved_search_matches(conn, l1)
        assert notified == 1, f"only the instant search should fire on publish, got {notified}"
        assert _digest_notifs(conn, instant_user) == 1, "instant user notified on publish"
        assert _digest_notifs(conn, daily_user) == 0, "daily user must NOT be pinged on publish"

        # second matching listing published before the digest runs
        l2 = _make_listing(conn, seller_id=seller, city="tokyo", title="駅近のワンルーム B")
        server.notify_saved_search_matches(conn, l2)
        assert _digest_notifs(conn, daily_user) == 0, "still no instant ping for daily"

        # --- digest: batches BOTH new matches into ONE notification ---
        sent = server.run_saved_search_digests(conn)
        assert sent == 1, f"exactly one daily digest should be sent, got {sent}"
        assert _digest_notifs(conn, daily_user) == 1, "daily user gets one batched digest"
        row = _row(conn, daily_sid)
        assert int(row["match_count"]) == 2, f"match_count should batch both, got {row['match_count']}"
        assert row["last_notified_at"], "last_notified_at must be stamped"

        # --- 20h gate: a second sweep right away sends nothing ---
        again = server.run_saved_search_digests(conn)
        assert again == 0, "the 20h gate must suppress an immediate re-digest"
        assert _digest_notifs(conn, daily_user) == 1

        # --- location filter: an osaka daily search must miss tokyo listings ---
        osaka_user = _make_user(conn)
        osaka_sid = _make_search(conn, osaka_user, vertical="rental", city="osaka", keyword="駅近", cadence="daily")
        sent2 = server.run_saved_search_digests(conn)
        # osaka search has no matching listings (all are tokyo) -> 0 digests sent,
        # but its last_notified_at is advanced so it won't rescan next sweep.
        assert sent2 == 0, f"osaka search must not match tokyo listings, got {sent2}"
        assert _digest_notifs(conn, osaka_user) == 0
        assert _row(conn, osaka_sid)["last_notified_at"], "empty-match daily search still advances last_notified_at"

        print("test_saved_search_digest: OK")
    finally:
        conn.close()
        try:
            os.unlink(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
