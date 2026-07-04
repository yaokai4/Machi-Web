"""City Seed Bot — curated content library + generator (no LLM).

Powers the 城市内容助手 / City Seed Bot admin tool. Everything here is
deterministic, offline, and zero-cost: a curated pool of natural,
city-flavoured lines plus a handful of light templates that inject local
place names for variety. There is intentionally no model call — the output
must read like a real local-life community, not like an AI.

Hard rules this module follows:
- Never fabricates a real personal identity, a finished transaction, or a
  named-merchant review. Lines stay first-person-vague or community-voiced.
- Avoids the banned marketing / AI phrases (see ``BANNED_PHRASES``); any
  candidate that trips the guard is dropped.
- Returns *fewer* items than requested rather than repeating itself.

The server imports :func:`generate` and :func:`default_distribution`. It does
not import anything from ``server.py`` so this stays easy to unit-test and to
extend (just append lines to the pools below).
"""

from __future__ import annotations

import random
from typing import Any

# server_regions is a leaf module (imports only re/typing — never server.py or
# this file), so importing it here creates no cycle. It gives real city display
# names for ALL 109 Japanese cities (and CN/US/…), so seed content for any city
# gets a real anchor instead of the generic "市中心/车站附近" fallback.
try:
    import server_regions as _regions
except Exception:  # pragma: no cover - keep the offline library importable alone
    _regions = None  # type: ignore

# --- taxonomy ---------------------------------------------------------------

SUPPORTED_LANGUAGES: tuple[str, ...] = ("zh", "en", "ja")

# Seed content types (product spec) → the app's existing ``posts.content_type``
# discriminator, so seeded rows render through the normal typed cards without
# any new client rendering path.
APP_CONTENT_TYPE: dict[str, str] = {
    # --- 保留兼容：不再进默认 mix、下拉里也隐藏，但老帖/老批次照常渲染，
    #     端点校验对旧键仍接受，seed_content_batches 历史行不会坏 ---
    "city_square": "dynamic",
    "guide": "guide",
    "housing_tip": "housing",
    "secondhand": "secondhand",
    "jobs_tip": "job_seek",
    "food": "dining",
    "meetup": "meetup",
    "event": "event",
    "local_service": "service",
    "alert": "warning",
    "daily_life": "dynamic",
    # --- 现役分类（5 类，全部复用已有 app 渲染类型，零客户端改动）---
    "spotlight":  "guide",       # 精选攻略：日本生活/玩乐干货长帖（渲染为指南卡片）
    "qa":         "question",     # 新人真问
    "pitfall":    "warning",      # 亲测避坑（复用 warning 卡）
    "checklist":  "guide",        # 实用清单（复用 guide 卡）
    "experience": "dynamic",      # 经验分享（复用 dynamic 卡）
}

SUPPORTED_CONTENT_TYPES: tuple[str, ...] = tuple(APP_CONTENT_TYPE.keys())

# 现役可生成类型：端点只允许这些 + mixed/all；旧键仅供老帖渲染，不再主动生成。
# 综合分布（_DEFAULT_MIX）也只从这些键里取。
ACTIVE_CONTENT_TYPES: tuple[str, ...] = (
    "spotlight", "qa", "pitfall", "checklist", "experience",
)

# 语气 = 6 个「角度」(angle)。与作者身份正交，安全；每个都真正注入 LLM 提示词
# （见 TONE_DIRECTIVE）——这才是让 tone 不再是死代码的关键。
TONES: tuple[str, ...] = (
    "practical", "pitfall", "deep", "compare", "newbie", "thrifty",
)

# 角度 → 注入到 LLM system 提示词末尾的确切中文指令。同一主题换角度 → 产出明显不同。
TONE_DIRECTIVE: dict[str, str] = {
    "practical": (
        "【本批角度=实用清单】每条都要能直接照着做：多用「先…再…最后…」步骤或「①②③」要点，"
        "每个要点带一个具体动作/地点/材料名，读者看完就知道下一步干什么。少抒情、多干货。"
    ),
    "pitfall": (
        "【本批角度=亲测避坑】以「过来人踩过坑」的口气写：先说我当初错在哪、亏了多少钱/时间，"
        "再说正确做法。带具体金额(日元)、具体环节(签约/面接/交易时)，让人一看就想收藏转发。"
    ),
    "deep": (
        "【本批角度=深度攻略】把一个主题真正讲透：覆盖前提条件、分情况、时间线、费用区间、"
        "常见误区。允许写长，但每段都要有信息增量，不许车轱辘话、不许泛泛而谈。"
    ),
    "compare": (
        "【本批角度=对比测评】用「A vs B 怎么选」框架：UR vs 普通租房、派遣 vs 正社员、"
        "JR Pass vs IC卡、docomo vs 楽天…列各自适合谁、大概价位、优缺点，最后给一句「我会选…因为…」。"
    ),
    "newbie": (
        "【本批角度=新手必看】默认读者刚落地什么都不懂：不用行话、每个日语词第一次出现给中文解释，"
        "从最基础的「第一步该干嘛」讲起，像老乡手把手带你。"
    ),
    "thrifty": (
        "【本批角度=省钱】通篇围绕「怎么花更少的钱办成同一件事」：业务超市/二手/午市/回数券/减免制度/"
        "自己办 vs 找中介，给出能省多少、在哪省，数字要具体。"
    ),
}

