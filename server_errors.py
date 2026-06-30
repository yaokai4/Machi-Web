"""Shared error types extracted from server.py.

Self-contained: depends only on the standard library so any server_* module can
`from server_errors import APIError` without risking a circular import back into
server.py. server.py re-exports APIError for backward compatibility, so existing
`from server import APIError` / `server.APIError` references keep working.
"""
from __future__ import annotations

from typing import Any


class APIError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request",
                 detail: dict[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        # Optional structured payload surfaced under error.detail so clients can
        # render specifics (e.g. quota used/limit/reset) without parsing copy.
        self.detail = detail or {}
