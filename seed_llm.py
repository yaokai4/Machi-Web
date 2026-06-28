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
import urllib.error
import urllib.request
from typing import Any

from concurrent.futures import ThreadPoolExecutor

import seed_content_library as seedlib


# --- configuration ----------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else default


# "auto" → try the first configured provider (deepseek, then claude), else None.
# "deepseek" / "claude" → force that provider. "offline"/"none" → always None.
DEFAULT_PROVIDER = _env("SEED_LLM_PROVIDER", "auto").lower()

DEEPSEEK_API_KEY = _env("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = _env("DEEPSEEK_MODEL", "deepseek-chat")

# Selectable DeepSeek generation modes (model id -> human label). All verified
# to work with JSON mode. "深度思考"/"Pro" think before answering (slower, higher
# quality); "标准" is the fast default.
DEEPSEEK_MODELS: dict[str, str] = {
    "deepseek-chat": "标准（快速）",
    "deepseek-reasoner": "深度思考",
    "deepseek-v4-pro": "Pro（更强）",
}


def _resolve_model(model: str | None) -> str:
    """Validate a requested model against the allowlist; fall back to default."""
    m = (model or "").strip()
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

# Engine ids surfaced to the admin UI / accepted from the request.
ENGINES = ("auto", "deepseek", "claude", "offline")


def configured_providers() -> list[str]:
    """Which real LLM providers have credentials, in preference order."""
    out: list[str] = []
    if DEEPSEEK_API_KEY:
        out.append("deepseek")
    if ANTHROPIC_API_KEY:
        out.append("claude")
    return out


def provider_status() -> dict[str, Any]:
    """Non-secret status for the admin panel (never returns keys)."""
    providers = configured_providers()
    return {
        "default": DEFAULT_PROVIDER,
        "configured": providers,
        "deepseek": bool(DEEPSEEK_API_KEY),
        "claude": bool(ANTHROPIC_API_KEY),
        "deepseek_model": DEEPSEEK_MODEL if DEEPSEEK_API_KEY else "",
        "claude_model": ANTHROPIC_MODEL if ANTHROPIC_API_KEY else "",
        "engines": list(ENGINES),
        # Selectable DeepSeek modes for the UI: [{id, label}], default first.
        "deepseek_models": [{"id": k, "label": v} for k, v in DEEPSEEK_MODELS.items()],
        "default_model": DEEPSEEK_MODEL,
        "ready": bool(providers),
    }


def _resolve_provider(requested: str) -> str | None:
    """Map a requested engine to a concrete, *configured* provider or None."""
    req = (requested or "auto").strip().lower()
    if req in ("offline", "none", ""):
        return None
    if req == "deepseek":
        return "deepseek" if DEEPSEEK_API_KEY else None
    if req == "claude":
        return "claude" if ANTHROPIC_API_KEY else None
    # auto
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


def _plan(content_type: str, count: int) -> dict[str, int]:
    if content_type in ("mixed", "all", ""):
        return seedlib.default_distribution(count)
    if content_type in seedlib.SUPPORTED_CONTENT_TYPES:
        return {content_type: count}
    return {}


def _build_prompt(*, region_code: str, language: str, tone: str, plan: dict[str, int]) -> tuple[str, str]:
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
        "5) 自然融入真实日本生活——在留卡/区役所/年金/确定申告/ゴミ分类/交通系IC卡/便利店/药妆/UR/礼金敷金/台风地震/樱花梅雨红叶等真实场景，自然带到、别堆砌。\n"
        "绝不：① 不要工整对仗、不要总结升华、不要面面俱到；② 不要广告腔/AI腔（高效便捷/全方位/优质服务/宝藏/一站式/作为AI 等）；"
        "③ 不要编造具体个人身份或已完成的交易、不要点名真实在营商家做评价；④ 不要话题标签#、不堆 emoji、不放链接。\n"
        "只输出 JSON，不要解释。"
    )

    spotlight_note = (
        "\n【spotlight = 精选攻略·干货长帖，这是重点，要写得又长又有用】：\n"
        "- 长度 350-700 字，围绕一个清晰主题真正讲透（不是泛泛而谈）。\n"
        "- 开头用一句真人化的引子（自己的经历/踩过的坑/被问烦了所以整理），别上来就「干货分享」。\n"
        "- 正文用「1️⃣ 2️⃣ 3️⃣」或短换行分点，每点给**具体可执行**的信息：具体地名/车站/店类型/价格(日元)/时间/步骤/注意事项，最好有数字。\n"
        "- 适当加个人取舍和真实细节（「我一般」「亲测」「踩过坑」「排了40分钟值」），可有一两句吐槽。\n"
        "- 结尾自然收（「有问题评论问我」「先码后看」之类），不要总结升华、不要客套。\n"
        "- 主题示例：在日第一个月必办清单 / 东京周末去哪玩 / 关西三日游路线 / 赏樱赏枫温泉地图 / 便利店&药妆必买 / 租房找工避坑 / 省钱技巧合集 / 看病就医流程。\n"
        "- 务必像小红书里真人写的高赞干货帖，绝不能像 AI 罗列或官方说明书。\n"
        if "spotlight" in plan else ""
    )
    user = (
        f"语言：{lang_name}。真实地名/车站（自然地用，别硬塞）：{place_hint}。\n\n"
        f"按「类型: 条数」产出，每条符合该类型的角度、彼此不重复：\n{plan_lines}\n"
        f"{spotlight_note}\n"
        '输出严格 JSON：{"items": [{"type": "<类型key>", "content": "<一条帖子正文>"}, ...]}\n'
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
                    max_tokens: int | None = None) -> list[Any]:
    """One provider call for a small sub-plan. Returns raw item dicts (or [])."""
    system, user = _build_prompt(region_code=region_code, language=lang, tone=tone, plan=sub_plan)
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
    raw_items: list[Any] = []
    if len(chunks) <= 1:
        raw_items = _generate_chunk(chosen, region_code, lang, tone, plan, model_id, chunk_tokens)
    else:
        try:
            with ThreadPoolExecutor(max_workers=min(SEED_LLM_MAX_WORKERS, len(chunks))) as ex:
                for res in ex.map(
                    lambda c: _generate_chunk(chosen, region_code, lang, tone, c, model_id, chunk_tokens), chunks
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
        out.append({
            "content": text,
            "title": "",
            "seed_content_type": ctype,
            "app_content_type": seedlib.APP_CONTENT_TYPE.get(ctype, "dynamic"),
            "author_type": seedlib._author_type_for_seed(
                content_type=ctype, tone=tone, country=country, city=city),
            "tags": tags,
            "tone": tone,
            "engine": chosen,
            "model": model_id if chosen == "deepseek" else "",
        })

    return out or None
