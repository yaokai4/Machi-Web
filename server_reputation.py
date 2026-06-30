"""Reputation system (scoring, levels, XP, events, limits, rewards) extracted from server.py.

Pure domain module: imports only stdlib + lower server_* modules (server_config /
server_core / server_apns), never server.py. The one in-process SSE notification
(HUB.publish on level-up) is injected via configure() at startup, mirroring
server_apns.configure — so this module stays import-cycle-free. server.py
re-exports every public name back for compatibility.
"""
from __future__ import annotations

import json
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from server_config import (
    REPUTATION_BADGE_DEFAULTS, REPUTATION_DEFAULT_SCORE, REPUTATION_LEVEL_DEFAULTS,
    REPUTATION_LIMIT_DEFAULTS, REPUTATION_MAX_RISK, REPUTATION_MAX_SCORE,
    REPUTATION_MIN_SCORE, REPUTATION_MIN_XP, REPUTATION_PRIVATE_STATUS_LABELS,
    REPUTATION_PUBLIC_TRUST_LABELS, REPUTATION_REWARD_DEFAULTS, REPUTATION_RULE_DEFAULTS,
)
from server_core import now_iso, parse_iso
import server_apns

# Injected by server.py at startup (mirrors server_apns.configure): the in-process
# SSE publish fn (HUB.publish). None until configured; level-up notifications are
# skipped if unset (no live subscribers during seed/tests), preserving behaviour.
_event_publish = None


def configure(event_publish) -> None:
    """Inject the in-process event publisher (HUB.publish)."""
    global _event_publish
    _event_publish = event_publish


def _slug_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return key[:80] or secrets.token_hex(6)



def reputation_status_for_score(score: int) -> str:
    score = max(REPUTATION_MIN_SCORE, min(int(score or 0), REPUTATION_MAX_SCORE))
    if score >= 90:
        return "excellent"
    if score >= 75:
        return "good"
    if score >= 60:
        return "normal"
    if score >= 40:
        return "watch"
    if score >= 20:
        return "limited"
    return "high_risk"


def reputation_status_payload(score: int, *, public: bool = False) -> dict[str, Any]:
    status = reputation_status_for_score(score)
    private = REPUTATION_PRIVATE_STATUS_LABELS.get(status, REPUTATION_PRIVATE_STATUS_LABELS["normal"])
    return {
        "status": status,
        "label": REPUTATION_PUBLIC_TRUST_LABELS.get(status, "待建立记录") if public else private["zh"],
        "label_zh": REPUTATION_PUBLIC_TRUST_LABELS.get(status, "待建立记录") if public else private["zh"],
        "label_en": private["en"],
        "label_ja": private["ja"],
    }


def _clamp_reputation_score(value: Any) -> int:
    try:
        return max(REPUTATION_MIN_SCORE, min(int(value), REPUTATION_MAX_SCORE))
    except Exception:
        return REPUTATION_DEFAULT_SCORE


def _clamp_risk_score(value: Any) -> int:
    try:
        return max(0, min(int(value), REPUTATION_MAX_RISK))
    except Exception:
        return 0


