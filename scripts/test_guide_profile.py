#!/usr/bin/env python3
"""Tests for the Guide identity profile: /api/guide/profile (GET + PATCH).

Exercises the real Handler.api_guide_profile* methods against a throwaway
SQLite DB with a stubbed session (same harness as test_guide_ai.py). Focus:
the arrival_stage (来日阶段) field — whitelist write, round-trip read,
invalid-value coercion, and camelCase/snake_case body keys.

Run:  cd web && python3 scripts/test_guide_profile.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_guide_profile_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def _make_user(conn) -> str:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _handler(uid):
    """A bare Handler with session + body stubbed. send_json captures output."""
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = (lambda c: ({"user_id": uid} if uid else None))  # type: ignore[method-assign]
    h.headers = {}
    h.client_address = ("127.0.0.1", 0)
    return h, captured


def _patch_profile(conn, uid, body):
    h, captured = _handler(uid)
    h.read_json = lambda: dict(body)  # type: ignore[method-assign]
    h.api_guide_profile_update(conn)
    return captured


def _get_profile(conn, uid):
    h, captured = _handler(uid)
    h.api_guide_profile(conn, {})
    return captured


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        uid = _make_user(conn)
        conn.commit()

        # 1) Fresh user has no profile yet.
        cap = _get_profile(conn, uid)
        assert cap["status"] == 200, cap
        assert cap["data"]["profile"] is None, cap["data"]

        # 2) PATCH (insert path) with a valid arrivalStage → echoed + persisted.
        cap = _patch_profile(conn, uid, {"identityType": "student", "arrivalStage": "just_arrived"})
        assert cap["status"] == 200, cap
        profile = cap["data"]["profile"]
        assert profile["identityType"] == "student", profile
        assert profile["arrivalStage"] == "just_arrived", profile
        cap = _get_profile(conn, uid)
        assert cap["data"]["profile"]["arrivalStage"] == "just_arrived", cap["data"]

        # 3) PATCH (update path) to every other whitelisted stage; snake_case
        #    body key must work too (handler accepts both spellings).
        for stage in ("pre_arrival", "first_year", "long_term"):
            cap = _patch_profile(conn, uid, {"identityType": "student", "arrival_stage": stage})
            assert cap["status"] == 200, cap
            assert cap["data"]["profile"]["arrivalStage"] == stage, (stage, cap["data"])

        # 4) An out-of-whitelist value is coerced to unset (''), not a 400 —
        #    same silent-coerce style as the rest of the handler.
        cap = _patch_profile(conn, uid, {"identityType": "student", "arrivalStage": "time_traveler"})
        assert cap["status"] == 200, cap
        assert cap["data"]["profile"]["arrivalStage"] == "", cap["data"]

        # 5) Omitting the field PRESERVES the stored stage (iOS's reminder-
        #    settings save posts without arrivalStage; it must not wipe the
        #    stage picked during onboarding). Explicitly sending an empty /
        #    invalid value still clears it.
        _patch_profile(conn, uid, {"identityType": "student", "arrivalStage": "long_term"})
        cap = _patch_profile(conn, uid, {"identityType": "student"})
        assert cap["data"]["profile"]["arrivalStage"] == "long_term", cap["data"]
        cap = _patch_profile(conn, uid, {"identityType": "student", "arrivalStage": ""})
        assert cap["data"]["profile"]["arrivalStage"] == "", cap["data"]

        # 6) Exactly one profile row per user after all the PATCHes.
        rows = conn.execute("SELECT * FROM guide_user_profiles WHERE user_id = ?", (uid,)).fetchall()
        assert len(rows) == 1, len(rows)
        conn.commit()

        print("test_guide_profile: all assertions passed")
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            os.unlink(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