# 保留符号（_author_type_for_seed 仍引用）；新角度不再做编辑部路由，故为空集。
EDITORIAL_TONES: frozenset[str] = frozenset()


def _author_type_for_seed(*, content_type: str, tone: str, country: str, city: str) -> str:
    """Map seed content to clearly-labelled official desks.

    This keeps the feed from looking like one assistant account is posting
    everything, while still avoiding fake personal identities.
    """
    is_tokyo = country == "jp" and city == "tokyo"
    # Interactive / first-person voices read best from the neutral assistant desk.
    if content_type in {"qa", "experience", "city_square", "daily_life", "secondhand", "meetup"}:
        return "official_bot"
    if content_type == "local_service":
        return "local_life_editorial"
    if content_type == "event":
        return "tokyo_editorial" if is_tokyo else "japan_life_editorial"
    # Long-form guides / checklists / warnings read as an editorial desk.
    if content_type in {"spotlight", "checklist", "pitfall",
                        "guide", "housing_tip", "jobs_tip", "alert", "food"}:
        return "japan_life_editorial"
    if tone in EDITORIAL_TONES:
        return "tokyo_editorial" if is_tokyo else "japan_life_editorial"
    return "official_bot"

# Default mix when the admin asks for a whole-city batch ("mixed"). Scaled to
# the requested count. Spotlight-dominant: the flagship 精选 long-form carries
# the batch, the rest are high-signal interactive types (no low-value filler).
_DEFAULT_MIX: dict[str, int] = {
    "spotlight":  40,   # 精选攻略 — 价值锚
    "qa":         18,   # 新人真问 — 对话面
    "pitfall":    15,   # 亲测避坑 — 信任/转发
    "checklist":  15,   # 实用清单 — 高密度可用
    "experience": 12,   # 经验分享 — feed 节奏
}

MAX_BATCH_COUNT = 100

# Defensive guard: drop any candidate containing these. Keeps the AI/marketing
# tone out even if someone later adds a sloppy line to a pool.
BANNED_PHRASES: tuple[str, ...] = (
    "作为一个 AI", "作为一个ai", "作为 AI", "本平台致力于", "用户可以通过本功能",
    "高效便捷", "全方位", "优质服务", "强烈推荐大家", "宝藏平台", "生活入口",
    "as an ai", "our platform is committed", "one-stop", "highly recommend everyone",
)


# --- city profiles ----------------------------------------------------------
# Per-language display name + a list of local place names used to localise the
# generic templates. region_code matches KaiXRegionDirectory slugs.

