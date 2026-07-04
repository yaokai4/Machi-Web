#!/usr/bin/env python3
"""Tests for: real-first ranking (真人内容优先), new-user auto avatars, email
recipient exclusion + 指定用户, and admin user filtering (real/seed/deleted).

Throwaway SQLite DB; drives the real server.py handlers.

Usage:  python scripts/test_realfirst_and_targeting.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"rft_{uuid.uuid4().hex}.db"
os.environ.update(
    KAIX_DB_PATH=str(_TMP), KAIX_ENV="production", KAIX_ALLOW_SQLITE_IN_PRODUCTION="1",
    KAIX_PASSWORD_PEPPER="rft-test", KAIX_ADMIN_HANDLE="admin", KAIX_ADMIN_INITIAL_PASSWORD="Admin12345",
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name}  {detail}")


class Req(server.Handler):
    def __init__(self, user=None, body=None, query=None):
        self._user = user
        self._body = body or {}
        self._query = query or {}
        self.sent = None
        self._request_id = "t"

    def read_json(self):
        return self._body

    def send_json(self, data, status=200):
        self.sent = (status, data)

    def current_session(self, conn):
        return {"user_id": self._user["id"]} if self._user else None


def mkuser(conn, handle, email="", deleted=False, persona=False):
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, deleted_at, "
        "joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'member', ?, ?, ?, ?)",
        (uid, handle, handle, email, server.hash_password("Real12345"),
         (now if deleted else None), now, now, now),
    )
    if persona:
        server._ensure_content_pack_users_table(conn)
        conn.execute("INSERT INTO content_pack_users (user_id, handle, pack_version, created_at) VALUES (?, ?, 'v1', ?)",
                     (uid, handle, now))
    return uid


def mkpost(conn, author, seed, likes):
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        """INSERT INTO posts (id, author_id, content, view_count, status, country, province, city, region_code,
           content_type, attributes, language, is_seed_content, like_count, weighted_interaction_score,
           is_boosted, boost_weight, boosted_until, created_at, updated_at, last_activity_at)
           VALUES (?, ?, ?, 1, 'active', 'jp', 'tokyo', 'tokyo', 'jp.tokyo.tokyo', 'dynamic', '', 'zh',
                   ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (pid, author, ("seed post" if seed else "real post"), 1 if seed else 0, likes, float(likes),
         1 if seed else 0, 45 if seed else 0, (now if seed else ''), now, now, now),
    )
    return pid


