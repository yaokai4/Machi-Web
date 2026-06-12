#!/usr/bin/env python3
"""Regression coverage for the real merchant application and review flow.

Runs the production handler methods against a throwaway SQLite database:
draft -> document upload attachment -> submit -> admin review -> public
directory/profile visibility.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-business-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


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


class BusinessVerificationFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        cls.now = server.now_iso()
        cls.owner_id = "merchant-owner"
        cls.no_doc_owner_id = "merchant-no-doc"
        cls.admin_id = "merchant-admin"
        for user_id, handle, role in (
            (cls.owner_id, "merchantowner", "member"),
            (cls.no_doc_owner_id, "merchantnodoc", "member"),
            (cls.admin_id, "merchantadmin", "admin"),
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

    def call(self, user_id: str | None, method: str, *args, body: dict | None = None, **kwargs):
        handler = CapturingHandler(user_id, body)
        getattr(handler, method)(self.conn, *args, **kwargs)
        return handler.payloads[-1], handler.statuses[-1]

    def save_application(self, body: dict, *, user_id: str | None = None):
        payload, _status = self.call(
            user_id or self.owner_id,
            "api_upsert_business_application",
            body=body,
        )
        return payload

    def attach_document(self, business_id: str, file_id: str = "doc-registration") -> None:
        self.conn.execute(
            """
            INSERT INTO uploaded_files (
                id, upload_id, user_id, bucket, object_key, public_url, cdn_url,
                content_type, file_size, file_type, purpose, entity_type, entity_id,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, 'private', ?, '', '', 'application/pdf', 12345, 'pdf',
                      'business_verification_file', 'business', ?, 'uploaded', ?, ?)
            """,
            (file_id, f"upload-{file_id}", self.owner_id, f"business/{file_id}.pdf", business_id, self.now, self.now),
        )

    def test_business_application_can_be_saved_submitted_reviewed_and_published(self) -> None:
        draft = self.save_application({
            "business_name": "东京生活服务中心",
            "business_type": "生活服务",
            "country_code": "jp",
            "city_slug": "tokyo",
            "service_categories": ["翻译手续", "接送机", "酒店"],
            "service_cities": ["tokyo", "yokohama"],
            "description": "面向同城用户的翻译、接送机、住宿协助和生活支持。",
            "contact_method": "站内信 / 电话",
            "submit": False,
        })
        business_id = draft["business"]["id"]
        self.assertEqual(draft["business"]["verification_status"], "draft")
        self.assertEqual(draft["business"]["service_categories"], ["翻译手续", "接送机", "酒店"])

        self.attach_document(business_id)
        submitted = self.save_application({
            "business_name": "东京生活服务中心",
            "business_type": "生活服务",
            "legal_name": "Tokyo Life Support LLC",
            "representative_name": "Kai Yao",
            "registration_number": "T-123456",
            "country_code": "jp",
            "city_slug": "tokyo",
            "phone": "+81 90 0000 0000",
            "email": "merchant@example.com",
            "address": "东京都新宿区 1-1-1",
            "postal_code": "160-0022",
            "contact_method": "站内信 / 电话",
            "description": "面向同城用户的翻译、接送机、住宿协助和生活支持。",
            "service_categories": ["翻译手续", "接送机", "酒店"],
            "service_cities": ["tokyo", "yokohama"],
            "uploadedFileIds": ["doc-registration"],
            "submit": True,
        })
        self.assertEqual(submitted["business"]["verification_status"], "pending")
        self.assertEqual(submitted["business"]["document_count"], 1)
        document_id = submitted["business"]["documents"][0]["documentId"]
        owner = self.conn.execute("SELECT is_merchant, merchant_verified FROM users WHERE id = ?", (self.owner_id,)).fetchone()
        self.assertEqual((owner["is_merchant"], owner["merchant_verified"]), (1, 0))

        reviewed, _ = self.call(
            self.admin_id,
            "api_admin_update_business",
            business_id,
            body={"verification_status": "verified", "review_note": "资料完整，允许展示。"},
        )
        self.assertEqual(reviewed["business"]["verification_status"], "verified")
        owner = self.conn.execute("SELECT is_merchant, merchant_verified FROM users WHERE id = ?", (self.owner_id,)).fetchone()
        self.assertEqual((owner["is_merchant"], owner["merchant_verified"]), (1, 1))

        listing_id = "svc-" + uuid.uuid4().hex[:8]
        secondhand_id = "used-" + uuid.uuid4().hex[:8]
        self.conn.execute(
            """
            INSERT INTO city_listings (
                id, country_code, city_slug, region_code, type, category, title,
                description, price, currency, status, verification_status,
                seller_user_id, business_id, contact_method, published_at, created_at, updated_at
            ) VALUES (?, 'jp', 'tokyo', 'jp.tokyo', 'local_service', '接送机', ?,
                      '机场接送与行李协助', 9000, 'JPY', 'published', 'verified',
                      ?, ?, '站内信', ?, ?, ?)
            """,
            (listing_id, "成田机场接送与行李协助", self.owner_id, business_id, self.now, self.now, self.now),
        )
        self.conn.execute(
            """
            INSERT INTO city_listings (
                id, country_code, city_slug, region_code, type, category, title,
                description, price, currency, status, verification_status,
                seller_user_id, contact_method, published_at, created_at, updated_at
            ) VALUES (?, 'jp', 'tokyo', 'jp.tokyo', 'secondhand', '家具家居', ?,
                      '个人闲置物品，不应进入商家看板', 1200, 'JPY', 'published', 'unverified',
                      ?, '站内信', ?, ?, ?)
            """,
            (secondhand_id, "闲置小桌", self.owner_id, self.now, self.now, self.now),
        )

        dashboard, _ = self.call(self.owner_id, "api_business_dashboard")
        self.assertEqual(dashboard["metrics"]["listings"], 1)
        self.assertEqual([item["id"] for item in dashboard["recent_listings"]], [listing_id])

        directory, _ = self.call(None, "api_businesses_directory", {"city": "tokyo", "category": "接送机"})
        self.assertEqual(directory["total"], 1)
        public_business = directory["items"][0]
        self.assertEqual(public_business["id"], business_id)
        self.assertEqual(public_business["published_listing_count"], 1)
        self.assertNotIn("legal_name", public_business)
        self.assertNotIn("registration_number", public_business)

        public_profile, _ = self.call(None, "api_business_public", business_id)
        self.assertEqual(public_profile["business"]["id"], business_id)
        self.assertEqual([item["id"] for item in public_profile["listings"]], [listing_id])

        deleted, _ = self.call(self.owner_id, "api_delete_business_document", document_id)
        self.assertEqual(deleted["business"]["verification_status"], "needs_review")
        self.assertEqual(deleted["business"]["document_count"], 0)
        owner = self.conn.execute("SELECT is_merchant, merchant_verified FROM users WHERE id = ?", (self.owner_id,)).fetchone()
        self.assertEqual((owner["is_merchant"], owner["merchant_verified"]), (1, 0))

    def test_submit_requires_at_least_one_private_document(self) -> None:
        with self.assertRaises(server.APIError) as ctx:
            self.save_application({
                "business_name": "无材料商家",
                "business_type": "生活服务",
                "legal_name": "No Document LLC",
                "representative_name": "Kai Yao",
                "country_code": "jp",
                "city_slug": "tokyo",
                "phone": "+81 90 1111 1111",
                "address": "东京都涩谷区",
                "description": "资料还没上传的测试商家。",
                "service_categories": ["生活服务"],
                "service_cities": ["tokyo"],
                "submit": True,
            }, user_id=self.no_doc_owner_id)
        self.assertEqual(ctx.exception.code, "business_document_required")
        leaked = self.conn.execute(
            "SELECT verification_status FROM business_profiles WHERE owner_user_id = ?",
            (self.no_doc_owner_id,),
        ).fetchone()
        self.assertIsNone(leaked)


if __name__ == "__main__":
    unittest.main(verbosity=2)
