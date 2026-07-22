#!/usr/bin/env python3
"""Trust-boundary tests for the JLPT v2 question pipeline."""

from __future__ import annotations

import json
import hashlib
import importlib
import inspect
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
JLPT_GEN_DIR = REPO_ROOT / "scripts" / "jlpt_gen"
CONTRACT_PATH = JLPT_GEN_DIR / "jlpt_contract_v2.json"
CONTRACT_MODULE_PATH = JLPT_GEN_DIR / "jlpt_contract_v2.py"
sys.path.insert(0, str(JLPT_GEN_DIR))


def _contract_module():
    if "jlpt_contract_v2" in sys.modules:
        return importlib.reload(sys.modules["jlpt_contract_v2"])
    return importlib.import_module("jlpt_contract_v2")


def _question(**updates: object) -> dict[str, object]:
    question: dict[str, object] = {
        "level": "N1",
        "section": "grammar",
        "qtype": "grammar_form",
        "stem": "（　）に入るものを選びなさい。",
        "passage": "",
        "group": "",
        "choices": ["ため", "ので", "のに", "なら"],
        "answerIndex": 1,
        "explanation": "正解は「ので」。理由を表す。",
        "difficulty": 3,
        "theme": "学校・勉強",
    }
    question.update(updates)
    return question


