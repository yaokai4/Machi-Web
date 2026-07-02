"""External partner import backends (星域东京 等专属后台) — product module.

A *partner* is a scoped, token-gated mini-backend served at ``/partner/<key>``.
It lets an external real-estate agency (e.g. 星域东京 / Stareal) batch-import
listings + manage its own 预约联系人 (reservation contacts) WITHOUT being a
Machi site admin: the access token authorises ONLY that partner's own data.

Like ``server_lifehub.py`` this is a deliberately SEPARATE, mostly-pure module —
new product logic lands here, not in the 38k-line ``server.py`` monolith. To
avoid a circular import it imports nothing from ``server``: everything is a
sqlite3-shaped ``conn`` + stdlib + injected callables, so it unit-tests in
isolation. ``server.py`` keeps the thin HTTP handlers and provides the few host
helpers that genuinely need its internals (media persistence, user creation).

Money is never touched here.
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import re
import secrets
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

# ── constants ──────────────────────────────────────────────────────────────

PARTNER_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$")
TOKEN_PREFIX = "mpt_"  # machi partner token
PBKDF2_ITERS = 120_000

LISTING_INTENTS = ("rent", "sale", "investment")
PARTNER_PROMOTION_TYPE = "featured"
PARTNER_PROMOTION_WEIGHT = 28  # > the generic 20 used by content packs

DEFAULT_BADGE_PRESETS = ["Machi推荐", "星域臻选", "认证房源", "人气优选", "新上线"]
MAX_BADGES_PER_LISTING = 4
MAX_IMAGES_PER_LISTING = 20
MAX_IMPORT_ROWS = 1000

# Listing-attribute keys this module writes onto rental listings. These must be
# mirrored into ``server.LISTING_ATTRIBUTE_KEYS['rental']`` so they survive a
# later edit through the normal listing API and flow into the public payload.
PARTNER_RENTAL_ATTR_KEYS = (
    "listing_intent", "sale_price", "yield_rate", "building_age", "structure",
    "land_area", "nearest_lines", "source_url", "machi_recommended",
    "machi_badges", "reservation_contact", "reservation_contact_id", "partner_key",
)


# ── token hashing (pure stdlib) ──────────────────────────────────────────────

def generate_partner_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(30)


def hash_partner_token(token: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", token.encode("utf-8"), salt, PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_partner_token(token: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", token.encode("utf-8"), bytes.fromhex(salt_hex), int(iters_s))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def token_hint(token: str) -> str:
    return token[-4:] if len(token) >= 4 else ""


# ── small helpers ────────────────────────────────────────────────────────────

def _iso(now: str | None) -> str:
    return now or datetime.now(timezone.utc).isoformat()


def _truthy(value: Any) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "是", "✓", "○", "推荐"}


def _attr_text_type(value: Any) -> tuple[str, str]:
    if isinstance(value, bool):
        return ("true" if value else "false", "bool")
    if isinstance(value, int) and not isinstance(value, bool):
        return (str(value), "int")
    if isinstance(value, float):
        return (str(value), "float")
    if isinstance(value, (list, dict)):
        try:
            return (json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:16000], "json")
        except Exception:
            return ("", "string")
    return (str(value).strip()[:1000], "string")


def _split_multi(value: Any) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    parts = re.split(r"[\n\r,，、;；\s]+", text)
    return [p.strip() for p in parts if p.strip()]


def _to_number(value: Any) -> Optional[float]:
    text = str(value or "").strip()
    if not text:
        return None
    # strip currency words / separators: 万円, 円, 元, ¥, $, commas
    cleaned = re.sub(r"[,，\s¥$￥円元]", "", text)
    multiplier = 1.0
    if "万" in cleaned:
        cleaned = cleaned.replace("万", "")
        multiplier = 10000.0
    try:
        return float(cleaned) * multiplier
    except Exception:
        return None


# ── partner CRUD ─────────────────────────────────────────────────────────────

def get_partner(conn, key: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM partners WHERE partner_key = ? LIMIT 1", (str(key or "").strip().lower(),)
    ).fetchone()
    return dict(row) if row else None


def list_partners(conn) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT * FROM partners ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def serialize_partner(row: dict[str, Any], *, public: bool = False) -> dict[str, Any]:
    """``public=True`` is the branding payload the /partner page may show before
    unlock — it must never include the seller account id or token internals."""
    try:
        badges = json.loads(row.get("default_badges_json") or "[]")
        if not isinstance(badges, list):
            badges = []
    except Exception:
        badges = []
    base = {
        "key": row.get("partner_key", ""),
        "name": row.get("name", "") or "",
        "nameJa": row.get("name_ja", "") or "",
        "nameEn": row.get("name_en", "") or "",
        "website": row.get("website", "") or "",
        "brandColor": row.get("brand_color", "") or "",
        "accentColor": row.get("accent_color", "") or "",
        "logoUrl": row.get("logo_url", "") or "",
        "intro": row.get("intro", "") or "",
        "status": row.get("status", "active"),
    }
    if public:
        return base
    base.update({
        "defaultCitySlug": row.get("default_city_slug", "") or "",
        "defaultRegionCode": row.get("default_region_code", "") or "",
        "defaultCountryCode": row.get("default_country_code", "jp") or "jp",
        "defaultListingType": row.get("default_listing_type", "rental") or "rental",
        "defaultCategory": row.get("default_category", "") or "",
        "saleEnabled": bool(row.get("sale_enabled", 0)),
        "machiRecommendedDefault": bool(row.get("machi_recommended_default", 1)),
        "defaultBadges": badges,
        "sellerUserId": row.get("seller_user_id", "") or "",
        "tokenHint": row.get("token_hint", "") or "",
        "tokenRotatedAt": row.get("token_rotated_at", "") or "",
        "listingCount": int(row.get("listing_count") or 0),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    })
    return base


def create_partner(
    conn,
    *,
    key: str,
    name: str,
    seller_user_id: str,
    name_ja: str = "",
    name_en: str = "",
    website: str = "",
    default_city_slug: str = "tokyo",
    default_region_code: str = "",
    default_country_code: str = "jp",
    default_category: str = "",
    sale_enabled: bool = False,
    brand_color: str = "",
    accent_color: str = "",
    logo_url: str = "",
    intro: str = "",
    default_badges: Optional[list[str]] = None,
    machi_recommended_default: bool = True,
    created_by_admin_id: str = "",
    now: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Create a partner and return (partner_row, plaintext_token). The plaintext
    token is shown to the admin ONCE — only its hash is stored."""
    key = str(key or "").strip().lower()
    if not PARTNER_KEY_RE.match(key):
        raise ValueError("partner key must be 3-40 chars: a-z 0-9 and dashes")
    if get_partner(conn, key):
        raise ValueError("partner key already exists")
    token = generate_partner_token()
    now = _iso(now)
    badges = [b for b in (default_badges or DEFAULT_BADGE_PRESETS) if str(b).strip()][:MAX_BADGES_PER_LISTING]
    pid = "partner_" + uuid.uuid4().hex
    conn.execute(
        """INSERT INTO partners (
            id, partner_key, name, name_ja, name_en, website, access_token_hash, token_hint,
            token_rotated_at, seller_user_id, default_city_slug, default_region_code,
            default_country_code, default_listing_type, default_category, sale_enabled,
            brand_color, accent_color, logo_url, machi_recommended_default, default_badges_json,
            intro, status, listing_count, created_by_admin_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rental', ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)""",
        (
            pid, key, name, name_ja, name_en, website, hash_partner_token(token), token_hint(token),
            now, seller_user_id, default_city_slug, default_region_code, default_country_code,
            default_category, 1 if sale_enabled else 0, brand_color, accent_color, logo_url,
            1 if machi_recommended_default else 0, json.dumps(badges, ensure_ascii=False),
            intro, created_by_admin_id, now, now,
        ),
    )
    return get_partner(conn, key), token


