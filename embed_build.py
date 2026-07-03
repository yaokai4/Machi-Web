#!/usr/bin/env python3
"""Offline builder for the semantic-RAG index (BE5).

Collects the public Guide corpus (articles / schools / companies / products /
FAQ), computes an embedding per row, and upserts it into ``guide_embeddings``.
The build is *incremental*: a per-row ``content_hash`` over the exact source
text is compared to the stored hash, so only changed/new rows are re-embedded.
``--force`` re-embeds everything (use after a model swap). Orphan rows (source
deleted or no longer visible) are pruned.

Without an embedding key configured this exits immediately as a no-op — it never
writes partial/garbage vectors. That keeps the retrieval layer on pure LIKE.

Design notes:
- ``embed_text`` for each entity is the concatenation of the SAME columns the
  LIKE retrieval searches, so the semantic index and the lexical index cover the
  same surface (a superset would over-index; a subset would under-cover).
- The visibility WHERE for each entity mirrors ``guide_ai_retrieve_context`` so
  we only ever embed publicly retrievable content. The query path re-applies the
  same filter at fetch time (defense in depth against a stale index leaking a
  since-unpublished row).

Run (manual):  cd web && python3 embed_build.py            # incremental
               cd web && python3 embed_build.py --force    # full rebuild
"""
from __future__ import annotations

import hashlib
import json
import sys
from typing import Any, Callable

import embeddings
import server


# --- corpus specification ----------------------------------------------------
#
# Each spec: (entity_type, SELECT sql, embed_text(row) -> str). The SELECT must
# expose `id`, `country`, and every column the embed_text builder reads. The
# WHERE clause mirrors the LIKE-retrieval visibility filter so we never embed
# content the retrieval layer would not surface.

def _clip(value: Any, n: int) -> str:
    return " ".join(str(value or "").split())[:n]


def _join(*parts: Any) -> str:
    return " ".join(_clip(p, 200) for p in parts if p and str(p).strip())


_SPECS: list[tuple[str, str, Callable[[dict[str, Any]], str]]] = [
    (
        "guide_article",
        # Aligns with the articles LIKE branch: title / summary / tags.
        "SELECT id, country, title, summary, tags FROM guide_articles "
        "WHERE status = 'published'",
        lambda r: _join(r.get("title"), r.get("summary"), r.get("tags")),
    ),
    (
        "guide_school",
        # Aligns with the schools LIKE branch columns.
        "SELECT id, country, school_name, school_name_jp, school_name_en, "
        "prefecture, city, fields_of_study, departments, tags "
        "FROM guide_schools WHERE status = 'published'",
        lambda r: _join(
            r.get("school_name"), r.get("school_name_jp"), r.get("school_name_en"),
            r.get("prefecture"), r.get("city"), r.get("fields_of_study"),
            r.get("departments"), r.get("tags"),
        ),
    ),
    (
        "guide_company",
        # Aligns with the companies LIKE branch, including the data-quality gate.
        "SELECT id, country, company_name, company_name_jp, company_name_en, "
        "industry, sub_industry, city, description, tags "
        "FROM guide_companies WHERE status = 'published' AND data_quality_score >= 15",
        lambda r: _join(
            r.get("company_name"), r.get("company_name_jp"), r.get("company_name_en"),
            r.get("industry"), r.get("sub_industry"), r.get("city"),
            r.get("description"), r.get("tags"),
        ),
    ),
    (
        "guide_product",
        # Aligns with the products LIKE branch (published + coming_soon).
        "SELECT id, country, title, subtitle, description, tags FROM guide_products "
        "WHERE status IN ('published','coming_soon')",
        lambda r: _join(r.get("title"), r.get("subtitle"), r.get("description"), r.get("tags")),
    ),
    (
        "guide_faq",
        # Aligns with the FAQ LIKE branch: question / answer.
        "SELECT id, country, question, answer FROM guide_faq WHERE status = 'published'",
        lambda r: _join(r.get("question"), r.get("answer")),
    ),
]


def _content_hash(model: str, dim: int, embed_text: str) -> str:
    """Stable hash over the exact embedded surface + model identity.

    Changing the source text OR the model/dim changes the hash → that row is
    re-embedded. Anything else is skipped as unchanged.
    """
    h = hashlib.sha256()
    h.update(model.encode("utf-8"))
    h.update(b"\x00")
    h.update(str(dim).encode("utf-8"))
    h.update(b"\x00")
    h.update(embed_text.encode("utf-8"))
    return h.hexdigest()


