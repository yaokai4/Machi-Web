# KaiX 上线手册

把这份手册当作"全新一台 Ubuntu/Debian 服务器" → "machicity.com 正式可用"的完整路径。所有内容已经在本地验证过 — 复制粘贴照做就行。

## 0. 一台服务器需要的东西

- Ubuntu 22.04+ 或 Debian 12+
- 至少 2 vCPU / 2GB RAM（万人级别的最低门槛，建议 4GB+）
- 一个解析到这台服务器的域名（这里以 `machicity.com` 为例，当前服务器 IP 是 `13.231.24.239`）
- 25 / 80 / 443 端口对外开放
- root / sudo 权限

## 1. 系统初始化

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install python3 python3-pip sqlite3 git nginx certbot python3-certbot-nginx ufw fail2ban
# Node 20+ — 用 NodeSource 比 apt 仓库新
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v && npm -v && python3 -V

# 防火墙
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw --force enable
```

## 2. 部署用户与目录

```bash
sudo useradd -m -r -s /usr/sbin/nologin kaix
sudo mkdir -p /opt/kaix
sudo chown kaix:kaix /opt/kaix

# 把仓库放到 /opt/kaix/
sudo -u kaix git clone https://github.com/YOUR_ORG/kaizi.git /opt/kaix/repo
sudo ln -sfn /opt/kaix/repo/web /opt/kaix/web
```

## 3. 环境变量

```bash
sudo cp /opt/kaix/web/deploy/kaix.env.example /etc/kaix.env
sudo nano /etc/kaix.env   # 填上真实 pepper、域名、API base
sudo chown root:kaix /etc/kaix.env
sudo chmod 640 /etc/kaix.env

# 生成 pepper
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`KAIX_PASSWORD_PEPPER` 必须真实填，否则后端启动时主动拒绝运行。

## 4. 安装 & 构建 Web 端

```bash
cd /opt/kaix/web/app
sudo -u kaix npm ci --no-audit --no-fund
sudo -u kaix NEXT_PUBLIC_API_BASE=https://machicity.com NEXT_PUBLIC_SITE_URL=https://machicity.com npm run build
```

## 5. systemd

```bash
sudo cp /opt/kaix/web/deploy/kaix-backend.service /etc/systemd/system/
sudo cp /opt/kaix/web/deploy/kaix-web.service     /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kaix-backend kaix-web
sudo systemctl status kaix-backend kaix-web
```

## 6. nginx + TLS

```bash
sudo cp /opt/kaix/web/deploy/nginx.conf /etc/nginx/sites-available/kaix.conf
# 修改里面的 server_name
sudo ln -sfn /etc/nginx/sites-available/kaix.conf /etc/nginx/sites-enabled/kaix.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt — 自动续期由 certbot 装的 systemd timer 完成
sudo certbot --nginx -d machicity.com -d www.machicity.com --agree-tos -m admin@machicity.com
sudo nginx -t && sudo systemctl reload nginx
```

## 7. 备份

```bash
sudo install -d -o kaix -g kaix /var/backups/kaix
sudo crontab -u kaix -e
# 添加：每天 03:17 UTC 备份
17 3 * * *  KAIX_BACKUP_DIR=/var/backups/kaix /opt/kaix/web/scripts/backup.sh >> /var/log/kaix-backup.log 2>&1
```

把 `/var/backups/kaix/` 用 restic / borg / rsync 推到对象存储（B2 / R2 / S3）。

## 8. fail2ban

针对密码爆破再加一层。`/etc/fail2ban/jail.d/kaix.conf`：

```ini
[kaix-auth]
enabled = true
filter  = kaix-auth
action  = iptables-multiport[name=kaix-auth, port="http,https"]
logpath = /var/log/nginx/access.log
maxretry = 30
findtime = 60
bantime = 3600
```

`/etc/fail2ban/filter.d/kaix-auth.conf`：

```ini
[Definition]
failregex = ^<HOST> .* "POST /api/auth/login.*" 401
ignoreregex =
```

```bash
sudo systemctl restart fail2ban
```

## 9. 监控 / 报警

最便宜可行的组合：

