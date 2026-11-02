// 解梦：把梦境文本匹配到词条，给出民俗 + 心理两条线
import { matchDreams } from "../data/dreams.js";

export function interpretDream(text) {
  const hits = matchDreams(text);
  if (!hits.length) {
    return {
      type: "dream",
      symbols: [],
      tone: "未识别",
      summary: "这个梦老夫一时没对上号。梦里的意象千奇百怪，但多数绕不开三件事：你怕什么、你想要什么、你最近在为什么耗神。",
      advice: "再补一句细节：梦里最清楚的一个画面是什么？有没有颜色、声音、或者某个人？",
      basis: ["未命中常见意象词库", `原文：${text.slice(0, 60)}`],
    };
  }

  const tones = hits.map((h) => h.tone);
  const tone = tones.includes("吉") && !tones.includes("提醒") ? "偏吉" : tones.includes("提醒") ? "有提醒" : "中性";

  const summary = hits
    .map((h) => `「${h.title}」：${h.traditional}`)
    .join("\n\n");

  const psychology = hits.map((h) => `「${h.title}」在心理层面，${h.psychology}`).join("\n");

  return {
    type: "dream",
    symbols: hits.map((h) => ({
      title: h.title,
      tone: h.tone,
      traditional: h.traditional,
      psychology: h.psychology,
      advice: h.advice,
      matched: h.matched,
    })),
    tone,
    summary,
    psychology,
    advice: hits.map((h) => h.advice).join(" "),
    basis: [
      `命中意象：${hits.map((h) => h.title).join("、")}`,
      `匹配关键词：${[...new Set(hits.flatMap((h) => h.matched))].join("、")}`,
      "民俗说法 + 心理视角，两者都只作参考",
    ],
  };
}
