#!/usr/bin/env python3
"""Regression tests for the deterministic JLPT bank assembly tools."""

from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import types
import unittest
from collections import defaultdict
from pathlib import Path
from unittest import mock


JLPT_GEN_DIR = Path(__file__).resolve().parent / "jlpt_gen"
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(JLPT_GEN_DIR))
sys.path.insert(0, str(REPO_ROOT))

import assemble_bank  # noqa: E402
import balance_answers  # noqa: E402
import jlpt_seed  # noqa: E402
import server_jlpt as runtime_jlpt  # noqa: E402


EXPECTED_PAPER = {
    "N1": {
        "kanji_reading": 6,
        "context": 7,
        "paraphrase": 6,
        "usage": 6,
        "grammar_form": 10,
        "sentence_assembly": 5,
        "text_grammar": 5,
        "reading_short": 4,
        "reading_mid": 9,
        "reading_long": 4,
        "reading_info": 2,
        "listen_task": 6,
        "listen_point": 6,
        "listen_gist": 5,
        "listen_response": 11,
        "listen_integrated": 3,
    },
    "N2": {
        "kanji_reading": 5,
        "orthography": 5,
        "context": 7,
        "paraphrase": 5,
        "usage": 5,
        "grammar_form": 12,
        "sentence_assembly": 5,
        "text_grammar": 5,
        "reading_short": 5,
        "reading_mid": 9,
        "reading_long": 4,
        "reading_info": 2,
        "listen_task": 5,
        "listen_point": 6,
        "listen_gist": 5,
        "listen_response": 11,
        "listen_integrated": 4,
    },
    "N3": {
        "kanji_reading": 8,
        "orthography": 6,
        "context": 11,
        "paraphrase": 5,
        "usage": 5,
        "grammar_form": 13,
        "sentence_assembly": 5,
        "text_grammar": 5,
        "reading_short": 4,
        "reading_mid": 6,
        "reading_long": 4,
        "reading_info": 2,
        "listen_task": 6,
        "listen_point": 6,
        "listen_gist": 3,
        "listen_response": 4,
    },
    "N4": {
        "kanji_reading": 7,
        "orthography": 5,
        "context": 8,
        "paraphrase": 4,
        "usage": 4,
        "grammar_form": 13,
        "sentence_assembly": 4,
        "text_grammar": 4,
        "reading_short": 4,
        "reading_mid": 4,
        "reading_info": 2,
        "listen_task": 6,
        "listen_point": 6,
        "listen_gist": 3,
        "listen_response": 4,
    },
    "N5": {
        "kanji_reading": 7,
        "orthography": 5,
        "context": 6,
        "paraphrase": 3,
        "grammar_form": 9,
        "sentence_assembly": 4,
        "text_grammar": 4,
        "reading_short": 3,
        "reading_mid": 2,
        "reading_info": 1,
        "listen_task": 5,
        "listen_point": 5,
        "listen_gist": 2,
        "listen_response": 4,
    },
}
EXPECTED_SECTION_DURATION = {
    "N1": {"written": 110 * 60, "listening": 55 * 60},
    "N2": {"written": 105 * 60, "listening": 50 * 60},
    "N3": {"vocabulary": 30 * 60, "grammar_reading": 70 * 60, "listening": 40 * 60},
    "N4": {"vocabulary": 25 * 60, "grammar_reading": 55 * 60, "listening": 35 * 60},
    "N5": {"vocabulary": 20 * 60, "grammar_reading": 40 * 60, "listening": 30 * 60},
}


def _text_grammar_question(
    *, passage: str, group: str, blank: int = 1, choices: list[str] | None = None
) -> dict[str, object]:
    return {
        "level": "N1",
        "qtype": "text_grammar",
        "section": "grammar",
        "stem": f"（{blank}）に入れるのに最もよいものはどれか。",
        "passage": passage,
        "group": group,
        "choices": choices or ["ところで", "それでも", "つまり", "たとえば"],
        "answerIndex": 0,
        "explanation": "文章の流れに合う接続表現を選ぶ。",
        "difficulty": 3,
    }


def _text_grammar_group(*, passage: str, group: str) -> list[dict[str, object]]:
    return [
        _text_grammar_question(passage=passage, group=group, blank=1),
        _text_grammar_question(
            passage=passage,
            group=group,
            blank=2,
            choices=["しかし", "そこで", "しかも", "なお"],
        ),
    ]


def _assemble_pool(pool: list[dict[str, object]]) -> dict[str, object]:
    paper: dict[str, dict[str, int]] = defaultdict(dict)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for question in pool:
        if not isinstance(question, dict):
            continue
        level = str(question.get("level") or "").upper()
        qtype = str(question.get("qtype") or "")
        if level in assemble_bank.PAPER and qtype in assemble_bank.ABBREV:
            counts[(level, qtype)] += 1
    for (level, qtype), count in counts.items():
        paper[level][qtype] = count

    with tempfile.TemporaryDirectory() as tmp:
        source_path = Path(tmp) / "source.json"
        output_path = Path(tmp) / "bank.json"
        source_path.write_text(
            json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
        )
        try:
            with mock.patch.object(assemble_bank, "PAPER", dict(paper)):
                with contextlib.redirect_stdout(io.StringIO()):
                    assemble_bank.main(str(source_path), str(output_path))
        except Exception as error:
            if type(error).__name__ != "AssemblyValidationError":
                raise
            return {"questions": [], "_report": getattr(error, "report", {})}
        return json.loads(output_path.read_text(encoding="utf-8"))


