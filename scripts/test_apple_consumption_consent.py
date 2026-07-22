#!/usr/bin/env python3
"""Apple CONSUMPTION_REQUEST consent + v2 contract tests.

No test in this file makes a real network call.  It exercises the real fresh
SQLite schema, consent event store, settings handlers, webhook handler, wallet
ledger evidence, and outbound request construction with urlopen replaced.

Run:  cd web && python3 scripts/test_apple_consumption_consent.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

_TMP_DB = tempfile.mkstemp(prefix="machi_apple_consumption_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn: sqlite3.Connection) -> str:
    user_id = str(uuid.uuid4())
    handle = "consent_" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
        (user_id, handle, handle, f"{handle}@example.com", now, now, now),
    )
    return user_id


def _make_user_with_id(conn: sqlite3.Connection, user_id: str) -> str:
    handle = "consent_" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
        (user_id, handle, handle, f"{handle}@example.com", now, now, now),
    )
    return user_id


def _response() -> MagicMock:
    response = MagicMock()
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    response.read.return_value = b""
    return response


class AppleConsumptionConsentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        self.user_id = _make_user(self.conn)

    def tearDown(self) -> None:
        self.conn.close()

    def _transaction(self, tx_id: str, *, environment: str = "Production") -> dict:
        return {
            "transactionId": tx_id,
            "originalTransactionId": tx_id,
            "appAccountToken": self.user_id,
            "environment": environment,
            "productId": "machi_points_600",
        }

    def _credit_topup(self, tx_id: str) -> dict:
        pack = server.get_topup_product_by_apple(self.conn, "machi_points_600")
        self.assertIsNotNone(pack)
        result = server.wallet_credit_iap_topup(
            self.conn,
            self.user_id,
            pack,
            "apple_iap",
            "ios",
            "apple:" + tx_id,
            provider_product_id="machi_points_600",
            provider_user_id=tx_id,
        )
        self.assertTrue(result["applied"])
        return dict(
            self.conn.execute(
                "SELECT * FROM wallet_topup_orders WHERE payment_provider='apple_iap' "
                "AND provider_trade_no=?",
                ("apple:" + tx_id,),
            ).fetchone()
        )

    def _record_consent(self, granted: bool, *, policy_version: str | None = None,
                        locale: str = "zh-Hans", source: str = "test") -> dict:
        return server.record_apple_consumption_consent_event(
            self.conn,
            self.user_id,
            granted=granted,
            policy_version=policy_version or server.APPLE_CONSUMPTION_CONSENT_POLICY_VERSION,
            locale=locale,
            source=source,
        )

    def _settings_handler(self, payload: dict | None = None):
        handler = server.Handler.__new__(server.Handler)
        user = dict(self.conn.execute("SELECT * FROM users WHERE id=?", (self.user_id,)).fetchone())
        captured: dict = {}
        handler.require_user = lambda conn: user  # type: ignore[method-assign]
        handler.read_json = lambda: payload or {}  # type: ignore[method-assign]
        handler.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
        handler._captured = captured  # type: ignore[attr-defined]
        return handler

    def _webhook_handler(self, signed_payload: str = "signed-notification"):
        handler = server.Handler.__new__(server.Handler)
        captured: dict = {}
        handler.read_json = lambda: {"signedPayload": signed_payload}  # type: ignore[method-assign]
        handler.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
        handler._captured = captured  # type: ignore[attr-defined]
        return handler

    def _consumption_webhook(
            self, tx_id: str, event_id: str, *, configured: bool = True,
            token: str | None = "jwt", network: MagicMock | None = None):
        notification = {
            "notificationType": "CONSUMPTION_REQUEST",
            "notificationUUID": event_id,
            "data": {
                "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
                "environment": "Production",
                "signedTransactionInfo": "signed-transaction",
            },
        }
        transaction = self._transaction(tx_id)
        handler = self._webhook_handler()
        network = network or MagicMock(return_value=_response())
        with patch.object(server, "decode_apple_jws_payload", return_value=(notification, True)), \
             patch.object(server, "verify_apple_transaction", return_value=transaction), \
             patch.object(server, "appstore_server_api_configured", return_value=configured), \
             patch.object(server, "_appstore_server_api_token", return_value=token), \
             patch.object(server.urllib.request, "urlopen", network):
            handler.api_payment_webhook_apple(self.conn)
        return handler, network

    def _send_with_capture(self, transaction: dict):
        network = MagicMock(return_value=_response())
        with patch.object(server, "appstore_server_api_configured", return_value=True) as configured, \
             patch.object(server, "_appstore_server_api_token", return_value="jwt") as token, \
             patch.object(server.urllib.request, "urlopen", network):
            with self.assertLogs(server.ACCESS_LOG, level="INFO") as logs:
                status = server.apple_send_consumption_info(self.conn, transaction, self.user_id)
        return status, configured, token, network, "\n".join(logs.output)

    # Consent is the first gate: no config inspection, token minting, or network.
    def test_default_without_consent_is_fail_closed_before_config_token_and_network(self) -> None:
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            status = server.apple_send_consumption_info(
                self.conn, self._transaction("tx-no-consent"), self.user_id
            )
        self.assertEqual(status, "consent_missing")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

    def test_unresolved_user_never_checks_config_mints_token_or_calls_network(self) -> None:
        transaction = self._transaction("tx-no-user")
        transaction.pop("appAccountToken")
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            status = server.apple_send_consumption_info(
                self.conn, transaction, None
            )
        self.assertEqual(status, "unresolved_user")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

    def test_legacy_wallet_topup_without_app_account_token_resolves_owner(self) -> None:
        tx_id = "tx-legacy-wallet-owner"
        self._credit_topup(tx_id)
        transaction = self._transaction(tx_id)
        transaction.pop("appAccountToken")

        handler = self._webhook_handler()
        self.assertEqual(
            handler._apple_notification_user_id(self.conn, transaction),
            self.user_id,
        )

    def test_legacy_guide_order_without_app_account_token_resolves_owner(self) -> None:
        tx_id = "tx-legacy-guide-owner"
        now = server.now_iso()
        self.conn.execute(
            "INSERT INTO guide_orders "
            "(id, user_id, product_id, order_no, price, currency, status, payment_provider, "
            "payment_method, provider_trade_no, created_at, paid_at, fulfilled_at) "
            "VALUES (?, ?, ?, ?, 100, 'JPY', 'fulfilled', 'apple_iap', 'apple_iap', ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                self.user_id,
                "legacy-guide-product",
                "GA" + uuid.uuid4().hex[:12],
                "apple:" + tx_id,
                now,
                now,
                now,
            ),
        )
        transaction = self._transaction(tx_id)
        transaction.pop("appAccountToken")

        handler = self._webhook_handler()
        self.assertEqual(
            handler._apple_notification_user_id(self.conn, transaction),
            self.user_id,
        )

    def test_explicit_current_consent_sends_only_v2_schema_to_production(self) -> None:
        tx_id = "tx-prod-v2"
        self._credit_topup(tx_id)
        self._record_consent(True)

        status, configured, token, network, logs = self._send_with_capture(self._transaction(tx_id))

        self.assertEqual(status, "submitted")
        configured.assert_called_once_with()
        token.assert_called_once_with()
        network.assert_called_once()
        request = network.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://api.storekit.apple.com/inApps/v2/transactions/consumption/tx-prod-v2",
        )
        self.assertEqual(request.get_method(), "PUT")
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            {
                "customerConsented": True,
                "deliveryStatus": "DELIVERED",
                "sampleContentProvided": False,
                "consumptionPercentage": 0,
                "refundPreference": "GRANT_FULL",
            },
        )
        self.assertNotIn(tx_id, logs, "transaction details must not leak to application logs")

    def test_sandbox_uses_storekit_sandbox_v2_url(self) -> None:
        tx_id = "tx-sandbox-v2"
        self._credit_topup(tx_id)
        self._record_consent(True)

        status, _, _, network, _ = self._send_with_capture(
            self._transaction(tx_id, environment="Sandbox")
        )

        self.assertEqual(status, "submitted")
        request = network.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://api.storekit-sandbox.apple.com/inApps/v2/transactions/consumption/tx-sandbox-v2",
        )

    def test_withdrawal_immediately_blocks_all_outbound_work(self) -> None:
        self._record_consent(True)
        self._record_consent(False)
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            status = server.apple_send_consumption_info(
                self.conn, self._transaction("tx-withdrawn"), self.user_id
            )
        self.assertEqual(status, "consent_withdrawn")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

    def test_old_policy_grant_is_not_current_consent(self) -> None:
        self._record_consent(True, policy_version="2025-legacy")
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            status = server.apple_send_consumption_info(
                self.conn, self._transaction("tx-old-policy"), self.user_id
            )
        self.assertEqual(status, "consent_version_mismatch")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

    def test_settings_rejects_non_boolean_missing_and_wrong_policy_without_partial_update(self) -> None:
        bootstrap = self._settings_handler()
        bootstrap.api_get_settings(self.conn)
        for invalid in ("true", 1, 0, None, [], {}):
            with self.subTest(invalid=invalid):
                handler = self._settings_handler({
                    "appearance": "dark",
                    "apple_consumption_consent": invalid,
                    "apple_consumption_consent_policy_version": server.APPLE_CONSUMPTION_CONSENT_POLICY_VERSION,
                })
                with self.assertRaises(server.APIError) as raised:
                    handler.api_update_settings(self.conn)
                self.assertEqual(raised.exception.code, "invalid_apple_consumption_consent")
                appearance = self.conn.execute(
                    "SELECT appearance FROM settings WHERE user_id=?", (self.user_id,)
                ).fetchone()["appearance"]
                self.assertEqual(appearance, "light")

        for payload, code in (
            ({"apple_consumption_consent": True}, "apple_consumption_policy_version_required"),
            ({
                "apple_consumption_consent": True,
                "apple_consumption_consent_policy_version": "old-version",
            }, "apple_consumption_policy_version_mismatch"),
        ):
            with self.subTest(code=code):
                handler = self._settings_handler(payload)
                with self.assertRaises(server.APIError) as raised:
                    handler.api_update_settings(self.conn)
                self.assertEqual(raised.exception.code, code)

        count = self.conn.execute(
            "SELECT COUNT(*) AS c FROM user_privacy_consent_events WHERE user_id=?",
            (self.user_id,),
        ).fetchone()["c"]
        self.assertEqual(count, 0)

    def test_settings_post_grants_exact_version_get_exposes_state_and_false_withdraws(self) -> None:
        grant = self._settings_handler({
            "language": "ja",
            "apple_consumption_consent": True,
            "apple_consumption_consent_policy_version": server.APPLE_CONSUMPTION_CONSENT_POLICY_VERSION,
        })
        grant._route(self.conn, "POST", "/api/settings", {})
        payload = grant._captured["data"]["settings"]
        self.assertTrue(payload["apple_consumption_consent"])
        self.assertEqual(
            payload["apple_consumption_consent_policy_version"],
            server.APPLE_CONSUMPTION_CONSENT_POLICY_VERSION,
        )
        self.assertTrue(payload["apple_consumption_consented_at"])
        first = dict(self.conn.execute(
            "SELECT * FROM user_privacy_consent_events WHERE user_id=?", (self.user_id,)
        ).fetchone())
        self.assertEqual(first["decision"], "granted")
        self.assertEqual(first["locale"], "ja")
        self.assertEqual(first["source"], "settings_api")

        withdraw = self._settings_handler({"apple_consumption_consent": False})
        withdraw.api_update_settings(self.conn)
        withdrawn = withdraw._captured["data"]["settings"]
        self.assertFalse(withdrawn["apple_consumption_consent"])
        self.assertEqual(withdrawn["apple_consumption_consented_at"], "")
        rows = self.conn.execute(
            "SELECT decision FROM user_privacy_consent_events WHERE user_id=? ORDER BY created_at, id",
            (self.user_id,),
        ).fetchall()
        self.assertEqual([row["decision"] for row in rows], ["granted", "withdrawn"])

    def test_consent_events_are_append_only_and_database_immutable(self) -> None:
        self._record_consent(True, locale="zh-Hans", source="settings_api")
        self._record_consent(False, locale="zh-Hans", source="settings_api")
        rows = self.conn.execute(
            "SELECT * FROM user_privacy_consent_events WHERE user_id=? ORDER BY created_at, id",
            (self.user_id,),
        ).fetchall()
        self.assertEqual(len(rows), 2)
        self.assertEqual([row["decision"] for row in rows], ["granted", "withdrawn"])
        with self.assertRaises(sqlite3.DatabaseError):
            self.conn.execute(
                "UPDATE user_privacy_consent_events SET decision='granted' WHERE id=?",
                (rows[-1]["id"],),
            )
        with self.assertRaises(sqlite3.DatabaseError):
            self.conn.execute(
                "DELETE FROM user_privacy_consent_events WHERE id=?", (rows[0]["id"],)
            )

    def test_fresh_sqlite_and_both_backend_migrations_cover_immutable_events(self) -> None:
        columns = {
            row["name"] for row in self.conn.execute("PRAGMA table_info(user_privacy_consent_events)")
        }
        self.assertTrue(
            {"id", "user_id", "purpose", "policy_version", "decision", "locale", "source", "created_at"}
            <= columns
        )
        matching = [
            (version, note, sql)
            for version, note, sql in server.MIGRATIONS
            if "privacy consent" in note.lower()
        ]
        self.assertTrue(matching)
        self.assertGreater(min(version for version, _, _ in matching), 121)
        migration_sql = "\n".join(sql.lower() for _, _, sql in matching)
        self.assertIn("-- backend: sqlite", migration_sql)
        self.assertIn("-- backend: postgres", migration_sql)
        self.assertIn("before update", migration_sql)
        self.assertIn("before delete", migration_sql)

    def test_fresh_schema_and_migration_128_cover_durable_delivery_audit(self) -> None:
        outbox_columns = {
            row["name"] for row in self.conn.execute("PRAGMA table_info(apple_consumption_outbox)")
        }
        self.assertTrue({
            "event_id", "transaction_json", "status", "attempt_count",
            "next_attempt_at", "deadline_at", "last_status",
        } <= outbox_columns)
        attempt_columns = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(apple_consumption_delivery_attempts)")
        }
        self.assertTrue({
            "outbox_id", "attempt_no", "outcome", "http_status",
            "retry_after_seconds", "consent_event_id",
        } <= attempt_columns)
        migration = [entry for entry in server.MIGRATIONS if entry[0] == 128]
        self.assertEqual(len(migration), 1)
        migration_sql = migration[0][2].lower()
        self.assertIn("apple_consumption_outbox", migration_sql)
        self.assertIn("apple_consumption_delivery_attempts", migration_sql)

    def test_commingled_balance_never_overstates_consumption_or_refund_preference(self) -> None:
        server.wallet_post_ledger(self.conn, self.user_id, "admin_adjustment", 1000)
        tx_id = "tx-ambiguous"
        self._credit_topup(tx_id)
        server.wallet_post_ledger(self.conn, self.user_id, "spend", -800)
        self._record_consent(True)

        status, _, _, network, _ = self._send_with_capture(self._transaction(tx_id))

        self.assertEqual(status, "submitted")
        body = json.loads(network.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["consumptionPercentage"], 0)
        self.assertNotIn("refundPreference", body)

    def test_zero_balance_is_clear_full_consumption_and_decline_preference(self) -> None:
        tx_id = "tx-fully-consumed"
        order = self._credit_topup(tx_id)
        server.wallet_post_ledger(self.conn, self.user_id, "spend", -int(order["total_points"]))
        self._record_consent(True)

        status, _, _, network, _ = self._send_with_capture(self._transaction(tx_id))

        self.assertEqual(status, "submitted")
        body = json.loads(network.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["consumptionPercentage"], 100000)
        self.assertEqual(body["refundPreference"], "DECLINE")

    def test_target_transaction_attribution_ignores_another_orders_chargeback(self) -> None:
        old = self._credit_topup("tx-old-chargeback")
        granted = int(old["total_points"])
        server.wallet_post_ledger(
            self.conn,
            self.user_id,
            "spend",
            -granted,
            source_type="wallet_purchase",
            source_order_id="old-order-usage",
        )
        target = self._credit_topup("tx-target-never-spent")

        # A late chargeback for the OLD order claws its debt from the current
        # fungible balance.  That must not be misreported as consumption of the
        # untouched target App Store transaction.
        server.wallet_refund_topup(
            self.conn,
            old["order_no"],
            reason="late chargeback",
        )
        payload = server._apple_consumption_v2_payload(
            self.conn, self.user_id, target
        )

        self.assertIsNotNone(payload)
        self.assertEqual(payload["consumptionPercentage"], 0)
        self.assertNotEqual(payload.get("refundPreference"), "DECLINE")

    def test_guide_iap_uses_delivery_evidence_without_inventing_consumption(self) -> None:
        tx_id = "tx-guide-consumption"
        product_row = self.conn.execute(
            "SELECT * FROM guide_products WHERE status='published' "
            "AND COALESCE(is_service, 0)=0 LIMIT 1"
        ).fetchone()
        self.assertIsNotNone(product_row)
        product = dict(product_row)
        server.guide_credit_iap_purchase(
            self.conn,
            self.user_id,
            product,
            provider_trade_no="apple:" + tx_id,
        )
        self._record_consent(True)
        transaction = self._transaction(tx_id)
        transaction["productId"] = str(
            product.get("apple_product_id")
            or product.get("ios_iap_product_id")
            or "legacy-guide-product"
        )
        network = MagicMock(return_value=_response())

        with patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", network):
            result = server._apple_consumption_delivery_result(
                self.conn, transaction, self.user_id
            )

        self.assertEqual(result["status"], "submitted")
        body = json.loads(network.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["deliveryStatus"], "DELIVERED")
        self.assertNotIn("consumptionPercentage", body)
        self.assertNotIn("refundPreference", body)

    def test_subscription_iap_omits_consumption_percentage(self) -> None:
        tx_id = "tx-subscription-consumption"
        plan_row = self.conn.execute(
            "SELECT * FROM membership_plans WHERE is_active=1 "
            "AND (apple_product_id<>'' OR ios_iap_product_id<>'') LIMIT 1"
        ).fetchone()
        self.assertIsNotNone(plan_row)
        plan = dict(plan_row)
        order = server.create_payment_order(
            self.conn, self.user_id, plan["plan_key"], "apple_iap", "ios"
        )
        server.mark_order_paid(
            self.conn,
            order["order_no"],
            provider_trade_no="apple:" + tx_id,
            provider_user_id=tx_id,
            expected_provider="apple_iap",
            provider_subscription_id=tx_id,
            provider_price_id=str(
                plan.get("apple_product_id") or plan.get("ios_iap_product_id") or ""
            ),
            notify_email=False,
        )
        self._record_consent(True)
        transaction = self._transaction(tx_id)
        transaction["productId"] = str(
            plan.get("apple_product_id") or plan.get("ios_iap_product_id") or ""
        )
        network = MagicMock(return_value=_response())

        with patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", network):
            result = server._apple_consumption_delivery_result(
                self.conn, transaction, self.user_id
            )

        self.assertEqual(result["status"], "submitted")
        body = json.loads(network.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["deliveryStatus"], "DELIVERED")
        self.assertNotIn("consumptionPercentage", body)
        self.assertNotIn("refundPreference", body)

    def test_webhook_without_consent_is_2xx_audited_and_never_calls_out(self) -> None:
        tx_id = "tx-webhook-no-consent"
        notification = {
            "notificationType": "CONSUMPTION_REQUEST",
            "notificationUUID": "event-webhook-no-consent",
            "data": {
                "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
                "environment": "Production",
                "signedTransactionInfo": "signed-transaction",
            },
        }
        transaction = self._transaction(tx_id)
        handler = self._webhook_handler()
        with patch.object(server, "decode_apple_jws_payload", return_value=(notification, True)), \
             patch.object(server, "verify_apple_transaction", return_value=transaction), \
             patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            handler.api_payment_webhook_apple(self.conn)
        self.assertEqual(handler._captured["status"], 200)
        self.assertEqual(handler._captured["data"]["consumption"], "consent_missing")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()
        audit = self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks WHERE provider='apple_iap' AND event_id=?",
            ("event-webhook-no-consent",),
        ).fetchone()["c"]
        self.assertEqual(audit, 1)

    def test_config_token_http_500_and_429_are_retried_with_retry_after(self) -> None:
        cases = (
            ("unconfigured", False, "jwt", MagicMock(return_value=_response()), 0),
            ("token_failed", True, None, MagicMock(return_value=_response()), 0),
            (
                "http_500",
                True,
                "jwt",
                MagicMock(side_effect=HTTPError("https://apple", 500, "server", {}, None)),
                0,
            ),
            (
                "http_429",
                True,
                "jwt",
                MagicMock(side_effect=HTTPError(
                    "https://apple", 429, "rate limit", {"Retry-After": "600"}, None
                )),
                600,
            ),
        )
        for index, (outcome, configured, token, network, retry_after) in enumerate(cases):
            with self.subTest(outcome=outcome):
                tx_id = f"tx-transient-{index}"
                event_id = f"event-transient-{index}"
                self._credit_topup(tx_id)
                self._record_consent(True)
                handler, _ = self._consumption_webhook(
                    tx_id,
                    event_id,
                    configured=configured,
                    token=token,
                    network=network,
                )
                self.assertEqual(handler._captured["status"], 200)
                self.assertEqual(handler._captured["data"]["consumption"], "queued_retry")
                job = dict(self.conn.execute(
                    "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
                ).fetchone())
                self.assertEqual(job["status"], "pending")
                self.assertEqual(job["last_status"], outcome)
                self.assertEqual(job["last_retry_after_seconds"], retry_after)
                if retry_after:
                    scheduled = server.parse_iso(job["next_attempt_at"])
                    attempted = server.parse_iso(job["updated_at"])
                    self.assertIsNotNone(scheduled)
                    self.assertIsNotNone(attempted)
                    self.assertGreaterEqual((scheduled - attempted).total_seconds(), retry_after)

    def test_retry_after_beyond_twelve_hour_deadline_expires_without_early_retry(self) -> None:
        tx_id = "tx-retry-after-deadline"
        event_id = "event-retry-after-deadline"
        self._credit_topup(tx_id)
        self._record_consent(True)
        network = MagicMock(side_effect=HTTPError(
            "https://apple", 429, "rate limit", {"Retry-After": "50000"}, None
        ))

        handler, _ = self._consumption_webhook(tx_id, event_id, network=network)

        self.assertEqual(handler._captured["data"]["consumption"], "http_429")
        job = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone())
        self.assertEqual(job["status"], "expired")
        self.assertEqual(job["next_attempt_at"], job["deadline_at"])
        with patch.object(server.urllib.request, "urlopen") as retry_network:
            counts = server.process_apple_consumption_outbox(
                self.conn, now=job["deadline_at"]
            )
        self.assertEqual(counts["processed"], 0)
        retry_network.assert_not_called()

    def test_withdrawal_immediately_cancels_pending_delivery_and_retry_rechecks(self) -> None:
        tx_id = "tx-withdraw-pending"
        event_id = "event-withdraw-pending"
        self._credit_topup(tx_id)
        self._record_consent(True)
        handler, _ = self._consumption_webhook(
            tx_id,
            event_id,
            network=MagicMock(side_effect=URLError("offline")),
        )
        self.assertEqual(handler._captured["data"]["consumption"], "queued_retry")
        pending = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone())
        self.assertEqual(pending["status"], "pending")

        self._record_consent(False)

        cancelled = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE id=?", (pending["id"],)
        ).fetchone())
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(cancelled["last_status"], "consent_withdrawn")
        self.assertTrue(cancelled["cancelled_at"])
        with patch.object(server.urllib.request, "urlopen") as network:
            counts = server.process_apple_consumption_outbox(
                self.conn, now=pending["next_attempt_at"]
            )
        self.assertEqual(counts["processed"], 0)
        network.assert_not_called()

        # Simulate a stale lease/database restore that left the job pending:
        # the worker itself must still re-read the latest consent before I/O.
        self.conn.execute(
            "UPDATE apple_consumption_outbox SET status='pending', next_attempt_at=? WHERE id=?",
            (server.now_iso(), pending["id"]),
        )
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as retry_network:
            retry_counts = server.process_apple_consumption_outbox(self.conn)
        self.assertEqual(retry_counts["cancelled"], 1)
        configured.assert_not_called()
        token.assert_not_called()
        retry_network.assert_not_called()

    def test_account_deletion_records_withdrawal_and_cancels_pending_delivery(self) -> None:
        tx_id = "tx-delete-withdrawal"
        event_id = "event-delete-withdrawal"
        self._credit_topup(tx_id)
        self._record_consent(True)
        self._consumption_webhook(
            tx_id,
            event_id,
            network=MagicMock(side_effect=URLError("offline")),
        )
        pending = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone())
        self.assertEqual(pending["status"], "pending")

        server.anonymize_user_account(self.conn, self.user_id)

        latest = self.conn.execute(
            "SELECT decision FROM user_privacy_consent_events "
            "WHERE user_id=? AND purpose=? ORDER BY created_at DESC, id DESC LIMIT 1",
            (self.user_id, server.APPLE_CONSUMPTION_CONSENT_PURPOSE),
        ).fetchone()
        job = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE id=?", (pending["id"],)
        ).fetchone())
        self.assertEqual(latest["decision"], "withdrawn")
        self.assertEqual(job["status"], "cancelled")
        self.assertEqual(job["last_status"], "consent_withdrawn")
        self.assertFalse(
            server.apple_consumption_consent_state(self.conn, self.user_id)["granted"]
        )

    def test_unresolved_user_and_order_recover_within_response_window(self) -> None:
        future_user_id = str(uuid.uuid4())
        tx_id = "tx-late-owner-and-order"
        event_id = "event-late-owner-and-order"
        notification = {
            "notificationType": "CONSUMPTION_REQUEST",
            "notificationUUID": event_id,
            "data": {
                "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
                "environment": "Production",
                "signedTransactionInfo": "signed-transaction",
            },
        }
        transaction = self._transaction(tx_id)
        transaction["appAccountToken"] = future_user_id
        handler = self._webhook_handler()
        with patch.object(server, "decode_apple_jws_payload", return_value=(notification, True)), \
             patch.object(server, "verify_apple_transaction", return_value=transaction), \
             patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            handler.api_payment_webhook_apple(self.conn)

        job = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone())
        self.assertEqual(job["status"], "pending")
        self.assertEqual(job["last_status"], "unresolved_user")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

        _make_user_with_id(self.conn, future_user_id)
        pack = server.get_topup_product_by_apple(self.conn, "machi_points_600")
        self.assertIsNotNone(pack)
        server.wallet_credit_iap_topup(
            self.conn,
            future_user_id,
            pack,
            "apple_iap",
            "ios",
            "apple:" + tx_id,
            provider_product_id="machi_points_600",
            provider_user_id=tx_id,
        )
        server.record_apple_consumption_consent_event(
            self.conn,
            future_user_id,
            granted=True,
            policy_version=server.APPLE_CONSUMPTION_CONSENT_POLICY_VERSION,
            locale="en",
            source="test",
        )
        with patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", return_value=_response()) as retry_network:
            final = server.process_apple_consumption_outbox_job(
                self.conn, job["id"], now=job["next_attempt_at"]
            )
        self.assertEqual(final, "submitted")
        retry_network.assert_called_once()

    def test_concurrent_duplicate_webhook_audit_is_a_clean_true_false_result(self) -> None:
        event_id = "event-concurrent-" + uuid.uuid4().hex
        barrier = threading.Barrier(2)

        class BarrierCursor:
            def __init__(self, cursor):
                self._cursor = cursor

            def fetchone(self):
                row = self._cursor.fetchone()
                barrier.wait(timeout=5)
                return row

        class RaceConnection:
            def __init__(self, connection):
                self._connection = connection

            def execute(self, sql, params=None):
                cursor = self._connection.execute(sql, params or ())
                if sql.lstrip().upper().startswith("SELECT 1 FROM PAYMENT_WEBHOOKS"):
                    return BarrierCursor(cursor)
                return cursor

        results: list[bool] = []
        errors: list[BaseException] = []
        result_lock = threading.Lock()

        def insert_once() -> None:
            connection = server.db()
            try:
                result = server.record_payment_webhook(
                    RaceConnection(connection),
                    "apple_iap",
                    "CONSUMPTION_REQUEST",
                    event_id,
                    "",
                    "{}",
                    True,
                )
                with result_lock:
                    results.append(result)
            except BaseException as exc:
                with result_lock:
                    errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=insert_once) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)

        self.assertFalse(errors)
        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM payment_webhooks "
                "WHERE provider='apple_iap' AND event_id=?",
                (event_id,),
            ).fetchone()["c"],
            1,
        )

    def test_success_and_duplicate_webhook_send_exactly_once(self) -> None:
        tx_id = "tx-success-idempotent"
        event_id = "event-success-idempotent"
        self._credit_topup(tx_id)
        self._record_consent(True)

        first, first_network = self._consumption_webhook(tx_id, event_id)
        self.assertEqual(first._captured["data"]["consumption"], "submitted")
        first_network.assert_called_once()

        duplicate_network = MagicMock(return_value=_response())
        duplicate, _ = self._consumption_webhook(
            tx_id, event_id, network=duplicate_network
        )
        self.assertEqual(duplicate._captured["status"], 200)
        self.assertTrue(duplicate._captured["data"]["duplicate"])
        duplicate_network.assert_not_called()
        job = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone())
        self.assertEqual(job["status"], "submitted")
        self.assertEqual(job["attempt_count"], 1)
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM apple_consumption_outbox WHERE event_id=?",
                (event_id,),
            ).fetchone()["c"],
            1,
        )

    def test_outbox_insert_failure_rolls_back_webhook_dedup_for_apple_retry(self) -> None:
        tx_id = "tx-outbox-atomic-failure"
        event_id = "event-outbox-atomic-failure"
        self._credit_topup(tx_id)
        self._record_consent(True)
        self.conn.execute(
            "CREATE TRIGGER fail_apple_outbox BEFORE INSERT ON apple_consumption_outbox "
            "BEGIN SELECT RAISE(ABORT, 'forced outbox failure'); END"
        )
        try:
            with self.assertRaises(sqlite3.DatabaseError):
                self._consumption_webhook(tx_id, event_id)
        finally:
            self.conn.execute("DROP TRIGGER fail_apple_outbox")
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM payment_webhooks "
                "WHERE provider='apple_iap' AND event_id=?",
                (event_id,),
            ).fetchone()["c"],
            0,
        )
        self.assertEqual(
            self.conn.execute(
                "SELECT COUNT(*) AS c FROM apple_consumption_outbox WHERE event_id=?",
                (event_id,),
            ).fetchone()["c"],
            0,
        )

    def test_network_failure_is_durably_retried_after_webhook_dedup(self) -> None:
        tx_id = "tx-webhook-network-failure"
        self._credit_topup(tx_id)
        self._record_consent(True)
        notification = {
            "notificationType": "CONSUMPTION_REQUEST",
            "notificationUUID": "event-webhook-network-failure",
            "data": {
                "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
                "environment": "Production",
                "signedTransactionInfo": "signed-transaction",
            },
        }
        transaction = self._transaction(tx_id)
        handler = self._webhook_handler()
        with patch.object(server, "decode_apple_jws_payload", return_value=(notification, True)), \
             patch.object(server, "verify_apple_transaction", return_value=transaction), \
             patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", side_effect=URLError("offline")):
            handler.api_payment_webhook_apple(self.conn)
        self.assertEqual(handler._captured["status"], 200)
        self.assertEqual(handler._captured["data"]["consumption"], "queued_retry")
        audit = self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks WHERE provider='apple_iap' AND event_id=?",
            ("event-webhook-network-failure",),
        ).fetchone()["c"]
        self.assertEqual(audit, 1)
        outbox = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE event_id=?",
            ("event-webhook-network-failure",),
        ).fetchone())
        self.assertEqual(outbox["status"], "pending")
        self.assertEqual(outbox["attempt_count"], 1)
        self.assertEqual(outbox["last_status"], "error")
        self.assertLess(outbox["next_attempt_at"], outbox["deadline_at"])

        with patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", return_value=_response()) as network:
            final = server.process_apple_consumption_outbox_job(
                self.conn,
                outbox["id"],
                now=outbox["next_attempt_at"],
            )
        self.assertEqual(final, "submitted")
        network.assert_called_once()
        delivered = dict(self.conn.execute(
            "SELECT * FROM apple_consumption_outbox WHERE id=?", (outbox["id"],)
        ).fetchone())
        self.assertEqual(delivered["status"], "submitted")
        self.assertEqual(delivered["attempt_count"], 2)
        attempts = self.conn.execute(
            "SELECT outcome FROM apple_consumption_delivery_attempts "
            "WHERE outbox_id=? ORDER BY attempt_no",
            (outbox["id"],),
        ).fetchall()
        self.assertEqual([row["outcome"] for row in attempts], ["error", "submitted"])

    def test_scheduler_pass_retries_due_jobs_without_a_new_webhook(self) -> None:
        tx_id = "tx-scheduler-retry"
        event_id = "event-scheduler-retry"
        self._credit_topup(tx_id)
        self._record_consent(True)
        self._consumption_webhook(
            tx_id,
            event_id,
            network=MagicMock(side_effect=URLError("offline")),
        )
        self.conn.execute(
            "UPDATE apple_consumption_outbox SET next_attempt_at=? WHERE event_id=?",
            (server.now_iso(), event_id),
        )
        worker_pass = getattr(server, "run_apple_consumption_outbox_pass", None)
        self.assertTrue(callable(worker_pass), "the durable outbox needs an automatic worker entrypoint")

        with patch.object(server, "appstore_server_api_configured", return_value=True), \
             patch.object(server, "_appstore_server_api_token", return_value="jwt"), \
             patch.object(server.urllib.request, "urlopen", return_value=_response()) as network:
            counts = worker_pass()

        self.assertEqual(counts["submitted"], 1)
        network.assert_called_once()
        status = self.conn.execute(
            "SELECT status FROM apple_consumption_outbox WHERE event_id=?", (event_id,)
        ).fetchone()["status"]
        self.assertEqual(status, "submitted")


if __name__ == "__main__":
    unittest.main(verbosity=2)
