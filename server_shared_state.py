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

Exposed singletons: get_rate_limiter(), get_failure_tracker(), get_event_bus().
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


_rate_limiter = RateLimiter()
_failure_tracker = FailureTracker()
_event_bus = EventBus()


def get_rate_limiter() -> RateLimiter:
    return _rate_limiter


def get_failure_tracker() -> FailureTracker:
    return _failure_tracker


def get_event_bus() -> EventBus:
    return _event_bus
