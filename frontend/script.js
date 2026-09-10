let ws;

function runCode() {
  const code = document.getElementById("code").value;
  const language = document.getElementById("language").value;

  ws = new WebSocket("wss://online-compiler-srho.onrender.com");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "run", language, code }));
    document.getElementById("output").textContent = ""; // clear old output
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    document.getElementById("output").textContent += data.output;
  };
}

function sendInput() {
  const input = document.getElementById("input").value;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "input", value: input }));
    document.getElementById("input").value = ""; // clear after sending
  }
}
