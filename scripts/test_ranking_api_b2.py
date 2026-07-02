#!/usr/bin/env python3
"""B2 ranking-hardening API-level tests: drive the real server.py handlers
through a minimal fake request (no HTTP/login stack) to verify the behaviors
that live in the request path rather than the pure SQL helpers.

Covers:
  - Self-interaction never bumps the denormalized counter (heat), but still
    writes the interactions row (client state).
  - A non-author like DOES bump the counter.
  - api_post_interaction no longer invalidates the ranking caches (staleness is
    tolerated); 删帖 still does.
  - Explore hot board caps each author at EXPLORE_MAX_POSTS_PER_AUTHOR.
  - Dismissing a post report rolls its report_count back (heat restored).

Runs against a throwaway SQLite DB. Exits non-zero on any failed assertion.
Usage:  python scripts/test_ranking_api_b2.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"ranking_api_b2_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "ranking-api-b2-pepper-not-for-prod"
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


def mk_user(conn, handle, role="member"):
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, joined_at, created_at, updated_at, country) "
        "VALUES (?, ?, ?, '', 'x', ?, ?, ?, ?, 'jp')",
        (uid, handle, handle, role, now, now, now),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def mk_post(conn, author_id, content="hello world"):
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type, last_activity_at) "
        "VALUES (?, ?, ?, 'active', ?, ?, 'jp', 'dynamic', ?)",
        (pid, author_id, content, now, now, now),
    )
    return pid


def like_count(conn, pid):
    return conn.execute("SELECT like_count FROM posts WHERE id = ?", (pid,)).fetchone()["like_count"]


def report_count(conn, pid):
    return conn.execute("SELECT report_count FROM posts WHERE id = ?", (pid,)).fetchone()["report_count"]


def main() -> None:
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        admin = dict(conn.execute("SELECT * FROM users WHERE handle = 'admin'").fetchone())
        author = mk_user(conn, "author1")
        fan = mk_user(conn, "fan1")

        # --- 1) Self-interaction: author likes own post ---
        p = mk_post(conn, author["id"])
        st, _ = call("api_post_interaction", author, conn, p, "like", True, body={})
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'like'",
            (p, author["id"]),
        ).fetchone()
        check("self-like writes the interactions row", st == "ok" and row["c"] == 1, (st, row["c"]))
        check("self-like does NOT bump like_count (heat)", like_count(conn, p) == 0, like_count(conn, p))

        # --- 2) Non-author like DOES bump the counter ---
        st, _ = call("api_post_interaction", fan, conn, p, "like", True, body={})
        check("non-author like bumps like_count", st == "ok" and like_count(conn, p) == 1, like_count(conn, p))
        # Un-like reverses it.
        call("api_post_interaction", fan, conn, p, "like", False, body={})
        check("non-author unlike decrements like_count", like_count(conn, p) == 0, like_count(conn, p))

        # --- 3) api_post_interaction leaves ranking caches ALONE ---
        server._cache_put("explore:posts:sentinel", ["x"], ttl_seconds=60)
        call("api_post_interaction", fan, conn, p, "like", True, body={})
        check(
            "interaction does not invalidate explore cache (staleness tolerated)",
            server._cache_get("explore:posts:sentinel") is not None,
            "sentinel was cleared",
        )
        # 删帖 MUST still invalidate.
        server._cache_put("explore:posts:sentinel2", ["x"], ttl_seconds=60)
        call("api_delete_post", author, conn, p, body={})
        check(
            "delete_post DOES invalidate explore cache",
            server._cache_get("explore:posts:sentinel2") is None,
            "sentinel2 survived a delete",
        )

        # --- 4) Author diversity cap on the explore hot board ---
        prolific = mk_user(conn, "prolific")
        other = mk_user(conn, "other")
        # Give the prolific author 5 highly-engaged posts, the other author 2.
        for i in range(5):
            pid = mk_post(conn, prolific["id"], content=f"prolific {i}")
            conn.execute("UPDATE posts SET like_count = ?, hot_score = ? WHERE id = ?", (100 - i, 100 - i, pid))
        for i in range(2):
            pid = mk_post(conn, other["id"], content=f"other {i}")
            conn.execute("UPDATE posts SET like_count = ?, hot_score = ? WHERE id = ?", (50 - i, 50 - i, pid))
        server._cache_invalidate("explore:")
        st, payload = call(
            "api_explore_posts", None, conn, {"country": "jp", "limit": "20"}, "hot",
        )
        items = (payload or {}).get("items") or []
        by_author: dict[str, int] = {}
        for it in items:
            aid = it.get("author", {}).get("id") if isinstance(it.get("author"), dict) else it.get("author_id")
            aid = aid or it.get("authorId") or ""
            by_author[aid] = by_author.get(aid, 0) + 1
        prolific_shown = by_author.get(prolific["id"], 0)
        check(
            f"explore hot caps prolific author at {server.EXPLORE_MAX_POSTS_PER_AUTHOR}",
            st == "ok" and prolific_shown <= server.EXPLORE_MAX_POSTS_PER_AUTHOR,
            f"prolific_shown={prolific_shown} items={len(items)} by_author={by_author}",
        )

        # --- 5) Report dismiss rolls report_count back ---
        rp = mk_post(conn, author["id"], content="reported post")
        reporter1 = mk_user(conn, "reporter1")
        reporter2 = mk_user(conn, "reporter2")
        call("api_report", reporter1, conn, "post", rp, body={"reason": "spam"})
        call("api_report", reporter2, conn, "post", rp, body={"reason": "spam"})
        check("two distinct reports set report_count=2", report_count(conn, rp) == 2, report_count(conn, rp))
        # Admin dismisses — the report was unfounded, heat penalty rolled back.
        rid = conn.execute(
            "SELECT id FROM reports WHERE target_kind = 'post' AND target_id = ? LIMIT 1", (rp,)
        ).fetchone()["id"]
        st, _ = call("api_admin_resolve_report", admin, conn, rid, body={"action": "dismiss"})
        check("dismiss resolves without error", st == "ok", st)
        check("dismiss rolls report_count back to 0", report_count(conn, rp) == 0, report_count(conn, rp))
        open_left = conn.execute(
            "SELECT COUNT(*) AS c FROM reports WHERE target_id = ? AND status = 'open'", (rp,)
        ).fetchone()["c"]
        check("dismiss closes all open reports on the target", open_left == 0, open_left)

        conn.commit()

    try:
        _TMP.unlink()
    except OSError:
        pass

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
