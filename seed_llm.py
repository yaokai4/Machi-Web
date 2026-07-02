"""LLM-backed generation for the City Content Assistant (城市内容助手).

This is the *optional* upgrade path for the seed bot. The offline curated
library in :mod:`seed_content_library` stays the safety net; this module adds a
provider-abstracted LLM front end so the generated community posts read like a
real local-life feed instead of template fill.

Design contract (so the server can treat it as a drop-in for ``seedlib.generate``):
- :func:`generate` returns the *same* item dicts as ``seedlib.generate`` —
  ``{content, title, seed_content_type, app_content_type, author_type, tags, tone}``.
- On **any** problem (no key configured, network error, malformed output,
  empty result) it returns ``None`` so the caller falls back to the offline
  library. It never raises out of the happy path.

Providers (resolved from env, secrets never leave the server):
- ``deepseek`` — primary. OpenAI-compatible Chat Completions, JSON mode.
- ``claude``   — reserved interface (Anthropic Messages API). Wired and ready;
  enable by setting ``ANTHROPIC_API_KEY``.
- ``offline``  — sentinel meaning "skip the LLM"; :func:`generate` returns None.

Hard guardrails applied to every line, regardless of provider:
- Filtered through ``seedlib._is_clean`` (the shared BANNED_PHRASES guard).
- The system prompt forbids fabricating personal identities, finished
  transactions, or named-merchant reviews — the same rule the offline pool
  follows. Output that violates length/sanity is dropped, not "fixed".

Only depends on the standard library + :mod:`seed_content_library`, so it stays
unit-testable and import-light (no ``requests``; uses ``urllib`` like the rest
of the server).
"""

from __future__ import annotations

import json
import os
import secrets
import time
import urllib.error
import urllib.request
from typing import Any

from concurrent.futures import ThreadPoolExecutor

import seed_content_library as seedlib


# --- configuration ----------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else default


# Public engine tokens (what the client/API speak) are neutral: "auto" tries the
# first configured provider, "engine_a"/"engine_b" force a specific one, and
# "offline"/"none" skip the LLM. The mapping to the real upstream providers lives
# only inside this module (see _ENGINE_TO_PROVIDER) — vendor names never leave the
# server (bundle / API / logs).
DEFAULT_PROVIDER = _env("SEED_LLM_PROVIDER", "auto").lower()

