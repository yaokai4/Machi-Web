// k6 load profile for the Machi backend.  Install k6 (https://k6.io), then:
//
//   BASE=http://127.0.0.1:8787 k6 run k6-smoke.js      # one worker, direct
//   BASE=http://127.0.0.1      k6 run k6-smoke.js      # through nginx (all workers)
//
// Run it ON the EC2 box against 127.0.0.1 so Cloudflare's bot rule and per-IP
// rate limit don't distort the numbers. READ-ONLY endpoints only — never write
// to live production data from a load test.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE || "http://127.0.0.1:8787";
const errors = new Rate("app_errors");

export const options = {
  scenarios: {
    // Warm baseline, then ramp to find the knee.
    ramp: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 50 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    // Tune these to your SLO. Heavy endpoints (guide/home, feed) tail badly on
    // the small box — split them into their own run if you want stricter gates.
    http_req_duration: ["p(95)<800"],
    app_errors: ["rate<0.02"],
  },
};

const READ_PATHS = [
  "/api/health",
  "/api/guide/home?country=jp&language=zh-CN",
  "/api/discover/hot?scope=prefecture",
];

export default function () {
  const path = READ_PATHS[Math.floor(Math.random() * READ_PATHS.length)];
  const res = http.get(`${BASE}${path}`);
  // 429 is the app/edge protecting itself — count it as a soft error, not a hard fail.
  check(res, { "2xx/429": (r) => r.status === 200 || r.status === 429 });
  errors.add(res.status !== 200 && res.status !== 429);
  sleep(Math.random() * 0.5);
}
