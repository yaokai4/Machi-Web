#!/usr/bin/env python3
"""JLPT 原创候选题批量生成工具（B2-7 —— 只做工具，不做内容上架）。

用现有 LLM 配置（seed_llm 的 DeepSeek 通道，同 Machi AI / seed bot，密钥只走
环境变量 DEEPSEEK_API_KEY）按 level × section 生成【原创】候选题，输出与
POST /api/admin/jlpt/questions/import 完全兼容的 JSON 文件。

合规红线（与 server_jlpt / _JLPT_DISCLAIMER 同一承诺）：
- 【绝对禁止真题原文】：提示词明令禁止复述、改写、翻译 JLPT 官方真题/历年
  真题原文，只允许原创命题。这是版权与 App 审核红线。
- 【生成 ≠ 上架】：每题固定 review_status='pending' / source='original'。
  practice/定级/模考抽题都要求 review_status='approved'，pending 的题绝不会
  出现在任何用户面前。必须人工逐题审核（题干正确性、答案唯一性、解析质量、
  等级匹配）后把 review_status 改为 approved 才算上架——错题比没题更毁付费
  信任。建议抽查比例 ≥20%。
- 【本脚本绝不自动导入】：只写本地 JSON 文件。审核后由 admin 导入页或
  curl 调 /api/admin/jlpt/questions/import 导入。
- 听力（listening）题默认不生成：没有音频媒体的听力题即使被误 approve，
  抽题层也会排除（server_jlpt._AUDIO_READY_SQL，B2-6）。--include-listening
  仅生成「听力脚本在 passage 里」的候选题，供后续配音频用，并打上
  needs_audio 标签。

用法（在 web/ 目录下）：
  DEEPSEEK_API_KEY=... python3 scripts/generate_jlpt_questions.py \
      --level N2 --sections vocab,grammar,reading --count 10 \
      --out jlpt_n2_candidates.json [--mode fast|think|pro]

  --level    N1..N5，逗号分隔或 all
  --count    每个 level×section 的目标题数（默认 10，上限 100）
  --mode     生成模式（seed_llm 的中性 token：fast/think/pro，默认 fast）
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import seed_llm  # noqa: E402  (复用 DeepSeek 通道与 JSON 提取，不新建 LLM 配置)

LEVELS = ("N5", "N4", "N3", "N2", "N1")
SECTIONS = ("vocab", "grammar", "reading", "listening")
DEFAULT_SECTIONS = ("vocab", "grammar", "reading")
CHUNK = 5          # 每次调用生成的题数（小批量并守住 JSON 完整性）
MAX_PER_CELL = 100

_SECTION_BRIEF = {
    "vocab": "文字·词汇题：汉字读音、词义辨析、近义词、用法搭配",
    "grammar": "语法题：句型接续、助词、敬语、语法辨析（挖空选择）",
    "reading": "读解题：给一段 80-250 字的【原创】短文（passage），就主旨/细节/态度提问",
    "listening": "听力题：写一段 40-150 字的【原创】对话或独白脚本放进 passage（后续人工录音频），再就内容提问",
}

_SYSTEM = (
    "你是资深 JLPT 命题专家，为一款备考 App 生成【原创】练习题。铁律：\n"
    "1)【版权红线】绝对禁止复述、改写、翻译或变形任何 JLPT 官方真题/历年真题原文；"
    "题干、选文、选项必须全部原创。可以对标官方题型与大纲难度，但内容必须是你新写的。\n"
    "2) 每题恰好 4 个选项，有且只有一个正确答案；干扰项要有迷惑性但必须明确错误、不能有歧义。\n"
    "3) explanation 用简体中文讲清为什么选它、其他选项错在哪，像老师讲题。\n"
    "4) 难度严格匹配指定等级的官方水平（N5 最易 … N1 最难），difficulty 给 1-5 的题内难度。\n"
    "5) 日语表达必须自然、无语法错误；这是付费学习内容，一道错题就毁掉信任。\n"
    "只输出 JSON，不要解释。"
)


def _user_prompt(level: str, section: str, n: int) -> str:
    passage_note = (
        '"passage" 必填（原创短文/脚本）' if section in ("reading", "listening")
        else '"passage" 留空字符串'
    )
    return (
        f"生成 {n} 道 JLPT {level} 的 {section} 题（{_SECTION_BRIEF[section]}）。\n"
        f"彼此不重复、考点分散。{passage_note}。\n"
        '输出严格 JSON：{"items": [{"stem": "题干", "passage": "", '
        '"choices": ["A", "B", "C", "D"], "answerIndex": 0, '
        '"explanation": "解析", "difficulty": 3}, ...]}'
    )


def _valid_item(raw: object, level: str, section: str, seen_stems: set[str]) -> dict | None:
    """校验并规范化一道候选题为 /api/admin/jlpt/questions/import 的行格式。
    不合格返回 None（丢弃，不修补——宁缺毋滥）。"""
    if not isinstance(raw, dict):
        return None
    stem = str(raw.get("stem") or "").strip()
    choices = raw.get("choices")
    if not stem or stem in seen_stems or not isinstance(choices, list):
        return None
    choices = [str(c).strip() for c in choices if str(c).strip()]
    if len(choices) != 4 or len(set(choices)) != 4:
        return None
    try:
        answer_index = int(raw.get("answerIndex", raw.get("answer_index", -1)))
    except (TypeError, ValueError):
        return None
    if not (0 <= answer_index < 4):
        return None
    explanation = str(raw.get("explanation") or "").strip()
    if not explanation:
        return None
    passage = str(raw.get("passage") or "").strip()
    if section in ("reading", "listening") and not passage:
        return None
    try:
        difficulty = max(1, min(5, int(raw.get("difficulty") or 3)))
    except (TypeError, ValueError):
        difficulty = 3
    seen_stems.add(stem)
    return {
        "level": level,
        "section": section,
        "questionType": "single",
        "stem": stem[:4000],
        "passage": passage[:8000],
        "choices": choices,
        "answerIndex": answer_index,
        "explanation": explanation[:4000],
        "difficulty": difficulty,
        "tags": "needs_audio" if section == "listening" else "",
        "isMemberOnly": False,
        # 生成 ≠ 上架：pending 的题在所有抽题查询里都不可见，人工审核通过后
        # 才改 approved。source='original' 留存出处审计线。
        "source": "original",
        "reviewStatus": "pending",
        "status": "published",
    }


def generate_cell(level: str, section: str, count: int, model_id: str) -> list[dict]:
    """一个 level×section 单元的生成：小批量多次调用，逐题校验去重。"""
    out: list[dict] = []
    seen: set[str] = set()
    misses = 0
    while len(out) < count and misses < 4:
        want = min(CHUNK, count - len(out))
        try:
            raw = seed_llm._call_deepseek(_SYSTEM, _user_prompt(level, section, want), model_id)
            parsed = seed_llm._extract_json(raw)
        except Exception as exc:
            print(f"  ! {level}/{section}: 调用失败（{type(exc).__name__}），重试", file=sys.stderr)
            misses += 1
            continue
        items = parsed.get("items") if isinstance(parsed, dict) else parsed
        got = 0
        for entry in items if isinstance(items, list) else []:
            item = _valid_item(entry, level, section, seen)
            if item:
                out.append(item)
                got += 1
                if len(out) >= count:
                    break
        misses = misses + 1 if got == 0 else 0
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="生成 JLPT 原创候选题（pending，人工审核后才可导入上架）")
    ap.add_argument("--level", default="N3", help="N1..N5，逗号分隔或 all")
    ap.add_argument("--sections", default=",".join(DEFAULT_SECTIONS),
                    help=f"逗号分隔：{'/'.join(SECTIONS)}（listening 需 --include-listening）")
    ap.add_argument("--count", type=int, default=10, help="每个 level×section 的题数（默认 10）")
    ap.add_argument("--mode", default="fast", help="生成模式：fast / think / pro")
    ap.add_argument("--include-listening", action="store_true",
                    help="允许生成听力候选题（脚本在 passage，需人工配音频后才可能上架）")
    ap.add_argument("--out", default="", help="输出 JSON 路径（默认 jlpt_candidates_<ts>.json）")
    args = ap.parse_args()

    if not seed_llm.DEEPSEEK_API_KEY:
        print("错误：未配置 DEEPSEEK_API_KEY（密钥只走环境变量，绝不写进代码/文件）。", file=sys.stderr)
        return 2

    levels = LEVELS if args.level.strip().lower() == "all" else tuple(
        s.strip().upper() for s in args.level.split(",") if s.strip())
    if any(lv not in LEVELS for lv in levels) or not levels:
        print(f"错误：--level 只接受 {'/'.join(LEVELS)} 或 all", file=sys.stderr)
        return 2
    sections = tuple(s.strip().lower() for s in args.sections.split(",") if s.strip())
    if any(sec not in SECTIONS for sec in sections) or not sections:
        print(f"错误：--sections 只接受 {'/'.join(SECTIONS)}", file=sys.stderr)
        return 2
    if "listening" in sections and not args.include_listening:
        sections = tuple(s for s in sections if s != "listening")
        print("提示：listening 已跳过（无音频的听力题不会被抽题层放出）。要生成脚本请加 --include-listening。")
    count = max(1, min(int(args.count), MAX_PER_CELL))
    model_id = seed_llm._resolve_model(args.mode)

    items: list[dict] = []
    for lv in levels:
        for sec in sections:
            print(f"生成 {lv} / {sec} × {count} …")
            got = generate_cell(lv, sec, count, model_id)
            print(f"  → 通过校验 {len(got)} 题")
            items.extend(got)

    if not items:
        print("没有生成任何合格候选题（检查网络/密钥/模式后重试）。", file=sys.stderr)
        return 1

    out_path = Path(args.out or f"jlpt_candidates_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json")
    payload = {
        "note": ("候选题（review_status=pending / source=original）。必须人工逐题审核后才可导入上架："
                 "审核通过的题把 reviewStatus 改为 approved，再 POST /api/admin/jlpt/questions/import。"
                 "本文件由 scripts/generate_jlpt_questions.py 生成，未经审核绝不直接导入。"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n共 {len(items)} 题写入 {out_path}")
    print("下一步：人工审核（题干/答案唯一性/解析/等级匹配，建议抽查 ≥20%）→ 把通过的题 reviewStatus 改为 approved → 经 admin 导入页或 /api/admin/jlpt/questions/import 导入。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
