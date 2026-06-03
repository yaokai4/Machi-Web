#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverDir = path.join(root, ".next", "server");
const jsPath = path.join(serverDir, "next-font-manifest.js");
const jsonPath = path.join(serverDir, "next-font-manifest.json");

if (!fs.existsSync(jsPath)) {
  process.exit(0);
}

if (fs.existsSync(jsonPath)) {
  try {
    JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    process.exit(0);
  } catch {
    // Fall through and rebuild it from the JS manifest.
  }
}

const marker = "self.__NEXT_FONT_MANIFEST=";
const js = fs.readFileSync(jsPath, "utf8").trim();
if (!js.startsWith(marker)) {
  console.error("[fix-next-font-manifest] unexpected manifest wrapper");
  process.exit(1);
}

let manifestJson;
try {
  const wrapped = js.slice(marker.length).replace(/;$/, "");
  manifestJson = JSON.parse(wrapped);
  JSON.parse(manifestJson);
} catch (error) {
  console.error(`[fix-next-font-manifest] invalid manifest: ${error.message}`);
  process.exit(1);
}

fs.writeFileSync(jsonPath, `${manifestJson}\n`);
console.log("[fix-next-font-manifest] wrote .next/server/next-font-manifest.json");
