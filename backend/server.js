const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

app.post("/run", (req, res) => {
  const { language, code } = req.body;
  let filename, command;

  switch(language) {
    case "c": filename = "program.c"; command = `gcc ${filename} -o program && ./program`; break;
    case "cpp": filename = "program.cpp"; command = `g++ ${filename} -o program && ./program`; break;
    case "python": filename = "program.py"; command = `python3 ${filename}`; break;
    case "java": filename = "Program.java"; command = `javac Program.java && java Program`; break;
  }

  fs.writeFileSync(filename, code);

  exec(command, (error, stdout, stderr) => {
    if (error) return res.json({ output: stderr });
    res.json({ output: stdout });
  });
});

app.listen(process.env.PORT || 3000, () => console.log("Compiler API running"));
