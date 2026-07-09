#!/usr/bin/env python3
"""Port the Machi SQLite DB to PostgreSQL: schema + data + indexes (Tier 2, step 1).

Reads a SQLite file (e.g. web/kaix.db), recreates every table in a target
Postgres database, copies all rows, and recreates user indexes. Verifies
row-count parity per table and exits non-zero on any mismatch.

Idempotent: wipes & rebuilds the target `public` schema each run (target is a
throwaway dev DB). All identifiers are quoted. Types map
TEXT/INTEGER/REAL/BLOB -> TEXT/BIGINT/DOUBLE PRECISION/BYTEA.

SCOPE (honest): this is step 1 of the port — it moves *structure + data*.

  * UNIQUE — inline ``UNIQUE(...)`` table constraints ARE now preserved (see
    build_ddl / inline_unique_constraints). They were silently dropped in the
    original port, which let duplicate rows accumulate on production Postgres
    (duplicate conversations/blocks/likes, one WeChat openid on many users, a
    handle-registration race). The live PG that was ported before this fix is
    repaired forward by the migration chain (server_schema.py migrations
    106–109 add the same UNIQUE indexes idempotently on the next deploy) and,
    for a one-off manual pass, by scripts/migrate_restore_pg_constraints.py.

  * FOREIGN KEY — intentionally omitted, by deliberate, standing decision (the
    wallet_* / guide_orders / guide_reviews migrations document the same choice).
    Rationale: SCHEMA uses NO ``ON DELETE CASCADE``, so a missing FK can at worst
    leave a dangling child row, which every read path already filters out via
    ``deleted_at IS NULL`` / JOIN existence — it is not silent data corruption
    the way a lost UNIQUE is. Conversely, auto-adding a *validating* FK in the
    deploy-time migration chain would ABORT the deploy the moment any pre-existing
    orphan row exists (and orphans are expected on the lax-until-now PG), taking
    the whole site down — strictly worse than the current live-but-lax state.
    Adding FKs therefore stays a SUPERVISED, maintenance-window operation: clean
    orphans first, then apply from the advisory list in
    scripts/migrate_restore_pg_constraints.py (--show-fks), ideally as
    ``ADD CONSTRAINT ... NOT VALID`` followed by a separate ``VALIDATE
    CONSTRAINT`` to avoid a long exclusive lock. Application-layer referential
    checks on the hard-delete paths (server.py) are the portable complement that
    keeps the two backends' semantics aligned.

Column DEFAULTs beyond literals are omitted here (rows are copied verbatim; the
app supplies values). Adapting server.py's SQLite-specific SQL (placeholders,
INSERT OR REPLACE, LIKE→ILIKE, json_* ...) is a following step.

Usage:
  python migrate_sqlite_to_postgres.py --sqlite web/kaix.db --pg "dbname=machi_dev"
"""
from __future__ import annotations

import argparse
import sqlite3
import sys

import psycopg2
from psycopg2.extras import execute_values


def pg_type(sqlite_decl: str) -> str:
    t = (sqlite_decl or "").upper()
    if "INT" in t:
        return "BIGINT"
    if any(x in t for x in ("REAL", "FLOA", "DOUB")):
        return "DOUBLE PRECISION"
    if "BLOB" in t:
        return "BYTEA"
    return "TEXT"  # TEXT/CHAR/CLOB/NUMERIC/<none> -> TEXT


