#!/usr/bin/env python3
"""Finance multi-currency fix (O3): the finance summary/trend must report a
SINGLE ledger currency and never blindly add JPY + CNY into one number.

Verifies:
  * ledger currency = the user's most-used currency (default JPY)
  * summary income/expense sum ONLY ledger-currency rows (not mixed)
  * otherCurrencyCount reports the excluded non-ledger entries
  * trend sums only the ledger currency
  * a CNY-dominant user resolves to a CNY ledger
  * an all-JPY user is byte-identical to before (zero regression)

Run:  cd web && python3 scripts/test_finance_currency.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_finance_cur_test_", suffix=".db")[1]
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


def _tx(conn, uid, kind, amount, currency, category="other", on="2026-06-15"):
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_transactions (id, user_id, kind, amount, currency, category, occurred_on, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), uid, kind, amount, currency, category, on, now, now),
    )


def _summary(conn, uid, month="2026-06"):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: {"id": uid}  # type: ignore[method-assign]
    h.api_guide_finance_summary(conn, {"month": month})
    return cap["data"]


def _trend(conn, uid, month="2026-06"):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.require_user = lambda c: {"id": uid}  # type: ignore[method-assign]
    h.api_guide_finance_trend(conn, {"month": month, "months": "1"})
    return cap["data"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        # --- mixed JPY/CNY user: JPY is most-used → ledger=JPY ---
        u = _make_user(conn)
        for _ in range(3):
            _tx(conn, u, "expense", 1000, "JPY")
        _tx(conn, u, "income", 5000, "JPY")
        _tx(conn, u, "expense", 500, "CNY")
        _tx(conn, u, "expense", 500, "CNY")

        s = _summary(conn, u)
        assert s["currency"] == "JPY" and s["ledgerCurrency"] == "JPY", s["currency"]
        # expense must be 3*1000 = 3000 (JPY only), NOT 3000+1000(CNY) = 4000
        assert s["expense"] == 3000, f"expected JPY-only 3000, got {s['expense']} (currency mixing!)"
        assert s["income"] == 5000, s["income"]
        assert s["net"] == 2000, s["net"]
        assert s["otherCurrencyCount"] == 2, s["otherCurrencyCount"]

        t = _trend(conn, u)
        assert t["ledgerCurrency"] == "JPY"
        assert t["months"][0]["expense"] == 3000, t["months"][0]

        # --- CNY-dominant user → ledger=CNY ---
        u2 = _make_user(conn)
        for _ in range(4):
            _tx(conn, u2, "expense", 200, "CNY")
        _tx(conn, u2, "expense", 9999, "JPY")  # one JPY outlier must NOT pollute the CNY sum
        s2 = _summary(conn, u2)
        assert s2["currency"] == "CNY", s2["currency"]
        assert s2["expense"] == 800, f"expected CNY-only 800, got {s2['expense']}"
        assert s2["otherCurrencyCount"] == 1, s2["otherCurrencyCount"]

        # --- all-JPY user → identical to legacy behavior (zero regression) ---
        u3 = _make_user(conn)
        _tx(conn, u3, "expense", 1500, "JPY")
        _tx(conn, u3, "income", 4000, "JPY")
        s3 = _summary(conn, u3)
        assert s3["currency"] == "JPY"
        assert s3["expense"] == 1500 and s3["income"] == 4000
        assert s3["otherCurrencyCount"] == 0

        # --- empty user → defaults to JPY, no crash ---
        u4 = _make_user(conn)
        s4 = _summary(conn, u4)
        assert s4["currency"] == "JPY" and s4["expense"] == 0 and s4["income"] == 0

        print("test_finance_currency: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
