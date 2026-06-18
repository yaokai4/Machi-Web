#!/usr/bin/env bash

# Machi 项目 EC2 部署脚本（在「本地」运行）
#
# 用法：
#   bash web/deploy/deploy.sh
#
# 当前生产服务器：
#   ssh -i /Users/yaokai/Desktop/IT/ios/Machi2.pem ec2-user@35.79.109.50

set -euo pipefail

# ================= 彻底写死，绝不出错 =================
EC2_IP="35.79.109.50"
EC2_HOST="ec2-user@$EC2_IP"
EC2_KEY="/Users/yaokai/Desktop/IT/ios/Machi2.pem"
LOCAL_PROJECT_DIR="/Users/yaokai/Desktop/IT/IOS/kaizi"
PROJECT_NAME="kaizi"
TARBALL="kaizi-web.tar.gz"
SSH_OPTS=(
  -i "$EC2_KEY"
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)
# =====================================================

cleanup_local_tarball() {
  rm -f "$LOCAL_PROJECT_DIR/$TARBALL"
}
trap cleanup_local_tarball EXIT

echo "==> [本地] 项目目录: $LOCAL_PROJECT_DIR"
# 清理本地 Mac 隐藏垃圾
dot_clean "$LOCAL_PROJECT_DIR/web" 2>/dev/null || true
cd "$LOCAL_PROJECT_DIR"

echo "==> [本地] 打包 web/ (排除 .next / node_modules / kaix.db / .git 等)"
COPYFILE_DISABLE=1 tar \
  --no-xattrs \
  --no-mac-metadata \
  --exclude="web/app/.next" \
  --exclude="web/app/node_modules" \
  --exclude="web/app/tsconfig.tsbuildinfo" \
  --exclude="web/kaix.db" \
  --exclude="web/kaix.db-shm" \
  --exclude="web/kaix.db-wal" \
  --exclude="web/.env" \
  --exclude="web/.env.local" \
  --exclude="*/__pycache__" \
  --exclude="*/.DS_Store" \
  --exclude="*/.git" \
  --exclude="**/._*" \
  --exclude="*/.next" \
  -czf "$TARBALL" web/

SIZE_MB=$(du -m "$TARBALL" | cut -f1)
echo "    包大小: ${SIZE_MB}MB"
LOCAL_SHA=$(shasum -a 256 "$TARBALL" | awk '{print $1}')
echo "    SHA256: $LOCAL_SHA"

echo "==> [本地] 上传到 $EC2_HOST"
ssh "${SSH_OPTS[@]}" "$EC2_HOST" "rm -f /home/ec2-user/$TARBALL.uploading"
scp "${SSH_OPTS[@]}" "$TARBALL" "$EC2_HOST:/home/ec2-user/$TARBALL.uploading"
ssh "${SSH_OPTS[@]}" "$EC2_HOST" "mv /home/ec2-user/$TARBALL.uploading /home/ec2-user/$TARBALL"

REMOTE_SHA=$(ssh "${SSH_OPTS[@]}" "$EC2_HOST" "sha256sum /home/ec2-user/$TARBALL | awk '{print \$1}'")
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "❌ 远端包校验失败: local=$LOCAL_SHA remote=$REMOTE_SHA" >&2
  exit 1
fi
echo "    远端 SHA256 校验通过"

echo "==> [远端] 解压到新目录 + 干净 build + 原子替换 + smoke test"
ssh "${SSH_OPTS[@]}" "$EC2_HOST" "TARBALL=/home/ec2-user/$TARBALL PUBLIC_RESOLVE_IP=$EC2_IP bash" <<'REMOTE'
set -eEuo pipefail

TS=$(date +%Y%m%d-%H%M%S)
CURRENT=/opt/kaix
RELEASE=/opt/kaix.release-$TS
BACKUP=/opt/kaix.backup-$TS
FAILED=/opt/kaix.failed-$TS
SWAPPED=0
SERVICES_STOPPED=0
CURRENT_MOVED=0

