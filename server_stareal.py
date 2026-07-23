"""star域东京 (stareal.jp) 房源抓取 / 映射 —— 授权合作方数据导入.

星域东京是 Machi 的合作房产商,双方已约定由 Machi 代为把他们官网 (https://stareal.jp)
上「买房 / 租房 / 投资」的全部房源与照片同步进来,以免合作方逐条手工上传图片。

本模块是**纯数据层**:只负责调用 stareal 公开的 `POST /app/house/get` 列表接口、翻页拉全、
以及把每条记录映射成 `server_partners.sanitize_commit_rows` 能吃的 commit-row 结构。
它**绝不 import server / server_partners**(遵循模块化拆分约定),因此可独立单测、离线跑。

真正的落库 + 图片转存由 server.py 注入的 image_resolver 完成(复用既有 partner 导入管线)。
"""

from __future__ import annotations

import html as _htmllib
import json
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Callable, Iterable, Optional

# ── 基本常量 ──────────────────────────────────────────────────────────────────

STAREAL_BASE = "https://stareal.jp"
HOUSE_API = STAREAL_BASE + "/app/house/get"
HOUSE_DETAIL_API = STAREAL_BASE + "/app/house/detail"
AUTHORIZED_PARTNER_KEYS = {"xingyu-tokyo", "stareal"}

# 详情接口 flat*Info 里的设备/设施两字母代码 -> 中文名(取自官网详情页模板)。
AMENITY_LABELS: dict[str, str] = {
    "dt": "电梯", "ms": "电子锁", "jw": "警卫", "mf": "门房",
    "yt": "阳台", "yg": "步入式衣柜", "xwj": "洗碗机", "dn": "地暖",
    "kd": "快递箱", "jsf": "健身房", "xxs": "休息室", "yc": "游泳池",
    "tcc": "停车场", "zxc": "自行车停车场", "mt": "摩托车停车场",
    "gou": "可养狗", "mao": "可养猫",
}
_AMENITY_GROUPS = ("flatBaseInfo", "flatOutInfo", "flatInInfo", "flatMoreInfo")

# ── 布尔 facet 推断(高置信)────────────────────────────────────────────────
# 整租频道的「可养宠物 / 家具家电」筛选是对 listing_attributes 的严格 EXISTS
# 匹配 —— 只写 amenities 自由文本的话,这两个筛选在 partner 库存上永远 0 结果。
# furnished 只认下面三个高置信关键词(宁缺毋滥:误报会让用户按「家具家电」
# 筛出实际不带家具的房源);pet_allowed 只认官网设施组里明确的 可养狗/可养猫。
# backfill_stareal_listing_attrs.py 回填存量时 import 同一份口径,保持一致。
FURNISHED_KEYWORDS: tuple[str, ...] = ("家具家電付き", "家電付き", "家具付き")
PET_AMENITY_LABELS: tuple[str, ...] = ("可养狗", "可养猫")


def infer_boolean_attrs(*, amenities: Any = (), texts: Iterable[str] = ()) -> dict[str, bool]:
    """从设施列表/文本推断 pet_allowed / furnished(只输出命中的 key)。

    ``amenities`` 接受列表或「，」分隔文本(decode_amenities 的两种落点);
    ``texts`` 是标题/描述/badges 等自由文本。「家具・家電付き」等中点变体
    也按高置信命中:先去掉中点再匹配。"""
    out: dict[str, bool] = {}
    if isinstance(amenities, str):
        amenity_list = [a.strip() for a in re.split(r"[，,]+", amenities) if a.strip()]
    else:
        amenity_list = [str(a).strip() for a in (amenities or ())]
    if any(a in PET_AMENITY_LABELS for a in amenity_list):
        out["pet_allowed"] = True
    haystack = "\n".join(str(t) for t in texts if t).replace("・", "").replace("･", "")
    if any(kw in haystack for kw in FURNISHED_KEYWORDS):
        out["furnished"] = True
    return out

