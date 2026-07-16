"""Premium curated listing packs for cold-start (城市精选内容包).

Hand-curated (authored + adversarially QA'd), idempotent, and image-matched.
There is intentionally **no LLM** here: structured listings (房源/商家/二手) must
never be fabricated by a model — that carries trust and legal risk. This is a
vetted content set the admin can import into any environment.

Each entry mirrors the sample shape consumed by ``ensure_city_listing_seed`` and
the admin importer, except images are referenced by a stable ``image_category``
key and resolved to a *pre-verified* (HTTP 200) Unsplash URL at build time, with
rotation so the same photo doesn't repeat across many cards.

Public API:
- :data:`PACK_VERSION` — marker written to ``listing_attributes`` for safe,
  reversible clears.
- :func:`premium_listings(cities)` — sample dicts ready for the importer.
- :func:`pack_counts(cities)` — per-city/type counts for the preview panel.
"""

from __future__ import annotations

from typing import Any

PACK_VERSION = "machi_premium_2026_06"

SUPPORTED_CITIES: tuple[str, ...] = ("tokyo", "osaka", "yokohama", "kyoto")

CITY_LABEL = {"tokyo": "东京", "osaka": "大阪", "yokohama": "横滨", "kyoto": "京都"}

_REGION_BY_CITY = {
    "tokyo": "jp.tokyo.tokyo",
    "osaka": "jp.osaka.osaka",
    "yokohama": "jp.kanagawa.yokohama",
    "kyoto": "jp.kyoto.kyoto",
}

_IMG_QS = "?w=1400&q=84&auto=format&fit=crop"
_IMG_BASE = "https://images.unsplash.com/"

# category key -> pre-verified Unsplash photo slugs (all return HTTP 200).
# Includes an upscale tier (luxury interiors / fine dining / onsen / premium goods)
# for the high-end pack.
IMAGE_POOL: dict[str, list[str]] = {
    "rental_interior": ["photo-1522708323590-d24dbb6b0267", "photo-1502672260266-1c1ef2d93688", "photo-1493809842364-78817add7ffb", "photo-1600566753190-17f0baa2a6c3", "photo-1522771739844-6a9f6d5f14af"],
    "rental_studio": ["photo-1540518614846-7eded433c457", "photo-1505691938895-1758d7feb511", "photo-1524758631624-e2822e304c36", "photo-1502005229762-cf1b2da7c5d6"],
    "rental_kitchen": ["photo-1556912172-45b7abe8b7e1", "photo-1556910103-1c02745aae4d"],
    "rental_family": ["photo-1560448204-e02f11c3d0e2", "photo-1512917774080-9991f1c4c750"],
    "rental_luxury": ["photo-1545324418-cc1a3fa10c00", "photo-1567767292278-a4f21aa2d36e", "photo-1600210492493-0946911123ea", "photo-1600607687939-ce8a6c25118c", "photo-1512917774080-9991f1c4c750"],
    "share_house": ["photo-1560185008-b033106af5c3"],
    "minshuku_machiya": ["photo-1611892440504-42a792e24d32", "photo-1583847268964-b28dc8f51f92"],
    "minshuku_room": ["photo-1590490360182-c33d57733427"],
    "minshuku_tatami": ["photo-1503899036084-c55cdd92da26"],
    "minshuku_onsen": ["photo-1540541338287-41700207dee6", "photo-1582610116397-edb318620f90", "photo-1578662996442-48f60103fc96"],
    "dining_izakaya": ["photo-1514933651103-005eec06c04b"],
    "dining_ramen": ["photo-1579871494447-9811cf80d66c"],
    "dining_sushi": ["photo-1553621042-f6e147245754", "photo-1576458088443-04a19bb13da6"],
    "dining_yakiniku": ["photo-1544025162-d76694265947", "photo-1591814468924-caf88d1232e1"],
    "dining_chinese": ["photo-1504674900247-0877df9cc836"],
    "dining_kaiseki": ["photo-1414235077428-338989a2e8c0"],
    "dining_fine": ["photo-1424847651672-bf20a4b0982b", "photo-1607013251379-e6eecfffe234", "photo-1555126634-323283e090fa"],
    "dining_cafe": ["photo-1554118811-1e0d58224f24", "photo-1559339352-11d035aa65de", "photo-1517248135467-4c7edcad34c4"],
    "dining_dessert": ["photo-1607082348824-0a96f2a4b9da"],
    "beauty_hair": ["photo-1522337360788-8b13dee7a37e"],
    "beauty_nail": ["photo-1604654894610-df63bc536371"],
    "beauty_skincare": ["photo-1503454537195-1dcabb73ffb9"],
    "beauty_spa": ["photo-1600334089648-b0d9d3028eb2", "photo-1570172619644-dfd03ed5d881"],
    "service_moving": ["photo-1600518464441-9154a4dea21b"],
    "service_pet": ["photo-1518791841217-8f162f1e1131"],
    "service_repair": ["photo-1587829741301-dc798b83add3"],
    "service_office": ["photo-1497366216548-37526070297c", "photo-1522199755839-a2bacb67c546"],
    "service_fitness": ["photo-1534438327276-14e5300c3a48"],
    "sh_electronics": ["photo-1587829741301-dc798b83add3", "photo-1505740420928-5e560c06d30e"],
    "sh_furniture": ["photo-1567538096630-e0c55bd6374c", "photo-1592078615290-033ee584e267", "photo-1586023492125-27b2c045efd7"],
    "sh_bicycle": ["photo-1485965120184-e220f721d03e"],
    "sh_camera": ["photo-1526170375885-4d8ecf77b99f"],
    "sh_fashion": ["photo-1572635196237-14b3f281503f", "photo-1441986300917-64674bd600d8"],
    "sh_appliance": ["photo-1493663284031-b7e3aefcae8e"],
    "sh_books": ["photo-1481833761820-0509d3217039"],
    "sh_baby": ["photo-1565538810643-b5bdb714032a"],
    "sh_watch": ["photo-1523275335684-37898b6baf30"],
    "sh_bag": ["photo-1548036328-c9fa89d128fa"],
    "sh_audio": ["photo-1545454675-3531b543be5d"],
}


