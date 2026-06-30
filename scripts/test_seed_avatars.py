#!/usr/bin/env python3
"""Tests for 小红书-style seed avatars (seed_avatars + import_seed_users).

Runs against a throwaway SQLite DB — never the real kaix.db. Exercises the real
server.import_seed_users path so we know personas land with the new avatars.

Usage:  python scripts/test_seed_avatars.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"seedavatar_test_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "seedavatar-test-pepper"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import seed_avatars  # noqa: E402
import seed_users_pack as pack  # noqa: E402
import server  # noqa: E402

_passed = 0
_failed = 0


def ok(cond, msg):
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  ✅ {msg}")
    else:
        _failed += 1
        print(f"  ❌ {msg}")


def main():
    print("[1] seed_avatars.avatar_for — pure logic")
    avs = {u["handle"]: seed_avatars.avatar_for(
        u["handle"], u.get("gender", ""), u.get("bio", ""), u.get("display_name", ""))
        for u in pack.USERS}
    vals = list(avs.values())
    ok(all(("dicebear" in v or "unsplash" in v) for v in vals), "每个头像都是 dicebear/unsplash")
    ok(not any("randomuser" in v for v in vals), "没有任何 randomuser 欧美真人头像")
    photo = sum(1 for v in vals if "unsplash" in v)
    ok(120 <= photo <= 300, f"实拍/插画比例健康 (photo={photo}/{len(vals)})")
    distinct = len(set(vals))
    ok(distinct >= 300, f"头像高度去重 (distinct={distinct})")
    # interest matching is deterministic
    ok(seed_avatars.match_interest("养了三只猫，开猫咖啡馆") == "cat", "猫咖 → cat")
    ok(seed_avatars.match_interest("在名古屋开花店，每天配花束") == "flower", "花店 → flower")
    ok(seed_avatars.match_interest("拉面店老板，汤底熬了十年") == "ramen", "拉面店 → ramen")
    ok(seed_avatars.match_interest("资生堂美容顾问，分享护肤") == "beauty", "美容护肤 → beauty")
    ok(seed_avatars.match_interest("东大博士在读，研究AI") == "", "纯学生/职业 → 不强行配图(走插画)")
    # determinism + uniqueness
    ok(seed_avatars.avatar_for("aming_ski") == seed_avatars.avatar_for("aming_ski"), "同 handle 头像稳定")
    ok(seed_avatars.is_legacy_avatar("https://randomuser.me/api/portraits/men/1.jpg"), "识别 legacy 头像")
    ok(not seed_avatars.is_legacy_avatar(vals[0]), "新头像不算 legacy")

    print("\n[2] import_seed_users — real DB path")
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        res = server.import_seed_users(conn, pack.USERS[:60])
        ok(res["created"] == 60, f"导入 60 个 persona (created={res['created']})")
        rows = conn.execute(
            "SELECT u.handle, u.avatar_url FROM content_pack_users c JOIN users u ON u.id=c.user_id"
        ).fetchall()
        ok(len(rows) == 60, "persona 全部落库")
        ok(all(("dicebear" in r["avatar_url"] or "unsplash" in r["avatar_url"]) for r in rows),
           "落库头像均为 小红书 风格")
        ok(not any("randomuser" in r["avatar_url"] for r in rows), "落库无 randomuser")

        print("\n[3] re-import upgrades a legacy avatar in place")
        h = pack.USERS[0]["handle"]
        uid = conn.execute("SELECT id FROM users WHERE handle=?", (h,)).fetchone()["id"]
        conn.execute("UPDATE users SET avatar_url='https://randomuser.me/api/portraits/men/9.jpg' WHERE id=?", (uid,))
        # feed a persona whose baked avatar is also legacy → importer must recompute
        legacy_persona = dict(pack.USERS[0]); legacy_persona["avatar_url"] = "https://randomuser.me/api/portraits/men/9.jpg"
        server.import_seed_users(conn, [legacy_persona])
        after = conn.execute("SELECT avatar_url FROM users WHERE id=?", (uid,)).fetchone()["avatar_url"]
        ok("randomuser" not in after, "再次导入把 legacy 头像升级为小红书风格")
        ok(("dicebear" in after or "unsplash" in after), f"升级后头像有效 ({after[:40]}…)")

    print(f"\n==== {_passed} passed, {_failed} failed ====")
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    main()
