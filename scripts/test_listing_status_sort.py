#!/usr/bin/env python3
"""listings 第二轮:状态流转不置顶 + 迁移 135 + bbox pins 轻量模式。

修复背景:卖家在详情页标记「已预约」(status PATCH)会刷新 updated_at,而
latest 排序按 (updated_at, id) 置顶——标记状态反而把房源顶回列表第 1 位。
现在纯状态流转只写 status_changed_at(迁移 135 新列),不再刷新 updated_at;
其它字段编辑(标题/价格/属性/媒体)仍照旧刷新;从非公开状态流转进公开状态
(重新上架)属例外,照旧置顶。

覆盖:
  * 状态 PATCH(published→reserved / reserved→published)不改 updated_at,
    latest 排序位置不变;status_changed_at 只在状态真正变化时更新
  * 标题/价格编辑仍会顶到列表第 1 位
  * 非公开→公开(hidden→published,重新上架)仍会顶
  * 迁移 135:fresh + 升级两条路径均得到 status_changed_at(升级路径回填
    = updated_at)与两条新索引;重复跑 run_migrations 幂等;迁移号唯一且
    121 空号未被占用
  * pins=1 bbox 模式:响应形状逐字 {"pins":[...],"total":N};只含坐标非空且
    框内的公开行;畸形/越界边界参数静默忽略;与既有筛选(category/q)联动

Run:  cd web && python3 scripts/test_listing_status_sort.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DIR = Path(tempfile.mkdtemp(prefix="kaix-statussort-"))
os.environ["KAIX_DB_PATH"] = str(_TMP_DIR / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class CapturingHandler:
    def __new__(cls):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.send_json = lambda payload, status=200: handler.payloads.append(payload)
        handler.current_session = lambda conn: None
        return handler


def _insert_listing(conn, listing_id: str, *, listing_type: str = "secondhand",
                    status: str = "published", updated: str, category: str = "家具家电",
                    title: str | None = None, lat: float | None = None,
                    lng: float | None = None, price: float | None = 1000.0) -> None:
    conn.execute(
        "INSERT INTO city_listings (id, country_code, city_slug, region_code, type, category,"
        " title, price, status, seller_user_id, latitude, longitude, created_at, updated_at,"
        " status_changed_at)"
        " VALUES (?, 'jp', 'tokyo', 'jp.tokyo.tokyo', ?, ?, ?, ?, ?, 'u-seller', ?, ?, ?, ?, ?)",
        (listing_id, listing_type, category, title or f"listing {listing_id}", price,
         status, lat, lng, updated, updated, updated),
    )


class ListingStatusSortTests(unittest.TestCase):
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

    # ── helpers ───────────────────────────────────────────────────────────────

    def _list(self, query: dict[str, str]) -> dict:
        handler = CapturingHandler()
        handler.api_listings(self.conn, dict(query))
        return handler.payloads[-1]

    def _patch_listing(self, listing_id: str, payload: dict) -> dict:
        handler = CapturingHandler()
        handler.require_user = lambda conn: {"id": "u-seller", "display_name": "seller"}
        handler.read_json = lambda: dict(payload)
        handler.api_update_listing(self.conn, listing_id)
        return handler.payloads[-1]

    def _row(self, listing_id: str) -> dict:
        return dict(self.conn.execute(
            "SELECT * FROM city_listings WHERE id = ?", (listing_id,)).fetchone())

    # ── 迁移 135 ─────────────────────────────────────────────────────────────

    def test_migration_versions_unique_and_121_still_reserved(self) -> None:
        versions = [version for version, _, _ in server.MIGRATIONS]
        self.assertEqual(len(versions), len(set(versions)), "迁移号必须唯一")
        self.assertIn(135, versions)
        self.assertNotIn(121, versions, "121 是被测试锁死的空号,不可占用")

    def test_migration_135_fresh_path(self) -> None:
        columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(city_listings)")}
        self.assertIn("status_changed_at", columns)
        index_names = {row["name"] for row in self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index'")}
        self.assertIn("idx_posts_hot_engaged", index_names)
        self.assertIn("idx_follows_follower_created", index_names)

    def test_migration_135_upgrade_path_backfills_and_is_idempotent(self) -> None:
        con = sqlite3.connect(str(_TMP_DIR / "upgrade.db"))
        con.row_factory = sqlite3.Row
        try:
            con.executescript(server.SCHEMA)
            with patch.object(server, "MIGRATIONS",
                              [m for m in server.MIGRATIONS if m[0] < 135]):
                server.run_migrations(con)
            pre_cols = {row["name"] for row in con.execute("PRAGMA table_info(city_listings)")}
            self.assertNotIn("status_changed_at", pre_cols, "升级前提:旧库没有该列")
            legacy_updated = "2026-01-02T03:04:05.000000+00:00"
            con.execute(
                "INSERT INTO city_listings (id, type, title, status, seller_user_id,"
                " created_at, updated_at)"
                " VALUES ('l-legacy', 'secondhand', '旧房源', 'published', 'u', ?, ?)",
                (legacy_updated, legacy_updated),
            )
            server.run_migrations(con)  # 升级:应用 135
            row = con.execute(
                "SELECT status_changed_at, updated_at FROM city_listings WHERE id = 'l-legacy'"
            ).fetchone()
            self.assertEqual(row["status_changed_at"], legacy_updated, "回填 = updated_at")
            server.run_migrations(con)  # 再跑一遍:已记录版本,必须幂等无异常
            row2 = con.execute(
                "SELECT status_changed_at FROM city_listings WHERE id = 'l-legacy'").fetchone()
            self.assertEqual(row2["status_changed_at"], legacy_updated)
            index_names = {r["name"] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index'")}
            self.assertIn("idx_posts_hot_engaged", index_names)
            self.assertIn("idx_follows_follower_created", index_names)
        finally:
            con.close()

    # ── 状态 PATCH 不再置顶 ──────────────────────────────────────────────────

    def test_status_patch_does_not_touch_updated_at_or_sort_position(self) -> None:
        _insert_listing(self.conn, "s-a", updated="2026-02-01T00:01:00.000000+00:00")
        _insert_listing(self.conn, "s-b", updated="2026-02-01T00:02:00.000000+00:00")
        _insert_listing(self.conn, "s-c", updated="2026-02-01T00:03:00.000000+00:00")
        before = self._row("s-a")

        payload = self._patch_listing("s-a", {"status": "reserved"})
        self.assertTrue(payload["ok"])
        after = self._row("s-a")
        self.assertEqual(after["status"], "reserved")
        self.assertEqual(after["updated_at"], before["updated_at"], "纯状态 PATCH 不刷新 updated_at")
        self.assertNotEqual(after["status_changed_at"], before["status_changed_at"])
        self.assertTrue(after["status_changed_at"])

        page = self._list({"type": "secondhand", "sort": "latest", "limit": "60"})
        ids = [item["id"] for item in page["items"] if item["id"].startswith("s-")]
        self.assertEqual(ids, ["s-c", "s-b", "s-a"], "标记已预约不该顶到第 1 位")

        # 同状态重复 PATCH:状态未变化,不写 status_changed_at 也不刷新 updated_at。
        self._patch_listing("s-a", {"status": "reserved"})
        again = self._row("s-a")
        self.assertEqual(again["status_changed_at"], after["status_changed_at"])
        self.assertEqual(again["updated_at"], before["updated_at"])

        # 公开状态之间回流转(reserved→published)同样不置顶。
        self._patch_listing("s-a", {"status": "published"})
        back = self._row("s-a")
        self.assertEqual(back["status"], "published")
        self.assertEqual(back["updated_at"], before["updated_at"])
        self.assertNotEqual(back["status_changed_at"], after["status_changed_at"])
        page = self._list({"type": "secondhand", "sort": "latest", "limit": "60"})
        ids = [item["id"] for item in page["items"] if item["id"].startswith("s-")]
        self.assertEqual(ids, ["s-c", "s-b", "s-a"])

    def test_content_edit_still_bumps_to_top(self) -> None:
        _insert_listing(self.conn, "e-a", listing_type="rental", category="公寓",
                        updated="2026-03-01T00:01:00.000000+00:00")
        _insert_listing(self.conn, "e-b", listing_type="rental", category="公寓",
                        updated="2026-03-01T00:02:00.000000+00:00")
        before = self._row("e-a")
        with patch("server.reputation_validate_listing_publish", return_value=(False, "")):
            self._patch_listing("e-a", {"title": "重新装修的公寓"})
        after = self._row("e-a")
        self.assertGreater(after["updated_at"], before["updated_at"], "标题编辑仍刷新 updated_at")
        ids = [item["id"] for item in self._list({"type": "rental", "sort": "latest"})["items"]]
        self.assertEqual(ids[0], "e-a", "内容编辑仍会顶到第 1 位")

        # 价格编辑同样置顶(涨价,避开降价通知路径的额外分支)。
        before_b = self._row("e-b")
        with patch("server.reputation_validate_listing_publish", return_value=(False, "")):
            self._patch_listing("e-b", {"price": 99999})
        self.assertGreater(self._row("e-b")["updated_at"], before_b["updated_at"])

    def test_republish_from_hidden_bumps(self) -> None:
        _insert_listing(self.conn, "h-a", status="hidden",
                        updated="2026-04-01T00:01:00.000000+00:00")
        _insert_listing(self.conn, "h-b", updated="2026-04-01T00:02:00.000000+00:00")
        before = self._row("h-a")
        with patch("server.reputation_validate_listing_publish", return_value=(False, "")):
            self._patch_listing("h-a", {"status": "published"})
        after = self._row("h-a")
        self.assertEqual(after["status"], "published")
        self.assertGreater(after["updated_at"], before["updated_at"],
                           "非公开→公开等于重新上架,照旧置顶")
        self.assertNotEqual(after["status_changed_at"], before["status_changed_at"])

    # ── pins bbox 模式 ───────────────────────────────────────────────────────

    def test_pins_basic_query_shape_and_bbox(self) -> None:
        _insert_listing(self.conn, "p-in-1", listing_type="job", category="兼职",
                        updated="2026-05-01T00:01:00.000000+00:00", lat=35.68, lng=139.76)
        _insert_listing(self.conn, "p-in-2", listing_type="job", category="正社员",
                        updated="2026-05-01T00:02:00.000000+00:00", lat=35.70, lng=139.70,
                        title="车站前便利店")
        _insert_listing(self.conn, "p-out", listing_type="job", category="兼职",
                        updated="2026-05-01T00:03:00.000000+00:00", lat=34.70, lng=135.50)
        _insert_listing(self.conn, "p-nocoord", listing_type="job", category="兼职",
                        updated="2026-05-01T00:04:00.000000+00:00", lat=None, lng=None)
        _insert_listing(self.conn, "p-draft", listing_type="job", category="兼职",
                        status="draft", updated="2026-05-01T00:05:00.000000+00:00",
                        lat=35.69, lng=139.75)

        payload = self._list({
            "type": "job", "pins": "1",
            "min_lat": "35.5", "max_lat": "35.8",
            "min_lng": "139.5", "max_lng": "139.9",
        })
        self.assertEqual(set(payload.keys()), {"pins", "total"}, "响应形状必须逐字一致")
        ids = [pin["id"] for pin in payload["pins"]]
        self.assertEqual(sorted(ids), ["p-in-1", "p-in-2"],
                         "只取坐标非空、框内且公开状态的行")
        self.assertEqual(payload["total"], 2)
        for pin in payload["pins"]:
            self.assertEqual(
                set(pin.keys()), {"id", "title", "price", "latitude", "longitude", "status"})
        by_id = {pin["id"]: pin for pin in payload["pins"]}
        self.assertEqual(by_id["p-in-1"]["status"], "published")
        self.assertAlmostEqual(by_id["p-in-1"]["latitude"], 35.68)
        self.assertAlmostEqual(by_id["p-in-1"]["longitude"], 139.76)

    def test_pins_malformed_and_out_of_range_bounds_ignored(self) -> None:
        # 畸形(abc/nan)与越界(999)的边界参数逐个静默忽略——不 500、不整表报错。
        payload = self._list({
            "type": "job", "pins": "1",
            "min_lat": "abc", "max_lat": "999",
            "min_lng": "nan", "max_lng": "139.9",
        })
        self.assertEqual(set(payload.keys()), {"pins", "total"})
        ids = {pin["id"] for pin in payload["pins"]}
        # 仅剩 max_lng<=139.9 有效:大阪的 p-out(135.50)也会进来,坐标空的仍排除。
        self.assertEqual(ids, {"p-in-1", "p-in-2", "p-out"})
        self.assertNotIn("p-nocoord", ids)
        self.assertNotIn("p-draft", ids)

        # 全部边界都无效时退化为「坐标非空的全部筛选结果」。
        payload = self._list({"type": "job", "pins": "1", "min_lat": "oops"})
        self.assertEqual({pin["id"] for pin in payload["pins"]},
                         {"p-in-1", "p-in-2", "p-out"})
        self.assertEqual(payload["total"], 3)

    def test_pins_respects_existing_filters(self) -> None:
        # category 联动:兼职框内只有 p-in-1。
        payload = self._list({
            "type": "job", "pins": "1", "category": "兼职",
            "min_lat": "35.5", "max_lat": "35.8",
            "min_lng": "139.5", "max_lng": "139.9",
        })
        self.assertEqual([pin["id"] for pin in payload["pins"]], ["p-in-1"])
        self.assertEqual(payload["total"], 1)

        # 关键词联动:标题命中「便利店」的只有 p-in-2。
        payload = self._list({
            "type": "job", "pins": "1", "q": "便利店",
            "min_lat": "35.5", "max_lat": "35.8",
            "min_lng": "139.5", "max_lng": "139.9",
        })
        self.assertEqual([pin["id"] for pin in payload["pins"]], ["p-in-2"])

        # 类型隔离:rental 频道看不到 job 的钉。
        payload = self._list({
            "type": "rental", "pins": "1",
            "min_lat": "35.5", "max_lat": "35.8",
            "min_lng": "139.5", "max_lng": "139.9",
        })
        self.assertEqual(payload["pins"], [])
        self.assertEqual(payload["total"], 0)


if __name__ == "__main__":
    unittest.main()
