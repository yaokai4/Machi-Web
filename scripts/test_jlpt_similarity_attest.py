#!/usr/bin/env python3
"""jlpt_similarity_attest 的闭环测试：签发的证据必须被 jlpt_pipeline_v2 的
相似度门原样接受，且任何篡改都必须失败。

这条测试锁住的是「stage 能不能真的跑起来」这个此前完全缺失的环节：管线只验签名
与哈希、不重算相似度，所以签发端与校验端的规范化必须逐字节一致。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "jlpt_gen"))

import jlpt_pipeline_v2 as pipeline  # noqa: E402
from jlpt_contract_v2 import contract_sha256  # noqa: E402

_ATTEST = _HERE / "jlpt_gen" / "jlpt_similarity_attest.py"


def _explanation(tag: str) -> dict:
    return {
        "correctAnswerMeaningUsage": f"{tag}：正解の語は日常的な文脈で用いられる基本語彙であり、意味と用法をここで詳しく説明する。",
        "knowledgePoint": f"{tag}：この設問が問う知識点は語彙の意味識別であり、同義語との差異を押さえる必要がある。",
        "whyCorrect": f"{tag}：文脈から判断して、この選択肢だけが述語との共起関係を満たすため正解となる。",
        "distractorReasons": [
            {"choice": "選択肢A", "reason": f"{tag}：意味は近いが共起する名詞が異なり、この文脈では不自然になる。"},
            {"choice": "選択肢B", "reason": f"{tag}：品詞が異なるため空欄に入れると文法的に破綻してしまう。"},
            {"choice": "選択肢C", "reason": f"{tag}：語義が正反対であり、前文の論理関係と矛盾するため成立しない。"},
        ],
    }


def _question(index: int, qtype: str, section: str) -> dict:
    return {
        "level": "N1",
        "section": section,
        "qtype": qtype,
        "stem": f"独自作成問題{index}：次の文の（　　）に入れるのに最もよいものはどれか。彼の主張は{index}点で一貫していた。",
        "passage": "",
        "group": "",
        "choices": [f"選択肢{index}A", f"選択肢{index}B", f"選択肢{index}C", f"選択肢{index}D"],
        "answerIndex": index % 4,
        "explanation": _explanation(f"設問{index}"),
        "difficulty": 3,
    }


class SimilarityAttestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="jlptv2-attest-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.keys = self.tmp / "keys"
        self.out = self.tmp / "similarity"
        self.run_dir = self.tmp / "run"
        self.corpus = self.tmp / "corpus.txt"
        # 语料与候选题刻意毫不相干，确保不会误命中阈值。
        self.corpus.write_text(
            "\n".join(
                f"公的コーパス収録текст{index}：全く無関係な内容として天気予報や交通情報を扱う短文です。"
                for index in range(12)
            ),
            encoding="utf-8",
        )
        self._make_run()
        self._keygen()

    # ── fixtures ─────────────────────────────────────────────────────────
    def _make_run(self) -> None:
        self.run_dir.mkdir(parents=True)
        records = []
        for index in range(20):
            raw = _question(index, "context", "vocab")
            record = dict(raw)
            record["id"] = f"jlptv2-q-{index:040d}"
            record["groupId"] = ""
            record["contentHash"] = f"{index:064d}"
            record["reviewStatus"] = "approved"
            records.append(record)
        self.records = records
        (self.run_dir / "verified.json").write_text(
            json.dumps(records, ensure_ascii=False), encoding="utf-8"
        )
        (self.run_dir / "manifest.json").write_text(
            json.dumps({"state": "reviewed", "runId": "jlptv2-n1-lex-w0001-test"}, ensure_ascii=False),
            encoding="utf-8",
        )

    def _keygen(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(_ATTEST), "keygen", "--out-dir", str(self.keys)],
            capture_output=True, text=True,
        )
        self.assertEqual(0, completed.returncode, completed.stderr)

    def _attest(self, corpus: Path | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                sys.executable, str(_ATTEST), "attest",
                "--run-dir", str(self.run_dir),
                "--official-corpus", str(corpus or self.corpus),
                "--keys-dir", str(self.keys),
                "--out-dir", str(self.out),
            ],
            capture_output=True, text=True,
        )

    def _validate(self, *, allow_expired: bool = False):
        return pipeline._validated_external_similarity_evidence(
            self.out / "similarity_evidence.json",
            records=self.records,
            trusted_keys_path=self.keys / "trusted_keys.json",
            allow_expired=allow_expired,
        )

    # ── 正向 ─────────────────────────────────────────────────────────────
    def test_generated_evidence_is_accepted_by_the_pipeline_gate(self) -> None:
        completed = self._attest()
        self.assertEqual(0, completed.returncode, completed.stderr)
        evidence, source_hash, receipts, keyring_hash, fingerprints = self._validate()
        self.assertEqual(contract_sha256(), evidence["contractSha256"])
        self.assertEqual({"embedding", "officialCorpus"}, set(receipts))
        self.assertEqual(2, len(set(fingerprints.values())), "两把 checker 公钥必须不同")
        self.assertTrue(source_hash and keyring_hash)

    def test_receipts_record_what_was_actually_compared(self) -> None:
        self.assertEqual(0, self._attest().returncode)
        receipt = json.loads((self.out / "official_corpus_receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(20, receipt["comparedQuestions"])
        self.assertEqual(12, receipt["corpusEntries"])
        self.assertEqual([], receipt["violations"])
        embedding = json.loads((self.out / "embedding_receipt.json").read_text(encoding="utf-8"))
        self.assertEqual("local-deterministic", embedding["provider"])
        self.assertIn("冒充", embedding["methodNote"])

    # ── fail-closed ──────────────────────────────────────────────────────
    def test_missing_official_corpus_refuses_to_sign(self) -> None:
        completed = self._attest(corpus=self.tmp / "nope.txt")
        self.assertEqual(2, completed.returncode)
        self.assertIn("拒绝签发", completed.stderr)
        self.assertFalse((self.out / "similarity_evidence.json").exists())

    def test_corpus_overlap_refuses_to_sign(self) -> None:
        # 把一道候选题原文塞进语料，必然越过阈值。
        leaked = self.tmp / "leaked.txt"
        leaked.write_text(
            self.corpus.read_text(encoding="utf-8") + "\n" + self.records[0]["stem"],
            encoding="utf-8",
        )
        completed = self._attest(corpus=leaked)
        self.assertEqual(2, completed.returncode)
        self.assertIn("相似度门未通过", completed.stderr)

    def test_tampered_receipt_is_rejected(self) -> None:
        self.assertEqual(0, self._attest().returncode)
        receipt_path = self.out / "official_corpus_receipt.json"
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt["comparedQuestions"] = 99999
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with self.assertRaises(pipeline.PipelineError) as caught:
            self._validate()
        self.assertEqual("external_similarity_gate_invalid", caught.exception.code)

    def test_tampered_signature_is_rejected(self) -> None:
        self.assertEqual(0, self._attest().returncode)
        evidence_path = self.out / "similarity_evidence.json"
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        evidence["embedding"]["model"] = "openai/text-embedding-3-large"
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with self.assertRaises(pipeline.PipelineError):
            self._validate()

    def test_evidence_for_a_different_question_set_is_rejected(self) -> None:
        self.assertEqual(0, self._attest().returncode)
        other = [dict(record) for record in self.records]
        other[0]["contentHash"] = "f" * 64
        with self.assertRaises(pipeline.PipelineError) as caught:
            pipeline._validated_external_similarity_evidence(
                self.out / "similarity_evidence.json",
                records=other,
                trusted_keys_path=self.keys / "trusted_keys.json",
            )
        self.assertEqual("external_similarity_gate_invalid", caught.exception.code)

    def test_unverified_run_is_refused(self) -> None:
        (self.run_dir / "manifest.json").write_text(
            json.dumps({"state": "sanitized", "runId": "x"}), encoding="utf-8"
        )
        completed = self._attest()
        self.assertEqual(2, completed.returncode)
        self.assertIn("必须先 verify", completed.stderr)

    def test_untrusted_keyring_is_rejected(self) -> None:
        self.assertEqual(0, self._attest().returncode)
        other_keys = self.tmp / "other-keys"
        subprocess.run(
            [sys.executable, str(_ATTEST), "keygen", "--out-dir", str(other_keys)],
            capture_output=True, check=True,
        )
        with self.assertRaises(pipeline.PipelineError):
            pipeline._validated_external_similarity_evidence(
                self.out / "similarity_evidence.json",
                records=self.records,
                trusted_keys_path=other_keys / "trusted_keys.json",
            )

    def test_private_keys_are_not_world_readable(self) -> None:
        for name in ("machi-embedding-checker-1", "machi-official-corpus-checker-1"):
            mode = os.stat(self.keys / f"{name}.private.pem").st_mode & 0o777
            self.assertEqual(0o600, mode, f"{name} 私钥权限必须是 600")
        self.assertIn("*.private.pem", (self.keys / ".gitignore").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
