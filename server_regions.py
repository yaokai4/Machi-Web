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
        # ---- remaining prefectures (complete 47 都道府县) ----
        {"code": "aomori",    "name": "青森县"},
        {"code": "iwate",     "name": "岩手县"},
        {"code": "akita",     "name": "秋田县"},
        {"code": "yamagata",  "name": "山形县"},
        {"code": "fukushima", "name": "福岛县"},
        {"code": "toyama",    "name": "富山县"},
        {"code": "fukui",     "name": "福井县"},
        {"code": "yamanashi", "name": "山梨县"},
        {"code": "wakayama",  "name": "和歌山县"},
        {"code": "tottori",   "name": "鸟取县"},
        {"code": "shimane",   "name": "岛根县"},
        {"code": "yamaguchi", "name": "山口县"},
        {"code": "tokushima", "name": "德岛县"},
        {"code": "kagawa",    "name": "香川县"},
        {"code": "ehime",     "name": "爱媛县"},
        {"code": "kochi",     "name": "高知县"},
        {"code": "saga",      "name": "佐贺县"},
        {"code": "nagasaki",  "name": "长崎县"},
        {"code": "oita",      "name": "大分县"},
        {"code": "miyazaki",  "name": "宫崎县"},
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
    "tokyo": [
        {"code": "tokyo", "name": "东京"},
        {"code": "hachioji", "name": "八王子"},
        {"code": "machida", "name": "町田"},
        {"code": "tachikawa", "name": "立川"},
        {"code": "musashino", "name": "武藏野"},
    ],
    "osaka": [
        {"code": "osaka", "name": "大阪"},
        {"code": "sakai", "name": "堺"},
        {"code": "suita", "name": "吹田"},
        {"code": "toyonaka", "name": "丰中"},
        {"code": "higashiosaka", "name": "东大阪"},
    ],
    "kyoto": [{"code": "kyoto", "name": "京都"}, {"code": "uji", "name": "宇治"}],
    "fukuoka": [
        {"code": "fukuoka", "name": "福冈"},
        {"code": "kitakyushu", "name": "北九州"},
        {"code": "kurume", "name": "久留米"},
    ],
    "aichi": [
        {"code": "nagoya", "name": "名古屋"},
        {"code": "toyota", "name": "丰田"},
        {"code": "okazaki", "name": "冈崎"},
        {"code": "ichinomiya", "name": "一宫"},
    ],
    "kanagawa": [
        {"code": "yokohama", "name": "横滨"},
        {"code": "kawasaki", "name": "川崎"},
        {"code": "sagamihara", "name": "相模原"},
        {"code": "kamakura", "name": "镰仓"},
        {"code": "fujisawa", "name": "藤泽"},
        {"code": "yokosuka", "name": "横须贺"},
    ],
    "saitama": [
        {"code": "saitama", "name": "埼玉"},
        {"code": "kawaguchi", "name": "川口"},
        {"code": "kawagoe", "name": "川越"},
        {"code": "tokorozawa", "name": "所泽"},
        {"code": "koshigaya", "name": "越谷"},
    ],
    "chiba": [
        {"code": "chiba", "name": "千叶"},
        {"code": "funabashi", "name": "船桥"},
        {"code": "matsudo", "name": "松户"},
        {"code": "kashiwa", "name": "柏"},
        {"code": "ichikawa", "name": "市川"},
        {"code": "narita", "name": "成田"},
    ],
    "hyogo": [
        {"code": "kobe", "name": "神户"},
        {"code": "nishinomiya", "name": "西宫"},
        {"code": "himeji", "name": "姬路"},
        {"code": "amagasaki", "name": "尼崎"},
    ],
    "hokkaido": [
        {"code": "sapporo", "name": "札幌"},
        {"code": "asahikawa", "name": "旭川"},
        {"code": "hakodate", "name": "函馆"},
    ],
    "miyagi": [{"code": "sendai", "name": "仙台"}, {"code": "ishinomaki", "name": "石卷"}],
    "hiroshima": [{"code": "hiroshima", "name": "广岛"}, {"code": "fukuyama", "name": "福山"}],
    "okinawa": [{"code": "naha", "name": "那霸"}, {"code": "okinawa", "name": "冲绳"}],
    "shizuoka": [
        {"code": "shizuoka", "name": "静冈"},
        {"code": "hamamatsu", "name": "滨松"},
        {"code": "numazu", "name": "沼津"},
    ],
    "ibaraki": [
        {"code": "tsukuba", "name": "筑波"},
        {"code": "mito", "name": "水户"},
        {"code": "hitachinaka", "name": "常陆那珂"},
    ],
    "nara": [{"code": "nara", "name": "奈良"}, {"code": "ikoma", "name": "生驹"}],
    "mie": [{"code": "yokkaichi", "name": "四日市"}, {"code": "tsu", "name": "津"}],
    "kumamoto": [{"code": "kumamoto", "name": "熊本"}],
    "kagoshima": [{"code": "kagoshima", "name": "鹿儿岛"}],
    "nagano": [{"code": "nagano", "name": "长野"}, {"code": "matsumoto", "name": "松本"}],
    "ishikawa": [{"code": "kanazawa", "name": "金泽"}, {"code": "komatsu", "name": "小松"}],
    "okayama": [{"code": "okayama", "name": "冈山"}, {"code": "kurashiki", "name": "仓敷"}],
    "niigata": [{"code": "niigata", "name": "新潟"}, {"code": "nagaoka", "name": "长冈"}],
    "tochigi": [{"code": "utsunomiya", "name": "宇都宫"}, {"code": "oyama", "name": "小山"}],
    "gunma": [{"code": "takasaki", "name": "高崎"}, {"code": "maebashi", "name": "前桥"}],
    "shiga": [{"code": "otsu", "name": "大津"}, {"code": "kusatsu", "name": "草津"}],
    "gifu": [{"code": "gifu", "name": "岐阜"}, {"code": "ogaki", "name": "大垣"}],
    # ---- Japan: remaining prefectures (complete 47) ----
    "aomori": [{"code": "aomori", "name": "青森"}, {"code": "hachinohe", "name": "八户"}],
    "iwate": [{"code": "morioka", "name": "盛冈"}, {"code": "ichinoseki", "name": "一关"}],
    "akita": [{"code": "akita", "name": "秋田"}],
    "yamagata": [{"code": "yamagata", "name": "山形"}, {"code": "tsuruoka", "name": "鹤冈"}],
    "fukushima": [{"code": "fukushima", "name": "福岛"}, {"code": "koriyama", "name": "郡山"}, {"code": "iwaki", "name": "磐城"}],
    "toyama": [{"code": "toyama", "name": "富山"}, {"code": "takaoka", "name": "高冈"}],
    "fukui": [{"code": "fukui", "name": "福井"}],
    "yamanashi": [{"code": "kofu", "name": "甲府"}],
    "wakayama": [{"code": "wakayama", "name": "和歌山"}],
    "tottori": [{"code": "tottori", "name": "鸟取"}, {"code": "yonago", "name": "米子"}],
    "shimane": [{"code": "matsue", "name": "松江"}, {"code": "izumo", "name": "出云"}],
    "yamaguchi": [{"code": "yamaguchi", "name": "山口"}, {"code": "shimonoseki", "name": "下关"}],
    "tokushima": [{"code": "tokushima", "name": "德岛"}],
    "kagawa": [{"code": "takamatsu", "name": "高松"}],
    "ehime": [{"code": "matsuyama", "name": "松山"}, {"code": "imabari", "name": "今治"}],
    "kochi": [{"code": "kochi", "name": "高知"}],
    "saga": [{"code": "saga", "name": "佐贺"}],
    "nagasaki": [{"code": "nagasaki", "name": "长崎"}, {"code": "sasebo", "name": "佐世保"}],
    "oita": [{"code": "oita", "name": "大分"}, {"code": "beppu", "name": "别府"}],
    "miyazaki": [{"code": "miyazaki", "name": "宫崎"}],
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
    "jp.kanagawa.sagamihara", "jp.kanagawa.kamakura",
    "jp.saitama.saitama", "jp.saitama.kawaguchi",
    "jp.chiba.chiba", "jp.chiba.funabashi",
    "jp.hyogo.kobe", "jp.hyogo.nishinomiya",
    "jp.hokkaido.sapporo", "jp.hokkaido.asahikawa",
    "jp.miyagi.sendai", "jp.hiroshima.hiroshima",
    "jp.fukuoka.kitakyushu", "jp.okinawa.naha", "jp.shizuoka.shizuoka",
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


