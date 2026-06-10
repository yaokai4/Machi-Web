#!/usr/bin/env python3
"""Region directory data and pure helpers for Machi backend."""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# region directory.
#
# Machi is a local-life / city-scoped social product. Both
# the iOS App and the Web client need a single source of truth for the
# country → province → city tree. Keeping it in-process (no DB tables,
# no external CDN) means region lookups are zero-latency and the file
# itself is auditable. The iOS App mirrors this exact tree in
# `RegionDirectory.swift` so an offline client can still render the
# picker; both sides agree on `region_code` so posts cross over
# cleanly.
#
# Schema:
#   COUNTRIES: ordered list of (code, name, emoji, hot?)
#   PROVINCES: code -> [(province_code, province_name)]      (sub-level countries only)
#   CITIES:    province_code -> [(city_code, city_name)]     (countries with provinces)
#              country_code  -> [(city_code, city_name)]     (countries without)
#   POPULAR_CITIES: ordered list of region_code (for the homepage shortcut)
#
# region_code conventions:
#   "<country_iso2>.<city_slug>"             flat countries (jp, sg, kr, …)
#   "<country_iso2>.<province_slug>.<city>"  hierarchical (cn, us)
# All lowercase ASCII, dot-separated. Used as a stable identifier in
# posts.region_code and the cache keys for hot lists.
# ---------------------------------------------------------------------------

REGION_COUNTRIES: list[dict[str, Any]] = [
    {"code": "cn", "name": "中国",     "emoji": "🇨🇳", "tier": 1, "has_provinces": True},
    {"code": "jp", "name": "日本",     "emoji": "🇯🇵", "tier": 1, "has_provinces": True},
    {"code": "us", "name": "美国",     "emoji": "🇺🇸", "tier": 1, "has_provinces": True},
    {"code": "sg", "name": "新加坡",   "emoji": "🇸🇬", "tier": 2, "has_provinces": False},
    {"code": "kr", "name": "韩国",     "emoji": "🇰🇷", "tier": 2, "has_provinces": False},
    {"code": "uk", "name": "英国",     "emoji": "🇬🇧", "tier": 2, "has_provinces": False},
    {"code": "fr", "name": "法国",     "emoji": "🇫🇷", "tier": 2, "has_provinces": False},
    {"code": "au", "name": "澳大利亚", "emoji": "🇦🇺", "tier": 2, "has_provinces": False},
    {"code": "ca", "name": "加拿大",   "emoji": "🇨🇦", "tier": 2, "has_provinces": False},
    {"code": "th", "name": "泰国",     "emoji": "🇹🇭", "tier": 3, "has_provinces": False},
    {"code": "my", "name": "马来西亚", "emoji": "🇲🇾", "tier": 3, "has_provinces": False},
    {"code": "de", "name": "德国",     "emoji": "🇩🇪", "tier": 3, "has_provinces": False},
    {"code": "nl", "name": "荷兰",     "emoji": "🇳🇱", "tier": 3, "has_provinces": False},
]

