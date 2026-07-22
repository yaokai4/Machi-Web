#!/usr/bin/env python3
"""Trust-boundary tests for the JLPT v2 question pipeline."""

from __future__ import annotations

import json
import hashlib
import importlib
import inspect
import copy
import base64
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
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


def _pipeline_module():
    if "jlpt_pipeline_v2" in sys.modules:
        return importlib.reload(sys.modules["jlpt_pipeline_v2"])
    return importlib.import_module("jlpt_pipeline_v2")


def _structured_explanation(
    choices: list[str],
    answer_index: int,
    *,
    seed: str = "fixture",
) -> dict[str, object]:
    correct = choices[answer_index]
    return {
        "correctAnswerMeaningUsage": f"{seed}：正确项 {correct} 的意思、用法与适用语境说明。",
        "knowledgePoint": f"{seed}：本题考查接续、搭配、语体与近义辨析规则。",
        "whyCorrect": f"{seed}：结合完整句意，只有 {correct} 能唯一满足上下文。",
        "distractorReasons": [
            {
                "choice": choice,
                "reason": f"{seed}：{choice} 在此处因语义、搭配或语体不合而不能成立。",
            }
            for index, choice in enumerate(choices)
            if index != answer_index
        ],
    }


def _question(**updates: object) -> dict[str, object]:
    choices = ["ため", "ので", "のに", "なら"]
    question: dict[str, object] = {
        "level": "N1",
        "section": "grammar",
        "qtype": "grammar_form",
        "stem": "（　）に入るものを選びなさい。",
        "passage": "",
        "group": "",
        "choices": choices,
        "answerIndex": 1,
        "difficulty": 3,
        "theme": "学校・勉強",
    }
    question.update(updates)
    if "explanation" not in updates:
        question["explanation"] = _structured_explanation(
            question["choices"],
            question["answerIndex"],
            seed=str(question["stem"]),
        )
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
        "authorStepId": "author-pipeline-test",
        "authorModel": "generator-model",
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
            choices = [
                f"{qtype}-{index}-a",
                f"{qtype}-{index}-b",
                f"{qtype}-{index}-c",
                f"{qtype}-{index}-d",
            ]
            answer_index = index % 4
            pool.append(
                {
                    "level": level,
                    "section": spec["section"],
                    "qtype": qtype,
                    "stem": f"{level} {qtype} question {index}",
                    "passage": passage,
                    "group": legacy_group,
                    "choices": choices,
                    "answerIndex": answer_index,
                    "explanation": _structured_explanation(
                        choices,
                        answer_index,
                        seed=f"{qtype}-{index}",
                    ),
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
                        "stepId": f"review-step-{reviewer}",
                        "model": reviewer,
                        "accepted": True,
                        "fatal": False,
                        "answer": answer,
                        "answerAccepted": True,
                        "answerFatal": False,
                        "explanationAccepted": True,
                        "explanationFatal": False,
                        "explanationNote": "结构化解析的四部分和三个干扰项理由均已独立核对。",
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
        choices = [
            f"{seed}-{index}-a",
            f"{seed}-{index}-b",
            f"{seed}-{index}-c",
            f"{seed}-{index}-d",
        ]
        answer_index = index % 4
        records.append(
            contract_v2.normalize_question(
                {
                    "level": level,
                    "section": "vocab",
                    "qtype": "kanji_reading",
                    "stem": f"{seed} {level} 漢字問題 {index}",
                    "passage": "",
                    "group": "",
                    "choices": choices,
                    "answerIndex": answer_index,
                    "explanation": _structured_explanation(
                        choices,
                        answer_index,
                        seed=f"{seed}-{level}-{index}",
                    ),
                    "difficulty": 3,
                    "theme": "release-test",
                }
            )
        )
    return records


def _distributed_release_records(
    level: str,
    count: int,
    *,
    seed: str,
    group: str,
) -> list[dict[str, object]]:
    contract_v2 = _contract_module()
    contract = contract_v2.load_contract()
    qtypes = [
        qtype
        for qtype in contract["generationGroups"][group]
        if qtype in contract["paperSpec"][level]
    ]
    records: list[dict[str, object]] = []
    for index in range(count):
        qtype = qtypes[index % len(qtypes)]
        spec = contract["qtypes"][qtype]
        token = hashlib.sha256(f"{seed}:{qtype}:{index}".encode("utf-8")).hexdigest()
        passage = ""
        legacy_group = ""
        if spec["groupMode"] == "atomic":
            group_index = index // (2 * len(qtypes))
            group_token = hashlib.sha256(
                f"{seed}:{qtype}:group:{group_index}".encode("utf-8")
            ).hexdigest()
            passage = f"{group_token} 原创文章。（1）（2）"
            legacy_group = f"{seed}-{qtype}-{group_index}"
        elif spec["groupMode"] == "single_script":
            passage = f"男：{token} 原创脚本。"
        choices = [
            hashlib.sha256(f"{token}:{suffix}".encode("utf-8")).hexdigest()
            for suffix in ("a", "b", "c", "d")
        ]
        records.append(
            contract_v2.normalize_question(
                _question(
                    level=level,
                    section=spec["section"],
                    qtype=qtype,
                    stem=f"{token} 問題",
                    passage=passage,
                    group=legacy_group,
                    choices=choices,
                    answerIndex=index % 4,
                    theme=f"theme-{index % 18}",
                )
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


def _question_set_sha256_for_runs(run_dirs: list[Path]) -> str:
    unique: dict[str, str] = {}
    for run_dir in run_dirs:
        records = json.loads((run_dir / "verified.json").read_text(encoding="utf-8"))
        for record in records:
            unique[record["id"]] = record["contentHash"]
    payload = [
        {"id": question_id, "contentHash": unique[question_id]}
        for question_id in sorted(unique)
    ]
    return hashlib.sha256(
        json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def _write_external_similarity_evidence(
    path: Path,
    run_dirs: list[Path],
    *,
    suffix: str = "",
) -> Path:
    contract_hash = hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()
    question_set_hash = _question_set_sha256_for_runs(run_dirs)
    checker_specs = {
        "embedding": (f"fixture-embedding-checker{suffix}", "embedding_checker"),
        "officialCorpus": (
            f"fixture-official-checker{suffix}",
            "official_corpus_checker",
        ),
    }
    private_keys: dict[str, Path] = {}
    public_entries: list[dict[str, object]] = []
    for kind, (key_id, role) in checker_specs.items():
        private_key, single_keyring, _ = _approval_material(
            path.parent,
            key_id=key_id,
            role=role,
        )
        private_keys[kind] = private_key
        public_entries.extend(
            json.loads(single_keyring.read_text(encoding="utf-8"))["keys"]
        )
    keyring = path.parent / f"similarity-checkers{suffix}-trusted-keys.json"
    _write_json_for_test(
        keyring,
        {"keyringVersion": 1, "keys": public_entries},
    )
    now = datetime.now(timezone.utc)
    issued_at = now - timedelta(minutes=1)
    expires_at = now + timedelta(hours=1)
    receipt_paths = {
        "embedding": path.parent / f"embedding-receipt{suffix}.json",
        "officialCorpus": path.parent / f"official-corpus-receipt{suffix}.json",
    }
    for kind, receipt_path in receipt_paths.items():
        _write_json_for_test(
            receipt_path,
            {
                "receiptVersion": 1,
                "checker": checker_specs[kind][0],
                "kind": kind,
                "questionSetSha256": question_set_hash,
                "result": "passed",
            },
        )

    def attestation(kind: str, **fields: object) -> dict[str, object]:
        receipt_path = receipt_paths[kind]
        component: dict[str, object] = {
            "kind": kind,
            "status": "passed-external",
            **fields,
            "receiptPath": str(receipt_path.resolve()),
            "receiptSha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
            "keyId": checker_specs[kind][0],
            "issuedAt": issued_at.isoformat(),
            "expiresAt": expires_at.isoformat(),
        }
        signed_component = {
            key: value
            for key, value in component.items()
            if key != "receiptPath"
        }
        signed_payload = {
            "attestationVersion": 1,
            "contractSha256": contract_hash,
            "questionSetSha256": question_set_hash,
            "checkedAt": now.isoformat(),
            "attestation": signed_component,
        }
        component["signatureBase64"] = base64.b64encode(
            _sign_payload(private_keys[kind], signed_payload)
        ).decode("ascii")
        return component

    _write_json_for_test(
        path,
        {
            "evidenceVersion": 1,
            "contractSha256": contract_hash,
            "questionSetSha256": question_set_hash,
            "checkedAt": now.isoformat(),
            "embedding": attestation(
                "embedding",
                provider="test-fixture",
                model="fixture-embedding-v1",
                indexSha256=hashlib.sha256(b"fixture-index").hexdigest(),
            ),
            "officialCorpus": attestation(
                "officialCorpus",
                checkerVersion="fixture-official-corpus-v1",
                corpusSha256=hashlib.sha256(b"fixture-corpus").hexdigest(),
            ),
        },
    )
    return keyring


def _reviewed_run(
    root: Path,
    *,
    name: str,
    level: str,
    records: list[dict[str, object]],
    wave: int,
    group: str = "lex",
) -> Path:
    run_dir = root / name
    provenance_path = root / f"{name}-provenance.json"
    _write_provenance(provenance_path, operator=name)
    initialized = _run_pipeline(
        "init-run", "--run-dir", str(run_dir), "--level", level,
        "--group", group, "--wave", str(wave), "--provenance", str(provenance_path),
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
                        "stepId": f"review-step-{reviewer}",
                        "model": reviewer,
                        "accepted": True,
                        "fatal": False,
                        "answer": record["choices"][record["answerIndex"]],
                        "answerAccepted": True,
                        "answerFatal": False,
                        "explanationAccepted": True,
                        "explanationFatal": False,
                        "explanationNote": "结构化解析的四部分和三个干扰项理由均已独立核对。",
                    }
                    for reviewer in ("blind-reviewer-a", "blind-reviewer-b")
                ],
            }
            for record in pending
        ],
        "issuedAt": "2026-07-22T02:00:00+09:00",
    }
    receipt_bytes = (
        json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8")
    receipt_sha256 = hashlib.sha256(receipt_bytes).hexdigest()
    for item, verdict in zip(verified, receipt["verdicts"], strict=True):
        item["provenanceEvidence"] = {
            "runId": manifest["runId"],
            "request": manifest["request"],
            "workflowSha256": manifest["workflow"]["sha256"],
            "authorStepId": manifest["provenance"]["authorStepId"],
            "authorModel": manifest["provenance"]["authorModel"],
        }
        item["reviewEvidence"] = {
            "receiptSha256": receipt_sha256,
            "issuedAt": receipt["issuedAt"],
            "reviews": copy.deepcopy(verdict["reviews"]),
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
        "sourceSha256": receipt_sha256,
        "reviewers": receipt["reviewers"],
        "issuedAt": receipt["issuedAt"],
    }
    manifest["metrics"] = metrics
    _write_json_for_test(run_dir / "manifest.json", manifest)
    return run_dir


def _release_ready_runs(
    root: Path,
    *,
    prefix: str,
) -> tuple[list[Path], dict[tuple[str, str], list[dict[str, object]]]]:
    runs: list[Path] = []
    records_by_run: dict[tuple[str, str], list[dict[str, object]]] = {}
    for level in ("N1", "N2"):
        for group, count in (("lex", 504), ("rc", 496)):
            records = _distributed_release_records(
                level,
                count,
                seed=f"{prefix}-{level.lower()}-{group}",
                group=group,
            )
            records_by_run[(level, group)] = records
            runs.append(
                _reviewed_run(
                    root,
                    name=f"{prefix}-{level.lower()}-{group}",
                    level=level,
                    records=records,
                    wave=1,
                    group=group,
                )
            )
    return runs, records_by_run


def _approval_material(
    root: Path,
    *,
    key_id: str = "fixture-key",
    role: str = "human_release_owner",
) -> tuple[Path, Path, Path]:
    private_key = root / f"{key_id}-private.pem"
    public_key = root / f"{key_id}-public.pem"
    keyring = root / f"{key_id}-trusted-keys.json"
    registry = root / "approval-consumptions.jsonl"
    generated = subprocess.run(
        ["openssl", "genpkey", "-algorithm", "ED25519", "-out", str(private_key)],
        text=True,
        capture_output=True,
        check=False,
    )
    if generated.returncode != 0:
        raise AssertionError(generated.stderr)
    exported = subprocess.run(
        ["openssl", "pkey", "-in", str(private_key), "-pubout", "-out", str(public_key)],
        text=True,
        capture_output=True,
        check=False,
    )
    if exported.returncode != 0:
        raise AssertionError(exported.stderr)
    _write_json_for_test(
        keyring,
        {
            "keyringVersion": 1,
            "keys": [
                {
                    "keyId": key_id,
                    "algorithm": "Ed25519",
                    "role": role,
                    "approvedBy": "human-release-owner",
                    "publicKeyPem": public_key.read_text(encoding="utf-8"),
                }
            ],
        },
    )
    return private_key, keyring, registry


def _sign_payload(private_key: Path, value: object) -> bytes:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    with tempfile.NamedTemporaryFile() as message:
        message.write(payload)
        message.flush()
        signed = subprocess.run(
            [
                "openssl",
                "pkeyutl",
                "-sign",
                "-rawin",
                "-inkey",
                str(private_key),
                "-in",
                message.name,
            ],
            capture_output=True,
            check=False,
        )
    if signed.returncode != 0:
        raise AssertionError(signed.stderr.decode("utf-8", errors="replace"))
    return signed.stdout


def _release_signature(
    release_dir: Path,
    *,
    decision: str,
    private_key: Path,
    key_id: str = "fixture-key",
    issued_at: datetime | None = None,
    expires_at: datetime | None = None,
    **updates: object,
) -> dict[str, object]:
    manifest = json.loads((release_dir / "manifest.json").read_text(encoding="utf-8"))
    issued_at = issued_at or (datetime.now(timezone.utc) - timedelta(minutes=1))
    expires_at = expires_at or (datetime.now(timezone.utc) + timedelta(hours=1))
    signature: dict[str, object] = {
        "signatureVersion": 1,
        "releaseId": manifest["releaseId"],
        "releaseNonce": manifest["releaseNonce"],
        "contractSha256": manifest["contract"]["sha256"],
        "candidateSha256": manifest["artifacts"]["candidate"]["sha256"],
        "similarityEvidenceSha256": manifest["artifacts"]["similarityEvidence"]["sha256"],
        "embeddingReceiptSha256": manifest["artifacts"]["embeddingReceipt"]["sha256"],
        "officialCorpusReceiptSha256": manifest["artifacts"]["officialCorpusReceipt"]["sha256"],
        "targetBeforeSha256": (
            manifest["target"]["observedSha256"]
            if decision == "publish"
            else manifest["publication"]["targetSha256"]
        ),
        "decision": decision,
        "keyId": key_id,
        "approvedBy": "human-release-owner",
        "issuedAt": issued_at.isoformat(),
        "expiresAt": expires_at.isoformat(),
    }
    signature.update(updates)
    signature["signatureBase64"] = base64.b64encode(
        _sign_payload(private_key, signature)
    ).decode("ascii")
    return signature


def _approval_cli(
    keyring: Path,
    registry: Path,
    checker_keyring: Path,
) -> list[str]:
    return [
        "--trusted-keys",
        str(keyring),
        "--approval-registry",
        str(registry),
        "--similarity-trusted-keys",
        str(checker_keyring),
    ]


def _resign_similarity_component(
    evidence_path: Path,
    *,
    kind: str,
    private_key: Path,
) -> None:
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    component = evidence[kind]
    signed_component = {
        key: value
        for key, value in component.items()
        if key not in {"receiptPath", "signatureBase64"}
    }
    signed_payload = {
        "attestationVersion": 1,
        "contractSha256": evidence["contractSha256"],
        "questionSetSha256": evidence["questionSetSha256"],
        "checkedAt": evidence["checkedAt"],
        "attestation": signed_component,
    }
    component["signatureBase64"] = base64.b64encode(
        _sign_payload(private_key, signed_payload)
    ).decode("ascii")
    _write_json_for_test(evidence_path, evidence)


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
            _question(
                explanation=_structured_explanation(
                    ["ため", "ので", "のに", "なら"],
                    1,
                    seed="different-explanation",
                )
            ),
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
            explanation={},
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
        conflict = copy.deepcopy(original)
        conflict["explanation"]["whyCorrect"] = (
            "冲突版本：结合完整句意，只有正确选项ので能满足接续、语义和语体要求。"
        )

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
        broken_field[0]["explanation"] = {}
        broken_group = copy.deepcopy(base)
        grouped = next(item for item in broken_group if item["qtype"] == "text_grammar")
        grouped["explanation"] = {}
        shortfall = copy.deepcopy(base[:-1])
        overfill = copy.deepcopy(base)
        text_members = [item for item in overfill if item["qtype"] == "text_grammar"]
        extra = copy.deepcopy(text_members[-1])
        extra["stem"] = "text grammar atomic overfill extra"
        extra["choices"] = ["extra-a", "extra-b", "extra-c", "extra-d"]
        extra["explanation"] = _structured_explanation(
            extra["choices"],
            extra["answerIndex"],
            seed="text-grammar-overfill-extra",
        )
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
            first_item = verified[0]
            self.assertEqual(manifest["runId"], first_item["provenanceEvidence"]["runId"])
            self.assertEqual(
                manifest["workflow"]["sha256"],
                first_item["provenanceEvidence"]["workflowSha256"],
            )
            self.assertEqual(
                manifest["receipt"]["sourceSha256"],
                first_item["reviewEvidence"]["receiptSha256"],
            )
            self.assertEqual(
                {"blind-reviewer-a", "blind-reviewer-b"},
                {review["reviewer"] for review in first_item["reviewEvidence"]["reviews"]},
            )
            self.assertTrue(
                all(review["answerAccepted"] for review in first_item["reviewEvidence"]["reviews"])
            )
            self.assertTrue(
                all(
                    review["explanationAccepted"]
                    for review in first_item["reviewEvidence"]["reviews"]
                )
            )

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
            receipt["verdicts"][3]["reviews"][0]["explanationAccepted"] = False
            receipt_path = root / "receipt.json"
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False), encoding="utf-8")

            process = _run_pipeline(
                "verify", "--run-dir", str(run_dir), "--receipt", str(receipt_path)
            )

            self.assertEqual(0, process.returncode, process.stderr)
            manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
            sanitized = json.loads((run_dir / "sanitized.json").read_text(encoding="utf-8"))
            verified = json.loads((run_dir / "verified.json").read_text(encoding="utf-8"))
            self.assertEqual(len(sanitized) - 4, len(verified))
            self.assertEqual(4, manifest["metrics"]["receiptRejected"])
            self.assertTrue(all(item["reviewStatus"] == "verified" for item in verified))


