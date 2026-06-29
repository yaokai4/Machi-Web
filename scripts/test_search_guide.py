#!/usr/bin/env python3
"""Unified search now includes Guide content (articles + products).

Verifies GET /api/search?kind=guide (and kind=all) surfaces matching guide
articles and products by title, country-scoped, and that a no-match query
returns an empty guide group.

Run:  cd web && python3 scripts/test_search_guide.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_search_guide_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _article(conn, title, slug):
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_articles (id, title, slug, summary, country, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'jp', 'published', ?, ?)",
        (str(uuid.uuid4()), title, slug, "概要", now, now),
    )


def _product(conn, title, slug):
    now = server.now_iso()
    conn.execute(
        "INSERT INTO guide_products (id, title, slug, subtitle, country, status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'jp', 'published', ?, ?)",
        (str(uuid.uuid4()), title, slug, "副标题", now, now),
    )


def _search(conn, q, kind):
    h = server.Handler.__new__(server.Handler)
    cap: dict = {}
    h.send_json = lambda data, status=200: cap.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = lambda c: None  # guest  # type: ignore[method-assign]
    h.api_search(conn, {"q": q, "kind": kind})
    return cap["data"]


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        _article(conn, "永住申请全攻略", "eijuu-guide")
        _product(conn, "永住资料包", "eijuu-pack")
        _article(conn, "无关文章", "other-article")

        g = _search(conn, "永住", "guide")
        kinds = sorted(x["kind"] for x in g["guide"])
        titles = sorted(x["title"] for x in g["guide"])
        assert kinds == ["article", "product"], kinds
        assert "永住申请全攻略" in titles and "永住资料包" in titles, titles
        # other groups untouched / empty for a guide-only kind
        assert g["posts"] == [] and g["listings"] == [], "kind=guide should not search posts/listings"

        allk = _search(conn, "永住", "all")
        assert len(allk["guide"]) == 2, allk["guide"]
        assert "guide" in allk

        none = _search(conn, "zzz不存在xyz", "guide")
        assert none["guide"] == [], none["guide"]

        # empty query → empty guide group, no crash
        empty = _search(conn, "", "all")
        assert empty["guide"] == []

        print("test_search_guide: OK")
    finally:
        conn.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
