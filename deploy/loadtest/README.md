# Backend load testing

Two tools, both **read-only** and meant to run **on the EC2 box against `127.0.0.1`**
so you measure the app, not Cloudflare / nginx rate-limiting.

- `loadtest.py` — zero-dependency (stdlib only). Already on the box via deploy.
- `k6-smoke.js` — richer ramping + thresholds; needs k6 installed.

```bash
# direct to one backend worker (no DB):
python3 loadtest.py --url http://127.0.0.1:8787/api/health --n 600 --c 30
# direct, DB-bound:
python3 loadtest.py --url 'http://127.0.0.1:8787/api/guide/home?country=jp&language=zh-CN' --n 400 --c 30
# through nginx, load-balanced across all workers:
python3 loadtest.py --url http://127.0.0.1/api/health --n 1000 --c 50
```

## Baseline — 2-core / 2 GB prod box, 2026-06-25

| Endpoint | Workers | Throughput | p50 | p99 |
|---|---|---|---|---|
| `/api/health` (no DB) | 1 | ~1440 req/s | 19 ms | 37 ms |
| `/api/guide/home` (110 KB, DB) | 1 | ~260 req/s | 69 ms | 939 ms |

A second worker (`:8788`) is now enabled (matches the 2 cores) behind the nginx
`least_conn` upstream. The web tier is **not** the bottleneck — heavy DB-bound
endpoints and the small instance are.

## What actually limits concurrency here (in priority order)

1. **Heavy read endpoints** (`/api/guide/home`, feed): big payloads + lots of
   query assembly, ~260 req/s/worker, p99 ~1 s under load. **Caching these
   (short TTL) is the single biggest scale win** — turns hundreds of req/s into
   thousands. (Not yet done — `server.py` was being edited by another session.)
2. **Instance size**: 2 vCPU / 2 GB. For comfortable low-thousands concurrent,
   move to ≥4 vCPU / ≥8 GB and/or a separate PostgreSQL instance + read replica.
3. **PG**: `max_connections=100`; keep `KAIX_PG_POOL_MAX × worker_count` well
   under that.

Rough capacity today: hundreds of concurrent users comfortably; ~1000 DAU with
bursty traffic is plausible; **thousands truly-concurrent needs #1 + #2.**
