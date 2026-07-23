#!/usr/bin/env python3
"""从 workflow transcript 里回收生成 agent 已产出的题目。

生成工作流可能因额度、超时或人工中止而拿不到最终 return 值，但每个 agent 的
产出已经写在它自己的 transcript 里。这个脚本把它们捞出来拼成 `{"pool": [...]}`，
可直接喂给 `jlpt_pipeline_v2 ingest`——不用重跑一遍生成。

只做搬运与去重，不修改任何题目内容：审核门、相似度门、发布门一律照常走。

用法：
  python3 scripts/jlpt_gen/harvest_workflow_pool.py \\
      --transcript-dir ~/.claude/projects/<proj>/subagents/workflows/wf_xxx \\
      --level N1 --group lex \\
      --out data/jlpt_v2_runs/N1-lex-w1/harvested.json
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

_LISTEN_PREFIX = "listen_"


def _canonical(text: str) -> str:
    return "".join(unicodedata.normalize("NFKC", str(text or "")).split())


def _dedupe_key(question: dict) -> str:
    return "|".join(
        [
            str(question.get("qtype") or ""),
            _canonical(question.get("stem")),
            _canonical(question.get("passage"))[:24],
        ]
    )


def harvest(
    transcript_dir: Path,
    level: str,
    group_qtypes: set[str],
    section_of: dict[str, str],
) -> tuple[list[dict], dict]:
    seen: set[str] = set()
    pool: list[dict] = []
    stats = {"agentFiles": 0, "agentsWithOutput": 0, "rawQuestions": 0, "skippedWrongLevel": 0}

    for path in sorted(transcript_dir.glob("agent-*.jsonl")):
        stats["agentFiles"] += 1
        # 一个 agent 可能因 StructuredOutput 重试产出多份，取最完整的一份。
        best: list[dict] = []
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            for chunk in ((event.get("message") or {}).get("content") or []):
                if not isinstance(chunk, dict) or chunk.get("type") != "tool_use":
                    continue
                questions = (chunk.get("input") or {}).get("questions")
                if isinstance(questions, list) and len(questions) > len(best):
                    best = questions
        if not best:
            continue
        stats["agentsWithOutput"] += 1
        for question in best:
            if not isinstance(question, dict):
                continue
            stats["rawQuestions"] += 1
            qtype = str(question.get("qtype") or "")
            if qtype not in group_qtypes:
                stats["skippedWrongLevel"] += 1
                continue
            key = _dedupe_key(question)
            if key in seen:
                continue
            seen.add(key)
            record = dict(question)
            # 生成 agent 只吐 qtype，`section` / `level` 是工作流 sanitize() 事后
            # 按契约补的。这里做同样的机械补全——映射来自契约、不是猜测，也不改
            # 任何题目内容；缺 passage/group 的按契约补空串。
            record["level"] = level
            record["section"] = section_of[record["qtype"]]
            record.setdefault("passage", "")
            record.setdefault("group", "")
            pool.append(record)
    stats["uniqueKept"] = len(pool)
    stats["listening"] = sum(1 for q in pool if str(q.get("qtype", "")).startswith(_LISTEN_PREFIX))
    return pool, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--transcript-dir", required=True)
    parser.add_argument("--level", required=True, choices=["N1", "N2", "N3", "N4", "N5"])
    parser.add_argument("--group", required=True, choices=["lex", "rc"])
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from jlpt_contract_v2 import load_contract

    contract = load_contract()
    group_qtypes = set(contract["generationGroups"][args.group])
    section_of = {qtype: spec["section"] for qtype, spec in contract["qtypes"].items()}

    transcript_dir = Path(args.transcript_dir).expanduser()
    if not transcript_dir.is_dir():
        print(json.dumps({"status": "failed", "message": f"{transcript_dir} 不是目录"}, ensure_ascii=False), file=sys.stderr)
        return 2

    pool, stats = harvest(transcript_dir, args.level, group_qtypes, section_of)
    if not pool:
        print(json.dumps({"status": "failed", "message": "没有回收到任何题目", "stats": stats}, ensure_ascii=False), file=sys.stderr)
        return 2

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"pool": pool}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    by_qtype: dict[str, int] = {}
    for question in pool:
        by_qtype[question["qtype"]] = by_qtype.get(question["qtype"], 0) + 1
    print(json.dumps({"status": "ok", "out": str(out_path), "stats": stats, "byQtype": by_qtype}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
