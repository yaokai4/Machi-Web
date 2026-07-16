"""JLPT 备考核心 — pure product module (题库/定级/打卡/单词/在线考试/考试日历).

BE6/BE7. Like ``server_partners.py`` / ``server_lifehub.py`` this is a
deliberately SEPARATE, mostly-pure module: it imports nothing from ``server`` so
it unit-tests in isolation. Everything is a sqlite3-shaped ``conn`` + stdlib.
``server.py`` keeps the thin HTTP handlers (auth / membership / JSON envelopes /
Machi-AI plumbing) and calls into these helpers.

Compliance: study content is original or admin-imported. The ``source`` column
on every row keeps provenance auditable so an operator can pull imported
真题 later; AI explanations are forbidden from claiming to quote real exams.
Money is never touched here.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from server_errors import APIError

_log = logging.getLogger("kaix.error")

# ── constants ──────────────────────────────────────────────────────────────

LEVELS: tuple[str, ...] = ("N5", "N4", "N3", "N2", "N1")
SECTIONS: tuple[str, ...] = ("vocab", "grammar", "reading", "listening")
SECTION_LABELS_ZH = {
    "vocab": "文字·词汇", "grammar": "语法", "reading": "读解", "listening": "听解",
}
# JLPT levels ordered easiest→hardest; index used by the placement scorer.
_LEVEL_ORDER = {lvl: i for i, lvl in enumerate(LEVELS)}  # N5=0 … N1=4

JST = timezone(timedelta(hours=9))  # Asia/Tokyo, no DST — the打卡 day boundary.

# Practice defaults / caps.
PRACTICE_DEFAULT_COUNT = 10
PRACTICE_MAX_COUNT = 30
REVIEW_DEFAULT_COUNT = 20
REVIEW_MAX_COUNT = 50
RECENT_CORRECT_WINDOW_HOURS = 24  # skip questions the user got right this recently
PLACEMENT_QUESTION_COUNT = 12     # mixed-section difficulty ladder
VOCAB_QUIZ_DEFAULT_COUNT = 10
VOCAB_QUIZ_MAX_COUNT = 20
IMPORT_MAX_ROWS = 2000
EXAM_DYNAMIC_MAX = 60             # cap on dynamically-sampled mock exam size
# Grace window (seconds) added to a timed exam's deadline before the server stops
# accepting answer saves, so an answer in-flight at the buzzer isn't lost to
# network latency. Grading + recorded duration are still clamped to the hard
# limit in submit_exam_session.
EXAM_SAVE_GRACE_SEC = 5

_VALID_SOURCE_KINDS = ("practice", "placement", "review", "exam", "vocab")
_VALID_VOCAB_STATES = ("learning", "mastered")

# 听力题没有音频媒体时只剩「（音声）…」这类文字占位，混进练习/定级/动态模考
# 严重损伤专业感（B2-6）。动态抽题一律排除；固定组卷（admin 明确指定的题单）
# 保留但记告警，绝不因此炸掉一场考试。
_AUDIO_READY_SQL = "(section <> 'listening' OR COALESCE(audio_media_id, '') <> '')"


# ── small helpers ────────────────────────────────────────────────────────────

def _iso(now: Optional[str]) -> str:
    return now or datetime.now(timezone.utc).isoformat()


def jst_date(now: Optional[str] = None) -> str:
    """Current JST calendar date (YYYY-MM-DD) — the 打卡 / streak key."""
    if now:
        try:
            dt = datetime.fromisoformat(now.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(JST).date().isoformat()
        except Exception:
            pass
    return datetime.now(JST).date().isoformat()


def normalize_level(raw: Any, default: str = "N3") -> str:
    lvl = str(raw or "").strip().upper()
    return lvl if lvl in LEVELS else default


def normalize_section(raw: Any, default: str = "") -> str:
    sec = str(raw or "").strip().lower()
    return sec if sec in SECTIONS else default


def _clamp(value: Any, default: int, lo: int, hi: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _loads_choices(raw: Any) -> list[str]:
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [str(x) for x in data][:8]


# ── question serialization ───────────────────────────────────────────────────

def public_question(row: Any, *, reveal_answer: bool = False) -> dict[str, Any]:
    """Client-facing question shape. Hides answer_index/explanation unless
    reveal_answer (only ever set after the user has answered, e.g. review book
    or exam回看)."""
    d = dict(row)
    out: dict[str, Any] = {
        "id": d["id"],
        "level": d.get("level") or "",
        "section": d.get("section") or "",
        "sectionLabel": SECTION_LABELS_ZH.get(d.get("section") or "", ""),
        "questionType": d.get("question_type") or "single",
        "stem": d.get("stem") or "",
        "passage": d.get("passage") or "",
        "audioMediaId": d.get("audio_media_id") or "",
        "choices": _loads_choices(d.get("choices_json")),
        "difficulty": int(d.get("difficulty") or 3),
        "isMemberOnly": bool(d.get("is_member_only")),
    }
    if reveal_answer:
        out["answerIndex"] = int(d.get("answer_index") or 0)
        out["explanation"] = d.get("explanation") or ""
    return out


# ── question picking (practice) ──────────────────────────────────────────────

def pick_practice_questions(
    conn: Any, *, level: str, section: str, count: int, user_id: Optional[str],
    is_member: bool, now: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Sample published+approved questions for a level (optional section).

    Non-members only see is_member_only=0. Questions the user answered
    correctly within the last 24h are excluded so practice keeps advancing.
    ORDER BY RANDOM() is valid on both SQLite and Postgres (function name is
    case-insensitive on PG). Returns public (answer-hidden) shapes."""
    level = normalize_level(level)
    section = normalize_section(section)
    count = _clamp(count, PRACTICE_DEFAULT_COUNT, 1, PRACTICE_MAX_COUNT)

    where = ["level = ?", "status = 'published'", "review_status = 'approved'", _AUDIO_READY_SQL]
    params: list[Any] = [level]
    if section:
        where.append("section = ?")
        params.append(section)
    if not is_member:
        where.append("is_member_only = 0")

    exclude_ids = _recent_correct_ids(conn, user_id, level, now=now) if user_id else []
    if exclude_ids:
        placeholders = ",".join("?" * len(exclude_ids))
        where.append(f"id NOT IN ({placeholders})")
        params.extend(exclude_ids)

    sql = (
        "SELECT * FROM jlpt_questions WHERE " + " AND ".join(where)
        + " ORDER BY RANDOM() LIMIT ?"
    )
    params.append(count)
    rows = conn.execute(sql, tuple(params)).fetchall()
    return [public_question(r) for r in rows]


def _recent_correct_ids(conn: Any, user_id: str, level: str, *, now: Optional[str]) -> list[str]:
    cutoff = (
        datetime.fromisoformat(_iso(now).replace("Z", "+00:00")).astimezone(timezone.utc)
        - timedelta(hours=RECENT_CORRECT_WINDOW_HOURS)
    ).isoformat()
    rows = conn.execute(
        "SELECT DISTINCT question_id FROM jlpt_attempts "
        "WHERE user_id = ? AND level = ? AND is_correct = 1 AND created_at >= ?",
        (user_id, level, cutoff),
    ).fetchall()
    return [dict(r)["question_id"] for r in rows]


