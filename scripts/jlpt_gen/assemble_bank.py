#!/usr/bin/env python3
"""Assemble the verified JLPT question pool (workflow output) into
web/data/jlpt_bank_v1.json: stable ids + fixed full-length papers per level.

Usage: python3 assemble_bank.py <workflow_output_json> <out_path>
"""
import json
import sys
from collections import defaultdict

# 整卷构成（qtype -> 题数）与时长（秒）。参照 2020 改订后官方结构裁剪。
PAPER = {
    "N5": {"kanji_reading": 7, "orthography": 5, "context": 6, "paraphrase": 3,
            "grammar_form": 9, "sentence_assembly": 4, "text_grammar": 4,
            "reading_short": 3, "reading_mid": 2, "reading_info": 1},
    "N4": {"kanji_reading": 7, "orthography": 5, "context": 7, "paraphrase": 3, "usage": 3,
            "grammar_form": 12, "sentence_assembly": 4, "text_grammar": 3,
            "reading_short": 3, "reading_mid": 4, "reading_info": 1},
    "N3": {"kanji_reading": 8, "orthography": 6, "context": 10, "paraphrase": 3, "usage": 3,
            "grammar_form": 12, "sentence_assembly": 4, "text_grammar": 4,
            "reading_short": 4, "reading_mid": 6, "reading_long": 3, "reading_info": 1},
    "N2": {"kanji_reading": 5, "orthography": 5, "context": 8, "paraphrase": 4, "usage": 4,
            "grammar_form": 12, "sentence_assembly": 4, "text_grammar": 4,
            "reading_short": 5, "reading_mid": 6, "reading_long": 4, "reading_info": 2},
    "N1": {"kanji_reading": 6, "context": 7, "paraphrase": 6, "usage": 6,
            "grammar_form": 10, "sentence_assembly": 5, "text_grammar": 5,
            "reading_short": 4, "reading_mid": 8, "reading_long": 4, "reading_info": 2},
}
DURATION = {"N5": 3600, "N4": 4800, "N3": 6000, "N2": 6300, "N1": 6600}
# 卷内题型顺序（vocab → grammar → reading，与真实试卷一致）
QTYPE_ORDER = ["kanji_reading", "orthography", "context", "paraphrase", "usage",
               "grammar_form", "sentence_assembly", "text_grammar",
               "reading_short", "reading_mid", "reading_long", "reading_info"]
GROUPED = {"text_grammar", "reading_mid", "reading_long", "reading_info", "reading_short"}
ABBREV = {"kanji_reading": "kr", "orthography": "or", "context": "cx", "paraphrase": "pp",
          "usage": "us", "grammar_form": "gf", "sentence_assembly": "sa", "text_grammar": "tg",
          "reading_short": "rs", "reading_mid": "rm", "reading_long": "rl", "reading_info": "ri"}
SECTION_OF = {"kr": "vocab", "or": "vocab", "cx": "vocab", "pp": "vocab", "us": "vocab",
              "gf": "grammar", "sa": "grammar", "tg": "grammar",
              "rs": "reading", "rm": "reading", "rl": "reading", "ri": "reading"}


def norm_stem(s):
    return "".join(str(s or "").split())


def main(src, out):
    with open(src, encoding="utf-8") as source_file:
        raw = json.load(source_file)
    root = raw.get("result", raw) if isinstance(raw, dict) else raw
    pool = root.get("pool") if isinstance(root, dict) else None
    assert isinstance(pool, list) and pool, "no pool in workflow output"

    # sanity + dedupe
    seen = set()
    clean = []
    for q in pool:
        if not isinstance(q, dict):
            continue
        lvl = str(q.get("level") or "").upper()
        qt = str(q.get("qtype") or "")
        if lvl not in PAPER or qt not in ABBREV:
            continue
        ch = q.get("choices")
        ai = q.get("answerIndex")
        if not (isinstance(ch, list) and len(ch) == 4 and isinstance(ai, int) and 0 <= ai <= 3):
            continue
        if not str(q.get("stem") or "").strip():
            continue
        key = (lvl, qt, norm_stem(q["stem"]))
        if qt in GROUPED:
            # Grouped question stems intentionally repeat across passages
            # (for example every article has a "（１）..." question).  The
            # passage is therefore part of the question's content identity.
            key += (norm_stem(q.get("passage")),)
        if key in seen:
            continue
        seen.add(key)
        clean.append(q)

    # assign stable ids per (level, qtype) in input order
    counters = defaultdict(int)
    by_level_qtype = defaultdict(list)
    questions_out = []
    for q in clean:
        lvl = q["level"].upper()
        ab = ABBREV[q["qtype"]]
        counters[(lvl, ab)] += 1
        qid = f"mockv1-{lvl.lower()}-{ab}-{counters[(lvl, ab)]:03d}"
        group = str(q.get("group") or "").strip()
        tags = f"mockv1,qtype:{q['qtype']}" + (f",pg:{lvl.lower()}-{group}" if group else "")
        item = {
            "id": qid,
            "level": lvl,
            "section": SECTION_OF[ab],
            "qtype": q["qtype"],
            "stem": str(q["stem"]).strip(),
            "passage": str(q.get("passage") or "").strip(),
            "group": group,
            "choices": [str(c).strip() for c in q["choices"]],
            "answerIndex": int(q["answerIndex"]),
            "explanation": str(q.get("explanation") or "").strip(),
            "difficulty": max(1, min(5, int(q.get("difficulty") or 3))),
            "tags": tags,
        }
        questions_out.append(item)
        by_level_qtype[(lvl, q["qtype"])].append(item)

    # compose papers
    papers = {}
    report = []
    for lvl, spec in PAPER.items():
        ids = []
        for qt in QTYPE_ORDER:
            want = spec.get(qt) or 0
            if want <= 0:
                continue
            avail = by_level_qtype.get((lvl, qt), [])
            picked = []
            if qt in GROUPED:
                # whole passage groups stay adjacent; greedy fill toward target
                groups = defaultdict(list)
                for it in avail:
                    groups[it["group"] or it["id"]].append(it)
                glist = sorted(groups.values(), key=lambda g: (-len(g), g[0]["id"]))
                for g in glist:
                    if len(picked) >= want:
                        break
                    if len(picked) + len(g) <= want or len(picked) == 0:
                        picked.extend(g)
            else:
                # prefer standard difficulty 3 first, then 2/4, then extremes
                ranked = sorted(avail, key=lambda it: (abs(it["difficulty"] - 3), it["id"]))
                picked = ranked[:want]
            ids.extend(it["id"] for it in picked)
            report.append((lvl, qt, want, len(picked), len(avail)))
        papers[lvl] = {
            "title": f"JLPT {lvl} 全真模拟（笔试卷）",
            "durationSeconds": DURATION[lvl],
            "questionIds": ids,
        }

    bank = {
        "version": 1,
        "source": "mockv1",
        "note": "原创 JLPT 风格模拟题，多模型生成 + 双盲对抗校验；非官方真题。",
        "questions": questions_out,
        "papers": papers,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=1)

    print(f"questions: {len(questions_out)}")
    for lvl in PAPER:
        total = len(papers[lvl]["questionIds"])
        print(f"{lvl}: paper {total} questions, {DURATION[lvl]//60} min")
    print("\nshortfalls (want vs picked vs avail):")
    ok = True
    for lvl, qt, want, got, avail in report:
        if got < want:
            ok = False
            print(f"  {lvl} {qt}: want {want} got {got} (avail {avail})")
    if ok:
        print("  (none)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
