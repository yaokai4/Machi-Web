#!/usr/bin/env python3
"""BE3 feed-ranking professionalization tests: fresh-injection slots, cursor
contract, cold-start continuation, initial hot_score on create, incremental
weighted_interaction_score, the two-lane 热榜 candidate scan, the follow-author
profile bonus and the post-region fallback. Drives the real server.py handlers
through a minimal fake request (no HTTP/login stack), same harness as
test_ranking_b3.py.

Covers:
  - 新帖注入槽必出现: an under-exposed fresh post that the interest ranking would
    never surface still appears on the personalized page 1 (epsilon-greedy slot).
  - 游标严格递减: personalized page-1 cursor > page-2 cursor (tuple compare on
    the decoded (created_at, id)) and the two pages never overlap.
  - 冷启动续页不跳档: the cold-start mix's continuation anchor stays on the
    recency side (not dragged down to a days-old hot post), so page 2 resumes at
    the true timeline break instead of skipping days of content.
  - api_create_post writes an initial hot_score (real-first band + fresh peak)
    and hot_score_engaged=0, and falls back region → current_region_code → 'jp'.
  - api_post_interaction adjusts weighted_interaction_score in real time
    (kind weight × new-account factor, clamped at 0 on the way down).
  - 热榜 candidates ride the hot_score_engaged main lane + recency side lane: a
    post with stale hot_score=0 but real engagement makes the board, and a
    brand-new zero-engagement post is a candidate via the recency lane.
  - follows feed the interest profile (followed author gets positive weight and
    activates the profile).
  - _inject_fresh_slots unit behavior (all-fresh injected when few, top pick
    kept, limit respected).

Runs against a throwaway SQLite DB. Exits non-zero on any failed assertion.
Usage:  python scripts/test_feed_ranking.py
"""

import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"feed_ranking_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "feed-ranking-pepper-not-for-prod"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail="") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} :: {detail}")


class FakeReq(server.Handler):
    def __init__(self, user, body=None):  # noqa: D401 - not calling super().__init__
        self._user = user
        self._body = body or {}
        self.sent = None
        self._request_id = "test"

    def read_json(self):
        return self._body

    def send_json(self, data, status=200):
        self.sent = (status, data)

    def current_session(self, conn):
        return {"user_id": self._user["id"]} if self._user else None


def call(method_name, user, conn, *args, body=None):
    req = FakeReq(user, body)
    try:
        getattr(req, method_name)(conn, *args)
        return ("ok", req.sent[1] if req.sent else None)
    except server.APIError as exc:
        return ("err", exc.code)


def iso_ago(hours: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def mk_user(conn, handle, country="jp", created_at=None, current_region_code=""):
    uid = str(uuid.uuid4())
    now = created_at or server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, joined_at, created_at, updated_at, country, current_region_code) "
        "VALUES (?, ?, ?, '', 'x', 'member', ?, ?, ?, ?, ?)",
        (uid, handle, handle, now, now, now, country, current_region_code),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def mk_post(conn, author_id, content="hello world", hours_ago=0.0, tags=None,
            region_code="", ct="dynamic"):
    pid = str(uuid.uuid4())
    ts = iso_ago(hours_ago)
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, region_code, content_type, last_activity_at) "
        "VALUES (?, ?, ?, 'active', ?, ?, 'jp', ?, ?, ?)",
        (pid, author_id, content, ts, ts, region_code, ct, ts),
    )
    for tag in (tags or []):
        conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (pid, tag))
    return pid


def post_col(conn, pid, col):
    return conn.execute(f"SELECT {col} AS v FROM posts WHERE id = ?", (pid,)).fetchone()["v"]


def item_ids(payload):
    return [it.get("id") for it in (payload or {}).get("items", [])]