def get_question(conn: Any, question_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute("SELECT * FROM jlpt_questions WHERE id = ?", (question_id,)).fetchone()
    return dict(row) if row else None


# ── attempt recording ────────────────────────────────────────────────────────

def record_attempt(
    conn: Any, *, user_id: str, question: dict[str, Any], selected_index: int,
    session_id: str = "", source_kind: str = "practice", now: Optional[str] = None,
) -> dict[str, Any]:
    """Grade one answer and persist an attempt row. Returns the grading result
    (correct + correct index + explanation) for the client."""
    now = _iso(now)
    answer_index = int(question.get("answer_index") or 0)
    is_correct = 1 if int(selected_index) == answer_index else 0
    kind = source_kind if source_kind in _VALID_SOURCE_KINDS else "practice"
    conn.execute(
        "INSERT INTO jlpt_attempts (id, user_id, question_id, level, section, selected_index, "
        "is_correct, session_id, source_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, question["id"], question.get("level") or "",
         question.get("section") or "", int(selected_index), is_correct, session_id or "", kind, now),
    )
    return {
        "questionId": question["id"],
        "correct": bool(is_correct),
        "correctIndex": answer_index,
        "selectedIndex": int(selected_index),
        "explanation": question.get("explanation") or "",
    }


# ── review book (错题本, derived from attempts) ──────────────────────────────

def review_questions(conn: Any, *, user_id: str, level: str, count: int) -> list[dict[str, Any]]:
    """Questions the user has answered wrong (and NOT since gotten right).
    Derived purely from jlpt_attempts — no separate 错题本 table. Answer +
    explanation are revealed so the client can teach."""
    level = normalize_level(level, default="")
    count = _clamp(count, REVIEW_DEFAULT_COUNT, 1, REVIEW_MAX_COUNT)
    params: list[Any] = [user_id]
    level_clause = ""
    if level:
        level_clause = " AND a.level = ?"
        params.append(level)
    # A question is "still wrong" if its most recent attempt was incorrect.
    sql = (
        "SELECT q.* FROM jlpt_questions q JOIN ("
        "  SELECT question_id, MAX(created_at) AS last_at FROM jlpt_attempts a "
        "  WHERE a.user_id = ?" + level_clause +
        "  GROUP BY question_id"
        ") last ON last.question_id = q.id "
        "JOIN jlpt_attempts la ON la.question_id = last.question_id "
        "  AND la.created_at = last.last_at AND la.user_id = ? "
        "WHERE la.is_correct = 0 "
        "ORDER BY last.last_at DESC LIMIT ?"
    )
    params.append(user_id)
    params.append(count)
    rows = conn.execute(sql, tuple(params)).fetchall()
    return [public_question(r, reveal_answer=True) for r in rows]


def review_pending_count(conn: Any, *, user_id: str) -> int:
    """How many questions are sitting in the 错题本 (latest attempt wrong).
    Same derivation as review_questions — the count the review-reminder push
    (B2-3) quotes must match what the user then sees in the review book."""
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM jlpt_questions q JOIN ("
        "  SELECT question_id, MAX(created_at) AS last_at FROM jlpt_attempts a "
        "  WHERE a.user_id = ? GROUP BY question_id"
        ") last ON last.question_id = q.id "
        "JOIN jlpt_attempts la ON la.question_id = last.question_id "
        "  AND la.created_at = last.last_at AND la.user_id = ? "
        "WHERE la.is_correct = 0",
        (user_id, user_id),
    ).fetchone()
    return int(dict(row)["c"] or 0)


# ── stats ────────────────────────────────────────────────────────────────────

def stats(conn: Any, *, user_id: str, level: str = "") -> dict[str, Any]:
    """Aggregate accuracy overall + per section for a user (optional level)."""
    level = normalize_level(level, default="")
    params: list[Any] = [user_id]
    clause = ""
    if level:
        clause = " AND level = ?"
        params.append(level)
    total_row = conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct "
        "FROM jlpt_attempts WHERE user_id = ?" + clause,
        tuple(params),
    ).fetchone()
    total = int(dict(total_row)["total"] or 0)
    correct = int(dict(total_row)["correct"] or 0)
    sections: list[dict[str, Any]] = []
    for sec in SECTIONS:
        sp: list[Any] = [user_id, sec]
        sclause = ""
        if level:
            sclause = " AND level = ?"
            sp.append(level)
        srow = conn.execute(
            "SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct "
            "FROM jlpt_attempts WHERE user_id = ? AND section = ?" + sclause,
            tuple(sp),
        ).fetchone()
        st = int(dict(srow)["total"] or 0)
        sc = int(dict(srow)["correct"] or 0)
        sections.append({
            "section": sec, "label": SECTION_LABELS_ZH[sec],
            "total": st, "correct": sc,
            "accuracy": round(sc / st, 3) if st else 0.0,
        })
    return {
        "level": level or "all",
        "total": total, "correct": correct,
        "accuracy": round(correct / total, 3) if total else 0.0,
        "sections": sections,
    }


# ── placement (定级) ─────────────────────────────────────────────────────────