rollback() {
  local line="$1"
  echo "    ❌ 部署在第 ${line} 行失败" >&2
  if [ "$SWAPPED" = "1" ] && [ -d "$BACKUP" ]; then
    echo "    [远端] 回滚到 $BACKUP" >&2
    sudo systemctl stop kaix-web.service || true
    sudo systemctl stop kaix-backend.service || true
    sudo rm -rf "$FAILED"
    if [ -d "$CURRENT" ]; then
      sudo mv "$CURRENT" "$FAILED"
    fi
    sudo mv "$BACKUP" "$CURRENT"
    sudo systemctl start kaix-backend.service || true
    sleep 2
    sudo systemctl start kaix-web.service || true
  elif [ "$CURRENT_MOVED" = "1" ] && [ -d "$BACKUP" ]; then
    echo "    [远端] release 尚未落位，恢复原目录" >&2
    sudo mv "$BACKUP" "$CURRENT"
    sudo systemctl start kaix-backend.service || true
    sleep 2
    sudo systemctl start kaix-web.service || true
  elif [ "$SERVICES_STOPPED" = "1" ]; then
    echo "    [远端] release 尚未切换，恢复当前版本服务" >&2
    sudo systemctl start kaix-backend.service || true
    sleep 2
    sudo systemctl start kaix-web.service || true
  fi
}
trap 'rollback $LINENO' ERR

restore_env_for_build() {
  if [ -f "$CURRENT/web/.env" ]; then
    sudo cp -a "$CURRENT/web/.env" "$RELEASE/web/.env"
  fi
}

restore_runtime_data() {
  if [ -f "$CURRENT/web/kaix.db" ]; then
    sudo cp -a "$CURRENT"/web/kaix.db* "$RELEASE/web/" || true
  fi
  if [ -d "$CURRENT/web/media" ]; then
    sudo rm -rf "$RELEASE/web/media"
    sudo cp -a "$CURRENT/web/media" "$RELEASE/web/media"
  fi
  if [ -f "$CURRENT/web/.env" ]; then
    sudo cp -a "$CURRENT/web/.env" "$RELEASE/web/.env"
  fi
}

ensure_runtime_env() {
  echo "    [远端] 校准生产运行环境变量"
  sudo python3 - <<'PY'
from pathlib import Path

path = Path("/etc/kaix.env")
updates = {
    "KAIX_MAX_UPLOAD_BYTES": "335544320",
    "S3_UPLOAD_MAX_SIZE": "335544320",
}
lines = path.read_text().splitlines() if path.exists() else []
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
    if key in updates:
        out.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out).rstrip() + "\n")
PY
  sudo chmod 600 /etc/kaix.env
}

install_systemd_units() {
  echo "    [远端] 安装/刷新 systemd 服务并设置开机自启"
  sudo cp /opt/kaix/web/deploy/kaix-backend.service /etc/systemd/system/kaix-backend.service
  sudo cp /opt/kaix/web/deploy/kaix-web.service /etc/systemd/system/kaix-web.service
  if [ -f /opt/kaix/web/deploy/kaix-backend-worker@.service ]; then
    sudo cp /opt/kaix/web/deploy/kaix-backend-worker@.service /etc/systemd/system/kaix-backend-worker@.service
  fi
  if [ -f /opt/kaix/web/deploy/pg_backup.sh ]; then
    sudo cp /opt/kaix/web/deploy/pg_backup.sh /opt/kaix/pg_backup.sh
    sudo chmod 755 /opt/kaix/pg_backup.sh
  fi
  if [ -f /opt/kaix/web/deploy/verify_pg_backup.sh ]; then
    sudo chmod 755 /opt/kaix/web/deploy/verify_pg_backup.sh
  fi
  if [ -f /opt/kaix/web/deploy/machi-pg-backup.service ]; then
    sudo cp /opt/kaix/web/deploy/machi-pg-backup.service /etc/systemd/system/machi-pg-backup.service
  fi
  if [ -f /opt/kaix/web/deploy/machi-pg-backup.timer ]; then
    sudo cp /opt/kaix/web/deploy/machi-pg-backup.timer /etc/systemd/system/machi-pg-backup.timer
  fi
  sudo systemctl daemon-reload
  sudo systemctl enable kaix-backend.service kaix-web.service
  if systemctl list-unit-files machi-pg-backup.timer >/dev/null 2>&1; then
    sudo systemctl enable --now machi-pg-backup.timer
  fi
  if systemctl list-unit-files nginx.service >/dev/null 2>&1; then
    sudo systemctl enable nginx.service
  fi
  if systemctl list-unit-files caddy.service >/dev/null 2>&1 && systemctl is-active --quiet caddy; then
    sudo systemctl enable caddy.service
  fi
}

