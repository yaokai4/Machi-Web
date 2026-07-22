#!/usr/bin/env python3
"""Assemble the verified JLPT question pool (workflow output) into
web/data/jlpt_bank_v1.json: stable ids + fixed full-length papers per level.

Usage: python3 assemble_bank.py <workflow_output_json> <out_path> [--report report.json]
"""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from atomic_json import dump_json_atomic
from jlpt_contract_v2 import (
    load_contract,
    paper_spec,
    qtype_abbreviations,
    section_durations,
)

# 整卷构成（qtype -> 题数）与时长（秒）。题型/近似题数依据 JLPT Executive
# Summary p.7；N1 听力以 2022-12 官方修订覆盖。时长依据当前官方网页：
# https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf
# https://www.jlpt.jp/e/topics/202208051659677223.html
# https://www.jlpt.jp/e/guideline/testsections.html
# Python and JavaScript consume one authoritative JSON snapshot; neither owns a
# second editable paper table.
CONTRACT = load_contract()
PAPER = paper_spec()
SECTION_DURATION = section_durations()
SECTION_TITLE = {
    section["name"]: section["title"]
    for layout in CONTRACT["sectionLayouts"].values()
    for section in layout
}
DURATION = {
    level: sum(section_durations.values())
    for level, section_durations in SECTION_DURATION.items()
}
# 卷内题型顺序（vocab → grammar → reading → listening）
QTYPE_ORDER = list(CONTRACT["qtypes"])
GROUPED = {
    qtype for qtype, spec in CONTRACT["qtypes"].items()
    if spec["groupMode"] == "atomic"
}
LISTENING_QTYPES = {
    qtype for qtype, spec in CONTRACT["qtypes"].items()
    if spec["section"] == "listening"
}
GROUP_MIN_MEMBERS = {
    qtype: spec["minimumGroupMembers"]
    for qtype, spec in CONTRACT["qtypes"].items()
    if spec["groupMode"] == "atomic"
}
ABBREV = qtype_abbreviations()
SECTION_OF = {
    spec["abbreviation"]: spec["section"]
    for spec in CONTRACT["qtypes"].values()
}


def _paper_section_name(level, qtype):
    question_section = SECTION_OF[ABBREV[qtype]]
    if question_section == "listening":
        return "listening"
    if level in ("N1", "N2"):
        return "written"
    if question_section == "vocab":
        return "vocab"
    return "grammar_reading"


def norm_stem(s):
    return "".join(str(s or "").split())


class AssemblyValidationError(ValueError):
    """Fail-closed validation error carrying a machine-readable report."""

    def __init__(self, report):
        self.report = report
        super().__init__(json.dumps(report, ensure_ascii=False, separators=(",", ":")))


def _issue(code, reason, *, level="", qtype="", group="", source_indexes=()):
    indexes = sorted({int(index) for index in source_indexes if index is not None})
    return {
        "code": code,
        "reason": reason,
        "level": level,
        "qtype": qtype,
        "group": group,
        "sourceIndex": indexes[0] if indexes else None,
        "sourceIndexes": indexes,
    }


