#!/usr/bin/env node

import { spawn } from "node:child_process";

const INTERVAL_SECONDS = Number.parseInt(process.env.SNAPSHOT_INTERVAL_SECONDS || "300", 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/build-hourly-snapshot.mjs"], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const intervalMs = Number.isFinite(INTERVAL_SECONDS) && INTERVAL_SECONDS > 0 ? INTERVAL_SECONDS * 1000 : 300000;

  while (true) {
    const startedAt = new Date().toISOString();
    const code = await runOnce();
    const endedAt = new Date().toISOString();
    console.log(JSON.stringify({ worker: "snapshot-rotation", startedAt, endedAt, exitCode: code }, null, 2));
    await sleep(intervalMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