echo "    [远端] 准备 release 目录: $RELEASE"
sudo rm -rf "$RELEASE"
sudo mkdir -p "$RELEASE"
sudo tar -xzf "$TARBALL" -C "$RELEASE"
sudo test -d "$RELEASE/web/app"

echo "    [远端] 强力清除解压出来的所有 Mac 隐藏乱码文件"
sudo find "$RELEASE" -name "._*" -delete
restore_env_for_build
ensure_runtime_env
sudo chown -R kaix:kaix "$RELEASE"

PYTHON_BIN="${PYTHON_BIN:-python3.12}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "    [远端] 安装受支持的 Python 3.12 运行时"
  sudo dnf install -y python3.12 python3.12-pip
fi
"$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'

echo "    [远端] 使用 $PYTHON_BIN 创建隔离运行环境并安装锁定依赖"
sudo -u kaix "$PYTHON_BIN" -m venv "$RELEASE/.venv"
sudo -u kaix "$RELEASE/.venv/bin/python" -m pip install --upgrade pip
sudo -u kaix "$RELEASE/.venv/bin/python" -m pip install -r "$RELEASE/web/requirements.txt"

if sudo grep -q '^KAIX_DB_BACKEND=postgres' /etc/kaix.env 2>/dev/null; then
  echo "    [远端] PostgreSQL 模式预检"
  sudo -u kaix grep -q 'class _PgConn' "$RELEASE/web/server.py"
  sudo -u kaix "$RELEASE/.venv/bin/python" -c 'import psycopg2'
fi

cd "$RELEASE/web/app"

echo "    [远端] npm ci"
sudo -u kaix npm ci

echo "    [远端] 强制干净 build（防止 Next.js 增量编译丢页面）"
sudo -u kaix rm -rf .next tsconfig.tsbuildinfo

echo "    [远端] npm run build"
sudo -u kaix npm run build

echo "    [远端] 检查所有路由都能编译（防 page.js 静默丢失）"
sudo -u kaix npm run check-build

if sudo grep -q '^KAIX_DB_BACKEND=postgres' /etc/kaix.env 2>/dev/null \
    && sudo systemctl cat machi-pg-backup.service >/dev/null 2>&1; then
  echo "    [远端] 切换前执行 PostgreSQL 即时备份"
  sudo systemctl start machi-pg-backup.service
fi

echo "    [远端] 停服务并做最终数据同步"
sudo systemctl stop kaix-web.service || true
sudo systemctl stop kaix-backend.service || true
SERVICES_STOPPED=1
restore_runtime_data
sudo chown -R kaix:kaix "$RELEASE"

