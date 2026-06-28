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

# Human labels for each seed content type, used to brief the model.
_TYPE_BRIEF: dict[str, str] = {
    "city_square": "城市日常吐槽/见闻（城市广场）",
    "qa": "本地新人提问",
    "guide": "新人实用攻略",
    "housing_tip": "租房经验/提醒",
    "secondhand": "出闲置/二手交易经验",
    "jobs_tip": "找工作/兼职经验",
    "food": "吃饭、约饭",
    "meetup": "找搭子、一起活动",
    "event": "线下活动信息",
    "local_service": "找本地服务的需求或提醒",
    "alert": "安全避坑提醒",
    "daily_life": "生活碎碎念",
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
        "你是面向在日华人/留学生的本地生活社区「Machi」的资深社区主编。"
        "你的任务是产出像真实居民发的、绝不像 AI 的社区帖语料。"
        "铁律（违反即作废）：① 第一人称含糊或社区口吻；② 绝不编造具体的个人身份、"
        "绝不编造已完成的交易、绝不写指名道姓的真实商家点评；③ 禁止一切广告腔/AI腔"
        "（如「高效便捷」「全方位」「优质服务」「宝藏平台」「一站式」「作为AI」等）；"
        "④ 句式和角度要多样，不要套同一个模板；⑤ 只输出 JSON，不要解释。"
    )

    user = (
        f"城市：{city_name}。语言：{lang_name}。语气基调：{tone}。\n"
        f"该城市真实区域/车站（多用真实地名增加在地感）：{place_hint}。\n\n"
        f"请按下面的「类型: 条数」产出语料：\n{plan_lines}\n\n"
        "输出严格 JSON，结构为：\n"
        '{"items": [{"type": "<上面的类型key>", "content": "<一条帖子正文>"}, ...]}\n'
        "要求：content 用上述语言书写；每条独立、自然、可直接展示；"
        "不带话题标签、不带表情堆砌、不带链接；总条数尽量等于各类型条数之和。"
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


def _call_deepseek(system: str, user: str, model: str | None = None) -> str:
    model = model or DEEPSEEK_MODEL
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": SEED_LLM_MAX_TOKENS,
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


def _call_claude(system: str, user: str) -> str:
    # Reserved interface: enabled the moment ANTHROPIC_API_KEY is set.
    data = _http_json(
        f"{ANTHROPIC_BASE_URL}/v1/messages",
        {
            "model": ANTHROPIC_MODEL,
            "max_tokens": SEED_LLM_MAX_TOKENS,
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
                    sub_plan: dict[str, int], model: str | None = None) -> list[Any]:
    """One provider call for a small sub-plan. Returns raw item dicts (or [])."""
    system, user = _build_prompt(region_code=region_code, language=lang, tone=tone, plan=sub_plan)
    try:
        raw = _call_deepseek(system, user, model) if chosen == "deepseek" else _call_claude(system, user)
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
    chunks = _split_plan(plan, SEED_LLM_CHUNK_ITEMS)
    raw_items: list[Any] = []
    if len(chunks) <= 1:
        raw_items = _generate_chunk(chosen, region_code, lang, tone, plan, model_id)
    else:
        try:
            with ThreadPoolExecutor(max_workers=min(SEED_LLM_MAX_WORKERS, len(chunks))) as ex:
                for res in ex.map(
                    lambda c: _generate_chunk(chosen, region_code, lang, tone, c, model_id), chunks
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
        if not (_MIN_LEN <= len(text) <= _MAX_LEN):
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
