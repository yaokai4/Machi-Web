# Machi Web + Backend 部署到 Amazon Linux 2023

这份文档按一台 EC2 单机部署来写：Nginx 对外监听 80/443，Next.js Web 跑在本机 `127.0.0.1:3000`，Python 后端跑在本机 `127.0.0.1:8787`，SQLite 数据库在 `/opt/kaix/web/kaix.db`。

## 0. EC2 和域名准备

在 AWS 控制台先做好这些：

1. 启动一台 Amazon Linux 2023 EC2。
2. 安全组入站规则只开放：
   - `22/tcp`：你的固定 IP，用来 SSH。
   - `80/tcp`：`0.0.0.0/0` 和 `::/0`。
   - `443/tcp`：`0.0.0.0/0` 和 `::/0`。
3. 域名 DNS 添加 A 记录到 EC2 公网 IP：
   - `machicity.com -> 13.231.24.239`
   - `www.machicity.com -> 13.231.24.239`
4. 确认不要把 `3000` 和 `8787` 暴露到公网，这两个端口只给 Nginx 在本机访问。

下面命令默认用 `ec2-user` 登录服务器。

当前生产服务器一键部署命令在本地 Mac 执行：

```bash
bash web/deploy/deploy.sh
```

直接 SSH 到当前生产服务器：

```bash
ssh -i /Users/yaokai/Desktop/IT/ios/Machi2.pem ec2-user@13.231.24.239
```

## 1. 设置变量

先把这些变量改成你的真实值，然后整段复制执行：

```bash
export APP_USER="kaix"
export APP_DIR="/opt/kaix"
export REPO_URL="https://github.com/YOUR_NAME/YOUR_REPO.git"
export DOMAIN="machicity.com"
export WWW_DOMAIN="www.machicity.com"
export EMAIL="admin@machicity.com"
```

如果你的仓库是私有仓库，先在服务器配置 GitHub deploy key，或者临时用带权限的 SSH 地址：

```bash
export REPO_URL="git@github.com:YOUR_NAME/YOUR_REPO.git"
```

## 2. 安装系统依赖

Amazon Linux 2023 使用 `dnf`。Next.js 15 用 Node 22 比较稳，AL2023 官方包里有 `nodejs22` 和 `nodejs22-npm`。

```bash
sudo dnf update -y
sudo dnf install -y git nginx sqlite tar gzip python3 python3-pip python3-devel augeas-libs nodejs22 nodejs22-npm

# Optional: only needed if you enable real WeChat Pay / Alipay providers
# (server.py is otherwise standard-library only). Safe to install always.
sudo python3 -m pip install -r web/requirements.txt

sudo alternatives --set node /usr/bin/node-22 || true
sudo alternatives --set npm /usr/bin/npm-22 || true

node -v
npm -v
python3 --version
nginx -v
```

如果 `node -v` 不是 `v22.x`，执行：

```bash
alternatives --list | grep node
sudo alternatives --config node
sudo alternatives --config npm
```

## 3. 创建运行用户和目录

```bash
sudo useradd --system --create-home --shell /sbin/nologin "$APP_USER" || true
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
```

## 4. 拉代码

首次部署：

```bash
sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
```

如果目录里已经有代码，改用：

```bash
cd "$APP_DIR"
sudo -u "$APP_USER" git fetch --all --prune
sudo -u "$APP_USER" git pull --ff-only
```

## 5. 创建生产环境变量

下面会生成 `/etc/kaix.env`。请确认 `DOMAIN` 和 `WWW_DOMAIN` 是真实域名。

```bash
sudo tee /etc/kaix.env > /dev/null <<EOF
KAIX_ENV=production
KAIX_PASSWORD_PEPPER=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
KAIX_ALLOWED_ORIGINS=https://${DOMAIN},https://${WWW_DOMAIN}
KAIX_HOST=127.0.0.1
KAIX_PORT=8787
KAIX_SESSION_TTL_DAYS=30
KAIX_MAX_UPLOAD_BYTES=52428800
KAIX_MAX_JSON_BYTES=262144
NEXT_PUBLIC_API_BASE=https://${DOMAIN}
NEXT_PUBLIC_SITE_URL=https://${DOMAIN}
EOF

sudo chown root:root /etc/kaix.env
sudo chmod 600 /etc/kaix.env
sudo sed -n '1,80p' /etc/kaix.env
```

