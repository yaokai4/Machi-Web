#!/usr/bin/env node
// Route health scanner.
//
// Replaces the ad-hoc audit scanner whose "bad" detector over-matched: it
// flagged healthy pages as broken merely because they contained prices,
// numbers, or status words. This version only reports a route as BAD when it
// shows a *real* failure, and every BAD result carries a precise `reason` so a
// human can verify it instantly.
//
// BAD only if ANY of:
//   - HTTP status >= 500                         (reason: http_5xx)
//   - HTTP status == 404                         (reason: http_404)
//   - the Next.js dev error overlay is present   (reason: next_error_overlay)
//   - "Application error: a client-side exception…" (reason: client_exception)
//   - "Unhandled Runtime Error" / "Internal Server Error" (reason: runtime_error)
//   - the app's own hard error/empty copy:
//       "页面暂时无法加载" / "出了点问题"           (reason: app_error_state)
//   - an essentially empty document               (reason: empty_body)
//
// Prices, numbers, "暂不可用", and ordinary status words are NOT errors.
//
// Usage:
//   node scripts/route-scan.mjs                       # scans default routes at http://127.0.0.1:3000
//   ROUTE_SCAN_BASE=http://127.0.0.1:8080 node scripts/route-scan.mjs
//   node scripts/route-scan.mjs --base http://127.0.0.1:3000 --routes /home,/explore,/guide
//
// Requires the Next server (`npm run start` or `npm run dev`) to be running.

import process from "node:process";

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

const BASE = (argValue("--base") || process.env.ROUTE_SCAN_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

const DEFAULT_ROUTES = [
  "/",
  "/login",
  "/register",
  "/home",
  "/explore",
  "/guide",
  "/messages",
  "/notifications",
  "/settings",
  "/wallet",
  "/membership",
  "/search",
  "/drafts",
  "/me",
  "/listings/create",
  "/about",
  "/contact",
  "/faq",
  "/help",
  "/privacy",
  "/terms",
];

const routes = (argValue("--routes")?.split(",").map((s) => s.trim()).filter(Boolean)) || DEFAULT_ROUTES;

// Precise failure signatures. Each entry is [reason, test(htmlLowercased)].
const ERROR_SIGNATURES = [
  ["next_error_overlay", (h) => h.includes("nextjs__container_errors") || h.includes("data-nextjs-dialog") || h.includes("__next_error__")],
  ["client_exception", (h) => h.includes("application error: a client-side exception")],
  ["runtime_error", (h) => h.includes("unhandled runtime error") || h.includes("internal server error")],
  ["app_error_state", (h) => h.includes("页面暂时无法加载") || h.includes("出了点问题")],
];

function detect(status, html) {
  if (status >= 500) return "http_5xx";
  if (status === 404) return "http_404";
  const lower = (html || "").toLowerCase();
  for (const [reason, test] of ERROR_SIGNATURES) {
    if (test(lower)) return reason;
  }
  // Strip tags; a real page renders *some* visible text.
  const text = (html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 20) return "empty_body";
  return null;
}

async function scan(route) {
  const url = `${BASE}${route}`;
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "machi-route-scan" } });
    const html = await res.text();
    const reason = detect(res.status, html);
    return { route, status: res.status, ok: reason === null, reason };
  } catch (err) {
    return { route, status: 0, ok: false, reason: `fetch_failed:${err?.code || err?.message || "error"}` };
  }
}

async function main() {
  console.error(`route-scan: ${routes.length} routes @ ${BASE}`);
  const results = [];
  for (const route of routes) {
    const r = await scan(route);
    results.push(r);
    // JSONL — one machine-readable line per route.
    console.log(JSON.stringify(r));
  }
  const bad = results.filter((r) => !r.ok);
  console.error("");
  console.error(`route-scan: ${results.length - bad.length}/${results.length} OK`);
  if (bad.length) {
    console.error("BAD routes:");
    for (const r of bad) console.error(`  ${r.route}  status=${r.status}  reason=${r.reason}`);
    process.exit(1);
  }
  console.error("All scanned routes healthy.");
}

main();
