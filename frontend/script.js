"use strict";

const WS_URL = window.CODEBHAVYA_CONFIG?.compilerWebSocketUrl || "wss://online-compiler-srho.onrender.com";
const STORAGE_PREFIX = "codebhavya.compiler.draft.";
const LANGUAGE_KEY = "codebhavya.compiler.language";

const languageInfo = {
  c: {
    monaco: "c",
    filename: "program.c",
    template: `#include <stdio.h>

int main(void) {
    int first, second;

    printf("Enter two numbers: ");
    scanf("%d %d", &first, &second);
    printf("Sum = %d\\n", first + second);

    return 0;
}
`
  },
  cpp: {
    monaco: "cpp",
    filename: "program.cpp",
    template: `#include <iostream>
using namespace std;

int main() {
    int first, second;
    cout << "Enter two numbers: ";
    cin >> first >> second;
    cout << "Sum = " << first + second << '\\n';
    return 0;
}
`
  },
  python: {
    monaco: "python",
    filename: "program.py",
    template: `first = int(input("Enter first number: "))
second = int(input("Enter second number: "))
print("Sum =", first + second)
`
  },
  java: {
    monaco: "java",
    filename: "Program.java",
    template: `import java.util.Scanner;

public class Program {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        System.out.print("Enter two numbers: ");
        int first = input.nextInt();
        int second = input.nextInt();
        System.out.println("Sum = " + (first + second));
        input.close();
    }
}
`
  },
  javascript: {
    monaco: "javascript",
    filename: "program.js",
    template: `process.stdout.write("Enter two numbers: ");

process.stdin.once("data", (data) => {
  const [first, second] = data.toString().trim().split(/\\s+/).map(Number);
  console.log("Sum =", first + second);
  process.exit(0);
});
`
  }
};

const elements = {
  language: document.getElementById("language"),
  filename: document.getElementById("filename"),
  saveState: document.getElementById("saveState"),
  terminal: document.getElementById("terminal"),
  consoleInput: document.getElementById("consoleInput"),
  runButton: document.getElementById("runButton"),
  stopButton: document.getElementById("stopButton"),
  resetButton: document.getElementById("resetButton"),
  downloadButton: document.getElementById("downloadButton"),
  clearButton: document.getElementById("clearButton"),
  copyButton: document.getElementById("copyButton"),
  statusBadge: document.getElementById("statusBadge"),
  serverDot: document.getElementById("serverDot"),
  serverText: document.getElementById("serverText"),
  historyDrawer: document.getElementById("historyDrawer"),
  historyList: document.getElementById("historyList"),
  outputNotice: document.getElementById("outputNotice"),
  menuButton: document.getElementById("menuButton"),
  siteNav: document.getElementById("siteNav"),
  workspace: document.getElementById("workspace"),
  splitter: document.getElementById("splitter")
};

let editor;
let socket;
let currentLanguage = languageInfo[localStorage.getItem(LANGUAGE_KEY)] ? localStorage.getItem(LANGUAGE_KEY) : "c";
let inputHistory = [];
let saveTimer;
let wakeTimer;
let isRunning = false;
let finalStatusSeen = false;

function draftFor(language) {
  return localStorage.getItem(STORAGE_PREFIX + language) ?? languageInfo[language].template;
}

function scheduleSave() {
  elements.saveState.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_PREFIX + currentLanguage, editor.getValue());
    elements.saveState.textContent = "Saved on this device";
  }, 350);
}

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  elements.language.value = currentLanguage;
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: draftFor(currentLanguage),
    language: languageInfo[currentLanguage].monaco,
    theme: "vs-dark",
    automaticLayout: true,
    fontSize: 15,
    lineHeight: 23,
    minimap: { enabled: false },
    padding: { top: 14 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
    wordWrap: "on",
    tabSize: 4
  });
  editor.onDidChangeModelContent(scheduleSave);
  updateLanguageMeta();
});

function updateLanguageMeta() {
  elements.filename.textContent = languageInfo[currentLanguage].filename;
}

function changeLanguage() {
  if (!editor) return;
  localStorage.setItem(STORAGE_PREFIX + currentLanguage, editor.getValue());
  currentLanguage = elements.language.value;
  localStorage.setItem(LANGUAGE_KEY, currentLanguage);
  editor.setValue(draftFor(currentLanguage));
  monaco.editor.setModelLanguage(editor.getModel(), languageInfo[currentLanguage].monaco);
  updateLanguageMeta();
  elements.saveState.textContent = "Saved on this device";
}