def region_code_for_city_slug(country: str, city: str) -> str:
    """Best-effort region_code for a bare city slug — discovers the province
    the city belongs to (hierarchical countries), else builds a flat code.
    Used to stamp region_code on imported listings that only carry a city
    slug (e.g. partner uploads without an explicit region). Returns "" when
    the city can't be placed inside a known province, so callers never write
    a malformed 2-part code into a 3-part directory."""
    country = (country or "").strip().lower()
    city = (city or "").strip().lower()
    if not country or not city:
        return ""
    spec = _country_lookup(country) or {}
    if spec.get("has_provinces"):
        for province in REGION_PROVINCES.get(country, []):
            for c in _cities_for_parent(country, province["code"]):
                if c["code"] == city:
                    return _resolve_region_code(country, province["code"], city)
        return ""
    return _resolve_region_code(country, "", city)


# 日本「都市圈」聚合：同城 / 二手 / 租房 / 工作 / 商家 都按生活圈(关东圈/关西圈…)
# 合并展示,而不是只看单个城市(城市之间离得很近,单城太窄)。province codes 与
# iOS KaiXRegionDirectory.jpMetroCircles / web JP_METRO_CIRCLES 保持一致。
JP_METRO_CIRCLES: dict[str, list[str]] = {
    "hokkaido_tohoku": ["hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima"],
    "kanto":           ["ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa"],
    "chubu":           ["niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano", "gifu", "shizuoka", "aichi"],
    "kansai":          ["mie", "shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama"],
    "chugoku":         ["tottori", "shimane", "okayama", "hiroshima", "yamaguchi"],
    "shikoku":         ["tokushima", "kagawa", "ehime", "kochi"],
    "kyushu_okinawa":  ["fukuoka", "saga", "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa"],
}