REGION_PROVINCES: dict[str, list[dict[str, str]]] = {
    "cn": [
        {"code": "beijing",    "name": "北京"},
        {"code": "shanghai",   "name": "上海"},
        {"code": "tianjin",    "name": "天津"},
        {"code": "chongqing",  "name": "重庆"},
        {"code": "zhejiang",   "name": "浙江"},
        {"code": "jiangsu",    "name": "江苏"},
        {"code": "guangdong",  "name": "广东"},
        {"code": "hongkong",   "name": "香港"},
        {"code": "sichuan",    "name": "四川"},
        {"code": "shandong",   "name": "山东"},
        {"code": "fujian",     "name": "福建"},
        {"code": "henan",      "name": "河南"},
        {"code": "anhui",      "name": "安徽"},
        {"code": "hunan",      "name": "湖南"},
        {"code": "shaanxi",    "name": "陕西"},
        {"code": "hubei",      "name": "湖北"},
    ],
    "jp": [
        {"code": "tokyo",     "name": "东京都"},
        {"code": "osaka",     "name": "大阪府"},
        {"code": "kyoto",     "name": "京都府"},
        {"code": "fukuoka",   "name": "福冈县"},
        {"code": "aichi",     "name": "爱知县"},
        {"code": "kanagawa",  "name": "神奈川县"},
        {"code": "saitama",   "name": "埼玉县"},
        {"code": "chiba",     "name": "千叶县"},
        {"code": "hyogo",     "name": "兵库县"},
        {"code": "hokkaido",  "name": "北海道"},
        {"code": "miyagi",    "name": "宫城县"},
        {"code": "hiroshima", "name": "广岛县"},
        {"code": "okinawa",   "name": "冲绳县"},
        {"code": "shizuoka",  "name": "静冈县"},
        {"code": "ibaraki",   "name": "茨城县"},
        {"code": "nara",      "name": "奈良县"},
        {"code": "mie",       "name": "三重县"},
        {"code": "kumamoto",  "name": "熊本县"},
        {"code": "kagoshima", "name": "鹿儿岛县"},
        {"code": "nagano",    "name": "长野县"},
        {"code": "ishikawa",  "name": "石川县"},
        {"code": "okayama",   "name": "冈山县"},
        {"code": "niigata",   "name": "新潟县"},
        {"code": "tochigi",   "name": "栃木县"},
        {"code": "gunma",     "name": "群马县"},
        {"code": "shiga",     "name": "滋贺县"},
        {"code": "gifu",      "name": "岐阜县"},
    ],
    "us": [
        {"code": "ca", "name": "加利福尼亚"},
        {"code": "ny", "name": "纽约"},
        {"code": "wa", "name": "华盛顿"},
        {"code": "tx", "name": "德克萨斯"},
        {"code": "fl", "name": "佛罗里达"},
        {"code": "il", "name": "伊利诺伊"},
        {"code": "ma", "name": "马萨诸塞"},
        {"code": "nj", "name": "新泽西"},
    ],
}

