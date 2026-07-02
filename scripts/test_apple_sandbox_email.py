#!/usr/bin/env python3
"""Sandbox Apple IAP verifies must NOT send the "payment succeeded" email.

Repro: in TestFlight, merely opening the membership paywall starts the
StoreKit `Transaction.updates` listener, which re-delivers old Sandbox
(auto-renew) transactions. Each one hits /api/payments/apple/verify with a
NEW transactionId, so the server used to create a paid order AND mail a
"Machi 认证会员支付成功" receipt — for a purchase that never happened.

Contract under test (api_apple_verify + mark_order_paid):
  1. environment=Sandbox/Xcode → membership still opens (testers need it),
     order is tagged client_type='ios_sandbox', NO email is queued.
  2. environment=Production → email queued exactly once, client_type='ios'.
  3. Re-verifying the same transaction id stays idempotent: no second
     order, no second email.

Run:  cd web && python3 scripts/test_apple_sandbox_email.py
"""
from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_apple_sandbox_email_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")
# Server-side sandbox QA mode: unsigned structural JWS accepted (C1 keeps
# production requiring an Apple-rooted signature — covered by
# test_apple_iap_hardening.py; this file tests the email/tagging behaviour).
os.environ.setdefault("APPLE_IAP_ENVIRONMENT", "Sandbox")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

PRODUCT_ID = "machi_yuedu_18_test"


def _b64url(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def _jws(txn_id: str, environment: str) -> str:
    payload = {
        "transactionId": txn_id,
        "originalTransactionId": "orig-" + txn_id,
        "productId": PRODUCT_ID,
        "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
        "environment": environment,
    }
    return f"{_b64url({'alg': 'ES256'})}.{_b64url(payload)}.AAAA"


def _make_user(conn) -> dict:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def _verify(conn, user: dict, txn_id: str, environment: str) -> dict:
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: user  # type: ignore[method-assign]
    h.read_json = lambda: {  # type: ignore[method-assign]
        "signedTransaction": _jws(txn_id, environment),
        "productId": PRODUCT_ID,
        "transactionId": txn_id,
    }
    h.api_apple_verify(conn, )
    return cap["data"]


def main() -> None:
    server.init_db()

    sent: list[tuple[str, str]] = []
    real_send = server.send_email_async
    server.send_email_async = lambda to, subject, body: sent.append((to, subject))  # type: ignore[assignment]
    try:
        with server.DB_LOCK, server.db() as conn:
            # A dedicated active plan mapped to the test Apple product id.
            now = server.now_iso()
            conn.execute(
                "INSERT INTO membership_plans (id, plan_key, name, amount_cents, currency, billing_cycle, "
                "billing_period, is_active, apple_product_id, created_at, updated_at) "
                "VALUES (?, 'machi_verified_monthly_t', '测试月度', 1800, 'CNY', 'monthly', 'monthly', 1, ?, ?, ?)",
                (str(uuid.uuid4()), PRODUCT_ID, now, now),
            )
            user = _make_user(conn)

            # 1) Sandbox verify: membership opens, order tagged, NO email.
            resp = _verify(conn, user, "sbx-001", "Sandbox")
            assert resp["membershipActive"] is True, resp
            order = conn.execute(
                "SELECT client_type, status FROM payment_orders WHERE provider_trade_no = ?",
                ("apple:sbx-001",),
            ).fetchone()
            assert order and order["status"] == "paid", dict(order) if order else None
            assert order["client_type"] == "ios_sandbox", order["client_type"]
            assert sent == [], f"sandbox verify must not email, got {sent}"
            print("  ok: sandbox verify opens membership, tags ios_sandbox, sends no email")

            # 2) Xcode env behaves like sandbox.
            _verify(conn, user, "sbx-002", "Xcode")
            assert sent == [], f"xcode verify must not email, got {sent}"
            print("  ok: xcode verify sends no email")

            # 3) Idempotent re-verify of the same txn: no extra order, no email.
            _verify(conn, user, "sbx-001", "Sandbox")
            n = conn.execute(
                "SELECT COUNT(*) AS n FROM payment_orders WHERE provider_trade_no = ?",
                ("apple:sbx-001",),
            ).fetchone()["n"]
            assert n == 1, n
            assert sent == [], sent
            print("  ok: re-verify stays idempotent (1 order, still no email)")

            # 4) Production transaction still emails exactly once, tagged ios.
            _verify(conn, user, "prod-001", "Production")
            order = conn.execute(
                "SELECT client_type FROM payment_orders WHERE provider_trade_no = ?",
                ("apple:prod-001",),
            ).fetchone()
            assert order["client_type"] == "ios", order["client_type"]
            assert len(sent) == 1 and "支付成功" in sent[0][1], sent
            _verify(conn, user, "prod-001", "Production")
            assert len(sent) == 1, sent
            print("  ok: production verify emails exactly once, tags ios")
    finally:
        server.send_email_async = real_send  # type: ignore[assignment]

    print("test_apple_sandbox_email: ALL OK")


if __name__ == "__main__":
    main()
