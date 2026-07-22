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
import sys
from collections import Counter, defaultdict


def place(q, target):
    """把正确项移到 target 位，其余干扰项确定性打散。"""
    correct = q["choices"][q["answerIndex"]]
    # Always start from a content-canonical order.  Shuffling the current order
    # reapplies the same permutation on every run and therefore is not
    # idempotent, even when the RNG seed itself is deterministic.
    others = sorted(c for j, c in enumerate(q["choices"]) if j != q["answerIndex"])
    rng = random.Random("machi-jlpt-v1:" + q["id"])
    rng.shuffle(others)
    new_choices = others[:target] + [correct] + others[target:]
    assert len(new_choices) == 4 and new_choices[target] == correct, q["id"]
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
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=1)
    print("已写回", path, "version=2")


if __name__ == "__main__":
    main(sys.argv[1])