class ReleasePipelineTests(unittest.TestCase):
    def test_stage_deduplicates_verified_content_is_pending_and_preserves_target(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs, records_by_run = _release_ready_runs(root, prefix="release-stage")
            n1_records = records_by_run[("N1", "lex")]
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
                root,
                name="n1-duplicate",
                level="N1",
                records=[reordered_duplicate],
                wave=2,
                group="lex",
            )
            all_runs = [*runs, duplicate_run]
            release_dir = root / "release"
            target = root / "bank.json"
            target.write_bytes(b'{\n  "source": "jlptv2",\n  "questions": []\n}\n')
            before = target.read_bytes()
            similarity_evidence = root / "similarity-evidence.json"
            checker_keyring = _write_external_similarity_evidence(
                similarity_evidence, all_runs
            )
            command = (
                "stage", "--release-dir", str(release_dir), "--target", str(target),
                "--similarity-evidence", str(similarity_evidence),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in all_runs for value in ("--run-dir", str(run_dir))],
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
                "--similarity-evidence", str(similarity_evidence),
                "--similarity-trusted-keys", str(checker_keyring),
                *[
                    value
                    for run_dir in reversed(all_runs)
                    for value in ("--run-dir", str(run_dir))
                ],
            )
            self.assertEqual(0, reversed_stage.returncode, reversed_stage.stderr)
            reversed_manifest = json.loads(
                (reversed_release / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                tracked["candidate.json"],
                (reversed_release / "candidate.json").read_bytes(),
            )
            self.assertNotEqual(manifest["releaseNonce"], reversed_manifest["releaseNonce"])
            self.assertNotEqual(manifest["releaseId"], reversed_manifest["releaseId"])

    def test_stage_rejects_tampering_identity_conflicts_and_release_shortfall_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "bank.json"
            target.write_text('{"source":"jlptv2","questions":[]}\n', encoding="utf-8")
            target_before = target.read_bytes()
            one = _release_records("N1", 1, seed="conflict")
            conflict_raw = copy.deepcopy({
                key: value
                for key, value in one[0].items()
                if key not in {"id", "groupId", "contentHash", "source", "reviewStatus"}
            })
            conflict_raw["explanation"]["whyCorrect"] = (
                "different reviewed explanation: only the selected choice "
                f"{conflict_raw['choices'][conflict_raw['answerIndex']]} satisfies the full context"
            )
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
            runs, _ = _release_ready_runs(root, prefix="publish")
            private_key, keyring, registry = _approval_material(root)
            similarity_evidence = root / "similarity-evidence.json"
            checker_keyring = _write_external_similarity_evidence(similarity_evidence, runs)
            target = root / "bank.json"
            original = b'{\n "source": "jlptv2", "questions": [{"id":"prior"}]\n}\n'
            target.write_bytes(original)
            release_dir = root / "release"
            staged = _run_pipeline(
                "stage", "--release-dir", str(release_dir), "--target", str(target),
                "--similarity-evidence", str(similarity_evidence),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )
            self.assertEqual(0, staged.returncode, staged.stderr)

            missing = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(root / "missing-signature.json"),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, missing.returncode)
            self.assertEqual(original, target.read_bytes())
            malformed_path = root / "malformed-signature.json"
            malformed_path.write_text("{not-json", encoding="utf-8")
            malformed = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(malformed_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, malformed.returncode)
            self.assertEqual(original, target.read_bytes())
            mismatch_path = root / "mismatch-signature.json"
            _write_json_for_test(
                mismatch_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=private_key,
                    candidateSha256="0" * 64,
                ),
            )
            mismatch = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(mismatch_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, mismatch.returncode)
            self.assertIn('"code": "signature_invalid"', mismatch.stderr)
            self.assertEqual(original, target.read_bytes())

            signature_path = root / "publish-signature.json"
            _write_json_for_test(
                signature_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=private_key,
                ),
            )
            target.write_bytes(original + b"changed")
            changed = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(signature_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, changed.returncode)
            self.assertIn('"code": "target_changed"', changed.stderr)
            target.write_bytes(original)

            published = _run_pipeline(
                "publish", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(signature_path),
                *_approval_cli(keyring, registry, checker_keyring),
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
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(0, publish_resume.returncode, publish_resume.stderr)
            self.assertTrue(json.loads(publish_resume.stdout)["resumed"])
            self.assertEqual(published_bytes, target.read_bytes())

            rollback_mismatch_path = root / "rollback-mismatch.json"
            rollback_missing = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(root / "missing-rollback-signature.json"),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, rollback_missing.returncode)
            self.assertEqual(published_bytes, target.read_bytes())
            _write_json_for_test(
                rollback_mismatch_path,
                _release_signature(
                    release_dir,
                    decision="rollback",
                    private_key=private_key,
                    targetBeforeSha256="0" * 64,
                ),
            )
            rollback_mismatch = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_mismatch_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, rollback_mismatch.returncode)
            self.assertEqual(published_bytes, target.read_bytes())
            rollback_path = root / "rollback-signature.json"
            _write_json_for_test(
                rollback_path,
                _release_signature(
                    release_dir,
                    decision="rollback",
                    private_key=private_key,
                ),
            )
            target.write_bytes(published_bytes + b"tampered")
            tampered = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(2, tampered.returncode)
            self.assertIn('"code": "target_changed"', tampered.stderr)
            target.write_bytes(published_bytes)
            rolled_back = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
                *_approval_cli(keyring, registry, checker_keyring),
            )
            self.assertEqual(0, rolled_back.returncode, rolled_back.stderr)
            self.assertEqual(original, target.read_bytes())
            rollback_resume = _run_pipeline(
                "rollback", "--release-dir", str(release_dir), "--target", str(target),
                "--signature", str(rollback_path),
                *_approval_cli(keyring, registry, checker_keyring),
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
                "--target", str(mock_candidate_target),
                "--similarity-evidence", str(similarity_evidence),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
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
                _release_signature(
                    mock_candidate_release,
                    decision="publish",
                    private_key=private_key,
                ),
            )
            mock_candidate_publish = _run_pipeline(
                "publish", "--release-dir", str(mock_candidate_release),
                "--target", str(mock_candidate_target),
                "--signature", str(mock_candidate_signature),
                *_approval_cli(keyring, registry, checker_keyring),
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
                    "--target", str(legacy_target),
                    "--similarity-evidence", str(similarity_evidence),
                    "--similarity-trusted-keys", str(checker_keyring),
                    *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
                )
                self.assertEqual(0, legacy_stage.returncode, legacy_stage.stderr)
                legacy_signature = root / f"signature-{name}"
                _write_json_for_test(
                    legacy_signature,
                    _release_signature(
                        legacy_release,
                        decision="publish",
                        private_key=private_key,
                    ),
                )
                refused = _run_pipeline(
                    "publish", "--release-dir", str(legacy_release),
                    "--target", str(legacy_target), "--signature", str(legacy_signature),
                    *_approval_cli(keyring, registry, checker_keyring),
                )
                self.assertEqual(2, refused.returncode)
                self.assertIn('"code": "target_protected"', refused.stderr)
                self.assertEqual(legacy_before, legacy_target.read_bytes())