# stareal 官网的三个板块 -> Machi listing_intent。
# 注意:列表项里的 `bri` 字段是反的/不可信(buy 项 bri='rent'),
# 一律以我们请求时用的 house_type 为准。
INTENT_BY_TYPE: dict[str, str] = {
    "buy": "sale",
    "invest": "investment",
    "rent": "rent",
}
ALL_HOUSE_TYPES = ("buy", "rent", "invest")

_UA = "MachiPartnerSync/1.0 (+https://machicity.com; authorized partner import)"
_PAGE_SIZE_FALLBACK = 20
_MAX_PAGES = 500  # 安全阀:即便接口 total 异常也不会无限翻页

# 建物类型 -> 与 Machi 既有种子一致的分类用词(找不到就原样保留)。
_CATEGORY_MAP = {
    "公寓": "マンション",
    "マンション": "マンション",
    "独栋": "一戸建て",
    "一户建": "一戸建て",
    "一戸建": "一戸建て",
    "别墅": "一戸建て",
    "塔楼": "タワーマンション",
    "タワーマンション": "タワーマンション",
    "公寓大楼": "マンション",
}

# 地址前缀 -> Machi city_slug(与 server_partners.CITY_ALIASES 口径一致的常见都市圈)。
_CITY_PREFIXES = [
    ("东京", "tokyo"), ("東京", "tokyo"),
    ("大阪", "osaka"),
    ("横滨", "yokohama"), ("横浜", "yokohama"),
    ("京都", "kyoto"),
    ("名古屋", "nagoya"),
    ("福冈", "fukuoka"), ("福岡", "fukuoka"),
    ("札幌", "sapporo"),
    ("神户", "kobe"), ("神戸", "kobe"),
    ("千叶", "chiba"), ("千葉", "chiba"),
    ("埼玉", "saitama"),
]


# ── 网络:拉取列表 ──────────────────────────────────────────────────────────────

def _post_form(url: str, data: dict[str, Any], *, timeout: float = 30.0,
               opener: Optional[Callable[..., Any]] = None) -> bytes:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "User-Agent": _UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": STAREAL_BASE + "/",
        "Accept": "application/json, text/javascript, */*; q=0.01",
    })
    _open = opener or urllib.request.urlopen
    with _open(req, timeout=timeout) as resp:  # type: ignore[misc]
        return resp.read()


def fetch_house_page(house_type: str, page: int, *, timeout: float = 30.0,
                     opener: Optional[Callable[..., Any]] = None) -> dict[str, Any]:
    """拉取某板块某一页。返回 {total, page, page_size, list:[...]}。"""
    data = {
        "type": house_type,
        "page": page,
        "map": "false",
        "min_price": 0,
        "max_price": 99999999999,
        "min": 0, "max": 99,
        "bath_min": 0, "bath_max": 99,
        "tids": "[]", "stations": "[]", "common": "[]",
        "title": "",
    }
    raw = _post_form(HOUSE_API, data, timeout=timeout, opener=opener)
    parsed = json.loads(raw.decode("utf-8", errors="replace"))
    if not isinstance(parsed, dict):
        raise ValueError(f"stareal house/get 返回非对象: {type(parsed)}")
    return parsed


def fetch_detail(nid: str, *, timeout: float = 30.0,
                 opener: Optional[Callable[..., Any]] = None) -> dict[str, Any]:
    """拉取单套房源的完整详情(比列表多出 lng/lat、築年、階数、物件番号、设备设施等)。"""
    raw = _post_form(HOUSE_DETAIL_API, {"nid": nid}, timeout=timeout, opener=opener)
    parsed = json.loads(raw.decode("utf-8", errors="replace"))
    if not isinstance(parsed, dict):
        raise ValueError(f"stareal house/detail 返回非对象: {type(parsed)}")
    return parsed