CITY: dict[str, dict[str, Any]] = {
    "jp.tokyo.tokyo": {
        "zh": "东京", "en": "Tokyo", "ja": "東京",
        "places": {
            "zh": ["新宿", "涩谷", "池袋", "高田马场", "上野", "中野", "吉祥寺", "横滨"],
            "en": ["Shinjuku", "Shibuya", "Ikebukuro", "Takadanobaba", "Ueno", "Nakano", "Kichijoji"],
            "ja": ["新宿", "渋谷", "池袋", "高田馬場", "上野", "中野", "吉祥寺", "横浜"],
        },
    },
    "jp.osaka.osaka": {
        "zh": "大阪", "en": "Osaka", "ja": "大阪",
        "places": {
            "zh": ["梅田", "难波", "天王寺", "心斋桥", "新大阪", "京桥"],
            "en": ["Umeda", "Namba", "Tennoji", "Shinsaibashi", "Shin-Osaka", "Kyobashi"],
            "ja": ["梅田", "難波", "天王寺", "心斎橋", "新大阪", "京橋"],
        },
    },
    "jp.kanagawa.yokohama": {
        "zh": "横滨", "en": "Yokohama", "ja": "横浜",
        "places": {
            "zh": ["横滨站", "港未来", "中华街", "元町", "关内", "樱木町", "新横滨"],
            "en": ["Yokohama Station", "Minato Mirai", "Chinatown", "Motomachi", "Kannai", "Sakuragicho"],
            "ja": ["横浜駅", "みなとみらい", "中華街", "元町", "関内", "桜木町", "新横浜"],
        },
    },
    "jp.kyoto.kyoto": {
        "zh": "京都", "en": "Kyoto", "ja": "京都",
        "places": {
            "zh": ["京都站", "河原町", "祇园", "四条", "伏见", "岚山", "北大路"],
            "en": ["Kyoto Station", "Kawaramachi", "Gion", "Shijo", "Fushimi", "Arashiyama"],
            "ja": ["京都駅", "河原町", "祇園", "四条", "伏見", "嵐山", "北大路"],
        },
    },
    "jp.aichi.nagoya": {
        "zh": "名古屋", "en": "Nagoya", "ja": "名古屋",
        "places": {
            "zh": ["名古屋站", "荣", "大须", "金山", "星丘", "今池"],
            "en": ["Nagoya Station", "Sakae", "Osu", "Kanayama", "Hoshigaoka", "Imaike"],
            "ja": ["名古屋駅", "栄", "大須", "金山", "星ヶ丘", "今池"],
        },
    },
    "jp.fukuoka.fukuoka": {
        "zh": "福冈", "en": "Fukuoka", "ja": "福岡",
        "places": {
            "zh": ["博多", "天神", "中洲", "大名", "西新", "药院"],
            "en": ["Hakata", "Tenjin", "Nakasu", "Daimyo", "Nishijin", "Yakuin"],
            "ja": ["博多", "天神", "中洲", "大名", "西新", "薬院"],
        },
    },
    "jp.hokkaido.sapporo": {
        "zh": "札幌", "en": "Sapporo", "ja": "札幌",
        "places": {
            "zh": ["札幌站", "大通", "薄野", "狸小路", "円山", "北24条"],
            "en": ["Sapporo Station", "Odori", "Susukino", "Tanukikoji", "Maruyama", "Kita-24jo"],
            "ja": ["札幌駅", "大通", "すすきの", "狸小路", "円山", "北24条"],
        },
    },
    "jp.hyogo.kobe": {
        "zh": "神户", "en": "Kobe", "ja": "神戸",
        "places": {
            "zh": ["三宫", "元町", "神户站", "北野", "六甲", "新开地"],
            "en": ["Sannomiya", "Motomachi", "Kobe Station", "Kitano", "Rokko", "Shinkaichi"],
            "ja": ["三宮", "元町", "神戸駅", "北野", "六甲", "新開地"],
        },
    },
    "cn.shanghai.shanghai": {
        "zh": "上海", "en": "Shanghai", "ja": "上海",
        "places": {
            "zh": ["徐汇", "静安", "浦东", "杨浦", "长宁", "虹口", "莘庄"],
            "en": ["Xuhui", "Jing'an", "Pudong", "Yangpu", "Changning", "Hongkou"],
            "ja": ["徐匯", "静安", "浦東", "楊浦", "長寧"],
        },
    },
    "cn.zhejiang.hangzhou": {
        "zh": "杭州", "en": "Hangzhou", "ja": "杭州",
        "places": {
            "zh": ["西湖", "滨江", "余杭", "下沙", "城西", "钱江新城", "未来科技城"],
            "en": ["West Lake", "Binjiang", "Yuhang", "Xiasha", "Future Sci-Tech City"],
            "ja": ["西湖", "濱江", "余杭", "下沙"],
        },
    },
    "us.ca.la": {
        "zh": "洛杉矶", "en": "Los Angeles", "ja": "ロサンゼルス",
        "places": {
            "zh": ["韩国城", "圣莫尼卡", "市中心", "帕萨迪纳", "尔湾", "西好莱坞"],
            "en": ["Koreatown", "Santa Monica", "Downtown LA", "Pasadena", "Irvine", "West Hollywood"],
            "ja": ["コリアタウン", "サンタモニカ", "ダウンタウン", "パサデナ"],
        },
    },
    "ca.montreal": {
        "zh": "蒙特利尔", "en": "Montreal", "ja": "モントリオール",
        "places": {
            "zh": ["Plateau", "市中心", "Concordia", "McGill", "Côte-des-Neiges"],
            "en": ["Plateau", "Downtown", "Concordia", "McGill", "Côte-des-Neiges"],
            "ja": ["プラトー", "ダウンタウン", "Concordia", "McGill"],
        },
    },
}

# Alternate region_code spellings → canonical key, so the tool still resolves
# when the client/admin passes a slightly different slug for the same city.
CITY_ALIASES: dict[str, str] = {
    "ca.quebec.montreal": "ca.montreal",
    "ca.montreal.montreal": "ca.montreal",
    "us.ca.losangeles": "us.ca.la",
    "us.ca.la.la": "us.ca.la",
}

_DEFAULT_PLACES: dict[str, list[str]] = {
    "zh": ["市中心", "车站附近", "老城区", "大学城"],
    "en": ["downtown", "the station area", "the old town", "the university area"],
    "ja": ["駅前", "中心部", "旧市街", "大学エリア"],
}


# --- curated hero lines -----------------------------------------------------
# Hand-written, city-specific, used verbatim. Expand freely. Keyed by
# (content_type, language) → {region_code: [lines]}.