def _target_state(path):
    target = Path(path)
    if not target.exists():
        return {"exists": False, "bytes": 0, "sha256": None}
    payload = target.read_bytes()
    return {
        "exists": True,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _failure_report(src, out, issues, target_before):
    return {
        "status": "failed",
        "source": str(Path(src)),
        "output": str(Path(out)),
        "targetBefore": target_before,
        "issues": issues,
        "issueCount": len(issues),
    }


def _question_context(question):
    if not isinstance(question, dict):
        return "", "", ""
    raw_level = question.get("level")
    raw_qtype = question.get("qtype")
    raw_group = question.get("group")
    level = raw_level.strip().upper() if isinstance(raw_level, str) else ""
    qtype = raw_qtype.strip() if isinstance(raw_qtype, str) else ""
    group = raw_group.strip() if isinstance(raw_group, str) else ""
    return level, qtype, group


def _validate_question(question, source_index):
    level, qtype, group = _question_context(question)
    issues = []
    if not isinstance(question, dict):
        return None, [
            _issue(
                "question_not_object",
                "question must be a JSON object",
                source_indexes=[source_index],
            )
        ]

    if not isinstance(question.get("level"), str) or level not in PAPER:
        issues.append(
            _issue(
                "level_invalid",
                "level must be one of N1, N2, N3, N4, N5",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )
    if not isinstance(question.get("qtype"), str) or qtype not in ABBREV:
        issues.append(
            _issue(
                "qtype_invalid",
                "qtype is not part of the canonical paper schema",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )
    elif level in PAPER and qtype not in PAPER[level]:
        issues.append(
            _issue(
                "qtype_level_mismatch",
                "qtype is not part of the canonical paper schema for this level",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    expected_section = SECTION_OF.get(ABBREV.get(qtype, ""), "")
    section = question.get("section")
    if not isinstance(section, str) or section.strip() != expected_section:
        issues.append(
            _issue(
                "section_mismatch",
                f"section must match qtype ({expected_section or 'unknown'})",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    stem = question.get("stem")
    if not isinstance(stem, str) or not stem.strip():
        issues.append(
            _issue(
                "stem_required",
                "stem must be a non-empty string",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    choices = question.get("choices")
    if not isinstance(choices, list) or len(choices) != 4:
        issues.append(
            _issue(
                "choices_count_invalid",
                "choices must contain exactly four items",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )
    elif not all(isinstance(choice, str) for choice in choices):
        issues.append(
            _issue(
                "choices_not_strings",
                "all choices must be strings",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )
    else:
        trimmed_choices = [choice.strip() for choice in choices]
        if any(not choice for choice in trimmed_choices):
            issues.append(
                _issue(
                    "choices_blank",
                    "choices must remain non-empty after trimming",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
        elif len(set(trimmed_choices)) != 4:
            issues.append(
                _issue(
                    "choices_not_unique",
                    "choices must be unique after trimming",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )

    answer_index = question.get("answerIndex")
    if type(answer_index) is not int or not 0 <= answer_index <= 3:
        issues.append(
            _issue(
                "answer_index_invalid",
                "answerIndex must be a real integer from 0 through 3",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    explanation = question.get("explanation")
    if not isinstance(explanation, str) or not explanation.strip():
        issues.append(
            _issue(
                "explanation_required",
                "explanation must be a non-empty string",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    difficulty = question.get("difficulty")
    if type(difficulty) is not int or not 1 <= difficulty <= 5:
        issues.append(
            _issue(
                "difficulty_invalid",
                "difficulty must be a real integer from 1 through 5",
                level=level,
                qtype=qtype,
                group=group,
                source_indexes=[source_index],
            )
        )

    raw_group = question.get("group")
    raw_passage = question.get("passage")
    passage = raw_passage.strip() if isinstance(raw_passage, str) else ""
    if qtype in GROUPED:
        if not isinstance(raw_group, str) or not group:
            issues.append(
                _issue(
                    "group_required",
                    "grouped qtype requires a non-empty group",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
        if not isinstance(raw_passage, str) or not passage:
            issues.append(
                _issue(
                    "passage_required",
                    "grouped qtype requires a non-empty passage",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
    elif qtype in LISTENING_QTYPES:
        if not isinstance(raw_group, str) or group:
            issues.append(
                _issue(
                    "unexpected_group",
                    "single-question listening qtype requires group to be an empty string",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
        if not isinstance(raw_passage, str) or not passage:
            issues.append(
                _issue(
                    "passage_required",
                    "listening qtype requires a non-empty script in passage",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
    else:
        if not isinstance(raw_group, str) or group:
            issues.append(
                _issue(
                    "unexpected_group",
                    "non-grouped qtype requires group to be an empty string",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )
        if not isinstance(raw_passage, str) or passage:
            issues.append(
                _issue(
                    "unexpected_passage",
                    "non-grouped qtype requires passage to be an empty string",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=[source_index],
                )
            )

    if issues:
        return None, issues

    normalized = dict(question)
    normalized.update(
        level=level,
        qtype=qtype,
        section=expected_section,
        stem=stem.strip(),
        choices=[choice.strip() for choice in choices],
        answerIndex=answer_index,
        explanation=explanation.strip(),
        difficulty=difficulty,
        group=group,
        passage=passage,
    )
    return normalized, []


def _validate_pool(pool):
    issues = []
    valid_records = []
    grouped_records = defaultdict(list)
    ordinary_records = defaultdict(list)

    for source_index, question in enumerate(pool):
        normalized, member_issues = _validate_question(question, source_index)
        issues.extend(member_issues)
        if normalized is None:
            continue
        record = (source_index, normalized)
        if normalized["qtype"] in GROUPED:
            grouped_records[(normalized["level"], normalized["qtype"], normalized["group"])].append(record)
        else:
            ordinary_records[
                (normalized["level"], normalized["qtype"], norm_stem(normalized["stem"]))
            ].append(record)

    for (level, qtype, _stem), records in ordinary_records.items():
        if len(records) > 1:
            indexes = [index for index, _ in records]
            duplicate_issue = _issue(
                "duplicate_question",
                "ordinary question stem is duplicated within level and qtype",
                level=level,
                qtype=qtype,
                source_indexes=indexes,
            )
            duplicate_issue["sourceIndex"] = indexes[-1]
            issues.append(duplicate_issue)
            continue
        valid_records.extend(records)

    for (level, qtype, group), records in grouped_records.items():
        indexes = [index for index, _ in records]
        minimum = GROUP_MIN_MEMBERS[qtype]
        group_issues = []
        if len(records) < minimum:
            group_issues.append(
                _issue(
                    "group_too_short",
                    f"group requires at least {minimum} member(s)",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=indexes,
                )
            )

        passages = {norm_stem(question["passage"]) for _, question in records}
        if len(passages) != 1:
            group_issues.append(
                _issue(
                    "group_passage_conflict",
                    "all members of one group must share the same passage",
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=indexes,
                )
            )

        by_stem = defaultdict(list)
        for source_index, question in records:
            by_stem[norm_stem(question["stem"])].append((source_index, question))
        for stem_records in by_stem.values():
            if len(stem_records) <= 1:
                continue
            stem_indexes = [index for index, _ in stem_records]
            signatures = {
                (tuple(question["choices"]), question["answerIndex"])
                for _, question in stem_records
            }
            conflict = len(signatures) > 1
            group_issues.append(
                _issue(
                    "group_member_conflict" if conflict else "group_member_duplicate",
                    (
                        "same group, passage and stem disagree on choices or answer"
                        if conflict
                        else "group member is duplicated"
                    ),
                    level=level,
                    qtype=qtype,
                    group=group,
                    source_indexes=stem_indexes,
                )
            )

        issues.extend(group_issues)
        if not group_issues:
            valid_records.extend(records)

    return sorted(valid_records, key=lambda record: record[0]), issues


def _choose_atomic_groups(groups, want):
    states = {0: []}
    for group in groups:
        size = len(group)
        for total, selected in list(states.items()):
            next_total = total + size
            if next_total <= want and next_total not in states:
                states[next_total] = selected + [group]
    return states.get(want)


def main(src, out):
    target_before = _target_state(out)
    with open(src, encoding="utf-8") as source_file:
        raw = json.load(source_file)
    root = raw.get("result", raw) if isinstance(raw, dict) else raw
    pool = root.get("pool") if isinstance(root, dict) else None
    if not isinstance(pool, list) or not pool:
        report = _failure_report(
            src,
            out,
            [
                _issue(
                    "pool_invalid",
                    "workflow output must contain a non-empty pool array",
                )
            ],
            target_before,
        )
        raise AssemblyValidationError(report)

    clean_records, validation_issues = _validate_pool(pool)
    if validation_issues:
        report = _failure_report(src, out, validation_issues, target_before)
        raise AssemblyValidationError(report)

    # assign stable ids per (level, qtype) in input order
    counters = defaultdict(int)
    by_level_qtype = defaultdict(list)
    questions_out = []
    source_index_by_id = {}
    for source_index, q in clean_records:
        lvl = q["level"]
        ab = ABBREV[q["qtype"]]
        counters[(lvl, ab)] += 1
        qid = f"mockv1-{lvl.lower()}-{ab}-{counters[(lvl, ab)]:03d}"
        group = q["group"]
        tags = f"mockv1,qtype:{q['qtype']}" + (f",pg:{lvl.lower()}-{group}" if group else "")
        item = {
            "id": qid,
            "level": lvl,
            "section": q["section"],
            "qtype": q["qtype"],
            "stem": q["stem"],
            "passage": q["passage"],
            "group": group,
            "choices": q["choices"],
            "answerIndex": q["answerIndex"],
            "explanation": q["explanation"],
            "difficulty": q["difficulty"],
            "tags": tags,
        }
        questions_out.append(item)
        by_level_qtype[(lvl, q["qtype"])].append(item)
        source_index_by_id[qid] = source_index

    # Compose every canonical qtype exactly. Extra validated questions remain in
    # the bank as practice inventory, but a paper is never written unless a
    # deterministic whole-group subset can hit the exact target.
    papers = {}
    composition_issues = []
    composition_rows = []
    for lvl, spec in PAPER.items():
        ids = []
        section_question_ids = {
            section_name: [] for section_name in SECTION_DURATION[lvl]
        }
        for qt in QTYPE_ORDER:
            want = spec.get(qt) or 0
            if want <= 0:
                continue
            avail = by_level_qtype.get((lvl, qt), [])
            picked = []
            if qt in GROUPED:
                groups = defaultdict(list)
                for it in avail:
                    groups[it["group"]].append(it)
                grouped_candidates = sorted(groups.values(), key=lambda group: group[0]["id"])
                available_count = sum(len(group) for group in grouped_candidates)
                indexes = [
                    source_index_by_id[item["id"]]
                    for group in grouped_candidates
                    for item in group
                ]
                if available_count < want:
                    composition_issues.append(
                        _issue(
                            "paper_shortfall",
                            f"canonical target is {want}, but only {available_count} grouped questions are available",
                            level=lvl,
                            qtype=qt,
                            source_indexes=indexes,
                        )
                    )
                else:
                    selected_groups = _choose_atomic_groups(grouped_candidates, want)
                    if selected_groups is None:
                        oversized = [group for group in grouped_candidates if len(group) > want]
                        if oversized:
                            first = oversized[0]
                            composition_issues.append(
                                _issue(
                                    "paper_atomic_overfill",
                                    f"group has {len(first)} members and cannot fit canonical target {want}",
                                    level=lvl,
                                    qtype=qt,
                                    group=first[0]["group"],
                                    source_indexes=[source_index_by_id[item["id"]] for item in first],
                                )
                            )
                        else:
                            composition_issues.append(
                                _issue(
                                    "paper_atomic_unfillable",
                                    f"whole groups cannot exactly fill canonical target {want}",
                                    level=lvl,
                                    qtype=qt,
                                    group=",".join(group[0]["group"] for group in grouped_candidates),
                                    source_indexes=indexes,
                                )
                            )
                    else:
                        picked = [item for group in selected_groups for item in group]
            else:
                if len(avail) < want:
                    composition_issues.append(
                        _issue(
                            "paper_shortfall",
                            f"canonical target is {want}, but only {len(avail)} questions are available",
                            level=lvl,
                            qtype=qt,
                            source_indexes=[source_index_by_id[item["id"]] for item in avail],
                        )
                    )
                else:
                    ranked = sorted(avail, key=lambda it: (abs(it["difficulty"] - 3), it["id"]))
                    picked = ranked[:want]
            picked_ids = [it["id"] for it in picked]
            ids.extend(picked_ids)
            section_name = _paper_section_name(lvl, qt)
            section_question_ids[section_name].extend(picked_ids)
            composition_rows.append(
                {
                    "level": lvl,
                    "qtype": qt,
                    "target": want,
                    "picked": len(picked),
                    "available": len(avail),
                }
            )
        papers[lvl] = {
            "kind": "full-paper",
            "manifestVersion": 2,
            "title": f"JLPT {lvl} 全真模拟（完整卷）",
            "durationSeconds": DURATION[lvl],
            "questionIds": ids,
            "sections": [
                {
                    "section": section_name,
                    "title": SECTION_TITLE[section_name],
                    "durationSeconds": duration,
                    "questionIds": section_question_ids[section_name],
                }
                for section_name, duration in SECTION_DURATION[lvl].items()
            ],
        }

    if composition_issues:
        report = _failure_report(src, out, composition_issues, target_before)
        report["paperComposition"] = composition_rows
        raise AssemblyValidationError(report)

    bank = {
        "version": 1,
        "source": "mockv1",
        "note": "原创 JLPT 风格模拟题，多模型生成 + 双盲对抗校验；非官方真题。",
        "questions": questions_out,
        "papers": papers,
    }
    dump_json_atomic(out, bank, ensure_ascii=False, indent=1)

    print(f"questions: {len(questions_out)}")
    for lvl in PAPER:
        total = len(papers[lvl]["questionIds"])
        print(f"{lvl}: paper {total} questions, {DURATION[lvl]//60} min")
    print("\ncanonical paper validation: exact")
    return {
        "status": "ok",
        "source": str(Path(src)),
        "output": str(Path(out)),
        "questionCount": len(questions_out),
        "paperComposition": composition_rows,
        "issues": [],
    }


def cli(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="workflow output JSON")
    parser.add_argument("output", help="bank JSON destination")
    parser.add_argument("--report", default="", help="optional machine-readable validation report")
    args = parser.parse_args(argv)

    if args.report and Path(args.report).resolve() == Path(args.output).resolve():
        parser.error("--report must not be the same path as output")

    try:
        report = main(args.source, args.output)
    except AssemblyValidationError as error:
        report = error.report
        if args.report:
            dump_json_atomic(args.report, report, ensure_ascii=False, indent=2)
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2

    if args.report:
        dump_json_atomic(args.report, report, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
