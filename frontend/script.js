let ws;

function runCode() {
  const code = document.getElementById("editor").value;
  const language = document.getElementById("language").value;

  ws = new WebSocket("wss://online-compiler-srho.onrender.com");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "run", language, code }));
    document.getElementById("terminal").textContent = ""; // clear old output
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const terminal = document.getElementById("terminal");
    terminal.textContent += data.output;
    terminal.scrollTop = terminal.scrollHeight; // auto-scroll
  };
}

document.getElementById("consoleInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = e.target.value;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", value: input }));
      e.target.value = "";
    }
  }
});
