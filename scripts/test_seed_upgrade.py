#!/usr/bin/env python3
"""Tests for the 城市内容助手 upgrade: pruned taxonomy, working tones, all-Japan
cities + random/spread, follower control, the clear_seed_users follows cascade,
and the 一键铺城 macro.

Runs against a throwaway SQLite DB (never the real kaix.db). Drives the *real*
server.py handlers through a minimal fake request.

Usage:  python scripts/test_seed_upgrade.py
Exits non-zero if any assertion fails.
"""

import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"seedup_test_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "seedup-test-pepper-not-for-prod"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402
import seed_content_library as seedlib  # noqa: E402
import seed_llm  # noqa: E402

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
    def __init__(self, user, body=None):  # noqa: D401
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
    req = FakeReq(user, body)
    try:
        getattr(req, method_name)(conn, *args)
        return ("ok", req.sent[1] if req.sent else None)
    except server.APIError as exc:
        return ("err", exc.code)


def main() -> int:
    print("\n[A] taxonomy (pure)")
    check("现役类型 = 5 类", seedlib.ACTIVE_CONTENT_TYPES ==
          ("spotlight", "qa", "pitfall", "checklist", "experience"),
          str(seedlib.ACTIVE_CONTENT_TYPES))
    check("旧键仍在 SUPPORTED（老帖兼容）",
          "city_square" in seedlib.SUPPORTED_CONTENT_TYPES and "food" in seedlib.SUPPORTED_CONTENT_TYPES)
    check("新键映射到已有 app 类型",
          seedlib.APP_CONTENT_TYPE.get("pitfall") == "warning"
          and seedlib.APP_CONTENT_TYPE.get("checklist") == "guide"
          and seedlib.APP_CONTENT_TYPE.get("experience") == "dynamic")
    check("综合分布精选占大头", seedlib._DEFAULT_MIX.get("spotlight", 0) >= 40)
    d5 = seedlib.default_distribution(5)
    check("count=5 时 5 类都在（取整地板）", all(d5.get(t, 0) >= 1 for t in seedlib.ACTIVE_CONTENT_TYPES), str(d5))
    d100 = seedlib.default_distribution(100)
    check("count=100 分布合计=100", sum(d100.values()) == 100, str(d100))

    print("\n[B] tones actually change the prompt (dead-code bug fix)")
    check("TONES = 6 个角度", len(seedlib.TONES) == 6 and "practical" in seedlib.TONES)
    sys_a, _ = seed_llm._build_prompt(region_code="jp.tokyo.tokyo", language="zh",
                                      tone="pitfall", plan={"spotlight": 3})
    sys_b, _ = seed_llm._build_prompt(region_code="jp.tokyo.tokyo", language="zh",
                                      tone="thrifty", plan={"spotlight": 3})
    check("pitfall 角度注入了 system", seedlib.TONE_DIRECTIVE["pitfall"][:10] in sys_a)
    check("thrifty 角度注入了 system", seedlib.TONE_DIRECTIVE["thrifty"][:10] in sys_b)
    check("不同角度 -> 不同 system", sys_a != sys_b)
    check("反编造条款在 system 内", "不编造" in sys_a)
    check("SPOTLIGHT_THEMES 已扩容且无重复",
          len(seed_llm.SPOTLIGHT_THEMES) >= 100 and len(set(seed_llm.SPOTLIGHT_THEMES)) == len(seed_llm.SPOTLIGHT_THEMES))

    print("\n[C] all-Japan cities + region plan")
    all_jp = server._all_jp_region_codes()
    check("覆盖 100+ 日本城市", len(all_jp) >= 100, str(len(all_jp)))
    m, plan = server._build_seed_region_plan({"regionMode": "random"}, 20)
    check("random -> 一座城", m == "random" and len(plan) == 1 and plan[0][0] in all_jp, str(plan))
    m, plan = server._build_seed_region_plan({"regionMode": "spread", "spreadCities": 5}, 40)
    check("spread -> 多城、总数均分", m == "spread" and len(plan) == 5 and sum(c for _, c in plan) == 40, str(plan))
    m, plan = server._build_seed_region_plan({"regionCode": "jp.tokyo.tokyo"}, 10)
    check("single -> 指定城", m == "single" and plan == [("jp.tokyo.tokyo", 10)], str(plan))

    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        admin = dict(conn.execute("SELECT * FROM users WHERE handle = 'admin'").fetchone())
        RC = "jp.tokyo.tokyo"

        print("\n[D] content-type validation")
        kind, code = call("api_admin_seed_generate", admin, conn,
                          {"regionCode": RC, "language": "zh", "contentType": "food", "count": 3})
        check("退役类型 food 被拒绝", kind == "err" and code == "invalid_content_type", f"{kind}/{code}")
        kind, payload = call("api_admin_seed_generate", admin, conn,
                             {"regionCode": RC, "language": "zh", "contentType": "pitfall",
                              "count": 3, "tone": "pitfall", "publishNow": False})
        check("现役类型 pitfall 可生成", kind == "ok" and (payload or {}).get("created", 0) > 0, f"{kind}")

        print("\n[E] regionMode random / spread (server-side, one throttle)")
        kind, payload = call("api_admin_seed_generate", admin, conn,
                             {"regionMode": "random", "language": "zh", "contentType": "mixed",
                              "count": 6, "tone": "practical", "publishNow": False})
        check("random 返回落点城市", kind == "ok" and (payload or {}).get("mode") == "random"
              and bool((payload or {}).get("city_name")), str((payload or {}).get("city_name")))
        kind, payload = call("api_admin_seed_generate", admin, conn,
                             {"regionMode": "spread", "spreadCities": 4, "language": "zh",
                              "contentType": "mixed", "count": 16, "tone": "deep", "publishNow": False})
        cities = (payload or {}).get("cities", []) if kind == "ok" else []
        check("spread 生成多城批次", kind == "ok" and len(cities) == 4, f"cities={len(cities)}")
        total = sum(c.get("created", 0) for c in cities)
        check("spread 各城均有内容", total > 0 and all(c.get("created", 0) > 0 for c in cities), f"total={total}")

        # Import a subset of personas as the follower source.
        server.import_seed_users(conn, server.seedpacks.PERSONAS[:60])
        personas = server.seed_user_ids(conn)
        check("导入城市用户成功（AI 粉丝源）", len(personas) >= 40, str(len(personas)))

        # A real (non-persona) user + a real follower — must be protected.
        real_id = str(uuid.uuid4())
        conn.execute("INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at) "
                     "VALUES (?, 'realstar', 'Real Star', ?, 'member', ?, ?, ?)",
                     (real_id, server.hash_password("Real12345"), server.now_iso(), server.now_iso(), server.now_iso()))
        realfollower_id = str(uuid.uuid4())
        conn.execute("INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at) "
                     "VALUES (?, 'realfan', 'Real Fan', ?, 'member', ?, ?, ?)",
                     (realfollower_id, server.hash_password("Real12345"), server.now_iso(), server.now_iso(), server.now_iso()))
        conn.execute("INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                     (str(uuid.uuid4()), realfollower_id, real_id, server.now_iso()))

        def fcount(uid):
            return conn.execute("SELECT COUNT(*) c FROM follows WHERE following_id=?", (uid,)).fetchone()["c"]

        print("\n[F] follower control")
        kind, payload = call("api_admin_set_user_followers", admin, conn, {"target": 30}, real_id)
        check("设为 30 生效", kind == "ok" and fcount(real_id) == 30, f"{kind} count={fcount(real_id)}")
        kind, payload = call("api_admin_set_user_followers", admin, conn, {"target": 30}, real_id)
        check("重复设为 30 幂等（added=0）", kind == "ok" and (payload or {}).get("added") == 0
              and fcount(real_id) == 30, str((payload or {}).get("added")))
        kind, payload = call("api_admin_set_user_followers", admin, conn, {"target": 0}, real_id)
        real_left = conn.execute("SELECT COUNT(*) c FROM follows WHERE following_id=? AND follower_id=?",
                                 (real_id, realfollower_id)).fetchone()["c"]
        check("减到 0 时真实粉丝被地板保护", kind == "ok" and fcount(real_id) == 1 and real_left == 1,
              f"count={fcount(real_id)} real_left={real_left}")
        kind, payload = call("api_admin_set_user_followers", admin, conn, {"target": 999999}, real_id)
        check("池耗尽如实告知，不假造", kind == "ok" and (payload or {}).get("pool_exhausted") is True,
              str((payload or {}).get("pool_exhausted")))
        no_pre = conn.execute(
            "SELECT COUNT(*) c FROM follows f JOIN users u ON u.id=f.follower_id "
            "WHERE f.following_id=? AND f.follower_id != ? AND f.created_at < u.created_at",
            (real_id, realfollower_id)).fetchone()["c"]
        check("seed 关注时间不早于粉丝注册（不穿帮）", no_pre == 0, f"pre={no_pre}")

        print("\n[G] clear_seed_users 级联删 follows（修复的数据完整性漏洞）")
        before = fcount(real_id)
        server.clear_seed_users(conn)
        after = fcount(real_id)
        check("清除城市用户后幻影粉丝归零", after == 1 and before > 1, f"before={before} after={after}")
        check("真实粉丝依然保留", conn.execute(
            "SELECT COUNT(*) c FROM follows WHERE follower_id=?", (realfollower_id,)).fetchone()["c"] == 1)

        print("\n[H] randomize seed followers")
        server.import_seed_users(conn, server.seedpacks.PERSONAS[:60])
        kind, payload = call("api_admin_randomize_seed_followers", admin, conn, {"min": 5, "max": 20})
        check("随机铺粉丝成功", kind == "ok" and (payload or {}).get("updated", 0) > 0, str(payload))

        print("\n[I] 一键铺城 macro (draft-first)")
        kind, payload = call("api_admin_seed_city_macro", admin, conn,
                             {"regionCode": "jp.osaka.osaka", "language": "zh", "contentType": "mixed",
                              "count": 8, "tone": "practical"})
        ok = kind == "ok"
        p = payload or {}
        check("macro 返回合并回执", ok and "spread_group_id" in p and "engagement" in p, f"{kind}")
        check("macro 生成草稿内容", ok and p.get("created", 0) > 0, str(p.get("created")))
        if ok and p.get("cities"):
            bid = p["cities"][0]["batch_id"]
            statuses = {r["status"] for r in conn.execute(
                "SELECT status FROM posts WHERE seed_batch_id=?", (bid,))}
            check("macro 默认进草稿（未直接发布）", statuses == {"draft"}, str(statuses))

    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