def _reputation_now_window(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def ensure_reputation_seed(conn: sqlite3.Connection) -> None:
    """Seed configurable reputation rules/levels and backfill user rows.

    The values are defaults, not front-end constants. Admin APIs can adjust
    rows later without shipping new clients.
    """
    now = now_iso()
    for level in REPUTATION_LEVEL_DEFAULTS:
        conn.execute(
            """
            INSERT INTO reputation_levels (
                level, xp_required, name_zh, name_en, name_ja,
                description_zh, description_en, description_ja,
                privileges_json, is_active, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(level) DO NOTHING
            """,
            (
                level["level"],
                level["xp"],
                level["zh"],
                level["en"],
                level["ja"],
                level["desc"],
                level["desc"],
                level["desc"],
                json.dumps(level["privileges"], ensure_ascii=False),
                now,
            ),
        )
        for idx, title in enumerate(level["privileges"]):
            key = _slug_key(f"level-{level['level']}-{title}")
            conn.execute(
                """
                INSERT INTO reputation_privileges (
                    id, level, key, title_zh, title_en, title_ja,
                    description_zh, is_active, sort_order, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(level, key) DO NOTHING
                """,
                (
                    str(uuid.uuid4()), level["level"], key, title, title, title,
                    f"Lv.{level['level']} 权益", idx + 1, now,
                ),
            )
    for rule in REPUTATION_RULE_DEFAULTS:
        conn.execute(
            """
            INSERT INTO reputation_rules (
                key, name_zh, name_en, name_ja, event_type, xp_delta,
                reputation_delta, risk_delta, daily_xp_cap, weekly_xp_cap,
                monthly_xp_cap, per_target_daily_xp_cap, is_one_time,
                requires_reviewed, notify_user, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (
                rule["key"], rule["name"], rule["name"], rule["name"], rule["kind"],
                int(rule["xp"]), int(rule["rep"]), int(rule["risk"]),
                int(rule["daily"]), int(rule["weekly"]), int(rule["monthly"]),
                int(rule["target_daily"]), int(rule["one_time"]), int(rule["reviewed"]),
                int(rule["notify"]), now, now,
            ),
        )
    for key, value in REPUTATION_LIMIT_DEFAULTS.items():
        conn.execute(
            """
            INSERT INTO reputation_limits (key, value, description, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (key, int(value), key.replace("_", " "), now),
        )
    for badge in REPUTATION_BADGE_DEFAULTS:
        conn.execute(
            """
            INSERT INTO badges (
                id, key, name_zh, name_en, name_ja, category, rarity,
                description_zh, is_official, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (
                str(uuid.uuid4()), badge["key"], badge["name"], badge["name"], badge["name"],
                badge["category"], badge["rarity"], f"Machi 城市声望徽章：{badge['name']}",
                1 if badge["rarity"] in {"official", "epic"} else 0, now, now,
            ),
        )
    for reward in REPUTATION_REWARD_DEFAULTS:
        conn.execute(
            """
            INSERT INTO reputation_rewards (
                id, key, name_zh, name_en, name_ja, reward_type, required_level,
                quantity, metadata, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (
                str(uuid.uuid4()), reward["key"], reward["name"], reward["name"],
                reward["name"], reward["type"], int(reward["level"]),
                int(reward["quantity"]), now, now,
            ),
        )
    for row in conn.execute("SELECT id FROM users WHERE deleted_at IS NULL"):
        reputation_ensure_user(conn, row["id"])


def reputation_level_for_xp(conn: sqlite3.Connection, xp: int) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT * FROM reputation_levels
         WHERE is_active = 1 AND xp_required <= ?
         ORDER BY level DESC
         LIMIT 1
        """,
        (max(REPUTATION_MIN_XP, int(xp or 0)),),
    ).fetchone()
    if row:
        return dict(row)
    fallback = REPUTATION_LEVEL_DEFAULTS[0]
    return {
        "level": fallback["level"],
        "xp_required": fallback["xp"],
        "name_zh": fallback["zh"],
        "name_en": fallback["en"],
        "name_ja": fallback["ja"],
        "description_zh": fallback["desc"],
        "description_en": fallback["desc"],
        "description_ja": fallback["desc"],
        "privileges_json": json.dumps(fallback["privileges"], ensure_ascii=False),
        "is_active": 1,
        "updated_at": now_iso(),
    }


def reputation_next_level(conn: sqlite3.Connection, level: int) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM reputation_levels WHERE is_active = 1 AND level > ? ORDER BY level ASC LIMIT 1",
        (int(level or 1),),
    ).fetchone()
    return dict(row) if row else None


def reputation_ensure_user(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM user_reputation WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        d = dict(row)
        status = reputation_status_for_score(int(d.get("reputation_score") or REPUTATION_DEFAULT_SCORE))
        if d.get("reputation_status") != status:
            conn.execute(
                "UPDATE user_reputation SET reputation_status = ?, updated_at = ? WHERE user_id = ?",
                (status, now_iso(), user_id),
            )
            d["reputation_status"] = status
        return d
    now = now_iso()
    conn.execute(
        """
        INSERT INTO user_reputation (
            user_id, xp, reputation_score, level, risk_score, reputation_status,
            created_at, updated_at
        )
        VALUES (?, 0, ?, 1, 0, 'normal', ?, ?)
        """,
        (user_id, REPUTATION_DEFAULT_SCORE, now, now),
    )
    return dict(conn.execute("SELECT * FROM user_reputation WHERE user_id = ?", (user_id,)).fetchone())


def reputation_limit_map(conn: sqlite3.Connection) -> dict[str, int]:
    rows = list(conn.execute("SELECT key, value FROM reputation_limits"))
    data = dict(REPUTATION_LIMIT_DEFAULTS)
    for row in rows:
        try:
            data[row["key"]] = int(row["value"] or 0)
        except Exception:
            continue
    return data


def _reputation_sum_xp(conn: sqlite3.Connection, user_id: str, since: str, *,
                       rule_key: str = "", target_kind: str = "", target_id: str = "") -> int:
    clauses = ["user_id = ?", "created_at >= ?", "xp_delta > 0"]
    params: list[Any] = [user_id, since]
    if rule_key:
        clauses.append("rule_key = ?")
        params.append(rule_key)
    if target_kind:
        clauses.append("target_kind = ?")
        params.append(target_kind)
    if target_id:
        clauses.append("target_id = ?")
        params.append(target_id)
    row = conn.execute(
        f"SELECT COALESCE(SUM(xp_delta), 0) AS total FROM reputation_events WHERE {' AND '.join(clauses)}",
        params,
    ).fetchone()
    return int((row["total"] if row else 0) or 0)


def reputation_growth_is_frozen(rep: dict[str, Any]) -> bool:
    until = parse_iso(rep.get("frozen_until"))
    if until and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until and until > datetime.now(timezone.utc):
        return True
    return bool(rep.get("growth_frozen") and not rep.get("frozen_until"))


def reputation_apply_event(
    conn: sqlite3.Connection,
    user_id: str,
    rule_key: str,
    *,
    actor_user_id: str = "",
    admin_id: str = "",
    target_kind: str = "",
    target_id: str = "",
    reason: str = "",
    metadata: dict[str, Any] | None = None,
    reviewed: bool = False,
) -> dict[str, Any]:
    if not user_id:
        return {"applied": False, "reason": "missing_user"}
    rule = conn.execute("SELECT * FROM reputation_rules WHERE key = ? AND is_active = 1", (rule_key,)).fetchone()
    if not rule:
        return {"applied": False, "reason": "missing_rule", "rule_key": rule_key}
    rule_d = dict(rule)
    if int(rule_d.get("requires_reviewed") or 0) and not reviewed:
        return {"applied": False, "reason": "requires_review", "rule_key": rule_key}
    if int(rule_d.get("is_one_time") or 0):
        existing = conn.execute(
            "SELECT 1 FROM reputation_events WHERE user_id = ? AND rule_key = ? LIMIT 1",
            (user_id, rule_key),
        ).fetchone()
        if existing:
            return {"applied": False, "reason": "one_time_already_applied", "rule_key": rule_key}

    rep = reputation_ensure_user(conn, user_id)
    xp_before = int(rep.get("xp") or 0)
    score_before = _clamp_reputation_score(rep.get("reputation_score"))
    risk_before = _clamp_risk_score(rep.get("risk_score"))
    level_before = int(rep.get("level") or 1)
    xp_delta = int(rule_d.get("xp_delta") or 0)
    reputation_delta = int(rule_d.get("reputation_delta") or 0)
    risk_delta = int(rule_d.get("risk_delta") or 0)

    if xp_delta > 0 and reputation_growth_is_frozen(rep):
        xp_delta = 0
        reason = reason or "声望增长已冻结"

    if xp_delta > 0:
        limits = reputation_limit_map(conn)
        user_row = conn.execute("SELECT created_at FROM users WHERE id = ?", (user_id,)).fetchone()
        created = parse_iso(user_row["created_at"] if user_row else "")
        account_age_days = 999
        if created:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            account_age_days = max(0, (datetime.now(timezone.utc) - created.astimezone(timezone.utc)).days)
        caps: list[tuple[str, int, str]] = [
            ("global_daily", int(limits.get("daily_xp_cap") or 0), _reputation_now_window(1)),
            ("global_weekly", int(limits.get("weekly_xp_cap") or 0), _reputation_now_window(7)),
            ("global_monthly", int(limits.get("monthly_xp_cap") or 0), _reputation_now_window(30)),
            ("rule_daily", int(rule_d.get("daily_xp_cap") or 0), _reputation_now_window(1)),
            ("rule_weekly", int(rule_d.get("weekly_xp_cap") or 0), _reputation_now_window(7)),
            ("rule_monthly", int(rule_d.get("monthly_xp_cap") or 0), _reputation_now_window(30)),
        ]
        if account_age_days < int(limits.get("new_user_days") or 7):
            caps.append(("new_user_daily", int(limits.get("new_user_daily_xp_cap") or 0), _reputation_now_window(1)))
        for cap_kind, cap, since in caps:
            if cap <= 0:
                continue
            kwargs = {"rule_key": rule_key} if cap_kind.startswith("rule_") else {}
            earned = _reputation_sum_xp(conn, user_id, since, **kwargs)
            xp_delta = min(xp_delta, max(0, cap - earned))
        target_cap = int(rule_d.get("per_target_daily_xp_cap") or 0)
        if target_cap > 0 and target_id:
            earned = _reputation_sum_xp(
                conn, user_id, _reputation_now_window(1),
                rule_key=rule_key, target_kind=target_kind, target_id=target_id,
            )
            xp_delta = min(xp_delta, max(0, target_cap - earned))

    xp_after = max(REPUTATION_MIN_XP, xp_before + xp_delta)
    score_after = _clamp_reputation_score(score_before + reputation_delta)
    risk_after = _clamp_risk_score(risk_before + risk_delta)
    status_after = reputation_status_for_score(score_after)
    level_after = int(reputation_level_for_xp(conn, xp_after)["level"])
    metadata_payload = dict(metadata or {})
    if xp_delta == 0 and int(rule_d.get("xp_delta") or 0) > 0:
        metadata_payload["xp_capped"] = True

    event_id = str(uuid.uuid4())
    now = now_iso()
    conn.execute(
        """
        INSERT INTO reputation_events (
            id, user_id, actor_user_id, admin_id, rule_key, event_type,
            target_kind, target_id, xp_delta, reputation_delta, risk_delta,
            xp_before, xp_after, reputation_before, reputation_after,
            risk_before, risk_after, level_before, level_after, reason,
            metadata, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id, user_id, actor_user_id or "", admin_id or "", rule_key,
            rule_d.get("event_type") or "", target_kind or "", target_id or "",
            xp_delta, reputation_delta, risk_delta, xp_before, xp_after,
            score_before, score_after, risk_before, risk_after, level_before,
            level_after, (reason or rule_d.get("name_zh") or "")[:500],
            json.dumps(metadata_payload, ensure_ascii=False, sort_keys=True), now,
        ),
    )
    violation_inc = 1 if reputation_delta < 0 or risk_delta >= 20 else 0
    conn.execute(
        """
        UPDATE user_reputation
           SET xp = ?, reputation_score = ?, level = ?, risk_score = ?,
               reputation_status = ?, last_event_at = ?, violation_count = violation_count + ?,
               favorites_received = favorites_received + ?,
               helped_users = helped_users + ?,
               quality_posts = quality_posts + ?,
               reports_validated = reports_validated + ?,
               updated_at = ?
         WHERE user_id = ?
        """,
        (
            xp_after, score_after, level_after, risk_after, status_after, now,
            violation_inc,
            1 if rule_key == "content_bookmarked" and xp_delta > 0 else 0,
            1 if rule_key == "comment_on_question" and xp_delta > 0 else 0,
            1 if rule_key in {"post_guide", "post_warning"} and xp_delta > 0 else 0,
            1 if rule_key == "valid_report" and xp_delta > 0 else 0,
            now, user_id,
        ),
    )
    if level_after > level_before:
        reputation_grant_level_rewards(conn, user_id, level_after, event_id)
        conn.execute(
            """
            INSERT INTO notifications (id, user_id, actor_id, type, content, created_at)
            VALUES (?, ?, ?, 'system', ?, ?)
            """,
            (str(uuid.uuid4()), user_id, user_id, f"你已升级为 Lv.{level_after} {reputation_level_for_xp(conn, xp_after)['name_zh']}。", now_iso()),
        )
        if _event_publish is not None:
            _event_publish(user_id, {"type": "notification", "kind": "reputation_level_up"})
        server_apns.enqueue(user_id, ntype="system", content=f"你已升级为 Lv.{level_after}")
    elif int(rule_d.get("notify_user") or 0) and (xp_delta or reputation_delta):
        content = f"{rule_d.get('name_zh') or '城市声望'}"
        if xp_delta:
            content += f"，获得 {xp_delta} XP" if xp_delta > 0 else f"，扣除 {abs(xp_delta)} XP"
        if reputation_delta:
            content += f"，声望{'+' if reputation_delta > 0 else ''}{reputation_delta}"
        conn.execute(
            """
            INSERT INTO notifications (id, user_id, actor_id, type, content, created_at)
            VALUES (?, ?, ?, 'system', ?, ?)
            """,
            (str(uuid.uuid4()), user_id, user_id, content, now_iso()),
        )
        server_apns.enqueue(user_id, ntype="system", content=content)
    if risk_after >= int(reputation_limit_map(conn).get("review_risk_threshold") or 61):
        reputation_open_trust_review(conn, user_id, risk_after, target_kind=target_kind, target_id=target_id, reason=reason or rule_d.get("name_zh") or rule_key)
    return {
        "applied": True,
        "event_id": event_id,
        "xp_delta": xp_delta,
        "reputation_delta": reputation_delta,
        "risk_delta": risk_delta,
        "level_before": level_before,
        "level_after": level_after,
    }


def reputation_open_trust_review(conn: sqlite3.Connection, user_id: str, risk_score: int, *,
                                 target_kind: str = "", target_id: str = "", reason: str = "") -> None:
    existing = conn.execute(
        """
        SELECT id FROM trust_reviews
         WHERE user_id = ? AND status = 'open' AND target_kind = ? AND target_id = ?
         LIMIT 1
        """,
        (user_id, target_kind or "", target_id or ""),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE trust_reviews SET risk_score = MAX(risk_score, ?), reasons = ?, updated_at = ? WHERE id = ?",
            (int(risk_score or 0), reason[:500], now_iso(), existing["id"]),
        )
        return
    now = now_iso()
    conn.execute(
        """
        INSERT INTO trust_reviews (
            id, user_id, target_kind, target_id, review_type, status,
            risk_score, reasons, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'risk', 'open', ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), user_id, target_kind or "", target_id or "", int(risk_score or 0), reason[:500], now, now),
    )


def reputation_grant_level_rewards(conn: sqlite3.Connection, user_id: str, level: int, source_event_id: str) -> None:
    rows = list(conn.execute(
        "SELECT * FROM reputation_rewards WHERE is_active = 1 AND required_level <= ? ORDER BY required_level",
        (int(level or 1),),
    ))
    for row in rows:
        exists = conn.execute(
            "SELECT 1 FROM user_rewards WHERE user_id = ? AND reward_id = ? LIMIT 1",
            (user_id, row["id"]),
        ).fetchone()
        if exists:
            continue
        now = now_iso()
        conn.execute(
            """
            INSERT INTO user_rewards (
                id, user_id, reward_id, status, quantity, source_event_id, created_at, updated_at
            )
            VALUES (?, ?, ?, 'available', ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), user_id, row["id"], int(row["quantity"] or 1), source_event_id, now, now),
        )
        conn.execute(
            """
            INSERT INTO notifications (id, user_id, actor_id, type, content, created_at)
            VALUES (?, ?, ?, 'system', ?, ?)
            """,
            (str(uuid.uuid4()), user_id, user_id, f"你获得一项城市声望奖励：{row['name_zh']}。", now_iso()),
        )
        server_apns.enqueue(user_id, ntype="system", content=f"你获得一项城市声望奖励：{row['name_zh']}")


def reputation_effective_limits(
    conn: sqlite3.Connection,
    rep: dict[str, Any],
    user: dict[str, Any] | None = None,
    *,
    limit_values: dict[str, int] | None = None,
) -> dict[str, Any]:
    limits = limit_values if limit_values is not None else reputation_limit_map(conn)
    score = _clamp_reputation_score(rep.get("reputation_score"))
    level = int(rep.get("level") or 1)
    risk = _clamp_risk_score(rep.get("risk_score"))
    account_age_days = 999
    if user:
        created = parse_iso(user.get("created_at"))
        if created:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            account_age_days = max(0, (datetime.now(timezone.utc) - created.astimezone(timezone.utc)).days)
    return {
        "daily_xp_cap": limits.get("new_user_daily_xp_cap") if account_age_days < limits.get("new_user_days", 7) else limits.get("daily_xp_cap"),
        "weekly_xp_cap": limits.get("weekly_xp_cap"),
        "monthly_xp_cap": limits.get("monthly_xp_cap"),
        "can_publish_secondhand": score >= 20 and risk < limits.get("restrict_risk_threshold", 81),
        "secondhand_requires_review": score < 75 or level <= 1 or risk >= limits.get("review_risk_threshold", 61),
        "can_publish_rental": level >= limits.get("rental_min_level", 3) and score >= limits.get("rental_min_reputation", 60) and risk < limits.get("restrict_risk_threshold", 81),
        "can_publish_job": level >= limits.get("job_min_level", 3) and score >= limits.get("job_min_reputation", 70) and risk < limits.get("restrict_risk_threshold", 81),
        "can_publish_service": level >= limits.get("service_min_level", 3) and score >= limits.get("service_min_reputation", 70) and risk < limits.get("restrict_risk_threshold", 81),
        "can_publish_discount": level >= limits.get("discount_min_level", 3) and score >= limits.get("discount_min_reputation", 60) and risk < limits.get("restrict_risk_threshold", 81),
        "high_risk_requires_review": score < 75 or risk >= limits.get("review_risk_threshold", 61),
        "dm_daily_limit": limits.get("dm_daily_new_user") if account_age_days < limits.get("new_user_days", 7) else (limits.get("dm_low_reputation_cap") if score < limits.get("dm_reputation_floor", 50) else 50),
        "growth_frozen": reputation_growth_is_frozen(rep),
    }

