#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverDir = path.join(root, ".next", "server");
const chunksDir = path.join(serverDir, "chunks");

if (!fs.existsSync(serverDir)) {
  console.error("[repair-next-server-chunks] .next/server not found; run next build first.");
  process.exit(1);
}

const numericChunk = /^\d+\.js$/;
const chunks = fs
  .readdirSync(serverDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && numericChunk.test(entry.name))
  .map((entry) => entry.name);

if (chunks.length === 0) {
  process.exit(0);
}

fs.mkdirSync(chunksDir, { recursive: true });

let copied = 0;
for (const name of chunks) {
  const source = path.join(serverDir, name);
  const target = path.join(chunksDir, name);
  if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
    fs.copyFileSync(source, target);
    copied += 1;
  }
}

if (copied > 0) {
  console.log(`[repair-next-server-chunks] copied ${copied} server chunks into .next/server/chunks`);
}
