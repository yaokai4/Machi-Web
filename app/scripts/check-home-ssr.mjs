import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const target = process.env.HOME_URL || "http://127.0.0.1:3004/home";
const acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7";

const checks = [
  ["H1 brand", /<h1[^>]*>[^<]*Machi[^<]*<\/h1>/i],
  ["Chinese title", "在每一座城市，找到生活的回声。"],
  ["English title", "Find the echoes of life in every city."],
  ["Japanese title", "すべての街で、暮らしの響きを見つける。"],
  ["city community explanation", "按城市和语言组织的本地生活与同城社交社区"],
  ["feed shell", "首页信息流"],
  ["feed tabs", "推荐、同城、关注、热榜"],
  ["search placeholder", "搜索租房、饭搭子、语言交换、工作、活动、本地问题"],
  ["utility entry", "选择当前城市、搜索内容、查看通知"],
  ["canonical", /rel="canonical"[^>]+href="[^"]*\/home/i],
  ["hreflang zh", /hreflang="zh-CN"/i],
  ["hreflang en", /hreflang="en"/i],
  ["hreflang ja", /hreflang="ja"/i],
  ["structured data", /application\/ld\+json/i],
];

async function loadHtml(url) {
  if (process.env.HOME_HTML_FILE) {
    return readFileSync(process.env.HOME_HTML_FILE, "utf8");
  }
  try {
    const response = await fetch(url, { headers: { "Accept-Language": acceptLanguage } });
    if (!response.ok) {
      throw new Error(`GET ${url} returned ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    const code = err?.cause?.code || err?.code;
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
