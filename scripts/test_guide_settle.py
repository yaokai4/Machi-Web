#!/usr/bin/env python3
"""Regression test for settle_guide_order (B1 item 1).

The old code read a non-existent guide_orders.amount_cents column (the table
only has `price`), so EVERY settlement raised before its amount-tamper guard —
i.e. a Stripe-charged Guide order could never be marked fulfilled. This locks in
the corrected amount quantum (matches api_guide_stripe_checkout: price*100 fed
through _stripe_minor_units) across both currency dialects, plus the amount
mismatch guard and idempotency.

Run:  cd web && python3 scripts/test_guide_settle.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_guide_settle_test_", suffix=".db")[1]
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


def _make_product(conn, *, price: int, currency: str, is_service: int = 0) -> str:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, price, currency, is_service, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)",
        (pid, "Test Product " + pid[:6], "p-" + pid[:8], price, currency, is_service, now, now),
    )
    return pid


def _make_order(conn, uid: str, pid: str, *, price: int, currency: str) -> str:
    order_no = server.generate_order_no()
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_orders (id, user_id, product_id, order_no, price, currency, status, "
        "payment_provider, payment_method, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', 'stripe', 'stripe', ?)",
        (str(uuid.uuid4()), uid, pid, order_no, price, currency, now),
    )
    return order_no


class GuideSettleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    def _status(self, order_no: str) -> str:
        return self.conn.execute(
            "SELECT status FROM guide_orders WHERE order_no = ?", (order_no,)
        ).fetchone()["status"]

    def _purchase_count(self, pid: str) -> int:
        return int(self.conn.execute(
            "SELECT purchase_count FROM guide_products WHERE id = ?", (pid,)
        ).fetchone()["purchase_count"])

    def test_settles_with_correct_amount_jpy(self):
        """JPY is zero-decimal: price 600 -> _stripe_minor_units(60000,'jpy')=600.
        The webhook's amount_total (600) must settle and fulfil the order."""
        uid = _make_user(self.conn)
        pid = _make_product(self.conn, price=600, currency="JPY")
        order_no = _make_order(self.conn, uid, pid, price=600, currency="JPY")
        # Amount the checkout would have charged Stripe (minor units).
        amount = server._stripe_minor_units(600 * 100, "jpy")
        self.assertEqual(amount, 600)
        ok = server.settle_guide_order(self.conn, order_no, "pi_ok_jpy", amount)
        self.assertTrue(ok, "correct JPY amount must settle")
        self.assertEqual(self._status(order_no), "fulfilled")
        self.assertEqual(self._purchase_count(pid), 1)

    def test_settles_with_correct_amount_cny(self):
        """CNY is 2-decimal: price 18 -> _stripe_minor_units(1800,'cny')=1800."""
        uid = _make_user(self.conn)
        pid = _make_product(self.conn, price=18, currency="CNY")
        order_no = _make_order(self.conn, uid, pid, price=18, currency="CNY")
        amount = server._stripe_minor_units(18 * 100, "cny")
        self.assertEqual(amount, 1800)
        ok = server.settle_guide_order(self.conn, order_no, "pi_ok_cny", amount)
        self.assertTrue(ok, "correct CNY amount must settle")
        self.assertEqual(self._status(order_no), "fulfilled")
        self.assertEqual(self._purchase_count(pid), 1)

    def test_amount_mismatch_is_rejected(self):
        """A tampered amount_total must NOT settle — order stays pending, no
        purchase_count bump."""
        uid = _make_user(self.conn)
        pid = _make_product(self.conn, price=600, currency="JPY")
        order_no = _make_order(self.conn, uid, pid, price=600, currency="JPY")
        # Send a wrong amount (e.g. 6000 minor units instead of 600).
        ok = server.settle_guide_order(self.conn, order_no, "pi_bad", 6000)
        self.assertFalse(ok, "mismatched amount must be rejected")
        self.assertEqual(self._status(order_no), "pending")
        self.assertEqual(self._purchase_count(pid), 0)

    def test_settlement_is_idempotent(self):
        """A second settle of an already-fulfilled order returns False and does
        NOT bump purchase_count again (webhook + success-redirect double-fire)."""
        uid = _make_user(self.conn)
        pid = _make_product(self.conn, price=600, currency="JPY")
        order_no = _make_order(self.conn, uid, pid, price=600, currency="JPY")
        amount = server._stripe_minor_units(600 * 100, "jpy")
        self.assertTrue(server.settle_guide_order(self.conn, order_no, "pi_1", amount))
        # Replay.
        self.assertFalse(server.settle_guide_order(self.conn, order_no, "pi_2", amount))
        self.assertEqual(self._status(order_no), "fulfilled")
        self.assertEqual(self._purchase_count(pid), 1, "purchase_count must not double-bump")

    def test_amount_zero_skips_guard(self):
        """A 0 amount_cents (no amount supplied) settles without the guard — the
        confirm path may not always know amount_total. Matches existing behavior
        (guard only runs when both amount_cents and expected are truthy)."""
        uid = _make_user(self.conn)
        pid = _make_product(self.conn, price=600, currency="JPY")
        order_no = _make_order(self.conn, uid, pid, price=600, currency="JPY")
        ok = server.settle_guide_order(self.conn, order_no, "pi_noamt", 0)
        self.assertTrue(ok, "0 amount bypasses the tamper guard and settles")
        self.assertEqual(self._status(order_no), "fulfilled")


if __name__ == "__main__":
    unittest.main(verbosity=2)
