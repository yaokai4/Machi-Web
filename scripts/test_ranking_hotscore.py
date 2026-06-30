#!/usr/bin/env python3
"""Smoke test for the v85 ranking foundation: denormalized engagement counters,
the hot_score refresher, the counter reconcile, and the rewritten heat SQL.

Runs against a throwaway SQLite DB. Exits non-zero on any failed assertion.
Usage:  python scripts/test_ranking_hotscore.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"ranking_test_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "ranking-test-pepper-not-for-prod"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} :: {detail}")


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        # 1) Migrations v85/v86 added the denormalized columns.
        cols = server._table_columns(conn, "posts")
        for c in ("like_count", "comment_count", "repost_count", "bookmark_count", "hot_score", "last_activity_at"):
            check(f"column {c} exists", c in cols, f"missing {c}; have {sorted(cols)}")

        # Seed a user + two posts.
        uid = "u_" + uuid.uuid4().hex[:8]
        now = server.now_iso()
        conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, created_at, updated_at, joined_at) "
            "VALUES (?, ?, ?, '', 'x', ?, ?, ?)",
            (uid, "ranker", "Ranker", now, now, now),
        )
        p_hot = "p_" + uuid.uuid4().hex[:8]
        p_cold = "p_" + uuid.uuid4().hex[:8]
        for pid in (p_hot, p_cold):
            conn.execute(
                "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type) "
                "VALUES (?, ?, ?, 'published', ?, ?, 'jp', 'dynamic')",
                (pid, uid, "hello", now, now),
            )

        # 2) bump_post_counter increments / clamps.
        server.bump_post_counter(conn, p_hot, "like_count", +1)
        server.bump_post_counter(conn, p_hot, "like_count", +1)
        server.bump_post_counter_for_kind(conn, p_hot, "comment", +1)
        server.bump_post_counter_for_kind(conn, p_hot, "bogus_kind", +1)  # ignored
        lk = conn.execute("SELECT like_count, comment_count FROM posts WHERE id = ?", (p_hot,)).fetchone()
        check("counter increments", lk["like_count"] == 2 and lk["comment_count"] == 1, dict(lk))
        server.bump_post_counter(conn, p_cold, "like_count", -1)  # clamp at 0
        cold = conn.execute("SELECT like_count FROM posts WHERE id = ?", (p_cold,)).fetchone()
        check("counter clamps at 0", cold["like_count"] == 0, dict(cold))

        # 3) refresh_hot_scores ranks the engaged post above the cold one and is
        #    > 0 for a fresh post even with zero engagement (freshness bonus).
        touched = server.refresh_hot_scores(conn)
        check("refresh touched rows", touched >= 2, touched)
        hot = conn.execute("SELECT hot_score FROM posts WHERE id = ?", (p_hot,)).fetchone()["hot_score"]
        cold_hs = conn.execute("SELECT hot_score FROM posts WHERE id = ?", (p_cold,)).fetchone()["hot_score"]
        check("engaged post outranks cold", hot > cold_hs, f"hot={hot} cold={cold_hs}")
        check("fresh zero-engagement post still scores > 0", cold_hs > 0, cold_hs)

        # 4) The rewritten heat SQL has no correlated subqueries and runs.
        heat_sql = server._heat_score_sql("p")
        check("heat sql drops interaction subqueries", "FROM interactions" not in heat_sql, heat_sql[:120])
        rows = list(conn.execute(
            f"SELECT p.id AS id, {heat_sql} AS heat FROM posts p WHERE p.deleted_at IS NULL ORDER BY heat DESC"
        ))
        check("heat query orders engaged first", rows and rows[0]["id"] == p_hot, [dict(r) for r in rows])

        # 5) Trending query (indexed hot_score path) returns the hot post first.
        tr = list(conn.execute(
            "SELECT id FROM posts WHERE deleted_at IS NULL AND status IN ('published','active') "
            "ORDER BY hot_score DESC LIMIT 20"
        ))
        check("trending hot_score order", tr and tr[0]["id"] == p_hot, [dict(r) for r in tr])

        # 6) reconcile_post_counters recomputes from source tables. Insert a raw
        #    interaction WITHOUT bumping, then reconcile should pick it up.
        conn.execute(
            "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'bookmark', ?)",
            (uuid.uuid4().hex, p_cold, uid, now),
        )
        server.reconcile_post_counters(conn)
        bm = conn.execute("SELECT bookmark_count FROM posts WHERE id = ?", (p_cold,)).fetchone()["bookmark_count"]
        check("reconcile picks up drift", bm == 1, bm)

        # 7) Happening radar (正在发生): an OLDER post with a fresh comment should
        #    outrank a slightly newer post with no activity. Build two posts with
        #    explicit ages, set last_activity_at on the old one to "now".
        from datetime import datetime, timezone, timedelta
        old_created = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        newer_created = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
        p_active_old = "p_" + uuid.uuid4().hex[:8]
        p_quiet_new = "p_" + uuid.uuid4().hex[:8]
        conn.execute(
            "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, last_activity_at) "
            "VALUES (?, ?, 'x', 'published', ?, ?, 'jp', 'dynamic', ?)",
            (p_active_old, uid, old_created, old_created, server.now_iso()),  # commented just now
        )
        conn.execute(
            "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, last_activity_at) "
            "VALUES (?, ?, 'x', 'published', ?, ?, 'jp', 'dynamic', '')",
            (p_quiet_new, uid, newer_created, newer_created),  # newer but no activity
        )
        hscore = server._happening_score_sql("p", {"happening_days": 2, "report_penalty": 20})
        check("happening sql has no subquery", "SELECT" not in hscore.upper(), hscore[:80])
        hap = list(conn.execute(
            f"SELECT p.id AS id, {hscore} AS s FROM posts p "
            "WHERE p.id IN (?, ?) ORDER BY s DESC",
            (p_active_old, p_quiet_new),
        ))
        check(
            "happening surfaces recently-active old post first",
            hap and hap[0]["id"] == p_active_old,
            [dict(r) for r in hap],
        )

        # 8) reconcile resets last_activity_at to '' when a post has no live comments.
        server.reconcile_post_counters(conn)
        la = conn.execute("SELECT last_activity_at FROM posts WHERE id = ?", (p_active_old,)).fetchone()["last_activity_at"]
        check("reconcile clears stale last_activity_at (no comments)", la == "", repr(la))

        conn.commit()
    finally:
        conn.close()
        try:
            _TMP.unlink()
        except OSError:
            pass

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
