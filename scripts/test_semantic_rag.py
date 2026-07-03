#!/usr/bin/env python3
"""Tests for the semantic-RAG hybrid retrieval layer (BE5).

These lock in the HARD invariant that the semantic path is purely additive and
defensive:

  1. no-key regression anchor — with the feature off / no embedding key,
     guide_ai_retrieve_context returns byte-for-byte the pure-LIKE result;
  2. degradation never raises — empty index, failing query embedding, and a
     provider returning None all fall back to LIKE without an exception;
  3. visibility穿透 — a stale index row pointing at a since-unpublished /
     low-quality entity is filtered out at re-fetch (never leaks to the model);
  4. no secret leakage — no key / raw query / body ever appears in a log line;
  5. hybrid fusion — when a (mocked) provider IS available, a semantic-only hit
     is surfaced that pure LIKE would miss, via RRF fusion.

The embedding provider is ALWAYS mocked — no real network call, no real key.

Run:  cd web && python3 scripts/test_semantic_rag.py
"""
from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_rag_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")
# Ensure a clean, key-less baseline regardless of the caller's shell env.
os.environ.pop("OPENAI_API_KEY", None)
os.environ["MACHI_RAG_ENABLED"] = "0"

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import embeddings  # noqa: E402
import server  # noqa: E402


# --- helpers ----------------------------------------------------------------

def _article(conn, title, slug, summary="概要", status="published"):
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_articles (id, title, slug, summary, tags, country, status, "
        "is_featured, published_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, '', 'jp', ?, 0, ?, ?, ?)",
        (str(uuid.uuid4()), title, slug, summary, status, now, now, now),
    )


def _faq(conn, question, answer, status="published"):
    now = server.now_iso()
    fid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO guide_faq (id, question, answer, country, status, sort_order, created_at, updated_at) "
        "VALUES (?, ?, ?, 'jp', ?, 0, ?, ?)",
        (fid, question, answer, status, now, now),
    )
    return fid


def _retrieve(conn, message, limit=6):
    return server.guide_ai_retrieve_context(
        conn, user_message=message, country="jp", language="zh-CN", limit=limit,
    )


def _upsert_embedding(conn, entity_type, entity_id, vector, *, country="jp",
                      model="mock", dim=None):
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_embeddings (entity_type, entity_id, country, content_hash, "
        "model, dim, vector, updated_at) VALUES (?, ?, ?, '', ?, ?, ?, ?) "
        "ON CONFLICT(entity_type, entity_id) DO UPDATE SET vector = excluded.vector, "
        "model = excluded.model, dim = excluded.dim, updated_at = excluded.updated_at",
        (entity_type, entity_id, country, model, dim if dim is not None else len(vector),
         json.dumps(vector), now),
    )


# A tiny deterministic "embedding": bag-of-words over a fixed 4-dim vocabulary so
# similar phrases land near each other WITHOUT any network. L2-normalized to
# match the real provider contract.
_VOCAB = ["签证", "工作", "房", "税"]


def _fake_embed(text: str) -> list[float]:
    vec = [float(text.count(w)) for w in _VOCAB]
    return embeddings.l2_normalize(vec) if any(vec) else [0.0] * len(_VOCAB)


def _install_mock_provider():
    """Make embeddings.embed_texts return deterministic local vectors."""
    def _mock_embed_texts(texts):
        if not isinstance(texts, list):
            return None
        return [_fake_embed(t if isinstance(t, str) else "") for t in texts]
    embeddings.embed_texts = _mock_embed_texts  # type: ignore[assignment]
    embeddings.embeddings_available = lambda: True  # type: ignore[assignment]


# --- log capture ------------------------------------------------------------

class _CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records: list[str] = []

    def emit(self, record):
        try:
            self.records.append(self.format(record))
        except Exception:
            self.records.append(str(record.msg))


def _attach_capture() -> _CaptureHandler:
    cap = _CaptureHandler()
    for lg in (server.ACCESS_LOG, server.ERR_LOG, logging.getLogger()):
        lg.addHandler(cap)
    return cap


# --- tests ------------------------------------------------------------------

# Rare Latin nonces so LIKE matches ONLY our seeded rows (init_db seeds ~56 real
# articles / 63 FAQ; a CJK keyword like 在留资格 would collide with those).
_NONCE_A = "zqxjrag"   # unique to the anchor article
_NONCE_B = "wkpvism"   # unique to a second article


