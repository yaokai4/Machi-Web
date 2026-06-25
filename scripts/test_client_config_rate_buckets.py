"""Capability handshake + auth rate-bucket separation (pure functions, no network):

- client_config_payload: shape + feature/provider gating.
- _rate_group_for: session probe / captcha / oauth-start get their own buckets,
  while login/register/reset stay on the strict brute-force bucket.
- rate_check: a fast sweep of GET /api/auth/me must NOT drain the login bucket
  (the regression that bounced normal multi-tab users to the login page).

Run: python3 scripts/test_client_config_rate_buckets.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("KAIX_DB_PATH", "/tmp/kaix_client_config_test.db")

import server  # noqa: E402


def test_client_config_shape():
    cfg = server.client_config_payload()
    for key in ("apiVersion", "serverVersion", "features", "paymentProviders",
                "providersConfigured", "wallet", "walletDisclaimer", "minClientVersion"):
        assert key in cfg, f"missing {key}"
    assert cfg["features"]["wallet"] is True, "this build has the wallet routes"
    # Spending the in-app wallet is always offered; real money providers only
    # appear when the server actually has credentials configured.
    assert "machi_points" in cfg["paymentProviders"]["web"]
    assert "apple_iap" in cfg["paymentProviders"]["ios"]
    assert cfg["paymentProviders"]["androidChina"] == [], "no compliant CN topup yet"
    if not cfg["providersConfigured"]["stripe"]:
        assert "stripe" not in cfg["paymentProviders"]["web"], \
            "must not advertise stripe when unconfigured"
    if not cfg["providersConfigured"]["googlePlay"]:
        assert "google_play" not in cfg["paymentProviders"]["androidGlobal"]
    assert "不可提现" in cfg["walletDisclaimer"], "disclaimer must state non-withdrawable"


def test_rate_group_routing():
    cases = [
        ("/api/auth/me", "GET", "auth_session"),
        ("/api/auth/me", "PATCH", "auth"),
        ("/api/auth/me", "DELETE", "auth"),
        ("/api/auth/captcha", "POST", "auth_captcha"),
        ("/api/auth/google/start", "GET", "oauth_start"),
        ("/api/auth/google/callback", "GET", "auth"),
        ("/api/auth/login", "POST", "auth"),
        ("/api/auth/register", "POST", "auth"),
        ("/api/auth/email/send-code", "POST", "email"),
    ]
    for path, method, want in cases:
        got = server._rate_group_for(path, method)
        assert got == want, f"{method} {path} -> {got}, want {want}"


def test_session_probe_does_not_drain_login_bucket():
    ip = "203.0.113.42"  # one apparent IP (carrier NAT / office)
    # A normal multi-tab user / QA sweep hits the session probe far more than the
    # strict login bucket's capacity (10). These must not share a bucket.
    for _ in range(50):
        server.rate_check(ip, "auth_session")
    # The login bucket for the same IP is untouched: a real login still works.
    assert server.rate_check(ip, "auth") is True, "login bucket drained by /me sweep"

    # And the lenient session bucket itself survives the same 50-hit sweep.
    allowed = sum(1 for _ in range(20) if server.rate_check(ip, "auth_session"))
    assert allowed >= 10, f"session bucket too tight after sweep: {allowed}/20"


if __name__ == "__main__":
    test_client_config_shape()
    test_rate_group_routing()
    test_session_probe_does_not_drain_login_bucket()
    print("OK")
