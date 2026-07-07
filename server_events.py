"""Machi 活动(Events)— pure product module. Machi 版 Luma。

任何用户都能创建活动(线下酒局/展览/读书会/市集/讲座…),合作商活动由
运营在后台加精选(featured)。每个活动有独立短链(machicity.com/events/{slug}),
报名表单字段可由主办方 / 后台自由编辑(文本/单选/勾选,必填可配)。

设计红线:
  * 钱永不碰 —— price_text 纯展示,报名永远免费;收费活动挂 external_url
    跳合作商自己的售票页。
  * 报名数据只对主办方 / 管理员可见;公开页只暴露头像墙 + 人数。

Like ``server_partners.py`` this is a deliberately SEPARATE, mostly-pure
module: no imports from ``server``; sqlite3-shaped ``conn`` + stdlib only.
``server.py`` keeps the thin HTTP handlers (auth / JSON envelope / content
policy / media resolution).
"""
from __future__ import annotations

import json
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from server_errors import APIError

# ── constants ──────────────────────────────────────────────────────────────

EVENT_CATEGORIES: tuple[str, ...] = (
    "drinks",    # 酒局 / bar night
    "food",      # 美食 / 饭局
    "art",       # 展览 / 艺术
    "reading",   # 读书会
    "music",     # 音乐 / 演出
    "outdoor",   # 户外 / 徒步
    "market",    # 市集
    "talk",      # 讲座 / 分享会
    "sports",    # 运动
    "social",    # 交友 / 社群
    "other",
)
EVENT_CATEGORY_LABELS_ZH = {
    "drinks": "酒局小聚", "food": "美食饭局", "art": "展览艺术", "reading": "读书会",
    "music": "音乐演出", "outdoor": "户外徒步", "market": "市集", "talk": "讲座分享",
    "sports": "运动", "social": "交友社群", "other": "其他",
}

EVENT_STATUSES = ("draft", "published", "cancelled")
FIELD_TYPES = ("text", "select", "checkbox")
MAX_TITLE_LEN = 120
MAX_SUBTITLE_LEN = 200
MAX_DESCRIPTION_LEN = 8000
MAX_VENUE_LEN = 160
MAX_ADDRESS_LEN = 300
MAX_PRICE_TEXT_LEN = 60
MAX_URL_LEN = 500
MAX_CAPACITY = 100_000
MAX_FORM_FIELDS = 12
MAX_FIELD_LABEL_LEN = 120
MAX_FIELD_OPTIONS = 20
MAX_ANSWER_LEN = 500
ATTENDEE_PREVIEW_COUNT = 12
DEFAULT_PAGE = 20
MAX_PAGE = 50

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_category(raw: Any, default: str = "social") -> str:
    value = str(raw or "").strip().lower()
    return value if value in EVENT_CATEGORIES else default


def _slugify(title: str) -> str:
    base = _SLUG_RE.sub("-", str(title or "").strip().lower()).strip("-")[:48]
    # 中文标题 slug 化后往往为空——直接用随机短码,链接一样漂亮。
    if len(base) < 3:
        base = "ev"
    return f"{base}-{secrets.token_hex(3)}"


def _unique_slug(conn, title: str) -> str:
    for _ in range(6):
        slug = _slugify(title)
        if not conn.execute("SELECT 1 FROM events WHERE slug = ?", (slug,)).fetchone():
            return slug
    return f"ev-{uuid.uuid4().hex[:10]}"


def _brief_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id", ""),
        "handle": row.get("handle", ""),
        "username": row.get("handle", ""),
        "display_name": row.get("display_name", ""),
        "displayName": row.get("display_name", ""),
        "avatar_url": row.get("avatar_url", "") or "",
        "avatarUrl": row.get("avatar_url", "") or "",
        "avatar_symbol": row.get("avatar_symbol", "person.fill") or "person.fill",
        "avatar_color": row.get("avatar_color", "indigo") or "indigo",
        "is_verified_member": bool(row.get("is_verified_member", 0)),
        "isVerifiedMember": bool(row.get("is_verified_member", 0)),
    }


# ── form fields (后台可编辑的报名字段) ───────────────────────────────────────

