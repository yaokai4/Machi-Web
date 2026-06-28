"""Premium cover-image pool for seed community posts (城市内容助手配图).

Real, hand-picked Unsplash photos (Japan / lifestyle / Airbnb vibe), all
pre-verified HTTP 200 — there is intentionally NO AI image generation. Keyed by
the post's ``app_content_type`` (the discriminator stored on ``posts``) so each
generated post gets a relevant, refined cover image and the feed looks alive.

``pick(app_content_type, key)`` returns a stable URL chosen by ``key`` (use the
post id) so the same post always keeps the same image and the pool spreads out.
The same module also backs an admin endpoint that returns suggestion images for
a given type (so the compose flow could later offer a curated picker).
"""

from __future__ import annotations

import hashlib

_IMG_BASE = "https://images.unsplash.com/"
_IMG_QS = "?w=1400&q=84&auto=format&fit=crop"

# app_content_type -> verified Unsplash photo slugs (premium, Japan/lifestyle).
POOL: dict[str, list[str]] = {
    # city_square / daily_life — city scenes
    "dynamic": [
        "photo-1540959733332-eab4deabeeaf", "photo-1542051841857-5f90071e7989",
        "photo-1513407030348-c983a97b98d8", "photo-1480796927426-f609979314bd",
        "photo-1544413660-299165566b1d", "photo-1551641506-ee5bf4cb45f1",
        "photo-1503640538573-148065ba4904", "photo-1524413840807-0c3cb6fa808d",
    ],
    # qa — neutral street / wayfinding
    "question": [
        "photo-1503640538573-148065ba4904", "photo-1480714378408-67cf0d13bc1b",
        "photo-1524413840807-0c3cb6fa808d", "photo-1544413660-299165566b1d",
        "photo-1551641506-ee5bf4cb45f1",
    ],
    # guide — travel / landmarks
    "guide": [
        "photo-1490806843957-31f4c9a91c65", "photo-1493976040374-85c8e12f0c0e",
        "photo-1545569341-9eb8b30979d9", "photo-1493780474015-ba834fd0ce2f",
        "photo-1528360983277-13d401cdc186", "photo-1480714378408-67cf0d13bc1b",
        "photo-1524413840807-0c3cb6fa808d",
    ],
    # housing_tip — interiors
    "housing": [
        "photo-1522708323590-d24dbb6b0267", "photo-1502672260266-1c1ef2d93688",
        "photo-1493809842364-78817add7ffb", "photo-1556912172-45b7abe8b7e1",
        "photo-1505691938895-1758d7feb511", "photo-1545324418-cc1a3fa10c00",
    ],
    # secondhand — products / lifestyle goods
    "secondhand": [
        "photo-1526170375885-4d8ecf77b99f", "photo-1505740420928-5e560c06d30e",
        "photo-1567538096630-e0c55bd6374c", "photo-1523275335684-37898b6baf30",
        "photo-1485965120184-e220f721d03e", "photo-1481833761820-0509d3217039",
    ],
    # jobs_tip — work / coworking
    "job_seek": [
        "photo-1521737604893-d14cc237f11d", "photo-1497215728101-856f4ea42174",
        "photo-1486312338219-ce68d2c6f44d", "photo-1531973576160-7125cd663d86",
        "photo-1522199755839-a2bacb67c546",
    ],
    # food — Japanese food / cafe
    "dining": [
        "photo-1514933651103-005eec06c04b", "photo-1579871494447-9811cf80d66c",
        "photo-1553621042-f6e147245754", "photo-1544025162-d76694265947",
        "photo-1554118811-1e0d58224f24", "photo-1607082348824-0a96f2a4b9da",
        "photo-1414235077428-338989a2e8c0",
    ],
    # meetup — friends / outdoors
    "meetup": [
        "photo-1511632765486-a01980e01a18", "photo-1496024840928-4c417adf211d",
        "photo-1530541930197-ff16ac917b0e", "photo-1486312338219-ce68d2c6f44d",
    ],
    # event — festivals / markets
    "event": [
        "photo-1533050487297-09b450131914", "photo-1492684223066-81342ee5ff30",
        "photo-1514525253161-7a46d19cd819", "photo-1478147427282-58a87a120781",
        "photo-1551798507-629020c81463",
    ],
    # local_service — service / salon / movers
    "service": [
        "photo-1522337360788-8b13dee7a37e", "photo-1600518464441-9154a4dea21b",
        "photo-1518791841217-8f162f1e1131", "photo-1604654894610-df63bc536371",
        "photo-1600334089648-b0d9d3028eb2",
    ],
    # alert / warning — night street / neutral
    "warning": [
        "photo-1513407030348-c983a97b98d8", "photo-1503640538573-148065ba4904",
        "photo-1551641506-ee5bf4cb45f1",
    ],
}

# Generic fallback if an app_content_type isn't mapped.
_FALLBACK = POOL["dynamic"]


