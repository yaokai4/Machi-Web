#!/usr/bin/env bash
set -euo pipefail

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
DATABASE="${KAIX_PG_BACKUP_DB:-machi}"
REGION="${REGION:-ap-northeast-1}"

if [ -z "$BUCKET" ]; then
  echo "AWS_S3_BUCKET is missing in $ENV_FILE" >&2
  exit 1
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
prefix="s3://${BUCKET}/backups/pg"
destination="${prefix}/machi-${timestamp}.sql.gz"

runuser -u postgres -- pg_dump --no-owner --no-privileges "$DATABASE" \
  | gzip -9 \
  | aws s3 cp - "$destination" --region "$REGION"

mapfile -t old_backups < <(
  aws s3 ls "${prefix}/" --region "$REGION" \
    | awk '{print $4}' \
    | sort \
    | head -n -30
)
for filename in "${old_backups[@]:-}"; do
  if [ -n "${filename:-}" ]; then
    aws s3 rm "${prefix}/${filename}" --region "$REGION"
  fi
done

echo "OK $destination"
