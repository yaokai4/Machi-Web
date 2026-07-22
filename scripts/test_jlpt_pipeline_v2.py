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


def _release_records(level: str, count: int, *, seed: str) -> list[dict[str, object]]:
    contract_v2 = _contract_module()
    records: list[dict[str, object]] = []
    for index in range(count):
        records.append(
            contract_v2.normalize_question(
                {
                    "level": level,
                    "section": "vocab",
                    "qtype": "kanji_reading",
                    "stem": f"{seed} {level} 漢字問題 {index}",
                    "passage": "",
                    "group": "",
                    "choices": [
                        f"{seed}-{index}-a",
                        f"{seed}-{index}-b",
                        f"{seed}-{index}-c",
                        f"{seed}-{index}-d",
                    ],
                    "answerIndex": index % 4,
                    "explanation": f"{seed} {level} 解説 {index}",
                    "difficulty": 3,
                    "theme": "release-test",
                }
            )
        )
    return records


def _artifact_meta(path: Path, *, count: int | None = None) -> dict[str, object]:
    payload = path.read_bytes()
    metadata: dict[str, object] = {
        "path": path.name,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "bytes": len(payload),
    }
    if count is not None:
        metadata["count"] = count
    return metadata


def _write_json_for_test(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


def _reviewed_run(
    root: Path,
    *,
    name: str,
    level: str,
    records: list[dict[str, object]],
    wave: int,
) -> Path:
    run_dir = root / name
    provenance_path = root / f"{name}-provenance.json"
    _write_provenance(provenance_path, operator=name)
    initialized = _run_pipeline(
        "init-run", "--run-dir", str(run_dir), "--level", level,
        "--group", "lex", "--wave", str(wave), "--provenance", str(provenance_path),
    )
    if initialized.returncode != 0:
        raise AssertionError(initialized.stderr)
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    pending = [dict(record, reviewStatus="pending") for record in records]
    verified = [dict(record, reviewStatus="verified") for record in records]
    source_path = root / f"{name}-source.json"
    _write_json_for_test(source_path, {"pool": pending})
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    receipt = {
        "runId": manifest["runId"],
        "contractSha256": manifest["contract"]["sha256"],
        "sourceSha256": source_hash,
        "reviewers": ["blind-reviewer-a", "blind-reviewer-b"],
        "verdicts": [
            {
                "contentHash": record["contentHash"],
                "reviews": [
                    {
                        "reviewer": reviewer,
                        "accepted": True,
                        "fatal": False,
                        "answer": record["choices"][record["answerIndex"]],
                    }
                    for reviewer in ("blind-reviewer-a", "blind-reviewer-b")
                ],
            }
            for record in pending
        ],
        "issuedAt": "2026-07-22T02:00:00+09:00",
    }
    metrics = {
        "raw": len(pending),
        "sanitized": len(pending),
        "unique": len(pending),
        "rejected": 0,
        "verified": len(verified),
        "receiptRejected": 0,
    }
    artifacts: dict[str, tuple[object, int | None]] = {
        "raw": ({"pool": pending}, len(pending)),
        "sanitized": (pending, len(pending)),
        "rejected": ([], 0),
        "metrics": (metrics, None),
        "receipt": (receipt, None),
        "verified": (verified, len(verified)),
        "reviewMetrics": (metrics, None),
    }
    filenames = {
        "raw": "raw.json",
        "sanitized": "sanitized.json",
        "rejected": "rejected.json",
        "metrics": "metrics.json",
        "receipt": "receipt.json",
        "verified": "verified.json",
        "reviewMetrics": "review_metrics.json",
    }
    for artifact_name, (value, count) in artifacts.items():
        artifact_path = run_dir / filenames[artifact_name]
        _write_json_for_test(artifact_path, value)
        manifest["artifacts"][artifact_name] = _artifact_meta(artifact_path, count=count)
    manifest["state"] = "reviewed"
    manifest["source"] = {
        "path": str(source_path.resolve()),
        "sha256": source_hash,
        "bytes": len(source_path.read_bytes()),
    }
    manifest["receipt"] = {
        "sourcePath": str((run_dir / "receipt.json").resolve()),
        "sourceSha256": hashlib.sha256((run_dir / "receipt.json").read_bytes()).hexdigest(),
        "reviewers": receipt["reviewers"],
        "issuedAt": receipt["issuedAt"],
    }
    manifest["metrics"] = metrics
    _write_json_for_test(run_dir / "manifest.json", manifest)
    return run_dir


def _release_signature(release_dir: Path, *, decision: str, **updates: object) -> dict[str, object]:
    manifest = json.loads((release_dir / "manifest.json").read_text(encoding="utf-8"))
    signature: dict[str, object] = {
        "releaseId": manifest["releaseId"],
        "contractSha256": manifest["contract"]["sha256"],
        "decision": decision,
        "approvedBy": "human-release-owner",
        "signedAt": "2026-07-22T03:00:00+09:00",
    }
    if decision == "publish":
        signature["candidateSha256"] = manifest["artifacts"]["candidate"]["sha256"]
    else:
        signature["publishedSha256"] = manifest["publication"]["targetSha256"]
    signature.update(updates)
    return signature


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


class ReleasePipelineTests(unittest.TestCase):
    def test_stage_deduplicates_verified_content_is_pending_and_preserves_target(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            n1_records = _release_records("N1", 1000, seed="n1-release")
            n2_records = _release_records("N2", 1000, seed="n2-release")
            n1_run = _reviewed_run(
                root, name="n1", level="N1", records=n1_records, wave=1
            )
            n2_run = _reviewed_run(
                root, name="n2", level="N2", records=n2_records, wave=1
            )
            duplicate_raw = {
                key: value
                for key, value in n1_records[0].items()
                if key not in {"id", "groupId", "contentHash", "source", "reviewStatus"}
            }
            original_answer = duplicate_raw["choices"][duplicate_raw["answerIndex"]]
            duplicate_raw["choices"] = list(reversed(duplicate_raw["choices"]))
            duplicate_raw["answerIndex"] = duplicate_raw["choices"].index(original_answer)
            reordered_duplicate = _contract_module().normalize_question(duplicate_raw)
            self.assertEqual(n1_records[0]["id"], reordered_duplicate["id"])
            self.assertEqual(n1_records[0]["contentHash"], reordered_duplicate["contentHash"])
            duplicate_run = _reviewed_run(
                root, name="n1-duplicate", level="N1", records=[reordered_duplicate], wave=2
            )
            release_dir = root / "release"
            target = root / "bank.json"
            target.write_bytes(b'{\n  "source": "jlptv2",\n  "questions": []\n}\n')
            before = target.read_bytes()
            command = (
                "stage", "--release-dir", str(release_dir), "--target", str(target),
                "--run-dir", str(n1_run), "--run-dir", str(n2_run),
                "--run-dir", str(duplicate_run),
            )

            first = _run_pipeline(*command)
            self.assertEqual(0, first.returncode, first.stderr)
            self.assertEqual(before, target.read_bytes())
            candidate = json.loads((release_dir / "candidate.json").read_text(encoding="utf-8"))
            manifest = json.loads((release_dir / "manifest.json").read_text(encoding="utf-8"))
            diff = json.loads((release_dir / "diff.json").read_text(encoding="utf-8"))
            tracked = {
                name: (release_dir / name).read_bytes()
                for name in ("candidate.json", "diff.json", "manifest.json")
            }
            second = _run_pipeline(*command)

            self.assertEqual(0, second.returncode, second.stderr)
            self.assertTrue(json.loads(second.stdout)["resumed"])
            self.assertEqual(
                tracked,
                {name: (release_dir / name).read_bytes() for name in tracked},
            )
            self.assertEqual("pending", manifest["state"])
            self.assertEqual({"N1": 1000, "N2": 1000}, manifest["counts"]["verifiedUniqueByLevel"])
            self.assertEqual(1, manifest["counts"]["duplicateExact"])
            self.assertEqual(2000, len(candidate["questions"]))
            self.assertEqual("pending", candidate["publicationStatus"])
            self.assertTrue(
                all(question["reviewStatus"] == "verified" for question in candidate["questions"])
            )
            self.assertTrue(
                all(question["publicationStatus"] == "pending" for question in candidate["questions"])
            )
            self.assertEqual(hashlib.sha256(before).hexdigest(), diff["target"]["observedSha256"])
            reversed_release = root / "release-reversed"
            reversed_stage = _run_pipeline(
                "stage", "--release-dir", str(reversed_release), "--target", str(target),
                "--run-dir", str(duplicate_run), "--run-dir", str(n2_run),
                "--run-dir", str(n1_run),
            )
            self.assertEqual(0, reversed_stage.returncode, reversed_stage.stderr)
            self.assertEqual(
                tracked,
                {name: (reversed_release / name).read_bytes() for name in tracked},
            )

    def test_stage_rejects_tampering_identity_conflicts_and_release_shortfall_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "bank.json"
            target.write_text('{"source":"jlptv2","questions":[]}\n', encoding="utf-8")
            target_before = target.read_bytes()
            one = _release_records("N1", 1, seed="conflict")
            conflict_raw = {
                key: value
                for key, value in one[0].items()
                if key not in {"id", "groupId", "contentHash", "source", "reviewStatus"}
            }
            conflict_raw["explanation"] = "different reviewed explanation"
            conflict = [_contract_module().normalize_question(conflict_raw)]
            first_run = _reviewed_run(root, name="first", level="N1", records=one, wave=1)
            conflict_run = _reviewed_run(
                root, name="conflict", level="N1", records=conflict, wave=2
            )

            conflict_release = root / "conflict-release"
            conflicted = _run_pipeline(
                "stage", "--release-dir", str(conflict_release), "--target", str(target),
                "--run-dir", str(first_run), "--run-dir", str(conflict_run),
            )
            self.assertEqual(2, conflicted.returncode)
            self.assertIn('"code": "identity_conflict"', conflicted.stderr)
            self.assertFalse((conflict_release / "manifest.json").exists())

            shortfall_release = root / "shortfall-release"
            shortfall = _run_pipeline(
                "stage", "--release-dir", str(shortfall_release), "--target", str(target),
                "--run-dir", str(first_run),
            )
            self.assertEqual(2, shortfall.returncode)
            self.assertIn('"code": "release_shortfall"', shortfall.stderr)
            self.assertFalse((shortfall_release / "candidate.json").exists())

            (first_run / "verified.json").write_text("[]\n", encoding="utf-8")
            tampered_release = root / "tampered-release"
            tampered = _run_pipeline(
                "stage", "--release-dir", str(tampered_release), "--target", str(target),
                "--run-dir", str(first_run),
            )
            self.assertEqual(2, tampered.returncode)
            self.assertIn('"code": "artifact_tampered"', tampered.stderr)
            self.assertFalse((tampered_release / "manifest.json").exists())
            self.assertEqual(target_before, target.read_bytes())

    def test_publish_and_rollback_require_exact_signatures_hashes_and_protect_legacy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            n1_run = _reviewed_run(
                root,
                name="n1",
                level="N1",
                records=_release_records("N1", 1000, seed="publish-n1"),
                wave=1,
            )
            n2_run = _reviewed_run(
                root,
                name="n2",
                level="N2",
                records=_release_records("N2", 1000, seed="publish-n2"),
                wave=1,
            )
            target = root / "bank.json"
            original = b'{\n "source": "jlptv2", "questions": [{"id":"prior"}]\n}\n'
            target.write_bytes(original)
            release_dir = root / "release"
            staged = _run_pipeline(
                "stage", "--release-dir", str(release_dir), "--target", str(target),
                "--run-dir", str(n1_run), "--run-dir", str(n2_run),
            )
            self.assertEqual(0, staged.returncode, staged.stderr)

            missing = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(root / "missing-signature.json"),
            )
            self.assertEqual(2, missing.returncode)
            self.assertEqual(original, target.read_bytes())
            malformed_path = root / "malformed-signature.json"
            malformed_path.write_text("{not-json", encoding="utf-8")
            malformed = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(malformed_path),
            )
            self.assertEqual(2, malformed.returncode)
            self.assertEqual(original, target.read_bytes())
            mismatch_path = root / "mismatch-signature.json"
            _write_json_for_test(
                mismatch_path,
                _release_signature(release_dir, decision="publish", candidateSha256="0" * 64),
            )
            mismatch = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(mismatch_path),
            )
            self.assertEqual(2, mismatch.returncode)
            self.assertIn('"code": "signature_invalid"', mismatch.stderr)
            self.assertEqual(original, target.read_bytes())

            signature_path = root / "publish-signature.json"
            _write_json_for_test(signature_path, _release_signature(release_dir, decision="publish"))
            target.write_bytes(original + b"changed")
            changed = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(signature_path),
            )
            self.assertEqual(2, changed.returncode)
            self.assertIn('"code": "target_changed"', changed.stderr)
            target.write_bytes(original)

            published = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(signature_path),
            )
            self.assertEqual(0, published.returncode, published.stderr)
            published_bytes = target.read_bytes()
            bank = json.loads(published_bytes)
            self.assertEqual("jlptv2", bank["source"])
            self.assertEqual(2000, len(bank["questions"]))
            self.assertTrue(all(item["reviewStatus"] == "approved" for item in bank["questions"]))
            self.assertEqual(original, (release_dir / "rollback" / "previous.json").read_bytes())
            publish_resume = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(signature_path),
            )
            self.assertEqual(0, publish_resume.returncode, publish_resume.stderr)
            self.assertTrue(json.loads(publish_resume.stdout)["resumed"])
            self.assertEqual(published_bytes, target.read_bytes())

            rollback_mismatch_path = root / "rollback-mismatch.json"
            rollback_missing = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(root / "missing-rollback-signature.json"),
            )
            self.assertEqual(2, rollback_missing.returncode)
            self.assertEqual(published_bytes, target.read_bytes())
            _write_json_for_test(
                rollback_mismatch_path,
                _release_signature(release_dir, decision="rollback", publishedSha256="0" * 64),
            )
            rollback_mismatch = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_mismatch_path),
            )
            self.assertEqual(2, rollback_mismatch.returncode)
            self.assertEqual(published_bytes, target.read_bytes())
            rollback_path = root / "rollback-signature.json"
            _write_json_for_test(rollback_path, _release_signature(release_dir, decision="rollback"))
            target.write_bytes(published_bytes + b"tampered")
            tampered = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
            )
            self.assertEqual(2, tampered.returncode)
            self.assertIn('"code": "target_changed"', tampered.stderr)
            target.write_bytes(published_bytes)
            rolled_back = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
            )
            self.assertEqual(0, rolled_back.returncode, rolled_back.stderr)
            self.assertEqual(original, target.read_bytes())
            rollback_resume = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
            )
            self.assertEqual(0, rollback_resume.returncode, rollback_resume.stderr)
            self.assertTrue(json.loads(rollback_resume.stdout)["resumed"])
            self.assertEqual(original, target.read_bytes())

            mock_candidate_target = root / "mock-candidate-target.json"
            _write_json_for_test(
                mock_candidate_target, {"source": "jlptv2", "questions": []}
            )
            mock_candidate_before = mock_candidate_target.read_bytes()
            mock_candidate_release = root / "mock-candidate-release"
            mock_candidate_stage = _run_pipeline(
                "stage", "--release-dir", str(mock_candidate_release),
                "--target", str(mock_candidate_target), "--run-dir", str(n1_run),
                "--run-dir", str(n2_run),
            )
            self.assertEqual(0, mock_candidate_stage.returncode, mock_candidate_stage.stderr)
            mock_candidate = json.loads(
                (mock_candidate_release / "candidate.json").read_text(encoding="utf-8")
            )
            mock_candidate["questions"][0]["id"] = "mockv1-forbidden"
            _write_json_for_test(mock_candidate_release / "candidate.json", mock_candidate)
            mock_candidate_signature = root / "mock-candidate-signature.json"
            _write_json_for_test(
                mock_candidate_signature,
                _release_signature(mock_candidate_release, decision="publish"),
            )
            mock_candidate_publish = _run_pipeline(
                "publish", "--release-dir", str(mock_candidate_release),
                "--target", str(mock_candidate_target),
                "--signature", str(mock_candidate_signature),
            )
            self.assertEqual(2, mock_candidate_publish.returncode)
            self.assertIn('"code": "artifact_tampered"', mock_candidate_publish.stderr)
            self.assertEqual(mock_candidate_before, mock_candidate_target.read_bytes())

            for name, existing in (
                ("jlpt_bank_v1.json", {"source": "jlptv2", "questions": []}),
                ("legacy-copy.json", {"source": "mockv1", "questions": []}),
            ):
                legacy_target = root / name
                _write_json_for_test(legacy_target, existing)
                legacy_before = legacy_target.read_bytes()
                legacy_release = root / f"release-{name}"
                legacy_stage = _run_pipeline(
                    "stage", "--release-dir", str(legacy_release),
                    "--target", str(legacy_target), "--run-dir", str(n1_run),
                    "--run-dir", str(n2_run),
                )
                self.assertEqual(0, legacy_stage.returncode, legacy_stage.stderr)
                legacy_signature = root / f"signature-{name}"
                _write_json_for_test(
                    legacy_signature,
                    _release_signature(legacy_release, decision="publish"),
                )
                refused = _run_pipeline(
                    "publish", "--release-dir", str(legacy_release),
                    "--target", str(legacy_target), "--signature", str(legacy_signature),
                )
                self.assertEqual(2, refused.returncode)
                self.assertIn('"code": "target_protected"', refused.stderr)
                self.assertEqual(legacy_before, legacy_target.read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
