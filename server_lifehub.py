"""City-life OS foundation (product upgrade Phase 1).

This module is the substrate for the "Machi = 海外城市生活操作系统" upgrade:

  * the user's city-life profile (life stage + intents) that personalises Home,
  * the north-star event log (Weekly Solved Local Actions),
  * rule-based, stage-aware recommendations with a human "reason".

It is deliberately a SEPARATE module (split-by-construction): new product logic
lands here, not in the 35k-line server.py monolith. To avoid a circular import
it stays PURE — only sqlite3-shaped `conn` + injected values; server.py keeps the
thin request handlers that call these functions. Easy to unit-test in isolation.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

# ---- vocabularies (validated; clients render labels) ----------------------

LIFE_STAGES: tuple[str, ...] = (
    "preparing",      # 准备来日本
    "arrived_7d",     # 刚到 7 天内
    "arrived_30d",    # 刚到 30 天内
    "finding_housing",  # 找房中
    "finding_job",    # 找工作中
    "studying",       # 留学/升学中
    "settled",        # 已稳定生活
    "merchant",       # 商家/服务方
)

PRIMARY_INTENTS: tuple[str, ...] = (
    "procedures",     # 办手续
    "housing",        # 找房
    "job",            # 找工作
    "school",         # 找学校
    "marketplace",    # 买卖二手
    "social",         # 找活动/朋友
    "questions",      # 问本地问题
    "services",       # 找商家服务
)

# A north-star "solved local action" — kept small + stable.
LOCAL_ACTION_TYPES: tuple[str, ...] = (
    "guide_todo_done",      # 完成一个 Guide 待办
    "question_answered",    # 问题获得有效回答 / 被采纳
    "listing_contacted",    # 联系/咨询房源·工作·二手·服务
    "listing_favorited",    # 收藏一个 listing
    "reservation_made",     # 完成预约
    "application_submitted", # 报名/申请
    "event_joined",         # 加入活动/小组
    "material_saved",       # 保存资料/合同/预算/申请进度
    "connection_made",      # 建立一次可信本地连接
)


def _iso(now: str | None) -> str:
    return now or datetime.now(timezone.utc).isoformat()


# ---- city-life profile -----------------------------------------------------

def normalize_secondary_intents(raw: Any) -> list[str]:
    if isinstance(raw, str):
        raw = [s for s in raw.split(",")]
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for v in raw:
        s = str(v or "").strip()
        if s in PRIMARY_INTENTS and s not in out:
            out.append(s)
    return out[:5]


def get_life_profile(conn: Any, user_id: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT user_id, life_stage, primary_intent, secondary_intents, "
        "onboarding_completed_at, updated_at FROM user_life_profiles WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return {
            "lifeStage": "", "primaryIntent": "", "secondaryIntents": [],
            "onboardingCompletedAt": "", "onboardingCompleted": False,
        }
    d = dict(row)
    try:
        secondary = json.loads(d.get("secondary_intents") or "[]")
    except Exception:
        secondary = []
    completed = (d.get("onboarding_completed_at") or "").strip()
    return {
        "lifeStage": d.get("life_stage") or "",
        "primaryIntent": d.get("primary_intent") or "",
        "secondaryIntents": secondary if isinstance(secondary, list) else [],
        "onboardingCompletedAt": completed,
        "onboardingCompleted": bool(completed),
        "updatedAt": d.get("updated_at") or "",
    }


def upsert_life_profile(conn: Any, user_id: str, *, life_stage: str = "",
                        primary_intent: str = "", secondary_intents: Any = None,
                        mark_complete: bool = True, now: str | None = None) -> dict[str, Any]:
    """Create/merge the caller's city-life profile. Only validated values are
    stored; unknown stage/intent are dropped (kept as empty), never raised, so a
    partial onboarding still saves. Idempotent per user."""
    now = _iso(now)
    stage = life_stage if life_stage in LIFE_STAGES else ""
    intent = primary_intent if primary_intent in PRIMARY_INTENTS else ""
    secondary = normalize_secondary_intents(secondary_intents)
    existing = conn.execute(
        "SELECT user_id, life_stage, primary_intent, secondary_intents, onboarding_completed_at "
        "FROM user_life_profiles WHERE user_id = ?", (user_id,)).fetchone()
    if existing:
        ex = dict(existing)
        stage = stage or (ex.get("life_stage") or "")
        intent = intent or (ex.get("primary_intent") or "")
        if not secondary:
            try:
                secondary = json.loads(ex.get("secondary_intents") or "[]")
            except Exception:
                secondary = []
        completed = (ex.get("onboarding_completed_at") or "").strip()
        if mark_complete and not completed:
            completed = now
        conn.execute(
            "UPDATE user_life_profiles SET life_stage = ?, primary_intent = ?, "
            "secondary_intents = ?, onboarding_completed_at = ?, updated_at = ? WHERE user_id = ?",
            (stage, intent, json.dumps(secondary, ensure_ascii=False),
             completed, now, user_id),
        )
    else:
        completed = now if mark_complete else ""
        conn.execute(
            "INSERT INTO user_life_profiles (user_id, life_stage, primary_intent, "
            "secondary_intents, onboarding_completed_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, stage, intent, json.dumps(secondary, ensure_ascii=False),
             completed, now, now),
        )
    return get_life_profile(conn, user_id)


# ---- north-star: Weekly Solved Local Actions -------------------------------

def record_local_action(conn: Any, user_id: str, action_type: str, *,
                        target_kind: str = "", target_id: str = "",
                        now: str | None = None) -> None:
    """Append-only log of solved local actions (the north-star metric). Never
    raises into the caller's hot path — a logging failure must not break the
    underlying action."""
    if not user_id or action_type not in LOCAL_ACTION_TYPES:
        return
    try:
        conn.execute(
            "INSERT INTO local_action_events (id, user_id, action_type, target_kind, target_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, action_type, target_kind or "", target_id or "", _iso(now)),
        )
    except Exception:
        pass


def weekly_action_summary(conn: Any, user_id: str, *, now: str | None = None) -> dict[str, Any]:
    now_dt = datetime.fromisoformat(_iso(now))
    since = (now_dt - timedelta(days=7)).isoformat()
    rows = conn.execute(
        "SELECT action_type, COUNT(*) AS c FROM local_action_events "
        "WHERE user_id = ? AND created_at >= ? GROUP BY action_type",
        (user_id, since),
    ).fetchall()
    by_type = {r["action_type"]: int(r["c"]) for r in rows}
    total = sum(by_type.values())
    return {"weeklySolvedActions": total, "byType": by_type, "since": since}


# ---- stage-aware recommendations (rule-based, explainable) ------------------

def _card(kind: str, title: str, reason: str, target_kind: str, target_ref: str,
          subtitle: str = "") -> dict[str, Any]:
    return {"kind": kind, "title": title, "subtitle": subtitle, "reason": reason,
            "target": {"kind": target_kind, "ref": target_ref}}


def recommendations_for(conn: Any, user_id: str, profile: dict[str, Any], *,
                        now: str | None = None) -> list[dict[str, Any]]:
    """Rule-based recommendation cards with an explainable `reason`. No ML — the
    point is relevance + transparency ('因为你正在找房'). Each card carries a
    target (kind+ref) the client maps to a route."""
    stage = (profile or {}).get("lifeStage") or ""
    intent = (profile or {}).get("primaryIntent") or ""
    secondary = set((profile or {}).get("secondaryIntents") or [])
    cards: list[dict[str, Any]] = []

    def want(*names: str) -> bool:
        return intent in names or bool(secondary.intersection(names))

    # New arrivals / preparers -> guide-first.
    if stage in ("preparing", "arrived_7d", "arrived_30d") or intent == "procedures":
        cards.append(_card("guide_plan", "你的日本生活计划", "因为你刚到/准备来日本，先按计划一步步来",
                           "guide", "plan", "到日 30 天 · 待办 · 文件 · 提醒"))
        cards.append(_card("qa", "新人常见问题", "刚到的人最常问这些", "qa", "newcomer"))
    if want("housing") or stage == "finding_housing":
        cards.append(_card("channel", "租房 · 看房", "因为你正在找房", "listing", "rental",
                           "查看房源、看房预约、租房安全清单"))
        cards.append(_card("safety", "租房避坑清单", "找房前先看这份安全清单", "guide", "rental-safety"))
        cards.append(_card("qa", "租房问答", "同城的人怎么找房", "qa", "housing"))
    if want("job") or stage == "finding_job":
        cards.append(_card("channel", "工作 · 招聘", "因为你正在找工作", "listing", "job",
                           "查看职位、简历与面试指南"))
        cards.append(_card("qa", "求职问答", "签证、面试、待遇怎么问", "qa", "job"))
    if want("school") or stage == "studying":
        cards.append(_card("channel", "学校与升学", "因为你关注升学", "guide", "schools"))
    if want("marketplace"):
        cards.append(_card("channel", "二手市场", "因为你想买卖二手", "listing", "secondhand"))
    if want("services"):
        cards.append(_card("channel", "本地服务", "因为你在找商家服务", "listing", "service"))
    if want("social") or stage == "settled":
        cards.append(_card("channel", "活动与约局", "认识同城的人、参加本地活动", "event", "nearby"))
        cards.append(_card("feed", "同城动态", "看看你所在城市最近在发生什么", "feed", "city"))
    if stage == "merchant":
        cards.append(_card("workbench", "经营工作台", "管理咨询、预约、评价与优惠", "business", "workbench"))

    # Always-useful tail.
    cards.append(_card("qa", "问同城", "有问题？认证成员和同城用户会看到", "qa", "ask"))

    # De-dup by (kind,target.ref); cap to a tidy set.
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for c in cards:
        key = (c["kind"], c["target"]["ref"])
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out[:8]
