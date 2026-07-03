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


class RankingCacheTests(unittest.TestCase):
    """In-process (L1-only, no redis) behaviour — the production redis L2 path
    is exercised by KAIX_REDIS_URL in staging."""

    def test_put_then_get_hits(self):
        c = s.RankingCache()
        payload = {"posts": [{"id": "p1", "tags": ["东京", "租房"]}], "n": 3, "ok": True}
        c.put("explore:posts:abc", payload, ttl_seconds=30)
        self.assertEqual(c.get("explore:posts:abc"), payload)

    def test_miss_on_unknown_key(self):
        c = s.RankingCache()
        self.assertIsNone(c.get("explore:posts:never"))

    def test_ttl_expiry_is_a_miss(self):
        c = s.RankingCache()
        c.put("trending:jp:post_ids", ["a", "b"], ttl_seconds=0.05)
        self.assertEqual(c.get("trending:jp:post_ids"), ["a", "b"])
        time.sleep(0.08)
        self.assertIsNone(c.get("trending:jp:post_ids"))

    def test_invalidate_prefix_clears_matching_only(self):
        c = s.RankingCache()
        c.put("trending:jp:post_ids", [1], ttl_seconds=30)
        c.put("explore:posts:x", [2], ttl_seconds=30)
        c.invalidate_prefixes(("trending:",))
        self.assertIsNone(c.get("trending:jp:post_ids"))
        self.assertEqual(c.get("explore:posts:x"), [2])

    def test_invalidate_empty_prefix_clears_all(self):
        c = s.RankingCache()
        c.put("trending:jp:post_ids", [1], ttl_seconds=30)
        c.put("guide_home:jp:zh", {"a": 1}, ttl_seconds=30)
        c.invalidate_prefixes(("",))
        self.assertIsNone(c.get("trending:jp:post_ids"))
        self.assertIsNone(c.get("guide_home:jp:zh"))

    def test_local_only_keys_never_serialised_and_keep_full_ttl(self):
        # recprofile carries a `set` (non-JSON); it must stay L1-only and round
        # trip unchanged without json.dumps blowing up.
        c = s.RankingCache()
        profile = {"seen": {"p1", "p2"}, "weights": {"东京": 1.0}}
        c.put("recprofile:u42", profile, ttl_seconds=600)
        got = c.get("recprofile:u42")
        self.assertEqual(got["seen"], {"p1", "p2"})  # set preserved (no JSON hop)
        self.assertTrue(s._is_local_only("recprofile:u42"))
        self.assertTrue(s._is_local_only("view:p1:ip"))
        self.assertTrue(s._is_local_only("media_size_bytes"))
        self.assertFalse(s._is_local_only("explore:posts:x"))

    def test_l1_max_eviction_bounds_size(self):
        c = s.RankingCache()
        c._l1_max = 20
        for i in range(60):
            c.put(f"explore:posts:{i}", [i], ttl_seconds=30)
        self.assertLessEqual(len(c._l1), 20)

    def test_singleton_is_stable(self):
        self.assertIs(s.get_ranking_cache(), s.get_ranking_cache())

    def test_start_is_safe_without_redis(self):
        s.get_ranking_cache().start()  # no-op, must not raise


if __name__ == "__main__":
    unittest.main()
