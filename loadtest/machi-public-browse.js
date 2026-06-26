// Machi load test — anonymous public browse.
//
// Models the heaviest real traffic shape: logged-out visitors landing from
// search/social, hitting cached read endpoints (home feed, guide home, explore
// boards, listings, search). No auth, no writes.
//
// Run against a STAGING deploy of the production stack (Postgres + worker pool
// behind nginx), NOT the laptop SQLite dev server:
//
//   BASE_URL=https://staging.machicity.com STAGE=load k6 run machi-public-browse.js
//
// Stages: smoke (CI) → load (target 10k) → stress → spike. See README.md.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const STAGE = __ENV.STAGE || "smoke";

const readFail = new Rate("read_fail");
const cachedTrend = new Trend("cached_duration", true);

const PROFILES = {
  smoke: { stages: [{ duration: "30s", target: 10 }] },
  load: {
    stages: [
      { duration: "2m", target: 1000 },
      { duration: "3m", target: 3000 },
      { duration: "5m", target: 5000 },
      { duration: "5m", target: 10000 },
      { duration: "5m", target: 10000 },
      { duration: "2m", target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: "3m", target: 5000 },
      { duration: "3m", target: 10000 },
      { duration: "3m", target: 15000 },
      { duration: "3m", target: 0 },
    ],
  },
  spike: {
    stages: [
      { duration: "30s", target: 500 },
      { duration: "30s", target: 12000 },
      { duration: "2m", target: 12000 },
      { duration: "1m", target: 500 },
    ],
  },
};

export const options = {
  scenarios: { browse: { executor: "ramping-vus", startVUs: 0, ...PROFILES[STAGE] } },
  thresholds: {
    // Acceptance gate (loadtest/README.md):
    //   http_req_failed < 1%, public browse p95 < 2500ms, cached p95 < 300ms.
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:browse}": ["p(95)<2500"],
    cached_duration: ["p(95)<300"],
    read_fail: ["rate<0.01"],
  },
};

const cities = ["tokyo", "osaka", "sendai", "kyoto", "fukuoka"];
const types = ["secondhand", "rental", "job", "local_service"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function get(path, tag, { cached = false } = {}) {
  const res = http.get(`${BASE}${path}`, { tags: { kind: "browse", ep: tag } });
  readFail.add(res.status >= 500 || res.status === 0);
  if (cached) cachedTrend.add(res.timings.duration);
  check(res, { [`${tag} ok`]: (r) => r.status === 200 });
  return res;
}

export default function () {
  const r = Math.random() * 100;
  if (r < 10) group("health", () => get("/api/health", "health", { cached: true }));
  else if (r < 35) group("feed", () => get("/api/feed", "feed", { cached: true }));
  else if (r < 50) group("guide_home", () => get("/api/guide/home?country=jp", "guide_home", { cached: true }));
  else if (r < 62) group("explore", () => {
    get("/api/explore/hot", "explore_hot", { cached: true });
    get("/api/explore/topics", "explore_topics", { cached: true });
  });
  else if (r < 85) group("listings", () => {
    const res = get(`/api/listings?type=${pick(types)}&city_slug=${pick(cities)}&limit=24`, "listings");
    try {
      const items = res.json("items") || [];
      if (items.length) get(`/api/listings/${items[0].id}`, "listing_detail");
    } catch (e) { /* ignore parse errors under load */ }
  });
  else group("search", () => get(`/api/search?q=${encodeURIComponent("东京")}`, "search"));
  sleep(Math.random() * 2 + 0.5);
}
