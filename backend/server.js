const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(bodyParser.json());
app.use(cors()); // allow frontend (GitHub Pages) to connect

// Root route (optional, just for testing)
app.get("/", (req, res) => {
  res.send("Backend is running. Use POST /run to execute code.");
});

app.post("/run", (req, res) => {
  const { language, code } = req.body;
  let filename, command, exeName;

  switch (language) {
    case "c":
      filename = "program.c";
      exeName = `program_${uuidv4()}`;
      command = `gcc ${filename} -o ${exeName} && ./${exeName}`;
      break;
    case "cpp":
      filename = "program.cpp";
      exeName = `program_${uuidv4()}`;
      command = `g++ ${filename} -o ${exeName} && ./${exeName}`;
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
    // Clean up compiled binary if created
    if (exeName && fs.existsSync(exeName)) {
      try {
        fs.unlinkSync(exeName);
      } catch (cleanupErr) {
        console.error("Cleanup error:", cleanupErr);
      }
    }

    if (error) {
      return res.json({ output: stderr });
    }
    res.json({ output: stdout });
  });
});

// Use Render port or fallback to 3000 locally
app.listen(process.env.PORT || 3000, () => {
  console.log("Compiler API running");
});
