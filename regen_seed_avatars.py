"""Re-bake 小红书-style avatars into ``seed_users_pack.py``.

Idempotent: rewrites only the ``avatar_url`` field of each persona line in place
(everything else — handles, names, bios, regions — is untouched) using
:func:`seed_avatars.avatar_for`. Run after editing the avatar pools / matcher:

    python regen_seed_avatars.py

Prints a summary and leaves the file ready to commit.
"""

from __future__ import annotations

import re

import seed_avatars as A
import seed_users_pack as P

_H = re.compile(r"'handle':\s*'([^']+)'")
_AV = re.compile(r"('avatar_url':\s*')([^']*)(')")


def main() -> None:
    new = {
        u["handle"]: A.avatar_for(
            u["handle"], u.get("gender", ""), u.get("bio", ""), u.get("display_name", "")
        )
        for u in P.USERS
    }
    lines = open("seed_users_pack.py", encoding="utf-8").read().splitlines(keepends=True)
    changed = 0
    for i, line in enumerate(lines):
        hm = _H.search(line)
        if hm and hm.group(1) in new and _AV.search(line):
            url = new[hm.group(1)]
            lines[i] = _AV.sub(lambda m: m.group(1) + url + m.group(3), line)
            changed += 1
    open("seed_users_pack.py", "w", encoding="utf-8").write("".join(lines))

    photo = sum(1 for u in new.values() if "unsplash" in u)
    print(f"rewrote {changed} personas — {photo} photo / {len(new) - photo} illustrated")
    leftover = [h for h, u in new.items() if "randomuser" in u]
    if leftover:
        print(f"WARNING: {len(leftover)} legacy avatars remain: {leftover[:5]}")


if __name__ == "__main__":
    main()