def _jp_circle_for_province(province_code: str) -> str | None:
    p = (province_code or "").lower()
    for code, provs in JP_METRO_CIRCLES.items():
        if p in provs:
            return code
    return None


def _dedupe(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in seq:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def metro_circle_city_slugs(country: str, province: str, city: str) -> list[str]:
    """City slugs of the JP 都市圈 that contains (province, city). Non-JP or an
    unmatched province returns just [city] — so the caller's filter stays a
    single city. The origin city is always first."""
    country = (country or "").lower()
    city = (city or "").lower()
    if country != "jp" or not city:
        return [city] if city else []
    circle = _jp_circle_for_province(province)
    if not circle:
        return [city]
    slugs = [city]
    for prov in JP_METRO_CIRCLES[circle]:
        slugs.extend(c["code"] for c in _cities_for_parent("jp", prov))
    return _dedupe(slugs)


def metro_circle_city_slugs_for_city(country: str, city: str) -> list[str]:
    """metro_circle_city_slugs but discovers the province from a bare city slug
    (used when only the city is known, no region_code)."""
    country = (country or "").lower()
    city = (city or "").lower()
    if country != "jp" or not city:
        return [city] if city else []
    for prov in REGION_PROVINCES.get("jp", []):
        for ci in _cities_for_parent("jp", prov["code"]):
            if ci["code"] == city:
                return metro_circle_city_slugs("jp", prov["code"], city)
    return [city]


def metro_circle_region_codes(region_code: str) -> list[str]:
    """Every region_code inside the JP 都市圈 of `region_code`. Non-JP or an
    unmatched code returns just [region_code]."""
    country, province, city = _parse_region_code(region_code)
    if country != "jp" or not city:
        return [region_code] if region_code else []
    circle = _jp_circle_for_province(province)
    if not circle:
        return [region_code]
    codes = [region_code]
    for prov in JP_METRO_CIRCLES[circle]:
        codes.extend(f"jp.{prov}.{c['code']}" for c in _cities_for_parent("jp", prov))
    return _dedupe(codes)


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
    "JP_METRO_CIRCLES",
    "metro_circle_city_slugs",
    "metro_circle_city_slugs_for_city",
    "metro_circle_region_codes",
    "_cities_for_parent",
    "_country_lookup",
    "_detect_region_code_from_geo",
    "_parse_region_code",
    "_region_payload_for_code",
    "_resolve_region_code",
    "_resolve_region_label",
    "region_code_for_city_slug",
]
