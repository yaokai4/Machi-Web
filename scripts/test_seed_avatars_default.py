#!/usr/bin/env python3
"""Pure-function tests for seed_avatars.default_avatar (new-user auto avatars).

Guarantees: deterministic per handle, always a valid https URL, sourced ONLY
from the two face-free lanes (verified PHOTOS ids + DiceBear illustrations),
varied across handles, photo-leaning, and never a legacy Western portrait.

Usage:  python scripts/test_seed_avatars_default.py
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import seed_avatars as a  # noqa: E402

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


def main() -> int:
    print("\n[default_avatar]")
    # 1. deterministic (incl. gender variant)
    check("同一 handle → 同一 URL", a.default_avatar("alice") == a.default_avatar("alice"))
    check("gender 变体也确定", a.default_avatar("bob", "m") == a.default_avatar("bob", "m"))

    # 2. always non-empty https for any input
    edge = ["", "   ", "小明", "a.b.c", "USER", "123", "🐱"]
    check("边界输入都返回 https URL", all(a.default_avatar(h).startswith("https://") for h in edge),
          str([a.default_avatar(h)[:30] for h in edge]))

    handles = [f"user_{i}" for i in range(400)]
    urls = [a.default_avatar(h) for h in handles]

    # 3. face-free source proof: every url is dicebear OR a verified PHOTOS id
    valid_ids = {i for cat in a._GENERIC_PHOTO_CATS for i in a.PHOTOS[cat]}
    bad = []
    for u in urls:
        if "api.dicebear.com" in u:
            continue
        m = re.search(r"images\.unsplash\.com/photo-([0-9a-f-]+)", u)
        if not (m and m.group(1) in valid_ids):
            bad.append(u)
    check("头像只来自两个无人脸图源（插画 / 已验证实拍）", not bad, f"leaked={bad[:2]}")

    # 4. variety — the illustration lane is unique per handle; the face-free photo
    # lane draws from a bounded verified pool so some repeats are expected (and
    # realistic — real people reuse aesthetic photos). Assert a healthy floor.
    distinct = len(set(urls))
    check("400 handle 变化度 ≥ 50%", distinct >= 0.5 * 400, f"distinct={distinct}")

    # 5. mix has both lanes, photo-leaning
    photos = sum(1 for u in urls if "unsplash" in u)
    illus = sum(1 for u in urls if "dicebear" in u)
    check("两个图源都出现且偏实拍", photos > 0 and illus > 0 and photos > illus, f"photos={photos} illus={illus}")

    # 6. no legacy leak + in __all__
    check("无 randomuser.me 泄露", not any("randomuser.me" in u for u in urls))
    check("default_avatar 在 __all__", "default_avatar" in a.__all__)

    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
