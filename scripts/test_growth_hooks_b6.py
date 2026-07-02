#!/usr/bin/env python3
"""B6 growth + notification hooks — in-process function tests.

Covers (against a throwaway SQLite DB via server.init_db()):
  * notify_favorite_listing_change: price-drop and take-down notify every
    favoriter EXCEPT the author, with the right notification type + listing link.
  * extract_mentions / notify_mentions: real @handles get a 'mention' row;
    unknown handles, self-mentions, and already-notified users are skipped;
    duplicate @handle pings once.
  * run_follow_digests: one 'follow_digest' per user who follows a person and/or
    a topic that saw a new post in the last day; the ~20h gate suppresses a
    second sweep; a user with no new content gets nothing.
  * run_city_digests: an inactive (3-8d) user in a region with new listings /
    hot posts gets ONE 'city_digest'; zero real content -> no push.
  * run_orphan_media_gc: an unattached ready upload older than 48h is swept,
    but an attached one, a recent one, and an avatar are all left alone.

Run:  cd web && python3 scripts/test_growth_hooks_b6.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_b6_hooks_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _iso_ago(**kw) -> str:
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat()


def _make_user(conn, handle=None, *, region="", city="", country="") -> str:
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at, "
        "country, city, current_region_code) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now, country, city, region),
    )
    return uid


def _make_listing(conn, *, seller_id, price=None, status="published", region="jp.tokyo.tokyo",
                  country="jp", title="良い部屋", published_ago_days=1) -> str:
    lid = str(uuid.uuid4())
    now = server.now_iso()
    pub = _iso_ago(days=published_ago_days)
    conn.execute(
        "INSERT INTO city_listings (id, country_code, city_id, city_slug, region_code, language, type, "
        "category, title, description, price, status, verification_status, seller_user_id, contact_method, "
        "published_at, created_at, updated_at) "
        "VALUES (?, ?, 'tokyo', 'tokyo', ?, 'zh-CN', 'rental', '', ?, '', ?, ?, 'unverified', ?, 'app_message', ?, ?, ?)",
        (lid, country, region, title, price, status, seller_id, pub, pub, now),
    )
    return lid


def _favorite(conn, listing_id, user_id) -> None:
    conn.execute(
        "INSERT INTO listing_favorites (id, listing_id, user_id, created_at) VALUES (?, ?, ?, ?)",
        (str(uuid.uuid4()), listing_id, user_id, server.now_iso()),
    )


def _make_post(conn, author_id, *, content="hello", region="jp.tokyo.tokyo", country="jp",
               created_ago_days=0, tags=None, weighted=0.0) -> str:
    pid = str(uuid.uuid4())
    ts = _iso_ago(days=created_ago_days) if created_ago_days else server.now_iso()
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, country, province, city, region_code, "
        "content_type, created_at, updated_at, last_activity_at, weighted_interaction_score) "
        "VALUES (?, ?, ?, 'active', ?, '', '', ?, 'dynamic', ?, ?, ?, ?)",
        (pid, author_id, content, country, region, ts, ts, ts, weighted),
    )
    for t in (tags or []):
        conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (pid, t))
    return pid


def _notifs(conn, uid, ntype) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM notifications WHERE user_id = ? AND type = ? AND deleted_at IS NULL",
        (uid, ntype),
    )]


def test_favorite_change(conn) -> None:
    seller = _make_user(conn)
    fan1 = _make_user(conn)
    fan2 = _make_user(conn)
    lid = _make_listing(conn, seller_id=seller, price=100000)
    _favorite(conn, lid, fan1)
    _favorite(conn, lid, fan2)
    _favorite(conn, lid, seller)  # author favorites own listing — must be excluded

    n = server.notify_favorite_listing_change(
        conn, lid, author_id=seller, title="良い部屋", kind="favorite_price_drop",
        old_price=100000, new_price=80000,
    )
    assert n == 2, f"both fans (not the author) should be notified, got {n}"
    assert len(_notifs(conn, fan1, "favorite_price_drop")) == 1
    assert len(_notifs(conn, fan2, "favorite_price_drop")) == 1
    assert len(_notifs(conn, seller, "favorite_price_drop")) == 0, "author must not be notified"
    row = _notifs(conn, fan1, "favorite_price_drop")[0]
    assert row["target_listing_id"] == lid, "notification must carry the listing id"
    assert "80,000" in (row["content"] or ""), f"content should show the new price: {row['content']}"

    n2 = server.notify_favorite_listing_change(
        conn, lid, author_id=seller, title="良い部屋", kind="favorite_closed",
    )
    assert n2 == 2
    assert len(_notifs(conn, fan1, "favorite_closed")) == 1
    assert "下架" in (_notifs(conn, fan2, "favorite_closed")[0]["content"] or "")

    # No favoriters -> zero, no crash.
    empty = _make_listing(conn, seller_id=seller, price=5000)
    assert server.notify_favorite_listing_change(
        conn, empty, author_id=seller, title="x", kind="favorite_closed") == 0
    print("  favorite_change OK")


def test_mentions(conn) -> None:
    # extract_mentions basics
    assert server.extract_mentions("hi @alice and @bob_1 and @alice again") == ["alice", "bob_1"]
    assert server.extract_mentions("no mentions here") == []
    assert server.extract_mentions("email a@b.com is not a mention of a") == []  # 'a' < 3 chars

    author = _make_user(conn, "author_x")
    alice = _make_user(conn, "alice_ment")
    bob = _make_user(conn, "bob_ment")
    pid = _make_post(conn, author, content="hey @alice_ment and @bob_ment and @nobody_here and @author_x")

    n = server.notify_mentions(conn, "hey @alice_ment and @bob_ment and @nobody_here and @author_x",
                               actor_id=author, post_id=pid)
    assert n == 2, f"only alice+bob are real, non-self handles, got {n}"
    assert len(_notifs(conn, alice, "mention")) == 1
    assert len(_notifs(conn, bob, "mention")) == 1
    assert len(_notifs(conn, author, "mention")) == 0, "self-mention must be skipped"

    # already_notified excludes a user (e.g. reply recipient).
    pid2 = _make_post(conn, author, content="@alice_ment @bob_ment")
    n2 = server.notify_mentions(conn, "@alice_ment @bob_ment", actor_id=author, post_id=pid2,
                                already_notified={alice})
    assert n2 == 1, f"alice already notified elsewhere -> only bob, got {n2}"
    assert len(_notifs(conn, bob, "mention")) == 2

    # duplicate handle pings once.
    pid3 = _make_post(conn, author, content="@alice_ment @alice_ment @alice_ment")
    n3 = server.notify_mentions(conn, "@alice_ment @alice_ment @alice_ment", actor_id=author, post_id=pid3)
    assert n3 == 1, f"duplicate @handle should notify once, got {n3}"
    print("  mentions OK")


def test_follow_digest(conn) -> None:
    follower = _make_user(conn)
    followed = _make_user(conn)
    stranger = _make_user(conn)
    # follower follows `followed`
    conn.execute("INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                 (str(uuid.uuid4()), follower, followed, server.now_iso()))
    # follower also follows a topic
    conn.execute("INSERT INTO topic_follows (user_id, tag, created_at) VALUES (?, ?, ?)",
                 (follower, "ramen", server.now_iso()))

    # followed posts something new (last day)
    _make_post(conn, followed, content="new from followed")
    # stranger posts under the followed topic
    _make_post(conn, stranger, content="best ramen #ramen", tags=["ramen"])

    sent = server.run_follow_digests(conn)
    assert sent >= 1, f"follower should get a digest, got {sent}"
    digs = _notifs(conn, follower, "follow_digest")
    assert len(digs) == 1, f"exactly one follow_digest, got {len(digs)}"
    assert not digs[0]["target_post_id"], "follow_digest lands the tab, no postId"
    content = digs[0]["content"] or ""
    assert "1 人" in content and "1 条新帖" in content, f"digest content wrong: {content}"

    # ~20h gate: an immediate second sweep sends nothing more to this user.
    again = server.run_follow_digests(conn)
    assert len(_notifs(conn, follower, "follow_digest")) == 1, "20h gate must suppress a re-digest"

    # a user who follows nobody with new content gets nothing.
    lonely = _make_user(conn)
    idle_followed = _make_user(conn)
    conn.execute("INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                 (str(uuid.uuid4()), lonely, idle_followed, server.now_iso()))
    server.run_follow_digests(conn)
    assert len(_notifs(conn, lonely, "follow_digest")) == 0, "no new content -> no digest"
    print("  follow_digest OK")


def test_city_digest(conn) -> None:
    # An inactive user (last session 5d ago) in tokyo with fresh listings.
    u = _make_user(conn, region="jp.tokyo.tokyo", city="tokyo", country="jp")
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, u, _iso_ago(days=10), _iso_ago(days=5), _iso_ago(days=-30)),
    )
    seller = _make_user(conn)
    _make_listing(conn, seller_id=seller, region="jp.tokyo.tokyo", published_ago_days=2)
    _make_listing(conn, seller_id=seller, region="jp.tokyo.tokyo", published_ago_days=3)
    _make_post(conn, seller, region="jp.tokyo.tokyo", weighted=5.0)

    sent = server.run_city_digests(conn)
    assert sent >= 1, f"inactive tokyo user should get a city_digest, got {sent}"
    digs = _notifs(conn, u, "city_digest")
    assert len(digs) == 1, f"one city_digest, got {len(digs)}"
    # Content carries a real, non-zero listing count (exact number depends on how
    # many tokyo listings the shared test DB holds — just assert it summarised
    # both the listing and hot-post streams).
    content = digs[0]["content"] or ""
    assert "房源" in content and "热帖" in content, f"city_digest should summarise both streams: {content}"

    # gate
    server.run_city_digests(conn)
    assert len(_notifs(conn, u, "city_digest")) == 1, "20h gate on city_digest"

    # An inactive user in an EMPTY region gets nothing (no nagging).
    u2 = _make_user(conn, region="jp.hokkaido.sapporo", city="sapporo", country="jp")
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, u2, _iso_ago(days=10), _iso_ago(days=5), _iso_ago(days=-30)),
    )
    server.run_city_digests(conn)
    assert len(_notifs(conn, u2, "city_digest")) == 0, "no real content -> no digest"

    # An ACTIVE user (seen today) is not in the recall window.
    u3 = _make_user(conn, region="jp.tokyo.tokyo", city="tokyo", country="jp")
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (uuid.uuid4().hex, u3, _iso_ago(days=1), server.now_iso(), _iso_ago(days=-30)),
    )
    server.run_city_digests(conn)
    assert len(_notifs(conn, u3, "city_digest")) == 0, "active user is not recalled"
    print("  city_digest OK")


def _make_upload(conn, owner, *, status="ready", created_ago_hours=72, entity_type="", entity_id="",
                 purpose="post_image") -> str:
    fid = str(uuid.uuid4())
    ts = _iso_ago(hours=created_ago_hours)
    conn.execute(
        "INSERT INTO uploaded_files (id, upload_id, user_id, bucket, object_key, content_type, purpose, "
        "entity_type, entity_id, status, created_at, updated_at) "
        "VALUES (?, ?, ?, 'local-dev', ?, 'image/jpeg', ?, ?, ?, ?, ?, ?)",
        (fid, uuid.uuid4().hex, owner, f"temp/{fid}.jpg", purpose, entity_type, entity_id, status, ts, ts),
    )
    return fid


def test_orphan_media_gc(conn) -> None:
    owner = _make_user(conn)
    # (a) orphan: ready, 72h old, never attached -> swept
    orphan = _make_upload(conn, owner)
    # (b) attached via entity_type -> kept
    attached = _make_upload(conn, owner, entity_type="post", entity_id="somepost")
    # (c) recent (2h old) -> kept
    recent = _make_upload(conn, owner, created_ago_hours=2)
    # (d) avatar purpose (URL-referenced) -> kept even though unattached + old
    avatar = _make_upload(conn, owner, purpose="avatar")
    # (e) unattached-by-entity but referenced by a post_media row -> kept
    referenced = _make_upload(conn, owner)
    pid = _make_post(conn, owner)
    # post_media.media_id FKs to media(id); create the mirror media row first.
    conn.execute(
        "INSERT INTO media (id, owner_id, type, url, mime, created_at) VALUES (?, ?, 'image', ?, 'image/jpeg', ?)",
        (referenced, owner, f"local://{referenced}", server.now_iso()),
    )
    conn.execute("INSERT INTO post_media (id, post_id, media_id, uploaded_file_id, sort_index) VALUES (?, ?, ?, ?, 0)",
                 (str(uuid.uuid4()), pid, referenced, referenced))

    swept = server.run_orphan_media_gc(conn)
    assert swept == 1, f"only the true orphan should be swept, got {swept}"

    def status_of(fid):
        return conn.execute("SELECT status FROM uploaded_files WHERE id = ?", (fid,)).fetchone()["status"]

    assert status_of(orphan) == "deleted", "orphan must be soft-deleted"
    assert status_of(attached) == "ready", "attached upload must be kept"
    assert status_of(recent) == "ready", "recent upload must be kept"
    assert status_of(avatar) == "ready", "avatar (URL-referenced) must be kept"
    assert status_of(referenced) == "ready", "post_media-referenced upload must be kept"
    print("  orphan_media_gc OK")


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        test_favorite_change(conn)
        test_mentions(conn)
        test_follow_digest(conn)
        test_city_digest(conn)
        test_orphan_media_gc(conn)
        conn.commit()
        print("OK")
    finally:
        conn.close()
        for ext in ("", "-wal", "-shm"):
            try:
                os.remove(_TMP_DB + ext)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
