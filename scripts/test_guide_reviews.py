#!/usr/bin/env python3
"""Guide product UGC review tests (BE4 / guide_reviews).

Exercises the full review lifecycle against the real SCHEMA + ensure chain on a
throwaway SQLite DB, driving the ACTUAL Handler methods through a tiny fake so we
cover the buy-gate, one-per-user UPSERT, moderation state machine, the CAS
rating aggregate, helpful votes, report auto-hide, and the refund reclaim — with
NO HTTP and no network.

Run:  cd web && python3 scripts/test_guide_reviews.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_guide_reviews_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")
# Deterministic content-policy term so the sensitive-word test doesn't depend on
# whatever ships in the default seed deny-list.
os.environ["KAIX_BANNED_WORDS"] = "forbiddenword"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class _Captured(Exception):
    """Raised by the fake send_json to unwind the handler with its result."""
    def __init__(self, status, payload):
        self.status = status
        self.payload = payload


class FakeHandler(server.Handler):
    """A Handler that skips socket plumbing: session is injected, read_json reads
    an in-memory dict, and send_json captures the response instead of writing to a
    socket. Enough to drive the review endpoints end-to-end."""
    def __init__(self, user_id=None, role="member", body=None):
        # Bypass BaseHTTPRequestHandler.__init__ (needs a real socket).
        self._fake_user_id = user_id
        self._fake_role = role
        self._fake_body = body or {}
        self._last = None

    # --- overrides ---
    def read_json(self):
        return dict(self._fake_body)

    def current_session(self, conn):
        if not self._fake_user_id:
            return None
        return {"user_id": self._fake_user_id}

    def require_user(self, conn):
        if not self._fake_user_id:
            raise server.APIError("请登录", 401, "AUTH_REQUIRED")
        row = conn.execute("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", (self._fake_user_id,)).fetchone()
        if not row:
            raise server.APIError("请登录", 401, "AUTH_REQUIRED")
        return dict(row)

    def require_admin(self, conn):
        user = self.require_user(conn)
        if (user.get("role") or "member") != "admin":
            raise server.APIError("admin only", 403, "forbidden")
        return user

    def send_json(self, data, status=200):
        self._last = (status, data)
        raise _Captured(status, data)


def _call(fn, *args, **kwargs):
    """Invoke a handler method that ends in send_json; return (status, payload)."""
    try:
        fn(*args, **kwargs)
    except _Captured as c:
        return c.status, c.payload
    raise AssertionError("handler did not send a response")


def _make_user(conn, handle=None, role="member"):
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, role, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", role, now, now, now),
    )
    return uid


def _make_product(conn, *, is_service=0, is_member_included=0, status="published"):
    pid = "prod_" + uuid.uuid4().hex
    now = server.now_iso()
    slug = "slug-" + uuid.uuid4().hex[:8]
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, country, status, is_service, is_member_included, "
        "is_coming_soon, created_at, updated_at) VALUES (?, ?, ?, 'jp', ?, ?, ?, 0, ?, ?)",
        (pid, "Test Product", slug, status, is_service, is_member_included, now, now),
    )
    return pid


def _make_order(conn, user_id, product_id, *, status="fulfilled"):
    oid = "order_" + uuid.uuid4().hex
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_orders (id, user_id, product_id, order_no, price, currency, status, price_points, created_at) "
        "VALUES (?, ?, ?, ?, ?, 'cny', ?, 0, ?)",
        (oid, user_id, product_id, "no_" + uuid.uuid4().hex[:10], 100, status, now),
    )
    return oid


def _submit_review(uid, product_id, rating=5, body="great", anonymous=False):
    h = FakeHandler(user_id=uid, body={"rating": rating, "body": body, "anonymous": anonymous})
    conn = server.db()
    try:
        return _call(h.api_guide_create_or_update_review, conn, product_id)
    finally:
        conn.commit()
        conn.close()


def _approve(admin_id, review_id, action="approve"):
    h = FakeHandler(user_id=admin_id, role="admin")
    conn = server.db()
    try:
        return _call(h.api_admin_guide_review_moderate, conn, review_id, action)
    finally:
        conn.commit()
        conn.close()


def _product_agg(conn, product_id):
    r = conn.execute("SELECT rating, rating_count, rating_sum FROM guide_products WHERE id = ?", (product_id,)).fetchone()
    return {"rating": float(r["rating"]), "count": int(r["rating_count"]), "sum": int(r["rating_sum"])}


def _review_row(conn, review_id):
    return dict(conn.execute("SELECT * FROM guide_reviews WHERE id = ?", (review_id,)).fetchone())


class GuideReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    # --- buy gate ---
    def test_not_purchased_403(self):
        buyer = _make_user(self.conn)
        product = _make_product(self.conn)
        self.conn.commit()
        with self.assertRaises(server.APIError) as ctx:
            h = FakeHandler(user_id=buyer, body={"rating": 5, "body": "hi"})
            h.api_guide_create_or_update_review(self.conn, product)
        self.assertEqual(ctx.exception.code, "not_purchased")

    def test_paid_order_can_review_pending(self):
        buyer = _make_user(self.conn)
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product, status="paid")
        self.conn.commit()
        status, payload = _submit_review(buyer, product, rating=4)
        self.assertEqual(status, 201)
        self.assertEqual(payload["status"], "pending_review")
        row = _review_row(self.conn, payload["id"])
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["rating"], 4)
        self.assertEqual(row["order_id"] != "", True)

    def test_member_unlock_digital_can_review_service_cannot(self):
        # A member-included DIGITAL product: active member counts as owned.
        member = _make_user(self.conn)
        product = _make_product(self.conn, is_member_included=1, is_service=0)
        self.conn.execute(
            "INSERT INTO user_memberships (id, user_id, plan_key, status, started_at, current_period_end, created_at, updated_at) "
            "VALUES (?, ?, 'p', 'active', ?, ?, ?, ?)",
            (str(uuid.uuid4()), member, server.now_iso(),
             (server.datetime.now(server.timezone.utc) + server.timedelta(days=30)).isoformat(),
             server.now_iso(), server.now_iso()))
        self.conn.commit()
        status, payload = _submit_review(member, product, rating=5)
        self.assertEqual(status, 201)
        # A member-included SERVICE: membership does NOT grant review rights.
        svc = _make_product(self.conn, is_member_included=1, is_service=1)
        self.conn.commit()
        with self.assertRaises(server.APIError) as ctx:
            h = FakeHandler(user_id=member, body={"rating": 5, "body": "hi"})
            h.api_guide_create_or_update_review(self.conn, svc)
        self.assertEqual(ctx.exception.code, "not_purchased")

    # --- one per user (UPSERT) ---
    def test_second_submit_updates_same_row(self):
        buyer = _make_user(self.conn)
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p1 = _submit_review(buyer, product, rating=5, body="first")
        _, p2 = _submit_review(buyer, product, rating=2, body="second")
        self.assertEqual(p1["id"], p2["id"])  # same row
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM guide_reviews WHERE user_id = ? AND product_id = ?",
            (buyer, product)).fetchone()["c"]
        self.assertEqual(n, 1)
        self.assertEqual(_review_row(self.conn, p1["id"])["rating"], 2)

    def test_edit_published_review_withdraws_from_aggregate_and_repends(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        self.assertEqual(_product_agg(self.conn, product)["count"], 1)
        # Editing a published review pulls it back to pending and out of the avg.
        _submit_review(buyer, product, rating=3, body="changed")
        agg = _product_agg(self.conn, product)
        self.assertEqual(agg["count"], 0)
        self.assertEqual(agg["sum"], 0)
        self.assertEqual(_review_row(self.conn, p["id"])["status"], "pending")

    # --- moderation + aggregate ---
    def test_approve_increments_aggregate(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=4)
        _approve(admin, p["id"])
        agg = _product_agg(self.conn, product)
        self.assertEqual(agg["count"], 1)
        self.assertEqual(agg["sum"], 4)
        self.assertAlmostEqual(agg["rating"], 4.0)

    def test_concurrent_double_approve_adds_once(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        _approve(admin, p["id"])  # second approve is a CAS no-op on the aggregate
        agg = _product_agg(self.conn, product)
        self.assertEqual(agg["count"], 1)
        self.assertEqual(agg["sum"], 5)

    def test_reject_after_approve_decrements(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        _approve(admin, p["id"], action="reject")
        agg = _product_agg(self.conn, product)
        self.assertEqual(agg["count"], 0)
        self.assertEqual(agg["sum"], 0)
        self.assertAlmostEqual(agg["rating"], 0.0)

    def test_full_lifecycle_reconcile_no_drift(self):
        # approve -> reject -> re-approve -> edit(reapprove different score),
        # then reconcile must equal the incremental aggregate.
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        ids = []
        for score in (5, 4, 3):
            buyer = _make_user(self.conn)
            _make_order(self.conn, buyer, product)
            self.conn.commit()
            _, p = _submit_review(buyer, product, rating=score)
            _approve(admin, p["id"])
            ids.append(p["id"])
        # reject one, then restore it
        _approve(admin, ids[0], action="reject")
        agg = _product_agg(self.conn, product)
        recon = server.reconcile_product_rating(self.conn, product)
        self.assertEqual(agg["count"], recon["count"])
        self.assertEqual(agg["sum"], recon["sum"])
        self.assertAlmostEqual(agg["rating"], recon["avg"])

    def test_sensitive_word_rejected(self):
        buyer = _make_user(self.conn)
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        with self.assertRaises(server.APIError) as ctx:
            h = FakeHandler(user_id=buyer, body={"rating": 5, "body": "this is forbiddenword text"})
            h.api_guide_create_or_update_review(self.conn, product)
        self.assertEqual(ctx.exception.code, "content_policy_violation")

    # --- helpful votes ---
    def test_helpful_idempotent_and_no_self_vote(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        voter = _make_user(self.conn)
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        # author can't vote own review
        with self.assertRaises(server.APIError) as ctx:
            h = FakeHandler(user_id=buyer)
            h.api_guide_review_helpful(self.conn, p["id"], True)
        self.assertEqual(ctx.exception.code, "cannot_vote_own_review")
        # voter votes, twice -> count stays 1
        h = FakeHandler(user_id=voter)
        _call(h.api_guide_review_helpful, self.conn, p["id"], True)
        h2 = FakeHandler(user_id=voter)
        _call(h2.api_guide_review_helpful, self.conn, p["id"], True)
        self.assertEqual(_review_row(self.conn, p["id"])["helpful_count"], 1)
        # un-vote
        h3 = FakeHandler(user_id=voter)
        _call(h3.api_guide_review_helpful, self.conn, p["id"], False)
        self.assertEqual(_review_row(self.conn, p["id"])["helpful_count"], 0)

    # --- report auto-hide ---
    def test_report_autohide_withdraws_from_aggregate(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        self.assertEqual(_product_agg(self.conn, product)["count"], 1)
        # N distinct reporters -> auto-hide + withdraw from aggregate.
        for _ in range(server.REPORT_AUTOHIDE_THRESHOLD):
            reporter = _make_user(self.conn)
            h = FakeHandler(user_id=reporter, body={"reason": "spam"})
            _call(h.api_report, self.conn, "guide_review", p["id"])
        self.assertEqual(_review_row(self.conn, p["id"])["status"], "hidden")
        self.assertEqual(_product_agg(self.conn, product)["count"], 0)

    # --- refund reclaim ---
    def test_refund_withdraws_published_review(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        order_id = _make_order(self.conn, buyer, product, status="paid")
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5)
        _approve(admin, p["id"])
        self.assertEqual(_product_agg(self.conn, product)["count"], 1)
        conn2 = server.db()
        try:
            server.refund_guide_points_order(conn2, order_id, reason="test")
            conn2.commit()
        finally:
            conn2.close()
        self.assertEqual(_review_row(self.conn, p["id"])["status"], "withdrawn")
        self.assertEqual(_product_agg(self.conn, product)["count"], 0)

    # --- list + summary ---
    def test_list_returns_published_with_distribution(self):
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        for score in (5, 5, 3):
            buyer = _make_user(self.conn)
            _make_order(self.conn, buyer, product)
            self.conn.commit()
            _, p = _submit_review(buyer, product, rating=score)
            _approve(admin, p["id"])
        h = FakeHandler(user_id=None)
        _, payload = _call(h.api_guide_product_reviews, self.conn, product, {})
        self.assertEqual(len(payload["items"]), 3)
        self.assertEqual(payload["summary"]["ratingCount"], 3)
        dist = {d["star"]: d["count"] for d in payload["summary"]["distribution"]}
        self.assertEqual(dist[5], 2)
        self.assertEqual(dist[3], 1)
        self.assertAlmostEqual(payload["summary"]["ratingAvg"], round((5 + 5 + 3) / 3, 2))

    def test_anonymous_review_hides_author(self):
        buyer = _make_user(self.conn)
        admin = _make_user(self.conn, role="admin")
        product = _make_product(self.conn)
        _make_order(self.conn, buyer, product)
        self.conn.commit()
        _, p = _submit_review(buyer, product, rating=5, anonymous=True)
        _approve(admin, p["id"])
        h = FakeHandler(user_id=None)
        _, payload = _call(h.api_guide_product_reviews, self.conn, product, {})
        self.assertTrue(payload["items"][0]["anonymous"])
        self.assertIsNone(payload["items"][0]["author"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
