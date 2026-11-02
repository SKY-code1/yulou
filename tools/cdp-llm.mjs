// 验证接入大模型后的界面：徽标、自由聊天、改写动作
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9335;
const BASE = "http://127.0.0.1:8788";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "edge-llm-"));
  const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 80; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(150); }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    const p = { id: mid, method, params }; if (sessionId) p.sessionId = sessionId;
    ws.send(JSON.stringify(p));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    return r.result?.value;
  };
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: `${BASE}/` }, sessionId);
  await sleep(1200);
  console.log("badge:", await ev("document.querySelector('#modeText').textContent"));

  await ev(`(() => {
    const f = document.querySelector('#birthForm');
    f.querySelector('[name=name]').value = '林小满';
    f.querySelector('[name=gender]').value = '女';
    f.querySelector('[name=date]').value = '1998-08-15';
    f.querySelector('[name=time]').value = '09:30';
    f.requestSubmit();
  })()`);
  await sleep(800);
  const before = await ev("document.querySelectorAll('.msg').length");
  await ev(`(() => { const i=document.querySelector('#input'); i.value='你叫什么，能做什么'; document.querySelector('#form').requestSubmit(); })()`);
  for (let i = 0; i < 60; i += 1) {
    if (await ev(`document.querySelectorAll('.msg').length > ${before} && !document.querySelector('.typing')`)) break;
    await sleep(200);
  }
  await sleep(400);
  const texts = await ev("[...document.querySelectorAll('.msg.master .bubble')].slice(-1)[0].textContent");
  console.log("reply starts:", texts.slice(0, 40));
  console.log("rewrite action:", await ev("[...document.querySelectorAll('.msg-actions button')].some(b=>b.textContent.includes('细说'))"));

  const n = await ev("document.querySelectorAll('.msg').length");
  await ev(`[...document.querySelectorAll('.msg-actions button')].find(b=>b.textContent.includes('细说')).click()`);
  for (let i = 0; i < 60; i += 1) {
    if (await ev(`document.querySelectorAll('.msg').length > ${n} && !document.querySelector('.typing')`)) break;
    await sleep(200);
  }
  console.log("after rewrite:", await ev("document.querySelectorAll('.msg').length"));
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(new URL("../shots/d-llm.png", import.meta.url).pathname.replace(/^\//, ""), Buffer.from(shot.data, "base64"));
  proc.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
