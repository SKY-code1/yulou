// 八字排盘：四柱、五行力量、日主强弱、喜用、命局关系
import {
  GAN, ZHI, GAN_ELEMENT, ZHI_ELEMENT, ZHI_ANIMAL, HIDDEN_STEMS,
  GENERATES, CONTROLS, ELEMENTS, ELEMENT_META,
  dayGanzhi, solarTerm, compareDateTime, addDays, nayin, isYangStem,
  ganzhi, constellation, weekdayCN,
} from "./calendar.js";

const JIE = [
  { idx: 2, zhi: 2 },   // 立春 → 寅
  { idx: 4, zhi: 3 },   // 惊蛰 → 卯
  { idx: 6, zhi: 4 },   // 清明 → 辰
  { idx: 8, zhi: 5 },   // 立夏 → 巳
  { idx: 10, zhi: 6 },  // 芒种 → 午
  { idx: 12, zhi: 7 },  // 小暑 → 未
  { idx: 14, zhi: 8 },  // 立秋 → 申
  { idx: 16, zhi: 9 },  // 白露 → 酉
  { idx: 18, zhi: 10 }, // 寒露 → 戌
  { idx: 20, zhi: 11 }, // 立冬 → 亥
  { idx: 22, zhi: 0 },  // 大雪 → 子
  { idx: 0, zhi: 1 },   // 小寒 → 丑
];

const DAY_MASTER = {
  甲: { name: "甲木", image: "参天大树", text: "向上、讲原则，习惯先把框架立住再动手；不太会绕弯，认定的事很难被劝回。" },
  乙: { name: "乙木", image: "藤萝花草", text: "柔韧、会借力，擅长在限制里找到缝隙生长；表面随和，心里其实很有主意。" },
  丙: { name: "丙火", image: "太阳", text: "外放、直接，情绪来得快也去得快；喜欢把话说亮，最怕场面冷下来。" },
  丁: { name: "丁火", image: "灯烛", text: "细腻、专注，能在小处照见别人看不见的东西；对氛围和细节敏感。" },
  戊: { name: "戊土", image: "城墙高山", text: "稳、能扛事，答应下来的就会做到；不太爱解释，容易被误看成固执。" },
  己: { name: "己土", image: "田园", text: "务实、能容人，习惯把复杂的事慢慢理顺；对安全感的需求比表面强。" },
  庚: { name: "庚金", image: "刀斧", text: "利落、边界清楚，遇到问题先想怎么解决；说话直，偶尔会硌到人。" },
  辛: { name: "辛金", image: "珠玉", text: "讲究、审美在线，对品质有近乎苛刻的要求；不轻易妥协，但也不爱张扬。" },
  壬: { name: "壬水", image: "江河", text: "思路开阔、适应力强，喜欢先流动起来再找方向；有时会显得不够专注。" },
  癸: { name: "癸水", image: "雨露", text: "敏感、有想象力，能察觉别人没说的部分；需要独处来恢复电量。" },
};

const TEN_GOD_DESC = {
  比肩: "自我、同辈与并肩",
  劫财: "竞争、分利与冲动",
  食神: "表达、享受与作品",
  伤官: "锋芒、突破与不服",
  偏财: "机会、外财与人脉",
  正财: "稳定、积累与责任",
  七杀: "压力、挑战与执行力",
  正官: "规则、职位与名声",
  偏印: "直觉、偏门与思虑",
  正印: "学习、庇护与资历",
};

/** 十神：以日主为“我”，看另一个天干 */
export function tenGod(dayStem, otherStem) {
  const d = GAN_ELEMENT[dayStem];
  const o = GAN_ELEMENT[otherStem];
  const samePolarity = isYangStem(dayStem) === isYangStem(otherStem);
  if (d === o) return samePolarity ? "比肩" : "劫财";
  if (GENERATES[d] === o) return samePolarity ? "食神" : "伤官";
  if (CONTROLS[d] === o) return samePolarity ? "偏财" : "正财";
  if (CONTROLS[o] === d) return samePolarity ? "七杀" : "正官";
  return samePolarity ? "偏印" : "正印";
}

export function tenGodTone(god) {
  return TEN_GOD_DESC[god] || "";
}

