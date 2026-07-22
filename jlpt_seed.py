"""JLPT 备考核心 — starter seed (原创样本题 / 样本词表 / 样本模考 / 考试日历).

All content here is ORIGINAL (source='original') study material authored for
Machi — NOT unauthorized JLPT past-paper text. It exists so the JLPT zone is not
an empty shell on first boot and so tests have something to sample. The operator
灌真题真词表 later via the admin import endpoints (which stamp source='imported').

Idempotent: ``ensure_jlpt_seed(conn)`` only seeds a table cluster when it's
empty, so it never overwrites imported/admin content.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── original sample questions ────────────────────────────────────────────────
# Each: (level, section, stem, [choices], answer_index, explanation).
# Deliberately basic/original so nothing resembles a real past paper.

_SAMPLE_QUESTIONS: list[tuple[str, str, str, list[str], int, str]] = [
    # ---- N5 ----
    ("N5", "vocab", "「みず」を漢字で書くと？", ["水", "木", "火", "土"], 0, "「みず」＝水。基础汉字。"),
    ("N5", "vocab", "「がっこう」の意味は？", ["医院", "学校", "公司", "车站"], 1, "がっこう＝学校。"),
    ("N5", "vocab", "「たべます」の意味は？", ["喝", "吃", "看", "听"], 1, "たべます＝吃(食べる)。"),
    ("N5", "grammar", "わたし（　）がくせいです。", ["は", "を", "に", "へ"], 0, "主题助词用「は」。"),
    ("N5", "grammar", "本（　）よみます。", ["は", "を", "が", "で"], 1, "宾语用「を」。"),
    ("N5", "grammar", "がっこう（　）いきます。", ["を", "は", "へ", "が"], 2, "方向用「へ / に」。"),
    ("N5", "reading", "「毎朝、パンを食べます。」何を食べますか。", ["ごはん", "パン", "うどん", "そば"], 1, "文中「パン」を食べる。"),
    ("N5", "reading", "「土曜日に映画を見ます。」いつ映画を見ますか。", ["金曜日", "土曜日", "日曜日", "月曜日"], 1, "文中「土曜日」。"),
    ("N5", "listening", "（音声）「お名前は？」适当な返事は？", ["田中です", "元気です", "はい、どうぞ", "また明日"], 0, "问名字→报名字。"),
    ("N5", "listening", "（音声）「ありがとう」への返事は？", ["すみません", "どういたしまして", "こんにちは", "さようなら"], 1, "谢谢→不客气。"),
    # ---- N4 ----
    ("N4", "vocab", "「べんり」の意味は？", ["不便", "方便", "危险", "安全"], 1, "べんり＝便利/方便。"),
    ("N4", "vocab", "「しゅみ」の意味は？", ["工作", "爱好", "家庭", "学习"], 1, "しゅみ＝趣味/爱好。"),
    ("N4", "grammar", "雨が降っている（　）、出かけません。", ["から", "のに", "ても", "たり"], 0, "原因用「から」。"),
    ("N4", "grammar", "日本語を話す（　）ができます。", ["こと", "もの", "ところ", "ため"], 0, "「動詞辞書形＋ことができる」。"),
    ("N4", "reading", "「宿題をしてから、テレビを見ます。」先にするのは？", ["テレビ", "宿題", "食事", "掃除"], 1, "「してから」＝先做作业。"),
    ("N4", "listening", "（音声）「手伝いましょうか。」への返事は？", ["お願いします", "行きましょう", "食べました", "そうですね"], 0, "帮忙提议→请求帮助。"),
    # ---- N3 ----
    ("N3", "vocab", "「あきらめる」の意味は？", ["放弃", "开始", "继续", "决定"], 0, "あきらめる＝放弃。"),
    ("N3", "vocab", "「そうだん」の意味は？", ["商量", "散步", "掃除", "準備"], 0, "そうだん＝相谈/商量。"),
    ("N3", "grammar", "彼は行く（　）だ。（听说）", ["そう", "よう", "らしい", "みたい"], 0, "传闻「そうだ」＝听说。"),
    ("N3", "grammar", "母（　）作った料理はおいしい。", ["に", "の", "が", "を"], 2, "从句主语可用「が」。"),
    ("N3", "reading", "「値段は高いが、質がいい。」筆者の評価は？", ["否定的", "肯定的", "中立", "不明"], 1, "虽贵但质好＝肯定。"),
    ("N3", "listening", "（音声）「予約を変更したいのですが。」话者の目的は？", ["取消", "更改预约", "确认时间", "投诉"], 1, "変更＝更改。"),
    # ---- N2 ----
    ("N2", "vocab", "「めんどう」の意味に近いのは？", ["麻烦", "简单", "有趣", "重要"], 0, "めんどう＝麻烦。"),
    ("N2", "vocab", "「いっぽう」の使い方で正しいのは？", ["另一方面", "同时刻", "无论如何", "尽管如此"], 0, "一方＝另一方面。"),
    ("N2", "grammar", "努力した（　）、合格できなかった。", ["わりに", "ものの", "からには", "ことに"], 1, "「ものの」＝虽然…但。"),
    ("N2", "grammar", "この問題は難しい（　）、時間がかかる。", ["だけに", "ばかりに", "うえに", "かぎり"], 2, "「うえに」＝而且。"),
    ("N2", "reading", "「環境問題は避けて通れない。」筆者の立場は？", ["回避", "重视", "无所谓", "反对"], 1, "避けて通れない＝无法回避→重视。"),
    ("N2", "listening", "（音声）会議の結論は「来週に延期」。いつ会議する？", ["今日", "明日", "来週", "来月"], 2, "延期到来週。"),
    # ---- N1 ----
    ("N1", "vocab", "「ふまえる」の意味は？", ["踏まえる=基于", "忘记", "夸大", "否定"], 0, "踏まえる＝基于/立足于。"),
    ("N1", "vocab", "「いちじるしい」の意味は？", ["显著", "微小", "普通", "缓慢"], 0, "著しい＝显著。"),
    ("N1", "grammar", "調査結果（　）、対策を立てる。", ["をもとに", "にあたって", "をよそに", "ながらも"], 0, "「をもとに」＝以…为基础。"),
    ("N1", "grammar", "彼の実力（　）、優勝は当然だ。", ["をもって", "からすると", "にひきかえ", "ともなると"], 1, "「からすると」＝从…来看。"),
    ("N1", "reading", "「一概には言えない。」筆者の態度は？", ["断定", "慎重", "乐观", "悲观"], 1, "一概には言えない＝慎重不断定。"),
    ("N1", "listening", "（音声）講演者は「多角的な視点」を強調。主旨は？", ["单一视角", "多角度看问题", "无需思考", "依赖直觉"], 1, "多角的＝多角度。"),
]


# ── original sample vocab (per level) ────────────────────────────────────────
# (level, word, reading, meaning_zh, pos, example, example_zh)
_SAMPLE_VOCAB: list[tuple[str, str, str, str, str, str, str]] = [
    ("N5", "水", "みず", "水", "名词", "水を飲みます。", "喝水。"),
    ("N5", "学校", "がっこう", "学校", "名词", "学校へ行きます。", "去学校。"),
    ("N5", "食べる", "たべる", "吃", "动词", "ご飯を食べる。", "吃饭。"),
    ("N5", "大きい", "おおきい", "大的", "形容词", "大きい家。", "大房子。"),
    ("N5", "毎日", "まいにち", "每天", "名词", "毎日勉強します。", "每天学习。"),
    ("N4", "便利", "べんり", "方便", "形容动词", "便利な道具。", "方便的工具。"),
    ("N4", "趣味", "しゅみ", "爱好", "名词", "私の趣味は読書です。", "我的爱好是读书。"),
    ("N4", "予約", "よやく", "预约", "名词", "レストランを予約する。", "预约餐厅。"),
    ("N4", "経験", "けいけん", "经验", "名词", "いい経験になった。", "成了好经验。"),
    ("N3", "相談", "そうだん", "商量", "名词", "先生に相談する。", "找老师商量。"),
    ("N3", "諦める", "あきらめる", "放弃", "动词", "夢を諦めない。", "不放弃梦想。"),
    ("N3", "確認", "かくにん", "确认", "名词", "予定を確認する。", "确认日程。"),
    ("N2", "面倒", "めんどう", "麻烦", "形容动词", "面倒な手続き。", "麻烦的手续。"),
    ("N2", "一方", "いっぽう", "另一方面", "名词", "一方で問題もある。", "另一方面也有问题。"),
    ("N2", "訳", "わけ", "缘由", "名词", "そういう訳だ。", "是这么个缘由。"),
    ("N1", "踏まえる", "ふまえる", "基于", "动词", "現状を踏まえて考える。", "基于现状思考。"),
    ("N1", "著しい", "いちじるしい", "显著", "形容词", "著しい変化。", "显著的变化。"),
    ("N1", "一概", "いちがい", "一概", "副词", "一概には言えない。", "不能一概而论。"),
]


# ── exam calendar (official public dates — plain dates only) ──────────────────
_SAMPLE_EXAM_DATES = [
    {"region": "jp", "sessionLabel": "2026-07", "examDate": "2026-07-05",
     "regOpenDate": "2026-03-16", "regCloseDate": "2026-04-15",
     "note": "第1回 JLPT（7月）。以官方 JEES 公告为准。"},
    {"region": "jp", "sessionLabel": "2026-12", "examDate": "2026-12-06",
     "regOpenDate": "2026-08-24", "regCloseDate": "2026-09-24",
     "note": "第2回 JLPT（12月）。以官方 JEES 公告为准。"},
]


def ensure_jlpt_seed(conn: Any) -> dict[str, int]:
    """Idempotently seed JLPT starter content. Each cluster is guarded by an
    emptiness check so admin/imported data is never overwritten."""
    import server_jlpt as jlpt

    now = _now()
    result = {"questions": 0, "vocabWords": 0, "decks": 0, "exams": 0, "examDates": 0}

    # 1) Questions (source='original').
    if _empty(conn, "jlpt_questions"):
        items = [
            {"level": lvl, "section": sec, "stem": stem, "choices": choices,
             "answerIndex": ai, "explanation": exp, "source": "original"}
            for (lvl, sec, stem, choices, ai, exp) in _SAMPLE_QUESTIONS
        ]
        r = jlpt.import_questions(conn, items, now=now)
        result["questions"] = r["total"]

    # 2) Vocab words + one deck per level.
    if _empty(conn, "jlpt_vocab_words"):
        word_ids_by_level: dict[str, list[str]] = {}
        order = 0
        for (lvl, word, reading, meaning, pos, ex, ex_zh) in _SAMPLE_VOCAB:
            wid = str(uuid.uuid4())
            order += 1
            conn.execute(
                "INSERT INTO jlpt_vocab_words (id, level, word, reading, meaning_zh, meaning_en, pos, "
                "example, example_zh, tags, source, status, sort_order, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'original', 'published', ?, ?, ?)",
                (wid, lvl, word, reading, meaning, "", pos, ex, ex_zh, order, now, now),
            )
            word_ids_by_level.setdefault(lvl, []).append(wid)
            result["vocabWords"] += 1
        if _empty(conn, "jlpt_vocab_decks"):
            for i, lvl in enumerate(jlpt.LEVELS):
                wids = word_ids_by_level.get(lvl, [])
                if not wids:
                    continue
                jlpt.upsert_deck(conn, {
                    "level": lvl, "title": f"JLPT {lvl} 核心词汇（样本）",
                    "description": f"{lvl} 高频词原创样本 deck，可用于「考单词」测验。",
                    "sortOrder": i, "wordIds": wids,
                }, now=now)
                result["decks"] += 1

    # 3) Sample mock exams (dynamic — no fixed jlpt_exam_questions rows, so they
    #    sample the bank at start time; a level with no questions just won't
    #    produce a session).
    if _empty(conn, "jlpt_exams"):
        for i, lvl in enumerate(("N5", "N4", "N3")):
            conn.execute(
                "INSERT INTO jlpt_exams (id, level, title, kind, section, question_count, "
                "duration_seconds, pass_score, is_member_only, status, sort_order, created_at) "
                "VALUES (?, ?, ?, 'mock', '', ?, ?, 60, 0, 'published', ?, ?)",
                (str(uuid.uuid4()), lvl, f"JLPT {lvl} 原创模考（样本）", 8, 1200, i, now),
            )
            result["exams"] += 1

    # 4) Exam calendar.
    if _empty(conn, "jlpt_exam_dates"):
        r = jlpt.upsert_exam_dates(conn, _SAMPLE_EXAM_DATES, now=now)
        result["examDates"] = r["written"]

    return result


def _empty(conn: Any, table: str) -> bool:
    row = conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()
    return int(dict(row)["c"]) == 0


# ── 全真模考题库（data/jlpt_bank_v1.json）───────────────────────────────────
# 原创全真题库由多模型生成 + 双盲对抗校验后落盘为 JSON（生成管线见工作区
# 文档），此处只负责装载：题目走 import_questions upsert（source='mockv1'，
# 可审计、可整体替换）。旧清单仍装为单张固定笔试卷；full-paper v2 清单装为
# 无计时父卷 + 独立计时的笔试/听力子卷，避免把听力塞进笔试时限。

_MOCK_BANK_FILENAME = "jlpt_bank_v1.json"
_MOCK_SOURCE = "mockv1"
_MOCK_COIN_COST_BY_LEVEL = {"N5": 100, "N4": 150, "N3": 250, "N2": 350, "N1": 400}
# 样本小模考的标题模板（见 ensure_jlpt_seed）。全真卷上线后要把它们归档，识别
# 必须锚定这个 seed 自己写下的标题 —— 早期版本靠「question_count<=10 且没有固定
# 题单」来猜，会误伤 admin 手工建的小题量动态卷（那种卷同样没有固定题单）。
_SAMPLE_EXAM_TITLE_LIKE = "JLPT % 原创模考（样本）"


def _mock_bank_path() -> str:
    import os
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", _MOCK_BANK_FILENAME)


def _bank_fingerprint(raw: bytes) -> str:
    import hashlib
    return hashlib.sha256(raw).hexdigest()[:32]


def _mock_paper_exam_payloads(
    level: str, paper: dict[str, Any], *, sort_order: int
) -> list[dict[str, Any]]:
    """Translate one bank manifest into runtime exam rows.

    Legacy manifests remain one fixed ``mock`` exam.  A v2 ``full-paper``
    manifest becomes an untimed parent plus independently timed written and
    listening children, matching the runtime's paper/section contract.
    """
    normalized_level = str(level).strip().upper()
    parent_id = f"mockv1-{normalized_level.lower()}"
    question_ids = [
        str(value).strip()
        for value in (paper.get("questionIds") or [])
        if str(value).strip()
    ]
    if not question_ids:
        return []

    is_full_paper = paper.get("kind") == "full-paper"
    default_coin_cost = (
        _MOCK_COIN_COST_BY_LEVEL.get(normalized_level, 0) if is_full_paper else 0
    )
    try:
        coin_cost = max(
            0,
            int(paper.get("coinCost", default_coin_cost)),
        )
    except (TypeError, ValueError):
        coin_cost = default_coin_cost

    if not is_full_paper:
        return [
            {
                "id": parent_id,
                "level": normalized_level,
                "title": paper.get("title") or f"JLPT {normalized_level} 全真模拟（笔试卷）",
                "kind": "mock",
                "durationSeconds": int(paper.get("durationSeconds") or 0),
                "passScore": 60,
                "scoreMode": "jlpt_scaled",
                "coinCost": coin_cost,
                "isMemberOnly": False,
                "status": "published",
                "sortOrder": sort_order,
                "questionIds": question_ids,
            }
        ]

    if paper.get("manifestVersion") != 2:
        raise ValueError(f"{normalized_level}: full-paper requires manifestVersion=2")
    raw_sections = paper.get("sections")
    if not isinstance(raw_sections, list) or len(raw_sections) != 2:
        raise ValueError(f"{normalized_level}: full-paper requires written and listening sections")

    expected_names = ("written", "listening")
    normalized_sections = []
    for index, expected_name in enumerate(expected_names):
        raw_section = raw_sections[index]
        if not isinstance(raw_section, dict) or raw_section.get("section") != expected_name:
            raise ValueError(
                f"{normalized_level}: full-paper section {index} must be {expected_name}"
            )
        section_ids = [
            str(value).strip()
            for value in (raw_section.get("questionIds") or [])
            if str(value).strip()
        ]
        duration = raw_section.get("durationSeconds")
        if not section_ids:
            raise ValueError(f"{normalized_level} {expected_name}: questionIds must not be empty")
        if type(duration) is not int or duration <= 0:
            raise ValueError(f"{normalized_level} {expected_name}: durationSeconds must be positive")
        normalized_sections.append((expected_name, raw_section, section_ids, duration))

    flattened_ids = [
        question_id
        for _, _, section_ids, _ in normalized_sections
        for question_id in section_ids
    ]
    if flattened_ids != question_ids:
        raise ValueError(
            f"{normalized_level}: full-paper questionIds must equal written + listening order"
        )
    if len(set(flattened_ids)) != len(flattened_ids):
        raise ValueError(f"{normalized_level}: full-paper questionIds must be unique")
    total_duration = sum(duration for _, _, _, duration in normalized_sections)
    if paper.get("durationSeconds") != total_duration:
        raise ValueError(
            f"{normalized_level}: full-paper durationSeconds must equal section durations"
        )

    title = str(paper.get("title") or f"JLPT {normalized_level} 全真模拟（完整卷）")
    payloads = [
        {
            "id": parent_id,
            "level": normalized_level,
            "title": title,
            "kind": "paper",
            "durationSeconds": 0,
            "questionCount": len(question_ids),
            "passScore": 60,
            "scoreMode": "percent",
            "coinCost": 0,
            "isMemberOnly": False,
            "status": "published",
            "sortOrder": sort_order,
            "questionIds": [],
        }
    ]
    for section_order, (section_name, raw_section, section_ids, duration) in enumerate(
        normalized_sections
    ):
        section_title = str(
            raw_section.get("title")
            or ("言語知識・読解" if section_name == "written" else "聴解")
        )
        payloads.append(
            {
                "id": f"{parent_id}-{section_name}",
                "level": normalized_level,
                "title": f"{title} · {section_title}",
                "kind": "section",
                "section": "" if section_name == "written" else "listening",
                "durationSeconds": duration,
                "passScore": 60,
                "scoreMode": "jlpt_scaled" if section_name == "written" else "percent",
                "coinCost": coin_cost if section_name == "written" else 0,
                "isMemberOnly": False,
                "status": "published",
                "sortOrder": section_order,
                "parentExamId": parent_id,
                "questionIds": section_ids,
            }
        )
    return payloads


def ensure_jlpt_mock_v1(conn: Any) -> dict[str, Any]:
    """Idempotently install the full-length mock bank + paper manifests. No-ops
    (quietly) when the bank file is absent — dev checkouts without the data
    file must still boot.

    幂等判据是题库文件内容的指纹，不是题目条数：改题（修错答案、均衡选项位置）
    时条数往往不变，用条数当判据会让修好的内容永远灌不进已部署的库。指纹存在
    jlpt_questions 的一行 sentinel 里（tags 字段），不新增表。"""
    import os

    import server_jlpt as jlpt

    path = _mock_bank_path()
    if not os.path.exists(path):
        return {"installed": False, "reason": "bank file missing"}
    try:
        with open(path, "rb") as f:
            raw = f.read()
        bank = json.loads(raw.decode("utf-8"))
    except Exception:
        return {"installed": False, "reason": "bank file unreadable"}
    questions = bank.get("questions") or []
    papers = bank.get("papers") or {}
    if not questions or not papers:
        return {"installed": False, "reason": "bank file empty"}

    now = _now()
    fingerprint = _bank_fingerprint(raw)
    sentinel_id = "mockv1-bank-fingerprint"
    row = conn.execute(
        "SELECT tags FROM jlpt_questions WHERE id = ?", (sentinel_id,)
    ).fetchone()
    if row is not None and str(dict(row).get("tags") or "") == fingerprint:
        return {"installed": True, "skipped": True, "fingerprint": fingerprint}

    items = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        items.append({
            "id": q.get("id"),
            "level": q.get("level"),
            "section": q.get("section"),
            "questionType": q.get("qtype") or "single",
            "stem": q.get("stem"),
            "passage": q.get("passage") or "",
            "choices": q.get("choices"),
            "answerIndex": q.get("answerIndex"),
            "explanation": q.get("explanation") or "",
            "difficulty": q.get("difficulty") or 3,
            "tags": q.get("tags") or "",
            "source": _MOCK_SOURCE,
            "sortOrder": q.get("sortOrder") or 0,
        })
    imported = {"total": 0}
    # import_questions 每次调用最多 IMPORT_MAX_ROWS 行,分批喂。
    for i in range(0, len(items), jlpt.IMPORT_MAX_ROWS):
        r = jlpt.import_questions(conn, items[i:i + jlpt.IMPORT_MAX_ROWS], now=now)
        imported["total"] += r["total"]

    exams = 0
    for i, (level, paper) in enumerate(sorted(papers.items())):
        if not isinstance(paper, dict):
            continue
        for payload in _mock_paper_exam_payloads(level, paper, sort_order=i):
            jlpt.upsert_exam(conn, payload, now=now)
            exams += 1

    # 样本 8 题小模考退场:全真卷上线后它们只会稀释列表。只认 ensure_jlpt_seed
    # 自己写下的标题,不靠「题少且无固定题单」去猜 —— admin 手工建的小题量动态
    # 卷同样没有固定题单,猜法会把人家的卷静默归档。
    if exams:
        conn.execute(
            "UPDATE jlpt_exams SET status = 'archived' "
            "WHERE kind = 'mock' AND status = 'published' AND id NOT LIKE 'mockv1-%' "
            "AND title LIKE ?",
            (_SAMPLE_EXAM_TITLE_LIKE,),
        )

    # 指纹 sentinel:一行 status='archived' 的占位题(永不进任何抽题/组卷路径,
    # 所有查询都带 status='published'),tags 存题库文件指纹。放在最后写,中途
    # 失败下次启动会重灌。
    conn.execute(
        "INSERT INTO jlpt_questions (id, level, section, question_type, stem, passage, "
        "audio_media_id, choices_json, answer_index, explanation, difficulty, tags, "
        "is_member_only, source, review_status, status, sort_order, created_at, updated_at) "
        "VALUES (?, 'N5', 'vocab', 'sentinel', ?, '', '', '[]', 0, '', 3, ?, 0, ?, "
        "'approved', 'archived', 0, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET tags = ?, updated_at = ?",
        (sentinel_id, "bank fingerprint sentinel — not a question", fingerprint,
         _MOCK_SOURCE, now, now, fingerprint, now),
    )

    return {"installed": True, "skipped": False,
            "questions": imported["total"], "exams": exams,
            "fingerprint": fingerprint}