def _image_url(category: str, idx: int) -> str:
    """Resolve an image_category key to a verified URL, rotating by ``idx``."""
    slugs = IMAGE_POOL.get((category or "").strip())
    if not slugs:
        return ""
    return f"{_IMG_BASE}{slugs[idx % len(slugs)]}{_IMG_QS}"


# RAW_PACKS holds the curated content set (generated by the content workflow and
# stored in seed_listings_packs.py). Each item:
#   {city, type, category, title, description, price, price_type, location_text,
#    verification_status, promoted, rating, reviews, image_category, attributes}
# ``city`` is one of SUPPORTED_CITIES; region/country/currency are derived.
RAW_PACKS: list[dict[str, Any]] = []
try:  # pragma: no cover - data module is generated, optional at import
    from seed_listings_packs import RAW_PACKS as _GENERATED_PACKS
    RAW_PACKS = list(_GENERATED_PACKS)
except Exception:
    RAW_PACKS = []


def _normalize_cities(cities: Any) -> set[str]:
    if not cities:
        return set(SUPPORTED_CITIES)
    if isinstance(cities, str):
        cities = [cities]
    out = {str(c).strip().lower() for c in cities}
    return {c for c in out if c in SUPPORTED_CITIES} or set(SUPPORTED_CITIES)


def premium_listings(cities: Any = None) -> list[dict[str, Any]]:
    """Return importer-ready sample dicts for the requested cities (default: all)."""
    wanted = _normalize_cities(cities)
    # Rotate images per (category) so duplicates are spread out.
    cat_counter: dict[str, int] = {}
    out: list[dict[str, Any]] = []
    for raw in RAW_PACKS:
        city = str(raw.get("city") or "").strip().lower()
        if city not in wanted:
            continue
        category_key = str(raw.get("image_category") or "")
        idx = cat_counter.get(category_key, 0)
        cat_counter[category_key] = idx + 1
        sample: dict[str, Any] = {
            "city_slug": city,
            "region_code": _REGION_BY_CITY[city],
            "country_code": "jp",
            "type": raw["type"],
            "category": raw.get("category") or "",
            "title": raw["title"],
            "description": raw.get("description") or "",
            "price": raw.get("price"),
            "currency": "JPY",
            "price_type": raw.get("price_type") or "fixed",
            "location_text": raw.get("location_text") or "",
            "status": "published",
            "verification_status": raw.get("verification_status") or "unverified",
            "promoted": bool(raw.get("promoted")),
            # 不透传 rating/reviews（B1-2）：评分只能来自 listing_reviews 真实评论。
            "image_url": _image_url(category_key, idx),
            "attributes": dict(raw.get("attributes") or {}),
        }
        out.append(sample)
    return out


# Seed user personas (generated by gen_personas.py into seed_users_pack.py).
PERSONAS: list[dict[str, Any]] = []
try:  # pragma: no cover - generated, optional at import
    from seed_users_pack import USERS as _PERSONAS
    PERSONAS = list(_PERSONAS)
except Exception:
    PERSONAS = []


def persona_counts() -> dict[str, Any]:
    by_city: dict[str, int] = {}
    photo = 0
    legacy = 0
    for u in PERSONAS:
        by_city[u.get("city", "")] = by_city.get(u.get("city", ""), 0) + 1
        av = u.get("avatar_url") or ""
        if "unsplash" in av:  # 小红书 interest-matched aesthetic photo
            photo += 1
        if "randomuser" in av:  # legacy Western portrait (should be 0 now)
            legacy += 1
    return {
        "total": len(PERSONAS),
        "by_city": by_city,
        "photographic": photo,
        "illustrated": len(PERSONAS) - photo,
        "legacy_portraits": legacy,
    }


def pack_counts(cities: Any = None) -> dict[str, Any]:
    """Summary used by the admin preview: total + per-city + per-type."""
    items = premium_listings(cities)
    by_city: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for it in items:
        by_city[it["city_slug"]] = by_city.get(it["city_slug"], 0) + 1
        by_type[it["type"]] = by_type.get(it["type"], 0) + 1
    return {
        "version": PACK_VERSION,
        "total": len(items),
        "by_city": by_city,
        "by_type": by_type,
        "cities": sorted(by_city.keys()),
    }
