// Machi load test — SSE realtime fan-out (messages/notifications).
//
// Opens many concurrent Server-Sent Events streams (GET /api/events) to probe
// the realtime tier: long-lived connections per worker, the SSE saturation cap
// (KAIX_SSE_MAX_CONNECTIONS, default 600/worker → returns 503 sse_saturated),
// and file-descriptor / thread pressure under fan-out.
//
//   BASE_URL=https://staging.machicity.com TOKEN=<session-token> VUS=1000 \
//     k6 run machi-sse-messages.js
//
// Each VU mints a short-lived event token (POST /api/events/token), then holds
// the SSE stream open for HOLD seconds while a separate writer (the
// authenticated-core test, or manual sends) generates events. With per-worker
// caps in place, the meaningful capacity number is:
//     max concurrent SSE ≈ KAIX_SSE_MAX_CONNECTIONS × worker_count.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";
const VUS = Number(__ENV.VUS || 200);
const HOLD = Number(__ENV.HOLD || 30); // seconds to keep each stream open
const DURATION = __ENV.DURATION || "3m";

if (!TOKEN) {
  throw new Error("machi-sse-messages.js requires TOKEN=<staging session token>");
}

const tokenFail = new Rate("sse_token_fail");
const streamSaturated = new Rate("sse_saturated");
const streamOpenFail = new Rate("sse_open_fail");

export const options = {
  scenarios: {
    sse: { executor: "constant-vus", vus: VUS, duration: DURATION },
  },
  thresholds: {
    // Token mint must stay healthy; saturation (503) is expected past the cap
    // and is reported, not failed, so you can read off real capacity.
    sse_token_fail: ["rate<0.01"],
    sse_open_fail: ["rate<0.02"],
  },
};

const authHeaders = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

export default function () {
  // 1) Mint an event token bound to the session.
  const tokenRes = http.post(`${BASE}/api/events/token`, null, { headers: authHeaders, tags: { ep: "events_token" } });
  const okToken = tokenRes.status === 200;
  tokenFail.add(!okToken);
  check(tokenRes, { "events/token 200": () => okToken });
  if (!okToken) {
    sleep(1);
    return;
  }
  let eventToken;
  try {
    eventToken = tokenRes.json("token");
  } catch (e) {
    tokenFail.add(true);
    return;
  }

  // 2) Open the SSE stream. k6's http client reads to completion, so we use a
  //    bounded timeout = HOLD to emulate a client that holds the stream open.
  const streamRes = http.get(`${BASE}/api/events?token=${encodeURIComponent(eventToken)}`, {
    headers: { Accept: "text/event-stream" },
    timeout: `${HOLD + 5}s`,
    tags: { ep: "events_stream" },
  });
  const saturated = streamRes.status === 503;
  streamSaturated.add(saturated);
  // A held SSE stream usually ends via our timeout (status 0) — that's success
  // for this probe. 5xx other than the documented 503 cap is a real failure.
  streamOpenFail.add(streamRes.status >= 500 && streamRes.status !== 503);
  check(streamRes, {
    "stream not hard-failed": (r) => r.status === 200 || r.status === 0 || r.status === 503,
  });
  sleep(1);
}
