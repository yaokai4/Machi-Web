#!/usr/bin/env bash
# Stop any local Next.js dev/start, delete the stale build cache, rebuild
# clean, then start fresh. Run this from web/app/ whenever a previous
# build keeps serving broken code.
#
# Usage:
#   bash scripts/fresh-start.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> stopping anything bound to :3000"
PIDS=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "${PIDS}" ]; then
  echo "    killing PIDs: ${PIDS}"
  echo "${PIDS}" | xargs kill -TERM 2>/dev/null || true
  sleep 2
  echo "${PIDS}" | xargs kill -KILL 2>/dev/null || true
fi

echo "==> clearing .next/ build cache + tsconfig.tsbuildinfo"
rm -rf .next tsconfig.tsbuildinfo

echo "==> npm run build"
npm run build

echo "==> verifying every page.tsx compiled to page.js"
node scripts/check-build.mjs

echo "==> npm run start (Ctrl+C to stop)"
exec npm run start
