"""Cross-worker shared state (PERF-01 / RATE-LIMIT / PERF scale-out).

The stdlib HTTP server is thread-per-request inside ONE process. To serve many
thousands of concurrent users it must run as N worker processes behind nginx —
but then any coordination state kept in a module-global dict (rate-limit
buckets, login-failure counters, the SSE subscriber map) is per-process, so:

  * per-IP rate limits are effectively multiplied by the worker count,
  * an SSE event published on worker A never reaches a subscriber on worker B.

This module provides those primitives behind a backend that is **in-process by
default** (identical to the old behaviour, zero new dependencies) and becomes
**Redis-backed when KAIX_REDIS_URL is set** (so limits + realtime are correct
across workers and hosts). Flip it on only once Redis is provisioned; until then
everything keeps working single-process.

Backends:
  KAIX_REDIS_URL   redis://host:6379/0  -> shared backend (requires `redis`).
                   unset / redis import missing -> in-process backend.

Exposed singletons: get_rate_limiter(), get_failure_tracker(), get_event_bus(),
get_ranking_cache().
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from typing import Any, Callable, Iterable

try:  # optional dependency — only needed for multi-worker / multi-host deploys
    import redis as _redis  # type: ignore
except Exception:  # pragma: no cover - redis not installed
    _redis = None

WORKER_ID = uuid.uuid4().hex[:12]


def _redis_url() -> str:
    return (os.environ.get("KAIX_REDIS_URL") or "").strip()


_client_lock = threading.Lock()
_client: Any = None
_client_resolved = False


def _client_or_none() -> Any:
    """Lazily build a shared redis client, or None to use the in-process path.
    A connection failure degrades to in-process rather than taking the app down."""
    global _client, _client_resolved
    if _client_resolved:
        return _client
    with _client_lock:
        if _client_resolved:
            return _client
        url = _redis_url()
        if url and _redis is not None:
            try:
                c = _redis.from_url(url, socket_timeout=2, socket_connect_timeout=2,
                                    decode_responses=True)
                c.ping()
                _client = c
            except Exception:
                _client = None
        else:
            _client = None
        _client_resolved = True
        return _client


def backend_name() -> str:
    return "redis" if _client_or_none() is not None else "memory"


# ---------------------------------------------------------------------------
# Rate limiter — token bucket, shared across workers when on redis.

_RL_TOKEN_BUCKET_LUA = """
local cap = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local d = redis.call('HMGET', KEYS[1], 't', 's')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = cap; ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(cap, tokens + elapsed * refill)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HMSET', KEYS[1], 't', tokens, 's', now)
redis.call('EXPIRE', KEYS[1], ttl)
return allowed
"""


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, tuple[float, float]] = {}
        self._gc_threshold = 50_000
        self._lua_sha: str | None = None

    def allow(self, key: str, capacity: int, per_minute: int) -> bool:
        refill = per_minute / 60.0
        client = _client_or_none()
        if client is not None:
            try:
                return self._allow_redis(client, key, capacity, refill)
            except Exception:
                pass  # degrade to in-process on any redis error
        return self._allow_memory(key, capacity, refill)

    def _allow_redis(self, client: Any, key: str, capacity: int, refill: float) -> bool:
        now = time.time()
        ttl = max(2, int(capacity / refill) + 2) if refill > 0 else 60
        rkey = "rl:" + key
        args = [capacity, refill, now, ttl]
        if self._lua_sha is None:
            self._lua_sha = client.script_load(_RL_TOKEN_BUCKET_LUA)
        try:
            res = client.evalsha(self._lua_sha, 1, rkey, *args)
        except Exception:
            res = client.eval(_RL_TOKEN_BUCKET_LUA, 1, rkey, *args)
        return int(res) == 1

    def _allow_memory(self, key: str, capacity: int, refill: float) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._state) > self._gc_threshold:
                cutoff = now - 600
                for k, (_, last) in list(self._state.items()):
                    if last < cutoff:
                        self._state.pop(k, None)
            tokens, last = self._state.get(key, (float(capacity), now))
            tokens = min(float(capacity), tokens + max(0.0, now - last) * refill)
            if tokens < 1.0:
                self._state[key] = (tokens, now)
                return False
            self._state[key] = (tokens - 1.0, now)
            return True


# ---------------------------------------------------------------------------
# Failure tracker — login-failure counts + hard lockout, shared across workers.

class FailureTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, list[float]] = {}
        self._gc_threshold = 20_000

    def record(self, key: str, ttl: int = 900) -> None:
        client = _client_or_none()
        if client is not None:
            try:
                now = time.time()
                rkey = "lf:" + key
                pipe = client.pipeline()
                pipe.zadd(rkey, {f"{now}:{uuid.uuid4().hex[:8]}": now})
                pipe.expire(rkey, ttl)
                pipe.execute()
                return
            except Exception:
                pass
        with self._lock:
            if len(self._state) > self._gc_threshold:
                self._state.clear()
            self._state.setdefault(key, []).append(time.time())

    def count(self, key: str, window_sec: int) -> int:
        cutoff = time.time() - window_sec
        client = _client_or_none()
        if client is not None:
            try:
                rkey = "lf:" + key
                client.zremrangebyscore(rkey, 0, cutoff)
                return int(client.zcard(rkey))
            except Exception:
                pass
        with self._lock:
            stamps = [s for s in self._state.get(key, []) if s >= cutoff]
            self._state[key] = stamps
            return len(stamps)

    def clear(self, key: str) -> None:
        client = _client_or_none()
        if client is not None:
            try:
                client.delete("lf:" + key)
                return
            except Exception:
                pass
        with self._lock:
            self._state.pop(key, None)

    def clear_all(self) -> None:
        """Wipe all in-process failure state (tests / maintenance). On redis a
        no-op — per-key TTLs handle expiry there."""
        with self._lock:
            self._state.clear()


# ---------------------------------------------------------------------------
# Event bus — bridges SSE events across worker processes via redis pub/sub.
# In-process mode is a no-op: delivery stays local (single process).

_EVENT_CHANNEL = "machi:events"


class EventBus:
    def __init__(self) -> None:
        self._deliver: Callable[[str, dict], None] | None = None
        self._started = False
        self._lock = threading.Lock()

    @property
    def cross_worker(self) -> bool:
        return _client_or_none() is not None

    def start(self, local_deliver: Callable[[str, dict], None]) -> None:
        """Register the local delivery callback and, on redis, start a subscriber
        thread that re-delivers events published by OTHER workers."""
        self._deliver = local_deliver
        client = _client_or_none()
        if client is None:
            return
        with self._lock:
            if self._started:
                return
            self._started = True
        t = threading.Thread(target=self._subscribe_loop, name="machi-eventbus", daemon=True)
        t.start()

    def publish(self, user_id: str, event: dict) -> None:
        """Fan a locally-published event out to the other workers (no-op
        in-process). Local delivery is done by the caller (EventHub.publish)."""
        client = _client_or_none()
        if client is None:
            return
        try:
            client.publish(_EVENT_CHANNEL, json.dumps(
                {"o": WORKER_ID, "u": user_id, "e": event}, ensure_ascii=False))
        except Exception:
            pass

    def _subscribe_loop(self) -> None:  # pragma: no cover - needs redis
        while True:
            try:
                client = _client_or_none()
                if client is None:
                    return
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                pubsub.subscribe(_EVENT_CHANNEL)
                for msg in pubsub.listen():
                    if msg.get("type") != "message":
                        continue
                    try:
                        data = json.loads(msg["data"])
                    except Exception:
                        continue
                    if data.get("o") == WORKER_ID:
                        continue  # don't re-deliver our own publish
                    if self._deliver:
                        self._deliver(data.get("u", ""), data.get("e", {}))
            except Exception:
                time.sleep(1.0)  # reconnect after a transient redis hiccup


# ---------------------------------------------------------------------------
# Ranking / recommendation cache — public feed / trending / explore / guide
# payloads shared across worker processes when on redis.
#
# Two layers:
#   L1  a tiny in-process dict with ABSOLUTE wall-clock (time.time()) deadlines
#       so a redis round-trip is skipped for hot keys within a ~2s window. This
#       is also the sole layer when redis is unconfigured/down (degrades to the
#       old in-process cache behaviour, just with a shorter TTL — reads never
#       fail because of a redis hiccup).
#   L2  redis SET ... EX (TTL owned by redis), values serialised as JSON. Only
#       PUBLIC payloads land here (feed/trending/explore/discover/topics/guide/
#       membership_plan). Per-user or per-host keys (recprofile:/view:/
#       media_size_bytes) stay L1-only — see _is_local_only.
#
# CRITICAL: never store time.monotonic() deadlines. monotonic is a per-process
# clock, so a (deadline, value) tuple copied to another worker via redis would
# have a meaningless expiry. L1 uses time.time(); L2 lets redis own the TTL.
#
# Invalidation is broadcast over redis pub/sub (channel machi:cache_inval) so
# EVERY worker drops the matching L1 entries — not just the one that mutated —
# giving删帖/admin下架 second-level cross-worker consistency instead of waiting
# for the L1 TTL to lapse. The matching L2 keys are also SCAN-deleted so the
# next reader on any worker rebuilds from the DB.

# Namespace + version prefix for all L2 keys. Bump the version to invalidate the
# entire ranking cache at once on a breaking payload-shape change.
_CACHE_NS = "mc1:"
_CACHE_INVAL_CHANNEL = "machi:cache_inval"

# Keys with these prefixes never touch redis: recprofile:{viewer} carries a
# non-JSON `set` payload and is per-user + high-cardinality; view:{post} is a
# per-viewer dedup lock (high cardinality, cross-worker sharing not worth the
# memory); media_size_bytes is a per-host disk figure meaningless off-box.
_CACHE_LOCAL_ONLY_PREFIXES = ("recprofile:", "view:", "media_size_bytes")


def _is_local_only(key: str) -> bool:
    return key.startswith(_CACHE_LOCAL_ONLY_PREFIXES)


class RankingCache:
    def __init__(self) -> None:
        self._l1: dict[str, tuple[float, Any]] = {}
        self._l1_lock = threading.Lock()
        # L1 is deliberately short: it only collapses the within-window fan-out
        # of concurrent reads into a single redis GET (or single DB hit when
        # redis is off). Cross-worker freshness comes from the pub/sub bust.
        self._l1_ttl = float(os.environ.get("KAIX_CACHE_L1_TTL", "2.0"))
        self._l1_max = int(os.environ.get("KAIX_CACHE_L1_MAX", "5000"))
        self._started = False
        self._start_lock = threading.Lock()

    # -- L1 helpers ---------------------------------------------------------
    def _l1_put(self, key: str, value: Any, ttl_seconds: float) -> None:
        deadline = time.time() + max(0.0, ttl_seconds)
        with self._l1_lock:
            if len(self._l1) >= self._l1_max:
                now = time.time()
                # Sweep expired first; if still full, evict ~10% nearest expiry.
                for k in [k for k, v in list(self._l1.items()) if v[0] <= now]:
                    self._l1.pop(k, None)
                if len(self._l1) >= self._l1_max:
                    for k in sorted(self._l1, key=lambda k: self._l1[k][0])[: max(1, len(self._l1) // 10)]:
                        self._l1.pop(k, None)
            self._l1[key] = (deadline, value)

    def _l1_get(self, key: str) -> Any | None:
        now = time.time()
        with self._l1_lock:
            entry = self._l1.get(key)
            if entry and entry[0] > now:
                return entry[1]
            if entry:
                self._l1.pop(key, None)
        return None

    def _l1_invalidate(self, prefixes: Iterable[str]) -> None:
        prefs = tuple(prefixes)
        with self._l1_lock:
            for k in list(self._l1):
                if any((not p) or k.startswith(p) for p in prefs):
                    self._l1.pop(k, None)

    # -- public API ---------------------------------------------------------
    def get(self, key: str) -> Any | None:
        hit = self._l1_get(key)
        if hit is not None:
            return hit
        if _is_local_only(key):
            return None
        client = _client_or_none()
        if client is not None:
            try:
                raw = client.get(_CACHE_NS + key)
                if raw is not None:
                    val = json.loads(raw)
                    # Backfill L1 so the next few reads skip redis entirely.
                    self._l1_put(key, val, self._l1_ttl)
                    return val
            except Exception:
                pass  # any redis error -> treat as a miss, never raise
        return None

    def put(self, key: str, value: Any, ttl_seconds: float) -> None:
        # Local-only keys live entirely in L1 with their full TTL.
        if _is_local_only(key):
            self._l1_put(key, value, ttl_seconds)
            return
        # Public keys: L1 gets the short window, redis owns the real TTL.
        self._l1_put(key, value, min(self._l1_ttl, ttl_seconds))
        client = _client_or_none()
        if client is not None:
            try:
                # JSON only — never pickle (cross-language safety, no RCE
                # surface on a shared store). Floor TTL at 1s for redis EX.
                client.set(_CACHE_NS + key, json.dumps(value, ensure_ascii=False),
                           ex=max(1, int(round(ttl_seconds))))
            except Exception:
                pass  # L1 still serves this worker; others miss -> rebuild

    def invalidate_prefixes(self, prefixes: Iterable[str]) -> None:
        prefs = tuple(prefixes)
        # 1) Clear our own L1 immediately.
        self._l1_invalidate(prefs)
        client = _client_or_none()
        if client is None:
            return
        # 2) Delete matching L2 keys (SCAN, non-blocking) so the next reader on
        #    any worker rebuilds from the DB. Skip local-only prefixes: they
        #    never entered redis.
        try:
            for p in prefs:
                if _is_local_only(p):
                    continue
                cursor = 0
                match = _CACHE_NS + p + "*" if p else _CACHE_NS + "*"
                while True:
                    cursor, keys = client.scan(cursor, match=match, count=500)
                    if keys:
                        client.delete(*keys)
                    if cursor == 0:
                        break
        except Exception:
            pass
        # 3) Broadcast so every OTHER worker drops its L1 too (L1 TTL is short
        #    but guide_sitemap L2 is 600s — without this a peer's L1 could serve
        #    up to L1_TTL of stale data after a delete). Failure is silent.
        try:
            client.publish(_CACHE_INVAL_CHANNEL,
                           json.dumps({"o": WORKER_ID, "p": list(prefs)}, ensure_ascii=False))
        except Exception:
            pass

    # -- cross-worker invalidation subscriber -------------------------------
    def start(self) -> None:
        """On redis, start a subscriber thread that drops this worker's L1 when
        another worker broadcasts an invalidation. No-op in-process."""
        client = _client_or_none()
        if client is None:
            return
        with self._start_lock:
            if self._started:
                return
            self._started = True
        t = threading.Thread(target=self._subscribe_loop, name="machi-cacheinval", daemon=True)
        t.start()

    def _subscribe_loop(self) -> None:  # pragma: no cover - needs redis
        while True:
            try:
                client = _client_or_none()
                if client is None:
                    return
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                pubsub.subscribe(_CACHE_INVAL_CHANNEL)
                for msg in pubsub.listen():
                    if msg.get("type") != "message":
                        continue
                    try:
                        data = json.loads(msg["data"])
                    except Exception:
                        continue
                    if data.get("o") == WORKER_ID:
                        continue  # our own broadcast — L1 already cleared
                    prefs = data.get("p") or []
                    if isinstance(prefs, list):
                        self._l1_invalidate(prefs)
            except Exception:
                time.sleep(1.0)  # reconnect after a transient redis hiccup


_rate_limiter = RateLimiter()
_failure_tracker = FailureTracker()
_event_bus = EventBus()
_ranking_cache = RankingCache()


def get_rate_limiter() -> RateLimiter:
    return _rate_limiter


def get_failure_tracker() -> FailureTracker:
    return _failure_tracker


def get_event_bus() -> EventBus:
    return _event_bus


def get_ranking_cache() -> RankingCache:
    return _ranking_cache