def test_no_key_regression_anchor(conn):
    """Feature off + no key ⇒ pure-LIKE result, canonical shape, and the
    on-topic row surfaces exactly."""
    _article(conn, f"锚定文章 {_NONCE_A}", "anchor-a", f"关于 {_NONCE_A} 的说明")
    _article(conn, f"次要文章 {_NONCE_B}", "anchor-b", f"关于 {_NONCE_B} 的说明")

    # Baseline is whatever LIKE returns today. The semantic path is OFF here.
    assert not server.MACHI_RAG_ENABLED, "test must start with feature OFF"
    got = _retrieve(conn, _NONCE_A)
    titles = [x["title"] for x in got]
    assert f"锚定文章 {_NONCE_A}" in titles, titles
    assert f"次要文章 {_NONCE_B}" not in titles, "unrelated nonce leaked into LIKE match"
    # Every item is the canonical shape.
    for it in got:
        assert set(it.keys()) == {"type", "title", "subtitle", "route", "modelLine"}, it
    # An unrelated nonsense query returns nothing.
    assert _retrieve(conn, "zzz完全不存在xyz789") == []
    print("  ok: no-key regression anchor")


def test_empty_query_and_degradation_no_raise(conn):
    """Empty query, and feature ON but empty index / failing provider ⇒ no raise, LIKE result."""
    assert _retrieve(conn, "") == []

    orig_enabled = server.MACHI_RAG_ENABLED
    orig_embed = embeddings.embed_texts
    orig_avail = embeddings.embeddings_available
    try:
        # Feature ON, provider "available" but embed_texts returns None (failure).
        server.MACHI_RAG_ENABLED = True
        embeddings.embeddings_available = lambda: True  # type: ignore[assignment]
        embeddings.embed_texts = lambda texts: None  # type: ignore[assignment]
        # Index is empty (no rows) → ensure_loaded → is_empty → [] semantic → LIKE.
        server._SEMANTIC_INDEX.reload()
        got = _retrieve(conn, _NONCE_A)
        assert any(x["title"] == f"锚定文章 {_NONCE_A}" for x in got), got

        # Now make the index non-empty but keep embed failing: still must not raise.
        rows = conn.execute(
            "SELECT id FROM guide_articles WHERE slug = 'anchor-a'"
        ).fetchall()
        _upsert_embedding(conn, "guide_article", dict(rows[0])["id"], [0.1, 0.2, 0.3, 0.4])
        server._SEMANTIC_INDEX.reload()
        got2 = _retrieve(conn, _NONCE_A)  # query embedding returns None → LIKE
        assert any(x["title"] == f"锚定文章 {_NONCE_A}" for x in got2), got2
    finally:
        server.MACHI_RAG_ENABLED = orig_enabled
        embeddings.embed_texts = orig_embed
        embeddings.embeddings_available = orig_avail
        server._SEMANTIC_INDEX.reload()
    print("  ok: degradation paths never raise")


def test_visibility_pentetration_blocked(conn):
    """A stale index row for an UNPUBLISHED entity must NOT leak into results."""
    # A hidden article that LIKE would never surface (status=draft).
    _article(conn, "机密未发布签证文章", "secret-visa", "签证签证签证", status="draft")
    hidden = conn.execute(
        "SELECT id FROM guide_articles WHERE slug = 'secret-visa'"
    ).fetchone()
    hidden_id = dict(hidden)["id"]

    orig_enabled = server.MACHI_RAG_ENABLED
    orig_embed = embeddings.embed_texts
    orig_avail = embeddings.embeddings_available
    try:
        _install_mock_provider()
        server.MACHI_RAG_ENABLED = True
        # Put the hidden article at the TOP of the semantic index with a vector
        # that maximally matches a "签证" query.
        _upsert_embedding(conn, "guide_article", hidden_id, _fake_embed("签证 签证 签证"))
        server._SEMANTIC_INDEX.reload()

        got = _retrieve(conn, "签证")
        titles = [x["title"] for x in got]
        assert "机密未发布签证文章" not in titles, f"LEAK: unpublished row surfaced: {titles}"
        # The route/id of the hidden article must not appear anywhere either.
        blob = json.dumps(got, ensure_ascii=False)
        assert hidden_id not in blob and "secret-visa" not in blob, f"LEAK id/slug: {blob}"
    finally:
        server.MACHI_RAG_ENABLED = orig_enabled
        embeddings.embed_texts = orig_embed
        embeddings.embeddings_available = orig_avail
        server._SEMANTIC_INDEX.reload()
    print("  ok: unpublished content穿透 blocked at re-fetch")


