#!/usr/bin/env bash
# Show status of Machi local services.
echo "后端 :8787 -> $(lsof -ti:8787 || echo 未运行)"
echo "前端 :3000 -> $(lsof -ti:3000 || echo 未运行)"
echo -n "后端健康检查: "
curl -s -m3 http://127.0.0.1:8787/healthz || echo "无响应"
echo ""
