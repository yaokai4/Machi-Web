#!/usr/bin/env python3
"""Port the Machi SQLite DB to PostgreSQL: schema + data + indexes (Tier 2, step 1).

Reads a SQLite file (e.g. web/kaix.db), recreates every table in a target
Postgres database, copies all rows, and recreates user indexes. Verifies
row-count parity per table and exits non-zero on any mismatch.

Idempotent: wipes & rebuilds the target `public` schema each run (target is a
throwaway dev DB). All identifiers are quoted. Types map
TEXT/INTEGER/REAL/BLOB -> TEXT/BIGINT/DOUBLE PRECISION/BYTEA.

SCOPE (honest): this is step 1 of the port — it moves *structure + data*.
Foreign-key constraints and column DEFAULTs are intentionally omitted here
(rows are copied verbatim; the app supplies values). Re-adding FKs/defaults and
adapting server.py's SQLite-specific SQL (placeholders, INSERT OR REPLACE,
LIKE→ILIKE, json_* ...) are the following steps.

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


def build_ddl(scon: sqlite3.Connection, table: str):
    cols = list(scon.execute(f'PRAGMA table_info("{table}")'))  # cid,name,type,notnull,dflt,pk
    defs = []
    for c in cols:
        d = f"{q(c[1])} {pg_type(c[2])}"
        if c[3]:
            d += " NOT NULL"
        defs.append(d)
    pk = sorted((c for c in cols if c[5]), key=lambda c: c[5])
    if pk:
        defs.append("PRIMARY KEY (" + ", ".join(q(c[1]) for c in pk) + ")")
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
