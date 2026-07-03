#!/usr/bin/env python3
"""上传配额:身份图(头像/封面)不被批量房源图挤占 + 业务账号高上限.

Regression for「今日上传次数已达上限」on a 星域 partner 公司账号: it rehosts
hundreds of listing photos daily (each an uploaded_files row under the seller
user), which used to exhaust the flat 120/day cap so the account couldn't even
change its avatar. Now: identity uploads have their own bucket; partner sellers /
verified merchants get a far higher bulk ceiling and are marked as merchants.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP = Path(tempfile.mkdtemp(prefix="kaix-quota-"))
os.environ["KAIX_DB_PATH"] = str(_TMP / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_partners as partners  # noqa: E402


def _mk_user(conn, *, merchant: bool = False) -> str:
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, "
        "is_merchant, merchant_verified, joined_at, created_at, updated_at) "
        "VALUES (?,?,?,'',?, 'member', ?, ?, ?,?,?)",
        (uid, "u_" + uid[:8], "卖家", "x", 1 if merchant else 0, 1 if merchant else 0, now, now, now),
    )
    return uid


def _add_uploads(conn, uid: str, n: int, purpose: str) -> None:
    now = server.now_iso()
    for _ in range(n):
        conn.execute(
            "INSERT INTO uploaded_files (id, upload_id, user_id, bucket, object_key, public_url, cdn_url, "
            "content_type, file_size, file_type, purpose, entity_type, entity_id, status, created_at, updated_at) "
            "VALUES (?,?,?,'b','k','u','u','image/jpeg',1,'image',?,'','', 'ready',?,?)",
            ("f_" + uuid.uuid4().hex, "up_" + uuid.uuid4().hex, uid, purpose, now, now),
        )


class UploadQuota(unittest.TestCase):
    def setUp(self) -> None:
        server.init_db()
        self.h = server.Handler.__new__(server.Handler)

    def _quota(self, conn, uid, purpose, entity_type="", entity_id=""):
        self.h._check_upload_quota(conn, uid, purpose=purpose, entity_type=entity_type, entity_id=entity_id)

    def test_avatar_not_blocked_by_bulk_listing_photos(self) -> None:
        with server.db() as conn:
            u = _mk_user(conn)
            _add_uploads(conn, u, 130, "rental_image")  # over the bulk cap
            # avatar must still go through — identity has its own bucket
            self._quota(conn, u, "avatar", "user", u)

    def test_bulk_cap_still_enforced_for_normal_user(self) -> None:
        with server.db() as conn:
            u = _mk_user(conn)
            _add_uploads(conn, u, 120, "rental_image")
            with self.assertRaises(server.APIError) as ctx:
                self._quota(conn, u, "rental_image", "listing", "l1")
            self.assertEqual(ctx.exception.code, "daily_upload_limit")

    def test_business_account_high_ceiling(self) -> None:
        with server.db() as conn:
            m = _mk_user(conn, merchant=True)
            _add_uploads(conn, m, 3000, "rental_image")
            self._quota(conn, m, "rental_image", "listing", "l1")  # still allowed

    def test_identity_has_its_own_bound(self) -> None:
        with server.db() as conn:
            u = _mk_user(conn)
            _add_uploads(conn, u, 40, "avatar")
            with self.assertRaises(server.APIError):
                self._quota(conn, u, "avatar", "user", u)

    def test_partner_seller_is_business_and_promoted(self) -> None:
        with server.db() as conn:
            seller = _mk_user(conn)
            partners.create_partner(conn, key="star-" + uuid.uuid4().hex[:6], name="星域",
                                    seller_user_id=seller, now=server.now_iso())
            self.assertTrue(self.h._is_business_uploader(conn, seller))
            self.assertGreaterEqual(partners.backfill_partner_sellers_as_merchants(conn), 1)
            r = conn.execute("SELECT is_merchant, merchant_verified FROM users WHERE id=?", (seller,)).fetchone()
            self.assertTrue(int(r["is_merchant"]) and int(r["merchant_verified"]))

    def test_new_partner_seller_created_as_merchant(self) -> None:
        with server.db() as conn:
            h = server.Handler.__new__(server.Handler)
            uid = h._ensure_partner_seller(conn, "star-" + uuid.uuid4().hex[:6], "星域东京", {})
            r = conn.execute("SELECT is_merchant, merchant_verified FROM users WHERE id=?", (uid,)).fetchone()
            self.assertTrue(int(r["is_merchant"]) and int(r["merchant_verified"]))


if __name__ == "__main__":
    print("UPLOAD QUOTA")
    unittest.main(verbosity=2)