def placement_questions(conn: Any, *, is_member: bool) -> list[dict[str, Any]]:
    """Assemble a mixed-section difficulty ladder from the whole bank so the
    scorer can find the user's ceiling. Free users only see free questions.
    Pulls a spread across levels/sections, hides answers (like practice)."""
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()
    member_clause = "" if is_member else " AND is_member_only = 0"
    # Two questions per level (easiest→hardest), rotating section for coverage.
    per_level = max(1, PLACEMENT_QUESTION_COUNT // len(LEVELS)) + 1
    for lvl in LEVELS:
        rows = conn.execute(
            "SELECT * FROM jlpt_questions WHERE level = ? AND status = 'published' "
            "AND review_status = 'approved' AND " + _AUDIO_READY_SQL + member_clause +
            " ORDER BY RANDOM() LIMIT ?",
            (lvl, per_level),
        ).fetchall()
        for r in rows:
            d = dict(r)
            if d["id"] in seen:
                continue
            seen.add(d["id"])
            picked.append(d)
    # Order easy→hard so the client shows a natural ramp; trim to target size.
    picked.sort(key=lambda d: _LEVEL_ORDER.get(d.get("level") or "N5", 0))
    picked = picked[:PLACEMENT_QUESTION_COUNT]
    return [public_question(d) for d in picked]


def score_placement(conn: Any, answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure rule-based placement. `answers` = [{questionId, selectedIndex}].

    Weights each question by its level (harder counts more) and computes a
    weighted correctness that maps to a recommended level. Also returns a
    per-section breakdown and the weakest sections. No AI involved."""
    if not answers:
        return {
            "recommendedLevel": "N5", "confidence": 0.0,
            "sectionBreakdown": [], "weakSections": [],
            "suggestedDailyMinutes": 45, "answered": 0,
        }
    q_ids = [str(a.get("questionId") or a.get("question_id") or "") for a in answers]
    q_ids = [q for q in q_ids if q]
    q_map: dict[str, dict[str, Any]] = {}
    if q_ids:
        placeholders = ",".join("?" * len(q_ids))
        rows = conn.execute(
            f"SELECT * FROM jlpt_questions WHERE id IN ({placeholders})", tuple(q_ids)
        ).fetchall()
        q_map = {dict(r)["id"]: dict(r) for r in rows}

    # Level weight: N5=1 … N1=5 (harder questions dominate the score).
    weighted_correct = 0.0
    weighted_total = 0.0
    # Track the highest level at which the user still answers correctly.
    highest_correct_idx = -1
    sec_agg: dict[str, dict[str, int]] = {s: {"total": 0, "correct": 0} for s in SECTIONS}
    answered = 0
    for a in answers:
        qid = str(a.get("questionId") or a.get("question_id") or "")
        q = q_map.get(qid)
        if not q:
            continue
        answered += 1
        lvl = q.get("level") or "N5"
        weight = _LEVEL_ORDER.get(lvl, 0) + 1
        sel = int(a.get("selectedIndex", a.get("selected_index", -1)))
        correct = 1 if sel == int(q.get("answer_index") or 0) else 0
        weighted_total += weight
        weighted_correct += weight * correct
        sec = q.get("section") or "vocab"
        if sec in sec_agg:
            sec_agg[sec]["total"] += 1
            sec_agg[sec]["correct"] += correct
        if correct:
            highest_correct_idx = max(highest_correct_idx, _LEVEL_ORDER.get(lvl, 0))

    ratio = (weighted_correct / weighted_total) if weighted_total else 0.0
    # Map weighted correctness → recommended level index. A user who nails the
    # hard questions gets pushed up; the ceiling is bounded by the highest level
    # they actually answered correctly (can't recommend N1 if they never got an
    # N1 right). Index into LEVELS (0=N5 … 4=N1).
    rec_idx = int(round(ratio * (len(LEVELS) - 1)))
    if highest_correct_idx >= 0:
        rec_idx = min(rec_idx, highest_correct_idx + 1)
    rec_idx = max(0, min(len(LEVELS) - 1, rec_idx))
    recommended = LEVELS[rec_idx]

    section_breakdown: list[dict[str, Any]] = []
    for sec in SECTIONS:
        t = sec_agg[sec]["total"]
        c = sec_agg[sec]["correct"]
        section_breakdown.append({
            "section": sec, "label": SECTION_LABELS_ZH[sec],
            "total": t, "correct": c,
            "accuracy": round(c / t, 3) if t else 0.0,
        })
    # Weakest = lowest-accuracy sections that were actually tested.
    tested = [s for s in section_breakdown if s["total"] > 0]
    tested.sort(key=lambda s: s["accuracy"])
    weak = [s["section"] for s in tested[:2]] if tested else []

    # Suggested daily minutes scale with target level (harder = more time).
    suggested = {0: 30, 1: 40, 2: 50, 3: 60, 4: 75}.get(rec_idx, 45)

    return {
        "recommendedLevel": recommended,
        "confidence": round(ratio, 3),
        "sectionBreakdown": section_breakdown,
        "weakSections": weak,
        "suggestedDailyMinutes": suggested,
        "answered": answered,
    }


# ── streak (打卡, derived) ────────────────────────────────────────────────────

def streak(conn: Any, *, user_id: str, now: Optional[str] = None) -> dict[str, Any]:
    """Derive 打卡 stats purely from attempts + exam sessions. A day counts if
    the user made ≥1 attempt OR submitted ≥1 exam that JST day. Zero extra
    writes."""
    days: set[str] = set()
    for row in conn.execute(
        "SELECT created_at FROM jlpt_attempts WHERE user_id = ?", (user_id,)
    ).fetchall():
        days.add(jst_date(dict(row)["created_at"]))
    for row in conn.execute(
        "SELECT started_at FROM jlpt_exam_sessions WHERE user_id = ? AND status = 'submitted'",
        (user_id,),
    ).fetchall():
        days.add(jst_date(dict(row)["started_at"]))

    today = jst_date(now)
    today_done = today in days

    # Current streak: consecutive days back from today (or yesterday if today
    # not yet done, so an early-morning open doesn't zero a live streak).
    def _prev(day: str) -> str:
        return (datetime.fromisoformat(day).date() - timedelta(days=1)).isoformat()

    current = 0
    cursor = today if today_done else _prev(today)
    # Only count if the streak is anchored at today or yesterday.
    if cursor in days:
        while cursor in days:
            current += 1
            cursor = _prev(cursor)

    longest = _longest_streak(days)

    # last7days: [{date, done}] oldest→newest ending today.
    last7: list[dict[str, Any]] = []
    d = datetime.fromisoformat(today).date()
    for i in range(6, -1, -1):
        day = (d - timedelta(days=i)).isoformat()
        last7.append({"date": day, "done": day in days})

    return {
        "currentStreak": current,
        "longestStreak": longest,
        "todayDone": today_done,
        "totalDays": len(days),
        "last7days": last7,
    }


def _longest_streak(days: set[str]) -> int:
    if not days:
        return 0
    dates = sorted(datetime.fromisoformat(d).date() for d in days)
    longest = 1
    run = 1
    for prev, cur in zip(dates, dates[1:]):
        if (cur - prev).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    return longest


# ── exam dates (考试日历) ─────────────────────────────────────────────────────

def exam_dates(conn: Any, *, region: str = "jp") -> list[dict[str, Any]]:
    region = (str(region or "jp").strip().lower()) or "jp"
    rows = conn.execute(
        "SELECT * FROM jlpt_exam_dates WHERE region = ? AND status = 'published' "
        "ORDER BY exam_date",
        (region,),
    ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        out.append({
            "id": d["id"], "region": d.get("region") or "jp",
            "sessionLabel": d.get("session_label") or "",
            "examDate": d.get("exam_date") or "",
            "regOpenDate": d.get("reg_open_date") or "",
            "regCloseDate": d.get("reg_close_date") or "",
            "note": d.get("note") or "",
        })
    return out


def next_exam_countdown(conn: Any, *, region: str = "jp", now: Optional[str] = None) -> Optional[dict[str, Any]]:
    """The soonest upcoming exam date + days remaining (for the zone倒计时)."""
    today = jst_date(now)
    for d in exam_dates(conn, region=region):
        if d["examDate"] and d["examDate"] >= today:
            try:
                delta = (datetime.fromisoformat(d["examDate"]).date()
                         - datetime.fromisoformat(today).date()).days
            except Exception:
                delta = 0
            return {"sessionLabel": d["sessionLabel"], "examDate": d["examDate"], "daysRemaining": delta}
    return None


# ── vocab decks / words ──────────────────────────────────────────────────────

def vocab_decks(conn: Any, *, level: str = "") -> list[dict[str, Any]]:
    level = normalize_level(level, default="")
    params: list[Any] = []
    clause = ""
    if level:
        clause = " AND level = ?"
        params.append(level)
    rows = conn.execute(
        "SELECT * FROM jlpt_vocab_decks WHERE status = 'published'" + clause +
        " ORDER BY level, sort_order",
        tuple(params),
    ).fetchall()
    return [_public_deck(dict(r)) for r in rows]


def _public_deck(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": d["id"], "level": d.get("level") or "",
        "title": d.get("title") or "", "description": d.get("description") or "",
        "wordCount": int(d.get("word_count") or 0),
        "isMemberOnly": bool(d.get("is_member_only")),
    }


def deck_words(conn: Any, *, deck_id: str, user_id: Optional[str]) -> Optional[dict[str, Any]]:
    """Deck detail + its words + the user's mastered state per word."""
    drow = conn.execute("SELECT * FROM jlpt_vocab_decks WHERE id = ?", (deck_id,)).fetchone()
    if not drow:
        return None
    d = dict(drow)
    rows = conn.execute(
        "SELECT w.* FROM jlpt_vocab_words w JOIN jlpt_vocab_deck_words dw ON dw.word_id = w.id "
        "WHERE dw.deck_id = ? AND w.status = 'published' ORDER BY dw.sort_order",
        (deck_id,),
    ).fetchall()
    mastered: set[str] = set()
    if user_id:
        for r in conn.execute(
            "SELECT word_id FROM jlpt_user_vocab WHERE user_id = ? AND state = 'mastered'",
            (user_id,),
        ).fetchall():
            mastered.add(dict(r)["word_id"])
    words = [_public_word(dict(w), mastered) for w in rows]
    return {"deck": _public_deck(d), "words": words}


def _public_word(w: dict[str, Any], mastered: set[str]) -> dict[str, Any]:
    return {
        "id": w["id"], "level": w.get("level") or "",
        "word": w.get("word") or "", "reading": w.get("reading") or "",
        "meaningZh": w.get("meaning_zh") or "", "meaningEn": w.get("meaning_en") or "",
        "pos": w.get("pos") or "", "example": w.get("example") or "",
        "exampleZh": w.get("example_zh") or "",
        "mastered": w["id"] in mastered,
    }


def mark_vocab(conn: Any, *, user_id: str, word_id: str, state: str, now: Optional[str] = None) -> dict[str, Any]:
    """Mark a word learning/mastered. Idempotent UPSERT on (user_id, word_id)."""
    state = state if state in _VALID_VOCAB_STATES else "learning"
    now = _iso(now)
    conn.execute(
        "INSERT INTO jlpt_user_vocab (user_id, word_id, state, review_count, last_seen_at) "
        "VALUES (?, ?, ?, 1, ?) "
        "ON CONFLICT(user_id, word_id) DO UPDATE SET "
        "state = ?, review_count = jlpt_user_vocab.review_count + 1, last_seen_at = ?",
        (user_id, word_id, state, now, state, now),
    )
    return {"wordId": word_id, "state": state}


def vocab_progress(conn: Any, *, user_id: str, level: str = "") -> dict[str, Any]:
    level = normalize_level(level, default="")
    if level:
        total = int(dict(conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_vocab_words WHERE level = ? AND status = 'published'",
            (level,),
        ).fetchone())["c"])
        mastered = int(dict(conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_user_vocab uv "
            "JOIN jlpt_vocab_words w ON w.id = uv.word_id "
            "WHERE uv.user_id = ? AND uv.state = 'mastered' AND w.level = ?",
            (user_id, level),
        ).fetchone())["c"])
    else:
        total = int(dict(conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_vocab_words WHERE status = 'published'"
        ).fetchone())["c"])
        mastered = int(dict(conn.execute(
            "SELECT COUNT(*) AS c FROM jlpt_user_vocab WHERE user_id = ? AND state = 'mastered'",
            (user_id,),
        ).fetchone())["c"])
    return {
        "level": level or "all", "total": total, "mastered": mastered,
        "learning": max(0, total - mastered),
        "progress": round(mastered / total, 3) if total else 0.0,
    }


