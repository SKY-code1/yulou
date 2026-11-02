// 运势推演：流日 / 流年 / 分项解读
// 说明：这是民俗规则模型，不是科学预测。所有结论都可以展开看到计算依据。

import {
  GAN, ZHI, GAN_ELEMENT, ZHI_ELEMENT, ELEMENTS, ELEMENT_META,
  GENERATES, CONTROLS, dayGanzhi, solarTerm, compareDateTime, ganzhi,
  nowParts, dateKey, weekdayCN,
} from "./calendar.js";
import { tenGod, branchRelation, tenGodTone } from "./bazi.js";

const GOD_SCORE = {
  正财: 0.6, 正官: 0.6, 正印: 0.6, 食神: 0.6,
  偏财: 0.2, 比肩: 0.2, 偏印: 0,
  伤官: -0.3, 七杀: -0.4, 劫财: -0.5,
};

const GOD_DAILY = {
  比肩: "今天像是“自己人”的日子：适合并肩做事、把话说开。别把同辈的帮忙当成理所当然。",
  劫财: "今天容易在“分”和“争”上起念头：钱、机会、功劳都容易被人分走一点。账要算清，话别说满。",
  食神: "今天适合输出：写、做、吃、聊。灵感不难找，难的是收尾，别开太多头。",
  伤官: "今天锋芒偏露，容易一眼看出问题，也容易一句话得罪人。可以提意见，但换个说法。",
  偏财: "今天的机会多来自“人”而不是“事”：饭局、私信、临时邀约里可能藏着东西。别急着 all in。",
  正财: "今天适合把该拿的拿到手：对账、报销、交付、把口头承诺落成文字。稳一点反而快。",
  七杀: "今天压力会具体地落到一件事上。别硬扛，先把最难的那 20% 拆出来做完。",
  正官: "今天适合走流程、见该见的人、把位置摆正。规矩不是束缚，今天它是你的护城河。",
  偏印: "今天脑子转得偏、想得深，适合独处和研究；也容易过度解读别人的一句话。",
  正印: "今天适合学、问、办手续，也适合接受帮助。别因为“不好意思”把资源推出去。",
};

const GOD_YEAR = {
  比肩: "今年主题是“自己”：适合立个人品牌、独立负责一块事；也要留意同辈竞争与分账。",
  劫财: "今年容易遇到“分蛋糕”的局面：合作机会多，但条款要白纸黑字。别替人担保。",
  食神: "今年是输出年：作品、内容、产品都容易做出来。关键是选一个方向做深，而不是样样开花。",
  伤官: "今年想突破、想改规则，锋芒会被人看见；也容易和上级/规则起摩擦。把“反对”换成“方案”。",
  偏财: "今年机会型收入、跨界人脉会变多；但波动也大，适合小步试错，不适合押上全部。",
  正财: "今年是积累年：收入结构趋于稳定，适合把现金流、合同、交付做扎实。慢就是快。",
  七杀: "今年压力和机会绑在一起：会被推着扛事。扛过去就是资历，扛不住就学会拒绝。",
  正官: "今年适合“进组织、拿位置、立规矩”：考试、晋升、转正、带团队都在这条线上。",
  偏印: "今年容易想得多、动得少：适合读书、研究、换赛道前的准备；小心内耗和失眠。",
  正印: "今年贵人运与学习运偏强：适合进修、考证、找长辈/前辈背书；别把机会当成理所当然。",
};

const TOPIC_KEY = {
  事业: { gods: ["正官", "七杀", "食神", "伤官"], text: "看事业，主要看官杀（压力与位置）和食伤（输出与突破）" },
  财运: { gods: ["正财", "偏财", "比肩", "劫财"], text: "看财运，主要看财星（正财稳、偏财活）与比劫（分利与竞争）" },
  感情: { gods: ["正财", "正官", "食神", "伤官"], text: "看感情，传统以财星/官星为参照，也要看日支（夫妻宫）的合冲" },
  健康: { gods: [], text: "看健康，主要看五行是否偏枯，以及日主有没有被过度消耗" },
};

const ORGANS = {
  木: "肝胆、筋、眼",
  火: "心、小肠、循环",
  土: "脾胃、消化",
  金: "肺、大肠、皮肤",
  水: "肾、膀胱、内分泌",
};

