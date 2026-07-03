#!/usr/bin/env python3
"""Tests for JLPT 备考核心 (BE6): /api/guide/jlpt/* + /api/admin/jlpt/*.

Exercises the real Handler.api_guide_jlpt_* / api_admin_jlpt_* methods against a
throwaway SQLite DB with a stubbed session. Machi AI (DeepSeek) is ALWAYS mocked.

Covers: practice sampling + free/member gating, attempt grading + recording,
review book (错题本) derivation, stats, placement scoring, streak derivation,
vocab decks/mark/progress, vocab quiz start+submit, online exam start/answer/
submit CAS + history + session review, member-only AI explain (quota + Pro),
admin question/vocab/exam-date/deck imports.

Run:  cd web && python3 scripts/test_jlpt_core.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_jlpt as jlpt  # noqa: E402
import seed_llm  # noqa: E402


# --- Machi AI mock (for /explain) -------------------------------------------
def _mock_completion(messages, *, model=None, thinking=False, max_tokens=1600, timeout=None):
    # Prove the prompt forbids真题 claims — echo nothing sensitive.
    return {
        "content": "正确答案是第1项，因为…（原创练习题讲解）。其它选项不符合语境。",
        "finish_reason": "stop", "model": "deepseek-v4-pro",
        "usage": {"prompt_tokens": 30, "completion_tokens": 60, "total_tokens": 90},
        "latency_ms": 5,
    }


seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]
server.seed_llm.machi_ai_chat_completion = _mock_completion  # type: ignore[assignment]


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


def _get(uid, method_name, query=None):
    h, cap = _handler(uid)
    getattr(h, method_name)(_CONN, query or {})
    return cap


def _post(uid, method_name, body):
    h, cap = _handler(uid)
    h.read_json = lambda: body  # type: ignore[method-assign]
    getattr(h, method_name)(_CONN)
    return cap


_CONN = None


def main() -> None:
    global _CONN
    server.init_db()
    conn = server.db()
    _CONN = conn
    try:
        # Seed content is present from init_db → ensure_jlpt_seed.
        qcount = conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_questions WHERE status='published'"
        ).fetchone()["c"]
        assert qcount >= 30, f"seed questions missing: {qcount}"
        assert conn.execute("SELECT COUNT(*) AS c FROM jlpt_vocab_words").fetchone()["c"] >= 15
        assert conn.execute("SELECT COUNT(*) AS c FROM jlpt_exam_dates").fetchone()["c"] == 2
        assert conn.execute("SELECT COUNT(*) AS c FROM jlpt_vocab_decks").fetchone()["c"] >= 3
        assert conn.execute("SELECT COUNT(*) AS c FROM jlpt_exams").fetchone()["c"] >= 3

        uid = _make_user(conn)
        conn.commit()

        # 1) Practice: N5 vocab. Questions hide the answer + explanation.
        cap = _get(uid, "api_guide_jlpt_practice", {"level": "N5", "section": "vocab", "count": "5"})
        assert cap["status"] == 200, cap
        qs = cap["data"]["questions"]
        assert 1 <= len(qs) <= 5, len(qs)
        for q in qs:
            assert "answerIndex" not in q and "explanation" not in q, "answer leaked in practice"
            assert q["level"] == "N5" and q["section"] == "vocab"
            assert q["choices"], "choices required"
        assert cap["data"]["disclaimer"]

        # 2) Free user cannot see member-only questions. Make an N5 member-only Q,
        #    then confirm a free practice call never returns it but a member does.
        mo_id = str(uuid.uuid4())
        now = server.now_iso()
        conn.execute(
            "INSERT INTO jlpt_questions (id, level, section, question_type, stem, passage, audio_media_id, "
            "choices_json, answer_index, explanation, difficulty, tags, is_member_only, source, "
            "review_status, status, sort_order, created_at, updated_at) "
            "VALUES (?, 'N5', 'grammar', 'single', '会员专属题', '', '', ?, 0, '解析', 3, '', 1, 'original', "
            "'approved', 'published', 0, ?, ?)",
            (mo_id, json.dumps(["A", "B", "C", "D"]), now, now),
        )
        conn.commit()
        # Free: pull a large grammar set, member-only must be absent.
        cap = _get(uid, "api_guide_jlpt_practice", {"level": "N5", "section": "grammar", "count": "30"})
        assert all(q["id"] != mo_id for q in cap["data"]["questions"]), "member-only leaked to free user"

        # 3) Attempt grading + recording. Answer one correctly, one wrong.
        q0 = qs[0]
        target = jlpt.get_question(conn, q0["id"])
        cap = _post(uid, "api_guide_jlpt_attempt", {
            "questionId": q0["id"], "selectedIndex": target["answer_index"], "sourceKind": "practice",
        })
        assert cap["status"] == 200, cap
        assert cap["data"]["correct"] is True
        assert cap["data"]["correctIndex"] == target["answer_index"]

        q1 = qs[1] if len(qs) > 1 else qs[0]
        tgt1 = jlpt.get_question(conn, q1["id"])
        wrong = (tgt1["answer_index"] + 1) % len(json.loads(tgt1["choices_json"]))
        cap = _post(uid, "api_guide_jlpt_attempt", {"questionId": q1["id"], "selectedIndex": wrong})
        assert cap["status"] == 200 and cap["data"]["correct"] is False, cap

        # 4) Review book contains the wrong question, not the right one.
        cap = _get(uid, "api_guide_jlpt_review", {"level": "N5", "count": "20"})
        rids = {q["id"] for q in cap["data"]["questions"]}
        assert q1["id"] in rids, "wrong question must appear in review"
        assert q0["id"] not in rids, "correctly-answered question must NOT be in review"
        # Review reveals answer+explanation (teaching).
        for q in cap["data"]["questions"]:
            assert "answerIndex" in q and "explanation" in q

        # 4b) Fixing the review question (answer it right) removes it from review.
        cap = _post(uid, "api_guide_jlpt_attempt", {"questionId": q1["id"], "selectedIndex": tgt1["answer_index"]})
        assert cap["data"]["correct"] is True
        cap = _get(uid, "api_guide_jlpt_review", {"level": "N5"})
        assert q1["id"] not in {q["id"] for q in cap["data"]["questions"]}, "fixed question must leave review"

        # 5) Stats reflect attempts.
        cap = _get(uid, "api_guide_jlpt_stats", {"level": "N5"})
        assert cap["status"] == 200
        assert cap["data"]["total"] >= 3, cap["data"]
        assert any(s["section"] == "vocab" for s in cap["data"]["sections"])

        # 6) Streak: today done (we made attempts today).
        cap = _get(uid, "api_guide_jlpt_streak", {})
        assert cap["data"]["todayDone"] is True
        assert cap["data"]["currentStreak"] >= 1
        assert len(cap["data"]["last7days"]) == 7

        # 7) Placement start + submit (rule-based scoring).
        cap = _get(uid, "api_guide_jlpt_placement_start", {})
        pqs = cap["data"]["questions"]
        assert 1 <= len(pqs) <= jlpt.PLACEMENT_QUESTION_COUNT, len(pqs)
        # Answer everything correctly → high recommended level near ceiling.
        answers = []
        for q in pqs:
            tq = jlpt.get_question(conn, q["id"])
            answers.append({"questionId": q["id"], "selectedIndex": tq["answer_index"]})
        cap = _post(uid, "api_guide_jlpt_placement_submit", {"answers": answers})
        assert cap["status"] == 200, cap
        assert cap["data"]["recommendedLevel"] in jlpt.LEVELS
        assert cap["data"]["answered"] == len(pqs)
        assert cap["data"]["suggestedDailyMinutes"] > 0
        assert "sectionBreakdown" in cap["data"] and "weakSections" in cap["data"]
        assert cap["data"]["studyPlanPrefill"]["targetLevel"] == cap["data"]["recommendedLevel"]
        # All-wrong → should recommend the easiest level.
        allwrong = []
        for q in pqs:
            tq = jlpt.get_question(conn, q["id"])
            nch = len(json.loads(tq["choices_json"]))
            allwrong.append({"questionId": q["id"], "selectedIndex": (tq["answer_index"] + 1) % nch})
        uid2 = _make_user(conn); conn.commit()
        cap = _post(uid2, "api_guide_jlpt_placement_submit", {"answers": allwrong})
        assert cap["data"]["recommendedLevel"] == "N5", cap["data"]["recommendedLevel"]

        # 8) Vocab decks / deck detail / mark / progress.
        cap = _get(uid, "api_guide_jlpt_vocab_decks", {"level": "N5"})
        decks = cap["data"]["decks"]
        assert decks, "N5 deck should exist"
        deck_id = decks[0]["id"]
        h, cap = _handler(uid)
        h.api_guide_jlpt_vocab_deck(conn, deck_id)
        assert cap["status"] == 200, cap
        words = cap["data"]["words"]
        assert words, "deck has words"
        assert all(w["mastered"] is False for w in words), "nothing mastered yet"
        wid = words[0]["id"]
        cap = _post(uid, "api_guide_jlpt_vocab_mark", {"wordId": wid, "state": "mastered"})
        assert cap["status"] == 200 and cap["data"]["state"] == "mastered"
        h, cap = _handler(uid)
        h.api_guide_jlpt_vocab_deck(conn, deck_id)
        assert any(w["id"] == wid and w["mastered"] for w in cap["data"]["words"]), "mark did not persist"
        cap = _get(uid, "api_guide_jlpt_vocab_progress", {"level": "N5"})
        assert cap["data"]["mastered"] >= 1 and cap["data"]["total"] >= 1

        # 9) Vocab quiz start + submit (self-generated MCQ; answers hidden in start).
        cap = _get(uid, "api_guide_jlpt_vocab_quiz_start", {"level": "N5", "count": "5"})
        assert cap["status"] == 200, cap
        vquiz = cap["data"]
        vqs = vquiz["questions"]
        assert vqs, "quiz has questions"
        for q in vqs:
            assert "answerIndex" not in q, "vocab quiz leaked the answer"
            assert len(q["choices"]) >= 2
        # Submit all zeros; server grades against its stored key.
        cap = _post(uid, "api_guide_jlpt_vocab_quiz_submit", {
            "sessionId": vquiz["sessionId"], "answers": [0] * len(vqs),
        })
        assert cap["status"] == 200, cap
        assert cap["data"]["total"] == len(vqs)
        assert 0 <= cap["data"]["correct"] <= len(vqs)
        # Double-submit is rejected (CAS).
        cap = _post(uid, "api_guide_jlpt_vocab_quiz_submit", {
            "sessionId": vquiz["sessionId"], "answers": [0] * len(vqs),
        })
        assert cap["status"] == 409, cap

        # 10) Online exam: list, start, answer, submit, history, session review.
        cap = _get(uid, "api_guide_jlpt_exams", {"level": "N5"})
        exams = cap["data"]["exams"]
        assert exams, "N5 exam exists"
        exam_id = exams[0]["id"]
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": exam_id})
        assert cap["status"] == 200, cap
        sess = cap["data"]
        session_id = sess["sessionId"]
        eqs = sess["questions"]
        assert eqs, "exam session has questions"
        for q in eqs:
            assert "answerIndex" not in q, "exam session leaked answer"
        # Answer half correctly.
        for i, q in enumerate(eqs):
            tq = jlpt.get_question(conn, q["id"])
            sel = tq["answer_index"] if i % 2 == 0 else (tq["answer_index"] + 1) % len(json.loads(tq["choices_json"]))
            cap = _post(uid, "api_guide_jlpt_exam_answer", {
                "sessionId": session_id, "questionId": q["id"], "selectedIndex": sel,
            })
            assert cap["status"] == 200, cap
        cap = _post(uid, "api_guide_jlpt_exam_submit", {"sessionId": session_id})
        assert cap["status"] == 200, cap
        assert cap["data"]["total"] == len(eqs)
        assert 0 <= cap["data"]["score"] <= 100
        # Post-submit breakdown reveals answers.
        assert all("answerIndex" in q for q in cap["data"]["questions"])
        # Double submit → 409.
        cap = _post(uid, "api_guide_jlpt_exam_submit", {"sessionId": session_id})
        assert cap["status"] == 409, cap
        # History + session review.
        cap = _get(uid, "api_guide_jlpt_exam_history", {})
        assert any(s["sessionId"] == session_id for s in cap["data"]["sessions"])
        h, cap = _handler(uid)
        h.api_guide_jlpt_exam_session(conn, session_id)
        assert cap["status"] == 200 and cap["data"]["sessionId"] == session_id
        assert all("answerIndex" in q for q in cap["data"]["questions"])

        # 11) Exam dates endpoint.
        cap = _get(uid, "api_guide_jlpt_exam_dates", {"region": "jp"})
        assert len(cap["data"]["examDates"]) == 2
        assert cap["data"]["countdown"] is None or "daysRemaining" in cap["data"]["countdown"]

        # 12) AI explain — free user spends normal quota; member uses Pro.
        cap = _post(uid, "api_guide_jlpt_explain", {"questionId": q0["id"], "language": "zh-CN"})
        assert cap["status"] == 200, cap
        assert cap["data"]["explanation"], "explanation required"
        # No provider/model leak anywhere in the response.
        blob = json.dumps(cap["data"], ensure_ascii=False).lower()
        for tok in ("deepseek", "v4-pro", "v4-flash", "openai", "gpt", "anthropic"):
            assert tok not in blob, f"provider/model leak in explain response: {tok}"
        # The disclaimer (compliance) is present; it legitimately says 不含真题.
        assert "真题" in cap["data"]["disclaimer"]
        # Member gets the same shape, membershipActive True.
        member = _make_user(conn)
        server.activate_or_extend_membership(conn, member, server.MEMBERSHIP_PLAN_MONTHLY_KEY, "manual", periods=1)
        conn.commit()
        cap = _post(member, "api_guide_jlpt_explain", {"questionId": q0["id"]})
        assert cap["status"] == 200 and cap["data"]["usage"]["membershipActive"] is True

        # 12b) Explain quota exhaustion → 429 for a free user.
        broke = _make_user(conn); conn.commit()
        limit = server.machi_ai_daily_limit(
            dict(conn.execute("SELECT * FROM users WHERE id=?", (broke,)).fetchone()), False)
        for _ in range(limit):
            cap = _post(broke, "api_guide_jlpt_explain", {"questionId": q0["id"]})
            assert cap["status"] == 200, cap
        cap = _post(broke, "api_guide_jlpt_explain", {"questionId": q0["id"]})
        assert cap["status"] == 429 and cap["data"]["error"]["code"] == "AI_QUOTA_EXCEEDED", cap

        # 13) Auth required on write endpoints.
        h, _ = _handler(None)
        h.read_json = lambda: {"questionId": q0["id"], "selectedIndex": 0}  # type: ignore[method-assign]
        try:
            h.api_guide_jlpt_attempt(conn)
            assert False, "expected AUTH_REQUIRED"
        except server.APIError as e:
            assert e.status == 401, e.status

        # 14) Admin imports: questions, vocab, exam-dates, deck.
        admin = _make_admin(conn); conn.commit()
        imp_qid = "imported-q-1"
        cap = _post(admin, "api_admin_jlpt_questions_import", {"items": [
            {"id": imp_qid, "level": "N2", "section": "grammar", "stem": "导入题",
             "choices": ["甲", "乙", "丙", "丁"], "answerIndex": 2, "explanation": "解析",
             "source": "imported"},
            {"stem": "缺选项跳过", "choices": ["only-one"]},  # invalid → skipped
        ]})
        assert cap["status"] == 200, cap
        assert cap["data"]["inserted"] == 1 and cap["data"]["skipped"] == 1, cap["data"]
        row = dict(conn.execute("SELECT * FROM jlpt_questions WHERE id=?", (imp_qid,)).fetchone())
        assert row["source"] == "imported" and row["answer_index"] == 2
        # Re-import same id → update, not duplicate.
        cap = _post(admin, "api_admin_jlpt_questions_import", {"items": [
            {"id": imp_qid, "level": "N2", "section": "grammar", "stem": "导入题(改)",
             "choices": ["甲", "乙", "丙", "丁"], "answerIndex": 1},
        ]})
        assert cap["data"]["updated"] == 1 and cap["data"]["inserted"] == 0, cap["data"]
        assert dict(conn.execute("SELECT * FROM jlpt_questions WHERE id=?", (imp_qid,)).fetchone())["answer_index"] == 1

        cap = _post(admin, "api_admin_jlpt_vocab_import", {"items": [
            {"id": "imp-w-1", "level": "N3", "word": "導入語", "reading": "どうにゅうご",
             "meaningZh": "导入词", "source": "imported"},
        ]})
        assert cap["status"] == 200 and cap["data"]["inserted"] == 1

        cap = _post(admin, "api_admin_jlpt_exam_dates_upsert", {"items": [
            {"region": "jp", "sessionLabel": "2027-07", "examDate": "2027-07-04"},
        ]})
        assert cap["status"] == 200 and cap["data"]["written"] == 1
        # Upsert same session_label → still one row for it.
        cap = _post(admin, "api_admin_jlpt_exam_dates_upsert", {"items": [
            {"region": "jp", "sessionLabel": "2027-07", "examDate": "2027-07-05"},
        ]})
        cnt = conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_exam_dates WHERE region='jp' AND session_label='2027-07'"
        ).fetchone()["c"]
        assert cnt == 1, f"exam-date upsert duplicated: {cnt}"

        cap = _post(admin, "api_admin_jlpt_deck_upsert", {"deck": {
            "id": "imp-deck-1", "level": "N3", "title": "导入 deck",
            "wordIds": ["imp-w-1"],
        }})
        assert cap["status"] == 200 and cap["data"]["wordCount"] == 1

        # 14b) Admin exam upsert — fixed question set. Build an N5 exam from three
        #      specific seed questions; starting it must serve exactly those.
        n5_ids = [dict(r)["id"] for r in conn.execute(
            "SELECT id FROM jlpt_questions WHERE level='N5' AND status='published' "
            "AND is_member_only=0 LIMIT 3"
        ).fetchall()]
        assert len(n5_ids) == 3, n5_ids
        cap = _post(admin, "api_admin_jlpt_exam_upsert", {"exam": {
            "id": "imp-exam-1", "level": "N5", "title": "导入固定卷",
            "passScore": 50, "durationSeconds": 600, "questionIds": n5_ids,
        }})
        assert cap["status"] == 200, cap
        assert cap["data"]["fixed"] is True and cap["data"]["questionCount"] == 3, cap["data"]
        conn.commit()
        # The exam now lists and starting it serves exactly the fixed 3 (in order).
        cap = _post(uid, "api_guide_jlpt_exam_start", {"examId": "imp-exam-1"})
        assert cap["status"] == 200, cap
        served = [q["id"] for q in cap["data"]["questions"]]
        assert served == n5_ids, f"fixed exam order/set wrong: {served} vs {n5_ids}"
        assert cap["data"]["passScore"] == 50 and cap["data"]["total"] == 3
        # Re-upsert same id WITHOUT questionIds → clears fixed set, goes dynamic.
        cap = _post(admin, "api_admin_jlpt_exam_upsert", {"exam": {
            "id": "imp-exam-1", "level": "N5", "title": "导入固定卷(改为动态)",
            "questionCount": 5,
        }})
        assert cap["status"] == 200 and cap["data"]["fixed"] is False, cap["data"]
        assert conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_exam_questions WHERE exam_id='imp-exam-1'"
        ).fetchone()["c"] == 0, "fixed set must be cleared on dynamic re-upsert"

        # 15) Non-admin blocked from imports.
        h, _ = _handler(uid)
        h.read_json = lambda: {"items": []}  # type: ignore[method-assign]
        try:
            h.api_admin_jlpt_questions_import(conn)
            assert False, "expected forbidden"
        except server.APIError as e:
            assert e.status == 403, e.status
        h, _ = _handler(uid)
        h.read_json = lambda: {"exam": {"level": "N5"}}  # type: ignore[method-assign]
        try:
            h.api_admin_jlpt_exam_upsert(conn)
            assert False, "expected forbidden"
        except server.APIError as e:
            assert e.status == 403, e.status

        # 16) Zone handler exposes jlptCore dynamic fields.
        h, cap = _handler(uid)
        h.api_guide_jlpt_zone(conn, {"country": "jp", "language": "zh-CN"})
        assert cap["status"] == 200, cap
        core = cap["data"].get("jlptCore")
        assert core and core["hasPractice"] is True and core["hasVocab"] is True
        assert core["hasExams"] is True

        print("OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
