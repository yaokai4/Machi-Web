#!/usr/bin/env python3
"""Fail-closed, resumable trust pipeline for JLPT v2 question artifacts."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from atomic_json import dump_json_atomic
from jlpt_contract_v2 import (
    CONTRACT_PATH,
    ContractError,
    canonical_text,
    contract_sha256,
    load_contract,
    sanitize_pool,
    validate_json_schema,
    validate_run_request,
)


WORKFLOW_PATH = Path(__file__).with_name("jlpt_bank_gen_v2.js")
REPO_ROOT = Path(__file__).resolve().parents[2]
_INTEGER = re.compile(r"[0-9]+")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_RUN_ARTIFACT_FILENAMES = {
    "request": "request.json",
    "raw": "raw.json",
    "sanitized": "sanitized.json",
    "rejected": "rejected.json",
    "metrics": "metrics.json",
    "receipt": "receipt.json",
    "verified": "verified.json",
    "reviewMetrics": "review_metrics.json",
}


class PipelineError(ValueError):
    def __init__(self, code: str, message: str, *, details: Any = None):
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


class _JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise PipelineError("cli_invalid", message)


def _json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _pretty_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    try:
        return _sha256_bytes(path.read_bytes())
    except OSError as error:
        raise PipelineError("file_unreadable", f"cannot read {path}: {error}") from error


def _load_json(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PipelineError("json_unreadable", f"{label} is unreadable: {error}") from error


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    dump_json_atomic(str(path), value, ensure_ascii=False, indent=2)


def _write_bytes_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    temporary = Path(temporary_name)
    open_descriptor: int | None = descriptor
    try:
        with os.fdopen(descriptor, "wb") as output:
            open_descriptor = None
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except BaseException:
        if open_descriptor is not None:
            os.close(open_descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def _artifact(path: Path, *, count: int | None = None) -> dict[str, Any]:
    payload = path.read_bytes()
    result: dict[str, Any] = {
        "path": path.name,
        "sha256": _sha256_bytes(payload),
        "bytes": len(payload),
    }
    if count is not None:
        result["count"] = count
    return result


def _ensure_json_artifact(path: Path, value: Any) -> None:
    if path.exists():
        if _load_json(path, label=path.name) != value:
            raise PipelineError("artifact_collision", f"existing {path.name} has different content")
        return
    _write_json(path, value)


def _parse_wave(raw: str) -> int:
    if not _INTEGER.fullmatch(raw):
        raise PipelineError("run_invalid", "wave must be an integer from 1 through 9999")
    return int(raw)


def _validated_provenance(path: Path, contract: dict[str, Any]) -> dict[str, Any]:
    provenance = _load_json(path, label="provenance")
    validate_json_schema(provenance, contract["provenanceSchema"], path="$.provenance")
    workflow_hash = _sha256_file(WORKFLOW_PATH)
    if provenance["workflowSha256"] != workflow_hash:
        raise PipelineError("provenance_mismatch", "provenance workflowSha256 does not match workflow")
    return provenance


def _expected_init(
    *, level: str, group: str, wave: str, provenance_path: Path
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    contract = load_contract()
    request = validate_run_request(
        {"level": level, "group": group, "wave": _parse_wave(wave)}
    )
    provenance = _validated_provenance(provenance_path, contract)
    contract_hash = contract_sha256()
    workflow_hash = _sha256_file(WORKFLOW_PATH)
    request_artifact = {
        **request,
        "contractVersion": contract["contractVersion"],
        "contractSha256": contract_hash,
        "contract": contract,
        "provenance": provenance,
    }
    identity = {
        "request": request,
        "contractSha256": contract_hash,
        "workflowSha256": workflow_hash,
        "provenance": provenance,
    }
    run_hash = _sha256_bytes(_json_bytes(identity))
    run_id = f"jlptv2-{request['level'].lower()}-{request['group']}-w{request['wave']:04d}-{run_hash[:12]}"
    manifest = {
        "manifestVersion": 2,
        "runId": run_id,
        "state": "initialized",
        "request": request,
        "contract": {
            "version": contract["contractVersion"],
            "path": CONTRACT_PATH.name,
            "sha256": contract_hash,
        },
        "workflow": {
            "path": WORKFLOW_PATH.name,
            "sha256": workflow_hash,
        },
        "provenance": provenance,
        "source": None,
        "receipt": None,
        "artifacts": {},
        "metrics": {
            "raw": 0,
            "sanitized": 0,
            "unique": 0,
            "rejected": 0,
            "verified": 0,
        },
    }
    return request_artifact, manifest, identity


def init_run(
    *, run_dir: Path, level: str, group: str, wave: str, provenance_path: Path
) -> dict[str, Any]:
    request_artifact, expected_manifest, _ = _expected_init(
        level=level,
        group=group,
        wave=wave,
        provenance_path=provenance_path,
    )
    manifest_path = run_dir / "manifest.json"
    request_path = run_dir / "request.json"
    if manifest_path.exists():
        manifest = _load_json(manifest_path, label="run manifest")
        immutable_keys = ("manifestVersion", "runId", "request", "contract", "workflow", "provenance")
        if any(manifest.get(key) != expected_manifest[key] for key in immutable_keys):
            raise PipelineError("run_immutable_mismatch", "existing run immutable fields do not match")
        if not request_path.is_file():
            raise PipelineError("artifact_missing", "existing run is missing request.json")
        expected_meta = manifest.get("artifacts", {}).get("request")
        if not isinstance(expected_meta, dict) or _sha256_file(request_path) != expected_meta.get("sha256"):
            raise PipelineError("artifact_tampered", "request.json does not match manifest hash")
        if _load_json(request_path, label="request artifact") != request_artifact:
            raise PipelineError("artifact_tampered", "request.json content does not match immutable request")
        return {"status": "ok", "runId": manifest["runId"], "resumed": True}

    run_dir.mkdir(parents=True, exist_ok=True)
    if request_path.exists():
        if _load_json(request_path, label="request artifact") != request_artifact:
            raise PipelineError("artifact_tampered", "interrupted request.json does not match")
    else:
        _write_json(request_path, request_artifact)
    expected_manifest["artifacts"]["request"] = _artifact(request_path)
    _write_json(manifest_path, expected_manifest)
    return {"status": "ok", "runId": expected_manifest["runId"], "resumed": False}


def _load_run(run_dir: Path) -> dict[str, Any]:
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.is_file():
        raise PipelineError("manifest_missing", "run manifest is missing")
    manifest = _load_json(manifest_path, label="run manifest")
    if not isinstance(manifest, dict) or manifest.get("manifestVersion") != 2:
        raise PipelineError("manifest_invalid", "run manifestVersion must be 2")
    if manifest.get("contract", {}).get("sha256") != contract_sha256():
        raise PipelineError("contract_drift", "current contract hash differs from run")
    if manifest.get("workflow", {}).get("sha256") != _sha256_file(WORKFLOW_PATH):
        raise PipelineError("workflow_drift", "current workflow hash differs from run")
    request_meta = manifest.get("artifacts", {}).get("request")
    request_path = run_dir / "request.json"
    if not isinstance(request_meta, dict) or not request_path.is_file():
        raise PipelineError("artifact_missing", "run request artifact is missing")
    if _sha256_file(request_path) != request_meta.get("sha256"):
        raise PipelineError("artifact_tampered", "request artifact hash differs from manifest")
    request_artifact = _load_json(request_path, label="request artifact")
    for key, value in manifest["request"].items():
        if request_artifact.get(key) != value:
            raise PipelineError("artifact_tampered", "request artifact run values differ")
    if request_artifact.get("contractSha256") != manifest["contract"]["sha256"]:
        raise PipelineError("artifact_tampered", "request contract hash differs")
    if request_artifact.get("provenance") != manifest.get("provenance"):
        raise PipelineError("artifact_tampered", "request provenance differs")
    return manifest


def _verify_manifest_artifacts(run_dir: Path, manifest: dict[str, Any], names: tuple[str, ...]) -> None:
    artifacts = manifest.get("artifacts", {})
    for name in names:
        metadata = artifacts.get(name)
        if not isinstance(metadata, dict):
            raise PipelineError("artifact_missing", f"manifest is missing {name} metadata")
        expected_name = _RUN_ARTIFACT_FILENAMES.get(name)
        if expected_name is None or metadata.get("path") != expected_name:
            raise PipelineError("artifact_tampered", f"{name} artifact path differs")
        path = run_dir / expected_name
        if not path.is_file():
            raise PipelineError("artifact_missing", f"{name} artifact is missing")
        if _sha256_file(path) != metadata.get("sha256"):
            raise PipelineError("artifact_tampered", f"{name} artifact hash differs")


def _extract_pool(raw: Any) -> list[Any]:
    if not isinstance(raw, dict):
        raise PipelineError("pool_invalid", "workflow output root must be an object")
    root = raw.get("result", raw)
    if not isinstance(root, dict):
        raise PipelineError("pool_invalid", "workflow result must be an object")
    pool = root.get("pool")
    if not isinstance(pool, list) or not pool:
        raise PipelineError("pool_invalid", "workflow output must contain a non-empty pool")
    return pool


def _can_fill_atomic(sizes: list[int], target: int) -> bool:
    totals = {0}
    for size in sizes:
        totals |= {total + size for total in tuple(totals) if total + size <= target}
    return target in totals


def _paper_inventory_issues(
    records: list[dict[str, Any]], *, level: str, group: str
) -> list[dict[str, Any]]:
    contract = load_contract()
    qtypes = contract["generationGroups"][group]
    paper = contract["paperSpec"][level]
    issues: list[dict[str, Any]] = []
    for qtype in qtypes:
        if qtype not in paper:
            continue
        candidates = [record for record in records if record["qtype"] == qtype]
        target = paper[qtype]
        if len(candidates) < target:
            issues.append(
                {"code": "paper_shortfall", "level": level, "qtype": qtype, "target": target, "available": len(candidates)}
            )
            continue
        if contract["qtypes"][qtype]["groupMode"] == "atomic":
            groups: dict[str, int] = {}
            for candidate in candidates:
                groups[candidate["groupId"]] = groups.get(candidate["groupId"], 0) + 1
            oversized = sorted(size for size in groups.values() if size > target)
            if oversized:
                issues.append(
                    {"code": "paper_atomic_overfill", "level": level, "qtype": qtype, "target": target, "groupSize": oversized[0]}
                )
            elif not _can_fill_atomic(sorted(groups.values()), target):
                issues.append(
                    {"code": "paper_atomic_unfillable", "level": level, "qtype": qtype, "target": target, "groupSizes": sorted(groups.values())}
                )
    return issues


def ingest_run(*, run_dir: Path, source_path: Path) -> dict[str, Any]:
    manifest = _load_run(run_dir)
    source_hash = _sha256_file(source_path)
    if manifest.get("state") in {"sanitized", "reviewed", "staged", "published"}:
        source = manifest.get("source") or {}
        if source.get("sha256") != source_hash:
            raise PipelineError("source_changed", "source hash differs from immutable run source")
        _verify_manifest_artifacts(run_dir, manifest, ("raw", "sanitized", "rejected", "metrics"))
        return {"status": "ok", "runId": manifest["runId"], "resumed": True}
    if manifest.get("state") != "initialized":
        raise PipelineError("state_invalid", "run must be initialized before ingest")

    raw = _load_json(source_path, label="workflow source")
    pool = _extract_pool(raw)
    request = manifest["request"]
    sanitized = sanitize_pool(
        pool,
        expected_level=request["level"],
        expected_group=request["group"],
    )
    if sanitized["fatal"]:
        raise PipelineError(
            "pool_rejected",
            "one or more questions failed schema, identity, or atomic-group validation",
            details={"metrics": sanitized["metrics"], "rejected": sanitized["rejected"]},
        )
    inventory_issues = _paper_inventory_issues(
        sanitized["records"], level=request["level"], group=request["group"]
    )
    if inventory_issues:
        first_code = inventory_issues[0]["code"]
        raise PipelineError(first_code, "sanitized inventory cannot compose the canonical paper", details=inventory_issues)

    raw_path = run_dir / "raw.json"
    sanitized_path = run_dir / "sanitized.json"
    rejected_path = run_dir / "rejected.json"
    metrics_path = run_dir / "metrics.json"
    metrics = {
        **sanitized["metrics"],
        "verified": 0,
        "paperInventory": {"status": "exactly-fillable", "issues": []},
    }
    _ensure_json_artifact(raw_path, raw)
    _ensure_json_artifact(sanitized_path, sanitized["records"])
    _ensure_json_artifact(rejected_path, sanitized["rejected"])
    _ensure_json_artifact(metrics_path, metrics)

    updated = copy.deepcopy(manifest)
    updated["state"] = "sanitized"
    updated["source"] = {
        "path": str(source_path.resolve()),
        "sha256": source_hash,
        "bytes": len(source_path.read_bytes()),
    }
    updated["metrics"] = metrics
    updated["artifacts"].update(
        raw=_artifact(raw_path, count=len(pool)),
        sanitized=_artifact(sanitized_path, count=len(sanitized["records"])),
        rejected=_artifact(rejected_path, count=len(sanitized["rejected"])),
        metrics=_artifact(metrics_path),
    )
    _write_json(run_dir / "manifest.json", updated)
    return {"status": "ok", "runId": updated["runId"], "resumed": False}


def _validated_receipt(
    receipt: Any,
    *,
    manifest: dict[str, Any],
    questions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    contract = load_contract()
    try:
        validate_json_schema(receipt, contract["receiptSchema"], path="$.receipt")
    except ContractError as error:
        raise PipelineError("receipt_invalid", str(error)) from error
    if receipt["runId"] != manifest["runId"]:
        raise PipelineError("receipt_invalid", "receipt runId does not match run")
    if receipt["contractSha256"] != manifest["contract"]["sha256"]:
        raise PipelineError("receipt_invalid", "receipt contract hash does not match run")
    if receipt["sourceSha256"] != manifest["source"]["sha256"]:
        raise PipelineError("receipt_invalid", "receipt source hash does not match run")
    reviewers = receipt["reviewers"]
    minimum = contract["qualityGate"]["minimumIndependentReviewers"]
    if len(reviewers) < minimum or len(set(reviewers)) != len(reviewers):
        raise PipelineError("receipt_invalid", "receipt requires distinct independent reviewers")
    verdicts_by_hash: dict[str, dict[str, Any]] = {}
    for verdict in receipt["verdicts"]:
        content_hash = verdict["contentHash"]
        if content_hash in verdicts_by_hash:
            raise PipelineError("receipt_invalid", "receipt contains duplicate contentHash verdicts")
        review_ids = [review["reviewer"] for review in verdict["reviews"]]
        if len(review_ids) != len(set(review_ids)) or set(review_ids) != set(reviewers):
            raise PipelineError("receipt_invalid", "each verdict must contain exactly one review per reviewer")
        verdicts_by_hash[content_hash] = verdict
    question_hashes = {question["contentHash"] for question in questions}
    if set(verdicts_by_hash) != question_hashes:
        raise PipelineError("receipt_invalid", "receipt must cover every sanitized contentHash exactly once")

    verified: list[dict[str, Any]] = []
    rejected = 0
    for question in questions:
        authored_answer = canonical_text(question["choices"][question["answerIndex"]])
        reviews = verdicts_by_hash[question["contentHash"]]["reviews"]
        qualifies = (
            all(review["accepted"] is True for review in reviews)
            and all(review["fatal"] is False for review in reviews)
            and all(canonical_text(review["answer"]) == authored_answer for review in reviews)
        )
        if qualifies:
            item = copy.deepcopy(question)
            item["reviewStatus"] = "verified"
            verified.append(item)
        else:
            rejected += 1
    return verified, rejected


def verify_run(*, run_dir: Path, receipt_path: Path) -> dict[str, Any]:
    manifest = _load_run(run_dir)
    receipt_source_hash = _sha256_file(receipt_path)
    if manifest.get("state") in {"reviewed", "staged", "published"}:
        receipt_meta = manifest.get("receipt") or {}
        if receipt_meta.get("sourceSha256") != receipt_source_hash:
            raise PipelineError("receipt_changed", "receipt source hash differs from immutable reviewed run")
        _verify_manifest_artifacts(
            run_dir,
            manifest,
            ("raw", "sanitized", "rejected", "metrics", "receipt", "verified", "reviewMetrics"),
        )
        return {"status": "ok", "runId": manifest["runId"], "resumed": True}
    if manifest.get("state") != "sanitized":
        raise PipelineError("state_invalid", "run must be sanitized before receipt verification")
    _verify_manifest_artifacts(run_dir, manifest, ("raw", "sanitized", "rejected", "metrics"))
    questions = _load_json(run_dir / "sanitized.json", label="sanitized artifact")
    if not isinstance(questions, list) or not questions:
        raise PipelineError("artifact_invalid", "sanitized artifact must be a non-empty array")
    receipt = _load_json(receipt_path, label="receipt source")
    verified, receipt_rejected = _validated_receipt(
        receipt,
        manifest=manifest,
        questions=questions,
    )

    receipt_artifact_path = run_dir / "receipt.json"
    verified_path = run_dir / "verified.json"
    review_metrics_path = run_dir / "review_metrics.json"
    metrics = {
        **manifest["metrics"],
        "verified": len(verified),
        "receiptRejected": receipt_rejected,
    }
    _ensure_json_artifact(receipt_artifact_path, receipt)
    _ensure_json_artifact(verified_path, verified)
    _ensure_json_artifact(review_metrics_path, metrics)

    updated = copy.deepcopy(manifest)
    updated["state"] = "reviewed"
    updated["receipt"] = {
        "sourcePath": str(receipt_path.resolve()),
        "sourceSha256": receipt_source_hash,
        "reviewers": receipt["reviewers"],
        "issuedAt": receipt["issuedAt"],
    }
    updated["metrics"] = metrics
    updated["artifacts"].update(
        receipt=_artifact(receipt_artifact_path),
        verified=_artifact(verified_path, count=len(verified)),
        reviewMetrics=_artifact(review_metrics_path),
    )
    _write_json(run_dir / "manifest.json", updated)
    return {"status": "ok", "runId": updated["runId"], "resumed": False}


def _reviewed_records(run_dir: Path) -> tuple[str, list[dict[str, Any]]]:
    manifest = _load_run(run_dir)
    if manifest.get("state") != "reviewed":
        raise PipelineError("state_invalid", f"run {manifest.get('runId')} is not reviewed")
    _verify_manifest_artifacts(
        run_dir,
        manifest,
        ("raw", "sanitized", "rejected", "metrics", "receipt", "verified", "reviewMetrics"),
    )
    sanitized = _load_json(run_dir / "sanitized.json", label="sanitized artifact")
    verified = _load_json(run_dir / "verified.json", label="verified artifact")
    receipt = _load_json(run_dir / "receipt.json", label="receipt artifact")
    if not isinstance(sanitized, list) or not isinstance(verified, list):
        raise PipelineError("artifact_invalid", "sanitized and verified artifacts must be arrays")
    recomputed, _ = _validated_receipt(receipt, manifest=manifest, questions=sanitized)
    if recomputed != verified:
        raise PipelineError("artifact_tampered", "verified artifact differs from receipt-qualified records")
    verified_meta = manifest["artifacts"]["verified"]
    if verified_meta.get("count") != len(verified):
        raise PipelineError("artifact_tampered", "verified artifact count differs from manifest")
    expected_level = manifest["request"]["level"]
    for record in verified:
        if (
            not isinstance(record, dict)
            or record.get("level") != expected_level
            or record.get("reviewStatus") != "verified"
            or record.get("source") != "jlptv2"
            or not str(record.get("id", "")).startswith("jlptv2-q-")
            or not _SHA256.fullmatch(str(record.get("contentHash", "")))
        ):
            raise PipelineError("artifact_invalid", "verified record is not a valid jlptv2 record")
    return manifest["runId"], verified


def _target_snapshot(target_path: Path) -> tuple[bytes, dict[str, Any], dict[str, dict[str, Any]]]:
    if not target_path.is_file():
        raise PipelineError("target_missing", "staging target must be an existing JSON bank")
    payload = target_path.read_bytes()
    target = _load_json(target_path, label="target bank")
    if not isinstance(target, dict):
        raise PipelineError("target_invalid", "target bank must be an object")
    questions = target.get("questions", [])
    if not isinstance(questions, list) or any(not isinstance(item, dict) for item in questions):
        raise PipelineError("target_invalid", "target questions must be an array of objects")
    by_id: dict[str, dict[str, Any]] = {}
    for question in questions:
        question_id = question.get("id")
        if isinstance(question_id, str) and question_id:
            by_id[question_id] = question
    return payload, target, by_id


def _release_id(candidate_hash: str, target_path: Path, observed_hash: str) -> str:
    identity = {
        "candidateSha256": candidate_hash,
        "targetPath": str(target_path.resolve()),
        "targetObservedSha256": observed_hash,
    }
    return f"jlptv2-release-{_sha256_bytes(_json_bytes(identity))[:16]}"


def _release_artifact(path: Path, expected_name: str) -> dict[str, Any]:
    if path.name != expected_name:
        raise PipelineError("artifact_tampered", f"release artifact path must be {expected_name}")
    return _artifact(path)


def stage_release(
    *, release_dir: Path, run_dirs: list[Path], target_path: Path
) -> dict[str, Any]:
    if not run_dirs:
        raise PipelineError("run_invalid", "stage requires at least one reviewed run")
    unique_by_id: dict[str, dict[str, Any]] = {}
    run_ids: list[str] = []
    duplicate_exact = 0
    for run_dir in run_dirs:
        run_id, records = _reviewed_records(run_dir)
        run_ids.append(run_id)
        for record in records:
            question_id = record["id"]
            previous = unique_by_id.get(question_id)
            if previous is None:
                unique_by_id[question_id] = record
            elif previous.get("contentHash") == record.get("contentHash"):
                duplicate_exact += 1
                if _json_bytes(record) < _json_bytes(previous):
                    unique_by_id[question_id] = record
            else:
                raise PipelineError(
                    "identity_conflict",
                    f"question identity {question_id} has multiple reviewed revisions",
                )
    questions = [copy.deepcopy(record) for record in unique_by_id.values()]
    questions.sort(key=lambda record: (record["level"], record["id"], record["contentHash"]))
    counts_by_level = {
        level: sum(record["level"] == level for record in questions)
        for level in ("N1", "N2")
    }
    contract = load_contract()
    minimums = contract["releaseGate"]["minimumApprovedUniqueStagedByLevel"]
    shortfalls = {
        level: {"minimum": minimums[level], "available": counts_by_level[level]}
        for level in ("N1", "N2")
        if counts_by_level[level] < minimums[level]
    }
    if shortfalls:
        raise PipelineError(
            "release_shortfall",
            "verified unique questions do not meet the N1/N2 staging floors",
            details=shortfalls,
        )
    for question in questions:
        question["publicationStatus"] = "pending"
    candidate = {
        "candidateVersion": 2,
        "contractVersion": contract["contractVersion"],
        "contractSha256": contract_sha256(),
        "source": "jlptv2",
        "publicationStatus": "pending",
        "runIds": sorted(set(run_ids)),
        "counts": {
            "verifiedUniqueByLevel": counts_by_level,
            "duplicateExact": duplicate_exact,
            "total": len(questions),
        },
        "questions": questions,
    }
    candidate_hash = _sha256_bytes(_pretty_json_bytes(candidate))
    target_bytes, target, old_by_id = _target_snapshot(target_path)
    observed_hash = _sha256_bytes(target_bytes)
    release_id = _release_id(candidate_hash, target_path, observed_hash)
    new_by_id = {question["id"]: question for question in questions}
    added = sorted(set(new_by_id) - set(old_by_id))
    removed = sorted(set(old_by_id) - set(new_by_id))
    common = set(new_by_id) & set(old_by_id)
    changed = sorted(
        question_id
        for question_id in common
        if new_by_id[question_id].get("contentHash") != old_by_id[question_id].get("contentHash")
    )
    unchanged = sorted(common - set(changed))
    diff = {
        "diffVersion": 2,
        "releaseId": release_id,
        "candidateSha256": candidate_hash,
        "target": {
            "path": str(target_path.resolve()),
            "observedSha256": observed_hash,
            "source": target.get("source"),
        },
        "counts": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": len(unchanged),
        },
        "ids": {
            "added": added,
            "removed": removed,
            "changed": changed,
            "unchanged": unchanged,
        },
    }
    diff_hash = _sha256_bytes(_pretty_json_bytes(diff))
    manifest = {
        "releaseVersion": 2,
        "releaseId": release_id,
        "state": "pending",
        "contract": {
            "version": contract["contractVersion"],
            "sha256": contract_sha256(),
        },
        "runIds": sorted(set(run_ids)),
        "target": {
            "path": str(target_path.resolve()),
            "observedSha256": observed_hash,
            "source": target.get("source"),
        },
        "counts": {
            "verifiedUniqueByLevel": counts_by_level,
            "duplicateExact": duplicate_exact,
            "total": len(questions),
        },
        "artifacts": {
            "candidate": {
                "path": "candidate.json",
                "sha256": candidate_hash,
                "bytes": len(_pretty_json_bytes(candidate)),
                "count": len(questions),
            },
            "diff": {
                "path": "diff.json",
                "sha256": diff_hash,
                "bytes": len(_pretty_json_bytes(diff)),
            },
        },
        "signature": None,
        "publication": None,
        "rollback": None,
    }
    manifest_path = release_dir / "manifest.json"
    candidate_path = release_dir / "candidate.json"
    diff_path = release_dir / "diff.json"
    if manifest_path.exists():
        existing = _load_json(manifest_path, label="release manifest")
        if existing != manifest:
            raise PipelineError("release_immutable_mismatch", "existing release differs from staged inputs")
        if not candidate_path.is_file() or not diff_path.is_file():
            raise PipelineError("artifact_missing", "pending release artifact is missing")
        if _sha256_file(candidate_path) != candidate_hash or _sha256_file(diff_path) != diff_hash:
            raise PipelineError("artifact_tampered", "pending release artifact hash differs")
        return {"status": "ok", "releaseId": release_id, "resumed": True}
    release_dir.mkdir(parents=True, exist_ok=True)
    _ensure_json_artifact(candidate_path, candidate)
    _ensure_json_artifact(diff_path, diff)
    if _release_artifact(candidate_path, "candidate.json")["sha256"] != candidate_hash:
        raise PipelineError("artifact_tampered", "candidate serialization hash differs")
    if _release_artifact(diff_path, "diff.json")["sha256"] != diff_hash:
        raise PipelineError("artifact_tampered", "diff serialization hash differs")
    _write_json(manifest_path, manifest)
    return {"status": "ok", "releaseId": release_id, "resumed": False}


def _load_release(release_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = release_dir / "manifest.json"
    if not manifest_path.is_file():
        raise PipelineError("release_missing", "release manifest is missing")
    manifest = _load_json(manifest_path, label="release manifest")
    if not isinstance(manifest, dict) or manifest.get("releaseVersion") != 2:
        raise PipelineError("release_invalid", "releaseVersion must be 2")
    if manifest.get("contract", {}).get("sha256") != contract_sha256():
        raise PipelineError("contract_drift", "current contract hash differs from release")
    artifacts = manifest.get("artifacts", {})
    for name, filename in (("candidate", "candidate.json"), ("diff", "diff.json")):
        metadata = artifacts.get(name)
        if not isinstance(metadata, dict) or metadata.get("path") != filename:
            raise PipelineError("artifact_missing", f"release {name} metadata is missing")
        path = release_dir / filename
        if not path.is_file() or _sha256_file(path) != metadata.get("sha256"):
            raise PipelineError("artifact_tampered", f"release {name} artifact hash differs")
    candidate = _load_json(release_dir / "candidate.json", label="release candidate")
    diff = _load_json(release_dir / "diff.json", label="release diff")
    if (
        not isinstance(candidate, dict)
        or candidate.get("contractSha256") != contract_sha256()
        or candidate.get("source") != "jlptv2"
        or candidate.get("publicationStatus") != "pending"
        or not isinstance(candidate.get("questions"), list)
    ):
        raise PipelineError("release_invalid", "release candidate is invalid")
    candidate_hash = artifacts["candidate"]["sha256"]
    target = manifest.get("target", {})
    if (
        not isinstance(diff, dict)
        or diff.get("releaseId") != manifest.get("releaseId")
        or diff.get("candidateSha256") != candidate_hash
        or diff.get("target") != target
        or _release_id(
            candidate_hash,
            Path(str(target.get("path", ""))),
            str(target.get("observedSha256", "")),
        )
        != manifest.get("releaseId")
    ):
        raise PipelineError("release_invalid", "release identity or diff differs from candidate")
    question_ids = [question.get("id") for question in candidate["questions"] if isinstance(question, dict)]
    if len(question_ids) != len(candidate["questions"]) or len(set(question_ids)) != len(question_ids):
        raise PipelineError("release_invalid", "release candidate question identities are invalid")
    return manifest, candidate


def _validated_signature(
    path: Path,
    *,
    decision: str,
    expected: dict[str, str],
) -> tuple[dict[str, Any], str]:
    try:
        source_hash = _sha256_file(path)
        signature = _load_json(path, label=f"{decision} signature")
    except PipelineError as error:
        raise PipelineError("signature_invalid", str(error)) from error
    hash_field = "candidateSha256" if decision == "publish" else "publishedSha256"
    required = {
        "releaseId",
        "contractSha256",
        hash_field,
        "decision",
        "approvedBy",
        "signedAt",
    }
    if not isinstance(signature, dict) or set(signature) != required:
        raise PipelineError("signature_invalid", f"{decision} signature fields are not exact")
    if any(not isinstance(signature[key], str) or not signature[key] for key in required):
        raise PipelineError("signature_invalid", f"{decision} signature fields must be non-empty strings")
    if signature["decision"] != decision:
        raise PipelineError("signature_invalid", f"signature decision must be {decision}")
    for key, value in expected.items():
        if signature.get(key) != value:
            raise PipelineError("signature_invalid", f"signature {key} does not match release")
    if not _SHA256.fullmatch(signature["contractSha256"]) or not _SHA256.fullmatch(signature[hash_field]):
        raise PipelineError("signature_invalid", "signature hashes must be lowercase SHA-256 values")
    return signature, source_hash


def _assert_release_target(manifest: dict[str, Any], target_path: Path) -> bytes:
    if str(target_path.resolve()) != manifest.get("target", {}).get("path"):
        raise PipelineError("target_changed", "target path differs from staged release")
    if not target_path.is_file():
        raise PipelineError("target_changed", "staged target is missing")
    return target_path.read_bytes()


def _assert_publishable_target(
    target_path: Path, target_bytes: bytes, candidate: dict[str, Any]
) -> None:
    if target_path.name == "jlpt_bank_v1.json":
        raise PipelineError("target_protected", "the v1 bank path is protected")
    try:
        target = json.loads(target_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PipelineError("target_changed", f"target is no longer valid JSON: {error}") from error
    if not isinstance(target, dict):
        raise PipelineError("target_changed", "target is no longer an object")
    if target.get("source") == "mockv1":
        raise PipelineError("target_protected", "mockv1 targets are protected")
    for question in candidate["questions"]:
        if not isinstance(question, dict) or not str(question.get("id", "")).startswith("jlptv2-q-"):
            raise PipelineError("target_protected", "candidate contains a non-jlptv2 question ID")


def publish_release(
    *, release_dir: Path, target_path: Path, signature_path: Path
) -> dict[str, Any]:
    manifest, candidate = _load_release(release_dir)
    target_bytes = _assert_release_target(manifest, target_path)
    _assert_publishable_target(target_path, target_bytes, candidate)
    expected_signature = {
        "releaseId": manifest["releaseId"],
        "contractSha256": manifest["contract"]["sha256"],
        "candidateSha256": manifest["artifacts"]["candidate"]["sha256"],
    }
    signature, signature_source_hash = _validated_signature(
        signature_path, decision="publish", expected=expected_signature
    )
    state = manifest.get("state")
    if state == "published":
        if manifest.get("signature", {}).get("sourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "publish signature differs from recorded signature")
        if _sha256_bytes(target_bytes) != manifest.get("publication", {}).get("targetSha256"):
            raise PipelineError("target_changed", "published target hash differs from release")
        return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": True}
    if state not in {"pending", "publishing"}:
        raise PipelineError("state_invalid", "release must be pending before publication")

    staged_hash = manifest["target"]["observedSha256"]
    approved_questions = []
    for question in candidate["questions"]:
        approved = copy.deepcopy(question)
        approved["reviewStatus"] = "approved"
        approved["publicationStatus"] = "published"
        approved_questions.append(approved)
    bank = {
        "source": "jlptv2",
        "contractVersion": manifest["contract"]["version"],
        "contractSha256": manifest["contract"]["sha256"],
        "releaseId": manifest["releaseId"],
        "approvedBy": signature["approvedBy"],
        "publishedAt": signature["signedAt"],
        "questions": approved_questions,
    }
    published_bytes = _pretty_json_bytes(bank)
    published_hash = _sha256_bytes(published_bytes)
    previous_path = release_dir / "rollback" / "previous.json"
    copied_signature_path = release_dir / "publish_signature.json"
    if state == "pending":
        if _sha256_bytes(target_bytes) != staged_hash:
            raise PipelineError("target_changed", "target hash differs from staged diff")
        if previous_path.exists():
            if previous_path.read_bytes() != target_bytes:
                raise PipelineError("artifact_collision", "rollback backup differs from target")
        else:
            _write_bytes_atomic(previous_path, target_bytes)
        _ensure_json_artifact(copied_signature_path, signature)
        publishing = copy.deepcopy(manifest)
        publishing["state"] = "publishing"
        publishing["signature"] = {
            "path": copied_signature_path.name,
            "sha256": _sha256_file(copied_signature_path),
            "sourceSha256": signature_source_hash,
            "decision": "publish",
            "approvedBy": signature["approvedBy"],
            "signedAt": signature["signedAt"],
        }
        publishing["artifacts"].update(
            publishSignature=_artifact(copied_signature_path),
            previous={
                "path": "rollback/previous.json",
                "sha256": _sha256_file(previous_path),
                "bytes": len(previous_path.read_bytes()),
            },
        )
        publishing["publication"] = {
            "targetPath": str(target_path.resolve()),
            "previousSha256": staged_hash,
            "targetSha256": published_hash,
        }
        _write_json(release_dir / "manifest.json", publishing)
        manifest = publishing
    else:
        if manifest.get("signature", {}).get("sourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "publish signature differs from in-progress signature")
        for name, path in (("publishSignature", copied_signature_path), ("previous", previous_path)):
            metadata = manifest.get("artifacts", {}).get(name)
            if not isinstance(metadata, dict) or not path.is_file() or _sha256_file(path) != metadata.get("sha256"):
                raise PipelineError("artifact_tampered", f"{name} artifact differs during publication")
        current_hash = _sha256_bytes(target_bytes)
        if current_hash not in {staged_hash, published_hash}:
            raise PipelineError("target_changed", "target changed during publication")

    if _sha256_bytes(target_bytes) != published_hash:
        _write_bytes_atomic(target_path, published_bytes)
    if _sha256_file(target_path) != published_hash:
        raise PipelineError("target_changed", "published target hash verification failed")
    completed = copy.deepcopy(manifest)
    completed["state"] = "published"
    _write_json(release_dir / "manifest.json", completed)
    return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": False}


def rollback_release(
    *, release_dir: Path, target_path: Path, signature_path: Path
) -> dict[str, Any]:
    manifest, _ = _load_release(release_dir)
    target_bytes = _assert_release_target(manifest, target_path)
    state = manifest.get("state")
    if state not in {"published", "rolling_back", "rolled_back"}:
        raise PipelineError("state_invalid", "release must be published before rollback")
    publication = manifest.get("publication") or {}
    published_hash = publication.get("targetSha256")
    if not isinstance(published_hash, str):
        raise PipelineError("release_invalid", "release publication hash is missing")
    expected_signature = {
        "releaseId": manifest["releaseId"],
        "contractSha256": manifest["contract"]["sha256"],
        "publishedSha256": published_hash,
    }
    signature, signature_source_hash = _validated_signature(
        signature_path, decision="rollback", expected=expected_signature
    )
    previous_path = release_dir / "rollback" / "previous.json"
    previous_meta = manifest.get("artifacts", {}).get("previous")
    if (
        not isinstance(previous_meta, dict)
        or previous_meta.get("path") != "rollback/previous.json"
        or not previous_path.is_file()
        or _sha256_file(previous_path) != previous_meta.get("sha256")
    ):
        raise PipelineError("artifact_tampered", "rollback backup hash differs")
    previous_bytes = previous_path.read_bytes()
    previous_hash = _sha256_bytes(previous_bytes)
    if previous_hash != publication.get("previousSha256"):
        raise PipelineError("artifact_tampered", "rollback backup differs from publication metadata")
    if state == "rolled_back":
        if manifest.get("rollback", {}).get("signatureSourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "rollback signature differs from recorded signature")
        if _sha256_bytes(target_bytes) != previous_hash:
            raise PipelineError("target_changed", "rolled-back target hash differs")
        return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": True}

    rollback_signature_path = release_dir / "rollback_signature.json"
    if state == "published":
        if _sha256_bytes(target_bytes) != published_hash:
            raise PipelineError("target_changed", "current target differs from published release")
        _ensure_json_artifact(rollback_signature_path, signature)
        rolling = copy.deepcopy(manifest)
        rolling["state"] = "rolling_back"
        rolling["artifacts"]["rollbackSignature"] = _artifact(rollback_signature_path)
        rolling["rollback"] = {
            "signatureSourceSha256": signature_source_hash,
            "approvedBy": signature["approvedBy"],
            "signedAt": signature["signedAt"],
            "restoredSha256": previous_hash,
        }
        _write_json(release_dir / "manifest.json", rolling)
        manifest = rolling
    else:
        if manifest.get("rollback", {}).get("signatureSourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "rollback signature differs from in-progress signature")
        metadata = manifest.get("artifacts", {}).get("rollbackSignature")
        if (
            not isinstance(metadata, dict)
            or not rollback_signature_path.is_file()
            or _sha256_file(rollback_signature_path) != metadata.get("sha256")
        ):
            raise PipelineError("artifact_tampered", "rollback signature artifact differs")
        if _sha256_bytes(target_bytes) not in {published_hash, previous_hash}:
            raise PipelineError("target_changed", "target changed during rollback")

    if _sha256_bytes(target_bytes) != previous_hash:
        _write_bytes_atomic(target_path, previous_bytes)
    if _sha256_file(target_path) != previous_hash:
        raise PipelineError("target_changed", "restored target hash verification failed")
    completed = copy.deepcopy(manifest)
    completed["state"] = "rolled_back"
    _write_json(release_dir / "manifest.json", completed)
    return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": False}


def _display_source_path(source_path: Path) -> str:
    resolved = source_path.resolve()
    try:
        return str(resolved.relative_to(REPO_ROOT))
    except ValueError:
        return str(resolved)


def audit_legacy(*, source_path: Path, report_path: Path) -> dict[str, Any]:
    if source_path.resolve() == report_path.resolve():
        raise PipelineError("target_protected", "audit report must not overwrite its source")
    try:
        source_bytes = source_path.read_bytes()
    except OSError as error:
        raise PipelineError("file_unreadable", f"cannot read {source_path}: {error}") from error
    source_hash = _sha256_bytes(source_bytes)
    try:
        source = json.loads(source_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PipelineError("json_unreadable", f"legacy source is unreadable: {error}") from error
    if (
        not isinstance(source, dict)
        or source.get("level") != "N1"
        or source.get("group") != "lex"
        or not isinstance(source.get("pool"), list)
        or not source["pool"]
    ):
        raise PipelineError(
            "legacy_source_invalid",
            "legacy audit requires a non-empty N1 lex pool",
        )
    pool = source["pool"]
    sanitized = sanitize_pool(pool, expected_level="N1", expected_group="lex")
    records = sanitized["records"]
    conversion_hash = _sha256_bytes(_json_bytes(records))
    observed_by_qtype = Counter(
        str(question.get("qtype", "<invalid>"))
        for question in pool
        if isinstance(question, dict)
    )
    legacy_groups = [
        canonical_text(question.get("group", ""))
        for question in pool
        if isinstance(question, dict)
        and isinstance(question.get("group", ""), str)
        and canonical_text(question.get("group", ""))
    ]
    rejection_reasons: Counter[str] = Counter()
    for rejected in sanitized["rejected"]:
        rejection_reasons.update(
            {issue["code"] for issue in rejected.get("issues", []) if isinstance(issue, dict) and "code" in issue}
        )
    contract = load_contract()
    official_n1_lex_qtypes = {
        qtype
        for qtype in contract["generationGroups"]["lex"]
        if qtype in contract["paperSpec"]["N1"]
    }
    declared_stats = source.get("stats") if isinstance(source.get("stats"), dict) else {}
    declared_by_qtype = declared_stats.get("byQtype") if isinstance(declared_stats.get("byQtype"), dict) else {}
    evidence_counts = {
        "raw": len(pool),
        "sanitized": sanitized["metrics"]["sanitized"],
        "unique": sanitized["metrics"]["unique"],
        "verified": 0,
        "approved": 0,
        "staged": 0,
    }
    report = {
        "auditVersion": 2,
        "mode": "read-only-conversion-dry-run",
        "source": {
            "path": _display_source_path(source_path),
            "sha256": source_hash,
            "bytes": len(source_bytes),
            "level": "N1",
            "group": "lex",
        },
        "contract": {
            "version": contract["contractVersion"],
            "sha256": contract_sha256(),
        },
        "evidenceCounts": evidence_counts,
        "structure": {
            "byQtype": dict(sorted(observed_by_qtype.items())),
            "legacyGroupedItems": len(legacy_groups),
            "legacyUniqueGroups": len(set(legacy_groups)),
            "v2UniqueGroupIds": len(
                {record["groupId"] for record in records if record.get("groupId")}
            ),
            "missingOfficialN1LexQtypes": sorted(
                official_n1_lex_qtypes - set(observed_by_qtype)
            ),
            "declaredStatsMatchObserved": (
                declared_stats.get("total") == len(pool)
                and declared_by_qtype == dict(observed_by_qtype)
            ),
        },
        "deduplication": {
            "duplicateExact": sanitized["metrics"]["duplicateExact"],
            "identityConflicts": sanitized["metrics"]["identityConflicts"],
        },
        "rejections": {
            "count": sanitized["metrics"]["rejected"],
            "byReason": dict(sorted(rejection_reasons.items())),
        },
        "conversionDryRun": {
            "sha256": conversion_hash,
            "recordCount": len(records),
            "artifactWritten": False,
            "reviewStatus": "pending",
        },
        "qualityEvidence": {
            "provenancePresent": False,
            "receiptPresent": False,
            "humanSignaturePresent": False,
            "reviewStatus": "pending",
            "reason": (
                "Static schema and identity validation cannot substitute for v2 provenance, "
                "a qualifying two-reviewer receipt, or a human publication signature."
            ),
        },
        "coverage": {
            "N1": {
                "lex": {"status": "present-raw-only", "raw": len(pool)},
                "rc": {"status": "missing", "raw": 0},
            },
            "N2": {
                "lex": {"status": "missing", "raw": 0},
                "rc": {"status": "missing", "raw": 0},
            },
        },
        "omissions": [
            "N1 rc source is absent.",
            "N2 lex source is absent.",
            "N2 rc source is absent.",
            "No v2 review receipt or human publication signature exists for these raw candidates.",
        ],
        "artifactsCreated": {
            "run": False,
            "receipt": False,
            "convertedBank": False,
            "candidate": False,
            "publishedBank": False,
        },
    }
    resumed = report_path.exists()
    _ensure_json_artifact(report_path, report)
    return {
        "status": "ok",
        "report": str(report_path.resolve()),
        "reportSha256": _sha256_file(report_path),
        "sourceSha256": source_hash,
        "conversionSha256": conversion_hash,
        "resumed": resumed,
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = _JsonArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    init_parser = subparsers.add_parser("init-run", help="initialize or resume one immutable run")
    init_parser.add_argument("--run-dir", required=True)
    init_parser.add_argument("--level", required=True)
    init_parser.add_argument("--group", required=True)
    init_parser.add_argument("--wave", required=True)
    init_parser.add_argument("--provenance", required=True)
    ingest_parser = subparsers.add_parser("ingest", help="validate and ingest one workflow result")
    ingest_parser.add_argument("--run-dir", required=True)
    ingest_parser.add_argument("--source", required=True)
    verify_parser = subparsers.add_parser("verify", help="apply a complete independent-review receipt")
    verify_parser.add_argument("--run-dir", required=True)
    verify_parser.add_argument("--receipt", required=True)
    stage_parser = subparsers.add_parser("stage", help="combine reviewed runs into a pending release")
    stage_parser.add_argument("--release-dir", required=True)
    stage_parser.add_argument("--run-dir", action="append", required=True)
    stage_parser.add_argument("--target", required=True)
    publish_parser = subparsers.add_parser("publish", help="publish a signed pending release")
    publish_parser.add_argument("--release-dir", required=True)
    publish_parser.add_argument("--target", required=True)
    publish_parser.add_argument("--signature", required=True)
    rollback_parser = subparsers.add_parser("rollback", help="restore a signed release backup")
    rollback_parser.add_argument("--release-dir", required=True)
    rollback_parser.add_argument("--target", required=True)
    rollback_parser.add_argument("--signature", required=True)
    audit_parser = subparsers.add_parser(
        "audit-legacy", help="audit the tracked legacy N1 lex pool without converting it"
    )
    audit_parser.add_argument("--source", required=True)
    audit_parser.add_argument("--report", required=True)
    return parser


def cli(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
        if args.command == "init-run":
            result = init_run(
                run_dir=Path(args.run_dir),
                level=args.level,
                group=args.group,
                wave=args.wave,
                provenance_path=Path(args.provenance),
            )
        elif args.command == "ingest":
            result = ingest_run(run_dir=Path(args.run_dir), source_path=Path(args.source))
        elif args.command == "verify":
            result = verify_run(run_dir=Path(args.run_dir), receipt_path=Path(args.receipt))
        elif args.command == "stage":
            result = stage_release(
                release_dir=Path(args.release_dir),
                run_dirs=[Path(value) for value in args.run_dir],
                target_path=Path(args.target),
            )
        elif args.command == "publish":
            result = publish_release(
                release_dir=Path(args.release_dir),
                target_path=Path(args.target),
                signature_path=Path(args.signature),
            )
        elif args.command == "rollback":
            result = rollback_release(
                release_dir=Path(args.release_dir),
                target_path=Path(args.target),
                signature_path=Path(args.signature),
            )
        elif args.command == "audit-legacy":
            result = audit_legacy(
                source_path=Path(args.source),
                report_path=Path(args.report),
            )
        else:
            raise PipelineError("command_invalid", f"unsupported command: {args.command}")
    except (ContractError, PipelineError) as error:
        code = error.code if isinstance(error, PipelineError) else "contract_invalid"
        payload = {"status": "failed", "code": code, "message": str(error)}
        if isinstance(error, PipelineError) and error.details is not None:
            payload["details"] = error.details
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