CURATED: dict[tuple[str, str], dict[str, list[str]]] = {
    ("city_square", "zh"): {
        "jp.tokyo.tokyo": [
            "今天涩谷人真的太多了，本来只是想去买点东西，结果出站就开始后悔。",
            "刚来东京的人真的可以先把住的地方选在交通方便一点的区域，不然后面通勤会很累。",
            "有人知道高田马场附近哪里可以修电脑吗？最好是能当天看的那种。",
            "池袋附近有没有适合一个人吃晚饭的店？不想排太久队。",
            "下雨天的新宿站，换乘的人能把你推着走。",
        ],
        "cn.shanghai.shanghai": [
            "上海的梅雨季一来，包里没把伞都不敢出门。",
            "在徐汇这边住久了，发现小马路上反而藏着不少好吃的。",
        ],
    },
    ("city_square", "ja"): {
        "jp.tokyo.tokyo": [
            "今日の渋谷、人が多すぎて駅を出た瞬間ちょっと後悔した。",
            "高田馬場あたりで、当日見てもらえるパソコン修理のお店ってありますか？",
            "雨の日の新宿駅の乗り換え、人の流れに押されて進む感じ。",
        ],
        "jp.osaka.osaka": [
            "梅田、相変わらず地下で迷う。出口の番号だけが頼り。",
        ],
    },
    ("city_square", "en"): {
        "us.ca.la": [
            "LA traffic has a way of making a 20-minute plan turn into a whole afternoon.",
            "Anyone know a decent coffee shop around Koreatown where it's not too loud to work for an hour?",
            "Apartment hunting in LA feels like a second job sometimes.",
        ],
    },
    ("housing_tip", "zh"): {
        "jp.tokyo.tokyo": [
            "东京租房看房的时候，除了房租本身，礼金、押金、管理费、更新料都要一起算。不然一开始觉得便宜，最后总额会超出预期。",
            "离车站近不一定就舒服，有些房子靠近大路或者铁路线，晚上声音会很明显。看房最好白天和晚上都留意一下周围环境。",
        ],
        "ca.montreal": [
            "第一次在蒙特利尔租房，建议多问一句暖气包不包括。不然冬天账单会很明显。",
        ],
    },
    ("housing_tip", "ja"): {
        "jp.tokyo.tokyo": [
            "東京で部屋を探すとき、家賃だけじゃなくて管理費と更新料もちゃんと見たほうがいい。",
            "駅近でも大通り沿いだと夜けっこう音が気になることがある。内見は昼と夜の両方見るのがおすすめ。",
        ],
    },
    ("daily_life", "zh"): {
        "ca.montreal": [
            "蒙特利尔冬天真的不要只看温度，风和路面结冰才是重点。鞋子比外套更重要。",
        ],
    },
    ("qa", "zh"): {
        "jp.tokyo.tokyo": [
            "刚到东京，想问一下区役所办地址登记一般要预约吗？有没有需要提前准备的材料？",
            "东京看牙医如果日语一般，大家会怎么找能沟通清楚的诊所？",
            "新宿和池袋之间通勤，哪边晚上回家相对方便一点？",
        ],
        "jp.osaka.osaka": [
            "大阪第一次租房，礼金和保证公司费用一般怎么判断是不是合理？",
        ],
        "us.ca.la": [
            "洛杉矶没有车的话，住 Koreatown 附近日常会不会方便很多？",
        ],
        "ca.montreal": [
            "蒙特利尔冬天第一次租房，除了暖气还需要问房东哪些细节？",
        ],
    },
    ("guide", "zh"): {
        "jp.tokyo.tokyo": [
            "刚到东京的前两周，可以先把住址登记、手机卡、交通卡、银行卡、常用药店位置这几件事排好，后面会轻松很多。",
            "东京找房不要只看车站名，也要看具体出口、夜路、超市距离和末班车。通勤时间差十分钟，长期下来感受很明显。",
        ],
        "cn.zhejiang.hangzhou": [
            "杭州跨区通勤前，最好先看早高峰地铁换乘和雨天打车情况。地图上的距离有时不等于真实时间。",
        ],
        "us.ca.la": [
            "在洛杉矶安排生活半径时，先看上班/上课路线，再看超市、停车和晚间安全。区域之间的体感距离会比地图上更大。",
        ],
    },
    ("local_service", "zh"): {
        "jp.tokyo.tokyo": [
            "东京搬家找师傅时，建议提前说清楚楼层、电梯、是否需要拆装家具和停车位置，报价会更准确。",
            "如果需要翻译、搬家、维修这类本地服务，发布需求时写清楚区域、时间、预算和语言要求，比较容易收到靠谱回复。",
        ],
        "cn.shanghai.shanghai": [
            "上海找上门维修或搬家服务，最好先确认报价包含哪些项目，避免现场临时加价。",
        ],
    },
    ("event", "zh"): {
        "jp.tokyo.tokyo": [
            "周末想找轻量活动的话，可以先看代代木、上野、吉祥寺附近的小市集和展览，临时去也不太有压力。",
            "东京线下活动发布时最好写清楚集合点、费用、人数上限和是否接受迟到，这样报名的人也更安心。",
        ],
        "cn.shanghai.shanghai": [
            "上海周末活动如果在商圈附近，建议提前看地铁出口和散场时间，人多的时候打车会比较慢。",
        ],
    },
    ("jobs_tip", "zh"): {
        "jp.tokyo.tokyo": [
            "东京找兼职时，除了时薪，也要问交通费、培训期工资、排班规则和是否需要深夜班。条件写清楚比只看标题靠谱。",
            "招聘帖如果没有公司名、地址、联系人和工作内容，只写高薪快速入职，建议先核实再继续沟通。",
        ],
    },
    ("alert", "zh"): {
        "jp.tokyo.tokyo": [
            "提醒一下，租房或兼职沟通里如果一开始就要求转账、交押金、发证件照片，先暂停核实，不要急着给资料。",
            "线下见面、约饭或二手交易第一次建议选公共地点，保留聊天记录，也给朋友留一下大致时间和位置。",
        ],
        "us.ca.la": [
            "洛杉矶看房如果对方只给模糊地址、拒绝视频看房、催你先付定金，建议先停一下核实房源。",
        ],
    },
}