/** 地支六合 / 六冲 / 相害 */
const LIU_HE = [["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]];
const LIU_CHONG = [["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]];
const LIU_HAI = [["子", "未"], ["丑", "午"], ["寅", "巳"], ["卯", "辰"], ["申", "亥"], ["酉", "戌"]];
const SAN_HE = [["申", "子", "辰"], ["亥", "卯", "未"], ["寅", "午", "戌"], ["巳", "酉", "丑"]];

export function branchRelation(a, b) {
  const has = (list) => list.some((p) => p.includes(a) && p.includes(b));
  if (has(LIU_HE)) return "六合";
  if (has(LIU_CHONG)) return "六冲";
  if (has(LIU_HAI)) return "相害";
  if (SAN_HE.some((g) => g.includes(a) && g.includes(b))) return "半合";
  return "";
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function validateBirth(y, m, d) {
  if (!(y >= 1900 && y <= 2100)) return "年份需要在 1900–2100 之间";
  if (!(m >= 1 && m <= 12)) return "月份不正确";
  if (!(d >= 1 && d <= daysInMonth(y, m))) return "日期不正确";
  return "";
}

function pillar(gan, zhi, dayStem) {
  return {
    gan,
    zhi,
    ganElement: GAN_ELEMENT[gan],
    zhiElement: ZHI_ELEMENT[zhi],
    nayin: nayin(gan + zhi),
    tenGod: dayStem ? tenGod(dayStem, gan) : "",
    hidden: HIDDEN_STEMS[zhi].map(([stem, weight]) => ({ stem, weight, element: GAN_ELEMENT[stem] })),
  };
}

function yearPillarFor(year, month, day, hour, minute) {
  const lichun = solarTerm(year, 2);
  const before = compareDateTime({ year, month, day, hour, minute, second: 0 }, lichun) < 0;
  const y = before ? year - 1 : year;
  return { year: y, gan: GAN[((y - 4) % 10 + 10) % 10], zhi: ZHI[((y - 4) % 12 + 12) % 12] };
}

function monthPillarFor(year, month, day, hour, minute, yearGan, yearPillarYear) {
  const birth = { year, month, day, hour, minute, second: 0 };
  let current = null;
  for (let i = 0; i < JIE.length; i += 1) {
    const spec = JIE[i];
    // 月令周期从“年柱所在年的立春”开始，到次年小寒结束
    const termYear = spec.idx === 0 ? yearPillarYear + 1 : yearPillarYear;
    const term = solarTerm(termYear, spec.idx);
    if (term && compareDateTime(birth, term) >= 0) {
      current = { ...spec, termYear };
    }
  }
  if (!current) {
    current = { idx: 22, zhi: 0, termYear: yearPillarYear };
  }
  const offset = (current.zhi - 2 + 12) % 12; // 寅 = 0
  const stemIndex = (((GAN.indexOf(yearGan) % 5) * 2 + 2 + offset) % 10 + 10) % 10;
  return { gan: GAN[stemIndex], zhi: ZHI[current.zhi], offset, term: current };
}

/** 排盘主入口 */
export function buildChart(profile) {
  const { year, month, day, hour, minute, gender = "", name = "", place = "", hourKnown = true } = profile;
  const error = validateBirth(year, month, day);
  if (error) throw new Error(error);
  if (!(hour >= 0 && hour <= 23) || !(minute >= 0 && minute <= 59)) {
    throw new Error("出生时间不正确");
  }

  const yp = yearPillarFor(year, month, day, hour, minute);
  const mp = monthPillarFor(year, month, day, hour, minute, yp.gan, yp.year);

  // 子初换日：23:00 起算次日
  const dayDate = hour >= 23 ? addDays(year, month, day, 1) : { year, month, day };
  const dIdx = dayGanzhi(dayDate.year, dayDate.month, dayDate.day);
  const dayGan = GAN[dIdx % 10];
  const dayZhi = ZHI[dIdx % 12];

  const hourBranch = Math.floor(((hour + 1) % 24) / 2);
  const hourStemIndex = ((GAN.indexOf(dayGan) % 5) * 2 + hourBranch) % 10;
  const hourGan = GAN[hourStemIndex];
  const hourZhi = ZHI[hourBranch];

  const pillars = {
    year: pillar(yp.gan, yp.zhi, dayGan),
    month: pillar(mp.gan, mp.zhi, dayGan),
    day: pillar(dayGan, dayZhi, dayGan),
    hour: pillar(hourGan, hourZhi, dayGan),
  };

  // 五行力量：天干 1.0；地支藏干按本气/中气/余气加权；月令再加重
  const scores = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  for (const key of ["year", "month", "day", "hour"]) {
    const p = pillars[key];
    scores[p.ganElement] += 1;
    const monthBoost = key === "month" ? 1.3 : 1;
    for (const h of p.hidden) scores[h.element] += h.weight * monthBoost;
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const percent = Object.fromEntries(ELEMENTS.map((e) => [e, Math.round((scores[e] / total) * 1000) / 10]));

  const self = GAN_ELEMENT[dayGan];
  const resource = ELEMENTS.find((e) => GENERATES[e] === self);
  const output = GENERATES[self];
  const wealth = CONTROLS[self];
  const officer = ELEMENTS.find((e) => CONTROLS[e] === self);

  const support = scores[self] + scores[resource];
  const ratio = support / total;

  let strength;
  if (ratio >= 0.55) strength = { label: "偏强", ratio, text: "日主得令得助，能量偏旺，适合把力气用在输出与兑现上。" };
  else if (ratio <= 0.42) strength = { label: "偏弱", ratio, text: "日主支撑偏少，更适合借力、结盟、先把根扎稳，再谈扩张。" };
  else strength = { label: "中和", ratio, text: "日主强弱比较均衡，顺势而为的空间较大，关键看流年引动。" };

  let favorable;
  if (strength.label === "偏弱") favorable = [resource, self];
  else if (strength.label === "偏强") favorable = [output, wealth];
  else {
    const sorted = [...ELEMENTS].sort((a, b) => scores[a] - scores[b]);
    favorable = sorted.slice(0, 2);
  }
  const avoid = ELEMENTS.filter((e) => !favorable.includes(e));

  const relations = [];
  const keys = ["year", "month", "day", "hour"];
  const labels = { year: "年", month: "月", day: "日", hour: "时" };
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const rel = branchRelation(pillars[keys[i]].zhi, pillars[keys[j]].zhi);
      if (rel) relations.push({ a: labels[keys[i]], b: labels[keys[j]], rel, detail: `${pillars[keys[i]].zhi}${rel}${pillars[keys[j]].zhi}` });
    }
  }

  const godCount = {};
  for (const key of ["year", "month", "hour"]) {
    const g = pillars[key].tenGod;
    godCount[g] = (godCount[g] || 0) + 1;
  }
  for (const key of keys) {
    const main = pillars[key].hidden[0];
    const g = tenGod(dayGan, main.stem);
    godCount[g] = (godCount[g] || 0) + 1;
  }

  const zodiac = ZHI_ANIMAL[yp.zhi];
  const dmInfo = DAY_MASTER[dayGan];

  const summary = {
    name: name || "这位朋友",
    gender,
    place,
    birth: `${year} 年 ${month} 月 ${day} 日 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}${hourKnown ? "" : "（估）"}`,
    birthNote: hourKnown ? "" : "时辰未填，按午时（12:00）估算，时柱仅供参考",
    weekday: `星期${weekdayCN(year, month, day)}`,
    lunarYear: yp,
    zodiac,
    constellation: constellation(month, day),
    bazi: `${pillars.year.gan}${pillars.year.zhi} ${pillars.month.gan}${pillars.month.zhi} ${pillars.day.gan}${pillars.day.zhi} ${pillars.hour.gan}${pillars.hour.zhi}`,
  };

  return {
    input: { ...profile, hourKnown },
    summary,
    pillars,
    dayMaster: {
      stem: dayGan,
      element: self,
      yinYang: isYangStem(dayGan) ? "阳" : "阴",
      ...dmInfo,
    },
    elements: { scores, percent, favorable, avoid, missing: ELEMENTS.filter((e) => scores[e] === 0) },
    strength,
    godCount,
    relations,
    meta: { output, wealth, officer, resource },
  };
}

export function elementColor(element) {
  return {
    木: "#7fbf9a",
    火: "#e0705a",
    土: "#d9b26a",
    金: "#d8d2c4",
    水: "#7fa6c9",
  }[element];
}

export function describeChart(chart) {
  const dm = chart.dayMaster;
  const fav = chart.elements.favorable;
  const metal = fav.map((e) => ELEMENT_META[e].color).join("、");
  const dir = fav.map((e) => ELEMENT_META[e].dir).join("、");
  return {
    personality: `你的日主是${dm.stem}${dm.element}，${dm.image}之象。${dm.text}`,
    balance: `八字里${chart.elements.missing.length ? `表面缺${chart.elements.missing.join("、")}，` : ""}${chart.strength.text}整体偏${chart.strength.label}。`,
    suggestion: `喜用落在${fav.join("、")}：日常可以多用${metal}，方位上偏向${dir}；这不是“改命”，只是给自己找一个更顺手的着力点。`,
    relations: chart.relations.length
      ? `命局里还有 ${chart.relations.map((r) => `${r.a}${r.b}${r.rel}`).join("、")}，做事时容易在这些关系上反复。`
      : "四柱之间没有明显的合冲，命局相对平顺，起伏多来自流年。",
  };
}
