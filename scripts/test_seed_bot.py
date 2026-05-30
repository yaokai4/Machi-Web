#!/usr/bin/env python3
"""End-to-end test for the City Seed Bot (城市内容助手) backend.

Runs against a throwaway SQLite DB (KAIX_DB_PATH) — never the real kaix.db.
Drives the *real* server.py handlers through a minimal fake request so we
exercise the actual SQL + safety logic without needing the HTTP/login stack.

Usage:  python scripts/test_seed_bot.py
Exits non-zero if any assertion fails.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

# --- isolate: throwaway DB, set BEFORE importing server ---
# We boot in "production" mode purely so init_db() skips the dev demo `seed()`
# (its users INSERT predates a schema change and 422s on a fresh DB — unrelated
# to the seed bot). ensure_seed_admin still runs, giving us an admin to drive.
_TMP = Path(tempfile.gettempdir()) / f"seedbot_test_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_PASSWORD_PEPPER"] = "seedbot-test-pepper-not-for-prod"
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
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name}  {detail}")


class FakeReq(server.Handler):
    """A Handler instance that skips HTTP: stubbed body, captured response,
    and a session pinned to a chosen user."""

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


def call(method_name, user, conn, body=None, *args):
    """Invoke a handler method; return ('ok', payload) or ('err', code)."""
    req = FakeReq(user, body)
    try:
        getattr(req, method_name)(conn, *args)
        return ("ok", req.sent[1] if req.sent else None)
    except server.APIError as exc:
        return ("err", exc.code)


def main() -> int:
    server.init_db()
    RC = "jp.tokyo.tokyo"
    with server.DB_LOCK, server.db() as conn:
        admin = dict(conn.execute("SELECT * FROM users WHERE handle = 'admin'").fetchone())

        # A real (non-admin) user + a real post in the same city — the thing
        # that must NEVER be touched by any seed clear.
        real_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'member', ?, ?, ?)",
            (real_id, "realuser", "Real User", server.hash_password("Real12345"),
             server.now_iso(), server.now_iso(), server.now_iso()),
        )
        real_user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (real_id,)).fetchone())
        real_post_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO posts (id, author_id, content, view_count, status, country, province, city, "
            "region_code, content_type, attributes, created_at, updated_at) "
            "VALUES (?, ?, ?, 1, 'active', 'jp', 'tokyo', 'tokyo', ?, 'dynamic', '', ?, ?)",
            (real_post_id, real_id, "我自己发的真实帖子", RC, server.now_iso(), server.now_iso()),
        )

        def real_post_alive():
            r = conn.execute("SELECT status, deleted_at, is_seed_content FROM posts WHERE id = ?", (real_post_id,)).fetchone()
            return r and r["status"] == "active" and r["deleted_at"] is None and (r["is_seed_content"] or 0) == 0

        print("\n[1] permissions")
        kind, code = call("api_admin_seed_generate", real_user, conn,
                          {"regionCode": RC, "language": "zh", "count": 5})
        check("非管理员不能生成 (403)", kind == "err" and code == "forbidden", f"got {kind}/{code}")

        print("\n[2] count limit")
        kind, code = call("api_admin_seed_generate", admin, conn,
                          {"regionCode": RC, "language": "zh", "count": 101})
        check("超过 100 条被拒绝", kind == "err" and code == "count_too_large", f"got {kind}/{code}")

        print("\n[3] generate (draft) + invariants")
        kind, payload = call("api_admin_seed_generate", admin, conn,
                             {"regionCode": RC, "language": "zh", "contentType": "mixed",
                              "count": 100, "tone": "natural", "publishNow": False})
        ok = kind == "ok"
        batch = (payload or {}).get("batch", {}) if ok else {}
        bid = batch.get("id", "")
        check("管理员可以生成", ok, f"got {kind}")
        rows = list(conn.execute("SELECT is_seed_content, seed_batch_id, status, seed_source FROM posts WHERE seed_batch_id = ?", (bid,)))
        check("生成数量 >0 且 <=100", 0 < len(rows) <= 100, f"n={len(rows)}")
        check("全部 is_seed_content=1", all(r["is_seed_content"] == 1 for r in rows))
        check("全部带 seed_batch_id", all(r["seed_batch_id"] == bid for r in rows))
        check("全部 seed_source=seed_bot", all(r["seed_source"] == "seed_bot" for r in rows))
        check("draft 全部为 draft 状态", all(r["status"] == "draft" for r in rows))
        visible = conn.execute(
            "SELECT COUNT(*) c FROM posts WHERE seed_batch_id=? AND status IN ('published','active') AND deleted_at IS NULL", (bid,)
        ).fetchone()["c"]
        check("draft 不出现在公开列表", visible == 0, f"visible={visible}")

        print("\n[4] preview")
        kind, payload = call("api_admin_seed_batch_detail", admin, conn, None, bid)
        items = (payload or {}).get("batch", {}).get("items", []) if kind == "ok" else []
        check("可以预览 batch 内容", kind == "ok" and len(items) == len(rows), f"items={len(items)}")

        print("\n[5] publish")
        kind, payload = call("api_admin_seed_publish", admin, conn, {}, bid)
        pub_now = conn.execute(
            "SELECT COUNT(*) c FROM posts WHERE seed_batch_id=? AND status IN ('published','active') AND deleted_at IS NULL", (bid,)
        ).fetchone()["c"]
        check("发布后内容可见", kind == "ok" and pub_now == len(rows), f"pub={pub_now}/{len(rows)}")
        check("真实用户内容未受影响", real_post_alive())

        print("\n[6] clear batch (safety)")
        kind, code = call("api_admin_seed_clear", admin, conn, {}, bid)  # no confirm
        check("缺少 confirm 被拒绝", kind == "err" and code == "confirm_required", f"got {kind}/{code}")
        kind, code = call("api_admin_seed_clear", real_user, conn, {"confirm": True}, bid)
        check("非管理员不能清除 (403)", kind == "err" and code == "forbidden", f"got {kind}/{code}")
        kind, payload = call("api_admin_seed_clear", admin, conn, {"confirm": True}, bid)
        cleared = (payload or {}).get("cleared", -1) if kind == "ok" else -1
        check("清除该批次 seed 内容", kind == "ok" and cleared == len(rows), f"cleared={cleared}/{len(rows)}")
        still_visible = conn.execute(
            "SELECT COUNT(*) c FROM posts WHERE seed_batch_id=? AND status IN ('published','active') AND deleted_at IS NULL", (bid,)
        ).fetchone()["c"]
        check("清除后 seed 不再可见", still_visible == 0, f"visible={still_visible}")
        check("清除 batch 不影响真实用户内容", real_post_alive())

        print("\n[7] clear-city (safety)")
        # New batch, publish-now, then clear the whole city.
        kind, payload = call("api_admin_seed_generate", admin, conn,
                             {"regionCode": RC, "language": "en", "contentType": "city_square",
                              "count": 6, "tone": "editorial", "publishNow": True})
        bid2 = (payload or {}).get("batch", {}).get("id", "") if kind == "ok" else ""
        n2 = conn.execute("SELECT COUNT(*) c FROM posts WHERE seed_batch_id=?", (bid2,)).fetchone()["c"]
        check("editorial 批次生成成功", kind == "ok" and n2 > 0, f"n2={n2}")
        # editorial tone → editorial official identity
        ed_author = conn.execute(
            "SELECT u.display_name dn FROM posts p JOIN users u ON u.id=p.author_id WHERE p.seed_batch_id=? LIMIT 1", (bid2,)
        ).fetchone()
        check("editorial 语气来自编辑部账号", ed_author and "Local Desk" in (ed_author["dn"] or ""), f"author={ed_author['dn'] if ed_author else None}")
        kind, code = call("api_admin_seed_clear_city", admin, conn, {"regionCode": RC})  # no confirm
        check("按城市清除缺少 confirm 被拒绝", kind == "err" and code == "confirm_required", f"got {kind}/{code}")
        kind, payload = call("api_admin_seed_clear_city", admin, conn, {"regionCode": RC, "confirm": True})
        city_cleared = (payload or {}).get("cleared", -1) if kind == "ok" else -1
        check("按城市清除 seed 内容", kind == "ok" and city_cleared >= n2, f"cleared={city_cleared}")
        seed_left = conn.execute(
            "SELECT COUNT(*) c FROM posts WHERE is_seed_content=1 AND region_code=? AND status NOT IN ('cleared')", (RC,)
        ).fetchone()["c"]
        check("城市内 seed 已全部清除", seed_left == 0, f"left={seed_left}")
        check("按城市清除不影响真实用户内容", real_post_alive())

        print("\n[8] audit log")
        actions = {r["action"] for r in conn.execute("SELECT DISTINCT action FROM admin_seed_content_logs")}
        check("操作日志记录 generate/publish/clear_batch/clear_city",
              {"generate", "publish", "clear_batch", "clear_city"} <= actions, f"actions={actions}")
        logged_admin = conn.execute("SELECT COUNT(*) c FROM admin_seed_content_logs WHERE admin_id != ''").fetchone()["c"]
        check("日志记录 admin_id", logged_admin > 0)

    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    try:
        _TMP.unlink(missing_ok=True)
        for suffix in ("-wal", "-shm"):
            Path(str(_TMP) + suffix).unlink(missing_ok=True)
    except OSError:
        pass
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