# ── online exams (题库题组卷 + 单词测验) ─────────────────────────────────────

def list_exams(conn: Any, *, level: str = "", is_member: bool = False) -> list[dict[str, Any]]:
    level = normalize_level(level, default="")
    params: list[Any] = []
    clauses = ["status = 'published'"]
    if level:
        clauses.append("level = ?")
        params.append(level)
    if not is_member:
        clauses.append("is_member_only = 0")
    rows = conn.execute(
        "SELECT * FROM jlpt_exams WHERE " + " AND ".join(clauses) +
        " ORDER BY level, sort_order",
        tuple(params),
    ).fetchall()
    return [_public_exam(dict(r)) for r in rows]


def _public_exam(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": d["id"], "level": d.get("level") or "",
        "title": d.get("title") or "", "kind": d.get("kind") or "mock",
        "section": d.get("section") or "",
        "questionCount": int(d.get("question_count") or 0),
        "durationSeconds": int(d.get("duration_seconds") or 0),
        "passScore": int(d.get("pass_score") or 60),
        "isMemberOnly": bool(d.get("is_member_only")),
    }


def get_exam(conn: Any, exam_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute("SELECT * FROM jlpt_exams WHERE id = ?", (exam_id,)).fetchone()
    return dict(row) if row else None


def _resolve_exam_question_ids(conn: Any, exam: dict[str, Any], *, is_member: bool) -> list[str]:
    """Fixed set (jlpt_exam_questions) if present; else dynamically sample by
    level/section up to question_count (mock exams)."""
    fixed = conn.execute(
        "SELECT question_id FROM jlpt_exam_questions WHERE exam_id = ? ORDER BY sort_order",
        (exam["id"],),
    ).fetchall()
    if fixed:
        q_ids = [dict(r)["question_id"] for r in fixed]
        # 固定组卷是 admin 的明确题单：无音频听力题不剔除（剔了考卷就残了），
        # 只告警，等运营补音频或换题（B2-6）。
        try:
            placeholders = ",".join("?" * len(q_ids))
            row = conn.execute(
                f"SELECT COUNT(*) AS c FROM jlpt_questions WHERE id IN ({placeholders}) "
                f"AND NOT {_AUDIO_READY_SQL}",
                tuple(q_ids),
            ).fetchone()
            silent = int(dict(row)["c"] or 0)
            if silent:
                _log.warning(
                    "jlpt exam %s fixed question set contains %d listening question(s) without audio media",
                    exam.get("id"), silent,
                )
        except Exception:
            pass
        return q_ids
    count = _clamp(exam.get("question_count"), 20, 1, EXAM_DYNAMIC_MAX)
    where = ["level = ?", "status = 'published'", "review_status = 'approved'", _AUDIO_READY_SQL]
    params: list[Any] = [exam.get("level") or "N5"]
    section = normalize_section(exam.get("section"))
    if section:
        where.append("section = ?")
        params.append(section)
    if not is_member:
        where.append("is_member_only = 0")
    params.append(count)
    rows = conn.execute(
        "SELECT id FROM jlpt_questions WHERE " + " AND ".join(where) +
        " ORDER BY RANDOM() LIMIT ?",
        tuple(params),
    ).fetchall()
    return [dict(r)["id"] for r in rows]


def start_exam_session(
    conn: Any, *, user_id: str, exam: dict[str, Any], is_member: bool, now: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Create an in-progress session with a resolved question list; returns the
    session + answer-hidden questions. None if the exam has no usable questions.

    Resume (B15-D): if the user already has an un-submitted session for this exam
    that hasn't run out of time (server clock is authoritative: started_at +
    exam duration), that session is returned instead of a fresh one — with
    ``resumed: true``, the previously saved ``answers`` and the server-computed
    ``remainingSeconds`` — so a killed/relaunched client continues instead of
    silently restarting with a full clock. A stale session that IS past its
    deadline is finalized through the existing submit path (graded on whatever
    was answered, clocked at the deadline) before a new session is created —
    no new status value is introduced."""
    now = _iso(now)
    duration = int(exam.get("duration_seconds") or 0)
    stale = conn.execute(
        "SELECT * FROM jlpt_exam_sessions WHERE user_id = ? AND exam_id = ? "
        "AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1",
        (user_id, exam["id"]),
    ).fetchone()
    if stale:
        session = dict(stale)
        elapsed = _seconds_between(session.get("started_at") or now, now)
        if duration <= 0 or elapsed < duration:
            return _resume_exam_payload(
                conn, session=session, exam=exam,
                remaining=(max(0, duration - elapsed) if duration > 0 else 0),
            )
        # Timed out un-submitted: settle it with the existing semantics (grade
        # the answers saved so far; duration clamps to the exam limit).
        submit_exam_session(conn, session=session, exam=exam,
                            now=_add_seconds_iso(session.get("started_at") or now, duration))
    q_ids = _resolve_exam_question_ids(conn, exam, is_member=is_member)
    if not q_ids:
        return None
    session_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO jlpt_exam_sessions (id, user_id, exam_id, level, status, started_at, "
        "submitted_at, duration_seconds, total, correct, score, passed, question_ids_json) "
        "VALUES (?, ?, ?, ?, 'in_progress', ?, '', 0, ?, 0, 0, 0, ?)",
        (session_id, user_id, exam["id"], exam.get("level") or "", now, len(q_ids),
         json.dumps(q_ids)),
    )
    questions = _questions_by_ids(conn, q_ids, reveal_answer=False)
    return {
        "sessionId": session_id,
        "examId": exam["id"],
        "level": exam.get("level") or "",
        "title": exam.get("title") or "",
        "durationSeconds": int(exam.get("duration_seconds") or 0),
        "passScore": int(exam.get("pass_score") or 60),
        "total": len(q_ids),
        "questions": questions,
        "resumed": False,
    }


def _resume_exam_payload(
    conn: Any, *, session: dict[str, Any], exam: dict[str, Any], remaining: int,
) -> dict[str, Any]:
    """Same shape as a fresh start (old clients keep working — they just ignore
    the extra keys) + the resume overlay. Only questionId/selectedIndex of the
    saved answers are exposed: is_correct would leak grading mid-exam."""
    q_ids = _loads_json_list(session.get("question_ids_json"))
    known = set(q_ids)
    ans_rows = conn.execute(
        "SELECT question_id, selected_index FROM jlpt_exam_answers WHERE session_id = ?",
        (session["id"],),
    ).fetchall()
    answers = [
        {"questionId": d["question_id"], "selectedIndex": int(d["selected_index"])}
        for d in (dict(r) for r in ans_rows)
        if d["question_id"] in known
    ]
    return {
        "sessionId": session["id"],
        "examId": exam["id"],
        "level": session.get("level") or exam.get("level") or "",
        "title": exam.get("title") or "",
        "durationSeconds": int(exam.get("duration_seconds") or 0),
        "passScore": int(exam.get("pass_score") or 60),
        "total": len(q_ids),
        "questions": _questions_by_ids(conn, q_ids, reveal_answer=False),
        "resumed": True,
        "answers": answers,
        # Dual-key on purpose: camelCase matches this module's contract, the
        # snake_case twin keeps loosely-typed clients tolerant.
        "remainingSeconds": remaining,
        "remaining_seconds": remaining,
    }


def _questions_by_ids(conn: Any, q_ids: list[str], *, reveal_answer: bool) -> list[dict[str, Any]]:
    if not q_ids:
        return []
    placeholders = ",".join("?" * len(q_ids))
    rows = conn.execute(
        f"SELECT * FROM jlpt_questions WHERE id IN ({placeholders})", tuple(q_ids)
    ).fetchall()
    by_id = {dict(r)["id"]: dict(r) for r in rows}
    out = []
    for qid in q_ids:  # preserve exam order
        if qid in by_id:
            out.append(public_question(by_id[qid], reveal_answer=reveal_answer))
    return out


def get_session(conn: Any, *, session_id: str, user_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        "SELECT * FROM jlpt_exam_sessions WHERE id = ? AND user_id = ?", (session_id, user_id)
    ).fetchone()
    return dict(row) if row else None


def _exam_time_limit_seconds(conn: Any, session: dict[str, Any]) -> int:
    """Hard time limit (seconds) for a session's exam; 0 = untimed. Read from the
    exam row — the session row's ``duration_seconds`` stores the ELAPSED time
    (filled at submit), NOT the limit, so the limit must come from jlpt_exams."""
    exam_id = str(session.get("exam_id") or "")
    if not exam_id:
        return 0
    row = conn.execute(
        "SELECT duration_seconds FROM jlpt_exams WHERE id = ?", (exam_id,)
    ).fetchone()
    if not row:
        return 0
    try:
        return max(0, int(dict(row).get("duration_seconds") or 0))
    except (TypeError, ValueError):
        return 0


def _exam_session_expired(
    conn: Any, session: dict[str, Any], *, now: Optional[str] = None, grace: int = 0
) -> bool:
    """Whether the (server) wall clock is past started_at + time limit (+ grace).
    Untimed exams (limit 0) never expire. The client clock is never trusted."""
    limit = _exam_time_limit_seconds(conn, session)
    if limit <= 0:
        return False
    elapsed = _seconds_between(session.get("started_at") or _iso(now), _iso(now))
    return elapsed > limit + max(0, grace)


def save_exam_answer(
    conn: Any, *, session: dict[str, Any], question_id: str, selected_index: int,
    now: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Persist one in-progress exam answer (no grading revealed). Rejects if the
    question isn't in the session, the session is already submitted, OR the exam's
    server-authoritative time limit has elapsed — otherwise the countdown is a
    mere client-side suggestion that devtools/replay can ignore to keep answering
    an expired paper."""
    if (session.get("status") or "") != "in_progress":
        return None
    if _exam_session_expired(conn, session, now=now, grace=EXAM_SAVE_GRACE_SEC):
        return None
    q_ids = _loads_json_list(session.get("question_ids_json"))
    if question_id not in q_ids:
        return None
    q = get_question(conn, question_id)
    if not q:
        return None
    is_correct = 1 if int(selected_index) == int(q.get("answer_index") or 0) else 0
    conn.execute(
        "INSERT INTO jlpt_exam_answers (session_id, question_id, selected_index, is_correct) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(session_id, question_id) DO UPDATE SET selected_index = ?, is_correct = ?",
        (session["id"], question_id, int(selected_index), is_correct, int(selected_index), is_correct),
    )
    return {"saved": True, "questionId": question_id}


def submit_exam_session(
    conn: Any, *, session: dict[str, Any], exam: Optional[dict[str, Any]], now: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Grade + finalize a session. CAS on status (in_progress→submitted) so a
    double-submit can't re-score. Returns the graded result or None if the CAS
    lost (already submitted / expired)."""
    now = _iso(now)
    # CAS: only the request that flips in_progress→submitted proceeds to score.
    cur = conn.execute(
        "UPDATE jlpt_exam_sessions SET status = 'submitted', submitted_at = ? "
        "WHERE id = ? AND status = 'in_progress'",
        (now, session["id"]),
    )
    if getattr(cur, "rowcount", 0) != 1:
        return None
    q_ids = _loads_json_list(session.get("question_ids_json"))
    total = len(q_ids)
    ans_rows = conn.execute(
        "SELECT question_id, selected_index, is_correct FROM jlpt_exam_answers WHERE session_id = ?",
        (session["id"],),
    ).fetchall()
    answers = {dict(r)["question_id"]: dict(r) for r in ans_rows}
    correct = sum(1 for a in answers.values() if int(a["is_correct"]) == 1)
    score = int(round(correct / total * 100)) if total else 0
    pass_score = int((exam or {}).get("pass_score") or 60)
    passed = 1 if score >= pass_score else 0
    started = session.get("started_at") or now
    # Clamp the recorded time to the exam's hard limit. A session left
    # in_progress and submitted long after the buzzer would otherwise persist an
    # absurd elapsed time (and any post-deadline answers are already refused by
    # save_exam_answer), so the stored duration must never exceed the limit.
    elapsed = _seconds_between(started, now)
    time_limit = int((exam or {}).get("duration_seconds") or 0)
    duration = min(elapsed, time_limit) if time_limit > 0 else elapsed
    conn.execute(
        "UPDATE jlpt_exam_sessions SET total = ?, correct = ?, score = ?, passed = ?, "
        "duration_seconds = ? WHERE id = ?",
        (total, correct, score, passed, duration, session["id"]),
    )
    # Per-question breakdown with answers revealed (post-submit teaching).
    breakdown = []
    for q in _questions_by_ids(conn, q_ids, reveal_answer=True):
        a = answers.get(q["id"]) or {}
        breakdown.append({
            **q,
            "selectedIndex": int(a.get("selected_index", -1)) if a else -1,
            "correct": bool(a.get("is_correct")) if a else False,
        })
    return {
        "sessionId": session["id"],
        "total": total, "correct": correct, "score": score,
        "passed": bool(passed), "passScore": pass_score,
        "durationSeconds": duration,
        "questions": breakdown,
    }


def exam_history(conn: Any, *, user_id: str, level: str = "") -> list[dict[str, Any]]:
    level = normalize_level(level, default="")
    params: list[Any] = [user_id]
    clause = ""
    if level:
        clause = " AND s.level = ?"
        params.append(level)
    rows = conn.execute(
        "SELECT s.*, e.title AS exam_title, e.kind AS exam_kind FROM jlpt_exam_sessions s "
        "LEFT JOIN jlpt_exams e ON e.id = s.exam_id "
        "WHERE s.user_id = ? AND s.status = 'submitted'" + clause +
        " ORDER BY s.started_at DESC LIMIT 50",
        tuple(params),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "sessionId": d["id"], "examId": d.get("exam_id") or "",
            "title": d.get("exam_title") or "", "kind": d.get("exam_kind") or "",
            "level": d.get("level") or "",
            "total": int(d.get("total") or 0), "correct": int(d.get("correct") or 0),
            "score": int(d.get("score") or 0), "passed": bool(d.get("passed")),
            "durationSeconds": int(d.get("duration_seconds") or 0),
            "startedAt": d.get("started_at") or "", "submittedAt": d.get("submitted_at") or "",
        })
    return out


def session_review(conn: Any, *, session: dict[str, Any]) -> dict[str, Any]:
    """Full回看 of a (usually submitted) session with answers revealed."""
    q_ids = _loads_json_list(session.get("question_ids_json"))
    ans_rows = conn.execute(
        "SELECT question_id, selected_index, is_correct FROM jlpt_exam_answers WHERE session_id = ?",
        (session["id"],),
    ).fetchall()
    answers = {dict(r)["question_id"]: dict(r) for r in ans_rows}
    breakdown = []
    for q in _questions_by_ids(conn, q_ids, reveal_answer=True):
        a = answers.get(q["id"]) or {}
        breakdown.append({
            **q,
            "selectedIndex": int(a.get("selected_index", -1)) if a else -1,
            "correct": bool(a.get("is_correct")) if a else False,
        })
    return {
        "sessionId": session["id"], "examId": session.get("exam_id") or "",
        "level": session.get("level") or "", "status": session.get("status") or "",
        "total": int(session.get("total") or 0), "correct": int(session.get("correct") or 0),
        "score": int(session.get("score") or 0), "passed": bool(session.get("passed")),
        "durationSeconds": int(session.get("duration_seconds") or 0),
        "questions": breakdown,
    }


# ── vocab quiz (考单词在线考试) ──────────────────────────────────────────────

def build_vocab_quiz(
    conn: Any, *, user_id: str, level: str, deck_id: str = "", count: int = VOCAB_QUIZ_DEFAULT_COUNT,
    is_member: bool = False, now: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Generate a vocab multiple-choice quiz on the fly from the word bank
    (给日文选中文义; distractors = 3 random same-level meanings). Persisted as a
    kind='vocab' exam session WITHOUT touching the jlpt_questions bank — the
    generated questions live only in the returned payload; grading is done
    client-then-server via submit with an embedded answer key we store per
    session. We reuse the exam_sessions machinery for streak + history.

    Returns None if there aren't enough words to build even one question."""
    import random
    level = normalize_level(level)
    count = _clamp(count, VOCAB_QUIZ_DEFAULT_COUNT, 1, VOCAB_QUIZ_MAX_COUNT)
    now = _iso(now)

    if deck_id:
        # Enforce the SAME membership gate the deck-detail endpoint applies: a
        # member-only deck's words + meanings must not leak to a non-member via
        # the quiz (the quiz question面 exposes word + reading and the correct
        # 释义 as an option, and submit returns correctIndex — that would bypass
        # the "开通会员即可解锁全部单词与考单词测验" paywall). vocab_decks() lists
        # member decks (with isMemberOnly) to everyone, so the id is discoverable;
        # the gate has to live here, not just in the listing.
        deck_row = conn.execute(
            "SELECT is_member_only FROM jlpt_vocab_decks WHERE id = ? AND status = 'published'",
            (deck_id,),
        ).fetchone()
        if not deck_row:
            return None
        if bool(dict(deck_row).get("is_member_only")) and not is_member:
            raise APIError(
                "该词表为会员专属，开通会员即可解锁全部单词与「考单词」测验。",
                403, "MEMBER_REQUIRED", {"upgradeSuggested": True},
            )
        pool = conn.execute(
            "SELECT w.* FROM jlpt_vocab_words w JOIN jlpt_vocab_deck_words dw ON dw.word_id = w.id "
            "WHERE dw.deck_id = ? AND w.status = 'published'",
            (deck_id,),
        ).fetchall()
    else:
        pool = conn.execute(
            "SELECT * FROM jlpt_vocab_words WHERE level = ? AND status = 'published'",
            (level,),
        ).fetchall()
    words = [dict(w) for w in pool]
    if len(words) < 4:
        return None

    # Distractor pool = same level (broader than the deck) for realistic options.
    distractor_rows = conn.execute(
        "SELECT meaning_zh FROM jlpt_vocab_words WHERE level = ? AND status = 'published'",
        (level,),
    ).fetchall()
    all_meanings = [dict(r)["meaning_zh"] for r in distractor_rows if dict(r).get("meaning_zh")]

    random.shuffle(words)
    quiz_words = words[:count]
    questions: list[dict[str, Any]] = []
    answer_key: list[int] = []
    for w in quiz_words:
        correct_meaning = w.get("meaning_zh") or ""
        distractors = [m for m in all_meanings if m and m != correct_meaning]
        random.shuffle(distractors)
        options = distractors[:3] + [correct_meaning]
        options = list(dict.fromkeys(options))  # dedupe while keeping order
        while len(options) < 4 and distractors:
            extra = distractors.pop()
            if extra not in options:
                options.append(extra)
        random.shuffle(options)
        answer_index = options.index(correct_meaning)
        questions.append({
            "wordId": w["id"],
            "word": w.get("word") or "",
            "reading": w.get("reading") or "",
            "stem": f"「{w.get('word') or ''}」的意思是？",
            "choices": options,
            "answerIndex": answer_index,  # embedded so client can self-check; server also grades
        })
        answer_key.append(answer_index)

    session_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO jlpt_exam_sessions (id, user_id, exam_id, level, status, started_at, "
        "submitted_at, duration_seconds, total, correct, score, passed, question_ids_json) "
        "VALUES (?, ?, '', ?, 'in_progress', ?, '', 0, ?, 0, 0, 0, ?)",
        (session_id, user_id, level, now, len(questions),
         json.dumps({"kind": "vocab", "answerKey": answer_key,
                     "wordIds": [q["wordId"] for q in questions]})),
    )
    # Don't leak answerIndex in the live quiz payload — strip before returning.
    client_questions = [{k: v for k, v in q.items() if k != "answerIndex"} for q in questions]
    return {
        "sessionId": session_id, "level": level, "kind": "vocab",
        "total": len(questions), "questions": client_questions,
    }


def submit_vocab_quiz(
    conn: Any, *, session: dict[str, Any], answers: list[int], now: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Grade a vocab quiz session. `answers` is index-aligned to the questions
    returned by build_vocab_quiz. CAS on session status."""
    now = _iso(now)
    meta = _loads_json_obj(session.get("question_ids_json"))
    if not isinstance(meta, dict) or meta.get("kind") != "vocab":
        return None
    cur = conn.execute(
        "UPDATE jlpt_exam_sessions SET status = 'submitted', submitted_at = ? "
        "WHERE id = ? AND status = 'in_progress'",
        (now, session["id"]),
    )
    if getattr(cur, "rowcount", 0) != 1:
        return None
    key = meta.get("answerKey") or []
    total = len(key)
    correct = 0
    per: list[dict[str, Any]] = []
    for i, expected in enumerate(key):
        sel = int(answers[i]) if i < len(answers) else -1
        ok = 1 if sel == int(expected) else 0
        correct += ok
        per.append({"index": i, "selectedIndex": sel, "correctIndex": int(expected), "correct": bool(ok)})
    score = int(round(correct / total * 100)) if total else 0
    duration = _seconds_between(session.get("started_at") or now, now)
    conn.execute(
        "UPDATE jlpt_exam_sessions SET total = ?, correct = ?, score = ?, passed = ?, "
        "duration_seconds = ? WHERE id = ?",
        (total, correct, score, 1 if score >= 60 else 0, duration, session["id"]),
    )
    return {
        "sessionId": session["id"], "total": total, "correct": correct,
        "score": score, "passed": score >= 60, "durationSeconds": duration,
        "results": per,
    }


# ── admin import (供用户灌真题/词表) ─────────────────────────────────────────

def import_questions(conn: Any, items: list[dict[str, Any]], *, now: Optional[str] = None) -> dict[str, Any]:
    """Batch upsert questions from an admin JSON array. source defaults to
    'imported' (auditable provenance). Upsert key: caller-supplied id, else a
    new uuid (insert). Returns counts. Rows are validated defensively; a bad row
    is skipped, not fatal."""
    now = _iso(now)
    inserted = 0
    updated = 0
    skipped = 0
    for raw in items[:IMPORT_MAX_ROWS]:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        stem = str(raw.get("stem") or "").strip()
        choices = raw.get("choices")
        if isinstance(choices, str):
            choices = _loads_choices(choices)
        if not stem or not isinstance(choices, list) or len(choices) < 2:
            skipped += 1
            continue
        try:
            answer_index = int(raw.get("answerIndex", raw.get("answer_index", 0)))
        except (TypeError, ValueError):
            skipped += 1
            continue
        if not (0 <= answer_index < len(choices)):
            skipped += 1
            continue
        qid = str(raw.get("id") or "").strip()
        level = normalize_level(raw.get("level"), default="N5")
        section = normalize_section(raw.get("section"), default="vocab")
        row = (
            level, section,
            str(raw.get("questionType") or raw.get("question_type") or "single")[:32],
            stem[:4000],
            str(raw.get("passage") or "")[:8000],
            str(raw.get("audioMediaId") or raw.get("audio_media_id") or "")[:128],
            json.dumps([str(c) for c in choices][:8], ensure_ascii=False),
            answer_index,
            str(raw.get("explanation") or "")[:4000],
            _clamp(raw.get("difficulty"), 3, 1, 5),
            str(raw.get("tags") or "")[:256],
            1 if raw.get("isMemberOnly") or raw.get("is_member_only") else 0,
            str(raw.get("source") or "imported")[:32],
            str(raw.get("reviewStatus") or raw.get("review_status") or "approved")[:16],
            str(raw.get("status") or "published")[:16],
            _clamp(raw.get("sortOrder", raw.get("sort_order")), 0, 0, 10_000_000),
        )
        existing = conn.execute("SELECT id FROM jlpt_questions WHERE id = ?", (qid,)).fetchone() if qid else None
        if existing:
            conn.execute(
                "UPDATE jlpt_questions SET level=?, section=?, question_type=?, stem=?, passage=?, "
                "audio_media_id=?, choices_json=?, answer_index=?, explanation=?, difficulty=?, tags=?, "
                "is_member_only=?, source=?, review_status=?, status=?, sort_order=?, updated_at=? WHERE id=?",
                (*row, now, qid),
            )
            updated += 1
        else:
            new_id = qid or str(uuid.uuid4())
            conn.execute(
                "INSERT INTO jlpt_questions (id, level, section, question_type, stem, passage, "
                "audio_media_id, choices_json, answer_index, explanation, difficulty, tags, "
                "is_member_only, source, review_status, status, sort_order, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, *row, now, now),
            )
            inserted += 1
    return {"inserted": inserted, "updated": updated, "skipped": skipped,
            "total": inserted + updated}


def import_vocab(conn: Any, items: list[dict[str, Any]], *, now: Optional[str] = None) -> dict[str, Any]:
    """Batch upsert vocab words from an admin JSON array (source='imported')."""
    now = _iso(now)
    inserted = updated = skipped = 0
    for raw in items[:IMPORT_MAX_ROWS]:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        word = str(raw.get("word") or "").strip()
        meaning = str(raw.get("meaningZh") or raw.get("meaning_zh") or "").strip()
        if not word or not meaning:
            skipped += 1
            continue
        qid = str(raw.get("id") or "").strip()
        level = normalize_level(raw.get("level"), default="N5")
        row = (
            level, word[:128],
            str(raw.get("reading") or "")[:128],
            meaning[:512],
            str(raw.get("meaningEn") or raw.get("meaning_en") or "")[:512],
            str(raw.get("pos") or "")[:32],
            str(raw.get("example") or "")[:512],
            str(raw.get("exampleZh") or raw.get("example_zh") or "")[:512],
            str(raw.get("tags") or "")[:256],
            str(raw.get("source") or "imported")[:32],
            str(raw.get("status") or "published")[:16],
            _clamp(raw.get("sortOrder", raw.get("sort_order")), 0, 0, 10_000_000),
        )
        existing = conn.execute("SELECT id FROM jlpt_vocab_words WHERE id = ?", (qid,)).fetchone() if qid else None
        if existing:
            conn.execute(
                "UPDATE jlpt_vocab_words SET level=?, word=?, reading=?, meaning_zh=?, meaning_en=?, "
                "pos=?, example=?, example_zh=?, tags=?, source=?, status=?, sort_order=?, updated_at=? WHERE id=?",
                (*row, now, qid),
            )
            updated += 1
        else:
            new_id = qid or str(uuid.uuid4())
            conn.execute(
                "INSERT INTO jlpt_vocab_words (id, level, word, reading, meaning_zh, meaning_en, pos, "
                "example, example_zh, tags, source, status, sort_order, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, *row, now, now),
            )
            inserted += 1
    return {"inserted": inserted, "updated": updated, "skipped": skipped,
            "total": inserted + updated}


def upsert_exam_dates(conn: Any, items: list[dict[str, Any]], *, now: Optional[str] = None) -> dict[str, Any]:
    """Upsert exam calendar rows. Upsert key: caller id, else (region,
    session_label). Dates are official public schedule — plain dates only."""
    written = 0
    skipped = 0
    for raw in items[:IMPORT_MAX_ROWS]:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        exam_date = str(raw.get("examDate") or raw.get("exam_date") or "").strip()
        session_label = str(raw.get("sessionLabel") or raw.get("session_label") or "").strip()
        if not exam_date and not session_label:
            skipped += 1
            continue
        region = (str(raw.get("region") or "jp").strip().lower()) or "jp"
        vals = (
            region, session_label, exam_date,
            str(raw.get("regOpenDate") or raw.get("reg_open_date") or "")[:32],
            str(raw.get("regCloseDate") or raw.get("reg_close_date") or "")[:32],
            str(raw.get("note") or "")[:512],
            str(raw.get("status") or "published")[:16],
        )
        rid = str(raw.get("id") or "").strip()
        existing = None
        if rid:
            existing = conn.execute("SELECT id FROM jlpt_exam_dates WHERE id = ?", (rid,)).fetchone()
        if not existing and session_label:
            existing = conn.execute(
                "SELECT id FROM jlpt_exam_dates WHERE region = ? AND session_label = ?",
                (region, session_label),
            ).fetchone()
        if existing:
            conn.execute(
                "UPDATE jlpt_exam_dates SET region=?, session_label=?, exam_date=?, reg_open_date=?, "
                "reg_close_date=?, note=?, status=? WHERE id=?",
                (*vals, dict(existing)["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO jlpt_exam_dates (id, region, session_label, exam_date, reg_open_date, "
                "reg_close_date, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (rid or str(uuid.uuid4()), *vals),
            )
        written += 1
    return {"written": written, "skipped": skipped}


def upsert_deck(conn: Any, deck: dict[str, Any], *, now: Optional[str] = None) -> dict[str, Any]:
    """Create/replace a vocab deck and its word membership. word_ids is an
    ordered list of jlpt_vocab_words.id. Recomputes word_count."""
    now = _iso(now)
    deck_id = str(deck.get("id") or "").strip() or str(uuid.uuid4())
    level = normalize_level(deck.get("level"), default="N5")
    title = str(deck.get("title") or "").strip()[:256]
    description = str(deck.get("description") or "")[:1024]
    is_member_only = 1 if deck.get("isMemberOnly") or deck.get("is_member_only") else 0
    sort_order = _clamp(deck.get("sortOrder", deck.get("sort_order")), 0, 0, 10_000_000)
    word_ids = [str(w) for w in (deck.get("wordIds") or deck.get("word_ids") or []) if str(w).strip()]
    exists = conn.execute("SELECT id FROM jlpt_vocab_decks WHERE id = ?", (deck_id,)).fetchone()
    if exists:
        conn.execute(
            "UPDATE jlpt_vocab_decks SET level=?, title=?, description=?, word_count=?, "
            "is_member_only=?, sort_order=?, status='published' WHERE id=?",
            (level, title, description, len(word_ids), is_member_only, sort_order, deck_id),
        )
    else:
        conn.execute(
            "INSERT INTO jlpt_vocab_decks (id, level, title, description, word_count, is_member_only, "
            "sort_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)",
            (deck_id, level, title, description, len(word_ids), is_member_only, sort_order, now),
        )
    conn.execute("DELETE FROM jlpt_vocab_deck_words WHERE deck_id = ?", (deck_id,))
    for i, wid in enumerate(word_ids):
        conn.execute(
            "INSERT INTO jlpt_vocab_deck_words (deck_id, word_id, sort_order) VALUES (?, ?, ?) "
            "ON CONFLICT(deck_id, word_id) DO UPDATE SET sort_order = ?",
            (deck_id, wid, i, i),
        )
    return {"deckId": deck_id, "wordCount": len(word_ids)}


def upsert_exam(conn: Any, exam: dict[str, Any], *, now: Optional[str] = None) -> dict[str, Any]:
    """Create/replace an online exam (jlpt_exams row) and, if ``questionIds`` is
    supplied, its fixed question set (jlpt_exam_questions). An exam with NO fixed
    questions stays dynamic — start_exam_session samples the bank at start time
    (see _resolve_exam_question_ids). When a fixed list is given, question_count
    is derived from it; otherwise the caller's questionCount governs sampling.
    Upsert key: caller id, else a new uuid. Idempotent membership replacement."""
    now = _iso(now)
    exam_id = str(exam.get("id") or "").strip() or str(uuid.uuid4())
    level = normalize_level(exam.get("level"), default="N5")
    title = str(exam.get("title") or "").strip()[:256]
    kind = str(exam.get("kind") or "mock").strip().lower()
    if kind not in ("mock", "section", "vocab"):
        kind = "mock"
    section = normalize_section(exam.get("section"))
    duration = _clamp(exam.get("durationSeconds", exam.get("duration_seconds")), 0, 0, 24 * 3600)
    pass_score = _clamp(exam.get("passScore", exam.get("pass_score")), 60, 0, 100)
    is_member_only = 1 if exam.get("isMemberOnly") or exam.get("is_member_only") else 0
    status = str(exam.get("status") or "published").strip().lower()[:16] or "published"
    sort_order = _clamp(exam.get("sortOrder", exam.get("sort_order")), 0, 0, 10_000_000)

    raw_qids = exam.get("questionIds") or exam.get("question_ids") or []
    question_ids = [str(q).strip() for q in raw_qids if str(q).strip()] if isinstance(raw_qids, list) else []
    # Fixed set → count is its length; else honor a caller-supplied count (for
    # dynamic mocks), clamped to a sane sampling ceiling.
    if question_ids:
        question_count = len(question_ids)
    else:
        question_count = _clamp(exam.get("questionCount", exam.get("question_count")), 20, 1, EXAM_DYNAMIC_MAX)

    row = (level, title, kind, section, question_count, duration, pass_score,
           is_member_only, status, sort_order)
    exists = conn.execute("SELECT id FROM jlpt_exams WHERE id = ?", (exam_id,)).fetchone()
    if exists:
        conn.execute(
            "UPDATE jlpt_exams SET level=?, title=?, kind=?, section=?, question_count=?, "
            "duration_seconds=?, pass_score=?, is_member_only=?, status=?, sort_order=? WHERE id=?",
            (*row, exam_id),
        )
    else:
        conn.execute(
            "INSERT INTO jlpt_exams (id, level, title, kind, section, question_count, duration_seconds, "
            "pass_score, is_member_only, status, sort_order, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (exam_id, *row, now),
        )
    # Replace the fixed membership only when the caller supplied a list. Passing
    # an empty/absent list clears any fixed set → the exam falls back to dynamic.
    if isinstance(raw_qids, list):
        conn.execute("DELETE FROM jlpt_exam_questions WHERE exam_id = ?", (exam_id,))
        for i, qid in enumerate(question_ids):
            conn.execute(
                "INSERT INTO jlpt_exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?) "
                "ON CONFLICT(exam_id, question_id) DO UPDATE SET sort_order = ?",
                (exam_id, qid, i, i),
            )
    return {"examId": exam_id, "kind": kind, "questionCount": question_count,
            "fixed": bool(question_ids)}


# ── zone summary fields (for api_guide_jlpt_zone) ────────────────────────────

def zone_dynamic_fields(conn: Any, *, user_id: Optional[str], region: str = "jp",
                        now: Optional[str] = None) -> dict[str, Any]:
    """Cheap counts + (per-user) streak + exam countdown to drive the new JLPT
    zone entries. Called from the (public, cached) zone handler; the per-user
    streak is only computed when a user is present (so it stays out of the cache
    key when signed out)."""
    has_questions = int(dict(conn.execute(
        "SELECT COUNT(*) AS c FROM jlpt_questions WHERE status = 'published' AND review_status = 'approved'"
    ).fetchone())["c"]) > 0
    has_vocab = int(dict(conn.execute(
        "SELECT COUNT(*) AS c FROM jlpt_vocab_decks WHERE status = 'published'"
    ).fetchone())["c"]) > 0
    has_exams = int(dict(conn.execute(
        "SELECT COUNT(*) AS c FROM jlpt_exams WHERE status = 'published'"
    ).fetchone())["c"]) > 0
    out: dict[str, Any] = {
        "hasPractice": has_questions,
        "hasPlacement": has_questions,
        "hasVocab": has_vocab,
        "hasExams": has_exams,
        "examCountdown": next_exam_countdown(conn, region=region, now=now),
    }
    if user_id:
        out["streak"] = streak(conn, user_id=user_id, now=now)
    return out


# ── json helpers ─────────────────────────────────────────────────────────────

def _loads_json_list(raw: Any) -> list[str]:
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if isinstance(data, list):
        return [str(x) for x in data]
    return []


def _loads_json_obj(raw: Any) -> Any:
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None


def _add_seconds_iso(start_iso: str, seconds: int) -> str:
    """start_iso + N seconds, as ISO — the exam deadline for timeout settling.
    Falls back to 'now' when the stored timestamp is unparsable."""
    try:
        s = datetime.fromisoformat(str(start_iso).replace("Z", "+00:00"))
        if s.tzinfo is None:
            s = s.replace(tzinfo=timezone.utc)
        return (s + timedelta(seconds=max(0, int(seconds)))).isoformat()
    except Exception:
        return _iso(None)


def _seconds_between(start_iso: str, end_iso: str) -> int:
    try:
        s = datetime.fromisoformat(str(start_iso).replace("Z", "+00:00"))
        e = datetime.fromisoformat(str(end_iso).replace("Z", "+00:00"))
        if s.tzinfo is None:
            s = s.replace(tzinfo=timezone.utc)
        if e.tzinfo is None:
            e = e.replace(tzinfo=timezone.utc)
        return max(0, int((e - s).total_seconds()))
    except Exception:
        return 0
