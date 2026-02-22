#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const DIST = path.join(ROOT, "dist");
const DIST_ASSETS = path.join(DIST, "assets");
const ROOT_ASSETS = path.join(ROOT, "assets");

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const srcPath = path.join(source, entry.name);
    const dstPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, dstPath);
      return;
    }
    await fs.copyFile(srcPath, dstPath);
  }));
}

async function main() {
  if (!(await exists(DIST))) {
    throw new Error("dist directory not found. Run vite build first.");
  }

  await fs.copyFile(path.join(DIST, "index.html"), path.join(ROOT, "index.html"));

  await fs.rm(ROOT_ASSETS, { recursive: true, force: true });
  if (await exists(DIST_ASSETS)) {
    await copyDirectory(DIST_ASSETS, ROOT_ASSETS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
