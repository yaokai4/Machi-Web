#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run as root so the script can create and drop an isolated PostgreSQL database." >&2
  exit 1
fi

ENV_FILE="${KAIX_ENV_FILE:-/etc/kaix.env}"

env_value() {
  local key="$1"
  awk -F= -v wanted="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == wanted {
      sub(/^[^=]*=/, "")
      gsub(/^["'\'' ]+|["'\'' ]+$/, "")
      print
      exit
    }
  ' "$ENV_FILE"
}

REGION="${AWS_REGION:-$(env_value AWS_REGION)}"
BUCKET="${AWS_S3_BUCKET:-$(env_value AWS_S3_BUCKET)}"
REGION="${REGION:-ap-northeast-1}"
SOURCE_DATABASE="${KAIX_PG_BACKUP_DB:-machi}"

if [ -z "$BUCKET" ]; then
  echo "AWS_S3_BUCKET is missing in $ENV_FILE" >&2
  exit 1
fi

prefix="s3://${BUCKET}/backups/pg"
backup_name="${1:-}"
if [ -z "$backup_name" ]; then
  backup_name=$(aws s3 ls "${prefix}/" --region "$REGION" | awk '{print $4}' | sort | tail -n 1)
fi
if [ -z "$backup_name" ]; then
  echo "No PostgreSQL backup found at ${prefix}/" >&2
  exit 1
fi
if [[ "$backup_name" == s3://* ]]; then
  backup_uri="$backup_name"
else
  backup_uri="${prefix}/${backup_name}"
fi

verify_database="machi_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"
archive=$(mktemp /tmp/machi-pg-restore-XXXXXX.sql.gz)

cleanup() {
  runuser -u postgres -- dropdb --if-exists "$verify_database" >/dev/null 2>&1 || true
  rm -f "$archive"
}
trap cleanup EXIT

echo "Downloading ${backup_uri}"
aws s3 cp "$backup_uri" "$archive" --region "$REGION" --only-show-errors
gzip -t "$archive"

runuser -u postgres -- createdb "$verify_database"
gzip -dc "$archive" | runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q "$verify_database"

table_count=$(runuser -u postgres -- psql -At "$verify_database" -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
migration_count=$(runuser -u postgres -- psql -At "$verify_database" -c \
  "SELECT COUNT(*) FROM schema_migrations;")
user_count=$(runuser -u postgres -- psql -At "$verify_database" -c \
  "SELECT COUNT(*) FROM users;")
source_table_count=$(runuser -u postgres -- psql -At "$SOURCE_DATABASE" -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")

if [ "$table_count" -lt 80 ] || [ "$migration_count" -lt 35 ]; then
  echo "Restore verification failed: tables=${table_count}, migrations=${migration_count}" >&2
  exit 1
fi
if [ "$table_count" -ne "$source_table_count" ]; then
  echo "Restore table count differs from source: restored=${table_count}, source=${source_table_count}" >&2
  exit 1
fi

echo "OK backup=${backup_uri} tables=${table_count} migrations=${migration_count} users=${user_count}"