if sudo grep -q '^KAIX_DB_BACKEND=postgres' /etc/kaix.env 2>/dev/null; then
  if sudo grep -q '^KAIX_PG_CUTOVER_COMPLETE=1' /etc/kaix.env 2>/dev/null; then
    echo "    [远端] PostgreSQL 已是唯一真相源，禁止用旧 SQLite 覆盖线上数据"
  else
    echo "    [远端] 首次 PostgreSQL 切换：同步停服窗口数据并执行全表一致性校验"
    sudo "$RELEASE/.venv/bin/python" \
      "$RELEASE/web/scripts/verify_sqlite_postgres_parity.py" \
      --sqlite "$RELEASE/web/kaix.db" \
      --env-file /etc/kaix.env \
      --sync-from-sqlite
  fi
  echo "    [远端] 执行待应用的 PostgreSQL 数据迁移"
  sudo "$RELEASE/.venv/bin/python" \
    "$RELEASE/web/scripts/apply_postgres_migrations.py" \
    --env-file /etc/kaix.env
  echo "    [远端] 将仍被引用的本地媒体迁移到私有 S3，并切换公开资源到 CloudFront"
  sudo "$RELEASE/.venv/bin/python" \
    "$RELEASE/web/scripts/migrate_local_media_to_s3.py" \
    --media-root "$RELEASE/web/media" \
    --env-file /etc/kaix.env \
    --apply
fi

echo "    [远端] 切换 release"
if [ -d "$CURRENT" ]; then
  sudo mv "$CURRENT" "$BACKUP"
  CURRENT_MOVED=1
fi
sudo mv "$RELEASE" "$CURRENT"
SWAPPED=1
CURRENT_MOVED=0
SERVICES_STOPPED=0

install_systemd_units

echo "    [远端] 启动服务"
sudo systemctl start kaix-backend.service
sleep 2
sudo systemctl start kaix-web.service
sleep 3

echo "    [远端] 重启服务确认"
sudo systemctl restart kaix-backend.service
sleep 2
sudo systemctl restart kaix-web.service
sleep 3

echo "    [远端] 健康检查"
sudo systemctl is-active kaix-backend.service kaix-web.service

