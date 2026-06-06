#!/usr/bin/env python3
"""Tests for the generic Idempotency-Key mechanism (migration 35 + dispatch hook).

Covers the handler-level logic in isolation (miss -> store -> replay, no-op
without a key, auth-path exclusion so tokens are never cached, non-2xx not
stored, GET ineligible, TTL expiry, per-(scope,key) independence) AND that
migration 35 actually creates the table in the real SCHEMA + MIGRATIONS
startup chain. No HTTP server, no network, never touches the real kaix.db.

Run:  cd web && python3 scripts/test_idempotency.py
"""
import os
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path

# Isolate everything BEFORE importing server: module-level config reads
# KAIX_DB_PATH at import time, so point it at a throwaway file first.
_TMP_DB = tempfile.mkstemp(prefix="machi_idem_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from server import Handler  # noqa: E402

IDEM_DDL = """
CREATE TABLE idempotency_keys (
    scope TEXT NOT NULL,
    idem_key TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL,
    response_body BLOB NOT NULL,
    created_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (scope, idem_key)
);
"""


def make_handler(headers=None, *, user="u1", ip="1.2.3.4"):
    """A bare Handler (no socket) with only what the idempotency helpers use."""
    h = Handler.__new__(Handler)
    h.headers = headers or {}
    h._session_user_id = user
    h._request_id = "testreq"
    h._idem_capture = None
    h._client_ip = lambda: ip  # type: ignore[method-assign]
    return h


class IdempotencyLogicTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(IDEM_DDL)

    def tearDown(self):
        self.conn.close()

    def _rows(self):
        return self.conn.execute(
            "SELECT scope, idem_key, status FROM idempotency_keys"
        ).fetchall()

    def test_miss_then_store_then_hit_replays_same_response(self):
        h = make_handler({"Idempotency-Key": "k1"})
        self.assertIsNone(h._idempotency_lookup(self.conn, "POST", "/api/posts"))
        h._idem_capture = (200, b'{"id":"p1"}')
        h._idempotency_store(self.conn, "POST", "/api/posts")

        # A different user/ip with the same key + path replays the first result.
        h2 = make_handler({"Idempotency-Key": "k1"}, user="u2", ip="9.9.9.9")
        self.assertEqual(
            h2._idempotency_lookup(self.conn, "POST", "/api/posts"),
            (200, b'{"id":"p1"}'),
        )
        self.assertEqual(len(self._rows()), 1)  # no duplicate row

    def test_no_key_is_a_noop(self):
        h = make_handler({})
        self.assertIsNone(h._idempotency_lookup(self.conn, "POST", "/api/posts"))
        h._idem_capture = (200, b'{"id":"p1"}')
        h._idempotency_store(self.conn, "POST", "/api/posts")
        self.assertEqual(self._rows(), [])

    def test_auth_paths_excluded_so_tokens_are_never_cached(self):
        h = make_handler({"Idempotency-Key": "k2"})
        self.assertIsNone(h._idempotency_lookup(self.conn, "POST", "/api/auth/login"))
        h._idem_capture = (200, b'{"token":"secret"}')
        h._idempotency_store(self.conn, "POST", "/api/auth/login")
        self.assertEqual(self._rows(), [])

    def test_non_2xx_is_not_stored(self):
        h = make_handler({"Idempotency-Key": "k3"})
        h._idem_capture = (400, b'{"ok":false}')
        h._idempotency_store(self.conn, "POST", "/api/posts")
        self.assertEqual(self._rows(), [])

    def test_get_is_not_eligible(self):
        h = make_handler({"Idempotency-Key": "k4"})
        self.assertIsNone(h._idempotency_lookup(self.conn, "GET", "/api/posts"))

    def test_expired_record_is_a_miss_and_purged(self):
        old = int(time.time()) - 10 * 86400
        self.conn.execute(
            "INSERT INTO idempotency_keys "
            "(scope, idem_key, status, response_body, created_epoch, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("POST /api/posts", "k5", 200, b'{"id":"old"}', old,
             "2026-01-01T00:00:00+00:00"),
        )
        h = make_handler({"Idempotency-Key": "k5"})
        self.assertIsNone(h._idempotency_lookup(self.conn, "POST", "/api/posts"))
        self.assertEqual(self._rows(), [])  # purged on read

    def test_same_key_different_path_independent(self):
        h = make_handler({"Idempotency-Key": "shared"})
        h._idem_capture = (200, b'{"a":1}')
        h._idempotency_store(self.conn, "POST", "/api/posts")
        h._idem_capture = (200, b'{"b":2}')
        h._idempotency_store(self.conn, "POST", "/api/drafts")
        self.assertEqual(len(self._rows()), 2)
        self.assertEqual(
            h._idempotency_lookup(self.conn, "POST", "/api/posts"), (200, b'{"a":1}'))
        self.assertEqual(
            h._idempotency_lookup(self.conn, "POST", "/api/drafts"), (200, b'{"b":2}'))


class MigrationAppliesInRealStartupTests(unittest.TestCase):
    """Run the real SCHEMA + MIGRATIONS chain on a throwaway DB and confirm
    migration 35 created the table + index and is recorded."""

    @classmethod
    def setUpClass(cls):
        server.init_db()  # SCHEMA + all MIGRATIONS (incl. 35) on the temp DB
        cls.db = sqlite3.connect(_TMP_DB)
        cls.db.row_factory = sqlite3.Row

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(_TMP_DB + suffix)
            except OSError:
                pass

    def test_idempotency_table_exists(self):
        self.assertIsNotNone(self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_keys'"
        ).fetchone())

    def test_idempotency_index_exists(self):
        self.assertIsNotNone(self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND name='idx_idempotency_keys_created'"
        ).fetchone())

    def test_migration_35_recorded(self):
        self.assertIsNotNone(self.db.execute(
            "SELECT version FROM schema_migrations WHERE version=35"
        ).fetchone())


if __name__ == "__main__":
    unittest.main(verbosity=2)
