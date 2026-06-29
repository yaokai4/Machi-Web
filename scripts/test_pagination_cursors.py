#!/usr/bin/env python3
"""Opt-in keyset pagination (H2/H3) for messages, comments, conversations.

Verifies for each endpoint that:
  * with NO `limit` param the response is unchanged (full set, legacy order)
  * with `limit` the response is a bounded page plus a real `next_cursor`
  * walking `next_cursor` reconstructs the ENTIRE set with no gaps or dupes
  * the final page returns next_cursor = None

Run:  cd web && python3 scripts/test_pagination_cursors.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_pagination_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _ts(i: int) -> str:
    # Monotonic, zero-padded → lexicographic order == chronological order.
    return f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}.000000+00:00"


def _make_user(conn) -> str:
    uid = str(uuid.uuid4())
    h = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, h, h, f"{h}@example.com", "x", now, now, now),
    )
    return uid


def _handler(uid):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: {"id": uid}  # type: ignore[method-assign]
    h.current_session = lambda c: {"user_id": uid}  # type: ignore[method-assign]
    h._cap = cap  # type: ignore[attr-defined]
    return h


def _walk(call, page_size):
    """Walk next_cursor to exhaustion; return concatenated ids + page sizes."""
    ids: list[str] = []
    sizes: list[int] = []
    cursor = None
    guard = 0
    while True:
        guard += 1
        assert guard < 100, "pagination did not terminate"
        q = {"limit": str(page_size)}
        if cursor:
            q["cursor"] = cursor
        data = call(q)
        items = data["items"]
        sizes.append(len(items))
        ids.extend(it["id"] for it in items)
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return ids, sizes


def test_messages(conn):
    a, b = _make_user(conn), _make_user(conn)
    conv = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO conversations (id, participant_a, participant_b, updated_at) VALUES (?, ?, ?, ?)",
        (conv, a, b, _ts(0)),
    )
    n = 25
    msg_ids = []
    for i in range(n):
        mid = str(uuid.uuid4())
        msg_ids.append(mid)
        conn.execute(
            "INSERT INTO messages (id, conversation_id, sender_id, content, created_at, is_read) VALUES (?, ?, ?, ?, ?, 0)",
            (mid, conv, a if i % 2 == 0 else b, f"m{i}", _ts(i)),
        )

    h = _handler(a)
    h.api_messages(conn, conv, {})
    full = [it["id"] for it in h._cap["data"]["items"]]
    assert full == msg_ids, "default (no limit) must return full ascending history"
    assert h._cap["data"]["next_cursor"] is None

    def call(q):
        hh = _handler(a)
        hh.api_messages(conn, conv, q)
        return hh._cap["data"]

    ids, sizes = _walk(call, 10)
    # Pages come newest-first; each page is ascending. Concatenation across
    # pages should cover every id exactly once.
    assert sorted(ids) == sorted(msg_ids), f"paged ids != full set: {len(ids)} vs {n}"
    assert len(set(ids)) == n, "duplicate ids across pages"
    assert sizes == [10, 10, 5], sizes
    print("  messages: OK")


def test_comments(conn):
    author = _make_user(conn)
    post_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO posts (id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (post_id, author, "post body", _ts(0), _ts(0)),
    )
    n = 12
    cids = []
    for i in range(n):
        cid = str(uuid.uuid4())
        cids.append(cid)
        conn.execute(
            "INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (cid, post_id, author, f"c{i}", _ts(i), _ts(i)),
        )

    h = _handler(author)
    h.api_list_comments(conn, post_id, {})
    assert len(h._cap["data"]["items"]) == n, "default returns all comments"
    assert h._cap["data"]["next_cursor"] is None

    def call(q):
        hh = _handler(author)
        hh.api_list_comments(conn, post_id, q)
        return hh._cap["data"]

    ids, sizes = _walk(call, 5)
    assert sorted(ids) == sorted(cids), "paged comments != full set"
    assert len(set(ids)) == n, "duplicate comments across pages"
    assert sizes == [5, 5, 2], sizes
    print("  comments: OK")


def test_conversations(conn):
    me = _make_user(conn)
    m = 8
    conv_ids = []
    for i in range(m):
        cid = str(uuid.uuid4())
        conv_ids.append(cid)
        conn.execute(
            "INSERT INTO conversations (id, participant_a, participant_b, updated_at) VALUES (?, ?, ?, ?)",
            (cid, me, str(uuid.uuid4()), _ts(i)),
        )

    h = _handler(me)
    h.api_conversations(conn, {})
    assert len(h._cap["data"]["items"]) == m, "default returns all conversations"

    def call(q):
        hh = _handler(me)
        hh.api_conversations(conn, q)
        return hh._cap["data"]

    ids, sizes = _walk(call, 3)
    assert sorted(ids) == sorted(conv_ids), "paged conversations != full set"
    assert len(set(ids)) == m, "duplicate conversations across pages"
    assert sizes == [3, 3, 2], sizes
    print("  conversations: OK")


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        test_messages(conn)
        test_comments(conn)
        test_conversations(conn)
        print("test_pagination_cursors: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
