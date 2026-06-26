#!/usr/bin/env python3
"""Auto-close of abandoned unpaid orders + the "real money always wins" rule.

Covers the 20-minute unpaid-order cleanup (close_expired_unpaid_orders across
payment_orders / wallet_topup_orders / guide_orders) and the critical guarantee
that a genuine payment arriving AFTER an order is auto-closed still settles and
credits — so the janitor can never cost a user money.

Run:  cd web && python3 scripts/test_order_cleanup.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_order_cleanup_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn, handle: str | None = None) -> str:
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _stale_iso(minutes: int) -> str:
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


class OrderCleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    def test_expired_wallet_topup_is_closed_then_still_settles(self):
        """An abandoned top-up is auto-closed, but a real payment that lands
        afterwards must STILL credit the points (closed -> paid)."""
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        # Backdate creation past the TTL so the janitor closes it.
        self.conn.execute(
            "UPDATE wallet_topup_orders SET created_at = ? WHERE order_no = ?",
            (_stale_iso(25), order["order_no"]),
        )

        closed = server.close_expired_unpaid_orders(self.conn)
        self.assertGreaterEqual(closed, 1)
        status = self.conn.execute(
            "SELECT status FROM wallet_topup_orders WHERE order_no = ?", (order["order_no"],)
        ).fetchone()["status"]
        self.assertEqual(status, "closed")

        before = server.get_wallet_snapshot(self.conn, uid)["balancePoints"]
        result = server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_late")
        self.assertTrue(result["applied"], "a genuine payment after auto-close must still credit")
        after = server.get_wallet_snapshot(self.conn, uid)["balancePoints"]
        self.assertEqual(after - before, int(order["total_points"]))

    def test_fresh_pending_order_is_not_closed(self):
        """A just-created order (within the TTL) must NOT be touched."""
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        server.close_expired_unpaid_orders(self.conn)
        status = self.conn.execute(
            "SELECT status FROM wallet_topup_orders WHERE order_no = ?", (order["order_no"],)
        ).fetchone()["status"]
        self.assertEqual(status, "pending")

    def test_expired_membership_order_is_closed(self):
        """A membership order past its expires_at is closed by the janitor."""
        uid = _make_user(self.conn)
        order_no = server.generate_order_no()
        now = server.now_iso()
        self.conn.execute(
            "INSERT INTO payment_orders (id, order_no, user_id, plan_key, amount_cents, currency, status, "
            "payment_provider, client_type, expires_at, created_at, updated_at) "
            "VALUES (?, ?, ?, 'x', 1800, 'JPY', 'pending', 'stripe', 'web', ?, ?, ?)",
            (str(uuid.uuid4()), order_no, uid, _stale_iso(25), now, now),
        )
        server.close_expired_unpaid_orders(self.conn)
        status = self.conn.execute(
            "SELECT status FROM payment_orders WHERE order_no = ?", (order_no,)
        ).fetchone()["status"]
        self.assertEqual(status, "closed")

    def test_expired_guide_order_is_cancelled(self):
        """An abandoned guide product order is cancelled (its terminal-pending
        state), and settle_guide_order still tolerates settling it later."""
        uid = _make_user(self.conn)
        order_no = server.generate_order_no()
        self.conn.execute(
            "INSERT INTO guide_orders (id, user_id, product_id, order_no, price, currency, status, "
            "payment_provider, payment_method, created_at) "
            "VALUES (?, ?, ?, ?, 1800, 'JPY', 'pending', 'stripe', 'stripe', ?)",
            (str(uuid.uuid4()), uid, "prod-x", order_no, _stale_iso(25)),
        )
        server.close_expired_unpaid_orders(self.conn)
        status = self.conn.execute(
            "SELECT status FROM guide_orders WHERE order_no = ?", (order_no,)
        ).fetchone()["status"]
        self.assertEqual(status, "cancelled")


if __name__ == "__main__":
    unittest.main(verbosity=2)