# Merge generated extra curated lines (city content packs) into CURATED. Kept in
# a separate generated module so this file stays hand-editable; failures are
# non-fatal (the base pool still works).
try:  # pragma: no cover - data module is generated, optional at import
    from seed_content_packs import EXTRA_CURATED as _EXTRA_CURATED
    for _key, _region_map in _EXTRA_CURATED.items():
        _dst = CURATED.setdefault(_key, {})
        for _rc, _lines in _region_map.items():
            _existing = _dst.setdefault(_rc, [])
            for _ln in _lines:
                if _ln not in _existing:
                    _existing.append(_ln)
except Exception:
    pass


# --- generic templates ------------------------------------------------------
# {city} = localised city name, {place} = a local place name. Written to read
# like ordinary community lines, not filled-in forms. Keyed by
# (content_type, language).

GENERIC: dict[tuple[str, str], list[str]] = {
    ("city_square", "zh"): [
        "{place}今天人有点多，随便逛逛都要排队。",
        "在{city}待久了，慢慢就知道哪几个路口最容易堵。",
        "周末想去{place}附近走走，有什么顺路能逛的吗？",
        "{place}那边晚上挺安静的，适合饭后散步。",
        "今天{place}站又遇到电车遅延，站台上全是叹气的打工人，我也是其中一个。",
        "在{city}住下来才发现，最难的不是日语，是一个人扛着行李搬家那天。",
        "刚到{city}，求问哪里有华人超市，想买点老干妈和挂面，馋了。",
        "{place}今天天气好到不真实，临时决定翘班去晒太阳，お疲れ我自己。",
        "有没有在{city}的朋友想组个搭子，周末一起逛逛，一个人久了有点闷。",
        "下班的{place}，地铁里全是西装，突然有点想家。",
        "{place}的便利店凌晨还亮着灯，emo的时候真的会想进去买瓶热的。",
    ],
    ("city_square", "en"): [
        "{place} was packed today — even a quick errand turned into a wait.",
        "Been in {city} long enough to know which intersections to avoid at rush hour.",
        "Thinking of wandering around {place} this weekend, anything worth a stop nearby?",
    ],
    ("city_square", "ja"): [
        "{place}、今日は人が多めでどこも軽く並ぶ感じ。",
        "{city}に長くいると、混む交差点がだんだん分かってくる。",
        "週末に{place}のあたりを歩こうかな。近くでついでに寄れる場所ある？",
    ],
    ("qa", "zh"): [
        "请问{place}附近有靠谱的牙医吗？想找个能预约的。",
        "在{city}办手机卡，哪家对刚来的人比较友好？",
        "{place}附近有没有可以自习或者办公一两个小时的地方？",
        "刚搬到{city}，想问下大家一般在哪里买生活用品比较省事？",
        "{place}附近晚上回家安全吗？有没有需要避开的路段？",
        "第一次在{city}找房，除了房租还应该重点问哪些费用？",
    ],
    ("qa", "en"): [
        "Any reliable dentist around {place}? Looking for somewhere I can book ahead.",
        "Getting a phone plan in {city} — which carrier is friendliest for newcomers?",
        "Anywhere around {place} good for sitting and working for an hour or two?",
    ],
    ("qa", "ja"): [
        "{place}の近くで、予約できる歯医者さんってありますか？",
        "{city}でスマホの契約、初めての人に分かりやすいのはどこだろう。",
    ],
    ("guide", "zh"): [
        "刚到{city}的话，先把常去的几个区域的交通卡和常用 App 弄好，会顺很多。",
        "在{city}过第一个月，建议先摸清楚{place}和车站之间怎么走最省时间。",
        "{city}生活刚开始不用一次把所有事办完，先处理住址、通讯、通勤和常用超市这几件最影响日常的事。",
        "如果要长期住在{city}，建议把工作日通勤和周末活动分开看。有些区域平日方便，周末反而很绕。",
    ],
    ("guide", "en"): [
        "If you just landed in {city}, sort out a transit card and the apps you'll use daily first — it makes everything smoother.",
        "First month in {city}: figure out the quickest way between {place} and the station early on.",
    ],
    ("guide", "ja"): [
        "{city}に来たばかりなら、まず交通カードとよく使うアプリを揃えておくと楽。",
    ],
    ("housing_tip", "zh"): [
        "在{city}租房，签约前记得把押金和管理费问清楚，别只看月租。",
        "{place}这边离车站近，但有些房子临街，晚上会有点吵，看房最好白天晚上都去一次。",
        "看房时可以顺手拍一下插座、窗户、洗衣机位置和收纳空间，回去对比的时候很有用。",
        "如果房源价格明显低于同区平均，先确认合同、付款方式和房东身份，不要急着付定金。",
    ],
    ("housing_tip", "en"): [
        "Renting in {city}: confirm the deposit and building fees before signing, not just the monthly rent.",
        "{place} is close to the station, but some units face busy roads — try viewing both day and night.",
    ],
    ("housing_tip", "ja"): [
        "{city}で部屋を借りるなら、家賃だけじゃなくて敷金・管理費も先に確認したほうがいい。",
    ],
    ("secondhand", "zh"): [
        "搬家清一批闲置，{place}附近可以自取，有需要的可以问。",
        "换季整理出一些用不上的东西，{city}市区基本都能约时间。",
        "二手交易建议写清楚尺寸、使用年限、取货方式和是否能送到楼下，沟通会省很多来回。",
        "如果是大件家具，最好提前确认电梯尺寸和搬运路线，不然现场会很麻烦。",
    ],
    ("secondhand", "en"): [
        "Clearing out a few things before moving — pickup around {place} if anyone needs them.",
        "Sorting out some unused stuff; can usually arrange a time around {city}.",
    ],
    ("secondhand", "ja"): [
        "引っ越し前に少し整理中。{place}あたりなら受け渡しできます。",
    ],
    ("jobs_tip", "zh"): [
        "在{city}找兼职，面试前确认好时薪和交通费报不报，省得后面尴尬。",
        "{place}附近的店招人时，排班能不能自己选也很重要，最好先问清楚。",
        "投递本地岗位前，先把可上班时间、语言水平、签证/工时限制和通勤范围写清楚，会更容易匹配。",
        "看到只写高薪但没有公司信息、地址和具体工作内容的招聘，建议先核实再联系。",
    ],
    ("jobs_tip", "en"): [
        "Looking for part-time work in {city}: confirm the hourly rate and whether transit is covered before the interview.",
        "When shops around {place} are hiring, ask early whether you can pick your own shifts.",
    ],
    ("jobs_tip", "ja"): [
        "{city}でバイトを探すなら、面接前に時給と交通費の有無を確認しておくと安心。",
    ],
    ("food", "zh"): [
        "{place}新开的那家咖啡，下午人不多，适合坐着待一会儿。",
        "在{city}想找个安静点吃饭的地方，{place}那边小店挺多。",
        "约饭帖最好写清楚人数、预算、口味和是否AA，临时组局会顺很多。",
        "{city}有些店午市和晚市价格差不少，想省预算可以先看午餐时段。",
        "{place}那家拉面今天排了半小时，吃到嘴里的时候觉得汤都值了。",
        "在{city}吃来吃去还是想念家里那口，今天自己包了顿饺子治愈一下。",
        "求{city}好吃又不贵的中华料理，最近真的吃腻便利店便当了。",
        "{place}的居酒屋下班去刚刚好，一杯生啤把一天的班都冲掉了。",
    ],
    ("food", "en"): [
        "That new coffee spot near {place} is quiet in the afternoon — good for sitting a while.",
        "Looking for a calmer place to eat in {city}? {place} has a lot of small spots.",
    ],
    ("food", "ja"): [
        "{place}にできた新しいカフェ、午後は空いてて落ち着ける。",
    ],
    ("meetup", "zh"): [
        "周末{place}有没有想一起爬山或者吃饭的，人多热闹点。",
        "最近想在{city}找个一起运动的搭子，{place}附近的优先。",
        "轻量活动第一次见面建议选公共地点，时间不要排太晚，大家都更放松。",
        "想找周末搭子的话，把地点、时间、预算和大概节奏写清楚，回应会更有效。",
    ],
    ("meetup", "en"): [
        "Anyone up for a hike or a meal around {place} this weekend? More the merrier.",
        "Looking for a workout buddy in {city}, ideally around {place}.",
    ],
    ("meetup", "ja"): [
        "週末、{place}あたりで一緒にご飯か散歩できる人いますか？",
    ],
    ("event", "zh"): [
        "听说{place}这周末有市集，有去过的吗？值不值得专门跑一趟。",
        "{city}最近线下活动好像多起来了，{place}那边有看到海报。",
        "活动帖里如果能写清楚集合点、费用、人数和取消规则，报名的人会安心很多。",
        "{place}附近如果有展览、市集或小型演出，欢迎发出来，周末找活动的人挺多。",
    ],
    ("event", "en"): [
        "Heard there's a market around {place} this weekend — anyone been? Worth the trip?",
        "Feels like there are more events in {city} lately; saw posters around {place}.",
    ],
    ("event", "ja"): [
        "{place}で今週末マルシェがあるらしい。行った人いる？",
    ],
    ("local_service", "zh"): [
        "{city}有没有推荐的搬家师傅？要能爬楼的那种。",
        "想在{place}附近找个修自行车的地方，最好不用等太久。",
        "发布本地服务需求时，写清楚区域、时间、预算和是否需要中文/英文/日文沟通，比较容易找到合适的人。",
        "找维修、搬家、翻译、报税这类服务，建议先问清楚报价包含什么，避免现场临时加价。",
    ],
    ("local_service", "en"): [
        "Any recommendations for movers in {city}? Need someone okay with stairs.",
        "Looking for a bike repair place near {place}, ideally without a long wait.",
    ],
    ("local_service", "ja"): [
        "{city}で引っ越し業者のおすすめありますか？階段ありの物件で。",
    ],
    ("alert", "zh"): [
        "提醒一下，{place}最近在修路，开车和骑车的绕一下会快很多。",
        "{place}那段晚上灯比较暗，一个人走的话注意一下。",
        "二手、租房、兼职沟通里如果对方一直催你先转账，先停一下核实身份和地址。",
        "第一次线下见面建议选公共地点，保留沟通记录，也给朋友留一个大概时间。",
    ],
    ("alert", "en"): [
        "Heads up: roadwork around {place} lately — driving or cycling around it saves time.",
        "That stretch near {place} is a bit dark at night; just be aware if you're walking alone.",
    ],
    ("alert", "ja"): [
        "{place}の近く、最近工事中なので車や自転車は迂回したほうが早いです。",
    ],
    ("daily_life", "zh"): [
        "在{city}的第一个周末，什么都不想干，就想睡到自然醒。",
        "下班路过{place}，顺手买了点东西，感觉一天才算结束。",
        "在{city}的早上靠一杯便利店咖啡续命，シフト排太满了，麻了。",
        "今天终于把区役所的手续办完，{place}走一圈腿都断了，但心里踏实多了。",
        "{place}的药妆店打折，囤了一堆，钱包空了但很满足。",
        "周末{city}哪都没去，在家煮了顿火锅，一个人也要好好吃饭。",
        "刚发完工资就被房租和年金清空，在{city}活着是真的费钱啊。",
        "{place}下雨，伞又忘带了，在站前站了十分钟等雨小一点。",
    ],
    ("daily_life", "en"): [
        "First weekend in {city} and all I want to do is sleep in.",
        "Walked past {place} after work, grabbed a few things — felt like the day finally ended.",
    ],
    ("daily_life", "ja"): [
        "{city}での最初の週末、何もせずひたすら寝ていたい。",
    ],
    ("spotlight", "zh"): [
        "在{city}的第一个月，建议先把这几件事按顺序办：住址登记、手机卡、银行卡、交通IC卡、常去超市和药妆的位置。前两周别贪多，先把日常跑通。",
        "{city}周末怎么安排：上午去{place}逛逛、中午找家定食、下午看个展或去河边走走，傍晚赶在末班车前回家。临时起意也不会太累。",
        "来{city}玩/生活，省钱小结：午市比晚市便宜、业务超市囤货、药妆比价、二手店淘家电、交通用IC卡。攒下来的钱够你多吃几顿好的。",
    ],
    ("spotlight", "ja"): [
        "{city}に来た最初の1ヶ月でやることリスト：住所登録、SIM、銀行口座、ICカード、よく行くスーパーと薬局の確認。焦らず順番に。",
    ],
    # --- 现役新键的离线兜底（DeepSeek 挂了时 mixed 也能产出这些类型）---
    ("pitfall", "zh"): [
        "在{city}租房被中介多收过钱，签约前一定逐项问清礼金敷金更新料、清扫费，别嫌麻烦，白纸黑字比口头靠谱。",
        "第一次在{place}面接兼职，对方上来就要交「制服押金」——这种直接跑，正规店不会先收钱。",
        "二手交易别先转账，约在{place}这种人多的地方面交，验完货再付；一直催你打钱的基本有问题。",
        "刚来{city}办手机卡踩过坑：两年缚约+高额解约金那种别急着签，先看有没有短约或副牌，一年能省不少。",
    ],
    ("checklist", "zh"): [
        "刚落地{city}第一周清单：①住民登录 ②办手机卡 ③开银行账户 ④办交通IC卡 ⑤记住最近的药妆和业务超市。别贪多，先把日常跑通。",
        "在{city}租房签约前对照一遍：初期费用明细、退租清算规则、隔音朝向、最近车站步行几分、周边有没有超市。少一项都可能后悔。",
        "{city}省钱清单：午市比晚市便宜、业务超市囤货、药妆比价、二手店淘家电、交通用IC卡回数券。攒下来够多吃几顿好的。",
    ],
    ("experience", "zh"): [
        "在{city}第一次去区役所办手续，带齐在留卡和护照基本一次过，没预约也行但上午人少、别赶午休。",
        "在{place}附近找到家便宜又干净的业务超市，囤货一次能省不少，推荐刚来的去踩个点。",
        "{city}看病挂号第一次一头雾水，后来发现先在诊所官网确认受付时间、带上保险证就顺很多。",
    ],
}

