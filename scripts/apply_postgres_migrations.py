#!/usr/bin/env python3
"""Apply pending server.py migrations to the configured PostgreSQL database."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"env file not found: {path}")
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip("\"'")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default="/etc/kaix.env")
    args = parser.parse_args()
    load_env(Path(args.env_file))

    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    import server  # noqa: PLC0415

    if server.KAIX_DB_BACKEND != "postgres":
        raise SystemExit("KAIX_DB_BACKEND must be postgres")

    with server.db() as conn:
        server.run_migrations(conn)
        seed_result = server.ensure_guide_seed(conn)
        row = conn.execute("SELECT MAX(version) AS version FROM schema_migrations").fetchone()
    print(f"OK postgres migrations={int(row['version'] or 0)} guide_seed={seed_result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
