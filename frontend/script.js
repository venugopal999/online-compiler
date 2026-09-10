let ws;
let editor;
let inputHistory = [];

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '// Write your code here\n',
    language: 'c',
    theme: 'vs-dark',
    automaticLayout: true
  });
});

function runCode() {
  const code = editor.getValue();
  const language = document.getElementById("language").value;

  ws = new WebSocket("wss://online-compiler-srho.onrender.com");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "run", language, code }));
    document.getElementById("terminal").textContent = "";
    inputHistory = []; // reset history for new run
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
      inputHistory.push(input); // store input
      e.target.value = "";
    }
  }
});

function showHistory() {
  const terminal = document.getElementById("terminal");
  terminal.textContent += "\n[Input History: " + inputHistory.join(", ") + "]\n";
  terminal.scrollTop = terminal.scrollHeight;
}
