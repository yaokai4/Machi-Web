#!/usr/bin/env python3
"""Offline coverage for the 星域东京 authorized website sync endpoints."""

from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP = Path(tempfile.mkdtemp(prefix="kaix-stareal-"))
os.environ["KAIX_DB_PATH"] = str(_TMP / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_partners as partners  # noqa: E402
import server_stareal  # noqa: E402


def now() -> str:
    return server.now_iso()


class _H:
    def __init__(self, *, token: str, json_body: dict | None = None):
        self.h = server.Handler.__new__(server.Handler)
        self.h.headers = {"X-Partner-Token": token}
        self.h.read_json = lambda: dict(json_body or {})
        self.payloads = []
        self.status = []
        self.h.send_json = lambda payload, status=200: (self.payloads.append(payload), self.status.append(status))

    @property
    def last(self):
        return self.payloads[-1] if self.payloads else None


FAKE_ITEMS = [
    {
        "house_type": "rent",
        "item": {
            "nid": "101",
            "title": "Repure 早稻田 Residence",
            "price": "195000.00",
            "address": "东京新宿区早稻田",
            "mianji": "30.29",
            "woshi": "1",
            "flatType": "公寓",
            "detail": "<p>高层精装<br>可预约看房</p>",
            "distance": [{"line": "东西线", "title": "早稻田", "distance": "徒步6"}],
            "poster": "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/rent.jpg?itok=x",
            "images": [
                "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/rent.jpg?itok=x",
                "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/rent-2.jpg?itok=y",
            ],
            "tags": [{"title": "推荐"}],
        },
    },
    {
        "house_type": "buy",
        "item": {
            "nid": "202",
            "title": "Repure 早稻田 Residence",
            "price": "250000000.00",
            "address": "東京都中央区晴海",
            "mianji": "94.68",
            "woshi": "2",
            "flatType": "マンション",
            "detail": "海景房源",
            "distance": [{"line": "大江户线", "title": "胜哄", "distance": "徒步13"}],
            "poster": "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/sale.jpg?itok=z",
            "images": [
                "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/sale.jpg?itok=z",
                "https://stareal.jp/sites/default/files/styles/800_600/public/2026-05/sale-2.jpg?itok=q",
            ],
            "tags": [],
            "isVip": True,
        },
    },
]


def fake_fetch_all_items(house_types, **_kwargs):
    wanted = set(house_types)
    return [entry for entry in FAKE_ITEMS if entry["house_type"] in wanted]


def wait_job(conn, job_id: str, timeout: float = 5.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = conn.execute("SELECT * FROM partner_sync_jobs WHERE id = ?", (job_id,)).fetchone()
        if last and last["status"] in {"succeeded", "failed"}:
            return last
        time.sleep(0.05)
    return last


def clear_imported_partner_data(conn):
    conn.execute("DELETE FROM listing_media")
    conn.execute("DELETE FROM listing_promotions")
    conn.execute("DELETE FROM listing_attributes")
    conn.execute("DELETE FROM city_listings")
    conn.execute("DELETE FROM partner_sync_jobs")
    conn.execute("UPDATE partners SET listing_count = 0")


class StarealPartnerImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = now()
        cls.conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at)"
            " VALUES ('seller1','partner_stareal','星域东京','x','member',?,?,?)",
            (ts, ts, ts),
        )
        partner, token = partners.create_partner(
            cls.conn,
            key="xingyu-tokyo",
            name="星域东京",
            seller_user_id="seller1",
            website="https://stareal.jp/",
            sale_enabled=True,
            default_city_slug="tokyo",
            default_badges=["Machi推荐", "星域臻选"],
            now=ts,
        )
        cls.partner = partner
        cls.token = token
        partners.create_partner_contact(
            cls.conn,
            "xingyu-tokyo",
            {"name": "星域管家", "phone": "03-0000-0000", "is_default": True},
            now=ts,
        )
        cls.conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at)"
            " VALUES ('seller2','partner_other','其他合作商','x','member',?,?,?)",
            (ts, ts, ts),
        )
        _other_partner, cls.other_token = partners.create_partner(
            cls.conn,
            key="other-partner",
            name="其他合作商",
            seller_user_id="seller2",
            website="https://example.com/",
            now=ts,
        )

    def setUp(self):
        self._old_fetch = server_stareal.fetch_all_items
        server_stareal.fetch_all_items = fake_fetch_all_items

    def tearDown(self):
        server_stareal.fetch_all_items = self._old_fetch

    def test_preview_maps_all_selected_stareal_rows(self):
        h = _H(token=self.token, json_body={"types": ["rent", "buy"], "maxImages": 20})
        h.h.api_partner_stareal_preview(self.conn, "xingyu-tokyo")
        out = h.last
        self.assertEqual(out["rowCount"], 2)
        self.assertEqual(out["summary"]["byType"], {"rent": 1, "buy": 1})
        self.assertEqual(out["summary"]["imageCount"], 4)
        self.assertEqual(out["rows"][0]["listing_intent"], "rent")
        self.assertEqual(out["rows"][1]["listing_intent"], "sale")
        self.assertTrue(out["rows"][0]["image_urls"][0].endswith("/2026-05/rent.jpg"))

    def test_admin_preview_uses_real_partner_key(self):
        h = _H(token="", json_body={"types": ["rent"], "maxImages": 20})
        h.h.require_admin = lambda _conn: {"id": "admin1", "role": "admin"}
        h.h.api_admin_partner_stareal_preview(self.conn, "xingyu-tokyo")
        out = h.last
        self.assertEqual(out["rowCount"], 1)
        self.assertEqual(out["summary"]["byType"], {"rent": 1})

    def test_sync_is_idempotent_and_publishes_photos(self):
        clear_imported_partner_data(self.conn)
        body = {"types": ["rent", "buy"], "maxImages": 20, "rehostUrls": False}
        h = _H(token=self.token, json_body=body)
        h.h.api_partner_stareal_sync(self.conn, "xingyu-tokyo")
        self.assertEqual(h.status[-1], 202)
        job = wait_job(self.conn, h.last["job"]["id"])
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "succeeded")
        result = server.json.loads(job["result_json"])
        self.assertEqual((result["created"], result["updated"], result["total"]), (2, 0, 2))
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) c FROM city_listings WHERE deleted_at IS NULL").fetchone()["c"],
            2,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) c FROM listing_media").fetchone()["c"],
            4,
        )
        ext = self.conn.execute(
            "SELECT COUNT(*) c FROM listing_attributes WHERE key = '__partner_ext_id' AND value IN ('stareal-101','stareal-202')"
        ).fetchone()["c"]
        self.assertEqual(ext, 2)

        h2 = _H(token=self.token, json_body=body)
        h2.h.api_partner_stareal_sync(self.conn, "xingyu-tokyo")
        job2 = wait_job(self.conn, h2.last["job"]["id"])
        self.assertIsNotNone(job2)
        self.assertEqual(job2["status"], "succeeded")
        result2 = server.json.loads(job2["result_json"])
        self.assertEqual((result2["created"], result2["updated"], result2["total"]), (0, 2, 2))
        self.assertEqual(job2["progress"], 100)

    def test_partner_job_endpoint_returns_latest_progress(self):
        h = _H(token=self.token, json_body={"types": ["rent"], "maxImages": 20, "rehostUrls": False})
        h.h.api_partner_stareal_sync(self.conn, "xingyu-tokyo")
        job = wait_job(self.conn, h.last["job"]["id"])
        self.assertEqual(job["status"], "succeeded")

        out = _H(token=self.token)
        out.h.api_partner_stareal_job(self.conn, "xingyu-tokyo")
        self.assertEqual(out.last["job"]["id"], h.last["job"]["id"])
        self.assertEqual(out.last["job"]["status"], "succeeded")
        self.assertEqual(out.last["job"]["progress"], 100)

    def test_stareal_sync_is_limited_to_authorized_partner(self):
        h = _H(token=self.other_token, json_body={"types": ["rent"]})
        with self.assertRaises(server.APIError) as ctx:
            h.h.api_partner_stareal_preview(self.conn, "other-partner")
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(ctx.exception.code, "stareal_partner_required")

    def test_detail_enrichment_maps_full_field_set(self):
        # A house/detail-shaped record (superset of the list item) must map into
        # the richer attribute set: lat/lng + 築年 + 階数 + 物件番号 + 设备设施 + 周边.
        detail = {
            "nid": "999", "title": "晴海 Towers", "price": "250000000.00",
            "address": "东京都中央区晴海2丁目", "mianji": "94.68", "woshi": "2",
            "weishengjian": "1", "flatType": "公寓", "detail": "<p>海景</p>",
            "distance": [{"line": "大江户线", "title": "胜哄", "distance": "徒步13"}],
            "build": "2016", "dijiceng": "49", "fanghao": "4805", "no": "ADK88155487",
            "status": "运营中", "confirm_time": "2026/07/01", "xuyaogaizao": "不需要",
            "lng": "139.786092509", "lat": "35.656053774",
            "flatBaseInfo": {"dt": True, "ms": True},
            "flatOutInfo": {"kd": True, "jsf": True, "yc": False},
            "flatInInfo": {"yt": True}, "flatMoreInfo": {"tcc": True, "gou": False},
            "school": [{"title": "7-11便利店", "distance": "徒步2分钟"}],
            "poster": "https://stareal.jp/sites/default/files/styles/800_600/public/x/p.jpg?itok=a",
            "images": ["https://stareal.jp/sites/default/files/styles/800_600/public/x/p.jpg?itok=a"],
            "tags": [],
        }
        row = server_stareal.map_item("buy", detail, full_res=True)
        self.assertEqual(row["latitude"], 35.656053774)
        self.assertEqual(row["longitude"], 139.786092509)
        a = row["attrs"]
        self.assertEqual(a["building_age"], "2016年")
        self.assertEqual(a["total_floors"], "49階")
        self.assertEqual(a["room_no"], "4805")
        self.assertEqual(a["property_no"], "ADK88155487")
        self.assertEqual(a["availability_status"], "运营中")
        self.assertEqual(a["confirmed_at"], "2026/07/01")
        self.assertEqual(a["needs_renovation"], "不需要")
        # amenities: only the enabled flags, decoded to Chinese, no 'off' ones.
        self.assertIn("电梯", a["amenities"])
        self.assertIn("健身房", a["amenities"])
        self.assertNotIn("游泳池", a["amenities"])  # yc=False
        self.assertIn("7-11便利店", a["nearby_facilities"])
        # original (full-res) image url — styled derivative + itok stripped.
        self.assertTrue(row["image_urls"][0].endswith("/x/p.jpg"))

    def test_new_attrs_survive_serialization_both_types(self):
        # The new keys must be whitelisted for BOTH for_sale (buy/invest) and
        # rental, otherwise normalize_listing_attributes drops them on read.
        attrs = {
            "total_floors": "49階", "room_no": "4805", "property_no": "ADK88155487",
            "availability_status": "运营中", "confirmed_at": "2026/07/01",
            "needs_renovation": "不需要", "down_payment": 43000000, "amenities": "电梯，健身房",
            "nearby_facilities": "7-11便利店（徒步2分钟）", "building_age": "2016年",
        }
        for ltype in ("for_sale", "rental"):
            norm = server.normalize_listing_attributes(ltype, attrs)
            for k in ("total_floors", "room_no", "property_no", "availability_status",
                      "confirmed_at", "needs_renovation", "amenities", "nearby_facilities"):
                self.assertIn(k, norm, f"{k} dropped for {ltype}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