const ELEMENT_ACTIVITY = {
  木: "从零搭一个东西、让它长起来",
  火: "把它讲出来、让更多人看见",
  土: "把流程跑通、落到地上",
  金: "定规则、做取舍、抠技术细节",
  水: "研究、连接、让信息流动",
};

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function stars(score) {
  return Math.round(clamp(score, 1, 5) * 2) / 2;
}

function pickByHash(list, seed, offset = 0) {
  return list[Math.floor(hashString(seed + offset) * list.length) % list.length];
}

/** 当天日期的流年干支（以立春为界） */
export function yearGanzhi(year, month = 6, day = 1) {
  const birth = { year, month, day, hour: 12, minute: 0, second: 0 };
  const lichun = solarTerm(year, 2);
  const y = compareDateTime(birth, lichun) < 0 ? year - 1 : year;
  return { year: y, gz: GAN[((y - 4) % 10 + 10) % 10] + ZHI[((y - 4) % 12 + 12) % 12] };
}

export function dailyFortune(chart, date = new Date()) {
  const p = nowParts(date);
  const idx = dayGanzhi(p.year, p.month, p.day);
  const stem = GAN[idx % 10];
  const zhi = ZHI[idx % 12];
  const seed = `${dateKey(date)}|${chart.summary.bazi}|${chart.summary.name}`;

  const god = tenGod(chart.dayMaster.stem, stem);
  const rel = branchRelation(chart.pillars.day.zhi, zhi);
  const dayElement = GAN_ELEMENT[stem];

  let score = 3.2 + (GOD_SCORE[god] ?? 0);
  if (rel === "六合") score += 0.8;
  if (rel === "半合") score += 0.5;
  if (rel === "相害") score -= 0.5;
  if (rel === "六冲") score -= 0.8;
  if (chart.elements.favorable.includes(dayElement)) score += 0.4;
  score += (hashString(seed) - 0.5) * 0.8;
  score = stars(score);

  const yi = [];
  const ji = [];
  const godText = GOD_DAILY[god];
  if (god === "正财") { yi.push("对账 / 报销", "交付确认", "存钱"); ji.push("冲动投资", "口头承诺"); }
  else if (god === "偏财") { yi.push("见人 / 聊合作", "小成本试错", "请客"); ji.push("押上全部", "赌运气"); }
  else if (god === "正官") { yi.push("汇报 / 面试", "走流程", "定规则"); ji.push("迟到", "越级"); }
  else if (god === "七杀") { yi.push("攻坚", "运动", "解决积压"); ji.push("硬碰硬", "熬夜"); }
  else if (god === "食神") { yi.push("写作 / 提案", "下厨", "陪家人"); ji.push("暴饮暴食", "开太多头"); }
  else if (god === "伤官") { yi.push("提新方案", "改稿", "整理作品"); ji.push("顶撞", "发长文"); }
  else if (god === "正印") { yi.push("读书", "请教前辈", "办手续"); ji.push("拖延", "过度依赖"); }
  else if (god === "偏印") { yi.push("独处", "复盘", "研究偏门"); ji.push("胡思乱想", "失眠"); }
  else if (god === "比肩") { yi.push("同步进度", "见朋友", "运动"); ji.push("独断", "借钱给熟人"); }
  else if (god === "劫财") { yi.push("谈判", "清理旧账", "砍价"); ji.push("合伙口头承诺", "冲动消费"); }

  const fav = chart.elements.favorable;
  const luckyElement = fav[0];
  const lucky = {
    element: luckyElement,
    color: ELEMENT_META[luckyElement].color.split("、")[0],
    direction: ELEMENT_META[luckyElement].dir.split("、")[0],
    number: String(1 + (idx % 9)),
  };

  const relationText = rel === "六冲"
    ? `今天${zhi}冲你的日支${chart.pillars.day.zhi}，容易临时起变化，重要的事留个 B 计划。`
    : rel === "六合"
      ? `今天${zhi}与你的日支${chart.pillars.day.zhi}六合，人和事都比较容易对上。`
      : rel === "半合"
        ? `今天${zhi}与日支${chart.pillars.day.zhi}半合，适合找人一起把事推进一段。`
        : rel === "相害"
          ? `今天${zhi}与日支${chart.pillars.day.zhi}相害，容易在细节上被绊一下，别急着下结论。`
          : `今天与你的日支没有明显合冲，节奏更多由你自己掌握。`;

  return {
    type: "daily",
    date: { ...p, weekday: weekdayCN(p.year, p.month, p.day), label: `${p.year} 年 ${p.month} 月 ${p.day} 日` },
    ganzhi: stem + zhi,
    god,
    godTone: tenGodTone(god),
    relation: rel,
    score,
    stars: score,
    yi,
    ji,
    lucky,
    paragraphs: [
      `${dateKey(date)}，${stem}${zhi}日，对你来说走的是「${god}」这条线——${tenGodTone(god)}。`,
      godText,
      relationText,
    ],
    basis: [
      `流日干支：${stem}${zhi}（${p.year}-${p.month}-${p.day}）`,
      `日主：${chart.dayMaster.stem}${chart.dayMaster.element}；流日十神：${god}`,
      `日支关系：${rel || "无合冲"}`,
      `喜用：${fav.join("、")}；流日五行：${dayElement}${fav.includes(dayElement) ? "（加分）" : ""}`,
    ],
  };
}

