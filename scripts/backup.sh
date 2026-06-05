#!/usr/bin/env bash
# KaiX nightly backup.
#
# Snapshots the SQLite database + uploaded media into a timestamped
# tarball. Designed to be safe to run while the server is up: SQLite's
# `.backup` command uses an online consistent copy. The script keeps the
# most-recent N backups locally and you can rsync / restic the rest.
#
# Usage:
#   web/scripts/backup.sh                        # default: backups/ next to this script
#   KAIX_BACKUP_DIR=/var/backups/kaix backup.sh  # override target dir
#   KAIX_BACKUP_KEEP=14 backup.sh                # keep 14 instead of default 7
#
# Recommended crontab entry on the production host:
#   17 3 * * *  /opt/kaix/web/scripts/backup.sh >> /var/log/kaix-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${KAIX_BACKUP_DIR:-$WEB_DIR/backups}"
KEEP="${KAIX_BACKUP_KEEP:-7}"
DB_PATH="${KAIX_DB_PATH:-$WEB_DIR/kaix.db}"
MEDIA_DIR="${KAIX_MEDIA_DIR:-$WEB_DIR/media}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/kaix-$STAMP"
mkdir -p "$DEST"

# Online consistent snapshot of SQLite — survives concurrent writes.
sqlite3 "$DB_PATH" ".backup '$DEST/kaix.db'"

# Never trust an unverified snapshot: integrity_check before we keep it.
integrity="$(sqlite3 "$DEST/kaix.db" 'PRAGMA integrity_check;')"
if [ "$integrity" != "ok" ]; then
  echo "$(date -u +%FT%TZ) FATAL: snapshot integrity_check failed: $integrity" >&2
  rm -rf "$DEST"
  exit 1
fi

# Media is append-only by id; copy with hardlinks to save space, then tar.
if [ -d "$MEDIA_DIR" ]; then
  cp -al "$MEDIA_DIR" "$DEST/media" 2>/dev/null || cp -a "$MEDIA_DIR" "$DEST/media"
fi

tar -C "$BACKUP_DIR" -czf "$DEST.tar.gz" "kaix-$STAMP"
rm -rf "$DEST"
echo "$(date -u +%FT%TZ) ok -> $DEST.tar.gz ($(du -h "$DEST.tar.gz" | awk '{print $1}'))"

# Prune older than KEEP entries.
ls -1t "$BACKUP_DIR"/kaix-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
