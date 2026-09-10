let ws;
let editor;

window.onload = () => {
  editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
    lineNumbers: true,
    mode: "text/x-csrc",
    theme: "default"
  });
};

function runCode() {
  const code = editor.getValue();
  const language = document.getElementById("language").value;

  ws = new WebSocket("wss://online-compiler-srho.onrender.com");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "run", language, code }));
    document.getElementById("terminal").textContent = "";
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const terminal = document.getElementById("terminal");
    terminal.textContent += data.output;
    terminal.scrollTop = terminal.scrollHeight;
  };
}

function stopCode() {
  if (ws) {
    ws.close();
    document.getElementById("terminal").textContent += "\n[Process stopped]\n";
  }
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
