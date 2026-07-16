#!/usr/bin/env python3
"""信任止血回归（B1-2 / B1-3 / B1-4 / B1-5）。

Runs the production handler methods / helpers against a throwaway SQLite DB:
    - migration 113 幂等：无真实评论支撑的假评分清零；重复执行是 no-op；
      有已发布真实评论的行保持不动
    - merchant_verified 自封认证：输出层只认 users.merchant_verified=1
    - seed 卖家死信箱：咨询/预约路由到官方收件账号 + 官方自动确认回复；
      真实卖家完全不受影响；60s 窗口内重复提交不产生重复记录
    - 商家入驻申请：提交后 admin 收到站内通知、申请者收到自动站内信；
      重复提交（状态未变化）不重复惊扰
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-trust-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

MIGRATION_113_SQL = next(sql for version, _note, sql in server.MIGRATIONS if version == 113)


class CapturingHandler:
    """server.Handler with network/session plumbing stubbed out."""

    def __new__(cls, user_id: str | None = None, body: dict | None = None):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {}
        handler.payloads = []
        handler.statuses = []
        handler.current_session = lambda _conn: {"user_id": user_id} if user_id else None
        handler.read_json = lambda: dict(body or {})
        handler.send_json = lambda payload, status=200: (
            handler.payloads.append(payload),
            handler.statuses.append(status),
        )
        return handler


class SeedTrustCleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        cls.now = server.now_iso()
        cls.admin_id = "trust-admin"
        cls.buyer_id = "trust-buyer"
        cls.real_seller_id = "trust-real-seller"
        cls.persona_id = "trust-persona"
        cls.verified_seller_id = "trust-verified-seller"
        for user_id, handle, role in (
            (cls.admin_id, "admin", "admin"),
            (cls.buyer_id, "trustbuyer", "member"),
            (cls.real_seller_id, "trustseller", "member"),
            (cls.persona_id, "trustpersona", "member"),
            (cls.verified_seller_id, "trustverified", "member"),
        ):
            cls.conn.execute(
                """
                INSERT INTO users (
                    id, handle, display_name, email, password_hash, role,
                    joined_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'x', ?, ?, ?, ?)
                """,
                (user_id, handle, handle.title(), f"{handle}@example.com", role, cls.now, cls.now, cls.now),
            )
        cls.conn.execute(
            "UPDATE users SET is_merchant = 1, merchant_verified = 1 WHERE id = ?",
            (cls.verified_seller_id,),
        )
        # 标记 persona 为内容包账号（与 import_seed_users 一致）
        server._ensure_content_pack_users_table(cls.conn)
        cls.conn.execute(
            "INSERT INTO content_pack_users (user_id, handle, pack_version, created_at) VALUES (?, ?, 'test', ?)",
            (cls.persona_id, "trustpersona", cls.now),
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(str(_TMP_DB) + suffix)
            except OSError:
                pass
        try:
            _TMP_DB.parent.rmdir()
        except OSError:
            pass

    # ---- fixtures -----------------------------------------------------------

    def _insert_listing(self, seller_id: str, *, title: str, rating_avg: float = 0,
                        rating_count: int = 0, listing_type: str = "local_service") -> str:
        listing_id = str(uuid.uuid4())
        self.conn.execute(
            """
            INSERT INTO city_listings (
                id, country_code, city_slug, region_code, type, category, title,
                description, price, currency, price_type, status, verification_status,
                seller_user_id, contact_method, published_at, created_at, updated_at,
                rating_avg, rating_count
            ) VALUES (?, 'jp', 'tokyo', 'jp.tokyo.tokyo', ?, '搬家', ?, 'desc', 1000,
                      'JPY', 'fixed', 'published', 'unverified', ?, 'app_message', ?, ?, ?, ?, ?)
            """,
            (listing_id, listing_type, title, seller_id, self.now, self.now, self.now,
             rating_avg, rating_count),
        )
        return listing_id

    # ---- B1-2: migration 113 幂等 -------------------------------------------

    def test_migration_113_clears_fake_ratings_idempotently(self) -> None:
        fake_id = self._insert_listing(self.real_seller_id, title="假评分-无评论", rating_avg=4.93, rating_count=88)
        real_id = self._insert_listing(self.real_seller_id, title="真评分-有评论", rating_avg=5.0, rating_count=1)
        self.conn.execute(
            """
            INSERT INTO listing_reviews (id, listing_id, user_id, rating, content, status, created_at, updated_at)
            VALUES (?, ?, ?, 5, '很好', 'published', ?, ?)
            """,
            (str(uuid.uuid4()), real_id, self.buyer_id, self.now, self.now),
        )
        # 第一次执行：假评分清零、真评分不动
        self.conn.executescript(MIGRATION_113_SQL)
        fake = dict(self.conn.execute("SELECT rating_avg, rating_count FROM city_listings WHERE id = ?", (fake_id,)).fetchone())
        real = dict(self.conn.execute("SELECT rating_avg, rating_count FROM city_listings WHERE id = ?", (real_id,)).fetchone())
        self.assertEqual((fake["rating_avg"], fake["rating_count"]), (0, 0))
        self.assertEqual((real["rating_avg"], real["rating_count"]), (5.0, 1))
        # 第二次执行（幂等）：不再命中任何行
        update_sql = MIGRATION_113_SQL.strip().rstrip(";")
        cursor = self.conn.execute(update_sql)
        self.assertEqual(cursor.rowcount, 0)
        real2 = dict(self.conn.execute("SELECT rating_avg, rating_count FROM city_listings WHERE id = ?", (real_id,)).fetchone())
        self.assertEqual((real2["rating_avg"], real2["rating_count"]), (5.0, 1))

    def test_seed_sources_no_longer_write_ratings(self) -> None:
        # 种子源头防回归：内容包样本不再携带 rating/reviews 键
        import seed_listings_library as seedpacks
        for sample in seedpacks.premium_listings():
            self.assertNotIn("rating", sample)
            self.assertNotIn("reviews", sample)
        # import_premium_listings 落库后评分聚合必须为 0
        result = server.import_premium_listings(
            self.conn,
            [{
                "city_slug": "tokyo", "type": "local_service", "title": "内容包测试条目",
                "category": "搬家", "description": "d", "price": 1000,
                "rating": 4.9, "reviews": 120,  # 即便样本仍带键也不能写入
            }],
            seller_id=self.real_seller_id,
        )
        self.assertEqual(result["created"], 1)
        row = dict(self.conn.execute(
            "SELECT rating_avg, rating_count FROM city_listings WHERE title = '内容包测试条目'"
        ).fetchone())
        self.assertEqual((row["rating_avg"], row["rating_count"]), (0, 0))

    # ---- B1-3: 自封认证收口 --------------------------------------------------

    def test_merchant_verified_clamped_to_server_fact(self) -> None:
        self.assertFalse(server.listing_seller_merchant_verified(self.conn, self.real_seller_id))
        self.assertTrue(server.listing_seller_merchant_verified(self.conn, self.verified_seller_id))
        row = {
            "id": "x", "type": "discount", "title": "优惠", "status": "published",
            "created_at": self.now, "updated_at": self.now,
        }
        sellers = server.fetch_users_by_ids(self.conn, [self.real_seller_id, self.verified_seller_id])
        # 未认证卖家：自勾 checkbox 输出为 False
        payload = server.serialize_listing(row, {
            "attributes": {"merchant_verified": True},
            "seller": sellers[self.real_seller_id],
        })
        self.assertFalse(payload["attributes"]["merchant_verified"])
        # 认证卖家：保持 True
        payload = server.serialize_listing(row, {
            "attributes": {"merchant_verified": True},
            "seller": sellers[self.verified_seller_id],
        })
        self.assertTrue(payload["attributes"]["merchant_verified"])
        # 无 seller 上下文（防御路径）：一律收紧为 False
        payload = server.serialize_listing(row, {"attributes": {"merchant_verified": True}})
        self.assertFalse(payload["attributes"]["merchant_verified"])

    # ---- B1-4: seed 卖家死信箱 ------------------------------------------------

    def test_persona_inquiry_routes_to_official_inbox_with_auto_reply(self) -> None:
        self.assertTrue(server.listing_seller_is_dead_inbox(self.conn, self.persona_id))
        self.assertFalse(server.listing_seller_is_dead_inbox(self.conn, self.real_seller_id))
        self.assertEqual(server.listing_official_inbox_id(self.conn), self.admin_id)

        listing_id = self._insert_listing(self.persona_id, title="persona 搬家服务")
        handler = CapturingHandler(self.buyer_id, {"message": "想预约搬家"})
        handler.api_listing_inquiry(self.conn, listing_id)
        payload = handler.payloads[-1]
        self.assertTrue(payload["ok"])

        inquiry = dict(self.conn.execute(
            "SELECT * FROM listing_inquiries WHERE listing_id = ?", (listing_id,)
        ).fetchone())
        self.assertEqual(inquiry["to_user_id"], self.admin_id)          # 路由到官方收件账号
        self.assertEqual(inquiry["seller_user_id"], self.persona_id)    # 真实 seller 仍可溯源
        conv = dict(self.conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (inquiry["conversation_id"],)
        ).fetchone())
        self.assertEqual(
            {conv["participant_a"], conv["participant_b"]},
            {self.buyer_id, self.admin_id},
        )
        messages = [dict(r) for r in self.conn.execute(
            "SELECT sender_id, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
            (inquiry["conversation_id"],),
        )]
        self.assertEqual(len(messages), 2)  # 种子消息 + 官方自动确认
        self.assertEqual(messages[1]["sender_id"], self.admin_id)
        self.assertIn("工作日", messages[1]["content"])   # 明示非即时应答
        self.assertIn("営業日", messages[1]["content"])
        self.assertIn("business days", messages[1]["content"])
        notif = self.conn.execute(
            "SELECT user_id FROM notifications WHERE type = 'listing_inquiry' AND target_listing_id = ?",
            (listing_id,),
        ).fetchone()
        self.assertEqual(notif["user_id"], self.admin_id)

        # 幂等：60s 窗口内重复提交 → 去重，不产生第二条 inquiry / 自动回复
        handler = CapturingHandler(self.buyer_id, {"message": "想预约搬家"})
        handler.api_listing_inquiry(self.conn, listing_id)
        self.assertTrue(handler.payloads[-1].get("deduplicated"))
        count = self.conn.execute(
            "SELECT COUNT(*) AS c FROM listing_inquiries WHERE listing_id = ?", (listing_id,)
        ).fetchone()["c"]
        self.assertEqual(count, 1)
        msg_count = self.conn.execute(
            "SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ?", (inquiry["conversation_id"],)
        ).fetchone()["c"]
        self.assertEqual(msg_count, 2)

    def test_real_seller_inquiry_unaffected(self) -> None:
        listing_id = self._insert_listing(self.real_seller_id, title="真实卖家搬家服务")
        handler = CapturingHandler(self.buyer_id, {"message": "咨询一下"})
        handler.api_listing_inquiry(self.conn, listing_id)
        inquiry = dict(self.conn.execute(
            "SELECT * FROM listing_inquiries WHERE listing_id = ?", (listing_id,)
        ).fetchone())
        self.assertEqual(inquiry["to_user_id"], self.real_seller_id)
        messages = [dict(r) for r in self.conn.execute(
            "SELECT sender_id FROM messages WHERE conversation_id = ?", (inquiry["conversation_id"],)
        )]
        self.assertEqual(len(messages), 1)  # 只有买家的种子消息，没有官方插话
        self.assertEqual(messages[0]["sender_id"], self.buyer_id)

    # ---- B1-5: 入驻申请去黑洞 --------------------------------------------------

    def test_business_application_submit_notifies_admin_and_applicant(self) -> None:
        applicant = self.buyer_id
        body = {
            "business_name": "东京生活服务中心",
            "business_type": "生活服务",
            "legal_name": "Tokyo Life Support LLC",
            "representative_name": "Kai Yao",
            "country_code": "jp",
            "city_slug": "tokyo",
            "phone": "+81 90 0000 0000",
            "address": "东京都新宿区 1-1-1",
            "description": "面向同城用户的生活支持服务。",
            "service_categories": ["生活跑腿"],
            "service_cities": ["tokyo"],
            "submit": False,
        }
        handler = CapturingHandler(applicant, body)
        handler.api_upsert_business_application(self.conn)
        business_id = handler.payloads[-1]["business"]["id"]
        self.conn.execute(
            """
            INSERT INTO uploaded_files (
                id, upload_id, user_id, bucket, object_key, public_url, cdn_url,
                content_type, file_size, file_type, purpose, entity_type, entity_id,
                status, created_at, updated_at
            ) VALUES ('trust-doc', 'upload-trust-doc', ?, 'private', 'business/trust-doc.pdf', '', '',
                      'application/pdf', 12345, 'pdf', 'business_verification_file', 'business', ?,
                      'uploaded', ?, ?)
            """,
            (applicant, business_id, self.now, self.now),
        )
        handler = CapturingHandler(applicant, {**body, "submit": True, "uploaded_file_ids": ["trust-doc"]})
        handler.api_upsert_business_application(self.conn)
        self.assertEqual(handler.payloads[-1]["business"]["verification_status"], "pending")

        admin_notes = [dict(r) for r in self.conn.execute(
            "SELECT * FROM notifications WHERE user_id = ? AND type = 'system' AND title = '新的商家入驻申请'",
            (self.admin_id,),
        )]
        self.assertEqual(len(admin_notes), 1)
        self.assertIn("东京生活服务中心", admin_notes[0]["content"])
        applicant_notes = [dict(r) for r in self.conn.execute(
            "SELECT * FROM notifications WHERE user_id = ? AND type = 'system' AND title = '入驻申请已收到'",
            (applicant,),
        )]
        self.assertEqual(len(applicant_notes), 1)
        self.assertIn("审核周期较长", applicant_notes[0]["content"])

        # 重复提交（状态维持 pending 不变）→ 不重复惊扰
        handler = CapturingHandler(applicant, {**body, "submit": True})
        handler.api_upsert_business_application(self.conn)
        admin_count = self.conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title = '新的商家入驻申请'",
            (self.admin_id,),
        ).fetchone()["c"]
        self.assertEqual(admin_count, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