# Cities are keyed by the parent slug. For hierarchical countries the
# parent is the province slug; for flat countries it's the country code.
REGION_CITIES: dict[str, list[dict[str, str]]] = {
    # ---- China by province ----
    "shanghai":   [{"code": "shanghai", "name": "上海"}],
    "beijing":    [{"code": "beijing",  "name": "北京"}],
    "tianjin":    [{"code": "tianjin",  "name": "天津"}],
    "chongqing":  [{"code": "chongqing", "name": "重庆"}],
    "zhejiang":   [{"code": "hangzhou", "name": "杭州"}, {"code": "ningbo", "name": "宁波"}],
    "jiangsu":    [{"code": "nanjing", "name": "南京"}, {"code": "suzhou", "name": "苏州"}],
    "guangdong": [
        {"code": "guangzhou", "name": "广州"},
        {"code": "shenzhen",  "name": "深圳"},
        {"code": "foshan",    "name": "佛山"},
        {"code": "dongguan",  "name": "东莞"},
    ],
    "sichuan":  [{"code": "chengdu",  "name": "成都"}],
    "shandong": [{"code": "qingdao",  "name": "青岛"}],
    "fujian":   [{"code": "xiamen",   "name": "厦门"}],
    "henan":    [{"code": "zhengzhou","name": "郑州"}],
    "anhui":    [{"code": "hefei",    "name": "合肥"}],
    "hubei":    [{"code": "wuhan",    "name": "武汉"}],
    "shaanxi":  [{"code": "xian",     "name": "西安"}],
    "hunan":    [{"code": "changsha", "name": "长沙"}],
    "hongkong": [{"code": "hongkong", "name": "香港"}],
    # ---- Japan by prefecture ----
    "tokyo":    [{"code": "tokyo",    "name": "东京"}],
    "osaka":    [{"code": "osaka",    "name": "大阪"}],
    "kyoto":    [{"code": "kyoto",    "name": "京都"}],
    "fukuoka":  [{"code": "fukuoka",  "name": "福冈"}],
    "aichi":    [{"code": "nagoya",   "name": "名古屋"}],
    "kanagawa": [{"code": "yokohama", "name": "横滨"}, {"code": "kawasaki", "name": "川崎"}],
    "saitama":  [{"code": "saitama",  "name": "埼玉"}],
    "chiba":    [{"code": "chiba",    "name": "千叶"}],
    "hyogo":    [{"code": "kobe",     "name": "神户"}],
    "hokkaido": [{"code": "sapporo",  "name": "札幌"}],
    "miyagi":   [{"code": "sendai",   "name": "仙台"}],
    "hiroshima":[{"code": "hiroshima","name": "广岛"}],
    "okinawa":  [{"code": "naha",     "name": "那霸"}],
    "shizuoka": [{"code": "shizuoka", "name": "静冈"}],
    "ibaraki":  [{"code": "tsukuba",  "name": "筑波"}],
    "nara":     [{"code": "nara",     "name": "奈良"}],
    "mie":      [{"code": "yokkaichi","name": "四日市"}],
    "kumamoto": [{"code": "kumamoto", "name": "熊本"}],
    "kagoshima":[{"code": "kagoshima","name": "鹿儿岛"}],
    "nagano":   [{"code": "nagano",   "name": "长野"}],
    "ishikawa": [{"code": "kanazawa", "name": "金泽"}],
    "okayama":  [{"code": "okayama",  "name": "冈山"}],
    "niigata":  [{"code": "niigata",  "name": "新潟"}],
    "tochigi":  [{"code": "utsunomiya", "name": "宇都宫"}],
    "gunma":    [{"code": "takasaki", "name": "高崎"}],
    "shiga":    [{"code": "otsu",     "name": "大津"}],
    "gifu":     [{"code": "gifu",     "name": "岐阜"}],
    # ---- US by state ----
    "ca": [
        {"code": "sf",   "name": "旧金山"},
        {"code": "la",   "name": "洛杉矶"},
        {"code": "sd",   "name": "圣地亚哥"},
        {"code": "sj",   "name": "圣何塞"},
        {"code": "irvine","name":"尔湾"},
    ],
    "ny": [{"code": "nyc", "name": "纽约"}, {"code": "buffalo", "name": "布法罗"}],
    "wa": [{"code": "seattle", "name": "西雅图"}, {"code": "bellevue", "name": "贝尔维尤"}],
    "tx": [{"code": "austin", "name": "奥斯汀"}, {"code": "houston", "name": "休斯顿"}, {"code": "dallas", "name": "达拉斯"}],
    "fl": [{"code": "miami", "name": "迈阿密"}, {"code": "orlando", "name": "奥兰多"}],
    "il": [{"code": "chicago", "name": "芝加哥"}],
    "ma": [{"code": "boston",  "name": "波士顿"}],
    "nj": [{"code": "newark",  "name": "纽瓦克"}],
    # ---- Flat countries ----
    "uk": [
        {"code": "london", "name": "伦敦"},
        {"code": "manchester", "name": "曼彻斯特"},
        {"code": "edinburgh", "name": "爱丁堡"},
        {"code": "birmingham", "name": "伯明翰"},
        {"code": "glasgow", "name": "格拉斯哥"},
        {"code": "liverpool", "name": "利物浦"},
        {"code": "leeds", "name": "利兹"},
        {"code": "bristol", "name": "布里斯托"},
        {"code": "cambridge", "name": "剑桥"},
        {"code": "oxford", "name": "牛津"},
    ],
    "ca_country": [],  # placeholder to avoid name clash; CA-country cities listed below by country code
    "ca_flat":  [{"code": "toronto", "name": "多伦多"}, {"code": "vancouver", "name": "温哥华"}, {"code": "montreal", "name": "蒙特利尔"}],
    "au":  [
        {"code": "sydney", "name": "悉尼"},
        {"code": "melbourne", "name": "墨尔本"},
        {"code": "brisbane", "name": "布里斯班"},
        {"code": "perth", "name": "珀斯"},
        {"code": "adelaide", "name": "阿德莱德"},
        {"code": "canberra", "name": "堪培拉"},
        {"code": "goldcoast", "name": "黄金海岸"},
    ],
    "sg":  [{"code": "singapore", "name": "新加坡"}],
    "kr":  [
        {"code": "seoul", "name": "首尔"},
        {"code": "busan", "name": "釜山"},
        {"code": "incheon", "name": "仁川"},
        {"code": "daegu", "name": "大邱"},
        {"code": "daejeon", "name": "大田"},
        {"code": "gwangju", "name": "光州"},
    ],
    "th":  [{"code": "bangkok", "name": "曼谷"}, {"code": "chiangmai", "name": "清迈"}, {"code": "phuket", "name": "普吉"}],
    "my":  [{"code": "kl", "name": "吉隆坡"}, {"code": "penang", "name": "槟城"}],
    "de":  [{"code": "berlin", "name": "柏林"}, {"code": "munich", "name": "慕尼黑"}, {"code": "hamburg", "name": "汉堡"}],
    "fr":  [
        {"code": "paris", "name": "巴黎"},
        {"code": "lyon", "name": "里昂"},
        {"code": "marseille", "name": "马赛"},
        {"code": "toulouse", "name": "图卢兹"},
        {"code": "nice", "name": "尼斯"},
        {"code": "bordeaux", "name": "波尔多"},
    ],
    "nl":  [{"code": "amsterdam", "name": "阿姆斯特丹"}],
}

