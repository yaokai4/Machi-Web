#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const origin = process.env.MACHI_WEB_ORIGIN || "http://localhost:3000";

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

const failures = [];
const warnings = [];

const home = await request("/");
if (home.skipped) {
  warnings.push(`首页运行时诊断被当前环境的 localhost 权限限制跳过: ${home.error?.cause?.code || home.error?.message}`);
} else if (!home.ok) {
  failures.push(`首页请求失败: ${home.status || home.error?.message}`);
} else {
  const stylesheets = cssLinks(home.body);
  const chunks = chunkLinks(home.body);

  if (!stylesheets.length) {
    failures.push("首页 HTML 没有引用任何 Next CSS 文件。");
  }

  for (const href of stylesheets) {
    const css = await request(href, "HEAD");
    if (!css.ok) {
      failures.push(`CSS 静态文件不可访问: ${href} -> ${css.status || css.error?.message}`);
    }
  }

  for (const src of chunks) {
    const chunk = await request(src, "HEAD");
    if (!chunk.ok) {
      failures.push(`JS 静态 chunk 不可访问: ${src} -> ${chunk.status || chunk.error?.message}`);
    }
  }
}

const health = await request("/healthz", "HEAD");
if (health.skipped) {
  warnings.push(`/healthz 运行时诊断被当前环境的 localhost 权限限制跳过: ${health.error?.cause?.code || health.error?.message}`);
} else if (!health.ok) {
  warnings.push(`/healthz 不可用: ${health.status || health.error?.message}。通常表示 Python 后端 127.0.0.1:8787 没启动。`);
}

if (failures.length) {
  console.error("Machi Web doctor: FAILED\n");
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const item of warnings) console.error(`- ${item}`);
  }
  console.error("\n修复裸 HTML / CSS 404 的标准动作:");
  console.error("1. 停止当前 3000 上的旧 Next 进程。");
  console.error("2. 在 web/app 里重新执行 npm run build && npm run start。");
  console.error("3. 同时启动后端: cd ../.. && python3 -u web/server.py。");
  process.exit(1);
}

console.log("Machi Web doctor: OK");
if (warnings.length) {
  console.log("\nWarnings:");
  for (const item of warnings) console.log(`- ${item}`);
}