READY_JSON=$(curl -fsS http://127.0.0.1:8787/readyz)
if READY_JSON="$READY_JSON" /opt/kaix/.venv/bin/python -c \
    'import json, os; raise SystemExit(0 if json.loads(os.environ["READY_JSON"]).get("ready") is True else 1)'; then
  echo "    ✅ backend /readyz 200"
else
  echo "    ❌ backend /readyz 失败" >&2
  exit 1
fi

if sudo grep -q '^KAIX_DB_BACKEND=postgres' /etc/kaix.env 2>/dev/null \
    && ! READY_JSON="$READY_JSON" /opt/kaix/.venv/bin/python -c \
      'import json, os; raise SystemExit(0 if json.loads(os.environ["READY_JSON"]).get("database") == "postgres" else 1)'; then
  echo "    ❌ 环境要求 PostgreSQL，但运行中的后端未报告 PostgreSQL" >&2
  exit 1
fi

if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo "    ✅ web / 200"
else
  echo "    ❌ web / 失败" >&2
  exit 1
fi

if curl -fsS -o /dev/null http://127.0.0.1:3000/about; then
  echo "    ✅ web /about 200"
else
  echo "    ⚠️  web /about 未返回 200（非致命，不阻断部署）"
fi

if command -v caddy >/dev/null 2>&1 && systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  echo "    [远端] 检测到 Caddy，安装并重载 /etc/caddy/Caddyfile"
  sudo cp /opt/kaix/web/deploy/Caddyfile /etc/caddy/Caddyfile
  sudo caddy fmt --overwrite /etc/caddy/Caddyfile
  sudo systemctl reload caddy
fi

if systemctl list-unit-files nginx.service >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  echo "    [远端] 检测到 Nginx，安全同步限流配置并重载边缘代理"
  NGINX_CONFIG=/etc/nginx/conf.d/kaix.conf
  if [ -f "$NGINX_CONFIG" ]; then
    NGINX_BACKUP="${NGINX_CONFIG}.deploy-backup"
    sudo cp "$NGINX_CONFIG" "$NGINX_BACKUP"
    sudo sed -E -i \
      -e 's/zone=kaix_api:10m  rate=10r\/s/zone=kaix_api:10m  rate=30r\/s/' \
      -e 's/zone=kaix_api burst=40 nodelay/zone=kaix_api burst=100 nodelay/' \
      -e 's/client_max_body_size[[:space:]]+[0-9]+[mMgG];/client_max_body_size 320m;/' \
      -e 's/(X-Forwarded-For[[:space:]]+)\$proxy_add_x_forwarded_for/\1\$remote_addr/' \
      "$NGINX_CONFIG"
    if ! sudo grep -q '^[[:space:]]*limit_req_status[[:space:]]\+429;' "$NGINX_CONFIG"; then
      sudo sed -i \
        '/zone=kaix_auth:10m rate=2r\/s;/a limit_req_status 429;' \
        "$NGINX_CONFIG"
    fi
    # Certbot 写入的 443 server 块默认只有 "listen 443 ssl;"，不带 HTTP/2，
    # 浏览器全部资源都在 HTTP/1.1 上串行排队。幂等补上 http2 on;（nginx ≥1.25）。
    if ! sudo grep -q '^[[:space:]]*http2[[:space:]]\+on;' "$NGINX_CONFIG"; then
      sudo sed -i \
        '/listen 443 ssl; # managed by Certbot/a\    http2 on;' \
        "$NGINX_CONFIG"
    fi
    if ! sudo nginx -t; then
      echo "    ❌ Nginx 新配置无效，恢复部署前版本" >&2
      sudo cp "$NGINX_BACKUP" "$NGINX_CONFIG"
      sudo nginx -t
      exit 1
    fi
    sudo rm -f "$NGINX_BACKUP"
  else
    sudo nginx -t
  fi
  sudo systemctl reload nginx
fi

echo "    [远端] 公网边缘检查（防 Caddy/Nginx 未代理到新服务）"
PUBLIC_BASE="${PUBLIC_BASE:-https://machicity.com}"
PUBLIC_CURL=(curl -fsS --connect-timeout 5 --max-time 15 -o /dev/null)
if [ -n "${PUBLIC_RESOLVE_IP:-}" ]; then
  PUBLIC_HOST=$(python3 - <<'PY' "$PUBLIC_BASE"
from urllib.parse import urlparse
import sys
print(urlparse(sys.argv[1]).hostname or "")
PY
)
  if [ -n "$PUBLIC_HOST" ]; then
    PUBLIC_CURL+=(--resolve "$PUBLIC_HOST:443:$PUBLIC_RESOLVE_IP")
  fi
fi

if "${PUBLIC_CURL[@]}" "$PUBLIC_BASE/healthz"; then
  echo "    ✅ public /healthz 200"
else
  echo "    ❌ public /healthz 失败：请检查 Caddy/Nginx 是否把 /healthz 代理到 127.0.0.1:8787" >&2
  exit 1
fi

if "${PUBLIC_CURL[@]}" "$PUBLIC_BASE/api/guide/home?country=jp"; then
  echo "    ✅ public /api/guide/home 200"
else
  echo "    ❌ public /api/guide/home 失败：当前公网 API 没有代理到后端" >&2
  exit 1
fi

if "${PUBLIC_CURL[@]}" "$PUBLIC_BASE/guide"; then
  echo "    ✅ public /guide 200"
else
  echo "    ❌ public /guide 失败：当前公网 Web 没有代理到 Next.js" >&2
  exit 1
fi

if sudo grep -q '^KAIX_DB_BACKEND=postgres' /etc/kaix.env 2>/dev/null \
    && sudo systemctl cat machi-pg-backup.service >/dev/null 2>&1; then
  echo "    [远端] 新版本健康检查通过，执行 PostgreSQL 上线后备份"
  sudo systemctl start machi-pg-backup.service
fi

ls -dt /opt/kaix.backup-* 2>/dev/null | tail -n +5 | xargs -r sudo rm -rf

echo "    ✅ 部署完成（backend + web 已重启并通过健康检查）"
REMOTE

echo "==> [本地] 部署流程结束"
