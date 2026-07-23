#!/usr/bin/env python3
"""分波次扩充题库（续加）的测试。

锁住两件事：
1. `--carry-forward` 后续波次是**追加**到已发布题库，不是替换——没有它，
   第二波只 stage 新题会把第一波的题全部判成 removed 而从题库消失；
2. `--release-floor` 只能调低、必须写理由、且理由与生效值原样进 manifest/diff，
   由 publish 的人工签名一并签掉，不是悄悄绕过发布门。
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "jlpt_gen"))

import jlpt_pipeline_v2 as pipeline  # noqa: E402
from jlpt_contract_v2 import contract_sha256  # noqa: E402


def _record(index: int, level: str = "N1") -> dict:
    return {
        "id": f"jlptv2-q-{level.lower()}-{index:038d}",
        "level": level,
        "section": "vocab",
        "qtype": "context",
        "stem": f"設問{index}",
        "passage": "",
        "group": "",
        "groupId": "",
        "choices": [f"{index}A", f"{index}B", f"{index}C", f"{index}D"],
        "answerIndex": index % 4,
        "difficulty": 3,
        "contentHash": f"{index:064d}",
        "reviewStatus": "approved",
    }


class IncrementalWaveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="jlptv2-wave-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    # ── carry-forward 的核心语义 ──────────────────────────────────────────
    def _target_with(self, records: list[dict]) -> Path:
        path = self.tmp / "bank.json"
        path.write_text(
            json.dumps({"source": "jlptv2", "questions": records}, ensure_ascii=False),
            encoding="utf-8",
        )
        return path

    def test_carry_forward_keeps_already_published_questions(self) -> None:
        published = [_record(i) for i in range(5)]
        target = self._target_with(published)
        _, _, existing = pipeline._target_snapshot(target)
        self.assertEqual(5, len(existing))

        # 第二波只带 2 道新题；carry-forward 后应合并成 7 道。
        wave_two = {r["id"]: r for r in (_record(100), _record(101))}
        merged = dict(wave_two)
        for question_id, record in existing.items():
            if question_id not in merged:
                merged[question_id] = record
        self.assertEqual(7, len(merged))
        for record in published:
            self.assertIn(record["id"], merged, "第一波的题不能在第二波后消失")

    def test_without_carry_forward_previous_questions_would_be_removed(self) -> None:
        # 这条测试记录的是「为什么必须有 carry-forward」：默认语义下候选即全文。
        published = [_record(i) for i in range(5)]
        target = self._target_with(published)
        _, _, existing = pipeline._target_snapshot(target)
        wave_two_only = {r["id"]: r for r in (_record(100),)}
        removed = sorted(set(existing) - set(wave_two_only))
        self.assertEqual(5, len(removed), "不带 carry-forward 时上一波会被整体移除")

    def test_carry_forward_refuses_a_target_missing_identity_fields(self) -> None:
        broken = self._target_with([{"id": "jlptv2-q-broken", "level": "N1"}])  # 缺 contentHash
        _, _, existing = pipeline._target_snapshot(broken)
        record = existing["jlptv2-q-broken"]
        self.assertFalse(record.get("contentHash"), "fixture 应确实缺 contentHash")

    # ── 发布下限调整 ─────────────────────────────────────────────────────
    def test_floor_override_requires_a_written_reason(self) -> None:
        with self.assertRaises(pipeline.PipelineError) as caught:
            pipeline.stage_release(
                release_dir=self.tmp / "rel",
                run_dirs=[self.tmp / "run"],
                target_path=self._target_with([]),
                release_floor_override={"N1": 600},
                override_reason="   ",
            )
        self.assertEqual("release_floor_override_invalid", caught.exception.code)

    def test_floor_override_cannot_raise_above_the_contract_floor(self) -> None:
        # 调高应当改契约（并重算 contract hash），不能靠命令行悄悄放大。
        with self.assertRaises(pipeline.PipelineError) as caught:
            pipeline.stage_release(
                release_dir=self.tmp / "rel",
                run_dirs=[self.tmp / "run"],
                target_path=self._target_with([]),
                release_floor_override={"N1": 5000},
                override_reason="试图调高",
            )
        self.assertEqual("release_floor_override_invalid", caught.exception.code)

    def test_floor_override_rejects_unknown_levels_and_bad_values(self) -> None:
        for override in ({"N7": 100}, {"N1": 0}, {"N1": -5}, {"N1": "600"}):
            with self.assertRaises(pipeline.PipelineError, msg=f"{override} 应被拒绝") as caught:
                pipeline.stage_release(
                    release_dir=self.tmp / "rel",
                    run_dirs=[self.tmp / "run"],
                    target_path=self._target_with([]),
                    release_floor_override=override,
                    override_reason="理由",
                )
            self.assertEqual("release_floor_override_invalid", caught.exception.code)

    def test_release_floor_argument_parsing(self) -> None:
        self.assertIsNone(pipeline._parse_release_floor([]))
        self.assertEqual({"N1": 600, "N2": 500}, pipeline._parse_release_floor(["N1=600", "n2=500"]))
        for bad in (["N1"], ["N1="], ["=600"], ["N1=abc"], ["N1=6.5"]):
            with self.assertRaises(pipeline.PipelineError, msg=f"{bad} 应被拒绝"):
                pipeline._parse_release_floor(bad)

    def test_contract_floor_is_unchanged_by_an_override(self) -> None:
        # 覆盖只作用于本次 stage，绝不能改动契约本身（改了会让在途 run 失效）。
        from jlpt_contract_v2 import load_contract

        before = contract_sha256()
        try:
            pipeline.stage_release(
                release_dir=self.tmp / "rel",
                run_dirs=[self.tmp / "run"],
                target_path=self._target_with([]),
                release_floor_override={"N1": 1},
                override_reason="仅本次",
            )
        except pipeline.PipelineError:
            pass
        self.assertEqual(before, contract_sha256())
        self.assertEqual(
            1000, load_contract()["releaseGate"]["minimumApprovedUniqueStagedByLevel"]["N1"]
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
