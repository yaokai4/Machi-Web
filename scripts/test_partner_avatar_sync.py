#!/usr/bin/env python3
"""Partner 公司账号 avatar ↔ logo sync (星域东京 头像修复).

A partner's seller account is provisioned with a discarded random password so it
can never log in — nobody can open "edit profile" to set its avatar. The only way
its avatar can change is by mirroring the partner logo. This locks that wiring:
create with a logo → seller avatar set; edit the logo → avatar follows; boot
backfill fills an empty avatar; a real avatar is never overwritten.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP = Path(tempfile.mkdtemp(prefix="kaix-partner-avatar-"))
os.environ["KAIX_DB_PATH"] = str(_TMP / "test.db")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_partners as partners  # noqa: E402


def _mk_seller(conn, avatar_url: str = "") -> str:
    uid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, avatar_url, "
        "role, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, '', ?, ?, 'member', ?, ?, ?)",
        (uid, "partner_" + uid[:8], "星域东京", "x", avatar_url, now, now, now),
    )
    return uid


def _avatar(conn, uid: str) -> str:
    return conn.execute("SELECT avatar_url FROM users WHERE id = ?", (uid,)).fetchone()["avatar_url"]


class PartnerAvatarSync(unittest.TestCase):
    def setUp(self) -> None:
        server.init_db()

    def test_create_with_logo_sets_seller_avatar(self) -> None:
        with server.db() as conn:
            seller = _mk_seller(conn)
            partners.create_partner(
                conn, key="star-" + uuid.uuid4().hex[:6], name="星域东京",
                seller_user_id=seller, logo_url="https://cdn/logo.png", now=server.now_iso())
            self.assertEqual(_avatar(conn, seller), "https://cdn/logo.png")

    def test_update_logo_updates_seller_avatar(self) -> None:
        with server.db() as conn:
            seller = _mk_seller(conn)
            key = "star-" + uuid.uuid4().hex[:6]
            partners.create_partner(conn, key=key, name="星域东京", seller_user_id=seller, now=server.now_iso())
            self.assertEqual(_avatar(conn, seller), "")  # no logo yet → still empty
            partners.update_partner(conn, key, {"logo_url": "https://cdn/new-logo.png"}, now=server.now_iso())
            self.assertEqual(_avatar(conn, seller), "https://cdn/new-logo.png")

    def test_backfill_fills_empty_only(self) -> None:
        with server.db() as conn:
            # seller A: empty avatar, partner has a logo → backfill fills it
            a = _mk_seller(conn, avatar_url="")
            ka = "star-" + uuid.uuid4().hex[:6]
            conn.execute(
                "INSERT INTO partners (id, partner_key, name, seller_user_id, logo_url, status, created_at, updated_at) "
                "VALUES (?, ?, '星域', ?, ?, 'active', ?, ?)",
                ("p_" + uuid.uuid4().hex, ka, a, "https://cdn/a.png", server.now_iso(), server.now_iso()))
            # seller B: already has a real avatar → backfill must NOT overwrite
            b = _mk_seller(conn, avatar_url="https://cdn/real-b.png")
            kb = "star-" + uuid.uuid4().hex[:6]
            conn.execute(
                "INSERT INTO partners (id, partner_key, name, seller_user_id, logo_url, status, created_at, updated_at) "
                "VALUES (?, ?, '星域', ?, ?, 'active', ?, ?)",
                ("p_" + uuid.uuid4().hex, kb, b, "https://cdn/b.png", server.now_iso(), server.now_iso()))
            filled = partners.backfill_partner_seller_avatars(conn)
            self.assertGreaterEqual(filled, 1)
            self.assertEqual(_avatar(conn, a), "https://cdn/a.png")     # filled
            self.assertEqual(_avatar(conn, b), "https://cdn/real-b.png")  # untouched

    def test_no_logo_no_change(self) -> None:
        with server.db() as conn:
            seller = _mk_seller(conn, avatar_url="")
            self.assertFalse(partners.sync_seller_avatar(conn, seller, ""))
            self.assertEqual(_avatar(conn, seller), "")


if __name__ == "__main__":
    print("PARTNER AVATAR SYNC")
    unittest.main(verbosity=2)
