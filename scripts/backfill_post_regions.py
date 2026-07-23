#!/usr/bin/env python3
"""幂等回填:给存量帖子补 country/province/city 地区列(feed 数据修复)。

背景:posts 的 country/province/city/region_code 列由迁移 1 补加,默认 ''。
迁移前的存量帖子(以及个别早期写入路径)country 一直是空串,而推荐/同城
feed 的国家过滤(idx_posts_country / idx_posts_region)会把这些行永久排除
—— 「老帖在任何地区流里都刷不到」的真实来源。发帖端已有兜底(BE3.7),
本脚本负责补齐存量行,按与发帖路径一致的优先级:

  · 扫描对象:posts 里 country IS NULL OR country='' 的行(含软删行,
    恢复后同样需要地区)。
  · 来源①:帖子自带 region_code 可反解(_parse_region_code 出非空
    country)→ 用它反解三列,region_code 原样保留 —— 帖子自己的地区
    永远比作者当前地区可信。
  · 来源②:作者 users.current_region_code 可反解 → 反解三列,并把
    region_code 一并写成作者的 code(与发帖兜底路径同口径,行内自洽,
    同城流的 region_code 索引才吃得到)。
  · 来源③:两者都没有 → 兜底 country='jp'(产品当前只做日本),
    province/city 留空,region_code 不动。
  · created_at/updated_at 一律不动 —— 回填不该扰动 feed 排序与客户端
    增量同步。重复跑时 country 已非空、不再命中扫描条件,零改动。

默认 dry-run 只打印计数+样例;--apply 才写库;--db 指定 SQLite 库路径
(必填,避免误开生产库)。PostgreSQL 生产库不走本脚本 —— 需要时把
_SCAN_SQL/_UPDATE_SQL 的同语义 SQL 在 psql 里手工执行(逻辑就是上面
三个分支,均为纯 SQL 可表达)。

用法:
    python3 scripts/backfill_post_regions.py --db /path/to/copy.db          # dry-run
    python3 scripts/backfill_post_regions.py --db /path/to/copy.db --apply  # 写库
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# server_regions 是纯数据/纯函数模块(绝不 import server),可安全独立引入。
from server_regions import _parse_region_code  # noqa: E402

_SCAN_SQL = """
SELECT p.id,
       p.region_code AS post_region_code,
       COALESCE(u.current_region_code, '') AS author_region_code
  FROM posts p
  LEFT JOIN users u ON u.id = p.author_id
 WHERE p.country IS NULL OR p.country = ''
 ORDER BY p.created_at ASC
"""

_UPDATE_SQL = "UPDATE posts SET country = ?, province = ?, city = ?, region_code = ? WHERE id = ?"


def _resolve_row(post_region_code: str, author_region_code: str) -> tuple[str, str, str, str, str]:
    """三分支决策。返回 (source, country, province, city, new_region_code)。

    new_region_code 是该行最终应有的 region_code:来源①保留原值,
    来源②写作者 code,来源③原样不动(实践中为空串)。
    """
    own = (post_region_code or "").strip().lower()
    country, province, city = _parse_region_code(own)
    if country:
        return "post_region_code", country, province, city, own
    author = (author_region_code or "").strip().lower()
    country, province, city = _parse_region_code(author)
    if country:
        return "author_region", country, province, city, author
    return "fallback_jp", "jp", "", "", own


def backfill(conn: sqlite3.Connection, *, apply: bool, echo=print) -> dict[str, int]:
    """扫描 + (可选)写入。返回计数 dict,便于单测断言。"""
    stats = {"scanned": 0, "post_region_code": 0, "author_region": 0, "fallback_jp": 0, "updated": 0}
    samples: dict[str, list[str]] = {"post_region_code": [], "author_region": [], "fallback_jp": []}
    for row in conn.execute(_SCAN_SQL):
        stats["scanned"] += 1
        source, country, province, city, new_region = _resolve_row(
            str(row["post_region_code"] or ""), str(row["author_region_code"] or "")
        )
        stats[source] += 1
        if len(samples[source]) < 3:
            samples[source].append(f"{row['id']} -> {country}/{province}/{city} rc={new_region!r}")
        if apply:
            conn.execute(_UPDATE_SQL, (country, province, city, new_region, row["id"]))
            stats["updated"] += 1
    if apply:
        conn.commit()
    mode = "APPLY" if apply else "DRY-RUN"
    echo(f"[{mode}] posts scanned (country empty): {stats['scanned']}")
    echo(f"[{mode}] from post region_code: {stats['post_region_code']}  (sample: {samples['post_region_code']})")
    echo(f"[{mode}] from author region   : {stats['author_region']}  (sample: {samples['author_region']})")
    echo(f"[{mode}] fallback country=jp  : {stats['fallback_jp']}  (sample: {samples['fallback_jp']})")
    echo(f"[{mode}] rows updated: {stats['updated']}")
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
