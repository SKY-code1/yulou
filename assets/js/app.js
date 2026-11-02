// 玉楼问命 · 交互层
// 纯前端：排盘、流日/流年、六爻、解梦、风水都在本地算。
// 可选：启动 server.py 并配置大模型后，由服务端把结果“说成人话”。

import {
  buildChart, describeChart, elementColor, validateBirth,
} from "./engine/bazi.js";
import {
  dailyFortune, yearlyFortune, topicReading, hashString,
} from "./engine/fortune.js";
import {
  castHexagram, hexagramFromLines, emphasis,
} from "./engine/hexagram.js";
import { interpretDream } from "./engine/dream.js";
import { fengshuiAdvice } from "./engine/fengshui.js";
import {
  opening, chartIntro, birthMissing, needBirthFor, smallTalk,
  detectMood, catchphrase, closingNote,
} from "./engine/persona.js";

const $ = (sel) => document.querySelector(sel);
const messagesEl = $("#messages");
const scrollEl = $("#scroll");
const formEl = $("#form");
const inputEl = $("#input");
const quickEl = $("#quick");
const chartPanel = $("#chartPanel");
const sideEl = $("#side");
const sheetEl = $("#sheet");
const sheetBackdrop = $("#sheetBackdrop");
const sheetContent = $("#sheetContent");
const modeBadge = $("#modeBadge");
const modeText = $("#modeText");
const llmStatus = $("#llmStatus");

const STORAGE_KEY = "yulou.v1";
const DEMO_PROFILE = {
  name: "林小满", gender: "女", date: "1998-08-15", time: "09:30",
  hourKnown: true, place: "南京",
};

const state = {
  profile: null,
  chart: null,
  messages: [],
  mood: "neutral",
  pending: null,
  busy: false,
  llm: false,
  model: "",
  health: null,
  demo: false,
  seq: 0,
};