def fetch_all_items(house_types: Iterable[str] = ALL_HOUSE_TYPES, *,
                    sleep: float = 0.4, timeout: float = 30.0,
                    with_detail: bool = False,
                    opener: Optional[Callable[..., Any]] = None,
                    log: Optional[Callable[[str], None]] = None) -> list[dict[str, Any]]:
    """翻页拉全所有板块。返回 [{"house_type":..., "item":{...}}, ...],按板块顺序。

    ``with_detail`` 为 True 时,再逐套调用 house/detail,把完整字段并入 item
    (详情是列表的超集:多出 lng/lat、築年 build、階数、物件番号、设备设施等),
    从而做到「官网上有的字段我们全都抓到」。详情接口按套请求,故仅在后台同步任务里开启,
    预览走列表快照即可。"""
    out: list[dict[str, Any]] = []
    for ht in house_types:
        first = fetch_house_page(ht, 1, timeout=timeout, opener=opener)
        total = int(first.get("total") or 0)
        page_size = int(first.get("page_size") or _PAGE_SIZE_FALLBACK) or _PAGE_SIZE_FALLBACK
        pages = max(1, (total + page_size - 1) // page_size)
        pages = min(pages, _MAX_PAGES)
        if log:
            log(f"[{ht}] total={total} page_size={page_size} pages={pages}")
        seen_nids: set[str] = set()
        for pg in range(1, pages + 1):
            page_json = first if pg == 1 else fetch_house_page(ht, pg, timeout=timeout, opener=opener)
            items = page_json.get("list") or []
            new_here = 0
            for it in items:
                nid = str(it.get("nid") or "").strip()
                if not nid or nid in seen_nids:
                    continue
                seen_nids.add(nid)
                out.append({"house_type": ht, "item": it})
                new_here += 1
            if log:
                log(f"[{ht}] page {pg}/{pages}: +{new_here} (accum {len(seen_nids)})")
            if pg < pages and sleep:
                time.sleep(sleep)
        if sleep:
            time.sleep(sleep)

    if with_detail:
        for i, entry in enumerate(out):
            nid = str(entry["item"].get("nid") or "").strip()
            if not nid:
                continue
            try:
                detail = fetch_detail(nid, timeout=timeout, opener=opener)
                # 详情是超集:并入但不覆盖列表已有的非空值(列表价格/图片更稳妥)。
                merged = dict(detail)
                for k, v in entry["item"].items():
                    if v not in (None, "", [], {}):
                        merged.setdefault(k, v)
                        if k in ("price", "images", "poster", "title"):
                            merged[k] = v
                entry["item"] = merged
            except Exception as exc:  # 单套详情失败不拖垮整批,退回列表快照
                if log:
                    log(f"[{entry['house_type']}] detail nid={nid} 失败: {exc}")
            if log and (i + 1) % 20 == 0:
                log(f"detail {i + 1}/{len(out)}")
            if sleep:
                time.sleep(sleep)
    return out


# ── 字段清洗辅助 ────────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_BLOCK_CLOSE_RE = re.compile(r"(?i)</(p|div|br|li|tr|h[1-6])\s*>")
_BR_RE = re.compile(r"(?i)<br\s*/?>")


def strip_html(raw: Any) -> str:
    """把 stareal 的富文本 detail 转成保留段落换行的纯文本。"""
    s = str(raw or "")
    if not s:
        return ""
    s = _BR_RE.sub("\n", s)
    s = _BLOCK_CLOSE_RE.sub("\n", s)
    s = _TAG_RE.sub("", s)
    s = _htmllib.unescape(s)
    s = s.replace(" ", " ")
    # 折叠多余空白 / 空行
    lines = [ln.strip() for ln in s.splitlines()]
    out: list[str] = []
    for ln in lines:
        if ln:
            out.append(re.sub(r"[ \t]{2,}", " ", ln))
        elif out and out[-1] != "":
            out.append("")
    return "\n".join(out).strip()


def original_image_url(url: str, *, full_res: bool = True) -> str:
    """把 Drupal 800×600 派生图 URL 还原成未压缩原图。

    styled: .../sites/default/files/styles/800_600/public/2026-05/IMG.jpg?itok=xxx
    原图:   .../sites/default/files/2026-05/IMG.jpg
    full_res=False 时原样返回派生图(体积更小)。
    """
    u = str(url or "").strip()
    if not u:
        return ""
    if not full_res:
        return u
    u2 = re.sub(r"/styles/[^/]+/public/", "/", u)
    u2 = u2.split("?", 1)[0]
    return u2 or u


def _collect_images(item: dict[str, Any], *, full_res: bool, limit: int) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def add(raw: Any) -> None:
        mapped = original_image_url(str(raw or ""), full_res=full_res)
        if mapped and mapped.startswith("http") and mapped not in seen:
            seen.add(mapped)
            urls.append(mapped)

    add(item.get("poster"))
    for u in (item.get("images") or []):
        add(u)
    return urls[:limit]


def parse_distance(distance: Any) -> dict[str, Any]:
    """[{line,title,distance:'徒步13'}] -> {nearest_station, nearest_lines, minutes}。"""
    if not isinstance(distance, list) or not distance:
        return {}
    first = distance[0] if isinstance(distance[0], dict) else {}
    station = str(first.get("title") or "").strip()
    lines: list[str] = []
    minutes: Optional[int] = None
    for d in distance:
        if not isinstance(d, dict):
            continue
        ln = str(d.get("line") or "").strip()
        if ln and ln not in lines:
            lines.append(ln)
    m = re.search(r"(\d+)", str(first.get("distance") or ""))
    if m:
        minutes = int(m.group(1))
    out: dict[str, Any] = {}
    if station:
        walk = f" 徒步{minutes}分" if minutes is not None else ""
        line0 = str(first.get("line") or "").strip()
        out["nearest_station"] = (f"{station}駅{walk}" + (f"（{line0}）" if line0 else "")).strip()
    if lines:
        out["nearest_lines"] = "，".join(lines[:6])
    if minutes is not None:
        out["station_distance_minutes"] = minutes
    return out


def detect_city_slug(address: Any, default: str = "tokyo") -> str:
    a = str(address or "")
    for prefix, slug in _CITY_PREFIXES:
        if a.startswith(prefix) or prefix in a[:6]:
            return slug
    return default


def _to_float(value: Any) -> Optional[float]:
    try:
        f = float(str(value).strip())
        return f
    except (TypeError, ValueError):
        return None


def decode_amenities(item: dict[str, Any]) -> list[str]:
    """把详情里的 flat*Info 布尔组解码成中文设施名列表(去重、保序)。"""
    out: list[str] = []
    for grp in _AMENITY_GROUPS:
        block = item.get(grp)
        if not isinstance(block, dict):
            continue
        for code, on in block.items():
            if on and code in AMENITY_LABELS and AMENITY_LABELS[code] not in out:
                out.append(AMENITY_LABELS[code])
    return out


def facilities_text(school: Any) -> str:
    """把详情 school(周边设施:便利店/超市/学校…)拼成一行可读文本。"""
    if not isinstance(school, list):
        return ""
    parts: list[str] = []
    for s in school:
        if not isinstance(s, dict):
            continue
        title = str(s.get("title") or "").strip()
        dist = str(s.get("distance") or "").strip()
        if title:
            parts.append(f"{title}（{dist}）" if dist else title)
    return "，".join(parts[:12])


# ── 核心映射:stareal item -> partner commit-row ────────────────────────────────

def map_item(house_type: str, item: dict[str, Any], *, full_res: bool = True,
             default_city: str = "tokyo", max_images: int = 20) -> dict[str, Any]:
    """把一条 stareal 记录映射成 sanitize_commit_rows 能吃的松散 commit-row。"""
    intent = INTENT_BY_TYPE.get(house_type, "rent")
    nid = str(item.get("nid") or "").strip()
    title = str(item.get("title") or "").strip()
    price = _to_float(item.get("price"))
    address = str(item.get("address") or "").strip()

    attrs: dict[str, Any] = {}
    area = _to_float(item.get("mianji"))
    if area is not None:
        attrs["area_sqm"] = area

    if intent == "rent":
        if price is not None:
            attrs["rent"] = price
    else:
        if price is not None:
            attrs["sale_price"] = price
        rate = _to_float(item.get("rate"))
        if rate is not None:
            attrs["yield_rate"] = rate

    woshi = str(item.get("woshi") or "").strip()
    if woshi.isdigit() and int(woshi) > 0:
        attrs["layout"] = f"{int(woshi)}LDK"

    flat_type = str(item.get("flatType") or "").strip()
    if flat_type:
        attrs["building_type"] = flat_type

    attrs.update(parse_distance(item.get("distance")))

    if nid:
        attrs["source_url"] = f"{STAREAL_BASE}/{house_type}/{nid}"

    # ── 详情接口(house/detail)的富字段:有则映射,无则跳过(列表快照不含这些)──────
    latitude = _to_float(item.get("lat"))
    longitude = _to_float(item.get("lng"))

    build = str(item.get("build") or "").strip()
    if build:
        attrs["building_age"] = f"{build}年" if build.isdigit() else build

    total_floors = str(item.get("dijiceng") or "").strip()
    if total_floors:
        attrs["total_floors"] = f"{total_floors}階" if total_floors.isdigit() else total_floors

    room_no = str(item.get("fanghao") or "").strip()
    if room_no:
        attrs["room_no"] = room_no

    prop_no = str(item.get("no") or "").strip()
    if prop_no:
        attrs["property_no"] = prop_no

    status_text = str(item.get("status") or "").strip()
    if status_text:
        attrs["availability_status"] = status_text

    confirm_time = str(item.get("confirm_time") or "").strip()
    if confirm_time:
        attrs["confirmed_at"] = confirm_time

    renov = str(item.get("xuyaogaizao") or "").strip()
    if renov:
        attrs["needs_renovation"] = renov

    lease_term = str(item.get("zuyue") or "").strip()
    if lease_term:
        attrs["lease_term"] = lease_term

    shoufu = _to_float(item.get("shoufu"))
    if shoufu is not None and intent in ("sale", "investment"):
        attrs["down_payment"] = shoufu

    amenities = decode_amenities(item)
    if amenities:
        attrs["amenities"] = "，".join(amenities)

    facilities = facilities_text(item.get("school"))
    if facilities:
        attrs["nearby_facilities"] = facilities

    tags = item.get("tags") or []
    badges = [str(t.get("title") or "").strip() for t in tags
              if isinstance(t, dict) and str(t.get("title") or "").strip()]
    recommended = bool(item.get("isVip")) or any("推荐" in b or "推薦" in b for b in badges)

    description = strip_html(item.get("detail"))

    # 布尔 facet(pet_allowed / furnished):这两个 key 只在 rental 的属性白名单
    # 里(买房/投资 vertical 会在归一时被丢弃),所以只对长租 intent 写入。
    # 布尔值经 partner 管线 _attr_text_type 落库为 value='true'/value_type='bool',
    # 与 /api/listings 的 truthy 过滤直接对得上。
    if intent == "rent":
        attrs.update(infer_boolean_attrs(
            amenities=amenities,
            texts=(title, description, *badges),
        ))

    category = _CATEGORY_MAP.get(flat_type, flat_type)

    return {
        "ext_id": f"stareal-{nid}" if nid else "",
        "title": title,
        "listing_intent": intent,
        "price": price,
        "city_slug": detect_city_slug(address, default_city),
        "location_text": address,
        "latitude": latitude,
        "longitude": longitude,
        "description": description,
        "category": category,
        "status": "published",
        "attrs": attrs,
        "image_urls": _collect_images(item, full_res=full_res, limit=max_images),
        "badges": badges,
        "machi_recommended": recommended,
    }


def map_all(raw_items: list[dict[str, Any]], *, full_res: bool = True,
            default_city: str = "tokyo", max_images: int = 20) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in raw_items:
        rows.append(map_item(entry["house_type"], entry["item"], full_res=full_res,
                             default_city=default_city, max_images=max_images))
    return rows
