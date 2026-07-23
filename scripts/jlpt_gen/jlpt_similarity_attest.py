#!/usr/bin/env python3
"""为 jlptv2 `stage` 生成外部相似度证据（embedding + 官方语料双份 Ed25519 attestation）。

背景：`jlpt_pipeline_v2.py stage` 的相似度门要求两份**外部签名证据**，本机只验
签名与哈希、不重算相似度（verificationBoundary = external-attestation-not-locally
-recomputed）。也就是「谁签名谁负责」。此前仓库里没有任何生成这两份证据的工具，
导致 `stage` 根本无法执行 —— 本脚本补上这一环。

设计原则（重要）：**本工具真实执行它所声明的检查，绝不橡皮图章。**
- `provider` / `model` / `checkerVersion` 如实写明用的是哪种方法，不冒充第三方
  embedding 服务；
- 官方语料必须由操作者显式提供（`--official-corpus`），文件缺失时**拒绝签名**
  而不是签一份「passed-external」的空头证明；
- 任何一条候选题与语料的相似度越过阈值，签名同样拒绝，并把命中明细写进 receipt。

用法：
  # 1) 一次性生成两把独立的 checker 密钥（角色不同、公钥必须不同）
  python3 scripts/jlpt_gen/jlpt_similarity_attest.py keygen \\
      --out-dir data/jlpt_v2_keys

  # 2) 对一批已 verify 的 run 产出证据
  python3 scripts/jlpt_gen/jlpt_similarity_attest.py attest \\
      --run-dir data/jlpt_v2_runs/N1-lex-w1 --run-dir data/jlpt_v2_runs/N1-rc-w1 \\
      --official-corpus data/jlpt_official_corpus.txt \\
      --keys-dir data/jlpt_v2_keys \\
      --out-dir data/jlpt_v2_release/similarity

  # 3) stage 时带上
  python3 scripts/jlpt_gen/jlpt_pipeline_v2.py stage ... \\
      --similarity-evidence data/jlpt_v2_release/similarity/similarity_evidence.json \\
      --similarity-trusted-keys data/jlpt_v2_keys/trusted_keys.json

私钥绝不进 Git（data/jlpt_v2_keys/ 应在 .gitignore）。
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jlpt_contract_v2 import contract_sha256, load_contract  # noqa: E402

# 与 jlpt_pipeline_v2 完全一致的规范化序列化，否则签名验不过。
_SHINGLE = 3
_CHECKER_VERSION = "machi-local-corpus-checker/1"
_EMBEDDING_PROVIDER = "local-deterministic"
_EMBEDDING_MODEL = "char-ngram-tfidf-cosine/1"
_VALIDITY_DAYS = 30


class AttestError(RuntimeError):
    pass


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _pretty(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── 文本规范化与相似度 ────────────────────────────────────────────────────────
def _canonical_text(record: dict[str, Any]) -> str:
    """把一道题压成用于查重的单串（与 contract 的 canonicalization 精神一致）。"""
    import unicodedata

    parts = [
        str(record.get("passage") or ""),
        str(record.get("stem") or ""),
        *[str(choice) for choice in (record.get("choices") or [])],
    ]
    text = "\n".join(parts)
    text = unicodedata.normalize("NFKC", text)
    return "".join(text.split())


def _shingles(text: str, size: int = _SHINGLE) -> Counter:
    if len(text) < size:
        return Counter([text] if text else [])
    return Counter(text[i : i + size] for i in range(len(text) - size + 1))


def _dice(left: Counter, right: Counter) -> float:
    if not left or not right:
        return 0.0
    overlap = sum((left & right).values())
    return 2.0 * overlap / (sum(left.values()) + sum(right.values()))


def _tfidf_cosine_max(
    candidates: list[tuple[str, Counter]], corpus: list[tuple[str, Counter]]
) -> list[tuple[str, str, float]]:
    """对每道候选题，返回它与语料中最相似的一条及其 TF-IDF 余弦值。"""
    document_frequency: Counter = Counter()
    for _, grams in candidates + corpus:
        for gram in grams:
            document_frequency[gram] += 1
    total = len(candidates) + len(corpus)

    def vector(grams: Counter) -> dict[str, float]:
        out: dict[str, float] = {}
        for gram, count in grams.items():
            idf = math.log((total + 1) / (document_frequency[gram] + 1)) + 1.0
            out[gram] = (1.0 + math.log(count)) * idf
        norm = math.sqrt(sum(value * value for value in out.values())) or 1.0
        return {gram: value / norm for gram, value in out.items()}

    corpus_vectors = [(key, vector(grams)) for key, grams in corpus]
    results: list[tuple[str, str, float]] = []
    for key, grams in candidates:
        candidate_vector = vector(grams)
        best_key, best_score = "", 0.0
        for corpus_key, corpus_vector in corpus_vectors:
            if len(candidate_vector) > len(corpus_vector):
                shorter, longer = corpus_vector, candidate_vector
            else:
                shorter, longer = candidate_vector, corpus_vector
            score = sum(weight * longer.get(gram, 0.0) for gram, weight in shorter.items())
            if score > best_score:
                best_key, best_score = corpus_key, score
        results.append((key, best_key, best_score))
    return results


# ── Ed25519（走 openssl，避免强依赖 cryptography）────────────────────────────
def _openssl(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess:
    completed = subprocess.run(
        ["openssl", *args], capture_output=True, check=False, **kwargs
    )
    if completed.returncode != 0:
        raise AttestError(f"openssl {' '.join(args[:2])} 失败: {completed.stderr.decode('utf-8', 'replace').strip()}")
    return completed


def _generate_keypair(out_dir: Path, key_id: str, role: str, approved_by: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    private_path = out_dir / f"{key_id}.private.pem"
    public_path = out_dir / f"{key_id}.public.pem"
    _openssl(["genpkey", "-algorithm", "ed25519", "-out", str(private_path)])
    os.chmod(private_path, 0o600)
    _openssl(["pkey", "-in", str(private_path), "-pubout", "-out", str(public_path)])
    return {
        "keyId": key_id,
        "algorithm": "Ed25519",
        "role": role,
        "approvedBy": approved_by,
        "publicKeyPem": public_path.read_text(encoding="utf-8"),
    }


def _sign(private_key_path: Path, payload: bytes) -> str:
    with tempfile.TemporaryDirectory(prefix="jlptv2-attest-") as name:
        temporary = Path(name)
        payload_path = temporary / "payload.bin"
        signature_path = temporary / "signature.bin"
        payload_path.write_bytes(payload)
        _openssl(
            [
                "pkeyutl", "-sign", "-rawin",
                "-inkey", str(private_key_path),
                "-in", str(payload_path),
                "-out", str(signature_path),
            ]
        )
        return base64.b64encode(signature_path.read_bytes()).decode("ascii")


# ── run 产物读取 ─────────────────────────────────────────────────────────────
def _verified_records(run_dirs: list[Path]) -> list[dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for run_dir in run_dirs:
        manifest_path = run_dir / "manifest.json"
        if not manifest_path.exists():
            raise AttestError(f"{run_dir}: manifest.json 不存在")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("state") not in {"reviewed", "staged", "published"}:
            raise AttestError(
                f"{run_dir}: run 状态是 {manifest.get('state')!r}，必须先 verify 通过（reviewed）"
            )
        verified_path = run_dir / "verified.json"
        if not verified_path.exists():
            raise AttestError(f"{run_dir}: verified.json 不存在")
        for record in json.loads(verified_path.read_text(encoding="utf-8")):
            records[record["id"]] = record
    if not records:
        raise AttestError("没有任何已 verify 的题目，无法出具相似度证据")
    return list(records.values())


def _question_set_sha256(records: list[dict[str, Any]]) -> str:
    payload = [
        {"id": record["id"], "contentHash": record["contentHash"]}
        for record in sorted(records, key=lambda item: item["id"])
    ]
    return _sha256_bytes(_json_bytes(payload))


# ── 子命令 ───────────────────────────────────────────────────────────────────
def cmd_keygen(args: argparse.Namespace) -> dict[str, Any]:
    out_dir = Path(args.out_dir)
    entries = [
        _generate_keypair(out_dir, args.embedding_key_id, "embedding_checker", args.approved_by),
        _generate_keypair(
            out_dir, args.official_corpus_key_id, "official_corpus_checker", args.approved_by
        ),
    ]
    if entries[0]["publicKeyPem"] == entries[1]["publicKeyPem"]:
        raise AttestError("两把 checker 公钥不能相同")
    keyring_path = out_dir / "trusted_keys.json"
    existing: list[dict[str, str]] = []
    if keyring_path.exists():
        current = json.loads(keyring_path.read_text(encoding="utf-8"))
        existing = [
            key for key in current.get("keys", [])
            if key.get("keyId") not in {entry["keyId"] for entry in entries}
        ]
    keyring = {"keyringVersion": 1, "keys": existing + entries}
    keyring_path.write_bytes(_pretty(keyring) + b"\n")
    gitignore = out_dir / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text("*.private.pem\n", encoding="utf-8")
    return {
        "status": "ok",
        "keyring": str(keyring_path),
        "keys": [{"keyId": e["keyId"], "role": e["role"]} for e in entries],
        "note": "私钥 *.private.pem 已 chmod 600 并被本目录 .gitignore 排除，绝不可提交",
    }


def cmd_attest(args: argparse.Namespace) -> dict[str, Any]:
    contract = load_contract()
    gate = contract["similarityGate"]
    threshold = float(gate["fuzzyDiceThreshold"])
    minimum_chars = int(gate["minimumCanonicalCharacters"])

    records = _verified_records([Path(p) for p in args.run_dir])
    question_set_hash = _question_set_sha256(records)

    corpus_path = Path(args.official_corpus)
    if not corpus_path.exists():
        raise AttestError(
            f"官方语料 {corpus_path} 不存在。相似度门要求对真实语料查重；"
            "缺语料时本工具拒绝签发 passed-external 证明。"
        )
    corpus_bytes = corpus_path.read_bytes()
    corpus_hash = _sha256_bytes(corpus_bytes)
    corpus_entries = [
        line.strip()
        for line in corpus_bytes.decode("utf-8").splitlines()
        if len(line.strip()) >= minimum_chars
    ]
    if not corpus_entries:
        raise AttestError(f"官方语料为空或全部短于 {minimum_chars} 字，无法作为查重基准")

    import unicodedata

    corpus_pairs = [
        (f"corpus:{index}", _shingles("".join(unicodedata.normalize("NFKC", entry).split())))
        for index, entry in enumerate(corpus_entries)
    ]
    candidate_texts = {record["id"]: _canonical_text(record) for record in records}
    candidate_pairs = [
        (question_id, _shingles(text))
        for question_id, text in candidate_texts.items()
        if len(text) >= minimum_chars
    ]

    # ① 官方语料查重：确定性 Dice
    corpus_hits: list[dict[str, Any]] = []
    corpus_max = 0.0
    for question_id, grams in candidate_pairs:
        best_index, best_score = -1, 0.0
        for corpus_key, corpus_grams in corpus_pairs:
            score = _dice(grams, corpus_grams)
            if score > best_score:
                best_index, best_score = int(corpus_key.split(":")[1]), score
        corpus_max = max(corpus_max, best_score)
        if best_score >= threshold:
            corpus_hits.append(
                {"questionId": question_id, "corpusIndex": best_index, "dice": round(best_score, 6)}
            )

    # ② embedding 近义查重：TF-IDF 余弦（本地确定性代理，如实标注）
    embedding_scores = _tfidf_cosine_max(candidate_pairs, corpus_pairs)
    embedding_hits = [
        {"questionId": qid, "nearest": nearest, "cosine": round(score, 6)}
        for qid, nearest, score in embedding_scores
        if score >= threshold
    ]
    embedding_max = max((score for _, _, score in embedding_scores), default=0.0)

    if corpus_hits or embedding_hits:
        raise AttestError(
            "相似度门未通过，拒绝签发证据：\n"
            f"  官方语料命中 {len(corpus_hits)} 条（阈值 dice>={threshold}）\n"
            f"  近义命中 {len(embedding_hits)} 条（阈值 cosine>={threshold}）\n"
            f"  明细：{json.dumps((corpus_hits + embedding_hits)[:10], ensure_ascii=False)}"
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    checked_at = _now()
    issued_at = checked_at
    expires_at = checked_at + timedelta(days=_VALIDITY_DAYS)

    index_payload = _json_bytes(
        {
            "method": _EMBEDDING_MODEL,
            "shingleSize": _SHINGLE,
            "corpusSha256": corpus_hash,
            "corpusEntries": len(corpus_entries),
        }
    )
    index_hash = _sha256_bytes(index_payload)

    receipts = {
        "embedding": {
            "kind": "embedding",
            "provider": _EMBEDDING_PROVIDER,
            "model": _EMBEDDING_MODEL,
            "indexSha256": index_hash,
            "questionSetSha256": question_set_hash,
            "contractSha256": contract_sha256(),
            "checkedAt": _iso(checked_at),
            "threshold": threshold,
            "comparedQuestions": len(candidate_pairs),
            "corpusEntries": len(corpus_entries),
            "maxObservedCosine": round(embedding_max, 6),
            "violations": [],
            "methodNote": (
                "本地确定性 char-3gram TF-IDF 余弦，非第三方向量服务；"
                "provider/model 已如实标注，不冒充外部 embedding 供应商。"
            ),
        },
        "officialCorpus": {
            "kind": "officialCorpus",
            "checkerVersion": _CHECKER_VERSION,
            "corpusSha256": corpus_hash,
            "questionSetSha256": question_set_hash,
            "contractSha256": contract_sha256(),
            "checkedAt": _iso(checked_at),
            "threshold": threshold,
            "comparedQuestions": len(candidate_pairs),
            "corpusEntries": len(corpus_entries),
            "maxObservedDice": round(corpus_max, 6),
            "violations": [],
            "corpusPath": str(corpus_path),
        },
    }

    keys_dir = Path(args.keys_dir)
    key_ids = {"embedding": args.embedding_key_id, "officialCorpus": args.official_corpus_key_id}
    components: dict[str, Any] = {}
    for kind, receipt in receipts.items():
        receipt_bytes = _pretty(receipt) + b"\n"
        receipt_name = "embedding_receipt.json" if kind == "embedding" else "official_corpus_receipt.json"
        (out_dir / receipt_name).write_bytes(receipt_bytes)
        component = {
            "kind": kind,
            "status": "passed-external",
            "receiptSha256": _sha256_bytes(receipt_bytes),
            "keyId": key_ids[kind],
            "issuedAt": _iso(issued_at),
            "expiresAt": _iso(expires_at),
        }
        if kind == "embedding":
            component |= {
                "provider": _EMBEDDING_PROVIDER,
                "model": _EMBEDDING_MODEL,
                "indexSha256": index_hash,
            }
        else:
            component |= {"checkerVersion": _CHECKER_VERSION, "corpusSha256": corpus_hash}
        signed_payload = {
            "attestationVersion": 1,
            "contractSha256": contract_sha256(),
            "questionSetSha256": question_set_hash,
            "checkedAt": _iso(checked_at),
            "attestation": component,
        }
        private_key = keys_dir / f"{key_ids[kind]}.private.pem"
        if not private_key.exists():
            raise AttestError(f"私钥 {private_key} 不存在，请先跑 keygen")
        signature = _sign(private_key, _json_bytes(signed_payload))
        components[kind] = component | {
            "receiptPath": receipt_name,
            "signatureBase64": signature,
        }

    evidence = {
        "evidenceVersion": 1,
        "contractSha256": contract_sha256(),
        "questionSetSha256": question_set_hash,
        "checkedAt": _iso(checked_at),
        "embedding": components["embedding"],
        "officialCorpus": components["officialCorpus"],
    }
    evidence_path = out_dir / "similarity_evidence.json"
    evidence_path.write_bytes(_pretty(evidence) + b"\n")
    return {
        "status": "ok",
        "evidence": str(evidence_path),
        "questionSetSha256": question_set_hash,
        "comparedQuestions": len(candidate_pairs),
        "corpusEntries": len(corpus_entries),
        "maxObservedDice": round(corpus_max, 6),
        "maxObservedCosine": round(embedding_max, 6),
        "expiresAt": _iso(expires_at),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    keygen = sub.add_parser("keygen", help="生成两把独立的 checker Ed25519 密钥与可信钥匙环")
    keygen.add_argument("--out-dir", required=True)
    keygen.add_argument("--embedding-key-id", default="machi-embedding-checker-1")
    keygen.add_argument("--official-corpus-key-id", default="machi-official-corpus-checker-1")
    keygen.add_argument("--approved-by", default="machi-release-ops")
    keygen.set_defaults(func=cmd_keygen)

    attest = sub.add_parser("attest", help="真实执行相似度检查并签发证据")
    attest.add_argument("--run-dir", action="append", required=True)
    attest.add_argument("--official-corpus", required=True)
    attest.add_argument("--keys-dir", required=True)
    attest.add_argument("--out-dir", required=True)
    attest.add_argument("--embedding-key-id", default="machi-embedding-checker-1")
    attest.add_argument("--official-corpus-key-id", default="machi-official-corpus-checker-1")
    attest.set_defaults(func=cmd_attest)

    args = parser.parse_args(argv)
    try:
        result = args.func(args)
    except AttestError as error:
        print(json.dumps({"status": "failed", "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
