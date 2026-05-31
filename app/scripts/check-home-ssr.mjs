const target = process.env.HOME_URL || "http://127.0.0.1:3004/home";

const checks = [
  ["H1 brand", /<h1[^>]*>[^<]*Machi[^<]*<\/h1>/i],
  ["Chinese title", "在每一座城市，找到生活的回声。"],
  ["English title", "Find the echoes of life in every city."],
  ["Japanese title", "すべての街で、暮らしの響きを見つける。"],
  ["city community explanation", "按城市和语言组织的本地生活与同城社交社区"],
  ["city pulse", "Today in City / City Pulse"],
  ["social module", "不只是找信息，也是在城市里认识人。"],
  ["channel groups", "City Life"],
  ["search placeholder", "搜索租房、饭搭子、语言交换、工作、活动、本地问题"],
  ["publish entry", "发布入口"],
  ["messages entry", "还没有消息。"],
  ["language settings", "界面语言与内容语言分开"],
  ["safety trust", "安全和信任"],
  ["merchant entry", "商家入口"],
  ["feed tabs", "Feed tabs"],
  ["canonical", /rel="canonical"[^>]+href="[^"]*\/home/i],
  ["hreflang zh", /hreflang="zh-CN"/i],
  ["hreflang en", /hreflang="en"/i],
  ["hreflang ja", /hreflang="ja"/i],
  ["structured data", /application\/ld\+json/i],
];

const response = await fetch(target, { headers: { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7" } });
if (!response.ok) {
  throw new Error(`GET ${target} returned ${response.status}`);
}

const html = await response.text();
const failures = checks.filter(([, expected]) => {
  if (typeof expected === "string") return !html.includes(expected);
  return !expected.test(html);
});

if (failures.length) {
  console.error(`SSR home check failed for ${target}`);
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`SSR home check passed for ${target}`);
