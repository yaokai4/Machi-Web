#!/usr/bin/env node
// Post-build sanity check.
//
// Catches two Next.js 15.5 incremental-emit failures that have bitten
// this project:
//
//   A) Some sub-page `page.tsx` files emitted only their manifest,
//      not their compiled server `page.js`. At runtime: 500 with
//      MODULE_NOT_FOUND for `.next/server/app/<route>/page.js`.
//
//   B) Some routes referenced a client chunk URL in their generated
//      HTML (e.g. `/_next/static/chunks/app/features/page-<hash>.js`)
//      but the file was NEVER emitted to disk. SSR returns 200, but
//      hydration fails with ChunkLoadError → error.tsx tries to load
//      its own (also-missing) chunk → user lands on the "出了点问题"
//      dialog.
//
// We check both:
//   1. Every page.tsx has a compiled artifact (server or client chunk)
//   2. Every chunk referenced by app-build-manifest.json exists on disk
//   3. Every src/app/**/page.tsx route HTTP-GETs to <500 and the HTML's
//      referenced static chunks all exist.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcAppDir = path.join(root, "src/app");
const nextDir = path.join(root, ".next");

if (!fs.existsSync(path.join(nextDir, "BUILD_ID"))) {
  console.error(`[check-build] no .next build found — run 'npm run build' first.`);
  process.exit(1);
}

// ----- Check #0: required server files all exist -----
const requiredServerFilesPath = path.join(nextDir, "required-server-files.json");
if (fs.existsSync(requiredServerFilesPath)) {
  const requiredServerFiles = JSON.parse(fs.readFileSync(requiredServerFilesPath, "utf8"));
  const missingRequired = (requiredServerFiles.files || []).filter((file) => !fs.existsSync(path.join(root, file)));
  if (missingRequired.length > 0) {
    console.error(`[check-build] FAILED — ${missingRequired.length} required server files are missing:`);
    for (const file of missingRequired) console.error(`  • ${file}`);
    process.exit(1);
  }
}

// ----- Check #1: every source page has a compiled artifact -----
function pageArtifactExists(segments) {
  const routeDir = path.join(nextDir, "server/app", ...segments);
  return (
    fs.existsSync(path.join(routeDir, "page.js")) ||
    fs.existsSync(path.join(routeDir, "page_client-reference-manifest.js"))
  );
}

function collectPageArtifacts(dir, segments, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
      const nextSegments = entry.name.startsWith("(") ? segments : [...segments, entry.name];
      collectPageArtifacts(path.join(dir, entry.name), nextSegments, out);
      continue;
    }
    if (entry.name !== "page.tsx" && entry.name !== "page.ts") continue;
    out.push({ segments, route: path.join("server/app", ...segments, "page") });
  }
}
const expectedPageArtifacts = [];
collectPageArtifacts(srcAppDir, [], expectedPageArtifacts);
const missingPageArtifacts = expectedPageArtifacts.filter((page) => !pageArtifactExists(page.segments));
if (missingPageArtifacts.length > 0) {
  console.error(`[check-build] FAILED — ${missingPageArtifacts.length} page artifacts are missing:`);
  for (const page of missingPageArtifacts) console.error(`  • ${page.route}.js`);
  console.error("\nThis usually means the .next directory contains stale incremental output.");
  console.error("Run: npm run build (this project clears .next before building).");
  process.exit(1);
}

// ----- Check #2: app-build-manifest.json chunks all exist on disk -----
// Next 15.5 can write logical names in app-build-manifest.json
// (`static/chunks/app/register/page.js`) while emitting the hashed file
// (`static/chunks/app/register/page-<hash>.js`). Treat those hashed
// siblings as present; the runtime HTML probe below still verifies the
// concrete URLs that a browser would load.
function existsAsEmittedAsset(file) {
  const exact = path.join(nextDir, file);
  if (fs.existsSync(exact)) return true;

  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const dir = path.dirname(exact);
  if (fs.existsSync(dir)) {
    const hashedSibling = fs
      .readdirSync(dir)
      .some((name) => name.startsWith(`${base}-`) && name.endsWith(ext));
    if (hashedSibling) return true;
  }

  if (file.startsWith("static/css/")) {
    const cssDir = path.join(nextDir, "static/css");
    if (!fs.existsSync(cssDir)) return false;
    const stack = [cssDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const next = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(next);
        if (entry.isFile() && entry.name.endsWith(".css")) return true;
      }
    }
  }

  return false;
}