DEEPSEEK_API_KEY = _env("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = _env("DEEPSEEK_MODEL", "deepseek-chat")

# Real upstream model ids → human label (server-internal). All verified to work
# with JSON mode. "深度思考"/"Pro" think before answering (slower, higher quality);
# "标准" is the fast default.
DEEPSEEK_MODELS: dict[str, str] = {
    "deepseek-chat": "标准（快速）",
    "deepseek-reasoner": "深度思考",
    "deepseek-v4-flash": "标准（快速）",  # Machi AI base model (verified live on /models)
    "deepseek-v4-pro": "Pro（更强）",
}

# --- public ↔ internal token maps -------------------------------------------
# The admin UI and every API response speak *neutral* tokens; the real provider
# and model ids stay server-internal (resolved here from env). This keeps the
# upstream vendor names out of the client bundle, API payloads, and logs.

# Neutral generation-mode token → human label (surfaced to the UI).
SEED_MODES: dict[str, str] = {
    "fast": "标准（快速）",
    "think": "深度思考",
    "pro": "Pro（更强）",
}
# Neutral mode token → real upstream model id (never leaves the server).
_MODE_TO_MODEL: dict[str, str] = {
    "fast": "deepseek-chat",
    "think": "deepseek-reasoner",
    "pro": "deepseek-v4-pro",
}
_MODEL_TO_MODE: dict[str, str] = {v: k for k, v in _MODE_TO_MODEL.items()}

# Neutral engine token → real internal provider (never leaves the server).
_ENGINE_TO_PROVIDER: dict[str, str] = {
    "engine_a": "deepseek",
    "engine_b": "claude",
}
_PROVIDER_TO_ENGINE: dict[str, str] = {v: k for k, v in _ENGINE_TO_PROVIDER.items()}


def _resolve_model(mode: str | None) -> str:
    """Map a neutral mode token (fast/think/pro) to a real upstream model id.

    Falls back to the configured default for unknown/empty input. Tolerates a
    real id passed straight through (defensive — the UI only ever sends neutral
    tokens)."""
    m = (mode or "").strip()
    if m in _MODE_TO_MODEL:
        return _MODE_TO_MODEL[m]
    if m in DEEPSEEK_MODELS or m == DEEPSEEK_MODEL:
        return m
    return DEEPSEEK_MODEL

ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
ANTHROPIC_BASE_URL = _env("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
ANTHROPIC_MODEL = _env("SEED_LLM_CLAUDE_MODEL", "claude-sonnet-4-6")
ANTHROPIC_VERSION = _env("ANTHROPIC_VERSION", "2023-06-01")

SEED_LLM_TIMEOUT = float(_env("SEED_LLM_TIMEOUT", "40"))
SEED_LLM_MAX_TOKENS = int(_env("SEED_LLM_MAX_TOKENS", "2200"))
SEED_LLM_TEMPERATURE = float(_env("SEED_LLM_TEMPERATURE", "1.05"))
# A single big request is slow (token generation is sequential). We split the
# batch into small chunks and call the model concurrently, so wall-clock time
# stays ~ one chunk regardless of the requested count.
SEED_LLM_CHUNK_ITEMS = max(2, int(_env("SEED_LLM_CHUNK_ITEMS", "6")))
SEED_LLM_MAX_WORKERS = max(1, int(_env("SEED_LLM_MAX_WORKERS", "6")))

# Per-line sanity bounds. Guides run long; one-liners run short.
_MIN_LEN = 6
_MAX_LEN = 400

# Neutral engine tokens surfaced to the admin UI / accepted from the request.
ENGINES = ("auto", "engine_a", "engine_b", "offline")


def configured_providers() -> list[str]:
    """Which real LLM providers have credentials, in preference order."""
    out: list[str] = []
    if DEEPSEEK_API_KEY:
        out.append("deepseek")
    if ANTHROPIC_API_KEY:
        out.append("claude")
    return out


def provider_status() -> dict[str, Any]:
    """Non-secret, *neutralized* status for the admin panel.

    Returns only neutral engine/mode tokens — never the real provider names,
    model ids, or keys."""
    providers = configured_providers()
    return {
        "default": _PROVIDER_TO_ENGINE.get(DEFAULT_PROVIDER, DEFAULT_PROVIDER),
        "configured": [_PROVIDER_TO_ENGINE.get(p, p) for p in providers],
        "engine_a": bool(DEEPSEEK_API_KEY),
        "engine_b": bool(ANTHROPIC_API_KEY),
        "engines": list(ENGINES),
        # Selectable neutral generation modes for the UI: [{id, label}], default first.
        "modes": [{"id": k, "label": v} for k, v in SEED_MODES.items()],
        "default_mode": _MODEL_TO_MODE.get(DEEPSEEK_MODEL, "fast"),
        "ready": bool(providers),
    }


def _resolve_provider(requested: str) -> str | None:
    """Map a requested neutral engine token to a concrete, *configured* provider.

    Returns the real provider name (server-internal) or None to fall back to the
    offline pool."""
    req = (requested or "auto").strip().lower()
    if req in ("offline", "none", ""):
        return None
    provider = _ENGINE_TO_PROVIDER.get(req)
    if provider == "deepseek":
        return "deepseek" if DEEPSEEK_API_KEY else None
    if provider == "claude":
        return "claude" if ANTHROPIC_API_KEY else None
    # "auto" (or anything unrecognized) → first configured provider.
    configured = configured_providers()
    return configured[0] if configured else None


# --- prompt -----------------------------------------------------------------

# Human labels for each seed content type — concrete, Japan-flavoured angles so
# the model writes specific, varied posts instead of generic filler.
_TYPE_BRIEF: dict[str, str] = {
    "city_square": "城市日常见闻/吐槽：通勤挤、天气、街头偶遇、排队、涨价、季节（樱花/梅雨/台风/红叶/初雪）、末班车",
    "qa": "新人真实提问：办手机卡/银行卡、区役所手续、在留卡、年金、垃圾分类、看病找牙医、哪买东西、网络信号",
    "guide": "亲历的小经验：刚来先办哪几件事、交通IC卡、便宜超市/业务超市、药妆、二手店、确定申告——口语别像说明书",
    "housing_tip": "租房真实经验/踩坑：礼金敷金更新料、UR、share house、隔音朝向、初期费用、保证公司、退租押金",
    "secondhand": "出闲置/求购/交易感受：搬家清货、面交地点、家具家电自行车、能不能邮寄、成色",
    "jobs_tip": "找工/兼职经验：时薪、面接、交通费、深夜帯加给、派遣、签证工时限制、黑心店吐槽",
    "food": "吃饭/约饭/探店感受：定食、居酒屋、拉面、便利店/超市限定、深夜想吃、人均（别点名真实店）",
    "meetup": "找搭子/约一起：爬山、桌游、健身、看展、语言交换、周末组局、球局",
    "event": "线下活动/季节信息：祭り、花火大会、市集、展览、跳蚤市场、商场打折季、限定活动",
    "local_service": "找或提醒本地服务：搬家、维修、剪发、翻译代办、宠物照护、上门清洁",
    "alert": "安全避坑：租房/兼职/二手骗局、上来就要转账、深夜路段、诈骗电话短信、台风地震防灾",
    "daily_life": "生活碎碎念/小确幸/emo：加班、想家、做饭翻车、追剧、钱包瘪了、天气、猫、随手感慨",
    "spotlight": "精选攻略·干货长帖：围绕一个清晰主题把日本生活/玩乐讲透——如「在日第一个月必办清单」「东京周末去哪玩」「关西三日游路线」「赏樱/赏枫/温泉地图」「便利店&药妆必买」「租房/找工避坑全攻略」「省钱技巧合集」",
}

_LANG_NAME = {"zh": "简体中文", "en": "English", "ja": "自然な日本語"}

# Distinct spotlight (精选攻略) themes across 衣/食/住/行/玩乐 + 考学/就职, so a batch
# never repeats the same "周末怎么安排" template. One theme per post.
SPOTLIGHT_THEMES: tuple[str, ...] = (
    # 食
    "便利店必买清单", "业务超市/超市省钱囤货", "深夜想吃去哪", "拉面探店地图", "居酒屋第一次怎么点",
    "一人食友好的店", "和牛/烧肉怎么吃不踩雷", "回转寿司攻略", "好喝的咖啡店打卡", "甜品/和菓子推荐",
    # 住
    "第一次租房避坑全攻略", "UR 团地值不值得", "share house 真实体验", "租房初期费用清单", "退租押金怎么要回",
    "怎么挑安静不踩雷的房子", "搬家流程与省钱",
    # 行
    "交通 IC 卡怎么用最划算", "JR Pass 到底值不值", "夜行巴士体验", "市内骑自行车注意事项", "机场到市区怎么走最省",
    "末班车与深夜回家",
    # 玩乐
    "东京近郊一日游路线", "温泉怎么泡更舒服", "赏樱地图", "赏枫地图", "美术馆/展览推荐", "祭典与花火大会",
    "迪士尼/环球省钱攻略", "镰仓/箱根/河口湖怎么玩",
    # 衣 + 办事
    "换季穿搭与买衣服", "二手店/古着淘宝", "药妆护肤必买", "第一个月必办清单", "区役所手续怎么办",
    "国民年金与健康保险", "确定申告怎么报", "看病就医流程", "手机卡运营商对比", "银行开户怎么选",
    # 考学
    "语言学校怎么选", "大学院出愿流程", "EJU/留考备考", "研究计划书怎么写", "怎么联系教授拿内诺", "面接经验分享",
    # 就职
    "在日转职流程", "履历书/职务经历书怎么写", "面接经验与常见问题", "工作签证更新", "派遣 vs 正社员", "双语/IT 岗位怎么找",
)


def _plan(content_type: str, count: int) -> dict[str, int]:
    if content_type in ("mixed", "all", ""):
        return seedlib.default_distribution(count)
    if content_type in seedlib.SUPPORTED_CONTENT_TYPES:
        return {content_type: count}
    return {}


def _build_prompt(*, region_code: str, language: str, tone: str, plan: dict[str, int],
                  themes: list[str] | None = None) -> tuple[str, str]:
    lang = language if language in seedlib.SUPPORTED_LANGUAGES else "zh"
    city_name = seedlib._city_name(region_code, lang) or region_code
    places = seedlib._places(region_code, lang)
    lang_name = _LANG_NAME.get(lang, "简体中文")
    place_hint = "、".join(places[:10])

    plan_lines = "\n".join(
        f'- "{ctype}"（{_TYPE_BRIEF.get(ctype, ctype)}）：{n} 条'
        for ctype, n in plan.items() if n > 0
    )

    system = (
        f"你现在就是一个住在{city_name}的普通中国人/留学生，在一个像小红书/朋友圈/本地论坛的 App 上随手发帖。"
        "写出来要像真人随手打的字，绝对不能像 AI、不能像营销号、不能像新闻稿或攻略说明书。\n"
        "必须做到：\n"
        "1) 长度参差——有的就一句话十几个字，有的两三句；千万别每条一样长一样工整。\n"
        "2) 口语随性——可以是没说完的半句、带点情绪/吐槽/小确幸/求助，可用语气词和网络口语（啊/欸/哈/谁懂/绝了/麻了/救命），标点可随意。\n"
        "3) 细节具体——具体车站/线路/价格(日元)/时间/天气/店的类型/具体的烦恼，越具体越真。\n"
        "4) 角度发散——吐槽、求助、分享、提醒、晒、约、问路、省钱、踩坑、emo……同一批里语气别雷同。\n"
        "5) 自然融入真实日本生活——在留卡/区役所/年金/确定申告/ゴミ分类/交通系IC卡/便利店/药妆/UR/礼金敷金/台风地震/樱花梅雨红叶等真实场景，自然带到、别堆砌（别每条都提行政手续，多数帖子就是日常）。\n"
        "6) 在日华人的语气——偶尔自然夹一两个日语词（バイト/シフト/在留/ビザ/めっちゃ/やばい/お疲れ/微妙）但别整句日语；可以和国内对比着吐槽、想家、找老乡/搭子、吐槽日语和职场。像在留学生群/华人群里随口说话。\n"
        "7) 有时效感——可带「今天/昨天/刚刚/这周」这种当下感，像刚发生的事顺手发出来。\n"
        "8) 性别声音——为每条标注作者性别 g（\"m\"=男 / \"f\"=女），男女都要有；按性别自然区分语气与用词：女生更细腻、爱用「真的」「姐妹」「绝了」、更关注种草/氛围/性价比/穿搭；男生更直接精简、更关注实用/数据/效率/省事——但都别刻板、别油腻、别用力过猛。\n"
        "绝不：① 不要工整对仗、不要总结升华、不要面面俱到；② 不要广告腔/AI腔（高效便捷/全方位/优质服务/宝藏/一站式/家人们/作为AI 等）；"
        "③ 不要编造具体个人身份或已完成的交易、不要点名真实在营商家做评价；④ 不要话题标签#、不堆 emoji（最多一两个）、不放链接。\n"
        "只输出 JSON，不要解释。"
    )

    spotlight_note = (
        "\n【spotlight = 精选攻略·干货长帖，这是重点，要写得又长又有用】：\n"
        "- 长度 350-700 字，围绕一个清晰主题真正讲透（不是泛泛而谈）。\n"
        "- 开头用一句真人化的引子（自己的经历/踩过的坑/被问烦了所以整理），别上来就「干货分享」。\n"
        "- 正文用「1️⃣ 2️⃣ 3️⃣」或短换行分点，每点给**具体可执行**的信息：具体地名/车站/店类型/价格(日元)/时间/步骤/注意事项，最好有数字。\n"
        "- 适当加个人取舍和真实细节（「我一般」「亲测」「踩过坑」「排了40分钟值」），可有一两句吐槽。\n"
        "- 结尾自然收（「有问题评论问我」「先码后看」之类），不要总结升华、不要客套。\n"
        + (
            "- 这一批每条分别写下面这些**互不相同**的主题（一条对应一个，绝不重复、绝不都写「周末怎么安排」）："
            + "；".join(themes) + "。\n"
            if themes else
            "- 每条主题必须完全不同（衣/食/住/行/玩乐/考学/就职都可以），绝不重复套同一个模板。\n"
        )
        + "- 务必像小红书里真人写的高赞干货帖，绝不能像 AI 罗列或官方说明书。\n"
        if "spotlight" in plan else ""
    )
    user = (
        f"语言：{lang_name}。真实地名/车站（自然地用，别硬塞）：{place_hint}。\n\n"
        f"按「类型: 条数」产出，每条符合该类型的角度、彼此不重复：\n{plan_lines}\n"
        f"{spotlight_note}\n"
        '输出严格 JSON：{"items": [{"type": "<类型key>", "content": "<一条帖子正文>", "g": "m或f"}, ...]}\n'
        "再次强调：长度参差、口吻像真人随手发、角度发散、细节具体——读起来绝不能像 AI 生成的。"
    )
    return system, user


# --- transport --------------------------------------------------------------

def _http_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=SEED_LLM_TIMEOUT) as resp:
        raw = resp.read().decode("utf-8", "replace")
    return json.loads(raw)


def _call_deepseek(system: str, user: str, model: str | None = None, max_tokens: int | None = None) -> str:
    model = model or DEEPSEEK_MODEL
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens or SEED_LLM_MAX_TOKENS,
        "response_format": {"type": "json_object"},
        "stream": False,
    }
    # The reasoning model ignores/forbids temperature; the others accept it.
    if "reasoner" not in model:
        payload["temperature"] = SEED_LLM_TEMPERATURE
    data = _http_json(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        payload,
        {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
    )
    # deepseek-reasoner returns chain-of-thought in reasoning_content; we only
    # want the final answer (content).
    return data["choices"][0]["message"]["content"]


def _call_claude(system: str, user: str, max_tokens: int | None = None) -> str:
    # Reserved interface: enabled the moment ANTHROPIC_API_KEY is set.
    data = _http_json(
        f"{ANTHROPIC_BASE_URL}/v1/messages",
        {
            "model": ANTHROPIC_MODEL,
            "max_tokens": max_tokens or SEED_LLM_MAX_TOKENS,
            "temperature": min(SEED_LLM_TEMPERATURE, 1.0),
            "system": system + "\n\n只返回 JSON，不要任何额外文字或代码块标记。",
            "messages": [{"role": "user", "content": user}],
        },
        {"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION},
    )
    parts = data.get("content") or []
    for block in parts:
        if isinstance(block, dict) and block.get("type") == "text":
            return block.get("text") or ""
    return ""


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    if text.startswith("```"):
        # strip ```json ... ``` fences if a model adds them
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if 0 <= start < end:
            return json.loads(text[start:end + 1])
        raise


def _split_plan(plan: dict[str, int], chunk_items: int) -> list[dict[str, int]]:
    """Break a plan into sub-plans each summing to <= chunk_items, so generation
    fans out into small concurrent requests instead of one slow large call."""
    tasks: list[tuple[str, int]] = []
    for t, n in plan.items():
        n = int(n)
        while n > 0:
            take = min(n, chunk_items)
            tasks.append((t, take))
            n -= take
    chunks: list[dict[str, int]] = []
    cur: dict[str, int] = {}
    cur_sum = 0
    for t, n in tasks:
        if cur and cur_sum + n > chunk_items:
            chunks.append(cur)
            cur, cur_sum = {}, 0
        cur[t] = cur.get(t, 0) + n
        cur_sum += n
    if cur:
        chunks.append(cur)
    return chunks


def _generate_chunk(chosen: str, region_code: str, lang: str, tone: str,
                    sub_plan: dict[str, int], model: str | None = None,
                    max_tokens: int | None = None, themes: list[str] | None = None) -> list[Any]:
    """One provider call for a small sub-plan. Returns raw item dicts (or [])."""
    system, user = _build_prompt(region_code=region_code, language=lang, tone=tone, plan=sub_plan, themes=themes)
    try:
        raw = (_call_deepseek(system, user, model, max_tokens) if chosen == "deepseek"
               else _call_claude(system, user, max_tokens))
        parsed = _extract_json(raw)
    except Exception:
        return []
    items = parsed.get("items") if isinstance(parsed, dict) else parsed
    return items if isinstance(items, list) else []


# --- public API -------------------------------------------------------------

def generate(
    *,
    region_code: str,
    country: str,
    city: str,
    language: str,
    content_type: str,
    count: int,
    tone: str,
    provider: str = "auto",
    model: str | None = None,
) -> list[dict[str, Any]] | None:
    """LLM-generate seed items, or return None to fall back to the offline pool.

    ``model`` selects the DeepSeek generation mode (标准 / 深度思考 / Pro);
    ignored for the Claude provider. Returns the same item shape as
    ``seedlib.generate``. May return *fewer* items than requested (after
    dedup/guardrails); never more.
    """
    chosen = _resolve_provider(provider)
    if not chosen:
        return None
    model_id = _resolve_model(model)

    lang = language if language in seedlib.SUPPORTED_LANGUAGES else "zh"
    count = max(0, min(int(count or 0), seedlib.MAX_BATCH_COUNT))
    plan = _plan(content_type, count)
    if not plan or count <= 0:
        return None

    # Fan out small concurrent chunks so wall-clock stays ~ one chunk even for
    # large counts (a single big request is sequential token-gen and too slow).
    # Spotlight posts are long-form, so use smaller chunks + a bigger token cap.
    spotlight = "spotlight" in plan
    chunk_items = 3 if spotlight else SEED_LLM_CHUNK_ITEMS
    chunk_tokens = 3600 if spotlight else SEED_LLM_MAX_TOKENS
    chunks = _split_plan(plan, chunk_items)
    # For spotlight, hand each chunk a distinct set of themes so the batch covers
    # 衣/食/住/行/玩乐/考学/就职 instead of repeating one template.
    theme_by_chunk: list[list[str] | None] = [None] * len(chunks)
    if spotlight:
        rng = secrets.SystemRandom()
        pool = list(SPOTLIGHT_THEMES)
        rng.shuffle(pool)
        idx = 0
        for ci, ch in enumerate(chunks):
            k = sum(ch.values())
            theme_by_chunk[ci] = [pool[(idx + j) % len(pool)] for j in range(k)]
            idx += k
    raw_items: list[Any] = []
    if len(chunks) <= 1:
        raw_items = _generate_chunk(chosen, region_code, lang, tone, plan, model_id, chunk_tokens, theme_by_chunk[0])
    else:
        try:
            work = list(zip(chunks, theme_by_chunk))
            with ThreadPoolExecutor(max_workers=min(SEED_LLM_MAX_WORKERS, len(chunks))) as ex:
                for res in ex.map(
                    lambda cw: _generate_chunk(chosen, region_code, lang, tone, cw[0], model_id, chunk_tokens, cw[1]), work
                ):
                    raw_items.extend(res or [])
        except Exception:
            raw_items = []
    if not raw_items:
        return None

    remaining = dict(plan)  # type → how many still wanted
    seen: set[str] = set()
    out: list[dict[str, Any]] = []

    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        ctype = str(entry.get("type") or entry.get("content_type") or "").strip()
        text = str(entry.get("content") or entry.get("text") or "").strip()
        if ctype not in seedlib.SUPPORTED_CONTENT_TYPES:
            continue
        if remaining.get(ctype, 0) <= 0:
            continue
        max_len = 1100 if ctype == "spotlight" else _MAX_LEN
        if not (_MIN_LEN <= len(text) <= max_len):
            continue
        if not seedlib._is_clean(text):
            continue
        if text in seen:
            continue
        seen.add(text)
        remaining[ctype] -= 1
        tags = list(seedlib._TAG_BASE.get(ctype, []))
        city_name = seedlib._city_name(region_code, lang)
        if city_name and lang == "zh":
            tags = ([city_name] + tags)[:3]
        g = str(entry.get("g") or entry.get("gender") or "").strip().lower()
        gender = "female" if g in ("f", "female", "女") else ("male" if g in ("m", "male", "男") else "")
        out.append({
            "content": text,
            "title": "",
            "seed_content_type": ctype,
            "app_content_type": seedlib.APP_CONTENT_TYPE.get(ctype, "dynamic"),
            "author_type": seedlib._author_type_for_seed(
                content_type=ctype, tone=tone, country=country, city=city),
            "tags": tags,
            "tone": tone,
            # Neutral tokens only — the caller echoes these to the API/logs.
            "engine": _PROVIDER_TO_ENGINE.get(chosen, chosen),
            "model": _MODEL_TO_MODE.get(model_id, "") if chosen == "deepseek" else "",
            "gender": gender,
        })

    return out or None


def generate_comments(
    post_content: str,
    n: int,
    *,
    language: str = "zh",
    provider: str = "auto",
    model: str | None = None,
) -> list[dict[str, str]] | None:
    """Generate up to ``n`` short, varied, real-sounding comments for one post
    (contextual to its content), each tagged with the commenter's gender so the
    caller can attribute it to a matching persona. Returns a list of
    ``{"text", "gender"}`` (gender is "male"/"female"/""), or None on any failure
    → caller falls back to the static pool. Never raises."""
    chosen = _resolve_provider(provider)
    if not chosen or n <= 0:
        return None
    lang = language if language in seedlib.SUPPORTED_LANGUAGES else "zh"
    n = max(1, min(int(n), 8))
    lang_name = _LANG_NAME.get(lang, "简体中文")
    system = (
        "你是在一个面向在日华人/留学生的本地生活社区里、刷到同一条帖子的【不同】真实用户。"
        "给这条帖子写若干条评论。铁律：像真人随手评论，每条像不同的人——口气各异、长短不一"
        "（短的三四个字，长的也别超过 40 字）；可提问/附和/补充经验/吐槽/感谢/报个地点或价格；"
        "针对帖子内容来评，但不要复述帖子原文；可偶尔自然夹个日语词（めっちゃ/やばい/お疲れ/同じ）像华人群里说话；"
        "不要广告腔/AI腔（家人们/宝藏/作为AI）、不堆 emoji、不带话题标签#、不放链接。"
        "为每条标注作者性别 g（\"m\"男 / \"f\"女），男女都要有，语气按性别自然区分（女生更细腻爱用「真的」「姐妹」，男生更直接精简）。只输出 JSON。"
    )
    user = (
        f"语言：{lang_name}。帖子内容：\n{(post_content or '')[:700]}\n\n"
        f'写 {n} 条不同的人会发的评论。输出严格 JSON：{{"comments": [{{"c": "评论", "g": "m或f"}}, ...]}}，共 {n} 条。'
    )
    try:
        raw = _call_deepseek(system, user, model, 900) if chosen == "deepseek" else _call_claude(system, user, 900)
        parsed = _extract_json(raw)
    except Exception:
        return None
    arr = parsed.get("comments") if isinstance(parsed, dict) else parsed
    if not isinstance(arr, list):
        return None
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in arr:
        if isinstance(item, dict):
            c = str(item.get("c") or item.get("content") or item.get("text") or "").strip()
            g = str(item.get("g") or item.get("gender") or "").strip().lower()
        else:
            c, g = str(item or "").strip(), ""
        c = c.lstrip("#").strip()
        if not (2 <= len(c) <= 60) or not seedlib._is_clean(c) or c in seen:
            continue
        gender = "female" if g in ("f", "female", "女") else ("male" if g in ("m", "male", "男") else "")
        seen.add(c)
        out.append({"text": c, "gender": gender})
        if len(out) >= n:
            break
    return out or None


# --- Guide article draft generation ----------------------------------------
#
# Admin-facing long-form Guide article drafting. This is intentionally separate
# from the public Machi AI chat: it returns a structured article draft that an
# admin reviews before publishing. The prompt optimizes for practical,
# source-aware, user-first articles rather than generic SEO filler.

_GUIDE_ARTICLE_SOURCE_CATALOG: dict[str, list[dict[str, str]]] = {
    "study_japan": [
        {"label": "JASSO Study in Japan", "url": "https://www.studyinjapan.go.jp/"},
        {"label": "文部科学省", "url": "https://www.mext.go.jp/"},
        {"label": "各大学・研究科官方募集要项", "url": "https://www.studyinjapan.go.jp/en/search-school/"},
    ],
    "study_abroad_japan": [
        {"label": "出入国在留管理庁", "url": "https://www.moj.go.jp/isa/"},
        {"label": "外務省签证信息", "url": "https://www.mofa.go.jp/j_info/visit/visa/"},
        {"label": "JASSO Study in Japan", "url": "https://www.studyinjapan.go.jp/"},
    ],
    "career_japan": [
        {"label": "厚生労働省 労働条件ポータル", "url": "https://www.check-roudou.mhlw.go.jp/"},
        {"label": "ハローワークインターネットサービス", "url": "https://www.hellowork.mhlw.go.jp/"},
        {"label": "出入国在留管理庁", "url": "https://www.moj.go.jp/isa/"},
    ],
    "jlpt": [
        {"label": "JLPT 官方网站", "url": "https://www.jlpt.jp/"},
        {"label": "Japan Foundation", "url": "https://www.jpf.go.jp/"},
    ],
    "life_japan": [
        {"label": "出入国在留管理庁", "url": "https://www.moj.go.jp/isa/"},
        {"label": "日本年金機構", "url": "https://www.nenkin.go.jp/"},
        {"label": "国税庁", "url": "https://www.nta.go.jp/"},
        {"label": "厚生労働省", "url": "https://www.mhlw.go.jp/"},
        {"label": "国土交通省", "url": "https://www.mlit.go.jp/"},
    ],
    "guide_services": [
        {"label": "Machi Guide 编辑部", "url": "https://machicity.com/guide"},
    ],
}

_GUIDE_ARTICLE_REQUIRED_SECTIONS: tuple[str, ...] = (
    "适合谁",
    "先看结论",
    "时间线",
    "准备材料",
    "具体步骤",
    "费用",
    "常见坑",
    "分情况",
    "官方确认",
    "行动清单",
)

_GUIDE_ARTICLE_BAD_PHRASES: tuple[str, ...] = (
    "作为ai",
    "作为 ai",
    "我是ai",
    "我是 ai",
    "全方位",
    "一站式",
    "高效便捷",
    "赋能",
    "综上所述",
    "总而言之",
    "本文将带你",
    "干货满满",
)


def _guide_article_sources(category_key: str, source_hint: str = "") -> list[dict[str, str]]:
    sources = list(_GUIDE_ARTICLE_SOURCE_CATALOG.get(category_key) or [])
    if source_hint.strip():
        sources.insert(0, {"label": "后台补充来源", "url": source_hint.strip()[:500]})
    if not sources:
        sources = [{"label": "Machi Guide 编辑部", "url": "https://machicity.com/guide"}]
    # De-dupe by URL while preserving order.
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for item in sources:
        url = (item.get("url") or "").strip()
        if url in seen:
            continue
        seen.add(url)
        out.append({"label": (item.get("label") or "参考来源").strip(), "url": url})
    return out[:5]


def _guide_article_slug(title: str) -> str:
    text = (title or "").strip().lower()
    # Keep ASCII words when present; CJK-only titles fall back to a stable-ish
    # opaque slug that the server may replace with its own slugifier.
    parts = [p for p in "".join(ch if ch.isalnum() else "-" for ch in text).split("-") if p and p.isascii()]
    return "-".join(parts[:10]) or f"guide-{secrets.token_hex(4)}"


def _guide_article_quality_warnings(article: dict[str, Any]) -> list[str]:
    title = str(article.get("title") or "").strip()
    summary = str(article.get("summary") or "").strip()
    body = str(article.get("body") or "").strip()
    warnings: list[str] = []
    if len(title) < 8:
        warnings.append("标题过短")
    if len(summary) < 45:
        warnings.append("摘要过短")
    if len(body) < 1800:
        warnings.append("正文少于 1800 字符，不够详细")
    low = body.lower()
    missing = [s for s in _GUIDE_ARTICLE_REQUIRED_SECTIONS if s not in body]
    if len(missing) >= 4:
        warnings.append("缺少关键栏目：" + "、".join(missing[:5]))
    if not any(mark in body for mark in ("清单", "材料", "准备")):
        warnings.append("缺少可执行清单")
    if not any(mark in body for mark in ("风险", "避坑", "注意")):
        warnings.append("缺少风险/避坑提醒")
    if not any(mark in body for mark in ("官方", "官网", "役所", "入管", "税务署", "年金", "募集要项", "人事")):
        warnings.append("缺少官方确认点")
    for phrase in _GUIDE_ARTICLE_BAD_PHRASES:
        if phrase in low:
            warnings.append(f"出现 AI/营销腔：{phrase}")
            break
    return warnings


def generate_guide_article_draft(
    *,
    topic: str,
    category_key: str,
    sub_category_key: str = "",
    audience: str = "",
    language: str = "zh-CN",
    country: str = "jp",
    source_hint: str = "",
    context_lines: list[str] | None = None,
    provider: str = "auto",
    model: str | None = None,
) -> dict[str, Any] | None:
    """Return a long, structured Guide article draft, or None on failure.

    The output is intended for admin review, not automatic publishing. The
    generated article must be practical: steps, checklists, risk checks, source
    reminders, and next actions. No fake user stories, no fabricated policies.
    """
    chosen = _resolve_provider(provider)
    if not chosen:
        return None
    topic = (topic or "").strip()
    if len(topic) < 4:
        return None
    lang = machi_lang = ("ja" if str(language).lower().startswith("ja") else ("en" if str(language).lower().startswith("en") else "zh"))
    if machi_lang != "zh":
        # The current Guide editorial workflow is Chinese-first; localized
        # payloads are handled elsewhere in server.py.
        lang = "zh"
    model_id = _resolve_model(model)
    sources = _guide_article_sources(category_key, source_hint)
    source_lines = "\n".join(f"- {s['label']}: {s['url']}" for s in sources)
    context = "\n".join(f"- {line[:220]}" for line in (context_lines or []) if str(line).strip())[:1800]
    audience_text = audience.strip() or "准备赴日、刚到日本、正在升学/就职/生活手续中遇到具体问题的用户"
    system = (
        "你是 Machi Guide 编辑部的资深中文编辑，负责写给在日华人、留学生、赴日准备者看的长篇实用指南。\n"
        "写作目标：让用户读完就知道下一步怎么做、准备什么、去哪确认、哪些坑要避开。\n"
        "绝对不要写得像 AI、不要空话、不要营销腔、不要虚构政策/截止日期/金额/通过率/个人经历。\n"
        "涉及签证、税务、劳动、医疗、学校录取、公司招聘等内容时，只能给一般准备方向，并提醒以官方或当事机构最新说明为准。\n"
        "只输出 JSON，不要代码块，不要解释。"
    )
    user = (
        f"请生成一篇 Machi Guide 长文草稿。\n"
        f"主题：{topic}\n"
        f"主分类：{category_key}\n"
        f"子分类：{sub_category_key or '未指定'}\n"
        f"目标读者：{audience_text}\n"
        f"国家：{country}\n\n"
        "可参考的 Machi 内部资料摘要（只能作为线索，不要编造摘要之外的事实）：\n"
        f"{context or '- 暂无内部资料摘要'}\n\n"
        "可用官方/可信来源候选（文章必须选择其中一个作为 sourceLabel/sourceUrl；正文里也要提醒用户最终确认官方最新信息）：\n"
        f"{source_lines}\n\n"
        "正文要求：\n"
        "- 简体中文，2200-3600 字符，手机阅读友好，但必须足够细。\n"
        "- 语气像真实编辑在帮用户解决问题，直接、具体、有取舍，不要官样文章。\n"
        "- 必须包含这些小标题，且每节要有实质内容：适合谁 / 先看结论 / 时间线 / 准备材料 / 具体步骤 / 费用与预算 / 常见坑 / 分情况处理 / 官方确认点 / 下一步行动清单。\n"
        "- 要写具体可执行信息：材料名称、窗口/机构、询问方式、判断标准、表格化清单、邮件/电话提问模板都可以。\n"
        "- 费用和时间可以写区间或判断方法；不确定就写“以官方/合同/募集要项/人事回复为准”，不要装作知道实时金额。\n"
        "- 不要使用：高效便捷、全方位、一站式、赋能、干货满满、本文将带你、综上所述、作为AI。\n\n"
        "输出严格 JSON：\n"
        "{\n"
        '  "title": "文章标题",\n'
        '  "slug": "ascii-slug-suggestion",\n'
        '  "summary": "90-150字摘要，说明解决什么真实问题",\n'
        '  "body": "完整正文，使用 Markdown 小标题和列表",\n'
        '  "seoTitle": "搜索标题",\n'
        '  "seoDescription": "120-180字搜索描述",\n'
        '  "tags": ["标签1", "标签2", "标签3"],\n'
        '  "sourceLabel": "从候选来源中选择",\n'
        '  "sourceUrl": "从候选来源中选择的URL",\n'
        '  "staleAfterDays": 90或180,\n'
        '  "qualityNotes": ["说明你如何保证这篇文章有用"]\n'
        "}"
    )
    try:
        raw = _call_deepseek(system, user, model_id, 6500) if chosen == "deepseek" else _call_claude(system, user, 6500)
        parsed = _extract_json(raw)
    except Exception:
        return None
    article = parsed.get("article") if isinstance(parsed, dict) and isinstance(parsed.get("article"), dict) else parsed
    if not isinstance(article, dict):
        return None
    title = str(article.get("title") or topic).strip()[:200]
    body = str(article.get("body") or "").strip()
    source_url = str(article.get("sourceUrl") or article.get("source_url") or "").strip()
    source_label = str(article.get("sourceLabel") or article.get("source_label") or "").strip()
    exact_source = next((s for s in sources if s["url"] == source_url), None)
    if not exact_source and source_label:
        label_low = source_label.lower()
        exact_source = next((s for s in sources if s["label"].lower() in label_low or label_low in s["label"].lower()), None)
    if not exact_source:
        # Do not let the model invent a precise official sub-URL. Use one of
        # the curated official entry points (or the admin-provided sourceHint).
        exact_source = sources[0]
    source_url = exact_source["url"]
    source_label = exact_source["label"]
    try:
        stale_after_days = int(article.get("staleAfterDays") or 180)
    except (TypeError, ValueError):
        stale_after_days = 180
    out = {
        "title": title,
        "slug": str(article.get("slug") or _guide_article_slug(title)).strip()[:120],
        "summary": str(article.get("summary") or "").strip()[:600],
        "body": body,
        "seoTitle": str(article.get("seoTitle") or article.get("seo_title") or title).strip()[:220],
        "seoDescription": str(article.get("seoDescription") or article.get("seo_description") or article.get("summary") or "").strip()[:320],
        "tags": [str(t).strip() for t in (article.get("tags") or []) if str(t).strip()][:8],
        "sourceLabel": source_label[:120],
        "sourceUrl": source_url[:500],
        "staleAfterDays": max(30, min(stale_after_days, 365)),
        "qualityNotes": [str(t).strip() for t in (article.get("qualityNotes") or []) if str(t).strip()][:6],
        "qualityWarnings": [],
        "engine": _PROVIDER_TO_ENGINE.get(chosen, chosen),
        "model": _MODEL_TO_MODE.get(model_id, "") if chosen == "deepseek" else "",
    }
    if not out["tags"]:
        out["tags"] = [topic[:18], category_key]
    out["qualityWarnings"] = _guide_article_quality_warnings(out)
    return out


# --- Machi AI (internal chat backend) ---------------------------------------
#
# Powers the in-app "Machi AI" assistant. This is a *general chat* completion
# (free-form natural-language answers), distinct from the JSON-mode seed
# generation above. The provider is an internal server-side detail: the caller
# (server.py) never surfaces the provider name, model id, raw upstream error,
# or any ``reasoning_content`` to clients. We keep this stdlib-only (urllib)
# like the rest of the module and never log the key, the user text, or the
# upstream response body.

MACHI_AI_CHAT_MODEL = _env("MACHI_AI_MODEL", "deepseek-v4-flash")
MACHI_AI_CHAT_MAX_TOKENS = int(_env("MACHI_AI_MAX_TOKENS", "1600"))


def _deepseek_chat_once(payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{DEEPSEEK_BASE_URL}/chat/completions", data=body, method="POST"
    )
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {DEEPSEEK_API_KEY}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", "replace")
    return json.loads(raw)


def machi_ai_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    thinking: bool = False,
    max_tokens: int = 1600,
    timeout: float | None = None,
) -> dict[str, Any] | None:
    """Run one stateless chat completion for Machi AI.

    ``messages`` is the full OpenAI-style turn list the *server* assembles
    (system + optional Guide context + recent history + latest user turn).

    Returns a normalized dict::

        {content, finish_reason, model, usage:{prompt_tokens,
         completion_tokens, total_tokens}, latency_ms}

    or ``None`` on **any** problem (no key configured, network/HTTP error,
    empty/malformed output) so the caller can answer with a friendly
    "temporarily unavailable" instead of leaking a provider error. Never
    raises out of the happy path; never returns ``reasoning_content``.

    ``thinking`` toggles the upstream deep-reasoning mode for clearly complex
    questions: enabled ⇒ ``reasoning_effort: "high"`` and no temperature;
    disabled (default) ⇒ a low temperature for fast, stable everyday answers.
    """
    if not DEEPSEEK_API_KEY:
        return None
    if not isinstance(messages, list) or not messages:
        return None
    model = (model or MACHI_AI_CHAT_MODEL).strip() or MACHI_AI_CHAT_MODEL
    req_timeout = float(timeout or SEED_LLM_TIMEOUT)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": int(max_tokens or MACHI_AI_CHAT_MAX_TOKENS),
        # New thinking control (deepseek-v4-*). Disabled by default for speed
        # and cost on everyday questions.
        "thinking": {"type": "enabled" if thinking else "disabled"},
    }
    if thinking:
        # Thinking mode forbids temperature/top_p; ask for deeper reasoning.
        payload["reasoning_effort"] = "high"
    else:
        payload["temperature"] = 0.4

    start = time.monotonic()
    data: dict[str, Any] | None = None
    # Two independent one-shot retries:
    #  - transient backoff on 429/5xx/network (unchanged behaviour), and
    #  - a model-fallback: if the upstream rejects the requested model (e.g. a
    #    Pro id gets renamed/retired) with a 400, retry once on the verified base
    #    model so members degrade to a working answer instead of a hard failure.
    # Each budget is spent at most once; the loop can therefore run 2 attempts.
    transient_retry_left = 1
    model_retry_left = 1
    while True:
        try:
            data = _deepseek_chat_once(payload, req_timeout)
            break
        except urllib.error.HTTPError as exc:
            # Read the body once so we can inspect a 400 for a model complaint.
            # We never log it (no provider error leakage) and only sniff for the
            # narrow "invalid model" signal.
            err_body = ""
            try:
                err_body = (exc.read() or b"").decode("utf-8", "replace").lower()
            except Exception:
                err_body = ""
            # Invalid-model 400 → retry once on the base model, only when we
            # weren't already on it.
            if (
                exc.code == 400
                and model_retry_left > 0
                and payload["model"] != MACHI_AI_CHAT_MODEL
                and "model" in err_body
                and "invalid" in err_body
            ):
                model_retry_left = 0
                payload["model"] = MACHI_AI_CHAT_MODEL
                continue
            if transient_retry_left > 0 and exc.code in (429, 500, 502, 503):
                transient_retry_left = 0
                time.sleep(0.6)
                continue
            return None
        except Exception:
            if transient_retry_left > 0:
                transient_retry_left = 0
                time.sleep(0.4)
                continue
            return None

    if not isinstance(data, dict):
        return None
    try:
        choice = (data.get("choices") or [])[0]
        msg = choice.get("message") or {}
        content = str(msg.get("content") or "").strip()
        finish = str(choice.get("finish_reason") or "")
    except Exception:
        return None
    if not content:
        return None
    usage = data.get("usage") or {}
    return {
        "content": content,
        "finish_reason": finish,
        # The resolved model id is for internal diagnostics only — the server
        # stores it in model_internal and never returns it to clients.
        "model": str(data.get("model") or model),
        "usage": {
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
            "total_tokens": int(usage.get("total_tokens") or 0),
        },
        "latency_ms": int((time.monotonic() - start) * 1000),
    }
