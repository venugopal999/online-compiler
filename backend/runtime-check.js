"use strict";

const { spawnSync } = require("node:child_process");
const tools = [
  ["gcc", ["--version"]],
  ["g++", ["--version"]],
  ["python3", ["--version"]],
  ["javac", ["-version"]],
  ["java", ["-version"]],
  ["node", ["--version"]],
  ["stdbuf", ["--version"]]
];
let missing = false;
for (const [command, args] of tools) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 10000, maxBuffer: 128 * 1024
  });
  if (result.error || result.status !== 0) {
    missing = true;
    console.error(`[runtime-check] ${command} unavailable: ${result.error?.message || `exit ${result.status}`}`);
  } else {
    const version = `${result.stdout || ""}\n${result.stderr || ""}`.trim().split(/\r?\n/)[0];
    console.log(`[runtime-check] ${command}: ${version}`);
  }
}
if (missing) {
  console.error("[runtime-check] Startup stopped. Use the supplied Dockerfile and select Docker runtime in Render. A Java runtime alone is insufficient: javac requires a JDK.");
  process.exitCode = 1;
}