def _canonical_pool() -> list[dict[str, object]]:
    """Build one exact, schema-valid canonical paper for every JLPT level."""
    pool: list[dict[str, object]] = []
    for level, spec in assemble_bank.PAPER.items():
        for qtype in assemble_bank.QTYPE_ORDER:
            want = int(spec.get(qtype) or 0)
            if want <= 0:
                continue
            abbreviation = assemble_bank.ABBREV[qtype]
            section = assemble_bank.SECTION_OF[abbreviation]
            grouped = qtype in assemble_bank.GROUPED
            group = f"{level.lower()}-{qtype}-canonical" if grouped else ""
            passage = (
                f"{level} {qtype} canonical passage"
                if grouped or section == "listening"
                else ""
            )
            for index in range(want):
                identity = f"{level}-{qtype}-{index + 1}"
                pool.append(
                    {
                        "level": level,
                        "qtype": qtype,
                        "section": section,
                        "stem": f"{identity} stem",
                        "passage": passage,
                        "group": group,
                        "choices": [
                            f"{identity} choice A",
                            f"{identity} choice B",
                            f"{identity} choice C",
                            f"{identity} choice D",
                        ],
                        "answerIndex": index % 4,
                        "explanation": f"{identity} detailed explanation",
                        "difficulty": 3,
                    }
                )
    return pool


def _run_assembly_failure(
    testcase: unittest.TestCase,
    pool: list[dict[str, object]],
) -> dict[str, object]:
    """Run strict assembly and prove the pre-existing target is byte-identical."""
    with tempfile.TemporaryDirectory() as tmp:
        source_path = Path(tmp) / "source.json"
        output_path = Path(tmp) / "bank.json"
        original = b"pre-existing-bank-bytes-must-survive"
        source_path.write_text(
            json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
        )
        output_path.write_bytes(original)
        before_sha = hashlib.sha256(original).hexdigest()
        error: Exception | None = None
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                assemble_bank.main(str(source_path), str(output_path))
        except Exception as caught:
            error = caught

        after = output_path.read_bytes()
        testcase.assertEqual(original, after, "failed assembly replaced the existing bank")
        testcase.assertEqual(before_sha, hashlib.sha256(after).hexdigest())
        testcase.assertIsNotNone(error, "strict assembly must reject invalid input")
        testcase.assertEqual("AssemblyValidationError", type(error).__name__)
        report = getattr(error, "report", None)
        testcase.assertIsInstance(report, dict)
        testcase.assertEqual("failed", report.get("status"))
        testcase.assertTrue(report.get("issues"), report)
        return report


def _balance_bank(*, explanation: str = "") -> dict[str, object]:
    return {
        "version": 1,
        "source": "fixture",
        "note": "fixture",
        "questions": [
            {
                "id": "q-1",
                "level": "N1",
                "section": "vocab",
                "choices": ["正解", "誤答A", "誤答B", "誤答C"],
                "answerIndex": 0,
                "explanation": explanation,
            }
        ],
        "papers": {"N1": {"questionIds": ["q-1"]}},
    }