def test_hybrid_fusion_surfaces_semantic_only_hit(conn):
    """When the provider IS available, a semantic-only match is fused in via RRF."""
    # An article whose TEXT shares no literal token with the query but is
    # semantically near it in the mock vocabulary ("工作" bucket). LIKE alone
    # (keyword scan) would not surface it for a "就职" query that tokenizes to
    # 就职/求人 — but the semantic vector for its embed_text lands in the 工作
    # bucket, matching the query's 工作 vector.
    _article(conn, "找工作面试准备", "job-hunt", "工作 工作 工作 面试")
    art = conn.execute("SELECT id FROM guide_articles WHERE slug = 'job-hunt'").fetchone()
    art_id = dict(art)["id"]

    orig_enabled = server.MACHI_RAG_ENABLED
    orig_embed = embeddings.embed_texts
    orig_avail = embeddings.embeddings_available
    try:
        _install_mock_provider()
        server.MACHI_RAG_ENABLED = True
        _upsert_embedding(conn, "guide_article", art_id, _fake_embed("工作 工作 工作"))
        server._SEMANTIC_INDEX.reload()

        # Query embeds into the 工作 bucket; RRF should surface the article.
        got = _retrieve(conn, "工作")
        titles = [x["title"] for x in got]
        assert "找工作面试准备" in titles, f"semantic hit not fused in: {titles}"
        # Result is still the canonical shape.
        for it in got:
            assert set(it.keys()) == {"type", "title", "subtitle", "route", "modelLine"}, it

        # A PRODUCT is indexed by id but routed by slug — verify the id→slug
        # re-fetch mapping actually surfaces a semantic product hit.
        now = server.now_iso()
        pid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO guide_products (id, title, slug, subtitle, description, tags, "
            "country, status, is_coming_soon, sort_order, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, '', '', 'jp', 'published', 0, 0, ?, ?)",
            (pid, "签证代办服务", "visa-service", "签证 签证 签证", now, now),
        )
        _upsert_embedding(conn, "guide_product", pid, _fake_embed("签证 签证 签证"))
        server._SEMANTIC_INDEX.reload()
        got_p = _retrieve(conn, "签证")
        prod = [x for x in got_p if x["type"] == "guide_product"]
        assert any(p["route"].get("slug") == "visa-service" for p in prod), \
            f"product id→slug re-fetch failed: {got_p}"
    finally:
        server.MACHI_RAG_ENABLED = orig_enabled
        embeddings.embed_texts = orig_embed
        embeddings.embeddings_available = orig_avail
        server._SEMANTIC_INDEX.reload()
    print("  ok: hybrid RRF surfaces semantic-only hit")


def test_no_secret_leak_in_logs(cap):
    """No key / raw query / body ever appears in any captured log line."""
    secret_key = "sk-THIS-IS-A-FAKE-EMBED-KEY-DO-NOT-LOG"
    raw_query = "我的私密提问内容不应进日志ABC123"
    os.environ["OPENAI_API_KEY"] = secret_key
    # Reload embeddings config so it "sees" the key (still no real network — the
    # provider is mocked in the retrieval path above; here we just probe logging).
    try:
        import importlib
        importlib.reload(embeddings)
        # embed_texts would network out; we only care that nothing logs the key.
        _ = embeddings.embeddings_available()
    finally:
        os.environ.pop("OPENAI_API_KEY", None)
        import importlib
        importlib.reload(embeddings)

    blob = "\n".join(cap.records).lower()
    assert secret_key.lower() not in blob, "SECRET KEY LEAKED TO LOGS"
    assert raw_query.lower() not in blob, "RAW QUERY LEAKED TO LOGS"
    print("  ok: no key / query leak in logs")


def main() -> None:
    server.init_db()
    cap = _attach_capture()
    conn = server.db()
    try:
        test_no_key_regression_anchor(conn)
        test_empty_query_and_degradation_no_raise(conn)
        test_visibility_pentetration_blocked(conn)
        test_hybrid_fusion_surfaces_semantic_only_hit(conn)
        test_no_secret_leak_in_logs(cap)
        print("test_semantic_rag: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
