#!/usr/bin/env python3
"""把题库里正确项的位置重排均衡。

生成模型有把正确答案放在首项的强烈倾向（初版实测 A/B/C/D = 204/140/115/68），
导致零知识考生全选 A 就能在 N5/N2 卷上「通过」缩放分参考判定 —— 模考出分因此
失去意义。

均衡的粒度必须是「每张卷 × 每个科目」而不是全库：缩放分按科目算，考生蒙题的
收益也落在卷面上，全库均衡不能保证任一张卷的任一科均衡。因此：
  1) 先按卷内顺序给每张卷的每个科目切片轮转配位（0/1/2/3 严格轮流）；
  2) 不在任何卷里的题（练习/错题本池）再按 (level, section) 轮转配位。
干扰项顺序由 id 派生的确定性 RNG 打散，同一 id 永远得到同一结果，重跑无 diff 噪声。

用法: python3 balance_answers.py <bank.json>  （原地重写）
"""
import json
import random
import re
import sys
from collections import Counter, defaultdict

from atomic_json import dump_json_atomic


_DIGITS = "1234"
_CIRCLED = "①②③④"
_LETTERS = "ABCD"
_LOWER_LETTERS = "abcd"
_FULLWIDTH_LETTERS = "ＡＢＣＤ"
_FULLWIDTH_LOWER_LETTERS = "ａｂｃｄ"
_CHINESE_POSITION = ("一", "二", "三", "四")
_TOKEN_STYLES = (
    _DIGITS,
    _CIRCLED,
    _LETTERS,
    _LOWER_LETTERS,
    _FULLWIDTH_LETTERS,
    _FULLWIDTH_LOWER_LETTERS,
    "".join(_CHINESE_POSITION),
)
_TOKEN_TO_INDEX = {
    token: index
    for style in _TOKEN_STYLES
    for index, token in enumerate(style)
}
_SUPPORTED_TOKEN = r"[1-4①②③④A-Da-dＡ-Ｄａ-ｄ一二三四]"
_POSITION_REFERENCE = re.compile(
    rf"(?P<prefix>(?:选项|選項|選択肢|故选|故選|[Oo]ption\b)\s*)"
    rf"(?P<prefix_open>[（(]?)(?P<prefix_token>{_SUPPORTED_TOKEN})"
    rf"(?P<prefix_close>[）)]?)(?![0-9A-Za-zＡ-Ｚａ-ｚ])"
    rf"|第(?P<ordinal_token>{_SUPPORTED_TOKEN})(?P<ordinal_middle>个|個|の)?"
    rf"(?P<ordinal_suffix>选项|選項|選択肢|项|項)"
    rf"|(?<![0-9A-Za-zＡ-Ｚａ-ｚ])(?P<suffix_token>[A-Da-dＡ-Ｄａ-ｄ])"
    rf"(?P<suffix_space>\s*)(?P<suffix_word>选项|選項|選択肢|项|項)"
)
_SUSPECT_POSITION_REFERENCE = re.compile(
    r"(?:选项|選項|選択肢|故选|故選|[Oo]ption\b)\s*"
    r"(?:[（(]\s*)?(?:[0-9]+|[①-⑩]|[A-Za-zＡ-Ｚａ-ｚ一二三四五六七八九十])(?:\s*[）)])?"
    r"|第\s*[0-9一二三四五六七八九十]+\s*(?:个|個|の)?\s*(?:选项|選項|選択肢|项|項)"
    r"|(?<![0-9A-Za-zＡ-Ｚａ-ｚ])[A-Za-zＡ-Ｚａ-ｚ]\s*(?:选项|選項|選択肢|项|項)"
    r"|(?:答案|正解|答え)(?:是|为|為|は|:|：)\s*[0-9①-⑩A-Za-zＡ-Ｚａ-ｚ]+"
)


class BalanceValidationError(ValueError):
    """Raised before write when explanation references cannot be transformed safely."""


def _render_position_token(original, new_index):
    for style in _TOKEN_STYLES:
        if original in style:
            return style[new_index]
    raise BalanceValidationError(f"unsupported position token: {original}")


