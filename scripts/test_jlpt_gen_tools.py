#!/usr/bin/env python3
"""Regression tests for the deterministic JLPT bank assembly tools."""

from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


JLPT_GEN_DIR = Path(__file__).resolve().parent / "jlpt_gen"
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(JLPT_GEN_DIR))

import assemble_bank  # noqa: E402
import balance_answers  # noqa: E402


def _text_grammar_question(
    *, passage: str, group: str, blank: int = 1, choices: list[str] | None = None
) -> dict[str, object]:
    return {
        "level": "N1",
        "qtype": "text_grammar",
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
    with tempfile.TemporaryDirectory() as tmp:
        source_path = Path(tmp) / "source.json"
        output_path = Path(tmp) / "bank.json"
        source_path.write_text(
            json.dumps({"pool": pool}, ensure_ascii=False), encoding="utf-8"
        )
        with contextlib.redirect_stdout(io.StringIO()):
            assemble_bank.main(str(source_path), str(output_path))
        return json.loads(output_path.read_text(encoding="utf-8"))


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
        source_count = sum(
            question.get("level") == "N1" and question.get("qtype") == "text_grammar"
            for question in source_pool
        )

        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "bank.json"
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
                with contextlib.redirect_stdout(io.StringIO()):
                    assemble_bank.main(str(source_path), str(output_path))

            self.assertEqual(["fsync", "replace"], events)
            self.assertTrue(output_path.exists())


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
