#!/usr/bin/env python3
"""B3 ranking phase-2 tests: negative feedback (不感兴趣 / dismiss) and the
topic_rank_snapshots-backed rankDelta. Drives the real server.py handlers /
helpers through a minimal fake request (no HTTP/login stack).

Covers:
  - A 'dismiss' interaction is written but never bumps heat (like_count stays 0).
  - The interest profile records a dismissed post's id + negative author/tag
    weights, and _recommend_rank hard-drops the dismissed post from the ranking.
  - capture_topic_rank_snapshots writes per-scope snapshots and _previous_topic_ranks
    reads the latest prior snapshot back, so api_discover_hot reports a real
    (non-zero) rankDelta once a tag's rank moves between snapshots.

Runs against a throwaway SQLite DB. Exits non-zero on any failed assertion.
Usage:  python scripts/test_ranking_b3.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"ranking_b3_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "ranking-b3-pepper-not-for-prod"
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


def mk_user(conn, handle):
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, joined_at, created_at, updated_at, country) "
        "VALUES (?, ?, ?, '', 'x', 'member', ?, ?, ?, 'jp')",
        (uid, handle, handle, now, now, now),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def mk_post(conn, author_id, content="hello world", tags=None):
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, last_activity_at) "
        "VALUES (?, ?, ?, 'active', ?, ?, 'jp', 'dynamic', ?)",
        (pid, author_id, content, now, now, now),
    )
    for tag in (tags or []):
        conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (pid, tag))
    return pid


def like_count(conn, pid):
    return conn.execute("SELECT like_count FROM posts WHERE id = ?", (pid,)).fetchone()["like_count"]


def main() -> None:
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        author = mk_user(conn, "b3author")
        viewer = mk_user(conn, "b3viewer")

        # --- 1) dismiss is written but never bumps heat ---
        p = mk_post(conn, author["id"], tags=["ramen"])
        st, _ = call("api_post_interaction", viewer, conn, p, "dismiss", True, body={})
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'dismiss'",
            (p, viewer["id"]),
        ).fetchone()
        check("dismiss writes the interactions row", st == "ok" and row["c"] == 1, (st, row["c"]))
        check("dismiss does NOT bump like_count (heat)", like_count(conn, p) == 0, like_count(conn, p))

        # --- 2) the interest profile records the dismiss as a negative signal ---
        # Bust any cached profile so the fresh scan sees the dismiss row.
        server._cache_invalidate(f"recprofile:{viewer['id']}")
        profile = viewer_profile = None
        # _recommend_interest_profile is a method on the handler.
        req = FakeReq(viewer)
        profile = req._recommend_interest_profile(conn, viewer["id"])
        check("dismissed post id captured in profile", p in (profile.get("dismissed") or set()),
              sorted(profile.get("dismissed") or set()))
        check("dismissed author gets a negative weight",
              (profile.get("neg_authors") or {}).get(author["id"], 0) > 0,
              profile.get("neg_authors"))
        check("dismissed tag gets a negative weight",
              (profile.get("neg_topics") or {}).get("ramen", 0) > 0,
              profile.get("neg_topics"))

        # --- 3) _recommend_rank hard-drops the dismissed post ---
        # Build a candidate pool of three posts (incl. the dismissed one) and an
        # active profile; the dismissed post must not appear in the ranking.
        other = mk_post(conn, author["id"], content="keep me A")
        other2 = mk_post(conn, author["id"], content="keep me B")
        pool = [
            dict(conn.execute("SELECT * FROM posts WHERE id = ?", (pid,)).fetchone())
            for pid in (p, other, other2)
        ]
        # Force an "active" profile so the ranker actually runs its scoring path.
        active_profile = dict(profile)
        active_profile["active"] = True
        active_profile["types"] = {"dynamic": 1.0}  # give it something positive
        ranked = req._recommend_rank(pool, active_profile, limit=10)
        ranked_ids = {r.get("id") for r in ranked}
        check("dismissed post hard-dropped from ranking", p not in ranked_ids, ranked_ids)
        check("non-dismissed posts survive ranking",
              other in ranked_ids and other2 in ranked_ids, ranked_ids)

        # --- 4) snapshot rankDelta: two snapshots with a rank swap → real delta ---
        # Two tags on the national/jp board. First give #alpha more heat than
        # #beta, snapshot, then flip the heat so #beta outranks #alpha, snapshot
        # again, and confirm api_discover_hot reports the movement.
        pa = mk_post(conn, author["id"], content="alpha topic", tags=["alpha"])
        pb = mk_post(conn, author["id"], content="beta topic", tags=["beta"])
        # Heat rides hot_score_engaged (what the board sums). Set directly.
        conn.execute("UPDATE posts SET hot_score_engaged = 100 WHERE id = ?", (pa,))
        conn.execute("UPDATE posts SET hot_score_engaged = 10 WHERE id = ?", (pb,))
        n1 = server.capture_topic_rank_snapshots(conn)
        check("first snapshot pass captured boards", n1 >= 1, n1)
        prev = server._previous_topic_ranks(conn, server._topic_snapshot_scope_key("national", "jp"), "7d")
        check("snapshot records alpha above beta",
              prev.get("alpha", {}).get("rank", 99) < prev.get("beta", {}).get("rank", 99),
              prev)

        # Flip: beta now hotter than alpha.
        conn.execute("UPDATE posts SET hot_score_engaged = 5 WHERE id = ?", (pa,))
        conn.execute("UPDATE posts SET hot_score_engaged = 200 WHERE id = ?", (pb,))
        # Read the national jp board — rankDelta must reflect the swap vs snapshot.
        server._cache_invalidate("discover:hot:")
        st, payload = call(
            "api_discover_hot", viewer, conn,
            {"scope": "national", "window": "7d", "region_code": "jp"},
        )
        items = {it["title"]: it for it in (payload or {}).get("items", [])}
        beta = items.get("#beta") or {}
        alpha = items.get("#alpha") or {}
        # beta climbed from rank 2 → rank 1 ⇒ rankDelta = prev(2) - now(1) = +1.
        check("beta reports a positive rankDelta after climbing",
              beta.get("rankDelta", 0) > 0, {"beta": beta.get("rankDelta"), "alpha": alpha.get("rankDelta")})
        check("alpha reports a negative rankDelta after dropping",
              alpha.get("rankDelta", 0) < 0, {"alpha": alpha.get("rankDelta"), "beta": beta.get("rankDelta")})
        check("climbing tag trend is up", beta.get("trend") == "up", beta.get("trend"))

        conn.commit()

    try:
        _TMP.unlink()
    except OSError:
        pass

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
