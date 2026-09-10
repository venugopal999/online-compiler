async function runCode() {
  const code = document.getElementById("code").value;
  const language = document.getElementById("language").value;

  const response = await fetch("https://your-heroku-app.herokuapp.com/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code })
  });

  const result = await response.json();
  document.getElementById("output").textContent = result.output;
}
