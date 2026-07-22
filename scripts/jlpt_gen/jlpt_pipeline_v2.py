#!/usr/bin/env python3
"""Fail-closed, resumable trust pipeline for JLPT v2 question artifacts."""

from __future__ import annotations

import argparse
import base64
import copy
import fcntl
import hashlib
import json
import math
import os
import re
import secrets
import subprocess
import sys
import tempfile
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
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
_FUZZY_IGNORED = re.compile(r"[\W_]+", re.UNICODE)
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


def _fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_fd = os.open(str(path), flags)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _write_bytes_atomic(
    path: Path,
    payload: bytes,
    *,
    expected_sha256: str | None = None,
) -> None:
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
        if expected_sha256 is not None:
            try:
                current_hash = _sha256_bytes(path.read_bytes())
            except OSError as error:
                raise PipelineError(
                    "target_changed", f"cannot re-read compare-and-swap target: {error}"
                ) from error
            if current_hash != expected_sha256:
                raise PipelineError(
                    "target_changed",
                    "target changed after its publication snapshot; compare-and-swap refused overwrite",
                )
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    except BaseException:
        if open_descriptor is not None:
            os.close(open_descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


@contextmanager
def _exclusive_path_locks(paths: list[Path]):
    handles: list[Any] = []
    try:
        for path in sorted({item.resolve() for item in paths}, key=str):
            path.parent.mkdir(parents=True, exist_ok=True)
            existed = path.exists()
            handle = path.open("a+b")
            handles.append(handle)
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            if not existed:
                handle.flush()
                os.fsync(handle.fileno())
                _fsync_directory(path.parent)
        yield
    finally:
        for handle in reversed(handles):
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            finally:
                handle.close()


def _release_lock_path(release_dir: Path) -> Path:
    return release_dir.parent / f".{release_dir.name}.jlptv2-release.lock"


def _target_lock_path(target_path: Path) -> Path:
    return target_path.parent / f".{target_path.name}.jlptv2-target.lock"


def _registry_lock_path(registry_path: Path) -> Path:
    return registry_path.parent / f".{registry_path.name}.lock"


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


def _ensure_bytes_artifact(path: Path, payload: bytes) -> None:
    if path.exists():
        try:
            existing = path.read_bytes()
        except OSError as error:
            raise PipelineError("file_unreadable", f"cannot read {path}: {error}") from error
        if existing != payload:
            raise PipelineError("artifact_collision", f"existing {path.name} has different content")
        return
    _write_bytes_atomic(path, payload)


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
    if provenance["authorModel"] not in provenance["models"]:
        raise PipelineError("provenance_mismatch", "provenance authorModel is absent from models")
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
        "releaseLinks": [],
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
    receipt_source_hash: str,
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
    if not _SHA256.fullmatch(receipt_source_hash):
        raise PipelineError("receipt_invalid", "receipt source hash is malformed")
    reviewers = receipt["reviewers"]
    minimum = contract["qualityGate"]["minimumIndependentReviewers"]
    if len(reviewers) < minimum or len(set(reviewers)) != len(reviewers):
        raise PipelineError("receipt_invalid", "receipt requires distinct independent reviewers")
    verdicts_by_hash: dict[str, dict[str, Any]] = {}
    reviewer_profiles: dict[str, tuple[str, str]] = {}
    author_step_id = manifest["provenance"]["authorStepId"]
    author_model = manifest["provenance"]["authorModel"]
    provenance_models = set(manifest["provenance"]["models"])
    for verdict in receipt["verdicts"]:
        content_hash = verdict["contentHash"]
        if content_hash in verdicts_by_hash:
            raise PipelineError("receipt_invalid", "receipt contains duplicate contentHash verdicts")
        review_ids = [review["reviewer"] for review in verdict["reviews"]]
        if len(review_ids) != len(set(review_ids)) or set(review_ids) != set(reviewers):
            raise PipelineError("receipt_invalid", "each verdict must contain exactly one review per reviewer")
        step_ids = [review["stepId"] for review in verdict["reviews"]]
        models = [review["model"] for review in verdict["reviews"]]
        if (
            len(step_ids) != len(set(step_ids))
            or author_step_id in step_ids
            or len(models) != len(set(models))
            or author_model in models
            or any(model not in provenance_models for model in models)
        ):
            raise PipelineError(
                "receipt_invalid",
                "answer and explanation reviews must use distinct non-author steps and models",
            )
        for review in verdict["reviews"]:
            profile = (review["stepId"], review["model"])
            previous_profile = reviewer_profiles.setdefault(review["reviewer"], profile)
            if previous_profile != profile:
                raise PipelineError(
                    "receipt_invalid", "reviewer step and model attribution must be stable"
                )
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
            and all(review["answerAccepted"] is True for review in reviews)
            and all(review["answerFatal"] is False for review in reviews)
            and all(review["explanationAccepted"] is True for review in reviews)
            and all(review["explanationFatal"] is False for review in reviews)
            and all(canonical_text(review["answer"]) == authored_answer for review in reviews)
        )
        if qualifies:
            item = copy.deepcopy(question)
            item["reviewStatus"] = "verified"
            item["provenanceEvidence"] = {
                "runId": manifest["runId"],
                "request": copy.deepcopy(manifest["request"]),
                "workflowSha256": manifest["workflow"]["sha256"],
                "authorStepId": author_step_id,
                "authorModel": author_model,
            }
            item["reviewEvidence"] = {
                "receiptSha256": receipt_source_hash,
                "issuedAt": receipt["issuedAt"],
                "reviews": copy.deepcopy(reviews),
            }
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
        receipt_source_hash=receipt_source_hash,
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


