#!/usr/bin/env python3
"""Account-deletion PII scrub test (App Store 5.1.1(v) / GDPR).

Asserts that anonymize_user_account leaves zero residual rows in the Guide
personal-workbench tables — the MOST sensitive data a user entrusts to Machi
(personal finances, budgets, contracts, visa/job applications, document-expiry
reminders, calendar, todos, life items) — and that the user row itself is
anonymized. Runs against a throwaway SQLite DB through the real schema chain;
no HTTP server, no network, never touches the real kaix.db.

Run:  cd web && python3 scripts/test_account_deletion_scrub.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_deletion_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

# Sensitive per-user workbench tables that a deletion MUST scrub. Keep in sync
# with the scrub loop in server.anonymize_user_account.
WORKBENCH_TABLES = [
    "guide_transactions",
    "guide_budgets",
    "guide_contracts",
    "guide_applications",
    "guide_documents",
    "guide_calendar_items",
    "guide_todos",
    "guide_life_items",
]


def _make_user(conn, handle: str | None = None) -> str:
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _insert_dummy_row(conn, table: str, user_id: str) -> None:
    """Insert a minimal valid row, satisfying NOT NULL columns generically via
    PRAGMA introspection so the test stays decoupled from each table's schema."""
    cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
    names: list[str] = []
    values: list[object] = []
    for col in cols:
        # (cid, name, type, notnull, dflt_value, pk)
        name, ctype, notnull, dflt, pk = col[1], (col[2] or ""), col[3], col[4], col[5]
        if name == "user_id":
            names.append(name); values.append(user_id); continue
        if not notnull or dflt is not None:
            continue  # nullable or has a default — let the DB fill it
        names.append(name)
        if pk or name == "id":
            values.append(str(uuid.uuid4()))
        elif any(k in ctype.upper() for k in ("INT", "REAL", "NUM", "DEC", "FLOA", "DOUB")):
            values.append(0)
        else:
            values.append("x")
    placeholders = ",".join("?" for _ in names)
    conn.execute(f"INSERT INTO {table} ({','.join(names)}) VALUES ({placeholders})", values)


class AccountDeletionScrubTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.init_db()

    def setUp(self):
        self.conn = server.db()

    def tearDown(self):
        self.conn.close()

    def test_workbench_tables_exist_and_are_user_keyed(self):
        for t in WORKBENCH_TABLES:
            cols = {c[1] for c in self.conn.execute(f"PRAGMA table_info({t})").fetchall()}
            self.assertTrue(cols, f"{t} should exist in the schema")
            self.assertIn("user_id", cols, f"{t} should be keyed on user_id")

    def test_deletion_scrubs_all_workbench_pii(self):
        uid = _make_user(self.conn)
        other = _make_user(self.conn)
        for t in WORKBENCH_TABLES:
            _insert_dummy_row(self.conn, t, uid)
            _insert_dummy_row(self.conn, t, other)  # a bystander's data
        self.conn.commit()

        # Sanity: the rows are actually there before deletion.
        for t in WORKBENCH_TABLES:
            n = self.conn.execute(f"SELECT COUNT(*) AS c FROM {t} WHERE user_id = ?", (uid,)).fetchone()["c"]
            self.assertEqual(n, 1, f"precondition: {t} should hold the user's row")

        server.anonymize_user_account(self.conn, uid)
        self.conn.commit()

        # Zero residual rows for the deleted user across every workbench table.
        for t in WORKBENCH_TABLES:
            n = self.conn.execute(f"SELECT COUNT(*) AS c FROM {t} WHERE user_id = ?", (uid,)).fetchone()["c"]
            self.assertEqual(n, 0, f"{t} still holds PII for the deleted user")
            # The other user's data must be untouched.
            m = self.conn.execute(f"SELECT COUNT(*) AS c FROM {t} WHERE user_id = ?", (other,)).fetchone()["c"]
            self.assertEqual(m, 1, f"{t}: a bystander's data was wrongly deleted")

    def test_user_row_is_anonymized(self):
        uid = _make_user(self.conn)
        server.anonymize_user_account(self.conn, uid)
        self.conn.commit()
        row = self.conn.execute(
            "SELECT handle, display_name, email, deleted_at FROM users WHERE id = ?", (uid,)
        ).fetchone()
        self.assertTrue(row["handle"].startswith("deleted_"), "handle should be freed/anonymized")
        self.assertEqual(row["email"], "", "email PII should be cleared")
        self.assertIsNotNone(row["deleted_at"], "deleted_at should be stamped")


if __name__ == "__main__":
    unittest.main(verbosity=2)