# A couple of natural tag seeds per content type (kept short, no spam).
_TAG_BASE: dict[str, list[str]] = {
    "city_square": [], "qa": [], "guide": ["攻略"], "housing_tip": ["租房"],
    "secondhand": ["二手"], "jobs_tip": ["找工作"], "food": ["美食"],
    "meetup": ["搭子"], "event": ["活动"], "local_service": ["本地服务"],
    "alert": ["避坑"], "daily_life": [], "spotlight": ["攻略", "精选"],
    # 现役新键
    "pitfall": ["避坑"], "checklist": ["清单", "攻略"], "experience": ["经验"],
}


# --- helpers ----------------------------------------------------------------

def _canonical_region(region_code: str) -> str:
    rc = (region_code or "").strip().lower()
    return CITY_ALIASES.get(rc, rc)


def _directory_city_name(region_code: str) -> str:
    """Real city display name (zh) from the region directory for any of the 109
    JP cities not in the curated CITY dict. Returns "" if unresolvable."""
    if _regions is None:
        return ""
    try:
        country, province, city = _regions._parse_region_code(region_code)
        if not city:
            return ""
        for c in _regions._cities_for_parent(country, province or None):
            if c.get("code") == city:
                return str(c.get("name") or "")
    except Exception:
        return ""
    return ""


