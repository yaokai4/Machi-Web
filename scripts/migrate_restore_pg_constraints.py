#!/usr/bin/env python3
"""H2: restore the UNIQUE constraints that prod PostgreSQL lost.

`scripts/migrate_sqlite_to_postgres.py` intentionally omitted inline UNIQUE /
FOREIGN KEY constraints, so the live PG has NO referential integrity and lost
uniqueness on users.handle, blocks, follows, conversations, interactions, and
miniapp_openid_bindings — enabling duplicate likes/blocks/conversations and a
race on handle registration.

This is a SUPERVISED ops script (not an auto-migration) because restoring a
UNIQUE index can fail or delete data, which must never happen silently on a
deploy. It is idempotent and safe to re-run.

Usage (on the prod host, with the prod env that has KAIX_PG_DSN):
    python3 scripts/migrate_restore_pg_constraints.py            # DRY RUN: report dups only
    python3 scripts/migrate_restore_pg_constraints.py --apply    # de-dup SAFE tables + add indexes

Tables are split by safety:
  * SAFE to de-dup automatically  — relationship/join rows where a duplicate is
    pure redundancy (interactions, follows, blocks, miniapp_openid_bindings).
    We keep the earliest row (by created_at, else ctid) and delete the rest.
  * UNSAFE — users (a dup would delete a person) and conversations (would lose
    messages). We REPORT duplicates and add the index only if there are none;
    you resolve any dup by hand first.

FOREIGN KEYs are reported as advisory only (adding them needs clean orphan data
and a maintenance window); see --show-fks.
"""
import argparse
import os
import sys

DSN = os.environ.get("KAIX_PG_DSN", "")

# (table, [unique columns], index_name, safe_to_dedup, order_col_or_None)
TARGETS = [
    ("interactions", ["target_id", "user_id", "kind"], "idx_interactions_unique", True, "created_at"),
    ("follows", ["follower_id", "following_id"], "idx_follows_unique", True, "created_at"),
    ("blocks", ["blocker_id", "blocked_id"], "idx_blocks_unique", True, "created_at"),
    ("miniapp_openid_bindings", ["platform", "openid"], "idx_miniapp_openid_unique", True, "created_at"),
    ("users", ["handle"], "idx_users_handle_unique", False, "created_at"),
    ("conversations", ["participant_a", "participant_b"], "idx_conversations_pair_unique", False, "created_at"),
    ("reports", ["reporter_id", "target_kind", "target_id"], "idx_reports_unique", True, "created_at"),
]

# Advisory FK list (table.column -> ref). Add manually after confirming no orphans.
ADVISORY_FKS = [
    ("posts", "author_id", "users(id)"),
    ("comments", "author_id", "users(id)"),
    ("comments", "post_id", "posts(id)"),
    ("messages", "conversation_id", "conversations(id)"),
    ("messages", "sender_id", "users(id)"),
    ("interactions", "user_id", "users(id)"),
    ("blocks", "blocker_id", "users(id)"),
    ("blocks", "blocked_id", "users(id)"),
    ("follows", "follower_id", "users(id)"),
    ("follows", "following_id", "users(id)"),
]


def _col_exists(cur, table, col):
    cur.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
        (table, col),
    )
    return cur.fetchone() is not None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually de-dup SAFE tables and create indexes")
    ap.add_argument("--show-fks", action="store_true", help="print the advisory FOREIGN KEY list and exit")
    args = ap.parse_args()

    if args.show_fks:
        print("Advisory FOREIGN KEYs to add manually (verify no orphans first):")
        for t, c, ref in ADVISORY_FKS:
            print(f"  ALTER TABLE {t} ADD CONSTRAINT fk_{t}_{c} FOREIGN KEY ({c}) REFERENCES {ref};")
        return 0

    if not DSN:
        print("ERROR: KAIX_PG_DSN is not set. Run this with the prod env.", file=sys.stderr)
        return 2
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed.", file=sys.stderr)
        return 2

    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    cur = conn.cursor()
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"== Restore PG UNIQUE constraints [{mode}] ==\n")

    for table, cols, index_name, safe, order_col in TARGETS:
        cur.execute("SELECT to_regclass(%s)", (table,))
        if cur.fetchone()[0] is None:
            print(f"- {table}: table absent, skipping")
            continue
        if not all(_col_exists(cur, table, c) for c in cols):
            print(f"- {table}: column(s) {cols} absent, skipping")
            continue
        group_by = ", ".join(cols)
        cur.execute(
            f"SELECT COUNT(*) FROM (SELECT 1 FROM {table} GROUP BY {group_by} HAVING COUNT(*) > 1) d"
        )
        dup_groups = cur.fetchone()[0]
        print(f"- {table}({group_by}): {dup_groups} duplicate group(s)")

        if not args.apply:
            continue

        if dup_groups > 0:
            if not safe:
                print(f"    !! UNSAFE to auto-de-dup {table}. Resolve {dup_groups} duplicate(s) by hand,"
                      f" then re-run. Index NOT created.")
                conn.rollback()
                continue
            keep = order_col if _col_exists(cur, table, (order_col or "")) else "ctid::text"
            # Keep the earliest row per group; delete the rest.
            cur.execute(
                f"""
                DELETE FROM {table} t USING (
                    SELECT ctid, ROW_NUMBER() OVER (
                        PARTITION BY {group_by} ORDER BY {keep} ASC, ctid ASC
                    ) AS rn
                    FROM {table}
                ) d
                WHERE t.ctid = d.ctid AND d.rn > 1
                """
            )
            print(f"    de-duped {cur.rowcount} redundant row(s)")

        try:
            cur.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table}({group_by})")
            conn.commit()
            print(f"    ✓ unique index {index_name} ensured")
        except Exception as exc:
            conn.rollback()
            print(f"    !! failed to create {index_name}: {exc}")

    cur.close()
    conn.close()
    print("\nDone. Re-run with --show-fks for the advisory FOREIGN KEY list.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
