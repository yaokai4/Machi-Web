#!/usr/bin/env python3
"""Functional coverage for server-side listing filters, similar listings and
seller scoping — runs the real handlers against a throwaway SQLite database."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-filters-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


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


class ListingFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = now()
        for uid, handle in (("u-seller", "seller"), ("u-other", "other")):
            cls.conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, joined_at, created_at, updated_at)"
                " VALUES (?, ?, ?, 'x', ?, ?, ?)",
                (uid, handle, handle, ts, ts, ts),
            )
        cls._listing("l-new", "u-seller", "secondhand", "家具家居", "九成新沙发",
                     attrs={"condition": ("like_new", "string"), "delivery_method": ("meetup", "string"),
                            "price_negotiable": ("true", "bool")})
        cls._listing("l-used", "u-other", "secondhand", "家具家居", "旧书桌",
                     attrs={"condition": ("used", "string"), "delivery_method": ("shipping", "string")})
        cls._listing("l-tokyo-2", "u-other", "secondhand", "家电", "微波炉",
                     attrs={"condition": ("good", "string")})
        cls._listing("l-both-delivery", "u-other", "secondhand", "电子产品", "相机",
                     attrs={"delivery_method": ("pickup_or_shipping", "string")})
        cls._listing("l-job-remote", "u-other", "hiring", "IT/互联网", "远程前端",
                     attrs={"remote_ok": ("true", "bool"), "japanese_level": ("N2", "string")})
        cls._listing("l-job-office", "u-other", "hiring", "IT/互联网", "驻场后端",
                     attrs={"japanese_level": ("N1", "string")})
        cls._listing("l-hidden", "u-seller", "secondhand", "家具家居", "已下架椅子",
                     status="hidden", attrs={"condition": ("like_new", "string")})
        cls._listing("l-osaka", "u-other", "secondhand", "家具家居", "大阪沙发",
                     city_slug="osaka", attrs={"condition": ("like_new", "string")})

    @classmethod
    def _listing(cls, lid: str, seller: str, ltype: str, category: str, title: str,
                 status: str = "published", city_slug: str = "tokyo",
                 attrs: dict[str, tuple[str, str]] | None = None) -> None:
        ts = now()
        cls.conn.execute(
            "INSERT INTO city_listings (id, country_code, city_slug, region_code, type, category, title,"
            " status, seller_user_id, created_at, updated_at)"
            " VALUES (?, 'jp', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (lid, city_slug, f"jp.{city_slug}", ltype, category, title, status, seller, ts, ts),
        )
        for key, (value, value_type) in (attrs or {}).items():
            cls.conn.execute(
                "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), lid, key, value, value_type, ts, ts),
            )

    def fetch(self, query: dict[str, str]) -> list[str]:
        handler = CapturingHandler()
        handler.api_listings(self.conn, query)
        return [item["id"] for item in handler.payloads[-1]["items"]]

    def test_attr_filter_matches_exact_value(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_condition": "like_new"})
        self.assertEqual(ids, ["l-new"])

    def test_attr_filter_multi_value_is_or(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_condition": "like_new,used"})
        self.assertEqual(set(ids), {"l-new", "l-used"})

    def test_attr_filters_combine_with_and(self) -> None:
        ids = self.fetch({
            "type": "secondhand", "city_slug": "tokyo",
            "attr_condition": "like_new,used", "attr_delivery_method": "shipping",
        })
        self.assertEqual(ids, ["l-used"])

    def test_bool_attr_filter_accepts_truthy_spellings(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_price_negotiable": "true"})
        self.assertEqual(ids, ["l-new"])

    def test_delivery_method_filter_includes_pickup_or_shipping_records(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_delivery_method": "pickup"})
        self.assertEqual(ids, ["l-both-delivery"])
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_delivery_method": "shipping"})
        self.assertEqual(set(ids), {"l-used", "l-both-delivery"})

    def test_delivery_boolean_filters_read_legacy_delivery_method(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_pickup_available": "true"})
        self.assertEqual(ids, ["l-both-delivery"])
        # delivery_method=shipping 本身就意味着可邮寄，所以 l-used 也应命中。
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_shipping_available": "true"})
        self.assertEqual(set(ids), {"l-used", "l-both-delivery"})

    def test_unknown_attr_key_is_ignored(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_nonexistent": "x"})
        self.assertEqual(set(ids), {"l-new", "l-used", "l-tokyo-2", "l-both-delivery"})

    def test_job_remote_filter(self) -> None:
        ids = self.fetch({"type": "hiring", "city_slug": "tokyo", "attr_remote_ok": "true"})
        self.assertEqual(ids, ["l-job-remote"])

    def test_attr_gte_filters_numeric_minimum(self) -> None:
        self._listing("l-stay-2", "u-other", "local_service", "民宿", "双人民宿",
                      attrs={"max_guests": ("2", "int")})
        self._listing("l-stay-6", "u-other", "local_service", "民宿", "六人町屋",
                      attrs={"max_guests": ("6", "int")})
        ids = self.fetch({"type": "local_service", "city_slug": "tokyo", "attr_gte_max_guests": "4"})
        self.assertEqual(ids, ["l-stay-6"])
        ids = self.fetch({"type": "local_service", "city_slug": "tokyo", "attr_gte_max_guests": "junk"})
        self.assertEqual(set(ids), {"l-stay-2", "l-stay-6"})

    def test_attr_filter_excludes_hidden_listings(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "attr_condition": "like_new"})
        self.assertNotIn("l-hidden", ids)

    def test_seller_scope_returns_public_only(self) -> None:
        ids = self.fetch({"type": "secondhand", "seller_id": "u-seller"})
        self.assertEqual(ids, ["l-new"])

    def test_exclude_drops_current_listing(self) -> None:
        ids = self.fetch({"type": "secondhand", "city_slug": "tokyo", "exclude": "l-new"})
        self.assertNotIn("l-new", ids)

    def test_similar_prefers_same_category_same_city(self) -> None:
        handler = CapturingHandler()
        handler.api_listing_similar(self.conn, "l-new", {})
        items = handler.payloads[-1]["items"]
        ids = [item["id"] for item in items]
        # 同类目同城排最前,然后是同类目同国(大阪),再补同城其他类目;
        # 不含自己、不含同卖家、不含已下架。
        self.assertEqual(ids[0], "l-used")
        self.assertIn("l-osaka", ids)
        self.assertIn("l-tokyo-2", ids)
        self.assertNotIn("l-new", ids)
        self.assertNotIn("l-hidden", ids)

    def test_similar_404_for_missing_listing(self) -> None:
        handler = CapturingHandler()
        with self.assertRaises(server.APIError):
            handler.api_listing_similar(self.conn, "missing", {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
