# Machi — Docker 部署（可选）

> 现在的 **systemd + nginx/Caddy** 部署照常可用，这套 Docker 是**可选替代**。
> 优点：一键回滚（换镜像 tag）、环境一致、扩容简单、CI/CD 友好。
> 适用：以后上多台机器 / 想要 CI 构建产物 / 本地与线上完全一致时最划算。

## 架构

| 服务 | 作用 | 说明 |
|---|---|---|
| `caddy` | 边缘 / 自动 HTTPS / 负载均衡 | 监听 80/443，`/api` `/media` `/healthz` → backend 池，其余 → web |
| `backend` | HTTP 后端池（**可扩容**） | `KAIX_ENABLE_SCHEDULERS=0`，`docker compose up --scale backend=N` |
| `scheduler` | 单例后台任务 | `KAIX_ENABLE_SCHEDULERS=1`，跑爬虫调度，**不进负载均衡池** |
| `web` | Next.js（`next start`） | 静态资源由 Caddy 长缓存 |

**SQLite 关键点**：`backend` 池 + `scheduler` 共享同一个 `kaix-db` 命名卷（同一文件系统 → WAL 文件锁生效，多读单写）。媒体共享 `kaix-media` 卷。**密钥只在运行时从 `web/.env` 注入（`env_file`），不进镜像**。

## 首次启动

```bash
cd web
cp .env.example .env          # 填真实密钥（KAIX_PASSWORD_PEPPER 等；切勿提交）

# 本地测试（HTTP，:80）
MACHI_DOMAIN=:80 docker compose -f deploy/docker-compose.yml up -d --build

# 生产（自动 HTTPS，需域名已解析到本机）
MACHI_DOMAIN=www.machicity.com ACME_EMAIL=hi@machicity.com \
  docker compose -f deploy/docker-compose.yml up -d --build
```

## 扩容（抗高并发）

```bash
# 把 HTTP 后端池扩到 4 个实例；scheduler 仍是 1 个（不重复爬）
docker compose -f deploy/docker-compose.yml up -d --scale backend=4
```
Caddy 的 `dynamic a backend 8787` 会每隔几秒重新解析 backend 的副本 IP，新实例自动进负载均衡，无需改配置。

## 迁移已有数据（从 systemd 部署搬过来）

```bash
# 把现有库与媒体灌进命名卷
docker run --rm -v machi_kaix-db:/data -v /opt/kaix/web:/src alpine \
  sh -c 'cp /src/kaix.db* /data/'
docker run --rm -v machi_kaix-media:/m -v /opt/kaix/web/media:/src alpine \
  sh -c 'cp -a /src/. /m/'
```

## 运维

```bash
docker compose -f deploy/docker-compose.yml ps           # 状态
docker compose -f deploy/docker-compose.yml logs -f backend
curl -s localhost/api/health                             # 健康
docker compose -f deploy/docker-compose.yml down         # 停（卷保留，数据不丢）
```

## 回滚

镜像打了 tag 后：`docker compose ... up -d` 指向上一个 tag 即可。数据在卷里，不受影响。

## 备份

```bash
# 用 SQLite 在线备份（不锁库）
docker compose -f deploy/docker-compose.yml exec scheduler \
  python3 -c "import sqlite3; sqlite3.connect('/data/kaix.db').backup(sqlite3.connect('/data/backup.db'))"
```