def remap_explanation_positions(explanation, old_to_new, *, question_id=""):
    """Move canonical position references or fail closed on suspicious syntax."""
    if not isinstance(explanation, str) or not explanation:
        return explanation

    supported_matches = list(_POSITION_REFERENCE.finditer(explanation))
    supported_spans = [match.span() for match in supported_matches]
    for suspect in _SUSPECT_POSITION_REFERENCE.finditer(explanation):
        start, end = suspect.span()
        if not any(ok_start <= start and end <= ok_end for ok_start, ok_end in supported_spans):
            fragment = suspect.group(0)
            raise BalanceValidationError(
                f"{question_id or '<unknown>'}: unsupported position reference {fragment!r}"
            )

    def replace(match):
        prefix_token = match.group("prefix_token")
        if prefix_token:
            new_index = old_to_new[_TOKEN_TO_INDEX[prefix_token]]
            return (
                f"{match.group('prefix')}{match.group('prefix_open') or ''}"
                f"{_render_position_token(prefix_token, new_index)}"
                f"{match.group('prefix_close') or ''}"
            )

        ordinal_token = match.group("ordinal_token")
        if ordinal_token:
            new_index = old_to_new[_TOKEN_TO_INDEX[ordinal_token]]
            rewritten = _render_position_token(ordinal_token, new_index)
            return (
                f"第{rewritten}{match.group('ordinal_middle') or ''}"
                f"{match.group('ordinal_suffix')}"
            )

        suffix_token = match.group("suffix_token")
        new_index = old_to_new[_TOKEN_TO_INDEX[suffix_token]]
        rewritten = _render_position_token(suffix_token, new_index)
        return f"{rewritten}{match.group('suffix_space')}{match.group('suffix_word')}"

    return _POSITION_REFERENCE.sub(replace, explanation)


def place(q, target):
    """把正确项移到 target 位，其余干扰项确定性打散。"""
    old_choices = list(q["choices"])
    if (
        len(old_choices) != 4
        or not all(isinstance(choice, str) for choice in old_choices)
        or len(set(old_choices)) != 4
        or type(q.get("answerIndex")) is not int
        or not 0 <= q["answerIndex"] <= 3
    ):
        raise BalanceValidationError(f"{q.get('id', '<unknown>')}: invalid choice schema")
    correct = old_choices[q["answerIndex"]]
    # Always start from a content-canonical order.  Shuffling the current order
    # reapplies the same permutation on every run and therefore is not
    # idempotent, even when the RNG seed itself is deterministic.
    others = sorted(c for j, c in enumerate(q["choices"]) if j != q["answerIndex"])
    rng = random.Random("machi-jlpt-v1:" + q["id"])
    rng.shuffle(others)
    new_choices = others[:target] + [correct] + others[target:]
    assert len(new_choices) == 4 and new_choices[target] == correct, q["id"]
    old_to_new = {old_index: new_choices.index(choice) for old_index, choice in enumerate(old_choices)}
    q["explanation"] = remap_explanation_positions(
        q.get("explanation"), old_to_new, question_id=str(q.get("id") or "")
    )
    q["choices"] = new_choices
    q["answerIndex"] = target


def main(path):
    with open(path, encoding="utf-8") as bank_file:
        bank = json.load(bank_file)
    qs = bank["questions"]
    by_id = {q["id"]: q for q in qs}

    done = set()
    # 1) 卷内：每张卷的每个科目切片各自轮转。
    for lvl, p in sorted(bank["papers"].items()):
        per_section = defaultdict(int)
        for qid in p["questionIds"]:
            q = by_id[qid]
            sec = q["section"]
            place(q, per_section[sec] % 4)
            per_section[sec] += 1
            done.add(qid)

    # 2) 卷外题（练习池）：按 (level, section) 轮转。
    rest = defaultdict(list)
    for q in qs:
        if q["id"] not in done:
            rest[(q["level"], q["section"])].append(q)
    for key, items in sorted(rest.items()):
        items.sort(key=lambda q: q["id"])
        for i, q in enumerate(items):
            place(q, i % 4)

    print("全库答案位置分布:", dict(sorted(Counter(q["answerIndex"] for q in qs).items())))
    print("\n各卷「全选同一项」的原始得分（应 ≈25%）:")
    worst = 0.0
    for lvl, p in sorted(bank["papers"].items()):
        ids = p["questionIds"]
        n = len(ids)
        if n == 0:
            print(f"  {lvl}: (no questions)")
            continue
        row = []
        for pick in range(4):
            hit = sum(1 for i in ids if by_id[i]["answerIndex"] == pick)
            row.append(f"第{pick+1}项 {hit}/{n}={hit/n*100:.1f}%")
            worst = max(worst, hit / n)
        print(f"  {lvl}: " + "  ".join(row))
    print(f"\n最坏情况蒙题命中率: {worst*100:.1f}%")

    bank["version"] = 2
    bank["note"] = (
        "原创 JLPT 风格模拟题，多模型生成 + 双盲对抗校验；正确项位置按卷内科目均衡重排；非官方真题。"
    )
    dump_json_atomic(path, bank, ensure_ascii=False, indent=1)
    print("已写回", path, "version=2")


if __name__ == "__main__":
    main(sys.argv[1])
