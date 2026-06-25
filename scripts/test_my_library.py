#!/usr/bin/env python3
"""Tests the unified purchase-after view (GET /api/guide/my-library).

Exercises the real Handler.api_guide_my_library against a throwaway SQLite DB
with a stubbed session — verifies that a points-purchased material, a member-
unlocked resource, a service request and both order kinds (purchase + topup)
surface correctly, and that no paid content leaks into the list.

Run:  cd web && python3 scripts/test_my_library.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_mylib_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


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


def _make_product(conn, *, wallet_price=300, member_included=0, purchase_content="付费正文", title="测试资料") -> dict:
    pid = str(uuid.uuid4())
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, category_key, product_type, price, currency, "
        "is_free, is_paid, is_digital, is_service, is_coming_soon, is_member_included, status, wallet_eligible, "
        "wallet_price_points, member_wallet_price_points, purchase_content, file_url, fulfillment_type, "
        "entitlement_type, platform_policy, created_at, updated_at) "
        "VALUES (?, ?, ?, 'guide_services', 'pdf_material', 0, 'CNY', 0, 1, 1, 0, 0, ?, 'published', 1, ?, 0, ?, "
        "'https://example.com/f.pdf', 'digital_unlock', 'guide_product', 'digital_iap_required', ?, ?)",
        (pid, title, "p-" + pid[:8], member_included, wallet_price, purchase_content, now, now),
    )
    return dict(conn.execute("SELECT * FROM guide_products WHERE id = ?", (pid,)).fetchone())


def _call(conn, uid) -> dict:
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = lambda c: {"user_id": uid}  # type: ignore[method-assign]
    h.api_guide_my_library(conn, {})
    return captured["data"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        uid = _make_user(conn)

        # Points purchase → entitlement + a fulfilled guide_order.
        server.wallet_post_ledger(conn, uid, "topup", 5000)
        bought = _make_product(conn, wallet_price=300, title="已购资料")
        res = server.wallet_debit_for_product(conn, uid, bought)
        assert res["status"] == "fulfilled", res

        # A member-included resource the user did NOT buy (must show as member-unlocked).
        member_res = _make_product(conn, member_included=1, title="会员专属")

        # A pending wallet top-up order.
        pack = server.get_topup_product(conn, "machi_points_600")
        server.create_wallet_topup_order(conn, uid, pack, "stripe", "web")

        # A service request.
        now = server.now_iso()
        conn.execute(
            "INSERT INTO guide_service_requests (id, user_id, product_id, service_type, status, created_at, updated_at) "
            "VALUES (?, ?, '', 'consultation', 'pending', ?, ?)",
            (str(uuid.uuid4()), uid, now, now),
        )
        conn.commit()

        # Non-member view first: member resource must NOT appear.
        data = _call(conn, uid)
        assert data["status"] == "ok"
        assert data["isMember"] is False
        ids = {m["id"] for m in data["materials"]}
        assert bought["id"] in ids, "purchased material must appear"
        assert member_res["id"] not in ids, "member resource must not show for non-member"
        own = next(m for m in data["materials"] if m["id"] == bought["id"])
        assert own["entitlementSource"] == "own"
        assert own["hasFile"] is True
        # No paid content leaks into the library list.
        for m in data["materials"]:
            assert not m.get("purchaseContent"), "paid content must not leak in list view"

        assert len(data["services"]) == 1, data["services"]
        kinds = {o["kind"] for o in data["orders"]}
        assert kinds == {"purchase", "topup"}, kinds
        # Orders are newest-first.
        ats = [o["createdAt"] for o in data["orders"]]
        assert ats == sorted(ats, reverse=True), "orders must be newest-first"

        # Now make the user an active member → member resource appears as "member".
        server.activate_or_extend_membership(conn, uid, server.MEMBERSHIP_PLAN_MONTHLY_KEY, "manual", periods=1)
        conn.commit()
        data2 = _call(conn, uid)
        assert data2["isMember"] is True
        m_item = next((m for m in data2["materials"] if m["id"] == member_res["id"]), None)
        assert m_item is not None, "member resource must appear for active member"
        assert m_item["entitlementSource"] == "member"

        print("OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
