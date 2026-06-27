#!/usr/bin/env python3
"""UGC moderation tests (App Store 1.2 / legal).

Covers the report close-loop building blocks: community auto-hide once a post
crosses the report threshold, the hide / remove / restore content transitions,
the moderation audit trail, and the known-bad media-hash upload gate. Runs the
real SCHEMA + ensure chain against a throwaway SQLite DB; no HTTP, no network.

Run:  cd web && python3 scripts/test_ugc_moderation.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_ugc_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn, handle=None):
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _make_post(conn, author_id, *, status="published", report_count=0, content="hello"):
    """Minimal valid post row via PRAGMA introspection, overriding the fields the
    moderation logic reads."""
    overrides = {"author_id": author_id, "status": status, "report_count": report_count,
                 "content": content, "id": "post_" + uuid.uuid4().hex}
    cols, vals = [], []
    for c in conn.execute("PRAGMA table_info(posts)").fetchall():
        name, ctype, notnull, dflt, pk = c[1], (c[2] or ""), c[3], c[4], c[5]
        if name in overrides:
            cols.append(name); vals.append(overrides[name]); continue
        if not notnull or dflt is not None:
            continue
        cols.append(name)
        if any(k in ctype.upper() for k in ("INT", "REAL", "NUM", "DEC", "FLOA", "DOUB")):
            vals.append(0)
        else:
            vals.append(server.now_iso() if name.endswith("_at") else "x")
    conn.execute(f"INSERT INTO posts ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})", vals)
    return overrides["id"]


def _report_count(conn, post_id):
    return int(conn.execute("SELECT report_count FROM posts WHERE id = ?", (post_id,)).fetchone()["report_count"])


def _status(conn, post_id):
    return conn.execute("SELECT status FROM posts WHERE id = ?", (post_id,)).fetchone()["status"]


def _audit_rows(conn, target_id):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM content_moderation_actions WHERE target_id = ? ORDER BY created_at", (target_id,))]


class UgcModerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    def test_auto_hide_only_at_threshold(self):
        author = _make_user(self.conn)
        post = _make_post(self.conn, author, report_count=server.REPORT_AUTOHIDE_THRESHOLD - 1)
        # Below threshold: stays visible, no audit.
        self.assertFalse(server.maybe_autohide_post(self.conn, post))
        self.assertEqual(_status(self.conn, post), "published")
        self.assertEqual(_audit_rows(self.conn, post), [])
        # At threshold: auto-hidden + an 'auto_hide' audit row.
        self.conn.execute("UPDATE posts SET report_count = ? WHERE id = ?",
                          (server.REPORT_AUTOHIDE_THRESHOLD, post))
        self.assertTrue(server.maybe_autohide_post(self.conn, post))
        self.assertEqual(_status(self.conn, post), "under_review")
        audits = _audit_rows(self.conn, post)
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0]["action"], "auto_hide")

    def test_auto_hide_is_idempotent(self):
        author = _make_user(self.conn)
        post = _make_post(self.conn, author, report_count=server.REPORT_AUTOHIDE_THRESHOLD + 5)
        self.assertTrue(server.maybe_autohide_post(self.conn, post))
        # Already hidden -> further reports don't re-hide / re-audit.
        self.assertFalse(server.maybe_autohide_post(self.conn, post))
        self.assertEqual(len(_audit_rows(self.conn, post)), 1)

    def test_remove_then_dismiss_does_not_resurrect(self):
        author = _make_user(self.conn)
        post = _make_post(self.conn, author)
        server.set_content_hidden(self.conn, "post", post, removed=True)
        self.assertEqual(_status(self.conn, post), "removed")
        # Dismiss only un-hides the auto-hidden ('under_review') state — an
        # admin-removed post must stay removed.
        server.restore_auto_hidden_content(self.conn, "post", post)
        self.assertEqual(_status(self.conn, post), "removed")

    def test_dismiss_restores_auto_hidden_post(self):
        author = _make_user(self.conn)
        post = _make_post(self.conn, author, status="under_review")
        server.restore_auto_hidden_content(self.conn, "post", post)
        self.assertEqual(_status(self.conn, post), "published")

    def test_record_moderation_action_audits(self):
        server.record_moderation_action(self.conn, "admin1", "post", "p123", "remove", reason="csam", report_id="r1")
        row = _audit_rows(self.conn, "p123")[0]
        self.assertEqual(row["moderator_id"], "admin1")
        self.assertEqual(row["action"], "remove")
        self.assertEqual(row["report_id"], "r1")

    def test_blocked_media_hash_gate(self):
        good = "a" * 64
        bad = "b" * 64
        self.assertFalse(server.media_hash_blocked(self.conn, bad))
        self.conn.execute(
            "INSERT INTO blocked_media_hashes (sha256, reason, created_at) VALUES (?, 'known-bad', ?)",
            (bad, server.now_iso()))
        self.assertTrue(server.media_hash_blocked(self.conn, bad))
        self.assertFalse(server.media_hash_blocked(self.conn, good))
        self.assertFalse(server.media_hash_blocked(self.conn, ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
