"""Stripe hardening unit tests (pure functions, no network):

- verify_stripe_webhook: valid v1, multiple-v1 rotation, expired timestamp,
  bad signature, malformed header.
- _stripe_minor_units: zero-decimal currency conversion.
- _order_charge_for_provider: stripe override + zero-decimal plan fallback.

Run: python3 scripts/test_stripe_hardening.py
"""
import hashlib
import hmac
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("KAIX_DB_PATH", "/tmp/kaix_stripe_test.db")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_testsecret")
os.environ.setdefault("STRIPE_PRICE_CENTS", "199")
os.environ.setdefault("STRIPE_CURRENCY", "usd")

import server  # noqa: E402


def sign(payload: bytes, ts: int, secret: str = "whsec_testsecret") -> str:
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={mac}"


def test_webhook_verify():
    payload = json.dumps({"id": "evt_1", "type": "checkout.session.completed"}).encode()
    now = int(time.time())

    ok = server.verify_stripe_webhook({"stripe-signature": sign(payload, now)}, payload)
    assert ok and ok["id"] == "evt_1", "valid signature must verify"

    # Secret-rotation: first v1 wrong, second correct.
    good = sign(payload, now).split("v1=")[1]
    rotated = f"t={now},v1={'0' * 64},v1={good}"
    ok = server.verify_stripe_webhook({"stripe-signature": rotated}, payload)
    assert ok, "any matching v1 among several must verify"

    stale = server.verify_stripe_webhook({"stripe-signature": sign(payload, now - 9999)}, payload)
    assert stale is None, "stale timestamp must be rejected"

    bad = server.verify_stripe_webhook({"stripe-signature": f"t={now},v1={'f' * 64}"}, payload)
    assert bad is None, "wrong signature must be rejected"

    junk = server.verify_stripe_webhook({"stripe-signature": "nonsense"}, payload)
    assert junk is None, "malformed header must be rejected"

    tampered = server.verify_stripe_webhook({"stripe-signature": sign(payload, now)}, payload + b"x")
    assert tampered is None, "tampered payload must be rejected"


def test_minor_units():
    assert server._stripe_minor_units(50000, "JPY") == 500, "JPY is zero-decimal"
    assert server._stripe_minor_units(50000, "usd") == 50000, "USD keeps cents"
    assert server._stripe_minor_units(12345, "cny") == 12345, "CNY keeps fen"


def test_charge_for_provider():
    plan = {"amount_cents": 2990, "currency": "CNY"}
    amount, currency = server._order_charge_for_provider(plan, "stripe")
    assert (amount, currency) == (199, "USD"), f"stripe override expected, got {(amount, currency)}"

    amount, currency = server._order_charge_for_provider(plan, "wechat_pay")
    assert (amount, currency) == (2990, "CNY"), "non-stripe keeps plan price"

    # Fallback path (no override): JPY plan converts to yen minor units.
    saved = server.STRIPE_PRICE_CENTS
    server.STRIPE_PRICE_CENTS = 0
    try:
        amount, currency = server._order_charge_for_provider({"amount_cents": 98000, "currency": "JPY"}, "stripe")
        assert (amount, currency) == (980, "JPY"), f"zero-decimal fallback, got {(amount, currency)}"
    finally:
        server.STRIPE_PRICE_CENTS = saved


if __name__ == "__main__":
    test_webhook_verify()
    test_minor_units()
    test_charge_for_provider()
    print("OK")
