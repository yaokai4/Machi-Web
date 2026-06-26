import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// Target resolution (most specific wins):
//   HOME_URL   — full URL to the /home page
//   BASE_URL   — origin; /home is appended
//   PORT       — local port; http://127.0.0.1:$PORT/home
//   (default)  — http://127.0.0.1:3000/home (Next dev/start default)
// The old default of :3004 pointed at a port nothing normally listens on, so a
// plain `npm run test:home:ssr` failed with an opaque "fetch failed". We now
// default to the real dev port and, when the server is local and down, try to
// boot `next start` ourselves (see startLocalNext).
function resolveTarget() {
  if (process.env.HOME_URL) return process.env.HOME_URL;
  if (process.env.BASE_URL) return `${process.env.BASE_URL.replace(/\/$/, "")}/home`;
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}/home`;
  return "http://127.0.0.1:3000/home";
}

const target = resolveTarget();
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7";
let autoServer = null;

const checks = [
  ["H1 brand", /<h1[^>]*>[^<]*Machi[^<]*<\/h1>/i],
  ["Chinese title", "在每一座城市，找到生活的回声。"],
  ["English title", "Machi · Find the echoes of real life in every city."],
  ["Japanese title", "Machi · どの街でも、暮らしの声を見つける。"],
  ["city community explanation", "Machi 按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验"],
  ["feed shell", "首页信息流"],
  ["homepage metadata title", "Machi | 在每一座城市，找到生活的回声"],
  ["homepage metadata description", "Machi 按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验。"],
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
    for (const [name] of failures) console.error(`- missing: ${name}`);
    for (const text of forbiddenHits) console.error(`- forbidden content still present: ${text}`);
    // If NONE of the brand signals are present the page almost certainly isn't
    // Machi — flag the likely "wrong service on this port" cause explicitly.
    const brandPresent = /Machi/i.test(html);
    if (!brandPresent) {
      console.error(
        `- 该地址没有任何 Machi 品牌标识，疑似打到了占用 ${target} 端口的其它项目。` +
          ` 用 BASE_URL=http://127.0.0.1:<machi端口> npm run test:home:ssr 指定正确服务。`
      );
    }
    autoServer?.kill("SIGTERM");
    process.exit(1);
  }

  console.log(`SSR home check passed for ${target}`);
} catch (err) {
  // Surface the real URL + reason instead of a bare "fetch failed". If the
  // server simply isn't up, say so and how to point at the right one.
  const code = err?.cause?.code || err?.code;
  console.error(`SSR home check could not run against ${target}`);
  console.error(`- ${err?.message || err}`);
  if (code === "ECONNREFUSED") {
    console.error(
      `- 没有服务在监听该地址。先启动 Next（npm run start / npx next dev），` +
        ` 或用 BASE_URL=http://127.0.0.1:<端口> npm run test:home:ssr 指定已运行的服务。`
    );
  }
  process.exitCode = 1;
} finally {
  autoServer?.kill("SIGTERM");
}
