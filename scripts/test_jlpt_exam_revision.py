#!/usr/bin/env python3
"""Regression tests for authoritative JLPT answer revisions and submit snapshots.

The contract is intentionally optimistic-concurrency based:

* every accepted write advances one session-wide ``answer_revision``;
* retries of the exact same write are idempotent;
* stale writes/snapshots fail without partially changing answers or status;
* submit may carry the complete client snapshot and grades that exact snapshot.

Run: ``python3 scripts/test_jlpt_exam_revision.py`` from ``web/``.
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path


_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_revision_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402
from server_errors import APIError  # noqa: E402


class JLPTExamRevisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()

    def setUp(self) -> None:
        self.conn = server.db()
        now = server.now_iso()
        self.user_id = str(uuid.uuid4())
        handle = "rev" + uuid.uuid4().hex[:8]
        self.conn.execute(
            "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'x', ?, ?, ?)",
            (self.user_id, handle, handle, f"{handle}@example.com", now, now, now),
        )
        self.question_ids = [
            dict(row)["id"]
            for row in self.conn.execute(
                "SELECT id FROM jlpt_questions WHERE level='N5' AND status='published' "
                "AND review_status='approved' ORDER BY id LIMIT 3"
            ).fetchall()
        ]
        self.assertEqual(3, len(self.question_ids))
        self.exam_id = "revision-" + uuid.uuid4().hex[:12]
        jlpt.upsert_exam(
            self.conn,
            {
                "id": self.exam_id,
                "level": "N5",
                "title": "Revision contract",
                "kind": "mock",
                "durationSeconds": 30 * 60,
                "status": "published",
                "questionIds": self.question_ids,
            },
            now=now,
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        started = jlpt.start_exam_session(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            now=now,
        )
        self.assertIsNotNone(started)
        self.session_id = started["sessionId"]
        self.conn.commit()

    def tearDown(self) -> None:
        self.conn.close()

    def _session(self) -> dict:
        session = jlpt.get_session(
            self.conn, session_id=self.session_id, user_id=self.user_id
        )
        self.assertIsNotNone(session)
        return session

    def _answer(self, question_id: str, selected_index: int, base: int, revision: int):
        return jlpt.save_exam_answer(
            self.conn,
            session=self._session(),
            question_id=question_id,
            selected_index=selected_index,
            base_revision=base,
            revision=revision,
        )

    def _set_attempt_duration(self, seconds: int) -> None:
        contract = json.loads(self._session()["exam_contract_snapshot_json"])
        contract["durationSeconds"] = seconds
        self.conn.execute(
            "UPDATE jlpt_exam_sessions SET exam_contract_snapshot_json=? WHERE id=?",
            (json.dumps(contract, separators=(",", ":")), self.session_id),
        )

    def _set_attempt_scoring(self, *, pass_score: int, score_mode: str) -> None:
        contract = json.loads(self._session()["exam_contract_snapshot_json"])
        contract["passScore"] = pass_score
        contract["scoreMode"] = score_mode
        self.conn.execute(
            "UPDATE jlpt_exam_sessions SET exam_contract_snapshot_json=? WHERE id=?",
            (json.dumps(contract, separators=(",", ":")), self.session_id),
        )

    def test_explicit_revision_is_monotonic_and_exact_retry_is_idempotent(self) -> None:
        first = self._answer(self.question_ids[0], 0, 0, 1)
        self.assertEqual(1, first["answerRevision"])

        # Same request after a lost response is safe and does not advance again.
        retry = self._answer(self.question_ids[0], 0, 0, 1)
        self.assertEqual(1, retry["answerRevision"])
        self.assertTrue(retry["idempotentReplay"])

        # Same revision with different content and an older base are conflicts.
        with self.assertRaises(APIError) as changed_retry:
            self._answer(self.question_ids[0], 1, 0, 1)
        self.assertEqual("answer_revision_conflict", changed_retry.exception.code)
        with self.assertRaises(APIError):
            self._answer(self.question_ids[1], 1, 0, 1)

        second = self._answer(self.question_ids[1], 2, 1, 2)
        self.assertEqual(2, second["answerRevision"])
        row = dict(
            self.conn.execute(
                "SELECT answer_revision FROM jlpt_exam_sessions WHERE id=?",
                (self.session_id,),
            ).fetchone()
        )
        self.assertEqual(2, row["answer_revision"])

        resumed = jlpt.start_exam_session(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            now=server.now_iso(),
        )
        self.assertTrue(resumed["resumed"])
        self.assertEqual(2, resumed["answerRevision"])
        by_id = {a["questionId"]: a for a in resumed["answers"]}
        self.assertEqual(1, by_id[self.question_ids[0]]["revision"])
        self.assertEqual(2, by_id[self.question_ids[1]]["revision"])

    def test_legacy_answer_stays_compatible_and_advances_server_revision(self) -> None:
        result = jlpt.save_exam_answer(
            self.conn,
            session=self._session(),
            question_id=self.question_ids[0],
            selected_index=1,
        )
        self.assertEqual(1, result["answerRevision"])
        self.assertTrue(result["legacyRevisionAssigned"])

    def test_strict_listening_policy_is_snapshotted_and_hides_transcript_until_submit(self) -> None:
        """A timed mock must not leak its listening script before grading.

        The policy is part of the paid attempt contract, so a later catalog edit
        cannot turn a strict in-progress session into an unrestricted practice.
        """
        listening_id = self.question_ids[0]
        original_question = dict(
            self.conn.execute(
                "SELECT section, passage FROM jlpt_questions WHERE id=?",
                (listening_id,),
            ).fetchone()
        )
        self.conn.execute(
            "UPDATE jlpt_questions SET section='listening', passage=? WHERE id=?",
            ("SECRET LISTENING TRANSCRIPT", listening_id),
        )

        resumed = jlpt.start_exam_session(
            self.conn,
            user_id=self.user_id,
            exam=self.exam,
            is_member=False,
            now=server.now_iso(),
        )
        self.assertTrue(resumed["resumed"])
        self.assertEqual(
            {
                "mode": "strict",
                "allowPause": True,
                "allowSeek": False,
                "allowReplay": False,
                "maxPlays": 1,
                "showTranscriptDuringAttempt": False,
            },
            resumed["listeningPolicy"],
        )
        by_id = {question["id"]: question for question in resumed["questions"]}
        self.assertEqual("", by_id[listening_id]["passage"])

        # The live catalog is mutable; the active attempt contract is not.
        self.conn.execute(
            "UPDATE jlpt_exams SET duration_seconds=0, kind='practice' WHERE id=?",
            (self.exam_id,),
        )
        mutated_exam = jlpt.get_exam(self.conn, self.exam_id)
        replayed_resume = jlpt.start_exam_session(
            self.conn,
            user_id=self.user_id,
            exam=mutated_exam,
            is_member=False,
            now=server.now_iso(),
        )
        self.assertEqual("strict", replayed_resume["listeningPolicy"]["mode"])
        replayed_by_id = {
            question["id"]: question for question in replayed_resume["questions"]
        }
        self.assertEqual("", replayed_by_id[listening_id]["passage"])

        result = jlpt.submit_exam_session(
            self.conn,
            session=self._session(),
            exam=mutated_exam,
            now=server.now_iso(),
            answer_snapshot=[],
            base_revision=0,
            revision=1,
        )
        submitted_by_id = {question["id"]: question for question in result["questions"]}
        self.assertEqual(
            "SECRET LISTENING TRANSCRIPT",
            submitted_by_id[listening_id]["passage"],
        )
        self.conn.execute(
            "UPDATE jlpt_questions SET section=?, passage=? WHERE id=?",
            (
                original_question["section"],
                original_question["passage"],
                listening_id,
            ),
        )

    def test_submit_snapshot_replaces_answers_and_grades_snapshot_atomically(self) -> None:
        self._answer(self.question_ids[0], 0, 0, 1)
        expected = {
            self.question_ids[0]: 1,
            self.question_ids[1]: 2,
        }
        self.conn.execute("BEGIN IMMEDIATE")
        result = jlpt.submit_exam_session(
            self.conn,
            session=self._session(),
            exam=self.exam,
            now=server.now_iso(),
            answer_snapshot=[
                {"questionId": qid, "selectedIndex": selected}
                for qid, selected in expected.items()
            ],
            base_revision=1,
            revision=2,
        )
        self.conn.commit()

        self.assertEqual(2, result["answerRevision"])
        rows = self.conn.execute(
            "SELECT question_id, selected_index, revision FROM jlpt_exam_answers "
            "WHERE session_id=? ORDER BY question_id",
            (self.session_id,),
        ).fetchall()
        self.assertEqual(expected, {dict(r)["question_id"]: dict(r)["selected_index"] for r in rows})
        self.assertTrue(all(dict(r)["revision"] == 2 for r in rows))
        self.assertEqual("submitted", self._session()["status"])
        # Breakdown is generated from the same snapshot that was persisted.
        self.assertEqual(
            expected,
            {q["id"]: q["selectedIndex"] for q in result["questions"] if q["selectedIndex"] >= 0},
        )

    def test_snapshot_after_deadline_is_ignored_and_saved_answers_are_settled(self) -> None:
        """A late full snapshot must not reopen a timed paper after 00:00."""
        self._answer(self.question_ids[0], 0, 0, 1)
        self.conn.execute(
            "UPDATE jlpt_exams SET duration_seconds=1 WHERE id=?", (self.exam_id,)
        )
        self._set_attempt_duration(1)
        self.conn.execute(
            "UPDATE jlpt_exam_sessions SET started_at=? WHERE id=?",
            ("2026-01-01T00:00:00+00:00", self.session_id),
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)

        self.conn.execute("BEGIN IMMEDIATE")
        result = jlpt.submit_exam_session(
            self.conn,
            session=self._session(),
            exam=self.exam,
            now="2026-01-01T00:00:10+00:00",
            answer_snapshot=[
                {"questionId": self.question_ids[1], "selectedIndex": 2}
            ],
            base_revision=1,
            revision=2,
        )
        self.conn.commit()

        self.assertTrue(result["deadlineExpired"])
        self.assertFalse(result["snapshotAccepted"])
        self.assertEqual(1, result["answerRevision"])
        saved = {
            dict(row)["question_id"]: dict(row)["selected_index"]
            for row in self.conn.execute(
                "SELECT question_id, selected_index FROM jlpt_exam_answers "
                "WHERE session_id=?",
                (self.session_id,),
            ).fetchall()
        }
        self.assertEqual({self.question_ids[0]: 0}, saved)
        self.assertEqual("submitted", self._session()["status"])

    def test_answer_at_or_after_exact_deadline_has_zero_grace_and_cannot_score(self) -> None:
        self.conn.execute(
            "UPDATE jlpt_exams SET duration_seconds=10 WHERE id=?", (self.exam_id,)
        )
        self._set_attempt_duration(10)
        self.conn.execute(
            "UPDATE jlpt_exam_sessions SET started_at=? WHERE id=?",
            ("2026-01-01T00:00:00+00:00", self.session_id),
        )
        self.exam = jlpt.get_exam(self.conn, self.exam_id)

        for now in ("2026-01-01T00:00:10+00:00", "2026-01-01T00:00:11+00:00"):
            with self.subTest(now=now):
                rejected = jlpt.save_exam_answer(
                    self.conn,
                    session=self._session(),
                    question_id=self.question_ids[0],
                    selected_index=int(
                        jlpt.get_question(self.conn, self.question_ids[0])["answer_index"]
                    ),
                    now=now,
                    base_revision=0,
                    revision=1,
                )
                self.assertIsNone(rejected)

        result = jlpt.submit_exam_session(
            self.conn,
            session=self._session(),
            exam=self.exam,
            now="2026-01-01T00:00:11+00:00",
            answer_snapshot=[
                {
                    "questionId": self.question_ids[0],
                    "selectedIndex": int(
                        jlpt.get_question(self.conn, self.question_ids[0])["answer_index"]
                    ),
                }
            ],
            base_revision=0,
            revision=1,
        )
        self.assertTrue(result["deadlineExpired"])
        self.assertFalse(result["snapshotAccepted"])
        self.assertEqual(0, result["correct"])
        self.assertEqual(0, result["score"])
        self.assertEqual([], self.conn.execute(
            "SELECT * FROM jlpt_exam_answers WHERE session_id=?", (self.session_id,)
        ).fetchall())

    def test_submit_persists_complete_immutable_result_for_lost_response_replay(self) -> None:
        self.conn.execute(
            "UPDATE jlpt_exams SET pass_score=55, score_mode='jlpt_scaled' WHERE id=?",
            (self.exam_id,),
        )
        self._set_attempt_scoring(pass_score=55, score_mode="jlpt_scaled")
        self.exam = jlpt.get_exam(self.conn, self.exam_id)
        correct_index = int(
            jlpt.get_question(self.conn, self.question_ids[0])["answer_index"]
        )
        first = jlpt.submit_exam_session(
            self.conn,
            session=self._session(),
            exam=self.exam,
            now="2026-01-01T00:00:05+00:00",
            answer_snapshot=[
                {"questionId": self.question_ids[0], "selectedIndex": correct_index}
            ],
            base_revision=0,
            revision=1,
        )
        self.conn.commit()
        self.assertFalse(first["idempotentReplay"])
        stored = dict(
            self.conn.execute(
                "SELECT result_snapshot_json FROM jlpt_exam_sessions WHERE id=?",
                (self.session_id,),
            ).fetchone()
        )["result_snapshot_json"]
        self.assertTrue(stored)
        persisted = json.loads(stored)
        for key in ("passScore", "scoreMode", "questions", "scaled"):
            self.assertIn(key, persisted)

        # Catalog/admin edits after commit must never rewrite a completed result.
        self.conn.execute(
            "UPDATE jlpt_exams SET pass_score=99, score_mode='percent', title='mutated' WHERE id=?",
            (self.exam_id,),
        )
        self.conn.execute(
            "UPDATE jlpt_questions SET stem='MUTATED AFTER SUBMIT', passage='changed', "
            "choices_json='[\"x\",\"y\",\"z\",\"w\"]', answer_index=3, "
            "explanation='changed' WHERE id=?",
            (self.question_ids[0],),
        )
        self.conn.execute(
            "DELETE FROM jlpt_exam_questions WHERE exam_id=?", (self.exam_id,)
        )
        self.conn.commit()

        replay = jlpt.replay_submitted_exam_result(
            self.conn,
            session=self._session(),
            exam=jlpt.get_exam(self.conn, self.exam_id),
        )
        self.assertTrue(replay["idempotentReplay"])
        first_without_replay = {k: v for k, v in first.items() if k != "idempotentReplay"}
        replay_without_replay = {k: v for k, v in replay.items() if k != "idempotentReplay"}
        self.assertEqual(first_without_replay, replay_without_replay)
        self.assertNotEqual("MUTATED AFTER SUBMIT", replay["questions"][0]["stem"])
        review = jlpt.session_review(self.conn, session=self._session())
        self.assertEqual(self.session_id, review["sessionId"])
        self.assertEqual(self.exam_id, review["examId"])
        self.assertEqual("N5", review["level"])
        self.assertEqual("submitted", review["status"])
        self.assertEqual(first["questions"], review["questions"])

    def test_stale_or_invalid_snapshot_rolls_back_without_partial_submit(self) -> None:
        self._answer(self.question_ids[0], 0, 0, 1)
        before = [
            dict(r)
            for r in self.conn.execute(
                "SELECT question_id, selected_index, revision FROM jlpt_exam_answers "
                "WHERE session_id=? ORDER BY question_id",
                (self.session_id,),
            ).fetchall()
        ]

        for snapshot in (
            [{"questionId": self.question_ids[1], "selectedIndex": 2}],
            [
                {"questionId": self.question_ids[1], "selectedIndex": 2},
                {"questionId": self.question_ids[1], "selectedIndex": 3},
            ],
            [{"questionId": "not-in-session", "selectedIndex": 0}],
            [{"questionId": self.question_ids[1], "selectedIndex": 99}],
        ):
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                if len(snapshot) == 1 and snapshot[0]["questionId"] == self.question_ids[1]:
                    # Explicitly stale base/revision for the first fixture.
                    base, revision = 0, 1
                else:
                    base, revision = 1, 2
                with self.assertRaises(APIError):
                    jlpt.submit_exam_session(
                        self.conn,
                        session=self._session(),
                        exam=self.exam,
                        now=server.now_iso(),
                        answer_snapshot=snapshot,
                        base_revision=base,
                        revision=revision,
                    )
            finally:
                self.conn.rollback()

            self.assertEqual("in_progress", self._session()["status"])
            after = [
                dict(r)
                for r in self.conn.execute(
                    "SELECT question_id, selected_index, revision FROM jlpt_exam_answers "
                    "WHERE session_id=? ORDER BY question_id",
                    (self.session_id,),
                ).fetchall()
            ]
            self.assertEqual(before, after)

        self.conn.execute("BEGIN IMMEDIATE")
        try:
            with self.assertRaises(APIError) as null_snapshot:
                jlpt.submit_exam_session(
                    self.conn,
                    session=self._session(),
                    exam=self.exam,
                    now=server.now_iso(),
                    answer_snapshot=None,
                    base_revision=1,
                    revision=2,
                )
            self.assertEqual("invalid_answer_snapshot", null_snapshot.exception.code)
        finally:
            self.conn.rollback()
        self.assertEqual("in_progress", self._session()["status"])

    def test_revision_pair_validation_rejects_bool_fraction_and_gaps(self) -> None:
        bad_pairs = [
            (True, 1),
            (0, True),
            (0.0, 1),
            (0, 1.5),
            (0, 2),
            (-1, 0),
        ]
        for base, revision in bad_pairs:
            with self.subTest(base=base, revision=revision):
                with self.assertRaises(APIError):
                    self._answer(self.question_ids[0], 0, base, revision)


if __name__ == "__main__":
    try:
        unittest.main(verbosity=2)
    finally:
        try:
            os.unlink(_TMP_DB)
        except FileNotFoundError:
            pass
