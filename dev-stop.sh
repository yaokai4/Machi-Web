#!/usr/bin/env bash
# Stop Machi local services (backend :8787 + frontend :3000).
lsof -ti:8787 | xargs kill 2>/dev/null || true
lsof -ti:3000 | xargs kill 2>/dev/null || true
echo "已停止本地前后端(:8787 / :3000)"
