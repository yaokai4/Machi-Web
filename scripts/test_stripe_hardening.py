"""Stripe hardening unit tests (pure functions, no network):

- verify_stripe_webhook: valid v1, multiple-v1 rotation, expired timestamp,
  bad signature, malformed header.
- _stripe_minor_units: zero-decimal currency conversion.
- _order_charge_for_provider: server-side price is the single source of truth —
  the plan's own amount/currency is charged for every provider, a client-supplied
  price is never used, and there is NO global env override that re-prices plans.

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
    # Server-side price is the single source of truth. Every provider charges the
    # plan's own amount/currency; there is no global env override that silently
    # re-prices all plans, and a client-supplied price is never consulted.
    plan = {"amount_cents": 2990, "currency": "CNY"}
    for provider in ("stripe", "wechat_pay", "alipay", "apple_iap", "google_play"):
        amount, currency = server._order_charge_for_provider(plan, provider)
        assert (amount, currency) == (2990, "CNY"), \
            f"{provider} must charge the plan price, got {(amount, currency)}"

    # The order amount is always stored as value×100, identical for every
    # provider. Provider-specific minor-unit conversion (zero-decimal currencies)
    # happens only at the Stripe edge via _stripe_minor_units, not in the order.
    amount, currency = server._order_charge_for_provider({"amount_cents": 98000, "currency": "JPY"}, "stripe")
    assert (amount, currency) == (98000, "JPY"), f"order keeps value×100, got {(amount, currency)}"
    assert server._stripe_minor_units(amount, currency) == 980, \
        "JPY is zero-decimal: 98000 (value×100) → 980 minor units at the Stripe edge"

    # A bogus client-supplied price field on the dict is ignored — only
    # amount_cents/currency are read (the dict always originates from get_plan,
    # never the request body).
    spoofed = {"amount_cents": 2990, "currency": "CNY", "price": 1, "amount": 1}
    amount, currency = server._order_charge_for_provider(spoofed, "stripe")
    assert (amount, currency) == (2990, "CNY"), "client-supplied price must be ignored"


if __name__ == "__main__":
    test_webhook_verify()
    test_minor_units()
    test_charge_for_provider()
    print("OK")
