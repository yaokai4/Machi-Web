#!/usr/bin/env python3
"""B1 items 4 + 9: real active-DM quota (initiator_id) and manual-unread flag.

Item 4: the daily active-DM quota must count ONLY conversations the user
actively opened (initiator_id), not ones they passively received / replied to /
that got bumped by activity. _conversation_for now records the opener and a
stable created_at.

Item 9: marking a conversation unread must work even when it has no inbound
message (the old is_read=false path silently no-op'd those). A per-participant
manual_unread flag is set on mark-unread, cleared on read, and floors the
conversation's unread count at 1.

Run:  cd web && python3 scripts/test_dm_quota_manual_unread.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_dm_quota_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


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


class DmQuotaManualUnreadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    # ---- item 4: initiator_id + real quota ----------------------------------

    def test_conversation_for_records_initiator_and_created_at(self):
        a, b = _make_user(self.conn), _make_user(self.conn)
        h = _handler(a)
        conv = h._conversation_for(self.conn, a, b)
        self.assertEqual(conv["initiator_id"], a, "opener must be the initiator")
        self.assertTrue(conv["created_at"], "created_at must be set on open")

    def test_quota_counts_only_initiated_conversations(self):
        """A conversation the user only RECEIVED (someone else initiated) must
        not count toward their active-DM quota; one they opened must."""
        me = _make_user(self.conn)
        peer1 = _make_user(self.conn)
        peer2 = _make_user(self.conn)
        # me opened this one.
        _handler(me)._conversation_for(self.conn, me, peer1)
        # peer2 opened this one with me (me is a passive participant).
        _handler(peer2)._conversation_for(self.conn, peer2, me)

        since = server._reputation_now_window(1)
        mine = self.conn.execute(
            "SELECT COUNT(*) AS c FROM conversations WHERE initiator_id = ? AND created_at >= ?",
            (me, since),
        ).fetchone()["c"]
        self.assertEqual(mine, 1, "only the conversation me initiated should count")

    def test_reopen_does_not_change_initiator(self):
        """Reopening an existing (hidden/deleted) thread keeps the original
        initiator — it is not a new active DM."""
        a, b = _make_user(self.conn), _make_user(self.conn)
        conv = _handler(a)._conversation_for(self.conn, a, b)
        # Soft-hide then reopen as the OTHER participant.
        self.conn.execute(
            "UPDATE conversations SET deleted_at = ? WHERE id = ?", (server.now_iso(), conv["id"])
        )
        conv2 = _handler(b)._conversation_for(self.conn, b, a)
        self.assertEqual(conv2["id"], conv["id"], "same conversation row")
        self.assertEqual(conv2["initiator_id"], a, "initiator must not change on reopen")

    # ---- item 9: manual unread ----------------------------------------------

    def _open_conv(self, a, b) -> str:
        return _handler(a)._conversation_for(self.conn, a, b)["id"]

    def test_mark_unread_on_empty_conversation_sets_flag(self):
        """An empty conversation (no inbound message) can still be flagged
        unread; the response's unreadCount is floored at 1."""
        a, b = _make_user(self.conn), _make_user(self.conn)
        conv_id = self._open_conv(a, b)
        h = _handler(a)
        h.read_json = lambda: {"is_read": False}  # type: ignore[method-assign]
        h.api_mark_conversation_read(self.conn, conv_id)
        self.assertTrue(h._cap["data"]["ok"])
        self.assertGreaterEqual(h._cap["data"]["unreadCount"], 1,
                                "manual-unread empty thread must report >= 1")
        # a is participant_a or _b depending on id sort; check the right column.
        row = self.conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        col = "manual_unread_a" if row["participant_a"] == a else "manual_unread_b"
        self.assertEqual(int(row[col]), 1, "manual flag must be set for this user")

    def test_mark_read_clears_manual_flag(self):
        a, b = _make_user(self.conn), _make_user(self.conn)
        conv_id = self._open_conv(a, b)
        # flag unread
        hu = _handler(a)
        hu.read_json = lambda: {"is_read": False}  # type: ignore[method-assign]
        hu.api_mark_conversation_read(self.conn, conv_id)
        # then read
        hr = _handler(a)
        hr.read_json = lambda: {"is_read": True}  # type: ignore[method-assign]
        hr.api_mark_conversation_read(self.conn, conv_id)
        self.assertEqual(hr._cap["data"]["unreadCount"], 0, "reading clears unread")
        row = self.conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        col = "manual_unread_a" if row["participant_a"] == a else "manual_unread_b"
        self.assertEqual(int(row[col]), 0, "manual flag must be cleared on read")

    def test_manual_flag_is_per_participant(self):
        """Only the user who flagged unread sees it; the peer is unaffected."""
        a, b = _make_user(self.conn), _make_user(self.conn)
        conv_id = self._open_conv(a, b)
        hu = _handler(a)
        hu.read_json = lambda: {"is_read": False}  # type: ignore[method-assign]
        hu.api_mark_conversation_read(self.conn, conv_id)
        row = self.conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        a_col = "manual_unread_a" if row["participant_a"] == a else "manual_unread_b"
        b_col = "manual_unread_b" if a_col == "manual_unread_a" else "manual_unread_a"
        self.assertEqual(int(row[a_col]), 1)
        self.assertEqual(int(row[b_col]), 0, "peer's flag must remain unset")

    def test_conversation_list_surfaces_manual_unread(self):
        """The inbox list must show unread >= 1 for a manually-flagged empty
        thread."""
        a, b = _make_user(self.conn), _make_user(self.conn)
        conv_id = self._open_conv(a, b)
        hu = _handler(a)
        hu.read_json = lambda: {"is_read": False}  # type: ignore[method-assign]
        hu.api_mark_conversation_read(self.conn, conv_id)
        hl = _handler(a)
        hl.api_conversations(self.conn, {})
        items = hl._cap["data"]["items"]
        target = [it for it in items if it.get("id") == conv_id]
        self.assertTrue(target, "the flagged conversation must appear in the inbox")
        self.assertGreaterEqual(int(target[0].get("unread_count") or 0), 1,
                                "inbox must show the manual-unread thread as unread")


if __name__ == "__main__":
    unittest.main(verbosity=2)
