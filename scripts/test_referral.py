#!/usr/bin/env python3
"""Tests for 邀请裂变 (referral growth loop): stable code minting, pending-only
binding, first-post qualification paying BOTH sides once (三层幂等), and the
anti-abuse gates (self-referral, one-invite-per-user, same-IP cluster hold,
inviter-account-<48h withholds only the inviter award, daily/total caps).

Exercises the real SCHEMA + MIGRATIONS (v99) startup chain against a throwaway
SQLite DB and the real wallet ledger (so payout idempotency is end-to-end). No
HTTP server, no network, never touches the real kaix.db.

Run:  cd web && python3 scripts/test_referral.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_referral_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_referral as referral  # noqa: E402


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _make_user(conn, handle: str | None = None, *, joined_at: str | None = None) -> str:
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = joined_at or server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, server.now_iso(), server.now_iso()),
    )
    return uid


def _balance(conn, uid: str) -> int:
    return server.get_wallet_snapshot(conn, uid)["balancePoints"]


def _ledger_count(conn, uid: str, entry_type="referral_bonus") -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM wallet_ledger_entries WHERE user_id = ? AND entry_type = ?",
        (uid, entry_type),
    ).fetchone()
    return int(dict(row)["c"])


def _qualify(conn, invitee_id: str):
    """Drive qualification through the real @money_atomic boundary in server."""
    return server.qualify_referral_atomic(conn, invitee_id)


class ReferralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()
        # An inviter old enough to earn the inviter award by default.
        old = _iso(datetime.now(timezone.utc) - timedelta(hours=72))
        self.inviter = _make_user(self.conn, joined_at=old)

    def tearDown(self):
        self.conn.close()

    # 1. code is stable + idempotent
    def test_code_stable_and_idempotent(self):
        c1 = referral.ensure_referral_code(self.conn, self.inviter)
        c2 = referral.ensure_referral_code(self.conn, self.inviter)
        self.assertEqual(c1, c2)
        self.assertTrue(c1.isupper())
        # no confusable glyphs
        for bad in "01OI":
            self.assertNotIn(bad, c1)
        # resolves back to the owner
        self.assertEqual(referral.resolve_code(self.conn, c1), self.inviter)
        # lookup is case-insensitive on input
        self.assertEqual(referral.resolve_code(self.conn, c1.lower()), self.inviter)

    # 2. binding does NOT pay out; creates a pending row
    def test_bind_no_reward(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        invitee = _make_user(self.conn)
        out = referral.bind_referral(self.conn, code, invitee, "9.9.9.1")
        self.assertTrue(out["bound"])
        row = dict(self.conn.execute(
            "SELECT * FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone())
        self.assertEqual(row["status"], "pending")
        self.assertEqual(row["reward_state"], "none")
        self.assertEqual(_balance(self.conn, self.inviter), 0)
        self.assertEqual(_balance(self.conn, invitee), 0)

    # 3. first post qualifies → both sides paid exactly once
    def test_qualify_pays_both_sides(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        invitee = _make_user(self.conn)
        referral.bind_referral(self.conn, code, invitee, "9.9.9.2")
        res = _qualify(self.conn, invitee)
        self.assertTrue(res["qualified"])
        self.assertEqual(_balance(self.conn, self.inviter), referral.REFERRAL_INVITER_POINTS)
        self.assertEqual(_balance(self.conn, invitee), referral.REFERRAL_INVITEE_POINTS)
        self.assertEqual(_ledger_count(self.conn, self.inviter), 1)
        self.assertEqual(_ledger_count(self.conn, invitee), 1)
        row = dict(self.conn.execute(
            "SELECT * FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone())
        self.assertEqual(row["status"], "rewarded")
        self.assertEqual(row["reward_state"], "both_paid")
        # referral_bonus is bonus-natured → lands in lifetime_bonus_points
        snap = server.get_wallet_snapshot(self.conn, self.inviter)
        self.assertEqual(snap["lifetimeBonusPoints"], referral.REFERRAL_INVITER_POINTS)

    # 4. replay of qualify is a no-op (三层幂等)
    def test_qualify_replay_idempotent(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        invitee = _make_user(self.conn)
        referral.bind_referral(self.conn, code, invitee, "9.9.9.3")
        _qualify(self.conn, invitee)
        for _ in range(5):
            r = _qualify(self.conn, invitee)
            self.assertTrue(r["duplicate"])
        self.assertEqual(_balance(self.conn, self.inviter), referral.REFERRAL_INVITER_POINTS)
        self.assertEqual(_balance(self.conn, invitee), referral.REFERRAL_INVITEE_POINTS)
        self.assertEqual(_ledger_count(self.conn, self.inviter), 1)
        self.assertEqual(_ledger_count(self.conn, invitee), 1)

    # 5. a user can only be invited once
    def test_one_invite_per_user(self):
        code_a = referral.ensure_referral_code(self.conn, self.inviter)
        other = _make_user(self.conn, joined_at=_iso(datetime.now(timezone.utc) - timedelta(hours=72)))
        code_b = referral.ensure_referral_code(self.conn, other)
        invitee = _make_user(self.conn)
        first = referral.bind_referral(self.conn, code_a, invitee, "9.9.9.4")
        self.assertTrue(first["bound"])
        second = referral.bind_referral(self.conn, code_b, invitee, "9.9.9.4")
        self.assertFalse(second["bound"])
        self.assertEqual(second["reason"], "already_bound")
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone()
        self.assertEqual(dict(n)["c"], 1)
        # still bound to the FIRST inviter
        row = dict(self.conn.execute(
            "SELECT inviter_id FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone())
        self.assertEqual(row["inviter_id"], self.inviter)

    # 6. self-referral is blocked (code owner binds themselves)
    def test_self_referral_blocked(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        out = referral.bind_referral(self.conn, code, self.inviter, "9.9.9.5")
        self.assertFalse(out["bound"])
        self.assertEqual(out["reason"], "self_referral")
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM referrals WHERE invitee_id = ?", (self.inviter,)).fetchone()
        self.assertEqual(dict(n)["c"], 0)

    # 7. bad / blank code silently ignored (never blocks registration)
    def test_bad_code_ignored(self):
        invitee = _make_user(self.conn)
        for bad in ("", "   ", "ZZZZZZZ", "not-a-code"):
            out = referral.bind_referral(self.conn, bad, invitee, "9.9.9.6")
            self.assertFalse(out["bound"])
        n = self.conn.execute(
            "SELECT COUNT(*) AS c FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone()
        self.assertEqual(dict(n)["c"], 0)

    # 8. same-IP cluster over threshold → rejected/hold, no auto payout
    def test_ip_cluster_rejected(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        ip = "5.5.5.5"
        invitees = []
        # bind REFERRAL_IP_CLUSTER_MAX + 1 invitees from the same IP
        for _ in range(referral.REFERRAL_IP_CLUSTER_MAX + 1):
            v = _make_user(self.conn)
            referral.bind_referral(self.conn, code, v, ip)
            invitees.append(v)
        # the LAST one qualifying trips the cluster gate (count > MAX)
        last = invitees[-1]
        res = _qualify(self.conn, last)
        self.assertTrue(res["rejected"])
        self.assertEqual(res["reason"], "ip_cluster")
        self.assertEqual(_balance(self.conn, last), 0)
        row = dict(self.conn.execute(
            "SELECT * FROM referrals WHERE invitee_id = ?", (last,)).fetchone())
        self.assertEqual(row["status"], "rejected")
        self.assertEqual(row["reward_state"], "blocked")
        # admin approve pays both sides
        out = server.admin_review_referral_atomic(self.conn, row["id"], "approve")
        self.assertTrue(out["ok"])
        self.assertEqual(_balance(self.conn, last), referral.REFERRAL_INVITEE_POINTS)
        self.assertEqual(_ledger_count(self.conn, last), 1)

    # 9. inviter account <48h → invitee paid, inviter award withheld
    def test_young_inviter_withheld(self):
        young = _make_user(self.conn, joined_at=_iso(datetime.now(timezone.utc) - timedelta(hours=2)))
        code = referral.ensure_referral_code(self.conn, young)
        invitee = _make_user(self.conn)
        referral.bind_referral(self.conn, code, invitee, "7.7.7.7")
        res = _qualify(self.conn, invitee)
        self.assertTrue(res["qualified"])
        self.assertTrue(res["invitee_paid"])
        self.assertFalse(res["inviter_paid"])
        self.assertEqual(_balance(self.conn, invitee), referral.REFERRAL_INVITEE_POINTS)
        self.assertEqual(_balance(self.conn, young), 0)
        row = dict(self.conn.execute(
            "SELECT * FROM referrals WHERE invitee_id = ?", (invitee,)).fetchone())
        self.assertEqual(row["reward_state"], "invitee_paid")
        self.assertEqual(row["status"], "rewarded")

    # 10. summary reflects counts + earned points
    def test_summary_read_model(self):
        code = referral.ensure_referral_code(self.conn, self.inviter)
        v1 = _make_user(self.conn)
        v2 = _make_user(self.conn)
        referral.bind_referral(self.conn, code, v1, "8.8.8.1")
        referral.bind_referral(self.conn, code, v2, "8.8.8.2")
        _qualify(self.conn, v1)  # only v1 posts → qualifies
        summary = referral.referral_summary(self.conn, self.inviter, share_base="https://machicity.com")
        self.assertEqual(summary["code"], code)
        self.assertEqual(summary["shareUrl"], f"https://machicity.com/i/{code}")
        self.assertEqual(summary["invitedCount"], 2)
        self.assertEqual(summary["qualifiedCount"], 1)
        self.assertEqual(summary["pointsEarned"], referral.REFERRAL_INVITER_POINTS)
        self.assertEqual(len(summary["recentInvitees"]), 2)

    # 11. qualify without any referral is a harmless no-op (non-invited users)
    def test_qualify_no_referral(self):
        stranger = _make_user(self.conn)
        res = _qualify(self.conn, stranger)
        self.assertFalse(res["qualified"])
        self.assertEqual(res["reason"], "no_referral")
        self.assertEqual(_balance(self.conn, stranger), 0)

    # 12. inviter total cap withholds inviter award once exhausted
    def test_inviter_total_cap(self):
        # Force the inviter to already sit at the total cap by seeding rewarded rows.
        cap = referral.REFERRAL_INVITER_TOTAL_CAP
        now = server.now_iso()
        for _ in range(cap):
            self.conn.execute(
                "INSERT INTO referrals (id, inviter_id, invitee_id, code, status, reward_state, "
                "signup_ip, qualified_at, rewarded_at, created_at) "
                "VALUES (?, ?, ?, 'X', 'rewarded', 'both_paid', '', ?, ?, ?)",
                (str(uuid.uuid4()), self.inviter, str(uuid.uuid4()), now, now, now),
            )
        code = referral.ensure_referral_code(self.conn, self.inviter)
        invitee = _make_user(self.conn)
        referral.bind_referral(self.conn, code, invitee, "3.3.3.3")
        res = _qualify(self.conn, invitee)
        self.assertTrue(res["qualified"])
        self.assertTrue(res["invitee_paid"])
        self.assertFalse(res["inviter_paid"])
        self.assertEqual(_balance(self.conn, invitee), referral.REFERRAL_INVITEE_POINTS)
        self.assertEqual(_balance(self.conn, self.inviter), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