_PARTNER_EDITABLE = {
    "name": "name", "name_ja": "name_ja", "name_en": "name_en", "website": "website",
    "default_city_slug": "default_city_slug", "default_region_code": "default_region_code",
    "default_country_code": "default_country_code", "default_category": "default_category",
    "brand_color": "brand_color", "accent_color": "accent_color", "logo_url": "logo_url",
    "intro": "intro", "status": "status",
}


def update_partner(conn, key: str, fields: dict[str, Any], *, now: str | None = None) -> Optional[dict[str, Any]]:
    partner = get_partner(conn, key)
    if not partner:
        return None
    sets: list[str] = []
    params: list[Any] = []
    for src, col in _PARTNER_EDITABLE.items():
        if src in fields:
            sets.append(f"{col} = ?")
            params.append(str(fields[src] or "").strip())
    if "sale_enabled" in fields:
        sets.append("sale_enabled = ?")
        params.append(1 if _truthy(fields["sale_enabled"]) else 0)
    if "machi_recommended_default" in fields:
        sets.append("machi_recommended_default = ?")
        params.append(1 if _truthy(fields["machi_recommended_default"]) else 0)
    if "default_badges" in fields and isinstance(fields["default_badges"], list):
        badges = [str(b).strip() for b in fields["default_badges"] if str(b).strip()][:MAX_BADGES_PER_LISTING]
        sets.append("default_badges_json = ?")
        params.append(json.dumps(badges, ensure_ascii=False))
    if not sets:
        return partner
    sets.append("updated_at = ?")
    params.append(_iso(now))
    params.append(partner["partner_key"])
    conn.execute(f"UPDATE partners SET {', '.join(sets)} WHERE partner_key = ?", params)
    return get_partner(conn, key)


def rotate_partner_token(conn, key: str, *, now: str | None = None) -> Optional[str]:
    partner = get_partner(conn, key)
    if not partner:
        return None
    token = generate_partner_token()
    now = _iso(now)
    conn.execute(
        "UPDATE partners SET access_token_hash = ?, token_hint = ?, token_rotated_at = ?, updated_at = ? WHERE partner_key = ?",
        (hash_partner_token(token), token_hint(token), now, now, partner["partner_key"]),
    )
    return token


def authenticate_partner(conn, key: str, token: str) -> Optional[dict[str, Any]]:
    partner = get_partner(conn, key)
    if not partner or partner.get("status") != "active":
        return None
    if not token or not verify_partner_token(token, partner.get("access_token_hash") or ""):
        return None
    return partner


# ── reservation contacts ─────────────────────────────────────────────────────

def serialize_contact(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name", "") or "",
        "nameJa": row.get("name_ja", "") or "",
        "title": row.get("title", "") or "",
        "phone": row.get("phone", "") or "",
        "email": row.get("email", "") or "",
        "lineId": row.get("line_id", "") or "",
        "wechatId": row.get("wechat_id", "") or "",
        "whatsapp": row.get("whatsapp", "") or "",
        "languages": row.get("languages", "") or "",
        "photoUrl": row.get("photo_url", "") or "",
        "note": row.get("note", "") or "",
        "isDefault": bool(row.get("is_default", 0)),
        "sortOrder": int(row.get("sort_order") or 0),
        "createdAt": row.get("created_at"),
    }


def contact_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    """Compact display snapshot denormalised onto each listing (so listing pages
    never join). Re-synced when a contact is edited (see resync_contact)."""
    return {
        "id": row.get("id"),
        "name": row.get("name", "") or "",
        "nameJa": row.get("name_ja", "") or "",
        "title": row.get("title", "") or "",
        "phone": row.get("phone", "") or "",
        "email": row.get("email", "") or "",
        "lineId": row.get("line_id", "") or "",
        "wechatId": row.get("wechat_id", "") or "",
        "whatsapp": row.get("whatsapp", "") or "",
        "languages": row.get("languages", "") or "",
        "photoUrl": row.get("photo_url", "") or "",
    }