def _reviewed_records(
    run_dir: Path,
) -> tuple[str, dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    manifest = _load_run(run_dir)
    if manifest.get("state") not in {"reviewed", "staged", "published", "rolled_back"}:
        raise PipelineError("state_invalid", f"run {manifest.get('runId')} is not review-qualified")
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
    recomputed, _ = _validated_receipt(
        receipt,
        manifest=manifest,
        questions=sanitized,
        receipt_source_hash=str(manifest.get("receipt", {}).get("sourceSha256", "")),
    )
    if recomputed != verified:
        raise PipelineError("artifact_tampered", "verified artifact differs from receipt-qualified records")
    verified_meta = manifest["artifacts"]["verified"]
    if verified_meta.get("count") != len(verified):
        raise PipelineError("artifact_tampered", "verified artifact count differs from manifest")
    expected_level = manifest["request"]["level"]
    expected_group = manifest["request"]["group"]
    allowed_qtypes = set(load_contract()["generationGroups"][expected_group])
    for record in verified:
        if (
            not isinstance(record, dict)
            or record.get("level") != expected_level
            or record.get("qtype") not in allowed_qtypes
            or record.get("reviewStatus") != "verified"
            or record.get("source") != "jlptv2"
            or not str(record.get("id", "")).startswith("jlptv2-q-")
            or not _SHA256.fullmatch(str(record.get("contentHash", "")))
        ):
            raise PipelineError("artifact_invalid", "verified record is not a valid jlptv2 record")
    reference = {
        "runId": manifest["runId"],
        "path": str(run_dir.resolve()),
        "request": copy.deepcopy(manifest["request"]),
        "workflowSha256": manifest["workflow"]["sha256"],
        "verifiedSha256": manifest["artifacts"]["verified"]["sha256"],
        "receiptSha256": manifest["receipt"]["sourceSha256"],
    }
    return manifest["runId"], copy.deepcopy(manifest["request"]), verified, reference


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


def _release_id(
    candidate_hash: str,
    target_path: Path,
    observed_hash: str,
    release_nonce: str,
) -> str:
    identity = {
        "candidateSha256": candidate_hash,
        "targetPath": str(target_path.resolve()),
        "targetObservedSha256": observed_hash,
        "releaseNonce": release_nonce,
    }
    return f"jlptv2-release-{_sha256_bytes(_json_bytes(identity))[:16]}"


def _release_artifact(path: Path, expected_name: str) -> dict[str, Any]:
    if path.name != expected_name:
        raise PipelineError("artifact_tampered", f"release artifact path must be {expected_name}")
    return _artifact(path)


def _fuzzy_fingerprint(record: dict[str, Any]) -> str:
    choices = record.get("choices") if isinstance(record.get("choices"), list) else []
    value = "\n".join(
        [
            str(record.get("stem", "")),
            str(record.get("passage", "")),
            *sorted(str(choice) for choice in choices),
        ]
    )
    return _FUZZY_IGNORED.sub("", canonical_text(value)).casefold()


def _fuzzy_shingles(value: str, size: int) -> set[str]:
    if len(value) < size:
        return {value} if value else set()
    return {value[index : index + size] for index in range(len(value) - size + 1)}


def _fuzzy_similarity_issues(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return deterministic near-duplicate pairs within one level/qtype.

    Members of one atomic passage group are intentionally excluded: their
    shared passage is required by the exam format and is not cross-wave reuse.
    """
    gate = load_contract()["similarityGate"]
    shingle_size = gate["fuzzyShingleSize"]
    threshold = float(gate["fuzzyDiceThreshold"])
    minimum_characters = gate["minimumCanonicalCharacters"]
    buckets: dict[tuple[str, str], list[tuple[dict[str, Any], str, set[str]]]] = {}
    for record in records:
        fingerprint = _fuzzy_fingerprint(record)
        if len(fingerprint) < minimum_characters:
            continue
        key = (str(record.get("level", "")), str(record.get("qtype", "")))
        buckets.setdefault(key, []).append(
            (record, fingerprint, _fuzzy_shingles(fingerprint, shingle_size))
        )
    issues: list[dict[str, Any]] = []
    for key in sorted(buckets):
        raw_items = buckets[key]
        frequencies = Counter(
            shingle
            for _, _, shingles in raw_items
            for shingle in shingles
        )
        items = sorted(
            raw_items,
            key=lambda item: (len(item[2]), str(item[0].get("id", ""))),
        )
        jaccard_threshold = threshold / (2.0 - threshold)
        ordered_tokens = [
            sorted(shingles, key=lambda token: (frequencies[token], token))
            for _, _, shingles in items
        ]
        prefix_postings: dict[str, list[int]] = {}
        for right_index, (right, right_text, right_shingles) in enumerate(items):
            right_tokens = ordered_tokens[right_index]
            prefix_length = max(
                0,
                len(right_tokens) - math.ceil(jaccard_threshold * len(right_tokens)) + 1,
            )
            candidates: set[int] = set()
            for token in right_tokens[:prefix_length]:
                candidates.update(prefix_postings.get(token, []))
            for left_index in sorted(candidates):
                left, left_text, left_shingles = items[left_index]
                if left.get("id") == right.get("id"):
                    continue
                if left.get("groupId") and left.get("groupId") == right.get("groupId"):
                    continue
                if not left_shingles or not right_shingles:
                    continue
                smaller = min(len(left_shingles), len(right_shingles))
                larger = max(len(left_shingles), len(right_shingles))
                if (2.0 * smaller) / (smaller + larger) < threshold:
                    continue
                score = (2.0 * len(left_shingles & right_shingles)) / (
                    len(left_shingles) + len(right_shingles)
                )
                if score < threshold:
                    continue
                issues.append(
                    {
                        "code": "fuzzy_duplicate",
                        "level": key[0],
                        "qtype": key[1],
                        "questionIds": sorted([left["id"], right["id"]]),
                        "similarity": round(score, 6),
                        "fingerprintSha256": sorted(
                            [
                                _sha256_bytes(left_text.encode("utf-8")),
                                _sha256_bytes(right_text.encode("utf-8")),
                            ]
                        ),
                    }
                )
            for token in right_tokens[:prefix_length]:
                prefix_postings.setdefault(token, []).append(right_index)
    return sorted(
        issues,
        key=lambda issue: (
            issue["level"],
            issue["qtype"],
            issue["questionIds"],
        ),
    )


def _release_distribution_issues(
    records: list[dict[str, Any]],
    *,
    run_groups_by_level: dict[str, set[str]],
) -> dict[str, Any]:
    contract = load_contract()
    release_gate = contract["releaseGate"]
    issues: dict[str, Any] = {}
    for level in ("N1", "N2"):
        level_records = [record for record in records if record.get("level") == level]
        required_groups = set(release_gate["requiredRunGroupsByLevel"][level])
        missing_groups = sorted(required_groups - run_groups_by_level.get(level, set()))
        section_counts = Counter(str(record.get("section", "")) for record in level_records)
        section_shortfalls = {
            section: {"minimum": minimum, "available": section_counts.get(section, 0)}
            for section, minimum in release_gate["minimumUniqueBySection"][level].items()
            if section_counts.get(section, 0) < minimum
        }
        qtype_counts = Counter(str(record.get("qtype", "")) for record in level_records)
        coverage_copies = release_gate["minimumPaperCoverageCopiesByQtype"]
        qtype_shortfalls = {
            qtype: {
                "minimum": count * coverage_copies,
                "available": qtype_counts.get(qtype, 0),
            }
            for qtype, count in contract["paperSpec"][level].items()
            if qtype_counts.get(qtype, 0) < count * coverage_copies
        }
        if missing_groups or section_shortfalls or qtype_shortfalls:
            issues[level] = {
                "missingRunGroups": missing_groups,
                "sectionShortfalls": section_shortfalls,
                "qtypeShortfalls": qtype_shortfalls,
            }
    return issues


def _question_set_sha256(records: list[dict[str, Any]]) -> str:
    payload = [
        {"id": record["id"], "contentHash": record["contentHash"]}
        for record in sorted(records, key=lambda item: item["id"])
    ]
    return _sha256_bytes(_json_bytes(payload))


def _validated_external_similarity_evidence(
    path: Path | None,
    *,
    records: list[dict[str, Any]],
    trusted_keys_path: Path | None,
    allow_expired: bool = False,
) -> tuple[dict[str, Any], str, dict[str, bytes], str, dict[str, str]]:
    if path is None:
        raise PipelineError(
            "external_similarity_gate_required",
            "embedding and official-corpus similarity evidence is required",
            details={"questionSetSha256": _question_set_sha256(records)},
        )
    if trusted_keys_path is None:
        raise PipelineError(
            "external_similarity_gate_required",
            "a trusted external-checker public-key ring is required",
        )
    evidence = _load_json(path, label="external similarity evidence")
    required = {
        "evidenceVersion",
        "contractSha256",
        "questionSetSha256",
        "checkedAt",
        "embedding",
        "officialCorpus",
    }
    if not isinstance(evidence, dict) or set(evidence) != required:
        raise PipelineError("external_similarity_gate_invalid", "similarity evidence fields are not exact")
    if evidence["evidenceVersion"] != 1:
        raise PipelineError("external_similarity_gate_invalid", "evidenceVersion must be 1")
    if evidence["contractSha256"] != contract_sha256():
        raise PipelineError("external_similarity_gate_invalid", "evidence contract hash differs")
    question_set_hash = _question_set_sha256(records)
    if evidence["questionSetSha256"] != question_set_hash:
        raise PipelineError("external_similarity_gate_invalid", "evidence question set hash differs")
    try:
        checked_at = _parse_signature_time(str(evidence["checkedAt"]))
    except (TypeError, ValueError) as error:
        raise PipelineError(
            "external_similarity_gate_invalid", f"evidence checkedAt is invalid: {error}"
        ) from error

    common_fields = {
        "kind",
        "status",
        "receiptPath",
        "receiptSha256",
        "keyId",
        "issuedAt",
        "expiresAt",
        "signatureBase64",
    }
    expected_fields = {
        "embedding": common_fields | {"provider", "model", "indexSha256"},
        "officialCorpus": common_fields | {"checkerVersion", "corpusSha256"},
    }
    normalized = copy.deepcopy(evidence)
    receipt_payloads: dict[str, bytes] = {}
    checker_key_ids: dict[str, str] = {}
    checker_public_key_fingerprints: dict[str, str] = {}
    receipt_destinations = {
        "embedding": "similarity/embedding_receipt.json",
        "officialCorpus": "similarity/official_corpus_receipt.json",
    }
    for kind in ("embedding", "officialCorpus"):
        component = evidence[kind]
        if (
            not isinstance(component, dict)
            or set(component) != expected_fields[kind]
            or component.get("kind") != kind
            or component.get("status") != "passed-external"
            or any(
                not isinstance(component.get(field), str) or not component[field]
                for field in expected_fields[kind] - {"status", "kind"}
            )
            or not _SHA256.fullmatch(str(component.get("receiptSha256", "")))
        ):
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} attestation is incomplete"
            )
        hash_field = "indexSha256" if kind == "embedding" else "corpusSha256"
        if not _SHA256.fullmatch(str(component.get(hash_field, ""))):
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} corpus/index hash is malformed"
            )
        try:
            issued_at = _parse_signature_time(component["issuedAt"])
            expires_at = _parse_signature_time(component["expiresAt"])
        except ValueError as error:
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} attestation time is invalid: {error}"
            ) from error
        now = datetime.now(timezone.utc)
        if expires_at <= issued_at or (not allow_expired and expires_at <= now):
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} attestation is expired or malformed"
            )
        if issued_at > now + timedelta(minutes=5) or not issued_at <= checked_at <= expires_at:
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} checkedAt is outside its validity window"
            )
        receipt_path = Path(component["receiptPath"])
        if not receipt_path.is_absolute():
            receipt_path = path.parent / receipt_path
        try:
            receipt_payload = receipt_path.read_bytes()
        except OSError as error:
            raise PipelineError(
                "external_similarity_gate_invalid",
                f"{kind} receipt artifact is missing or unreadable: {error}",
            ) from error
        if _sha256_bytes(receipt_payload) != component["receiptSha256"]:
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} receipt content hash differs"
            )
        try:
            decoded_signature = base64.b64decode(component["signatureBase64"], validate=True)
        except (TypeError, ValueError) as error:
            raise PipelineError(
                "external_similarity_gate_invalid", f"{kind} signature is malformed"
            ) from error
        try:
            trusted_key = _trusted_approval_key(
                trusted_keys_path,
                component["keyId"],
                expected_role=(
                    "embedding_checker"
                    if kind == "embedding"
                    else "official_corpus_checker"
                ),
            )
        except PipelineError as error:
            raise PipelineError(
                "external_similarity_gate_invalid",
                f"{kind} checker key is not trusted: {error}",
            ) from error
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
        try:
            _verify_ed25519_signature(
                public_key_pem=trusted_key["publicKeyPem"],
                payload=_json_bytes(signed_payload),
                signature=decoded_signature,
            )
        except PipelineError as error:
            raise PipelineError(
                "external_similarity_gate_invalid",
                f"{kind} checker signature is not trusted: {error}",
            ) from error
        try:
            checker_public_key_fingerprints[kind] = _ed25519_public_key_fingerprint(
                trusted_key["publicKeyPem"]
            )
        except PipelineError as error:
            raise PipelineError(
                "external_similarity_gate_invalid",
                f"{kind} checker public key is invalid: {error}",
            ) from error
        checker_key_ids[kind] = component["keyId"]
        normalized[kind]["receiptPath"] = receipt_destinations[kind]
        receipt_payloads[kind] = receipt_payload
    if len(set(checker_key_ids.values())) != 2:
        raise PipelineError(
            "external_similarity_gate_invalid",
            "embedding and official-corpus attestations require distinct key IDs",
        )
    if len(set(checker_public_key_fingerprints.values())) != 2:
        raise PipelineError(
            "external_similarity_gate_invalid",
            "embedding and official-corpus attestations require distinct public keys",
        )
    return (
        normalized,
        _sha256_file(path),
        receipt_payloads,
        _sha256_file(trusted_keys_path),
        checker_public_key_fingerprints,
    )


def _run_link_lock_path(run_dir: Path) -> Path:
    return run_dir.parent / f".{run_dir.name}.jlptv2-run.lock"


def _link_runs_to_release(
    manifest: dict[str, Any], *, release_dir: Path, lifecycle_state: str
) -> None:
    if lifecycle_state not in {"staged", "published", "rolled_back"}:
        raise PipelineError("state_invalid", "unsupported run-release lifecycle state")
    references = manifest.get("runs")
    if not isinstance(references, list) or not references:
        raise PipelineError("release_invalid", "release is missing reviewed-run references")
    for reference in references:
        if (
            not isinstance(reference, dict)
            or set(reference)
            != {
                "runId",
                "path",
                "request",
                "workflowSha256",
                "verifiedSha256",
                "receiptSha256",
            }
        ):
            raise PipelineError("release_invalid", "release run reference is malformed")
        run_dir = Path(reference["path"])
        with _exclusive_path_locks([_run_link_lock_path(run_dir)]):
            run_manifest = _load_run(run_dir)
            if (
                run_manifest.get("runId") != reference["runId"]
                or run_manifest.get("request") != reference["request"]
                or run_manifest.get("workflow", {}).get("sha256")
                != reference["workflowSha256"]
                or run_manifest.get("artifacts", {}).get("verified", {}).get("sha256")
                != reference["verifiedSha256"]
                or run_manifest.get("receipt", {}).get("sourceSha256")
                != reference["receiptSha256"]
            ):
                raise PipelineError(
                    "artifact_tampered",
                    f"run {reference['runId']} no longer matches signed release evidence",
                )
            links = run_manifest.get("releaseLinks", [])
            if not isinstance(links, list):
                raise PipelineError("manifest_invalid", "run releaseLinks must be an array")
            immutable_link = {
                "releaseId": manifest["releaseId"],
                "releaseNonce": manifest["releaseNonce"],
                "candidateSha256": manifest["artifacts"]["candidate"]["sha256"],
                "releaseManifestPath": str((release_dir / "manifest.json").resolve()),
            }
            matching = [link for link in links if link.get("releaseId") == manifest["releaseId"]]
            if len(matching) > 1:
                raise PipelineError("manifest_invalid", "run has duplicate links to one release")
            if matching:
                existing = matching[0]
                if any(existing.get(key) != value for key, value in immutable_link.items()):
                    raise PipelineError("manifest_invalid", "run release-link identity changed")
                prior_state = existing.get("state")
                transitions = {
                    "staged": {"staged", "published"},
                    "published": {"published", "rolled_back"},
                    "rolled_back": {"rolled_back"},
                }
                if lifecycle_state not in transitions.get(prior_state, set()):
                    raise PipelineError("state_invalid", "run release-link transition is invalid")
                existing["state"] = lifecycle_state
            else:
                if lifecycle_state != "staged":
                    raise PipelineError("manifest_invalid", "run is missing its staged release link")
                links.append({**immutable_link, "state": lifecycle_state})
            updated = copy.deepcopy(run_manifest)
            updated["releaseLinks"] = sorted(links, key=lambda item: item["releaseId"])
            linked_states = {link["state"] for link in updated["releaseLinks"]}
            if "published" in linked_states:
                updated["state"] = "published"
            elif "staged" in linked_states:
                updated["state"] = "staged"
            else:
                updated["state"] = "rolled_back"
            _write_json(run_dir / "manifest.json", updated)


def stage_release(
    *,
    release_dir: Path,
    run_dirs: list[Path],
    target_path: Path,
    similarity_evidence_path: Path | None = None,
    similarity_trusted_keys_path: Path | None = None,
) -> dict[str, Any]:
    if not run_dirs:
        raise PipelineError("run_invalid", "stage requires at least one reviewed run")
    unique_by_id: dict[str, dict[str, Any]] = {}
    run_ids: list[str] = []
    run_references: dict[str, dict[str, Any]] = {}
    run_groups_by_level: dict[str, set[str]] = {"N1": set(), "N2": set()}
    duplicate_exact = 0
    for run_dir in run_dirs:
        run_id, request, records, run_reference = _reviewed_records(run_dir)
        run_ids.append(run_id)
        previous_reference = run_references.setdefault(run_id, run_reference)
        if previous_reference != run_reference:
            raise PipelineError("identity_conflict", f"run identity {run_id} has conflicting evidence")
        run_groups_by_level[request["level"]].add(request["group"])
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
    distribution_issues = _release_distribution_issues(
        questions,
        run_groups_by_level=run_groups_by_level,
    )
    if distribution_issues:
        raise PipelineError(
            "release_distribution_shortfall",
            "verified questions do not meet required run-group, section, and qtype distribution",
            details=distribution_issues,
        )
    fuzzy_issues = _fuzzy_similarity_issues(questions)
    if fuzzy_issues:
        raise PipelineError(
            "fuzzy_duplicate",
            "deterministic fuzzy similarity gate rejected one or more question pairs",
            details=fuzzy_issues[:100],
        )
    (
        similarity_evidence,
        similarity_source_hash,
        similarity_receipts,
        similarity_keyring_hash,
        similarity_checker_fingerprints,
    ) = _validated_external_similarity_evidence(
        similarity_evidence_path,
        records=questions,
        trusted_keys_path=similarity_trusted_keys_path,
    )
    similarity_artifact_bytes = _pretty_json_bytes(similarity_evidence)
    for question in questions:
        question["publicationStatus"] = "pending"
    candidate = {
        "candidateVersion": 2,
        "contractVersion": contract["contractVersion"],
        "contractSha256": contract_sha256(),
        "source": "jlptv2",
        "publicationStatus": "pending",
        "similarityEvidence": {
            "questionSetSha256": similarity_evidence["questionSetSha256"],
            "sourceSha256": similarity_source_hash,
            "artifactSha256": _sha256_bytes(similarity_artifact_bytes),
            "checkerKeyringSha256": similarity_keyring_hash,
            "checkerPublicKeyFingerprints": similarity_checker_fingerprints,
            "embeddingReceiptSha256": _sha256_bytes(similarity_receipts["embedding"]),
            "officialCorpusReceiptSha256": _sha256_bytes(
                similarity_receipts["officialCorpus"]
            ),
            "verificationBoundary": "external-attestation-not-locally-recomputed",
        },
        "runIds": sorted(set(run_ids)),
        "runEvidence": [
            {key: value for key, value in reference.items() if key != "path"}
            for reference in sorted(run_references.values(), key=lambda item: item["runId"])
        ],
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
    manifest_path = release_dir / "manifest.json"
    diff_path = release_dir / "diff.json"
    if manifest_path.exists():
        existing_for_nonce = _load_json(manifest_path, label="release manifest")
        release_nonce = existing_for_nonce.get("releaseNonce")
    elif diff_path.exists():
        existing_for_nonce = _load_json(diff_path, label="release diff")
        release_nonce = existing_for_nonce.get("releaseNonce")
    else:
        release_nonce = secrets.token_hex(16)
    if not isinstance(release_nonce, str) or not re.fullmatch(r"[0-9a-f]{32}", release_nonce):
        raise PipelineError("release_invalid", "release nonce is missing or malformed")
    release_id = _release_id(candidate_hash, target_path, observed_hash, release_nonce)
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
        "releaseNonce": release_nonce,
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
        "releaseNonce": release_nonce,
        "state": "pending",
        "contract": {
            "version": contract["contractVersion"],
            "sha256": contract_sha256(),
        },
        "runIds": sorted(set(run_ids)),
        "runs": sorted(run_references.values(), key=lambda item: item["runId"]),
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
            "similarityEvidence": {
                "path": "similarity_evidence.json",
                "sha256": "",
                "sourceSha256": similarity_source_hash,
                "checkerKeyringSha256": similarity_keyring_hash,
                "bytes": 0,
            },
            "embeddingReceipt": {
                "path": "similarity/embedding_receipt.json",
                "sha256": _sha256_bytes(similarity_receipts["embedding"]),
                "bytes": len(similarity_receipts["embedding"]),
            },
            "officialCorpusReceipt": {
                "path": "similarity/official_corpus_receipt.json",
                "sha256": _sha256_bytes(similarity_receipts["officialCorpus"]),
                "bytes": len(similarity_receipts["officialCorpus"]),
            },
        },
        "signature": None,
        "publication": None,
        "rollback": None,
    }
    candidate_path = release_dir / "candidate.json"
    similarity_artifact_path = release_dir / "similarity_evidence.json"
    embedding_receipt_path = release_dir / "similarity" / "embedding_receipt.json"
    official_receipt_path = release_dir / "similarity" / "official_corpus_receipt.json"
    manifest["artifacts"]["similarityEvidence"].update(
        sha256=_sha256_bytes(similarity_artifact_bytes),
        bytes=len(similarity_artifact_bytes),
    )
    if manifest_path.exists():
        existing = _load_json(manifest_path, label="release manifest")
        if existing != manifest:
            raise PipelineError("release_immutable_mismatch", "existing release differs from staged inputs")
        if not all(
            path.is_file()
            for path in (
                candidate_path,
                diff_path,
                similarity_artifact_path,
                embedding_receipt_path,
                official_receipt_path,
            )
        ):
            raise PipelineError("artifact_missing", "pending release artifact is missing")
        if (
            _sha256_file(candidate_path) != candidate_hash
            or _sha256_file(diff_path) != diff_hash
            or _sha256_file(similarity_artifact_path)
            != manifest["artifacts"]["similarityEvidence"]["sha256"]
            or _sha256_file(embedding_receipt_path)
            != manifest["artifacts"]["embeddingReceipt"]["sha256"]
            or _sha256_file(official_receipt_path)
            != manifest["artifacts"]["officialCorpusReceipt"]["sha256"]
        ):
            raise PipelineError("artifact_tampered", "pending release artifact hash differs")
        _link_runs_to_release(
            existing,
            release_dir=release_dir,
            lifecycle_state="staged",
        )
        return {"status": "ok", "releaseId": release_id, "resumed": True}
    release_dir.mkdir(parents=True, exist_ok=True)
    _ensure_json_artifact(candidate_path, candidate)
    _ensure_json_artifact(diff_path, diff)
    _ensure_json_artifact(similarity_artifact_path, similarity_evidence)
    _ensure_bytes_artifact(embedding_receipt_path, similarity_receipts["embedding"])
    _ensure_bytes_artifact(official_receipt_path, similarity_receipts["officialCorpus"])
    if _release_artifact(candidate_path, "candidate.json")["sha256"] != candidate_hash:
        raise PipelineError("artifact_tampered", "candidate serialization hash differs")
    if _release_artifact(diff_path, "diff.json")["sha256"] != diff_hash:
        raise PipelineError("artifact_tampered", "diff serialization hash differs")
    _write_json(manifest_path, manifest)
    _link_runs_to_release(
        manifest,
        release_dir=release_dir,
        lifecycle_state="staged",
    )
    return {"status": "ok", "releaseId": release_id, "resumed": False}


def _load_release(
    release_dir: Path,
    *,
    similarity_trusted_keys_path: Path,
    allow_historical_similarity: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = release_dir / "manifest.json"
    if not manifest_path.is_file():
        raise PipelineError("release_missing", "release manifest is missing")
    manifest = _load_json(manifest_path, label="release manifest")
    if not isinstance(manifest, dict) or manifest.get("releaseVersion") != 2:
        raise PipelineError("release_invalid", "releaseVersion must be 2")
    if manifest.get("contract", {}).get("sha256") != contract_sha256():
        raise PipelineError("contract_drift", "current contract hash differs from release")
    artifacts = manifest.get("artifacts", {})
    for name, filename in (
        ("candidate", "candidate.json"),
        ("diff", "diff.json"),
        ("similarityEvidence", "similarity_evidence.json"),
        ("embeddingReceipt", "similarity/embedding_receipt.json"),
        ("officialCorpusReceipt", "similarity/official_corpus_receipt.json"),
    ):
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
    references = manifest.get("runs")
    candidate_evidence = candidate.get("runEvidence")
    if not isinstance(references, list) or not references or not isinstance(candidate_evidence, list):
        raise PipelineError("release_invalid", "release run evidence is missing")
    reference_ids = [reference.get("runId") for reference in references if isinstance(reference, dict)]
    expected_evidence = [
        {key: value for key, value in reference.items() if key != "path"}
        for reference in references
        if isinstance(reference, dict)
    ]
    if (
        len(reference_ids) != len(references)
        or len(set(reference_ids)) != len(reference_ids)
        or reference_ids != sorted(reference_ids)
        or manifest.get("runIds") != reference_ids
        or candidate.get("runIds") != reference_ids
        or candidate_evidence != expected_evidence
    ):
        raise PipelineError("release_invalid", "release run references differ from signed candidate")
    for question in candidate["questions"]:
        evidence_run_id = question.get("provenanceEvidence", {}).get("runId")
        receipt_hash = question.get("reviewEvidence", {}).get("receiptSha256")
        matching_reference = next(
            (reference for reference in references if reference.get("runId") == evidence_run_id),
            None,
        )
        if matching_reference is None or receipt_hash != matching_reference.get("receiptSha256"):
            raise PipelineError(
                "release_invalid", "candidate question provenance is not linked to a reviewed run"
            )
    similarity_path = release_dir / "similarity_evidence.json"
    historical_similarity = (
        allow_historical_similarity
        and manifest.get("state") in {"publishing", "published", "rolling_back", "rolled_back"}
        and _SHA256.fullmatch(str(manifest.get("signature", {}).get("approvalSha256", "")))
        is not None
    )
    (
        similarity,
        _,
        receipt_payloads,
        checker_keyring_hash,
        checker_public_key_fingerprints,
    ) = _validated_external_similarity_evidence(
        similarity_path,
        records=candidate["questions"],
        trusted_keys_path=similarity_trusted_keys_path,
        allow_expired=historical_similarity,
    )
    candidate_similarity = candidate.get("similarityEvidence")
    similarity_meta = artifacts["similarityEvidence"]
    if (
        not isinstance(candidate_similarity, dict)
        or candidate_similarity.get("questionSetSha256") != similarity["questionSetSha256"]
        or candidate_similarity.get("sourceSha256") != similarity_meta.get("sourceSha256")
        or candidate_similarity.get("artifactSha256") != similarity_meta.get("sha256")
        or candidate_similarity.get("checkerKeyringSha256") != checker_keyring_hash
        or similarity_meta.get("checkerKeyringSha256") != checker_keyring_hash
        or candidate_similarity.get("checkerPublicKeyFingerprints")
        != checker_public_key_fingerprints
        or candidate_similarity.get("embeddingReceiptSha256")
        != _sha256_bytes(receipt_payloads["embedding"])
        or candidate_similarity.get("embeddingReceiptSha256")
        != artifacts["embeddingReceipt"].get("sha256")
        or candidate_similarity.get("officialCorpusReceiptSha256")
        != _sha256_bytes(receipt_payloads["officialCorpus"])
        or candidate_similarity.get("officialCorpusReceiptSha256")
        != artifacts["officialCorpusReceipt"].get("sha256")
        or candidate_similarity.get("verificationBoundary")
        != "external-attestation-not-locally-recomputed"
    ):
        raise PipelineError("release_invalid", "similarity evidence differs from signed candidate")
    candidate_hash = artifacts["candidate"]["sha256"]
    target = manifest.get("target", {})
    if (
        not isinstance(diff, dict)
        or diff.get("releaseId") != manifest.get("releaseId")
        or diff.get("releaseNonce") != manifest.get("releaseNonce")
        or diff.get("candidateSha256") != candidate_hash
        or diff.get("target") != target
        or _release_id(
            candidate_hash,
            Path(str(target.get("path", ""))),
            str(target.get("observedSha256", "")),
            str(manifest.get("releaseNonce", "")),
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
    trusted_keys_path: Path,
    allow_expired: bool = False,
    forbidden_public_key_fingerprints: set[str] | None = None,
) -> tuple[dict[str, Any], str, str]:
    try:
        source_hash = _sha256_file(path)
        signature = _load_json(path, label=f"{decision} signature")
    except PipelineError as error:
        raise PipelineError("signature_invalid", str(error)) from error
    required = {
        "signatureVersion",
        "releaseId",
        "releaseNonce",
        "contractSha256",
        "candidateSha256",
        "similarityEvidenceSha256",
        "embeddingReceiptSha256",
        "officialCorpusReceiptSha256",
        "targetBeforeSha256",
        "decision",
        "keyId",
        "approvedBy",
        "issuedAt",
        "expiresAt",
        "signatureBase64",
    }
    if not isinstance(signature, dict) or set(signature) != required:
        raise PipelineError("signature_invalid", f"{decision} signature fields are not exact")
    if signature.get("signatureVersion") != 1:
        raise PipelineError("signature_invalid", "signatureVersion must be 1")
    string_fields = required - {"signatureVersion"}
    if any(not isinstance(signature[key], str) or not signature[key] for key in string_fields):
        raise PipelineError("signature_invalid", f"{decision} signature fields must be non-empty strings")
    if signature["decision"] != decision:
        raise PipelineError("signature_invalid", f"signature decision must be {decision}")
    for key, value in expected.items():
        if signature.get(key) != value:
            raise PipelineError("signature_invalid", f"signature {key} does not match release")
    for hash_field in (
        "contractSha256",
        "candidateSha256",
        "similarityEvidenceSha256",
        "embeddingReceiptSha256",
        "officialCorpusReceiptSha256",
        "targetBeforeSha256",
    ):
        if not _SHA256.fullmatch(signature[hash_field]):
            raise PipelineError("signature_invalid", "signature hashes must be lowercase SHA-256 values")
    if not re.fullmatch(r"[0-9a-f]{32}", signature["releaseNonce"]):
        raise PipelineError("signature_invalid", "signature release nonce is malformed")

    try:
        issued_at = _parse_signature_time(signature["issuedAt"])
        expires_at = _parse_signature_time(signature["expiresAt"])
    except ValueError as error:
        raise PipelineError("signature_invalid", f"signature time is invalid: {error}") from error
    now = datetime.now(timezone.utc)
    if expires_at <= issued_at:
        raise PipelineError("signature_invalid", "signature expiry must be later than issuance")
    if issued_at > now + timedelta(minutes=5):
        raise PipelineError("signature_not_yet_valid", "signature issuance is in the future")
    if expires_at <= now and not allow_expired:
        raise PipelineError("signature_expired", "signature approval has expired")

    key = _trusted_approval_key(
        trusted_keys_path,
        signature["keyId"],
        expected_role="human_release_owner",
    )
    key_fingerprint = _ed25519_public_key_fingerprint(key["publicKeyPem"])
    if key_fingerprint in (forbidden_public_key_fingerprints or set()):
        raise PipelineError(
            "signature_role_conflict",
            "human release approval must use a public key distinct from current similarity checkers",
        )
    if key["approvedBy"] != signature["approvedBy"]:
        raise PipelineError("signature_invalid", "signature approver does not match trusted key owner")
    try:
        signature_bytes = base64.b64decode(signature["signatureBase64"], validate=True)
    except (ValueError, TypeError) as error:
        raise PipelineError("signature_invalid", "signatureBase64 is malformed") from error
    if len(signature_bytes) != 64:
        raise PipelineError("signature_invalid", "Ed25519 signature must be 64 bytes")
    signed_fields = {key_name: signature[key_name] for key_name in required if key_name != "signatureBase64"}
    signed_payload = _json_bytes(signed_fields)
    _verify_ed25519_signature(
        public_key_pem=key["publicKeyPem"],
        payload=signed_payload,
        signature=signature_bytes,
    )
    approval_hash = _sha256_bytes(_json_bytes(signature))
    return signature, source_hash, approval_hash


def _parse_signature_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timezone offset is required")
    return parsed.astimezone(timezone.utc)


def _trusted_approval_key(
    path: Path,
    key_id: str,
    *,
    expected_role: str,
) -> dict[str, str]:
    try:
        keyring = _load_json(path, label="trusted approval keyring")
    except PipelineError as error:
        raise PipelineError("trusted_keys_invalid", str(error)) from error
    if (
        not isinstance(keyring, dict)
        or set(keyring) != {"keyringVersion", "keys"}
        or keyring.get("keyringVersion") != 1
        or not isinstance(keyring.get("keys"), list)
        or not keyring["keys"]
    ):
        raise PipelineError("trusted_keys_invalid", "trusted keyring schema is invalid")
    keys: dict[str, dict[str, str]] = {}
    for raw in keyring["keys"]:
        if (
            not isinstance(raw, dict)
            or set(raw)
            != {"keyId", "algorithm", "role", "approvedBy", "publicKeyPem"}
            or raw.get("algorithm") != "Ed25519"
            or raw.get("role")
            not in {
                "human_release_owner",
                "embedding_checker",
                "official_corpus_checker",
            }
            or any(
                not isinstance(raw.get(field), str) or not raw[field]
                for field in ("keyId", "approvedBy", "publicKeyPem")
            )
            or raw["keyId"] in keys
        ):
            raise PipelineError("trusted_keys_invalid", "trusted key entry is invalid or duplicated")
        keys[raw["keyId"]] = raw
    if key_id not in keys:
        raise PipelineError("signature_unknown_key", f"signature keyId {key_id!r} is not trusted")
    if keys[key_id]["role"] != expected_role:
        raise PipelineError(
            "signature_role_invalid",
            f"keyId {key_id!r} has role {keys[key_id]['role']!r}, expected {expected_role!r}",
        )
    return keys[key_id]


def _verify_ed25519_signature(
    *, public_key_pem: str, payload: bytes, signature: bytes
) -> None:
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.hazmat.primitives.serialization import load_pem_public_key
    except ImportError:
        _verify_ed25519_with_openssl(
            public_key_pem=public_key_pem,
            payload=payload,
            signature=signature,
        )
        return
    try:
        public_key = load_pem_public_key(public_key_pem.encode("utf-8"))
        if not isinstance(public_key, Ed25519PublicKey):
            raise ValueError("trusted public key is not Ed25519")
        public_key.verify(signature, payload)
    except InvalidSignature as error:
        raise PipelineError("signature_invalid", "Ed25519 signature verification failed") from error
    except (TypeError, ValueError) as error:
        raise PipelineError("trusted_keys_invalid", f"trusted public key is invalid: {error}") from error


def _verify_ed25519_with_openssl(
    *, public_key_pem: str, payload: bytes, signature: bytes
) -> None:
    try:
        with tempfile.TemporaryDirectory(prefix="jlptv2-signature-") as temporary_name:
            temporary = Path(temporary_name)
            public_key_path = temporary / "public.pem"
            payload_path = temporary / "payload.bin"
            signature_path = temporary / "signature.bin"
            public_key_path.write_text(public_key_pem, encoding="utf-8")
            payload_path.write_bytes(payload)
            signature_path.write_bytes(signature)
            verified = subprocess.run(
                [
                    "openssl",
                    "pkeyutl",
                    "-verify",
                    "-rawin",
                    "-pubin",
                    "-inkey",
                    str(public_key_path),
                    "-sigfile",
                    str(signature_path),
                    "-in",
                    str(payload_path),
                ],
                capture_output=True,
                check=False,
            )
    except OSError as error:
        raise PipelineError(
            "signature_verifier_unavailable", f"Ed25519 verifier is unavailable: {error}"
        ) from error
    if verified.returncode != 0:
        raise PipelineError("signature_invalid", "Ed25519 signature verification failed")


def _ed25519_public_key_fingerprint(public_key_pem: str) -> str:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
            load_pem_public_key,
        )
    except ImportError:
        try:
            with tempfile.TemporaryDirectory(prefix="jlptv2-public-key-") as temporary_name:
                public_path = Path(temporary_name) / "public.pem"
                public_path.write_text(public_key_pem, encoding="utf-8")
                converted = subprocess.run(
                    [
                        "openssl",
                        "pkey",
                        "-pubin",
                        "-in",
                        str(public_path),
                        "-outform",
                        "DER",
                    ],
                    capture_output=True,
                    check=False,
                )
        except OSError as error:
            raise PipelineError(
                "signature_verifier_unavailable", f"public-key verifier is unavailable: {error}"
            ) from error
        if converted.returncode != 0 or not converted.stdout:
            raise PipelineError("trusted_keys_invalid", "trusted Ed25519 public key is invalid")
        return _sha256_bytes(converted.stdout)
    try:
        public_key = load_pem_public_key(public_key_pem.encode("utf-8"))
        if not isinstance(public_key, Ed25519PublicKey):
            raise ValueError("trusted public key is not Ed25519")
        return _sha256_bytes(
            public_key.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
        )
    except (TypeError, ValueError) as error:
        raise PipelineError("trusted_keys_invalid", f"trusted public key is invalid: {error}") from error


_REGISTRY_FIELDS = {
    "registryVersion",
    "sequence",
    "previousEventSha256",
    "event",
    "approvalSha256",
    "releaseId",
    "releaseNonce",
    "decision",
    "keyId",
    "releaseDir",
    "targetPath",
    "recordedAt",
    "eventSha256",
}


def _approval_registry_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise PipelineError("approval_registry_invalid", f"approval registry is unreadable: {error}") from error
    events: list[dict[str, Any]] = []
    previous_hash = "0" * 64
    for index, line in enumerate(lines, start=1):
        if not line:
            raise PipelineError("approval_registry_invalid", "approval registry contains a blank event")
        try:
            event = json.loads(line)
        except json.JSONDecodeError as error:
            raise PipelineError("approval_registry_invalid", f"registry event {index} is invalid JSON") from error
        if (
            not isinstance(event, dict)
            or set(event) != _REGISTRY_FIELDS
            or event.get("registryVersion") != 1
            or event.get("sequence") != index
            or event.get("previousEventSha256") != previous_hash
            or event.get("event") not in {"reserved", "consumed"}
            or not _SHA256.fullmatch(str(event.get("approvalSha256", "")))
            or not _SHA256.fullmatch(str(event.get("eventSha256", "")))
        ):
            raise PipelineError("approval_registry_invalid", f"registry event {index} schema or chain is invalid")
        unsigned = {key: value for key, value in event.items() if key != "eventSha256"}
        if _sha256_bytes(_json_bytes(unsigned)) != event["eventSha256"]:
            raise PipelineError("approval_registry_invalid", f"registry event {index} hash is invalid")
        events.append(event)
        previous_hash = event["eventSha256"]
    return events


def _approval_registry_state(
    path: Path,
    *,
    approval_hash: str,
    release_dir: Path,
    target_path: Path,
    signature: dict[str, Any],
) -> str:
    expected_identity = {
        "releaseId": signature["releaseId"],
        "releaseNonce": signature["releaseNonce"],
        "decision": signature["decision"],
        "keyId": signature["keyId"],
        "releaseDir": str(release_dir.resolve()),
        "targetPath": str(target_path.resolve()),
    }
    matches = [
        event
        for event in _approval_registry_events(path)
        if event["approvalSha256"] == approval_hash
    ]
    if not matches:
        return "new"
    for event in matches:
        if any(event[key] != value for key, value in expected_identity.items()):
            raise PipelineError(
                "signature_reused",
                "approval signature was already reserved or consumed for another operation",
            )
    return "consumed" if any(event["event"] == "consumed" for event in matches) else "reserved"


def _append_approval_registry_event(
    path: Path,
    *,
    event_name: str,
    approval_hash: str,
    release_dir: Path,
    target_path: Path,
    signature: dict[str, Any],
) -> None:
    events = _approval_registry_events(path)
    record: dict[str, Any] = {
        "registryVersion": 1,
        "sequence": len(events) + 1,
        "previousEventSha256": events[-1]["eventSha256"] if events else "0" * 64,
        "event": event_name,
        "approvalSha256": approval_hash,
        "releaseId": signature["releaseId"],
        "releaseNonce": signature["releaseNonce"],
        "decision": signature["decision"],
        "keyId": signature["keyId"],
        "releaseDir": str(release_dir.resolve()),
        "targetPath": str(target_path.resolve()),
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }
    record["eventSha256"] = _sha256_bytes(_json_bytes(record))
    path.parent.mkdir(parents=True, exist_ok=True)
    existed = path.exists()
    descriptor = os.open(str(path), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        payload = _json_bytes(record) + b"\n"
        written = 0
        while written < len(payload):
            written += os.write(descriptor, payload[written:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    if not existed:
        _fsync_directory(path.parent)


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
    target_questions = target.get("questions", [])
    if not isinstance(target_questions, list):
        raise PipelineError("target_changed", "target questions are no longer an array")
    if any(
        isinstance(question, dict)
        and str(question.get("id", "")).startswith("mockv1-")
        for question in target_questions
    ):
        raise PipelineError("target_protected", "targets containing mockv1 question IDs are protected")
    for question in candidate["questions"]:
        if not isinstance(question, dict) or not str(question.get("id", "")).startswith("jlptv2-q-"):
            raise PipelineError("target_protected", "candidate contains a non-jlptv2 question ID")


def publish_release(
    *,
    release_dir: Path,
    target_path: Path,
    signature_path: Path,
    trusted_keys_path: Path,
    similarity_trusted_keys_path: Path,
    approval_registry_path: Path,
) -> dict[str, Any]:
    lock_paths = [
        _release_lock_path(release_dir),
        _target_lock_path(target_path),
        _registry_lock_path(approval_registry_path),
    ]
    with _exclusive_path_locks(lock_paths):
        return _publish_release_locked(
            release_dir=release_dir,
            target_path=target_path,
            signature_path=signature_path,
            trusted_keys_path=trusted_keys_path,
            similarity_trusted_keys_path=similarity_trusted_keys_path,
            approval_registry_path=approval_registry_path,
        )


def _publish_release_locked(
    *,
    release_dir: Path,
    target_path: Path,
    signature_path: Path,
    trusted_keys_path: Path,
    similarity_trusted_keys_path: Path,
    approval_registry_path: Path,
) -> dict[str, Any]:
    manifest, candidate = _load_release(
        release_dir,
        similarity_trusted_keys_path=similarity_trusted_keys_path,
        allow_historical_similarity=True,
    )
    target_bytes = _assert_release_target(manifest, target_path)
    _assert_publishable_target(target_path, target_bytes, candidate)
    expected_signature = {
        "releaseId": manifest["releaseId"],
        "releaseNonce": manifest["releaseNonce"],
        "contractSha256": manifest["contract"]["sha256"],
        "candidateSha256": manifest["artifacts"]["candidate"]["sha256"],
        "similarityEvidenceSha256": manifest["artifacts"]["similarityEvidence"]["sha256"],
        "embeddingReceiptSha256": manifest["artifacts"]["embeddingReceipt"]["sha256"],
        "officialCorpusReceiptSha256": manifest["artifacts"]["officialCorpusReceipt"]["sha256"],
        "targetBeforeSha256": manifest["target"]["observedSha256"],
    }
    signature, signature_source_hash, approval_hash = _validated_signature(
        signature_path,
        decision="publish",
        expected=expected_signature,
        trusted_keys_path=trusted_keys_path,
        allow_expired=manifest.get("state") in {"publishing", "published"},
        forbidden_public_key_fingerprints=set(
            candidate["similarityEvidence"]["checkerPublicKeyFingerprints"].values()
        ),
    )
    registry_state = _approval_registry_state(
        approval_registry_path,
        approval_hash=approval_hash,
        release_dir=release_dir,
        target_path=target_path,
        signature=signature,
    )
    state = manifest.get("state")
    if state == "published":
        if manifest.get("signature", {}).get("sourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "publish signature differs from recorded signature")
        if _sha256_bytes(target_bytes) != manifest.get("publication", {}).get("targetSha256"):
            raise PipelineError("target_changed", "published target hash differs from release")
        _link_runs_to_release(
            manifest,
            release_dir=release_dir,
            lifecycle_state="published",
        )
        if registry_state == "new":
            raise PipelineError(
                "approval_registry_invalid",
                "published release is missing its approval-consumption record",
            )
        if registry_state == "reserved":
            _append_approval_registry_event(
                approval_registry_path,
                event_name="consumed",
                approval_hash=approval_hash,
                release_dir=release_dir,
                target_path=target_path,
                signature=signature,
            )
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
        "publishedAt": signature["issuedAt"],
        "questions": approved_questions,
    }
    published_bytes = _pretty_json_bytes(bank)
    published_hash = _sha256_bytes(published_bytes)
    previous_path = release_dir / "rollback" / "previous.json"
    copied_signature_path = release_dir / "publish_signature.json"
    if state == "pending":
        if _sha256_bytes(target_bytes) != staged_hash:
            raise PipelineError("target_changed", "target hash differs from staged diff")
        if registry_state == "consumed":
            raise PipelineError(
                "approval_registry_invalid",
                "publish approval is consumed but release is still pending",
            )
        if registry_state == "new":
            _append_approval_registry_event(
                approval_registry_path,
                event_name="reserved",
                approval_hash=approval_hash,
                release_dir=release_dir,
                target_path=target_path,
                signature=signature,
            )
            registry_state = "reserved"
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
            "keyId": signature["keyId"],
            "approvedBy": signature["approvedBy"],
            "issuedAt": signature["issuedAt"],
            "expiresAt": signature["expiresAt"],
            "approvalSha256": approval_hash,
            "similarityEvidenceSha256": signature["similarityEvidenceSha256"],
            "embeddingReceiptSha256": signature["embeddingReceiptSha256"],
            "officialCorpusReceiptSha256": signature["officialCorpusReceiptSha256"],
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
        if registry_state == "new":
            raise PipelineError(
                "approval_registry_invalid",
                "in-progress publication is missing its approval reservation",
            )
        if manifest.get("signature", {}).get("sourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "publish signature differs from in-progress signature")
        if manifest.get("signature", {}).get("approvalSha256") != approval_hash:
            raise PipelineError("signature_changed", "publish approval fingerprint differs")
        for name, path in (("publishSignature", copied_signature_path), ("previous", previous_path)):
            metadata = manifest.get("artifacts", {}).get(name)
            if not isinstance(metadata, dict) or not path.is_file() or _sha256_file(path) != metadata.get("sha256"):
                raise PipelineError("artifact_tampered", f"{name} artifact differs during publication")
        current_hash = _sha256_bytes(target_bytes)
        if current_hash not in {staged_hash, published_hash}:
            raise PipelineError("target_changed", "target changed during publication")

    current_hash = _sha256_bytes(target_bytes)
    if current_hash != published_hash:
        _write_bytes_atomic(
            target_path,
            published_bytes,
            expected_sha256=current_hash,
        )
    if _sha256_file(target_path) != published_hash:
        raise PipelineError("target_changed", "published target hash verification failed")
    completed = copy.deepcopy(manifest)
    completed["state"] = "published"
    _write_json(release_dir / "manifest.json", completed)
    _link_runs_to_release(
        completed,
        release_dir=release_dir,
        lifecycle_state="published",
    )
    if registry_state != "consumed":
        _append_approval_registry_event(
            approval_registry_path,
            event_name="consumed",
            approval_hash=approval_hash,
            release_dir=release_dir,
            target_path=target_path,
            signature=signature,
        )
    return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": False}


def rollback_release(
    *,
    release_dir: Path,
    target_path: Path,
    signature_path: Path,
    trusted_keys_path: Path,
    similarity_trusted_keys_path: Path,
    approval_registry_path: Path,
) -> dict[str, Any]:
    lock_paths = [
        _release_lock_path(release_dir),
        _target_lock_path(target_path),
        _registry_lock_path(approval_registry_path),
    ]
    with _exclusive_path_locks(lock_paths):
        return _rollback_release_locked(
            release_dir=release_dir,
            target_path=target_path,
            signature_path=signature_path,
            trusted_keys_path=trusted_keys_path,
            similarity_trusted_keys_path=similarity_trusted_keys_path,
            approval_registry_path=approval_registry_path,
        )


def _rollback_release_locked(
    *,
    release_dir: Path,
    target_path: Path,
    signature_path: Path,
    trusted_keys_path: Path,
    similarity_trusted_keys_path: Path,
    approval_registry_path: Path,
) -> dict[str, Any]:
    manifest, candidate = _load_release(
        release_dir,
        similarity_trusted_keys_path=similarity_trusted_keys_path,
        allow_historical_similarity=True,
    )
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
        "releaseNonce": manifest["releaseNonce"],
        "contractSha256": manifest["contract"]["sha256"],
        "candidateSha256": manifest["artifacts"]["candidate"]["sha256"],
        "similarityEvidenceSha256": manifest["artifacts"]["similarityEvidence"]["sha256"],
        "embeddingReceiptSha256": manifest["artifacts"]["embeddingReceipt"]["sha256"],
        "officialCorpusReceiptSha256": manifest["artifacts"]["officialCorpusReceipt"]["sha256"],
        "targetBeforeSha256": published_hash,
    }
    signature, signature_source_hash, approval_hash = _validated_signature(
        signature_path,
        decision="rollback",
        expected=expected_signature,
        trusted_keys_path=trusted_keys_path,
        allow_expired=state in {"rolling_back", "rolled_back"},
        forbidden_public_key_fingerprints=set(
            candidate["similarityEvidence"]["checkerPublicKeyFingerprints"].values()
        ),
    )
    registry_state = _approval_registry_state(
        approval_registry_path,
        approval_hash=approval_hash,
        release_dir=release_dir,
        target_path=target_path,
        signature=signature,
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
        _link_runs_to_release(
            manifest,
            release_dir=release_dir,
            lifecycle_state="rolled_back",
        )
        if registry_state == "new":
            raise PipelineError(
                "approval_registry_invalid",
                "rolled-back release is missing its approval-consumption record",
            )
        if registry_state == "reserved":
            _append_approval_registry_event(
                approval_registry_path,
                event_name="consumed",
                approval_hash=approval_hash,
                release_dir=release_dir,
                target_path=target_path,
                signature=signature,
            )
        return {"status": "ok", "releaseId": manifest["releaseId"], "resumed": True}

    rollback_signature_path = release_dir / "rollback_signature.json"
    if state == "published":
        if _sha256_bytes(target_bytes) != published_hash:
            raise PipelineError("target_changed", "current target differs from published release")
        if registry_state == "new":
            _append_approval_registry_event(
                approval_registry_path,
                event_name="reserved",
                approval_hash=approval_hash,
                release_dir=release_dir,
                target_path=target_path,
                signature=signature,
            )
            registry_state = "reserved"
        elif registry_state == "consumed":
            raise PipelineError(
                "approval_registry_invalid",
                "rollback approval is consumed but release is not rolled back",
            )
        _ensure_json_artifact(rollback_signature_path, signature)
        rolling = copy.deepcopy(manifest)
        rolling["state"] = "rolling_back"
        rolling["artifacts"]["rollbackSignature"] = _artifact(rollback_signature_path)
        rolling["rollback"] = {
            "signatureSourceSha256": signature_source_hash,
            "approvalSha256": approval_hash,
            "similarityEvidenceSha256": signature["similarityEvidenceSha256"],
            "embeddingReceiptSha256": signature["embeddingReceiptSha256"],
            "officialCorpusReceiptSha256": signature["officialCorpusReceiptSha256"],
            "keyId": signature["keyId"],
            "approvedBy": signature["approvedBy"],
            "issuedAt": signature["issuedAt"],
            "expiresAt": signature["expiresAt"],
            "restoredSha256": previous_hash,
        }
        _write_json(release_dir / "manifest.json", rolling)
        manifest = rolling
    else:
        if registry_state == "new":
            raise PipelineError(
                "approval_registry_invalid",
                "in-progress rollback is missing its approval reservation",
            )
        if manifest.get("rollback", {}).get("signatureSourceSha256") != signature_source_hash:
            raise PipelineError("signature_changed", "rollback signature differs from in-progress signature")
        if manifest.get("rollback", {}).get("approvalSha256") != approval_hash:
            raise PipelineError("signature_changed", "rollback approval fingerprint differs")
        metadata = manifest.get("artifacts", {}).get("rollbackSignature")
        if (
            not isinstance(metadata, dict)
            or not rollback_signature_path.is_file()
            or _sha256_file(rollback_signature_path) != metadata.get("sha256")
        ):
            raise PipelineError("artifact_tampered", "rollback signature artifact differs")
        if _sha256_bytes(target_bytes) not in {published_hash, previous_hash}:
            raise PipelineError("target_changed", "target changed during rollback")

    current_hash = _sha256_bytes(target_bytes)
    if current_hash != previous_hash:
        _write_bytes_atomic(
            target_path,
            previous_bytes,
            expected_sha256=current_hash,
        )
    if _sha256_file(target_path) != previous_hash:
        raise PipelineError("target_changed", "restored target hash verification failed")
    completed = copy.deepcopy(manifest)
    completed["state"] = "rolled_back"
    _write_json(release_dir / "manifest.json", completed)
    _link_runs_to_release(
        completed,
        release_dir=release_dir,
        lifecycle_state="rolled_back",
    )
    if registry_state != "consumed":
        _append_approval_registry_event(
            approval_registry_path,
            event_name="consumed",
            approval_hash=approval_hash,
            release_dir=release_dir,
            target_path=target_path,
            signature=signature,
        )
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
    stage_parser.add_argument("--similarity-evidence")
    stage_parser.add_argument("--similarity-trusted-keys")
    publish_parser = subparsers.add_parser("publish", help="publish a signed pending release")
    publish_parser.add_argument("--release-dir", required=True)
    publish_parser.add_argument("--target", required=True)
    publish_parser.add_argument("--signature", required=True)
    publish_parser.add_argument("--trusted-keys", required=True)
    publish_parser.add_argument("--similarity-trusted-keys", required=True)
    publish_parser.add_argument("--approval-registry", required=True)
    rollback_parser = subparsers.add_parser("rollback", help="restore a signed release backup")
    rollback_parser.add_argument("--release-dir", required=True)
    rollback_parser.add_argument("--target", required=True)
    rollback_parser.add_argument("--signature", required=True)
    rollback_parser.add_argument("--trusted-keys", required=True)
    rollback_parser.add_argument("--similarity-trusted-keys", required=True)
    rollback_parser.add_argument("--approval-registry", required=True)
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
                similarity_evidence_path=(
                    Path(args.similarity_evidence) if args.similarity_evidence else None
                ),
                similarity_trusted_keys_path=(
                    Path(args.similarity_trusted_keys)
                    if args.similarity_trusted_keys
                    else None
                ),
            )
        elif args.command == "publish":
            result = publish_release(
                release_dir=Path(args.release_dir),
                target_path=Path(args.target),
                signature_path=Path(args.signature),
                trusted_keys_path=Path(args.trusted_keys),
                similarity_trusted_keys_path=Path(args.similarity_trusted_keys),
                approval_registry_path=Path(args.approval_registry),
            )
        elif args.command == "rollback":
            result = rollback_release(
                release_dir=Path(args.release_dir),
                target_path=Path(args.target),
                signature_path=Path(args.signature),
                trusted_keys_path=Path(args.trusted_keys),
                similarity_trusted_keys_path=Path(args.similarity_trusted_keys),
                approval_registry_path=Path(args.approval_registry),
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
