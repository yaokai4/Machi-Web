# Machi — 扩容与上线前压测手册

面向「活动期上万人访问」。后端是单进程 Python（ThreadingHTTPServer + SQLite WAL），
单进程吃不满多核（GIL），所以横向扩容 = 多后端实例 + nginx 负载均衡 + 共享同一个
SQLite WAL 库。本文给出**部署步骤**和**真实压测命令清单**（在生产/预发服务器上跑）。

---

## 1. 横向扩容（多后端实例）

代码已支持，无需改 `server.py`：实例端口由 `KAIX_PORT` 决定，定时爬虫由
`KAIX_ENABLE_SCHEDULERS` 开关（只让主实例跑）。

### 步骤（以 4 核机器、3 个 worker 为例）

```bash
# 1) 安装 worker 模板
sudo cp /opt/kaix/web/deploy/kaix-backend-worker@.service /etc/systemd/system/
sudo systemctl daemon-reload

# 2) 主实例（8787，已含调度器）确认在跑
sudo systemctl restart kaix-backend          # 现在显式带 KAIX_ENABLE_SCHEDULERS=1

# 3) 起 3 个 worker（8788/8789/8790，KAIX_ENABLE_SCHEDULERS=0）
sudo systemctl enable --now kaix-backend-worker@8788 \
     kaix-backend-worker@8789 kaix-backend-worker@8790

# 4) 让 nginx 把 worker 端口纳入负载均衡：编辑 deploy/nginx.conf，
#    取消 upstream kaix_backend 里 8788/8789/8790 三行的注释（默认是注释掉的，
#    这样单实例部署不会因死端口报错）。然后校验并重载：
sudo cp deploy/nginx.conf /etc/nginx/sites-available/kaix.conf
sudo nginx -t && sudo systemctl reload nginx

# 5) 核对每个实例健康
for p in 8787 8788 8789 8790; do curl -s localhost:$p/api/health; echo; done
```

> 经验法则：后端实例数 ≈ CPU 核数（给 Next.js 和 nginx 留 1 核）。Next.js 端
> 也可用 `next start` 多实例 + 另一个 nginx upstream 同理扩。

### 为什么安全
- SQLite **WAL** 支持「多读 + 单写」；多进程读各自并行（这正是 Machi 这种读多写少
  应用的甜点），写由 SQLite 文件锁 + `busy_timeout=5000` 串行化。
- 列迁移已做并发容错（`_ensure_columns` 忽略 duplicate column）。
- worker `Requires/After=kaix-backend.service`，主实例先完成建表/迁移再起 worker。

### 回滚
停 worker、把 nginx upstream 改回单 `server 127.0.0.1:8787;` 重载即可，零数据风险。

---

## 2. 压测命令清单（autocannon / k6）

先装：`npm i -g autocannon` 或 `brew install k6`。**对预发或受控时段的生产**跑。

### 2.1 autocannon（快速冒烟）

```bash
# 首页（Next SSR）
autocannon -c 200 -d 30 -p 10 https://machicity.com/

# Guide 首页 API（已加 30s 缓存，应几乎全部命中、p99 很低）
autocannon -c 500 -d 30 https://machicity.com/api/guide/home?country=jp

# Guide 服务/商品列表
autocannon -c 300 -d 30 "https://machicity.com/api/guide/products?country=jp&limit=20"

# 学校库 / 公司库
autocannon -c 300 -d 30 "https://machicity.com/api/guide/schools?country=jp&page=1&pageSize=20"
autocannon -c 300 -d 30 "https://machicity.com/api/guide/companies?country=jp&page=1&pageSize=20"

# 健康检查（不打库，作为基线 RPS 上限参考）
autocannon -c 100 -d 10 https://machicity.com/api/health
```

合格判读：`Non-2xx` ≈ 0；`/api/guide/home` p99 < ~300ms（命中缓存）；首页 p99 < ~2.5s；
全程无 502/504。若 429 偏多，是 nginx 限流（api 10r/s、auth 2r/s）在保护你——正常。

### 2.2 k6（更接近真实用户路径）

`loadtest.js`：
```js
import http from "k6/http";
import { check, sleep } from "k6";
export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", startVUs: 0,
      stages: [
        { duration: "1m", target: 300 },
        { duration: "3m", target: 1000 },   // 目标：1000 并发
        { duration: "1m", target: 0 },
      ] },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<2500"] },
};
const BASE = "https://machicity.com";
export default function () {
  check(http.get(`${BASE}/api/guide/home?country=jp`), { "guide 200": r => r.status === 200 });
  check(http.get(`${BASE}/api/guide/products?country=jp&limit=20`), { "products 200": r => r.status === 200 });
  sleep(1);
}
```
跑：`k6 run loadtest.js`

### 2.3 压测时另开一窗监控
```bash
watch -n2 'systemctl is-active kaix-backend kaix-backend-worker@8788 kaix-backend-worker@8789 kaix-backend-worker@8790; \
  free -m | head -2; \
  ss -s | head -3'
# DB 锁/慢请求看后端日志：
journalctl -u kaix-backend -u "kaix-backend-worker@*" -f | grep -Ei "locked|500|ms=[0-9]{4,}"
# nginx 5xx：
tail -f /var/log/nginx/error.log
```
出现大量 `database is locked` → 写竞争过高，提高 `PRAGMA busy_timeout` 或减少写路径。

---

## 3. Lighthouse / Core Web Vitals

```bash
npx lighthouse https://machicity.com/        --only-categories=performance,seo,best-practices,accessibility --view
npx lighthouse https://machicity.com/guide   --only-categories=performance,seo --view
npx lighthouse https://machicity.com/membership --only-categories=performance,seo --view
# 移动端模拟：
npx lighthouse https://machicity.com/guide --preset=mobile --view
```
目标：Performance ≥ 90、LCP < 2.5s、CLS < 0.1、INP < 200ms。

---

## 4. 上线前 checklist（快速）
- [ ] `curl -s https://machicity.com/api/health` 返回 `{"ok":true}`
- [ ] 多实例都 active：`systemctl is-active kaix-backend kaix-backend-worker@87{88,89,90}`
- [ ] `nginx -t` 通过、`upstream` 列了全部实例
- [ ] autocannon `/api/guide/home` 1000 连接无 5xx
- [ ] Lighthouse 首页/Guide Performance ≥ 90
- [ ] `journalctl` 压测期间无 `database is locked` 洪水
- [ ] 磁盘：`df -h`（WAL 文件 + media 增长）
- [ ] Stripe webhook 用 Stripe CLI `stripe trigger checkout.session.completed` 验幂等