def list_partner_contacts(conn, key: str, *, include_inactive: bool = False) -> list[dict[str, Any]]:
    clause = "" if include_inactive else "AND status = 'active'"
    rows = conn.execute(
        f"SELECT * FROM partner_contacts WHERE partner_key = ? {clause} ORDER BY is_default DESC, sort_order ASC, created_at ASC",
        (key,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_partner_contact(conn, key: str, contact_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM partner_contacts WHERE partner_key = ? AND id = ? LIMIT 1", (key, contact_id)
    ).fetchone()
    return dict(row) if row else None


def default_contact(conn, key: str) -> Optional[dict[str, Any]]:
    contacts = list_partner_contacts(conn, key)
    if not contacts:
        return None
    for c in contacts:
        if c.get("is_default"):
            return c
    return contacts[0]


_CONTACT_FIELDS = ("name", "name_ja", "title", "phone", "email", "line_id", "wechat_id", "whatsapp", "languages", "photo_url", "note")


def create_partner_contact(conn, key: str, fields: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    now = _iso(now)
    cid = "pc_" + uuid.uuid4().hex
    is_default = 1 if _truthy(fields.get("is_default")) else 0
    if is_default:
        conn.execute("UPDATE partner_contacts SET is_default = 0 WHERE partner_key = ?", (key,))
    elif not conn.execute("SELECT 1 FROM partner_contacts WHERE partner_key = ? AND status = 'active' LIMIT 1", (key,)).fetchone():
        is_default = 1  # first contact becomes default automatically
    vals = [str(fields.get(f) or "").strip() for f in _CONTACT_FIELDS]
    conn.execute(
        """INSERT INTO partner_contacts (
            id, partner_key, name, name_ja, title, phone, email, line_id, wechat_id, whatsapp,
            languages, photo_url, note, is_default, sort_order, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
        (cid, key, *vals, is_default, int(fields.get("sort_order") or 0), now, now),
    )
    return get_partner_contact(conn, key, cid)


def update_partner_contact(conn, key: str, contact_id: str, fields: dict[str, Any], *, now: str | None = None) -> Optional[dict[str, Any]]:
    contact = get_partner_contact(conn, key, contact_id)
    if not contact:
        return None
    sets: list[str] = []
    params: list[Any] = []
    for f in _CONTACT_FIELDS:
        if f in fields:
            sets.append(f"{f} = ?")
            params.append(str(fields[f] or "").strip())
    if "sort_order" in fields:
        sets.append("sort_order = ?")
        params.append(int(fields.get("sort_order") or 0))
    if _truthy(fields.get("is_default")):
        conn.execute("UPDATE partner_contacts SET is_default = 0 WHERE partner_key = ?", (key,))
        sets.append("is_default = 1")
    if not sets:
        return contact
    sets.append("updated_at = ?")
    params.append(_iso(now))
    params.extend([key, contact_id])
    conn.execute(f"UPDATE partner_contacts SET {', '.join(sets)} WHERE partner_key = ? AND id = ?", params)
    return get_partner_contact(conn, key, contact_id)


def delete_partner_contact(conn, key: str, contact_id: str, *, now: str | None = None) -> bool:
    contact = get_partner_contact(conn, key, contact_id)
    if not contact:
        return False
    conn.execute(
        "UPDATE partner_contacts SET status = 'deleted', is_default = 0, updated_at = ? WHERE partner_key = ? AND id = ?",
        (_iso(now), key, contact_id),
    )
    return True


def resync_contact_snapshots(conn, key: str, contact_id: str, *, now: str | None = None) -> int:
    """Refresh the denormalised contact snapshot on every listing currently
    pointing at this contact. Returns the number of listings updated."""
    contact = get_partner_contact(conn, key, contact_id)
    if not contact:
        return 0
    snap = contact_snapshot(contact)
    text, vtype = _attr_text_type(snap)
    rows = conn.execute(
        "SELECT listing_id FROM listing_attributes WHERE key = 'reservation_contact_id' AND value = ?",
        (contact_id,),
    ).fetchall()
    now = _iso(now)
    n = 0
    for r in rows:
        lid = r["listing_id"]
        existing = conn.execute(
            "SELECT id FROM listing_attributes WHERE listing_id = ? AND key = 'reservation_contact' LIMIT 1", (lid,)
        ).fetchone()
        if existing:
            conn.execute("UPDATE listing_attributes SET value = ?, value_type = ?, updated_at = ? WHERE id = ?",
                         (text, vtype, now, existing["id"]))
        else:
            conn.execute(
                "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at) VALUES (?, ?, 'reservation_contact', ?, ?, ?, ?)",
                (str(uuid.uuid4()), lid, text, vtype, now, now),
            )
        n += 1
    return n


# ── spreadsheet parsing (CSV + XLSX, stdlib only) ────────────────────────────

_XLNS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_XLNS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _col_to_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1 if idx else 0


def _si_text(si: ET.Element) -> str:
    parts: list[str] = []
    for node in si.iter():
        if _local(node.tag) == "t" and node.text:
            parts.append(node.text)
    return "".join(parts)


def _read_xlsx(raw: bytes) -> dict[str, Any]:
    """Parse the first worksheet of an .xlsx into header + rows, and extract any
    embedded images mapped to their data-row index. Defensive: image extraction
    failures degrade to rows-without-embedded-images (URL / file paths still
    work)."""
    warnings: list[str] = []
    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = set(zf.namelist())

    shared: list[str] = []
    if "xl/sharedStrings.xml" in names:
        try:
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root:
                if _local(si.tag) == "si":
                    shared.append(_si_text(si))
        except Exception:
            warnings.append("sharedStrings 解析失败")

    sheet_path = "xl/worksheets/sheet1.xml"
    if sheet_path not in names:
        candidates = sorted(n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
        if not candidates:
            raise ValueError("工作簿中没有工作表")
        sheet_path = candidates[0]

    sheet_root = ET.fromstring(zf.read(sheet_path))
    grid: dict[int, dict[int, str]] = {}
    for row_el in sheet_root.iter():
        if _local(row_el.tag) != "row":
            continue
        try:
            r_idx = int(row_el.get("r"))
        except Exception:
            continue
        cells: dict[int, str] = {}
        for c in row_el:
            if _local(c.tag) != "c":
                continue
            ctype = c.get("t")
            ref = c.get("r") or ""
            col = _col_to_index(ref) if ref else len(cells)
            value = ""
            if ctype == "inlineStr":
                value = "".join(t.text or "" for t in c.iter() if _local(t.tag) == "t")
            else:
                v_el = next((x for x in c if _local(x.tag) == "v"), None)
                raw_v = v_el.text if v_el is not None else None
                if raw_v is None:
                    value = ""
                elif ctype == "s":
                    try:
                        value = shared[int(raw_v)]
                    except Exception:
                        value = ""
                elif ctype == "b":
                    value = "true" if str(raw_v).strip() in {"1", "true"} else "false"
                else:
                    value = str(raw_v)
            cells[col] = value
        if cells:
            grid[r_idx] = cells

    if not grid:
        return {"headers": [], "rows": [], "images_by_row": {}, "warnings": warnings}

    sorted_rows = sorted(grid.keys())
    header_row_no = sorted_rows[0]
    header_cells = grid[header_row_no]
    max_col = max(max(c.keys()) for c in grid.values())
    headers = [str(header_cells.get(c, "")).strip() for c in range(max_col + 1)]

    rows: list[dict[str, str]] = []
    rownum_to_dataidx: dict[int, int] = {}
    for r_idx in sorted_rows:
        if r_idx == header_row_no:
            continue
        cells = grid[r_idx]
        if not any(str(v).strip() for v in cells.values()):
            continue
        record: dict[str, str] = {}
        for c in range(max_col + 1):
            h = headers[c]
            if not h:
                continue
            record[h] = str(cells.get(c, "")).strip()
        rownum_to_dataidx[r_idx] = len(rows)
        rows.append(record)

    images_by_row: dict[int, list[dict[str, Any]]] = {}
    try:
        images_by_row = _extract_xlsx_images(zf, names, sheet_path, header_row_no, rownum_to_dataidx)
    except Exception:
        warnings.append("嵌入图片解析失败,请改用图片链接列或单独上传图片")

    return {"headers": [h for h in headers if h], "rows": rows, "images_by_row": images_by_row, "warnings": warnings}


def _rels_map(zf: zipfile.ZipFile, rels_path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        root = ET.fromstring(zf.read(rels_path))
        for rel in root:
            rid = rel.get("Id")
            target = rel.get("Target")
            if rid and target:
                out[rid] = target
    except Exception:
        pass
    return out


def _norm_zip_path(base_dir: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    parts = (base_dir + "/" + target).split("/")
    stack: list[str] = []
    for p in parts:
        if p in ("", "."):
            continue
        if p == "..":
            if stack:
                stack.pop()
        else:
            stack.append(p)
    return "/".join(stack)


def _extract_xlsx_images(zf, names, sheet_path, header_row_no, rownum_to_dataidx) -> dict[int, list[dict[str, Any]]]:
    sheet_dir = sheet_path.rsplit("/", 1)[0]
    sheet_name = sheet_path.rsplit("/", 1)[1]
    sheet_rels = f"{sheet_dir}/_rels/{sheet_name}.rels"
    if sheet_rels not in names:
        return {}
    sheet_rel_map = _rels_map(zf, sheet_rels)

    sheet_root = ET.fromstring(zf.read(sheet_path))
    drawing_rids = [d.get(f"{{{_XLNS_REL}}}id") for d in sheet_root.iter() if _local(d.tag) == "drawing"]
    drawing_rids = [r for r in drawing_rids if r]
    out: dict[int, list[dict[str, Any]]] = {}
    for rid in drawing_rids:
        target = sheet_rel_map.get(rid)
        if not target:
            continue
        drawing_path = _norm_zip_path(sheet_dir, target)
        if drawing_path not in names:
            continue
        drawing_dir = drawing_path.rsplit("/", 1)[0]
        drawing_name = drawing_path.rsplit("/", 1)[1]
        drawing_rels = _rels_map(zf, f"{drawing_dir}/_rels/{drawing_name}.rels")
        droot = ET.fromstring(zf.read(drawing_path))
        for anchor in droot:
            la = _local(anchor.tag)
            if la not in ("twoCellAnchor", "oneCellAnchor", "absoluteAnchor"):
                continue
            from_row = None
            for node in anchor.iter():
                if _local(node.tag) == "from":
                    for sub in node:
                        if _local(sub.tag) == "row":
                            try:
                                from_row = int(sub.text)  # 0-based spreadsheet row
                            except Exception:
                                pass
                    break
            embed = None
            for node in anchor.iter():
                if _local(node.tag) == "blip":
                    embed = node.get(f"{{{_XLNS_REL}}}embed")
                    break
            if from_row is None or not embed:
                continue
            media_target = drawing_rels.get(embed)
            if not media_target:
                continue
            media_path = _norm_zip_path(drawing_dir, media_target)
            if media_path not in names:
                continue
            spreadsheet_rownum = from_row + 1  # ET row "r" attr is 1-based
            data_idx = rownum_to_dataidx.get(spreadsheet_rownum)
            if data_idx is None:
                # nearest data row at or below the anchor
                for rn in sorted(rownum_to_dataidx.keys()):
                    if rn >= spreadsheet_rownum:
                        data_idx = rownum_to_dataidx[rn]
                        break
            if data_idx is None:
                continue
            try:
                blob = zf.read(media_path)
            except Exception:
                continue
            fname = media_path.rsplit("/", 1)[-1]
            out.setdefault(data_idx, []).append({"filename": fname, "data": blob})
    return out


def _read_csv(raw: bytes) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8-sig")
    except Exception:
        text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = [{(k or "").strip(): (str(v or "").strip()) for k, v in r.items()} for r in reader]
    headers = [h.strip() for h in (reader.fieldnames or []) if h and h.strip()]
    return {"headers": headers, "rows": rows, "images_by_row": {}, "warnings": []}


def parse_spreadsheet(raw: bytes, filename: str = "") -> dict[str, Any]:
    """Returns {headers, rows:[{header:value}], images_by_row:{idx:[{filename,data}]}, warnings}."""
    if not raw:
        raise ValueError("空文件")
    name = (filename or "").lower()
    is_zip = raw[:2] == b"PK"
    if name.endswith(".csv") and not is_zip:
        return _read_csv(raw)
    if is_zip or name.endswith(".xlsx"):
        return _read_xlsx(raw)
    # last resort: try csv
    return _read_csv(raw)


# ── column mapping (CN / JA / EN header aliases) ─────────────────────────────

def _norm_header(h: str) -> str:
    return re.sub(r"[\s　()（）/／:：]+", "", str(h or "")).strip().lower()


# field -> set of normalised header aliases
HEADER_ALIASES: dict[str, set[str]] = {
    "ext_id": {"房源编号", "物件番号", "編號", "编号", "id", "externalid", "ref", "管理番号"},
    "title": {"标题", "タイトル", "title", "物件名", "房源名称", "名称"},
    "description": {"描述", "物件説明", "説明", "description", "介绍", "详情", "備考"},
    "listing_intent": {"类型", "区分", "出租出售", "intent", "种类", "取引区分"},
    "category": {"分类", "カテゴリ", "category", "物件種別", "种别", "类别"},
    "city": {"城市", "市区町村", "city", "所在市", "都市"},
    "location_text": {"地址", "住所", "address", "所在地", "位置"},
    "latitude": {"纬度", "latitude", "lat", "緯度"},
    "longitude": {"经度", "longitude", "lng", "lon", "経度"},
    "nearest_station": {"最寄駅", "最近车站", "車站", "station", "nereststation", "最寄り駅"},
    "station_distance_minutes": {"步行分钟", "徒歩分", "徒歩", "walkmin", "車站徒步", "駅徒歩"},
    "nearest_lines": {"沿线", "路线", "线路", "lines", "沿線", "路線"},
    "rent": {"租金", "家賃", "rent", "月租", "賃料", "月額"},
    "sale_price": {"售价", "出售价", "価格", "价格", "saleprice", "price", "販売価格"},
    "deposit": {"押金", "敷金", "deposit"},
    "key_money": {"礼金", "keymoney"},
    "management_fee": {"管理费", "管理費", "managementfee", "共益費"},
    "yield_rate": {"利回り", "收益率", "yield", "利回", "回报率"},
    "layout": {"户型", "間取り", "layout", "間取", "格局"},
    "area_sqm": {"面积", "専有面積", "面積", "area", "平米", "建物面積"},
    "land_area": {"土地面积", "土地面積", "landarea", "地积"},
    "floor": {"楼层", "階", "floor", "所在階"},
    "building_type": {"建物类型", "建物種別", "buildingtype", "物件类型"},
    "building_age": {"築年", "建筑年份", "buildingage", "築年数", "建造年"},
    "structure": {"构造", "構造", "structure"},
    "move_in_date": {"入居日", "入居可能日", "movein", "可入住日"},
    "images": {"图片链接", "画像url", "图片url", "images", "imageurl", "图片", "画像", "照片", "photourl"},
    "image_filenames": {"图片文件名", "画像ファイル名", "imagefiles", "imagefilename", "图片文件"},
    "machi_recommended": {"machi推荐", "推荐", "machirecommended", "おすすめ", "推薦"},
    "badges": {"标签", "タグ", "badges", "tags", "标记"},
    "contact": {"预约联系人", "担当者", "联系人", "contact", "担当", "联络人"},
    "source_url": {"原始链接", "来源链接", "sourceurl", "详情页", "url链接", "物件url"},
    "status": {"状态", "ステータス", "status", "状態"},
}

_HEADER_LOOKUP: dict[str, str] = {}
for _field, _aliases in HEADER_ALIASES.items():
    for _a in _aliases:
        _HEADER_LOOKUP[_norm_header(_a)] = _field


def match_field(header: str) -> Optional[str]:
    return _HEADER_LOOKUP.get(_norm_header(header))


CITY_ALIASES = {
    "tokyo": "tokyo", "东京": "tokyo", "東京": "tokyo", "tōkyō": "tokyo",
    "osaka": "osaka", "大阪": "osaka",
    "yokohama": "yokohama", "横滨": "yokohama", "横浜": "yokohama",
    "kyoto": "kyoto", "京都": "kyoto",
    "nagoya": "nagoya", "名古屋": "nagoya",
    "kobe": "kobe", "神户": "kobe", "神戸": "kobe",
    "fukuoka": "fukuoka", "福冈": "fukuoka", "福岡": "fukuoka",
    "sapporo": "sapporo", "札幌": "sapporo",
    "chiba": "chiba", "千叶": "chiba", "千葉": "chiba",
    "saitama": "saitama", "埼玉": "saitama",
}


def _normalize_intent(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    if any(k in text for k in ("sale", "売", "出售", "买卖", "中古", "新築", "新筑")):
        if any(k in text for k in ("投资", "投資", "invest", "収益", "收益")):
            return "investment"
        return "sale"
    if any(k in text for k in ("invest", "投资", "投資", "収益", "收益")):
        return "investment"
    if any(k in text for k in ("rent", "賃", "出租", "租", "lease")):
        return "rent"
    if text in LISTING_INTENTS:
        return text
    return ""


def map_row(
    raw_row: dict[str, Any],
    partner: dict[str, Any],
    *,
    contacts_by_id: dict[str, dict[str, Any]],
    contacts_by_name: dict[str, dict[str, Any]],
    default_contact_row: Optional[dict[str, Any]],
    row_index: int,
) -> dict[str, Any]:
    """Map one raw spreadsheet record to a normalized listing dict + warnings."""
    fields: dict[str, str] = {}
    for header, value in raw_row.items():
        f = match_field(header)
        if f and str(value or "").strip():
            # keep first non-empty if duplicate headers map to same field
            fields.setdefault(f, str(value).strip())

    warnings: list[str] = []
    errors: list[str] = []

    title = fields.get("title", "").strip()
    if not title:
        errors.append("缺少标题")

    sale_enabled = bool(partner.get("sale_enabled", 0))
    intent = _normalize_intent(fields.get("listing_intent")) or ("rent")
    if intent in ("sale", "investment") and not sale_enabled:
        warnings.append("该后台未开启出售/投资,已按出租处理")
        intent = "rent"

    rent = _to_number(fields.get("rent"))
    sale_price = _to_number(fields.get("sale_price"))
    if intent == "rent":
        price = rent
        price_type = "monthly"
    else:
        price = sale_price
        price_type = "total"
    currency = "JPY"

    city_raw = fields.get("city", "").strip()
    city_slug = CITY_ALIASES.get(city_raw, CITY_ALIASES.get(city_raw.lower(), "")) or partner.get("default_city_slug") or "tokyo"

    # ── images: URL column + embedded + uploaded filename references ──────────
    image_urls = [u for u in _split_multi(fields.get("images")) if u.lower().startswith("http")]
    image_filenames = _split_multi(fields.get("image_filenames"))

    # ── reservation contact selection ────────────────────────────────────────
    contact_row: Optional[dict[str, Any]] = None
    contact_ref = fields.get("contact", "").strip()
    if contact_ref:
        contact_row = contacts_by_id.get(contact_ref) or contacts_by_name.get(contact_ref.lower())
        if not contact_row:
            warnings.append(f"找不到联系人「{contact_ref}」,已用默认联系人")
    if not contact_row:
        contact_row = default_contact_row

    # ── badges + Machi推荐 ────────────────────────────────────────────────────
    if "machi_recommended" in fields:
        machi_recommended = _truthy(fields.get("machi_recommended"))
    else:
        machi_recommended = bool(partner.get("machi_recommended_default", 1))
    try:
        partner_badges = json.loads(partner.get("default_badges_json") or "[]")
    except Exception:
        partner_badges = []
    badges = _split_multi(fields.get("badges")) or list(partner_badges)
    badges = [b for b in badges if b][:MAX_BADGES_PER_LISTING]

    # ── structured rental attributes ──────────────────────────────────────────
    attrs: dict[str, Any] = {"listing_intent": intent}
    if intent == "rent":
        if rent is not None:
            attrs["rent"] = rent
    else:
        if sale_price is not None:
            attrs["sale_price"] = sale_price
        yr = _to_number(fields.get("yield_rate"))
        if yr is not None:
            attrs["yield_rate"] = yr
    for key in ("deposit", "key_money", "management_fee", "land_area", "area_sqm"):
        num = _to_number(fields.get(key))
        if num is not None:
            attrs[key] = num
    for key in ("layout", "floor", "building_type", "building_age", "structure",
                "nearest_station", "nearest_lines", "move_in_date", "source_url"):
        if fields.get(key):
            attrs[key] = fields[key]
    sdm = _to_number(fields.get("station_distance_minutes"))
    if sdm is not None:
        attrs["station_distance_minutes"] = int(sdm)
    lat = _to_number(fields.get("latitude"))
    lng = _to_number(fields.get("longitude"))

    status = (fields.get("status") or "published").strip().lower()
    if status not in ("published", "draft"):
        status = "published"

    return {
        "row_index": row_index,
        "ext_id": fields.get("ext_id", "").strip(),
        "title": title[:120],
        "description": fields.get("description", "")[:3000],
        "listing_intent": intent,
        "category": fields.get("category", "").strip()[:80] or partner.get("default_category") or "",
        "city_slug": city_slug,
        "location_text": fields.get("location_text", "").strip()[:160],
        "latitude": lat,
        "longitude": lng,
        "price": price,
        "price_type": price_type,
        "currency": currency,
        "status": status,
        "attrs": attrs,
        "image_urls": image_urls[:MAX_IMAGES_PER_LISTING],
        "image_filenames": image_filenames[:MAX_IMAGES_PER_LISTING],
        "machi_recommended": machi_recommended,
        "badges": badges,
        "contact": contact_row,
        "contact_id": (contact_row or {}).get("id", "") if contact_row else "",
        "warnings": warnings,
        "errors": errors,
    }


# Attribute keys a commit row may carry (must stay a subset of the rental
# whitelist mirrored into server.LISTING_ATTRIBUTE_KEYS['rental']).
_SANITIZE_ATTR_KEYS = {
    "listing_intent", "rent", "sale_price", "yield_rate", "deposit", "key_money",
    "management_fee", "land_area", "area_sqm", "layout", "floor", "building_type",
    "building_age", "structure", "nearest_station", "nearest_lines", "move_in_date",
    "source_url", "station_distance_minutes",
    # 星域东京官网详情接口带来的更完整字段(见 server_stareal.map_item)。
    "total_floors", "room_no", "property_no", "availability_status", "confirmed_at",
    "needs_renovation", "lease_term", "down_payment", "amenities", "nearby_facilities",
}


def _safe_image_url(u: Any) -> str:
    s = str(u or "").strip()
    if s.startswith("/media/") or s.startswith("http://") or s.startswith("https://"):
        return s[:1000]
    return ""


def sanitize_commit_rows(
    rows: list[dict[str, Any]],
    partner: dict[str, Any],
    *,
    contacts_by_id: dict[str, dict[str, Any]],
    default_contact_row: Optional[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Rebuild trusted ``mapped`` rows from client-sent preview rows. NOTHING
    structural is trusted: the contact is re-resolved server-side by id, every
    field is clamped, attribute keys are whitelisted, image urls are scheme-
    checked. A tampered payload can therefore only affect this partner's own
    listings, within the same validation as a fresh parse."""
    sale_enabled = bool(partner.get("sale_enabled", 0))
    try:
        partner_badges = json.loads(partner.get("default_badges_json") or "[]")
    except Exception:
        partner_badges = []
    out: list[dict[str, Any]] = []
    for idx, raw in enumerate(rows[:MAX_IMPORT_ROWS]):
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()[:120]
        errors = [] if title else ["缺少标题"]
        intent = _normalize_intent(raw.get("listing_intent")) or "rent"
        warnings: list[str] = []
        if intent in ("sale", "investment") and not sale_enabled:
            warnings.append("该后台未开启出售/投资,已按出租处理")
            intent = "rent"
        price = _to_number(raw.get("price"))
        price_type = "monthly" if intent == "rent" else "total"

        attrs_in = raw.get("attrs") if isinstance(raw.get("attrs"), dict) else {}
        attrs: dict[str, Any] = {"listing_intent": intent}
        for k, v in attrs_in.items():
            if k not in _SANITIZE_ATTR_KEYS or v in (None, ""):
                continue
            if k in ("rent", "sale_price", "yield_rate", "deposit", "key_money",
                     "management_fee", "land_area", "area_sqm", "down_payment"):
                num = _to_number(v)
                if num is not None:
                    attrs[k] = num
            elif k == "station_distance_minutes":
                num = _to_number(v)
                if num is not None:
                    attrs[k] = int(num)
            else:
                attrs[k] = str(v).strip()[:400]

        contact_id = str(raw.get("contact_id") or raw.get("contactId") or "").strip()
        contact_row = contacts_by_id.get(contact_id) if contact_id else None
        if not contact_row:
            contact_row = default_contact_row

        badges = [str(b).strip() for b in (raw.get("badges") or []) if str(b).strip()]
        if not badges:
            badges = [str(b).strip() for b in partner_badges if str(b).strip()]
        badges = badges[:MAX_BADGES_PER_LISTING]

        if "machi_recommended" in raw or "machiRecommended" in raw:
            machi = _truthy(raw.get("machi_recommended") if "machi_recommended" in raw else raw.get("machiRecommended"))
        else:
            machi = bool(partner.get("machi_recommended_default", 1))

        status = str(raw.get("status") or "published").strip().lower()
        if status not in ("published", "draft"):
            status = "published"

        city_slug = str(raw.get("city_slug") or "").strip() or partner.get("default_city_slug") or "tokyo"
        images = [u for u in (_safe_image_url(x) for x in (raw.get("image_urls") or raw.get("images") or [])) if u]

        out.append({
            "row_index": raw.get("row_index", idx),
            "ext_id": str(raw.get("ext_id") or "").strip()[:120],
            "title": title,
            "description": str(raw.get("description") or "")[:3000],
            "listing_intent": intent,
            "category": str(raw.get("category") or "").strip()[:80] or partner.get("default_category") or "",
            "city_slug": city_slug,
            "location_text": str(raw.get("location_text") or "").strip()[:160],
            "latitude": _to_number(raw.get("latitude")),
            "longitude": _to_number(raw.get("longitude")),
            "price": price,
            "price_type": price_type,
            "currency": "JPY",
            "status": status,
            "attrs": attrs,
            "image_urls": images[:MAX_IMAGES_PER_LISTING],
            "machi_recommended": machi,
            "badges": badges,
            "contact": contact_row,
            "contact_id": (contact_row or {}).get("id", "") if contact_row else "",
            "warnings": warnings,
            "errors": errors,
        })
    return out


# ── template ─────────────────────────────────────────────────────────────────

TEMPLATE_COLUMNS = [
    ("房源编号", "物件番号 (用于重复导入去重,可留空)"),
    ("标题", "例: 新宿三丁目 1LDK 高层精装"),
    ("类型", "出租 / 出售 / 投资"),
    ("分类", "例: マンション / アパート / 一户建 / タワーマンション"),
    ("城市", "例: 东京 / 大阪 (留空默认本后台城市)"),
    ("地址", "例: 东京都新宿区新宿3丁目"),
    ("租金", "出租填月租 (円),如 145000"),
    ("售价", "出售/投资填总价,支持「4980万」写法"),
    ("利回り", "投资房收益率 %,如 4.8"),
    ("押金", "敷金 (月或円)"),
    ("礼金", "礼金"),
    ("管理费", "管理費/共益費"),
    ("户型", "例: 1LDK / 2DK"),
    ("面积", "専有面積 ㎡,如 42.5"),
    ("土地面积", "一户建/投资可填 ㎡"),
    ("楼层", "例: 8階 / 8F"),
    ("築年", "例: 2019 或 築5年"),
    ("构造", "例: RC / SRC / 木造"),
    ("最寄駅", "例: 新宿三丁目駅"),
    ("步行分钟", "例: 5"),
    ("沿线", "例: 丸ノ内線,副都心線"),
    ("入居可能日", "例: 即可 / 2026-08-01"),
    ("图片链接", "多张图片网址,用换行或逗号分隔 (http 开头)"),
    ("图片文件名", "若改用上传图片,这里写对应文件名,用逗号分隔"),
    ("预约联系人", "联系人姓名或ID,留空用默认联系人"),
    ("标签", "自定义闪耀标签,逗号分隔;留空用后台默认"),
    ("Machi推荐", "是 / 否,留空用后台默认"),
    ("原始链接", "stareal.jp 房源详情页 (可选)"),
    ("描述", "物件説明 / 卖点"),
    ("状态", "published 上架 / draft 草稿,留空默认上架"),
]


def build_template_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c[0] for c in TEMPLATE_COLUMNS])
    writer.writerow([c[1] for c in TEMPLATE_COLUMNS])  # an example/help row the partner overwrites
    return buf.getvalue()


# ── idempotent importer ───────────────────────────────────────────────────────

_CITY_LISTING_INSERT = """INSERT INTO city_listings (
    id, country_code, city_id, city_slug, region_code, language, type, category, title,
    description, price, currency, price_type, location_text, latitude, longitude, status,
    verification_status, seller_user_id, business_id, contact_method, view_count, inquiry_count,
    favorite_count, report_count, is_promoted, promotion_weight, published_at, expires_at,
    created_at, updated_at, rating_avg, rating_count)
   VALUES (?, ?, ?, ?, ?, 'zh-CN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, NULL,
    'app_message', 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, 0, 0)"""


def import_partner_listings(
    conn,
    partner: dict[str, Any],
    mapped_rows: list[dict[str, Any]],
    *,
    now: str | None = None,
    region_resolver: Optional[Callable[[str], str]] = None,
    image_resolver: Optional[Callable[[dict[str, Any]], list[dict[str, Any]]]] = None,
    progress_callback: Optional[Callable[[int, int, dict[str, Any]], None]] = None,
) -> dict[str, Any]:
    """Idempotently upsert a batch of partner listings.

    Idempotency key: ``(partner_key, ext_id)`` when an ext_id is present, else
    ``(partner_key, city_slug, type, title)``. Each listing is stamped with a
    ``__partner`` marker so it can be listed / cleared precisely without ever
    touching real user content. Machi推荐 sets ``is_promoted`` + a
    ``listing_promotions`` row + sparkle badges. ``image_resolver`` (injected by
    server.py) turns the row's image_urls / image_filenames / embedded images
    into a list of ``{"url":..., "thumbnail_url":...}`` already-hosted media.
    """
    now = _iso(now)
    key = partner["partner_key"]
    seller_id = partner["seller_user_id"]
    country = partner.get("default_country_code") or "jp"
    region = partner.get("default_region_code") or ""
    created = 0
    updated = 0
    results: list[dict[str, Any]] = []
    total_rows = len(mapped_rows)

    for idx, mapped in enumerate(mapped_rows):
        if mapped.get("errors"):
            item = {"row_index": mapped.get("row_index"), "status": "error",
                    "title": mapped.get("title", ""), "errors": mapped["errors"]}
            results.append(item)
            if progress_callback:
                progress_callback(idx + 1, total_rows, item)
            continue
        ext_id = mapped.get("ext_id") or ""
        city_slug = mapped["city_slug"]
        title = mapped["title"]
        row_region = region or (region_resolver(city_slug) if region_resolver else "")
        # 买房 (出售/投资) is a SEPARATE vertical: type=for_sale. 长租 stays rental.
        ltype = "for_sale" if mapped.get("listing_intent") in ("sale", "investment") else "rental"

        existing = None
        if ext_id:
            existing = conn.execute(
                "SELECT la.listing_id AS id FROM listing_attributes la "
                "JOIN listing_attributes lp ON lp.listing_id = la.listing_id AND lp.key = '__partner' AND lp.value = ? "
                "JOIN city_listings cl ON cl.id = la.listing_id AND cl.deleted_at IS NULL "
                "WHERE la.key = '__partner_ext_id' AND la.value = ? LIMIT 1",
                (key, ext_id),
            ).fetchone()
        if not existing and not ext_id:
            existing = conn.execute(
                "SELECT cl.id AS id FROM city_listings cl "
                "JOIN listing_attributes lp ON lp.listing_id = cl.id AND lp.key = '__partner' AND lp.value = ? "
                "WHERE cl.city_slug = ? AND cl.type IN ('rental','for_sale') AND cl.title = ? AND cl.deleted_at IS NULL LIMIT 1",
                (key, city_slug, title),
            ).fetchone()

        promoted = bool(mapped.get("machi_recommended"))
        is_promoted = 1 if promoted else 0
        weight = PARTNER_PROMOTION_WEIGHT if promoted else 0
        published_at = now if mapped["status"] == "published" else None

        if existing:
            listing_id = existing["id"]
            conn.execute(
                """UPDATE city_listings SET type = ?, category = ?, description = ?, price = ?, currency = ?,
                   price_type = ?, location_text = ?, latitude = ?, longitude = ?, status = ?,
                   region_code = ?, is_promoted = ?, promotion_weight = ?, published_at = COALESCE(published_at, ?),
                   updated_at = ? WHERE id = ?""",
                (ltype, mapped["category"], mapped["description"], mapped["price"], mapped["currency"],
                 mapped["price_type"], mapped["location_text"], mapped["latitude"], mapped["longitude"],
                 mapped["status"], row_region, is_promoted, weight, published_at, now, listing_id),
            )
            updated += 1
            action = "updated"
        else:
            listing_id = str(uuid.uuid4())
            conn.execute(
                _CITY_LISTING_INSERT,
                (listing_id, country, city_slug, city_slug, row_region, ltype, mapped["category"],
                 title, mapped["description"], mapped["price"], mapped["currency"], mapped["price_type"],
                 mapped["location_text"], mapped["latitude"], mapped["longitude"], mapped["status"],
                 seller_id, is_promoted, weight, published_at,
                 (datetime.now(timezone.utc) + timedelta(days=180)).isoformat(), now, now),
            )
            created += 1
            action = "created"

        # ── media ─────────────────────────────────────────────────────────────
        media_items = image_resolver(mapped) if image_resolver else [
            {"url": u, "thumbnail_url": u} for u in mapped.get("image_urls", [])
        ]
        media_items = [m for m in media_items if m.get("url")][:MAX_IMAGES_PER_LISTING]
        conn.execute("DELETE FROM listing_media WHERE listing_id = ?", (listing_id,))
        if not media_items:
            media_items = [{"url": "", "thumbnail_url": ""}]  # placeholder cover handled by client fallback art
        # m_idx (not idx): the outer enumerate at ~1117 binds idx to the ROW
        # index that progress_callback(idx + 1, ...) reports below. Shadowing it
        # here left idx pointing at the last media index, so every row's progress
        # was misreported as (media_count) instead of the true row number.
        for m_idx, m in enumerate(media_items):
            url = m.get("url") or ""
            if not url:
                continue
            conn.execute(
                "INSERT INTO listing_media (id, listing_id, media_type, url, thumbnail_url, sort_order, is_cover, created_at)"
                " VALUES (?, ?, 'image', ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), listing_id, url, m.get("thumbnail_url") or url, m_idx, 1 if m_idx == 0 else 0, now),
            )

        # ── attributes (public) + internal markers ────────────────────────────
        attrs = dict(mapped.get("attrs") or {})
        if mapped.get("badges"):
            attrs["machi_badges"] = mapped["badges"]
        attrs["machi_recommended"] = promoted
        contact = mapped.get("contact")
        if contact:
            attrs["reservation_contact"] = contact_snapshot(contact)
            attrs["reservation_contact_id"] = contact.get("id") or ""
        attrs["partner_key"] = key

        conn.execute("DELETE FROM listing_attributes WHERE listing_id = ?", (listing_id,))
        for akey, avalue in attrs.items():
            text, vtype = _attr_text_type(avalue)
            if text == "" and not isinstance(avalue, (int, float, bool)):
                continue
            conn.execute(
                "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), listing_id, akey, text, vtype, now, now),
            )
        # internal markers (bypass the public attribute whitelist)
        conn.execute(
            "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
            " VALUES (?, ?, '__partner', ?, 'string', ?, ?)",
            (str(uuid.uuid4()), listing_id, key, now, now),
        )
        if ext_id:
            conn.execute(
                "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
                " VALUES (?, ?, '__partner_ext_id', ?, 'string', ?, ?)",
                (str(uuid.uuid4()), listing_id, ext_id, now, now),
            )

        # ── Machi推荐 promotion record ─────────────────────────────────────────
        conn.execute(
            "DELETE FROM listing_promotions WHERE listing_id = ? AND promotion_type = ?",
            (listing_id, PARTNER_PROMOTION_TYPE),
        )
        if promoted:
            conn.execute(
                """INSERT INTO listing_promotions (
                    id, listing_id, promotion_type, placement, status, weight, starts_at, ends_at,
                    purchased_by_user_id, metadata, created_at, updated_at)
                   VALUES (?, ?, ?, 'partner', 'active', ?, ?, '', ?, ?, ?, ?)""",
                (str(uuid.uuid4()), listing_id, PARTNER_PROMOTION_TYPE, weight, now, seller_id,
                 json.dumps({"source": "partner", "partner": key}, ensure_ascii=False), now, now),
            )

        item = {
            "row_index": mapped.get("row_index"), "status": action, "listing_id": listing_id,
            "title": title, "warnings": mapped.get("warnings", []),
            "imageCount": len([m for m in media_items if m.get("url")]),
            "machiRecommended": promoted,
        }
        results.append(item)
        if progress_callback:
            progress_callback(idx + 1, total_rows, item)

    # refresh the partner's denormalised listing count
    cnt = conn.execute(
        "SELECT COUNT(*) AS c FROM listing_attributes la JOIN city_listings cl ON cl.id = la.listing_id "
        "WHERE la.key = '__partner' AND la.value = ? AND cl.deleted_at IS NULL",
        (key,),
    ).fetchone()
    conn.execute("UPDATE partners SET listing_count = ?, updated_at = ? WHERE partner_key = ?",
                 (int(cnt["c"] or 0), now, key))

    return {
        "created": created, "updated": updated, "total": created + updated,
        "errors": [r for r in results if r["status"] == "error"],
        "results": results,
    }


def search_partner_listing_ids(
    conn,
    key: str,
    *,
    q: str = "",
    limit: int | None = 200,
    offset: int = 0,
) -> dict[str, Any]:
    q = str(q or "").strip()
    offset = max(0, int(offset or 0))
    limit = None if limit is None or int(limit) <= 0 else max(1, int(limit))
    clauses = ["la.key = '__partner'", "la.value = ?", "cl.deleted_at IS NULL"]
    params: list[Any] = [key]
    if q:
        like = f"%{q}%"
        clauses.append(
            "("
            "cl.id LIKE ? OR cl.title LIKE ? OR cl.description LIKE ? OR "
            "cl.location_text LIKE ? OR cl.category LIKE ? OR "
            "EXISTS ("
            "  SELECT 1 FROM listing_attributes sx"
            "  WHERE sx.listing_id = cl.id"
            "    AND sx.key IN ('__partner_ext_id','listing_intent','nearest_station','layout','rent','sale_price')"
            "    AND sx.value LIKE ?"
            ")"
            ")"
        )
        params.extend([like, like, like, like, like, like])

    where = " AND ".join(clauses)
    total = conn.execute(
        "SELECT COUNT(*) AS c FROM city_listings cl "
        "JOIN listing_attributes la ON la.listing_id = cl.id "
        f"WHERE {where}",
        params,
    ).fetchone()["c"]

    sql = (
        "SELECT cl.id AS id FROM city_listings cl "
        "JOIN listing_attributes la ON la.listing_id = cl.id "
        f"WHERE {where} ORDER BY cl.created_at DESC, cl.id DESC"
    )
    page_params = list(params)
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        page_params.extend([limit, offset])
    rows = conn.execute(sql, page_params).fetchall()
    ids = [r["id"] for r in rows]
    return {
        "ids": ids,
        "total": int(total or 0),
        "limit": int(limit or 0),
        "offset": offset,
        "q": q,
        "hasMore": bool(limit is not None and offset + len(ids) < int(total or 0)),
    }


def list_partner_listing_ids(conn, key: str, *, limit: int = 200) -> list[str]:
    return search_partner_listing_ids(conn, key, limit=limit)["ids"]


# ── per-listing CRUD (scoped to the partner's own listings) ──────────────────

def partner_owns_listing(conn, key: str, listing_id: str) -> bool:
    """A partner may only touch listings carrying its own ``__partner`` marker."""
    return bool(conn.execute(
        "SELECT 1 FROM listing_attributes WHERE listing_id = ? AND key = '__partner' AND value = ? LIMIT 1",
        (listing_id, key),
    ).fetchone())


def _recount_partner(conn, key: str, now: str) -> None:
    cnt = conn.execute(
        "SELECT COUNT(*) AS c FROM listing_attributes la JOIN city_listings cl ON cl.id = la.listing_id "
        "WHERE la.key = '__partner' AND la.value = ? AND cl.deleted_at IS NULL",
        (key,),
    ).fetchone()
    conn.execute("UPDATE partners SET listing_count = ?, updated_at = ? WHERE partner_key = ?",
                 (int(cnt["c"] or 0), now, key))


def delete_partner_listing(conn, key: str, listing_id: str, *, now: str | None = None) -> bool:
    if not partner_owns_listing(conn, key, listing_id):
        return False
    now = _iso(now)
    cur = conn.execute(
        "UPDATE city_listings SET deleted_at = ?, status = 'closed', updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        (now, now, listing_id),
    )
    conn.execute("UPDATE listing_promotions SET status = 'expired', updated_at = ? WHERE listing_id = ?", (now, listing_id))
    _recount_partner(conn, key, now)
    return (cur.rowcount or 0) > 0


def update_partner_listing(
    conn, partner: dict[str, Any], listing_id: str, mapped: dict[str, Any], *,
    now: str | None = None, image_resolver: Optional[Callable[[dict[str, Any]], list[dict[str, Any]]]] = None,
    replace_media: bool = True,
) -> Optional[str]:
    """Update one of the partner's listings from a SANITIZED mapped row (see
    sanitize_commit_rows). Media is replaced only when ``replace_media`` is true
    AND the row carries image urls — so a plain field edit keeps existing photos.
    Returns the listing_id, or None if the partner does not own it."""
    key = partner["partner_key"]
    seller_id = partner.get("seller_user_id") or ""
    if not partner_owns_listing(conn, key, listing_id):
        return None
    now = _iso(now)
    ltype = "for_sale" if mapped.get("listing_intent") in ("sale", "investment") else "rental"
    promoted = bool(mapped.get("machi_recommended"))
    is_promoted = 1 if promoted else 0
    weight = PARTNER_PROMOTION_WEIGHT if promoted else 0
    published_at = now if mapped.get("status") == "published" else None
    conn.execute(
        """UPDATE city_listings SET type = ?, category = ?, title = ?, description = ?, price = ?, currency = ?,
           price_type = ?, location_text = ?, latitude = ?, longitude = ?, status = ?, is_promoted = ?,
           promotion_weight = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?""",
        (ltype, mapped.get("category") or "", mapped["title"], mapped.get("description") or "", mapped.get("price"),
         mapped.get("currency") or "JPY",
         mapped.get("price_type") or ("monthly" if ltype == "rental" else "total"),
         mapped.get("location_text") or "", mapped.get("latitude"), mapped.get("longitude"),
         mapped.get("status") or "published", is_promoted, weight, published_at, now, listing_id),
    )
    if replace_media:
        media_items = image_resolver(mapped) if image_resolver else [
            {"url": u, "thumbnail_url": u} for u in mapped.get("image_urls", [])
        ]
        media_items = [m for m in media_items if m.get("url")][:MAX_IMAGES_PER_LISTING]
        if media_items:  # only touch photos when new ones were supplied
            conn.execute("DELETE FROM listing_media WHERE listing_id = ?", (listing_id,))
            for idx, m in enumerate(media_items):
                conn.execute(
                    "INSERT INTO listing_media (id, listing_id, media_type, url, thumbnail_url, sort_order, is_cover, created_at)"
                    " VALUES (?, ?, 'image', ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), listing_id, m["url"], m.get("thumbnail_url") or m["url"], idx, 1 if idx == 0 else 0, now),
                )
    extrow = conn.execute(
        "SELECT value FROM listing_attributes WHERE listing_id = ? AND key = '__partner_ext_id' LIMIT 1", (listing_id,)
    ).fetchone()
    ext_id = (extrow["value"] if extrow else "") or (mapped.get("ext_id") or "")
    attrs = dict(mapped.get("attrs") or {})
    if mapped.get("badges"):
        attrs["machi_badges"] = mapped["badges"]
    attrs["machi_recommended"] = promoted
    contact = mapped.get("contact")
    if contact:
        attrs["reservation_contact"] = contact_snapshot(contact)
        attrs["reservation_contact_id"] = contact.get("id") or ""
    attrs["partner_key"] = key
    conn.execute("DELETE FROM listing_attributes WHERE listing_id = ?", (listing_id,))
    for akey, avalue in attrs.items():
        text, vtype = _attr_text_type(avalue)
        if text == "" and not isinstance(avalue, (int, float, bool)):
            continue
        conn.execute(
            "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), listing_id, akey, text, vtype, now, now),
        )
    conn.execute(
        "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
        " VALUES (?, ?, '__partner', ?, 'string', ?, ?)",
        (str(uuid.uuid4()), listing_id, key, now, now),
    )
    if ext_id:
        conn.execute(
            "INSERT INTO listing_attributes (id, listing_id, key, value, value_type, created_at, updated_at)"
            " VALUES (?, ?, '__partner_ext_id', ?, 'string', ?, ?)",
            (str(uuid.uuid4()), listing_id, ext_id, now, now),
        )
    conn.execute("DELETE FROM listing_promotions WHERE listing_id = ? AND promotion_type = ?",
                 (listing_id, PARTNER_PROMOTION_TYPE))
    if promoted:
        conn.execute(
            """INSERT INTO listing_promotions (
                id, listing_id, promotion_type, placement, status, weight, starts_at, ends_at,
                purchased_by_user_id, metadata, created_at, updated_at)
               VALUES (?, ?, ?, 'partner', 'active', ?, ?, '', ?, ?, ?, ?)""",
            (str(uuid.uuid4()), listing_id, PARTNER_PROMOTION_TYPE, weight, now, seller_id,
             json.dumps({"source": "partner", "partner": key}, ensure_ascii=False), now, now),
        )
    _recount_partner(conn, key, now)
    return listing_id
