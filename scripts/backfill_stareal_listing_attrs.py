#!/usr/bin/env python3
"""幂等回填:给 partner 来源的长租房源补 pet_allowed / furnished 布尔属性。

背景:/api/listings 的属性筛选是对 listing_attributes 的严格 EXISTS 匹配,而
星域东京(stareal)等 partner 导入此前只把「可养狗/可养猫」等设施拼进
amenities 自由文本、从不写布尔属性行 —— 于是「家具家电 + 可宠物」在 partner
库存(长租主力)上永远 0 结果。导入侧已修(server_stareal.map_item 现在直接
写布尔属性),本脚本负责补齐既有存量行:

  · 扫描对象:带 __partner 标记、type='rental'、未删除的 listing
    (furnished/pet_allowed 只在 rental 的属性白名单里,其他 vertical 不写)。
  · pet_allowed:amenities 属性文本含 可养狗/可养猫。
  · furnished:标题/描述/amenities 含高置信关键词(家具家電付き/家電付き/
    家具付き,含「・」中点变体)。
  · 关键词口径 import 自 server_stareal(FURNISHED_KEYWORDS 等),与导入映射
    永远一致;已存在该属性行(无论值)一律跳过,不覆盖 —— 重复跑零变更。

默认 dry-run 只打印计数;--apply 才写库;--db 指定 SQLite 库路径(必填,
避免误开生产库)。PostgreSQL 生产库不走本脚本 —— 属性行会在下一次 partner
定时同步(map_item 已带布尔属性,全量 upsert 重写属性行)时自动补齐。

用法:
    python3 scripts/backfill_stareal_listing_attrs.py --db /path/to/copy.db          # dry-run
    python3 scripts/backfill_stareal_listing_attrs.py --db /path/to/copy.db --apply  # 写库
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# server_stareal 是纯数据层(绝不 import server),可安全独立引入。
from server_stareal import infer_boolean_attrs  # noqa: E402

_SCAN_SQL = """
SELECT cl.id, cl.title, cl.description,
       (SELECT a.value FROM listing_attributes a
         WHERE a.listing_id = cl.id AND a.key = 'amenities') AS amenities,
       (SELECT 1 FROM listing_attributes a
         WHERE a.listing_id = cl.id AND a.key = 'pet_allowed') AS has_pet,
       (SELECT 1 FROM listing_attributes a
         WHERE a.listing_id = cl.id AND a.key = 'furnished') AS has_furnished
  FROM city_listings cl
  JOIN listing_attributes p
    ON p.listing_id = cl.id AND p.key = '__partner'
 WHERE cl.type = 'rental' AND cl.deleted_at IS NULL
 ORDER BY cl.created_at ASC
"""

_INSERT_SQL = (
    "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
    " VALUES (?, ?, ?, 'true', 'bool', ?, ?)"
)


def backfill(conn: sqlite3.Connection, *, apply: bool, echo=print) -> dict[str, int]:
    """扫描 + (可选)写入。返回计数 dict,便于单测断言。"""
    now = datetime.now(timezone.utc).isoformat()
    stats = {"scanned": 0, "pet_allowed_added": 0, "furnished_added": 0, "skipped_existing": 0}
    samples: dict[str, list[str]] = {"pet_allowed": [], "furnished": []}
    for row in conn.execute(_SCAN_SQL):
        stats["scanned"] += 1
        amenities = str(row["amenities"] or "")
        derived = infer_boolean_attrs(
            amenities=amenities,
            texts=(str(row["title"] or ""), str(row["description"] or ""), amenities),
        )
        for key, present_col in (("pet_allowed", "has_pet"), ("furnished", "has_furnished")):
            if not derived.get(key):
                continue
            if row[present_col]:
                stats["skipped_existing"] += 1
                continue
            stats[f"{key}_added"] += 1
            if len(samples[key]) < 5:
                samples[key].append(str(row["id"]))
            if apply:
                conn.execute(_INSERT_SQL, (str(uuid.uuid4()), row["id"], key, now, now))
    if apply:
        conn.commit()
    mode = "APPLY" if apply else "DRY-RUN"
    echo(f"[{mode}] partner rental listings scanned: {stats['scanned']}")
    echo(f"[{mode}] pet_allowed to add: {stats['pet_allowed_added']}  (sample: {samples['pet_allowed']})")
    echo(f"[{mode}] furnished  to add: {stats['furnished_added']}  (sample: {samples['furnished']})")
    echo(f"[{mode}] skipped (attribute already present): {stats['skipped_existing']}")
    if not apply:
        echo("dry-run:未写库。确认计数无误后加 --apply 执行。")
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", required=True, help="SQLite 库路径(建议先在副本库上 dry-run)")
    parser.add_argument("--apply", action="store_true", help="真正写库(默认 dry-run 只打印计数)")
    args = parser.parse_args(argv)
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"库文件不存在: {db_path}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        backfill(conn, apply=bool(args.apply))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
