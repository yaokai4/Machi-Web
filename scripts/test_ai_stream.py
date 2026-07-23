#!/usr/bin/env python3
"""Tests for Machi AI SSE streaming: POST /api/guide/ai/chat with "stream": true.

Covers the streaming contract end to end against a throwaway SQLite DB with the
DeepSeek upstream ALWAYS mocked (no network):
  * stream=true → 200 text/event-stream, delta* → done event sequence; the
    concatenated delta text is byte-identical to the full answer; done carries
    messageId / conversationId / sources / suggestions / quota.
  * Pseudo-stream chunker invariants (30-60 chars/slice, lossless join) and the
    60-90ms pacing constants.
  * Non-stream requests keep the EXACT legacy response shape (zero change for
    old clients — no new keys, same key sets).
  * Quota-exhausted / provider-down / member-only ability on the stream path
    arrive as {"type":"error", ...} events (with the same funnel/refund
    semantics as the JSON path).
  * Client disconnect mid-stream: the generated answer is still persisted and
    the quota slot still counted (upstream cost already happened).
  * ": ping" heartbeat comment lines while the upstream is generating.
  * Feedback endpoint accepts and stores the optional "reason" field.

Run:  cd web && python3 scripts/test_ai_stream.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_ai_stream_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import seed_llm  # noqa: E402


# --- DeepSeek mock ----------------------------------------------------------
# The answer deliberately mentions 租房 topic words (and no visa words) so the
# rule-based follow-up generator deterministically picks the 租房 questions.
_ANSWER = (
    "在日本租房通常需要礼金、敷金和中介费，初期费用大约是月租的四到六倍。"
    "建议先确定预算和目标区域，再对比几家不动产中介，签约前逐条确认费用明细，"
    "重要决定请以官方与专业意见为准。"
)

_MOCK = {"mode": "ok", "content": _ANSWER, "delay": 0.0, "calls": 0}


def _mock_completion(messages, *, model=None, thinking=False, max_tokens=1600, timeout=None):
    _MOCK["calls"] += 1
    if _MOCK["delay"]:
        time.sleep(_MOCK["delay"])
    if _MOCK["mode"] == "none":
        return None
    return {
        "content": _MOCK["content"],
        "finish_reason": "stop",
        "model": "deepseek-v4-flash",  # internal only — must NOT reach the client
        "usage": {"prompt_tokens": 42, "completion_tokens": 88, "total_tokens": 130},
        "latency_ms": 9,
    }


seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]
server.seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]

_FORBIDDEN = (
    "deepseek", "openai", "gpt", "claude", "anthropic", "reasoning_content",
    "model_internal", "v4-flash", "v4-pro",
)


def _assert_no_leak_bytes(raw: bytes) -> None:
    low = raw.decode("utf-8", "replace").lower()
    for token in _FORBIDDEN:
        assert token not in low, f"provider/model leak: {token!r} found in SSE output"


# --- fakes ------------------------------------------------------------------

class _FakeWfile:
    """Captures SSE bytes; can simulate a client disconnect after N writes."""

    def __init__(self, fail_after_writes: int | None = None):
        self.buf = bytearray()
        self.writes = 0
        self.fail_after = fail_after_writes

    def write(self, b: bytes) -> None:
        if self.fail_after is not None and self.writes >= self.fail_after:
            raise BrokenPipeError("client gone")
        self.writes += 1
        self.buf += b

    def flush(self) -> None:
        pass


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


def _stream_handler(uid, *, guest_id=None, fail_after_writes=None):
    """A bare Handler wired for the SSE path. wfile captures the raw stream;
    send_json is trapped so a streaming request that falls back to JSON fails
    the test loudly."""
    h = server.Handler.__new__(server.Handler)
    sent: dict = {"status": None, "headers": [], "json_calls": []}
    h.current_session = (lambda c: ({"user_id": uid} if uid else None))  # type: ignore[method-assign]
    h.headers = {"X-Machi-Guest-Id": guest_id} if guest_id else {}
    h.client_address = ("127.0.0.1", 0)
    h.wfile = _FakeWfile(fail_after_writes)
    h.send_response = lambda status: sent.update(status=status)  # type: ignore[method-assign]
    h.send_header = lambda k, v: sent["headers"].append((k, v))  # type: ignore[method-assign]
    h.end_headers = lambda: None  # type: ignore[method-assign]
    h._set_cors = lambda: None  # type: ignore[method-assign]
    h._set_security_headers = lambda: None  # type: ignore[method-assign]
    h.send_json = lambda data, status=200: sent["json_calls"].append((status, data))  # type: ignore[method-assign]
    return h, sent


def _json_handler(uid, *, guest_id=None):
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = (lambda c: ({"user_id": uid} if uid else None))  # type: ignore[method-assign]
    h.headers = {"X-Machi-Guest-Id": guest_id} if guest_id else {}
    h.client_address = ("127.0.0.1", 0)
    return h, captured


def _stream_chat(conn, uid, message, *, guest_id=None, conversation_id=None,
                 ability=None, fail_after_writes=None, language="zh-CN"):
    h, sent = _stream_handler(uid, guest_id=guest_id, fail_after_writes=fail_after_writes)
    body = {"message": message, "language": language, "country": "jp", "stream": True}
    if conversation_id:
        body["conversationId"] = conversation_id
    if ability:
        body["ability"] = ability
    h.read_json = lambda: body  # type: ignore[method-assign]
    h.api_guide_ai_chat(conn)
    return h, sent


def _parse_sse(raw: bytes):
    """Returns (events, comments) from the captured SSE byte stream."""
    events, comments = [], []
    for block in raw.decode("utf-8").split("\n\n"):
        block = block.strip("\n")
        if not block:
            continue
        if block.startswith(":"):
            comments.append(block)
            continue
        assert block.startswith("data: "), f"unexpected SSE block: {block!r}"
        events.append(json.loads(block[len("data: "):]))
    return events, comments


def _usage(conn, subject_id) -> int:
    return server.machi_ai_usage_count(conn, subject_id, server.machi_ai_usage_date())


def main() -> None:  # noqa: PLR0915 — one linear scenario script
    server.init_db()
    conn = server.db()
    # Speed: default 60-90ms pacing is verified via constants; bulk streaming
    # tests run without artificial sleeps.
    default_delay_range = server.MACHI_AI_STREAM_CHUNK_DELAY_RANGE
    server.MACHI_AI_STREAM_CHUNK_DELAY_RANGE = (0.0, 0.0)
    try:
        # 0) Spec pins: chunk size window 30-60 chars, pacing 60-90ms.
        assert server.MACHI_AI_STREAM_CHUNK_MIN_CHARS == 30
        assert server.MACHI_AI_STREAM_CHUNK_MAX_CHARS == 60
        lo, hi = default_delay_range
        assert 0.06 <= lo <= hi <= 0.09, default_delay_range
        assert server.MACHI_AI_STREAM_HEARTBEAT_SEC == 15.0

        # 0b) Chunker invariants: lossless join; every non-final slice within
        #     [30, 60]; final slice 1..60 — for plain, punctuated and
        #     boundary-free text alike.
        for text in (
            _ANSWER,
            "短",
            "a" * 61,                      # no natural boundary → hard cuts at 60
            ("第一步、准备在留卡与住民票。\n第二步、对比中介与初期费用。\n" * 12),
            "x" * 60, "y" * 200,
        ):
            chunks = server.machi_ai_stream_chunks(text)
            assert "".join(chunks) == text, "chunks must reassemble byte-identically"
            for c in chunks[:-1]:
                assert 30 <= len(c) <= 60, f"non-final chunk out of window: {len(c)}"
            if chunks:
                assert 1 <= len(chunks[-1]) <= 60
        assert server.machi_ai_stream_chunks("") == []

        # 0c) Follow-up suggestions: topic hit → 2-3 zh questions; no topic →
        #     empty; non-zh UI → empty (宁缺毋滥, no machine-translated filler).
        sugg = server.machi_ai_followup_suggestions("东京租房初期费用大概多少？", _ANSWER, "zh-CN")
        assert 2 <= len(sugg) <= 3, sugg
        assert all(isinstance(s, str) and s for s in sugg)
        assert server.machi_ai_followup_suggestions("东京租房", _ANSWER, "ja") == []
        assert server.machi_ai_followup_suggestions("嗯", "好的。", "zh-CN") == []

        # 1) Happy path: stream=true → SSE with delta* then done; deltas join to
        #    the exact full answer; done carries ids + suggestions + quota.
        uid = _make_user(conn)
        conn.commit()
        h, sent = _stream_chat(conn, uid, "东京租房初期费用大概多少？")
        assert sent["status"] == 200, sent
        assert not sent["json_calls"], "streaming request must never answer via send_json"
        ctypes = [v for k, v in sent["headers"] if k.lower() == "content-type"]
        assert ctypes and ctypes[0].startswith("text/event-stream"), sent["headers"]
        raw = bytes(h.wfile.buf)
        _assert_no_leak_bytes(raw)
        events, comments = _parse_sse(raw)
        assert comments and comments[0].startswith(":"), "stream must open with a comment line"
        assert len(events) >= 2, events
        assert all(e["type"] == "delta" for e in events[:-1]), events
        done = events[-1]
        assert done["type"] == "done", events
        joined = "".join(e["text"] for e in events[:-1])
        assert joined == _ANSWER, "deltas must reassemble the full answer byte-identically"
        # done payload contract
        assert done["conversationId"] and done["messageId"] and done["createdAt"]
        assert isinstance(done["sources"], list)
        assert done["suggestions"] == sugg, done["suggestions"]
        quota = done["quota"]
        assert set(quota.keys()) == {"membershipActive", "remainingFreeUses", "upgradeSuggested"}
        assert quota["membershipActive"] is False
        assert quota["remainingFreeUses"] == server.MACHI_AI_NEW_USER_DAILY_LIMIT - 1
        assert quota["upgradeSuggested"] is False
        # Persistence identical to the non-stream path: conversation + 2 turns,
        # quota counted once.
        conv_id = done["conversationId"]
        conv = dict(conn.execute("SELECT * FROM guide_ai_conversations WHERE id = ?", (conv_id,)).fetchone())
        assert conv["user_id"] == uid and int(conv["message_count"]) == 2, conv
        msgs = [dict(r) for r in conn.execute(
            "SELECT * FROM guide_ai_messages WHERE conversation_id = ? ORDER BY created_at", (conv_id,)
        ).fetchall()]
        assert [m["role"] for m in msgs] == ["user", "assistant"], msgs
        assert msgs[1]["content"] == _ANSWER and msgs[1]["id"] == done["messageId"]
        assert _usage(conn, uid) == 1

        # 1b) Continuing the same conversation over the stream works too.
        h, sent = _stream_chat(conn, uid, "那没有保证人怎么租房？", conversation_id=conv_id)
        events, _ = _parse_sse(bytes(h.wfile.buf))
        assert events[-1]["type"] == "done" and events[-1]["conversationId"] == conv_id
        assert _usage(conn, uid) == 2

        # 2) Non-stream requests: EXACT legacy shape — same key sets, no
        #    additive fields (zero impact for old clients).
        uid2 = _make_user(conn)
        conn.commit()
        h2, captured = _json_handler(uid2)
        h2.read_json = lambda: {"message": "东京租房初期费用大概多少？", "language": "zh-CN", "country": "jp"}  # type: ignore[method-assign]
        h2.api_guide_ai_chat(conn)
        assert captured["status"] == 200, captured
        data = captured["data"]
        assert set(data.keys()) == {"status", "conversationId", "message", "usage"}, data.keys()
        assert set(data["message"].keys()) == {"id", "role", "content", "createdAt", "sources"}
        assert set(data["usage"].keys()) == {"membershipActive", "remainingFreeUses", "upgradeSuggested"}
        assert data["message"]["content"] == _ANSWER
        assert "suggestions" not in data and "quota" not in data
        assert _usage(conn, uid2) == 1

        # 2b) An explicit stream:false / absent / junk value stays non-stream.
        h2, captured = _json_handler(uid2)
        h2.read_json = lambda: {"message": "追问一下", "stream": False, "language": "zh-CN"}  # type: ignore[method-assign]
        h2.api_guide_ai_chat(conn)
        assert captured["status"] == 200 and set(captured["data"].keys()) == {"status", "conversationId", "message", "usage"}

        # 3) Quota exhausted on the stream path → 200 SSE with a terminal
        #    error event (code AI_QUOTA_EXCEEDED), no deltas, no digits leaked.
        guest_id = str(uuid.uuid4())
        h, sent = _stream_chat(conn, None, "游客流式第一问", guest_id=guest_id)
        events, _ = _parse_sse(bytes(h.wfile.buf))
        assert events[-1]["type"] == "done", events
        assert events[-1]["quota"]["remainingFreeUses"] == server.MACHI_AI_GUEST_DAILY_LIMIT - 1
        h, sent = _stream_chat(conn, None, "游客流式第二问", guest_id=guest_id)
        assert sent["status"] == 200 and not sent["json_calls"]
        events, _ = _parse_sse(bytes(h.wfile.buf))
        assert len(events) == 1, events
        err = events[0]
        assert err["type"] == "error" and err["code"] == "AI_QUOTA_EXCEEDED", err
        assert err["message"] and not any(ch.isdigit() for ch in err["message"]), err
        gkey = server.machi_ai_guest_key(guest_id)
        assert _usage(conn, gkey) == server.MACHI_AI_GUEST_DAILY_LIMIT, "refused call must not over-count"

        # 3b) Member-only ability requested by a non-member on the stream path
        #     → error event, no quota touched, upstream never called.
        uid3 = _make_user(conn)
        conn.commit()
        calls_before = _MOCK["calls"]
        h, sent = _stream_chat(conn, uid3, "帮我润色简历", ability="resume_polish")
        events, _ = _parse_sse(bytes(h.wfile.buf))
        assert len(events) == 1 and events[0]["type"] == "error"
        assert events[0]["code"] == "AI_MEMBER_ABILITY_REQUIRED", events
        assert _MOCK["calls"] == calls_before, "member gate must precede the upstream call"
        assert _usage(conn, uid3) == 0

        # 4) Provider down on the stream path → error event AI_UNAVAILABLE and
        #    a full refund: no usage burned, no orphan conversation.
        uid4 = _make_user(conn)
        conn.commit()
        _MOCK["mode"] = "none"
        try:
            h, sent = _stream_chat(conn, uid4, "这条不会有答案")
            events, _ = _parse_sse(bytes(h.wfile.buf))
            assert events[-1]["type"] == "error" and events[-1]["code"] == "AI_UNAVAILABLE", events
            assert all(e["type"] != "delta" for e in events)
            assert _usage(conn, uid4) == 0, "failed stream must refund the slot"
            assert conn.execute(
                "SELECT COUNT(*) AS c FROM guide_ai_conversations WHERE user_id = ?", (uid4,)
            ).fetchone()["c"] == 0
        finally:
            _MOCK["mode"] = "ok"

        # 5) Client disconnect mid-delta: writes fail from the 3rd write on
        #    (1 = opening comment, 2 = first delta). The already generated
        #    answer must STILL be persisted and the quota slot still counted —
        #    the upstream cost already happened, identical to a non-stream
        #    response body that never reached the client.
        uid5 = _make_user(conn)
        conn.commit()
        long_answer = _ANSWER * 3  # several chunks so the disconnect lands mid-stream
        _MOCK["content"] = long_answer
        try:
            h, sent = _stream_chat(conn, uid5, "断线测试：东京租房怎么找？", fail_after_writes=2)
        finally:
            _MOCK["content"] = _ANSWER
        raw = bytes(h.wfile.buf)
        events, _ = _parse_sse(raw)
        assert events and events[0]["type"] == "delta", "at least the first delta went out"
        assert all(e["type"] != "done" for e in events), "done must not be delivered after disconnect"
        rows = [dict(r) for r in conn.execute(
            "SELECT c.id AS cid, c.message_count FROM guide_ai_conversations c WHERE c.user_id = ?",
            (uid5,),
        ).fetchall()]
        assert len(rows) == 1 and int(rows[0]["message_count"]) == 2, rows
        stored = [dict(r) for r in conn.execute(
            "SELECT role, content FROM guide_ai_messages WHERE conversation_id = ? ORDER BY created_at",
            (rows[0]["cid"],),
        ).fetchall()]
        assert stored[1]["role"] == "assistant" and stored[1]["content"] == long_answer, \
            "the FULL generated answer must be persisted despite the disconnect"
        assert _usage(conn, uid5) == 1, "interrupted stream still counts the slot"

        # 5b) Disconnect before ANY event write (fail from write #1): pipeline
        #     must still complete silently — persist + count, no exception.
        uid5b = _make_user(conn)
        conn.commit()
        h, sent = _stream_chat(conn, uid5b, "断线更早：租房中介靠谱吗？", fail_after_writes=0)
        assert _usage(conn, uid5b) == 1
        assert conn.execute(
            "SELECT COUNT(*) AS c FROM guide_ai_messages WHERE user_id = ?", (uid5b,)
        ).fetchone()["c"] == 2

        # 6) Heartbeat: while the upstream is generating, ": ping" comment
        #    lines are emitted every MACHI_AI_STREAM_HEARTBEAT_SEC of silence.
        uid6 = _make_user(conn)
        conn.commit()
        server.MACHI_AI_STREAM_HEARTBEAT_SEC = 0.05
        _MOCK["delay"] = 0.18
        try:
            h, sent = _stream_chat(conn, uid6, "心跳测试：租房问题")
        finally:
            server.MACHI_AI_STREAM_HEARTBEAT_SEC = 15.0
            _MOCK["delay"] = 0.0
        raw = bytes(h.wfile.buf)
        assert raw.count(b": ping\n\n") >= 2, f"expected heartbeats during generation, got: {raw[:200]!r}"
        events, _ = _parse_sse(raw)
        assert events[-1]["type"] == "done", "answer still completes after heartbeats"

        # 7) Feedback: the optional "reason" (点踩原因) is accepted and stored.
        msg_row = conn.execute(
            "SELECT id FROM guide_ai_messages WHERE user_id = ? AND role = 'assistant'", (uid,)
        ).fetchone()
        fb_handler, captured = _json_handler(uid)
        fb_handler.read_json = lambda: {"rating": "not_helpful", "reason": "内容过时了"}  # type: ignore[method-assign]
        fb_handler.api_guide_ai_feedback(conn, msg_row["id"])
        assert captured["status"] == 200, captured
        fb = dict(conn.execute(
            "SELECT rating, reason FROM guide_ai_feedback WHERE message_id = ? ORDER BY created_at DESC",
            (msg_row["id"],),
        ).fetchone())
        assert fb["rating"] == "not_helpful" and fb["reason"] == "内容过时了", fb

        print("OK")
    finally:
        server.MACHI_AI_STREAM_CHUNK_DELAY_RANGE = default_delay_range
        conn.close()
        try:
            os.unlink(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
