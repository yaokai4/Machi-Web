#!/usr/bin/env python3
"""Entitlement resolver (#7): GET /api/entitlement/resolve.

Collapses the three payment systems (membership-included / Machi Points /
one-time purchase) into one ordered `options` list + a single `recommended`
method. Verifies the resolver picks the right state and unlock options for:
  * a member-included product (guest) → recommend membership
  * a free product → state 'free', no options
  * a one-time paid product → a 'purchase' option, recommended purchase
  * a points-eligible product, 0 balance → 'points' option marked insufficient
  * a consultation/appointment product → 'consultation' option
  * an owned product (paid order) → state 'owned', no options

Run:  cd web && python3 scripts/test_entitlement_resolver.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_entitlement_test_", suffix=".db")[1]
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


def _product(conn, **flags) -> str:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    cols = {
        "id": pid, "title": flags.get("title", "测试资料"), "slug": "p-" + pid[:8],
        "status": "published", "country": "jp", "currency": "JPY",
        "price": 0, "is_free": 0, "is_paid": 1, "is_digital": 1, "is_service": 0,
        "is_member_included": 0, "is_coming_soon": 0, "is_price_hidden": 0,
        "is_appointment_only": 0, "wallet_eligible": 0, "wallet_price_points": 0,
        "created_at": now, "updated_at": now,
    }
    cols.update(flags)
    keys = list(cols.keys())
    conn.execute(
        f"INSERT INTO guide_products ({', '.join(keys)}) VALUES ({', '.join(['?'] * len(keys))})",
        [cols[k] for k in keys],
    )
    return pid


def _resolve(conn, product_id, uid=None):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = lambda c: ({"user_id": uid} if uid else None)  # type: ignore[method-assign]
    h.api_entitlement_resolve(conn, {"product": product_id, "country": "jp"})
    return cap["data"]["resolver"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        guest_searcher = _make_user(conn)

        # 1) member-included → recommend membership for a non-member
        member_pid = _product(conn, is_member_included=1, price=500)
        r = _resolve(conn, member_pid, uid=guest_searcher)
        assert r["state"] == "locked", r
        assert r["recommended"] == "membership", r["recommended"]
        assert r["options"][0]["method"] == "membership" and r["options"][0]["available"], r["options"]

        # 2) free → state free, no options
        free_pid = _product(conn, is_free=1, price=0, is_paid=0)
        r = _resolve(conn, free_pid)
        assert r["state"] == "free" and r["options"] == [], r

        # 3) one-time paid → purchase option, recommended purchase
        paid_pid = _product(conn, price=800)
        r = _resolve(conn, paid_pid)
        assert r["state"] == "locked", r
        methods = [o["method"] for o in r["options"]]
        assert "purchase" in methods, methods
        assert r["recommended"] == "purchase", r["recommended"]

        # 4) points-eligible, signed-in with 0 balance → insufficient points option
        points_pid = _product(conn, wallet_eligible=1, wallet_price_points=300, price=0)
        r = _resolve(conn, points_pid, uid=guest_searcher)
        pts = [o for o in r["options"] if o["method"] == "points"]
        assert pts, r["options"]
        assert pts[0]["sufficient"] is False and pts[0]["requiredPoints"] == 300, pts

        # 5) consultation / appointment-only → consultation option
        svc_pid = _product(conn, is_service=1, is_appointment_only=1, price=0)
        r = _resolve(conn, svc_pid)
        assert any(o["method"] == "consultation" for o in r["options"]), r["options"]
        assert r["recommended"] == "consultation", r["recommended"]

        # 6) owned (a paid guide_order) → state owned, no options
        owned_pid = _product(conn, price=500)
        conn.execute(
            "INSERT INTO guide_orders (id, user_id, product_id, order_no, status, created_at) "
            "VALUES (?, ?, ?, ?, 'paid', ?)",
            (str(uuid.uuid4()), guest_searcher, owned_pid, "ord-" + uuid.uuid4().hex[:10], server.now_iso()),
        )
        r = _resolve(conn, owned_pid, uid=guest_searcher)
        assert r["state"] == "owned" and r["options"] == [], r

        print("test_entitlement_resolver: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