def list_form_fields(conn, event_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM event_form_fields WHERE event_id = ? ORDER BY sort_order ASC, rowid ASC",
        (event_id,),
    )
    fields = []
    for r in rows:
        d = dict(r)
        try:
            options = json.loads(d.get("options_json") or "[]")
        except Exception:
            options = []
        fields.append({
            "id": d["id"],
            "label": d.get("label", ""),
            "field_type": d.get("field_type", "text"),
            "fieldType": d.get("field_type", "text"),
            "options": options if isinstance(options, list) else [],
            "required": bool(d.get("required", 0)),
            "sort_order": int(d.get("sort_order") or 0),
            "sortOrder": int(d.get("sort_order") or 0),
        })
    return fields


def replace_form_fields(conn, event_id: str, fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bulk-replace an event's registration form. 传入 id 的字段保留原 id
    (已有报名答案继续对得上),新字段生成新 id;没出现的旧字段删除。"""
    if not isinstance(fields, list):
        raise APIError("fields 必须是数组", 400, "invalid_fields")
    if len(fields) > MAX_FORM_FIELDS:
        raise APIError(f"报名字段最多 {MAX_FORM_FIELDS} 个", 400, "too_many_fields")
    existing_ids = {r["id"] for r in conn.execute("SELECT id FROM event_form_fields WHERE event_id = ?", (event_id,))}
    kept_ids: set[str] = set()
    normalized: list[tuple[str, str, str, str, int, int]] = []
    for index, raw in enumerate(fields):
        if not isinstance(raw, dict):
            raise APIError("字段格式不正确", 400, "invalid_fields")
        label = str(raw.get("label") or "").strip()[:MAX_FIELD_LABEL_LEN]
        if not label:
            raise APIError("字段名不能为空", 400, "field_label_required")
        field_type = str(raw.get("field_type") or raw.get("fieldType") or "text").strip().lower()
        if field_type not in FIELD_TYPES:
            field_type = "text"
        options = raw.get("options") or []
        if not isinstance(options, list):
            options = []
        options = [str(o).strip()[:80] for o in options if str(o).strip()][:MAX_FIELD_OPTIONS]
        if field_type == "select" and not options:
            raise APIError(f"单选字段「{label}」需要至少一个选项", 400, "select_needs_options")
        required = 1 if raw.get("required") else 0
        field_id = str(raw.get("id") or "").strip()
        if not field_id or field_id not in existing_ids:
            field_id = str(uuid.uuid4())
        kept_ids.add(field_id)
        normalized.append((field_id, label, field_type, json.dumps(options, ensure_ascii=False), required, index))
    stale = existing_ids - kept_ids
    if stale:
        conn.executemany("DELETE FROM event_form_fields WHERE id = ?", [(sid,) for sid in stale])
    for field_id, label, field_type, options_json, required, sort_order in normalized:
        conn.execute(
            "INSERT INTO event_form_fields (id, event_id, label, field_type, options_json, required, sort_order)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT(id) DO UPDATE SET label = excluded.label, field_type = excluded.field_type,"
            " options_json = excluded.options_json, required = excluded.required, sort_order = excluded.sort_order",
            (field_id, event_id, label, field_type, options_json, required, sort_order),
        )
    conn.commit()
    return list_form_fields(conn, event_id)


# ── serialization ────────────────────────────────────────────────────────────

def _attendee_rows(conn, event_id: str, limit: int = ATTENDEE_PREVIEW_COUNT) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT u.id, u.handle, u.display_name, u.avatar_url, u.avatar_symbol, u.avatar_color, u.is_verified_member"
        " FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL"
        " ORDER BY reg.created_at ASC LIMIT ?",
        (event_id, max(1, limit)),
    )
    return [_brief_user(dict(r)) for r in rows]


def serialize_event(
    conn,
    row: dict[str, Any],
    viewer_id: Optional[str] = None,
    *,
    include_form: bool = False,
    include_description: bool = False,
) -> dict[str, Any]:
    event_id = row["id"]
    organizer = conn.execute(
        "SELECT id, handle, display_name, avatar_url, avatar_symbol, avatar_color, is_verified_member"
        " FROM users WHERE id = ?",
        (row.get("organizer_user_id", ""),),
    ).fetchone()
    viewer_status = ""
    if viewer_id:
        reg = conn.execute(
            "SELECT status FROM event_registrations WHERE event_id = ? AND user_id = ?",
            (event_id, viewer_id),
        ).fetchone()
        if reg and reg["status"] != "cancelled":
            viewer_status = reg["status"]
    going = int(row.get("going_count") or 0)
    capacity = int(row.get("capacity") or 0)
    payload: dict[str, Any] = {
        "id": event_id,
        "slug": row.get("slug", ""),
        "title": row.get("title", ""),
        "subtitle": row.get("subtitle", ""),
        "category": row.get("category", "social"),
        "category_label": EVENT_CATEGORY_LABELS_ZH.get(row.get("category", ""), "其他"),
        "categoryLabel": EVENT_CATEGORY_LABELS_ZH.get(row.get("category", ""), "其他"),
        "cover_url": row.get("cover_url", ""),
        "coverUrl": row.get("cover_url", ""),
        "starts_at": row.get("starts_at", ""),
        "startsAt": row.get("starts_at", ""),
        "ends_at": row.get("ends_at", ""),
        "endsAt": row.get("ends_at", ""),
        "timezone": row.get("timezone", "Asia/Tokyo"),
        "venue_name": row.get("venue_name", ""),
        "venueName": row.get("venue_name", ""),
        "address": row.get("address", ""),
        "country_code": row.get("country_code", ""),
        "city_slug": row.get("city_slug", ""),
        "citySlug": row.get("city_slug", ""),
        "region_code": row.get("region_code", ""),
        "regionCode": row.get("region_code", ""),
        "capacity": capacity,
        "price_text": row.get("price_text", ""),
        "priceText": row.get("price_text", ""),
        "external_url": row.get("external_url", ""),
        "externalUrl": row.get("external_url", ""),
        "partner_name": row.get("partner_name", ""),
        "partnerName": row.get("partner_name", ""),
        "status": row.get("status", "published"),
        "is_featured": bool(row.get("is_featured", 0)),
        "isFeatured": bool(row.get("is_featured", 0)),
        "going_count": going,
        "goingCount": going,
        "is_full": bool(capacity and going >= capacity),
        "isFull": bool(capacity and going >= capacity),
        "organizer_user_id": row.get("organizer_user_id", ""),
        "organizerUserId": row.get("organizer_user_id", ""),
        "organizer": _brief_user(dict(organizer)) if organizer else None,
        "attendees_preview": _attendee_rows(conn, event_id),
        "attendeesPreview": _attendee_rows(conn, event_id),
        "viewer_status": viewer_status,
        "viewerStatus": viewer_status,
        "created_at": row.get("created_at", ""),
        "createdAt": row.get("created_at", ""),
        "updated_at": row.get("updated_at", ""),
        "updatedAt": row.get("updated_at", ""),
    }
    if include_description:
        payload["description"] = row.get("description", "")
    if include_form:
        payload["form_fields"] = list_form_fields(conn, event_id)
        payload["formFields"] = payload["form_fields"]
    return payload


# ── queries ──────────────────────────────────────────────────────────────────

def get_event(conn, id_or_slug: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM events WHERE (id = ? OR slug = ?) AND deleted_at IS NULL",
        (id_or_slug, id_or_slug),
    ).fetchone()
    if not row:
        raise APIError("活动不存在或已下线", 404, "event_not_found")
    return dict(row)


def list_events(
    conn,
    *,
    viewer_id: Optional[str] = None,
    country_code: str = "",
    city_slug: str = "",
    region_code: str = "",
    category: str = "",
    when: str = "upcoming",
    featured_only: bool = False,
    organizer_id: str = "",
    include_drafts_for: str = "",
    admin_all: bool = False,
    limit: int = DEFAULT_PAGE,
    offset: int = 0,
    now: Optional[str] = None,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or DEFAULT_PAGE), MAX_PAGE))
    offset = max(0, int(offset or 0))
    ts = now or _now()
    clauses = ["e.deleted_at IS NULL"]
    params: list[Any] = []
    if admin_all:
        # 后台全量视图:草稿/已发布/已取消都看得到,可再按 organizer 过滤。
        if organizer_id:
            clauses.append("e.organizer_user_id = ?")
            params.append(organizer_id)
    elif organizer_id and include_drafts_for and organizer_id == include_drafts_for:
        clauses.append("e.organizer_user_id = ?")
        params.append(organizer_id)
        clauses.append("e.status IN ('draft', 'published', 'cancelled')")
    else:
        clauses.append("e.status = 'published'")
        if organizer_id:
            clauses.append("e.organizer_user_id = ?")
            params.append(organizer_id)
    if category and category in EVENT_CATEGORIES:
        clauses.append("e.category = ?")
        params.append(category)
    if featured_only:
        clauses.append("e.is_featured = 1")
    if city_slug:
        clauses.append("e.city_slug = ?")
        params.append(city_slug.strip().lower())
    elif region_code:
        clauses.append("e.region_code = ?")
        params.append(region_code.strip().lower())
    elif country_code:
        clauses.append("e.country_code = ?")
        params.append(country_code.strip().lower())
    when = (when or "upcoming").strip().lower()
    if when == "past":
        clauses.append("COALESCE(NULLIF(e.ends_at, ''), e.starts_at) < ?")
        params.append(ts)
        order = "e.starts_at DESC"
    elif when == "all":
        order = "e.is_featured DESC, e.starts_at ASC"
    else:  # upcoming(含进行中)
        clauses.append("COALESCE(NULLIF(e.ends_at, ''), e.starts_at) >= ?")
        params.append(ts)
        order = "e.is_featured DESC, e.starts_at ASC"
    total = conn.execute(
        f"SELECT COUNT(*) AS n FROM events e WHERE {' AND '.join(clauses)}", params
    ).fetchone()["n"]
    rows = list(conn.execute(
        f"SELECT e.* FROM events e WHERE {' AND '.join(clauses)} ORDER BY {order} LIMIT ? OFFSET ?",
        [*params, limit + 1, offset],
    ))
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [serialize_event(conn, dict(r), viewer_id) for r in rows]
    return {
        "items": items,
        "total": int(total),
        "has_more": has_more,
        "hasMore": has_more,
        "next_offset": offset + limit if has_more else None,
        "nextOffset": offset + limit if has_more else None,
    }


# ── mutations ────────────────────────────────────────────────────────────────

def _clean_event_payload(data: dict[str, Any]) -> dict[str, Any]:
    def text(key: str, alt: str = "", cap: int = 200) -> str:
        return str(data.get(key) or (data.get(alt) if alt else "") or "").strip()[:cap]

    title = text("title", cap=MAX_TITLE_LEN)
    starts_at = text("starts_at", "startsAt", 64)
    payload = {
        "title": title,
        "subtitle": text("subtitle", cap=MAX_SUBTITLE_LEN),
        "description": str(data.get("description") or "").strip()[:MAX_DESCRIPTION_LEN],
        "category": normalize_category(data.get("category")),
        "cover_url": text("cover_url", "coverUrl", MAX_URL_LEN),
        "starts_at": starts_at,
        "ends_at": text("ends_at", "endsAt", 64),
        "timezone": text("timezone", cap=48) or "Asia/Tokyo",
        "venue_name": text("venue_name", "venueName", MAX_VENUE_LEN),
        "address": text("address", cap=MAX_ADDRESS_LEN),
        "country_code": (text("country_code", "countryCode", 8) or "jp").lower(),
        "city_slug": text("city_slug", "citySlug", 60).lower(),
        "region_code": text("region_code", "regionCode", 80).lower(),
        "price_text": text("price_text", "priceText", MAX_PRICE_TEXT_LEN),
        "external_url": text("external_url", "externalUrl", MAX_URL_LEN),
        "partner_name": text("partner_name", "partnerName", 120),
    }
    try:
        payload["capacity"] = max(0, min(int(data.get("capacity") or 0), MAX_CAPACITY))
    except (TypeError, ValueError):
        payload["capacity"] = 0
    return payload


def create_event(conn, *, organizer_user_id: str, data: dict[str, Any], now: Optional[str] = None) -> dict[str, Any]:
    payload = _clean_event_payload(data)
    if not payload["title"]:
        raise APIError("活动名称不能为空", 400, "title_required")
    if not payload["starts_at"]:
        raise APIError("请填写活动开始时间", 400, "starts_at_required")
    status = str(data.get("status") or "published").strip().lower()
    if status not in ("draft", "published"):
        status = "published"
    ts = now or _now()
    event_id = str(uuid.uuid4())
    slug = _unique_slug(conn, payload["title"])
    conn.execute(
        "INSERT INTO events (id, slug, organizer_user_id, partner_name, title, subtitle, description,"
        " category, cover_url, starts_at, ends_at, timezone, venue_name, address, country_code,"
        " city_slug, region_code, capacity, price_text, external_url, status, is_featured,"
        " going_count, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)",
        (
            event_id, slug, organizer_user_id, payload["partner_name"], payload["title"],
            payload["subtitle"], payload["description"], payload["category"], payload["cover_url"],
            payload["starts_at"], payload["ends_at"], payload["timezone"], payload["venue_name"],
            payload["address"], payload["country_code"], payload["city_slug"], payload["region_code"],
            payload["capacity"], payload["price_text"], payload["external_url"], status, ts, ts,
        ),
    )
    fields = data.get("form_fields") or data.get("formFields")
    if isinstance(fields, list) and fields:
        replace_form_fields(conn, event_id, fields)
    conn.commit()
    return get_event(conn, event_id)


def update_event(
    conn,
    id_or_slug: str,
    actor_id: str,
    data: dict[str, Any],
    *,
    actor_is_admin: bool = False,
    now: Optional[str] = None,
) -> dict[str, Any]:
    event = get_event(conn, id_or_slug)
    if event["organizer_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有主办方可以编辑活动", 403, "not_event_organizer")
    payload = _clean_event_payload({**event, **data})
    if not payload["title"]:
        raise APIError("活动名称不能为空", 400, "title_required")
    if not payload["starts_at"]:
        raise APIError("请填写活动开始时间", 400, "starts_at_required")
    sets = [f"{key} = ?" for key in payload]
    params: list[Any] = list(payload.values())
    if "status" in data:
        status = str(data.get("status") or "").strip().lower()
        if status not in EVENT_STATUSES:
            raise APIError("无效的活动状态", 400, "invalid_status")
        sets.append("status = ?")
        params.append(status)
    if actor_is_admin and ("is_featured" in data or "isFeatured" in data):
        sets.append("is_featured = ?")
        params.append(1 if (data.get("is_featured") or data.get("isFeatured")) else 0)
    ts = now or _now()
    sets.append("updated_at = ?")
    params.append(ts)
    params.append(event["id"])
    conn.execute(f"UPDATE events SET {', '.join(sets)} WHERE id = ?", params)
    fields = data.get("form_fields") or data.get("formFields")
    if isinstance(fields, list):
        replace_form_fields(conn, event["id"], fields)
    conn.commit()
    return get_event(conn, event["id"])


def delete_event(conn, id_or_slug: str, actor_id: str, *, actor_is_admin: bool = False, now: Optional[str] = None) -> None:
    event = get_event(conn, id_or_slug)
    if event["organizer_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有主办方可以下线活动", 403, "not_event_organizer")
    ts = now or _now()
    conn.execute(
        "UPDATE events SET deleted_at = ?, status = 'cancelled', updated_at = ? WHERE id = ?",
        (ts, ts, event["id"]),
    )
    conn.commit()


# ── registrations ────────────────────────────────────────────────────────────

def register(conn, id_or_slug: str, user_id: str, answers: Any = None, *, now: Optional[str] = None) -> dict[str, Any]:
    event = get_event(conn, id_or_slug)
    if event["status"] != "published":
        raise APIError("活动未开放报名", 400, "event_not_open")
    ts = now or _now()
    end_anchor = event.get("ends_at") or event.get("starts_at") or ""
    if end_anchor and end_anchor < ts:
        raise APIError("活动已结束", 400, "event_ended")
    fields = list_form_fields(conn, event["id"])
    clean_answers: dict[str, str] = {}
    answers = answers if isinstance(answers, dict) else {}
    for field in fields:
        raw = str(answers.get(field["id"]) or "").strip()[:MAX_ANSWER_LEN]
        if field["field_type"] == "select" and raw and raw not in field["options"]:
            raise APIError(f"「{field['label']}」的选项无效", 400, "invalid_answer")
        if field["field_type"] == "checkbox":
            raw = "true" if raw.lower() in ("true", "1", "yes", "on") else ""
        if field["required"] and not raw:
            raise APIError(f"请填写「{field['label']}」", 400, "answer_required")
        if raw:
            clean_answers[field["id"]] = raw
    existing = conn.execute(
        "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        (event["id"], user_id),
    ).fetchone()
    capacity = int(event.get("capacity") or 0)
    going = int(event.get("going_count") or 0)
    already_going = bool(existing and existing["status"] == "going")
    status = "going"
    if capacity and going >= capacity and not already_going:
        status = "waitlist"
    answers_json = json.dumps(clean_answers, ensure_ascii=False)
    if existing:
        conn.execute(
            "UPDATE event_registrations SET status = ?, answers_json = ?, updated_at = ? WHERE id = ?",
            (status, answers_json, ts, existing["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO event_registrations (id, event_id, user_id, status, answers_json, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), event["id"], user_id, status, answers_json, ts, ts),
        )
    _recount_going(conn, event["id"], ts)
    conn.commit()
    return {"status": status, "event": serialize_event(conn, get_event(conn, event["id"]), user_id, include_form=True, include_description=True)}


def cancel_registration(conn, id_or_slug: str, user_id: str, *, now: Optional[str] = None) -> dict[str, Any]:
    event = get_event(conn, id_or_slug)
    ts = now or _now()
    conn.execute(
        "UPDATE event_registrations SET status = 'cancelled', updated_at = ? WHERE event_id = ? AND user_id = ?",
        (ts, event["id"], user_id),
    )
    _promote_waitlist(conn, event["id"], ts)
    _recount_going(conn, event["id"], ts)
    conn.commit()
    return {"status": "cancelled", "event": serialize_event(conn, get_event(conn, event["id"]), user_id, include_form=True, include_description=True)}


def _recount_going(conn, event_id: str, ts: str) -> None:
    going = conn.execute(
        "SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ? AND status = 'going'",
        (event_id,),
    ).fetchone()["n"]
    conn.execute("UPDATE events SET going_count = ?, updated_at = ? WHERE id = ?", (int(going), ts, event_id))


def _promote_waitlist(conn, event_id: str, ts: str) -> None:
    """有人取消后,按报名顺序把候补顶上(容量 0 = 不限,不会有候补)。"""
    event = conn.execute("SELECT capacity FROM events WHERE id = ?", (event_id,)).fetchone()
    capacity = int(event["capacity"] or 0) if event else 0
    if not capacity:
        return
    going = conn.execute(
        "SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ? AND status = 'going'",
        (event_id,),
    ).fetchone()["n"]
    slots = capacity - int(going)
    if slots <= 0:
        return
    waiting = list(conn.execute(
        "SELECT id FROM event_registrations WHERE event_id = ? AND status = 'waitlist'"
        " ORDER BY created_at ASC LIMIT ?",
        (event_id, slots),
    ))
    for row in waiting:
        conn.execute(
            "UPDATE event_registrations SET status = 'going', updated_at = ? WHERE id = ?",
            (ts, row["id"]),
        )


def list_attendees(
    conn,
    id_or_slug: str,
    actor_id: str,
    *,
    actor_is_admin: bool = False,
    include_answers: bool = True,
) -> dict[str, Any]:
    """主办方 / 管理员的完整报名名单(含表单答案)。公开页只走
    serialize_event 的 attendees_preview,永远不带答案。"""
    event = get_event(conn, id_or_slug)
    if event["organizer_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有主办方可以查看报名名单", 403, "not_event_organizer")
    fields = list_form_fields(conn, event["id"])
    rows = conn.execute(
        "SELECT reg.*, u.handle, u.display_name, u.avatar_url, u.avatar_symbol, u.avatar_color, u.is_verified_member"
        " FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status != 'cancelled' AND u.deleted_at IS NULL"
        " ORDER BY CASE reg.status WHEN 'going' THEN 0 ELSE 1 END, reg.created_at ASC",
        (event["id"],),
    )
    items = []
    for r in rows:
        d = dict(r)
        try:
            answers = json.loads(d.get("answers_json") or "{}")
        except Exception:
            answers = {}
        entry = {
            "user": _brief_user({
                "id": d.get("user_id", ""), "handle": d.get("handle", ""),
                "display_name": d.get("display_name", ""), "avatar_url": d.get("avatar_url", ""),
                "avatar_symbol": d.get("avatar_symbol", ""), "avatar_color": d.get("avatar_color", ""),
                "is_verified_member": d.get("is_verified_member", 0),
            }),
            "status": d.get("status", "going"),
            "created_at": d.get("created_at", ""),
            "createdAt": d.get("created_at", ""),
        }
        if include_answers:
            entry["answers"] = answers if isinstance(answers, dict) else {}
        items.append(entry)
    return {"items": items, "form_fields": fields, "formFields": fields, "total": len(items)}