def _collect(conn: server.sqlite3.Connection) -> list[dict[str, Any]]:
    """Gather (entity_type, entity_id, country, embed_text) for the whole corpus."""
    rows: list[dict[str, Any]] = []
    for entity_type, sql, builder in _SPECS:
        try:
            fetched = conn.execute(sql).fetchall()
        except Exception:
            # A missing column / table (partial DB) skips that type rather than
            # aborting the whole build.
            server.ERR_LOG.exception("embed_build: collect failed for %s", entity_type)
            continue
        for raw in fetched:
            try:
                r = dict(raw)
            except Exception:
                continue
            text = builder(r).strip()
            if not text:
                continue
            rows.append({
                "entity_type": entity_type,
                "entity_id": str(r.get("id")),
                "country": (str(r.get("country") or "jp").strip().lower() or "jp"),
                "embed_text": text,
            })
    return rows


def build(*, force: bool = False) -> dict[str, int]:
    """One incremental build pass. Returns a counts summary.

    No-ops (and reports ``skipped_no_key``) when no embedding provider/key is
    configured — never writes partial data.
    """
    stats = {"total": 0, "recomputed": 0, "unchanged": 0, "pruned": 0,
             "embedded": 0, "skipped_no_key": 0}

    if not embeddings.embeddings_available():
        stats["skipped_no_key"] = 1
        return stats

    model = embeddings.embedding_model_id()
    dim = embeddings.embedding_dim()
    now = server.now_iso()

    with server.DB_LOCK:
        conn = server.db()
        try:
            corpus = _collect(conn)
            stats["total"] = len(corpus)

            existing: dict[tuple[str, str], dict[str, Any]] = {}
            for raw in conn.execute(
                "SELECT entity_type, entity_id, content_hash, model, dim FROM guide_embeddings"
            ).fetchall():
                r = dict(raw)
                existing[(r["entity_type"], r["entity_id"])] = r

            live_keys: set[tuple[str, str]] = set()
            to_embed: list[dict[str, Any]] = []
            for item in corpus:
                key = (item["entity_type"], item["entity_id"])
                live_keys.add(key)
                item["content_hash"] = _content_hash(model, dim, item["embed_text"])
                prev = existing.get(key)
                if (not force and prev is not None
                        and prev.get("content_hash") == item["content_hash"]
                        and prev.get("model") == model
                        and int(prev.get("dim") or 0) == dim):
                    stats["unchanged"] += 1
                    continue
                to_embed.append(item)

            # Embed the changed rows (batched inside embed_texts). A None here
            # means the provider failed mid-build → abort WITHOUT touching the
            # table so the index stays consistent (all-or-nothing on this pass).
            if to_embed:
                vectors = embeddings.embed_texts([it["embed_text"] for it in to_embed])
                if vectors is None or len(vectors) != len(to_embed):
                    server.ERR_LOG.warning("embed_build: embedding provider unavailable mid-build; aborting pass")
                    return stats
                for it, vec in zip(to_embed, vectors):
                    conn.execute(
                        "INSERT INTO guide_embeddings "
                        "(entity_type, entity_id, country, content_hash, model, dim, vector, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                        "ON CONFLICT(entity_type, entity_id) DO UPDATE SET "
                        "country = excluded.country, content_hash = excluded.content_hash, "
                        "model = excluded.model, dim = excluded.dim, vector = excluded.vector, "
                        "updated_at = excluded.updated_at",
                        (it["entity_type"], it["entity_id"], it["country"],
                         it["content_hash"], model, dim, json.dumps(vec), now),
                    )
                    stats["recomputed"] += 1
                    stats["embedded"] += 1

            # Prune orphans: rows whose source is gone or no longer visible.
            for key in list(existing.keys()):
                if key not in live_keys:
                    conn.execute(
                        "DELETE FROM guide_embeddings WHERE entity_type = ? AND entity_id = ?",
                        (key[0], key[1]),
                    )
                    stats["pruned"] += 1
        finally:
            conn.close()

    return stats


def main(argv: list[str]) -> int:
    force = "--force" in argv
    server.init_db()
    stats = build(force=force)
    if stats.get("skipped_no_key"):
        print("embed_build: no embedding key configured — semantic index left empty (pure LIKE)")
        return 0
    print(
        "embed_build: total=%(total)d recomputed=%(recomputed)d unchanged=%(unchanged)d "
        "pruned=%(pruned)d embedded=%(embedded)d" % stats
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
