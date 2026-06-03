#!/usr/bin/env bash

# Machi 项目 EC2 部署脚本（在「本地」运行）
#
# 用法：
#   bash web/deploy/deploy.sh

set -euo pipefail

# ================= 彻底写死，绝不出错 =================
EC2_HOST="ec2-user@43.207.143.245"
EC2_KEY="/Users/yaokai/Desktop/IT/ios/Machi2.pem"
LOCAL_PROJECT_DIR="/Users/yaokai/Desktop/IT/IOS/kaizi"
PROJECT_NAME="kaizi"
TARBALL="kaizi.tar.gz"
# =====================================================

echo "==> [本地] 项目目录: $LOCAL_PROJECT_DIR"
# 清理本地 Mac 隐藏垃圾
dot_clean "$LOCAL_PROJECT_DIR" 2>/dev/null || true
cd "$(dirname "$LOCAL_PROJECT_DIR")"

echo "==> [本地] 打包 $PROJECT_NAME/ (排除 .next / node_modules / kaix.db / .git 等)"
COPYFILE_DISABLE=1 tar \
  --exclude="$PROJECT_NAME/web/app/.next" \
  --exclude="$PROJECT_NAME/web/app/node_modules" \
  --exclude="$PROJECT_NAME/web/app/tsconfig.tsbuildinfo" \
  --exclude="$PROJECT_NAME/web/kaix.db" \
  --exclude="$PROJECT_NAME/web/kaix.db-shm" \
  --exclude="$PROJECT_NAME/web/kaix.db-wal" \
  --exclude="$PROJECT_NAME/web/.env" \
  --exclude="$PROJECT_NAME/web/.env.local" \
  --exclude="*/__pycache__" \
  --exclude="*/.DS_Store" \
  --exclude="*/.git" \
  --exclude="**/._*" \
  --exclude="*/.next" \
  -czf "$TARBALL" "$PROJECT_NAME/"

SIZE_MB=$(du -m "$TARBALL" | cut -f1)
echo "    包大小: ${SIZE_MB}MB"

echo "==> [本地] 上传到 $EC2_HOST"
scp -i "$EC2_KEY" -C -q "$TARBALL" "$EC2_HOST:/home/ec2-user/$TARBALL"

echo "==> [远端] 解压 + 备份 + 干净 build + smoke test + restart"
ssh -i "$EC2_KEY" "$EC2_HOST" bash <<'REMOTE'
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)

echo "    [远端] 备份当前 /opt/kaix → /opt/kaix.backup-$TS"
if [ -d /opt/kaix ]; then
  sudo cp -a /opt/kaix /opt/kaix.backup-$TS
fi

# 只保留最近 3 个备份
ls -dt /opt/kaix.backup-* 2>/dev/null | tail -n +4 | xargs -r sudo rm -rf

echo "    [远端] 保留生产数据（解压前先复制走）"
PRESERVE_DIR=$(mktemp -d)
if [ -f /opt/kaix/web/kaix.db ]; then
  sudo cp /opt/kaix/web/kaix.db* "$PRESERVE_DIR/" || true
fi
if [ -d /opt/kaix/web/media ]; then
  sudo cp -a /opt/kaix/web/media "$PRESERVE_DIR/media" || true
fi
if [ -f /opt/kaix/web/.env ]; then
  sudo cp -a /opt/kaix/web/.env "$PRESERVE_DIR/.env" || true
fi

echo "    [远端] 清空旧代码目录（防止已删除文件残留导致线上 build 失败）"
sudo rm -rf /opt/kaix
sudo mkdir -p /opt/kaix

echo "    [远端] 解压新代码（干净目录）"
sudo tar -xzf /home/ec2-user/kaizi.tar.gz -C /opt/kaix --strip-components=1

echo "    [远端] 还原生产数据"
if ls "$PRESERVE_DIR"/kaix.db* >/dev/null 2>&1; then
  sudo cp -a "$PRESERVE_DIR"/kaix.db* /opt/kaix/web/
fi
if [ -d "$PRESERVE_DIR/media" ]; then
  sudo rm -rf /opt/kaix/web/media
  sudo cp -a "$PRESERVE_DIR/media" /opt/kaix/web/media
fi
if [ -f "$PRESERVE_DIR/.env" ]; then
  sudo cp -a "$PRESERVE_DIR/.env" /opt/kaix/web/.env
fi
sudo rm -rf "$PRESERVE_DIR"

sudo chown -R kaix:kaix /opt/kaix

echo "    [远端] 强力清除解压出来的所有 Mac 隐藏乱码文件"
sudo find /opt/kaix/ -name "._*" -delete

cd /opt/kaix/web/app

echo "    [远端] npm ci"
sudo -u kaix npm ci

echo "    [远端] 强制干净 build（防止 Next.js 增量编译丢页面）"
sudo -u kaix rm -rf .next tsconfig.tsbuildinfo

echo "    [远端] npm run build"
sudo -u kaix npm run build

echo "    [远端] 检查所有路由都能编译（防 page.js 静默丢失）"
sudo -u kaix npm run check-build

echo "    [远端] 重启服务"
sudo systemctl restart kaix-backend.service
sleep 2
sudo systemctl restart kaix-web.service
sleep 3

echo "    [远端] 健康检查"
sudo systemctl is-active kaix-backend.service kaix-web.service

if curl -fsS http://127.0.0.1:8787/readyz >/dev/null; then
  echo "    ✅ backend /readyz 200"
else
  echo "    ❌ backend /readyz 失败" >&2
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
  echo "    [远端] 检测到 Nginx，重载边缘代理"
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "    [远端] 公网边缘检查（防 Caddy/Nginx 未代理到新服务）"
PUBLIC_BASE="${PUBLIC_BASE:-https://www.machicity.com}"
if curl -fsS --connect-timeout 5 --max-time 15 -o /dev/null "$PUBLIC_BASE/healthz"; then
  echo "    ✅ public /healthz 200"
else
  echo "    ❌ public /healthz 失败：请检查 Caddy/Nginx 是否把 /healthz 代理到 127.0.0.1:8787" >&2
  exit 1
fi

if curl -fsS --connect-timeout 5 --max-time 15 -o /dev/null "$PUBLIC_BASE/api/guide/home?country=jp"; then
  echo "    ✅ public /api/guide/home 200"
else
  echo "    ❌ public /api/guide/home 失败：当前公网 API 没有代理到后端" >&2
  exit 1
fi

if curl -fsS --connect-timeout 5 --max-time 15 -o /dev/null "$PUBLIC_BASE/guide"; then
  echo "    ✅ public /guide 200"
else
  echo "    ❌ public /guide 失败：当前公网 Web 没有代理到 Next.js" >&2
  exit 1
fi

echo "    ✅ 部署完成（backend + web 已重启并通过健康检查）"
REMOTE

echo "==> [本地] 部署流程结束"
