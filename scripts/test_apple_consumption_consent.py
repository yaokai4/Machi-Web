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
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import URLError

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
        with patch.object(server, "appstore_server_api_configured") as configured, \
             patch.object(server, "_appstore_server_api_token") as token, \
             patch.object(server.urllib.request, "urlopen") as network:
            status = server.apple_send_consumption_info(
                self.conn, self._transaction("tx-no-user"), None
            )
        self.assertEqual(status, "unresolved_user")
        configured.assert_not_called()
        token.assert_not_called()
        network.assert_not_called()

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

    def test_network_failure_returns_2xx_webhook_response_and_keeps_audit(self) -> None:
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
        self.assertEqual(handler._captured["data"]["consumption"], "error")
        audit = self.conn.execute(
            "SELECT COUNT(*) AS c FROM payment_webhooks WHERE provider='apple_iap' AND event_id=?",
            ("event-webhook-network-failure",),
        ).fetchone()["c"]
        self.assertEqual(audit, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