def main() -> int:
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        admin = dict(conn.execute("SELECT * FROM users WHERE handle='admin'").fetchone())
        ra = mkuser(conn, "realauthor", "real@example.com")
        sa = mkuser(conn, "seedbot", persona=True)
        real_post = mkpost(conn, ra, seed=False, likes=0)     # real, zero engagement
        seed_post = mkpost(conn, sa, seed=True, likes=999)    # seed, 999 simulated likes + boost

        print("\n[A] real-first ranking (真人内容优先, default ON)")
        server.refresh_hot_scores(conn, force_full=True)
        hr = conn.execute("SELECT hot_score FROM posts WHERE id=?", (real_post,)).fetchone()[0]
        hs = conn.execute("SELECT hot_score FROM posts WHERE id=?", (seed_post,)).fetchone()[0]
        check("真人帖 hot_score 越过绝对地板、压过刷赞种子帖", hr >= server.REAL_FIRST_FLOOR > hs, f"real={hr:.0f} seed={hs:.0f}")
        hre = conn.execute("SELECT hot_score_engaged FROM posts WHERE id=?", (real_post,)).fetchone()[0]
        check("hot_score_engaged 不加地板（热搜标签热度不被冲垮）", hre < server.REAL_FIRST_FLOOR, f"engaged={hre}")

        cfg = server._explore_rank_config(conn)
        ranked, _, _ = Req()._explore_ranked_posts(conn, {}, kind="hot", days=7, limit=10, viewer_id=None, config=cfg)
        ids = [r["id"] for r in ranked]
        check("热榜里真人帖排在种子帖之前", ids.index(real_post) < ids.index(seed_post))

        # within-tier monotonic: a more-engaged real post outranks a quieter real post
        rb = mkuser(conn, "realauthor2", "real2@example.com")
        real_hi = mkpost(conn, rb, seed=False, likes=50)
        server.refresh_hot_scores(conn, force_full=True)
        h_hi = conn.execute("SELECT hot_score FROM posts WHERE id=?", (real_hi,)).fetchone()[0]
        check("同为真人：engagement 高的排更高（地板没抹平层内顺序）", h_hi > hr, f"hi={h_hi:.0f} lo={hr:.0f}")

        print("\n[B] toggle OFF reverts to legacy (刷赞种子帖重新压过真人)")
        server._upsert_site_settings(conn, {"explore_real_first": "0"})
        server.refresh_hot_scores(conn, force_full=True)
        hr2 = conn.execute("SELECT hot_score FROM posts WHERE id=?", (real_post,)).fetchone()[0]
        hs2 = conn.execute("SELECT hot_score FROM posts WHERE id=?", (seed_post,)).fetchone()[0]
        check("关掉后真人不再有地板、种子帖凭刷赞反超", hr2 < server.REAL_FIRST_FLOOR and hs2 > hr2, f"real={hr2:.0f} seed={hs2:.0f}")
        server._upsert_site_settings(conn, {"explore_real_first": "1"})
        server.refresh_hot_scores(conn, force_full=True)

        print("\n[C] cold-start: seed-only city still fills the board")
        # Clear real posts' visibility by using a fresh region with only a seed post.
        sc = mkuser(conn, "seedbot2", persona=True)
        seed_only_post = mkpost(conn, sc, seed=True, likes=10)
        conn.execute("UPDATE posts SET region_code='jp.osaka.osaka', city='osaka', province='osaka' WHERE id=?", (seed_only_post,))
        server.refresh_hot_scores(conn, force_full=True)
        cfg = server._explore_rank_config(conn)
        ranked2, _, _ = Req()._explore_ranked_posts(conn, {"country": "jp", "province": "osaka", "city": "osaka"},
                                                     kind="hot", days=7, limit=10, viewer_id=None, config=cfg)
        check("纯种子城市热榜非空（不会因真人优先而空白）", any(r["id"] == seed_only_post for r in ranked2) or len(ranked2) > 0)

        print("\n[D] new-user auto avatar")
        server._upsert_site_settings(conn, {"auto_avatar_new_users": "1"})
        av_on = server.assigned_default_avatar(conn, "freshuser")
        server._upsert_site_settings(conn, {"auto_avatar_new_users": "0"})
        av_off = server.assigned_default_avatar(conn, "freshuser")
        check("默认给新用户分配 https 头像", av_on.startswith("https://"), av_on[:30])
        check("关掉后返回空（回到空白默认）", av_off == "")
        server._upsert_site_settings(conn, {"auto_avatar_new_users": "1"})

        print("\n[E] email recipients exclude AI/deleted; 指定用户 works")
        mkuser(conn, "real3", "real3@example.com")
        mkuser(conn, "banned3", "banned3@example.com", deleted=True)
        mkuser(conn, "persona3", "persona3@seed.machi.local", persona=True)
        rows = server.campaign_recipient_rows(conn, "all")
        emails = {r["email"] for r in rows}
        check("群发'全部'排除 AI persona 与 @seed.machi.local", not any(e.endswith("@seed.machi.local") for e in emails))
        check("群发'全部'排除已封禁账号", "banned3@example.com" not in emails)
        check("真实用户在收件列表内", "real3@example.com" in emails and "real@example.com" in emails)
        # selected: pick a real + persona + banned → only the real survives
        real3_id = conn.execute("SELECT id FROM users WHERE handle='real3'").fetchone()[0]
        persona3_id = conn.execute("SELECT id FROM users WHERE handle='persona3'").fetchone()[0]
        banned3_id = conn.execute("SELECT id FROM users WHERE handle='banned3'").fetchone()[0]
        sel = server.campaign_recipient_rows(conn, "selected", [real3_id, persona3_id, banned3_id])
        check("指定用户仍套用排除规则（只留真实用户）", [r["email"] for r in sel] == ["real3@example.com"])

        print("\n[F] admin user filter real/seed/deleted")
        def users(filt):
            r = Req(admin, query={"filter": filt} if filt else {})
            r.api_admin_users(conn, r._query)
            return r.sent[1]
        realr, seedr, delr = users("real"), users("seed"), users("deleted")
        check("真实用户筛选不含生成/封禁用户", all(not it["isSeed"] and not it["deleted_at"] for it in realr["items"]))
        check("生成用户筛选只含 persona", all(it["isSeed"] for it in seedr["items"]) and seedr["items"])
        check("已封禁筛选只含 deleted_at", all(it["deleted_at"] for it in delr["items"]) and delr["items"])
        check("返回真实/生成/封禁计数", realr.get("realTotal", 0) > 0 and realr.get("seedTotal", 0) > 0 and realr.get("deletedTotal", 0) > 0)

        print("\n[G] 推荐 (recommend): real-first partition beats interest match")
        rq = Req()
        rq._real_first_flag = True
        pool = [
            {"id": "seedp", "is_seed_content": 1, "content_type": "guide", "author_id": "a1",
             "topic_slugs": "东京", "created_at": server.now_iso()},
            {"id": "realp", "is_seed_content": 0, "content_type": "dynamic", "author_id": "a2",
             "topic_slugs": "", "created_at": server.now_iso()},
        ]
        # Profile strongly matches the SEED post (guide + 东京) — interest alone
        # would rank it first; real-first must still put the real post above it.
        profile = {"active": True, "types": {"guide": 1.0}, "topics": {"东京": 1.0},
                   "authors": {}, "neg_topics": {}, "neg_authors": {}, "seen": set(), "dismissed": set()}
        ranked = rq._recommend_rank(pool, profile, 10, mmr_config=None)
        rids = [r["id"] for r in ranked]
        check("兴趣匹配的种子帖仍排在真人帖之后", rids.index("realp") < rids.index("seedp"), str(rids))

        print("\n[H] soft-deleted persona never becomes a phantom follower")
        from datetime import datetime, timezone
        import secrets
        tgt = mkuser(conn, "follow_target")
        live = [mkuser(conn, f"live_p{i}", persona=True) for i in range(4)]
        dead = mkuser(conn, "dead_p", persona=True)
        server.anonymize_user_account(conn, dead)  # sets deleted_at, keeps content_pack_users row
        personas = set(server.seed_user_ids(conn))  # unfiltered (includes dead)
        pc = {r["user_id"]: r["created_at"] for r in conn.execute(
            "SELECT cpu.user_id, u.created_at FROM content_pack_users cpu JOIN users u ON u.id=cpu.user_id WHERE u.deleted_at IS NULL")}
        res = server._apply_seed_follower_target(conn, user_id=tgt, target=999, personas=personas,
              persona_created=pc, rng=secrets.SystemRandom(), now=datetime.now(timezone.utc))
        dead_follows = conn.execute("SELECT 1 FROM follows WHERE follower_id=? AND following_id=?", (dead, tgt)).fetchone()
        # Robust vs shared DB state: no follower may be a deleted account, and the
        # 4 live personas we just made must be included.
        followers = [r[0] for r in conn.execute("SELECT follower_id FROM follows WHERE following_id=?", (tgt,))]
        none_deleted = all(conn.execute("SELECT deleted_at FROM users WHERE id=?", (f,)).fetchone()[0] is None for f in followers)
        check("已注销 persona 不会被加成粉丝（幻影粉丝修复）",
              not dead_follows and none_deleted and set(live).issubset(set(followers)),
              f"added={res['added']} dead_follows={bool(dead_follows)} none_deleted={none_deleted}")
        # anonymize clears the account's own follow edges (no phantom count on others)
        other = mkuser(conn, "followed_by_erased")
        conn.execute("INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                     (str(uuid.uuid4()), live[0], other, server.now_iso()))
        server.anonymize_user_account(conn, live[0])
        check("注销账号会清掉其关注边（不再虚增他人粉丝数）",
              conn.execute("SELECT COUNT(*) FROM follows WHERE following_id=?", (other,)).fetchone()[0] == 0)

    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
