"""邀请裂变 (referral / invite growth loop) — product module.

Zero-cash growth: a user shares a stable invite code; a new user who registers
with it and then performs a *valuable* first action (posting their first 帖)
earns both sides Machi Points (虚拟点数, an accounting liability — never cash).

Like ``server_partners.py`` this is a deliberately SEPARATE, mostly-pure module
so it unit-tests in isolation and keeps new product logic out of the 38k-line
``server.py`` monolith. To avoid a circular import it imports NOTHING from
``server``: everything is a sqlite3-shaped ``conn`` + stdlib + injected
callables. In particular the ONE money mutation (``wallet_post_ledger``) and the
``@money_atomic`` wrapper live in server.py and are injected — this module never
owns a second copy of the money truth, it only *calls* the ledger.

State machine (referrals.status):
    pending → qualified → rewarded        (happy path, on first valuable action)
    pending → rejected                    (anti-abuse闸 tripped — human review)

reward_state mirrors the payout: none → both_paid / inviter_blocked / blocked.

Reward idempotency is THREE layers deep, so a replayed qualify never double-pays:
  1. CAS on referrals.status ('pending' → 'qualified', rowcount must be 1);
  2. two INDEPENDENT idempotency_key values ('referral-inviter:{id}' /
     'referral-invitee:{id}') passed to wallet_post_ledger;
  3. wallet_ledger_entries' own UNIQUE(user_id, idempotency_key) index.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

# ── economics / anti-abuse constants ────────────────────────────────────────

REFERRAL_INVITER_POINTS = 200        # 邀请人:被邀请人合格后发
REFERRAL_INVITEE_POINTS = 100        # 被邀请人:合格后发(注册即给 0,防刷)
REFERRAL_INVITER_DAILY_CAP = 10      # 单人单日最多因邀请得奖次数
REFERRAL_INVITER_TOTAL_CAP = 100     # 单人累计邀请得奖上限
REFERRAL_MIN_INVITER_AGE_HOURS = 48  # 邀请人账号需注册满 48h 才能发码得奖
REFERRAL_IP_CLUSTER_MAX = 3          # 同 IP 24h 内绑定超过 N 次 → 标记人工复核

REFERRAL_BONUS_ENTRY_TYPE = "referral_bonus"

# Code charset: uppercase alphanumerics minus the confusable glyphs 0/O/1/I so a
# code read aloud / typed by hand is unambiguous.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LEN = 7
_MAX_CODE_ATTEMPTS = 8


# ── time helpers (pure) ─────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        v = value.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(v)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


# ── invite code (one stable code per user) ──────────────────────────────────

def _random_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LEN))


def ensure_referral_code(conn, user_id: str, *, now: Optional[str] = None) -> str:
    """Return this user's invite code, minting one on first use. Idempotent:
    a second call returns the same code. Collisions on the UNIQUE code index are
    retried a few times before giving up."""
    row = conn.execute(
        "SELECT code FROM referral_codes WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row:
        return dict(row)["code"]
    ts = now or _now_iso()
    for _ in range(_MAX_CODE_ATTEMPTS):
        code = _random_code()
        try:
            conn.execute(
                "INSERT INTO referral_codes (user_id, code, created_at) VALUES (?, ?, ?)",
                (user_id, code, ts),
            )
            return code
        except Exception:
            # Either the code collided (UNIQUE code) or a concurrent call already
            # created this user's row (PK user_id). Re-read: if the row now
            # exists it was the latter and we return the winner's code.
            existing = conn.execute(
                "SELECT code FROM referral_codes WHERE user_id = ?", (user_id,)
            ).fetchone()
            if existing:
                return dict(existing)["code"]
            # else the code collided — loop and try a fresh code.
    raise RuntimeError("could not allocate a unique referral code")


def resolve_code(conn, code: str) -> Optional[str]:
    """Map an invite code → inviter user_id, or None for an unknown code."""
    code = (code or "").strip().upper()
    if not code:
        return None
    row = conn.execute(
        "SELECT user_id FROM referral_codes WHERE code = ?", (code,)
    ).fetchone()
    return dict(row)["user_id"] if row else None


# ── binding (called from api_register after the user row exists) ─────────────

def bind_referral(conn, code: str, invitee_id: str, signup_ip: str, *,
                  now: Optional[str] = None) -> dict[str, Any]:
    """Record a pending invite relationship. Never raises for user-input reasons
    (a bad/blank/self code must NOT block registration) and never pays out.

    Returns a small status dict for logging/tests:
      {bound: bool, reason: str, referral_id: str|None, inviter_id: str|None}
    """
    result = {"bound": False, "reason": "", "referral_id": None, "inviter_id": None}
    inviter_id = resolve_code(conn, code)
    if not inviter_id:
        result["reason"] = "unknown_code"
        return result
    if inviter_id == invitee_id:
        # 自邀防护 — a fresh invitee id essentially never collides, but a later
        # /bind call by an already-registered user could, so we guard here too.
        result["reason"] = "self_referral"
        return result
    # A user can only be invited ONCE — UNIQUE(invitee_id) is the hard floor, and
    # INSERT OR IGNORE swallows the race. We check first only to return a clean
    # reason; the DB constraint is the real guarantee.
    if conn.execute("SELECT 1 FROM referrals WHERE invitee_id = ?", (invitee_id,)).fetchone():
        result["reason"] = "already_bound"
        return result
    ts = now or _now_iso()
    referral_id = str(uuid.uuid4())
    normalized_code = (code or "").strip().upper()
    conn.execute(
        "INSERT OR IGNORE INTO referrals "
        "(id, inviter_id, invitee_id, code, status, reward_state, signup_ip, "
        " qualified_at, rewarded_at, created_at) "
        "VALUES (?, ?, ?, ?, 'pending', 'none', ?, '', '', ?)",
        (referral_id, inviter_id, invitee_id, normalized_code, signup_ip or "", ts),
    )
    # Re-read to learn whether OUR insert won (vs a concurrent bind of the same
    # invitee slipping in under INSERT OR IGNORE).
    row = conn.execute(
        "SELECT id, inviter_id FROM referrals WHERE invitee_id = ?", (invitee_id,)
    ).fetchone()
    if row and dict(row)["id"] == referral_id:
        result.update(bound=True, reason="ok", referral_id=referral_id, inviter_id=inviter_id)
    else:
        result["reason"] = "already_bound"
    return result


# ── anti-abuse gate ─────────────────────────────────────────────────────────

def _fraud_check(conn, referral: dict[str, Any], *, now: Optional[str] = None) -> dict[str, Any]:
    """Decide whether an invite is allowed to pay out.

    Returns {ok, block_inviter, block_all, reason}:
      - ok=False + block_all=True  → reject the whole referral (human review).
      - ok=True  + block_inviter    → still pay the invitee, withhold inviter奖.
      - ok=True  + no blocks        → pay both sides.
    """
    inviter_id = referral["inviter_id"]
    invitee_id = referral["invitee_id"]
    now_dt = _parse_iso(now or _now_iso()) or _now()

    # 自邀请 — belt & suspenders (bind_referral already guards this).
    if inviter_id == invitee_id:
        return {"ok": False, "block_inviter": True, "block_all": True, "reason": "self_referral"}

    # 同 IP 聚类: too many binds from the same trusted IP inside 24h → hold for
    # human review instead of auto-paying a batch of sock-puppets.
    signup_ip = (referral.get("signup_ip") or "").strip()
    if signup_ip:
        window_start = (now_dt - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        cluster = conn.execute(
            "SELECT COUNT(*) AS c FROM referrals WHERE signup_ip = ? AND created_at >= ?",
            (signup_ip, window_start),
        ).fetchone()
        if int(dict(cluster)["c"]) > REFERRAL_IP_CLUSTER_MAX:
            return {"ok": False, "block_inviter": True, "block_all": True, "reason": "ip_cluster"}

    block_inviter = False
    reason = ""

    # 邀请人账号 <48h: a freshly minted account spraying invites is the classic
    # self-farm. Still reward the (real) invitee, but withhold the inviter奖.
    inviter_row = conn.execute(
        "SELECT joined_at FROM users WHERE id = ?", (inviter_id,)
    ).fetchone()
    if inviter_row:
        joined = _parse_iso(dict(inviter_row).get("joined_at") or "")
        if joined and (now_dt - joined) < timedelta(hours=REFERRAL_MIN_INVITER_AGE_HOURS):
            block_inviter = True
            reason = "inviter_too_young"

    # 日/总上限: cap how many invite bonuses one inviter can bank per day and
    # in total, so a viral loop can't mint unbounded liability.
    if not block_inviter:
        day_start = (now_dt - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        daily = conn.execute(
            "SELECT COUNT(*) AS c FROM referrals "
            "WHERE inviter_id = ? AND rewarded_at >= ? AND reward_state IN ('both_paid','inviter_paid')",
            (inviter_id, day_start),
        ).fetchone()
        if int(dict(daily)["c"]) >= REFERRAL_INVITER_DAILY_CAP:
            block_inviter = True
            reason = "inviter_daily_cap"
    if not block_inviter:
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM referrals "
            "WHERE inviter_id = ? AND reward_state IN ('both_paid','inviter_paid')",
            (inviter_id,),
        ).fetchone()
        if int(dict(total)["c"]) >= REFERRAL_INVITER_TOTAL_CAP:
            block_inviter = True
            reason = "inviter_total_cap"

    return {"ok": True, "block_inviter": block_inviter, "block_all": False, "reason": reason}


# ── qualify + payout (the ONE money path) ───────────────────────────────────

def qualify_referral(conn, invitee_id: str, *, post_ledger: Callable[..., Any],
                     now: Optional[str] = None) -> dict[str, Any]:
    """Advance a pending referral to rewarded on the invitee's first valuable
    action, paying both sides via the injected ``post_ledger`` (server's
    ``wallet_post_ledger``). MUST run inside an outer ``@money_atomic`` (the
    caller in server.py wraps it) so the CAS + both ledger writes commit as one.

    Idempotent: the CAS on status makes a replay a no-op, and each side's award
    carries a stable idempotency_key so even a torn/re-run payout only lands once.
    """
    result = {"qualified": False, "rejected": False, "duplicate": False,
              "inviter_paid": False, "invitee_paid": False, "reason": ""}
    row = conn.execute(
        "SELECT * FROM referrals WHERE invitee_id = ?", (invitee_id,)
    ).fetchone()
    if not row:
        result["reason"] = "no_referral"
        return result
    referral = dict(row)
    status = referral.get("status") or "pending"
    if status != "pending":
        # Already qualified/rewarded/rejected — replay is a no-op.
        result["duplicate"] = True
        result["reason"] = f"status_{status}"
        return result

    ts = now or _now_iso()
    referral_id = referral["id"]
    inviter_id = referral["inviter_id"]

    gate = _fraud_check(conn, referral, now=ts)
    if gate["block_all"]:
        # Reject and park for human review — CAS-guarded so a concurrent qualify
        # can't also flip it.
        conn.execute(
            "UPDATE referrals SET status = 'rejected', reward_state = 'blocked' "
            "WHERE invitee_id = ? AND status = 'pending'",
            (invitee_id,),
        )
        result["rejected"] = True
        result["reason"] = gate["reason"] or "rejected"
        return result

    # CAS: claim the pending → qualified transition. Losing the race means a
    # concurrent worker already handled this invitee.
    cas = conn.execute(
        "UPDATE referrals SET status = 'qualified', qualified_at = ? "
        "WHERE invitee_id = ? AND status = 'pending'",
        (ts, invitee_id),
    )
    if cas.rowcount != 1:
        result["duplicate"] = True
        result["reason"] = "cas_lost"
        return result

    # Pay the invitee (always, once qualified).
    invitee_res = post_ledger(
        conn, invitee_id, REFERRAL_BONUS_ENTRY_TYPE, REFERRAL_INVITEE_POINTS,
        source_type="referral", source_order_id=referral_id,
        idempotency_key=f"referral-invitee:{referral_id}",
        metadata={"role": "invitee", "inviter_id": inviter_id, "referral_id": referral_id},
    )
    result["invitee_paid"] = bool((invitee_res or {}).get("applied") or (invitee_res or {}).get("duplicate"))

    # Pay the inviter unless the gate withheld it (young account / caps).
    block_inviter = gate["block_inviter"]
    if not block_inviter:
        inviter_res = post_ledger(
            conn, inviter_id, REFERRAL_BONUS_ENTRY_TYPE, REFERRAL_INVITER_POINTS,
            source_type="referral", source_order_id=referral_id,
            idempotency_key=f"referral-inviter:{referral_id}",
            metadata={"role": "inviter", "invitee_id": invitee_id, "referral_id": referral_id},
        )
        result["inviter_paid"] = bool((inviter_res or {}).get("applied") or (inviter_res or {}).get("duplicate"))

    reward_state = "both_paid" if not block_inviter else "invitee_paid"
    conn.execute(
        "UPDATE referrals SET status = 'rewarded', reward_state = ?, rewarded_at = ? "
        "WHERE invitee_id = ? AND status = 'qualified'",
        (reward_state, ts, invitee_id),
    )
    result["qualified"] = True
    result["reason"] = gate["reason"] or "ok"
    return result


# ── admin review (approve a rejected referral out of the hold queue) ─────────

def admin_review_referral(conn, referral_id: str, action: str, *,
                          post_ledger: Callable[..., Any], now: Optional[str] = None) -> dict[str, Any]:
    """approve → treat a rejected referral as qualified and pay both sides;
    reject → leave it rejected (idempotent). Must run inside @money_atomic."""
    row = conn.execute("SELECT * FROM referrals WHERE id = ?", (referral_id,)).fetchone()
    if not row:
        return {"ok": False, "reason": "not_found"}
    referral = dict(row)
    ts = now or _now_iso()
    if action == "reject":
        conn.execute(
            "UPDATE referrals SET status = 'rejected', reward_state = 'blocked' WHERE id = ?",
            (referral_id,),
        )
        return {"ok": True, "action": "reject", "status": "rejected"}
    if action != "approve":
        return {"ok": False, "reason": "bad_action"}
    if referral.get("status") == "rewarded":
        return {"ok": True, "action": "approve", "status": "rewarded", "duplicate": True}
    invitee_id = referral["invitee_id"]
    inviter_id = referral["inviter_id"]
    # Pay both sides with the same stable idempotency keys — safe even if a prior
    # partial payout already landed one side.
    post_ledger(
        conn, invitee_id, REFERRAL_BONUS_ENTRY_TYPE, REFERRAL_INVITEE_POINTS,
        source_type="referral", source_order_id=referral_id,
        idempotency_key=f"referral-invitee:{referral_id}",
        metadata={"role": "invitee", "inviter_id": inviter_id, "referral_id": referral_id, "admin": True},
    )
    post_ledger(
        conn, inviter_id, REFERRAL_BONUS_ENTRY_TYPE, REFERRAL_INVITER_POINTS,
        source_type="referral", source_order_id=referral_id,
        idempotency_key=f"referral-inviter:{referral_id}",
        metadata={"role": "inviter", "invitee_id": invitee_id, "referral_id": referral_id, "admin": True},
    )
    conn.execute(
        "UPDATE referrals SET status = 'rewarded', reward_state = 'both_paid', "
        "qualified_at = CASE WHEN qualified_at = '' THEN ? ELSE qualified_at END, rewarded_at = ? WHERE id = ?",
        (ts, ts, referral_id),
    )
    return {"ok": True, "action": "approve", "status": "rewarded"}


# ── read models (战绩页 + admin queue) ───────────────────────────────────────

def referral_summary(conn, user_id: str, *, share_base: str = "https://machicity.com",
                     recent_limit: int = 20, now: Optional[str] = None) -> dict[str, Any]:
    """Data for the '我的邀请' 战绩页. Lazily mints the code."""
    code = ensure_referral_code(conn, user_id, now=now)
    rows = conn.execute(
        "SELECT r.*, u.handle AS invitee_handle, u.display_name AS invitee_name, "
        "       u.avatar_url AS invitee_avatar "
        "FROM referrals r LEFT JOIN users u ON u.id = r.invitee_id "
        "WHERE r.inviter_id = ? ORDER BY r.created_at DESC LIMIT ?",
        (user_id, int(recent_limit)),
    ).fetchall()
    recent = []
    invited_count = 0
    qualified_count = 0
    for r in rows:
        d = dict(r)
        invited_count += 1
        st = d.get("status") or "pending"
        if st in ("qualified", "rewarded"):
            qualified_count += 1
        recent.append({
            "referralId": d.get("id"),
            "status": st,
            "handle": d.get("invitee_handle") or "",
            "displayName": d.get("invitee_name") or "",
            "avatarUrl": d.get("invitee_avatar") or "",
            "createdAt": d.get("created_at") or "",
            "rewardedAt": d.get("rewarded_at") or "",
        })
    # invitedCount / qualifiedCount over the FULL history (not just the recent page).
    totals = conn.execute(
        "SELECT COUNT(*) AS invited, "
        "SUM(CASE WHEN status IN ('qualified','rewarded') THEN 1 ELSE 0 END) AS qualified "
        "FROM referrals WHERE inviter_id = ?",
        (user_id,),
    ).fetchone()
    td = dict(totals) if totals else {}
    invited_count = int(td.get("invited") or 0)
    qualified_count = int(td.get("qualified") or 0)
    # Points earned as inviter, straight from the ledger (source of truth).
    earned = conn.execute(
        "SELECT COALESCE(SUM(points_delta), 0) AS pts FROM wallet_ledger_entries "
        "WHERE user_id = ? AND entry_type = ? AND points_delta > 0",
        (user_id, REFERRAL_BONUS_ENTRY_TYPE),
    ).fetchone()
    points_earned = int(dict(earned)["pts"]) if earned else 0
    base = (share_base or "").rstrip("/")
    return {
        "code": code,
        "shareUrl": f"{base}/i/{code}",
        "invitedCount": invited_count,
        "qualifiedCount": qualified_count,
        "pointsEarned": points_earned,
        "inviterReward": REFERRAL_INVITER_POINTS,
        "inviteeReward": REFERRAL_INVITEE_POINTS,
        "recentInvitees": recent,
    }


def list_review_queue(conn, *, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """Rejected referrals awaiting human review (admin)."""
    rows = conn.execute(
        "SELECT r.*, iu.handle AS inviter_handle, vu.handle AS invitee_handle "
        "FROM referrals r "
        "LEFT JOIN users iu ON iu.id = r.inviter_id "
        "LEFT JOIN users vu ON vu.id = r.invitee_id "
        "WHERE r.status = 'rejected' ORDER BY r.created_at DESC LIMIT ? OFFSET ?",
        (int(limit), int(offset)),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "referralId": d.get("id"),
            "inviterId": d.get("inviter_id"),
            "inviterHandle": d.get("inviter_handle") or "",
            "inviteeId": d.get("invitee_id"),
            "inviteeHandle": d.get("invitee_handle") or "",
            "code": d.get("code") or "",
            "signupIp": d.get("signup_ip") or "",
            "rewardState": d.get("reward_state") or "",
            "createdAt": d.get("created_at") or "",
        })
    return out
