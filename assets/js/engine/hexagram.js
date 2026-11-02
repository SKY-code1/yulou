// 六爻起卦：三枚铜钱六掷，得本卦、动爻、变卦
import { HEX_BY_BITS } from "../data/hexagrams.js";

const LINE_NAME = ["初", "二", "三", "四", "五", "上"];

export function secureCoin() {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] & 1 ? 3 : 2; // 3=正（阳面），2=反
  }
  return Math.random() < 0.5 ? 3 : 2;
}

export function castLines() {
  const lines = [];
  for (let i = 0; i < 6; i += 1) {
    const coins = [secureCoin(), secureCoin(), secureCoin()];
    lines.push(coins.reduce((a, b) => a + b, 0));
  }
  return lines;
}

export function linesToBits(lines) {
  return lines.map((v) => (v === 7 || v === 9 ? 1 : 0));
}

export function changedBits(lines) {
  return lines.map((v) => (v === 6 ? 1 : v === 9 ? 0 : v === 7 ? 1 : 0));
}

export function lineLabel(value, position) {
  const yinYang = value === 6 || value === 8 ? "六" : "九";
  if (position === 0) return `初${yinYang}`;
  if (position === 5) return `上${yinYang}`;
  return `${yinYang}${LINE_NAME[position]}`;
}

export function castHexagram(question = "", topic = "其他") {
  return hexagramFromLines(castLines(), question, topic);
}

/** 由六次掷币结果直接成卦（演示与测试用） */
export function hexagramFromLines(lines, question = "", topic = "其他") {
  const bits = linesToBits(lines);
  const ben = HEX_BY_BITS[bits.join("")];
  const moving = [];
  lines.forEach((v, i) => {
    if (v === 6 || v === 9) moving.push(i);
  });
  const bian = moving.length ? HEX_BY_BITS[changedBits(lines).join("")] : null;

  const movingTexts = moving.map((i) => ({
    index: i,
    label: lineLabel(lines[i], i),
    text: ben?.lines?.[i]?.text || "",
  }));

  let advice;
  if (!moving.length) {
    advice = "六爻安静，以本卦卦辞断。眼下这件事，方向比速度重要——先把已经确定的部分做扎实，不必急着追问结果。";
  } else if (moving.length === 1) {
    advice = `一爻独动，重点看「${movingTexts[0].label}」。这一爻说的是过程里的一个具体关口，不是最终判决。`;
  } else if (moving.length <= 3) {
    advice = `有 ${moving.length} 爻动，事情还在变。以本卦看现状、以变卦看走向，中间那几步是你自己能改的。`;
  } else {
    advice = `动爻较多（${moving.length} 爻），说明变量很大。与其问“结果好不好”，不如先定一个“什么情况下我就停/就转”的标准。`;
  }

  return {
    type: "hexagram",
    at: Date.now(),
    question: question.trim(),
    topic,
    coins: lines.map((v) => (v === 6 ? "三反" : v === 9 ? "三正" : v === 7 ? "二正一反" : "二反一正")),
    lines,
    moving,
    ben,
    bian,
    movingTexts,
    advice,
    basis: [
      `掷币六次：${lines.map((v, i) => `${LINE_NAME[i]}${v}`).join("、")}`,
      `本卦：第 ${ben?.id} 卦 ${ben?.name}（${ben?.image}）`,
      bian ? `变卦：第 ${bian.id} 卦 ${bian.name}（${bian.image}）` : "六爻安静，无变卦",
      moving.length ? `动爻：${movingTexts.map((m) => m.label).join("、")}` : "无动爻",
    ],
  };
}

export function emphasis(result) {
  const h = result.ben;
  if (!h) return "";
  const map = {
    事业: h.career,
    财运: h.decision,
    感情: h.love,
    学业: h.decision,
    健康: h.decision,
    其他: h.fortune,
  };
  return map[result.topic] || h.fortune;
}
