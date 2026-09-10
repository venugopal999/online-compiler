"use strict";

const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_SOURCE_BYTES = 100 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
//const RUN_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS =
  Number(process.env.RUN_TIMEOUT_MS) || 5 * 60 * 1000;

const app = express();
app.use(cors());
app.get("/", (_req, res) => res.json({
  name: "CodeBhavya Interactive Compiler API",
  status: "ready",
  websocket: true
}));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const server = app.listen(PORT, () => {
  console.log(`CodeBhavya compiler API listening on ${PORT}`);
});
const wss = new WebSocket.Server({ server, maxPayload: MAX_SOURCE_BYTES + 4096 });

const runtimes = {
  c: {
    filename: "program.c",
    compile: ["gcc", ["program.c", "-std=c17", "-O2", "-Wall", "-Wextra", "-o", "program"]],
    run: ["stdbuf", ["-o0", "-e0", "./program"]]
  },
  cpp: {
    filename: "program.cpp",
    compile: ["g++", ["program.cpp", "-std=c++17", "-O2", "-Wall", "-Wextra", "-o", "program"]],
    run: ["stdbuf", ["-o0", "-e0", "./program"]]
  },
  python: { filename: "program.py", run: ["python3", ["-u", "program.py"]] },
  java: {
    filename: "Program.java",
    compile: ["javac", ["Program.java"]],
    run: ["java", ["-cp", ".", "Program"]]
  },
  javascript: { filename: "program.js", run: ["node", ["program.js"]] }
};

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function removeWorkspace(ws) {
  if (!ws.workspace) return;
  fs.rmSync(ws.workspace, { recursive: true, force: true });
  ws.workspace = null;
}

function stopProcess(ws, reason = "stopped") {
  if (!ws.runProcess) return false;
  const child = ws.runProcess;
  ws.runProcess = null;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch (_error) {
    // The process may already have exited.
  }
  clearTimeout(ws.runTimer);
  safeSend(ws, {
    type: "status",
    status: reason,
    message: reason === "timeout" ? "Time limit exceeded" : "Process stopped"
  });
  removeWorkspace(ws);
  return true;
}

function attachOutput(ws, child, streamName) {
  child[streamName].on("data", (chunk) => {
    if (ws.outputBytes >= MAX_OUTPUT_BYTES) return;
    const remaining = MAX_OUTPUT_BYTES - ws.outputBytes;
    const output = chunk.subarray(0, remaining).toString();
    ws.outputBytes += Buffer.byteLength(output);
    safeSend(ws, { type: "output", stream: streamName, output });
    if (ws.outputBytes >= MAX_OUTPUT_BYTES) {
      safeSend(ws, { type: "output", stream: "stderr", output: "\n[Output limit reached]\n" });
      stopProcess(ws, "stopped");
    }
  });
}

function spawnCommand(ws, command, args, phase) {
  const child = spawn(command, args, {
    cwd: ws.workspace,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"]
  });
  ws.runProcess = child;
  attachOutput(ws, child, "stdout");
  attachOutput(ws, child, "stderr");
  child.on("error", (error) => {
    safeSend(ws, { type: "error", message: `${phase} could not start: ${error.message}` });
    safeSend(ws, { type: "status", status: "error", message: `${phase} error` });
    ws.runProcess = null;
    removeWorkspace(ws);
  });
  return child;
}

function startProgram(ws, runtime, startedAt) {
  safeSend(ws, { type: "status", status: "running", message: "Program running" });
  const [command, args] = runtime.run;
  const child = spawnCommand(ws, command, args, "Program");
  ws.runTimer = setTimeout(() => stopProcess(ws, "timeout"), RUN_TIMEOUT_MS);

  child.on("close", (code, signal) => {
    if (ws.runProcess !== child) return;
    clearTimeout(ws.runTimer);
    ws.runProcess = null;
    const status = code === 0 ? "success" : "runtime-error";
    const message = code === 0 ? "Finished successfully" : `Process exited with code ${code ?? signal}`;
    safeSend(ws, { type: "exit", code, signal, durationMs: Date.now() - startedAt });
    safeSend(ws, { type: "status", status, message });
    removeWorkspace(ws);
  });
}

function compileAndRun(ws, runtime, startedAt) {
  if (!runtime.compile) return startProgram(ws, runtime, startedAt);
  safeSend(ws, { type: "status", status: "compiling", message: "Compiling source code" });
  const [command, args] = runtime.compile;
  const compiler = spawnCommand(ws, command, args, "Compiler");

  compiler.on("close", (code) => {
    if (ws.runProcess !== compiler) return;
    ws.runProcess = null;
    if (code !== 0) {
      safeSend(ws, { type: "exit", code, phase: "compile", durationMs: Date.now() - startedAt });
      safeSend(ws, { type: "status", status: "compile-error", message: "Compilation failed" });
      removeWorkspace(ws);
      return;
    }
    startProgram(ws, runtime, startedAt);
  });
}

wss.on("connection", (ws) => {
  ws.runProcess = null;
  ws.workspace = null;
  ws.outputBytes = 0;
  safeSend(ws, { type: "status", status: "ready", message: "Compiler server ready" });

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (_error) {
      return safeSend(ws, { type: "error", message: "Invalid request" });
    }

    if (data.type === "run") {
      if (ws.runProcess) {
        safeSend(ws, { type: "error", message: "A program is already running" });
        return safeSend(ws, { type: "status", status: "error", message: "Run request rejected" });
      }
      const runtime = runtimes[data.language];
      if (!runtime) {
        safeSend(ws, { type: "error", message: "Unsupported language" });
        return safeSend(ws, { type: "status", status: "error", message: "Unsupported language" });
      }
      if (typeof data.code !== "string" || !data.code.trim() || Buffer.byteLength(data.code) > MAX_SOURCE_BYTES) {
        safeSend(ws, { type: "error", message: "Source code is empty or too large" });
        return safeSend(ws, { type: "status", status: "error", message: "Invalid source code" });
      }
      ws.workspace = fs.mkdtempSync(path.join(os.tmpdir(), "codebhavya-"));
      ws.outputBytes = 0;
      fs.writeFileSync(path.join(ws.workspace, runtime.filename), data.code, "utf8");
      compileAndRun(ws, runtime, Date.now());
    }

    if (data.type === "input") {
      if (ws.runProcess?.stdin?.writable) ws.runProcess.stdin.write(`${String(data.value ?? "")}\n`);
      else safeSend(ws, { type: "error", message: "No running program is waiting for input" });
    }

    if (data.type === "stop") {
      if (!stopProcess(ws)) safeSend(ws, { type: "status", status: "ready", message: "No program is running" });
    }
  });

  ws.on("close", () => {
    stopProcess(ws);
    removeWorkspace(ws);
  });
  ws.on("error", () => {
    stopProcess(ws);
    removeWorkspace(ws);
  });
});

function shutdown() {
  for (const client of wss.clients) {
    stopProcess(client);
    client.terminate();
  }
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
