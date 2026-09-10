async function runCode() {
  const code = document.getElementById("code").value;
  const language = document.getElementById("language").value;
  const input = document.getElementById("input").value;

  const response = await fetch("https://online-compiler-srho.onrender.com/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code, input })
  });

  const result = await response.json();
  document.getElementById("output").textContent = result.output;
}
