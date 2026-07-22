#!/usr/bin/env python3
"""Single-source JLPT v2 contract loading, validation, and content identity."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from copy import deepcopy
from pathlib import Path
from typing import Any


CONTRACT_PATH = Path(__file__).with_name("jlpt_contract_v2.json")
_HORIZONTAL_SPACE = re.compile(r"[\t \u3000]+")


class ContractError(ValueError):
    """The authoritative contract is missing, invalid, or inconsistent."""


class QuestionValidationError(ValueError):
    """One raw question violates the authoritative v2 contract."""

    def __init__(self, issues: list[dict[str, Any]]):
        self.issues = issues
        super().__init__(json.dumps(issues, ensure_ascii=False, sort_keys=True))


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _sha256_json(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def canonical_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [_HORIZONTAL_SPACE.sub(" ", line.strip()) for line in normalized.split("\n")]
    return "\n".join(lines).strip()


def _read_contract(path: Path) -> tuple[dict[str, Any], bytes]:
    try:
        raw = path.read_bytes()
        contract = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ContractError(f"contract unreadable: {error}") from error
    if not isinstance(contract, dict):
        raise ContractError("contract root must be an object")
    _validate_contract(contract)
    return contract, raw


def _validate_contract(contract: dict[str, Any]) -> None:
    if contract.get("contractVersion") != 2:
        raise ContractError("contractVersion must be 2")
    if contract.get("identityVersion") != 1:
        raise ContractError("identityVersion must be 1")
    qtypes = contract.get("qtypes")
    papers = contract.get("paperSpec")
    layouts = contract.get("sectionLayouts")
    if not isinstance(qtypes, dict) or not qtypes:
        raise ContractError("qtypes must be a non-empty object")
    if not isinstance(papers, dict) or set(papers) != {"N1", "N2", "N3", "N4", "N5"}:
        raise ContractError("paperSpec must define N1 through N5")
    if not isinstance(layouts, dict) or set(layouts) != set(papers):
        raise ContractError("sectionLayouts must match paperSpec levels")
    abbreviations: set[str] = set()
    for qtype, spec in qtypes.items():
        if not isinstance(spec, dict):
            raise ContractError(f"qtype {qtype} must be an object")
        abbreviation = spec.get("abbreviation")
        if not isinstance(abbreviation, str) or not abbreviation:
            raise ContractError(f"qtype {qtype} requires abbreviation")
        if abbreviation in abbreviations:
            raise ContractError(f"duplicate qtype abbreviation: {abbreviation}")
        abbreviations.add(abbreviation)
        if spec.get("section") not in {"vocab", "grammar", "reading", "listening"}:
            raise ContractError(f"qtype {qtype} has invalid section")
        if spec.get("groupMode") not in {"single", "atomic", "single_script"}:
            raise ContractError(f"qtype {qtype} has invalid groupMode")
    for level, paper in papers.items():
        if not isinstance(paper, dict) or not paper:
            raise ContractError(f"paperSpec {level} must be non-empty")
        for qtype, count in paper.items():
            if qtype not in qtypes or type(count) is not int or count <= 0:
                raise ContractError(f"paperSpec {level}.{qtype} is invalid")
        section_names = [item.get("name") for item in layouts[level] if isinstance(item, dict)]
        if len(section_names) != len(layouts[level]) or len(set(section_names)) != len(section_names):
            raise ContractError(f"sectionLayouts {level} contains invalid names")
        if any(type(item.get("durationSeconds")) is not int or item["durationSeconds"] <= 0 for item in layouts[level]):
            raise ContractError(f"sectionLayouts {level} contains invalid duration")
    release = contract.get("releaseGate", {}).get("minimumApprovedUniqueStagedByLevel")
    if release != {"N1": 1000, "N2": 1000}:
        raise ContractError("first-phase release gate must be N1=1000 and N2=1000")
    quality = contract.get("qualityGate")
    if not isinstance(quality, dict) or quality.get("minimumIndependentReviewers", 0) < 2:
        raise ContractError("quality gate requires at least two reviewers")


def load_contract(path: str | Path | None = None) -> dict[str, Any]:
    contract, _ = _read_contract(Path(path) if path is not None else CONTRACT_PATH)
    return deepcopy(contract)


def contract_sha256(path: str | Path | None = None) -> str:
    _, raw = _read_contract(Path(path) if path is not None else CONTRACT_PATH)
    return hashlib.sha256(raw).hexdigest()


def paper_spec() -> dict[str, dict[str, int]]:
    return deepcopy(load_contract()["paperSpec"])


def qtype_abbreviations() -> dict[str, str]:
    return {
        qtype: spec["abbreviation"]
        for qtype, spec in load_contract()["qtypes"].items()
    }


def qtype_sections() -> dict[str, str]:
    return {
        qtype: spec["section"]
        for qtype, spec in load_contract()["qtypes"].items()
    }


def section_durations() -> dict[str, dict[str, int]]:
    return {
        level: {item["name"]: item["durationSeconds"] for item in layout}
        for level, layout in load_contract()["sectionLayouts"].items()
    }


def validate_run_request(request: Any) -> dict[str, Any]:
    contract = load_contract()
    schema = contract["runSchema"]
    if not isinstance(request, dict):
        raise ContractError("run request must be an object")
    if set(request) != set(schema["required"]):
        raise ContractError("run request requires exactly level, group, and wave")
    level = request.get("level")
    group = request.get("group")
    wave = request.get("wave")
    if level not in schema["properties"]["level"]["enum"]:
        raise ContractError("level must be N1 or N2")
    if group not in schema["properties"]["group"]["enum"]:
        raise ContractError("group must be lex or rc")
    if type(wave) is not int or not 1 <= wave <= 9999:
        raise ContractError("wave must be an integer from 1 through 9999")
    return {"level": level, "group": group, "wave": wave}


def _issue(code: str, message: str, *, field: str = "") -> dict[str, Any]:
    return {"code": code, "message": message, "field": field}


def _validate_question_shape(question: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    contract = load_contract()
    schema = contract["questionSchema"]
    if not isinstance(question, dict):
        return {}, [_issue("question_not_object", "question must be an object")]
    issues: list[dict[str, Any]] = []
    required = set(schema["required"])
    properties = set(schema["properties"])
    missing = sorted(required - set(question))
    extra = sorted(set(question) - properties)
    for field in missing:
        issues.append(_issue("field_required", "required field is missing", field=field))
    for field in extra:
        issues.append(_issue("field_unknown", "unknown field is not allowed", field=field))
    if issues:
        return {}, issues

    level = question["level"]
    qtype = question["qtype"]
    qtypes = contract["qtypes"]
    if level not in contract["paperSpec"]:
        issues.append(_issue("level_invalid", "level must be N1 through N5", field="level"))
    if qtype not in qtypes:
        issues.append(_issue("qtype_invalid", "qtype is not defined by the contract", field="qtype"))
    elif level in contract["paperSpec"] and qtype not in contract["paperSpec"][level]:
        issues.append(_issue("qtype_level_mismatch", "qtype is not in this level paper", field="qtype"))
    if qtype in qtypes and question["section"] != qtypes[qtype]["section"]:
        issues.append(_issue("section_mismatch", "section does not match qtype", field="section"))

    for field in ("level", "section", "qtype", "stem", "passage", "group", "explanation"):
        if not isinstance(question[field], str):
            issues.append(_issue("field_type", "field must be a string", field=field))
    if "theme" in question and not isinstance(question["theme"], str):
        issues.append(_issue("field_type", "field must be a string", field="theme"))
    if isinstance(question["stem"], str) and not canonical_text(question["stem"]):
        issues.append(_issue("stem_required", "stem must not be blank", field="stem"))
    if isinstance(question["explanation"], str) and not canonical_text(question["explanation"]):
        issues.append(_issue("explanation_required", "explanation must not be blank", field="explanation"))

    choices = question["choices"]
    if not isinstance(choices, list) or len(choices) != 4:
        issues.append(_issue("choices_count", "choices must contain exactly four items", field="choices"))
    elif not all(isinstance(choice, str) and canonical_text(choice) for choice in choices):
        issues.append(_issue("choices_type", "choices must be non-empty strings", field="choices"))
    elif len(set(canonical_text(choice) for choice in choices)) != 4:
        issues.append(_issue("choices_unique", "choices must be unique after normalization", field="choices"))
    answer_index = question["answerIndex"]
    if type(answer_index) is not int or not 0 <= answer_index <= 3:
        issues.append(_issue("answer_index", "answerIndex must be an integer from 0 through 3", field="answerIndex"))
    difficulty = question["difficulty"]
    if type(difficulty) is not int or not 1 <= difficulty <= 5:
        issues.append(_issue("difficulty", "difficulty must be an integer from 1 through 5", field="difficulty"))

    if qtype in qtypes and isinstance(question["group"], str) and isinstance(question["passage"], str):
        mode = qtypes[qtype]["groupMode"]
        group = canonical_text(question["group"])
        passage = canonical_text(question["passage"])
        if mode == "single" and (group or passage):
            issues.append(_issue("single_context", "single qtype requires empty group and passage"))
        elif mode == "single_script" and (group or not passage):
            issues.append(_issue("listening_context", "listening qtype requires script and empty group"))
        elif mode == "atomic" and (not group or not passage):
            issues.append(_issue("atomic_context", "atomic qtype requires group and passage"))
    return question, issues


def normalize_question(question: Any) -> dict[str, Any]:
    raw, issues = _validate_question_shape(question)
    if issues:
        raise QuestionValidationError(issues)
    contract = load_contract()
    qtype = canonical_text(raw["qtype"])
    level = canonical_text(raw["level"]).upper()
    section = contract["qtypes"][qtype]["section"]
    choices = [canonical_text(choice) for choice in raw["choices"]]
    passage = canonical_text(raw["passage"])
    stem = canonical_text(raw["stem"])
    correct_answer = choices[raw["answerIndex"]]
    identity_payload = {
        "identityVersion": contract["identityVersion"],
        "level": level,
        "section": section,
        "qtype": qtype,
        "passage": passage,
        "stem": stem,
        "choices": sorted(choices),
    }
    identity_hash = _sha256_json(identity_payload)
    mode = contract["qtypes"][qtype]["groupMode"]
    group_id = ""
    if mode == "atomic":
        group_hash = _sha256_json(
            {
                "identityVersion": contract["identityVersion"],
                "level": level,
                "qtype": qtype,
                "passage": passage,
            }
        )
        group_id = f"jlptv2-g-{group_hash[:32]}"
    content_payload = {
        **identity_payload,
        "correctAnswer": correct_answer,
        "explanation": canonical_text(raw["explanation"]),
        "difficulty": raw["difficulty"],
        "theme": canonical_text(raw.get("theme", "")),
    }
    normalized = {
        "id": f"jlptv2-q-{identity_hash[:32]}",
        "groupId": group_id,
        "contentHash": _sha256_json(content_payload),
        "reviewStatus": "pending",
        "source": contract["source"],
        "level": level,
        "section": section,
        "qtype": qtype,
        "stem": stem,
        "passage": passage,
        "group": canonical_text(raw["group"]),
        "choices": choices,
        "answerIndex": raw["answerIndex"],
        "explanation": canonical_text(raw["explanation"]),
        "difficulty": raw["difficulty"],
        "theme": canonical_text(raw.get("theme", "")),
    }
    return normalized


def _raw_atomic_key(question: Any) -> tuple[str, str, str] | None:
    if not isinstance(question, dict):
        return None
    level = question.get("level")
    qtype = question.get("qtype")
    group = question.get("group")
    if not all(isinstance(value, str) for value in (level, qtype, group)):
        return None
    spec = load_contract()["qtypes"].get(qtype)
    if not spec or spec["groupMode"] != "atomic" or not canonical_text(group):
        return None
    return level.strip().upper(), qtype.strip(), canonical_text(group)


def sanitize_pool(
    pool: Any,
    *,
    expected_level: str | None = None,
    expected_group: str | None = None,
) -> dict[str, Any]:
    """Normalize a raw pool while preserving atomic rejection boundaries.

    Exact duplicate content is counted and collapsed. Reusing one identity with
    different content is fatal and removes every conflicting revision.
    """
    if not isinstance(pool, list):
        raise ContractError("pool must be an array")
    contract = load_contract()
    if expected_level is not None and expected_level not in ("N1", "N2"):
        raise ContractError("expected_level must be N1 or N2")
    if expected_group is not None and expected_group not in contract["generationGroups"]:
        raise ContractError("expected_group must be lex or rc")

    entries: list[dict[str, Any]] = []
    atomic_members: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    invalid_atomic_keys: set[tuple[str, str, str]] = set()
    for source_index, question in enumerate(pool):
        atomic_key = _raw_atomic_key(question)
        entry: dict[str, Any] = {
            "sourceIndex": source_index,
            "raw": question,
            "atomicKey": atomic_key,
            "record": None,
            "issues": [],
        }
        try:
            record = normalize_question(question)
        except QuestionValidationError as error:
            entry["issues"].extend(error.issues)
            if atomic_key:
                invalid_atomic_keys.add(atomic_key)
        else:
            if expected_level is not None and record["level"] != expected_level:
                entry["issues"].append(
                    _issue("run_level_mismatch", "question level does not match run", field="level")
                )
            if expected_group is not None and record["qtype"] not in contract["generationGroups"][expected_group]:
                entry["issues"].append(
                    _issue("run_group_mismatch", "question qtype does not match run group", field="qtype")
                )
            if entry["issues"]:
                if atomic_key:
                    invalid_atomic_keys.add(atomic_key)
            else:
                entry["record"] = record
        entries.append(entry)
        if atomic_key:
            atomic_members.setdefault(atomic_key, []).append(entry)

    for atomic_key, members in atomic_members.items():
        qtype = atomic_key[1]
        minimum = contract["qtypes"][qtype]["minimumGroupMembers"]
        valid_members = [member for member in members if member["record"] is not None]
        if len(valid_members) < minimum:
            invalid_atomic_keys.add(atomic_key)
        group_ids = {member["record"]["groupId"] for member in valid_members}
        if len(group_ids) > 1:
            invalid_atomic_keys.add(atomic_key)
    for atomic_key in invalid_atomic_keys:
        for entry in atomic_members.get(atomic_key, []):
            entry["record"] = None
            if not any(issue["code"] == "atomic_group_rejected" for issue in entry["issues"]):
                entry["issues"].append(
                    _issue("atomic_group_rejected", "one invalid member rejects the complete atomic group")
                )

    by_identity: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        if entry["record"] is not None:
            by_identity.setdefault(entry["record"]["id"], []).append(entry)
    duplicate_exact = 0
    identity_conflicts = 0
    for identity, identity_entries in by_identity.items():
        content_hashes = {entry["record"]["contentHash"] for entry in identity_entries}
        if len(content_hashes) > 1:
            identity_conflicts += len(identity_entries)
            for entry in identity_entries:
                entry["record"] = None
                entry["issues"].append(
                    _issue("identity_conflict", f"identity {identity} has multiple content hashes")
                )
            continue
        for duplicate in identity_entries[1:]:
            duplicate["record"] = None
            duplicate["duplicateExact"] = True
            duplicate_exact += 1

    records = [entry["record"] for entry in entries if entry["record"] is not None]
    rejected = [
        {"sourceIndex": entry["sourceIndex"], "issues": entry["issues"]}
        for entry in entries
        if entry["issues"]
    ]
    by_qtype: dict[str, int] = {}
    for record in records:
        by_qtype[record["qtype"]] = by_qtype.get(record["qtype"], 0) + 1
    individually_valid = sum(
        1
        for entry in entries
        if not any(issue["code"] not in {"atomic_group_rejected"} for issue in entry["issues"])
    )
    return {
        "records": records,
        "rejected": rejected,
        "fatal": bool(rejected),
        "metrics": {
            "raw": len(pool),
            "sanitized": individually_valid,
            "unique": len(records),
            "rejected": len(rejected),
            "duplicateExact": duplicate_exact,
            "identityConflicts": identity_conflicts,
            "byQtype": dict(sorted(by_qtype.items())),
        },
    }