不要把 `/etc/kaix.env` 提交进 git。

## 6. 安装前端依赖并构建

```bash
cd "$APP_DIR/web/app"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run lint
sudo -u "$APP_USER" npm run type-check
sudo -u "$APP_USER" npm run build
```

如果服务器内存很小，构建时可能被系统杀掉。建议 EC2 至少 2GB 内存；1GB 机器可以临时加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 7. 检查后端语法

```bash
cd "$APP_DIR"
sudo -u "$APP_USER" env PYTHONPYCACHEPREFIX=/tmp/kaix-pycache python3 -m py_compile web/server.py
```

## 8. 安装 systemd 服务

项目里已经有服务文件，路径是：

- `/opt/kaix/web/deploy/kaix-backend.service`
- `/opt/kaix/web/deploy/kaix-web.service`

复制并启动：

```bash
sudo cp "$APP_DIR/web/deploy/kaix-backend.service" /etc/systemd/system/kaix-backend.service
sudo cp "$APP_DIR/web/deploy/kaix-web.service" /etc/systemd/system/kaix-web.service

sudo systemctl daemon-reload
sudo systemctl enable --now kaix-backend.service
sudo systemctl enable --now kaix-web.service

sudo systemctl status kaix-backend.service --no-pager
sudo systemctl status kaix-web.service --no-pager
```

本机健康检查：

```bash
curl -fsS http://127.0.0.1:8787/healthz
curl -fsS http://127.0.0.1:3000/ | head
```

看日志：

```bash
sudo journalctl -u kaix-backend.service -n 120 --no-pager
sudo journalctl -u kaix-web.service -n 120 --no-pager
```

## 9. 配置 Nginx HTTP 反向代理

先用 HTTP 配置把站点跑通，等第 10 步签 SSL 后再自动切 HTTPS。

```bash
sudo tee /etc/nginx/conf.d/kaix.conf > /dev/null <<EOF
limit_req_zone \$binary_remote_addr zone=kaix_api:10m  rate=10r/s;
limit_req_zone \$binary_remote_addr zone=kaix_auth:10m rate=2r/s;

upstream kaix_backend {
    server 127.0.0.1:8787;
    keepalive 32;
}

upstream kaix_web {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    client_max_body_size 60m;
    large_client_header_buffers 4 16k;

    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    location = /api/events {
        proxy_pass http://kaix_backend;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        gzip off;
    }

    location ~ ^/api/auth/ {
        limit_req zone=kaix_auth burst=10 nodelay;
        proxy_pass http://kaix_backend;
    }

    location /api/ {
        limit_req zone=kaix_api burst=40 nodelay;
        proxy_pass http://kaix_backend;
    }

    location /media/ {
        proxy_pass http://kaix_backend;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    location = /healthz {
        proxy_pass http://kaix_backend;
        access_log off;
    }

    location = /readyz {
        proxy_pass http://kaix_backend;
        access_log off;
    }

    location /_next/static/ {
        proxy_pass http://kaix_web;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://kaix_web;
    }

    gzip on;
    gzip_proxied any;
    gzip_types application/javascript application/json text/css text/plain text/xml image/svg+xml;
    gzip_min_length 1024;

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
EOF

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

公网检查：

```bash
curl -I "http://${DOMAIN}"
curl -fsS "http://${DOMAIN}/healthz"
```

## 10. 配置 HTTPS 证书

用 Python venv 安装 Certbot，避免 AL2023 包源缺少 `python3-certbot-nginx` 时卡住。

```bash
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot

sudo certbot --nginx \
  -d "$DOMAIN" \
  -d "$WWW_DOMAIN" \
  --redirect \
  -m "$EMAIL" \
  --agree-tos \
  --no-eff-email

sudo nginx -t
sudo systemctl reload nginx
curl -I "https://${DOMAIN}"
```

创建自动续期：

```bash
sudo tee /etc/systemd/system/certbot-renew.service > /dev/null <<'EOF'
[Unit]
Description=Renew Let's Encrypt certificates

[Service]
Type=oneshot
ExecStart=/usr/local/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

sudo tee /etc/systemd/system/certbot-renew.timer > /dev/null <<'EOF'
[Unit]
Description=Run certbot renew twice daily

