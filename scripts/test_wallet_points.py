#!/usr/bin/env python3
"""Tests for the Machi Points wallet: accounts, immutable ledger, top-up
settlement idempotency, points-priced guide purchases, entitlements and
refund/revoke. Exercises the real SCHEMA + MIGRATIONS + seed startup chain
against a throwaway SQLite DB. No HTTP server, no network, never touches the
real kaix.db.

Run:  cd web && python3 scripts/test_wallet_points.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_wallet_test_", suffix=".db")[1]
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


def _make_product(conn, *, wallet_eligible=1, wallet_price=300, member_price=0,
                  is_free=0, status="published", coming=0, title="测试资料") -> dict:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, category_key, product_type, price, currency, "
        "is_free, is_paid, is_digital, is_service, is_coming_soon, status, wallet_eligible, "
        "wallet_price_points, member_wallet_price_points, fulfillment_type, entitlement_type, "
        "platform_policy, created_at, updated_at) "
        "VALUES (?, ?, ?, 'guide_services', 'pdf_material', 0, 'CNY', ?, 1, 1, 0, ?, ?, ?, ?, ?, "
        "'digital_unlock', 'guide_product', 'digital_iap_required', ?, ?)",
        (pid, title, "p-" + pid[:8], is_free, coming, status, wallet_eligible,
         wallet_price, member_price, now, now),
    )
    return dict(conn.execute("SELECT * FROM guide_products WHERE id = ?", (pid,)).fetchone())


class WalletFoundationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    # 1. new user → wallet auto-created at zero
    def test_wallet_autocreate_zero_balance(self):
        uid = _make_user(self.conn)
        snap = server.get_wallet_snapshot(self.conn, uid)
        self.assertEqual(snap["balancePoints"], 0)
        self.assertEqual(snap["status"], "active")
        self.assertEqual(snap["pointsName"], "Machi Points")
        self.assertIn("不可提现", snap["disclaimer"])
        # idempotent: a second ensure does not create a duplicate account
        server.ensure_wallet_account(self.conn, uid)
        n = self.conn.execute("SELECT COUNT(*) AS c FROM wallet_accounts WHERE user_id = ?", (uid,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)

    # 2. top-up packs seeded and readable
    def test_topup_packs_seeded(self):
        packs = server.list_topup_products(self.conn)
        keys = {p["pack_key"] for p in packs}
        self.assertEqual(keys, {"machi_points_600", "machi_points_1500", "machi_points_3200", "machi_points_6800"})
        pack = server.get_topup_product(self.conn, "machi_points_1500")
        self.assertEqual(pack["points"], 1500)
        self.assertEqual(pack["bonus_points"], 80)
        serialized = server.serialize_wallet_topup_product(pack)
        self.assertEqual(serialized["totalPoints"], 1580)
        self.assertEqual(serialized["priceLabel"], "¥15")  # amount_cents 1500 -> ¥15

    # 4. wallet_credit_topup is idempotent — same order never double-credits
    def test_credit_topup_idempotent(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1500")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        r1 = server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_abc")
        self.assertTrue(r1["applied"])
        self.assertEqual(r1["grantedPoints"], 1580)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1580)
        # replay
        r2 = server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_abc")
        self.assertFalse(r2["applied"])
        self.assertTrue(r2["duplicate"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1580)
        # ledger has exactly two rows (topup + bonus), one balance line each
        rows = self.conn.execute(
            "SELECT entry_type, points_delta FROM wallet_ledger_entries WHERE user_id = ? ORDER BY entry_type", (uid,)
        ).fetchall()
        kinds = sorted((dict(r)["entry_type"], dict(r)["points_delta"]) for r in rows)
        self.assertEqual(kinds, [("bonus", 80), ("topup", 1500)])

    # 4b. ledger idempotency_key blocks a duplicate post
    def test_ledger_idempotency_key(self):
        uid = _make_user(self.conn)
        a = server.wallet_post_ledger(self.conn, uid, "topup", 500, idempotency_key="k-dup")
        self.assertTrue(a["applied"])
        b = server.wallet_post_ledger(self.conn, uid, "topup", 500, idempotency_key="k-dup")
        self.assertFalse(b["applied"])
        self.assertTrue(b["duplicate"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 500)

    # debit never goes negative; insufficient is reported
    def test_debit_never_negative(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 200)
        # try to spend 500 from a 200 balance
        r = server.wallet_post_ledger(self.conn, uid, "spend", -500)
        self.assertTrue(r["insufficient"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 200)
        # spend within balance works
        ok = server.wallet_post_ledger(self.conn, uid, "spend", -150)
        self.assertTrue(ok["applied"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 50)

    # member price beats base price when an active membership exists
    def test_member_points_price(self):
        uid = _make_user(self.conn)
        prod = _make_product(self.conn, wallet_price=300, member_price=200)
        self.assertEqual(server.compute_product_points_price(self.conn, uid, prod), 300)
        server.activate_or_extend_membership(self.conn, uid, server.MEMBERSHIP_PLAN_KEY, "test", periods=1)
        self.assertTrue(server.has_active_membership(self.conn, uid))
        self.assertEqual(server.compute_product_points_price(self.conn, uid, prod), 200)

    # entitlement lifecycle: grant / has / revoke (+ unique-active)
    def test_entitlement_lifecycle(self):
        uid = _make_user(self.conn)
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", "r1"))
        e1 = server.grant_user_entitlement(self.conn, uid, "guide_product", "r1", source_type="admin")
        self.assertTrue(server.user_has_entitlement(self.conn, uid, "guide_product", "r1"))
        # idempotent grant returns same row, no duplicate active row
        e2 = server.grant_user_entitlement(self.conn, uid, "guide_product", "r1", source_type="admin")
        self.assertEqual(e1["id"], e2["id"])
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM user_entitlements WHERE user_id = ? AND resource_id = 'r1' AND status = 'active'",
            (uid,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)
        server.revoke_user_entitlement(self.conn, uid, "guide_product", "r1", reason="refund")
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", "r1"))

    # 7. points purchase: atomic debit + fulfilled order + entitlement
    def test_purchase_with_points(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 1000)
        prod = _make_product(self.conn, wallet_price=300)
        res = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(res["status"], "fulfilled")
        self.assertEqual(res["currentBalance"], 700)
        self.assertTrue(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        order = self.conn.execute(
            "SELECT * FROM guide_orders WHERE id = ?", (res["orderId"],)).fetchone()
        order = dict(order)
        self.assertEqual(order["status"], "fulfilled")
        self.assertEqual(order["payment_provider"], "wallet")
        self.assertEqual(order["price_points"], 300)
        self.assertTrue(order["entitlement_id"])
        # buying again does NOT charge again (already owned)
        res2 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(res2["status"], "already_owned")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 700)

    # serialize_guide_product exposes the points fields
    def test_serialize_points_fields(self):
        prod = _make_product(self.conn, wallet_eligible=1, wallet_price=480, member_price=380)
        s = server.serialize_guide_product(prod)
        self.assertTrue(s["walletEligible"])
        self.assertEqual(s["walletPricePoints"], 480)
        self.assertEqual(s["memberWalletPricePoints"], 380)
        self.assertEqual(s["pointsPriceLabel"], "480 点")
        self.assertTrue(s["canBuyWithPoints"])
        self.assertEqual(s["platformPolicy"], "digital_iap_required")
        self.assertEqual(s["fulfillmentType"], "digital_unlock")

    # 10. refund a points purchase → revoke entitlement + credit points back
    def test_refund_guide_points_order(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 1000)
        prod = _make_product(self.conn, wallet_price=300)
        res = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(res["status"], "fulfilled")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 700)
        refund = server.refund_guide_points_order(self.conn, res["orderId"], reason="test")
        self.assertTrue(refund["applied"])
        self.assertEqual(refund["refundedPoints"], 300)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1000)
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        # idempotent
        again = server.refund_guide_points_order(self.conn, res["orderId"], reason="test")
        self.assertFalse(again["applied"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1000)

    # 10b. topup chargeback when points already spent → restrict + claw back
    def test_topup_chargeback_after_spend(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_600")  # 600 pts
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_cb")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 600)
        # spend 500
        prod = _make_product(self.conn, wallet_price=500)
        server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 100)
        # chargeback the 600-pt topup: claw back the remaining 100, restrict wallet
        r = server.wallet_refund_topup(self.conn, order["order_no"], reason="dispute", entry_type="chargeback_debit")
        self.assertTrue(r["applied"])
        self.assertEqual(r["clawedBack"], 100)
        self.assertEqual(r["debtPoints"], 500)
        snap = server.get_wallet_snapshot(self.conn, uid)
        self.assertEqual(snap["balancePoints"], 0)  # never negative
        self.assertEqual(snap["status"], "restricted")
        # restricted wallet can't spend
        prod2 = _make_product(self.conn, wallet_price=10)
        server.wallet_post_ledger(self.conn, uid, "admin_adjustment", 50, source_type="admin")  # status still restricted
        blocked = server.wallet_post_ledger(self.conn, uid, "spend", -10)
        self.assertTrue(blocked["insufficient"])  # status != active blocks debit

    # 8. insufficient balance → no order, no entitlement, no charge
    def test_purchase_insufficient(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 100)
        prod = _make_product(self.conn, wallet_price=300)
        res = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(res["status"], "insufficient")
        self.assertEqual(res["requiredPoints"], 300)
        self.assertEqual(res["currentBalance"], 100)
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE user_id = ? AND product_id = ?",
            (uid, prod["id"])).fetchone()
        self.assertEqual(dict(n)["c"], 0)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 100)


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        for suffix in ("", "-wal", "-shm"):
            p = _TMP_DB + suffix
            if os.path.exists(p):
                os.remove(p)
