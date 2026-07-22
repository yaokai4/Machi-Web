#!/usr/bin/env python3
"""Fail-closed, resumable trust pipeline for JLPT v2 question artifacts."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
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
_INTEGER = re.compile(r"[0-9]+")


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
        path = run_dir / metadata.get("path", "")
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