/* ---------------------------------------------------------------- 小工具 */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmt(text) {
  if (!text) return "";
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function uid() {
  state.seq += 1;
  return `m${Date.now().toString(36)}${state.seq}`;
}

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scrollBottom(behavior = "smooth") {
  requestAnimationFrame(() => {
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
  });
}

function starsHTML(score) {
  const n = Math.max(0, Math.min(5, Math.round(score)));
  return `<span class="stars" aria-label="${score} 分，满分 5 分">${"★".repeat(n)}<span class="off">${"☆".repeat(5 - n)}</span></span>`;
}

function basis(list) {
  if (!list || !list.length) return "";
  return `<details class="basis"><summary>推演依据</summary><ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
}

/* ---------------------------------------------------------------- 渲染：卡片 */

function chartCard(chart) {
  const order = [["year", "年柱"], ["month", "月柱"], ["day", "日柱"], ["hour", "时柱"]];
  const pillars = order.map(([key, label]) => {
    const p = chart.pillars[key];
    const cls = key === "day" ? "pillar day" : "pillar";
    return `
      <div class="${cls}">
        <span class="label">${label}</span>
        <span class="gan" style="color:${elementColor(p.ganElement)}">${p.gan}</span>
        <span class="zhi" style="color:${elementColor(p.zhiElement)}">${p.zhi}</span>
        <span class="god">${p.tenGod || "日主"}</span>
        <span class="nayin">${p.nayin}</span>
      </div>`;
  }).join("");

  const bars = ["木", "火", "土", "金", "水"].map((e) => {
    const w = chart.elements.percent[e];
    return w > 0 ? `<i style="width:${w}%;background:${elementColor(e)}" title="${e} ${w}%"></i>` : "";
  }).join("");

  const legend = ["木", "火", "土", "金", "水"].map((e) => `
    <div class="el-item">
      <b><em style="background:${elementColor(e)}"></em>${e}</b>
      <span>${chart.elements.percent[e]}%</span>
    </div>`).join("");

  return `
  <section class="card chart-card">
    <div class="card-head"><span>四柱命盘</span><span class="tag">${chart.summary.zodiac} · ${chart.summary.constellation}</span></div>
    <div class="pillars">${pillars}</div>
    <div class="chart-foot">
      <div class="el-bar">${bars}</div>
      <div class="el-legend">${legend}</div>
      <div class="chart-facts">
        <div class="fact"><span class="k">日主</span><span class="v">${chart.dayMaster.stem}${chart.dayMaster.element} · ${chart.strength.label}</span></div>
        <div class="fact"><span class="k">喜用</span><span class="v">${chart.elements.favorable.join(" / ")}</span></div>
        <div class="fact"><span class="k">出生</span><span class="v">${chart.summary.birth}</span></div>
      </div>
      ${basis([
        `公历 ${chart.summary.birth}（${chart.summary.weekday}）`,
        `四柱 ${chart.summary.bazi}`,
        `子初换日：23:00 起算次日`,
        chart.summary.birthNote || "时辰已填",
      ])}
    </div>
  </section>`;
}

function readingCard(data) {
  return `
  <section class="card">
    <div class="card-head"><span>${esc(data.title || "盘外的话")}</span><span>${data.tag || ""}</span></div>
    <div class="fortune-body">${(data.paragraphs || []).map((p) => `<p>${fmt(p)}</p>`).join("")}</div>
    ${data.tips && data.tips.length ? `<div class="tips"><span class="tips-k">老夫的建议</span><ul>${data.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
    ${basis(data.basis || [])}
  </section>`;
}

function fortuneCard(f) {
  const isYear = f.type === "yearly";
  const yi = f.yi || ["顺势", "把事做完", "早点睡"];
  const ji = f.ji || ["硬碰硬", "临时改主意"];
  const months = isYear && f.keyMonths?.length
    ? `<div class="lucky">${f.keyMonths.map((m) => `<span><b>${m.label}</b> ${m.branch}${m.rel}</span>`).join("")}</div>`
    : "";
  return `
  <section class="card fortune-card">
    <div class="card-head">
      <span>${isYear ? "流年" : "流日"} · ${isYear ? f.year : f.date.label}</span>
      <span class="tag">${f.ganzhi} ${isYear ? "年" : "日"}</span>
    </div>
    <div class="fortune-top">
      <div>
        <div class="fortune-score"><b>${f.stars.toFixed(1)}</b><span>/ 5</span></div>
        ${starsHTML(f.stars)}
      </div>
      <div class="fortune-date">
        <b>${isYear ? f.taishui : f.date.weekday}</b>
        ${isYear ? "太岁" : f.date.label}<br>
        ${f.god} · ${isYear ? f.ganzhi : (f.relation || "平和")}
      </div>
    </div>
    <div class="gz-line">
      ${isYear
        ? `流年走 <span class="gz">${f.god}</span>，${f.taishui === "平" ? "与命局没有明显刑冲合害" : `与年支为「${f.taishui}」`}。`
        : `今日 <span class="gz">${f.ganzhi}</span> 日，对你走 <span class="gz">${f.god}</span>${f.relation ? `，与日支${f.relation}` : ""}。`}
    </div>
    <div class="yiji">
      <div class="yiji-row yi"><span class="k">宜</span><div class="items">${yi.map((x) => `<span>${esc(x)}</span>`).join("")}</div></div>
      <div class="yiji-row ji"><span class="k">忌</span><div class="items">${ji.map((x) => `<span>${esc(x)}</span>`).join("")}</div></div>
    </div>
    <div class="fortune-body">${(f.paragraphs || []).map((p) => `<p>${fmt(p)}</p>`).join("")}</div>
    ${months}
    ${!isYear ? `<div class="lucky">
      <span>幸运色 <b>${esc(f.lucky.color)}</b></span>
      <span>方位 <b>${esc(f.lucky.direction)}</b></span>
      <span>数字 <b>${esc(f.lucky.number)}</b></span>
    </div>` : ""}
    ${basis(f.basis)}
  </section>`;
}

function hexagramCard(g, title = "六爻起卦") {
  const lines = [];
  for (let i = 5; i >= 0; i -= 1) {
    const v = g.lines[i];
    const yang = v === 7 || v === 9;
    const moving = g.moving.includes(i);
    lines.push(`<div class="gua-line ${yang ? "yang" : "yin"} ${moving ? "moving" : ""}" title="${v === 6 ? "老阴" : v === 7 ? "少阳" : v === 8 ? "少阴" : "老阳"}">
      <i></i>${yang ? "" : "<i></i>"}
    </div>`);
  }
  const h = g.ben;
  return `
  <section class="card">
    <div class="card-head"><span>${esc(title)}</span><span class="tag">${g.question ? `所问：${esc(g.question)}` : `所问：${esc(g.topic)}`}</span></div>
    <div class="gua-main">
      <div class="gua-lines">${lines.join("")}</div>
      <div>
        <div class="gua-name">第 ${h.id} 卦 · ${h.name}</div>
        <div class="gua-image">${h.image}</div>
        <div class="gua-summary">${h.summary}${g.bian ? ` · 变 ${g.bian.name}（${g.bian.image}）` : " · 六爻安静"}</div>
      </div>
    </div>
    <div class="gua-text">
      <p class="guaci">${esc(h.guaci)}</p>
      <p class="trans">${esc(h.translation)}</p>
      <p class="trans">象曰：${esc(h.xiang)}</p>
    </div>
    ${g.movingTexts.length ? `<div class="gua-moving">${g.movingTexts.map((m) => `<div><b>动爻 · ${m.label}</b>　${esc(m.text.replace(/^[初上]?[九六][一二三四五]?[：:]\s*/, ""))}</div>`).join("")}</div>` : ""}
    <div class="gua-advice">${esc(g.advice)}</div>
    ${basis(g.basis)}
  </section>`;
}

function dreamCard(d) {
  if (!d.symbols.length) {
    return `
    <section class="card">
      <div class="card-head"><span>解梦</span><span class="tag">未对上号</span></div>
      <div class="fortune-body"><p>${fmt(d.summary)}</p><p>${fmt(d.advice)}</p></div>
      ${basis(d.basis)}
    </section>`;
  }
  return `
  <section class="card">
    <div class="card-head"><span>解梦 · ${esc(d.tone)}</span><span class="tag">${d.symbols.length} 个意象</span></div>
    ${d.symbols.map((s) => `
      <div class="dream-item">
        <div class="dream-head"><b>${esc(s.title)}</b><span class="tone ${esc(s.tone)}">${esc(s.tone)}</span></div>
        <p><span class="label">民俗</span>${esc(s.traditional)}</p>
        <p><span class="label">心理</span>${esc(s.psychology)}</p>
        <p><span class="label">老夫说</span>${esc(s.advice)}</p>
      </div>`).join("")}
    ${basis(d.basis)}
  </section>`;
}

function fengshuiCard(f) {
  return `
  <section class="card">
    <div class="card-head"><span>${f.topic ? `${esc(f.topic)} · 看三样` : "风水 · 看三样"}</span><span class="tag">光 / 风 / 动线</span></div>
    <div class="fs-intro">${fmt(f.intro)}</div>
    <ol class="fs-list">${f.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    <div class="fs-avoid"><b>少做</b>${f.avoid.map((a) => `<span>· ${esc(a)}</span>`).join("")}</div>
    <div class="fortune-body" style="padding-top:12px"><p>${fmt(f.elementTip)}</p></div>
    ${basis(f.basis)}
  </section>`;
}

function birthFormCard() {
  return `
  <section class="card">
    <div class="card-head"><span>立命盘 · 只需一次</span><span class="tag">公历 · 本地计算</span></div>
    <form class="birth-form" id="birthForm" novalidate>
      <div class="birth-grid">
        <div class="field">
          <label for="bName">称呼</label>
          <input id="bName" name="name" placeholder="怎么称呼你" maxlength="12" value="">
        </div>
        <div class="field">
          <label for="bGender">性别</label>
          <select id="bGender" name="gender">
            <option value="">不便说</option>
            <option value="女">女</option>
            <option value="男">男</option>
          </select>
        </div>
        <div class="field full">
          <label for="bDate">出生日期 · 公历</label>
          <input id="bDate" name="date" type="date" min="1900-01-01" max="${todayISO()}" required>
          <span class="hint">公历，例：1998-08-15；点右侧日历图标也可选</span>
        </div>
        <div class="field">
          <label for="bTime">出生时间</label>
          <input id="bTime" name="time" type="time" value="12:00">
        </div>
        <div class="field">
          <label for="bPlace">出生地（可选）</label>
          <input id="bPlace" name="place" placeholder="如：南京" maxlength="20">
        </div>
        <div class="field full">
          <label class="check"><input id="bKnown" name="hourKnown" type="checkbox" checked> 时辰确定（不确定就按午时估算）</label>
        </div>
      </div>
      <div class="form-error" id="formError" role="alert"></div>
      <div class="birth-actions">
        <button class="btn btn-primary" type="submit">排盘</button>
        <button class="skip" type="button" data-skip>先不填，随便聊聊</button>
      </div>
    </form>
  </section>`;
}

function cardHTML(card) {
  switch (card.kind) {
    case "chart": return chartCard(card.data);
    case "fortune": return fortuneCard(card.data);
    case "hexagram": return hexagramCard(card.data, card.title);
    case "dream": return dreamCard(card.data);
    case "fengshui": return fengshuiCard(card.data);
    case "reading": return readingCard(card.data);
    case "form": return birthFormCard();
    default: return "";
  }
}

/* ---------------------------------------------------------------- 渲染：消息 */

function messageNode(msg) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${msg.role}`;
  wrap.dataset.id = msg.id;

  const avatar = msg.role === "master" ? `<div class="avatar" aria-hidden="true">陈</div>` : "";
  const meta = msg.role === "master"
    ? `<div class="meta"><b>陈大师</b><time>${msg.time || ""}</time></div>`
    : "";

  const bubble = msg.text ? `<div class="bubble">${fmt(msg.text)}</div>` : "";
  const cards = msg.cards?.length ? `<div class="cards">${msg.cards.map(cardHTML).join("")}</div>` : "";
  const actions = msg.actions?.length
    ? `<div class="msg-actions">${msg.actions.map((a, i) => `<button type="button" data-action="${i}">${esc(a.label)}</button>`).join("")}</div>`
    : "";

  wrap.innerHTML = `${avatar}<div class="body">${meta}${bubble}${cards}${actions}</div>`;
  return wrap;
}

function addMessage(msg, { save = true, scroll = true } = {}) {
  msg.id = msg.id || uid();
  msg.time = msg.time || nowHM();
  if (msg.llmContext && state.llm && !msg.actions?.some((a) => a.llm)) {
    msg.actions = [...(msg.actions || []), { label: "让大师细说", llm: true }];
  }
  state.messages.push(msg);
  messagesEl.appendChild(messageNode(msg));
  if (save) saveState();
  if (scroll) scrollBottom();
  return msg;
}

function typingNode() {
  const el = document.createElement("div");
  el.className = "msg master typing";
  el.innerHTML = `<div class="avatar" aria-hidden="true">陈</div><div class="body"><div class="meta"><b>陈大师</b></div><div class="bubble"><i></i><i></i><i></i></div></div>`;
  return el;
}

/* ---------------------------------------------------------------- 命盘 / 侧栏 */

function setProfile(profile) {
  const chart = chartFromProfile(profile);
  state.profile = profile;
  state.chart = chart;
  renderSide();
  updateQuick();
  saveState();
  return chart;
}

function chartFromProfile(p) {
  const [y, m, d] = String(p.date).split("-").map(Number);
  const [h, min] = String(p.time || "12:00").split(":").map(Number);
  return buildChart({
    name: p.name || "",
    gender: p.gender || "",
    year: y, month: m, day: d,
    hour: h, minute: min,
    hourKnown: p.hourKnown !== false,
    place: p.place || "",
  });
}

function sideChartHTML(chart) {
  const order = ["year", "month", "day", "hour"];
  const labels = { year: "年", month: "月", day: "日", hour: "时" };
  const pillars = order.map((k) => {
    const p = chart.pillars[k];
    return `<div class="cm-pillar ${k === "day" ? "day" : ""}">
      <span class="k">${labels[k]}柱</span>
      <span class="v" style="color:${elementColor(p.ganElement)}">${p.gan}<span style="color:${elementColor(p.zhiElement)}">${p.zhi}</span></span>
      <span class="g">${p.tenGod || "日主"}</span>
    </div>`;
  }).join("");

  const bars = ["木", "火", "土", "金", "水"].map((e) => {
    const w = chart.elements.percent[e];
    return w > 0 ? `<i style="width:${w}%;background:${elementColor(e)}"></i>` : "";
  }).join("");

  return `
  <div class="chart-mini">
    <div class="cm-top">
      <span class="cm-name">${esc(chart.summary.name)}</span>
      <span class="cm-sub">${chart.summary.birth.replace(" ", " · ")}</span>
    </div>
    <div class="cm-pillars">${pillars}</div>
    <div class="cm-bar">${bars}</div>
    <div class="cm-legend">${["木", "火", "土", "金", "水"].map((e) => `<span><b style="background:${elementColor(e)}"></b>${e} ${chart.elements.percent[e]}%</span>`).join("")}</div>
    <div class="cm-block">
      <div class="k">日主 / 强弱</div>
      <div class="v">${chart.dayMaster.stem}${chart.dayMaster.element} · ${chart.strength.label}（${Math.round(chart.strength.ratio * 100)}% 得助）</div>
    </div>
    <div class="cm-block">
      <div class="k">喜用</div>
      <div class="cm-chips">${chart.elements.favorable.map((e) => `<span class="chip gold">${e}</span>`).join("")}${chart.elements.missing.length ? `<span class="chip red">缺 ${chart.elements.missing.join("、")}</span>` : ""}</div>
    </div>
    <div class="cm-block">
      <div class="k">命局关系</div>
      <div class="v">${chart.relations.length ? chart.relations.map((r) => `${r.a}${r.b}${r.rel}`).join(" · ") : "无明显合冲"}</div>
    </div>
    <div class="cm-actions">
      <button class="btn btn-ghost" data-side="today" type="button">今日</button>
      <button class="btn btn-ghost" data-side="year" type="button">今年</button>
      <button class="btn btn-ghost" data-side="gua" type="button">摇一卦</button>
      <button class="btn btn-ghost" data-side="birth" type="button">重填生辰</button>
    </div>
  </div>`;
}

function renderSide() {
  if (!state.chart) {
    chartPanel.innerHTML = `
      <div class="empty-chart">
        <div class="empty-ring" aria-hidden="true"><span>命</span></div>
        <p class="empty-title">命盘未立</p>
        <p class="empty-desc">报上公历生辰，老夫替你把四柱排出来。填一次，后面就不用再报。</p>
        <button class="btn btn-primary" id="emptyChartBtn" type="button">填写生辰</button>
      </div>`;
  } else {
    chartPanel.innerHTML = sideChartHTML(state.chart);
  }
  if (!sheetEl.hidden) sheetContent.innerHTML = chartPanel.innerHTML;
}

const QUICK_NO_CHART = [
  { label: "填写生辰", kind: "form" },
  { label: "先随便聊聊", text: "先随便聊聊" },
  { label: "你能做什么", text: "你能做什么" },
];
const QUICK_CHART = [
  { label: "今日运势", text: "今天运势怎么样" },
  { label: "今年运势", text: "今年运势怎么样" },
  { label: "摇一卦", text: "摇一卦" },
  { label: "解个梦", text: "解个梦" },
  { label: "问风水", text: "卧室风水怎么摆" },
];

function updateQuick() {
  const items = state.chart ? QUICK_CHART : QUICK_NO_CHART;
  quickEl.innerHTML = items.map((q, i) => `<button type="button" data-quick="${i}">${esc(q.label)}</button>`).join("");
}

/* ---------------------------------------------------------------- 回复构建 */

function compactChart(chart) {
  return {
    bazi: chart.summary.bazi,
    dayMaster: `${chart.dayMaster.stem}${chart.dayMaster.element}`,
    strength: chart.strength.label,
    favorable: chart.elements.favorable,
    zodiac: chart.summary.zodiac,
    birth: chart.summary.birth,
  };
}

function chartReply(short = false) {
  const chart = state.chart;
  const d = describeChart(chart);
  const cards = [{ kind: "chart", data: chart }];
  if (!short) {
    cards.push({
      kind: "reading",
      data: {
        title: "盘外的话",
        tag: `${chart.strength.label} · 喜用 ${chart.elements.favorable.join("、")}`,
        paragraphs: [d.personality, d.balance, d.suggestion, d.relations],
        basis: [
          `日主 ${chart.dayMaster.stem}${chart.dayMaster.element}（${chart.dayMaster.yinYang}）`,
          `同类力量占比 ${Math.round(chart.strength.ratio * 100)}%`,
          `五行：${Object.entries(chart.elements.percent).map(([e, v]) => `${e}${v}%`).join(" ")}`,
        ],
      },
    });
  }
  return {
    text: `${chartIntro(chart)}${short ? "" : "\n\n老夫多说两句，你听听像不像。"}`,
    cards,
    actions: short ? [] : [
      { label: "看今日", text: "今天运势怎么样" },
      { label: "看今年", text: "今年运势怎么样" },
    ],
    llmContext: { intent: "chart", chart: compactChart(chart) },
  };
}

function dailyReply() {
  const f = dailyFortune(state.chart);
  return {
    text: `先看今日。${f.paragraphs[0]}\n\n${pickEnding(f.ganzhi)}`,
    cards: [{ kind: "fortune", data: f }],
    actions: [
      { label: "看今年", text: "今年运势怎么样" },
      { label: "摇一卦", text: "摇一卦" },
    ],
    llmContext: { intent: "daily", chart: compactChart(state.chart), result: f },
  };
}

function yearlyReply() {
  const f = yearlyFortune(state.chart, new Date().getFullYear());
  return {
    text: `看今年。${f.paragraphs[0]}`,
    cards: [{ kind: "fortune", data: f }],
    actions: [
      { label: "看今日", text: "今天运势怎么样" },
      { label: "问事业", text: "看看我今年的事业" },
    ],
    llmContext: { intent: "yearly", chart: compactChart(state.chart), result: f },
  };
}

function pickEnding(seed) {
  return hashString(String(seed) + new Date().getDate()) > 0.5
    ? catchphrase(seed)
    : "话说到这儿，剩下的你自己拿主意。";
}

function guaReply(question, topic) {
  const g = castHexagram(question, topic);
  const extra = emphasis(g);
  return {
    text: `${question ? `你问的是「${question}」。` : `你问的是${topic}。`}卦已经起好。${extra ? `\n\n${extra}` : ""}`,
    cards: [{ kind: "hexagram", data: g }],
    actions: [
      { label: "再摇一卦", text: "再摇一卦" },
      { label: "看今日", text: "今天运势怎么样" },
    ],
    llmContext: { intent: "hexagram", question, topic, result: g },
  };
}

function dreamReply(text) {
  const d = interpretDream(text);
  return {
    text: d.symbols.length
      ? `这个梦，老夫拆出 ${d.symbols.length} 个意象。梦是反的，也是直的——看你怎么读。`
      : "这个梦，老夫一时没对上号。你再补一句细节。",
    cards: [{ kind: "dream", data: d }],
    actions: d.symbols.length ? [{ label: "再解一个", text: "解个梦" }] : [],
    llmContext: { intent: "dream", result: d },
  };
}

function fengshuiReply(text) {
  const f = fengshuiAdvice(text, state.chart);
  return {
    text: f.topic ? `${f.topic}这一块，老夫给你几条能落地的。` : "风水这事，先别急着买摆件。",
    cards: [{ kind: "fengshui", data: f }],
    actions: [{ label: "问书桌", text: "书桌怎么摆" }, { label: "问租房", text: "租房看房要注意什么" }],
    llmContext: { intent: "fengshui", result: f },
  };
}

function topicReply(topic) {
  const r = topicReading(state.chart, topic);
  return {
    text: `${topic}这一项，单独说。`,
    cards: [{
      kind: "reading",
      data: {
        title: `${topic} · 单看一项`,
        tag: `${r.score.toFixed(1)} / 5`,
        paragraphs: r.paragraphs,
        tips: r.tips,
        basis: r.basis,
      },
    }],
    llmContext: { intent: "topic", topic, chart: compactChart(state.chart), result: r },
  };
}

/* ---------------------------------------------------------------- 意图识别 */

function detectTopic(text) {
  if (/(事业|工作|offer|升职|跳槽|求职|面试|职业)/i.test(text)) return "事业";
  if (/(财运|钱|工资|收入|投资|副业|理财|破财)/.test(text)) return "财运";
  if (/(感情|恋爱|对象|分手|复合|婚姻|喜欢|桃花|相亲)/.test(text)) return "感情";
  if (/(健康|身体|失眠|生病|体检|作息)/.test(text)) return "健康";
  if (/(学业|考试|考研|学习|论文|毕业|offer)/i.test(text)) return "学业";
  return "其他";
}

function parseBirth(text) {
  const dm = text.match(/((?:19|20)\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*[日号]?/);
  if (!dm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  if (validateBirth(year, month, day)) return null;

  let hour = 12;
  let minute = 0;
  let hourKnown = false;

  const tm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (tm) {
    hour = Number(tm[1]);
    minute = Number(tm[2]);
    hourKnown = true;
  } else {
    const cm = text.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})\s*[点時时]\s*(半|\d{1,2})?/);
    if (cm) {
      let h = Number(cm[2]);
      const period = cm[1] || "";
      if (/(下午|傍晚|晚上|夜里)/.test(period) && h < 12) h += 12;
      if (period === "中午" && h < 11) h += 12;
      if (cm[3] === "半") minute = 30;
      else if (cm[3]) minute = Number(cm[3]);
      hour = h;
      hourKnown = true;
    }
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  let gender = "";
  if (/(女|女生|女孩|女士|姐妹|姑娘)/.test(text)) gender = "女";
  else if (/(男|男生|男孩|先生|兄弟|小伙)/.test(text)) gender = "男";

  const nm = text.match(/(?:我叫|我是|叫我|姓名[:：]?)\s*([\u4e00-\u9fa5]{2,4})/);
  let name = "";
  if (nm) {
    name = nm[1];
    if (["女生", "男生", "女孩", "男孩", "女士", "先生"].includes(name)) name = "";
  }
  const pm = text.match(/(?:出生地|老家|来自)[:：]?\s*([\u4e00-\u9fa5]{2,8})/);

  return {
    name,
    gender,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hourKnown,
    place: pm ? pm[1] : "",
  };
}

function profileFromBirth(b) {
  return {
    name: b.name, gender: b.gender, date: b.date, time: b.time,
    hourKnown: b.hourKnown, place: b.place,
  };
}

/* ---------------------------------------------------------------- 主流程 */

async function handleUser(rawText) {
  const text = String(rawText || "").trim();
  if (!text || state.busy) return;

  inputEl.value = "";
  autosize();
  state.busy = true;
  setBusy(true);
  addMessage({ role: "user", text });
  state.mood = detectMood(text);

  const typing = typingNode();
  messagesEl.appendChild(typing);
  scrollBottom();
  const started = Date.now();

  let reply = null;
  try {
    reply = await route(text);
  } catch (err) {
    console.error(err);
    reply = { text: "老夫这边卡了一下。你再说一遍，或者刷新页面重来。" };
  }

  const minWait = state.llm ? 0 : 480;
  const elapsed = Date.now() - started;
  if (elapsed < minWait) await wait(minWait - elapsed);
  typing.remove();

  if (reply) addMessage({ role: "master", ...reply });

  state.busy = false;
  setBusy(false);
  inputEl.focus();
}

async function route(text) {
  const t = text.trim();

  // 1. 等着接梦 / 等着接卦
  if (state.pending?.type === "dream") {
    state.pending = null;
    return dreamReply(t);
  }
  if (state.pending?.type === "gua") {
    state.pending = null;
    const topic = detectTopic(t);
    return guaReply(topic === "其他" ? t : topic, topic);
  }

  // 2. 直接报生辰
  const looksLikeBirth = !state.chart || /(生辰|生日|出生|重排|重新排|改生辰|换个生辰)/.test(t);
  if (looksLikeBirth) {
    const b = parseBirth(t);
    if (b) {
      setProfile(profileFromBirth(b));
      return chartReply();
    }
  }

  // 3. 排盘
  if (/(排盘|八字|命盘|我的盘)/.test(t)) {
    if (!state.chart) return { text: birthMissing(), cards: [{ kind: "form" }] };
    return chartReply(true);
  }

  // 4. 六爻
  if (/(摇一卦|起一卦|占卜|求卦|抽签|算一卦|问一卦|六爻)/.test(t)) {
    state.pending = { type: "gua" };
    return askGuaTopic();
  }

  // 5. 解梦
  if (/梦/.test(t)) {
    const stripped = t.replace(/[解梦梦见昨晚做了个我地得在了是有]/g, "");
    if (stripped.length >= 6) return dreamReply(t);
    state.pending = { type: "dream" };
    return {
      text: "梦见什么了？\n\n不用讲得有条理，把最清楚的那个画面说给老夫听就行：看见了什么、和谁、什么感觉。",
      actions: [],
    };
  }

  // 6. 风水
  if (/(风水|方位|摆件|卧室|书桌|工位|租房|看房|搬家|户型|镜子|鱼缸|财位|玄关|厨房|卫生间)/.test(t)) {
    return fengshuiReply(t);
  }

  // 7. 分项（“今年事业怎么样”要落到事业，不是笼统流年）
  const topic = detectTopic(t);
  if (topic !== "其他" && /(看看|怎么样|如何|适不适合|好不好|分析|该不该)/.test(t)) {
    if (!state.chart) return { text: needBirthFor("topic"), cards: [{ kind: "form" }] };
    return topicReply(topic);
  }

  // 8. 运势
  if (/(运势|运程|今天|今日|明天|今年|流年|本周|这个月)/.test(t)) {
    if (!state.chart) return { text: needBirthFor("fortune"), cards: [{ kind: "form" }] };
    if (/(今年|流年|明年|20\d{2})/.test(t)) return yearlyReply();
    return dailyReply();
  }

  // 9. 闲聊
  const local = smallTalk(t, state.chart, state.mood);
  if (state.llm) {
    const llm = await askLLM({
      message: t,
      context: {
        intent: "chat",
        chart: state.chart ? compactChart(state.chart) : null,
        mood: state.mood,
      },
    });
    if (llm) return { text: llm };
  }
  return { text: local };
}

function askGuaTopic() {
  return {
    text: "心里默念所问之事。要问哪一路？\n\n想好了就点一个，也可以直接把问题打出来——比如“这次跳槽该不该去”。",
    cards: [],
    actions: [
      { label: "问事业", text: "事业" },
      { label: "问感情", text: "感情" },
      { label: "问财运", text: "财运" },
      { label: "问学业", text: "学业" },
      { label: "问健康", text: "健康" },
    ],
  };
}

function setBusy(busy) {
  inputEl.disabled = busy;
  $("#send").disabled = busy;
}

/* ---------------------------------------------------------------- 生辰表单 */

function openBirthForm() {
  const node = messagesEl.querySelector("#birthForm");
  if (node) {
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.querySelector("input")?.focus();
    return;
  }
  addMessage({
    role: "master",
    text: "来，把生辰填了。老夫只要**公历**的年月日、时辰、性别——别的不用。",
    cards: [{ kind: "form" }],
  });
}

function submitBirth(form) {
  const fd = new FormData(form);
  const date = fd.get("date");
  const time = fd.get("time") || "12:00";
  const hourKnown = fd.get("hourKnown") === "on";
  if (!date) {
    $("#formError").textContent = "先把出生日期填上。";
    return;
  }
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  const err = validateBirth(y, m, d);
  if (err) {
    $("#formError").textContent = err;
    return;
  }

  const profile = {
    name: String(fd.get("name") || "").trim().slice(0, 12),
    gender: String(fd.get("gender") || ""),
    date,
    time,
    hourKnown,
    place: String(fd.get("place") || "").trim().slice(0, 20),
  };
  try {
    setProfile(profile);
  } catch (e) {
    $("#formError").textContent = e.message || "排盘失败，检查一下生辰。";
    return;
  }

  // 移除聊天里的表单，换成一条“已报生辰”的用户消息
  state.messages = state.messages.filter((msg) => !msg.cards?.some((c) => c.kind === "form"));
  messagesEl.querySelectorAll(".msg").forEach((node) => {
    if (node.querySelector("#birthForm")) node.remove();
  });

  addMessage({
    role: "user",
    text: `（报生辰）${profile.name ? `${profile.name}，` : ""}${y} 年 ${m} 月 ${d} 日 ${hourKnown ? `${time}` : "时辰不详"}${profile.gender ? ` · ${profile.gender}` : ""}`,
  });
  addMessage({ role: "master", ...chartReply() });
  closeSheet();
}

/* ---------------------------------------------------------------- 大模型 */

async function detectLLM() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) {
      hideQR();
      return;
    }
    const j = await res.json();
    state.health = j;
    state.llm = Boolean(j.llm);
    state.model = j.model || "";
    if (state.llm) {
      modeBadge.classList.add("llm");
      modeText.textContent = `大模型 · ${state.model || "已连接"}`;
      modeBadge.title = `已接入 ${state.model || "大模型"}；数字与卦名仍由本地推演`;
    } else {
      modeText.textContent = "离线推演";
      modeBadge.title = "当前为本地规则推演";
    }
    if (llmStatus) {
      llmStatus.textContent = state.llm
        ? `大模型：已配置（${state.model || "OpenAI 兼容"}）`
        : "大模型：未配置（在 .env 里填 LLM_API_KEY 即可）";
    }
  } catch {
    // 以 file:// 打开或没有服务端：离线模式
    hideQR();
  }
}

function hideQR() {
  const qr = $("#qrBtn");
  if (qr) qr.style.display = "none";
}

async function askLLM({ message, context }) {
  if (!state.llm) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context,
        history: state.messages.slice(-8).map((m) => ({ role: m.role, text: m.text || "" })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.reply || "").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- 弹层 / 手机 */

function openModal(el) {
  el.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(el) {
  el.hidden = true;
  document.body.style.overflow = "";
}

function closeAllModals() {
  ["#qrModal", "#moreModal"].forEach((s) => {
    const el = $(s);
    if (el) closeModal(el);
  });
}

function openSheet() {
  sheetContent.innerHTML = chartPanel.innerHTML;
  sheetEl.hidden = false;
  sheetBackdrop.hidden = false;
}

function closeSheet() {
  sheetEl.hidden = true;
  sheetBackdrop.hidden = true;
}

async function openQR() {
  const box = $("#qrBox");
  const urlEl = $("#qrUrl");
  const note = $("#qrNote");
  openModal($("#qrModal"));
  box.innerHTML = `<div class="qr-loading">正在生成本机地址…</div>`;

  const h = state.health || (await (async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      return await r.json();
    } catch { return null; }
  })());

  if (!h || !h.lan) {
    box.innerHTML = `<div class="qr-loading">当前不是通过本地服务打开，<br>没有可扫码的局域网地址。</div>`;
    urlEl.textContent = "先运行 start.bat，再用电脑浏览器打开提示的地址。";
    note.textContent = "手机与电脑需连同一个 WiFi。数据不出局域网。";
    return;
  }

  const url = `http://${h.lan}:${h.port}/`;
  urlEl.textContent = url;
  note.textContent = "手机和电脑连同一个 WiFi，用相机扫码打开。聊天记录各自存在本机。";

  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch {
    box.innerHTML = `<div class="qr-loading">二维码生成失败，<br>请在手机浏览器输入上面的地址。</div>`;
  }
}

/* ---------------------------------------------------------------- 状态存取 */

function saveState() {
  if (state.demo) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profile: state.profile,
      messages: state.messages.slice(-40),
      savedAt: Date.now(),
    }));
  } catch {
    // 存不下就算了，不打断对话
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.profile) {
      try {
        state.profile = data.profile;
        state.chart = chartFromProfile(data.profile);
      } catch {
        state.profile = null;
        state.chart = null;
      }
    }
    if (Array.isArray(data.messages) && data.messages.length) {
      state.messages = data.messages.filter((m) => m.role);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function renderRestored() {
  messagesEl.innerHTML = "";
  for (const m of state.messages) messagesEl.appendChild(messageNode(m));
  scrollBottom("auto");
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state.profile = null;
  state.chart = null;
  state.messages = [];
  state.pending = null;
  messagesEl.innerHTML = "";
  renderSide();
  updateQuick();
  bootOpening();
}

/* ---------------------------------------------------------------- 初始化 */

function bootOpening() {
  addMessage({ role: "master", text: opening() });
  addMessage({ role: "master", text: "第一次来，先填个生辰。填完老夫给你排盘。", cards: [{ kind: "form" }] });
}

function attachEvents() {
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (text) handleUser(text);
  });

  inputEl.addEventListener("input", autosize);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  // 快捷问题
  quickEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-quick]");
    if (!btn) return;
    const q = (state.chart ? QUICK_CHART : QUICK_NO_CHART)[Number(btn.dataset.quick)];
    if (!q) return;
    if (q.kind === "form") openBirthForm();
    else handleUser(q.text);
  });

  // 消息内动作
  messagesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const wrap = btn.closest(".msg");
    const msg = state.messages.find((m) => m.id === wrap?.dataset.id);
    const action = msg?.actions?.[Number(btn.dataset.action)];
    if (!action) return;
    if (action.llm && msg.llmContext) {
      rewriteFromContext(msg);
    } else if (action.text) {
      handleUser(action.text);
    }
  });

  // 侧栏按钮（含抽屉）
  const sideClick = (e) => {
    if (e.target.closest("#emptyChartBtn")) { openBirthForm(); return; }
    const btn = e.target.closest("[data-side]");
    if (!btn) return;
    const map = {
      today: "今天运势怎么样",
      year: "今年运势怎么样",
      gua: "摇一卦",
      birth: "重新填写生辰",
    };
    closeSheet();
    if (btn.dataset.side === "birth") openBirthForm();
    else handleUser(map[btn.dataset.side]);
  };
  sideEl.addEventListener("click", sideClick);
  sheetContent.addEventListener("click", sideClick);

  // 动态表单
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "birthForm") return;
    e.preventDefault();
    submitBirth(e.target);
  });
  document.addEventListener("change", (e) => {
    if (e.target.id !== "bKnown") return;
    const time = $("#bTime");
    if (time) time.disabled = !e.target.checked;
  });
  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-skip]")) {
      state.messages = state.messages.filter((m) => !m.cards?.some((c) => c.kind === "form"));
      e.target.closest(".msg")?.remove();
      handleUser("先随便聊聊");
    }
  });

  // 顶栏
  $("#qrBtn").addEventListener("click", openQR);
  $("#qrClose").addEventListener("click", () => closeModal($("#qrModal")));
  $("#qrModal").addEventListener("click", (e) => { if (e.target.id === "qrModal") closeModal($("#qrModal")); });

  $("#moreBtn").addEventListener("click", () => openModal($("#moreModal")));
  $("#moreClose").addEventListener("click", () => closeModal($("#moreModal")));
  $("#moreModal").addEventListener("click", (e) => { if (e.target.id === "moreModal") closeModal($("#moreModal")); });

  $("#clearBtn").addEventListener("click", () => {
    if (confirm("清空本机的生辰和聊天记录？清空后不能恢复。")) {
      resetAll();
      closeModal($("#moreModal"));
    }
  });
  $("#replayBtn").addEventListener("click", () => {
    resetAll();
    closeModal($("#moreModal"));
  });

  // 手机命盘抽屉
  $("#chartBtn").addEventListener("click", openSheet);
  $("#sideClose").addEventListener("click", closeSheet);
  sheetBackdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
      closeSheet();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) closeSheet();
  });

  // 侧栏状态刷新
  document.addEventListener("profile-updated", renderSide);
}

