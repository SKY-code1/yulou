# -*- coding: utf-8 -*-
"""
生成玉楼问命的前端基础数据：

1. assets/js/data/solar-terms.js  —— 1900–2100 年 24 节气的北京时间（精确到秒）
2. assets/js/data/hexagrams.js    —— 六十四卦（卦名 / 卦辞 / 象 / 白话 / 分项）
3. tests/fixtures.json            —— 八字回归测试样本（由 lunar_python 校对）

依赖：sxtwl、lunar_python（仅生成数据时使用，运行时不依赖）
用法：python tools/gen_data.py
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

import sxtwl
from lunar_python import Solar

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "assets" / "js" / "data"
TEST_DIR = ROOT / "tests"
RAW_YIJING = ROOT.parent / "yijing_raw.json"

GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"

# 节气顺序：小寒 … 冬至（与 sxtwl 的 jqIndex 1..24 对应）
TERM_NAMES = [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分",
    "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
    "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
]


def jieqi_seconds(year: int) -> list[str]:
    """返回某年 24 个节气的 MMDDHHMMSS（北京时间）。"""
    out: list[str | None] = [None] * 24

    # getJieQiByYear(y) 从 y 年立春开始，到 y+1 年立春结束（25 项）
    current = sxtwl.getJieQiByYear(year)
    for item in current:
        d = sxtwl.JD2DD(item.jd)
        if d.Y != year:
            continue
        idx = item.jqIndex - 1
        out[idx] = f"{d.M:02d}{d.D:02d}{int(d.h):02d}{int(d.m):02d}{int(d.s):02d}"

    # 小寒、大寒在上一年返回列表的末尾
    previous = sxtwl.getJieQiByYear(year - 1)
    for item in previous:
        d = sxtwl.JD2DD(item.jd)
        if d.Y != year or item.jqIndex not in (1, 2):
            continue
        idx = item.jqIndex - 1
        out[idx] = f"{d.M:02d}{d.D:02d}{int(d.h):02d}{int(d.m):02d}{int(d.s):02d}"

    missing = [TERM_NAMES[i] for i, v in enumerate(out) if not v]
    if missing:
        raise RuntimeError(f"{year} 缺节气：{missing}")
    return out  # type: ignore[return-value]


def gen_solar_terms() -> None:
    years = {}
    for year in range(1899, 2102):
        years[str(year)] = jieqi_seconds(year)

    # 简单校验：同一年 24 个节气递增
    for year, items in years.items():
        if len(items) != 24:
            raise RuntimeError(f"{year} 节气数量不对：{len(items)}")
        keys = [(int(s[:2]), int(s[2:4]), int(s[4:6]), int(s[6:8]), int(s[8:10])) for s in items]
        if keys != sorted(keys):
            raise RuntimeError(f"{year} 节气顺序不对")

    js = (
        "// 由 tools/gen_data.py 生成，勿手改。\n"
        "// 结构：年份 -> 24 个节气（小寒…冬至），MMDDHHMMSS，北京时间。\n"
        "export const SOLAR_TERMS = "
        + json.dumps(years, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    (DATA_DIR / "solar-terms.js").write_text(js, encoding="utf-8")
    print(f"solar-terms.js  {len(js) / 1024:.1f} KB  {len(years)} 年")


def gen_hexagrams() -> None:
    raw = json.loads(RAW_YIJING.read_text(encoding="utf-8"))
    rows = []
    for h in raw["hexagrams"]:
        items = {i["label"]: i["text"] for i in h["overview"]["traditional"]["items"]}
        guaci = (h["canon"].get("guaci") or [""])[0]
        xiang = (h["canon"].get("xiang") or [""])[0]
        translation = (h["overview"].get("translation", {}).get("text") or [""])[0]
        lines = [
            {"name": ln["name"], "text": ln["text"]}
            for ln in h["canon"].get("lines", [])
        ]
        rows.append(
            {
                "id": h["id"],
                "name": h["name"].replace("卦", ""),
                "image": h["image"],
                "summary": h["summary"],
                "upper": h["upper"],
                "lower": h["lower"],
                "bits": h["bits"],
                "guaci": guaci,
                "xiang": xiang,
                "translation": translation,
                "fortune": items.get("运势", ""),
                "career": items.get("事业", ""),
                "love": items.get("婚恋", ""),
                "decision": items.get("决策", ""),
                "lines": lines,
            }
        )

    if len(rows) != 64:
        raise RuntimeError(f"卦数量不对：{len(rows)}")

    js = (
        "// 由 tools/gen_data.py 生成，勿手改。\n"
        "// 数据整理自公开的《周易》原文与白话资料（liujuntao123/yijing，MIT）。\n"
        "export const HEXAGRAMS = "
        + json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
        "export const HEX_BY_BITS = Object.fromEntries(HEXAGRAMS.map(h => [h.bits.join(''), h]));\n"
    )
    (DATA_DIR / "hexagrams.js").write_text(js, encoding="utf-8")
    print(f"hexagrams.js    {len(js) / 1024:.1f} KB  64 卦")


# ---------- 八字样本 ----------

def day_ganzhi(y: int, m: int, d: int) -> str:
    lunar = Solar.fromYmd(y, m, d).getLunar()
    return lunar.getDayInGanZhi()


def bazi_reference(y: int, m: int, d: int, h: int, minute: int) -> dict:
    """
    Python 侧参考实现，规则与前端一致：
    - 年柱 / 月柱：以节气瞬间为界
    - 日柱：23:00 起算次日（子初换日）
    - 时柱：由日干五鼠遁
    """
    solar = Solar.fromYmdHms(y, m, d, h, minute, 0)
    lunar = solar.getLunar()
    year_gz = lunar.getYearInGanZhiExact()
    month_gz = lunar.getMonthInGanZhiExact()

    if h >= 23:
        nxt = date(y, m, d) + timedelta(days=1)
        day_gz = day_ganzhi(nxt.year, nxt.month, nxt.day)
    else:
        day_gz = day_ganzhi(y, m, d)

    day_stem = GAN.index(day_gz[0])
    hour_branch = ((h + 1) % 24) // 2
    hour_stem = ((day_stem % 5) * 2 + hour_branch) % 10
    hour_gz = GAN[hour_stem] + ZHI[hour_branch]

    return {
        "y": y, "m": m, "d": d, "h": h, "min": minute,
        "year": year_gz, "month": month_gz, "day": day_gz, "hour": hour_gz,
        "bazi": f"{year_gz} {month_gz} {day_gz} {hour_gz}",
    }


def gen_fixtures() -> None:
    rng = random.Random(20261102)
    samples = []

    # 固定边界样本
    fixed = [
        (1990, 1, 1, 12, 0),
        (2000, 1, 1, 0, 0),
        (2000, 1, 1, 22, 59),
        (2000, 1, 1, 23, 0),
        (2000, 1, 1, 23, 30),
        (2000, 1, 2, 0, 0),
        (1984, 2, 2, 0, 0),
        (2024, 2, 4, 12, 0),
        (2024, 2, 4, 17, 0),
        (1949, 10, 1, 15, 0),
    ]
    samples.extend(bazi_reference(*x) for x in fixed)

    # 随机样本：1940–2020
    while len(samples) < 510:
        y = rng.randint(1940, 2020)
        m = rng.randint(1, 12)
        d = rng.randint(1, 28)
        h = rng.randint(0, 23)
        minute = rng.choice([0, 15, 30, 45, rng.randint(0, 59)])
        samples.append(bazi_reference(y, m, d, h, minute))

    payload = {
        "generatedBy": "tools/gen_data.py + lunar_python",
        "note": "子初换日；节气以 sxtwl 时间为准",
        "samples": samples,
    }
    (TEST_DIR / "fixtures.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"fixtures.json   {len(samples)} 条")


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    gen_solar_terms()
    gen_hexagrams()
    gen_fixtures()