# Hot cities surface as shortcuts on the picker landing page.
# Tuned for Machi's audience: domestic launch cities and the overseas metros with the largest Chinese-speaking
# communities (海外华人聚居地). Order roughly mirrors what the picker
# shows top-to-bottom — keep the most-used cities near the front so
# the chip grid's first row is high-signal.
POPULAR_CITIES: list[str] = [
    # ---- China ----
    "cn.shanghai.shanghai", "cn.beijing.beijing",
    "cn.guangdong.shenzhen", "cn.guangdong.guangzhou",
    "cn.zhejiang.hangzhou", "cn.sichuan.chengdu",
    "cn.chongqing.chongqing", "cn.hubei.wuhan",
    "cn.jiangsu.nanjing", "cn.jiangsu.suzhou",
    "cn.shaanxi.xian", "cn.hunan.changsha",
    "cn.shandong.qingdao", "cn.fujian.xiamen",
    "cn.tianjin.tianjin", "cn.henan.zhengzhou",
    "cn.zhejiang.ningbo", "cn.guangdong.foshan",
    "cn.guangdong.dongguan", "cn.anhui.hefei",
    # ---- Japan ----
    "jp.tokyo.tokyo", "jp.osaka.osaka",
    "jp.kyoto.kyoto", "jp.fukuoka.fukuoka", "jp.aichi.nagoya",
    "jp.kanagawa.yokohama", "jp.kanagawa.kawasaki",
    "jp.saitama.saitama", "jp.chiba.chiba",
    "jp.hyogo.kobe", "jp.hokkaido.sapporo",
    "jp.miyagi.sendai", "jp.hiroshima.hiroshima",
    "jp.okinawa.naha", "jp.shizuoka.shizuoka",
    # ---- US ----
    "us.ny.nyc", "us.ca.la", "us.ca.sf", "us.wa.seattle",
    # ---- Canada ----
    "ca.toronto", "ca.vancouver", "ca.montreal",
    # ---- Australia ----
    "au.sydney", "au.melbourne",
    # ---- UK ----
    "uk.london",
    # ---- France ----
    "fr.paris",
    # ---- Other Asia / SEA ----
    "sg.singapore", "kr.seoul",
    "th.bangkok",
]


