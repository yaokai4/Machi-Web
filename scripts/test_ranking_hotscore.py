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
        #    interaction from ANOTHER user WITHOUT bumping, then reconcile should
        #    pick it up. (Must be a non-author interaction — see 6b.)
        other = "u_" + uuid.uuid4().hex[:8]
        conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, created_at, updated_at, joined_at) "
            "VALUES (?, ?, ?, '', 'x', ?, ?, ?)",
            (other, "fanuser", "Fan", now, now, now),
        )
        conn.execute(
            "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'bookmark', ?)",
            (uuid.uuid4().hex, p_cold, other, now),
        )
        server.reconcile_post_counters(conn)
        bm = conn.execute("SELECT bookmark_count FROM posts WHERE id = ?", (p_cold,)).fetchone()["bookmark_count"]
        check("reconcile picks up drift", bm == 1, bm)

        # 6b) Self-interactions must NOT count toward heat: an author liking their
        #     own post is written to interactions but never bumps the denormalized
        #     counter, and reconcile excludes it too (so the 6h self-heal can't
        #     drift it back up). Author (uid) self-likes p_cold; count stays 0.
        conn.execute(
            "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'like', ?)",
            (uuid.uuid4().hex, p_cold, uid, now),
        )
        server.reconcile_post_counters(conn)
        self_lk = conn.execute("SELECT like_count FROM posts WHERE id = ?", (p_cold,)).fetchone()["like_count"]
        check("reconcile excludes self-interactions", self_lk == 0, self_lk)

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

        # 8) reconcile falls back last_activity_at to created_at (NOT '') when a
        #    post has no live comments — the column must stay populated so the
        #    正在发生 radar can filter+sort on the bare column with an index.
        server.reconcile_post_counters(conn)
        la = conn.execute("SELECT last_activity_at, created_at FROM posts WHERE id = ?", (p_active_old,)).fetchone()
        check("reconcile falls back last_activity_at to created_at (no comments)",
              la["last_activity_at"] == la["created_at"] and la["last_activity_at"] != "",
              dict(la))

        # 9) B2: migration added hot_score_engaged + the index/unique columns.
        cols = server._table_columns(conn, "posts")
        check("hot_score_engaged column exists", "hot_score_engaged" in cols, sorted(cols))

        # 10) B2 item 7a — seed suppression: a seed post rides at 0.6× a non-seed
        #     post with the SAME engagement and age. Build a matched pair.
        s_created = server.now_iso()
        p_seed = "p_" + uuid.uuid4().hex[:8]
        p_ugc = "p_" + uuid.uuid4().hex[:8]
        # NOTE: hot_score now reads weighted_interaction_score (互刷边际递减) for
        # like/repost/bookmark heat, NOT the raw like_count (which stays a real
        # display count). In production both are derived from the interactions
        # table by reconcile_post_counters; here we set the weighted column
        # directly to the same magnitude to exercise the engagement-heat path.
        for pid, is_seed in ((p_seed, 1), (p_ugc, 0)):
            conn.execute(
                "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, "
                "last_activity_at, like_count, weighted_interaction_score, is_seed_content) "
                "VALUES (?, ?, 'x', 'published', ?, ?, 'jp', 'dynamic', ?, 100, 100, ?)",
                (pid, uid, s_created, s_created, s_created, is_seed),
            )
        server.refresh_hot_scores(conn)
        seed_hs = conn.execute("SELECT hot_score FROM posts WHERE id = ?", (p_seed,)).fetchone()["hot_score"]
        ugc_hs = conn.execute("SELECT hot_score FROM posts WHERE id = ?", (p_ugc,)).fetchone()["hot_score"]
        check("seed post suppressed below matched UGC post", seed_hs < ugc_hs, f"seed={seed_hs} ugc={ugc_hs}")
        check("seed multiplier ≈ 0.6", abs(seed_hs / ugc_hs - 0.6) < 0.01 if ugc_hs else False,
              f"ratio={seed_hs / ugc_hs if ugc_hs else 'n/a'}")

        # 11) B2 item 3b — report penalty is capped at -30 in hot_score. A post
        #     with 100 reports should lose 30, not 1000, of engagement heat.
        p_reported = "p_" + uuid.uuid4().hex[:8]
        # weighted_interaction_score carries the like heat that hot_score reads
        # (see note in test 10); set it to 50 to mirror like_count=50.
        conn.execute(
            "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, "
            "last_activity_at, like_count, weighted_interaction_score, report_count) "
            "VALUES (?, ?, 'x', 'published', ?, ?, 'jp', 'dynamic', ?, 50, 50, 100)",
            (p_reported, uid, s_created, s_created, s_created),
        )
        server.refresh_hot_scores(conn)
        rep_hs = conn.execute("SELECT hot_score FROM posts WHERE id = ?", (p_reported,)).fetchone()["hot_score"]
        # engagement 50 - capped 30 = 20 (× decay ≈ 1 for a brand-new post) > 0.
        # Without the cap it would be 50 - 1000 = deeply negative.
        check("report penalty capped (post survives a report barrage)", rep_hs > 0, rep_hs)

        # 12) B2 item 10 — hot_score_engaged excludes the freshness bonus. A
        #     brand-new zero-engagement post has hot_score > 0 (freshness) but
        #     hot_score_engaged == 0 (no engagement). Use a fresh post so no
        #     earlier drift contaminates the assertion.
        p_zero = "p_" + uuid.uuid4().hex[:8]
        z_created = server.now_iso()
        conn.execute(
            "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, last_activity_at) "
            "VALUES (?, ?, 'x', 'published', ?, ?, 'jp', 'dynamic', ?)",
            (p_zero, uid, z_created, z_created, z_created),
        )
        server.refresh_hot_scores(conn)
        fresh_row = conn.execute(
            "SELECT hot_score, hot_score_engaged FROM posts WHERE id = ?", (p_zero,)
        ).fetchone()
        check("hot_score_engaged strips freshness bonus",
              fresh_row["hot_score"] > 0 and fresh_row["hot_score_engaged"] == 0,
              dict(fresh_row))

        # 13) B2 item 11 — the UNIQUE(target_id,user_id,kind) index rejects a
        #     duplicate interaction (OR IGNORE makes the write idempotent).
        dup_uid = "u_" + uuid.uuid4().hex[:8]
        conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, created_at, updated_at, joined_at) "
            "VALUES (?, ?, ?, '', 'x', ?, ?, ?)",
            (dup_uid, "dupper", "Dup", now, now, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'like', ?)",
            (uuid.uuid4().hex, p_hot, dup_uid, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'like', ?)",
            (uuid.uuid4().hex, p_hot, dup_uid, now),
        )
        dup_n = conn.execute(
            "SELECT COUNT(*) AS c FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'like'",
            (p_hot, dup_uid),
        ).fetchone()["c"]
        check("interactions UNIQUE index dedupes double-like", dup_n == 1, dup_n)

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