export function yearlyFortune(chart, year = new Date().getFullYear()) {
  const { gz } = yearGanzhi(year);
  const stem = gz[0];
  const zhi = gz[1];
  const god = tenGod(chart.dayMaster.stem, stem);
  const seed = `${year}|${chart.summary.bazi}`;

  const yearZhi = chart.pillars.year.zhi;
  const relYear = branchRelation(yearZhi, zhi);
  const same = yearZhi === zhi;
  const relDay = branchRelation(chart.pillars.day.zhi, zhi);

  let score = 3.2 + (GOD_SCORE[god] ?? 0) * 1.2;
  if (relYear === "六合") score += 0.5;
  if (relDay === "六合") score += 0.4;
  if (relYear === "六冲" || same) score -= 0.4;
  if (chart.elements.favorable.includes(GAN_ELEMENT[stem])) score += 0.3;
  score += (hashString(seed) - 0.5) * 0.5;
  score = stars(score);

  // 关键月份：月建与日支六合/六冲
  const monthNames = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
  const monthBranches = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"];
  const keyMonths = [];
  monthBranches.forEach((b, i) => {
    const r = branchRelation(chart.pillars.day.zhi, b);
    if (r === "六合" || r === "六冲") keyMonths.push({ label: monthNames[i], branch: b, rel: r });
  });

  const taishui = same ? "值太岁" : relYear === "六冲" ? "冲太岁" : relYear === "六合" ? "合太岁" : relYear === "相害" ? "害太岁" : "平";

  return {
    type: "yearly",
    year,
    ganzhi: gz,
    god,
    godTone: tenGodTone(god),
    taishui,
    score,
    stars: score,
    paragraphs: [
      `${year} 年是 ${gz} 年，流年对你走「${god}」——${tenGodTone(god)}。${GOD_YEAR[god]}`,
      `你的年支是${yearZhi}，与流年${zhi}${taishui === "平" ? "没有明显刑冲合害" : `为「${taishui}」`}${relDay === "六冲" ? "；流年又冲日支，变动感会更明显" : ""}。`,
      `今年可以把力气放在${chart.elements.favorable.join("、")}上：${chart.elements.favorable.map((e) => `${e}（${ELEMENT_META[e].color.split("、")[0]}）`).join("、")}。`,
    ],
    keyMonths,
    basis: [
      `流年：${year} 年 ${gz}`,
      `流年十神：${god}（日主 ${chart.dayMaster.stem}${chart.dayMaster.element}）`,
      `太岁关系：${taishui}；日支与流年：${relDay || "无合冲"}`,
      `喜用：${chart.elements.favorable.join("、")}`,
    ],
  };
}

