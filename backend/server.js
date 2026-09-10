// For C
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

// For C++
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

// For Java
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
