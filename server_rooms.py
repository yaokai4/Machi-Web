"""社交房间(交友 · 约局 · 约饭) — pure product module.

一个「房间」是一个轻量、公开的临时聚集点:任何用户开一个局(约饭/约酒/
桌游/运动/学习/语言交换…),别人进来就像进了一个游戏房间——能看到房间里
的人、标题、说明和时间,并在房间内聊天。与私信(加密中继)不同,房间内容
是公开广场性质:浏览对所有人开放,发言仅限成员。

Like ``server_partners.py`` / ``server_jlpt.py`` this is a deliberately
SEPARATE, mostly-pure module: it imports nothing from ``server`` so it
unit-tests in isolation. Everything is a sqlite3-shaped ``conn`` + stdlib;
``server.py`` keeps the thin HTTP handlers (auth / JSON envelope / content
policy) and calls into these helpers.

Money is never touched here.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from server_errors import APIError

# ── constants ──────────────────────────────────────────────────────────────

# 约局 = 搭子 / 即兴组队。分类按「想一起做什么」,和活动(按活动形式)彻底区分:
# 约局是"现在/最近找人一起做件小事,进来就聊",活动是"正式策划、发海报、报名参加"。
ROOM_TYPES: tuple[str, ...] = (
    "meal",       # 饭搭子
    "drink",      # 酒搭子
    "coffee",     # 咖啡
    "sport",      # 运动搭子
    "study",      # 学习搭子
    "play",       # 玩乐(桌游 / KTV / 电玩)
    "carpool",    # 拼车拼单
    "outing",     # 出行搭子
    "language",   # 语言交换
    "chat",       # 随便聊
    "other",
)
ROOM_TYPE_LABELS_ZH = {
    "meal": "饭搭子", "drink": "酒搭子", "coffee": "咖啡", "sport": "运动搭子",
    "study": "学习搭子", "play": "玩乐", "carpool": "拼车拼单", "outing": "出行搭子",
    "language": "语言交换", "chat": "随便聊", "other": "其他",
}
# 旧数据(0708 首发的分类)→新分类,只用于显示与筛选归并,不改库里存的原值。
_ROOM_TYPE_ALIASES = {
    "dining": "meal", "drinks": "drink", "boardgame": "play", "karaoke": "play",
    "sports": "sport", "hangout": "chat",
}

ROOM_STATUSES = ("open", "full", "closed", "cancelled")
MAX_TITLE_LEN = 80
MAX_DESCRIPTION_LEN = 1000
MAX_LOCATION_LEN = 120
MAX_CAPACITY = 200
MAX_ACTIVE_ROOMS_PER_HOST = 5
MAX_MESSAGE_LEN = 1000
MEMBER_PREVIEW_COUNT = 5
DEFAULT_PAGE = 20
MAX_PAGE = 50


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_room_type(raw: Any, default: str = "chat") -> str:
    value = str(raw or "").strip().lower()
    value = _ROOM_TYPE_ALIASES.get(value, value)
    return value if value in ROOM_TYPES else default


def room_type_label(raw: Any) -> str:
    """Display label that also resolves legacy aliases so old rows don't all
    fall through to 「其他」."""
    value = str(raw or "").strip().lower()
    value = _ROOM_TYPE_ALIASES.get(value, value)
    return ROOM_TYPE_LABELS_ZH.get(value, "其他")


def _brief_user(row: dict[str, Any]) -> dict[str, Any]:
    """Lightweight member payload — enough for an avatar stack, nothing PII."""
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


def _member_rows(conn, room_id: str, limit: int = 0) -> list[dict[str, Any]]:
    sql = (
        "SELECT u.id, u.handle, u.display_name, u.avatar_url, u.avatar_symbol,"
        " u.avatar_color, u.is_verified_member, m.role, m.joined_at"
        " FROM social_room_members m JOIN users u ON u.id = m.user_id"
        " WHERE m.room_id = ? AND u.deleted_at IS NULL"
        " ORDER BY CASE WHEN m.role = 'host' THEN 0 ELSE 1 END, m.joined_at ASC"
    )
    params: list[Any] = [room_id]
    if limit > 0:
        sql += " LIMIT ?"
        params.append(limit)
    rows = []
    for r in conn.execute(sql, params):
        d = dict(r)
        payload = _brief_user(d)
        payload["role"] = d.get("role", "member")
        payload["joined_at"] = d.get("joined_at", "")
        payload["joinedAt"] = d.get("joined_at", "")
        rows.append(payload)
    return rows


def serialize_room(
    conn,
    row: dict[str, Any],
    viewer_id: Optional[str] = None,
    include_members: bool = False,
) -> dict[str, Any]:
    room_id = row["id"]
    members = _member_rows(conn, room_id) if include_members else _member_rows(conn, room_id, MEMBER_PREVIEW_COUNT)
    viewer_joined = False
    viewer_role = ""
    if viewer_id:
        m = conn.execute(
            "SELECT role FROM social_room_members WHERE room_id = ? AND user_id = ?",
            (room_id, viewer_id),
        ).fetchone()
        if m:
            viewer_joined = True
            viewer_role = m["role"]
    capacity = int(row.get("capacity") or 0)
    member_count = int(row.get("member_count") or 0)
    return {
        "id": room_id,
        "title": row.get("title", ""),
        "description": row.get("description", ""),
        "room_type": row.get("room_type", "chat"),
        "roomType": row.get("room_type", "chat"),
        "room_type_label": room_type_label(row.get("room_type", "")),
        "host_user_id": row.get("host_user_id", ""),
        "hostUserId": row.get("host_user_id", ""),
        "country_code": row.get("country_code", ""),
        "city_slug": row.get("city_slug", ""),
        "citySlug": row.get("city_slug", ""),
        "region_code": row.get("region_code", ""),
        "regionCode": row.get("region_code", ""),
        "location_hint": row.get("location_hint", ""),
        "locationHint": row.get("location_hint", ""),
        "starts_at": row.get("starts_at", ""),
        "startsAt": row.get("starts_at", ""),
        "capacity": capacity,
        "member_count": member_count,
        "memberCount": member_count,
        "is_full": bool(capacity and member_count >= capacity),
        "isFull": bool(capacity and member_count >= capacity),
        "status": row.get("status", "open"),
        "message_count": int(row.get("message_count") or 0),
        "messageCount": int(row.get("message_count") or 0),
        "last_activity_at": row.get("last_activity_at", ""),
        "lastActivityAt": row.get("last_activity_at", ""),
        "created_at": row.get("created_at", ""),
        "createdAt": row.get("created_at", ""),
        "members": members,
        "viewer_joined": viewer_joined,
        "viewerJoined": viewer_joined,
        "viewer_role": viewer_role,
        "viewerRole": viewer_role,
    }


# ── queries ──────────────────────────────────────────────────────────────────

def list_rooms(
    conn,
    *,
    viewer_id: Optional[str] = None,
    country_code: str = "",
    city_slug: str = "",
    region_code: str = "",
    room_type: str = "",
    include_closed: bool = False,
    mine: bool = False,
    limit: int = DEFAULT_PAGE,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or DEFAULT_PAGE), MAX_PAGE))
    offset = max(0, int(offset or 0))
    clauses = ["r.deleted_at IS NULL"]
    params: list[Any] = []
    if mine and viewer_id:
        clauses.append("EXISTS (SELECT 1 FROM social_room_members mm WHERE mm.room_id = r.id AND mm.user_id = ?)")
        params.append(viewer_id)
    elif not include_closed:
        clauses.append("r.status IN ('open', 'full')")
    if room_type and room_type in ROOM_TYPES:
        # 也匹配归并到该分类的旧 key(如 play 兼容旧 boardgame/karaoke)。
        legacy = [old for old, new in _ROOM_TYPE_ALIASES.items() if new == room_type]
        keys = [room_type, *legacy]
        clauses.append("r.room_type IN (%s)" % ",".join("?" * len(keys)))
        params.extend(keys)
    if city_slug:
        clauses.append("r.city_slug = ?")
        params.append(city_slug.strip().lower())
    elif region_code:
        clauses.append("r.region_code = ?")
        params.append(region_code.strip().lower())
    elif country_code:
        clauses.append("r.country_code = ?")
        params.append(country_code.strip().lower())
    total = conn.execute(
        f"SELECT COUNT(*) AS n FROM social_rooms r WHERE {' AND '.join(clauses)}", params
    ).fetchone()["n"]
    rows = list(conn.execute(
        f"SELECT r.* FROM social_rooms r WHERE {' AND '.join(clauses)}"
        " ORDER BY r.last_activity_at DESC, r.created_at DESC LIMIT ? OFFSET ?",
        [*params, limit + 1, offset],
    ))
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [serialize_room(conn, dict(r), viewer_id) for r in rows]
    return {
        "items": items,
        "total": int(total),
        "has_more": has_more,
        "hasMore": has_more,
        "next_offset": offset + limit if has_more else None,
        "nextOffset": offset + limit if has_more else None,
    }


def get_room(conn, room_id: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM social_rooms WHERE id = ? AND deleted_at IS NULL", (room_id,)
    ).fetchone()
    if not row:
        raise APIError("房间不存在或已解散", 404, "room_not_found")
    return dict(row)


# ── mutations ────────────────────────────────────────────────────────────────

def create_room(
    conn,
    *,
    host_user_id: str,
    title: str,
    description: str = "",
    room_type: str = "chat",
    country_code: str = "jp",
    city_slug: str = "",
    region_code: str = "",
    location_hint: str = "",
    starts_at: str = "",
    capacity: int = 0,
    now: Optional[str] = None,
) -> dict[str, Any]:
    title = str(title or "").strip()[:MAX_TITLE_LEN]
    if not title:
        raise APIError("标题不能为空", 400, "title_required")
    description = str(description or "").strip()[:MAX_DESCRIPTION_LEN]
    location_hint = str(location_hint or "").strip()[:MAX_LOCATION_LEN]
    starts_at = str(starts_at or "").strip()[:64]
    try:
        capacity = max(0, min(int(capacity or 0), MAX_CAPACITY))
    except (TypeError, ValueError):
        capacity = 0
    active = conn.execute(
        "SELECT COUNT(*) AS n FROM social_rooms WHERE host_user_id = ?"
        " AND status IN ('open', 'full') AND deleted_at IS NULL",
        (host_user_id,),
    ).fetchone()["n"]
    if int(active) >= MAX_ACTIVE_ROOMS_PER_HOST:
        raise APIError("同时开着的房间太多了,先关掉一些再开新的吧", 400, "too_many_active_rooms")
    ts = now or _now()
    room_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO social_rooms (id, host_user_id, title, description, room_type,"
        " country_code, city_slug, region_code, location_hint, starts_at, capacity,"
        " status, member_count, message_count, last_activity_at, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, 0, ?, ?, ?)",
        (
            room_id, host_user_id, title, description, normalize_room_type(room_type),
            (country_code or "jp").strip().lower(), (city_slug or "").strip().lower(),
            (region_code or "").strip().lower(), location_hint, starts_at, capacity,
            ts, ts, ts,
        ),
    )
    conn.execute(
        "INSERT INTO social_room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'host', ?)",
        (room_id, host_user_id, ts),
    )
    conn.commit()
    return get_room(conn, room_id)


def update_room(
    conn,
    room_id: str,
    actor_id: str,
    data: dict[str, Any],
    *,
    actor_is_admin: bool = False,
    now: Optional[str] = None,
) -> dict[str, Any]:
    room = get_room(conn, room_id)
    if room["host_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有房主可以修改房间", 403, "not_room_host")
    sets: list[str] = []
    params: list[Any] = []
    if "title" in data:
        title = str(data.get("title") or "").strip()[:MAX_TITLE_LEN]
        if not title:
            raise APIError("标题不能为空", 400, "title_required")
        sets.append("title = ?"); params.append(title)
    if "description" in data:
        sets.append("description = ?"); params.append(str(data.get("description") or "").strip()[:MAX_DESCRIPTION_LEN])
    if "room_type" in data or "roomType" in data:
        sets.append("room_type = ?"); params.append(normalize_room_type(data.get("room_type") or data.get("roomType")))
    if "location_hint" in data or "locationHint" in data:
        sets.append("location_hint = ?"); params.append(str(data.get("location_hint") or data.get("locationHint") or "").strip()[:MAX_LOCATION_LEN])
    if "starts_at" in data or "startsAt" in data:
        sets.append("starts_at = ?"); params.append(str(data.get("starts_at") or data.get("startsAt") or "").strip()[:64])
    if "capacity" in data:
        try:
            cap = max(0, min(int(data.get("capacity") or 0), MAX_CAPACITY))
        except (TypeError, ValueError):
            cap = 0
        sets.append("capacity = ?"); params.append(cap)
    if "status" in data:
        status = str(data.get("status") or "").strip().lower()
        if status not in ROOM_STATUSES:
            raise APIError("无效的房间状态", 400, "invalid_status")
        sets.append("status = ?"); params.append(status)
    if not sets:
        return serialize_room(conn, room, actor_id, include_members=True)
    ts = now or _now()
    sets.append("updated_at = ?"); params.append(ts)
    sets.append("last_activity_at = ?"); params.append(ts)
    params.append(room_id)
    conn.execute(f"UPDATE social_rooms SET {', '.join(sets)} WHERE id = ?", params)
    _sync_full_status(conn, room_id)
    conn.commit()
    return serialize_room(conn, get_room(conn, room_id), actor_id, include_members=True)


def delete_room(conn, room_id: str, actor_id: str, *, actor_is_admin: bool = False, now: Optional[str] = None) -> None:
    room = get_room(conn, room_id)
    if room["host_user_id"] != actor_id and not actor_is_admin:
        raise APIError("只有房主可以解散房间", 403, "not_room_host")
    ts = now or _now()
    conn.execute(
        "UPDATE social_rooms SET deleted_at = ?, status = 'cancelled', updated_at = ? WHERE id = ?",
        (ts, ts, room_id),
    )
    conn.commit()


def _sync_full_status(conn, room_id: str) -> None:
    """Keep status open⇄full in line with member_count vs capacity."""
    row = conn.execute(
        "SELECT capacity, member_count, status FROM social_rooms WHERE id = ?", (room_id,)
    ).fetchone()
    if not row:
        return
    capacity = int(row["capacity"] or 0)
    count = int(row["member_count"] or 0)
    status = row["status"]
    if status == "open" and capacity and count >= capacity:
        conn.execute("UPDATE social_rooms SET status = 'full' WHERE id = ?", (room_id,))
    elif status == "full" and (not capacity or count < capacity):
        conn.execute("UPDATE social_rooms SET status = 'open' WHERE id = ?", (room_id,))


def join_room(conn, room_id: str, user_id: str, *, display_name: str = "", now: Optional[str] = None) -> dict[str, Any]:
    room = get_room(conn, room_id)
    if room["status"] in ("closed", "cancelled"):
        raise APIError("这个局已经结束了", 400, "room_closed")
    existing = conn.execute(
        "SELECT 1 FROM social_room_members WHERE room_id = ? AND user_id = ?", (room_id, user_id)
    ).fetchone()
    if existing:
        return serialize_room(conn, get_room(conn, room_id), user_id, include_members=True)
    capacity = int(room["capacity"] or 0)
    if capacity and int(room["member_count"] or 0) >= capacity:
        raise APIError("房间已满员", 400, "room_full")
    ts = now or _now()
    conn.execute(
        "INSERT INTO social_room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
        (room_id, user_id, ts),
    )
    conn.execute(
        "UPDATE social_rooms SET member_count = member_count + 1, last_activity_at = ?, updated_at = ? WHERE id = ?",
        (ts, ts, room_id),
    )
    _post_system_message(conn, room_id, user_id, f"{display_name or '有人'} 加入了房间", ts)
    _sync_full_status(conn, room_id)
    conn.commit()
    return serialize_room(conn, get_room(conn, room_id), user_id, include_members=True)


def leave_room(conn, room_id: str, user_id: str, *, display_name: str = "", now: Optional[str] = None) -> dict[str, Any]:
    room = get_room(conn, room_id)
    member = conn.execute(
        "SELECT role FROM social_room_members WHERE room_id = ? AND user_id = ?", (room_id, user_id)
    ).fetchone()
    if not member:
        return serialize_room(conn, room, user_id, include_members=True)
    ts = now or _now()
    if member["role"] == "host":
        # 房主退出 = 解散房间(避免无主房)。返回 disbanded 标记而不是报错——
        # 对房主而言这是一次成功操作。
        conn.execute(
            "UPDATE social_rooms SET deleted_at = ?, status = 'cancelled', updated_at = ? WHERE id = ?",
            (ts, ts, room_id),
        )
        conn.commit()
        return {"disbanded": True, "id": room_id}
    conn.execute(
        "DELETE FROM social_room_members WHERE room_id = ? AND user_id = ?", (room_id, user_id)
    )
    conn.execute(
        "UPDATE social_rooms SET member_count = MAX(member_count - 1, 1), last_activity_at = ?, updated_at = ? WHERE id = ?",
        (ts, ts, room_id),
    )
    _post_system_message(conn, room_id, user_id, f"{display_name or '有人'} 离开了房间", ts)
    _sync_full_status(conn, room_id)
    conn.commit()
    return serialize_room(conn, get_room(conn, room_id), user_id, include_members=True)


# ── room chat ────────────────────────────────────────────────────────────────

def _post_system_message(conn, room_id: str, user_id: str, content: str, ts: str) -> None:
    conn.execute(
        "INSERT INTO social_room_messages (id, room_id, user_id, content, kind, created_at)"
        " VALUES (?, ?, ?, ?, 'system', ?)",
        (str(uuid.uuid4()), room_id, user_id, content[:MAX_MESSAGE_LEN], ts),
    )


def post_message(conn, room_id: str, user_id: str, content: str, *, now: Optional[str] = None) -> dict[str, Any]:
    room = get_room(conn, room_id)
    if room["status"] in ("closed", "cancelled"):
        raise APIError("这个局已经结束了", 400, "room_closed")
    member = conn.execute(
        "SELECT 1 FROM social_room_members WHERE room_id = ? AND user_id = ?", (room_id, user_id)
    ).fetchone()
    if not member:
        raise APIError("先加入房间才能发言", 403, "not_room_member")
    content = str(content or "").strip()
    if not content:
        raise APIError("内容不能为空", 400, "content_required")
    if len(content) > MAX_MESSAGE_LEN:
        raise APIError("内容太长了", 400, "content_too_long")
    ts = now or _now()
    message_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO social_room_messages (id, room_id, user_id, content, kind, created_at)"
        " VALUES (?, ?, ?, ?, 'text', ?)",
        (message_id, room_id, user_id, content, ts),
    )
    conn.execute(
        "UPDATE social_rooms SET message_count = message_count + 1, last_activity_at = ?, updated_at = ? WHERE id = ?",
        (ts, ts, room_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT m.*, u.handle, u.display_name, u.avatar_url, u.avatar_symbol, u.avatar_color, u.is_verified_member"
        " FROM social_room_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?",
        (message_id,),
    ).fetchone()
    return _serialize_message(dict(row))


def _serialize_message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "room_id": row.get("room_id", ""),
        "roomId": row.get("room_id", ""),
        "content": row.get("content", ""),
        "kind": row.get("kind", "text"),
        "created_at": row.get("created_at", ""),
        "createdAt": row.get("created_at", ""),
        "user": _brief_user({
            "id": row.get("user_id", ""),
            "handle": row.get("handle", ""),
            "display_name": row.get("display_name", ""),
            "avatar_url": row.get("avatar_url", ""),
            "avatar_symbol": row.get("avatar_symbol", ""),
            "avatar_color": row.get("avatar_color", ""),
            "is_verified_member": row.get("is_verified_member", 0),
        }),
    }


def list_messages(conn, room_id: str, *, before: str = "", limit: int = 50) -> dict[str, Any]:
    get_room(conn, room_id)  # 404 guard
    limit = max(1, min(int(limit or 50), 100))
    clauses = ["m.room_id = ?"]
    params: list[Any] = [room_id]
    if before:
        clauses.append("m.created_at < ?")
        params.append(before)
    rows = list(conn.execute(
        "SELECT m.*, u.handle, u.display_name, u.avatar_url, u.avatar_symbol, u.avatar_color, u.is_verified_member"
        f" FROM social_room_messages m JOIN users u ON u.id = m.user_id WHERE {' AND '.join(clauses)}"
        " ORDER BY m.created_at DESC LIMIT ?",
        [*params, limit + 1],
    ))
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [_serialize_message(dict(r)) for r in reversed(rows)]  # oldest→newest for chat UI
    next_before = rows[-1]["created_at"] if has_more and rows else None
    return {"items": items, "has_more": has_more, "hasMore": has_more, "next_before": next_before, "nextBefore": next_before}
