// 引擎回归测试：八字、节气边界、卦象、运势
import fs from "node:fs";
import { buildChart } from "../assets/js/engine/bazi.js";
import { solarTerm, dayGanzhi, GAN, ZHI } from "../assets/js/engine/calendar.js";
import { dailyFortune, yearlyFortune, topicReading } from "../assets/js/engine/fortune.js";
import { castHexagram, linesToBits } from "../assets/js/engine/hexagram.js";
import { interpretDream } from "../assets/js/engine/dream.js";
import { fengshuiAdvice } from "../assets/js/engine/fengshui.js";
import { HEXAGRAMS, HEX_BY_BITS } from "../assets/js/data/hexagrams.js";

let failed = 0;
let passed = 0;

function ok(cond, label, extra = "") {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}${extra ? `  ${extra}` : ""}`);
}

function eq(actual, expected, label) {
  ok(actual === expected, label, `got=${actual} want=${expected}`);
}

// 1. 六十四卦数据完整
ok(HEXAGRAMS.length === 64, "六十四卦数量");
ok(Object.keys(HEX_BY_BITS).length === 64, "六十四卦 bits 唯一");
for (const h of HEXAGRAMS) {
  ok(h.bits.length === 6, `卦 ${h.id} bits 长度`);
  ok(h.guaci.length > 0, `卦 ${h.id} 卦辞`);
  ok(h.lines.length === 6, `卦 ${h.id} 六爻`);
}

// 2. 节气边界：2024 立春 = 02-04 16:26:53
const lichun = solarTerm(2024, 2);
eq(`${lichun.month}-${lichun.day} ${lichun.hour}:${lichun.minute}:${lichun.second}`, "2-4 16:26:53", "2024 立春时刻");

const before = buildChart({ year: 2024, month: 2, day: 4, hour: 16, minute: 26, gender: "男", name: "边界前" });
const after = buildChart({ year: 2024, month: 2, day: 4, hour: 16, minute: 27, gender: "男", name: "边界后" });
eq(before.summary.bazi.split(" ")[0], "癸卯", "立春前年柱");
eq(after.summary.bazi.split(" ")[0], "甲辰", "立春后年柱");
eq(before.summary.bazi.split(" ")[1], "乙丑", "立春前月柱");
eq(after.summary.bazi.split(" ")[1], "丙寅", "立春后月柱");

// 3. 子初换日
const d2259 = buildChart({ year: 2000, month: 1, day: 1, hour: 22, minute: 59, gender: "男" });
const d2300 = buildChart({ year: 2000, month: 1, day: 1, hour: 23, minute: 0, gender: "男" });
eq(d2259.summary.bazi, "己卯 丙子 戊午 癸亥", "22:59 八字");
eq(d2300.summary.bazi, "己卯 丙子 己未 甲子", "23:00 八字（子初换日）");

// 4. 与 lunar_python 样本比对
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures.json", import.meta.url), "utf8")).samples;
let mismatch = 0;
const examples = [];
for (const s of fixtures) {
  const chart = buildChart({
    year: s.y, month: s.m, day: s.d, hour: s.h, minute: s.min,
    gender: "男", name: "样本",
  });
  if (chart.summary.bazi !== s.bazi) {
    mismatch += 1;
    if (examples.length < 5) examples.push({ input: s, got: chart.summary.bazi });
  }
}
eq(mismatch, 0, `八字样本 ${fixtures.length} 条`);
if (examples.length) console.error(JSON.stringify(examples, null, 2));

// 5. 卦象与变卦
const sample = [7, 8, 9, 6, 7, 8];
const bits = linesToBits(sample);
eq(HEX_BY_BITS[bits.join("")].id, 63, "既济卦 bits");
const gua = castHexagram("测试", "事业");
ok(gua.ben && gua.ben.id >= 1 && gua.ben.id <= 64, "起卦返回本卦");
ok(gua.coins.length === 6, "六次掷币");

// 6. 运势 / 分项 / 解梦 / 风水
const me = buildChart({ year: 1998, month: 8, day: 15, hour: 9, minute: 30, gender: "女", name: "林小满" });
const daily = dailyFortune(me, new Date(2026, 10, 2));
ok(daily.stars >= 1 && daily.stars <= 5, "流日评分范围");
ok(daily.yi.length >= 2 && daily.ji.length >= 2, "宜忌");
ok(daily.paragraphs.length >= 3, "流日文案");

const yearly = yearlyFortune(me, 2026);
ok(yearly.stars >= 1 && yearly.stars <= 5, "流年评分");
ok(yearly.paragraphs.length >= 3, "流年文案");

for (const topic of ["事业", "财运", "感情", "健康"]) {
  const r = topicReading(me, topic);
  ok(r && r.paragraphs.length >= 3, `${topic} 解读`);
}

const dream = interpretDream("我梦见一条大蛇追我，后来掉进水里");
ok(dream.symbols.length >= 2, "解梦命中多个意象");
ok(["蛇", "水", "被追"].includes(dream.symbols[0].title), "解梦排序");

const fs1 = fengshuiAdvice("卧室床头怎么摆", me);
ok(fs1.topic === "卧室", "风水识别卧室");

// 7. 数值自洽
for (const e of ["木", "火", "土", "金", "水"]) {
  ok(me.elements.percent[e] >= 0, `五行比例 ${e}`);
}
const sum = Object.values(me.elements.percent).reduce((a, b) => a + b, 0);
ok(Math.abs(sum - 100) < 0.5, "五行比例合计 100", `sum=${sum}`);

console.log(`\n${failed === 0 ? "PASS" : "FAIL"}  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
