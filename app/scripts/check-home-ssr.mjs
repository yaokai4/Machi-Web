import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const target = process.env.HOME_URL || "http://127.0.0.1:3004/home";
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7";
let autoServer = null;

const checks = [
  ["H1 brand", /<h1[^>]*>[^<]*Machi[^<]*<\/h1>/i],
  ["Chinese title", "让陌生的城市，也有生活的门路。"],
  ["English title", "Find your way into a new city."],
  ["Japanese title", "知らない街でも、暮らし方は見つけられる。"],
  ["city community explanation", "按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验"],
  ["feed shell", "首页信息流"],
  ["feed tabs", "推荐、同城、关注、热榜"],
  ["search placeholder", "搜索租房、语言交换、工作、活动、本地问题"],
  ["utility entry", "选择当前城市、搜索内容、查看通知"],
  ["canonical", /rel="canonical"[^>]+href="[^"]*\/home/i],
  ["hreflang zh", /hreflang="zh-CN"/i],
  ["hreflang en", /hreflang="en"/i],
  ["hreflang ja", /hreflang="ja"/i],
  ["structured data", /application\/ld\+json/i],
];

async function fetchHtml(url) {
  const response = await fetch(url, { headers: { "Accept-Language": acceptLanguage } });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}`);
  }
  return await response.text();
}

function fetchErrorCode(err) {
  return err?.cause?.code || err?.code;
}

async function startLocalNext(url) {
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) return null;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const bin = process.platform === "win32" ? "node_modules/.bin/next.cmd" : "node_modules/.bin/next";
  if (!existsSync(bin)) return null;

  let logs = "";
  let exited = false;
  const child = spawn(bin, ["start", "-p", port], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  autoServer = child;
  child.stdout.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    logs += String(chunk);
  });
  child.on("exit", (code, signal) => {
    exited = true;
    logs += `\n[next exited code=${code ?? ""} signal=${signal ?? ""}]`;
  });

  for (let i = 0; i < 40; i += 1) {
    await delay(500);
    if (exited) break;
    try {
      await fetchHtml(url);
      return child;
    } catch (err) {
      if (fetchErrorCode(err) !== "ECONNREFUSED") throw err;
    }
  }
  child.kill("SIGTERM");
  autoServer = null;
  throw new Error(`Unable to start local Next server for ${url}\n${logs.slice(-2000)}`);
}

async function loadHtml(url) {
  if (process.env.HOME_HTML_FILE) {
    return readFileSync(process.env.HOME_HTML_FILE, "utf8");
  }
  try {
    return await fetchHtml(url);
  } catch (err) {
    const code = fetchErrorCode(err);
    if (code === "ECONNREFUSED" && !process.env.HOME_SSR_NO_AUTOSTART) {
      const child = await startLocalNext(url);
      if (child) return await fetchHtml(url);
    }
    if (code !== "EPERM" && code !== "EACCES") throw err;
    try {
      return execFileSync("curl", ["-fsSL", "-H", `Accept-Language: ${acceptLanguage}`, url], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch {
      throw err;
    }
  }
}

try {
  const html = await loadHtml(target);
  const failures = checks.filter(([, expected]) => {
    if (typeof expected === "string") return !html.includes(expected);
    return !expected.test(html);
  });

  const forbidden = [
    "Beta sample data",
    "Demo preview",
    "Today in City / City Pulse",
    "Feed tabs",
    "发布、选择当前城市、查看消息和通知",
  ];
  const forbiddenHits = forbidden.filter((text) => html.includes(text));

  if (failures.length || forbiddenHits.length) {
    console.error(`SSR home check failed for ${target}`);
    for (const [name] of failures) console.error(`- ${name}`);
    for (const text of forbiddenHits) console.error(`- forbidden content still present: ${text}`);
    process.exit(1);
  }

  console.log(`SSR home check passed for ${target}`);
} finally {
  autoServer?.kill("SIGTERM");
}
