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
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import server_apns
from server_errors import APIError

# Production runs Postgres with multiple workers, where the process-wide
# DB_LOCK is intentionally disabled (server.py). SQLite (local/dev) is a single
# writer serialized by that lock. Registration takes a per-event row lock on
# Postgres to make the going/waitlist decision race-free; SQLite neither needs
# nor supports ``SELECT ... FOR UPDATE``. Read straight from the environment so
# this module stays free of any ``server`` import (mirrors server_config._env).
_IS_POSTGRES = (os.environ.get("KAIX_DB_BACKEND") or "sqlite").strip().lower() == "postgres"

# ── constants ──────────────────────────────────────────────────────────────

# 活动 = 正式策划、发海报、报名参加。分类按「活动的形式」(名词,你去参加的东西),
# 与约局(按「一起做什么」的搭子动作)彻底区分,避免两个系统看起来一样。
EVENT_CATEGORIES: tuple[str, ...] = (
    "exhibition", # 展览
    "show",       # 演出 / Live
    "talk",       # 讲座 / 沙龙
    "workshop",   # 工作坊
    "market",     # 市集
    "party",      # 派对
    "sports",     # 运动赛事
    "reading",    # 读书会
    "film",       # 观影
    "outdoor",    # 户外
    "other",
)
EVENT_CATEGORY_LABELS_ZH = {
    "exhibition": "展览", "show": "演出", "talk": "讲座沙龙", "workshop": "工作坊",
    "market": "市集", "party": "派对", "sports": "运动赛事", "reading": "读书会",
    "film": "观影", "outdoor": "户外", "other": "其他",
}
# 旧数据(0708 首发的分类)→新分类,只用于显示与筛选归并,不改库里存的原值。
_EVENT_CATEGORY_ALIASES = {
    "art": "exhibition", "music": "show", "food": "party", "drinks": "party",
    "social": "party",
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


def normalize_category(raw: Any, default: str = "party") -> str:
    value = str(raw or "").strip().lower()
    value = _EVENT_CATEGORY_ALIASES.get(value, value)
    return value if value in EVENT_CATEGORIES else default


def category_label(raw: Any) -> str:
    """Display label that also resolves legacy aliases so old rows don't all
    fall through to 「其他」."""
    value = str(raw or "").strip().lower()
    value = _EVENT_CATEGORY_ALIASES.get(value, value)
    return EVENT_CATEGORY_LABELS_ZH.get(value, "其他")


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


def cover_thumb_url(conn, cover_file_id: str, fallback: str = "") -> str:
    """把封面 cover_file_id 解析成异步生成的小缩略图 WebP,列表卡片用它而非原图。
    缩略图由后台 worker 异步生成,未就绪前退回原图 fallback,永不留空图。
    自包含:直接查 uploaded_files.metadata,不 import server_media,保持模块纯净。"""
    if not cover_file_id:
        return fallback
    try:
        row = conn.execute(
            "SELECT metadata FROM uploaded_files WHERE id = ? AND deleted_at IS NULL",
            (cover_file_id,),
        ).fetchone()
    except Exception:
        return fallback
    if not row:
        return fallback
    try:
        meta = json.loads(dict(row).get("metadata") or "{}")
    except Exception:
        meta = {}
    variants = meta.get("variants") if isinstance(meta.get("variants"), dict) else {}
    thumb = ""
    if isinstance(variants, dict):
        thumb = variants.get("thumbnail") or ""
    return thumb or meta.get("thumbnail_url") or fallback


# ── form fields (后台可编辑的报名字段) ───────────────────────────────────────

def list_form_fields(conn, event_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM event_form_fields WHERE event_id = ? ORDER BY sort_order ASC, id ASC",
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
    viewer_checked_in = False
    if viewer_id:
        reg = conn.execute(
            "SELECT status, checked_in_at FROM event_registrations WHERE event_id = ? AND user_id = ?",
            (event_id, viewer_id),
        ).fetchone()
        if reg and reg["status"] != "cancelled":
            viewer_status = reg["status"]
            viewer_checked_in = bool(dict(reg).get("checked_in_at") or "")
    going = int(row.get("going_count") or 0)
    capacity = int(row.get("capacity") or 0)
    cover = row.get("cover_url", "") or ""
    cover_thumb = cover_thumb_url(conn, row.get("cover_file_id", "") or "", cover)
    # 同一活动只查一次预览名单 + 只算一次分类标签，两组键(snake / camel)复用，
    # 避免列表页每条活动重复往返 DB(list_events 对每条 serialize)。
    attendees = _attendee_rows(conn, event_id)
    cat_label = category_label(row.get("category", ""))
    payload: dict[str, Any] = {
        "id": event_id,
        "slug": row.get("slug", ""),
        "title": row.get("title", ""),
        "subtitle": row.get("subtitle", ""),
        "category": row.get("category", "social"),
        "category_label": cat_label,
        "categoryLabel": cat_label,
        "cover_url": cover,
        "coverUrl": cover,
        "cover_thumb_url": cover_thumb,
        "coverThumbUrl": cover_thumb,
        "cover_file_id": row.get("cover_file_id", "") or "",
        "coverFileId": row.get("cover_file_id", "") or "",
        "requires_approval": bool(row.get("requires_approval", 0)),
        "requiresApproval": bool(row.get("requires_approval", 0)),
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
        "attendees_preview": attendees,
        "attendeesPreview": attendees,
        "viewer_status": viewer_status,
        "viewerStatus": viewer_status,
        "viewer_checked_in": viewer_checked_in,
        "viewerCheckedIn": viewer_checked_in,
        "created_at": row.get("created_at", ""),
        "createdAt": row.get("created_at", ""),
        "updated_at": row.get("updated_at", ""),
        "updatedAt": row.get("updated_at", ""),
    }
    if include_description:
        payload["description"] = row.get("description", "")
        # host 仪表盘要看的分状态计数(待审核/候补/已签到)。只在详情视图算,
        # 避免列表页每张卡片都多打两次 COUNT。
        payload.update(_status_counts(conn, event_id))
    if include_form:
        payload["form_fields"] = list_form_fields(conn, event_id)
        payload["formFields"] = payload["form_fields"]
    return payload


def _status_counts(conn, event_id: str) -> dict[str, Any]:
    """分状态计数,口径与 _recount_going 一致(JOIN users 排除注销)。"""
    rows = conn.execute(
        "SELECT reg.status AS s, COUNT(*) AS n,"
        " SUM(CASE WHEN COALESCE(reg.checked_in_at, '') != '' THEN 1 ELSE 0 END) AS ci"
        " FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND u.deleted_at IS NULL GROUP BY reg.status",
        (event_id,),
    )
    pending = waitlist = checked_in = 0
    for r in rows:
        d = dict(r)
        if d.get("s") == "waitlist":
            waitlist = int(d.get("n") or 0)
        elif d.get("s") == "pending":
            pending = int(d.get("n") or 0)
        elif d.get("s") == "going":
            checked_in = int(d.get("ci") or 0)
    return {
        "pending_count": pending, "pendingCount": pending,
        "waitlist_count": waitlist, "waitlistCount": waitlist,
        "checked_in_count": checked_in, "checkedInCount": checked_in,
    }


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
        # 也匹配归并到该分类的旧 key(如 party 兼容旧 food/drinks/social)。
        legacy = [old for old, new in _EVENT_CATEGORY_ALIASES.items() if new == category]
        keys = [category, *legacy]
        clauses.append("e.category IN (%s)" % ",".join("?" * len(keys)))
        params.extend(keys)
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
        "cover_file_id": text("cover_file_id", "coverFileId", 64),
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
    payload["requires_approval"] = 1 if (data.get("requires_approval") or data.get("requiresApproval")) else 0
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
        " category, cover_url, cover_file_id, starts_at, ends_at, timezone, venue_name, address, country_code,"
        " city_slug, region_code, capacity, price_text, external_url, requires_approval, status, is_featured,"
        " going_count, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)",
        (
            event_id, slug, organizer_user_id, payload["partner_name"], payload["title"],
            payload["subtitle"], payload["description"], payload["category"], payload["cover_url"],
            payload["cover_file_id"], payload["starts_at"], payload["ends_at"], payload["timezone"],
            payload["venue_name"], payload["address"], payload["country_code"], payload["city_slug"],
            payload["region_code"], payload["capacity"], payload["price_text"], payload["external_url"],
            payload["requires_approval"], status, ts, ts,
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
    # 分类原值保留:_EVENT_CATEGORY_ALIASES 只做显示/筛选归并,不改库里存的原值。
    # 只有主办方在本次编辑里明确带了 category 才写该列,否则任意无关编辑都会把
    # 存量的旧 key(如 'social')静默归一化改写成 'party',违背模块约定。
    if "category" not in data:
        payload.pop("category", None)
    old_capacity = int(event.get("capacity") or 0)
    new_capacity = int(payload.get("capacity", old_capacity) or 0)
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
    # 扩容即放人进来:主办方把 capacity 调大(或改为 0 = 不限)后,把仍卡在候补名单
    # 的报名者按顺序顶为正式参加,并发通知——否则候补者永远进不来(此前只有『有人
    # 取消释放名额』才晋补)。缩容不做降级(不把已确认的人踢出),对用户更友好。
    if new_capacity != old_capacity and (new_capacity == 0 or new_capacity > old_capacity):
        _promote_waitlist(conn, event["id"], ts)
        _recount_going(conn, event["id"], ts)
    # 用哨兵区分『未提供 form_fields』与『提供了空数组(= 清空全部字段)』:
    # 传 form_fields=[] 时 [] 为 falsy,旧写法 `or` 会把它折叠成『未提供』而静默忽略,
    # 主办方无法把报名表清空为『无字段』。只要键出现就执行替换(空数组即清空)。
    if "form_fields" in data or "formFields" in data:
        replace_form_fields(conn, event["id"], data.get("form_fields") or data.get("formFields") or [])
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
    # Serialize concurrent registrations for the SAME event so the going /
    # waitlist decision below is race-free. On Postgres (production, multi
    # worker) the process-wide DB_LOCK is disabled, so two registrations racing
    # for an event's final slot could both read a stale ``going_count`` and both
    # be admitted as 'going', pushing confirmed attendees over the stated cap.
    # A row lock on the event row makes registrations for one event run one at a
    # time; we then count 'going' fresh (same JOIN-users, non-deleted count as
    # _recount_going) under the lock, so the decision reflects freshly-committed
    # state. This mirrors the room-join hardening (server_rooms.join_room). The
    # lock is held until conn.commit() below. SQLite (dev) has no FOR UPDATE and
    # its single-writer DB_LOCK already serializes writes, so it reuses the
    # pre-read going_count — the prior behaviour, unchanged.
    if _IS_POSTGRES:
        conn.execute("SELECT id FROM events WHERE id = ? FOR UPDATE", (event["id"],))
    existing = conn.execute(
        "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        (event["id"], user_id),
    ).fetchone()
    capacity = int(event.get("capacity") or 0)
    if _IS_POSTGRES:
        going = int(conn.execute(
            "SELECT COUNT(*) AS n FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
            " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL",
            (event["id"],),
        ).fetchone()["n"])
    else:
        going = int(event.get("going_count") or 0)
    already_going = bool(existing and existing["status"] == "going")
    requires_approval = bool(int(event.get("requires_approval") or 0))
    if already_going:
        # 已是正式参加(重复提交 / 改答案):保持 going,审核制也不打回。
        status = "going"
    elif requires_approval:
        # 审核制:所有新报名先进「待审核」,由主办方 approve 才转正(满员则转候补)。
        status = "pending"
    elif capacity and going >= capacity:
        status = "waitlist"
    else:
        status = "going"
    answers_json = json.dumps(clean_answers, ensure_ascii=False)
    if existing:
        conn.execute(
            "UPDATE event_registrations SET status = ?, answers_json = ?, updated_at = ? WHERE id = ?",
            (status, answers_json, ts, existing["id"]),
        )
    else:
        # Idempotent insert: a same-user double-click / concurrent double-submit
        # both read existing=None and both attempt the INSERT; without ON
        # CONFLICT the second violates UNIQUE(event_id, user_id) and surfaces as
        # an unhandled IntegrityError → HTTP 500. DO UPDATE converges duplicates
        # onto the single existing row (id + created_at preserved so waitlist
        # FIFO ordering is intact), matching the existing-row UPDATE branch.
        conn.execute(
            "INSERT INTO event_registrations (id, event_id, user_id, status, answers_json, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status,"
            " answers_json = excluded.answers_json, updated_at = excluded.updated_at",
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
    # 只数「可见的」going(JOIN users 且 deleted_at IS NULL),与头像墙 / attendees 口径
    # 一致:注销用户的报名行不再计入 going_count,避免『显示 10 人却只有 8 个头像』、
    # 也避免 is_full 因幽灵报名虚高而把没满的活动错锁为满。
    going = conn.execute(
        "SELECT COUNT(*) AS n FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL",
        (event_id,),
    ).fetchone()["n"]
    conn.execute("UPDATE events SET going_count = ?, updated_at = ? WHERE id = ?", (int(going), ts, event_id))


def _promote_waitlist(conn, event_id: str, ts: str) -> list[str]:
    """有人取消 / 主办方扩容后,按报名顺序把候补顶为正式参加,并给被顶上的人发通知。
    容量 0 = 不限,候补全部转正(此前存量候补也一并放进来)。已注销用户不占名额、
    也不晋补。返回被晋补的 user_id 列表。"""
    event = conn.execute(
        "SELECT capacity, title, organizer_user_id FROM events WHERE id = ?", (event_id,)
    ).fetchone()
    if not event:
        return []
    capacity = int(event["capacity"] or 0)
    # going 与 _recount_going 同口径(排除注销),否则 slots 会算错。
    going = conn.execute(
        "SELECT COUNT(*) AS n FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL",
        (event_id,),
    ).fetchone()["n"]
    query = (
        "SELECT reg.id, reg.user_id FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'waitlist' AND u.deleted_at IS NULL"
        " ORDER BY reg.created_at ASC"
    )
    params: list[Any] = [event_id]
    if capacity > 0:
        slots = capacity - int(going)
        if slots <= 0:
            return []
        query += " LIMIT ?"
        params.append(slots)
    # capacity <= 0 → 不限,候补全部转正(不加 LIMIT)。
    waiting = list(conn.execute(query, params))
    promoted: list[str] = []
    for row in waiting:
        conn.execute(
            "UPDATE event_registrations SET status = 'going', updated_at = ? WHERE id = ?",
            (ts, row["id"]),
        )
        if row["user_id"]:
            promoted.append(row["user_id"])
    if promoted:
        _notify_promoted(conn, event["title"] or "", event["organizer_user_id"] or "", promoted, ts)
    return promoted


def _notify_users(conn, organizer_id: str, user_ids: list[str], ts: str, *, ntype: str, content: str) -> None:
    """给一批用户写站内通知(铃铛)+ 尽力推送(APNs)。关键状态变化(转正/通过审核/
    主办方群发)不再对用户静默。铃铛按 content 直接渲染,故新 type 也能正常显示。"""
    for uid in user_ids:
        if not uid:
            continue
        # notifications.actor_id NOT NULL:优先用主办方(铃铛里显示主办方头像更有意义),
        # 无主办方(如后台加的合作商活动)则退回本人。
        actor_id = organizer_id or uid
        try:
            conn.execute(
                "INSERT INTO notifications (id, user_id, actor_id, type, content, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), uid, actor_id, ntype, content, ts),
            )
        except Exception:
            pass
        try:
            server_apns.enqueue(uid, ntype=ntype, actor_id=organizer_id or "", content=content)
        except Exception:
            pass


def _notify_promoted(conn, title: str, organizer_id: str, user_ids: list[str], ts: str) -> None:
    """候补转正是『你进了』的关键时刻——写一条站内通知(铃铛)+ 尽力推送(APNs)。"""
    content = f"🎉 你已从候补转为正式参加「{title}」" if title else "🎉 你已从候补转为正式参加该活动"
    _notify_users(conn, organizer_id, user_ids, ts, ntype="event_promoted", content=content)


# ── host management: 审核 / 签到 / 群发(luma 式主办方工具)────────────────────

def _assert_organizer(conn, id_or_slug: str, actor_id: str, actor_is_admin: bool) -> dict[str, Any]:
    event = get_event(conn, id_or_slug)
    if event["organizer_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有主办方可以管理报名", 403, "not_event_organizer")
    return event


def _count_going(conn, event_id: str) -> int:
    return int(conn.execute(
        "SELECT COUNT(*) AS n FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL",
        (event_id,),
    ).fetchone()["n"])


def approve_registration(
    conn, id_or_slug: str, actor_id: str, target_user_id: str,
    *, actor_is_admin: bool = False, now: Optional[str] = None,
) -> dict[str, Any]:
    """主办方通过一个待审核 / 候补的报名:有名额转正(going),满员则转候补(waitlist),
    并通知本人。审核制活动的核心动作。"""
    event = _assert_organizer(conn, id_or_slug, actor_id, actor_is_admin)
    ts = now or _now()
    if _IS_POSTGRES:
        conn.execute("SELECT id FROM events WHERE id = ? FOR UPDATE", (event["id"],))
    reg = conn.execute(
        "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        (event["id"], target_user_id),
    ).fetchone()
    if not reg or reg["status"] == "cancelled":
        raise APIError("该用户没有有效报名", 404, "registration_not_found")
    capacity = int(event.get("capacity") or 0)
    going = _count_going(conn, event["id"])
    already_going = reg["status"] == "going"
    new_status = "going" if (already_going or not capacity or going < capacity) else "waitlist"
    conn.execute(
        "UPDATE event_registrations SET status = ?, updated_at = ? WHERE id = ?",
        (new_status, ts, reg["id"]),
    )
    _recount_going(conn, event["id"], ts)
    if new_status == "going" and not already_going:
        title = event.get("title") or ""
        content = f"✅ 主办方通过了你对「{title}」的报名" if title else "✅ 你的报名已通过审核"
        _notify_users(conn, event.get("organizer_user_id") or "", [target_user_id], ts,
                      ntype="event_approved", content=content)
    conn.commit()
    return {"status": new_status,
            "event": serialize_event(conn, get_event(conn, event["id"]), actor_id, include_form=True, include_description=True)}


def decline_registration(
    conn, id_or_slug: str, actor_id: str, target_user_id: str,
    *, actor_is_admin: bool = False, now: Optional[str] = None,
) -> dict[str, Any]:
    """主办方拒绝 / 移除一个报名(标记 cancelled)。若被移除者原本占正式名额,顺带把
    候补按顺序顶补上来。"""
    event = _assert_organizer(conn, id_or_slug, actor_id, actor_is_admin)
    ts = now or _now()
    reg = conn.execute(
        "SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?",
        (event["id"], target_user_id),
    ).fetchone()
    if not reg:
        raise APIError("该用户没有报名", 404, "registration_not_found")
    conn.execute(
        "UPDATE event_registrations SET status = 'cancelled', checked_in_at = '', updated_at = ? WHERE id = ?",
        (ts, reg["id"]),
    )
    _promote_waitlist(conn, event["id"], ts)
    _recount_going(conn, event["id"], ts)
    conn.commit()
    return {"status": "cancelled",
            "event": serialize_event(conn, get_event(conn, event["id"]), actor_id, include_form=True, include_description=True)}


def set_checkin(
    conn, id_or_slug: str, actor_id: str, target_user_id: str, checked_in: bool,
    *, actor_is_admin: bool = False, now: Optional[str] = None,
) -> dict[str, Any]:
    """主办方现场签到 / 取消签到一名正式参加者。"""
    event = _assert_organizer(conn, id_or_slug, actor_id, actor_is_admin)
    ts = now or _now()
    reg = conn.execute(
        "SELECT id, status FROM event_registrations WHERE event_id = ? AND user_id = ?",
        (event["id"], target_user_id),
    ).fetchone()
    if not reg or reg["status"] != "going":
        raise APIError("只能给正式参加者签到", 400, "not_going")
    conn.execute(
        "UPDATE event_registrations SET checked_in_at = ?, updated_at = ? WHERE id = ?",
        (ts if checked_in else "", ts, reg["id"]),
    )
    conn.commit()
    return {"checked_in": bool(checked_in), "user_id": target_user_id, "userId": target_user_id}


def broadcast(
    conn, id_or_slug: str, actor_id: str, message: str,
    *, actor_is_admin: bool = False, now: Optional[str] = None,
) -> dict[str, Any]:
    """主办方给所有正式参加者群发一条公告(铃铛 + 尽力推送)。钱永不碰,这只是通知。"""
    event = _assert_organizer(conn, id_or_slug, actor_id, actor_is_admin)
    text = str(message or "").strip()[:MAX_ANSWER_LEN]
    if not text:
        raise APIError("公告内容不能为空", 400, "message_required")
    ts = now or _now()
    rows = conn.execute(
        "SELECT reg.user_id FROM event_registrations reg JOIN users u ON u.id = reg.user_id"
        " WHERE reg.event_id = ? AND reg.status = 'going' AND u.deleted_at IS NULL",
        (event["id"],),
    )
    recipients = [dict(r)["user_id"] for r in rows if dict(r).get("user_id")]
    title = event.get("title") or ""
    content = f"📣「{title}」主办方:{text}" if title else f"📣 活动主办方:{text}"
    _notify_users(conn, event.get("organizer_user_id") or "", recipients, ts,
                  ntype="event_broadcast", content=content)
    conn.commit()
    return {"sent": len(recipients), "count": len(recipients)}


# ── add-to-calendar (ICS) ─────────────────────────────────────────────────────

def _ics_dt(value: str) -> str:
    """ISO8601 → ICS UTC basic 'YYYYMMDDTHHMMSSZ'。best-effort,失败返回 ''。"""
    s = str(value or "").strip()
    if not s:
        return ""
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    except Exception:
        return ""


def _ics_escape(text: str) -> str:
    return (str(text or "").replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n").replace("\r", ""))


def event_ics(conn, id_or_slug: str, *, base_url: str = "") -> str:
    """生成单个活动的 .ics(VCALENDAR)文本,用于"添加到日历"。"""
    event = get_event(conn, id_or_slug)
    start = _ics_dt(event.get("starts_at"))
    end = _ics_dt(event.get("ends_at"))
    if not end and start:
        try:  # 无结束时间默认 +2 小时,避免零时长日历块。
            dt = datetime.strptime(start, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            end = (dt + timedelta(hours=2)).strftime("%Y%m%dT%H%M%SZ")
        except Exception:
            end = start
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    location = " ".join(x for x in [event.get("venue_name") or "", event.get("address") or ""] if x)
    slug_or_id = event.get("slug") or event["id"]
    raw_url = event.get("external_url") or (f"{base_url.rstrip('/')}/events/{slug_or_id}" if base_url else "")
    # 剥掉换行/控制符:URL 行不走 _ics_escape,external_url 内嵌 CRLF 会注入伪造的
    # 日历行/VEVENT 到公开下载的 .ics(iCal 注入)。SUMMARY/DESC/LOCATION 已由
    # _ics_escape 处理,这里单独净化 URL。
    url = re.sub(r"[\x00-\x1f\x7f]", "", raw_url)
    desc = event.get("subtitle") or event.get("description") or ""
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Machi//Events//EN",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
        f"UID:{event['id']}@machicity.com", f"DTSTAMP:{stamp}",
    ]
    if start:
        lines.append(f"DTSTART:{start}")
    if end:
        lines.append(f"DTEND:{end}")
    lines.append(f"SUMMARY:{_ics_escape(event.get('title') or '')}")
    if desc:
        lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    if url:
        lines.append(f"URL:{url}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"


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
        " ORDER BY CASE reg.status WHEN 'pending' THEN 0 WHEN 'going' THEN 1 ELSE 2 END, reg.created_at ASC",
        (event["id"],),
    )
    items = []
    for r in rows:
        d = dict(r)
        try:
            answers = json.loads(d.get("answers_json") or "{}")
        except Exception:
            answers = {}
        checked_in = bool(d.get("checked_in_at") or "")
        entry = {
            "user": _brief_user({
                "id": d.get("user_id", ""), "handle": d.get("handle", ""),
                "display_name": d.get("display_name", ""), "avatar_url": d.get("avatar_url", ""),
                "avatar_symbol": d.get("avatar_symbol", ""), "avatar_color": d.get("avatar_color", ""),
                "is_verified_member": d.get("is_verified_member", 0),
            }),
            "user_id": d.get("user_id", ""),
            "userId": d.get("user_id", ""),
            "status": d.get("status", "going"),
            "checked_in": checked_in,
            "checkedIn": checked_in,
            "checked_in_at": d.get("checked_in_at", "") or "",
            "checkedInAt": d.get("checked_in_at", "") or "",
            "created_at": d.get("created_at", ""),
            "createdAt": d.get("created_at", ""),
        }
        if include_answers:
            entry["answers"] = answers if isinstance(answers, dict) else {}
        items.append(entry)
    return {"items": items, "form_fields": fields, "formFields": fields, "total": len(items)}
