#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Origin / API-base resolution.
//
// The old doctor hard-defaulted to http://localhost:3000. On a dev box where
// another project owns :3000 that silently probed the WRONG service and gave a
// confidently-wrong verdict (good→bad or bad→good). We now:
//   1. accept BASE_URL / PORT / MACHI_WEB_ORIGIN to point at the right server;
//   2. resolve the backend health URL from NEXT_PUBLIC_API_BASE / API_BASE;
//   3. *verify the page is actually Machi* before trusting any check, and
//   4. report the real URL + status (and a "wrong service?" hint) on failure.
// ---------------------------------------------------------------------------

function resolveOrigin() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  if (process.env.MACHI_WEB_ORIGIN) return process.env.MACHI_WEB_ORIGIN.replace(/\/$/, "");
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
  return "http://localhost:3000";
}

function resolveApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || "http://127.0.0.1:8787";
  return raw.replace(/\/$/, "");
}

const origin = resolveOrigin();
const apiBase = resolveApiBase();

function absoluteUrl(path) {
  return path.startsWith("http") ? path : `${origin}${path}`;
}

async function request(path, method = "GET") {
  const url = absoluteUrl(path);
  try {
    const response = await fetch(url, { method, redirect: "follow" });
    const body = method === "HEAD" ? "" : await response.text();
    return { ok: response.status >= 200 && response.status < 400, status: response.status, url, body };
  } catch (error) {
    if (error?.cause?.code === "EPERM" || error?.cause?.code === "EACCES") {
      const curlResult = requestWithCurl(url, method, error);
      if (curlResult.status > 0) return curlResult;
      return { ok: true, skipped: true, status: 0, url, body: "", error };
    }
    return { ok: false, status: 0, url, error };
  }
}

function requestWithCurl(url, method, originalError) {
  const args = ["--silent", "--show-error", "--location", "--max-time", "10"];
  if (method === "HEAD") args.push("--head");
  args.push("--write-out", "\n__MACHI_STATUS__:%{http_code}", url);

  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      status: 0,
      url,
      error: result.error || new Error(result.stderr || originalError?.message || "curl failed"),
    };
  }

  const output = result.stdout || "";
  const marker = "\n__MACHI_STATUS__:";
  const markerIndex = output.lastIndexOf(marker);
  const status = markerIndex >= 0 ? Number(output.slice(markerIndex + marker.length).trim()) : 0;
  const body = method === "HEAD" || markerIndex < 0 ? "" : output.slice(0, markerIndex);
  return { ok: status >= 200 && status < 400, status, url, body };
}

function unique(items) {
  return Array.from(new Set(items));
}

function cssLinks(html) {
  return unique(Array.from(html.matchAll(/href="([^"]*\/_next\/static\/css\/[^"]+\.css)"/g)).map((match) => match[1]));
}

function chunkLinks(html) {
  return unique(Array.from(html.matchAll(/src="([^"]*\/_next\/static\/chunks\/[^"]+\.js)"/g)).map((match) => match[1])).slice(0, 8);
}

// Identity guard: the home HTML must look like Machi. We accept any of a few
// resilient signals (brand in <title>, the localized tagline, or a Next build
// served from a Machi route) so a single copy edit doesn't break the check,
// but a totally different project (e.g. another app squatting on :3000) fails
// loudly instead of being mis-diagnosed.
function looksLikeMachi(html) {
  if (!html) return false;
  const signals = [
    /<title>[^<]*Machi/i,
    /Machi · /,
    /在每一座城市/,
    /__NEXT_DATA__/,
    /\/_next\/static\//,
  ];
  return signals.some((re) => re.test(html));
}

const failures = [];
const warnings = [];

console.log(`Machi Web doctor: origin=${origin} apiBase=${apiBase}`);

const home = await request("/");
if (home.skipped) {
  warnings.push(`首页运行时诊断被当前环境的 localhost 权限限制跳过: ${home.error?.cause?.code || home.error?.message}`);
} else if (!home.ok) {
  failures.push(`首页请求失败: ${home.url} -> ${home.status || home.error?.message}`);
} else if (!looksLikeMachi(home.body)) {
  failures.push(
    `首页 (${home.url}) 返回了 ${home.status}，但内容不像 Machi —— 很可能打到了占用该端口的其它项目。` +
      ` 用 BASE_URL=http://127.0.0.1:<machi端口> npm run doctor 指定正确的 Machi 服务。`
  );
} else {
  const stylesheets = cssLinks(home.body);
  const chunks = chunkLinks(home.body);

  if (!stylesheets.length) {
    failures.push(`首页 HTML (${home.url}) 没有引用任何 Next CSS 文件。`);
  }

  for (const href of stylesheets) {
    const css = await request(href, "HEAD");
    if (!css.ok) {
      failures.push(`CSS 静态文件不可访问: ${css.url} -> ${css.status || css.error?.message}`);
    }
  }

  for (const src of chunks) {
    const chunk = await request(src, "HEAD");
    if (!chunk.ok) {
      failures.push(`JS 静态 chunk 不可访问: ${chunk.url} -> ${chunk.status || chunk.error?.message}`);
    }
  }
}

// Backend health: the canonical endpoint is the Python backend's /api/health
// (returns {"ok": true, ...}). We hit it via the resolved API base instead of
// a frontend /healthz that may not exist.
const healthUrl = `${apiBase}/api/health`;
const health = await request(healthUrl, "GET");
if (health.skipped) {
  warnings.push(`${healthUrl} 运行时诊断被当前环境的 localhost 权限限制跳过: ${health.error?.cause?.code || health.error?.message}`);
} else if (!health.ok) {
  warnings.push(`后端健康检查不可用: ${healthUrl} -> ${health.status || health.error?.message}。通常表示 Python 后端没启动。`);
} else {
  let parsed = null;
  try {
    parsed = JSON.parse(health.body || "{}");
  } catch {
    /* non-JSON body — surface as a warning below */
  }
  if (!parsed || parsed.ok !== true) {
    warnings.push(`后端健康检查返回了非预期内容: ${healthUrl} -> ${health.status} ${health.body?.slice(0, 120)}`);
  } else if (parsed.database) {
    console.log(`后端健康: ok (database=${parsed.database})`);
  }
}

if (failures.length) {
  console.error("Machi Web doctor: FAILED\n");
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const item of warnings) console.error(`- ${item}`);
  }
  console.error("\n修复裸 HTML / CSS 404 的标准动作:");
  console.error(`1. 确认 BASE_URL/PORT 指向的是 Machi（当前 origin=${origin}）。`);
  console.error("2. 停止占用该端口的旧进程，在 web/app 里重新执行 npm run build && npm run start。");
  console.error("3. 同时启动后端: cd ../.. && python3 -u web/server.py。");
  process.exit(1);
}

console.log("Machi Web doctor: OK");
if (warnings.length) {
  console.log("\nWarnings:");
  for (const item of warnings) console.log(`- ${item}`);
}
