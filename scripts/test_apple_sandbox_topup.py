#!/usr/bin/env python3
"""Machi Points (consumable) Apple IAP verify — production环境的沙盒/凭证契约。

回归背景:曾在 api_wallet_topup_apple_verify 里加过一条
    if PRODUCTION and is_sandbox_txn:
        raise APIError("沙盒交易不能在生产环境充值", 403, ...)
这条会把 **App Review 审核员**(审核内购一律走 Sandbox 环境、即使针对生产构建
/生产后端)的每一次点数购买硬拒 403 → 内购必被拒审。会员路径从不拒沙盒(改为
标记 ios_sandbox + 封顶),点数路径必须同策略。此测试把正确契约锁死:

  1) PRODUCTION + Sandbox 收据  → 照常入账(200),订单标记 client_type='ios_sandbox'
     (后台营收核算已排除该标记),绝不抛 sandbox_not_allowed_in_production。
  2) PRODUCTION + 非沙盒真实收据 + 缺 appAccountToken → 拒 403 apple_account_token_required
     (把收据绑定到归属者的护栏必须保留)。
  3) PRODUCTION + 非沙盒真实收据 + 匹配 appAccountToken → 入账(200),标记 'ios'。

不依赖真实 Apple 签名:monkeypatch verify_apple_transaction 返回受控 payload,
从而只考验端点自身的环境/凭证判定(签名链校验另由 test_apple_iap_hardening.py 覆盖)。

Run:  cd web && python3 scripts/test_apple_sandbox_topup.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_apple_sbx_topup_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

APPLE_PRODUCT_ID = "machi_points_1800"  # seed maps apple_product_id = pack key


def _make_user(conn) -> dict:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def _call_verify(conn, user: dict, *, txn_id: str, environment: str, app_account_token: str | None):
    """Invoke the real endpoint with a controlled (patched) apple payload.
    Returns ("ok", data) on success or ("err", (code, status)) on APIError."""
    payload = {
        "transactionId": txn_id,
        "originalTransactionId": "orig-" + txn_id,
        "productId": APPLE_PRODUCT_ID,
        "environment": environment,
        "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi",
    }
    if app_account_token is not None:
        payload["appAccountToken"] = app_account_token

    real_verify = server.verify_apple_transaction
    server.verify_apple_transaction = lambda signed, product_id=None: dict(payload)  # type: ignore[assignment]

    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: user  # type: ignore[method-assign]
    h.read_json = lambda: {  # type: ignore[method-assign]
        "signedTransaction": "unsigned.test.jws",
        "productId": APPLE_PRODUCT_ID,
        "transactionId": txn_id,
    }
    try:
        h.api_wallet_topup_apple_verify(conn)
        return ("ok", cap["data"])
    except server.APIError as e:  # type: ignore[attr-defined]
        return ("err", (e.code, e.status))
    finally:
        server.verify_apple_transaction = real_verify


def main() -> None:
    server.init_db()
    was_production = server.PRODUCTION
    server.PRODUCTION = True  # exercise the production guards
    try:
        with server.DB_LOCK, server.db() as conn:
            pack = server.get_topup_product_by_apple(conn, APPLE_PRODUCT_ID)
            assert pack is not None, "seed must map a topup product to the apple product id"

            # 1) Sandbox in production → credited + tagged ios_sandbox, NEVER rejected.
            user = _make_user(conn)
            kind, res = _call_verify(conn, user, txn_id="sbx-t-001", environment="Sandbox", app_account_token=None)
            assert kind == "ok", f"sandbox topup must NOT be rejected in production, got {res}"
            granted = int(res.get("grantedPoints") or 0)  # base + bonus, per pack config
            assert granted > 0, f"endpoint granted no points: {res}"
            bal = server.get_wallet_snapshot(conn, user["id"])["balancePoints"]
            assert bal == granted, f"sandbox topup must credit points, balance={bal} expected={granted}"
            order = conn.execute(
                "SELECT client_type, status FROM wallet_topup_orders WHERE provider_trade_no = ?",
                ("apple:sbx-t-001",),
            ).fetchone()
            assert order and order["status"] in ("paid", "fulfilled"), dict(order) if order else None
            assert order["client_type"] == "ios_sandbox", order["client_type"]
            print("  ok: PROD sandbox topup credits points, tags ios_sandbox, not rejected")

            # 1b) Xcode env behaves like sandbox (also accepted + tagged).
            user_x = _make_user(conn)
            kind, res = _call_verify(conn, user_x, txn_id="xco-t-001", environment="Xcode", app_account_token=None)
            assert kind == "ok", f"xcode topup must NOT be rejected, got {res}"
            ox = conn.execute(
                "SELECT client_type FROM wallet_topup_orders WHERE provider_trade_no = ?",
                ("apple:xco-t-001",),
            ).fetchone()
            assert ox and ox["client_type"] == "ios_sandbox", dict(ox) if ox else None
            print("  ok: PROD xcode topup accepted + tagged ios_sandbox")

            # 2) Production real txn missing appAccountToken → 403 apple_account_token_required.
            user2 = _make_user(conn)
            kind, res = _call_verify(conn, user2, txn_id="prod-noTok", environment="Production", app_account_token=None)
            assert kind == "err" and res[0] == "apple_account_token_required" and res[1] == 403, res
            assert server.get_wallet_snapshot(conn, user2["id"])["balancePoints"] == 0, "no credit on rejected txn"
            print("  ok: PROD real topup without appAccountToken → 403 apple_account_token_required (guard preserved)")

            # 3) Production real txn with matching appAccountToken → credited + tagged ios.
            user3 = _make_user(conn)
            kind, res = _call_verify(conn, user3, txn_id="prod-ok", environment="Production", app_account_token=user3["id"])
            assert kind == "ok", f"valid production topup must succeed, got {res}"
            assert server.get_wallet_snapshot(conn, user3["id"])["balancePoints"] == granted, "production credit"
            o3 = conn.execute(
                "SELECT client_type FROM wallet_topup_orders WHERE provider_trade_no = ?",
                ("apple:prod-ok",),
            ).fetchone()
            assert o3 and o3["client_type"] == "ios", dict(o3) if o3 else None
            print("  ok: PROD real topup with matching appAccountToken → credited + tagged ios")

            # 4) Cross-account token mismatch → 403 (pre-existing guard still holds).
            user4 = _make_user(conn)
            kind, res = _call_verify(conn, user4, txn_id="prod-mismatch", environment="Production",
                                     app_account_token=str(uuid.uuid4()))
            assert kind == "err" and res[0] == "apple_account_token_mismatch" and res[1] == 403, res
            print("  ok: PROD topup with foreign appAccountToken → 403 apple_account_token_mismatch")

        print("test_apple_sandbox_topup: ALL OK")
    finally:
        server.PRODUCTION = was_production


if __name__ == "__main__":
    main()