def _city_name(region_code: str, language: str) -> str:
    prof = CITY.get(_canonical_region(region_code))
    if prof:
        return str(prof.get(language) or prof.get("zh") or "")
    # Non-curated city: fall back to the directory's real name (all 109 JP cities).
    return _directory_city_name(region_code)


def _places(region_code: str, language: str) -> list[str]:
    prof = CITY.get(_canonical_region(region_code))
    if prof:
        places = prof.get("places", {})
        picked = list(places.get(language) or places.get("zh") or [])
        if picked:
            return picked
    # Non-curated city: anchor on the real city name + a 站/駅 landmark, then
    # top up with the generic fallbacks so the LLM still has variety.
    name = _directory_city_name(region_code)
    if name:
        suffix = {"ja": "駅", "en": " Station"}.get(language, "站")
        base = list(_DEFAULT_PLACES.get(language, _DEFAULT_PLACES["zh"]))[:4]
        return [name, f"{name}{suffix}", *base]
    return list(_DEFAULT_PLACES.get(language, _DEFAULT_PLACES["zh"]))


def _is_clean(text: str) -> bool:
    low = text.lower()
    return not any(bad.lower() in low for bad in BANNED_PHRASES)


def _candidates(content_type: str, language: str, region_code: str) -> list[str]:
    """All unique candidate lines for a (type, language, city), curated first
    then generic templates expanded over local place names."""
    lang = language if language in SUPPORTED_LANGUAGES else "zh"
    canon = _canonical_region(region_code)
    city_name = _city_name(region_code, lang) or _places(region_code, lang)[0]
    seen: set[str] = set()
    out: list[str] = []

    def _add(line: str) -> None:
        line = line.strip()
        if line and line not in seen and _is_clean(line):
            seen.add(line)
            out.append(line)

    for line in CURATED.get((content_type, lang), {}).get(canon, []):
        _add(line)
    places = _places(region_code, lang)
    for tmpl in GENERIC.get((content_type, lang), []):
        if "{place}" in tmpl:
            for place in places:
                _add(tmpl.replace("{place}", place).replace("{city}", city_name))
        else:
            _add(tmpl.replace("{city}", city_name))
    return out