export function topicReading(chart, topic) {
  const conf = TOPIC_KEY[topic];
  if (!conf) return null;
  const dm = chart.dayMaster;
  const counts = chart.godCount;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 2).map(([g]) => g);

  let paragraphs = [];
  let tips = [];

  if (topic === "事业") {
    const officer = (counts.正官 || 0) + (counts.七杀 || 0);
    const output = (counts.食神 || 0) + (counts.伤官 || 0);
    paragraphs = [
      `你是${dm.stem}${dm.element}日主，${dm.text}`,
      officer >= output
        ? `命局里官杀偏多（${officer} 个），你对“位置、规则、责任”比较敏感，适合在有明确评价体系的组织里做事；压力来时容易先扛再说。`
        : `命局里食伤偏多（${output} 个），你更擅长“把东西做出来、把话讲明白”，适合产品、内容、方案型的工作；被管得太细反而发挥不出来。`,
      `结合喜用${chart.elements.favorable.join("、")}，判断一个机会值不值得去，可以看它能不能让你多碰这些事：${chart.elements.favorable.map((e) => ELEMENT_ACTIVITY[e]).join("；")}。`,
    ];
    tips = ["把“我会什么”写成作品，而不是形容词", "面试时讲一次完整的取舍，比讲十个项目有用", "遇到官杀重的年份，先稳住交付，再谈突破"];
  } else if (topic === "财运") {
    const zheng = counts.正财 || 0;
    const pian = counts.偏财 || 0;
    paragraphs = [
      `看财先看日主能不能“担”得住：你的日主${chart.strength.label}，${chart.strength.text}`,
      zheng >= pian
        ? `正财偏多（${zheng} 个），钱更适合从“稳定的交换”里来：工资、合同、长期客户。你对确定性有需求，别被短期暴利的故事带跑。`
        : `偏财偏多（${pian} 个），机会型收入和人脉带来的钱会更多，但波动也大。适合小步试错、多条腿走路，不适合把身家压在一次判断上。`,
      `喜用${chart.elements.favorable.join("、")}，花钱和投资都可以往这两个方向靠：${chart.elements.favorable.map((e) => `${e}（${ELEMENT_META[e].season}）`).join("、")}。`,
    ];
    tips = ["先建 6 个月现金流，再谈投资", "偏财年更要写合同", "别用消费缓解焦虑，那是劫财的坑"];
  } else if (topic === "感情") {
    const dayBranch = chart.pillars.day.zhi;
    const rel = chart.relations.filter((r) => r.a === "日" || r.b === "日");
    paragraphs = [
      `感情里，日支${dayBranch}（${ZHI_ELEMENT[dayBranch]}）是“夫妻宫”，它和别的支的关系，会体现在你处理亲密关系的方式上。`,
      rel.length
        ? `你的日支有 ${rel.map((r) => r.detail).join("、")}：关系里容易在这些点上反复——靠近时想独立，疏远时又不安。`
        : `你的日支没有明显合冲，亲密关系相对稳定，更多考验来自沟通频率而不是大起大落。`,
      `传统上男命看财星、女命看官星，但这只是一种观察角度。对你来说，${top.join("、")} 是你更常用的关系模式：${top.map((g) => tenGodTone(g)).join("；")}。`,
    ];
    tips = ["把需求说成请求，而不是考验", "别在流年冲日支时做重大决定", "能一起把小事做完，比会说情话重要"];
  } else if (topic === "健康") {
    const weak = [...ELEMENTS].sort((a, b) => chart.elements.scores[a] - chart.elements.scores[b])[0];
    const strong = [...ELEMENTS].sort((a, b) => chart.elements.scores[b] - chart.elements.scores[a])[0];
    paragraphs = [
      `五行里${weak}最弱、${strong}最旺。传统上，${weak}对应${ORGANS[weak]}，${strong}过旺时也要留意${ORGANS[strong]}。`,
      `这只是一种提醒，不是诊断。你更应该关注的是作息：日主${chart.strength.label}的人，${chart.strength.label === "偏弱" ? "恢复速度比一般人慢，熬夜的账会拖很久" : "容易高估自己的电量，把日程排满" }。`,
      `喜用${chart.elements.favorable.join("、")}：${chart.elements.favorable.map((e) => `${ELEMENT_META[e].season}多去户外`).join("；")}。`,
    ];
    tips = ["连续两周睡够 7 小时，再看状态", "体检报告比任何排盘都准", "别把“扛得住”当成健康"];
  }

  return {
    type: "topic",
    topic,
    score: stars(3 + (hashString(topic + chart.summary.bazi) - 0.5)),
    paragraphs,
    tips,
    basis: [conf.text, `日主 ${dm.stem}${dm.element}（${chart.strength.label}）`, `十神分布：${sorted.map(([g, n]) => `${g}×${n}`).join("、")}`],
  };
}

export { GOD_DAILY, GOD_YEAR };
