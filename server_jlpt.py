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
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from server_errors import APIError

_log = logging.getLogger("kaix.error")

# ── constants ──────────────────────────────────────────────────────────────

LEVELS: tuple[str, ...] = ("N5", "N4", "N3", "N2", "N1")
SECTIONS: tuple[str, ...] = ("vocab", "grammar", "reading", "listening")
MOCK_V1_COIN_COSTS: dict[str, int] = {
    "N5": 100,
    "N4": 150,
    "N3": 250,
    "N2": 350,
    "N1": 400,
}
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
# The authoritative server deadline has zero scoring grace. Network tolerance
# is provided by idempotent retries made before the boundary, never by accepting
# an answer after the exam has ended.
EXAM_SAVE_GRACE_SEC = 0
_ANSWER_SNAPSHOT_UNSET = object()

# ── JLPT 标准出分（全真模考）─────────────────────────────────────────────────
# 依照官方计分结构（2010 年改定后）：N1-N3 笔试两科（言語知識〈文字・語彙・文法〉
# 0-60 / 読解 0-60），N4·N5 笔试合并一科（言語知識・読解 0-120）。聴解(0-60)
# 暂未提供音频，因此判定为「笔试参考判定」：各科须过基准点（19/60，合并科
# 38/120），笔试合计须达到官方合格线按笔试满分占比 (120/180) 折算后的参考线
# （进一法取整）。正式合格与否以含聴解的官方考试为准 —— 客户端展示时必须带
# note 里的免责说明。raw→scaled 用线性映射（非官方 IRT 等化，命名上只称
# 「参考」，不宣称与官方分数可比）。
SCORE_MODES = ("percent", "jlpt_scaled")
_JLPT_WRITTEN_SCALES_SPLIT = [
    ("language", "言語知識（文字・語彙・文法）", ("vocab", "grammar"), 60, 19),
    ("reading", "読解", ("reading",), 60, 19),
]
_JLPT_WRITTEN_SCALES_COMBINED = [
    ("language_reading", "言語知識・読解", ("vocab", "grammar", "reading"), 120, 38),
]
JLPT_SCALED_CONFIG: dict[str, dict[str, Any]] = {
    "N1": {"passTotal180": 100, "scales": _JLPT_WRITTEN_SCALES_SPLIT},
    "N2": {"passTotal180": 90, "scales": _JLPT_WRITTEN_SCALES_SPLIT},
    "N3": {"passTotal180": 95, "scales": _JLPT_WRITTEN_SCALES_SPLIT},
    "N4": {"passTotal180": 90, "scales": _JLPT_WRITTEN_SCALES_COMBINED},
    "N5": {"passTotal180": 80, "scales": _JLPT_WRITTEN_SCALES_COMBINED},
}
_JLPT_SCALED_NOTE = (
    "按 JLPT 官方计分结构折算的笔试参考分（不含聴解）。正式考试的合格判定"
    "以官方成绩为准，此处仅供备考参考。"
)
_JLPT_PAPER_SCORE_NOTE = (
    "按 JLPT 官方得分区分折算的参考分；正式考试采用等化后的尺度分，Machi 的"
    "线性折算仅供备考复盘，请以官方成绩为准。"
)


def normalize_score_mode(raw: Any) -> str:
    mode = str(raw or "").strip().lower()
    return mode if mode in SCORE_MODES else "percent"


