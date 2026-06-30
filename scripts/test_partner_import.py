#!/usr/bin/env python3
"""Functional coverage for the partner import backend (星域东京 等专属后台):
token auth, contacts, xlsx/csv parse (incl. embedded images), idempotent import,
Machi推荐 + 闪耀标签 + 预约联系人 serialization, and commit tamper-resistance.
Runs the real handlers against a throwaway SQLite database + temp media dir."""

from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP = Path(tempfile.mkdtemp(prefix="kaix-partner-"))
os.environ["KAIX_DB_PATH"] = str(_TMP / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_partners as partners  # noqa: E402


def now() -> str:
    return server.now_iso()


def _tiny_png() -> bytes:
    try:
        from PIL import Image
        b = io.BytesIO()
        Image.new("RGB", (2, 2), (200, 80, 80)).save(b, "PNG")
        return b.getvalue()
    except Exception:
        # 1x1 transparent PNG fallback
        import base64
        return base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def _build_xlsx_with_image(png: bytes) -> bytes:
    CT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Default Extension="png" ContentType="image/png"/>'
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
          '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')
    RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    WB = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
    WBRELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
              '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
    # 标题 类型 售价 户型 -> header; data row: 银座2LDK 出售 8800万 2LDK
    SS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="8" uniqueCount="8">'
          '<si><t>标题</t></si><si><t>类型</t></si><si><t>售价</t></si><si><t>户型</t></si>'
          '<si><t>银座2LDK</t></si><si><t>出售</t></si><si><t>8800万</t></si><si><t>2LDK</t></si></sst>')
    SHEET = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
             '<sheetData>'
             '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
             '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row>'
             '</sheetData><drawing r:id="rId1"/></worksheet>')
    SHEETRELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>')
    DRAW = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<xdr:oneCellAnchor><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
            '<xdr:ext cx="900000" cy="900000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="p"/><xdr:cNvPicPr/></xdr:nvPicPr>'
            '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>')
    DRAWRELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("xl/workbook.xml", WB)
        z.writestr("xl/_rels/workbook.xml.rels", WBRELS)
        z.writestr("xl/sharedStrings.xml", SS)
        z.writestr("xl/worksheets/sheet1.xml", SHEET)
        z.writestr("xl/worksheets/_rels/sheet1.xml.rels", SHEETRELS)
        z.writestr("xl/drawings/drawing1.xml", DRAW)
        z.writestr("xl/drawings/_rels/drawing1.xml.rels", DRAWRELS)
        z.writestr("xl/media/image1.png", png)
    return buf.getvalue()


def _multipart(field: str, filename: str, content_type: str, body: bytes) -> tuple[str, bytes]:
    boundary = "----machitest123456"
    pre = (f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
           f'Content-Type: {content_type}\r\n\r\n').encode()
    post = f'\r\n--{boundary}--\r\n'.encode()
    return f"multipart/form-data; boundary={boundary}", pre + body + post


class _H:
    """server.Handler with the network plumbing stubbed out."""

    def __init__(self, *, admin_id: str | None = None, headers: dict | None = None,
                 json_body: dict | None = None, raw_body: bytes | None = None,
                 content_type: str = ""):
        self.h = server.Handler.__new__(server.Handler)
        hdrs = dict(headers or {})
        if content_type:
            hdrs["Content-Type"] = content_type
        if raw_body is not None:
            hdrs["Content-Length"] = str(len(raw_body))
        self.h.headers = hdrs
        self.payloads = []
        self.status = []
        self.h.send_json = lambda payload, status=200: (self.payloads.append(payload), self.status.append(status))
        self.h.current_session = (lambda conn: {"user_id": admin_id}) if admin_id else (lambda conn: None)
        self.h.read_json = lambda: dict(json_body or {})
        self.h.read_bytes = lambda: (raw_body or b"")

    @property
    def last(self):
        return self.payloads[-1] if self.payloads else None


class PartnerImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        # redirect media writes into the temp dir
        cls._media_backup = server.MEDIA_DIR
        server.MEDIA_DIR = _TMP / "media"
        server.MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        ts = now()
        cls.conn.execute(
            "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at)"
            " VALUES ('admin1','admin','Admin','x','admin',?,?,?)", (ts, ts, ts))

    @classmethod
    def tearDownClass(cls):
        server.MEDIA_DIR = cls._media_backup

    def _admin(self, **kw):
        return _H(admin_id="admin1", **kw)

    def test_01_admin_create_partner(self):
        h = self._admin(json_body={"key": "stareal", "name": "星域东京", "name_ja": "スタリアル",
                                    "default_city_slug": "tokyo", "default_region_code": "jp.tokyo.tokyo",
                                    "sale_enabled": True, "brand_color": "#1f6feb",
                                    "default_badges": ["Machi推荐", "星域臻选", "认证房源"]})
        self.h = h.h
        h.h.api_admin_partner_create(self.conn)
        out = h.last
        self.assertEqual(h.status[-1], 201)
        self.assertTrue(out["accessToken"].startswith("mpt_"))
        self.assertEqual(out["url"], "/partner/stareal")
        type(self).TOKEN = out["accessToken"]
        p = partners.get_partner(self.conn, "stareal")
        self.assertTrue(p and p["seller_user_id"])
        # seller user exists, is a member (NOT admin)
        seller = self.conn.execute("SELECT role FROM users WHERE id=?", (p["seller_user_id"],)).fetchone()
        self.assertEqual(seller["role"], "member")

    def test_02_token_auth(self):
        self.assertIsNotNone(partners.authenticate_partner(self.conn, "stareal", self.TOKEN))
        self.assertIsNone(partners.authenticate_partner(self.conn, "stareal", "mpt_wrong"))
        # require_partner via header
        h = _H(headers={"X-Partner-Token": self.TOKEN})
        self.assertEqual(h.h.require_partner(self.conn, "stareal")["partner_key"], "stareal")
        bad = _H(headers={"X-Partner-Token": "nope"})
        with self.assertRaises(server.APIError):
            bad.h.require_partner(self.conn, "stareal")

    def test_03_contacts_crud(self):
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"name": "田中太郎", "title": "営業担当",
                                                                   "phone": "03-1234-5678", "line_id": "stareal-tanaka",
                                                                   "is_default": True})
        h.h.api_partner_contact_create(self.conn, "stareal")
        cid = h.last["contact"]["id"]
        type(self).CONTACT_ID = cid
        self.assertTrue(h.last["contact"]["isDefault"])
        # update + resync (no listings yet -> 0)
        h2 = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"phone": "03-9999-0000"})
        h2.h.api_partner_contact_update(self.conn, "stareal", cid)
        self.assertEqual(h2.last["contact"]["phone"], "03-9999-0000")

    def test_04_parse_csv_multipart(self):
        csv = ("标题,类型,租金,户型,面积,图片链接,Machi推荐\n"
               "新宿1LDK高层,出租,158000,1LDK,40,http://img/a.jpg http://img/b.jpg,是\n").encode("utf-8-sig")
        ctype, body = _multipart("file", "listings.csv", "text/csv", csv)
        h = _H(headers={"X-Partner-Token": self.TOKEN}, raw_body=body, content_type=ctype)
        h.h.api_partner_import_parse(self.conn, "stareal")
        out = h.last
        self.assertEqual(out["rowCount"], 1)
        row = out["rows"][0]
        self.assertEqual(row["listing_intent"], "rent")
        self.assertEqual(row["price"], 158000.0)
        self.assertEqual(len(row["image_urls"]), 2)
        self.assertTrue(row["machi_recommended"])

    def test_05_parse_xlsx_embedded_image(self):
        xlsx = _build_xlsx_with_image(_tiny_png())
        ctype, body = _multipart("file", "bukken.xlsx",
                                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx)
        h = _H(headers={"X-Partner-Token": self.TOKEN}, raw_body=body, content_type=ctype)
        h.h.api_partner_import_parse(self.conn, "stareal")
        row = h.last["rows"][0]
        self.assertEqual(row["listing_intent"], "sale")
        self.assertEqual(row["price"], 88000000.0)  # 8800万
        # the embedded image was persisted under /media/ and attached to the row
        self.assertTrue(any(u.startswith("/media/") or u.startswith("http") for u in row["image_urls"]))
        self.assertTrue(any("/media/partners/stareal/" in u for u in row["image_urls"]))

    def test_06_commit_and_serialize(self):
        rows = [{
            "ext_id": "ST-001", "title": "新宿1LDK高层", "listing_intent": "rent", "price": 158000,
            "city_slug": "tokyo", "location_text": "东京都新宿区", "status": "published",
            "attrs": {"layout": "1LDK", "area_sqm": 40, "rent": 158000, "nearest_station": "新宿三丁目駅"},
            "image_urls": ["http://img/a.jpg", "/media/partners/stareal/x.jpg"],
            "contact_id": self.CONTACT_ID, "badges": ["Machi推荐", "星域臻选"], "machi_recommended": True,
        }]
        # rehost off so external URLs are stored directly (no network in tests)
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"rows": rows, "options": {"rehostUrls": False}})
        h.h.api_partner_import_commit(self.conn, "stareal")
        res = h.last["result"]
        self.assertEqual(res["created"], 1)
        lid = res["results"][0]["listing_id"]

        # serialize via the real listing hydration path
        row = dict(self.conn.execute("SELECT * FROM city_listings WHERE id=?", (lid,)).fetchone())
        payload = server.fetch_listings_with_extras(self.conn, [row], None)[0]
        self.assertTrue(payload["machiRecommended"])
        self.assertEqual(payload["machiBadges"], ["Machi推荐", "星域臻选"])
        self.assertEqual(payload["reservationContact"]["name"], "田中太郎")
        self.assertEqual(payload["reservationContact"]["phone"], "03-9999-0000")
        self.assertTrue(payload["isPromoted"])
        # internal markers must NOT leak to the client
        self.assertNotIn("__partner", payload["attributes"])
        self.assertNotIn("__partner_ext_id", payload["attributes"])
        self.assertEqual(payload["attributes"]["listing_intent"], "rent")
        # promotion record present
        promo = self.conn.execute("SELECT promotion_type,status FROM listing_promotions WHERE listing_id=?", (lid,)).fetchone()
        self.assertEqual((promo["promotion_type"], promo["status"]), ("featured", "active"))

    def test_07_idempotent_reimport(self):
        before = self.conn.execute("SELECT COUNT(*) c FROM city_listings WHERE deleted_at IS NULL").fetchone()["c"]
        rows = [{"ext_id": "ST-001", "title": "新宿1LDK高层 (改价)", "listing_intent": "rent", "price": 162000,
                 "city_slug": "tokyo", "attrs": {"rent": 162000}, "image_urls": ["/media/partners/stareal/x.jpg"],
                 "contact_id": self.CONTACT_ID, "machi_recommended": True}]
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"rows": rows, "options": {"rehostUrls": False}})
        h.h.api_partner_import_commit(self.conn, "stareal")
        res = h.last["result"]
        self.assertEqual((res["created"], res["updated"]), (0, 1))  # matched by (partner, ext_id)
        after = self.conn.execute("SELECT COUNT(*) c FROM city_listings WHERE deleted_at IS NULL").fetchone()["c"]
        self.assertEqual(before, after)

    def test_08_commit_tamper_resistance(self):
        # tampered: unknown attr key, fake contact id, sale intent (partner allows it)
        rows = [{"ext_id": "ST-evil", "title": "测试房源", "listing_intent": "sale", "price": 5000,
                 "city_slug": "tokyo", "attrs": {"evil_key": "x", "verification_status": "verified", "sale_price": 5000},
                 "image_urls": ["javascript:alert(1)", "http://ok/a.jpg"], "contact_id": "pc_does_not_exist",
                 "badges": ["a", "b", "c", "d", "e", "f"], "machi_recommended": True}]
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"rows": rows, "options": {"rehostUrls": False}})
        h.h.api_partner_import_commit(self.conn, "stareal")
        lid = h.last["result"]["results"][0]["listing_id"]
        attrs = {r["key"]: r["value"] for r in self.conn.execute("SELECT key,value FROM listing_attributes WHERE listing_id=?", (lid,))}
        self.assertNotIn("evil_key", attrs)            # unknown attr dropped
        self.assertNotIn("verification_status", attrs)  # not an attribute, can't be injected
        payload = server.fetch_listings_with_extras(self.conn, [dict(self.conn.execute("SELECT * FROM city_listings WHERE id=?", (lid,)).fetchone())], None)[0]
        self.assertEqual(payload["verificationStatus"], "verified")  # set by server, not client
        self.assertLessEqual(len(payload["machiBadges"]), 4)         # badge count clamped
        self.assertNotIn("javascript:alert(1)", [m.get("url") for m in payload["media"]])  # bad scheme rejected
        # fake contact id falls back to the default contact
        self.assertEqual(payload["reservationContact"]["name"], "田中太郎")

    def test_09_partner_listings_scope(self):
        h = _H(headers={"X-Partner-Token": self.TOKEN})
        h.h.api_partner_listings(self.conn, "stareal", {})
        listings = h.last["listings"]
        self.assertGreaterEqual(len(listings), 2)
        for l in listings:
            self.assertIn(l["type"], ("rental", "for_sale"))

    def test_10_for_sale_type_separation(self):
        rows = [
            {"ext_id": "SALE-1", "title": "银座投资一户建", "listing_intent": "sale", "price": 98000000,
             "city_slug": "tokyo", "attrs": {"sale_price": 98000000, "layout": "4LDK", "yield_rate": 4.2},
             "image_urls": ["/media/partners/stareal/y.jpg"], "contact_id": self.CONTACT_ID, "machi_recommended": True},
            {"ext_id": "RENT-1", "title": "涩谷长租1K", "listing_intent": "rent", "price": 120000,
             "city_slug": "tokyo", "attrs": {"rent": 120000}, "image_urls": ["/media/partners/stareal/z.jpg"],
             "contact_id": self.CONTACT_ID},
        ]
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"rows": rows, "options": {"rehostUrls": False}})
        h.h.api_partner_import_commit(self.conn, "stareal")
        res = h.last["result"]
        self.assertEqual(res["created"], 2)
        sale_id = next(r["listing_id"] for r in res["results"] if r["title"].startswith("银座"))
        rent_id = next(r["listing_id"] for r in res["results"] if r["title"].startswith("涩谷"))
        self.assertEqual(self.conn.execute("SELECT type FROM city_listings WHERE id=?", (sale_id,)).fetchone()["type"], "for_sale")
        self.assertEqual(self.conn.execute("SELECT type FROM city_listings WHERE id=?", (rent_id,)).fetchone()["type"], "rental")
        # 买房 gets the property_viewing inquiry type (预约看房/咨询)
        sale_row = dict(self.conn.execute("SELECT * FROM city_listings WHERE id=?", (sale_id,)).fetchone())
        self.assertEqual(server.listing_inquiry_type(sale_row), "property_viewing")
        # serialized 买房 listing still carries Machi推荐 + contact + sale_price attr
        payload = server.fetch_listings_with_extras(self.conn, [sale_row], None)[0]
        self.assertTrue(payload["machiRecommended"])
        self.assertEqual(payload["reservationContact"]["name"], "田中太郎")
        self.assertIn("sale_price", payload["attributes"])

    def test_11_partner_single_listing_crud(self):
        # CREATE one
        h = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"row": {
            "ext_id": "CRUD-1", "title": "目黑单户CRUD", "listing_intent": "sale", "price": 75000000,
            "city_slug": "tokyo", "attrs": {"sale_price": 75000000}, "image_urls": ["/media/partners/stareal/c.jpg"],
            "contact_id": self.CONTACT_ID, "machi_recommended": True}, "options": {"rehostUrls": False}})
        h.h.api_partner_listing_create(self.conn, "stareal")
        lid = h.last["listing"]["id"]
        self.assertEqual(h.last["listing"]["type"], "for_sale")
        # UPDATE: flip sale->rent, change title/price, send NO images (keep existing photo)
        h2 = _H(headers={"X-Partner-Token": self.TOKEN}, json_body={"row": {
            "title": "目黑改长租", "listing_intent": "rent", "price": 210000, "attrs": {"rent": 210000},
            "contact_id": self.CONTACT_ID}, "options": {"rehostUrls": False}})
        h2.h.api_partner_listing_update(self.conn, "stareal", lid)
        row = dict(self.conn.execute("SELECT type,title,price FROM city_listings WHERE id=?", (lid,)).fetchone())
        self.assertEqual((row["type"], row["title"], row["price"]), ("rental", "目黑改长租", 210000.0))
        self.assertEqual(self.conn.execute("SELECT COUNT(*) c FROM listing_media WHERE listing_id=?", (lid,)).fetchone()["c"], 1)
        # cross-partner scoping: a different key does NOT own this listing
        self.assertFalse(partners.partner_owns_listing(self.conn, "someoneelse", lid))
        # DELETE (soft)
        h3 = _H(headers={"X-Partner-Token": self.TOKEN})
        h3.h.api_partner_listing_delete(self.conn, "stareal", lid)
        self.assertIsNotNone(self.conn.execute("SELECT deleted_at FROM city_listings WHERE id=?", (lid,)).fetchone()["deleted_at"])
        # deleting again -> 404
        h4 = _H(headers={"X-Partner-Token": self.TOKEN})
        with self.assertRaises(server.APIError):
            h4.h.api_partner_listing_delete(self.conn, "stareal", lid)


if __name__ == "__main__":
    unittest.main(verbosity=2)
