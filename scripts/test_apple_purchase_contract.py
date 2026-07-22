#!/usr/bin/env python3
"""Apple purchase canonical-payload and global redemption contract tests.

These tests use controlled decoded StoreKit payloads; certificate-chain trust is
covered separately by ``test_apple_iap_hardening.py``.  Every grant path still
runs through its real handler and real SQLite transaction/schema.

Run:  cd web && python3 scripts/test_apple_purchase_contract.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

_TMP_DB = tempfile.mkstemp(prefix="machi_apple_purchase_contract_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn: sqlite3.Connection) -> dict:
    user_id = str(uuid.uuid4())
    handle = "apple_" + uuid.uuid4().hex[:10]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
        (user_id, handle, handle, f"{handle}@example.com", now, now, now),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())


class ApplePurchaseContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        self.user = _make_user(self.conn)
        self.was_production = server.PRODUCTION
        server.PRODUCTION = True
        self.bundle_id = server.APPLE_IAP_BUNDLE_ID or "com.machi.contract-tests"
        self.plan = dict(self.conn.execute(
            "SELECT * FROM membership_plans WHERE is_active=1 "
            "AND (apple_product_id<>'' OR ios_iap_product_id<>'') "
            "ORDER BY sort_order, plan_key LIMIT 1"
        ).fetchone())
        self.pack = dict(self.conn.execute(
            "SELECT * FROM wallet_topup_products WHERE is_active=1 "
            "AND (apple_product_id<>'' OR ios_iap_product_id<>'') "
            "ORDER BY sort_order, pack_key LIMIT 1"
        ).fetchone())
        self.guide = dict(self.conn.execute(
            "SELECT * FROM guide_products WHERE status='published' "
            "AND (apple_product_id<>'' OR ios_iap_product_id<>'') "
            "ORDER BY slug LIMIT 1"
        ).fetchone())

    def tearDown(self) -> None:
        server.PRODUCTION = self.was_production
        self.conn.close()

    @staticmethod
    def _sku(row: dict) -> str:
        return str(row.get("apple_product_id") or row.get("ios_iap_product_id") or "")

    def _payload(
            self, family: str, user: dict, txn_id: str, *,
            environment: str = "Production", include_token: bool = True) -> dict:
        item = {"membership": self.plan, "wallet": self.pack, "guide": self.guide}[family]
        payload = {
            "transactionId": txn_id,
            "originalTransactionId": "orig-" + txn_id,
            "productId": self._sku(item),
            "environment": environment,
            "bundleId": self.bundle_id,
        }
        if include_token:
            payload["appAccountToken"] = user["id"]
        if family == "membership":
            payload["expiresDate"] = int(
                (datetime.now(timezone.utc) + timedelta(days=30)).timestamp() * 1000
            )
        return payload

    def _call(
            self, family: str, user: dict, payload: dict, *, data: dict | None = None,
            expected_error: str | None = None):
        handler = server.Handler.__new__(server.Handler)
        captured: dict = {}
        handler.require_user = lambda _conn: user  # type: ignore[method-assign]
        handler.read_json = lambda: data or {  # type: ignore[method-assign]
            "signedTransaction": "controlled.signed.transaction",
            "productId": payload.get("productId", ""),
        }
        handler.send_json = lambda body, status=200: captured.update(  # type: ignore[method-assign]
            body=body, status=status
        )
        method = {
            "membership": handler.api_apple_verify,
            "wallet": handler.api_wallet_topup_apple_verify,
            "guide": handler.api_apple_guide_verify,
        }[family]
        with patch.object(server, "verify_apple_transaction", return_value=dict(payload)), \
             patch.object(server, "guide_product_deliverable_ready", return_value=True):
            if expected_error:
                with self.assertRaises(server.APIError) as raised:
                    method(self.conn)
                self.assertEqual(raised.exception.code, expected_error)
                return raised.exception
            method(self.conn)
        self.assertEqual(captured.get("status"), 200)
        return captured["body"]

    def _apple_webhook(
            self, payload: dict, *, notification_type: str,
            event_id: str | None = None, expected_error: str | None = None) -> dict:
        notification = {
            "notificationType": notification_type,
            "notificationUUID": event_id or "apple-event-" + uuid.uuid4().hex,
            "data": {
                "bundleId": payload["bundleId"],
                "environment": payload["environment"],
                "signedTransactionInfo": "controlled.signed.transaction",
            },
        }
        handler = server.Handler.__new__(server.Handler)
        captured: dict = {}
        handler.read_json = lambda: {  # type: ignore[method-assign]
            "signedPayload": "controlled.signed.notification"
        }
        handler.send_json = lambda body, status=200: captured.update(  # type: ignore[method-assign]
            body=body, status=status
        )
        with patch.object(
                server, "decode_apple_jws_payload", return_value=(notification, True)), \
             patch.object(server, "verify_apple_transaction", return_value=dict(payload)):
            if expected_error:
                with self.assertRaises(server.APIError) as raised:
                    handler.api_payment_webhook_apple(self.conn)
                self.assertEqual(raised.exception.code, expected_error)
                return {}
            handler.api_payment_webhook_apple(self.conn)
        self.assertEqual(captured.get("status"), 200)
        return captured["body"]

    def _refund_webhook(
            self, payload: dict, *, event_id: str | None = None,
            expected_error: str | None = None) -> dict:
        return self._apple_webhook(
            payload,
            notification_type="REFUND",
            event_id=event_id,
            expected_error=expected_error,
        )

    def test_migration_134_creates_global_apple_transaction_registry(self) -> None:
        migration = [entry for entry in server.MIGRATIONS if entry[0] == 134]
        self.assertEqual(len(migration), 1)
        migration_sql = migration[0][2]
        # Migration 134 uses portable DDL and passes through the same static
        # translation path used by apply_postgres_migrations.py. This is not a
        # claim of a live PostgreSQL run; it catches accidental SQLite-only SQL.
        self.assertEqual(server._pg_xlate(migration_sql, False), migration_sql)
        self.assertNotIn("AUTOINCREMENT", migration_sql.upper())
        self.assertNotIn("PRAGMA", migration_sql.upper())
        self.assertIn("transaction_id TEXT PRIMARY KEY", migration_sql)
        self.assertIn("CHECK (purchase_family IN", migration_sql)
        self.assertIn("CHECK (claim_status IN", migration_sql)
        self.assertIn("'unknown'", migration_sql)
        self.assertIn("'revoked'", migration_sql)
        columns = {
            row["name"] for row in self.conn.execute("PRAGMA table_info(apple_transaction_registry)")
        }
        self.assertTrue({
            "transaction_id", "original_transaction_id", "product_id",
            "purchase_family", "resource_id", "user_id", "environment",
            "app_account_token", "bundle_id", "grant_reference", "created_at",
            "updated_at",
        } <= columns)
        translated_claim = server._pg_xlate(
            "INSERT INTO apple_transaction_registry (transaction_id) VALUES (?) "
            "ON CONFLICT(transaction_id) DO NOTHING",
            True,
        )
        self.assertIn("VALUES (%s)", translated_claim)
        self.assertIn("ON CONFLICT(transaction_id) DO NOTHING", translated_claim)

    def test_every_entrypoint_rejects_missing_signed_canonical_fields(self) -> None:
        required = (
            "transactionId", "originalTransactionId", "productId", "environment", "bundleId"
        )
        for family in ("membership", "wallet", "guide"):
            for field in required:
                with self.subTest(family=family, field=field):
                    payload = self._payload(family, self.user, f"missing-{family}-{field}")
                    payload.pop(field)
                    data = {
                        "signedTransaction": "controlled.signed.transaction",
                        "productId": self._sku(
                            {"membership": self.plan, "wallet": self.pack, "guide": self.guide}[family]
                        ),
                        "transactionId": f"client-{family}-{field}",
                        "originalTransactionId": f"client-orig-{family}-{field}",
                        "environment": "Production",
                        "bundleId": self.bundle_id,
                        "appAccountToken": self.user["id"],
                    }
                    self._call(
                        family, self.user, payload, data=data,
                        expected_error="apple_signed_field_missing",
                    )

    def test_client_copies_must_match_signed_canonical_values(self) -> None:
        signed = self._payload("wallet", self.user, "client-copy-mismatch")
        base = {
            "signedTransaction": "controlled.signed.transaction",
            "transactionId": signed["transactionId"],
            "originalTransactionId": signed["originalTransactionId"],
            "productId": signed["productId"],
            "environment": signed["environment"],
            "appAccountToken": signed["appAccountToken"],
            "bundleId": signed["bundleId"],
        }
        mismatches = {
            "transactionId": "different-transaction",
            "originalTransactionId": "different-original",
            "productId": self._sku(dict(self.conn.execute(
                "SELECT * FROM wallet_topup_products WHERE is_active=1 AND pack_key<>? "
                "ORDER BY sort_order LIMIT 1", (self.pack["pack_key"],)
            ).fetchone())),
            "environment": "Sandbox",
            "appAccountToken": str(uuid.uuid4()),
            "bundleId": "com.attacker.other-app",
        }
        for field, bad_value in mismatches.items():
            with self.subTest(field=field):
                data = dict(base)
                data[field] = bad_value
                self._call(
                    "wallet", self.user, signed, data=data,
                    expected_error="apple_signed_field_mismatch",
                )

    def test_revoked_signed_transaction_is_rejected_by_all_entrypoints(self) -> None:
        for family in ("membership", "wallet", "guide"):
            with self.subTest(family=family):
                payload = self._payload(family, self.user, "revoked-" + family)
                payload["revocationDate"] = int(datetime.now(timezone.utc).timestamp() * 1000)
                self._call(
                    family, self.user, payload,
                    expected_error="apple_transaction_revoked",
                )

    def test_membership_missing_or_expired_expiry_never_creates_paid_order(self) -> None:
        before = int(self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id=? AND status='paid'",
            (self.user["id"],),
        ).fetchone()["c"])
        missing = self._payload("membership", self.user, "membership-no-expiry")
        missing.pop("expiresDate")
        self._call(
            "membership", self.user, missing,
            expected_error="apple_subscription_expiry_invalid",
        )
        expired = self._payload("membership", self.user, "membership-expired")
        expired["expiresDate"] = int(
            (datetime.now(timezone.utc) - timedelta(seconds=1)).timestamp() * 1000
        )
        self._call(
            "membership", self.user, expired,
            expected_error="apple_subscription_expired",
        )
        after = int(self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id=? AND status='paid'",
            (self.user["id"],),
        ).fetchone()["c"])
        self.assertEqual(after, before)

    def test_non_refund_webhook_syncs_only_a_unique_active_membership_sku(self) -> None:
        payload = self._payload(
            "membership", self.user, "renew-membership-" + uuid.uuid4().hex
        )

        result = self._apple_webhook(payload, notification_type="DID_RENEW")

        self.assertTrue(result["processed"])
        self.assertTrue(result["membershipActive"])
        membership = dict(self.conn.execute(
            "SELECT * FROM user_memberships WHERE user_id=? ORDER BY updated_at DESC LIMIT 1",
            (self.user["id"],),
        ).fetchone())
        self.assertEqual(membership["plan_key"], self.plan["plan_key"])
        self.assertEqual(membership["provider_price_id"], payload["productId"])

    def test_non_refund_webhook_never_grants_wallet_guide_or_unknown_sku(self) -> None:
        cases = (
            ("wallet", self._sku(self.pack), "non_membership_product"),
            ("guide", self._sku(self.guide), "non_membership_product"),
            ("unknown", "com.machi.tests.unmapped", "product_unmapped"),
        )
        for label, product_id, expected_reason in cases:
            with self.subTest(label=label):
                txn_id = f"renew-{label}-" + uuid.uuid4().hex
                payload = {
                    "transactionId": txn_id,
                    "originalTransactionId": "orig-" + txn_id,
                    "productId": product_id,
                    "environment": "Production",
                    "bundleId": self.bundle_id,
                    "appAccountToken": self.user["id"],
                    "expiresDate": int(
                        (datetime.now(timezone.utc) + timedelta(days=30)).timestamp() * 1000
                    ),
                }
                event_id = "renew-event-" + uuid.uuid4().hex
                result = self._apple_webhook(
                    payload, notification_type="DID_RENEW", event_id=event_id
                )
                self.assertFalse(result["processed"])
                self.assertEqual(result["reason"], expected_reason)
                self.assertEqual(self.conn.execute(
                    "SELECT COUNT(*) AS c FROM user_memberships WHERE user_id=?",
                    (self.user["id"],),
                ).fetchone()["c"], 0)
                self.assertEqual(self.conn.execute(
                    "SELECT COUNT(*) AS c FROM payment_webhooks "
                    "WHERE provider='apple_iap' AND event_id=?",
                    (event_id,),
                ).fetchone()["c"], 1)

    def test_non_refund_ambiguous_sku_is_audited_without_grant_or_retry_error(self) -> None:
        wallet_sku = self._sku(self.pack)
        old_apple = str(self.guide.get("apple_product_id") or "")
        old_ios = str(self.guide.get("ios_iap_product_id") or "")
        event_id = "renew-ambiguous-event-" + uuid.uuid4().hex
        try:
            self.conn.execute(
                "UPDATE guide_products SET apple_product_id=?, ios_iap_product_id=? WHERE id=?",
                (wallet_sku, wallet_sku, self.guide["id"]),
            )
            payload = self._payload("wallet", self.user, "renew-ambiguous-" + uuid.uuid4().hex)
            payload["expiresDate"] = int(
                (datetime.now(timezone.utc) + timedelta(days=30)).timestamp() * 1000
            )
            result = self._apple_webhook(
                payload, notification_type="DID_RENEW", event_id=event_id
            )
        finally:
            self.conn.execute(
                "UPDATE guide_products SET apple_product_id=?, ios_iap_product_id=? WHERE id=?",
                (old_apple, old_ios, self.guide["id"]),
            )

        self.assertFalse(result["processed"])
        self.assertEqual(result["reason"], "product_ambiguous")
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM user_memberships WHERE user_id=?",
            (self.user["id"],),
        ).fetchone()["c"], 0)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks "
            "WHERE provider='apple_iap' AND event_id=?",
            (event_id,),
        ).fetchone()["c"], 1)

    def test_sku_mapped_to_two_purchase_families_fails_closed(self) -> None:
        wallet_sku = self._sku(self.pack)
        original = dict(self.guide)
        try:
            self.conn.execute(
                "UPDATE guide_products SET apple_product_id=?, ios_iap_product_id=? WHERE id=?",
                (wallet_sku, wallet_sku, original["id"]),
            )
            payload = self._payload("wallet", self.user, "ambiguous-family")
            self._call(
                "wallet", self.user, payload,
                expected_error="apple_product_family_ambiguous",
            )
        finally:
            self.conn.execute(
                "UPDATE guide_products SET apple_product_id=?, ios_iap_product_id=? WHERE id=?",
                (original.get("apple_product_id") or "", original.get("ios_iap_product_id") or "", original["id"]),
            )

    def test_duplicate_wallet_or_guide_resources_for_one_sku_fail_closed(self) -> None:
        cases = (
            ("wallet_topup_products", "id", self.pack, "is_active=1", "pack_key"),
            ("guide_products", "id", self.guide, "status='published'", "slug"),
        )
        for table, id_column, original, predicate, order_column in cases:
            with self.subTest(table=table):
                other = dict(self.conn.execute(
                    f"SELECT * FROM {table} WHERE {predicate} AND {id_column}<>? "
                    f"ORDER BY {order_column} LIMIT 1",
                    (original[id_column],),
                ).fetchone())
                old_apple = str(other.get("apple_product_id") or "")
                old_ios = str(other.get("ios_iap_product_id") or "")
                sku = self._sku(original)
                try:
                    self.conn.execute(
                        f"UPDATE {table} SET apple_product_id=?, ios_iap_product_id=? WHERE {id_column}=?",
                        (sku, sku, other[id_column]),
                    )
                    with self.assertRaises(server.APIError) as raised:
                        server._apple_product_family_mapping(self.conn, sku)
                    self.assertEqual(raised.exception.code, "apple_product_family_ambiguous")
                finally:
                    self.conn.execute(
                        f"UPDATE {table} SET apple_product_id=?, ios_iap_product_id=? WHERE {id_column}=?",
                        (old_apple, old_ios, other[id_column]),
                    )

    def test_same_user_same_transaction_replay_is_idempotent(self) -> None:
        payload = self._payload(
            "wallet", self.user, "sandbox-idempotent", environment="Sandbox", include_token=False
        )
        first = self._call("wallet", self.user, payload)
        first_balance = int(first["wallet"]["balancePoints"])
        second = self._call("wallet", self.user, payload)
        self.assertEqual(int(second["wallet"]["balancePoints"]), first_balance)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM apple_transaction_registry WHERE transaction_id=?",
            (payload["transactionId"],),
        ).fetchone()["c"], 1)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_topup_orders WHERE provider_trade_no=?",
            ("apple:" + payload["transactionId"],),
        ).fetchone()["c"], 1)

    def test_pre_registry_wallet_order_is_lazily_bound_on_same_user_replay(self) -> None:
        txn_id = "legacy-wallet-bind-" + uuid.uuid4().hex
        legacy = server.wallet_credit_iap_topup(
            self.conn,
            self.user["id"],
            self.pack,
            "apple_iap",
            "ios",
            "apple:" + txn_id,
            provider_product_id=self._sku(self.pack),
            provider_user_id="orig-" + txn_id,
        )
        self.assertTrue(legacy["applied"])
        before = int(legacy["wallet"]["balancePoints"])
        self.assertIsNone(self.conn.execute(
            "SELECT 1 FROM apple_transaction_registry WHERE transaction_id=?", (txn_id,)
        ).fetchone())

        payload = self._payload("wallet", self.user, txn_id)
        replay = self._call("wallet", self.user, payload)

        self.assertEqual(int(replay["wallet"]["balancePoints"]), before)
        bound = dict(self.conn.execute(
            "SELECT * FROM apple_transaction_registry WHERE transaction_id=?", (txn_id,)
        ).fetchone())
        self.assertEqual(bound["user_id"], self.user["id"])
        self.assertEqual(bound["purchase_family"], "wallet")
        self.assertEqual(bound["claim_status"], "fulfilled")

    def test_pre_registry_raw_wallet_trade_replays_via_grant_reference(self) -> None:
        txn_id = "legacy-raw-wallet-" + uuid.uuid4().hex
        legacy = server.wallet_credit_iap_topup(
            self.conn,
            self.user["id"],
            self.pack,
            "apple_iap",
            "ios",
            txn_id,
            provider_product_id=self._sku(self.pack),
            provider_user_id="orig-" + txn_id,
        )
        before = int(legacy["wallet"]["balancePoints"])
        replay = self._call("wallet", self.user, self._payload("wallet", self.user, txn_id))
        self.assertEqual(int(replay["wallet"]["balancePoints"]), before)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_topup_orders WHERE provider_trade_no=?",
            (txn_id,),
        ).fetchone()["c"], 1)

    def test_pre_registry_raw_guide_trade_replays_via_grant_reference(self) -> None:
        txn_id = "legacy-raw-guide-" + uuid.uuid4().hex
        legacy = server.guide_credit_iap_purchase(
            self.conn,
            self.user["id"],
            self.guide,
            provider_trade_no=txn_id,
            provider_product_id=self._sku(self.guide),
        )
        replay = self._call("guide", self.user, self._payload("guide", self.user, txn_id))
        self.assertEqual(replay["orderNo"], legacy["orderNo"])
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE provider_trade_no=?",
            (txn_id,),
        ).fetchone()["c"], 1)

    def test_pre_registry_order_cannot_be_redeemed_by_another_user(self) -> None:
        txn_id = "legacy-cross-user-" + uuid.uuid4().hex
        server.wallet_credit_iap_topup(
            self.conn,
            self.user["id"],
            self.pack,
            "apple_iap",
            "ios_sandbox",
            "apple:" + txn_id,
            provider_product_id=self._sku(self.pack),
            provider_user_id="orig-" + txn_id,
        )
        other = _make_user(self.conn)
        payload = self._payload(
            "wallet", other, txn_id, environment="Sandbox", include_token=False
        )

        self._call(
            "wallet", other, payload,
            expected_error="apple_transaction_conflict",
        )
        self.assertEqual(server.get_wallet_snapshot(self.conn, other["id"])["balancePoints"], 0)

    def test_pre_registry_order_cannot_move_to_another_family(self) -> None:
        txn_id = "legacy-cross-family-" + uuid.uuid4().hex
        server.wallet_credit_iap_topup(
            self.conn,
            self.user["id"],
            self.pack,
            "apple_iap",
            "ios",
            "apple:" + txn_id,
            provider_product_id=self._sku(self.pack),
            provider_user_id="orig-" + txn_id,
        )
        payload = self._payload("guide", self.user, txn_id)

        self._call(
            "guide", self.user, payload,
            expected_error="apple_transaction_conflict",
        )
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone()["c"], 0)

    def test_sandbox_first_claim_without_token_binds_transaction_to_one_user(self) -> None:
        payload = self._payload(
            "wallet", self.user, "sandbox-first-claim", environment="Xcode", include_token=False
        )
        self._call("wallet", self.user, payload)
        other = _make_user(self.conn)
        self._call(
            "wallet", other, payload,
            expected_error="apple_transaction_conflict",
        )
        self.assertEqual(server.get_wallet_snapshot(self.conn, other["id"])["balancePoints"], 0)

    def test_transaction_cannot_cross_purchase_families(self) -> None:
        txn_id = "cross-family-global-claim"
        wallet_payload = self._payload("wallet", self.user, txn_id)
        self._call("wallet", self.user, wallet_payload)
        guide_payload = self._payload("guide", self.user, txn_id)
        self._call(
            "guide", self.user, guide_payload,
            expected_error="apple_transaction_conflict",
        )
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone()["c"], 0)

    def test_failed_grant_rolls_back_registry_claim_and_money_writes(self) -> None:
        payload = self._payload("wallet", self.user, "rollback-global-claim")
        with patch.object(server, "verify_apple_transaction", return_value=dict(payload)), \
             patch.object(server, "wallet_credit_iap_topup", side_effect=RuntimeError("grant failed")):
            handler = server.Handler.__new__(server.Handler)
            handler.require_user = lambda _conn: self.user  # type: ignore[method-assign]
            handler.read_json = lambda: {  # type: ignore[method-assign]
                "signedTransaction": "controlled.signed.transaction",
                "productId": payload["productId"],
            }
            with self.assertRaisesRegex(RuntimeError, "grant failed"):
                handler.api_wallet_topup_apple_verify(self.conn)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM apple_transaction_registry WHERE transaction_id=?",
            (payload["transactionId"],),
        ).fetchone()["c"], 0)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_topup_orders WHERE provider_trade_no=?",
            ("apple:" + payload["transactionId"],),
        ).fetchone()["c"], 0)

    def test_registry_refund_routes_wallet_guide_and_membership_grants(self) -> None:
        cases = (
            ("wallet", "points_refunded", "wallet_topup_orders"),
            ("guide", "guide_entitlement_revoked", "guide_orders"),
            ("membership", "membership_refunded", "payment_orders"),
        )
        for family, expected_status, table in cases:
            with self.subTest(family=family):
                txn_id = f"refund-{family}-" + uuid.uuid4().hex
                payload = self._payload(family, self.user, txn_id)
                self._call(family, self.user, payload)
                result = self._refund_webhook(payload)
                self.assertEqual(result["status"], expected_status)
                registry = dict(self.conn.execute(
                    "SELECT * FROM apple_transaction_registry WHERE transaction_id=?",
                    (txn_id,),
                ).fetchone())
                status = self.conn.execute(
                    f"SELECT status FROM {table} WHERE order_no=?",
                    (registry["grant_reference"],),
                ).fetchone()
                self.assertIsNotNone(status)
                self.assertEqual(status["status"], "refunded")

    def test_legacy_raw_wallet_trade_is_found_and_refunded(self) -> None:
        txn_id = "legacy-raw-refund-" + uuid.uuid4().hex
        purchase = server.wallet_credit_iap_topup(
            self.conn,
            self.user["id"],
            self.pack,
            "apple_iap",
            "ios",
            txn_id,
            provider_product_id=self._sku(self.pack),
            provider_user_id="orig-" + txn_id,
        )
        self.assertGreater(int(purchase["wallet"]["balancePoints"]), 0)

        result = self._refund_webhook(self._payload("wallet", self.user, txn_id))

        self.assertEqual(result["status"], "points_refunded")
        order = self.conn.execute(
            "SELECT status FROM wallet_topup_orders WHERE provider_trade_no=?",
            (txn_id,),
        ).fetchone()
        self.assertEqual(order["status"], "refunded")
        self.assertEqual(
            server.get_wallet_snapshot(self.conn, self.user["id"])["balancePoints"],
            0,
        )

    def test_refund_clawback_and_webhook_dedup_rollback_together(self) -> None:
        txn_id = "refund-atomic-" + uuid.uuid4().hex
        event_id = "refund-event-" + uuid.uuid4().hex
        payload = self._payload("wallet", self.user, txn_id)
        self._call("wallet", self.user, payload)
        order_before = dict(self.conn.execute(
            "SELECT * FROM wallet_topup_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone())
        with patch.object(
                server, "wallet_refund_topup", side_effect=RuntimeError("forced clawback failure")):
            with self.assertRaisesRegex(RuntimeError, "forced clawback failure"):
                self._refund_webhook(payload, event_id=event_id)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks "
            "WHERE provider='apple_iap' AND event_id=?",
            (event_id,),
        ).fetchone()["c"], 0)
        order_after = dict(self.conn.execute(
            "SELECT * FROM wallet_topup_orders WHERE order_no=?",
            (order_before["order_no"],),
        ).fetchone())
        self.assertEqual(order_after["status"], order_before["status"])

    def test_refund_registry_identity_conflict_fails_without_dedup_record(self) -> None:
        txn_id = "refund-conflict-" + uuid.uuid4().hex
        event_id = "refund-conflict-event-" + uuid.uuid4().hex
        payload = self._payload("wallet", self.user, txn_id)
        self._call("wallet", self.user, payload)
        conflicting = dict(payload)
        conflicting["productId"] = self._sku(self.guide)

        self._refund_webhook(
            conflicting,
            event_id=event_id,
            expected_error="apple_transaction_conflict",
        )

        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks "
            "WHERE provider='apple_iap' AND event_id=?",
            (event_id,),
        ).fetchone()["c"], 0)
        order = self.conn.execute(
            "SELECT status FROM wallet_topup_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone()
        self.assertIn(order["status"], ("paid", "fulfilled"))

    def test_refund_before_client_verify_persists_tombstone_and_blocks_late_grant(self) -> None:
        txn_id = "refund-before-verify-" + uuid.uuid4().hex
        payload = self._payload("wallet", self.user, txn_id)

        first = self._refund_webhook(payload)
        second = self._refund_webhook(payload)

        self.assertEqual(first["status"], "refund_recorded")
        self.assertEqual(second["status"], "refund_already_recorded")
        registry = dict(self.conn.execute(
            "SELECT * FROM apple_transaction_registry WHERE transaction_id=?",
            (txn_id,),
        ).fetchone())
        self.assertEqual(registry["claim_status"], "revoked")
        self.assertEqual(registry["purchase_family"], "unknown")
        self._call(
            "wallet",
            self.user,
            payload,
            expected_error="apple_transaction_revoked",
        )
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM wallet_topup_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone()["c"], 0)

    def test_concurrent_guide_replay_claims_and_grants_in_one_transaction(self) -> None:
        txn_id = "concurrent-guide-" + uuid.uuid4().hex
        payload = self._payload("guide", self.user, txn_id)
        barrier = threading.Barrier(2)
        errors: list[BaseException] = []
        responses: list[dict] = []
        result_lock = threading.Lock()

        def buy() -> None:
            conn = server.db()
            try:
                user = dict(conn.execute("SELECT * FROM users WHERE id=?", (self.user["id"],)).fetchone())
                handler = server.Handler.__new__(server.Handler)
                captured: dict = {}
                handler.require_user = lambda _conn: user  # type: ignore[method-assign]
                handler.read_json = lambda: {  # type: ignore[method-assign]
                    "signedTransaction": "controlled.signed.transaction",
                    "productId": payload["productId"],
                }
                handler.send_json = lambda body, status=200: captured.update(  # type: ignore[method-assign]
                    body=body, status=status
                )
                barrier.wait(timeout=5)
                handler.api_apple_guide_verify(conn)
                with result_lock:
                    responses.append(captured)
            except BaseException as exc:
                with result_lock:
                    errors.append(exc)
            finally:
                conn.close()

        with patch.object(server, "verify_apple_transaction", return_value=dict(payload)), \
             patch.object(server, "guide_product_deliverable_ready", return_value=True):
            threads = [threading.Thread(target=buy) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=10)

        self.assertFalse(any(thread.is_alive() for thread in threads), "concurrent purchase deadlocked")
        self.assertFalse(errors, errors)
        self.assertEqual(len(responses), 2)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM apple_transaction_registry WHERE transaction_id=?",
            (txn_id,),
        ).fetchone()["c"], 1)
        self.assertEqual(self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_orders WHERE provider_trade_no=?",
            ("apple:" + txn_id,),
        ).fetchone()["c"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