function clearTerminal(showMessage = false) {
  elements.terminal.textContent = "";
  if (showMessage) appendOutput("Run your program to see compiler output here.", "muted");
}

function appendOutput(text, kind = "output") {
  const span = document.createElement("span");
  span.className = kind === "stderr" || kind === "error" ? "terminal-error" :
    kind === "success" ? "terminal-success" :
    kind === "input" ? "terminal-input" :
    kind === "system" ? "terminal-system" :
    kind === "muted" ? "terminal-muted" : "";
  span.textContent = text;
  elements.terminal.appendChild(span);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
  const terminalTabActive = document.getElementById("terminalTab").classList.contains("active");
  if (window.matchMedia("(max-width: 680px)").matches && !terminalTabActive) elements.outputNotice.classList.add("visible");
}

function setStatus(status, message) {
  const label = {
    ready: "Ready",
    connecting: "Connecting",
    compiling: "Compiling",
    running: "Running",
    success: "Success",
    "compile-error": "Compile error",
    "runtime-error": "Runtime error",
    stopped: "Stopped",
    timeout: "Time limit",
    error: "Connection error"
  }[status] || status;
  elements.statusBadge.className = `status-badge ${status}`;
  elements.statusBadge.textContent = label;

  const busy = ["connecting", "compiling", "running"].includes(status);
  const failed = ["compile-error", "runtime-error", "timeout", "error"].includes(status);
  elements.serverDot.className = `server-dot ${busy ? "busy" : failed ? "error" : "live"}`;
  elements.serverText.textContent = message || label;

  if (["success", "compile-error", "runtime-error", "stopped", "timeout", "error"].includes(status)) {
    isRunning = false;
    elements.runButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.consoleInput.disabled = true;
  } else if (busy) {
    isRunning = true;
    elements.runButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.consoleInput.disabled = status !== "running";
    if (status === "running") {
      elements.consoleInput.placeholder = "Type program input and press Enter";
      elements.consoleInput.focus();
    }
  }
}

function selectPanel(panelName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.panel === panelName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-panel-name]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panelName === panelName));
  if (panelName === "terminal") elements.outputNotice.classList.remove("visible");
  requestAnimationFrame(() => editor?.layout());
}

function runCode() {
  if (!editor || isRunning) return;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();

  clearTerminal();
  inputHistory = [];
  renderHistory();
  finalStatusSeen = false;
  setStatus("connecting", "Connecting to compiler server");
  appendOutput("Connecting to the compiler server…\n", "system");
  if (window.matchMedia("(max-width: 680px)").matches) selectPanel("terminal");

  const startedConnecting = performance.now();
  wakeTimer = setTimeout(() => {
    if (socket?.readyState === WebSocket.CONNECTING) {
      elements.serverText.textContent = "Waking Render server — the first run may take a moment";
      appendOutput("The server is waking up. Free Render services can take 30–60 seconds on the first run.\n", "system");
    }
  }, 2500);

  socket = new WebSocket(WS_URL);
  socket.addEventListener("open", () => {
    clearTimeout(wakeTimer);
    const seconds = ((performance.now() - startedConnecting) / 1000).toFixed(1);
    appendOutput(`Connected in ${seconds}s.\n`, "system");
    socket.send(JSON.stringify({ type: "run", language: currentLanguage, code: editor.getValue() }));
  });

  socket.addEventListener("message", (event) => {
    let data;
    try { data = JSON.parse(event.data); }
    catch (_error) { return appendOutput(String(event.data), "output"); }

    if (data.type === "output" || Object.hasOwn(data, "output")) appendOutput(data.output || "", data.stream || "output");
    if (data.type === "error") appendOutput(`\n${data.message}\n`, "error");
    if (data.type === "exit" && data.phase !== "compile") {
      appendOutput(`\n[Process finished${data.code === null ? "" : ` with exit code ${data.code}`} in ${(data.durationMs / 1000).toFixed(2)}s]\n`, data.code === 0 ? "success" : "error");
    }
    if (data.type === "status") {
      setStatus(data.status, data.message);
      if (["success", "compile-error", "runtime-error", "stopped", "timeout", "error"].includes(data.status)) finalStatusSeen = true;
    }
  });

  socket.addEventListener("error", () => {
    clearTimeout(wakeTimer);
    appendOutput("\nUnable to connect to the compiler server. Check the Render service and frontend config.\n", "error");
    finalStatusSeen = true;
    setStatus("error", "Compiler server unavailable");
  });

  socket.addEventListener("close", () => {
    clearTimeout(wakeTimer);
    if (isRunning && !finalStatusSeen) {
      appendOutput("\n[Connection closed before the program finished]\n", "error");
      setStatus("error", "Connection closed");
    }
  });
}