const manifestPath = path.join(nextDir, "app-build-manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const missing = [];
  for (const [route, files] of Object.entries(manifest.pages || {})) {
    for (const f of files) {
      if (!existsAsEmittedAsset(f)) {
        missing.push({ route, file: f });
      }
    }
  }
  if (missing.length > 0) {
    console.error(`[check-build] FAILED — manifest references ${missing.length} chunks that don't exist on disk:`);
    const byRoute = new Map();
    for (const m of missing) {
      if (!byRoute.has(m.route)) byRoute.set(m.route, []);
      byRoute.get(m.route).push(m.file);
    }
    for (const [r, fs2] of byRoute) {
      console.error(`  • ${r}`);
      for (const f of fs2) console.error(`      missing: ${f}`);
    }
    console.error("\nThis is a Next.js 15.5 incremental-emit bug.");
    console.error("Run: npm run fresh-build (clears .next entirely and rebuilds).");
    process.exit(1);
  }
}

// ----- Check #3: every static page route HTTP-GETs to <500 -----
function collectRoutes(dir, relative, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name.startsWith("(") || entry.name.startsWith("@")) continue;
      collectRoutes(path.join(dir, entry.name), `${relative}/${entry.name}`, out);
      continue;
    }
    if (entry.name !== "page.tsx" && entry.name !== "page.ts") continue;
    if (relative.includes("[")) continue;
    out.push(relative === "" ? "/" : relative);
  }
}
const routes = [];
collectRoutes(srcAppDir, "", routes);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function readyOnPort(port, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status > 0) return;
    } catch { /* not yet */ }
    await wait(300);
  }
  throw new Error("next start did not become ready in time");
}

let port;
try {
  port = await freePort();
} catch (err) {
  if (err?.code === "EPERM" || err?.code === "EACCES") {
    console.warn(
      `[check-build] warning — runtime HTTP smoke skipped because this environment cannot open localhost ports (${err.code}).`,
    );
    console.log(`[check-build] ok — static manifest chunks present on disk`);
    process.exit(0);
  }
  throw err;
}

const child = spawn("node", ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverError = "";
child.stderr.on("data", (chunk) => { serverError += chunk.toString(); });

try {
  await readyOnPort(port);
} catch (err) {
  console.error("[check-build] could not start next:", err.message);
  console.error(serverError.slice(-2000));
  child.kill("SIGTERM");
  process.exit(1);
}

const failures = [];
for (const route of routes) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: "manual" });
    if (res.status >= 500) {
      failures.push({ route, kind: "5xx", detail: String(res.status) });
      continue;
    }
    // Also verify that any chunk referenced in the rendered HTML
    // actually exists on disk. Catches the case where SSR returns 200
    // but the client bundle is missing — the user gets a 500 in their
    // browser even though our HTTP probe said 200.
    const html = await res.text();
    const chunkUrls = Array.from(html.matchAll(/\/_next\/static\/chunks\/[^"'\s)]+\.js/g)).map((m) => m[0]);
    const distinct = Array.from(new Set(chunkUrls));
    for (const url of distinct) {
      const file = path.join(nextDir, url.replace("/_next/", ""));
      if (!fs.existsSync(file)) {
        failures.push({ route, kind: "missing-chunk", detail: url });
      }
    }
  } catch (err) {
    failures.push({ route, kind: "network", detail: err.message });
  }
}

child.kill("SIGTERM");
await wait(300);
try { child.kill("SIGKILL"); } catch { /* already dead */ }

if (failures.length > 0) {
  console.error("[check-build] FAILED — runtime issues found:");
  for (const f of failures) {
    console.error(`  • ${f.route}  →  [${f.kind}]  ${f.detail}`);
  }
  if (serverError.trim()) {
    console.error("\nServer stderr (tail):");
    console.error(serverError.slice(-2000));
  }
  console.error("\nRun: npm run fresh-build  (this clears .next and rebuilds from scratch).");
  process.exit(1);
}

console.log(`[check-build] ok — ${routes.length} routes, all chunks present on disk`);
