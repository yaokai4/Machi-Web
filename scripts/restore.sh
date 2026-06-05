#!/usr/bin/env bash
# KaiX restore — restore the SQLite DB (and optionally media) from a tarball
# produced by backup.sh. Safe by default:
#   - integrity-checks the backup before trusting it,
#   - snapshots whatever is CURRENTLY at the target to a .pre-restore file,
#   - requires an explicit archive argument.
# Stop the server (or put it in maintenance/read-only) before restoring a LIVE db.
#
# Usage:
#   web/scripts/restore.sh backups/kaix-<STAMP>.tar.gz            # db -> web/kaix.db
#   web/scripts/restore.sh backups/kaix-<STAMP>.tar.gz --media    # also restore media/
#   RESTORE_TARGET=/path/kaix.db web/scripts/restore.sh <tarball> # custom target db
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "usage: restore.sh <backup.tar.gz> [--media]"; exit 2; }
RESTORE_MEDIA=0; [ "${2:-}" = "--media" ] && RESTORE_MEDIA=1
TARGET="${RESTORE_TARGET:-$WEB_DIR/kaix.db}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP"
SRC_DIR="$(find "$TMP" -maxdepth 1 -type d -name 'kaix-*' | head -1)"
[ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/kaix.db" ] || { echo "FATAL: backup missing kaix.db"; exit 1; }

# Trust nothing un-verified.
integrity="$(sqlite3 "$SRC_DIR/kaix.db" 'PRAGMA integrity_check;')"
[ "$integrity" = "ok" ] || { echo "FATAL: backup integrity_check failed: $integrity"; exit 1; }

# Safety net: snapshot whatever is currently at TARGET before overwriting it.
if [ -f "$TARGET" ]; then
  pre="$TARGET.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"
  sqlite3 "$TARGET" ".backup '$pre'" 2>/dev/null || cp "$TARGET" "$pre"
  echo "pre-restore snapshot -> $pre"
fi

cp "$SRC_DIR/kaix.db" "$TARGET"
# Drop stale WAL/SHM so the restored file is authoritative.
rm -f "$TARGET-wal" "$TARGET-shm"
echo "restored db -> $TARGET (integrity: $(sqlite3 "$TARGET" 'PRAGMA integrity_check;'))"

if [ "$RESTORE_MEDIA" = "1" ] && [ -d "$SRC_DIR/media" ]; then
  mkdir -p "$WEB_DIR/media"
  cp -a "$SRC_DIR/media/." "$WEB_DIR/media/"
  echo "restored media -> $WEB_DIR/media/"
fi
echo "$(date -u +%FT%TZ) restore complete. Restart the server."
