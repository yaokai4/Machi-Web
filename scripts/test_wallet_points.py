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
                  is_free=0, status="published", coming=0, title="测试资料",
                  purchase_limit=0, file_url="") -> dict:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, category_key, product_type, price, currency, "
        "is_free, is_paid, is_digital, is_service, is_coming_soon, status, wallet_eligible, "
        "wallet_price_points, member_wallet_price_points, fulfillment_type, entitlement_type, "
        "platform_policy, points_purchase_limit, file_url, created_at, updated_at) "
        "VALUES (?, ?, ?, 'guide_services', 'pdf_material', 0, 'CNY', ?, 1, 1, 0, ?, ?, ?, ?, ?, "
        "'digital_unlock', 'guide_product', 'digital_iap_required', ?, ?, ?, ?)",
        (pid, title, "p-" + pid[:8], is_free, coming, status, wallet_eligible,
         wallet_price, member_price, purchase_limit, file_url, now, now),
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
        self.assertEqual(snap["pointsName"], "Machi Coins")
        self.assertIn("不可提现", snap["disclaimer"])
        # idempotent: a second ensure does not create a duplicate account
        server.ensure_wallet_account(self.conn, uid)
        n = self.conn.execute("SELECT COUNT(*) AS c FROM wallet_accounts WHERE user_id = ?", (uid,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)

    # 2. top-up packs seeded and readable
    def test_topup_packs_seeded(self):
        packs = server.list_topup_products(self.conn)
        keys = {p["pack_key"] for p in packs}
        self.assertEqual(keys, {
            "machi_points_600", "machi_points_1800", "machi_points_3000", "machi_points_6800",
            "machi_points_9800", "machi_points_12800", "machi_points_19800", "machi_points_32800",
            "machi_points_64800",
        })
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        self.assertEqual(pack["points"], 1800)
        self.assertEqual(pack["bonus_points"], 100)
        serialized = server.serialize_wallet_topup_product(pack)
        self.assertEqual(serialized["totalPoints"], 1900)
        # 2026-07 货币白皮书: 1 币 = 1 JPY. A pack's face price equals its coin
        # count (amount_cents = points × 100, JPY), so wallet_price_points can
        # always equal a product's JPY price with no cross-channel arbitrage.
        self.assertEqual(serialized["currency"], "JPY")
        self.assertEqual(serialized["priceLabel"], "¥1800")
        for p in packs:
            self.assertEqual(p["currency"], "JPY", p["pack_key"])
            self.assertEqual(int(p["amount_cents"]), int(p["points"]) * 100, p["pack_key"])

    # 4. wallet_credit_topup is idempotent — same order never double-credits
    def test_credit_topup_idempotent(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        r1 = server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_abc")
        self.assertTrue(r1["applied"])
        self.assertEqual(r1["grantedPoints"], 1900)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1900)
        # replay
        r2 = server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="pi_abc")
        self.assertFalse(r2["applied"])
        self.assertTrue(r2["duplicate"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1900)
        # ledger has exactly two rows (topup + bonus), one balance line each
        rows = self.conn.execute(
            "SELECT entry_type, points_delta FROM wallet_ledger_entries WHERE user_id = ? ORDER BY entry_type", (uid,)
        ).fetchall()
        kinds = sorted((dict(r)["entry_type"], dict(r)["points_delta"]) for r in rows)
        self.assertEqual(kinds, [("bonus", 100), ("topup", 1800)])

    # 4a. crash-atomicity: a failure mid-settlement rolls the WHOLE op back —
    # the order must NOT be left 'paid' with no points (the unrecoverable
    # "charged real money, received nothing" window). Without @money_atomic the
    # order flip autocommits and this test fails (order stuck 'paid', no credit).
    def test_credit_topup_is_crash_atomic(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "stripe", "web")
        order_no = order["order_no"]
        bal0 = server.get_wallet_snapshot(self.conn, uid)["balancePoints"]

        # Inject a crash during the ledger write (after the order is flipped).
        real_post = server.wallet_post_ledger

        def boom(*a, **k):
            raise RuntimeError("simulated crash mid-settlement")

        server.wallet_post_ledger = boom
        try:
            with self.assertRaises(RuntimeError):
                server.wallet_credit_topup(self.conn, order_no, provider_trade_no="pi_x", source_type="stripe")
        finally:
            server.wallet_post_ledger = real_post

        # Rolled back wholesale: order still payable, no points credited, no ledger rows.
        status = dict(self.conn.execute(
            "SELECT status FROM wallet_topup_orders WHERE order_no = ?", (order_no,)).fetchone())["status"]
        self.assertEqual(status, "pending")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], bal0)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id = ?", (uid,)).fetchone()["c"], 0)

        # And a clean retry settles correctly — the failure was fully recoverable.
        r = server.wallet_credit_topup(self.conn, order_no, provider_trade_no="pi_x", source_type="stripe")
        self.assertTrue(r["applied"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"],
                         bal0 + int(order["total_points"] or 0))

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
        self.assertEqual(s["pointsPriceLabel"], "480 币")
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

    # 5. Apple IAP top-up credits once and is idempotent on the transaction id
    def test_apple_iap_topup_idempotent(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product_by_apple(self.conn, "machi_points_1800")
        self.assertIsNotNone(pack)  # seed sets apple_product_id = pack_key
        dedup = "apple:txn-12345"
        r1 = server.wallet_credit_iap_topup(self.conn, uid, pack, "apple_iap", "ios", dedup)
        self.assertTrue(r1["applied"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1900)
        # re-verify same transaction (restore / retry) — no double credit
        r2 = server.wallet_credit_iap_topup(self.conn, uid, pack, "apple_iap", "ios", dedup)
        self.assertFalse(r2["applied"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1900)
        # exactly one WT order for this transaction
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_topup_orders WHERE payment_provider='apple_iap' AND provider_trade_no=?",
            (dedup,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)

    # 6. Google verify returns provider_unconfigured (None) without credentials
    def test_google_unconfigured(self):
        self.assertFalse(server.google_play_configured())
        self.assertIsNone(server.verify_google_play_purchase("machi_points_600", "tok-abc"))
        self.assertIsNotNone(server.get_topup_product_by_google(self.conn, "machi_points_600"))

    # 9. one-time JPY reprice migration converts legacy CNY rows exactly once
    def test_jpy_reprice_migration(self):
        # Simulate a legacy CNY-priced row surviving from an old database.
        self.conn.execute(
            "UPDATE wallet_topup_products SET currency='CNY', amount_cents=1800 WHERE pack_key='machi_points_1800'")
        server._upsert_site_settings(self.conn, {"wallet_topup_jpy_reprice_v1": ""})
        server._wallet_topup_jpy_reprice_once(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_1800")
        self.assertEqual(pack["currency"], "JPY")
        self.assertEqual(int(pack["amount_cents"]), 180000)
        # A row an operator already re-priced by hand (non-CNY) is never touched.
        self.conn.execute(
            "UPDATE wallet_topup_products SET amount_cents=123400 WHERE pack_key='machi_points_600'")
        server._upsert_site_settings(self.conn, {"wallet_topup_jpy_reprice_v1": ""})
        server._wallet_topup_jpy_reprice_once(self.conn)
        kept = server.get_topup_product(self.conn, "machi_points_600")
        self.assertEqual(int(kept["amount_cents"]), 123400)
        # Restore seed state for the other tests sharing this database.
        self.conn.execute(
            "UPDATE wallet_topup_products SET amount_cents=60000, currency='JPY' WHERE pack_key='machi_points_600'")

    # 10. refund-debt recovery: revoke the spent order, debit the credit back
    # against the debt, un-restrict once the debt is cleared
    def test_refund_debt_recovery(self):
        uid = _make_user(self.conn)
        pack = server.get_topup_product(self.conn, "machi_points_600")
        order = server.create_wallet_topup_order(self.conn, uid, pack, "apple_iap", "ios",
                                                 provider_trade_no="apple:txn-debt-1")
        server.wallet_credit_topup(self.conn, order["order_no"], provider_trade_no="apple:txn-debt-1")
        prod = _make_product(self.conn, wallet_price=500)
        buy = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(buy["status"], "fulfilled")
        # Apple refunds the top-up: 100 clawed back, 500 debt, wallet restricted.
        server.wallet_refund_topup(self.conn, order["order_no"], reason="REFUND", entry_type="refund_debit")
        self.assertEqual(server.wallet_outstanding_debt(self.conn, uid), 500)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["status"], "restricted")
        # Admin one-click recovery: revoke the 500-pt order bought with refunded coins.
        outcome = server.admin_recover_refund_debt(self.conn, [buy["orderId"]], admin_handle="admin")
        res = outcome["results"][0]
        self.assertTrue(res["applied"])
        self.assertEqual(res["creditedPoints"], 500)
        self.assertEqual(res["recoveredPoints"], 500)
        self.assertEqual(server.wallet_outstanding_debt(self.conn, uid), 0)
        snap = server.get_wallet_snapshot(self.conn, uid)
        self.assertEqual(snap["balancePoints"], 0)
        self.assertEqual(snap["status"], "active")  # debt cleared → unrestricted
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        # Idempotent: revoking the same order again recovers nothing more.
        again = server.admin_recover_refund_debt(self.conn, [buy["orderId"]], admin_handle="admin")
        self.assertFalse(again["results"][0]["applied"])

    # 11. single-product Apple IAP purchase: grants once, idempotent on the
    # transaction id, refund revokes the entitlement without crediting points
    def test_guide_iap_purchase_and_refund(self):
        uid = _make_user(self.conn)
        prod = _make_product(self.conn, wallet_price=980)
        dedup = "apple:txn-guide-1"
        r1 = server.guide_credit_iap_purchase(self.conn, uid, prod, provider_trade_no=dedup)
        self.assertEqual(r1["status"], "fulfilled")
        self.assertTrue(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        order = self.conn.execute("SELECT * FROM guide_orders WHERE id = ?", (r1["orderId"],)).fetchone()
        self.assertEqual(order["payment_provider"], "apple_iap")
        self.assertEqual(int(order["price_points"] or 0), 0)  # money side is Apple's
        # replay (restore / webhook race) → duplicate, exactly one order
        r2 = server.guide_credit_iap_purchase(self.conn, uid, prod, provider_trade_no=dedup)
        self.assertEqual(r2["status"], "duplicate")
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE payment_provider='apple_iap' AND provider_trade_no=?",
            (dedup,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)
        # refund: entitlement revoked, wallet balance untouched (0 points order)
        before = server.get_wallet_snapshot(self.conn, uid)["balancePoints"]
        res = server.refund_guide_points_order(self.conn, r1["orderId"], reason="REFUND")
        self.assertTrue(res["applied"])
        self.assertEqual(res["refundedPoints"], 0)
        self.assertFalse(server.user_has_entitlement(self.conn, uid, "guide_product", prod["id"]))
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], before)

    # 12. membership monthly bonus: instant grant on activation, idempotent
    # within the same membership month, grants again after the month rolls over
    def test_membership_monthly_bonus(self):
        from datetime import datetime, timedelta, timezone
        uid = _make_user(self.conn)
        expires = (datetime.now(timezone.utc) + timedelta(days=400)).isoformat()
        # Activation path (sync_apple_membership_expiry) triggers the instant grant.
        status = server.sync_apple_membership_expiry(self.conn, uid, server.MEMBERSHIP_PLAN_KEY, expires)
        self.assertTrue(status["is_active"])
        bonus = server.MEMBERSHIP_MONTHLY_BONUS_POINTS
        self.assertGreater(bonus, 0)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], bonus)
        # Same period: sweep + direct grant are both no-ops.
        r = server.grant_membership_monthly_bonus(self.conn, uid)
        self.assertFalse(r["applied"])
        self.assertTrue(r["duplicate"])
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], bonus)
        # Next membership month (backdate started_at by ~35 days) → one more grant.
        backdated = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
        self.conn.execute("UPDATE user_memberships SET started_at = ? WHERE user_id = ?", (backdated, uid))
        r2 = server.grant_membership_monthly_bonus(self.conn, uid)
        self.assertTrue(r2["applied"])
        self.assertEqual(r2["periodIndex"], 1)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], bonus * 2)
        # Ledger rows carry the membership_bonus entry type (counts as bonus).
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id = ? AND entry_type = 'membership_bonus'",
            (uid,)).fetchone()
        self.assertEqual(dict(n)["c"], 2)
        # Expired membership never grants.
        self.conn.execute("UPDATE user_memberships SET status = 'expired' WHERE user_id = ?", (uid,))
        server.sync_user_membership_cache(self.conn, uid)
        r3 = server.grant_membership_monthly_bonus(self.conn, uid)
        self.assertFalse(r3["applied"])

    # 13. points_purchase_limit (B1-8): limit reached blocks a re-purchase with
    # zero wallet movement; the check fires before any debit
    def test_points_purchase_limit_enforced(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 1000)
        prod = _make_product(self.conn, wallet_price=300, purchase_limit=1)
        r1 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r1["status"], "fulfilled")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 700)
        # Admin revokes the entitlement WITHOUT refunding the order (e.g. abuse
        # handling) — the fulfilled order still counts against the limit, so a
        # second buy is refused and no points move.
        server.revoke_user_entitlement(self.conn, uid, "guide_product", prod["id"], reason="test")
        r2 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r2["status"], "limit_reached")
        self.assertEqual(r2["purchaseLimit"], 1)
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 700)
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE user_id = ? AND product_id = ?",
            (uid, prod["id"])).fetchone()
        self.assertEqual(dict(n)["c"], 1)

    # 13b. a refunded order frees its limit slot (interacts with the concurrent
    # entitlement-race auto-refund, which also flips the order to 'refunded')
    def test_points_purchase_limit_refund_frees_slot(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 1000)
        prod = _make_product(self.conn, wallet_price=300, purchase_limit=1)
        r1 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r1["status"], "fulfilled")
        server.refund_guide_points_order(self.conn, r1["orderId"], reason="test")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 1000)
        # The refunded order no longer counts — the user may buy again.
        r2 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r2["status"], "fulfilled")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 700)

    # 13c. limit=0 means unlimited (the pre-B1-8 behaviour is preserved)
    def test_points_purchase_limit_zero_unlimited(self):
        uid = _make_user(self.conn)
        server.wallet_post_ledger(self.conn, uid, "topup", 1000)
        prod = _make_product(self.conn, wallet_price=300, purchase_limit=0)
        r1 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r1["status"], "fulfilled")
        server.revoke_user_entitlement(self.conn, uid, "guide_product", prod["id"], reason="test")
        r2 = server.wallet_debit_for_product(self.conn, uid, prod)
        self.assertEqual(r2["status"], "fulfilled")
        self.assertEqual(server.get_wallet_snapshot(self.conn, uid)["balancePoints"], 400)

    # 14. deliverable_ready (契约 C-1): a paid digital product with no file and
    # no guide_product_files row is not ready; a file (either column or the
    # multi-file table) or free/zero-price status makes it ready
    def test_deliverable_ready_flag(self):
        prod = _make_product(self.conn, wallet_price=300)  # paid, no file
        self.assertFalse(server.guide_product_deliverable_ready(self.conn, prod))
        s = server.serialize_guide_product(prod, conn=self.conn)
        self.assertFalse(s["deliverable_ready"])
        self.assertFalse(s["deliverableReady"])
        # file_url set → ready
        with_file = _make_product(self.conn, wallet_price=300, file_url="/media/x.pdf")
        self.assertTrue(server.guide_product_deliverable_ready(self.conn, with_file))
        self.assertTrue(server.serialize_guide_product(with_file, conn=self.conn)["deliverable_ready"])
        # a guide_product_files row alone also counts
        via_table = _make_product(self.conn, wallet_price=300)
        self.conn.execute(
            "INSERT INTO guide_product_files (id, product_id, file_url, file_name, file_type, file_size, "
            "download_limit, created_at) VALUES (?, ?, '/media/y.pdf', 'y.pdf', 'pdf', 1, 0, ?)",
            (str(uuid.uuid4()), via_table["id"], server.now_iso()))
        self.assertTrue(server.guide_product_deliverable_ready(self.conn, via_table))
        # free products and services are out of scope (免费领取不拦)
        free = _make_product(self.conn, wallet_eligible=0, wallet_price=0, is_free=1)
        self.assertTrue(server.guide_product_deliverable_ready(self.conn, free))
        svc = _make_product(self.conn, wallet_price=300)
        self.conn.execute("UPDATE guide_products SET is_service = 1 WHERE id = ?", (svc["id"],))
        svc = dict(self.conn.execute("SELECT * FROM guide_products WHERE id = ?", (svc["id"],)).fetchone())
        self.assertTrue(server.guide_product_deliverable_ready(self.conn, svc))

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