function stopCode() {
  if (!isRunning) return;
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
  else socket?.close();
  appendOutput("\nStopping process…\n", "system");
}

function submitInput() {
  const value = elements.consoleInput.value;
  if (!value && elements.consoleInput.value !== "") return;
  if (socket?.readyState !== WebSocket.OPEN || !isRunning) return;
  socket.send(JSON.stringify({ type: "input", value }));
  inputHistory.push(value);
  appendOutput(`${value}\n`, "input");
  elements.consoleInput.value = "";
  renderHistory();
}

function renderHistory() {
  elements.historyList.textContent = "";
  if (!inputHistory.length) {
    const empty = document.createElement("li");
    empty.className = "empty-history";
    empty.textContent = "No input submitted yet.";
    elements.historyList.appendChild(empty);
    return;
  }
  inputHistory.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = value || "(blank line)";
    elements.historyList.appendChild(item);
  });
}

function toggleHistory(open) {
  elements.historyDrawer.classList.toggle("open", open);
  elements.historyDrawer.setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
}

function resetCode() {
  if (!editor || !window.confirm(`Reset ${languageInfo[currentLanguage].filename} to the starter program?`)) return;
  localStorage.removeItem(STORAGE_PREFIX + currentLanguage);
  editor.setValue(languageInfo[currentLanguage].template);
  editor.focus();
}

function downloadCode() {
  if (!editor) return;
  const blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = languageInfo[currentLanguage].filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyOutput() {
  const text = elements.terminal.innerText;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    elements.copyButton.textContent = "Copied";
    setTimeout(() => { elements.copyButton.textContent = "Copy output"; }, 1300);
  } catch (_error) {
    appendOutput("\nCopy failed. Select the terminal text manually.\n", "error");
  }
}

function setupSplitter() {
  let dragging = false;
  elements.splitter.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 680px)").matches) return;
    dragging = true;
    elements.splitter.setPointerCapture(event.pointerId);
    document.body.style.cursor = "row-resize";
  });
  elements.splitter.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = elements.workspace.getBoundingClientRect();
    const editorHeight = Math.max(230, Math.min(event.clientY - rect.top, rect.height - 190));
    elements.workspace.style.gridTemplateRows = `${editorHeight}px 9px minmax(180px, 1fr)`;
    editor?.layout();
  });
  elements.splitter.addEventListener("pointerup", () => {
    dragging = false;
    document.body.style.cursor = "";
  });
}

elements.language.addEventListener("change", changeLanguage);
elements.runButton.addEventListener("click", runCode);
elements.stopButton.addEventListener("click", stopCode);
elements.resetButton.addEventListener("click", resetCode);
elements.downloadButton.addEventListener("click", downloadCode);
elements.clearButton.addEventListener("click", () => clearTerminal(true));
elements.copyButton.addEventListener("click", copyOutput);
elements.consoleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); submitInput(); }
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectPanel(tab.dataset.panel)));
document.getElementById("historyButton").addEventListener("click", () => toggleHistory(true));
document.getElementById("closeHistory").addEventListener("click", () => toggleHistory(false));
document.getElementById("drawerBackdrop").addEventListener("click", () => toggleHistory(false));
document.getElementById("clearHistory").addEventListener("click", () => { inputHistory = []; renderHistory(); });
elements.menuButton.addEventListener("click", () => {
  const open = elements.siteNav.classList.toggle("open");
  elements.menuButton.setAttribute("aria-expanded", String(open));
  elements.menuButton.textContent = open ? "×" : "☰";
});
elements.siteNav.addEventListener("click", () => {
  elements.siteNav.classList.remove("open");
  elements.menuButton.setAttribute("aria-expanded", "false");
  elements.menuButton.textContent = "☰";
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runCode(); }
  if (event.key === "Escape") toggleHistory(false);
});
window.addEventListener("beforeunload", () => {
  if (editor) localStorage.setItem(STORAGE_PREFIX + currentLanguage, editor.getValue());
  if (socket?.readyState === WebSocket.OPEN && isRunning) socket.send(JSON.stringify({ type: "stop" }));
});

document.getElementById("year").textContent = new Date().getFullYear();
setupSplitter();
