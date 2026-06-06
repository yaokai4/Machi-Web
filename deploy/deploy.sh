#!/usr/bin/env bash

# Machi 项目 EC2 部署脚本（在「本地」运行）
#
# 用法：
#   bash web/deploy/deploy.sh
#
# 当前生产服务器：
#   ssh -i /Users/yaokai/Desktop/IT/ios/Machi2.pem ec2-user@13.231.24.239

set -euo pipefail

# ================= 彻底写死，绝不出错 =================
EC2_HOST="ec2-user@13.231.24.239"
EC2_KEY="/Users/yaokai/Desktop/IT/ios/Machi2.pem"
LOCAL_PROJECT_DIR="/Users/yaokai/Desktop/IT/IOS/kaizi"
PROJECT_NAME="kaizi"
TARBALL="kaizi-web.tar.gz"
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
rsync -az --partial --inplace -e "ssh -i $EC2_KEY" "$TARBALL" "$EC2_HOST:/home/ec2-user/$TARBALL"

REMOTE_SHA=$(ssh -i "$EC2_KEY" "$EC2_HOST" "sha256sum /home/ec2-user/$TARBALL | awk '{print \$1}'")
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "❌ 远端包校验失败: local=$LOCAL_SHA remote=$REMOTE_SHA" >&2
  exit 1
fi
echo "    远端 SHA256 校验通过"

echo "==> [远端] 解压到新目录 + 干净 build + 原子替换 + smoke test"
ssh -i "$EC2_KEY" "$EC2_HOST" "TARBALL=/home/ec2-user/$TARBALL bash" <<'REMOTE'
set -eEuo pipefail

TS=$(date +%Y%m%d-%H%M%S)
CURRENT=/opt/kaix
RELEASE=/opt/kaix.release-$TS
BACKUP=/opt/kaix.backup-$TS
FAILED=/opt/kaix.failed-$TS
SWAPPED=0

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

install_systemd_units() {
  echo "    [远端] 安装/刷新 systemd 服务并设置开机自启"
  sudo cp /opt/kaix/web/deploy/kaix-backend.service /etc/systemd/system/kaix-backend.service
  sudo cp /opt/kaix/web/deploy/kaix-web.service /etc/systemd/system/kaix-web.service
  if [ -f /opt/kaix/web/deploy/kaix-backend-worker@.service ]; then
    sudo cp /opt/kaix/web/deploy/kaix-backend-worker@.service /etc/systemd/system/kaix-backend-worker@.service
  fi
  sudo systemctl daemon-reload
  sudo systemctl enable kaix-backend.service kaix-web.service
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
test -d "$RELEASE/web/app"

echo "    [远端] 强力清除解压出来的所有 Mac 隐藏乱码文件"
sudo find "$RELEASE" -name "._*" -delete
restore_env_for_build
sudo chown -R kaix:kaix "$RELEASE"

cd "$RELEASE/web/app"

echo "    [远端] npm ci"
sudo -u kaix npm ci

echo "    [远端] 强制干净 build（防止 Next.js 增量编译丢页面）"
sudo -u kaix rm -rf .next tsconfig.tsbuildinfo

echo "    [远端] npm run build"
sudo -u kaix npm run build

echo "    [远端] 检查所有路由都能编译（防 page.js 静默丢失）"
sudo -u kaix npm run check-build

echo "    [远端] 停服务并做最终数据同步"
sudo systemctl stop kaix-web.service || true
sudo systemctl stop kaix-backend.service || true
restore_runtime_data
sudo chown -R kaix:kaix "$RELEASE"

echo "    [远端] 切换 release"
if [ -d "$CURRENT" ]; then
  sudo mv "$CURRENT" "$BACKUP"
fi
sudo mv "$RELEASE" "$CURRENT"
SWAPPED=1

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
PUBLIC_BASE="${PUBLIC_BASE:-https://machicity.com}"
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

ls -dt /opt/kaix.backup-* 2>/dev/null | tail -n +5 | xargs -r sudo rm -rf

echo "    ✅ 部署完成（backend + web 已重启并通过健康检查）"
REMOTE

echo "==> [本地] 部署流程结束"
