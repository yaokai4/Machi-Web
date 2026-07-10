#!/usr/bin/env python3
"""Smoke test for the new luma-grade event backend: cover_file_id→thumbnail,
GC reference protection, approval flow (pending→approve/decline), check-in,
host broadcast, and ICS generation."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-luma-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
# point at the real web/ dir
WEB = Path(__file__).resolve().parents[1]
if str(WEB) not in sys.path:
    sys.path.insert(0, str(WEB))

import server  # noqa: E402
import server_events as ev  # noqa: E402


def future(hours):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


class LumaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = server.now_iso()
        for uid, handle, role in (
            ("host", "host", "member"), ("a", "alice", "member"),
            ("b", "bob", "member"), ("c", "carol", "member"), ("admin", "boss", "admin"),
        ):
            cls.conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at)"
                " VALUES (?, ?, ?, 'x', ?, ?, ?, ?)", (uid, handle, handle, role, ts, ts, ts))

    def _mk_upload(self, fid, user, thumb_url):
        ts = server.now_iso()
        meta = json.dumps({"variants": {"thumbnail": thumb_url}, "thumbnail_url": thumb_url})
        self.conn.execute(
            "INSERT INTO uploaded_files (id, upload_id, user_id, bucket, object_key, content_type,"
            " purpose, entity_type, status, metadata, created_at, updated_at)"
            " VALUES (?, ?, ?, 's3', ?, 'image/jpeg', 'event_cover', 'event', 'ready', ?, ?, ?)",
            (fid, "up-" + fid, user, f"events/covers/{fid}.jpg", meta, ts, ts))
        self.conn.commit()

    def test_cover_thumbnail_and_gc_protection(self):
        self._mk_upload("f1", "host", "https://cdn/thumb-f1.webp")
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "读书会", "starts_at": future(48),
            "cover_url": "https://cdn/original-f1.jpg", "cover_file_id": "f1"})
        ser = ev.serialize_event(self.conn, e, "host", include_description=True)
        self.assertEqual(ser["cover_url"], "https://cdn/original-f1.jpg")
        self.assertEqual(ser["cover_thumb_url"], "https://cdn/thumb-f1.webp")  # card uses thumb
        self.assertEqual(ser["cover_file_id"], "f1")
        # GC reference check: the linked cover must read as "referenced" → never deleted
        self.assertTrue(server._uploaded_file_is_referenced(self.conn, "f1"))
        self.assertFalse(server._uploaded_file_is_referenced(self.conn, "nope"))

    def test_thumb_falls_back_to_original_before_worker(self):
        # upload row with NO thumbnail in metadata yet (async worker not done)
        ts = server.now_iso()
        self.conn.execute(
            "INSERT INTO uploaded_files (id, upload_id, user_id, bucket, object_key, content_type,"
            " purpose, entity_type, status, metadata, created_at, updated_at)"
            " VALUES ('f2','up-f2','host','s3','events/covers/f2.jpg','image/jpeg','event_cover','event','ready','{}',?,?)",
            (ts, ts))
        self.conn.commit()
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "无缩略图", "starts_at": future(48),
            "cover_url": "https://cdn/original-f2.jpg", "cover_file_id": "f2"})
        ser = ev.serialize_event(self.conn, e)
        self.assertEqual(ser["cover_thumb_url"], "https://cdn/original-f2.jpg")  # falls back to original

    def test_approval_flow(self):
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "审核制沙龙", "starts_at": future(48), "requires_approval": True})
        eid = e["id"]
        # register → pending, not counted as going
        r = ev.register(self.conn, eid, "a")
        self.assertEqual(r["status"], "pending")
        self.assertEqual(ev.get_event(self.conn, eid)["going_count"], 0)
        self.assertEqual(r["event"]["requires_approval"], True)
        # host approves → going
        out = ev.approve_registration(self.conn, eid, "host", "a")
        self.assertEqual(out["status"], "going")
        self.assertEqual(ev.get_event(self.conn, eid)["going_count"], 1)
        # notification to approved user
        n = self.conn.execute("SELECT COUNT(*) c FROM notifications WHERE user_id='a' AND type='event_approved'").fetchone()
        self.assertEqual(n["c"], 1)
        # non-host cannot approve
        ev.register(self.conn, eid, "b")
        with self.assertRaises(server.APIError):
            ev.approve_registration(self.conn, eid, "a", "b")
        # host declines b → cancelled, not going
        ev.decline_registration(self.conn, eid, "host", "b")
        reg = self.conn.execute("SELECT status FROM event_registrations WHERE event_id=? AND user_id='b'", (eid,)).fetchone()
        self.assertEqual(reg["status"], "cancelled")

    def test_checkin_and_broadcast(self):
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "签到测试", "starts_at": future(48)})
        eid = e["id"]
        ev.register(self.conn, eid, "a")  # no approval → going
        ev.register(self.conn, eid, "c")
        # check-in a
        out = ev.set_checkin(self.conn, eid, "host", "a", True)
        self.assertTrue(out["checked_in"])
        ser = ev.serialize_event(self.conn, ev.get_event(self.conn, eid), "a", include_description=True)
        self.assertTrue(ser["viewer_checked_in"])
        self.assertEqual(ser["checked_in_count"], 1)
        att = ev.list_attendees(self.conn, eid, "host")
        checked = [x for x in att["items"] if x["checked_in"]]
        self.assertEqual(len(checked), 1)
        # can't check-in a non-going user
        with self.assertRaises(server.APIError):
            ev.set_checkin(self.conn, eid, "host", "b", True)
        # broadcast to all going (a + c)
        res = ev.broadcast(self.conn, eid, "host", "地点改到 2 楼")
        self.assertEqual(res["sent"], 2)
        n = self.conn.execute("SELECT COUNT(*) c FROM notifications WHERE type='event_broadcast'").fetchone()
        self.assertEqual(n["c"], 2)
        # empty message rejected
        with self.assertRaises(server.APIError):
            ev.broadcast(self.conn, eid, "host", "   ")

    def test_ics(self):
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "ICS, 测试; 事件", "starts_at": future(24), "ends_at": future(26),
            "venue_name": "SHIBUYA", "address": "东京都涩谷区"})
        ics = ev.event_ics(self.conn, e["id"], base_url="https://machicity.com")
        self.assertIn("BEGIN:VCALENDAR", ics)
        self.assertIn("BEGIN:VEVENT", ics)
        self.assertIn("DTSTART:", ics)
        self.assertIn("DTEND:", ics)
        self.assertIn("SUMMARY:ICS\\, 测试\\; 事件", ics)  # escaped
        self.assertIn("LOCATION:SHIBUYA 东京都涩谷区", ics)
        self.assertIn("URL:https://machicity.com/events/", ics)
        self.assertTrue(ics.endswith("END:VCALENDAR\r\n"))

    def test_ics_crlf_injection_stripped(self):
        # external_url 内嵌 CRLF 不得注入伪造的日历行 / 第二个 VEVENT 到公开 .ics。
        e = ev.create_event(self.conn, organizer_user_id="host", data={
            "title": "注入测试", "starts_at": future(24),
            "external_url": "https://ok.com\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:evil"})
        ics = ev.event_ics(self.conn, e["id"])
        lines = ics.split("\r\n")
        # 只有我们生成的那一个 VEVENT;注入的行不能成为独立属性行。
        self.assertEqual(lines.count("BEGIN:VEVENT"), 1)
        self.assertEqual(lines.count("END:VEVENT"), 1)
        self.assertNotIn("SUMMARY:evil", lines)
        url_lines = [ln for ln in lines if ln.startswith("URL:")]
        self.assertEqual(len(url_lines), 1)  # CRLF 被吞,URL 仍是单行


if __name__ == "__main__":
    unittest.main(verbosity=2)
