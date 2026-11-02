// 历法基础：干支、节气、儒略日、纳音
// 所有时间按“北京时间的墙上时间”处理，不依赖浏览器所在时区。

import { SOLAR_TERMS } from "../data/solar-terms.js";

export const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
export const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export const GAN_ELEMENT = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};

export const ZHI_ELEMENT = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};

export const ZHI_ANIMAL = {
  子: "鼠", 丑: "牛", 寅: "虎", 卯: "兔", 辰: "龙", 巳: "蛇",
  午: "马", 未: "羊", 申: "猴", 酉: "鸡", 戌: "狗", 亥: "猪",
};

// 地支藏干：本气、中气、余气
export const HIDDEN_STEMS = {
  子: [["癸", 1]],
  丑: [["己", 1], ["癸", 0.5], ["辛", 0.25]],
  寅: [["甲", 1], ["丙", 0.5], ["戊", 0.25]],
  卯: [["乙", 1]],
  辰: [["戊", 1], ["乙", 0.5], ["癸", 0.25]],
  巳: [["丙", 1], ["庚", 0.5], ["戊", 0.25]],
  午: [["丁", 1], ["己", 0.5]],
  未: [["己", 1], ["丁", 0.5], ["乙", 0.25]],
  申: [["庚", 1], ["壬", 0.5], ["戊", 0.25]],
  酉: [["辛", 1]],
  戌: [["戊", 1], ["辛", 0.5], ["丁", 0.25]],
  亥: [["壬", 1], ["甲", 0.5]],
};

export const ELEMENTS = ["木", "火", "土", "金", "水"];

// 五行生克：木→火→土→金→水→木
export const GENERATES = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
export const CONTROLS = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export const ELEMENT_META = {
  木: { color: "青、绿", dir: "东", season: "春" },
  火: { color: "赤、紫", dir: "南", season: "夏" },
  土: { color: "黄、褐", dir: "中、西南", season: "四季末" },
  金: { color: "白、金、银", dir: "西", season: "秋" },
  水: { color: "黑、蓝", dir: "北", season: "冬" },
};

// 六十甲子纳音（每两个干支一组）
const NAYIN = [
  "海中金", "炉中火", "大林木", "路旁土", "剑锋金", "山头火",
  "涧下水", "城头土", "白蜡金", "杨柳木", "泉中水", "屋上土",
  "霹雳火", "松柏木", "长流水", "沙中金", "山下火", "平地木",
  "壁上土", "金箔金", "覆灯火", "天河水", "大驿土", "钗钏金",
  "桑柘木", "大溪水", "沙中土", "天上火", "石榴木", "大海水",
];

export function ganzhi(index) {
  const i = ((index % 60) + 60) % 60;
  return GAN[i % 10] + ZHI[i % 12];
}

export function ganzhiIndex(gz) {
  const g = GAN.indexOf(gz[0]);
  const z = ZHI.indexOf(gz[1]);
  for (let i = 0; i < 60; i += 1) {
    if (i % 10 === g && i % 12 === z) return i;
  }
  return -1;
}

export function nayin(gz) {
  const i = ganzhiIndex(gz);
  return i < 0 ? "" : NAYIN[Math.floor(i / 2)];
}

export function isYangStem(stem) {
  return GAN.indexOf(stem) % 2 === 0;
}

/** 儒略日（只取日期，返回当日正午的整数日数） */
export function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * m2 + 2) / 5) +
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) -
    32045
  );
}

/** 公历日期的日干支（0=甲子） */
export function dayGanzhi(y, m, d) {
  return ((jdn(y, m, d) + 49) % 60 + 60) % 60;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 取某年第 idx 个节气（0=小寒 … 23=冬至） */
export function solarTerm(year, idx) {
  const raw = SOLAR_TERMS[String(year)];
  if (!raw) return null;
  const s = raw[idx];
  if (!s) return null;
  return {
    year,
    month: Number(s.slice(0, 2)),
    day: Number(s.slice(2, 4)),
    hour: Number(s.slice(4, 6)),
    minute: Number(s.slice(6, 8)),
    second: Number(s.slice(8, 10)),
  };
}

export function compareDateTime(a, b) {
  const keys = ["year", "month", "day", "hour", "minute", "second"];
  for (const k of keys) {
    const av = a[k] || 0;
    const bv = b[k] || 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function timeKey(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function nowParts(d = new Date()) {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
}

export function addDays(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function weekdayCN(y, m, d) {
  return "日一二三四五六"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 星座（按公历日期） */
export function constellation(m, d) {
  const edges = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const names = ["摩羯", "水瓶", "双鱼", "白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯"];
  if (d < edges[m - 1]) return names[m - 1] + "座";
  return names[m] + "座";
}