- **UptimeRobot**（免费）每分钟拉 `https://machicity.com/healthz`，挂了发邮件 / Webhook。
- **日志**：journalctl 已经自带轮转。日志聚合可上 Better Stack / Grafana Cloud Free 把 journal 推上去。
- **错误**：现在错误日志里有 `request_id`，从 nginx 的 X-Request-Id 也能拿到，便于客户排查时溯源。要更系统化可以接 Sentry。

`journalctl -u kaix-backend -f` 实时看后端。

## 10. 升级（零停机）

```bash
cd /opt/kaix/repo && sudo -u kaix git pull
cd /opt/kaix/web/app && sudo -u kaix npm ci --no-audit --no-fund
sudo -u kaix NEXT_PUBLIC_API_BASE=https://machicity.com NEXT_PUBLIC_SITE_URL=https://machicity.com npm run build
sudo systemctl restart kaix-backend kaix-web
```

后端 systemd 重启 ≈ 1 秒。Next.js 重启 ≈ 3 秒。nginx 期间会向上游 503 但 keepalive 保持，浏览器自带重试，用户感知很轻。

## 11. 高可用 & 横向扩展（未来）

当前架构 = 单台 Python + SQLite，对万人量级是够用的（SQLite 在 WAL 模式下读并发非常好；写并发会被 DB_LOCK 串行化，但写 QPS 通常 < 50/s，不会成瓶颈）。

走到 10 万人或要做高可用，路径如下，不影响 API 形状：

1. **SQLite → Postgres**：把 server.py 里 `sqlite3.connect` 换成 `psycopg`；schema 几乎可以直接复用（删掉 `text` → 用 `text not null` 即可）。所有 API 形状不变，App / Web 不需要改一行代码。
2. **Python → 多 worker**：把 ThreadingHTTPServer 换成 gunicorn + uvicorn workers（迁到 FastAPI），或者保留这个 server.py 但前面加 N 个进程 + nginx upstream。
3. **媒体 → 对象存储**：`/api/media/upload` 改成签发 S3 presigned URL，客户端直接上传。`media` 表里只存 URL。
4. **SSE → WebSocket / Redis Pub/Sub**：现在 SSE 是进程内 broadcast，多 worker 时需要一个 message bus。Redis 一台就够万人级。

## 12. 管理员引导（防止首注册被抢）

新机器从空库部署时，会自动把第一位注册用户提升为 admin。生产环境如果担心被抢注册，可以在 `/etc/kaix.env` 里加：

```bash
KAIX_ADMIN_BOOTSTRAP_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
```

设置后，只有 `POST /api/auth/register` body 里携带 `bootstrap_token` 与上述值一致的请求才会被提升为 admin；其它注册一律为 member。完成首位 admin 注册后建议把这个变量删掉或换值。

## 13. 数据保护清单

- ✅ 密码 PBKDF2-SHA256 120k + pepper（不可逆）
- ✅ Session token 256 bit 随机，30 天 TTL
- ✅ HTTPS 强制（HSTS 1 年）
- ✅ CSRF：用 Bearer 不走 cookie，天然免疫
- ✅ XSS：CSP `script-src 'self'`、所有渲染都用 React 转义
- ✅ Frame：`frame-ancestors 'none'`
- ✅ 速率限制：进程内 + nginx 双层
- ✅ 软删除：post / comment / message / notification / conversation 都不直接 DROP，可恢复
- ✅ 日报备份：脚本 + cron + offsite 同步

## 14. 验收脚本

```bash
# 检查所有关键端点
curl -fsS https://machicity.com/healthz
curl -fsS https://machicity.com/readyz
curl -fsS -o /dev/null -w "/login %{http_code}\n"  https://machicity.com/login
curl -fsS -o /dev/null -w "/home  %{http_code}\n"  https://machicity.com/home
curl -fsS -o /dev/null -w "/robots %{http_code}\n" https://machicity.com/robots.txt
curl -fsS -o /dev/null -w "/sitemap %{http_code}\n" https://machicity.com/sitemap.xml

# 检查安全头都到了
curl -fsS -D - -o /dev/null https://machicity.com/home | grep -iE "strict-transport|content-security|x-frame|x-content"
```

应该看到全部 200，HSTS + CSP + X-Frame-Options + X-Content-Type-Options 都在响应里。

---

跑完整套清单，KaiX 就可以面向公众了。