def default_distribution(count: int) -> dict[str, int]:
    """Scale the default content mix to ``count`` items (used for mixed batches)."""
    count = max(0, min(int(count), MAX_BATCH_COUNT))
    total = sum(_DEFAULT_MIX.values())
    out: dict[str, int] = {}
    assigned = 0
    for ctype, weight in _DEFAULT_MIX.items():
        n = round(count * weight / total)
        out[ctype] = n
        assigned += n
    # Reconcile rounding drift against the largest bucket.
    drift = count - assigned
    if drift and out:
        biggest = max(out, key=lambda k: out[k])
        out[biggest] = max(0, out[biggest] + drift)
    # Floor: once the batch is at least as large as the number of types, no
    # requested type should round away to 0 — borrow one from the largest bucket
    # so the tail types (experience/pitfall…) always show up.
    if count >= len(_DEFAULT_MIX):
        for ctype in _DEFAULT_MIX:
            if out.get(ctype, 0) <= 0:
                biggest = max(out, key=lambda k: out[k])
                if out[biggest] > 1:
                    out[biggest] -= 1
                    out[ctype] = 1
    return {k: v for k, v in out.items() if v > 0}


def generate(
    *,
    region_code: str,
    country: str,
    city: str,
    language: str,
    content_type: str,
    count: int,
    tone: str,
) -> list[dict[str, Any]]:
    """Return up to ``count`` seed items for one (city, type, language).

    Each item: ``{content, title, seed_content_type, app_content_type,
    author_type, tags, tone}``. Never repeats a line; if the curated + generic
    pool is smaller than ``count`` it returns fewer items (caller records the
    real ``created_count``).
    """
    lang = language if language in SUPPORTED_LANGUAGES else "zh"
    tone = tone if tone in TONES else "practical"
    count = max(0, min(int(count), MAX_BATCH_COUNT))

    if content_type in ("mixed", "all", ""):
        plan = default_distribution(count)
    elif content_type in SUPPORTED_CONTENT_TYPES:
        plan = {content_type: count}
    else:
        return []

    rng = random.Random(f"{region_code}|{lang}|{tone}|{content_type}|{count}")
    items: list[dict[str, Any]] = []
    batch_seen: set[str] = set()

    for ctype, want in plan.items():
        pool = _candidates(ctype, lang, region_code)
        rng.shuffle(pool)
        picked = 0
        for line in pool:
            if picked >= want:
                break
            if line in batch_seen:
                continue
            batch_seen.add(line)
            tags = list(_TAG_BASE.get(ctype, []))
            city_name = _city_name(region_code, lang)
            if city_name and lang == "zh":
                tags = ([city_name] + tags)[:3]
            items.append({
                "content": line,
                "title": "",
                "seed_content_type": ctype,
                "app_content_type": APP_CONTENT_TYPE.get(ctype, "dynamic"),
                "author_type": _author_type_for_seed(content_type=ctype, tone=tone, country=country, city=city),
                "tags": tags,
                "tone": tone,
            })
            picked += 1

    return items
