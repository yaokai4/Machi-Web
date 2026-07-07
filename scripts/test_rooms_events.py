#!/usr/bin/env python3
"""社交房间(交友·约局·约饭) + Machi 活动(Luma 式)的功能覆盖。

跑真实 handler + 一次性 SQLite,覆盖:
  房间:创建/列表(城市过滤+总数)/加入/满员/重复加入幂等/发言(非成员 403)/
       系统消息/离开/房主退出解散/PATCH 权限/活跃房间上限
  活动:创建(slug 生成)/公开列表只含 published/报名(必填字段校验+选项校验)/
       容量满转候补/取消报名候补自动顶上/名单仅主办方可见/表单字段整体替换
       (保留旧 id)/admin 全量列表/软删除

Run:  cd web && python3 scripts/test_rooms_events.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-roomsev-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_events as events_mod  # noqa: E402
import server_rooms as rooms_mod  # noqa: E402


def future(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


class CapturingHandler:
    def __new__(cls, user_id: str | None = None, body: dict | None = None):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.statuses = []

        def _send(payload, status=200):
            handler.payloads.append(payload)
            handler.statuses.append(status)

        handler.send_json = _send
        handler.read_json = lambda: dict(body or {})
        if user_id:
            handler.current_session = lambda conn: {"user_id": user_id}
        else:
            handler.current_session = lambda conn: None
        return handler


class RoomsEventsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        ts = server.now_iso()
        for uid, handle, role in (
            ("u-host", "host", "member"),
            ("u-a", "alice", "member"),
            ("u-b", "bob", "member"),
            ("u-c", "carol", "member"),
            ("u-admin", "boss", "admin"),
        ):
            cls.conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, role, joined_at, created_at, updated_at)"
                " VALUES (?, ?, ?, 'x', ?, ?, ?, ?)",
                (uid, handle, handle, role, ts, ts, ts),
            )

    # ── rooms ────────────────────────────────────────────────────────────

    def test_room_lifecycle(self) -> None:
        room = rooms_mod.create_room(
            self.conn, host_user_id="u-host", title="周五新宿约饭",
            description="随便吃点", room_type="dining", city_slug="tokyo",
            region_code="jp.tokyo.tokyo", capacity=3, starts_at=future(48),
        )
        room_id = room["id"]
        self.assertEqual(room["member_count"], 1)

        # 列表:城市过滤 + 总数 + 成员预览
        h = CapturingHandler("u-a")
        h.api_rooms_list(self.conn, {"city_slug": "tokyo"})
        payload = h.payloads[-1]
        self.assertGreaterEqual(payload["total"], 1)
        listed = next(r for r in payload["items"] if r["id"] == room_id)
        self.assertEqual(listed["room_type_label"], "约饭")
        self.assertEqual(len(listed["members"]), 1)
        self.assertFalse(listed["viewer_joined"])

        # 加入(幂等)+ 满员
        rooms_mod.join_room(self.conn, room_id, "u-a", display_name="alice")
        rooms_mod.join_room(self.conn, room_id, "u-a", display_name="alice")  # 重复加入不炸
        detail = rooms_mod.serialize_room(self.conn, rooms_mod.get_room(self.conn, room_id), "u-a", include_members=True)
        self.assertEqual(detail["member_count"], 2)
        self.assertTrue(detail["viewer_joined"])
        rooms_mod.join_room(self.conn, room_id, "u-b")
        self.assertEqual(rooms_mod.get_room(self.conn, room_id)["status"], "full")  # 3/3 自动 full
        with self.assertRaises(server.APIError):
            rooms_mod.join_room(self.conn, room_id, "u-c")

        # 发言:成员可发,非成员 403;加入/离开系统消息在时间线里
        rooms_mod.post_message(self.conn, room_id, "u-a", "有人一起吗?")
        with self.assertRaises(server.APIError):
            rooms_mod.post_message(self.conn, room_id, "u-c", "我不在房间里")
        messages = rooms_mod.list_messages(self.conn, room_id)["items"]
        kinds = [m["kind"] for m in messages]
        self.assertIn("system", kinds)
        self.assertIn("text", kinds)
        self.assertEqual(messages[-1]["content"], "有人一起吗?")

        # 离开:满员房重新 open;房主退出 = 解散
        rooms_mod.leave_room(self.conn, room_id, "u-b", display_name="bob")
        self.assertEqual(rooms_mod.get_room(self.conn, room_id)["status"], "open")
        result = rooms_mod.leave_room(self.conn, room_id, "u-host", display_name="host")
        self.assertTrue(result.get("disbanded"))
        with self.assertRaises(server.APIError):
            rooms_mod.get_room(self.conn, room_id)

    def test_room_update_permission_and_cap(self) -> None:
        room = rooms_mod.create_room(self.conn, host_user_id="u-host", title="桌游局", room_type="boardgame", city_slug="osaka")
        with self.assertRaises(server.APIError):
            rooms_mod.update_room(self.conn, room["id"], "u-a", {"title": "被篡改"})
        updated = rooms_mod.update_room(self.conn, room["id"], "u-host", {"title": "周末桌游局", "capacity": 6})
        self.assertEqual(updated["title"], "周末桌游局")
        rooms_mod.delete_room(self.conn, room["id"], "u-host")

        # 活跃房间上限
        made = []
        for i in range(rooms_mod.MAX_ACTIVE_ROOMS_PER_HOST):
            made.append(rooms_mod.create_room(self.conn, host_user_id="u-c", title=f"局{i}", city_slug="tokyo"))
        with self.assertRaises(server.APIError):
            rooms_mod.create_room(self.conn, host_user_id="u-c", title="第六个", city_slug="tokyo")
        for r in made:
            rooms_mod.delete_room(self.conn, r["id"], "u-c")

    # ── events ───────────────────────────────────────────────────────────

    def test_event_lifecycle_with_form_and_waitlist(self) -> None:
        event = events_mod.create_event(self.conn, organizer_user_id="u-host", data={
            "title": "涩谷读书会 × Machi",
            "subtitle": "本月主题:村上春树",
            "description": "带一本你最近读的书来聊聊。",
            "category": "reading",
            "starts_at": future(72),
            "venue_name": "SHIBUYA BOOK LOUNGE",
            "address": "东京都涩谷区1-2-3",
            "city_slug": "tokyo",
            "region_code": "jp.tokyo.tokyo",
            "capacity": 2,
            "price_text": "免费",
            "form_fields": [
                {"label": "怎么称呼你", "field_type": "text", "required": True},
                {"label": "想聊的方向", "field_type": "select", "options": ["小说", "随笔", "都行"], "required": True},
                {"label": "需要主办方带书吗", "field_type": "checkbox"},
            ],
        })
        self.assertTrue(event["slug"])
        fields = events_mod.list_form_fields(self.conn, event["id"])
        self.assertEqual(len(fields), 3)
        name_field, pick_field, _ = fields

        # 公开列表只包含 published,带总数与分类标签
        h = CapturingHandler("u-a")
        h.api_events_list(self.conn, {"city_slug": "tokyo"})
        payload = h.payloads[-1]
        self.assertGreaterEqual(payload["total"], 1)
        self.assertTrue(any(e["id"] == event["id"] for e in payload["items"]))

        # 报名:必填校验 + 选项校验
        with self.assertRaises(server.APIError):
            events_mod.register(self.conn, event["slug"], "u-a", {})
        with self.assertRaises(server.APIError):
            events_mod.register(self.conn, event["slug"], "u-a", {name_field["id"]: "A", pick_field["id"]: "不存在的选项"})
        r1 = events_mod.register(self.conn, event["slug"], "u-a", {name_field["id"]: "Alice", pick_field["id"]: "小说"})
        self.assertEqual(r1["status"], "going")
        r2 = events_mod.register(self.conn, event["slug"], "u-b", {name_field["id"]: "Bob", pick_field["id"]: "都行"})
        self.assertEqual(r2["status"], "going")
        r3 = events_mod.register(self.conn, event["slug"], "u-c", {name_field["id"]: "Carol", pick_field["id"]: "随笔"})
        self.assertEqual(r3["status"], "waitlist")  # 容量 2 满 → 候补

        # 取消 → 候补自动顶上
        events_mod.cancel_registration(self.conn, event["slug"], "u-a")
        statuses = {
            r["user"]["id"]: r["status"]
            for r in events_mod.list_attendees(self.conn, event["slug"], "u-host")["items"]
        }
        self.assertEqual(statuses.get("u-c"), "going")

        # 名单权限:路人不可看,主办方可见答案
        with self.assertRaises(server.APIError):
            events_mod.list_attendees(self.conn, event["slug"], "u-a")
        roster = events_mod.list_attendees(self.conn, event["slug"], "u-host")
        bob = next(r for r in roster["items"] if r["user"]["id"] == "u-b")
        self.assertEqual(bob["answers"].get(name_field["id"]), "Bob")

        # 表单整体替换:保留旧 id、删掉未出现的、新增新字段
        new_fields = events_mod.replace_form_fields(self.conn, event["id"], [
            {"id": name_field["id"], "label": "你的称呼", "field_type": "text", "required": True},
            {"label": "微信号(选填)", "field_type": "text"},
        ])
        self.assertEqual(len(new_fields), 2)
        self.assertEqual(new_fields[0]["id"], name_field["id"])
        self.assertEqual(new_fields[0]["label"], "你的称呼")

        # 编辑权限 + admin 加精
        with self.assertRaises(server.APIError):
            events_mod.update_event(self.conn, event["id"], "u-a", {"title": "被篡改"})
        updated = events_mod.update_event(self.conn, event["id"], "u-admin", {"is_featured": True}, actor_is_admin=True)
        self.assertTrue(bool(updated["is_featured"]))

        # admin 全量列表(含草稿)
        draft = events_mod.create_event(self.conn, organizer_user_id="u-b", data={
            "title": "草稿活动", "starts_at": future(24), "status": "draft", "city_slug": "tokyo",
        })
        h = CapturingHandler("u-admin")
        h.api_admin_events(self.conn, {})
        admin_ids = {e["id"] for e in h.payloads[-1]["items"]}
        self.assertIn(draft["id"], admin_ids)
        h = CapturingHandler()
        h.api_events_list(self.conn, {"city_slug": "tokyo"})
        public_ids = {e["id"] for e in h.payloads[-1]["items"]}
        self.assertNotIn(draft["id"], public_ids)

        # 软删除后公开 404
        events_mod.delete_event(self.conn, event["id"], "u-host")
        with self.assertRaises(server.APIError):
            events_mod.get_event(self.conn, event["id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
