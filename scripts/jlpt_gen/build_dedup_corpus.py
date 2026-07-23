#!/usr/bin/env python3
"""构建 jlptv2 查重语料（供 jlpt_similarity_attest attest --official-corpus 使用）。

**这份语料不包含官方真题原文。** Machi 依合规红线本就不持有、不复制官方真题；
它的用途是防止新生成的 v2 题目与**我们自己已有的内容**重复：

  - data/jlpt_bank_v1.json  已上线的 mockv1 题库
  - data/jlpt_gen_pool/*.json  历史生成候选池（含未采用的）
  - 可选：--extra 追加任意纯文本行（例如运营手工收集的公开例句黑名单）

输出是一行一条的纯文本，每行是一道题的规范化正文（passage + stem + 选项），
attest 用它做确定性 Dice 与 TF-IDF 余弦双重查重。

用法：
  python3 scripts/jlpt_gen/build_dedup_corpus.py --out data/jlpt_dedup_corpus.txt
"""
from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]


def _canonical(passage: str, stem: str, choices: list) -> str:
    parts = [str(passage or ""), str(stem or ""), *[str(choice) for choice in (choices or [])]]
    text = unicodedata.normalize("NFKC", "\n".join(parts))
    # 语料是一行一条，内部换行必须压掉，否则一道题会被拆成多条基准。
    return "".join(text.split())


def _from_bank(path: Path) -> list[str]:
    if not path.exists():
        return []
    bank = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for question in bank.get("questions") or []:
        if not isinstance(question, dict):
            continue
        text = _canonical(question.get("passage"), question.get("stem"), question.get("choices"))
        if text:
            out.append(text)
    return out


def _from_pool(path: Path) -> list[str]:
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    items = raw if isinstance(raw, list) else (raw.get("pool") or raw.get("questions") or [])
    out = []
    for question in items:
        if not isinstance(question, dict):
            continue
        text = _canonical(question.get("passage"), question.get("stem"), question.get("choices"))
        if text:
            out.append(text)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True)
    parser.add_argument("--extra", action="append", default=[], help="追加的纯文本语料文件（一行一条）")
    parser.add_argument("--minimum-chars", type=int, default=12)
    args = parser.parse_args()

    data = _ROOT / "web" / "data" if (_ROOT / "web" / "data").exists() else _ROOT / "data"
    entries: list[str] = []
    entries += _from_bank(data / "jlpt_bank_v1.json")
    pool_dir = data / "jlpt_gen_pool"
    if pool_dir.exists():
        for pool_path in sorted(pool_dir.glob("*.json")):
            entries += _from_pool(pool_path)
    for extra in args.extra:
        extra_path = Path(extra)
        if extra_path.exists():
            entries += [line.strip() for line in extra_path.read_text(encoding="utf-8").splitlines()]

    unique = sorted({entry for entry in entries if len(entry) >= args.minimum_chars})
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(unique) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "ok",
        "out": str(out_path),
        "entries": len(unique),
        "rawEntries": len(entries),
        "note": "不含官方真题原文；用途是防止与 Machi 自有既存内容重复",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
