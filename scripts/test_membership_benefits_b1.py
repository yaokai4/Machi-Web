#!/usr/bin/env python3
"""B1 items 6, 10, 11: comment-delete CAS, real light_boost, listing-quota API.

Item 6: api_delete_comment must decrement comment_count at most once (CAS on
deleted_at IS NULL), so a double-delete can't drive the counter negative.

Item 10: light_boost is now real — a verified member's post gets a gentle ×1.05
on hot_score (refresh_hot_scores). get_user_membership_status no longer exposes
the fake priority_review field.

Item 11: GET /api/my/membership/listing-quota returns the three quota groups with
used/limit/remaining.

Run:  cd web && python3 scripts/test_membership_benefits_b1.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_memb_b1_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn, *, member: bool = False) -> str:
    uid = str(uuid.uuid4())
    h = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at, is_verified_member) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, h, h, f"{h}@example.com", "x", now, now, now, 1 if member else 0),
    )
    return uid


def _make_post(conn, author: str, *, likes: int = 0) -> str:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, like_count) "
        "VALUES (?, ?, 'hi', 'published', ?, ?, ?)",
        (pid, author, now, now, likes),
    )
    return pid


def _handler(uid):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: {"id": uid}  # type: ignore[method-assign]
    h.current_session = lambda c: {"user_id": uid}  # type: ignore[method-assign]
    h._cap = cap  # type: ignore[attr-defined]
    return h


class MembershipBenefitsB1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    # ---- item 6: delete-comment CAS -----------------------------------------

    def test_delete_comment_decrements_once_under_double_delete(self):
        author = _make_user(self.conn)
        pid = _make_post(self.conn, author)
        # seed a comment + counter of 1
        cid = str(uuid.uuid4())
        now = server.now_iso()
        self.conn.execute(
            "INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) "
            "VALUES (?, ?, ?, 'c', ?, ?)",
            (cid, pid, author, now, now),
        )
        self.conn.execute("UPDATE posts SET comment_count = 1 WHERE id = ?", (pid,))

        h1 = _handler(author)
        h1.api_delete_comment(self.conn, cid)
        c1 = int(self.conn.execute("SELECT comment_count FROM posts WHERE id = ?", (pid,)).fetchone()["comment_count"])
        self.assertEqual(c1, 0, "first delete decrements to 0")

        # Replay the delete — must NOT decrement again (CAS: already deleted).
        h2 = _handler(author)
        h2.api_delete_comment(self.conn, cid)
        c2 = int(self.conn.execute("SELECT comment_count FROM posts WHERE id = ?", (pid,)).fetchone()["comment_count"])
        self.assertEqual(c2, 0, "second delete must not drive the counter negative")

    # ---- item 10: real light_boost + no priority_review ---------------------

    def test_member_post_outscores_equal_nonmember_post(self):
        member = _make_user(self.conn, member=True)
        plain = _make_user(self.conn, member=False)
        pm = _make_post(self.conn, member, likes=10)
        pp = _make_post(self.conn, plain, likes=10)
        server.refresh_hot_scores(self.conn)
        sm = float(self.conn.execute("SELECT hot_score FROM posts WHERE id = ?", (pm,)).fetchone()["hot_score"])
        sp = float(self.conn.execute("SELECT hot_score FROM posts WHERE id = ?", (pp,)).fetchone()["hot_score"])
        self.assertGreater(sm, sp, "verified member's equal-engagement post must rank higher")
        # The boost is gentle (~5%), not a landslide.
        self.assertLess(sm, sp * 1.20, "boost should be modest, not overwhelming")

    def test_membership_status_drops_priority_review(self):
        uid = _make_user(self.conn)
        status = server.get_user_membership_status(self.conn, uid)
        self.assertNotIn("priority_review", status)
        self.assertNotIn("priorityReview", status)
        self.assertIn("light_boost", status)

    # ---- item 11: listing-quota endpoint ------------------------------------

    def test_listing_quota_endpoint_shape(self):
        uid = _make_user(self.conn)
        h = _handler(uid)
        h.api_membership_listing_quota(self.conn)
        data = h._cap["data"]
        self.assertIn("groups", data)
        groups = data["groups"]
        # Three distinct quota groups: 租房 / 招聘 / 本地商家·服务.
        self.assertEqual(len(groups), 3, f"expected 3 groups, got {groups}")
        keys = {g["key"] for g in groups}
        self.assertEqual(keys, {"rental", "job", "local_service"})
        for g in groups:
            self.assertIn("label", g)
            self.assertIn("used", g)
            self.assertIn("limit", g)
            self.assertIn("remaining", g)
            self.assertEqual(g["used"], 0, "fresh user has used 0")


if __name__ == "__main__":
    unittest.main(verbosity=2)
