#!/usr/bin/env python3
"""listings 后端增强(租房/二手筛选体验的服务端半边)的功能测试:

  · /api/listings 0 结果渐进放宽(顶层 relaxation 数组);
  · facets=1 的 facet_counts(disjunctive 语义 + truthy 值并桶);
  · 保存搜索 v2:filter_json 的 attr_*/价格条件与查询端同语义匹配;
  · server_stareal.map_item 的 pet_allowed/furnished 布尔属性推断;
  · backfill_stareal_listing_attrs 脚本的 dry-run/--apply/幂等。

风格与 test_listing_filters.py 一致:真 handler + 一次性临时 SQLite 库。
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-facets-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_stareal  # noqa: E402


def now() -> str:
    return server.now_iso()


class CapturingHandler:
    """server.Handler with network plumbing stubbed out."""

    def __new__(cls):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.send_json = lambda payload, status=200: handler.payloads.append(payload)
        handler.current_session = lambda conn: None
        return handler


class ListingFacetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = now()
        for uid, handle in (("u-seller", "seller"), ("u-sub", "subscriber")):
            cls.conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, joined_at, created_at, updated_at)"
                " VALUES (?, ?, ?, 'x', ?, ?, ?)",
                (uid, handle, handle, ts, ts, ts),
            )
        # 长租房源:A 家具家电,B 可宠物,C 家具家电+可宠物(大阪),D 无属性。
        cls._listing("r-furnished", "整租", "带家具公寓", price=90000,
                     attrs={"furnished": ("true", "bool")})
        cls._listing("r-pet", "整租", "可养猫公寓", price=80000,
                     attrs={"pet_allowed": ("1", "bool")})  # 历史 truthy 拼写
        cls._listing("r-both-osaka", "整租", "大阪全装修可宠物", city_slug="osaka", price=70000,
                     attrs={"furnished": ("true", "bool"), "pet_allowed": ("true", "bool")})
        cls._listing("r-plain", "合租", "普通合租房", price=50000, attrs={})

    @classmethod
    def _listing(cls, lid: str, category: str, title: str, *, ltype: str = "rental",
                 status: str = "published", city_slug: str = "tokyo", price=None,
                 seller: str = "u-seller",
                 attrs: dict[str, tuple[str, str]] | None = None) -> None:
        ts = now()
        cls.conn.execute(
            "INSERT INTO city_listings (id, country_code, city_slug, region_code, type, category, title,"
            " price, status, seller_user_id, created_at, updated_at)"
            " VALUES (?, 'jp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (lid, city_slug, f"jp.{city_slug}", ltype, category, title, price, status, seller, ts, ts),
        )
        for key, (value, value_type) in (attrs or {}).items():
            cls.conn.execute(
                "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lid, key, value, value_type, ts, ts),
            )

    def setUp(self) -> None:
        # facet 计数有 60s 进程内缓存;每个用例清掉,避免用例间数据变更被缓存吃掉。
        server._LISTING_FACET_CACHE.clear()

    def fetch_payload(self, query: dict[str, str]) -> dict:
        handler = CapturingHandler()
        handler.api_listings(self.conn, query)
        return handler.payloads[-1]

    # ── 0 结果渐进放宽 ────────────────────────────────────────────────────────

    def test_relaxation_lists_each_active_condition_with_counts(self) -> None:
        # 东京 + 家具家电 + 可宠物 → 0 结果(东京两套各只有一个属性)。
        payload = self.fetch_payload({
            "type": "rental", "city_slug": "tokyo", "exact": "1",
            "attr_furnished": "true", "attr_pet_allowed": "true",
        })
        self.assertEqual(payload["items"], [])
        relax = payload["relaxation"]
        by_key = {r["key"]: r for r in relax}
        # 去掉「可宠物」→ 东京的家具家电房源 1 套;去掉「家具家电」→ 可宠物 1 套。
        self.assertEqual(by_key["attr_pet_allowed"]["count_if_removed"], 1)
        self.assertEqual(by_key["attr_pet_allowed"]["kind"], "attr")
        self.assertEqual(by_key["attr_pet_allowed"]["label"], "可养宠物")
        self.assertEqual(by_key["attr_furnished"]["count_if_removed"], 1)
        # scope 条件也给计数:去掉「东京」→ 大阪那套双属性房源 1 套。
        self.assertEqual(by_key["city_slug"]["kind"], "scope")
        self.assertEqual(by_key["city_slug"]["count_if_removed"], 1)

    def test_relaxation_covers_price_category_and_query_kinds(self) -> None:
        payload = self.fetch_payload({
            "type": "rental", "city_slug": "tokyo", "exact": "1",
            "category": "整租", "q": "不存在的关键词xyz", "min_price": "60000",
        })
        self.assertEqual(payload["items"], [])
        kinds = {r["key"]: r["kind"] for r in payload["relaxation"]}
        self.assertEqual(kinds["category"], "category")
        self.assertEqual(kinds["q"], "query")
        self.assertEqual(kinds["min_price"], "price")
        by_key = {r["key"]: r for r in payload["relaxation"]}
        # 只有关键词是致命条件:移除它 → 东京整租 2 套。
        self.assertEqual(by_key["q"]["count_if_removed"], 2)
        self.assertEqual(by_key["category"]["count_if_removed"], 0)

    def test_relaxation_absent_when_results_exist(self) -> None:
        payload = self.fetch_payload({
            "type": "rental", "city_slug": "tokyo", "exact": "1", "attr_furnished": "true",
        })
        self.assertEqual([i["id"] for i in payload["items"]], ["r-furnished"])
        self.assertNotIn("relaxation", payload)

    def test_relaxation_absent_for_pure_geo_empty(self) -> None:
        # 纯地域造成的空仍走既有地域回退,不产出 relaxation。
        payload = self.fetch_payload({"type": "rental", "city_slug": "nagoya", "exact": "1"})
        self.assertNotIn("relaxation", payload)

    def test_malformed_price_is_ignored_not_500(self) -> None:
        # 旧代码 clauses.append 在 float() 之前,?min_price=abc 会因绑定数
        # 不匹配抛错;现在与畸形 limit 一样静默忽略。
        payload = self.fetch_payload({"type": "rental", "city_slug": "tokyo", "exact": "1",
                                      "min_price": "abc"})
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["items"]), 3)

    # ── facet 计数 ───────────────────────────────────────────────────────────

    def test_facet_counts_basic_and_truthy_merge(self) -> None:
        payload = self.fetch_payload({"type": "rental", "city_slug": "tokyo", "exact": "1",
                                      "facets": "1"})
        counts = payload["facet_counts"]
        self.assertEqual(counts["furnished"], {"true": 1})
        # r-pet 存的是 '1',并进 'true' 桶。
        self.assertEqual(counts["pet_allowed"], {"true": 1})

    def test_facet_counts_disjunctive_for_selected_key(self) -> None:
        # 选中「家具家电」后:自身 key 的计数摘掉自己的 clause(仍是 1),
        # 其它 key 在「家具家电」子集内计数(东京家具家电房无宠物属性 → 无桶)。
        payload = self.fetch_payload({"type": "rental", "city_slug": "tokyo", "exact": "1",
                                      "facets": "1", "attr_furnished": "true"})
        counts = payload["facet_counts"]
        self.assertEqual(counts["furnished"], {"true": 1})
        self.assertNotIn("pet_allowed", counts)

    def test_facet_counts_not_present_without_flag(self) -> None:
        payload = self.fetch_payload({"type": "rental", "city_slug": "tokyo", "exact": "1"})
        self.assertNotIn("facet_counts", payload)

    def test_facet_counts_cached_within_ttl(self) -> None:
        query = {"type": "rental", "city_slug": "tokyo", "exact": "1", "facets": "1"}
        first = self.fetch_payload(query)["facet_counts"]
        # 缓存生效期间新数据不体现(60s TTL);清缓存后立即体现。
        self._listing("r-cache-probe", "整租", "缓存探针房", price=60000,
                      attrs={"furnished": ("true", "bool")})
        try:
            cached = self.fetch_payload(query)["facet_counts"]
            self.assertEqual(cached, first)
            server._LISTING_FACET_CACHE.clear()
            fresh = self.fetch_payload(query)["facet_counts"]
            self.assertEqual(fresh["furnished"], {"true": 2})
        finally:
            self.conn.execute("DELETE FROM listing_attributes WHERE listing_id = 'r-cache-probe'")
            self.conn.execute("DELETE FROM city_listings WHERE id = 'r-cache-probe'")

    # ── 保存搜索 v2:attr/价格条件匹配 ───────────────────────────────────────

    def _saved_search(self, sid: str, *, filter_json: str, vertical: str = "rental",
                      city_slug: str = "", keyword: str = "", category: str = "") -> None:
        ts = now()
        self.conn.execute(
            "INSERT INTO saved_searches (id, user_id, vertical, city_slug, region_code, country_code,"
            " keyword, category, filter_json, label, cadence, created_at, updated_at)"
            " VALUES (?, 'u-sub', ?, ?, '', '', ?, ?, ?, 'test', 'instant', ?, ?)",
            (sid, vertical, city_slug, keyword, category, filter_json, ts, ts),
        )

    def _notify(self, listing_id: str) -> int:
        row = self.conn.execute("SELECT * FROM city_listings WHERE id = ?", (listing_id,)).fetchone()
        return server.notify_saved_search_matches(self.conn, dict(row))

    def _cleanup_saved(self) -> None:
        self.conn.execute("DELETE FROM saved_searches WHERE user_id = 'u-sub'")
        self.conn.execute("DELETE FROM notifications WHERE user_id = 'u-sub'")

    def test_saved_search_attr_filter_matches(self) -> None:
        self._saved_search("ss-furnished", filter_json='{"attr_furnished":"true"}')
        try:
            self.assertEqual(self._notify("r-furnished"), 1)
            note = self.conn.execute(
                "SELECT * FROM notifications WHERE user_id = 'u-sub' AND type = 'saved_search'"
            ).fetchone()
            self.assertIsNotNone(note)
            self.assertEqual(note["target_listing_id"], "r-furnished")
        finally:
            self._cleanup_saved()

    def test_saved_search_attr_filter_rejects_nonmatching(self) -> None:
        self._saved_search("ss-pet", filter_json='{"attr_pet_allowed":"true"}')
        try:
            self.assertEqual(self._notify("r-furnished"), 0)
            # truthy 展开:属性值 '1' 也命中 "true" 订阅。
            self.assertEqual(self._notify("r-pet"), 1)
        finally:
            self._cleanup_saved()

    def test_saved_search_price_and_gte_semantics(self) -> None:
        # 价格上限 75000:r-furnished(90000) 不推,r-both-osaka(70000) 推。
        self._saved_search("ss-price", filter_json='{"attr_furnished":"true","max_price":75000}')
        try:
            self.assertEqual(self._notify("r-furnished"), 0)
            self.assertEqual(self._notify("r-both-osaka"), 1)
        finally:
            self._cleanup_saved()
        # gte 语义走 CAST AS REAL:属性行缺失 = 不匹配。
        self._listing("s-stay6", "民宿", "六人町屋", ltype="local_service", price=12000,
                      attrs={"max_guests": ("6", "int")})
        self._listing("s-stay2", "民宿", "双人民宿", ltype="local_service", price=8000,
                      attrs={"max_guests": ("2", "int")})
        self._saved_search("ss-guests", vertical="local_service",
                           filter_json='{"attr_gte_max_guests":"4"}')
        try:
            self.assertEqual(self._notify("s-stay6"), 1)
            self.assertEqual(self._notify("s-stay2"), 0)
        finally:
            self._cleanup_saved()

    def test_saved_search_v1_rows_without_filters_unchanged(self) -> None:
        self._saved_search("ss-v1", filter_json="{}", city_slug="osaka")
        try:
            self.assertEqual(self._notify("r-both-osaka"), 1)
        finally:
            self._cleanup_saved()

    def test_create_saved_search_persists_filter_json(self) -> None:
        # api_create_saved_search 落 filter_json 的既有路径无回归,
        # 且落库后的行能直接被 v2 匹配用起来。
        handler = CapturingHandler()
        handler.require_user = lambda conn: {"id": "u-sub"}
        handler.read_json = lambda: {
            "vertical": "rental", "city_slug": "tokyo",
            "filters": {"attr_furnished": "true", "max_price": 100000},
        }
        handler.api_create_saved_search(self.conn)
        try:
            item = handler.payloads[-1]["item"]
            self.assertEqual(item["filters"], {"attr_furnished": "true", "max_price": 100000})
            row = dict(self.conn.execute(
                "SELECT * FROM saved_searches WHERE id = ?", (item["id"],)).fetchone())
            criteria = server.saved_search_filter_criteria(row)
            self.assertEqual(criteria["attr_eq"], {"furnished": ["true"]})
            self.assertEqual(criteria["max_price"], 100000.0)
            self.assertEqual(self._notify("r-furnished"), 1)
        finally:
            self._cleanup_saved()

    # ── stareal 导入映射的布尔属性推断 ───────────────────────────────────────

    def test_stareal_map_item_infers_pet_and_furnished(self) -> None:
        item = {
            "nid": "9901", "title": "家具・家電付き 1LDK", "price": "98000",
            "address": "東京都新宿区", "woshi": "1",
            "flatInInfo": {"gou": 1, "dt": 1},
            "detail": "<p>ペット相談可。</p>",
        }
        row = server_stareal.map_item("rent", item)
        self.assertEqual(row["attrs"]["pet_allowed"], True)
        self.assertEqual(row["attrs"]["furnished"], True)
        self.assertIn("可养狗", row["attrs"]["amenities"])

    def test_stareal_map_item_skips_booleans_for_sale_intent(self) -> None:
        item = {"nid": "9902", "title": "家具付き分譲", "price": "32000000",
                "address": "東京都", "flatInInfo": {"mao": 1}}
        row = server_stareal.map_item("buy", item)
        self.assertNotIn("pet_allowed", row["attrs"])
        self.assertNotIn("furnished", row["attrs"])

    def test_stareal_map_item_no_false_positive_on_plain_listing(self) -> None:
        item = {"nid": "9903", "title": "駅近 2LDK", "price": "120000",
                "address": "東京都", "detail": "<p>家具は付属しません。</p>"}
        row = server_stareal.map_item("rent", item)
        self.assertNotIn("furnished", row["attrs"])
        self.assertNotIn("pet_allowed", row["attrs"])

    # ── backfill 脚本(dry-run / --apply / 幂等)─────────────────────────────

    def test_backfill_script_dry_run_then_apply_idempotent(self) -> None:
        ts = now()
        # partner 存量长租:amenities 文本有可养猫、描述有家電付き,但没有布尔属性行。
        self._listing("p-legacy", "マンション", "パートナー物件", price=88000, attrs={
            "amenities": ("电梯，可养猫", "string"),
        })
        self.conn.execute(
            "UPDATE city_listings SET description = '家電付き、即入居可。' WHERE id = 'p-legacy'")
        self.conn.execute(
            "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
            " VALUES (?, 'p-legacy', '__partner', 'stareal', 'string', ?, ?)",
            (str(uuid.uuid4()), ts, ts),
        )
        # 非 partner 长租(不该被扫到):同样文本但无 __partner 标记。
        self._listing("np-user", "整租", "個人出品 家具家電付き", price=70000, attrs={})
        self.conn.commit()

        script = ROOT / "scripts" / "backfill_stareal_listing_attrs.py"

        def run(*extra: str) -> str:
            proc = subprocess.run(
                [sys.executable, str(script), "--db", str(_TMP_DB), *extra],
                capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            return proc.stdout

        try:
            out = run()
            self.assertIn("pet_allowed to add: 1", out)
            self.assertIn("furnished  to add: 1", out)
            # dry-run 未写库。
            self.assertEqual(self.conn.execute(
                "SELECT COUNT(*) AS n FROM listing_attributes WHERE listing_id = 'p-legacy'"
                " AND key IN ('pet_allowed','furnished')").fetchone()["n"], 0)

            run("--apply")
            rows = {r["key"]: (r["value"], r["value_type"]) for r in self.conn.execute(
                "SELECT key, value, value_type FROM listing_attributes WHERE listing_id = 'p-legacy'"
                " AND key IN ('pet_allowed','furnished')")}
            self.assertEqual(rows, {"pet_allowed": ("true", "bool"), "furnished": ("true", "bool")})
            # 非 partner 行未被动过。
            self.assertEqual(self.conn.execute(
                "SELECT COUNT(*) AS n FROM listing_attributes WHERE listing_id = 'np-user'").fetchone()["n"], 0)
            # 幂等:再跑一次 0 新增。
            out3 = run("--apply")
            self.assertIn("pet_allowed to add: 0", out3)
            self.assertIn("furnished  to add: 0", out3)
        finally:
            self.conn.execute("DELETE FROM listing_attributes WHERE listing_id IN ('p-legacy','np-user')")
            self.conn.execute("DELETE FROM city_listings WHERE id IN ('p-legacy','np-user')")
            self.conn.commit()


if __name__ == "__main__":
    unittest.main(verbosity=2)
