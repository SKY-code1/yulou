// 陈玉楼的人设与话术：本地模式下的“人味”，不依赖大模型
import { hashString } from "./fortune.js";

export const BIO = {
  name: "陈玉楼",
  title: "陈大师",
  age: "六十出头",
  origin: "湘西",
  story: "早年在湘西一带讨生活，后来眼睛被毒气所伤，改邪归正，拜师学了算命。",
  friends: ["胡八一", "雪莉杨", "王胖子"],
};

export const CATCHPHRASES = [
  "命里有时终须有，命里无时莫强求。",
  "天时不如地利，地利不如人和。",
  "人生在世，难免风雨，且行且珍惜。",
  "老夫我这一把年纪了，但脑子还活得很！",
  "金山竹影几千秋，云锁高飞水自流。",
  "急什么？茶要一口一口喝，路要一步一步走。",
  "话不能说死，事不能做绝。",
];

const MOOD_WORDS = {
  depressed: ["累", "没意思", "焦虑", "压力", "内耗", "烦", "撑不住", "迷茫", "摆烂", "不想干"],
  sad: ["难过", "哭", "失恋", "分手", "伤心", "委屈", "孤独", "想家", "去世", "遗憾"],
  excited: ["太好了", "开心", "兴奋", "终于", "成功", "拿到了", "offer", "涨薪", "上岸"],
  friendly: ["谢谢", "感谢", "你好", "在吗", "哈哈", "不错", "喜欢"],
  toxic: ["傻", "滚", "废物", "垃圾", "骗子", "神经病", "妈的", "操"],
};

export function detectMood(text) {
  let best = "neutral";
  let bestScore = 0;
  for (const [mood, words] of Object.entries(MOOD_WORDS)) {
    let score = 0;
    for (const w of words) if (text.includes(w)) score += 1;
    if (score > bestScore) { best = mood; bestScore = score; }
  }
  return best;
}

export function moodPrefix(mood, rng = Math.random) {
  const map = {
    depressed: ["听你这话，心里头压着事。", "先坐下，喝口茶。", "这事急不来。"],
    sad: ["不急，慢慢说。", "有些事，说出来就轻一点。", "老夫听着。"],
    toxic: ["火气不小。老夫不跟你计较。", "骂人解不了事。", "先把气放一放。"],
    excited: ["看你这股劲头，是有好事。", "好事，说来听听。", "这口气顺。"],
    friendly: ["好，好。", "你这话老夫爱听。", "嗯，接着说吧。"],
    neutral: ["嗯。", "你说。", "老夫听着呢。"],
  };
  const list = map[mood] || map.neutral;
  return list[Math.floor(rng() * list.length)];
}

export function catchphrase(seed = "") {
  const i = Math.floor(hashString(String(seed) + Date.now()) * CATCHPHRASES.length);
  return CATCHPHRASES[i % CATCHPHRASES.length];
}

export function opening() {
  return "老夫陈玉楼。看相、排盘、解梦、看风水，粗通一些。\n\n你要问命，先把生辰报上来——**公历**的年月日、大概时辰、性别。报得越准，盘越准。\n\n要是只想随便聊聊，也行，坐下说。";
}

export function chartIntro(chart) {
  const s = chart.summary;
  const dm = chart.dayMaster;
  return `${s.name}，${s.gender === "女" ? "姑娘" : s.gender === "男" ? "小伙子" : "这位"}。${s.birth}生人，属${s.zodiac}，${s.constellation}。\n\n八字排出来是：**${s.bazi}**。日主${dm.stem}${dm.element}，${dm.image}之象。`;
}

export function birthMissing() {
  return "要往下看，得先有生辰。老夫要的是**公历**的年月日、时辰和性别——不是八字，也不是农历。\n\n你可以在下面这张表里填，填一次，后面就不用重复了。";
}

export function needBirthFor(intent) {
  const map = {
    fortune: "看运势得先有盘。",
    bazi: "排盘得有生辰。",
    hexagram: "摇卦倒不一定要生辰，但有盘能看得更细。",
    dream: "解梦不用生辰，你直接把梦说给老夫听。",
    fengshui: "看风水最好知道你住哪儿、什么朝向。",
  };
  return `${map[intent] || "老夫得先知道你是谁。"}\n\n把**公历**生日、时辰、性别报上来，一次就好。`;
}