class AdversarialTrustBoundaryTests(unittest.TestCase):
    def test_public_key_fingerprint_is_canonical_subject_public_key_info_der(self) -> None:
        pipeline_v2 = _pipeline_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, keyring_path, _ = _approval_material(root)
            keyring = json.loads(keyring_path.read_text(encoding="utf-8"))
            public_key_pem = keyring["keys"][0]["publicKeyPem"]
            converted = subprocess.run(
                ["openssl", "pkey", "-pubin", "-outform", "DER"],
                input=public_key_pem.encode("utf-8"),
                capture_output=True,
                check=False,
            )
            self.assertEqual(0, converted.returncode, converted.stderr)

            self.assertEqual(
                hashlib.sha256(converted.stdout).hexdigest(),
                pipeline_v2._ed25519_public_key_fingerprint(public_key_pem),
            )

    def _release_runs(self, root: Path) -> list[Path]:
        runs = []
        for level in ("N1", "N2"):
            for group, count in (("lex", 504), ("rc", 496)):
                runs.append(
                    _reviewed_run(
                        root,
                        name=f"adversarial-{level.lower()}-{group}",
                        level=level,
                        records=_distributed_release_records(
                            level,
                            count,
                            seed=f"adversarial-{level.lower()}-{group}",
                            group=group,
                        ),
                        wave=1,
                        group=group,
                    )
                )
        return runs

    def _staged_release(self, root: Path, *, target_payload: object | None = None) -> tuple[Path, Path]:
        self.private_key, self.keyring, self.registry = _approval_material(root)
        runs = self._release_runs(root)
        target = root / "bank.json"
        _write_json_for_test(
            target,
            target_payload if target_payload is not None else {"source": "jlptv2", "questions": []},
        )
        release_dir = root / "release"
        similarity_evidence = root / "similarity-evidence.json"
        self.checker_keyring = _write_external_similarity_evidence(
            similarity_evidence, runs
        )
        staged = _run_pipeline(
            "stage",
            "--release-dir", str(release_dir),
            "--target", str(target),
            "--similarity-evidence", str(similarity_evidence),
            "--similarity-trusted-keys", str(self.checker_keyring),
            *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
        )
        self.assertEqual(0, staged.returncode, staged.stderr)
        return release_dir, target

    def test_stage_requires_external_embedding_and_official_corpus_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = self._release_runs(root)
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            release_dir = root / "release"

            staged = _run_pipeline(
                "stage",
                "--release-dir", str(release_dir),
                "--target", str(target),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )

            self.assertEqual(2, staged.returncode, staged.stdout)
            self.assertIn('"code": "external_similarity_gate_required"', staged.stderr)
            self.assertFalse(release_dir.exists())

    def test_self_reported_similarity_status_and_placeholder_hashes_cannot_unlock_stage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = self._release_runs(root)
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            _, checker_keyring, _ = _approval_material(root, key_id="unrelated-checker")
            fake_evidence = root / "self-reported-evidence.json"
            _write_json_for_test(
                fake_evidence,
                {
                    "evidenceVersion": 1,
                    "contractSha256": hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest(),
                    "questionSetSha256": _question_set_sha256_for_runs(runs),
                    "checkedAt": datetime.now(timezone.utc).isoformat(),
                    "embedding": {
                        "status": "passed-external",
                        "provider": "self-report",
                        "model": "self-report",
                        "indexSha256": "1" * 64,
                        "receiptSha256": "2" * 64,
                    },
                    "officialCorpus": {
                        "status": "passed-external",
                        "checkerVersion": "self-report",
                        "corpusSha256": "3" * 64,
                        "receiptSha256": "4" * 64,
                    },
                },
            )

            staged = _run_pipeline(
                "stage",
                "--release-dir", str(root / "release"),
                "--target", str(target),
                "--similarity-evidence", str(fake_evidence),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )

            self.assertEqual(2, staged.returncode, staged.stdout)
            self.assertIn('"code": "external_similarity_gate_invalid"', staged.stderr)
            self.assertFalse((root / "release").exists())

    def test_stage_rejects_checkers_that_share_a_public_key_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = self._release_runs(root)
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            evidence_path = root / "shared-checker-key-evidence.json"
            checker_keyring = _write_external_similarity_evidence(evidence_path, runs)
            keyring = json.loads(checker_keyring.read_text(encoding="utf-8"))
            entries = {entry["role"]: entry for entry in keyring["keys"]}
            entries["official_corpus_checker"]["publicKeyPem"] = entries[
                "embedding_checker"
            ]["publicKeyPem"]
            _write_json_for_test(checker_keyring, keyring)
            _resign_similarity_component(
                evidence_path,
                kind="officialCorpus",
                private_key=root / "fixture-embedding-checker-private.pem",
            )

            staged = _run_pipeline(
                "stage",
                "--release-dir", str(root / "release"),
                "--target", str(target),
                "--similarity-evidence", str(evidence_path),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )

            self.assertEqual(2, staged.returncode, staged.stdout)
            self.assertIn('"code": "external_similarity_gate_invalid"', staged.stderr)
            self.assertIn("distinct public keys", staged.stderr)
            self.assertFalse((root / "release").exists())

    def test_checker_role_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = self._release_runs(root)
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            evidence_path = root / "wrong-role-evidence.json"
            checker_keyring = _write_external_similarity_evidence(evidence_path, runs)
            keyring = json.loads(checker_keyring.read_text(encoding="utf-8"))
            embedding = next(
                entry for entry in keyring["keys"] if entry["role"] == "embedding_checker"
            )
            embedding["role"] = "human_release_owner"
            _write_json_for_test(checker_keyring, keyring)

            staged = _run_pipeline(
                "stage",
                "--release-dir", str(root / "release"),
                "--target", str(target),
                "--similarity-evidence", str(evidence_path),
                "--similarity-trusted-keys", str(checker_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )

            self.assertEqual(2, staged.returncode, staged.stdout)
            self.assertIn('"code": "external_similarity_gate_invalid"', staged.stderr)
            self.assertIn("expected 'embedding_checker'", staged.stderr)
            self.assertFalse((root / "release").exists())

    def test_human_approval_cannot_reuse_a_current_checker_key_in_the_same_keyring(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = self._release_runs(root)
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            evidence_path = root / "shared-human-key-evidence.json"
            checker_keyring = _write_external_similarity_evidence(evidence_path, runs)
            combined = json.loads(checker_keyring.read_text(encoding="utf-8"))
            embedding = next(
                entry for entry in combined["keys"] if entry["role"] == "embedding_checker"
            )
            combined["keys"].append(
                {
                    "keyId": "human-alias-of-embedding-checker",
                    "algorithm": "Ed25519",
                    "role": "human_release_owner",
                    "approvedBy": "human-release-owner",
                    "publicKeyPem": embedding["publicKeyPem"],
                }
            )
            combined_keyring = root / "combined-trusted-keys.json"
            _write_json_for_test(combined_keyring, combined)
            release_dir = root / "release"
            staged = _run_pipeline(
                "stage",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--similarity-evidence", str(evidence_path),
                "--similarity-trusted-keys", str(combined_keyring),
                *[value for run_dir in runs for value in ("--run-dir", str(run_dir))],
            )
            self.assertEqual(0, staged.returncode, staged.stderr)
            signature_path = root / "shared-key-publish-signature.json"
            _write_json_for_test(
                signature_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=root / "fixture-embedding-checker-private.pem",
                    key_id="human-alias-of-embedding-checker",
                ),
            )
            before = target.read_bytes()

            refused = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(signature_path),
                *_approval_cli(
                    combined_keyring,
                    root / "approval-consumptions.jsonl",
                    combined_keyring,
                ),
            )

            self.assertEqual(2, refused.returncode, refused.stdout)
            self.assertIn('"code": "signature_role_conflict"', refused.stderr)
            self.assertEqual(before, target.read_bytes())

    def test_replacing_similarity_evidence_invalidates_the_existing_human_approval(self) -> None:
        pipeline_v2 = _pipeline_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_dir, target = self._staged_release(root)
            approval_path = root / "publish-signature.json"
            approval = _release_signature(
                release_dir,
                decision="publish",
                private_key=self.private_key,
            )
            _write_json_for_test(approval_path, approval)
            expected = {
                key: str(approval[key])
                for key in (
                    "releaseId",
                    "releaseNonce",
                    "contractSha256",
                    "candidateSha256",
                    "similarityEvidenceSha256",
                    "embeddingReceiptSha256",
                    "officialCorpusReceiptSha256",
                    "targetBeforeSha256",
                )
            }
            expected["embeddingReceiptSha256"] = "f" * 64

            with self.assertRaisesRegex(pipeline_v2.PipelineError, "does not match"):
                pipeline_v2._validated_signature(
                    approval_path,
                    decision="publish",
                    expected=expected,
                    trusted_keys_path=self.keyring,
                )

            before = target.read_bytes()
            evidence_path = release_dir / "similarity_evidence.json"
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            evidence["embedding"]["model"] = "tampered-after-approval"
            _write_json_for_test(evidence_path, evidence)
            refused = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(approval_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )
            self.assertEqual(2, refused.returncode, refused.stdout)
            self.assertIn('"code": "artifact_tampered"', refused.stderr)
            self.assertEqual(before, target.read_bytes())

    def test_exact_dedupe_cannot_leave_a_text_grammar_singleton(self) -> None:
        contract_v2 = _contract_module()

        def grouped(group: str, passage: str, stem: str) -> dict[str, object]:
            return _question(
                qtype="text_grammar",
                passage=passage,
                group=group,
                stem=stem,
            )

        duplicate = grouped("a", "文章A。（1）（2）", "A-1")
        result = contract_v2.sanitize_pool(
            [
                duplicate,
                copy.deepcopy(duplicate),
                grouped("b", "文章B。（1）（2）", "B-1"),
                grouped("b", "文章B。（1）（2）", "B-2"),
                grouped("c", "文章C。（1）（2）", "C-1"),
                grouped("c", "文章C。（1）（2）", "C-2"),
            ],
            expected_level="N1",
            expected_group="lex",
        )
        group_sizes: dict[str, int] = {}
        for record in result["records"]:
            group_id = record["groupId"]
            group_sizes[group_id] = group_sizes.get(group_id, 0) + 1

        self.assertNotIn(1, group_sizes.values(), result)
        self.assertTrue(result["fatal"], result)

    def test_one_word_explanation_cannot_enter_the_v2_contract(self) -> None:
        contract_v2 = _contract_module()

        with self.assertRaises(contract_v2.QuestionValidationError):
            contract_v2.normalize_question(_question(explanation="短"))

    def test_eight_character_placeholder_explanation_cannot_pass_as_detailed(self) -> None:
        contract_v2 = _contract_module()
        choices = ["ため", "ので", "のに", "なら"]
        placeholder = {
            "correctAnswerMeaningUsage": "ので正确答案占位说明",
            "knowledgePoint": "知识要点占位说明文字",
            "whyCorrect": "因为ので正确占位说明",
            "distractorReasons": [
                {"choice": choice, "reason": f"{choice}错误原因占位说明"}
                for choice in ("ため", "のに", "なら")
            ],
        }

        with self.assertRaises(contract_v2.QuestionValidationError) as raised:
            contract_v2.normalize_question(
                _question(choices=choices, answerIndex=1, explanation=placeholder)
            )

        self.assertIn("explanation", str(raised.exception))

    def test_deterministic_fuzzy_gate_rejects_a_near_duplicate(self) -> None:
        contract_v2 = _contract_module()
        pipeline_v2 = _pipeline_module()
        first = contract_v2.normalize_question(
            _question(stem="会議が終わる（　）、資料を提出してください。")
        )
        second = contract_v2.normalize_question(
            _question(stem="会議が終了する（　）、資料を提出してください。")
        )

        issues = pipeline_v2._fuzzy_similarity_issues([first, second])

        self.assertEqual("fuzzy_duplicate", issues[0]["code"])
        self.assertEqual({first["id"], second["id"]}, set(issues[0]["questionIds"]))

    def test_single_qtype_cannot_satisfy_the_n1_n2_release_floor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            n1_run = _reviewed_run(
                root,
                name="single-n1",
                level="N1",
                records=_release_records("N1", 1000, seed="single-n1"),
                wave=1,
            )
            n2_run = _reviewed_run(
                root,
                name="single-n2",
                level="N2",
                records=_release_records("N2", 1000, seed="single-n2"),
                wave=1,
            )
            target = root / "bank.json"
            _write_json_for_test(target, {"source": "jlptv2", "questions": []})
            release_dir = root / "release"
            staged = _run_pipeline(
                "stage",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--run-dir", str(n1_run),
                "--run-dir", str(n2_run),
            )

            self.assertEqual(2, staged.returncode, staged.stdout)
            self.assertIn('"code": "release_distribution_shortfall"', staged.stderr)
            self.assertFalse(release_dir.exists())

    def test_plain_json_approval_cannot_be_reused_across_release_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_a, target = self._staged_release(root)
            run_dirs = sorted(path for path in root.glob("adversarial-*-*") if path.is_dir())
            release_b = root / "release-b"
            similarity_evidence = root / "similarity-evidence.json"
            staged_b = _run_pipeline(
                "stage",
                "--release-dir", str(release_b),
                "--target", str(target),
                "--similarity-evidence", str(similarity_evidence),
                "--similarity-trusted-keys", str(self.checker_keyring),
                *[value for run_dir in run_dirs for value in ("--run-dir", str(run_dir))],
            )
            self.assertEqual(0, staged_b.returncode, staged_b.stderr)
            signature_path = root / "approval-from-a.json"
            _write_json_for_test(
                signature_path,
                _release_signature(
                    release_a,
                    decision="publish",
                    private_key=self.private_key,
                ),
            )

            reused = _run_pipeline(
                "publish",
                "--release-dir", str(release_b),
                "--target", str(target),
                "--signature", str(signature_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )

            self.assertEqual(2, reused.returncode, reused.stdout)
            self.assertIn('"code": "signature_invalid"', reused.stderr)

    def test_ed25519_approval_rejects_unknown_expired_and_consumed_signatures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_dir, target = self._staged_release(root)
            before = target.read_bytes()
            linked_runs = sorted(path for path in root.glob("adversarial-*-*") if path.is_dir())
            self.assertTrue(linked_runs)
            for run_dir in linked_runs:
                run_manifest = json.loads(
                    (run_dir / "manifest.json").read_text(encoding="utf-8")
                )
                self.assertEqual("staged", run_manifest["state"])
                self.assertEqual("staged", run_manifest["releaseLinks"][0]["state"])

            unknown_path = root / "unknown-key-signature.json"
            _write_json_for_test(
                unknown_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=self.private_key,
                    key_id="unknown-key",
                ),
            )
            unknown = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(unknown_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )
            self.assertEqual(2, unknown.returncode, unknown.stdout)
            self.assertIn('"code": "signature_unknown_key"', unknown.stderr)
            self.assertEqual(before, target.read_bytes())

            now = datetime.now(timezone.utc)
            expired_path = root / "expired-signature.json"
            _write_json_for_test(
                expired_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=self.private_key,
                    issued_at=now - timedelta(hours=2),
                    expires_at=now - timedelta(hours=1),
                ),
            )
            expired = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(expired_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )
            self.assertEqual(2, expired.returncode, expired.stdout)
            self.assertIn('"code": "signature_expired"', expired.stderr)
            self.assertEqual(before, target.read_bytes())

            approval_path = root / "valid-signature.json"
            approval = _release_signature(
                release_dir,
                decision="publish",
                private_key=self.private_key,
            )
            _write_json_for_test(approval_path, approval)
            published = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(approval_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )
            self.assertEqual(0, published.returncode, published.stderr)
            for run_dir in linked_runs:
                run_manifest = json.loads(
                    (run_dir / "manifest.json").read_text(encoding="utf-8")
                )
                self.assertEqual("published", run_manifest["state"])
                self.assertEqual("published", run_manifest["releaseLinks"][0]["state"])
            registry_before = self.registry.read_bytes()
            events = [json.loads(line) for line in registry_before.splitlines()]
            self.assertEqual(["reserved", "consumed"], [event["event"] for event in events])

            copied_release = root / "copied-release"
            shutil.copytree(release_dir, copied_release)
            replayed = _run_pipeline(
                "publish",
                "--release-dir", str(copied_release),
                "--target", str(target),
                "--signature", str(approval_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )
            self.assertEqual(2, replayed.returncode, replayed.stdout)
            self.assertIn('"code": "signature_reused"', replayed.stderr)
            self.assertEqual(registry_before, self.registry.read_bytes())

    def test_publish_compare_and_swap_preserves_a_concurrent_target_update(self) -> None:
        pipeline_v2 = _pipeline_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_dir, target = self._staged_release(root)
            signature_path = root / "publish-signature.json"
            _write_json_for_test(
                signature_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=self.private_key,
                ),
            )
            concurrent = b'{"source":"jlptv2","questions":[{"id":"concurrent-update"}]}\n'
            original_write = pipeline_v2._write_bytes_atomic

            def raced_write(
                path: Path,
                payload: bytes,
                *,
                expected_sha256: str | None = None,
            ) -> None:
                if Path(path).resolve() == target.resolve():
                    target.write_bytes(concurrent)
                original_write(Path(path), payload, expected_sha256=expected_sha256)

            pipeline_v2._write_bytes_atomic = raced_write
            self.addCleanup(setattr, pipeline_v2, "_write_bytes_atomic", original_write)

            with self.assertRaisesRegex(pipeline_v2.PipelineError, "target"):
                pipeline_v2.publish_release(
                    release_dir=release_dir,
                    target_path=target,
                    signature_path=signature_path,
                    trusted_keys_path=self.keyring,
                    similarity_trusted_keys_path=self.checker_keyring,
                    approval_registry_path=self.registry,
                )

            self.assertEqual(concurrent, target.read_bytes())

    def test_rollback_compare_and_swap_preserves_a_concurrent_target_update(self) -> None:
        pipeline_v2 = _pipeline_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_dir, target = self._staged_release(root)
            publish_signature = root / "publish-signature.json"
            _write_json_for_test(
                publish_signature,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=self.private_key,
                ),
            )
            pipeline_v2.publish_release(
                release_dir=release_dir,
                target_path=target,
                signature_path=publish_signature,
                trusted_keys_path=self.keyring,
                similarity_trusted_keys_path=self.checker_keyring,
                approval_registry_path=self.registry,
            )
            published_bytes = target.read_bytes()
            rollback_signature = root / "rollback-signature.json"
            _write_json_for_test(
                rollback_signature,
                _release_signature(
                    release_dir,
                    decision="rollback",
                    private_key=self.private_key,
                ),
            )
            concurrent = b'{"source":"jlptv2","questions":[{"id":"concurrent-update"}]}\n'
            original_write = pipeline_v2._write_bytes_atomic

            def raced_write(
                path: Path,
                payload: bytes,
                *,
                expected_sha256: str | None = None,
            ) -> None:
                if Path(path).resolve() == target.resolve():
                    target.write_bytes(concurrent)
                original_write(Path(path), payload, expected_sha256=expected_sha256)

            pipeline_v2._write_bytes_atomic = raced_write
            self.addCleanup(setattr, pipeline_v2, "_write_bytes_atomic", original_write)

            with self.assertRaisesRegex(pipeline_v2.PipelineError, "target"):
                pipeline_v2.rollback_release(
                    release_dir=release_dir,
                    target_path=target,
                    signature_path=rollback_signature,
                    trusted_keys_path=self.keyring,
                    similarity_trusted_keys_path=self.checker_keyring,
                    approval_registry_path=self.registry,
                )

            self.assertEqual(concurrent, target.read_bytes())
            pipeline_v2._write_bytes_atomic = original_write
            target.write_bytes(published_bytes)
            resumed = pipeline_v2.rollback_release(
                release_dir=release_dir,
                target_path=target,
                signature_path=rollback_signature,
                trusted_keys_path=self.keyring,
                similarity_trusted_keys_path=self.checker_keyring,
                approval_registry_path=self.registry,
            )
            self.assertFalse(resumed["resumed"])
            for reference in json.loads(
                (release_dir / "manifest.json").read_text(encoding="utf-8")
            )["runs"]:
                run_manifest = json.loads(
                    (Path(reference["path"]) / "manifest.json").read_text(encoding="utf-8")
                )
                self.assertEqual("rolled_back", run_manifest["state"])
                link = next(
                    item
                    for item in run_manifest["releaseLinks"]
                    if item["releaseId"]
                    == json.loads(
                        (release_dir / "manifest.json").read_text(encoding="utf-8")
                    )["releaseId"]
                )
                self.assertEqual("rolled_back", link["state"])

    def test_renamed_target_with_mockv1_ids_is_content_protected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release_dir, target = self._staged_release(
                root,
                target_payload={
                    "source": "legacy-custom",
                    "questions": [{"id": "mockv1-n1-0001"}],
                },
            )
            signature_path = root / "publish-signature.json"
            _write_json_for_test(
                signature_path,
                _release_signature(
                    release_dir,
                    decision="publish",
                    private_key=self.private_key,
                ),
            )
            before = target.read_bytes()

            refused = _run_pipeline(
                "publish",
                "--release-dir", str(release_dir),
                "--target", str(target),
                "--signature", str(signature_path),
                *_approval_cli(self.keyring, self.registry, self.checker_keyring),
            )

            self.assertEqual(2, refused.returncode, refused.stdout)
            self.assertIn('"code": "target_protected"', refused.stderr)
            self.assertEqual(before, target.read_bytes())


