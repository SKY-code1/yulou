// v1 展示页截图 / 冒烟测试
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9337;
const BASE = "http://127.0.0.1:8790";
const OUT = new URL("../shots/", import.meta.url).pathname.replace(/^\//, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "edge-v1-"));
  const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(150); }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
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
  const viewport = (w, h, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile, screenWidth: w, screenHeight: h }, sessionId);
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, "base64"));
    console.log("shot", name);
  };
  const waitFor = async (expr, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await ev(expr)) return true;
      await sleep(200);
    }
    return false;
  };
  const ask = async (text, waitMs) => {
    const before = await ev("document.querySelectorAll('.line.master').length");
    await ev(`(() => { const i=document.querySelector('#input'); i.value=${JSON.stringify(text)}; document.querySelector('#form').requestSubmit(); })()`);
    await waitFor(`document.querySelectorAll('.line.master').length > ${before} && !document.querySelector('.typing')`, waitMs);
    await sleep(400);
  };

  await viewport(1280, 900);
  await send("Page.navigate", { url: `${BASE}/` }, sessionId);
  await sleep(1400);
  console.log("status:", await ev("document.querySelector('#statusText').textContent"));
  await shot("v1-welcome");

  await ask("你是谁，介绍一下自己", 90000);
  await shot("v1-answer");

  await ask("我叫林小满，女，公历1998年8月15日上午9点半出生，帮我看看今年运势", 180000);
  await shot("v1-bazi");

  await viewport(390, 844, true);
  await send("Page.navigate", { url: `${BASE}/` }, sessionId);
  await sleep(1200);
  await shot("v1-mobile");

  console.log("errors:", JSON.stringify(errors));
  proc.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