async function rewriteFromContext(msg) {
  if (!state.llm || state.busy) return;
  state.busy = true;
  setBusy(true);
  const typing = typingNode();
  messagesEl.appendChild(typing);
  scrollBottom();
  const reply = await askLLM({
    message: "把刚才这段推演，用你的口吻再说一遍。保留所有数字、卦名和结论，不要新编。",
    context: msg.llmContext,
  });
  typing.remove();
  state.busy = false;
  setBusy(false);
  if (reply) addMessage({ role: "master", text: reply });
}

function autosize() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 132)}px`;
}

/* ---------------------------------------------------------------- 演示 / 截图 */

function fixedHexagram() {
  return hexagramFromLines([7, 8, 9, 6, 7, 8], "这次换工作该不该去", "事业");
}

function seedDemoMessages(shot) {
  const profile = { ...DEMO_PROFILE };
  state.messages = [];
  messagesEl.innerHTML = "";

  if (shot === "welcome") {
    renderSide();
    bootOpening();
    return;
  }

  setProfile(profile);

  addMessage({ role: "user", text: providerBirthText(profile), save: false, scroll: false });
  addMessage({ role: "master", ...chartReply(), save: false, scroll: false });

  if (shot === "fortune") {
    const f = dailyFortune(state.chart);
    addMessage({ role: "user", text: "今天运势怎么样", save: false, scroll: false });
    addMessage({ role: "master", text: `先看今日。${f.paragraphs[0]}`, cards: [{ kind: "fortune", data: f }], save: false, scroll: false });
  } else if (shot === "gua") {
    const g = fixedHexagram();
    addMessage({ role: "user", text: "这次换工作该不该去？", save: false, scroll: false });
    addMessage({ role: "master", text: "你问的是「这次换工作该不该去」。卦已经起好。", cards: [{ kind: "hexagram", data: g }], save: false, scroll: false });
  } else if (shot === "dream") {
    const d = interpretDream("梦见一条大蛇追我，后来我掉进水里，水很清");
    addMessage({ role: "user", text: "昨晚梦见一条大蛇追我，后来掉进水里。", save: false, scroll: false });
    addMessage({ role: "master", text: `这个梦，老夫拆出 ${d.symbols.length} 个意象。`, cards: [{ kind: "dream", data: d }], save: false, scroll: false });
  } else if (shot === "topic") {
    addMessage({ role: "user", text: "看看我今年的事业", save: false, scroll: false });
    addMessage({ role: "master", ...topicReply("事业"), save: false, scroll: false });
  } else if (shot === "fengshui") {
    addMessage({ role: "user", text: "卧室床头怎么摆？", save: false, scroll: false });
    addMessage({ role: "master", ...fengshuiReply("卧室床头怎么摆"), save: false, scroll: false });
  }
}

function providerBirthText(profile) {
  const [y, m, d] = profile.date.split("-").map(Number);
  return `（报生辰）${profile.name}，${y} 年 ${m} 月 ${d} 日 ${profile.time}${profile.gender ? ` · ${profile.gender}` : ""}`;
}

function initShot(shot) {
  state.demo = true;
  document.documentElement.dataset.shot = shot;
  seedDemoMessages(shot);
  updateQuick();
  renderSide();
  requestAnimationFrame(() => {
    if (shot === "welcome" || shot === "chart" || shot === "mobile") {
      scrollEl.scrollTop = 0;
    } else {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
  });
}

/* ---------------------------------------------------------------- 启动 */

async function init() {
  attachEvents();
  updateQuick();

  const params = new URLSearchParams(location.search);
  const shot = params.get("shot");

  if (shot) {
    initShot(shot);
    detectLLM();
    return;
  }

  const restored = loadState();
  if (restored && state.messages.length) {
    // 有命盘时，旧表单不再展示
    if (state.chart) {
      state.messages = state.messages.filter((m) => !m.cards?.some((c) => c.kind === "form"));
    }
    renderRestored();
    renderSide();
    updateQuick();
    if (!state.messages.length) bootOpening();
  } else {
    renderSide();
    bootOpening();
    scrollBottom("auto");
  }

  detectLLM();
}

init();
