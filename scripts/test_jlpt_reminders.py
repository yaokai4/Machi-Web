#!/usr/bin/env python3
"""B2-2/B2-3 学习类提醒调度器测试（断签 / 错题复习）。

覆盖：JST 时窗闸、streak≥3 且当日未打卡才发、错题 T+1/T+3 两档（最后活动日
+3 / +5 的 JST 日）且 ≥5 道未复清错题才发、共享 sent-ledger（每用户每 JST 日
学习类提醒 ≤1 条）、重复调用幂等、文案三语随 settings.language、推送走
ntype='guide_reminder'。APNs enqueue 打桩离线验证。

Run:  cd web && python3 scripts/test_jlpt_reminders.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_jlpt_rem_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_apns  # noqa: E402
import server_jlpt as jlpt  # noqa: E402

# --- APNs stub: record every enqueue, deliver nothing -------------------------
PUSHES: list[tuple[str, str, str]] = []


def _fake_enqueue(recipient_id, *, ntype, actor_id="", content="", **kw):  # noqa: ANN001
    PUSHES.append((recipient_id, ntype, content))


server_apns.enqueue = _fake_enqueue  # type: ignore[assignment]
server.server_apns.enqueue = _fake_enqueue  # type: ignore[assignment]


def _make_user(conn, language: str = "") -> str:
    uid = str(uuid.uuid4())
    handle = "u" + uuid.uuid4().hex[:8]
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", now, now, now),
    )
    if language:
        conn.execute("INSERT INTO settings (user_id, language, updated_at) VALUES (?, ?, ?)",
                     (uid, language, now))
    return uid


def _attempt(conn, uid: str, qid: str, at_iso: str, *, correct: bool) -> None:
    conn.execute(
        "INSERT INTO jlpt_attempts (id, user_id, question_id, level, section, selected_index, "
        "is_correct, session_id, source_kind, created_at) VALUES (?, ?, ?, 'N5', 'vocab', 0, ?, '', 'practice', ?)",
        (str(uuid.uuid4()), uid, qid, 1 if correct else 0, at_iso),
    )


def _notif_count(conn, uid: str) -> int:
    return int(conn.execute(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?", (uid,)
    ).fetchone()["c"])


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        qids = [dict(r)["id"] for r in conn.execute(
            "SELECT id FROM jlpt_questions WHERE status='published' LIMIT 8"
        ).fetchall()]
        assert len(qids) >= 8, "seed questions required"

        # 时钟基准：今天 19:30 JST（断签窗口 [19,21) 内、复习窗口 [10,21) 内）。
        base_jst = datetime.now(jlpt.JST).replace(hour=19, minute=30, second=0, microsecond=0)
        now = base_jst.astimezone(timezone.utc).isoformat()

        def days_ago(n: int) -> str:
            return (base_jst - timedelta(days=n)).replace(hour=12).astimezone(timezone.utc).isoformat()

        # --- B2-2 断签提醒 ---------------------------------------------------
        # A: 连续 3 天（昨天为锚），今天没打卡 → 该发。日文文案。
        ua = _make_user(conn, language="ja")
        for n in (1, 2, 3):
            _attempt(conn, ua, qids[0], days_ago(n), correct=True)
        # B: 今天已打卡 → 不发。
        ub = _make_user(conn)
        for n in (0, 1, 2):
            _attempt(conn, ub, qids[1], days_ago(n), correct=True)
        # C: 只有 1 天 → streak 不足 3，不发。
        uc = _make_user(conn)
        _attempt(conn, uc, qids[2], days_ago(1), correct=True)
        conn.commit()

        sent = server.run_jlpt_streak_reminders(now)
        assert sent == 1, f"expected 1 streak reminder, got {sent}"
        assert len(PUSHES) == 1 and PUSHES[0][0] == ua and PUSHES[0][1] == "guide_reminder", PUSHES
        assert "3日連続" in PUSHES[0][2], PUSHES[0][2]  # 三语随 settings.language
        assert _notif_count(conn, ua) == 1 and _notif_count(conn, ub) == 0 and _notif_count(conn, uc) == 0
        # 幂等：同日再跑（sent-ledger 已占位）→ 0。
        assert server.run_jlpt_streak_reminders(now) == 0
        assert len(PUSHES) == 1
        # 时窗外（10:30 JST）→ 整体 0，即便有新的合格用户。
        early = base_jst.replace(hour=10).astimezone(timezone.utc).isoformat()
        assert server.run_jlpt_streak_reminders(early) == 0

        # --- B2-3 错题复习提醒 -------------------------------------------------
        PUSHES.clear()
        # D: 最后活动 3 天前，6 道错题 → 第一档（T+1）发。中文（无 settings）。
        ud = _make_user(conn)
        for i in range(6):
            _attempt(conn, ud, qids[i], days_ago(3), correct=False)
        # H: 最后活动 5 天前，6 道错题 → 第二档（T+3）发。
        uh = _make_user(conn)
        for i in range(6):
            _attempt(conn, uh, qids[i], days_ago(5), correct=False)
        # E: 最后活动 4 天前 → 两档之间，不发。
        ue = _make_user(conn)
        for i in range(6):
            _attempt(conn, ue, qids[i], days_ago(4), correct=False)
        # F: 最后活动 3 天前但只有 3 道错题 → 不足 5，不发。
        uf = _make_user(conn)
        for i in range(3):
            _attempt(conn, uf, qids[i], days_ago(3), correct=False)
        # G: 错题够但今天的学习提醒名额已被占（共享 ledger）→ 不发。
        ug = _make_user(conn)
        for i in range(6):
            _attempt(conn, ug, qids[i], days_ago(3), correct=False)
        conn.commit()
        today = jlpt.jst_date(now)
        assert server._jlpt_study_reminder_claim(conn, ug, today, "streak") is True
        conn.commit()

        sent = server.run_jlpt_review_reminders(now)
        assert sent == 2, f"expected 2 review reminders (T+1 & T+3 tiers), got {sent}"
        got = {uid: content for (uid, ntype, content) in PUSHES}
        assert set(got) == {ud, uh}, got
        assert all(ntype == "guide_reminder" for (_u, ntype, _c) in PUSHES)
        assert "6 道错题" in got[ud], got[ud]  # 数字与错题本口径一致
        assert _notif_count(conn, ue) == 0 and _notif_count(conn, uf) == 0 and _notif_count(conn, ug) == 0
        # 幂等：再跑 → 0；ledger kind 落表可复盘。
        assert server.run_jlpt_review_reminders(now) == 0
        kinds = {r["user_id"]: r["kind"] for r in conn.execute(
            "SELECT user_id, kind FROM jlpt_study_reminders WHERE jst_date = ?", (today,)
        ).fetchall()}
        assert kinds[ua] == "streak" and kinds[ud] == "review" and kinds[uh] == "review"
        # 静音夜间（22:30 JST）→ 复习提醒也整体 0（不浪费当日名额）。
        night = base_jst.replace(hour=22, minute=30).astimezone(timezone.utc).isoformat()
        assert server.run_jlpt_review_reminders(night) == 0

        # 文案合规抽查：纯功能性，不带商品/价格/购买引导（4.5.4）。
        for (_uid, _ntype, content) in PUSHES:
            for banned in ("购买", "商城", "会员", "币", "¥", "優待", "buy", "store"):
                assert banned not in content, f"study reminder copy must stay functional: {content}"

        print("OK")
    finally:
        conn.close()
        try:
            os.unlink(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
