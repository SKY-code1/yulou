/* 陈大师 v1 · 展示页交互 */
const log = document.querySelector("#log");
const form = document.querySelector("#form");
const input = document.querySelector("#input");
const sendBtn = document.querySelector("#send");
const statusEl = document.querySelector(".status");
const statusText = document.querySelector("#statusText");

let busy = false;
let health = null;

const MOOD_LABEL = {
  neutral: "中性",
  friendly: "友好",
  depressed: "低落 · 安慰模式",
  sad: "悲伤 · 温柔模式",
  excited: "兴奋 · 共鸣模式",
  toxic: "攻击 · 缓和模式",
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmt(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function scrollBottom() {
  log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
}

function addLine(role, text, meta = "") {
  const el = document.createElement("div");
  el.className = `line ${role}`;
  const tag = role === "user" ? "USER" : "陈大师";
  const metaHtml = role === "master"
    ? `<div class="meta"><span class="time">${now()}</span>${meta ? `<span class="mood">${esc(meta)}</span>` : ""}</div>`
    : `<div class="meta"><span class="time">${now()}</span></div>`;
  el.innerHTML = `<span class="tag">${tag}</span><div class="text">${fmt(text)}</div>${metaHtml}`;
  log.appendChild(el);
  scrollBottom();
  return el;
}

function addTyping() {
  const el = document.createElement("div");
  el.className = "line master typing";
  el.innerHTML = `<span class="tag">陈大师</span><div class="text"><span id="stage">情绪判断…</span><span class="caret"></span></div>`;
  log.appendChild(el);
  scrollBottom();

  const stages = ["情绪判断…", "Agent 思考…", "调用工具…", "组织语言…"];
  let i = 0;
  const timer = setInterval(() => {
    i = Math.min(i + 1, stages.length - 1);
    const stage = el.querySelector("#stage");
    if (stage) stage.textContent = stages[i];
  }, 1800);

  return { el, timer };
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    health = await res.json();
    document.querySelector("#kModel").textContent = health.model || "—";
    document.querySelector("#kBase").textContent = (health.base || "—").replace("https://", "");
    document.querySelector("#kKey").textContent = health.has_key ? "已读取（Windows 环境变量）" : "未读取";
    statusEl.classList.toggle("ok", Boolean(health.ok));
    statusText.textContent = health.ok ? `${health.model} · ready` : "init error";
    if (!health.ok) {
      addLine("master", `初始化失败：${health.error || "未知错误"}`, "error");
    }
  } catch (err) {
    statusText.textContent = "offline";
    addLine("master", "连不上 v1 服务。先运行 `start_v1.bat`，再刷新。", "error");
  }
}

async function send(text) {
  if (!text.trim() || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  input.disabled = true;

  addLine("user", text);
  const typing = addTyping();
  const started = performance.now();

  try {
    const res = await fetch(`/chat?query=${encodeURIComponent(text)}`, { method: "POST" });
    const data = await res.json();
    clearInterval(typing.timer);
    typing.el.remove();

    if (data.error) {
      addLine("master", data.error, "error");
    } else {
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      const mood = MOOD_LABEL[data.mood] || data.mood || "中性";
      addLine("master", data.result || "（没有返回内容）", `${mood} · ${secs}s`);
    }
  } catch (err) {
    clearInterval(typing.timer);
    typing.el.remove();
    addLine("master", "请求失败：服务可能没有启动，或这一轮超时了。", "error");
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});

document.querySelector("#quick").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-q]");
  if (btn) send(btn.dataset.q);
});

loadHealth();
input.focus();
