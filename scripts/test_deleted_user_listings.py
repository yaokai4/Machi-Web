#!/usr/bin/env python3
"""注销/删除用户后其市场商品必须彻底消失.

A deregistered ('已注销用户') seller's classifieds must vanish from the
marketplace — not linger as「出售中」. Locks two paths:
  1. anonymize_user_account fully soft-deletes the person's listings.
  2. reconcile_deleted_user_listings heals historical rows (users deleted by
     older/bulk paths that set deleted_at but never closed the listings), while
     never touching a live user's items. Idempotent.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP = Path(tempfile.mkdtemp(prefix="kaix-dereg-"))
os.environ["KAIX_DB_PATH"] = str(_TMP / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _mk_user(conn, *, deleted: bool = False, handle: str | None = None) -> str:
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, "
        "deleted_at, joined_at, created_at, updated_at) VALUES (?,?,?,'',?, 'member', ?, ?,?,?)",
        (uid, handle or ("u_" + uid[:8]), "已注销用户" if deleted else "卖家",
         "x", now if deleted else None, now, now, now),
    )
    return uid


def _mk_listing(conn, seller_id: str) -> str:
    lid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO city_listings (id, city_slug, type, title, status, seller_user_id, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (lid, "osaka", "secondhand", "三星S7", "published", seller_id, now, now),
    )
    return lid


def _deleted_at(conn, lid: str):
    return conn.execute("SELECT deleted_at FROM city_listings WHERE id=?", (lid,)).fetchone()["deleted_at"]


class DeletedUserListings(unittest.TestCase):
    def setUp(self) -> None:
        server.init_db()

    def test_anonymize_soft_deletes_listings(self) -> None:
        with server.db() as conn:
            u = _mk_user(conn)
            lid = _mk_listing(conn, u)
            server.anonymize_user_account(conn, u)
            self.assertTrue(_deleted_at(conn, lid), "注销后房源必须被软删")
            self.assertEqual(
                conn.execute("SELECT status FROM city_listings WHERE id=?", (lid,)).fetchone()["status"],
                "deleted")

    def test_reconcile_removes_orphans_only(self) -> None:
        with server.db() as conn:
            gone = _mk_user(conn, deleted=True)     # deleted_at set, listing still live
            lg = _mk_listing(conn, gone)
            live = _mk_user(conn)                    # active seller — must be untouched
            ll = _mk_listing(conn, live)
            removed = server.reconcile_deleted_user_listings(conn)
            self.assertGreaterEqual(removed, 1)
            self.assertTrue(_deleted_at(conn, lg), "已注销卖家的遗留房源必须清掉")
            self.assertFalse(_deleted_at(conn, ll), "活跃卖家的房源绝不能被误删")

    def test_reconcile_idempotent(self) -> None:
        with server.db() as conn:
            gone = _mk_user(conn, deleted=True)
            _mk_listing(conn, gone)
            self.assertGreaterEqual(server.reconcile_deleted_user_listings(conn), 1)
            self.assertEqual(server.reconcile_deleted_user_listings(conn), 0, "二次运行应无新增删除")


if __name__ == "__main__":
    print("DELETED USER LISTINGS")
    unittest.main(verbosity=2)