def _cities_for_parent(country_code: str, province_code: str | None) -> list[dict[str, str]]:
    """Resolve the city list given a parent. Handles both the
    hierarchical (country has provinces) and flat country cases."""
    if province_code:
        # Province-level lookup. The dict uses province slug as key.
        return REGION_CITIES.get(province_code, [])
    # Flat country: special-case Canada so it doesn't collide with the
    # California state slug "ca".
    if country_code == "ca":
        return REGION_CITIES.get("ca_flat", [])
    return REGION_CITIES.get(country_code, [])


def _country_lookup(code: str) -> dict[str, Any] | None:
    for c in REGION_COUNTRIES:
        if c["code"] == code:
            return c
    return None


def _resolve_region_code(country: str, province: str, city: str) -> str:
    """Build the canonical region_code from (country, province, city)
    slugs. Returns an empty string when inputs are blank — callers
    treat that as "no region selected"."""
    country = (country or "").strip().lower()
    province = (province or "").strip().lower()
    city = (city or "").strip().lower()
    if not country or not city:
        return ""
    spec = _country_lookup(country)
    if spec and spec.get("has_provinces") and province:
        return f"{country}.{province}.{city}"
    return f"{country}.{city}"


def _parse_region_code(code: str) -> tuple[str, str, str]:
    """Inverse of _resolve_region_code. Returns (country, province, city)
    slugs; province is "" for flat-country codes."""
    parts = (code or "").split(".")
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    if len(parts) == 2:
        return parts[0], "", parts[1]
    return "", "", ""


def _resolve_region_label(country: str, province: str, city: str) -> str:
    """Return the city display name for a valid region, else empty."""
    for item in _cities_for_parent(country, province or None):
        if item["code"] == city:
            return item["name"]
    return ""


_GEO_COUNTRY_ALIASES = {
    "china": "cn", "cn": "cn", "中国": "cn", "中國": "cn",
    "japan": "jp", "jp": "jp", "日本": "jp",
    "united states": "us", "unitedstates": "us", "united states of america": "us", "unitedstatesofamerica": "us", "usa": "us", "us": "us", "美国": "us", "美國": "us", "アメリカ": "us",
    "singapore": "sg", "sg": "sg", "新加坡": "sg", "シンガポール": "sg",
    "south korea": "kr", "southkorea": "kr", "republic of korea": "kr", "republicofkorea": "kr", "korea": "kr", "kr": "kr", "韩国": "kr", "韓国": "kr", "韓國": "kr",
    "united kingdom": "uk", "unitedkingdom": "uk", "great britain": "uk", "greatbritain": "uk", "uk": "uk", "英国": "uk", "英國": "uk", "イギリス": "uk",
    "france": "fr", "fr": "fr", "法国": "fr", "法國": "fr", "フランス": "fr",
    "australia": "au", "au": "au", "澳大利亚": "au", "澳大利亞": "au", "オーストラリア": "au",
    "canada": "ca", "ca": "ca", "加拿大": "ca", "カナダ": "ca",
    "thailand": "th", "th": "th", "泰国": "th", "泰國": "th", "タイ": "th",
    "malaysia": "my", "my": "my", "马来西亚": "my", "馬來西亞": "my", "マレーシア": "my",
    "germany": "de", "de": "de", "德国": "de", "德國": "de", "ドイツ": "de",
    "netherlands": "nl", "nl": "nl", "荷兰": "nl", "荷蘭": "nl", "オランダ": "nl",
}

_GEO_CITY_ALIASES = {
    "tokyo": "tokyo", "tokyo-to": "tokyo", "東京都": "tokyo",
    "osaka": "osaka", "kyoto": "kyoto", "fukuoka": "fukuoka",
    "nagoya": "nagoya", "yokohama": "yokohama", "kawasaki": "kawasaki",
    "sapporo": "sapporo", "sendai": "sendai", "kobe": "kobe",
    "losangeles": "la", "los angeles": "la", "la": "la",
    "sanfrancisco": "sf", "san francisco": "sf", "sf": "sf",
    "sandiego": "sd", "san diego": "sd", "sanjose": "sj", "san jose": "sj",
    "newyork": "nyc", "new york": "nyc", "nyc": "nyc",
    "seattle": "seattle", "bellevue": "bellevue", "austin": "austin",
    "toronto": "toronto", "vancouver": "vancouver", "montreal": "montreal",
    "sydney": "sydney", "melbourne": "melbourne", "london": "london",
    "paris": "paris", "singapore": "singapore", "seoul": "seoul",
    "bangkok": "bangkok", "berlin": "berlin", "amsterdam": "amsterdam",
}

