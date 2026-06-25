#!/usr/bin/env python3
"""Dependency-free load tester for the Machi backend.

Run it ON the EC2 box against 127.0.0.1 so it hits the Python backend (and the
nginx upstream) directly, bypassing Cloudflare's bot rule and per-IP rate limit
— otherwise you measure Cloudflare/nginx, not the app.

    # single backend worker, pure-server endpoint (no DB):
    python3 loadtest.py --url http://127.0.0.1:8787/api/health --n 600 --c 30

    # DB-bound read endpoint:
    python3 loadtest.py --url 'http://127.0.0.1:8787/api/guide/home?country=jp&language=zh-CN' --n 400 --c 30

    # through nginx (load-balanced across all workers), expect some 429s from
    # the app/edge rate limiter under burst:
    python3 loadtest.py --url http://127.0.0.1/api/health --n 1000 --c 50

Only hit READ-ONLY endpoints on production — never POST/DELETE against live data.

Baseline on the 2-core / 2 GB prod box (2026-06-25, single worker):
    /api/health      ~1440 req/s   p50 19ms  p99 37ms
    /api/guide/home   ~260 req/s   p50 69ms  p99 939ms  (heavy 110 KB payload; cache me)
"""
from __future__ import annotations

import argparse
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor


def hit(url: str, timeout: float) -> tuple[object, float]:
    t = time.time()
    try:
        r = urllib.request.urlopen(url, timeout=timeout)
        r.read()
        return r.status, time.time() - t
    except urllib.error.HTTPError as e:
        return e.code, time.time() - t
    except Exception:
        return "ERR", time.time() - t


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--n", type=int, default=500, help="total requests")
    ap.add_argument("--c", type=int, default=30, help="concurrency")
    ap.add_argument("--timeout", type=float, default=15.0)
    args = ap.parse_args()

    lat: list[float] = []
    codes: dict[object, int] = {}
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.c) as ex:
        for code, dt in ex.map(lambda _: hit(args.url, args.timeout), range(args.n)):
            lat.append(dt)
            codes[code] = codes.get(code, 0) + 1
    wall = time.time() - t0
    lat.sort()
    pct = lambda q: lat[min(len(lat) - 1, int(len(lat) * q))] * 1000

    print(f"url={args.url}")
    print(f"total={args.n} concurrency={args.c} wall={wall:.2f}s  throughput={args.n / wall:.1f} req/s")
    print(f"latency ms: p50={pct(.5):.0f} p90={pct(.9):.0f} p95={pct(.95):.0f} p99={pct(.99):.0f} max={max(lat) * 1000:.0f}")
    print(f"status codes: {codes}")
    ok = codes.get(200, 0)
    print(f"success rate: {ok / args.n * 100:.1f}%")


if __name__ == "__main__":
    main()