class AssembleBankTests(unittest.TestCase):
    def test_python_paper_spec_matches_generator_contract(self) -> None:
        self.assertEqual(EXPECTED_PAPER, assemble_bank.PAPER)
        listening_qtypes = {
            "listen_task",
            "listen_point",
            "listen_gist",
            "listen_response",
            "listen_integrated",
        }
        for qtype in listening_qtypes:
            self.assertIn(qtype, assemble_bank.QTYPE_ORDER)
            self.assertEqual(
                "listening", assemble_bank.SECTION_OF[assemble_bank.ABBREV[qtype]]
            )

    def test_grouped_questions_with_same_stem_in_distinct_passages_are_preserved(self) -> None:
        bank = _assemble_pool(
            _text_grammar_group(passage="最初の記事。（１）（２）続き。", group="article-a")
            + _text_grammar_group(passage="別の記事。（１）（２）続き。", group="article-b")
        )

        self.assertEqual(4, len(bank["questions"]))
        self.assertEqual(
            {"最初の記事。（１）（２）続き。", "別の記事。（１）（２）続き。"},
            {question["passage"] for question in bank["questions"]},
        )

    def test_grouped_questions_require_at_least_two_members(self) -> None:
        bank = _assemble_pool(
            [_text_grammar_question(passage="一問だけの記事。", group="article-single")]
        )

        self.assertEqual([], bank["questions"])

    def test_one_invalid_member_rejects_the_entire_group(self) -> None:
        group = _text_grammar_group(passage="一題が壊れた記事。", group="article-invalid")
        group[1]["choices"] = ["三", "択", "だけ"]

        bank = _assemble_pool(group)

        self.assertEqual([], bank["questions"])

    def test_missing_passage_rejects_the_entire_group(self) -> None:
        group = _text_grammar_group(passage="本文あり。", group="article-no-passage")
        group[1]["passage"] = ""

        bank = _assemble_pool(group)

        self.assertEqual([], bank["questions"])

    def test_empty_group_is_rejected(self) -> None:
        bank = _assemble_pool(_text_grammar_group(passage="group がない記事。", group=""))

        self.assertEqual([], bank["questions"])

    def test_same_passage_in_distinct_groups_does_not_collide(self) -> None:
        passage = "同じ本文を別の原子グループとして扱う。（１）（２）"
        bank = _assemble_pool(
            _text_grammar_group(passage=passage, group="article-a")
            + _text_grammar_group(passage=passage, group="article-b")
        )

        self.assertEqual(4, len(bank["questions"]))
        self.assertEqual(
            {"article-a", "article-b"},
            {question["group"] for question in bank["questions"]},
        )

    def test_exact_duplicate_group_is_rejected_atomically(self) -> None:
        group = _text_grammar_group(passage="重複した記事。（１）（２）", group="duplicate")
        duplicate = [dict(question) for question in group]

        bank = _assemble_pool(group + duplicate)

        self.assertEqual([], bank["questions"])

    def test_mixed_passages_under_one_group_are_rejected_atomically(self) -> None:
        group = _text_grammar_group(passage="最初の本文。", group="mixed-passage")
        group[1]["passage"] = "別の本文。"

        bank = _assemble_pool(group)

        self.assertEqual([], bank["questions"])

    def test_tracked_n1_pool_preserves_every_text_grammar_question(self) -> None:
        source_path = REPO_ROOT / "data" / "jlpt_gen_pool" / "N1-lex.json"
        source = json.loads(source_path.read_text(encoding="utf-8"))
        source_pool = source.get("result", source)["pool"]
        available_qtypes = {
            question.get("qtype")
            for question in source_pool
            if question.get("qtype") in assemble_bank.PAPER["N1"]
        }
        n1_lex_spec = {
            "N1": {
                qtype: assemble_bank.PAPER["N1"][qtype]
                for qtype in available_qtypes
            }
        }
        source_count = sum(
            question.get("level") == "N1" and question.get("qtype") == "text_grammar"
            for question in source_pool
        )

        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "bank.json"
            with mock.patch.object(assemble_bank, "PAPER", n1_lex_spec):
                with contextlib.redirect_stdout(io.StringIO()):
                    assemble_bank.main(str(source_path), str(output_path))
            bank = json.loads(output_path.read_text(encoding="utf-8"))

        assembled_count = sum(
            question["level"] == "N1" and question["qtype"] == "text_grammar"
            for question in bank["questions"]
        )
        self.assertGreaterEqual(source_count, 111)
        self.assertEqual(source_count, assembled_count)

    def test_write_failure_preserves_existing_output(self) -> None:
        pool = _text_grammar_group(passage="原子書き込み記事。", group="atomic-write")
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            original = b"existing bank must survive"
            source_path.write_text(
                json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
            )
            output_path.write_bytes(original)

            with mock.patch.object(
                assemble_bank.json, "dump", side_effect=OSError("simulated write failure")
            ):
                with self.assertRaisesRegex(OSError, "simulated write failure"):
                    with mock.patch.object(
                        assemble_bank, "PAPER", {"N1": {"text_grammar": 2}}
                    ):
                        with contextlib.redirect_stdout(io.StringIO()):
                            assemble_bank.main(str(source_path), str(output_path))

            self.assertEqual(original, output_path.read_bytes())

    def test_write_is_fsynced_then_replaced_from_the_output_directory(self) -> None:
        pool = _text_grammar_group(passage="耐久書き込み記事。", group="durable-write")
        real_fsync = os.fsync
        real_replace = os.replace
        events: list[str] = []

        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "nested" / "bank.json"
            output_path.parent.mkdir()
            source_path.write_text(
                json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
            )

            def record_fsync(fd: int) -> None:
                events.append("fsync")
                real_fsync(fd)

            def record_replace(source: str, target: str) -> None:
                events.append("replace")
                self.assertEqual(output_path.parent, Path(source).parent)
                self.assertEqual(output_path, Path(target))
                real_replace(source, target)

            with mock.patch.object(os, "fsync", side_effect=record_fsync), mock.patch.object(
                os, "replace", side_effect=record_replace
            ):
                with mock.patch.object(
                    assemble_bank, "PAPER", {"N1": {"text_grammar": 2}}
                ):
                    with contextlib.redirect_stdout(io.StringIO()):
                        assemble_bank.main(str(source_path), str(output_path))

            self.assertEqual(["fsync", "replace"], events)
            self.assertTrue(output_path.exists())

    def test_canonical_pool_builds_every_qtype_to_the_exact_target(self) -> None:
        pool = _canonical_pool()
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            source_path.write_text(
                json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
            )
            with contextlib.redirect_stdout(io.StringIO()):
                assemble_bank.main(str(source_path), str(output_path))
            bank = json.loads(output_path.read_text(encoding="utf-8"))

        by_id = {question["id"]: question for question in bank["questions"]}
        for level, spec in assemble_bank.PAPER.items():
            paper_questions = [by_id[qid] for qid in bank["papers"][level]["questionIds"]]
            for qtype, want in spec.items():
                self.assertEqual(
                    want,
                    sum(question["qtype"] == qtype for question in paper_questions),
                    f"{level} {qtype} must exactly match canonical paper spec",
                )

    def test_full_paper_manifest_uses_the_official_two_or_three_exam_sections(self) -> None:
        pool = _canonical_pool()
        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            source_path.write_text(
                json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
            )
            with contextlib.redirect_stdout(io.StringIO()):
                assemble_bank.main(str(source_path), str(output_path))
            bank = json.loads(output_path.read_text(encoding="utf-8"))

        by_id = {question["id"]: question for question in bank["questions"]}
        for level, paper in bank["papers"].items():
            self.assertEqual("full-paper", paper.get("kind"))
            self.assertEqual(2, paper.get("manifestVersion"))
            self.assertNotIn("笔试卷", paper.get("title", ""))
            sections = paper.get("sections") or []
            self.assertEqual(
                list(EXPECTED_SECTION_DURATION[level]),
                [s.get("section") for s in sections],
            )
            self.assertEqual(
                sum(EXPECTED_SECTION_DURATION[level].values()),
                paper.get("durationSeconds"),
            )
            self.assertEqual(
                EXPECTED_SECTION_DURATION[level],
                {s["section"]: s["durationSeconds"] for s in sections},
            )
            self.assertEqual(
                paper["questionIds"],
                [qid for section in sections for qid in section["questionIds"]],
            )
            for section in sections:
                self.assertTrue(section["questionIds"])
                source_sections = {
                    by_id[qid]["section"] for qid in section["questionIds"]
                }
                if section["section"] == "listening":
                    self.assertEqual({"listening"}, source_sections)
                elif section["section"] == "vocabulary":
                    self.assertEqual({"vocab"}, source_sections)
                elif section["section"] == "grammar_reading":
                    self.assertTrue(source_sections <= {"grammar", "reading"})
                    self.assertTrue(source_sections)
                else:
                    self.assertEqual("written", section["section"])
                    self.assertNotIn("listening", source_sections)

    def test_seed_accepts_three_section_n3_manifest_and_only_first_section_charges(self) -> None:
        payloads = jlpt_seed._mock_paper_exam_payloads(
            "N3",
            {
                "kind": "full-paper",
                "manifestVersion": 2,
                "title": "JLPT N3 全真模拟（完整卷）",
                "durationSeconds": 140 * 60,
                "questionIds": ["n3-vocab", "n3-grammar", "n3-reading", "n3-listening"],
                "sections": [
                    {
                        "section": "vocabulary",
                        "title": "言語知識（文字・語彙）",
                        "durationSeconds": 30 * 60,
                        "questionIds": ["n3-vocab"],
                    },
                    {
                        "section": "grammar_reading",
                        "title": "言語知識（文法）・読解",
                        "durationSeconds": 70 * 60,
                        "questionIds": ["n3-grammar", "n3-reading"],
                    },
                    {
                        "section": "listening",
                        "title": "聴解",
                        "durationSeconds": 40 * 60,
                        "questionIds": ["n3-listening"],
                    },
                ],
            },
            sort_order=0,
        )

        self.assertEqual(4, len(payloads))
        parent, vocabulary, grammar_reading, listening = payloads
        self.assertEqual("paper", parent["kind"])
        self.assertEqual(
            ["vocab", "", "listening"],
            [vocabulary["section"], grammar_reading["section"], listening["section"]],
        )
        self.assertEqual([250, 0, 0], [
            vocabulary["coinCost"], grammar_reading["coinCost"], listening["coinCost"]
        ])
        self.assertEqual(["percent", "percent", "percent"], [
            vocabulary["scoreMode"], grammar_reading["scoreMode"], listening["scoreMode"]
        ])

    def test_seed_installs_full_paper_as_parent_and_independently_timed_sections(self) -> None:
        bank = {
            "version": 2,
            "questions": [
                {
                    "id": "mockv1-n1-gf-001",
                    "level": "N1",
                    "section": "grammar",
                    "qtype": "grammar_form",
                    "stem": "written",
                    "passage": "",
                    "choices": ["a", "b", "c", "d"],
                    "answerIndex": 0,
                    "explanation": "written explanation",
                    "difficulty": 3,
                },
                {
                    "id": "mockv1-n1-lt-001",
                    "level": "N1",
                    "section": "listening",
                    "qtype": "listen_task",
                    "stem": "listening",
                    "passage": "script",
                    "choices": ["a", "b", "c", "d"],
                    "answerIndex": 0,
                    "explanation": "listening explanation",
                    "difficulty": 3,
                },
            ],
            "papers": {
                "N1": {
                    "kind": "full-paper",
                    "manifestVersion": 2,
                    "title": "JLPT N1 全真模拟（完整卷）",
                    "durationSeconds": 9900,
                    "questionIds": ["mockv1-n1-gf-001", "mockv1-n1-lt-001"],
                    "sections": [
                        {
                            "section": "written",
                            "title": "言語知識・読解",
                            "durationSeconds": 6600,
                            "questionIds": ["mockv1-n1-gf-001"],
                        },
                        {
                            "section": "listening",
                            "title": "聴解",
                            "durationSeconds": 3300,
                            "questionIds": ["mockv1-n1-lt-001"],
                        },
                    ],
                }
            },
        }

        class FakeCursor:
            def __init__(self, row=None):
                self.row = row

            def fetchone(self):
                return self.row

        class FakeConnection:
            def __init__(self, existing_exam_ids=()):
                self.existing_exam_ids = set(existing_exam_ids)

            def execute(self, sql, params=(), **_kwargs):
                if sql.startswith("SELECT id FROM jlpt_exams WHERE id = ?"):
                    exam_id = params[0]
                    return FakeCursor(
                        {"id": exam_id} if exam_id in self.existing_exam_ids else None
                    )
                return FakeCursor()

        upserts: list[dict[str, object]] = []
        fake_jlpt = types.SimpleNamespace(
            IMPORT_MAX_ROWS=100,
            import_questions=lambda _conn, items, now=None: {"total": len(items)},
            upsert_exam=lambda _conn, payload, now=None: upserts.append(copy.deepcopy(payload)),
        )

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "jlpt_bank_v1.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
            with mock.patch.object(jlpt_seed, "_mock_bank_path", return_value=str(bank_path)):
                with mock.patch.dict(sys.modules, {"server_jlpt": fake_jlpt}):
                    result = jlpt_seed.ensure_jlpt_mock_v1(FakeConnection())

        self.assertEqual(3, len(upserts))
        self.assertEqual(3, result["exams"])
        parent, written, listening = upserts
        self.assertEqual("paper", parent["kind"])
        self.assertEqual(0, parent["durationSeconds"])
        self.assertEqual([], parent["questionIds"])
        self.assertEqual(2, parent["questionCount"])
        self.assertNotIn("笔试卷", parent["title"])
        self.assertEqual("section", written["kind"])
        self.assertEqual(parent["id"], written["parentExamId"])
        self.assertEqual(6600, written["durationSeconds"])
        self.assertEqual(["mockv1-n1-gf-001"], written["questionIds"])
        self.assertEqual("jlpt_scaled", written["scoreMode"])
        self.assertEqual(400, written["coinCost"])
        self.assertEqual("section", listening["kind"])
        self.assertEqual(parent["id"], listening["parentExamId"])
        self.assertEqual("listening", listening["section"])
        self.assertEqual(3300, listening["durationSeconds"])
        self.assertEqual(["mockv1-n1-lt-001"], listening["questionIds"])
        self.assertEqual("percent", listening["scoreMode"])
        self.assertEqual(0, listening["coinCost"])

        # A later fingerprint refresh must not reset an admin-adjusted price.
        # The structural parent/listening rows remain explicitly free, while
        # omitting the written price lets upsert_exam preserve its stored value.
        upserts.clear()
        existing = {
            "mockv1-n1",
            "mockv1-n1-written",
            "mockv1-n1-listening",
        }
        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "jlpt_bank_v1.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
            with mock.patch.object(jlpt_seed, "_mock_bank_path", return_value=str(bank_path)):
                with mock.patch.dict(sys.modules, {"server_jlpt": fake_jlpt}):
                    jlpt_seed.ensure_jlpt_mock_v1(FakeConnection(existing))

        parent, written, listening = upserts
        self.assertEqual(0, parent["coinCost"])
        self.assertNotIn("coinCost", written)
        self.assertEqual(0, listening["coinCost"])

    def test_legacy_written_only_manifest_does_not_invent_a_new_price(self) -> None:
        payloads = jlpt_seed._mock_paper_exam_payloads(
            "N5",
            {
                "title": "JLPT N5 全真模拟（笔试卷）",
                "durationSeconds": 3600,
                "questionIds": ["legacy-question"],
            },
            sort_order=0,
        )

        self.assertEqual(1, len(payloads))
        self.assertEqual("mock", payloads[0]["kind"])
        self.assertEqual(0, payloads[0]["coinCost"])

    def test_full_paper_payloads_round_trip_through_runtime_section_contract(self) -> None:
        written_ids = [f"written-question-{index}" for index in range(64)]
        listening_ids = [f"listening-question-{index}" for index in range(31)]
        payloads = jlpt_seed._mock_paper_exam_payloads(
            "N1",
            {
                "kind": "full-paper",
                "manifestVersion": 2,
                "title": "JLPT N1 全真模拟（完整卷）",
                "durationSeconds": 9900,
                "questionIds": written_ids + listening_ids,
                "sections": [
                    {
                        "section": "written",
                        "title": "言語知識・読解",
                        "durationSeconds": 6600,
                        "questionIds": written_ids,
                    },
                    {
                        "section": "listening",
                        "title": "聴解",
                        "durationSeconds": 3300,
                        "questionIds": listening_ids,
                    },
                ],
            },
            sort_order=0,
        )
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.executescript(
            """
            CREATE TABLE jlpt_exams (
                id TEXT PRIMARY KEY, level TEXT, title TEXT, kind TEXT, section TEXT,
                question_count INTEGER, duration_seconds INTEGER, pass_score INTEGER,
                is_member_only INTEGER, status TEXT, sort_order INTEGER, score_mode TEXT,
                parent_exam_id TEXT, coin_cost INTEGER, created_at TEXT
            );
            CREATE TABLE jlpt_exam_questions (
                exam_id TEXT, question_id TEXT, sort_order INTEGER,
                PRIMARY KEY (exam_id, question_id)
            );
            """
        )
        try:
            for payload in payloads:
                runtime_jlpt.upsert_exam(connection, payload, now="2026-07-22T00:00:00+00:00")
            catalog = runtime_jlpt.list_exams(connection, is_member=False)
            detail = runtime_jlpt.list_paper_sections(
                connection, "mockv1-n1", is_member=False
            )
        finally:
            connection.close()

        self.assertEqual(1, len(catalog))
        parent = catalog[0]
        self.assertTrue(parent["isPaper"])
        self.assertEqual(2, parent["sectionCount"])
        self.assertEqual(95, parent["questionCount"])
        self.assertEqual(9900, parent["durationSeconds"])
        self.assertEqual(400, parent["coinCost"])
        self.assertIsNotNone(detail)
        self.assertEqual(95, detail["paper"]["questionCount"])
        sections = detail["sections"]
        self.assertEqual([6600, 3300], [section["durationSeconds"] for section in sections])
        self.assertEqual([400, 0], [section["coinCost"] for section in sections])

    def test_invalid_group_cli_is_nonzero_reports_context_and_preserves_target(self) -> None:
        pool = _canonical_pool()
        invalid_group = _text_grammar_group(
            passage="invalid group passage", group="invalid-group"
        )
        for question in invalid_group:
            question["section"] = "grammar"
        invalid_group[1]["choices"] = ["only", "three", "choices"]
        first_invalid_index = len(pool)
        pool.extend(invalid_group)

        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            report_path = Path(tmp) / "failure-report.json"
            original = b"existing-target-must-not-be-replaced"
            source_path.write_text(
                json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
            )
            output_path.write_bytes(original)
            before_sha = hashlib.sha256(original).hexdigest()
            process = subprocess.run(
                [
                    sys.executable,
                    str(Path(assemble_bank.__file__).resolve()),
                    str(source_path),
                    str(output_path),
                    "--report",
                    str(report_path),
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(0, process.returncode, process.stdout + process.stderr)
            self.assertEqual(original, output_path.read_bytes())
            self.assertEqual(before_sha, hashlib.sha256(output_path.read_bytes()).hexdigest())
            report = json.loads(report_path.read_text(encoding="utf-8"))

        self.assertEqual("failed", report["status"])
        issue = next(item for item in report["issues"] if item["group"] == "invalid-group")
        self.assertTrue(issue["reason"])
        self.assertEqual("N1", issue["level"])
        self.assertEqual("text_grammar", issue["qtype"])
        self.assertIn(issue["sourceIndex"], {first_invalid_index, first_invalid_index + 1})

    def test_schema_bad_members_fail_closed_with_source_context(self) -> None:
        cases = [
            ("invalid_level", lambda q: q.__setitem__("level", "N0"), "level_invalid"),
            ("invalid_qtype", lambda q: q.__setitem__("qtype", "unknown"), "qtype_invalid"),
            (
                "qtype_not_allowed_for_level",
                lambda q: (
                    q.__setitem__("level", "N1"),
                    q.__setitem__("qtype", "orthography"),
                    q.__setitem__("section", "vocab"),
                ),
                "qtype_level_mismatch",
            ),
            ("wrong_section", lambda q: q.__setitem__("section", "reading"), "section_mismatch"),
            ("blank_stem", lambda q: q.__setitem__("stem", "  "), "stem_required"),
            (
                "non_string_choice",
                lambda q: q.__setitem__("choices", ["a", "b", "c", 4]),
                "choices_not_strings",
            ),
            (
                "duplicate_choices",
                lambda q: q.__setitem__("choices", ["same", "same ", "c", "d"]),
                "choices_not_unique",
            ),
            ("boolean_answer", lambda q: q.__setitem__("answerIndex", True), "answer_index_invalid"),
            ("blank_explanation", lambda q: q.__setitem__("explanation", "  "), "explanation_required"),
            ("boolean_difficulty", lambda q: q.__setitem__("difficulty", False), "difficulty_invalid"),
        ]
        for name, mutate, expected_code in cases:
            with self.subTest(case=name):
                pool = _canonical_pool()
                mutate(pool[0])
                report = _run_assembly_failure(self, pool)
                matches = [item for item in report["issues"] if item["code"] == expected_code]
                self.assertTrue(matches, report)
                issue = matches[0]
                self.assertEqual(0, issue["sourceIndex"])
                self.assertIn("reason", issue)
                self.assertIn("level", issue)
                self.assertIn("qtype", issue)
                self.assertIn("group", issue)

    def test_listening_requires_a_script_and_forbids_atomic_reading_groups(self) -> None:
        for name, mutate, expected_code in (
            (
                "missing_script",
                lambda question: question.__setitem__("passage", ""),
                "passage_required",
            ),
            (
                "unexpected_group",
                lambda question: question.__setitem__("group", "listening-group"),
                "unexpected_group",
            ),
        ):
            with self.subTest(case=name):
                pool = _canonical_pool()
                source_index, question = next(
                    (index, item)
                    for index, item in enumerate(pool)
                    if item["level"] == "N1" and item["qtype"] == "listen_task"
                )
                mutate(question)
                report = _run_assembly_failure(self, pool)
                issue = next(item for item in report["issues"] if item["code"] == expected_code)
                self.assertEqual(source_index, issue["sourceIndex"])
                self.assertEqual("N1", issue["level"])
                self.assertEqual("listen_task", issue["qtype"])

    def test_empty_short_duplicate_and_conflicting_groups_fail_closed(self) -> None:
        def text_grammar_members(pool: list[dict[str, object]]) -> list[dict[str, object]]:
            return [
                question
                for question in pool
                if question["level"] == "N1" and question["qtype"] == "text_grammar"
            ]

        cases: list[tuple[str, list[dict[str, object]], str]] = []

        empty_group_pool = _canonical_pool()
        text_grammar_members(empty_group_pool)[0]["group"] = ""
        cases.append(("empty_group", empty_group_pool, "group_required"))

        short_group_pool = _canonical_pool()
        short_members = text_grammar_members(short_group_pool)
        short_group_pool = [question for question in short_group_pool if question not in short_members[1:]]
        cases.append(("short_group", short_group_pool, "group_too_short"))

        duplicate_group_pool = _canonical_pool()
        duplicate_members = text_grammar_members(duplicate_group_pool)
        duplicate_group_pool.extend(copy.deepcopy(duplicate_members))
        cases.append(("duplicate_group", duplicate_group_pool, "group_member_duplicate"))

        conflict_group_pool = _canonical_pool()
        conflict = copy.deepcopy(text_grammar_members(conflict_group_pool)[0])
        conflict["choices"] = ["new A", "new B", "new C", "new D"]
        conflict["answerIndex"] = 3
        conflict_group_pool.append(conflict)
        cases.append(("conflicting_member", conflict_group_pool, "group_member_conflict"))

        mixed_passage_pool = _canonical_pool()
        text_grammar_members(mixed_passage_pool)[1]["passage"] = "different passage"
        cases.append(("mixed_passage", mixed_passage_pool, "group_passage_conflict"))

        for name, pool, expected_code in cases:
            with self.subTest(case=name):
                report = _run_assembly_failure(self, pool)
                issue = next(item for item in report["issues"] if item["code"] == expected_code)
                self.assertEqual("N1", issue["level"])
                self.assertEqual("text_grammar", issue["qtype"])
                self.assertTrue(issue["reason"])
                self.assertTrue(issue["sourceIndexes"])

    def test_ordinary_duplicate_question_fails_closed(self) -> None:
        pool = _canonical_pool()
        duplicate = copy.deepcopy(pool[0])
        duplicate_index = len(pool)
        pool.append(duplicate)

        report = _run_assembly_failure(self, pool)
        issue = next(item for item in report["issues"] if item["code"] == "duplicate_question")
        self.assertEqual(duplicate_index, issue["sourceIndex"])
        self.assertEqual([0, duplicate_index], issue["sourceIndexes"])

    def test_shortfall_and_atomic_overfill_fail_closed(self) -> None:
        shortfall_pool = _canonical_pool()[1:]
        shortfall_report = _run_assembly_failure(self, shortfall_pool)
        shortfall = next(
            item for item in shortfall_report["issues"] if item["code"] == "paper_shortfall"
        )
        self.assertEqual("N5", shortfall["level"])
        self.assertEqual("kanji_reading", shortfall["qtype"])

        overfill_pool = _canonical_pool()
        original_group = [
            question
            for question in overfill_pool
            if question["level"] == "N1" and question["qtype"] == "text_grammar"
        ]
        overfill_pool = [question for question in overfill_pool if question not in original_group]
        template = original_group[0]
        for index in range(6):
            question = copy.deepcopy(template)
            question["group"] = "n1-text-grammar-overfill"
            question["passage"] = "six-member passage cannot fit a five-question target"
            question["stem"] = f"overfill blank {index + 1}"
            question["choices"] = [f"{index}-{letter}" for letter in "ABCD"]
            question["answerIndex"] = index % 4
            overfill_pool.append(question)

        overfill_report = _run_assembly_failure(self, overfill_pool)
        overfill = next(
            item
            for item in overfill_report["issues"]
            if item["code"] == "paper_atomic_overfill"
        )
        self.assertEqual("N1", overfill["level"])
        self.assertEqual("text_grammar", overfill["qtype"])
        self.assertEqual("n1-text-grammar-overfill", overfill["group"])

    def test_default_n1_only_source_fails_closed_instead_of_writing_empty_levels(self) -> None:
        source_path = REPO_ROOT / "data" / "jlpt_gen_pool" / "N1-lex.json"
        source = json.loads(source_path.read_text(encoding="utf-8"))
        source_pool = source.get("result", source)["pool"]

        report = _run_assembly_failure(self, source_pool)
        missing = [item for item in report["issues"] if item["code"] == "paper_shortfall"]
        self.assertTrue(missing)
        self.assertTrue(any(item["level"] == "N1" and item["qtype"].startswith("reading_") for item in missing))
        self.assertTrue(any(item["level"] == "N1" and item["qtype"].startswith("listen_") for item in missing))
        self.assertTrue(any(item["level"] == "N2" for item in missing))


class BalanceAnswersTests(unittest.TestCase):
    def test_empty_paper_does_not_break_balance_reporting(self) -> None:
        bank = _balance_bank()
        bank["papers"]["N2"] = {"questionIds": []}

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(
                json.dumps(bank, ensure_ascii=False), encoding="utf-8"
            )

            output = io.StringIO()
            try:
                with contextlib.redirect_stdout(output):
                    balance_answers.main(str(bank_path))
            except ZeroDivisionError as error:
                self.fail(f"empty papers must be reportable: {error}")

        self.assertIn("N2: (no questions)", output.getvalue())

    def test_choice_position_references_follow_the_reordered_choice_text(self) -> None:
        original_choices = ["甲", "乙", "丙", "丁"]
        original_answer_index = 2
        bank = {
            "version": 1,
            "source": "fixture",
            "note": "fixture",
            "questions": [
                {
                    "id": "position-refs",
                    "level": "N1",
                    "section": "vocab",
                    "choices": original_choices,
                    "answerIndex": original_answer_index,
                    "explanation": (
                        "选项1“甲”不合适；选项2“乙”不合适；"
                        "选项3“丙”正确；选项4“丁”不合适，故选3。"
                        "第一项“甲”仍是干扰项。"
                    ),
                }
            ],
            "papers": {"N1": {"questionIds": ["position-refs"]}},
        }

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            first_run = bank_path.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            second_run = bank_path.read_bytes()
            question = json.loads(second_run)["questions"][0]

        self.assertEqual(first_run, second_run)
        explanation = question["explanation"]
        for choice in original_choices:
            new_position = question["choices"].index(choice) + 1
            self.assertIn(f"选项{new_position}“{choice}”", explanation)
        correct_text = original_choices[original_answer_index]
        self.assertEqual(correct_text, question["choices"][question["answerIndex"]])
        self.assertIn(f"故选{question['answerIndex'] + 1}", explanation)
        chinese_positions = {1: "一", 2: "二", 3: "三", 4: "四"}
        first_choice_new_position = question["choices"].index(original_choices[0]) + 1
        self.assertIn(
            f"第{chinese_positions[first_choice_new_position]}项“甲”", explanation
        )

    def test_common_numeric_circled_and_letter_position_references_are_remapped(self) -> None:
        original_choices = ["甲", "乙", "丙", "丁"]
        bank = {
            "version": 1,
            "source": "fixture",
            "note": "fixture",
            "questions": [
                {
                    "id": "common-position-refs",
                    "level": "N1",
                    "section": "vocab",
                    "choices": original_choices,
                    "answerIndex": 2,
                    "explanation": (
                        "答案是第3个选项“丙”；选项③正确；選択肢③が正しい。"
                        "选项C与C选项都指向“丙”，Option C is correct."
                    ),
                }
            ],
            "papers": {"N1": {"questionIds": ["common-position-refs"]}},
        }

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            first_run = bank_path.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            second_run = bank_path.read_bytes()
            question = json.loads(second_run)["questions"][0]

        self.assertEqual(first_run, second_run)
        self.assertEqual("丙", question["choices"][question["answerIndex"]])
        new_position = question["choices"].index("丙") + 1
        new_letter = "ABCD"[new_position - 1]
        new_circled = "①②③④"[new_position - 1]
        explanation = question["explanation"]
        self.assertIn(f"第{new_position}个选项“丙”", explanation)
        self.assertIn(f"选项{new_circled}正确", explanation)
        self.assertIn(f"選択肢{new_circled}が正しい", explanation)
        self.assertIn(f"选项{new_letter}", explanation)
        self.assertIn(f"{new_letter}选项", explanation)
        self.assertIn(f"Option {new_letter}", explanation)

    def test_unparsed_suspected_position_reference_rejects_without_replacing_bank(self) -> None:
        bank = _balance_bank(explanation="答案是选项（5）“正解”，这个位置无法映射到四个选项。")
        bank["questions"][0]["choices"] = ["误答A", "误答B", "正解", "误答C"]
        bank["questions"][0]["answerIndex"] = 2

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
            original = bank_path.read_bytes()
            error: Exception | None = None
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    balance_answers.main(str(bank_path))
            except Exception as caught:
                error = caught

            self.assertEqual(original, bank_path.read_bytes())
            self.assertIsNotNone(error)
            self.assertEqual("BalanceValidationError", type(error).__name__)
            self.assertIn("q-1", str(error))
            self.assertIn("选项（5）", str(error))

    def test_second_run_is_byte_identical(self) -> None:
        bank = _balance_bank()

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")

            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            first_run = bank_path.read_bytes()

            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            second_run = bank_path.read_bytes()

        self.assertEqual(first_run, second_run)

    def test_tracked_bank_is_byte_identical_on_second_run(self) -> None:
        source_path = REPO_ROOT / "data" / "jlpt_bank_v1.json"
        source_bank = json.loads(source_path.read_text(encoding="utf-8"))

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            shutil.copyfile(source_path, bank_path)

            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            first_run = bank_path.read_bytes()

            with contextlib.redirect_stdout(io.StringIO()):
                balance_answers.main(str(bank_path))
            second_run = bank_path.read_bytes()

        self.assertGreaterEqual(len(source_bank["questions"]), 527)
        self.assertEqual(first_run, second_run)

    def test_write_failure_preserves_existing_bank(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "bank.json"
            bank_path.write_text(
                json.dumps(_balance_bank(), ensure_ascii=False), encoding="utf-8"
            )
            original = bank_path.read_bytes()

            with mock.patch.object(
                balance_answers.json, "dump", side_effect=OSError("simulated write failure")
            ):
                with self.assertRaisesRegex(OSError, "simulated write failure"):
                    with contextlib.redirect_stdout(io.StringIO()):
                        balance_answers.main(str(bank_path))

            self.assertEqual(original, bank_path.read_bytes())

    def test_write_is_fsynced_then_replaced_from_the_bank_directory(self) -> None:
        real_fsync = os.fsync
        real_replace = os.replace
        events: list[str] = []

        with tempfile.TemporaryDirectory() as tmp:
            bank_path = Path(tmp) / "nested" / "bank.json"
            bank_path.parent.mkdir()
            bank_path.write_text(
                json.dumps(_balance_bank(), ensure_ascii=False), encoding="utf-8"
            )

            def record_fsync(fd: int) -> None:
                events.append("fsync")
                real_fsync(fd)

            def record_replace(source: str, target: str) -> None:
                events.append("replace")
                self.assertEqual(bank_path.parent, Path(source).parent)
                self.assertEqual(bank_path, Path(target))
                real_replace(source, target)

            with mock.patch.object(os, "fsync", side_effect=record_fsync), mock.patch.object(
                os, "replace", side_effect=record_replace
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    balance_answers.main(str(bank_path))

            self.assertEqual(["fsync", "replace"], events)
            self.assertTrue(bank_path.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