_DEFAULT_REGION_BY_COUNTRY = {
    "cn": "cn.shanghai.shanghai",
    "jp": "jp.tokyo.tokyo",
    "us": "us.ca.la",
    "sg": "sg.singapore",
    "kr": "kr.seoul",
    "uk": "uk.london",
    "fr": "fr.paris",
    "au": "au.sydney",
    "ca": "ca.toronto",
    "th": "th.bangkok",
    "my": "my.kl",
    "de": "de.berlin",
    "nl": "nl.amsterdam",
}


def _geo_key(value: str) -> str:
    return re.sub(r"[\s._-]+", "", (value or "").strip().lower())


def _country_code_from_geo(value: str) -> str:
    raw = (value or "").strip().lower()
    return _GEO_COUNTRY_ALIASES.get(raw) or _GEO_COUNTRY_ALIASES.get(_geo_key(raw), "")


def _region_payload_for_code(code: str) -> dict[str, Any] | None:
    country_code, province_code, city_code = _parse_region_code(code)
    country = _country_lookup(country_code) or {}
    if not country:
        return None
    province_name = ""
    if province_code:
        for p in REGION_PROVINCES.get(country_code, []):
            if p["code"] == province_code:
                province_name = p["name"]
                break
    if country.get("has_provinces") and not province_name:
        return None
    city_name = ""
    for c in _cities_for_parent(country_code, province_code):
        if c["code"] == city_code:
            city_name = c["name"]
            break
    if not city_name:
        return None
    return {
        "region_code":   code,
        "country_code":  country_code,
        "country_name":  country.get("name", ""),
        "country_emoji": country.get("emoji", ""),
        "province_code": province_code,
        "province_name": province_name,
        "city_code":     city_code,
        "city_name":     city_name,
    }


def _detect_region_code_from_geo(geo: dict[str, str]) -> str:
    country_code = _country_code_from_geo(geo.get("country", ""))
    if not country_code:
        return "jp.tokyo.tokyo"
    city_raw = (geo.get("city") or "").strip()
    city_keys = {_geo_key(city_raw), city_raw.strip().lower()}
    alias = _GEO_CITY_ALIASES.get(city_raw.strip().lower()) or _GEO_CITY_ALIASES.get(_geo_key(city_raw))
    if alias:
        city_keys.add(_geo_key(alias))
    spec = _country_lookup(country_code) or {}
    if spec.get("has_provinces"):
        for province in REGION_PROVINCES.get(country_code, []):
            for city in _cities_for_parent(country_code, province["code"]):
                if _geo_key(city["code"]) in city_keys or _geo_key(city["name"]) in city_keys:
                    return _resolve_region_code(country_code, province["code"], city["code"])
    else:
        for city in _cities_for_parent(country_code, None):
            if _geo_key(city["code"]) in city_keys or _geo_key(city["name"]) in city_keys:
                return _resolve_region_code(country_code, "", city["code"])
    return _DEFAULT_REGION_BY_COUNTRY.get(country_code, "jp.tokyo.tokyo")


__all__ = [
    "POPULAR_CITIES",
    "REGION_CITIES",
    "REGION_COUNTRIES",
    "REGION_PROVINCES",
    "_cities_for_parent",
    "_country_lookup",
    "_detect_region_code_from_geo",
    "_parse_region_code",
    "_region_payload_for_code",
    "_resolve_region_code",
    "_resolve_region_label",
]