def main() -> None:  # noqa: C901 - linear test script
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        # ================= E) fresh-injection slot + cursor strictly decreasing
        pop = mk_user(conn, "popauthor")
        viewer_a = mk_user(conn, "viewer_a")
        newcomer = mk_user(conn, "newcomer")
        pop_posts = [
            mk_post(conn, pop["id"], f"pop {i}", hours_ago=200 + i, tags=["ramen"])
            for i in range(10)
        ]
        filler_authors = [mk_user(conn, f"filler{i}") for i in range(10)]
        fillers = []  # (pid, hours_ago), ages 30..99h, one per hour
        for i in range(70):
            aid = filler_authors[i % 10]["id"]
            fillers.append((mk_post(conn, aid, f"filler {i}", hours_ago=30 + i, tags=["ramen"]), 30 + i))
        # The under-exposed fresh post: 20h old, no tags, zero engagement — the
        # interest ranking scores it far below the 70 ramen-matched fillers, so
        # ONLY the injection slot can put it on page 1.
        fresh_post = mk_post(conn, newcomer["id"], "brand new voice", hours_ago=20)
        # Interest profile: viewer_a liked 3 pop posts (dynamic + #ramen).
        for pid in pop_posts[:3]:
            conn.execute(
                "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'like', ?)",
                (uuid.uuid4().hex, pid, viewer_a["id"], server.now_iso()),
            )
        server._cache_invalidate(f"recprofile:{viewer_a['id']}")
        st, page1 = call("api_feed", viewer_a, conn, {"mode": "recommend", "country": "jp"})
        ids1 = item_ids(page1)
        check("personalized page served", st == "ok" and (page1 or {}).get("personalized") is True,
              (st, (page1 or {}).keys()))
        check("新帖注入槽必出现: under-exposed fresh post on page 1",
              fresh_post in ids1, f"fresh={fresh_post} ids={ids1}")
        c1 = (page1 or {}).get("next_cursor")
        dec1 = server.cursor_decode(c1)
        check("page-1 next_cursor present + decodable", bool(c1) and dec1 is not None, c1)
        st, page2 = call("api_feed", viewer_a, conn,
                         {"mode": "recommend", "country": "jp", "cursor": c1})
        ids2 = item_ids(page2)
        c2 = (page2 or {}).get("next_cursor")
        dec2 = server.cursor_decode(c2)
        check("page 2 returns rows below the pool", st == "ok" and len(ids2) > 0, (st, len(ids2)))
        check("游标严格递减: page-2 cursor < page-1 cursor",
              dec2 is not None and (dec2[0], dec2[1]) < (dec1[0], dec1[1]), (dec1, dec2))
        check("page 1 ∩ page 2 = ∅ (no duplicate delivery across the seam)",
              not (set(ids1) & set(ids2)), set(ids1) & set(ids2))

        # ================= F) cold-start continuation anchor stays on recency side
        hot_author = mk_user(conn, "hotauthor")
        old_hot = mk_post(conn, hot_author["id"], "old but hot", hours_ago=144)
        conn.execute(
            "UPDATE posts SET hot_score = 800, hot_score_engaged = 50, like_count = 20 WHERE id = ?",
            (old_hot,),
        )
        viewer_b = mk_user(conn, "viewer_b")  # no interactions, no follows
        st, cold1 = call("api_feed", viewer_b, conn, {"mode": "recommend", "country": "jp"})
        cids1 = item_ids(cold1)
        check("cold-start page served", st == "ok" and (cold1 or {}).get("coldStart") is True,
              (st, (cold1 or {}).keys()))
        check("cold-start surfaces the hot post", old_hot in cids1, cids1)
        cc = (cold1 or {}).get("next_cursor")
        cdec = server.cursor_decode(cc)
        old_hot_created = post_col(conn, old_hot, "created_at")
        check("冷启动锚点不被拖到 7 天前的热帖",
              cdec is not None and cdec[0] > old_hot_created, (cdec, old_hot_created))
        # The newest not-yet-shown post below the anchor must arrive on page 2 —
        # with the old (buggy) anchor the whole band (anchor … old_hot] was skipped.
        gap_row = conn.execute(
            "SELECT id FROM posts WHERE created_at < ? AND created_at > ? AND deleted_at IS NULL "
            "AND id NOT IN (%s) ORDER BY created_at DESC, id DESC LIMIT 1"
            % ",".join("?" * len(cids1)),
            (cdec[0], old_hot_created, *cids1),
        ).fetchone()
        st, cold2 = call("api_feed", viewer_b, conn,
                         {"mode": "recommend", "country": "jp", "cursor": cc})
        cids2 = item_ids(cold2)
        check("冷启动续页不跳档: first unshown post below anchor appears on page 2",
              gap_row is not None and gap_row["id"] in cids2,
              (gap_row["id"] if gap_row else None, cids2[:5]))
        check("cold-start pages do not overlap", not (set(cids1) & set(cids2)),
              set(cids1) & set(cids2))

        # ================= A) create-post: region fallback + initial hot_score
        u_noregion = mk_user(conn, "noregion", country="")
        st, resp = call("api_create_post", u_noregion, conn,
                        body={"content": "regionless post should land in jp"})
        check("post without any region succeeds", st == "ok" and resp and resp.get("post"), st)
        p_a = (resp or {}).get("post", {}).get("id")
        check("region 兜底: country falls back to 'jp'",
              post_col(conn, p_a, "country") == "jp", post_col(conn, p_a, "country"))
        hs = float(post_col(conn, p_a, "hot_score") or 0)
        check("发帖即写初始 hot_score(real-first band + fresh peak)",
              server.REAL_FIRST_FLOOR < hs <= server.REAL_FIRST_FLOOR + server.HOT_SCORE_FRESH_PEAK, hs)
        check("initial hot_score_engaged stays 0 (热搜 tag SUM 不被污染)",
              float(post_col(conn, p_a, "hot_score_engaged") or 0) == 0.0,
              post_col(conn, p_a, "hot_score_engaged"))
        u_rc = mk_user(conn, "hasregioncode", country="", current_region_code="jp.tokyo.shibuya")
        st, resp = call("api_create_post", u_rc, conn, body={"content": "profile region code wins"})
        p_rc = (resp or {}).get("post", {}).get("id")
        check("region 兜底: current_region_code is used when set",
              st == "ok" and post_col(conn, p_rc, "region_code") == "jp.tokyo.shibuya"
              and post_col(conn, p_rc, "country") == "jp",
              (post_col(conn, p_rc, "region_code"), post_col(conn, p_rc, "country")))

        # ================= B) incremental weighted_interaction_score
        b_author = mk_user(conn, "b_author")
        fan_old = mk_user(conn, "fan_old", created_at=iso_ago(120))  # aged account, factor 1.0
        fan_new = mk_user(conn, "fan_new")                            # <48h account, factor 0.3
        p_b = mk_post(conn, b_author["id"], "weighted target")
        call("api_post_interaction", fan_old, conn, p_b, "like", True, body={})
        w = float(post_col(conn, p_b, "weighted_interaction_score") or 0)
        check("like from aged account adds 1.0 immediately", abs(w - 1.0) < 1e-9, w)
        call("api_post_interaction", fan_new, conn, p_b, "bookmark", True, body={})
        w = float(post_col(conn, p_b, "weighted_interaction_score") or 0)
        check("bookmark from <48h account adds 4×0.3", abs(w - 2.2) < 1e-9, w)
        call("api_post_interaction", fan_old, conn, p_b, "like", False, body={})
        w = float(post_col(conn, p_b, "weighted_interaction_score") or 0)
        check("un-like symmetrically subtracts (clamped ≥ 0)", abs(w - 1.2) < 1e-9, w)

        # ================= C) follows feed the interest profile
        viewer_c = mk_user(conn, "viewer_c")
        author_c = mk_user(conn, "author_c")
        conn.execute(
            "INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
            (uuid.uuid4().hex, viewer_c["id"], author_c["id"], server.now_iso()),
        )
        server._cache_invalidate(f"recprofile:{viewer_c['id']}")
        profile = FakeReq(viewer_c)._recommend_interest_profile(conn, viewer_c["id"])
        check("followed author carries positive profile weight",
              (profile.get("authors") or {}).get(author_c["id"], 0) > 0, profile.get("authors"))
        check("follows alone activate the profile", profile.get("active") is True,
              profile.get("active"))

        # ================= D) 热榜 two-lane candidates (engaged main + recency side)
        rc = "jp.testville"  # unknown metro → exact single-code isolation
        d_authors = [mk_user(conn, f"d_auth{i}") for i in range(8)]
        engaged_v = mk_post(conn, d_authors[0]["id"], "engaged but stale hot_score",
                            hours_ago=72, region_code=rc)
        conn.execute(
            "UPDATE posts SET hot_score = 0, hot_score_engaged = 100, like_count = 10 WHERE id = ?",
            (engaged_v,),
        )
        for i in range(12):
            pid = mk_post(conn, d_authors[1 + i % 6]["id"], f"d filler {i}",
                          hours_ago=40, region_code=rc)
            conn.execute(
                "UPDATE posts SET hot_score = 5, hot_score_engaged = ? WHERE id = ?",
                (1 + i, pid),
            )
        fresh_v = mk_post(conn, d_authors[7]["id"], "zero-engagement newborn",
                          hours_ago=0, region_code=rc)
        server._cache_invalidate("explore:")
        st, hotp = call("api_feed", viewer_a, conn,
                        {"mode": "hot", "limit": "3", "region_code": rc, "exact": "1"})
        hids = item_ids(hotp)
        check("engaged post with hot_score=0 makes the board (main lane)",
              st == "ok" and engaged_v in hids, (st, hids))
        check("brand-new zero-engagement post makes the board (recency side lane)",
              fresh_v in hids, hids)
        hc1 = (hotp or {}).get("next_cursor")
        hdec1 = server.cursor_decode(hc1)
        st, hotp2 = call("api_feed", viewer_a, conn,
                         {"mode": "hot", "limit": "3", "region_code": rc, "exact": "1",
                          "cursor": hc1})
        hids2 = item_ids(hotp2)
        hdec2 = server.cursor_decode((hotp2 or {}).get("next_cursor"))
        check("hot page-2 never repeats page 1", not (set(hids) & set(hids2)),
              set(hids) & set(hids2))
        check("hot cursor strictly decreases (or terminates)",
              hdec2 is None or (hdec2[0], hdec2[1]) < (hdec1[0], hdec1[1]), (hdec1, hdec2))

        # ================= G) _inject_fresh_slots unit behavior
        ranked = [{"id": f"r{i}", "view_count": 0} for i in range(20)]
        fresh = [{"id": f"f{i}", "view_count": i} for i in range(3)]
        out = server._inject_fresh_slots([dict(r) for r in ranked], [dict(f) for f in fresh], 20, 4)
        oids = [r["id"] for r in out]
        check("few fresh candidates ⇒ all injected", all(f"f{i}" in oids for i in range(3)), oids)
        check("injection keeps the top personalized pick at slot 0", oids and oids[0] == "r0", oids[:3])
        check("injection respects the page limit", len(out) <= 20, len(out))
        check("limit<2 leaves the page untouched",
              [r["id"] for r in server._inject_fresh_slots([dict(ranked[0])], fresh, 1, 1)] == ["r0"],
              None)

        conn.commit()

    try:
        _TMP.unlink()
    except OSError:
        pass

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
