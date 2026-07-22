#!/usr/bin/env python3
"""Regression tests for the deterministic JLPT bank assembly tools."""

from __future__ import annotations

import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


JLPT_GEN_DIR = Path(__file__).resolve().parent / "jlpt_gen"
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(JLPT_GEN_DIR))

import assemble_bank  # noqa: E402
import balance_answers  # noqa: E402


def _text_grammar_question(*, passage: str, group: str) -> dict[str, object]:
    return {
        "level": "N1",
        "qtype": "text_grammar",
        "stem": "（１）に入れるのに最もよいものはどれか。",
        "passage": passage,
        "group": group,
        "choices": ["ところで", "それでも", "つまり", "たとえば"],
        "answerIndex": 0,
        "explanation": "文章の流れに合う接続表現を選ぶ。",
        "difficulty": 3,
    }


class AssembleBankTests(unittest.TestCase):
    def test_grouped_questions_with_same_stem_in_distinct_passages_are_preserved(self) -> None:
        source = {
            "pool": [
                _text_grammar_question(passage="最初の記事。（１）続き。", group="article-a"),
                _text_grammar_question(passage="別の記事。（１）続き。", group="article-b"),
            ]
        }

        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            source_path.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")

            with contextlib.redirect_stdout(io.StringIO()):
                assemble_bank.main(str(source_path), str(output_path))

            bank = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(2, len(bank["questions"]))
        self.assertEqual(
            {"最初の記事。（１）続き。", "別の記事。（１）続き。"},
            {question["passage"] for question in bank["questions"]},
        )

    def test_exact_duplicate_grouped_question_is_still_deduplicated(self) -> None:
        question = _text_grammar_question(passage="同じ記事。（１）続き。", group="article-a")
        source = {"pool": [question, dict(question)]}

        with tempfile.TemporaryDirectory() as tmp:
            source_path = Path(tmp) / "source.json"
            output_path = Path(tmp) / "bank.json"
            source_path.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")

            with contextlib.redirect_stdout(io.StringIO()):
                assemble_bank.main(str(source_path), str(output_path))

            bank = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(1, len(bank["questions"]))

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


class BalanceAnswersTests(unittest.TestCase):
    def test_second_run_is_byte_identical(self) -> None:
        bank = {
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
                }
            ],
            "papers": {"N1": {"questionIds": ["q-1"]}},
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