class ContractV2Tests(unittest.TestCase):
    def test_authoritative_contract_owns_schema_papers_and_release_gate(self) -> None:
        self.assertTrue(CONTRACT_PATH.is_file(), "authoritative v2 contract is missing")
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

        self.assertEqual(2, contract["contractVersion"])
        self.assertEqual(
            ["level", "section", "qtype", "stem", "passage", "group", "choices",
             "answerIndex", "explanation", "difficulty"],
            contract["questionSchema"]["required"],
        )
        self.assertEqual(5, contract["paperSpec"]["N2"]["word_formation"])
        self.assertEqual(
            [5, 6, 5, 11, 3],
            [
                contract["paperSpec"]["N1"][name]
                for name in (
                    "listen_task", "listen_point", "listen_gist",
                    "listen_response", "listen_integrated",
                )
            ],
        )
        self.assertEqual(
            {"N1": 1000, "N2": 1000},
            contract["releaseGate"]["minimumApprovedUniqueStagedByLevel"],
        )
        self.assertEqual(2, contract["qualityGate"]["minimumIndependentReviewers"])
        self.assertTrue(contract["qualityGate"]["requireUnanimous"])

    def test_contract_module_derives_compatibility_maps_from_json(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        raw = CONTRACT_PATH.read_bytes()

        self.assertEqual(hashlib.sha256(raw).hexdigest(), contract_v2.contract_sha256())
        self.assertEqual(
            json.loads(raw)["paperSpec"], contract_v2.paper_spec()
        )
        self.assertEqual("wf", contract_v2.qtype_abbreviations()["word_formation"])
        self.assertEqual("vocab", contract_v2.qtype_sections()["word_formation"])
        self.assertEqual(
            {"written": 6600, "listening": 3300},
            contract_v2.section_durations()["N1"],
        )

    def test_option_reordering_preserves_question_identity_and_content_hash(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        original = contract_v2.normalize_question(_question())
        reordered = contract_v2.normalize_question(
            _question(
                choices=["なら", "のに", "ので", "ため"],
                answerIndex=2,
            )
        )

        self.assertEqual(original["id"], reordered["id"])
        self.assertEqual(original["contentHash"], reordered["contentHash"])

    def test_semantic_answer_and_explanation_changes_update_content_hash(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        baseline = contract_v2.normalize_question(_question())["contentHash"]
        mutations = [
            _question(stem="別の（　）問題。"),
            _question(choices=["ため", "ので", "のに", "ならば"]),
            _question(answerIndex=0),
            _question(explanation="「ので」は客観的な理由を示す接続助詞。"),
            _question(
                section="listening",
                qtype="listen_task",
                passage="男：明日は早く出ます。",
                stem="男の人はどうしますか。",
            ),
        ]

        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assertNotEqual(
                    baseline,
                    contract_v2.normalize_question(mutation)["contentHash"],
                )

        listening_a = contract_v2.normalize_question(
            _question(
                section="listening",
                qtype="listen_task",
                passage="男：明日は早く出ます。",
                stem="男の人はどうしますか。",
            )
        )
        listening_b = contract_v2.normalize_question(
            _question(
                section="listening",
                qtype="listen_task",
                passage="男：明日は遅く出ます。",
                stem="男の人はどうしますか。",
            )
        )
        self.assertNotEqual(listening_a["contentHash"], listening_b["contentHash"])

    def test_group_identity_uses_passage_content_not_legacy_slug(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        base = _question(
            qtype="text_grammar",
            passage="同じ文章。（１）（２）",
            group="legacy-a",
        )
        renamed = dict(base, group="legacy-b")
        changed = dict(base, passage="別の文章。（１）（２）")

        self.assertEqual(
            contract_v2.normalize_question(base)["groupId"],
            contract_v2.normalize_question(renamed)["groupId"],
        )
        self.assertNotEqual(
            contract_v2.normalize_question(base)["groupId"],
            contract_v2.normalize_question(changed)["groupId"],
        )

    def test_sanitize_pool_rejects_an_invalid_atomic_group_as_one_unit(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        self.assertTrue(hasattr(contract_v2, "sanitize_pool"), "sanitize_pool is missing")
        valid = _question(
            qtype="text_grammar",
            stem="（1）に入るものはどれか。",
            passage="共通文章。（1）（2）",
            group="article-a",
        )
        invalid = _question(
            qtype="text_grammar",
            stem="（2）に入るものはどれか。",
            passage="共通文章。（1）（2）",
            group="article-a",
            explanation="",
        )

        result = contract_v2.sanitize_pool([valid, invalid], expected_level="N1", expected_group="lex")

        self.assertEqual([], result["records"])
        self.assertTrue(result["fatal"])
        self.assertEqual({0, 1}, {item["sourceIndex"] for item in result["rejected"]})
        self.assertIn(
            "atomic_group_rejected",
            {issue["code"] for item in result["rejected"] for issue in item["issues"]},
        )

    def test_sanitize_pool_counts_exact_duplicates_but_rejects_identity_conflicts(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        self.assertTrue(hasattr(contract_v2, "sanitize_pool"), "sanitize_pool is missing")
        original = _question()
        duplicate = json.loads(json.dumps(original, ensure_ascii=False))
        conflict = dict(original, explanation="冲突的解析。")

        exact = contract_v2.sanitize_pool([original, duplicate], expected_level="N1", expected_group="lex")
        conflicted = contract_v2.sanitize_pool([original, conflict], expected_level="N1", expected_group="lex")

        self.assertEqual(1, len(exact["records"]))
        self.assertEqual(1, exact["metrics"]["duplicateExact"])
        self.assertFalse(exact["fatal"])
        self.assertEqual([], conflicted["records"])
        self.assertTrue(conflicted["fatal"])
        self.assertEqual(2, conflicted["metrics"]["identityConflicts"])

    def test_assembler_and_workflow_consume_contract_instead_of_copying_paper(self) -> None:
        self.assertTrue(CONTRACT_MODULE_PATH.is_file(), "contract module is missing")
        contract_v2 = _contract_module()
        assemble_bank = importlib.import_module("assemble_bank")
        assembler_source = inspect.getsource(assemble_bank)
        workflow_source = (JLPT_GEN_DIR / "jlpt_bank_gen_v2.js").read_text(encoding="utf-8")

        self.assertEqual(contract_v2.paper_spec(), assemble_bank.PAPER)
        self.assertEqual(contract_v2.qtype_abbreviations(), assemble_bank.ABBREV)
        self.assertEqual(contract_v2.section_durations(), assemble_bank.SECTION_DURATION)
        self.assertNotIn("PAPER = {", assembler_source)
        self.assertIn("paper_spec()", assembler_source)
        self.assertNotIn("const PAPER = {", workflow_source)
        self.assertIn("const CONTRACT = A.contract", workflow_source)
        self.assertNotIn("A.level || 'N1'", workflow_source)
        self.assertNotIn("A.group || 'lex'", workflow_source)
        self.assertNotIn("A.wave || 1", workflow_source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
