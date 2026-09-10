const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Backend is running. Use POST /run to execute code.");
});

app.post("/run", (req, res) => {
  const { language, code, input } = req.body;
  let filename, command, exeName;

  switch (language) {
    case "c":
      filename = "program.c";
      exeName = `program_${uuidv4()}`;
      command = `gcc ${filename} -o ${exeName} && echo "${input || ""}" | ./${exeName}`;
      break;
    case "cpp":
      filename = "program.cpp";
      exeName = `program_${uuidv4()}`;
      command = `g++ ${filename} -o ${exeName} && echo "${input || ""}" | ./${exeName}`;
      break;
    case "python":
      filename = "program.py";
      command = `echo "${input || ""}" | python3 ${filename}`;
      break;
    case "java":
      filename = "Program.java";
      command = `javac Program.java && echo "${input || ""}" | java Program`;
      break;
    default:
      return res.json({ output: "Unsupported language" });
  }

  fs.writeFileSync(filename, code);

  exec(command, (error, stdout, stderr) => {
    if (exeName && fs.existsSync(exeName)) {
      try { fs.unlinkSync(exeName); } catch {}
    }
    if (error) return res.json({ output: stderr });
    res.json({ output: stdout });
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Compiler API running");
});
