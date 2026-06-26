// Machi load test — authenticated core loop.
//
// Models a signed-in user working the app: feed, notifications, guide home +
// todos, conversations, and a light write path (favorite + inquiry). Requires a
// real session token from a STAGING account.
//
//   BASE_URL=https://staging.machicity.com TOKEN=<session-token> STAGE=load \
//     k6 run machi-authenticated-core.js
//
// Get a token by logging into staging and copying the bearer the web client
// stores, or via POST /api/auth/login against a seeded staging test user.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";
const STAGE = __ENV.STAGE || "smoke";

if (!TOKEN) {
  throw new Error("machi-authenticated-core.js requires TOKEN=<staging session token>");
}

const readFail = new Rate("read_fail");
const writeFail = new Rate("write_fail");
const writeTrend = new Trend("write_duration", true);

const PROFILES = {
  smoke: { stages: [{ duration: "30s", target: 10 }] },
  load: {
    stages: [
      { duration: "2m", target: 500 },
      { duration: "3m", target: 1500 },
      { duration: "5m", target: 3000 },
      { duration: "5m", target: 3000 },
      { duration: "2m", target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: "3m", target: 2000 },
      { duration: "3m", target: 5000 },
      { duration: "3m", target: 0 },
    ],
  },
};

export const options = {
  scenarios: { core: { executor: "ramping-vus", startVUs: 0, ...PROFILES[STAGE] } },
  thresholds: {
    // Acceptance gate (loadtest/README.md):
    //   http_req_failed < 1%, authenticated core p95 < 1000ms, write p95 < 1200ms.
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<1000"],
    write_duration: ["p(95)<1200"],
    read_fail: ["rate<0.01"],
    write_fail: ["rate<0.005"],
  },
};

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const types = ["secondhand", "rental", "job", "local_service"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function get(path, tag) {
  const res = http.get(`${BASE}${path}`, { headers, tags: { kind: "read", ep: tag } });
  readFail.add(res.status >= 500 || res.status === 0);
  check(res, { [`${tag} ok`]: (r) => r.status === 200 });
  return res;
}

export default function () {
  const r = Math.random() * 100;
  if (r < 25) group("feed", () => get("/api/feed", "feed"));
  else if (r < 40) group("notifications", () => {
    get("/api/notifications", "notifications");
  });
  else if (r < 60) group("guide", () => {
    get("/api/guide/home?country=jp", "guide_home");
    get("/api/guide/todos", "guide_todos");
  });
  else if (r < 75) group("messages", () => get("/api/messages/conversations", "conversations"));
  else group("write", () => {
    const list = http.get(`${BASE}/api/listings?type=${pick(types)}&limit=10`, { headers, tags: { kind: "read", ep: "list_for_write" } });
    let id;
    try {
      const items = list.json("items") || [];
      if (items.length) id = items[Math.floor(Math.random() * items.length)].id;
    } catch (e) { /* ignore */ }
    if (!id) return;
    const fav = http.post(`${BASE}/api/listings/${id}/favorite`, null, { headers, tags: { kind: "write", ep: "favorite" } });
    writeTrend.add(fav.timings.duration);
    writeFail.add(fav.status >= 500 || fav.status === 0);
  });
  sleep(Math.random() * 2 + 0.5);
}
