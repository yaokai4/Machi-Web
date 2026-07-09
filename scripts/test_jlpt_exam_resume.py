#!/usr/bin/env python3
"""Tests for JLPT 限时模考中断恢复 (B15-D): POST /api/guide/jlpt/exam/start resume.

Exercises the real Handler.api_guide_jlpt_exam_* methods against a throwaway
SQLite DB with a stubbed session (same harness style as test_jlpt_core.py).

Covers: start → answer → start again returns the SAME session (resumed=true,
saved answers echoed, server-computed remainingSeconds, identical question
list, no answer/grading leak); timed-out un-submitted session is settled via
the existing submit semantics (status→submitted, graded on saved answers,
duration clamped to the exam limit) and a fresh session is created; untimed
exams (duration 0) always resume; submit → next start is fresh; legacy
response keys stay intact for old clients.

Run:  cd web && python3 scripts/test_jlpt_exam_resume.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_resume_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402


# --- helpers ----------------------------------------------------------------
def _make_user(conn) -> str:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    return uid


def _make_admin(conn) -> str:
    uid = _make_user(conn)
    conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (uid,))
    return uid


def _handler(uid):
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.current_session = (lambda c: ({"user_id": uid} if uid else None))  # type: ignore[method-assign]
    h.headers = {}
    h.client_address = ("127.0.0.1", 0)
    return h, captured


def _post(uid, method_name, body):
    h, cap = _handler(uid)
    h.read_json = lambda: body  # type: ignore[method-assign]
    getattr(h, method_name)(_CONN)
    return cap


_CONN = None


def _upsert_exam(admin, exam_id, *, duration, question_ids):
    cap = _post(admin, "api_admin_jlpt_exam_upsert", {"exam": {
        "id": exam_id, "level": "N5", "title": f"续考测试卷 {exam_id}",
        "passScore": 50, "durationSeconds": duration, "questionIds": question_ids,
    }})
    assert cap["status"] == 200, cap
    _CONN.commit()


def _backdate_session(session_id: str, seconds: int) -> None:
    """Rewind started_at so the session looks `seconds` old to the server."""
    old = (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()
    _CONN.execute("UPDATE jlpt_exam_sessions SET started_at = ? WHERE id = ?", (old, session_id))
    _CONN.commit()


def main() -> None:
    global _CONN
    server.init_db()
    conn = server.db()
    _CONN = conn
    try:
        admin = _make_admin(conn)
        uid = _make_user(conn)
        conn.commit()

        n5_ids = [dict(r)["id"] for r in conn.execute(
            "SELECT id FROM jlpt_questions WHERE level='N5' AND status='published' "
            "AND is_member_only=0 AND review_status='approved' LIMIT 4"
        ).fetchall()]
        assert len(n5_ids) == 4, f"need 4 seed N5 questions, got {len(n5_ids)}"

        _upsert_exam(admin, "resume-exam-1", duration=600, question_ids=n5_ids)

        # 1) Fresh start → in-progress session, not resumed, no answer leak.
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-1"})
        assert cap["status"] == 200, cap
        first = cap["data"]
        sid = first["sessionId"]
        assert first.get("resumed") is False, first.get("resumed")
        assert "answers" not in first and "remainingSeconds" not in first, "fresh start must not carry resume overlay"
        qs = first["questions"]
        assert [q["id"] for q in qs] == n5_ids
        conn.commit()

        # 2) Answer two questions (one right, one wrong), then start again →
        #    SAME session comes back with the saved answers + remaining clock.
        tq0 = jlpt.get_question(conn, n5_ids[0])
        tq1 = jlpt.get_question(conn, n5_ids[1])
        wrong1 = (tq1["answer_index"] + 1) % len(json.loads(tq1["choices_json"]))
        cap = _post(uid, "api_guide_jlpt_exam_answer", {
            "sessionId": sid, "questionId": n5_ids[0], "selectedIndex": tq0["answer_index"]})
        assert cap["status"] == 200, cap
        cap = _post(uid, "api_guide_jlpt_exam_answer", {
            "sessionId": sid, "questionId": n5_ids[1], "selectedIndex": wrong1})
        assert cap["status"] == 200, cap
        conn.commit()

        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-1"})
        assert cap["status"] == 200, cap
        resumed = cap["data"]
        assert resumed["sessionId"] == sid, "must resume the SAME in-progress session"
        assert resumed["resumed"] is True
        # Same paper, same order; answers still hidden mid-exam.
        assert [q["id"] for q in resumed["questions"]] == n5_ids
        for q in resumed["questions"]:
            assert "answerIndex" not in q and "explanation" not in q, "resume leaked the key"
        # Saved answers echoed — exactly the two we sent, and NOTHING that
        # reveals grading (is_correct/correct must not be present).
        got = {a["questionId"]: a["selectedIndex"] for a in resumed["answers"]}
        assert got == {n5_ids[0]: tq0["answer_index"], n5_ids[1]: wrong1}, got
        for a in resumed["answers"]:
            assert set(a.keys()) == {"questionId", "selectedIndex"}, f"answer leak: {a.keys()}"
        # Server-computed clock: fresh session → close to full duration, and
        # both key spellings agree.
        rem = resumed["remainingSeconds"]
        assert resumed["remaining_seconds"] == rem
        assert 0 < rem <= 600, rem
        # Legacy keys intact for old clients.
        for key in ("sessionId", "examId", "level", "title", "durationSeconds",
                    "passScore", "total", "questions", "disclaimer"):
            assert key in resumed, f"legacy key missing: {key}"

        # 2b) Elapsed time shows up in remainingSeconds (started 200s ago).
        _backdate_session(sid, 200)
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-1"})
        rem = cap["data"]["remainingSeconds"]
        assert cap["data"]["sessionId"] == sid
        assert 350 <= rem <= 400, f"expected ~400s left, got {rem}"

        # 3) Timed out (started 601s ago on a 600s exam) → old session settles
        #    via the existing submit semantics; a NEW session is created.
        _backdate_session(sid, 601)
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-1"})
        assert cap["status"] == 200, cap
        fresh = cap["data"]
        assert fresh["sessionId"] != sid, "timed-out session must not be resumed"
        assert fresh.get("resumed") is False
        conn.commit()
        old = dict(conn.execute("SELECT * FROM jlpt_exam_sessions WHERE id = ?", (sid,)).fetchone())
        assert old["status"] == "submitted", old["status"]
        # Graded on what was answered: 1 right of 4 → 25, below pass 50.
        assert old["total"] == 4 and old["correct"] == 1 and old["score"] == 25, old
        assert old["passed"] == 0
        # Clocked at the deadline, not at whenever the user came back.
        assert old["duration_seconds"] == 600, old["duration_seconds"]
        # And the settled session shows up in history like any submitted one.
        h, cap = _handler(uid)
        h.api_guide_jlpt_exam_history(conn, {})
        assert any(s["sessionId"] == sid for s in cap["data"]["sessions"])

        # 4) A second timed-out start on the NEW session's exam: submit the new
        #    session normally, then the next start is fresh again (no dangling
        #    in-progress row to resume).
        cap = _post(uid, "api_guide_jlpt_exam_submit", {"sessionId": fresh["sessionId"]})
        assert cap["status"] == 200, cap
        conn.commit()
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-1"})
        assert cap["status"] == 200 and cap["data"]["resumed"] is False
        assert cap["data"]["sessionId"] not in (sid, fresh["sessionId"])
        # Double-submit of the settled session is still rejected (CAS intact).
        cap = _post(uid, "api_guide_jlpt_exam_submit", {"sessionId": sid})
        assert cap["status"] == 409, cap
        conn.commit()

        # 5) Untimed exam (duration 0) never times out → always resumes.
        _upsert_exam(admin, "resume-exam-untimed", duration=0, question_ids=n5_ids[:2])
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-untimed"})
        usid = cap["data"]["sessionId"]
        conn.commit()
        _backdate_session(usid, 7 * 24 * 3600)  # a week old
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "resume-exam-untimed"})
        assert cap["data"]["sessionId"] == usid and cap["data"]["resumed"] is True
        assert cap["data"]["remainingSeconds"] == 0, "untimed exams report 0 (client ignores when durationSeconds==0)"

        # 6) Resume is per-user: another user starting the same exam gets a
        #    fresh session, not someone else's.
        other = _make_user(conn)
        conn.commit()
        cap = _post(other, "api_guide_jlpt_exam_start", {"examId": "resume-exam-untimed"})
        assert cap["status"] == 200 and cap["data"]["sessionId"] != usid
        assert cap["data"]["resumed"] is False

        print("OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
