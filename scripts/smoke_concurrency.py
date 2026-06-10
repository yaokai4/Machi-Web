#!/usr/bin/env python3
"""Run a bounded anonymous read smoke test with real concurrent requests."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


DEFAULT_PATHS = (
    "/healthz",
    "/api/feed?mode=recommend&limit=5",
    "/api/listings?type=secondhand&city_slug=tokyo&limit=8",
    "/api/guide/home?country=jp",
)


def percentile(values: list[float], value: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil((value / 100) * len(ordered)) - 1))
    return ordered[index]


def synthetic_client_ip(index: int, pool_size: int) -> str:
    client = index % pool_size
    return f"198.18.{client // 254}.{client % 254 + 1}"


def fetch(url: str, timeout: float, forwarded_for: str = "") -> tuple[int, float, str]:
    started = time.perf_counter()
    headers = {"User-Agent": "machi-smoke/1.0"}
    if forwarded_for:
        headers["X-Forwarded-For"] = forwarded_for
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(1024)
            status = response.status
            error = ""
    except urllib.error.HTTPError as exc:
        status = exc.code
        error = str(exc)
    except Exception as exc:
        status = 0
        error = str(exc)
    return status, (time.perf_counter() - started) * 1000, error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--requests", type=int, default=500)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--max-p95-ms", type=float, default=1500)
    parser.add_argument(
        "--client-ip-pool",
        type=int,
        default=0,
        help="Simulate this many clients with X-Forwarded-For. Use only when directly calling a trusted local backend.",
    )
    args = parser.parse_args()
    if args.client_ip_pool < 0 or args.client_ip_pool > 65536:
        parser.error("--client-ip-pool must be between 0 and 65536")

    base = args.base_url.rstrip("/")
    urls = [base + DEFAULT_PATHS[index % len(DEFAULT_PATHS)] for index in range(args.requests)]
    results: list[tuple[int, float, str]] = []
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [
            pool.submit(
                fetch,
                url,
                args.timeout,
                synthetic_client_ip(index, args.client_ip_pool) if args.client_ip_pool else "",
            )
            for index, url in enumerate(urls)
        ]
        for future in as_completed(futures):
            results.append(future.result())

    durations = [duration for _, duration, _ in results]
    failures = [(status, error) for status, _, error in results if not 200 <= status < 300]
    report = {
        "requests": len(results),
        "concurrency": args.concurrency,
        "failures": len(failures),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "mean_ms": round(statistics.fmean(durations), 1),
        "p50_ms": round(percentile(durations, 50), 1),
        "p95_ms": round(percentile(durations, 95), 1),
        "p99_ms": round(percentile(durations, 99), 1),
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    if failures:
        print(json.dumps({"sample_failures": failures[:5]}, ensure_ascii=False))
        return 1
    return 0 if report["p95_ms"] <= args.max_p95_ms else 2


if __name__ == "__main__":
    raise SystemExit(main())
