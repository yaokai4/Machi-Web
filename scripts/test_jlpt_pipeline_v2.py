#!/usr/bin/env python3
"""Trust-boundary tests for the JLPT v2 question pipeline."""

from __future__ import annotations

import json
import hashlib
import importlib
import inspect
import copy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
JLPT_GEN_DIR = REPO_ROOT / "scripts" / "jlpt_gen"
CONTRACT_PATH = JLPT_GEN_DIR / "jlpt_contract_v2.json"
CONTRACT_MODULE_PATH = JLPT_GEN_DIR / "jlpt_contract_v2.py"
PIPELINE_PATH = JLPT_GEN_DIR / "jlpt_pipeline_v2.py"
WORKFLOW_PATH = JLPT_GEN_DIR / "jlpt_bank_gen_v2.js"
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


def _run_pipeline(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(PIPELINE_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def _write_provenance(path: Path, **updates: object) -> dict[str, object]:
    provenance: dict[str, object] = {
        "generator": "jlpt_bank_gen_v2",
        "workflowSha256": hashlib.sha256(WORKFLOW_PATH.read_bytes()).hexdigest(),
        "operator": "pipeline-test",
        "models": ["generator-model", "blind-reviewer-a", "blind-reviewer-b"],
        "createdAt": "2026-07-22T00:00:00+09:00",
    }
    provenance.update(updates)
    path.write_text(json.dumps(provenance, ensure_ascii=False), encoding="utf-8")
    return provenance


def _minimum_pool(level: str, group: str) -> list[dict[str, object]]:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    pool: list[dict[str, object]] = []
    for qtype in contract["generationGroups"][group]:
        count = contract["paperSpec"][level].get(qtype, 0)
        spec = contract["qtypes"][qtype]
        for index in range(count):
            passage = ""
            legacy_group = ""
            if spec["groupMode"] == "atomic":
                passage = f"{level} {qtype} 共通文章。（1）（2）（3）（4）（5）"
                legacy_group = f"{qtype}-group"
            elif spec["groupMode"] == "single_script":
                passage = f"男：{level} {qtype} script {index}。"
            pool.append(
                {
                    "level": level,
                    "section": spec["section"],
                    "qtype": qtype,
                    "stem": f"{level} {qtype} question {index}",
                    "passage": passage,
                    "group": legacy_group,
                    "choices": [
                        f"{qtype}-{index}-a",
                        f"{qtype}-{index}-b",
                        f"{qtype}-{index}-c",
                        f"{qtype}-{index}-d",
                    ],
                    "answerIndex": index % 4,
                    "explanation": f"{qtype} explanation {index}",
                    "difficulty": 3,
                    "theme": "test-theme",
                }
            )
    return pool


def _init_test_run(root: Path, *, name: str = "run", level: str = "N1", group: str = "lex") -> Path:
    run_dir = root / name
    provenance_path = root / f"{name}-provenance.json"
    _write_provenance(provenance_path)
    process = _run_pipeline(
        "init-run", "--run-dir", str(run_dir), "--level", level,
        "--group", group, "--wave", "1", "--provenance", str(provenance_path),
    )
    if process.returncode != 0:
        raise AssertionError(process.stderr)
    return run_dir


def _ingest_test_run(root: Path, *, name: str = "run", level: str = "N1", group: str = "lex") -> Path:
    run_dir = _init_test_run(root, name=name, level=level, group=group)
    source_path = root / f"{name}-source.json"
    source_path.write_text(
        json.dumps({"pool": _minimum_pool(level, group)}, ensure_ascii=False),
        encoding="utf-8",
    )
    process = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))
    if process.returncode != 0:
        raise AssertionError(process.stderr)
    return run_dir


def _receipt_for_run(
    run_dir: Path,
    *,
    reviewers: list[str] | None = None,
) -> dict[str, object]:
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    questions = json.loads((run_dir / "sanitized.json").read_text(encoding="utf-8"))
    reviewer_ids = reviewers or ["blind-reviewer-a", "blind-reviewer-b"]
    verdicts = []
    for question in questions:
        answer = question["choices"][question["answerIndex"]]
        verdicts.append(
            {
                "contentHash": question["contentHash"],
                "reviews": [
                    {
                        "reviewer": reviewer,
                        "accepted": True,
                        "fatal": False,
                        "answer": answer,
                    }
                    for reviewer in reviewer_ids
                ],
            }
        )
    return {
        "runId": manifest["runId"],
        "contractSha256": manifest["contract"]["sha256"],
        "sourceSha256": manifest["source"]["sha256"],
        "reviewers": reviewer_ids,
        "verdicts": verdicts,
        "issuedAt": "2026-07-22T01:00:00+09:00",
    }


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


