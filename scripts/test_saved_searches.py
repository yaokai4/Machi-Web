#!/usr/bin/env python3
"""Saved-search alerts (N4): CRUD endpoints + the match-on-publish engine.

Exercises the real Handler.api_{create,delete}_saved_search and the module-level
server.notify_saved_search_matches against a throwaway SQLite DB with stubbed
sessions. Verifies:
  * create → list → delete round-trips and serializes both snake/camel keys
  * empty-condition create is rejected
  * a published listing notifies ONLY the users whose vertical + location +
    keyword + category all match, never the seller, never 'off' cadence
  * matching is metro-circle aware (tokyo search misses an osaka listing)
  * notifications dedupe per (user, listing) and bump match_count
  * delete enforces ownership (403 for a non-owner)

Run:  cd web && python3 scripts/test_saved_searches.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_savedsearch_test_", suffix=".db")[1]
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


def _handler(uid, *, body=None):
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: {"id": uid}  # type: ignore[method-assign]
    h.read_json = lambda: (body or {})  # type: ignore[method-assign]
    h._captured = captured  # type: ignore[attr-defined]
    return h


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


def _count_notifs(conn, uid, listing_id) -> int:
    return conn.execute(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'saved_search' AND target_listing_id = ?",
        (uid, listing_id),
    ).fetchone()["c"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        searcher = _make_user(conn)
        other = _make_user(conn)
        seller = _make_user(conn)

        # --- CRUD: create ---
        h = _handler(searcher, body={
            "vertical": "rental", "city": "tokyo", "keyword": "駅近", "cadence": "instant",
        })
        h.api_create_saved_search(conn)
        assert h._captured["status"] == 201, h._captured
        item = h._captured["data"]["item"]
        sid = item["id"]
        assert item["vertical"] == "rental" and item["listingType"] == "rental"
        assert item["citySlug"] == "tokyo" and item["keyword"] == "駅近"
        assert item["cadence"] == "instant"
        assert item["label"], "auto-label must be non-empty"

        # --- CRUD: list ---
        h = _handler(searcher)
        h.api_saved_searches(conn)
        items = h._captured["data"]["items"]
        assert len(items) == 1 and items[0]["id"] == sid, items

        # --- empty condition rejected ---
        h = _handler(searcher, body={})
        try:
            h.api_create_saved_search(conn)
            raise AssertionError("empty saved search should be rejected")
        except server.APIError as exc:
            assert exc.code == "empty_saved_search", exc.code

        # --- non-matching subscriptions for negative assertions ---
        # other: a JOB search in tokyo (vertical mismatch vs a rental listing)
        hj = _handler(other, body={"vertical": "job", "city": "tokyo"})
        hj.api_create_saved_search(conn)
        # other: an 'off' rental tokyo search must never fire
        hoff = _handler(other, body={"vertical": "rental", "city": "tokyo", "cadence": "off"})
        hoff.api_create_saved_search(conn)
        # seller: a matching rental tokyo search — seller must be excluded from own listing
        hs = _handler(seller, body={"vertical": "rental", "city": "tokyo"})
        hs.api_create_saved_search(conn)

        # --- match on publish ---
        listing = _make_listing(conn, seller_id=seller, ltype="rental", city="tokyo", title="駅近の良いお部屋")
        notified = server.notify_saved_search_matches(conn, listing)
        assert notified == 1, f"exactly the searcher should be notified, got {notified}"
        assert _count_notifs(conn, searcher, listing["id"]) == 1
        assert _count_notifs(conn, other, listing["id"]) == 0, "job/off searches must not fire"
        assert _count_notifs(conn, seller, listing["id"]) == 0, "seller excluded from own listing"
        # match_count bumped on the searcher's row
        mc = conn.execute("SELECT match_count FROM saved_searches WHERE id = ?", (sid,)).fetchone()["match_count"]
        assert int(mc) == 1, mc

        # --- dedupe: re-running does not double-notify ---
        again = server.notify_saved_search_matches(conn, listing)
        assert again == 0, "dedupe must prevent a second notification"
        assert _count_notifs(conn, searcher, listing["id"]) == 1

        # --- keyword filter: a listing WITHOUT the keyword must not match ---
        listing2 = _make_listing(conn, seller_id=seller, ltype="rental", city="tokyo", title="普通のお部屋")
        assert server.notify_saved_search_matches(conn, listing2) == 0, "keyword '駅近' absent → no match"

        # --- location filter: tokyo search must miss an osaka listing ---
        listing3 = _make_listing(conn, seller_id=seller, ltype="rental", city="osaka",
                                 region="jp-27", title="駅近の良いお部屋")
        assert server.notify_saved_search_matches(conn, listing3) == 0, "osaka listing must not match a tokyo search"

        # --- job/hiring are one family: the jobs channel on web/iOS merges
        # both streams, so a 'job' subscription must fire on a 'hiring'
        # listing (and vice versa) ---
        hiring_listing = _make_listing(conn, seller_id=seller, ltype="hiring", city="tokyo",
                                       title="ラーメン店スタッフ募集")
        assert server.notify_saved_search_matches(conn, hiring_listing) == 1, \
            "the 'job' subscription must match a 'hiring' listing"
        assert _count_notifs(conn, other, hiring_listing["id"]) == 1

        # --- filters.categories set: a homestay subscription (vertical
        # local_service + categories={民宿}) must not fire on other services ---
        homestay_user = _make_user(conn)
        hcat = _handler(homestay_user, body={
            "vertical": "local_service", "city": "tokyo",
            "filters": {"categories": "民宿"},
        })
        hcat.api_create_saved_search(conn)
        restaurant = _make_listing(conn, seller_id=seller, ltype="local_service", city="tokyo",
                                   category="美食餐厅", title="四川料理の店")
        assert server.notify_saved_search_matches(conn, restaurant) == 0, \
            "categories set must exclude non-homestay local_service listings"
        minshuku = _make_listing(conn, seller_id=seller, ltype="local_service", city="tokyo",
                                 category="民宿", title="浅草の民宿")
        assert server.notify_saved_search_matches(conn, minshuku) == 1, \
            "a 民宿 listing must fire the homestay subscription"
        assert _count_notifs(conn, homestay_user, minshuku["id"]) == 1

        # --- delete: ownership enforced ---
        hbad = _handler(other)
        try:
            hbad.api_delete_saved_search(conn, sid)
            raise AssertionError("non-owner delete should be forbidden")
        except server.APIError as exc:
            assert exc.status == 403, exc.status
        # owner can delete
        hdel = _handler(searcher)
        hdel.api_delete_saved_search(conn, sid)
        assert conn.execute("SELECT 1 FROM saved_searches WHERE id = ?", (sid,)).fetchone() is None

        print("test_saved_searches: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
