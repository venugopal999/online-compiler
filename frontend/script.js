"use strict";

const WS_URL = window.CODEBHAVYA_CONFIG?.compilerWebSocketUrl || "wss://online-compiler-srho.onrender.com";
const STORAGE_PREFIX = "codebhavya.compiler.v2.draft.";
const LANGUAGE_KEY = "codebhavya.compiler.v2.language";
const languageInfo = {
  c: { monaco: "c", filename: "program.c", label: "C program", template: `#include <stdio.h>

int main(void) {
    printf("Hello, CodeBhavya!\\n");
    return 0;
}
` },
  cpp: { monaco: "cpp", filename: "program.cpp", label: "C++ program", template: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, CodeBhavya!\\n";
    return 0;
}
` },
  python: { monaco: "python", filename: "program.py", label: "Python program", template: `print("Hello, CodeBhavya!")
` },
  java: { monaco: "java", filename: "Program.java", label: "Java program", template: `public class Program {
    public static void main(String[] args) {
        System.out.println("Hello, CodeBhavya!");
    }
}
` },
  javascript: { monaco: "javascript", filename: "program.js", label: "JavaScript program", template: `console.log("Hello, CodeBhavya!");
` }
};

const $ = (id) => document.getElementById(id);
const elements = {
  language: $("language"), filename: $("filename"), sourceTitle: $("sourceTitle"), saveState: $("saveState"),
  terminal: $("terminal"), consoleInput: $("consoleInput"), inputPreview: $("inputPreview"),
  runButton: $("runButton"), stopButton: $("stopButton"), resetButton: $("resetButton"),
  downloadButton: $("downloadButton"), clearButton: $("clearButton"), copyButton: $("copyButton"),
  copyCodeButton: $("copyCodeButton"), statusBadge: $("statusBadge"), serverDot: $("serverDot"),
  serverText: $("serverText"), historyDrawer: $("historyDrawer"), historyList: $("historyList"),
  outputNotice: $("outputNotice"), menuButton: $("menuButton"), siteNav: $("siteNav"),
  workspace: $("workspace"), sideStack: $("sideStack"), verticalSplitter: $("verticalSplitter"),
  horizontalSplitter: $("horizontalSplitter")
};

let editor, socket, saveTimer, wakeTimer;
let currentLanguage = languageInfo[localStorage.getItem(LANGUAGE_KEY)] ? localStorage.getItem(LANGUAGE_KEY) : "c";
let inputHistory = [];
let isRunning = false;
let finalStatusSeen = false;

function draftFor(language) { return localStorage.getItem(STORAGE_PREFIX + language) ?? languageInfo[language].template; }
function scheduleSave() {
  elements.saveState.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { localStorage.setItem(STORAGE_PREFIX + currentLanguage, editor.getValue()); elements.saveState.textContent = "Saved on this device"; }, 350);
}

require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  elements.language.value = currentLanguage;
  editor = monaco.editor.create($("editor"), {
    value: draftFor(currentLanguage), language: languageInfo[currentLanguage].monaco, theme: "vs-dark",
    automaticLayout: true, fontSize: 15, lineHeight: 23, minimap: { enabled: false }, padding: { top: 14 },
    scrollBeyondLastLine: false, smoothScrolling: true, cursorSmoothCaretAnimation: "on", wordWrap: "on", tabSize: 4
  });
  editor.onDidChangeModelContent(scheduleSave);
  updateLanguageMeta();
});

function updateLanguageMeta() {
  elements.filename.textContent = languageInfo[currentLanguage].filename;
  elements.sourceTitle.textContent = languageInfo[currentLanguage].label;
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
  if (showMessage) appendOutput("Ready for output. Run the program to see the result here.", "muted");
}
function appendOutput(text, kind = "output") {
  const span = document.createElement("span");
  const classes = { stderr: "terminal-error", error: "terminal-error", success: "terminal-success", input: "terminal-input", system: "terminal-system", muted: "terminal-muted" };
  span.className = classes[kind] || "";
  span.textContent = text;
  elements.terminal.appendChild(span);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
  if (window.matchMedia("(max-width: 760px)").matches && !$("terminalTab").classList.contains("active")) elements.outputNotice.classList.add("visible");
}
function setStatus(status, message) {
  const labels = { ready: "Ready", connecting: "Connecting", compiling: "Compiling", running: "Running", success: "Success", "compile-error": "Compile error", "runtime-error": "Runtime error", stopped: "Stopped", timeout: "Time limit", error: "Connection error" };
  elements.statusBadge.className = `status-badge ${status}`;
  elements.statusBadge.textContent = labels[status] || status;
  const busy = ["connecting", "compiling", "running"].includes(status);
  const failed = ["compile-error", "runtime-error", "timeout", "error"].includes(status);
  elements.serverDot.className = `server-dot ${busy ? "busy" : failed ? "error" : "live"}`;
  elements.serverText.textContent = message || labels[status] || status;
  if (["success", "compile-error", "runtime-error", "stopped", "timeout", "error"].includes(status)) {
    isRunning = false; elements.runButton.disabled = false; elements.stopButton.disabled = true; elements.consoleInput.disabled = true; elements.consoleInput.placeholder = "Run a program to enable input";
  } else if (busy) {
    isRunning = true; elements.runButton.disabled = true; elements.stopButton.disabled = false; elements.consoleInput.disabled = status !== "running";
    if (status === "running") { elements.consoleInput.placeholder = "Type one response and press Enter"; if (window.matchMedia("(min-width: 761px)").matches) elements.consoleInput.focus(); }
  }
}
function selectPanel(panelName) {
  document.querySelectorAll(".tab").forEach((tab) => { const active = tab.dataset.panel === panelName; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
  document.querySelectorAll("[data-panel-name]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panelName === panelName));
  if (panelName === "terminal") elements.outputNotice.classList.remove("visible");
  requestAnimationFrame(() => editor?.layout());
}

function runCode() {
  if (!editor || isRunning) return;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  clearTerminal(); inputHistory = []; renderHistory(); finalStatusSeen = false;
  setStatus("connecting", "Connecting to compiler server");
  appendOutput("Connecting to the compiler server…\n", "system");
  if (window.matchMedia("(max-width: 760px)").matches) selectPanel("terminal");
  const startedConnecting = performance.now();
  wakeTimer = setTimeout(() => {
    if (socket?.readyState === WebSocket.CONNECTING) { elements.serverText.textContent = "Waking Render server — first run may take a moment"; appendOutput("The server is waking up. A free Render service can take 30–60 seconds on the first run.\n", "system"); }
  }, 2500);
  socket = new WebSocket(WS_URL);
  socket.addEventListener("open", () => {
    clearTimeout(wakeTimer);
    appendOutput(`Connected in ${((performance.now() - startedConnecting) / 1000).toFixed(1)}s.\n`, "system");
    socket.send(JSON.stringify({ type: "run", language: currentLanguage, code: editor.getValue() }));
  });
  socket.addEventListener("message", (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (_error) { appendOutput(String(event.data)); return; }
    if (data.type === "output" || Object.hasOwn(data, "output")) appendOutput(data.output || "", data.stream || "output");
    if (data.type === "error") appendOutput(`\n${data.message}\n`, "error");
    if (data.type === "exit" && data.phase !== "compile") appendOutput(`\n[Process finished${data.code === null ? "" : ` with exit code ${data.code}`} in ${(data.durationMs / 1000).toFixed(2)}s]\n`, data.code === 0 ? "success" : "error");
    if (data.type === "status") { setStatus(data.status, data.message); if (["success", "compile-error", "runtime-error", "stopped", "timeout", "error"].includes(data.status)) finalStatusSeen = true; }
  });
  socket.addEventListener("error", () => { clearTimeout(wakeTimer); appendOutput("\nUnable to connect to the compiler server. Check the Render service and frontend config.\n", "error"); finalStatusSeen = true; setStatus("error", "Compiler server unavailable"); });
  socket.addEventListener("close", () => { clearTimeout(wakeTimer); if (isRunning && !finalStatusSeen) { appendOutput("\n[Connection closed before the program finished]\n", "error"); setStatus("error", "Connection closed"); } });
}
function stopCode() {
  if (!isRunning) return;
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" })); else socket?.close();
  appendOutput("\nStopping process…\n", "system");
}
function submitInput() {
  const value = elements.consoleInput.value;
  if (socket?.readyState !== WebSocket.OPEN || !isRunning) return;
  socket.send(JSON.stringify({ type: "input", value }));
  inputHistory.push(value); appendOutput(`${value}\n`, "input"); elements.consoleInput.value = ""; renderHistory();
}
function renderHistory() {
  [elements.historyList, elements.inputPreview].forEach((list) => {
    list.textContent = "";
    if (!inputHistory.length) { const empty = document.createElement("li"); empty.className = "empty-history"; empty.textContent = "No input submitted yet."; list.appendChild(empty); return; }
    inputHistory.forEach((value) => { const item = document.createElement("li"); item.textContent = value || "(blank line)"; list.appendChild(item); });
  });
}
function toggleHistory(open) {
  elements.historyDrawer.classList.toggle("open", open); elements.historyDrawer.setAttribute("aria-hidden", String(!open)); document.body.style.overflow = open ? "hidden" : "";
}
function resetCode() {
  if (!editor || !window.confirm(`Reset ${languageInfo[currentLanguage].filename} to the greeting program?`)) return;
  localStorage.removeItem(STORAGE_PREFIX + currentLanguage); editor.setValue(languageInfo[currentLanguage].template); editor.focus();
}
function downloadCode() {
  if (!editor) return;
  const url = URL.createObjectURL(new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = languageInfo[currentLanguage].filename; link.click(); URL.revokeObjectURL(url);
}
async function copyText(text, button, normalLabel) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); button.textContent = "Copied!"; setTimeout(() => { button.textContent = normalLabel; }, 1300); }
  catch (_error) { appendOutput("\nCopy failed. Select the text manually.\n", "error"); }
}

const SPLIT_STORAGE_KEY = "codebhavya.compiler.v3.panel-sizes";
const DEFAULT_SPLITS = { editor: 64, output: 58 };

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function loadPanelSizes() {
  let sizes;
  try { sizes = JSON.parse(localStorage.getItem(SPLIT_STORAGE_KEY)); } catch (_error) { sizes = null; }
  if (!sizes) return;
  elements.workspace.style.setProperty("--editor-size", `${clamp(Number(sizes.editor) || DEFAULT_SPLITS.editor, 42, 74)}%`);
  elements.sideStack.style.setProperty("--output-size", `${clamp(Number(sizes.output) || DEFAULT_SPLITS.output, 33, 72)}%`);
}

function savePanelSizes() {
  const workspaceRect = elements.workspace.getBoundingClientRect();
  const editorRect = document.querySelector(".source-panel").getBoundingClientRect();
  const sideRect = elements.sideStack.getBoundingClientRect();
  const outputRect = document.querySelector(".output-panel").getBoundingClientRect();
  localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({
    editor: Math.round((editorRect.width / Math.max(workspaceRect.width - 10, 1)) * 1000) / 10,
    output: Math.round((outputRect.height / Math.max(sideRect.height - 10, 1)) * 1000) / 10
  }));
}

function resetPanelSizes() {
  localStorage.removeItem(SPLIT_STORAGE_KEY);
  elements.workspace.style.removeProperty("--editor-size");
  elements.sideStack.style.removeProperty("--output-size");
  requestAnimationFrame(() => editor?.layout());
}

function setupSplitter(splitter, orientation) {
  const isVertical = orientation === "vertical";
  let dragging = false;

  function move(clientPosition) {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const container = (isVertical ? elements.workspace : elements.sideStack).getBoundingClientRect();
    const total = (isVertical ? container.width : container.height) - 10;
    const raw = clientPosition - (isVertical ? container.left : container.top);
    const minimum = isVertical ? 320 : 180;
    const trailingMinimum = isVertical ? 300 : 170;
    const pixels = clamp(raw, minimum, total - trailingMinimum);
    const percent = (pixels / Math.max(total, 1)) * 100;
    (isVertical ? elements.workspace : elements.sideStack).style.setProperty(isVertical ? "--editor-size" : "--output-size", `${percent}%`);
    editor?.layout();
  }

  splitter.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    dragging = true;
    splitter.classList.add("dragging");
    splitter.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("resizing");
    document.documentElement.style.cursor = isVertical ? "col-resize" : "row-resize";
  });
  splitter.addEventListener("pointermove", (event) => { if (dragging) move(isVertical ? event.clientX : event.clientY); });
  splitter.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
    document.documentElement.classList.remove("resizing");
    document.documentElement.style.cursor = "";
    savePanelSizes();
  });
  splitter.addEventListener("dblclick", resetPanelSizes);
  splitter.addEventListener("keydown", (event) => {
    const validKeys = isVertical ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    if (!validKeys.includes(event.key)) return;
    event.preventDefault();
    const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
    const target = isVertical ? elements.workspace : elements.sideStack;
    const property = isVertical ? "--editor-size" : "--output-size";
    const current = parseFloat(getComputedStyle(target).getPropertyValue(property)) || (isVertical ? DEFAULT_SPLITS.editor : DEFAULT_SPLITS.output);
    target.style.setProperty(property, `${clamp(current + direction * 2, isVertical ? 42 : 33, isVertical ? 74 : 72)}%`);
    savePanelSizes();
    editor?.layout();
  });
}

elements.language.addEventListener("change", changeLanguage);
elements.runButton.addEventListener("click", runCode);
elements.stopButton.addEventListener("click", stopCode);
elements.resetButton.addEventListener("click", resetCode);
elements.downloadButton.addEventListener("click", downloadCode);
elements.clearButton.addEventListener("click", () => clearTerminal(true));
elements.copyButton.addEventListener("click", () => copyText(elements.terminal.innerText, elements.copyButton, "Copy output"));
elements.copyCodeButton.addEventListener("click", () => copyText(editor?.getValue(), elements.copyCodeButton, "Copy code"));
elements.consoleInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submitInput(); } });
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectPanel(tab.dataset.panel)));
$("historyButton").addEventListener("click", () => toggleHistory(true));
$("closeHistory").addEventListener("click", () => toggleHistory(false));
$("drawerBackdrop").addEventListener("click", () => toggleHistory(false));
$("clearHistory").addEventListener("click", () => { inputHistory = []; renderHistory(); });
elements.menuButton.addEventListener("click", () => { const open = elements.siteNav.classList.toggle("open"); elements.menuButton.setAttribute("aria-expanded", String(open)); elements.menuButton.textContent = open ? "×" : "☰"; });
document.querySelectorAll(".dropdown-toggle").forEach((button) => button.addEventListener("click", (event) => {
  event.stopPropagation();
  const dropdown = button.closest(".nav-dropdown");
  const willOpen = !dropdown.classList.contains("open");
  document.querySelectorAll(".nav-dropdown.open").forEach((item) => { item.classList.remove("open"); item.querySelector(".dropdown-toggle").setAttribute("aria-expanded", "false"); });
  dropdown.classList.toggle("open", willOpen); button.setAttribute("aria-expanded", String(willOpen));
}));
document.addEventListener("click", (event) => { if (!event.target.closest(".nav-dropdown")) document.querySelectorAll(".nav-dropdown.open").forEach((item) => { item.classList.remove("open"); item.querySelector(".dropdown-toggle").setAttribute("aria-expanded", "false"); }); });
elements.siteNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { elements.siteNav.classList.remove("open"); elements.menuButton.setAttribute("aria-expanded", "false"); elements.menuButton.textContent = "☰"; }));
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runCode(); }
  if (event.key === "Escape") { toggleHistory(false); document.querySelectorAll(".nav-dropdown.open").forEach((item) => item.classList.remove("open")); }
});
window.addEventListener("beforeunload", () => {
  if (editor) localStorage.setItem(STORAGE_PREFIX + currentLanguage, editor.getValue());
  if (socket?.readyState === WebSocket.OPEN && isRunning) socket.send(JSON.stringify({ type: "stop" }));
});

$("year").textContent = new Date().getFullYear();
renderHistory();
loadPanelSizes();
setupSplitter(elements.verticalSplitter, "vertical");
setupSplitter(elements.horizontalSplitter, "horizontal");