class RunManifestTests(unittest.TestCase):
    def test_init_run_writes_exact_contract_request_and_resumes_identically(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "run"
            provenance_path = root / "provenance.json"
            provenance = _write_provenance(provenance_path)
            command = (
                "init-run", "--run-dir", str(run_dir), "--level", "N1",
                "--group", "lex", "--wave", "1", "--provenance", str(provenance_path),
            )

            first = _run_pipeline(*command)
            self.assertEqual(0, first.returncode, first.stderr)
            manifest_before = (run_dir / "manifest.json").read_bytes()
            second = _run_pipeline(*command)

            self.assertEqual(0, second.returncode, second.stderr)
            self.assertEqual(manifest_before, (run_dir / "manifest.json").read_bytes())
            self.assertTrue(json.loads(second.stdout)["resumed"])
            request = json.loads((run_dir / "request.json").read_text(encoding="utf-8"))
            manifest = json.loads(manifest_before)
            self.assertEqual({"level": "N1", "group": "lex", "wave": 1}, manifest["request"])
            self.assertEqual(provenance, manifest["provenance"])
            self.assertEqual(json.loads(CONTRACT_PATH.read_text(encoding="utf-8")), request["contract"])
            self.assertEqual(manifest["contract"]["sha256"], request["contractSha256"])
            self.assertEqual("initialized", manifest["state"])
            self.assertIsNone(manifest["source"])
            self.assertIsNone(manifest["receipt"])

    def test_init_run_rejects_invalid_parameters_and_provenance_without_artifacts(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        cases = [
            ("N3", "lex", "1", {}),
            ("N1", "other", "1", {}),
            ("N1", "lex", "0", {}),
            ("N1", "lex", "1.5", {}),
            ("N1", "lex", "1", {"models": []}),
            ("N1", "lex", "1", {"workflowSha256": "0" * 64}),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for index, (level, group, wave, updates) in enumerate(cases):
                with self.subTest(level=level, group=group, wave=wave, updates=updates):
                    run_dir = root / f"run-{index}"
                    provenance_path = root / f"provenance-{index}.json"
                    _write_provenance(provenance_path, **updates)
                    process = _run_pipeline(
                        "init-run", "--run-dir", str(run_dir), "--level", level,
                        "--group", group, "--wave", wave,
                        "--provenance", str(provenance_path),
                    )
                    self.assertNotEqual(0, process.returncode)
                    error = json.loads(process.stderr)
                    self.assertEqual("failed", error["status"])
                    self.assertIn("code", error)
                    self.assertFalse((run_dir / "manifest.json").exists())
                    self.assertFalse((run_dir / "request.json").exists())

            missing = _run_pipeline("init-run", "--run-dir", str(root / "missing"))
            self.assertEqual(2, missing.returncode)
            self.assertEqual("cli_invalid", json.loads(missing.stderr)["code"])
            self.assertFalse((root / "missing" / "manifest.json").exists())

    def test_init_run_rejects_changed_immutable_request_and_preserves_manifest(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "run"
            provenance_path = root / "provenance.json"
            _write_provenance(provenance_path)
            first = _run_pipeline(
                "init-run", "--run-dir", str(run_dir), "--level", "N1",
                "--group", "lex", "--wave", "1", "--provenance", str(provenance_path),
            )
            self.assertEqual(0, first.returncode, first.stderr)
            before = (run_dir / "manifest.json").read_bytes()

            changed = _run_pipeline(
                "init-run", "--run-dir", str(run_dir), "--level", "N1",
                "--group", "lex", "--wave", "2", "--provenance", str(provenance_path),
            )

            self.assertNotEqual(0, changed.returncode)
            self.assertEqual(before, (run_dir / "manifest.json").read_bytes())

    def test_ingest_writes_hashed_pending_artifacts_and_resumes_identically(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = _init_test_run(root)
            source_path = root / "source.json"
            source_path.write_text(
                json.dumps({"pool": _minimum_pool("N1", "lex")}, ensure_ascii=False),
                encoding="utf-8",
            )

            first = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))
            self.assertEqual(0, first.returncode, first.stderr)
            tracked = ["manifest.json", "raw.json", "sanitized.json", "rejected.json", "metrics.json"]
            before = {name: (run_dir / name).read_bytes() for name in tracked}
            second = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))

            self.assertEqual(0, second.returncode, second.stderr)
            self.assertTrue(json.loads(second.stdout)["resumed"])
            self.assertEqual(before, {name: (run_dir / name).read_bytes() for name in tracked})
            manifest = json.loads(before["manifest.json"])
            sanitized = json.loads(before["sanitized.json"])
            self.assertEqual("sanitized", manifest["state"])
            self.assertEqual(hashlib.sha256(source_path.read_bytes()).hexdigest(), manifest["source"]["sha256"])
            self.assertEqual({"raw", "request", "sanitized", "rejected", "metrics"}, set(manifest["artifacts"]))
            self.assertTrue(sanitized)
            self.assertTrue(all(item["id"].startswith("jlptv2-q-") for item in sanitized))
            self.assertTrue(all(item["reviewStatus"] == "pending" for item in sanitized))
            self.assertTrue(all(not item["id"].startswith("mockv1-") for item in sanitized))

    def test_ingest_fails_closed_for_parser_schema_group_shortfall_and_overfill(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        base = _minimum_pool("N1", "lex")
        broken_field = copy.deepcopy(base)
        broken_field[0]["explanation"] = ""
        broken_group = copy.deepcopy(base)
        grouped = next(item for item in broken_group if item["qtype"] == "text_grammar")
        grouped["explanation"] = ""
        shortfall = copy.deepcopy(base[:-1])
        overfill = copy.deepcopy(base)
        text_members = [item for item in overfill if item["qtype"] == "text_grammar"]
        extra = copy.deepcopy(text_members[-1])
        extra["stem"] = "text grammar atomic overfill extra"
        extra["choices"] = ["extra-a", "extra-b", "extra-c", "extra-d"]
        overfill.append(extra)
        cases: list[tuple[str, object, str]] = [
            ("empty", {"pool": []}, "pool_invalid"),
            ("root", {"unexpected": []}, "pool_invalid"),
            ("field", {"pool": broken_field}, "pool_rejected"),
            ("group", {"pool": broken_group}, "pool_rejected"),
            ("shortfall", {"pool": shortfall}, "paper_shortfall"),
            ("overfill", {"pool": overfill}, "paper_atomic_overfill"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for index, (label, source, code) in enumerate(cases):
                with self.subTest(label=label):
                    run_dir = _init_test_run(root, name=f"run-{index}")
                    source_path = root / f"source-{index}.json"
                    source_path.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
                    manifest_before = (run_dir / "manifest.json").read_bytes()

                    process = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))

                    self.assertNotEqual(0, process.returncode)
                    self.assertIn(f'"code": "{code}"', process.stderr)
                    self.assertEqual(manifest_before, (run_dir / "manifest.json").read_bytes())
                    for artifact in ("raw.json", "sanitized.json", "rejected.json", "metrics.json"):
                        self.assertFalse((run_dir / artifact).exists(), artifact)

            malformed_run = _init_test_run(root, name="run-malformed")
            malformed_path = root / "malformed.json"
            malformed_path.write_text("{not-json", encoding="utf-8")
            malformed_before = (malformed_run / "manifest.json").read_bytes()
            malformed = _run_pipeline(
                "ingest", "--run-dir", str(malformed_run), "--source", str(malformed_path)
            )
            self.assertNotEqual(0, malformed.returncode)
            self.assertIn('"code": "json_unreadable"', malformed.stderr)
            self.assertEqual(malformed_before, (malformed_run / "manifest.json").read_bytes())

    def test_ingest_rejects_changed_source_or_tampered_artifact(self) -> None:
        self.assertTrue(PIPELINE_PATH.is_file(), "v2 pipeline CLI is missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = _init_test_run(root)
            source_path = root / "source.json"
            source_path.write_text(
                json.dumps({"pool": _minimum_pool("N1", "lex")}, ensure_ascii=False),
                encoding="utf-8",
            )
            first = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))
            self.assertEqual(0, first.returncode, first.stderr)
            manifest_before = (run_dir / "manifest.json").read_bytes()

            changed_source = json.loads(source_path.read_text(encoding="utf-8"))
            changed_source["pool"][0]["stem"] += " changed"
            source_path.write_text(json.dumps(changed_source, ensure_ascii=False), encoding="utf-8")
            changed = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))
            self.assertNotEqual(0, changed.returncode)
            self.assertEqual(manifest_before, (run_dir / "manifest.json").read_bytes())

            original_source = {"pool": _minimum_pool("N1", "lex")}
            source_path.write_text(json.dumps(original_source, ensure_ascii=False), encoding="utf-8")
            (run_dir / "sanitized.json").write_text("[]", encoding="utf-8")
            tampered = _run_pipeline("ingest", "--run-dir", str(run_dir), "--source", str(source_path))
            self.assertNotEqual(0, tampered.returncode)
            self.assertEqual(manifest_before, (run_dir / "manifest.json").read_bytes())

    def test_verify_accepts_complete_unanimous_receipt_and_resumes_identically(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = _ingest_test_run(root)
            receipt_path = root / "receipt.json"
            receipt_path.write_text(
                json.dumps(_receipt_for_run(run_dir), ensure_ascii=False), encoding="utf-8"
            )

            first = _run_pipeline("verify", "--run-dir", str(run_dir), "--receipt", str(receipt_path))
            self.assertEqual(0, first.returncode, first.stderr)
            tracked = ["manifest.json", "receipt.json", "verified.json", "metrics.json"]
            before = {name: (run_dir / name).read_bytes() for name in tracked}
            second = _run_pipeline("verify", "--run-dir", str(run_dir), "--receipt", str(receipt_path))

            self.assertEqual(0, second.returncode, second.stderr)
            self.assertTrue(json.loads(second.stdout)["resumed"])
            self.assertEqual(before, {name: (run_dir / name).read_bytes() for name in tracked})
            manifest = json.loads(before["manifest.json"])
            sanitized = json.loads((run_dir / "sanitized.json").read_text(encoding="utf-8"))
            verified = json.loads(before["verified.json"])
            self.assertEqual("reviewed", manifest["state"])
            self.assertEqual(len(sanitized), len(verified))
            self.assertEqual(len(verified), manifest["metrics"]["verified"])
            self.assertTrue(all(item["reviewStatus"] == "verified" for item in verified))
            self.assertTrue(all(item["reviewStatus"] != "approved" for item in verified))

    def test_verify_rejects_malformed_or_mismatched_receipt_without_writes(self) -> None:
        mutations = [
            lambda receipt: receipt.update(reviewers=["blind-reviewer-a"]),
            lambda receipt: receipt.update(reviewers=["blind-reviewer-a", "blind-reviewer-a"]),
            lambda receipt: receipt.update(runId="wrong-run"),
            lambda receipt: receipt.update(contractSha256="0" * 64),
            lambda receipt: receipt.update(sourceSha256="0" * 64),
            lambda receipt: receipt["verdicts"].pop(),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for index, mutate in enumerate(mutations):
                with self.subTest(index=index):
                    run_dir = _ingest_test_run(root, name=f"run-{index}")
                    receipt = _receipt_for_run(run_dir)
                    mutate(receipt)
                    receipt_path = root / f"receipt-{index}.json"
                    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False), encoding="utf-8")
                    manifest_before = (run_dir / "manifest.json").read_bytes()

                    process = _run_pipeline(
                        "verify", "--run-dir", str(run_dir), "--receipt", str(receipt_path)
                    )

                    self.assertNotEqual(0, process.returncode)
                    self.assertIn('"code": "receipt_invalid"', process.stderr)
                    self.assertEqual(manifest_before, (run_dir / "manifest.json").read_bytes())
                    self.assertFalse((run_dir / "receipt.json").exists())
                    self.assertFalse((run_dir / "verified.json").exists())

    def test_verify_keeps_disagreement_fatal_and_wrong_answer_out_of_verified(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = _ingest_test_run(root)
            receipt = _receipt_for_run(run_dir)
            receipt["verdicts"][0]["reviews"][1]["accepted"] = False
            receipt["verdicts"][1]["reviews"][0]["fatal"] = True
            receipt["verdicts"][2]["reviews"][0]["answer"] = "not-the-authored-answer"
            receipt_path = root / "receipt.json"
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False), encoding="utf-8")

            process = _run_pipeline(
                "verify", "--run-dir", str(run_dir), "--receipt", str(receipt_path)
            )

            self.assertEqual(0, process.returncode, process.stderr)
            manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
            sanitized = json.loads((run_dir / "sanitized.json").read_text(encoding="utf-8"))
            verified = json.loads((run_dir / "verified.json").read_text(encoding="utf-8"))
            self.assertEqual(len(sanitized) - 3, len(verified))
            self.assertEqual(3, manifest["metrics"]["receiptRejected"])
            self.assertTrue(all(item["reviewStatus"] == "verified" for item in verified))


if __name__ == "__main__":
    unittest.main(verbosity=2)