[Timer]
OnCalendar=*-*-* 03,15:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

## 11. 上线后完整检查

```bash
curl -I "https://${DOMAIN}"
curl -fsS "https://${DOMAIN}/healthz"
curl -fsS "https://${DOMAIN}/readyz"

sudo systemctl is-active kaix-backend.service
sudo systemctl is-active kaix-web.service
sudo systemctl is-active nginx

sudo journalctl -u kaix-backend.service -n 80 --no-pager
sudo journalctl -u kaix-web.service -n 80 --no-pager
sudo journalctl -u nginx -n 80 --no-pager
```

浏览器手动检查：

1. 打开 `https://machicity.com`，确认官网样式完整。
2. 打开 `/register`，确认地区选择有国家、省/州、城市。
3. 注册或登录，确认 `/home`、`/explore`、`/settings`、`/c/jp.tokyo.tokyo?channel=hot` 正常。
4. 切换地区后刷新页面，确认首页、发现页、城市频道都同步。

## 12. 日常更新发布

每次改代码后在服务器执行：

```bash
cd "$APP_DIR"
sudo -u "$APP_USER" git pull --ff-only

cd "$APP_DIR/web/app"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run lint
sudo -u "$APP_USER" npm run type-check
sudo -u "$APP_USER" npm run build

sudo systemctl restart kaix-backend.service
sudo systemctl restart kaix-web.service
sudo nginx -t
sudo systemctl reload nginx

curl -fsS "https://${DOMAIN}/healthz"
curl -I "https://${DOMAIN}"
```

## 13. 数据库备份和恢复

手动备份 SQLite：

```bash
sudo mkdir -p /var/backups/kaix
sudo sqlite3 "$APP_DIR/web/kaix.db" ".backup '/var/backups/kaix/kaix-$(date +%F-%H%M%S).db'"
sudo ls -lh /var/backups/kaix
```

恢复前先停服务：

```bash
sudo systemctl stop kaix-backend.service kaix-web.service
sudo cp /var/backups/kaix/YOUR_BACKUP.db "$APP_DIR/web/kaix.db"
sudo chown "$APP_USER:$APP_USER" "$APP_DIR/web/kaix.db"
sudo systemctl start kaix-backend.service kaix-web.service
```

建议加一个每日备份 cron：

```bash
sudo tee /etc/cron.d/kaix-backup > /dev/null <<EOF
17 3 * * * root mkdir -p /var/backups/kaix && sqlite3 ${APP_DIR}/web/kaix.db ".backup '/var/backups/kaix/kaix-\$(date +\\%F-\\%H\\%M\\%S).db'" && find /var/backups/kaix -type f -name 'kaix-*.db' -mtime +14 -delete
EOF
```

## 14. 常见故障

### 14.1 官网空白或样式丢失

通常是 Web 服务没重启或旧缓存。

```bash
cd "$APP_DIR/web/app"
sudo -u "$APP_USER" npm run build
sudo systemctl restart kaix-web.service
sudo systemctl reload nginx
curl -I "https://${DOMAIN}"
```

### 14.2 登录后页面报错

先看后端是否活着：

```bash
curl -fsS http://127.0.0.1:8787/healthz
sudo journalctl -u kaix-backend.service -n 160 --no-pager
```

再看前端：

```bash
curl -fsS http://127.0.0.1:3000/ | head
sudo journalctl -u kaix-web.service -n 160 --no-pager
```

### 14.3 Nginx 502

说明 Nginx 找不到后端或前端：

```bash
sudo systemctl status kaix-backend.service --no-pager
sudo systemctl status kaix-web.service --no-pager
sudo ss -lntp | grep -E ':3000|:8787'
```

### 14.4 证书签不下来

检查 DNS 和 80 端口：

```bash
dig +short "$DOMAIN"
curl -I "http://${DOMAIN}"
sudo nginx -t
sudo journalctl -u nginx -n 120 --no-pager
```

### 14.5 回滚到上一个提交

```bash
cd "$APP_DIR"
sudo -u "$APP_USER" git log --oneline -5
sudo -u "$APP_USER" git checkout COMMIT_ID

cd "$APP_DIR/web/app"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build
sudo systemctl restart kaix-backend.service kaix-web.service
sudo systemctl reload nginx
```