class LegacyAuditTests(unittest.TestCase):
    def test_tracked_n1_legacy_audit_is_deterministic_read_only_and_keeps_quality_counts_zero(self) -> None:
        source = REPO_ROOT / "data" / "jlpt_gen_pool" / "N1-lex.json"
        source_before = source.read_bytes()
        source_hash = hashlib.sha256(source_before).hexdigest()
        self.assertEqual(
            "ab6da7ee64c39b799b49b36e90ecaec089bb951ca0698fd215aeb2342c50adcc",
            source_hash,
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first_report = root / "audit-first.json"
            second_report = root / "audit-second.json"
            first = _run_pipeline(
                "audit-legacy", "--source", str(source), "--report", str(first_report)
            )
            second = _run_pipeline(
                "audit-legacy", "--source", str(source), "--report", str(second_report)
            )

            self.assertEqual(0, first.returncode, first.stderr)
            self.assertEqual(0, second.returncode, second.stderr)
            self.assertEqual(first_report.read_bytes(), second_report.read_bytes())
            self.assertEqual(source_before, source.read_bytes())
            report = json.loads(first_report.read_text(encoding="utf-8"))
            self.assertEqual(source_hash, report["source"]["sha256"])
            self.assertEqual(
                "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
                report["conversionDryRun"]["sha256"],
            )
            self.assertEqual(
                {
                    "raw": 1039,
                    "sanitized": 0,
                    "unique": 0,
                    "verified": 0,
                    "approved": 0,
                    "staged": 0,
                },
                report["evidenceCounts"],
            )
            self.assertEqual(
                {
                    "context": 169,
                    "grammar_form": 260,
                    "kanji_reading": 142,
                    "paraphrase": 130,
                    "sentence_assembly": 124,
                    "text_grammar": 111,
                    "usage": 103,
                },
                report["structure"]["byQtype"],
            )
            self.assertEqual(111, report["structure"]["legacyGroupedItems"])
            self.assertEqual(34, report["structure"]["legacyUniqueGroups"])
            self.assertEqual(0, report["structure"]["v2UniqueGroupIds"])
            self.assertEqual(0, report["deduplication"]["duplicateExact"])
            self.assertEqual(0, report["deduplication"]["identityConflicts"])
            self.assertEqual(1039, report["rejections"]["count"])
            self.assertEqual(
                {"atomic_group_rejected": 111, "explanation_structure": 1039},
                report["rejections"]["byReason"],
            )
            self.assertEqual("missing", report["coverage"]["N1"]["rc"]["status"])
            self.assertEqual(0, report["coverage"]["N1"]["rc"]["raw"])
            self.assertEqual("missing", report["coverage"]["N2"]["lex"]["status"])
            self.assertEqual("missing", report["coverage"]["N2"]["rc"]["status"])
            self.assertFalse(report["qualityEvidence"]["provenancePresent"])
            self.assertFalse(report["qualityEvidence"]["receiptPresent"])
            self.assertFalse(report["qualityEvidence"]["humanSignaturePresent"])
            self.assertEqual("pending", report["qualityEvidence"]["reviewStatus"])
            self.assertEqual(
                {
                    "run": False,
                    "receipt": False,
                    "convertedBank": False,
                    "candidate": False,
                    "publishedBank": False,
                },
                report["artifactsCreated"],
            )
            self.assertEqual(
                {"audit-first.json", "audit-second.json"},
                {path.name for path in root.iterdir()},
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
