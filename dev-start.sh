#!/usr/bin/env bash
# Start Machi local services (backend :8787 + frontend :3000) in the background.
set -e
ROOT="/Users/yaokai/Desktop/IT/IOS/kaizi"

lsof -ti:8787 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Backend — always the real DB (never KAIX_DB_PATH=/tmp/...), default pepper.
( cd "$ROOT" && nohup env -u KAIX_DB_PATH python3 -u web/server.py > /tmp/machi_backend.log 2>&1 & disown )
# Frontend — dev mode (hot reload, picks up all pages).
( cd "$ROOT/web/app" && nohup npm run dev > /tmp/machi_frontend.log 2>&1 & disown )

echo "已启动:"
echo "  后端  http://127.0.0.1:8787"
echo "  前端  http://localhost:3000"
echo "日志:tail -f /tmp/machi_backend.log /tmp/machi_frontend.log"