def q(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


def sqlite_tables(scon: sqlite3.Connection) -> list[str]:
    return [r[0] for r in scon.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def inline_unique_constraints(scon: sqlite3.Connection, table: str) -> list[list[str]]:
    """Return the table's inline ``UNIQUE(...)`` constraints as column lists.

    ``PRAGMA table_info`` can't see these — SQLite implements an inline UNIQUE
    as an auto-index (origin ``'u'``) whose ``sql`` is NULL, so it is invisible
    to both table_info AND the "recreate indexes from sqlite_master" pass below.
    That is exactly why the original port silently dropped uniqueness on
    conversations / blocks / miniapp_openid_bindings / users.handle, letting
    duplicate rows accumulate on production Postgres. We surface them here and
    re-emit them as real PG table constraints so a fresh port keeps referential
    uniqueness by construction.

    Skipped: PRIMARY KEY (origin ``'pk'`` — already emitted from table_info) and
    explicit ``CREATE [UNIQUE] INDEX`` (origin ``'c'`` — recreated verbatim from
    sqlite_master, which preserves partial / expression indexes like
    idx_users_email_unique). Partial UNIQUE constraints don't exist in SQLite, so
    ``partial`` rows are skipped defensively.
    """
    out: list[list[str]] = []
    for idx in scon.execute(f'PRAGMA index_list("{table}")'):
        # columns: seq, name, unique, origin, partial
        name, unique, origin = idx[1], idx[2], idx[3]
        partial = idx[4] if len(idx) > 4 else 0
        if not unique or origin != "u" or partial:
            continue
        cols = [r[2] for r in scon.execute(f'PRAGMA index_info("{name}")')]  # seqno, cid, name
        if cols and all(c is not None for c in cols):  # skip expression columns (name is NULL)
            out.append(cols)
    return out


def build_ddl(scon: sqlite3.Connection, table: str):
    cols = list(scon.execute(f'PRAGMA table_info("{table}")'))  # cid,name,type,notnull,dflt,pk
    defs = []
    for c in cols:
        d = f"{q(c[1])} {pg_type(c[2])}"
        if c[3]:
            d += " NOT NULL"
        dflt = c[4]
        if dflt is not None:
            ds = str(dflt).strip()
            up = ds.upper()
            if up in ("CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME"):
                d += f" DEFAULT {up}"
            elif "(" in ds:
                pass  # skip SQLite expression defaults (none expected in this schema)
            else:
                d += f" DEFAULT {ds}"  # literal: number / 'string' / NULL
        defs.append(d)
    pk = sorted((c for c in cols if c[5]), key=lambda c: c[5])
    if pk:
        defs.append("PRIMARY KEY (" + ", ".join(q(c[1]) for c in pk) + ")")
    # Preserve inline UNIQUE constraints so the port keeps referential
    # uniqueness (see inline_unique_constraints). FOREIGN KEYs remain
    # intentionally omitted — see the module docstring for that decision.
    for ucols in inline_unique_constraints(scon, table):
        defs.append("UNIQUE (" + ", ".join(q(c) for c in ucols) + ")")
    ddl = f"CREATE TABLE {q(table)} (\n  " + ",\n  ".join(defs) + "\n);"
    return ddl, [c[1] for c in cols]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", default="kaix.db")
    ap.add_argument("--pg", default="dbname=machi_dev")
    args = ap.parse_args()

    scon = sqlite3.connect(args.sqlite)
    pcon = psycopg2.connect(args.pg)
    pcur = pcon.cursor()

    print("== wiping target schema (public) ==")
    pcon.autocommit = True
    pcur.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    pcon.autocommit = False

    tables = sqlite_tables(scon)
    print(f"== creating {len(tables)} tables ==")
    table_cols: dict[str, list[str]] = {}
    for t in tables:
        ddl, cols = build_ddl(scon, t)
        table_cols[t] = cols
        pcur.execute(ddl)
    pcon.commit()

    print("== copying data (sqlite -> postgres) ==")
    mismatches = []
    for t in tables:
        cols = table_cols[t]
        rows = scon.execute(
            f'SELECT {", ".join(q(c) for c in cols)} FROM {q(t)}').fetchall()
        if rows:
            sql = f'INSERT INTO {q(t)} ({", ".join(q(c) for c in cols)}) VALUES %s'
            execute_values(pcur, sql, rows, page_size=500)
        pcon.commit()
        src = scon.execute(f'SELECT COUNT(*) FROM {q(t)}').fetchone()[0]
        pcur.execute(f'SELECT COUNT(*) FROM {q(t)}')
        dst = pcur.fetchone()[0]
        if src != dst:
            mismatches.append((t, src, dst))
        print(f"  {t:34s} {src:>6} -> {dst:>6}{'  <-- MISMATCH' if src != dst else ''}")

    print("== recreating indexes ==")
    pcon.commit()  # close the implicit tx from the COUNT queries before toggling
    pcon.autocommit = True
    idx_ok = idx_fail = 0
    for name, sql in list(scon.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")):
        try:
            pcur.execute(sql)
            idx_ok += 1
        except Exception as e:  # noqa: BLE001 — report & continue, never abort
            idx_fail += 1
            print(f"  [skip {name}] {str(e).splitlines()[0]}")

    print(f"\n== SUMMARY ==")
    print(f"  tables={len(tables)}  indexes_ok={idx_ok}  indexes_skipped={idx_fail}")
    if mismatches:
        print("  ROW-COUNT MISMATCHES:", mismatches)
        sys.exit(1)
    print("  all table row counts match ✓")


if __name__ == "__main__":
    main()