def compute_scaled_result(
    conn: Any, *, level: str, q_ids: list[str], answers: dict[str, dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """JLPT 缩放分（笔试参考）。answers: question_id → jlpt_exam_answers row
    (dict, 含 is_correct)。返回 None 表示该级别无缩放配置或卷面为空。"""
    if not q_ids:
        return None
    placeholders = ",".join("?" * len(q_ids))
    rows = conn.execute(
        f"SELECT id, section FROM jlpt_questions WHERE id IN ({placeholders})",
        tuple(q_ids),
    ).fetchall()
    sec_by_id = {dict(r)["id"]: (dict(r).get("section") or "vocab") for r in rows}
    return compute_scaled_result_from_questions(
        level=level,
        questions=[
            {
                "id": qid,
                "section": sec_by_id.get(qid) or "vocab",
                "correct": bool(int((answers.get(qid) or {}).get("is_correct") or 0)),
            }
            for qid in q_ids
        ],
    )


def compute_scaled_result_from_questions(
    *, level: str, questions: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Pure written-score aggregation from immutable question result records."""
    normalized_level = normalize_level(level, default="")
    cfg = JLPT_SCALED_CONFIG.get(normalized_level)
    if not cfg or not questions:
        return None
    by_id = {
        str(question.get("id") or ""): question
        for question in questions
        if str(question.get("id") or "")
    }
    scales: list[dict[str, Any]] = []
    total_scaled = 0
    written_max = 0
    all_min_ok = True
    for key, label, sections, scale_max, scale_min in cfg["scales"]:
        division_questions = [
            question
            for question in by_id.values()
            if str(question.get("section") or "vocab") in sections
        ]
        raw_max = len(division_questions)
        raw = sum(
            1 for question in division_questions if bool(question.get("correct"))
        )
        # 四舍五入用整数运算实现 ROUND_HALF_UP,不能用内建 round():后者是银行家
        # 舍入(round-half-to-even),恰好落在 .5 的分数一半进一半舍 —— 同一科内
        # 规则自相矛盾,且能翻转合格判定(实例:読解 rawMax=16 时 raw=6 → 22.5,
        # 银行家舍入得 22,考生总分 59 < N2 参考线 60 判不合格,进一法得 23 → 60
        # 合格)。合格线本身(下方 pass_line)也是整数进一法,两处必须同规则同精度。
        scaled = (raw * scale_max * 2 + raw_max) // (raw_max * 2) if raw_max else 0
        passed_min = raw_max > 0 and scaled >= scale_min
        all_min_ok = all_min_ok and passed_min
        total_scaled += scaled
        written_max += scale_max
        scales.append({
            "key": key, "label": label,
            "raw": raw, "rawMax": raw_max,
            "scaled": scaled, "scaledMax": scale_max,
            "sectionMin": scale_min, "passed": passed_min,
        })
    if written_max <= 0:
        return None
    pass_total = int(cfg["passTotal180"])
    pass_line = (pass_total * written_max + 179) // 180  # ceil(passTotal*max/180)
    return {
        "mode": "jlpt_scaled",
        "level": normalized_level,
        "writtenTotal": total_scaled,
        "writtenMax": written_max,
        "passLineWritten": pass_line,
        "passedWrittenReference": bool(all_min_ok and total_scaled >= pass_line),
        "scales": scales,
        "officialPassTotal": pass_total,
        "officialTotalMax": 180,
        "note": _JLPT_SCALED_NOTE,
    }


def compute_official_paper_score(
    *, level: str, questions: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Aggregate exam sections into official score divisions (reference scale).

    Exam-section timing and score divisions are intentionally different for
    N3-N5. The immutable question ``section`` category is therefore the source
    of truth, not the number or title of timed child sessions.
    """
    written = compute_scaled_result_from_questions(level=level, questions=questions)
    if not written:
        return None
    listening_questions = [
        question
        for question in questions
        if str(question.get("section") or "") == "listening"
    ]
    listening_raw_max = len(listening_questions)
    listening_raw = sum(
        1 for question in listening_questions if bool(question.get("correct"))
    )
    listening_scaled = (
        (listening_raw * 60 * 2 + listening_raw_max) // (listening_raw_max * 2)
        if listening_raw_max
        else 0
    )
    listening_division = {
        "key": "listening",
        "label": "聴解",
        "raw": listening_raw,
        "rawMax": listening_raw_max,
        "scaled": listening_scaled,
        "scaledMax": 60,
        "sectionMin": 19,
        "passed": bool(listening_raw_max and listening_scaled >= 19),
    }
    total = int(written["writtenTotal"]) + listening_scaled
    pass_line = int(written["officialPassTotal"])
    divisions = [*written["scales"], listening_division]
    return {
        "mode": "jlpt_scaled_reference",
        "level": written["level"],
        "total": total,
        "totalMax": 180,
        "passLine": pass_line,
        "passedReference": bool(
            total >= pass_line and all(bool(item["passed"]) for item in divisions)
        ),
        "divisions": divisions,
        "note": _JLPT_PAPER_SCORE_NOTE,
    }

_VALID_SOURCE_KINDS = ("practice", "placement", "review", "exam", "vocab")
_VALID_VOCAB_STATES = ("learning", "mastered")

# 听力题没有音频媒体时只剩「（音声）…」这类文字占位，混进练习/定级/动态模考
# 严重损伤专业感（B2-6）。动态抽题一律排除；固定组卷（admin 明确指定的题单）
# 保留但记告警，绝不因此炸掉一场考试。
_AUDIO_READY_SQL = "(section <> 'listening' OR COALESCE(audio_media_id, '') <> '')"

# 取题时 LEFT JOIN media 把听力音频的可播放 url 一并带出(键 audio_url)。裸 media
# id 客户端无从解析,这是唯一的解析入口。media 表是服务端规范媒体存储(base DDL),
# 生产/开发库恒有;单测需自建同名表。WHERE 里凡与 media 同名的列(仅 id)必须限定
# 表名 jlpt_questions.id,否则 SQLite 报 ambiguous column。
_Q_WITH_AUDIO = (
    "jlpt_questions.*, media.url AS audio_url "
    "FROM jlpt_questions LEFT JOIN media "
    "ON media.id = jlpt_questions.audio_media_id AND media.deleted_at IS NULL"
)


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


def _parse_coin_cost(value: Any) -> int:
    """Parse an explicitly supplied JSON price without coercing bad input.

    JSON booleans are Python ``int`` subclasses, and the standard decoder can
    accept non-standard NaN/Infinity tokens, so both need explicit rejection.
    Prices are whole Machi coins; integral finite floats remain valid JSON
    numbers, while strings and fractional values are not silently truncated.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("coinCost must be a finite whole number between 0 and 100000")
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        raise ValueError("coinCost must be a finite whole number between 0 and 100000")
    parsed = int(value)
    if not 0 <= parsed <= 100_000:
        raise ValueError("coinCost must be a finite whole number between 0 and 100000")
    return parsed


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
        # 听力音频的可播放 URL。裸 media id 客户端无从解析,故在取数处 LEFT JOIN
        # media 表把 url 带进 row(键 audio_url);未 join 的路径(如定级只考词汇
        # 语法)自然为空字符串,客户端据此决定是否渲染播放器。相对 /media/... 由
        # 各端自行拼 base(web 走 Next rewrite、iOS 走 kaixMediaURL)。
        "audioUrl": d.get("audio_url") or "",
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
        where.append(f"jlpt_questions.id NOT IN ({placeholders})")
        params.extend(exclude_ids)

    sql = (
        "SELECT " + _Q_WITH_AUDIO + " WHERE " + " AND ".join(where)
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
        "SELECT q.*, m.url AS audio_url FROM jlpt_questions q "
        "LEFT JOIN media m ON m.id = q.audio_media_id AND m.deleted_at IS NULL "
        "JOIN ("
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
    # 只抽词汇/语法(秒答型):读解长文一题就要几分钟,会毁掉「30 秒定级」的
    # 承诺;读解水平交给全真模考的分科出分去衡量。
    per_level = max(1, PLACEMENT_QUESTION_COUNT // len(LEVELS)) + 1
    for lvl in LEVELS:
        rows = conn.execute(
            "SELECT * FROM jlpt_questions WHERE level = ? AND status = 'published' "
            "AND review_status = 'approved' AND section IN ('vocab', 'grammar') "
            "AND " + _AUDIO_READY_SQL + member_clause +
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
    # 目录里只出现「可开考的顶层单元」：独立 mock 卷 + 分科整卷的父卷(paper)。
    # 子科目(kind='section', parent_exam_id 非空)不单列——它们随父卷顺序推进。
    clauses = ["status = 'published'", "COALESCE(parent_exam_id, '') = ''", "kind <> 'section'"]
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
    out = []
    for r in rows:
        d = dict(r)
        pub = _public_exam(d)
        # 父卷把子科目的题量/时长/币价聚合上来，目录卡直接显示「總 XX 題 · YY 分 · N 币」。
        if pub["isPaper"]:
            secs = _paper_sections_rows(conn, d["id"], is_member=is_member)
            pub["sectionCount"] = len(secs)
            pub["questionCount"] = sum(int(s.get("question_count") or 0) for s in secs)
            pub["durationSeconds"] = sum(int(s.get("duration_seconds") or 0) for s in secs)
            paper_cost = sum(int(s.get("coin_cost") or 0) for s in secs)
            pub["coinCost"] = paper_cost
            pub["coinCostMember"] = member_coin_cost(paper_cost)
        out.append(pub)
    return out


def member_coin_cost(base: int) -> int:
    """会员价:5 折(向下取整)。base<=0 时免费不变。"""
    b = int(base or 0)
    return b // 2 if b > 0 else 0


def _public_exam(d: dict[str, Any]) -> dict[str, Any]:
    kind = d.get("kind") or "mock"
    base_cost = int(d.get("coin_cost") or 0)
    return {
        "id": d["id"], "level": d.get("level") or "",
        "title": d.get("title") or "", "kind": kind,
        "section": d.get("section") or "",
        "sectionLabel": SECTION_LABELS_ZH.get(d.get("section") or "", ""),
        "questionCount": int(d.get("question_count") or 0),
        "durationSeconds": int(d.get("duration_seconds") or 0),
        "passScore": int(d.get("pass_score") or 60),
        "isMemberOnly": bool(d.get("is_member_only")),
        "scoreMode": normalize_score_mode(d.get("score_mode")),
        "parentExamId": d.get("parent_exam_id") or "",
        "sortOrder": int(d.get("sort_order") or 0),
        "isPaper": kind == "paper",
        "isSection": kind == "section",
        # 开考消耗的 Machi 币(0=免费)。会员价 5 折;客户端两者都显示。
        "coinCost": base_cost,
        "coinCostMember": member_coin_cost(base_cost),
    }


def exam_session_can_resume(
    session: dict[str, Any], exam: dict[str, Any], *, now: Optional[str] = None,
) -> bool:
    """Use the same server-clock rule for start, preflight and idempotent replay."""
    if str(session.get("status") or "") != "in_progress":
        return False
    duration = int(exam.get("duration_seconds") or 0)
    if duration <= 0:
        return True
    elapsed = _seconds_between(session.get("started_at") or _iso(now), _iso(now))
    return elapsed < duration


def has_resumable_exam_session(
    conn: Any,
    *,
    user_id: str,
    exam: dict[str, Any],
    now: Optional[str] = None,
    paper_attempt_id: Optional[str] = None,
) -> bool:
    """该用户对这张 exam 是否有「未过期的 in_progress 会话」(即开考会走续考、不该
    再扣币)。判据与 start_exam_session 的续考逻辑一致:in_progress 且未超时限。"""
    paper_clause = ""
    params: list[Any] = [user_id, exam["id"]]
    if paper_attempt_id is not None:
        paper_clause = " AND COALESCE(paper_attempt_id, '') = ?"
        params.append(str(paper_attempt_id or ""))
    row = conn.execute(
        "SELECT * FROM jlpt_exam_sessions WHERE user_id = ? AND exam_id = ? "
        "AND status = 'in_progress'" + paper_clause +
        " ORDER BY started_at DESC LIMIT 1",
        tuple(params),
    ).fetchone()
    if not row:
        return False
    return exam_session_can_resume(dict(row), exam, now=now)


def get_exam(conn: Any, exam_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute("SELECT * FROM jlpt_exams WHERE id = ?", (exam_id,)).fetchone()
    return dict(row) if row else None


def _paper_sections_rows(conn: Any, paper_id: str, *, is_member: bool) -> list[dict[str, Any]]:
    """父卷下按顺序排列的子科目原始行(供聚合/组卷)。非会员不含会员专属子科目。"""
    clauses = ["parent_exam_id = ?", "status = 'published'", "kind = 'section'"]
    params: list[Any] = [paper_id]
    if not is_member:
        clauses.append("is_member_only = 0")
    rows = conn.execute(
        "SELECT * FROM jlpt_exams WHERE " + " AND ".join(clauses) + " ORDER BY sort_order",
        tuple(params),
    ).fetchall()
    return [dict(r) for r in rows]


def list_paper_sections(conn: Any, paper_id: str, *, is_member: bool = False) -> Optional[dict[str, Any]]:
    """分科整卷详情：父卷 + 有序子科目(公开壳,题量/时限/出分模式)。父卷不存在
    或不是 paper 时返回 None。客户端据此逐段调用既有 /exam/start。"""
    paper = get_exam(conn, paper_id)
    if not paper or (paper.get("kind") or "") != "paper" or (paper.get("status") or "") != "published":
        return None
    secs = [_public_exam(r) for r in _paper_sections_rows(conn, paper_id, is_member=is_member)]
    return {"paper": _public_exam(paper), "sections": secs}


def paper_result(
    conn: Any,
    *,
    user_id: str,
    paper_id: str,
    paper_attempt_id: str = "",
) -> Optional[dict[str, Any]]:
    """聚合一次明确父卷 attempt 的成绩，不跨 attempt 拼接子科目。

    默认优先最近已完成 attempt；若从未完成，则展示当前 attempt 的进度。旧数据只
    在完全没有父 attempt 时按未绑定会话回退。submit_exam_session 保持逐段不变。
    """
    paper = get_exam(conn, paper_id)
    if not paper or (paper.get("kind") or "") != "paper":
        return None
    sections = _paper_sections_rows(conn, paper_id, is_member=True)
    attempt = None
    if paper_attempt_id:
        attempt_row = conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE id=? AND user_id=? AND paper_exam_id=?",
            (paper_attempt_id, user_id, paper_id),
        ).fetchone()
        if not attempt_row:
            return None
        attempt = dict(attempt_row)
    else:
        # Results default to the latest completed full-paper attempt. An active
        # newer retry must never make us combine its written section with an
        # older attempt's listening section. If none completed, expose the
        # current exact attempt as an incomplete progress result.
        attempt_row = conn.execute(
            "SELECT * FROM jlpt_paper_attempts WHERE user_id=? AND paper_exam_id=? "
            "ORDER BY CASE WHEN status='completed' THEN 0 ELSE 1 END, "
            "CASE WHEN completed_at<>'' THEN completed_at ELSE started_at END DESC LIMIT 1",
            (user_id, paper_id),
        ).fetchone()
        attempt = dict(attempt_row) if attempt_row else None
    session_ids_by_exam: dict[str, str] = {}
    if attempt:
        for row in conn.execute(
            "SELECT section_exam_id, session_id FROM jlpt_paper_section_attempts "
            "WHERE paper_attempt_id=?",
            (attempt["id"],),
        ).fetchall():
            session_ids_by_exam[str(row["section_exam_id"] or "")] = str(
                row["session_id"] or ""
            )
    out_sections = []
    result_questions: list[dict[str, Any]] = []
    listening_correct = 0
    listening_total = 0
    all_submitted = True
    for sec in sections:
        linked_session_id = session_ids_by_exam.get(str(sec["id"]), "")
        if attempt:
            row = (
                conn.execute(
                    "SELECT * FROM jlpt_exam_sessions WHERE id=? AND user_id=? "
                    "AND exam_id=? AND paper_attempt_id=? AND status='submitted'",
                    (linked_session_id, user_id, sec["id"], attempt["id"]),
                ).fetchone()
                if linked_session_id
                else None
            )
        else:
            # Legacy fallback for sessions created before parent attempts were
            # introduced. Never mix it with tracked attempt rows.
            row = conn.execute(
                "SELECT * FROM jlpt_exam_sessions WHERE user_id = ? AND exam_id = ? "
                "AND status = 'submitted' AND COALESCE(paper_attempt_id, '')='' "
                "ORDER BY submitted_at DESC LIMIT 1",
                (user_id, sec["id"]),
            ).fetchone()
        if not row:
            all_submitted = False
            out_sections.append({
                "examId": sec["id"], "section": sec.get("section") or "",
                "sectionLabel": SECTION_LABELS_ZH.get(sec.get("section") or "", ""),
                "title": sec.get("title") or "", "done": False,
            })
            continue
        s = dict(row)
        immutable_result = session_review(conn, session=s)
        scaled = immutable_result.get("scaled")
        immutable_questions = immutable_result.get("questions")
        if isinstance(immutable_questions, list):
            result_questions.extend(
                dict(question)
                for question in immutable_questions
                if isinstance(question, dict)
            )
        out_sections.append({
            "examId": sec["id"], "section": sec.get("section") or "",
            "sectionLabel": SECTION_LABELS_ZH.get(sec.get("section") or "", ""),
            "title": sec.get("title") or "", "done": True,
            "sessionId": s["id"],
            "total": int(s.get("total") or 0), "correct": int(s.get("correct") or 0),
            "score": int(s.get("score") or 0), "passed": bool(s.get("passed")),
            "durationSeconds": int(s.get("duration_seconds") or 0),
            "scaled": scaled,
        })
        if (sec.get("section") or "") == "listening":
            listening_correct += int(s.get("correct") or 0)
            listening_total += int(s.get("total") or 0)
    combined_scaled = compute_scaled_result_from_questions(
        level=paper.get("level") or "", questions=result_questions
    )
    listening = None
    if listening_total:
        listening_score = int(round(listening_correct / listening_total * 100))
        listening = {
            "score": listening_score,
            "correct": listening_correct,
            "total": listening_total,
            "passed": listening_score >= 60,
        }
    official_score = (
        compute_official_paper_score(
            level=paper.get("level") or "", questions=result_questions
        )
        if all_submitted
        else None
    )
    return {
        "paperId": paper_id, "level": paper.get("level") or "",
        "title": paper.get("title") or "",
        "paperAttemptId": str((attempt or {}).get("id") or ""),
        "paperAttemptStatus": str((attempt or {}).get("status") or "legacy"),
        "complete": all_submitted,
        "sections": out_sections,
        "scaled": combined_scaled,      # 跨全部笔试考试段按题目 category 聚合
        "listening": listening,          # 兼容旧客户端的聴解百分比
        "officialScore": official_score, # 正确的 3 个得分区分（N4/N5 笔试合并）
    }


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
    conn: Any,
    *,
    user_id: str,
    exam: dict[str, Any],
    is_member: bool,
    now: Optional[str] = None,
    paper_attempt_id: str = "",
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
        "AND status = 'in_progress' AND COALESCE(paper_attempt_id, '') = ? "
        "ORDER BY started_at DESC LIMIT 1",
        (user_id, exam["id"], str(paper_attempt_id or "")),
    ).fetchone()
    if stale:
        session = dict(stale)
        elapsed = _seconds_between(session.get("started_at") or now, now)
        if exam_session_can_resume(session, exam, now=now):
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
        "submitted_at, duration_seconds, total, correct, score, passed, question_ids_json, "
        "paper_attempt_id) VALUES (?, ?, ?, ?, 'in_progress', ?, '', 0, ?, 0, 0, 0, ?, ?)",
        (
            session_id,
            user_id,
            exam["id"],
            exam.get("level") or "",
            now,
            len(q_ids),
            json.dumps(q_ids),
            str(paper_attempt_id or ""),
        ),
    )
    questions = _questions_by_ids(conn, q_ids, reveal_answer=False)
    return {
        "sessionId": session_id,
        "examId": exam["id"],
        "level": exam.get("level") or "",
        "title": exam.get("title") or "",
        "durationSeconds": int(exam.get("duration_seconds") or 0),
        "passScore": int(exam.get("pass_score") or 60),
        "scoreMode": normalize_score_mode(exam.get("score_mode")),
        "total": len(q_ids),
        "questions": questions,
        "resumed": False,
        "answerRevision": 0,
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
        "SELECT question_id, selected_index, revision FROM jlpt_exam_answers WHERE session_id = ?",
        (session["id"],),
    ).fetchall()
    answers = [
        {
            "questionId": d["question_id"],
            "selectedIndex": int(d["selected_index"]),
            "revision": int(d.get("revision") or 0),
        }
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
        "scoreMode": normalize_score_mode(exam.get("score_mode")),
        "total": len(q_ids),
        "questions": _questions_by_ids(conn, q_ids, reveal_answer=False),
        "resumed": True,
        "answers": answers,
        "answerRevision": int(session.get("answer_revision") or 0),
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
        "SELECT " + _Q_WITH_AUDIO + f" WHERE jlpt_questions.id IN ({placeholders})",
        tuple(q_ids),
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
    return elapsed >= limit + max(0, grace)


def _validated_revision_pair(base_revision: Any, revision: Any) -> tuple[int, int]:
    """Validate a consecutive optimistic revision pair without bool coercion."""
    if (isinstance(base_revision, bool) or isinstance(revision, bool)
            or not isinstance(base_revision, int) or not isinstance(revision, int)
            or base_revision < 0 or revision != base_revision + 1):
        raise APIError(
            "baseRevision/revision 必须是相邻的非负整数。",
            400,
            "invalid_answer_revision",
        )
    return base_revision, revision


def _answer_revision_conflict(current: int) -> APIError:
    return APIError(
        "作答版本已变化，请先恢复服务器上的最新答案。",
        409,
        "answer_revision_conflict",
        {"currentAnswerRevision": int(current)},
    )


def _validated_selected_index(question: dict[str, Any], raw: Any) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise APIError("selectedIndex 必须是整数。", 400, "invalid_selected_index")
    choices = _loads_choices(question.get("choices_json"))
    if raw < 0 or raw >= len(choices):
        raise APIError("selectedIndex 超出选项范围。", 400, "invalid_selected_index")
    return raw


def save_exam_answer(
    conn: Any, *, session: dict[str, Any], question_id: str, selected_index: int,
    now: Optional[str] = None, base_revision: Any = None, revision: Any = None,
) -> Optional[dict[str, Any]]:
    """Persist one answer under the session-wide optimistic revision contract.

    Legacy callers that omit both revision fields remain compatible: the server
    assigns the next revision. New callers provide ``baseRevision`` and exactly
    ``base+1``. Retrying the exact same write is idempotent; changing content at
    an already-used revision is a 409 conflict.

    The HTTP handler opens an explicit transaction. The no-op session UPDATE
    below then shares a row lock with submit, preventing a save from committing
    after that session has already been graded.
    """
    if (session.get("status") or "") != "in_progress":
        return None
    if _exam_session_expired(conn, session, now=now, grace=EXAM_SAVE_GRACE_SEC):
        return None
    q_ids = _loads_json_list(session.get("question_ids_json"))
    if question_id not in q_ids:
        return None
    question = get_question(conn, question_id)
    if not question:
        return None
    selected = _validated_selected_index(question, selected_index)

    lock = conn.execute(
        "UPDATE jlpt_exam_sessions SET answer_revision=answer_revision "
        "WHERE id=? AND status='in_progress'",
        (session["id"],),
    )
    if getattr(lock, "rowcount", 0) != 1:
        return None
    live_row = conn.execute(
        "SELECT answer_revision FROM jlpt_exam_sessions WHERE id=?", (session["id"],)
    ).fetchone()
    current = int(dict(live_row).get("answer_revision") or 0) if live_row else 0
    legacy = base_revision is None and revision is None
    if legacy:
        base, next_revision = current, current + 1
    else:
        if base_revision is None or revision is None:
            raise APIError(
                "baseRevision 与 revision 必须同时提供。",
                400,
                "invalid_answer_revision",
            )
        base, next_revision = _validated_revision_pair(base_revision, revision)
        if next_revision == current and base == current - 1:
            existing = conn.execute(
                "SELECT selected_index, revision FROM jlpt_exam_answers "
                "WHERE session_id=? AND question_id=?",
                (session["id"], question_id),
            ).fetchone()
            if existing:
                saved = dict(existing)
                if (int(saved.get("revision") or 0) == next_revision
                        and int(saved.get("selected_index")) == selected):
                    return {
                        "saved": True,
                        "questionId": question_id,
                        "revision": next_revision,
                        "answerRevision": current,
                        "idempotentReplay": True,
                        "legacyRevisionAssigned": False,
                    }
            raise _answer_revision_conflict(current)
        if base != current:
            raise _answer_revision_conflict(current)

    is_correct = 1 if selected == int(question.get("answer_index") or 0) else 0
    conn.execute(
        "INSERT INTO jlpt_exam_answers "
        "(session_id, question_id, selected_index, is_correct, revision) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(session_id, question_id) DO UPDATE SET "
        "selected_index=excluded.selected_index, is_correct=excluded.is_correct, revision=excluded.revision",
        (session["id"], question_id, selected, is_correct, next_revision),
    )
    conn.execute(
        "UPDATE jlpt_exam_sessions SET answer_revision=? WHERE id=? AND status='in_progress'",
        (next_revision, session["id"]),
    )
    return {
        "saved": True,
        "questionId": question_id,
        "revision": next_revision,
        "answerRevision": next_revision,
        "idempotentReplay": False,
        "legacyRevisionAssigned": legacy,
    }


def _validated_answer_snapshot(
    conn: Any, *, session: dict[str, Any], snapshot: Any, revision: int,
) -> list[tuple[str, int, int, int]]:
    if not isinstance(snapshot, list):
        raise APIError("answersSnapshot 必须是数组。", 400, "invalid_answer_snapshot")
    known = set(_loads_json_list(session.get("question_ids_json")))
    seen: set[str] = set()
    rows: list[tuple[str, int, int, int]] = []
    for item in snapshot:
        if not isinstance(item, dict):
            raise APIError("answersSnapshot 项格式错误。", 400, "invalid_answer_snapshot")
        question_id = str(item.get("questionId") or item.get("question_id") or "").strip()
        if not question_id or question_id not in known or question_id in seen:
            raise APIError(
                "answersSnapshot 含重复或不属于本卷的题目。",
                400,
                "invalid_answer_snapshot",
            )
        question = get_question(conn, question_id)
        if not question:
            raise APIError("answersSnapshot 题目不存在。", 400, "invalid_answer_snapshot")
        selected = _validated_selected_index(
            question, item.get("selectedIndex", item.get("selected_index"))
        )
        correct = 1 if selected == int(question.get("answer_index") or 0) else 0
        rows.append((question_id, selected, correct, revision))
        seen.add(question_id)
    return rows


def submit_exam_session(
    conn: Any, *, session: dict[str, Any], exam: Optional[dict[str, Any]], now: Optional[str] = None,
    answer_snapshot: Any = _ANSWER_SNAPSHOT_UNSET,
    base_revision: Any = None,
    revision: Any = None,
) -> Optional[dict[str, Any]]:
    """Atomically apply an optional full answer snapshot, grade, and finalize.

    The caller must hold an explicit DB transaction. Answer saves and submit
    both lock the session row, so grading observes every committed pre-submit
    save and no answer can land after the result is final. Once the server
    deadline has elapsed, an attached client snapshot is deliberately ignored:
    only answers persisted by the deadline are settled, so a failed auto-submit
    cannot reopen the paper at 00:00.
    """
    now = _iso(now)
    lock = conn.execute(
        "UPDATE jlpt_exam_sessions SET answer_revision=answer_revision "
        "WHERE id=? AND status='in_progress'",
        (session["id"],),
    )
    if getattr(lock, "rowcount", 0) != 1:
        return None
    live = conn.execute(
        "SELECT * FROM jlpt_exam_sessions WHERE id=?", (session["id"],)
    ).fetchone()
    if not live:
        return None
    session = dict(live)
    current_revision = int(session.get("answer_revision") or 0)
    result_revision = current_revision

    # ``null`` is not the same as an omitted snapshot. Treating JSON null as
    # the legacy submit path would silently grade only the last persisted
    # answers even though the caller explicitly attempted a full snapshot.
    snapshot_requested = answer_snapshot is not _ANSWER_SNAPSHOT_UNSET
    deadline_expired = _exam_session_expired(conn, session, now=now)
    snapshot_supplied = snapshot_requested and not deadline_expired
    if snapshot_supplied:
        if base_revision is None or revision is None:
            raise APIError(
                "提交答案快照时必须同时提供 baseRevision 与 revision。",
                400,
                "invalid_answer_revision",
            )
        base, next_revision = _validated_revision_pair(base_revision, revision)
        if base != current_revision:
            raise _answer_revision_conflict(current_revision)
        snapshot_rows = _validated_answer_snapshot(
            conn, session=session, snapshot=answer_snapshot, revision=next_revision
        )
        # Complete snapshot semantics: an omitted question is unanswered.
        # Every item is validated before the first mutation.
        conn.execute("DELETE FROM jlpt_exam_answers WHERE session_id=?", (session["id"],))
        if snapshot_rows:
            conn.executemany(
                "INSERT INTO jlpt_exam_answers "
                "(session_id, question_id, selected_index, is_correct, revision) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (session["id"], question_id, selected, correct, row_revision)
                    for question_id, selected, correct, row_revision in snapshot_rows
                ],
            )
        conn.execute(
            "UPDATE jlpt_exam_sessions SET answer_revision=? WHERE id=?",
            (next_revision, session["id"]),
        )
        result_revision = next_revision
    elif not deadline_expired and (base_revision is not None or revision is not None):
        raise APIError(
            "未提供 answersSnapshot 时不得单独提交 revision。",
            400,
            "invalid_answer_snapshot",
        )

    # CAS: only the request that flips in_progress→submitted proceeds to score.
    cur = conn.execute(
        "UPDATE jlpt_exam_sessions SET status='submitted', submitted_at=? "
        "WHERE id=? AND status='in_progress'",
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
    # 全真模考：JLPT 缩放分整块随会话持久化（历史/回看直接反序列化）。老字段
    # (score 0-100 / passed) 语义不变，老客户端零感知。
    score_mode = normalize_score_mode((exam or {}).get("score_mode"))
    scaled: Optional[dict[str, Any]] = None
    if score_mode == "jlpt_scaled":
        scaled = compute_scaled_result(
            conn,
            level=(exam or {}).get("level") or session.get("level") or "",
            q_ids=q_ids, answers=answers,
        )
    conn.execute(
        "UPDATE jlpt_exam_sessions SET total = ?, correct = ?, score = ?, passed = ?, "
        "duration_seconds = ?, scaled_json = ? WHERE id = ?",
        (total, correct, score, passed, duration,
         json.dumps(scaled, ensure_ascii=False) if scaled else "", session["id"]),
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
    out = {
        "sessionId": session["id"],
        "answerRevision": result_revision,
        "idempotentReplay": False,
        "deadlineExpired": deadline_expired,
        "snapshotAccepted": bool(snapshot_requested and not deadline_expired),
        "total": total, "correct": correct, "score": score,
        "passed": bool(passed), "passScore": pass_score,
        "scoreMode": score_mode,
        "durationSeconds": duration,
        "questions": breakdown,
    }
    if scaled:
        out["scaled"] = scaled
    snapshotted = conn.execute(
        "UPDATE jlpt_exam_sessions SET result_snapshot_json=? "
        "WHERE id=? AND result_snapshot_json=''",
        (json.dumps(out, ensure_ascii=False, separators=(",", ":")), session["id"]),
    )
    if getattr(snapshotted, "rowcount", 0) != 1:
        raise RuntimeError("failed to persist immutable JLPT result snapshot")
    return out


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
        item = {
            "sessionId": d["id"], "examId": d.get("exam_id") or "",
            "title": d.get("exam_title") or "", "kind": d.get("exam_kind") or "",
            "level": d.get("level") or "",
            "total": int(d.get("total") or 0), "correct": int(d.get("correct") or 0),
            "score": int(d.get("score") or 0), "passed": bool(d.get("passed")),
            "durationSeconds": int(d.get("duration_seconds") or 0),
            "startedAt": d.get("started_at") or "", "submittedAt": d.get("submitted_at") or "",
        }
        scaled = _loads_scaled(d.get("scaled_json"))
        if scaled:
            item["scaled"] = scaled
            item["scoreMode"] = "jlpt_scaled"
        out.append(item)
    return out


def session_review(conn: Any, *, session: dict[str, Any]) -> dict[str, Any]:
    """Full回看 of a (usually submitted) session with answers revealed."""
    stored = _loads_result_snapshot(session.get("result_snapshot_json"))
    if stored:
        # Return a fresh object from the committed result snapshot. In particular,
        # do not re-read mutable question/exam catalog rows for completed sessions.
        # The stable session identity/status fields remain part of the historical
        # review API contract even though they are not part of the submit payload.
        stored.pop("idempotentReplay", None)
        return {
            "sessionId": session["id"],
            "examId": session.get("exam_id") or "",
            "level": session.get("level") or "",
            "status": session.get("status") or "",
            **stored,
        }
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
    out = {
        "sessionId": session["id"], "examId": session.get("exam_id") or "",
        "level": session.get("level") or "", "status": session.get("status") or "",
        "total": int(session.get("total") or 0), "correct": int(session.get("correct") or 0),
        "score": int(session.get("score") or 0), "passed": bool(session.get("passed")),
        "durationSeconds": int(session.get("duration_seconds") or 0),
        "questions": breakdown,
    }
    scaled = _loads_scaled(session.get("scaled_json"))
    if scaled:
        out["scaled"] = scaled
        out["scoreMode"] = "jlpt_scaled"
    return out


def replay_submitted_exam_result(
    conn: Any, *, session: dict[str, Any], exam: Optional[dict[str, Any]]
) -> Optional[dict[str, Any]]:
    """Return the immutable stored submit result after a response was lost.

    A retry never reapplies the caller's snapshot.  It only reconstructs the
    already-persisted breakdown and score, so a changed retry cannot alter a
    completed attempt while Web/iOS can still close the result flow.
    """
    if str(session.get("status") or "") != "submitted":
        return None
    stored = _loads_result_snapshot(session.get("result_snapshot_json"))
    if stored:
        stored["idempotentReplay"] = True
        return stored
    out = session_review(conn, session=session)
    out.pop("status", None)
    out["passScore"] = int((exam or {}).get("pass_score") or 60)
    out["answerRevision"] = int(session.get("answer_revision") or 0)
    out["idempotentReplay"] = True
    return out


def append_exam_result_snapshot_fields(
    conn: Any, *, session_id: str, fields: dict[str, Any]
) -> bool:
    """Append final response fields before the submit transaction commits.

    A paper submit learns its authoritative parent progress only after the
    session has been graded. The base snapshot is already durable at that
    point, so this append-only CAS completes the same response snapshot without
    allowing a later retry to rewrite any existing field.
    """
    if not fields:
        return True
    row = conn.execute(
        "SELECT result_snapshot_json FROM jlpt_exam_sessions WHERE id=?",
        (session_id,),
    ).fetchone()
    raw = str(row["result_snapshot_json"] or "") if row else ""
    stored = _loads_result_snapshot(raw)
    if not stored:
        return False
    changed = False
    for key, value in fields.items():
        if key in stored:
            if stored[key] != value:
                raise RuntimeError(
                    f"immutable JLPT result snapshot field already differs: {key}"
                )
            continue
        stored[key] = value
        changed = True
    if not changed:
        return True
    encoded = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
    updated = conn.execute(
        "UPDATE jlpt_exam_sessions SET result_snapshot_json=? "
        "WHERE id=? AND result_snapshot_json=?",
        (encoded, session_id, raw),
    )
    if getattr(updated, "rowcount", 0) != 1:
        raise RuntimeError("JLPT result snapshot changed while finalizing response")
    return True


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
    if kind not in ("mock", "section", "vocab", "paper"):
        kind = "mock"
    section = normalize_section(exam.get("section"))
    duration = _clamp(exam.get("durationSeconds", exam.get("duration_seconds")), 0, 0, 24 * 3600)
    pass_score = _clamp(exam.get("passScore", exam.get("pass_score")), 60, 0, 100)
    is_member_only = 1 if exam.get("isMemberOnly") or exam.get("is_member_only") else 0
    status = str(exam.get("status") or "published").strip().lower()[:16] or "published"
    sort_order = _clamp(exam.get("sortOrder", exam.get("sort_order")), 0, 0, 10_000_000)
    score_mode = normalize_score_mode(exam.get("scoreMode") or exam.get("score_mode"))
    # 分科整卷：子科目(kind='section')挂在父卷(kind='paper')下，靠 parent_exam_id
    # 关联、sort_order 排序推进。父卷本身不组卷不计时。
    parent_exam_id = str(exam.get("parentExamId") or exam.get("parent_exam_id") or "").strip()[:64]
    existing = conn.execute(
        "SELECT id, coin_cost FROM jlpt_exams WHERE id = ?", (exam_id,)
    ).fetchone()
    # 开考消耗的 Machi 币(分科卷记在笔试子科目上,整卷只扣一次)。后台 upsert
    # 允许编辑其它字段而不重报价格，所以字段缺失时保留已有值；显式 0 才改为免费。
    coin_cost_supplied = "coinCost" in exam or "coin_cost" in exam
    if coin_cost_supplied:
        raw_coin_cost = exam["coinCost"] if "coinCost" in exam else exam.get("coin_cost")
        # JSON null means "not supplied" for PATCH-like admin upserts. Only an
        # actual numeric zero is allowed to turn a paid exam into a free exam.
        coin_cost_supplied = raw_coin_cost is not None
    if coin_cost_supplied:
        coin_cost = _parse_coin_cost(raw_coin_cost)
    elif existing:
        coin_cost = int(dict(existing).get("coin_cost") or 0)
    else:
        coin_cost = 0

    raw_qids = exam.get("questionIds") or exam.get("question_ids") or []
    question_ids = [str(q).strip() for q in raw_qids if str(q).strip()] if isinstance(raw_qids, list) else []
    # Fixed set → count is its length; else honor a caller-supplied count (for
    # dynamic mocks), clamped to a sane sampling ceiling. A paper parent never
    # samples questions itself, so its manifest total must not be truncated by
    # the dynamic-exam cap (full N1 currently contains 95 questions).
    if question_ids:
        question_count = len(question_ids)
    elif kind == "paper":
        question_count = _clamp(
            exam.get("questionCount", exam.get("question_count")), 0, 0, IMPORT_MAX_ROWS
        )
    else:
        question_count = _clamp(exam.get("questionCount", exam.get("question_count")), 20, 1, EXAM_DYNAMIC_MAX)

    row = (level, title, kind, section, question_count, duration, pass_score,
           is_member_only, status, sort_order, score_mode, parent_exam_id, coin_cost)
    if existing:
        conn.execute(
            "UPDATE jlpt_exams SET level=?, title=?, kind=?, section=?, question_count=?, "
            "duration_seconds=?, pass_score=?, is_member_only=?, status=?, sort_order=?, "
            "score_mode=?, parent_exam_id=?, coin_cost=? WHERE id=?",
            (*row, exam_id),
        )
    else:
        conn.execute(
            "INSERT INTO jlpt_exams (id, level, title, kind, section, question_count, duration_seconds, "
            "pass_score, is_member_only, status, sort_order, score_mode, parent_exam_id, coin_cost, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            "fixed": bool(question_ids), "parentExamId": parent_exam_id}


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


def _loads_scaled(raw: Any) -> Optional[dict[str, Any]]:
    """scaled_json 反序列化：只接受 dict，空串/坏数据一律 None（老会话没有）。"""
    if not raw:
        return None
    data = _loads_json_obj(raw)
    return data if isinstance(data, dict) else None


def _loads_result_snapshot(raw: Any) -> Optional[dict[str, Any]]:
    """Strictly decode a committed submit response stored on the session row."""
    if not raw:
        return None
    data = _loads_json_obj(raw)
    if (
        not isinstance(data, dict)
        or not str(data.get("sessionId") or "")
        or not isinstance(data.get("questions"), list)
    ):
        return None
    # Round-trip through JSON so no caller can mutate a shared decoded object.
    return json.loads(json.dumps(data, ensure_ascii=False))


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
