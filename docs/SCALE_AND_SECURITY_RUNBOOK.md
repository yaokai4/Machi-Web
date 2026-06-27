# Machi — Scale & Security Runbook (R0–R3, P1–P6, H8)

This is the operator playbook for everything that the audit fixes require but
which runs on **your infrastructure** (prod Postgres, EC2/nginx, AWS, GitHub),
not in the app repo. The code changes themselves (C1–C6, H3–H6, account-deletion
PII, content policy, report dedup) are already merged and tested; the items below
are what *you* run to deploy and to scale.

---

## 0. Deploy the security changeset (do this first)

| Item | Action | Owner |
|---|---|---|
| **Migrations 74/75** (reports UNIQUE, H5) | Auto-apply on next deploy via `run_migrations`. Verify with `SELECT MAX(version) FROM schema_migrations` ⇒ should be ≥ 75. | deploy |
| **H2 — restore PG UNIQUE constraints** | On the prod host with prod env: `python3 scripts/migrate_restore_pg_constraints.py` (DRY RUN — review dup counts), then `--apply`. It auto-de-dups only safe relationship tables; it will REFUSE to touch `users`/`conversations` and ask you to resolve those by hand. | you |
| **C2 — Apple Root CA G3 pin** | The pinned SHA-256 default `63343abf…3e9179` is **VERIFIED CORRECT** — it matches the macOS System trust store's "Apple Root CA - G3" byte-for-byte, and the EC P-384 verification path was tested against the real cert. Still run **one real Sandbox StoreKit purchase end-to-end** to confirm the full leaf→intermediate→G3 chain validates in your prod config before launch. Override via `APPLE_ROOT_CA_SHA256` env only if Apple rotates roots. | you |
| **H4 — content filter wordlists** | Set `KAIX_BANNED_WORDS` (comma-separated, per-locale ja/zh/en slur+scam lists from Trust & Safety). The seed only covers a few high-signal scam terms. | you |
| **CORS** | Set `KAIX_ALLOWED_ORIGINS` explicitly to your web origin(s). Prod now defaults to `https://machicity.com,https://www.machicity.com` instead of reflecting any Origin. | you |
| **H7 — leaked GitHub PAT** | **Revoke** at https://github.com/settings/tokens, `git credential-osxkeychain erase`, switch both repos to SSH deploy keys. Audit recent push history. | you (cannot be done from code) |
| **Apple IAP regression test** | Now gated in CI (`scripts/test_apple_iap_hardening.py`). | done |

---

## APNs production deploy (code is fully wired; only prod env + .p8 remain)

APNs is wired end-to-end: iOS requests permission, registers, and uploads the
device token (`PushTokenService`); the `aps-environment` entitlement resolves
(`development`/`production` per config); `web/server_apns.py` signs an ES256
provider JWT and pushes on DM / inquiry / social events. Local dev already has
`web/.env` + `web/secrets/AuthKey_6D3L795V68.p8`. To turn it on in PROD:

1. Copy the APNs key to the prod server, OUTSIDE the repo, e.g.
   `scp AuthKey_6D3L795V68.p8 ec2-user@35.79.109.50:/opt/kaix/secrets/` (chmod 600).
