#!/usr/bin/env python3
"""Tests for Machi AI (原创 in-app assistant): /api/guide/ai/*.

Exercises the real Handler.api_guide_ai_* methods against a throwaway SQLite DB
with a stubbed session. DeepSeek is ALWAYS mocked — no real network call. The
suite verifies auth, the daily quota (free vs member), conversation/message
persistence, cross-user isolation, the AI_UNAVAILABLE fallback, the JST usage
date, and — critically — that no provider / model / key / reasoning_content
ever leaks into a client response.

Run:  cd web && python3 scripts/test_guide_ai.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_ai_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import seed_llm  # noqa: E402


# --- DeepSeek mock ----------------------------------------------------------
# The server calls seed_llm.machi_ai_chat_completion(...); we replace it so no
# real provider is ever contacted. The mock deliberately returns an internal
# model id ("deepseek-v4-flash") to prove the server never forwards it.
_MOCK_MODE = {"mode": "ok"}


def _mock_completion(messages, *, model=None, thinking=False, max_tokens=1600, timeout=None):
    if _MOCK_MODE["mode"] == "none":
        return None
    return {
        "content": "这是 Machi AI 的回答：第一步、第二步、第三步，重要决定请以官方意见为准。",
        "finish_reason": "stop",
        "model": "deepseek-v4-flash",  # internal only — must NOT reach the client
        "usage": {"prompt_tokens": 42, "completion_tokens": 88, "total_tokens": 130},
        "latency_ms": 9,
    }


seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]
server.seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]

# Substrings that must never appear in a client-facing response.
_FORBIDDEN = (
    "deepseek", "openai", "gpt", "claude", "anthropic", "reasoning_content",
    "powered by", "model_internal", "v4-flash", "v4-pro",
)


def _assert_no_leak(obj) -> None:
    blob = json.dumps(obj, ensure_ascii=False).lower()
    for token in _FORBIDDEN:
        assert token not in blob, f"provider/model leak: {token!r} found in response"


# --- helpers ----------------------------------------------------------------

def _make_user(conn) -> str:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _handler(uid):
    """A bare Handler with session + body stubbed. send_json captures output;
    send_error_json runs for real (through the real _error_envelope)."""
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = (lambda c: ({"user_id": uid} if uid else None))  # type: ignore[method-assign]
    return h, captured


def _chat(conn, uid, message, *, conversation_id=None, language="zh-CN"):
    h, captured = _handler(uid)
    h.read_json = lambda: {  # type: ignore[method-assign]
        "message": message, "conversationId": conversation_id, "language": language, "country": "jp",
    }
    h.api_guide_ai_chat(conn)
    return captured


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        # 1) Unauthenticated chat → AUTH_REQUIRED.
        _MOCK_MODE["mode"] = "ok"
        h, _ = _handler(None)
        h.read_json = lambda: {"message": "hi"}  # type: ignore[method-assign]
        try:
            h.api_guide_ai_chat(conn)
            assert False, "expected APIError for unauthenticated chat"
        except server.APIError as exc:
            assert exc.code == "AUTH_REQUIRED", exc.code
            assert exc.status == 401, exc.status

        # 2) Free user: first 3 succeed, remaining decrements by one each time
        #    (computed from the configured cap, not hardcoded).
        free_uid = _make_user(conn)
        conn.commit()
        free_limit = server.MACHI_AI_FREE_DAILY_LIMIT
        expected_remaining = [free_limit - 1 - i for i in range(3)]
        last_conv = None
        for i in range(3):
            # Continue the same thread so we end with one conversation of 6 msgs.
            cap = _chat(conn, free_uid, f"我刚来日本，第一周要做什么？第{i}次", conversation_id=last_conv)
            assert cap["status"] == 200, cap
            data = cap["data"]
            assert data["status"] == "ok", data
            assert data["usage"]["membershipActive"] is False
            assert data["usage"]["remainingFreeUses"] == expected_remaining[i], data["usage"]
            assert data["message"]["role"] == "assistant"
            assert data["message"]["content"], "assistant content required"
            _assert_no_leak(data)
            last_conv = data["conversationId"]

        # 3) Free user exceeding the daily cap → 429 AI_QUOTA_EXCEEDED + upgrade hint.
        #    Uses a fresh user (and the configured cap) so the test-#6 conversation
        #    above stays at exactly 3 turns regardless of the limit value.
        quota_uid = _make_user(conn)
        conn.commit()
        for i in range(free_limit):
            cap = _chat(conn, quota_uid, f"额度测试 {i}")
            assert cap["status"] == 200, (i, cap)
        cap = _chat(conn, quota_uid, "再问一个问题")
        assert cap["status"] == 429, cap
        assert cap["data"]["error"]["code"] == "AI_QUOTA_EXCEEDED", cap["data"]
        assert cap["data"]["upgradeSuggested"] is True, cap["data"]
        _assert_no_leak(cap["data"])

        # 6) Conversation + messages persisted; reload via the messages API.
        rows = conn.execute(
            "SELECT * FROM guide_ai_conversations WHERE user_id = ?", (free_uid,)
        ).fetchall()
        assert len(rows) == 1, "one conversation per the same thread"
        assert int(dict(rows[0])["message_count"]) == 6, "3 turns × 2 messages"
        msg_rows = conn.execute(
            "SELECT * FROM guide_ai_messages WHERE conversation_id = ? ORDER BY created_at",
            (last_conv,),
        ).fetchall()
        assert len(msg_rows) == 6, len(msg_rows)
        # The internal model id is stored for diagnostics...
        assistant_rows = [dict(r) for r in msg_rows if dict(r)["role"] == "assistant"]
        assert assistant_rows and assistant_rows[0]["model_internal"], "model_internal stored internally"
        # ...but the messages API never exposes it.
        h, captured = _handler(free_uid)
        h.api_guide_ai_messages(conn, last_conv)
        assert captured["status"] == 200, captured
        assert captured["data"]["conversation"]["id"] == last_conv
        assert len(captured["data"]["items"]) == 6
        for item in captured["data"]["items"]:
            assert "model_internal" not in item and "promptTokens" not in item
        _assert_no_leak(captured["data"])

        # 7) Another user cannot read the first user's conversation.
        other_uid = _make_user(conn)
        conn.commit()
        h, captured = _handler(other_uid)
        h.api_guide_ai_messages(conn, last_conv)
        assert captured["status"] == 404, captured

        # 4) Member exceeds the FREE limit but keeps going.
        member_uid = _make_user(conn)
        server.activate_or_extend_membership(
            conn, member_uid, server.MEMBERSHIP_PLAN_MONTHLY_KEY, "manual", periods=1
        )
        conn.commit()
        assert server.has_active_membership(conn, member_uid) is True
        for i in range(server.MACHI_AI_FREE_DAILY_LIMIT + 2):  # 5 > free limit (3)
            cap = _chat(conn, member_uid, f"会员问题 {i}")
            assert cap["status"] == 200, (i, cap)
            assert cap["data"]["usage"]["membershipActive"] is True
            # Members never get a remaining number.
            assert cap["data"]["usage"]["remainingFreeUses"] is None, cap["data"]["usage"]
            _assert_no_leak(cap["data"])

        # 5) Member hits the internal member limit → 429 with NO number in the text.
        member2 = _make_user(conn)
        server.activate_or_extend_membership(
            conn, member2, server.MEMBERSHIP_PLAN_MONTHLY_KEY, "manual", periods=1
        )
        conn.commit()
        original_limit = server.MACHI_AI_MEMBER_DAILY_LIMIT
        server.MACHI_AI_MEMBER_DAILY_LIMIT = 2
        try:
            for i in range(2):
                cap = _chat(conn, member2, f"会员限额问题 {i}")
                assert cap["status"] == 200, cap
            cap = _chat(conn, member2, "再来一个")
            assert cap["status"] == 429, cap
            assert cap["data"]["error"]["code"] == "AI_QUOTA_EXCEEDED"
            quota_msg = cap["data"]["error"]["message"]
            assert not any(ch.isdigit() for ch in quota_msg), f"member quota text leaked a number: {quota_msg}"
            assert cap["data"]["upgradeSuggested"] is False, "members aren't pushed to upgrade"
            assert cap["data"]["usage"]["remainingFreeUses"] is None
            _assert_no_leak(cap["data"])
        finally:
            server.MACHI_AI_MEMBER_DAILY_LIMIT = original_limit

        # 10) usage_date is the Japan-time date.
        jst_today = server.machi_ai_usage_date()
        urow = conn.execute(
            "SELECT usage_date FROM guide_ai_usage WHERE user_id = ?", (free_uid,)
        ).fetchone()
        assert dict(urow)["usage_date"] == jst_today, (dict(urow), jst_today)

        # 8) Provider unavailable (helper returns None) → AI_UNAVAILABLE, no quota burn.
        fresh_uid = _make_user(conn)
        conn.commit()
        _MOCK_MODE["mode"] = "none"
        cap = _chat(conn, fresh_uid, "这条不会有答案")
        assert cap["status"] == 503, cap
        assert cap["data"]["error"]["code"] == "AI_UNAVAILABLE", cap["data"]
        _assert_no_leak(cap["data"])
        # No usage row created, no orphan conversation.
        assert machi_usage(conn, fresh_uid) == 0, "failed call must not burn quota"
        assert conn.execute(
            "SELECT COUNT(*) AS c FROM guide_ai_conversations WHERE user_id = ?", (fresh_uid,)
        ).fetchone()["c"] == 0, "failed call must not create a conversation"
        _MOCK_MODE["mode"] = "ok"

        # 9) Bootstrap surfaces remaining + suggestions without provider leakage.
        boot_uid = _make_user(conn)
        conn.commit()
        h, captured = _handler(boot_uid)
        h.api_guide_ai_bootstrap(conn, {"language": "zh-CN", "country": "jp"})
        assert captured["status"] == 200, captured
        boot = captured["data"]
        assert boot["membershipActive"] is False
        assert boot["remainingFreeUses"] == server.MACHI_AI_FREE_DAILY_LIMIT
        assert boot["suggestions"], "bootstrap must return starter suggestions"
        assert boot["disclaimer"], "bootstrap must return a disclaimer"
        _assert_no_leak(boot)

        # Feedback + soft delete round-trip.
        h, captured = _handler(free_uid)
        h.read_json = lambda: {"rating": "helpful"}  # type: ignore[method-assign]
        h.api_guide_ai_feedback(conn, assistant_rows[0]["id"])
        assert captured["status"] == 200, captured
        fb = conn.execute(
            "SELECT rating FROM guide_ai_feedback WHERE message_id = ?", (assistant_rows[0]["id"],)
        ).fetchone()
        assert dict(fb)["rating"] == "helpful"

        h, captured = _handler(free_uid)
        h.api_guide_ai_conversation_delete(conn, last_conv)
        assert captured["status"] == 200, captured
        h, captured = _handler(free_uid)
        h.api_guide_ai_conversations(conn, {})
        assert all(c["id"] != last_conv for c in captured["data"]["items"]), "deleted conversation must be hidden"

        # 11) Concurrent burst must NOT exceed the daily cap, and must not call
        #     the paid upstream more than `limit` times. Before the atomic
        #     reservation, N simultaneous requests all read the same stale count,
        #     passed the gate, and each burned a real upstream call. Each worker
        #     uses its OWN connection (sqlite3 connections aren't thread-safe)
        #     and all start together so the gate/increment windows overlap.
        burst_uid = _make_user(conn)
        conn.commit()
        free_limit = server.MACHI_AI_FREE_DAILY_LIMIT  # 3
        n_threads = free_limit + 5  # comfortably more requests than the cap

        upstream_calls = {"n": 0}
        call_lock = threading.Lock()

        def _counting_completion(messages, *, model=None, thinking=False,
                                 max_tokens=1600, timeout=None):
            with call_lock:
                upstream_calls["n"] += 1
            # A small dwell widens the window a concurrent overrun would exploit,
            # so a regressed (non-atomic) gate would actually let extras through.
            time.sleep(0.03)
            return {
                "content": "并发回答：请以官方意见为准。",
                "finish_reason": "stop",
                "model": "deepseek-v4-flash",  # internal only — must not leak
                "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
                "latency_ms": 1,
            }

        seed_llm.machi_ai_chat_completion = _counting_completion  # type: ignore[assignment]
        server.seed_llm.machi_ai_chat_completion = _counting_completion  # type: ignore[assignment]
        try:
            start = threading.Barrier(n_threads)
            statuses: list[int] = []
            errors: list[str] = []
            sink_lock = threading.Lock()

            def _worker(i: int) -> None:
                tconn = server.db()
                try:
                    start.wait()  # release all workers at once
                    cap = _chat(tconn, burst_uid, f"并发问题 {i}")
                    with sink_lock:
                        statuses.append(cap["status"])
                        _assert_no_leak(cap["data"])
                except Exception as exc:  # noqa: BLE001 — surface, don't swallow
                    with sink_lock:
                        errors.append(f"{type(exc).__name__}: {exc}")
                finally:
                    tconn.close()

            workers = [threading.Thread(target=_worker, args=(i,)) for i in range(n_threads)]
            for t in workers:
                t.start()
            for t in workers:
                t.join()

            assert not errors, f"concurrent workers raised: {errors}"
            ok = sum(1 for s in statuses if s == 200)
            denied = sum(1 for s in statuses if s == 429)
            assert ok == free_limit, f"exactly {free_limit} may pass under a burst, got {ok}: {statuses}"
            assert denied == n_threads - free_limit, f"the rest must be 429'd: {statuses}"
            # The money invariant: a paid call happens at most once per allowed
            # slot. (Reservation precedes the upstream call, so over-claimers are
            # rejected before ever reaching it — exactly `free_limit` calls.)
            assert upstream_calls["n"] <= free_limit, (
                f"paid upstream called {upstream_calls['n']}x but cap is {free_limit} — a burst burned money"
            )
            # Ledger settled at exactly the cap; refunds returned every over-claim.
            assert machi_usage(conn, burst_uid) == free_limit, machi_usage(conn, burst_uid)
        finally:
            seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]
            server.seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]

        print("OK")
    finally:
        conn.close()


def machi_usage(conn, uid) -> int:
    return server.machi_ai_usage_count(conn, uid, server.machi_ai_usage_date())


if __name__ == "__main__":
    main()
