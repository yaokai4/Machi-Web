#!/usr/bin/env python3
"""Text-embedding abstraction for the semantic-RAG path (BE5).

This module is the *only* place that talks to an external embedding provider.
It is deliberately provider-neutral: the concrete backend is chosen by
``MACHI_EMBED_PROVIDER`` (default ``openai``) and the vendor name never leaves
this module — no client response, API payload, or log line ever names it. The
key lives only in an environment variable; it is never logged and never written
to disk.

Design contract (see design-semantic-rag.md):
- ``embed_texts(texts)`` returns a list of L2-normalized vectors (one per input)
  or ``None`` when embedding is unavailable (no key configured, network/HTTP
  error, malformed output). ``None`` is the *degradation signal*: every caller
  treats it as "fall back to pure LIKE", which is exactly today's behaviour.
- Vectors are L2-normalized here so a later cosine similarity degenerates to a
  plain dot product on the query side.
- stdlib-only (urllib), like seed_llm.py — no ``requests`` dependency.

It NEVER raises out of the happy path: any failure is caught and turned into
``None`` so the retrieval layer degrades silently instead of erroring into the
chat flow.
"""
from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from typing import Any


# --- configuration ----------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else default


# Provider token is neutral ("openai"/"none"); the real vendor mapping stays
# inside this module. "none" (or an unknown provider) disables embedding, which
# degrades the retrieval layer to pure LIKE — no error, no network call.
EMBED_PROVIDER = _env("MACHI_EMBED_PROVIDER", "openai").lower()

# OpenAI text-embedding-3-small: 1536 dims, multilingual (zh/ja/en), cheap. The
# base URL is overridable so a compatible proxy/gateway can be pointed at it
# without a code change; the model id is overridable for future upgrades.
OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_BASE_URL = _env("OPENAI_EMBED_BASE_URL", "https://api.openai.com").rstrip("/")
OPENAI_EMBED_MODEL = _env("MACHI_EMBED_MODEL", "text-embedding-3-small")

# Dimensionality of the active model. Kept in sync with the stored `dim` column
# so a model swap (different width) triggers a full rebuild rather than mixing
# incompatible vectors. text-embedding-3-small = 1536.
EMBED_DIM = int(_env("MACHI_EMBED_DIM", "1536"))

# Per-request transport timeout. The offline build tolerates a generous budget;
# the query path passes its own short timeout (see server.py) so a slow provider
# degrades to LIKE within ~1.5s rather than stalling the chat.
EMBED_TIMEOUT = float(_env("MACHI_EMBED_TIMEOUT", "30"))

# OpenAI's embeddings endpoint accepts a batch array; keep batches modest so a
# single failure re-tries cheaply and we stay well under request-size limits.
EMBED_MAX_BATCH = max(1, int(_env("MACHI_EMBED_MAX_BATCH", "128")))


# --- capability probe --------------------------------------------------------

def embedding_model_id() -> str:
    """The active model id (for the stored `model` column / rebuild-on-swap)."""
    return OPENAI_EMBED_MODEL


def embedding_dim() -> int:
    return EMBED_DIM


def embeddings_available() -> bool:
    """True iff a provider is configured and a key is present.

    A False result means the whole semantic path is a no-op and callers stay on
    pure LIKE. This is a cheap, network-free check used to short-circuit the
    background refresher and the build script.
    """
    if EMBED_PROVIDER in ("", "none", "off", "disabled"):
        return False
    if EMBED_PROVIDER == "openai":
        return bool(OPENAI_API_KEY)
    # Unknown provider ⇒ treat as unavailable (never guess at a transport).
    return False


# --- vector math -------------------------------------------------------------

def l2_normalize(vec: list[float]) -> list[float]:
    """Return the L2-normalized copy of ``vec`` (zero vector unchanged).

    Normalizing at store/query time lets cosine similarity reduce to a dot
    product downstream. A zero/degenerate vector is returned as-is (its norm is
    0), which the retrieval layer scores as 0 similarity — harmless.
    """
    norm = math.sqrt(sum(x * x for x in vec))
    if norm <= 0.0:
        return list(vec)
    return [x / norm for x in vec]


# --- provider transport ------------------------------------------------------

def _openai_embed_batch(texts: list[str]) -> list[list[float]] | None:
    """One HTTP call to OpenAI's embeddings endpoint for a batch of texts.

    Returns a list of raw (un-normalized) vectors aligned to ``texts`` order, or
    ``None`` on any error. The key is only ever sent in the Authorization header
    — never logged. The upstream response body is never logged either.
    """
    if not OPENAI_API_KEY:
        return None
    payload: dict[str, Any] = {"model": OPENAI_EMBED_MODEL, "input": texts}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OPENAI_BASE_URL}/v1/embeddings", data=body, method="POST"
    )
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {OPENAI_API_KEY}")
    try:
        with urllib.request.urlopen(req, timeout=EMBED_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
        data = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        # Network/HTTP/timeout/JSON error → degrade. Never surface or log the
        # upstream error body (may echo request content).
        return None
    except Exception:
        return None

    # The API returns items with an `index` field; sort by it to guarantee the
    # output order matches the input order regardless of server-side reordering.
    items = data.get("data") if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) != len(texts):
        return None
    ordered: list[list[float] | None] = [None] * len(texts)
    for item in items:
        if not isinstance(item, dict):
            return None
        idx = item.get("index")
        vec = item.get("embedding")
        if not isinstance(idx, int) or not (0 <= idx < len(texts)):
            return None
        if not isinstance(vec, list) or not vec:
            return None
        ordered[idx] = [float(x) for x in vec]
    if any(v is None for v in ordered):
        return None
    return ordered  # type: ignore[return-value]


# --- public API --------------------------------------------------------------

def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Embed a list of texts into L2-normalized vectors.

    Returns a list aligned to ``texts`` (one vector each) or ``None`` when
    embedding is unavailable/failed. ``None`` is the degradation signal the
    retrieval layer uses to stay on pure LIKE.

    Empty inputs are embedded as zero vectors (so batch alignment holds); the
    retrieval layer scores a zero vector as 0 similarity.
    """
    if not embeddings_available():
        return None
    if not isinstance(texts, list):
        return None
    if not texts:
        return []

    # Replace blank inputs with a single space so the provider always returns a
    # vector for every row; we still normalize (a real vector) below. Alignment
    # by count/index is preserved.
    prepared = [(t if isinstance(t, str) and t.strip() else " ") for t in texts]

    out: list[list[float]] = []
    for start in range(0, len(prepared), EMBED_MAX_BATCH):
        batch = prepared[start:start + EMBED_MAX_BATCH]
        if EMBED_PROVIDER == "openai":
            raw = _openai_embed_batch(batch)
        else:
            raw = None
        if raw is None:
            # Any batch failure aborts the whole call → degrade to LIKE. This
            # keeps the build atomic (no half-embedded corpus) and the query
            # path deterministic.
            return None
        for vec in raw:
            out.append(l2_normalize(vec))
    return out
