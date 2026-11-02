// 用 CDP 控制 Edge 截图 / 交互测试（不依赖 puppeteer）
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const BASE = "http://127.0.0.1:8787";
const OUT = new URL("../shots/", import.meta.url).pathname.replace(/^\//, "");

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.waiters = new Map();
    this.errors = [];
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const key = `${msg.sessionId || ""}|${msg.method}`;
        const list = this.waiters.get(key) || [];
        for (const fn of list) fn(msg.params);
        this.waiters.delete(key);
        if (msg.method === "Runtime.exceptionThrown") {
          this.errors.push(msg.params.exceptionDetails?.text || "exception");
        }
        if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
          this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
        }
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  wait(method, sessionId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const key = `${sessionId || ""}|${method}`;
      const list = this.waiters.get(key) || [];
      const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeout);
      list.push((params) => { clearTimeout(timer); resolve(params); });
      this.waiters.set(key, list);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitFor(fn, timeout = 10000, step = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "edge-cdp-"));
  const proc = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { stdio: "ignore" });

  let version;
  await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      version = await r.json();
      return true;
    } catch { return false; }
  }, 15000);
  if (!version) throw new Error("Edge 没起来");

  const cdp = new CDP(version.webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  async function navigate(url) {
    const loaded = cdp.wait("Page.loadEventFired", sessionId, 15000);
    await cdp.send("Page.navigate", { url }, sessionId);
    await loaded.catch(() => {});
    await new Promise((r) => setTimeout(r, 900));
  }

  async function viewport(width, height, mobile = false, scale = 1) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: scale, mobile,
      screenWidth: width, screenHeight: height,
    }, sessionId);
  }

  async function evaluate(expression) {
    const r = await cdp.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  }

  async function shot(name) {
    const r = await cdp.send("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false,
    }, sessionId);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, "base64"));
    console.log("shot", name);
  }

  // 桌面端状态截图
  await viewport(1440, 1000, false, 1);
  for (const state of ["welcome", "chart", "fortune", "gua", "dream", "topic", "fengshui"]) {
    await navigate(`${BASE}/?shot=${state}`);
    await evaluate("document.fonts && document.fonts.ready");
    await new Promise((r) => setTimeout(r, 500));
    await shot(`d-${state}`);
  }

  // 手机端
  await viewport(390, 844, true, 2);
  await navigate(`${BASE}/?shot=mobile`);
  await new Promise((r) => setTimeout(r, 500));
  await shot("m-chart");
  await navigate(`${BASE}/?shot=welcome`);
  await new Promise((r) => setTimeout(r, 500));
  await shot("m-welcome");

  // 真实交互：清空 localStorage → 填生辰 → 发消息
  await viewport(1440, 1000, false, 1);
  await navigate(`${BASE}/`);
  await evaluate("localStorage.clear(); location.reload()");
  await new Promise((r) => setTimeout(r, 1200));
  await evaluate(`(() => {
    const f = document.querySelector('#birthForm');
    if (!f) return 'no form';
    f.querySelector('[name=name]').value = '林小满';
    f.querySelector('[name=gender]').value = '女';
    f.querySelector('[name=date]').value = '1998-08-15';
    f.querySelector('[name=time]').value = '09:30';
    f.querySelector('[name=place]').value = '南京';
    f.requestSubmit();
    return 'submitted';
  })()`);
  await new Promise((r) => setTimeout(r, 800));
  await shot("flow-chart");

  await evaluate(`(() => {
    const i = document.querySelector('#input');
    i.value = '今天运势怎么样';
    document.querySelector('#form').requestSubmit();
  })()`);
  await new Promise((r) => setTimeout(r, 2200));
  await shot("flow-fortune");

  await evaluate(`(() => {
    const i = document.querySelector('#input');
    i.value = '摇一卦';
    document.querySelector('#form').requestSubmit();
  })()`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot("flow-ask-gua");

  console.log("page errors:", JSON.stringify(cdp.errors));
  cdp.close();
  proc.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