def _url(slug: str) -> str:
    return f"{_IMG_BASE}{slug}{_IMG_QS}"


def pick(app_content_type: str, key: str) -> str:
    """Stable premium cover image for a post (chosen by ``key``)."""
    slugs = POOL.get((app_content_type or "").strip()) or _FALLBACK
    if not slugs:
        return ""
    idx = int(hashlib.md5((key or app_content_type or "x").encode()).hexdigest(), 16) % len(slugs)
    return _url(slugs[idx])


# Topic-aware image categories (so spotlight guides don't all reuse the same few
# "travel" photos). Reuses verified slugs across food / interior / work / onsen /
# travel / city so images vary by what the post is actually about.
_TOPIC_POOL: dict[str, list[str]] = {
    "food": ["photo-1579871494447-9811cf80d66c", "photo-1553621042-f6e147245754", "photo-1544025162-d76694265947",
             "photo-1514933651103-005eec06c04b", "photo-1607082348824-0a96f2a4b9da", "photo-1559339352-11d035aa65de",
             "photo-1504674900247-0877df9cc836", "photo-1414235077428-338989a2e8c0"],
    "interior": ["photo-1522708323590-d24dbb6b0267", "photo-1502672260266-1c1ef2d93688", "photo-1493809842364-78817add7ffb",
                 "photo-1600566753190-17f0baa2a6c3", "photo-1556912172-45b7abe8b7e1", "photo-1505691938895-1758d7feb511",
                 "photo-1524758631624-e2822e304c36", "photo-1560185008-b033106af5c3"],
    "work": ["photo-1497366216548-37526070297c", "photo-1522199755839-a2bacb67c546", "photo-1521737604893-d14cc237f11d",
             "photo-1531973576160-7125cd663d86", "photo-1486312338219-ce68d2c6f44d"],
    "onsen": ["photo-1540541338287-41700207dee6", "photo-1582610116397-edb318620f90", "photo-1578662996442-48f60103fc96",
              "photo-1503899036084-c55cdd92da26"],
    "travel": ["photo-1490806843957-31f4c9a91c65", "photo-1493976040374-85c8e12f0c0e", "photo-1545569341-9eb8b30979d9",
               "photo-1493780474015-ba834fd0ce2f", "photo-1528360983277-13d401cdc186", "photo-1524413840807-0c3cb6fa808d"],
    "city": ["photo-1540959733332-eab4deabeeaf", "photo-1542051841857-5f90071e7989", "photo-1513407030348-c983a97b98d8",
             "photo-1544413660-299165566b1d", "photo-1551641506-ee5bf4cb45f1", "photo-1503640538573-148065ba4904"],
}
# (keyword tuples, topic category) — first match wins.
_KEYWORD_CAT: list[tuple[tuple[str, ...], str]] = [
    (("拉面", "寿司", "烧肉", "和牛", "居酒屋", "便利店", "超市", "咖啡", "甜品", "和菓子", "美食", "定食", "深夜", "吃", "餐", "饭"), "food"),
    (("租房", "房子", "房源", "ur", "share house", "合租", "初期费用", "退租", "押金", "敷金", "礼金", "搬家", "公寓", "住宿", "选房"), "interior"),
    (("就职", "转职", "面接", "简历", "履历", "招聘", "派遣", "正社员", "签证", "内推", "考学", "大学院", "语言学校", "研究计划", "留考", "eju", "教授", "出愿", "打工", "兼职"), "work"),
    (("温泉",), "onsen"),
    (("赏樱", "樱花", "赏枫", "红叶", "祭", "花火", "景点", "一日游", "周末", "旅", "展览", "美术馆", "公园", "散步", "近郊", "玩乐", "镰仓", "箱根", "迪士尼", "环球"), "travel"),
]


def _hash_idx(key: str) -> int:
    return int(hashlib.md5((key or "x").encode("utf-8")).hexdigest()[:12], 16)


def pick_topic(content: str, app_content_type: str, key: str) -> str:
    """Topic-aware cover image: choose by what the post is about (keywords in the
    content), falling back to the content-type pool. Stable per ``key``."""
    low = (content or "").lower()
    for kws, cat in _KEYWORD_CAT:
        if any(k in low for k in kws):
            slugs = _TOPIC_POOL.get(cat)
            if slugs:
                return _url(slugs[_hash_idx(key) % len(slugs)])
    slugs = POOL.get((app_content_type or "").strip()) or _FALLBACK
    return _url(slugs[_hash_idx(key) % len(slugs)]) if slugs else ""


def suggestions(app_content_type: str, limit: int = 8) -> list[str]:
    """A few curated images for this post type (for an optional compose picker)."""
    slugs = POOL.get((app_content_type or "").strip()) or _FALLBACK
    seen: list[str] = []
    for s in slugs:
        u = _url(s)
        if u not in seen:
            seen.append(u)
        if len(seen) >= limit:
            break
    return seen
