const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors()); // allow frontend (GitHub Pages) to connect

// Root route (optional, just for testing)
app.get("/", (req, res) => {
  res.send("Backend is running. Use POST /run to execute code.");
});

app.post("/run", (req, res) => {
  const { language, code } = req.body;
  let filename, command;

  switch (language) {
    case "c":
      filename = "program.c";
      command = `gcc ${filename} -o program && ./program`;
      break;
    case "cpp":
      filename = "program.cpp";
      command = `g++ ${filename} -o program && ./program`;
      break;
    case "python":
      filename = "program.py";
      command = `python3 ${filename}`;
      break;
    case "java":
      filename = "Program.java";
      command = `javac Program.java && java Program`;
      break;
    default:
      return res.json({ output: "Unsupported language" });
  }

  // Write code to file
  fs.writeFileSync(filename, code);

  // Execute command
  exec(command, (error, stdout, stderr) => {
    if (error) {
      return res.json({ output: stderr });
    }
    res.json({ output: stdout });
  });
});

// Use Heroku/Render port or fallback to 3000 locally
app.listen(process.env.PORT || 3000, () => {
  console.log("Compiler API running");
});
