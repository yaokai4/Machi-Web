#!/usr/bin/env python3
"""Upsert Machi Japan Local News Desk source presets.

Run from web/app with:
    npm run seed:japan-news-sources
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("KAIX_DB_PATH", str(ROOT / "kaix.db"))

import server  # noqa: E402


def main() -> int:
    with server.DB_LOCK, server.db() as conn:
        conn.executescript(server.SCHEMA)
        server.run_migrations(conn)
        result = server.ensure_news_source_presets(conn)
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND country = ?",
            ("jp",),
        ).fetchone()["c"]
        active = conn.execute(
            "SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND country = ? AND is_active = 1",
            ("jp",),
        ).fetchone()["c"]
    print(
        "Japan news sources upserted: "
        f"created={result['created']} updated={result['updated']} "
        f"active={int(active)} total={int(total)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
