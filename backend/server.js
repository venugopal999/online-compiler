const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");

const app = express();
app.use(cors());

// Start HTTP server
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Interactive Compiler API running");
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "run") {
      const { language, code } = data;
      let filename, run, exeName;

      switch (language) {
        case "c":
          filename = "program.c";
          exeName = `program_${uuidv4()}`;
          fs.writeFileSync(filename, code);

          const compile = spawn("gcc", [filename, "-o", exeName]);
          compile.on("close", () => {
            run = spawn("stdbuf", ["-o0", `./${exeName}`]); // disable buffering
            run.stdout.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            run.stderr.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            ws.runProcess = run;
          });
          break;

        case "cpp":
          filename = "program.cpp";
          exeName = `program_${uuidv4()}`;
          fs.writeFileSync(filename, code);

          const compileCpp = spawn("g++", [filename, "-o", exeName]);
          compileCpp.on("close", () => {
            run = spawn("stdbuf", ["-o0", `./${exeName}`]);
            run.stdout.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            run.stderr.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            ws.runProcess = run;
          });
          break;

        case "python":
          filename = "program.py";
          fs.writeFileSync(filename, code);
          run = spawn("python3", [filename]);
          run.stdout.on("data", (chunk) =>
            ws.send(JSON.stringify({ output: chunk.toString() }))
          );
          run.stderr.on("data", (chunk) =>
            ws.send(JSON.stringify({ output: chunk.toString() }))
          );
          ws.runProcess = run;
          break;

        case "java":
          filename = "Program.java";
          fs.writeFileSync(filename, code);
          const compileJava = spawn("javac", [filename]);
          compileJava.on("close", () => {
            run = spawn("stdbuf", ["-o0", "java", "Program"]);
            run.stdout.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            run.stderr.on("data", (chunk) =>
              ws.send(JSON.stringify({ output: chunk.toString() }))
            );
            ws.runProcess = run;
          });
          break;

        default:
          ws.send(JSON.stringify({ output: "Unsupported language" }));
      }
    }

    if (data.type === "input" && ws.runProcess) {
      ws.runProcess.stdin.write(data.value + "\n");
    }
  });
});
