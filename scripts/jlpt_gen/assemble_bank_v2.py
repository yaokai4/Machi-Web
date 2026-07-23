#!/usr/bin/env python3
"""Compose runtime paper manifests from a *published* jlptv2 question bank.

`jlpt_pipeline_v2.py publish` writes a signed target containing `questions[]`
only — it deliberately knows nothing about exam composition. This tool is the
missing link between that trusted artifact and the runtime: it reads a published
target, composes as many complete official-shape papers per level as the stock
allows, and emits a bank file that `jlpt_seed.ensure_jlpt_bank_v2` can install.

Design rules (deliberately different from the legacy ``assemble_bank.py``):

* **Never invents or edits content.** It only selects and orders questions that
  the trust pipeline already approved. Any question it cannot place stays in the
  bank as practice stock.
* **Multiple papers per level.** The legacy assembler emitted exactly one paper
  per level. Here `papers[level]` is a *list*, so a level with enough stock
  yields several non-overlapping full papers plus a large practice pool.
* **Atomic groups stay whole.** A reading/text-grammar passage's questions are
  placed together into the same paper or not at all.
* **Fail closed.** Composition problems raise with a machine-readable report
  instead of silently shipping a short paper.

Usage::

    python3 scripts/jlpt_gen/assemble_bank_v2.py \
        data/jlpt_v2_release/published.json data/jlpt_bank_v2.json \
        [--max-papers-per-level 5] [--report report.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atomic_json import dump_json_atomic  # noqa: E402
from jlpt_contract_v2 import (  # noqa: E402
    contract_sha256,
    load_contract,
    paper_spec,
    qtype_abbreviations,
    qtype_sections,
    section_durations,
)


class PaperCompositionError(RuntimeError):
    """Raised with a machine-readable report when composition cannot proceed."""

    def __init__(self, report: dict[str, Any]):
        super().__init__(report.get("message") or "paper composition failed")
        self.report = report


def _issue(code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"code": code, "message": message, **extra}


def paper_section_name(level: str, question_section: str) -> str:
    """Runtime manifest section that a question's canonical section belongs to.

    N1/N2 sit a single combined written section; N3-N5 split vocabulary away
    from grammar/reading. Listening is always its own timed section.
    """
    if question_section == "listening":
        return "listening"
    if level in ("N1", "N2"):
        return "written"
    if question_section == "vocab":
        return "vocab"
    return "grammar_reading"


def _load_published(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise PaperCompositionError(
            _issue("source_unreadable", f"cannot read published bank: {error}")
        ) from error
    except json.JSONDecodeError as error:
        raise PaperCompositionError(
            _issue("source_invalid", f"published bank is not valid JSON: {error}")
        ) from error
    if not isinstance(payload, dict):
        raise PaperCompositionError(
            _issue("source_invalid", "published bank root must be an object")
        )
    if payload.get("source") != "jlptv2":
        raise PaperCompositionError(
            _issue(
                "source_invalid",
                "refusing to compose from a bank that is not source=jlptv2",
                observed=payload.get("source"),
            )
        )
    expected_contract = contract_sha256()
    if payload.get("contractSha256") != expected_contract:
        raise PaperCompositionError(
            _issue(
                "contract_drift",
                "published bank was produced under a different contract",
                expected=expected_contract,
                observed=payload.get("contractSha256"),
            )
        )
    questions = payload.get("questions")
    if not isinstance(questions, list) or not questions:
        raise PaperCompositionError(
            _issue("source_empty", "published bank contains no questions")
        )
    return questions


def _group_key(question: dict[str, Any]) -> str:
    """Questions sharing a passage must travel together."""
    return str(question.get("groupId") or question["id"])


def _compose_level(
    level: str,
    questions: list[dict[str, Any]],
    *,
    max_papers: int,
) -> tuple[list[dict[str, Any]], list[str], list[dict[str, Any]]]:
    """Return (papers, leftover practice ids, issues) for one level."""
    contract = load_contract()
    spec = paper_spec().get(level)
    if not spec:
        return [], [question["id"] for question in questions], []
    sections_of = qtype_sections()
    durations = section_durations()[level]
    modes = {qtype: meta["groupMode"] for qtype, meta in contract["qtypes"].items()}

    # Bucket by qtype, keeping atomic groups intact.
    units_by_qtype: dict[str, list[list[dict[str, Any]]]] = defaultdict(list)
    for qtype in spec:
        pool = [question for question in questions if question.get("qtype") == qtype]
        if modes.get(qtype) == "atomic":
            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for question in pool:
                grouped[_group_key(question)].append(question)
            # Deterministic order: by group id, questions inside by id.
            units_by_qtype[qtype] = [
                sorted(members, key=lambda item: item["id"])
                for _, members in sorted(grouped.items())
            ]
        else:
            units_by_qtype[qtype] = [[question] for question in sorted(pool, key=lambda item: item["id"])]

    papers: list[dict[str, Any]] = []
    used: set[str] = set()
    issues: list[dict[str, Any]] = []

    for index in range(max_papers):
        picked_by_qtype: dict[str, list[dict[str, Any]]] = {}
        complete = True
        for qtype, target in spec.items():
            chosen: list[dict[str, Any]] = []
            for unit in units_by_qtype[qtype]:
                if len(chosen) >= target:
                    break
                if any(member["id"] in used for member in unit):
                    continue
                if len(chosen) + len(unit) > target:
                    continue  # an atomic group that would overflow this paper
                chosen.extend(unit)
            if len(chosen) != target:
                complete = False
                if index == 0:
                    issues.append(
                        _issue(
                            "paper_shortfall",
                            f"{level} cannot fill a first complete paper",
                            level=level,
                            qtype=qtype,
                            target=target,
                            available=len(chosen),
                        )
                    )
                break
            picked_by_qtype[qtype] = chosen
        if not complete:
            break

        section_ids: dict[str, list[str]] = defaultdict(list)
        ordered_ids: list[str] = []
        for qtype in spec:
            for question in picked_by_qtype[qtype]:
                used.add(question["id"])
                name = paper_section_name(level, sections_of[qtype])
                section_ids[name].append(question["id"])
        for name in durations:
            ordered_ids.extend(section_ids.get(name, []))

        papers.append(
            {
                "id": f"jlptv2-{level.lower()}-p{index + 1}",
                "kind": "full-paper",
                "manifestVersion": 2,
                "title": f"JLPT {level} 全真模拟 第{index + 1}套",
                "durationSeconds": sum(durations.values()),
                "questionIds": ordered_ids,
                "sections": [
                    {
                        "section": name,
                        "title": _section_title(name),
                        "durationSeconds": duration,
                        "questionIds": section_ids.get(name, []),
                    }
                    for name, duration in durations.items()
                ],
            }
        )

    leftover = [question["id"] for question in questions if question["id"] not in used]
    return papers, leftover, issues


_SECTION_TITLES = {
    "written": "言語知識・読解",
    "vocab": "言語知識（文字・語彙）",
    "grammar_reading": "言語知識（文法）・読解",
    "listening": "聴解",
}


def _section_title(name: str) -> str:
    return _SECTION_TITLES[name]


def compose(source: Path, output: Path, *, max_papers: int) -> dict[str, Any]:
    questions = _load_published(source)
    abbreviations = qtype_abbreviations()
    sections_of = qtype_sections()

    by_level: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bank_questions: list[dict[str, Any]] = []
    for question in questions:
        level = str(question.get("level") or "")
        qtype = str(question.get("qtype") or "")
        if qtype not in abbreviations:
            raise PaperCompositionError(
                _issue("qtype_unknown", f"question {question.get('id')} has unknown qtype {qtype!r}")
            )
        by_level[level].append(question)
        group = str(question.get("group") or "")
        tags = f"jlptv2,qtype:{qtype}" + (f",pg:{level.lower()}-{group}" if group else "")
        bank_questions.append(
            {
                "id": question["id"],
                "level": level,
                "section": sections_of[qtype],
                "qtype": qtype,
                "stem": question.get("stem") or "",
                "passage": question.get("passage") or "",
                "group": group,
                "choices": question.get("choices") or [],
                "answerIndex": question.get("answerIndex"),
                # Structured four-part explanation travels through verbatim;
                # server_jlpt stores it as JSON and renders a flat fallback.
                "explanation": question.get("explanation"),
                "difficulty": question.get("difficulty") or 3,
                "tags": tags,
                "contentHash": question.get("contentHash") or "",
            }
        )

    papers: dict[str, list[dict[str, Any]]] = {}
    practice: dict[str, list[str]] = {}
    all_issues: list[dict[str, Any]] = []
    for level in sorted(by_level):
        level_papers, leftover, issues = _compose_level(
            level, by_level[level], max_papers=max_papers
        )
        all_issues.extend(issues)
        if level_papers:
            papers[level] = level_papers
        if leftover:
            practice[level] = leftover

    if all_issues:
        raise PaperCompositionError(
            {
                "code": "composition_failed",
                "message": "one or more levels cannot compose a complete paper",
                "source": str(source),
                "output": str(output),
                "issues": all_issues,
            }
        )

    bank = {
        "version": 2,
        "source": "jlptv2",
        "contractSha256": contract_sha256(),
        "note": (
            "原创 JLPT 风格模拟题；多模型生成 + 双人独立盲审收据 + 签名发布。"
            "非官方真题，不等同官方成绩。"
        ),
        "questions": bank_questions,
        "papers": papers,
        "practicePool": practice,
    }
    dump_json_atomic(str(output), bank, ensure_ascii=False, indent=1)

    summary = {
        "status": "ok",
        "source": str(source),
        "output": str(output),
        "questionCount": len(bank_questions),
        "papersByLevel": {level: len(items) for level, items in papers.items()},
        "practicePoolByLevel": {level: len(ids) for level, ids in practice.items()},
        "issues": [],
    }
    print(f"questions: {len(bank_questions)}")
    for level in sorted(papers):
        count = len(papers[level])
        per = len(papers[level][0]["questionIds"])
        print(f"{level}: {count} paper(s) × {per} questions, practice pool {len(practice.get(level, []))}")
    return summary


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="published jlptv2 bank JSON")
    parser.add_argument("output", help="runtime bank destination")
    parser.add_argument("--max-papers-per-level", type=int, default=5)
    parser.add_argument("--report", default="", help="optional machine-readable report")
    args = parser.parse_args(argv)
    if args.max_papers_per_level < 1:
        print("--max-papers-per-level must be >= 1", file=sys.stderr)
        return 2
    try:
        summary = compose(
            Path(args.source), Path(args.output), max_papers=args.max_papers_per_level
        )
    except PaperCompositionError as error:
        if args.report:
            dump_json_atomic(args.report, error.report, ensure_ascii=False, indent=1)
        print(json.dumps(error.report, ensure_ascii=False), file=sys.stderr)
        return 1
    if args.report:
        dump_json_atomic(args.report, summary, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
