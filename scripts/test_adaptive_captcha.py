"""Adaptive login-captcha unit tests (pure functions, no network):

- mode "0"/"1"/"adaptive" gate behavior for the login scene
- failure tracking: threshold trips per-IP AND per-handle independently
- success clears both keys; window expiry forgives old failures

Run: python3 scripts/test_adaptive_captcha.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("KAIX_DB_PATH", "/tmp/kaix_adaptive_test.db")
os.environ.setdefault("KAIX_CAPTCHA_LOGIN_ENABLED", "adaptive")
os.environ.setdefault("KAIX_CAPTCHA_LOGIN_FAIL_THRESHOLD", "3")

import server  # noqa: E402


def reset():
    with server._LOGIN_FAIL_LOCK:
        server._LOGIN_FAILURES.clear()


def test_modes():
    assert server.CAPTCHA_LOGIN_MODE == "adaptive"
    # register scene is unconditional (when captcha is on at all)
    if server.CAPTCHA_ENABLED and server.CAPTCHA_AVAILABLE:
        assert server.captcha_required_for("register") is True


def test_adaptive_threshold_per_ip():
    reset()
    assert not server.captcha_required_for("login", ip="1.2.3.4"), "fresh IP must not need captcha"
    for _ in range(3):
        server.record_login_failure("1.2.3.4", "alice")
    assert server.captcha_required_for("login", ip="1.2.3.4"), "3 failures must trip the IP"
    assert server.captcha_required_for("login", ip="9.9.9.9", handle="alice"), \
        "3 failures must also trip the targeted handle from any IP"
    assert not server.captcha_required_for("login", ip="9.9.9.9", handle="bob"), \
        "unrelated IP+handle stays free"


def test_success_clears():
    reset()
    for _ in range(5):
        server.record_login_failure("5.6.7.8", "carol")
    assert server.captcha_required_for("login", ip="5.6.7.8")
    server.clear_login_failures("5.6.7.8", "carol")
    assert not server.captcha_required_for("login", ip="5.6.7.8")
    assert not server.captcha_required_for("login", ip="0.0.0.0", handle="carol")


def test_window_expiry():
    reset()
    old = time.monotonic() - server.CAPTCHA_LOGIN_FAIL_WINDOW_SEC - 5
    with server._LOGIN_FAIL_LOCK:
        server._LOGIN_FAILURES["ip:8.8.8.8"] = [old, old, old, old]
    assert not server.login_failures_exceeded("8.8.8.8"), "stale failures outside the window must not count"


if __name__ == "__main__":
    test_modes()
    test_adaptive_threshold_per_ip()
    test_success_clears()
    test_window_expiry()
    print("OK")