2. Set the prod env (the deploy's env mechanism, NOT git):
   `APNS_TEAM_ID=P22K8NF89K`, `APNS_KEY_ID=6D3L795V68`,
   `APNS_KEY_P8_PATH=/opt/kaix/secrets/AuthKey_6D3L795V68.p8`,
   `APNS_BUNDLE_ID=com.yaokai.kaizi`, `APNS_ENVIRONMENT=production`.
   (`AuthKey_6D3L795V68.p8` is the APNs key; the other `AuthKey_*.p8` /
   `SubscriptionKey_*.p8` are for other Apple services — do NOT use them here.)
3. Restart workers; confirm the log line `apns push delivery enabled`. Send a DM
   to a device with a real (non-simulator) build to verify killed-app delivery.

NEVER commit any `.p8` to git — both repos' `.gitignore` already exclude
`secrets/` and `*.p8`; re-check before pushing.

## P1 — Immediate scale wins (days, low risk, no new infra)

The five hard blockers to 10k concurrent (ranked): in-process SSE hub (`server.py`
`EventHub`/`HUB`), per-process `_CACHE`, per-process `_RL_STATE` rate limiter, no
PgBouncer, and the (now-fixed) `settle_guide_order` money race.

1. **Turn on the workers you already wrote.** `nginx.conf` already stubs 8789/8790.
   Provision a ≥4–8 vCPU host, run 6 backend workers + Next.js + nginx. Keep
   `KAIX_ENABLE_SCHEDULERS=1` on **exactly one** worker.
2. **Right-size the PG pool before PgBouncer.** 6 workers × `KAIX_PG_POOL_MAX=20`
   = 120 conns. Either raise Postgres `max_connections` to ~200 **or** lower
   `KAIX_PG_POOL_MAX` so `workers × pool < max_connections − headroom`.
3. **CDN + cache headers** for public static/Next.js assets (user media already
   goes through the private S3 relay). Put CloudFront in front; set long
   `Cache-Control` on hashed assets.
4. **Confirm keep-alive end-to-end** (nginx already keepalives upstream).
5. **EXPLAIN the k6 hot endpoints** — run `loadtest/machi-public-browse.js` +
   `machi-authenticated-core.js` against staging; capture slow queries.

**Exit criteria:** both k6 suites at target RPS, p95 < 300 ms, zero 5xx, no
"too many connections".

---

## P2 — Redis (shared state + async jobs)

Today every worker has its OWN cache, rate-limit bucket, and SSE subscriber map,
so the rate limiter's effective cap = configured × worker-count and cache writes
don't propagate. Introduce Redis as the shared backbone:

- **Shared cache** — replace `_CACHE` reads/writes with Redis GET/SETEX (keep the
  in-process map as an L1 with a short TTL).
- **Shared rate limiter** — move `_RL_STATE` token buckets to Redis (atomic
  `INCR`+`EXPIRE` or a Lua token-bucket) so limits hold across workers/instances.
- **Shared sessions** (optional) — lets you scale workers statelessly.
- **Async job queue** — push notifications (APNs), email (Resend), and SSE
  fan-out should be enqueued, not done inline in the request. A single worker
  drains the queue. This removes the in-process SSE hub blocker.

Integration points: `server.py` `_CACHE` (~`:2547`), `_RL_STATE`/`rate_check`
(~`:2674`), `EventHub`/`HUB`, and the APNs/email call sites.

---

## P3 — Database scaling

- **PgBouncer** (transaction pooling) in front of Postgres so N workers don't each
  hold a pool; backend pool points at PgBouncer.
- **Read replicas** for heavy read endpoints (feed/explore/guide) once writes are
  isolated.
- **Indexes** on hot columns (most already exist; verify `posts(region_code,
  created_at)`, `messages(conversation_id, created_at)`, `payment_webhooks(event_id)`,
  wallet ledger `(user_id)`).
- **PITR (critical, Medium finding):** prod Postgres has **no point-in-time
  recovery** — a restore can lose up to 24 h of paid transactions. Enable WAL
  archiving (or move to managed RDS/Aurora with automated backups + PITR).

---

## P4 — Observability (do alongside P1)

- **Error tracking** (Sentry/GlitchTip) — wrap the request handler's top-level
  except.
- **Metrics** — request count/latency/5xx per route, pool saturation, queue depth.
- **Slow-query log** — already has `statement_timeout` + slow-request logging;
  ship those to a dashboard.
- **Health/SLO** — `/readyz` exists; add alerting on p95 + 5xx + pool exhaustion.

---

## P5 — Full statelessness + load balancer

Once sessions/cache/rate-limit live in Redis and jobs are queued, the app process
is stateless → run M instances behind an ALB/nginx LB; autoscale on CPU/latency.

---

## P6 — Load testing (gate every phase)

`loadtest/` + `loadtest.k6.js` already exist. Make "k6 green at target RPS,
p95 < 300 ms, 0 5xx" the gate before promoting each phase.

---

## H8 — server.py modularization (R3, debt, not a launch blocker)

`server.py` is 35k lines with a 1,166-line `_route()` if/elif over 639 branches.
Do NOT rewrite — extract incrementally behind the existing dispatch:

1. Build a registry: `ROUTES: dict[(method, pattern)] -> handler`.
2. Move handlers into domain modules (`routes_auth.py`, `routes_payments.py`,
   `routes_guide.py`, `routes_listings.py`, `routes_messaging.py`, `routes_admin.py`)
   — `server_schema.py` / `server_regions.py` / `server_apns.py` already prove
   extraction works.
3. Start with the **payments + auth** route groups (highest blast radius), one PR
   per group, behavior-preserving, with the existing tests as the safety net.

---

## R2 — Guide moat (multi-language + freshness)

See `docs` Guide proposal. Two launch-grade content gaps:
- **Multi-language is fabricated** (`localize_guide_article_payload` returns canned
  en/ja bodies). Add `translation_group_id`, real per-language rows, select by
  requested language with explicit fallback + a visible "untranslated" label.
- **Freshness signals are dead** (`verified_at`/`stale_after_days`/`source_url` are
  rendered but never written). Add them to the admin `field_map` + seed, add a
  nightly staleness sweep, and require a non-empty `verified_at` + `source_url`
  before `status='published'` for visa/tax/medical categories.

---

## R3 — Engineering hygiene

- Convert the 27 `scripts/test_*.py` into a single `pytest` suite; the CI
  workflow already runs a curated subset (now incl. `test_apple_iap_hardening`).
- Structured Guide article blocks (steps/cost/documents/risk) per the proposal.
- Add the advisory FOREIGN KEYs (`migrate_restore_pg_constraints.py --show-fks`)
  during a maintenance window after confirming no orphan rows.
