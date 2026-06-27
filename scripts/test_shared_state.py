"""Shared-state (rate limiter + failure tracker) in-process tests.

The redis path is exercised in production by KAIX_REDIS_URL; here we cover the
default in-process backend and the public API used by server.py.

Run: python3 scripts/test_shared_state.py
"""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server_shared_state as s  # noqa: E402


class RateLimiterTests(unittest.TestCase):
    def test_token_bucket_caps_then_refills(self):
        rl = s.RateLimiter()
        allowed = sum(1 for _ in range(10) if rl.allow("ip:test", 5, 600))
        self.assertEqual(allowed, 5)  # capacity is 5
        # at 600/min = 10/sec the bucket refills ~1 token in 0.12s
        time.sleep(0.15)
        self.assertTrue(rl.allow("ip:test", 5, 600))

    def test_keys_are_independent(self):
        rl = s.RateLimiter()
        for _ in range(5):
            rl.allow("a", 5, 5)
        self.assertFalse(rl.allow("a", 5, 5))
        self.assertTrue(rl.allow("b", 5, 5))  # different key, fresh bucket


class FailureTrackerTests(unittest.TestCase):
    def test_count_record_clear(self):
        ft = s.FailureTracker()
        for _ in range(4):
            ft.record("handle:bob")
        self.assertEqual(ft.count("handle:bob", 900), 4)
        ft.clear("handle:bob")
        self.assertEqual(ft.count("handle:bob", 900), 0)

    def test_window_expiry(self):
        ft = s.FailureTracker()
        with ft._lock:
            ft._state["k"] = [time.time() - 1000, time.time() - 1000]
        self.assertEqual(ft.count("k", 900), 0)  # stale entries don't count


class BackendTests(unittest.TestCase):
    def test_default_is_memory(self):
        # No KAIX_REDIS_URL in CI -> in-process backend.
        self.assertEqual(s.backend_name(), "memory")

    def test_event_bus_publish_is_safe_without_redis(self):
        s.get_event_bus().publish("u1", {"type": "x"})  # no-op, must not raise


if __name__ == "__main__":
    unittest.main()
