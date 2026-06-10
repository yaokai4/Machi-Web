#!/usr/bin/env python3
"""Verify, and optionally repair, SQLite/PostgreSQL row parity.

The production cutover keeps SQLite as the rollback snapshot and PostgreSQL as
the active database. This tool compares every application table by primary key,
detects changed or unexpected rows, and can explicitly make PostgreSQL match
the stopped SQLite source. It never deletes PostgreSQL rows.

The PostgreSQL DSN is read from an environment variable or a systemd-style
environment file so credentials do not need to appear in the process list.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values


def q_sqlite(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def read_env_file(path: Path, key: str) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RuntimeError(f"cannot read environment file: {path}") from exc
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == key:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            return value
    return ""


def pg_dsn(args: argparse.Namespace) -> str:
    value = os.environ.get(args.pg_env, "")
    if not value and args.env_file:
        value = read_env_file(Path(args.env_file), args.pg_env)
    if not value:
        raise RuntimeError(
            f"PostgreSQL DSN is missing; set {args.pg_env} or pass --env-file"
        )
    return value


def sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        if not str(row[0]).startswith("_litestream_")
    ]


def sqlite_columns(conn: sqlite3.Connection, table: str) -> tuple[list[str], list[str]]:
    rows = list(conn.execute(f"PRAGMA table_info({q_sqlite(table)})"))
    columns = [str(row[1]) for row in rows]
    primary_key = [
        str(row[1])
        for row in sorted((row for row in rows if row[5]), key=lambda row: row[5])
    ]
    return columns, primary_key


def pg_tables(cursor: Any) -> set[str]:
    cursor.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )
    return {
        str(row[0])
        for row in cursor.fetchall()
        if not str(row[0]).startswith("_litestream_")
    }


def pg_columns(cursor: Any, table: str) -> list[str]:
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s "
        "ORDER BY ordinal_position",
        (table,),
    )
    return [str(row[0]) for row in cursor.fetchall()]


def normalized(value: Any) -> Any:
    if isinstance(value, memoryview):
        return value.tobytes()
    return value


def row_key(row: Iterable[Any], key_indexes: tuple[int, ...]) -> tuple[Any, ...]:
    values = tuple(row)
    return tuple(normalized(values[index]) for index in key_indexes)


def row_value(row: Iterable[Any]) -> tuple[Any, ...]:
    return tuple(normalized(value) for value in row)


def fetch_sqlite_rows(
    conn: sqlite3.Connection, table: str, columns: list[str]
) -> list[tuple[Any, ...]]:
    selected = ", ".join(q_sqlite(column) for column in columns)
    return [
        tuple(row)
        for row in conn.execute(f"SELECT {selected} FROM {q_sqlite(table)}")
    ]


def fetch_pg_rows(cursor: Any, table: str, columns: list[str]) -> list[tuple[Any, ...]]:
    query = sql.SQL("SELECT {} FROM {}").format(
        sql.SQL(", ").join(sql.Identifier(column) for column in columns),
        sql.Identifier(table),
    )
    cursor.execute(query)
    return [tuple(row) for row in cursor.fetchall()]


def compare_rows(
    sqlite_rows: list[tuple[Any, ...]],
    postgres_rows: list[tuple[Any, ...]],
    key_indexes: tuple[int, ...],
) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    sqlite_by_key = {row_key(row, key_indexes): row for row in sqlite_rows}
    postgres_by_key = {row_key(row, key_indexes): row for row in postgres_rows}
    missing = [
        sqlite_by_key[key]
        for key in sorted(
            sqlite_by_key.keys() - postgres_by_key.keys(),
            key=repr,
        )
    ]
    extra = sorted(postgres_by_key.keys() - sqlite_by_key.keys(), key=repr)
    changed = [
        sqlite_by_key[key]
        for key in sorted(
            sqlite_by_key.keys() & postgres_by_key.keys(),
            key=repr,
        )
        if row_value(sqlite_by_key[key]) != row_value(postgres_by_key[key])
    ]
    return missing, extra, changed


def upsert_from_sqlite(
    cursor: Any,
    table: str,
    columns: list[str],
    primary_key: list[str],
    rows: list[tuple[Any, ...]],
) -> None:
    if not rows:
        return
    non_key_columns = [column for column in columns if column not in primary_key]
    if non_key_columns:
        conflict_action = sql.SQL("DO UPDATE SET {}").format(
            sql.SQL(", ").join(
                sql.SQL("{} = EXCLUDED.{}").format(
                    sql.Identifier(column),
                    sql.Identifier(column),
                )
                for column in non_key_columns
            )
        )
    else:
        conflict_action = sql.SQL("DO NOTHING")
    statement = sql.SQL(
        "INSERT INTO {} ({}) VALUES %s ON CONFLICT ({}) {}"
    ).format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.Identifier(column) for column in columns),
        sql.SQL(", ").join(sql.Identifier(column) for column in primary_key),
        conflict_action,
    )
    execute_values(cursor, statement.as_string(cursor), rows, page_size=500)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", required=True, help="path to the SQLite database")
    parser.add_argument("--pg-env", default="KAIX_PG_DSN")
    parser.add_argument("--env-file", help="systemd-style KEY=value environment file")
    parser.add_argument(
        "--sync-from-sqlite",
        action="store_true",
        help="upsert missing/changed rows from the stopped SQLite source",
    )
    args = parser.parse_args()

    sqlite_path = Path(args.sqlite)
    if not sqlite_path.is_file():
        print(f"ERROR: SQLite database does not exist: {sqlite_path}", file=sys.stderr)
        return 2

    sqlite_conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    pg_conn = psycopg2.connect(pg_dsn(args))
    pg_conn.autocommit = False
    cursor = pg_conn.cursor()

    failures: list[str] = []
    repaired_rows = 0
    try:
        sqlite_names = sqlite_tables(sqlite_conn)
        postgres_names = pg_tables(cursor)
        missing_tables = sorted(set(sqlite_names) - postgres_names)
        extra_tables = sorted(postgres_names - set(sqlite_names))
        if missing_tables:
            failures.append(f"tables missing from PostgreSQL: {missing_tables}")
        if extra_tables:
            failures.append(f"unexpected PostgreSQL tables: {extra_tables}")

        for table in sqlite_names:
            if table not in postgres_names:
                continue
            columns, primary_key = sqlite_columns(sqlite_conn, table)
            postgres_columns = pg_columns(cursor, table)
            if columns != postgres_columns:
                failures.append(
                    f"{table}: column mismatch sqlite={columns} postgres={postgres_columns}"
                )
                continue
            if not primary_key:
                failures.append(f"{table}: no primary key; deterministic parity is impossible")
                continue

            key_indexes = tuple(columns.index(column) for column in primary_key)
            sqlite_rows = fetch_sqlite_rows(sqlite_conn, table, columns)
            postgres_rows = fetch_pg_rows(cursor, table, columns)
            missing, extra, changed = compare_rows(
                sqlite_rows, postgres_rows, key_indexes
            )

            if args.sync_from_sqlite and (missing or changed):
                upsert_from_sqlite(
                    cursor,
                    table,
                    columns,
                    primary_key,
                    missing + changed,
                )
                pg_conn.commit()
                repaired_rows += len(missing) + len(changed)
                postgres_rows = fetch_pg_rows(cursor, table, columns)
                missing, extra, changed = compare_rows(
                    sqlite_rows, postgres_rows, key_indexes
                )

            state = "OK" if not (missing or extra or changed) else "MISMATCH"
            print(
                f"{state:8s} {table:34s} sqlite={len(sqlite_rows):6d} "
                f"postgres={len(postgres_rows):6d} missing={len(missing):3d} "
                f"extra={len(extra):3d} changed={len(changed):3d}"
            )
            if missing or extra or changed:
                failures.append(
                    f"{table}: missing={len(missing)} extra={len(extra)} "
                    f"changed={len(changed)}"
                )

        if failures:
            pg_conn.rollback()
            print("\nPARITY CHECK FAILED", file=sys.stderr)
            for failure in failures:
                print(f"  - {failure}", file=sys.stderr)
            return 1

        pg_conn.commit()
        print(
            f"\nPARITY CHECK PASSED: tables={len(sqlite_names)} "
            f"repaired_rows={repaired_rows}"
        )
        return 0
    finally:
        cursor.close()
        pg_conn.close()
        sqlite_conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