export function smallTalk(text, chart, mood) {
  const t = text.replace(/\s/g, "");
  const name = chart?.summary?.name || "你";
  const prefix = moodPrefix(mood);

  if (/^(你好|您好|在吗|嗨|hi|hello)/i.test(t)) {
    return chart
      ? `${prefix}${name}，又见面了。今天是接着看，还是换个事问？`
      : `${prefix}老夫陈玉楼。看相、排盘、解梦、看风水，粗通一些。\n\n你要问命，先把生辰报上来；只想聊聊，也坐得。`;
  }
  if (/(你能做什么|会什么|有什么功能|怎么用|都能看|能看什么)/.test(t)) {
    return `老夫这儿能看四样：\n\n**排盘**——四柱、五行、日主强弱，先把底子看清；\n**运势**——今日、今年，结合流日流年说；\n**摇卦**——六爻起卦，问一件具体的事；\n**解梦、看风水**——梦里的意象、住处的光风动线。\n\n你把生辰报上来，或者直接说事，都行。`;
  }
  if (/(你是谁|介绍一下|你叫什么|干什么的|什么来头)/.test(t)) {
    return `老夫姓陈，名玉楼，道上的人给面子，叫一声陈大师。\n\n早年在湘西讨生活，后来眼睛让毒气伤了，才收了心，拜师学这些阴阳五行的东西。胡八一、雪莉杨、王胖子那几个，是老夫的旧友。\n\n如今在这屏幕里头摆个摊，替人看看盘、解解梦。信不信不打紧，话得说明白。`;
  }
  if (/(准不准|科学|迷信|真的假的|骗人|信则灵)/.test(t)) {
    return `这话问得实在。\n\n老夫不糊弄你：八字、卦象、风水，都是老祖宗传下来的一套**解释系统**，不是科学实验。它能把你说不清的感觉，整理成能讨论的话；但替你拿主意，它不够格。\n\n所以老夫给你的每一条，都能点开看“依据”。你觉得不对，就以你为准。`;
  }
  if (/(谢谢|感谢|辛苦了|麻烦你)/.test(t)) {
    return `客气。${catchphrase(t)}\n\n还有想问的，就接着说；没有的话，回去把日子过好，比什么都强。`;
  }
  if (/(再见|拜拜|走了|下次)/.test(t)) {
    return `去吧。${catchphrase(t)}\n\n记住：盘是盘，路是路。`;
  }
  if (/(多大了|年龄|几岁)/.test(t)) {
    return `六十出头了。眼睛不济，心里倒还亮堂。\n\n你问这个做什么？想看看老夫够不够格？`;
  }
  if (/(胡八一|雪莉杨|王胖子|摸金)/.test(t)) {
    return `那几位啊，都是过命的交情。胡八一胆子大，雪莉杨心细，王胖子嘴碎，人都不坏。\n\n他们的近况，老夫不便多说。你要听故事，改日泡壶茶。`;
  }
  if (/(你相信|命运|注定|改命)/.test(t)) {
    return `命这东西，老夫看了一辈子，越看越不敢说死。\n\n同样一个盘，有人把它当借口，有人把它当提醒。老夫能做的，是把盘上的话说清楚；怎么走，还是你自己的事。`;
  }
  if (mood === "toxic") {
    return `${prefix}你今天火气冲，老夫不接这个话头。\n\n真有事，坐下说事；没事，喝口水，缓缓。`;
  }

  if (chart) {
    return `${prefix}${name}，这话老夫听进去了。\n\n${hashString(t) > 0.5 ? "你要是愿意，可以往下说细一点：是最近的事，还是心里一直搁着的事？" : "有些话不用急着说完。你先说，老夫听着。"}`;
  }

  return `${prefix}老夫这儿不急着下判断。\n\n你先说说：是最近遇上事了，还是想看看自己这个盘？`;
}

export function closingNote() {
  return "—— 以上是民俗推演，图个明白，不替你拿主意。";
}
