# Machi 压测套件 (k6)

面向「活动期上万人同时在线」的上线前压测。这些脚本针对**预发(staging)**环境的
**生产形态后端**（PostgreSQL + 多 worker + nginx 负载均衡），**不要**对着本地
SQLite dev server 跑，也**不要**未经批准对生产暴力压测。

> 部署「多 worker + nginx」的步骤见 [`../deploy/SCALING_AND_LOADTEST.md`](../deploy/SCALING_AND_LOADTEST.md)。

## 脚本

| 脚本 | 覆盖 | 说明 |
| --- | --- | --- |
| `machi-public-browse.js` | 匿名公开浏览 | health / feed / guide-home / explore / listings / search，纯读、走缓存 |
| `machi-authenticated-core.js` | 登录核心环 | feed / 通知 / guide todos / 会话 / 收藏(写) — 需 `TOKEN` |
| `machi-sse-messages.js` | 实时 SSE 扇出 | 大量并发 `GET /api/events` 长连接，探 `KAIX_SSE_MAX_CONNECTIONS` 上限 — 需 `TOKEN` |

## 安装 k6

本机默认**没有** k6（`which k6` 为空）。安装：

```bash
brew install k6          # macOS
# 或 https://k6.io/docs/get-started/installation/
```

## 运行

```bash
# 匿名浏览（先用 smoke 验证脚本可跑，再上 load）
BASE_URL=https://staging.machicity.com STAGE=smoke k6 run machi-public-browse.js
BASE_URL=https://staging.machicity.com STAGE=load  k6 run machi-public-browse.js

# 登录核心环（需要 staging 账号的 session token）
BASE_URL=https://staging.machicity.com TOKEN=<token> STAGE=load k6 run machi-authenticated-core.js

# SSE 实时（VUS 调到目标在线数的一部分；超过单 worker 上限会返回 503 sse_saturated）
BASE_URL=https://staging.machicity.com TOKEN=<token> VUS=1000 k6 run machi-sse-messages.js
```

`STAGE` 取值：`smoke`(CI/冒烟) → `load`(目标 10k) → `stress`(12–15k) → `spike`(突刺)。

## 验收阈值（脚本内已编码为 k6 thresholds，红线即 fail）

- `http_req_failed` < 1%
- 公开浏览 p95 < 2500ms
- 命中缓存的读接口 p95 < 300ms（`cached_duration`）
- 登录核心读 p95 < 1000ms
- 写路径 p95 < 1200ms
- 无 DB 锁风暴（观察 PG `pg_locks` / 慢查询日志，不应出现锁等待堆积）
- 无 5xx 尖刺（`http_req_failed` 之外，盯后端 `kaix.access` 5xx 行）

SSE 容量结论按实测读出：
`最大并发 SSE ≈ KAIX_SSE_MAX_CONNECTIONS × worker 数`（默认 600/worker）。
目标在线数 ÷ 600 = 所需 worker 下限。

## 实测结果

> **状态：未运行。** 本机未安装 k6，且当前没有可用的 staging（本地后端 `/api/health`
> 返回 `database: sqlite`，不是生产形态）。在拿到「PG + 多 worker」的 staging 之前，
> 任何容量数字都只能是外推——按纪律**不外推、不编造**。
>
> 跑完后，把每条场景的 P50/P95/P99、错误率、各端点 RPS、以及「实测可稳定支撑 N
> 并发在线」追加到本节，N 用实测值。

## 与现有资产的关系

- 根目录 `loadtest.k6.js` 是早期单文件混合场景脚本，仍可用；本目录把它按
  浏览 / 登录核心 / SSE 三类拆开，便于单独定位瓶颈与 CI 冒烟。
- 轻量本地并发冒烟（非万人压测）见 `../scripts/smoke_concurrency.py`。
