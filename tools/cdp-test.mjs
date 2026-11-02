// 端到端检查：生辰表单、意图路由、六爻、解梦、风水、持久化、手机抽屉、二维码
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const BASE = "http://127.0.0.1:8787";
const OUT = new URL("../shots/", import.meta.url).pathname.replace(/^\//, "");

class CDP {
  constructor(ws) { this.ws = new WebSocket(ws); this.id = 0; this.pending = new Map(); this.waiters = new Map(); this.errors = []; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        const key = `${msg.sessionId || ""}|${msg.method}`;
        (this.waiters.get(key) || []).forEach((fn) => fn(msg.params));
        this.waiters.delete(key);
        if (msg.method === "Runtime.exceptionThrown") this.errors.push(msg.params.exceptionDetails?.text || "exception");
        if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id; const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch {} }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0; let failed = 0;
function ok(cond, label, extra = "") {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label} ${extra}`); }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "edge-test-"));
  const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(150); }
  }
  if (!version) throw new Error("edge not started");

  const cdp = new CDP(version.webSocketDebuggerUrl);
  await cdp.open();
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  const ev = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
    return r.result?.value;
  };
  const viewport = (width, height, mobile = false) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height }, sessionId);
  const nav = async (url) => {
    await cdp.send("Page.navigate", { url }, sessionId);
    await sleep(1100);
  };
  const waitFor = async (expr, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await ev(expr)) return true;
      await sleep(120);
    }
    return false;
  };
  const send = async (text) => {
    const before = await ev("document.querySelectorAll('.msg').length");
    await ev(`(() => { const i = document.querySelector('#input'); i.value = ${JSON.stringify(text)}; document.querySelector('#form').requestSubmit(); })()`);
    await waitFor(`document.querySelectorAll('.msg').length >= ${before + 2} && !document.querySelector('.typing')`, 15000);
    await sleep(250);
  };
  const shot = async (name) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, "base64"));
  };

  await viewport(1440, 1000);
  await nav(`${BASE}/`);
  await ev("localStorage.clear(); location.reload()");
  await sleep(1200);

  ok(await ev("!!document.querySelector('#birthForm')"), "首屏出现生辰表单");
  ok(!(await ev("!!document.querySelector('.chart-card')")), "未填生辰时不显示命盘");
  ok((await ev("document.querySelectorAll('#quick button').length")) === 3, "未立盘时的快捷问题");

  // 表单
  await ev(`(() => {
    const f = document.querySelector('#birthForm');
    f.querySelector('[name=name]').value = '林小满';
    f.querySelector('[name=gender]').value = '女';
    f.querySelector('[name=date]').value = '1998-08-15';
    f.querySelector('[name=time]').value = '09:30';
    f.querySelector('[name=place]').value = '南京';
    f.requestSubmit();
  })()`);
  await sleep(900);
  ok(await ev("!!document.querySelector('.chart-card')"), "提交后出现命盘卡");
  ok(!(await ev("!!document.querySelector('#birthForm')")), "提交后表单被移除");
  ok(await ev("!!document.querySelector('.cm-pillars')"), "侧栏命盘更新");
  ok((await ev("JSON.parse(localStorage.getItem('yulou.v1')).profile.name")) === "林小满", "生辰写入 localStorage");
  ok((await ev("document.querySelector('.chart-card .pillar .gan').textContent")) === "戊", "年柱天干正确");

  await send("今天运势怎么样");
  ok(await ev("!!document.querySelector('.fortune-card')"), "流日卡");
  await send("今年运势怎么样");
  ok((await ev("document.querySelectorAll('.fortune-card').length")) >= 2, "流年卡");

  await send("看看我今年的事业");
  ok(await ev("!!document.querySelector('.card .fortune-body')"), "事业分项");

  await send("摇一卦");
  ok((await ev("document.querySelectorAll('.msg-actions button').length")) >= 4, "起卦先问哪一路");
  await ev(`[...document.querySelectorAll('.msg-actions button')].find(b => b.textContent.includes('问事业')).click()`);
  await waitFor("!!document.querySelector('.gua-line')", 15000);
  await sleep(300);
  ok((await ev("document.querySelectorAll('.gua-line').length")) === 6, "六爻六条线");
  ok((await ev("document.querySelectorAll('.gua-line.yin i').length")) % 2 === 0, "阴爻两段");
  ok(await ev("!!document.querySelector('.gua-name')"), "卦名");

  await send("解个梦");
  await send("梦见一条大蛇追我，后来掉进水里");
  ok((await ev("document.querySelectorAll('.dream-item').length")) >= 2, "解梦命中多个意象");

  await send("卧室风水怎么摆");
  ok(await ev("!!document.querySelector('.fs-list')"), "风水建议");

  // 持久化
  const msgCount = await ev("document.querySelectorAll('.msg').length");
  await nav(`${BASE}/`);
  await sleep(600);
  ok((await ev("document.querySelectorAll('.msg').length")) === msgCount, "刷新后聊天记录还在", `${msgCount}`);
  ok(await ev("!!document.querySelector('.cm-pillars')"), "刷新后命盘还在");

  // 手机抽屉
  await viewport(390, 844, true);
  await nav(`${BASE}/`);
  await ev("document.querySelector('#chartBtn').click()");
  await sleep(400);
  ok(!(await ev("document.querySelector('#sheet').hidden")), "手机命盘抽屉打开");
  await ev("document.querySelector('#sideClose').click()");
  await sleep(300);
  ok(await ev("document.querySelector('#sheet').hidden"), "手机命盘抽屉关闭");

  // 二维码
  await ev("document.querySelector('#qrBtn').click()");
  await sleep(900);
  ok(!(await ev("document.querySelector('#qrModal').hidden")), "手机访问弹层");
  ok(await ev("!!document.querySelector('#qrBox svg')"), "二维码渲染");
  const qrText = await ev("document.querySelector('#qrUrl').textContent");
  ok(/^http:\/\/\d+\.\d+\.\d+\.\d+:8787\/$/.test(qrText), "局域网地址正确", qrText);
  await ev("document.querySelector('#qrClose').click()");

  // 直接报生辰（新开一个干净状态）
  await viewport(1440, 1000);
  await nav(`${BASE}/`);
  await ev("localStorage.clear(); location.reload()");
  await sleep(1200);
  await send("1998年8月15日 上午9点半 女");
  ok(await ev("!!document.querySelector('.chart-card')"), "一句话报生辰也能排盘");

  await shot("e2e-last");

  ok(cdp.errors.length === 0, "无控制台错误", JSON.stringify(cdp.errors));
  console.log(`\n${failed === 0 ? "PASS" : "FAIL"}  ${passed} passed, ${failed} failed`);
  cdp.close();
  proc.kill();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
