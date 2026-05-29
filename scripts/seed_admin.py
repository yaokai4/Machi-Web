#!/usr/bin/env python3
"""Seed or repair the default admin account.

Idempotent. By default it ensures the admin exists — creating it if absent,
or *promoting* an existing account to admin — WITHOUT ever touching an
existing password. Pass --reset-password to forcibly set the admin password
to the value of KAIX_ADMIN_INITIAL_PASSWORD (or a value typed at the secure,
no-echo prompt).

The admin handle defaults to KAIX_ADMIN_HANDLE ("admin") and the seed password
to KAIX_ADMIN_INITIAL_PASSWORD. The password is NEVER printed, logged, echoed,
or read from argv (so it can't leak through `ps`).

Usage:
    python3 scripts/seed_admin.py                     # ensure admin exists
    KAIX_ADMIN_INITIAL_PASSWORD=... \\
        python3 scripts/seed_admin.py --reset-password  # rotate the password
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed or repair the default admin account.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset the admin password to KAIX_ADMIN_INITIAL_PASSWORD (or a secure prompt).",
    )
    args = parser.parse_args()

    handle = server.DEFAULT_ADMIN_HANDLE
    if not handle:
        print("error: KAIX_ADMIN_HANDLE is empty", file=sys.stderr)
        sys.exit(2)

    # init_db() runs migrations and already calls ensure_seed_admin().
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        server.ensure_seed_admin(conn)
        row = conn.execute(
            "SELECT id, handle, role, email, is_verified FROM users WHERE handle = ?",
            (handle,),
        ).fetchone()
        if not row:
            print(
                f"error: admin '{handle}' not found after seed "
                "(is KAIX_ADMIN_INITIAL_PASSWORD set?)",
                file=sys.stderr,
            )
            sys.exit(1)

        if args.reset_password:
            # Prefer the env var (CI / non-interactive); fall back to a no-echo
            # prompt. NEVER take the password from argv.
            new_pw = os.environ.get("KAIX_ADMIN_INITIAL_PASSWORD") or ""
            if not new_pw:
                new_pw = getpass.getpass("New admin password (input hidden): ")
            try:
                server.validate_password_strength(new_pw)
            except server.APIError as exc:
                print(f"error: {exc.message}", file=sys.stderr)
                sys.exit(2)
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (server.hash_password(new_pw), server.now_iso(), row["id"]),
            )
            # Revoke every session so the previous password can't ride a token.
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            print(f"admin '@{handle}': password reset; all sessions revoked")

        row = conn.execute(
            "SELECT handle, role, email, is_verified FROM users WHERE handle = ?",
            (handle,),
        ).fetchone()

    email = server.mask_email(row["email"]) if row["email"] else "(none)"
    print(
        f"admin ready: handle=@{row['handle']} role={row['role']} "
        f"email={email} verified={bool(row['is_verified'])}"
    )


if __name__ == "__main__":
    main()
