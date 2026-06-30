"""Tiny pure-utility helpers extracted from server.py.

Foundational, standard-library only, no dependency on server.py — so any
server_* module can import these without a circular import. server.py re-exports
them so `server.now_iso` / `server.parse_iso` keep working unchanged.
"""
from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
