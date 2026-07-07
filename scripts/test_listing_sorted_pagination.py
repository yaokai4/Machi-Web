#!/usr/bin/env python3
"""价格/人气/评分排序的房源翻页 + 总数契约。

修复背景:/api/listings 此前只对 sort=latest 发 next_cursor,价格/评分排序
在第一页(24/60 条)被硬截断——300+ 房源的频道按价格排序永远只能看到一页;
同时响应从不携带总数,客户端头部只能显示「已加载条数 条结果」,首屏永远是
「24 条结果」,被用户读成"总共只有 24 套"。

覆盖:
  * sort=price_asc / price_desc / rating 均可沿 next_cursor 走完全量,
    无缺页无重复,且顺序与一次性全量查询完全一致
  * sort=latest 键集游标行为不回归(全量、无重复)
  * 第一页携带 total(真实 COUNT);游标页 total=None(客户端已持有)
  * 偏移游标页即使漏传 sort 参数,仍沿用游标里编码的排序

Run:  cd web && python3 scripts/test_listing_sorted_pagination.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-sortpage-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

TOTAL = 57  # 大于两页(24*2),小到测试秒级完成


class CapturingHandler:
    def __new__(cls):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.send_json = lambda payload, status=200: handler.payloads.append(payload)
        handler.current_session = lambda conn: None
        return handler


class SortedListingPaginationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = server.now_iso()
        cls.conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, joined_at, created_at, updated_at)"
            " VALUES ('u-seller', 'seller', 'seller', 'x', ?, ?, ?)",
            (ts, ts, ts),
        )
        for i in range(TOTAL):
            # 价格刻意制造并列(每 3 条同价)考验断点确定性;updated_at 单调。
            price = 50000 + (i // 3) * 1000
            updated = f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}.000000+00:00"
            cls.conn.execute(
                "INSERT INTO city_listings (id, country_code, city_slug, region_code, type, category,"
                " title, price, status, seller_user_id, rating_avg, rating_count, created_at, updated_at)"
                " VALUES (?, 'jp', 'tokyo', 'jp.tokyo.tokyo', 'rental', '公寓', ?, ?, 'published',"
                " 'u-seller', ?, ?, ?, ?)",
                (f"l-{i:03d}", f"房源{i}", price, (i % 5) + 0.5, i % 7, updated, updated),
            )

    def _page(self, query: dict[str, str]) -> dict:
        handler = CapturingHandler()
        handler.api_listings(self.conn, dict(query))
        return handler.payloads[-1]

    def _walk(self, query: dict[str, str], drop_sort_after_first: bool = False) -> tuple[list[str], list[int | None]]:
        ids: list[str] = []
        totals: list[int | None] = []
        cursor = None
        for _ in range(30):
            q = dict(query)
            if cursor:
                q["cursor"] = cursor
                if drop_sort_after_first:
                    q.pop("sort", None)
            payload = self._page(q)
            ids.extend(item["id"] for item in payload["items"])
            totals.append(payload.get("total"))
            cursor = payload.get("next_cursor")
            if not cursor:
                break
        return ids, totals

    def _full_order(self, sort: str) -> list[str]:
        payload = self._page({"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": sort, "limit": "60"})
        return [item["id"] for item in payload["items"]]

    def test_price_asc_walks_full_inventory_in_order(self) -> None:
        ids, totals = self._walk({"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": "price_asc", "limit": "24"})
        self.assertEqual(len(ids), TOTAL)
        self.assertEqual(len(set(ids)), TOTAL, "翻页跳/重了行")
        self.assertEqual(ids[:60], self._full_order("price_asc")[:60], "翻页顺序与一次性查询不一致")
        self.assertEqual(totals[0], TOTAL, "第一页必须带真实总数")
        self.assertTrue(all(t is None for t in totals[1:]), "游标页不应重复计算总数")

    def test_price_desc_and_rating_walk_full_inventory(self) -> None:
        for sort in ("price_desc", "rating"):
            ids, _ = self._walk({"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": sort, "limit": "24"})
            self.assertEqual(len(ids), TOTAL, f"sort={sort} 未走完全量")
            self.assertEqual(len(set(ids)), TOTAL, f"sort={sort} 翻页跳/重了行")

    def test_latest_keyset_unchanged(self) -> None:
        ids, totals = self._walk({"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": "latest", "limit": "24"})
        self.assertEqual(len(ids), TOTAL)
        self.assertEqual(len(set(ids)), TOTAL)
        self.assertEqual(totals[0], TOTAL)

    def test_offset_cursor_survives_missing_sort_param(self) -> None:
        ids, _ = self._walk(
            {"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": "price_asc", "limit": "24"},
            drop_sort_after_first=True,
        )
        self.assertEqual(len(ids), TOTAL)
        self.assertEqual(len(set(ids)), TOTAL, "漏传 sort 的游标页跳/重了行")
        self.assertEqual(ids, self._walk({"type": "rental", "city_slug": "tokyo", "exact": "1", "sort": "price_asc", "limit": "24"})[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
