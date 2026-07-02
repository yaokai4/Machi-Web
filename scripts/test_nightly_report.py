#!/usr/bin/env python3
"""Nightly metrics report (server.run_nightly_report) + /api/guide/sitemap.

Exercises the pure report function against a throwaway SQLite DB with a fixed
JST report day (same harness as test_guide_profile.py). Focus:
  * 新注册 counts only real users registered on the report day (JST)
  * 激活率: post / 当日 AI user 消息 ≥2 activate; a single AI message does NOT
  * vWAU: 7-day window unions all value-action domains, deduped
  * W1 回访: 8–14 天前注册 cohort, first-week active on ≥2 distinct JST days
  * seed accounts (content_pack_users + machi_assistant_*) excluded everywhere
  * saved_searches total vs. 昨日新增; AI message volume counts guests too
  * /api/guide/sitemap: 200 + {ok, data.{schools,companies,articles}}, published only

Run:  cd web && python3 scripts/test_nightly_report.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_nightly_report_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

JST = timezone(timedelta(hours=9))
REPORT_DAY = "2026-06-15"  # fixed JST report day → deterministic windows


def _at(jst_day: str, hour: int = 12, minute: int = 0) -> str:
    """UTC ISO timestamp for a wall-clock moment on a JST calendar day."""
    local = datetime.fromisoformat(jst_day).replace(hour=hour, minute=minute, tzinfo=JST)
    return local.astimezone(timezone.utc).isoformat()


def _day_offset(days: int) -> str:
    return (datetime.fromisoformat(REPORT_DAY) + timedelta(days=days)).date().isoformat()


def _make_user(conn, created_at: str, handle: str | None = None) -> str:
    uid = str(uuid.uuid4())
    handle = handle or ("u" + uuid.uuid4().hex[:8])
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, joined_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (uid, handle, handle, f"{handle}@example.com", "x", created_at, created_at, created_at),
    )
    return uid


def _post(conn, uid: str, at: str, seed: int = 0) -> str:
    pid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO posts (id, author_id, content, is_seed_content, created_at, updated_at) VALUES (?, ?, 'p', ?, ?, ?)",
        (pid, uid, seed, at, at),
    )
    return pid


def _comment(conn, uid: str, at: str, post_id: str) -> None:
    conn.execute(
        "INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, 'c', ?, ?)",
        (str(uuid.uuid4()), post_id, uid, at, at),
    )


def _dm(conn, uid: str, peer: str, at: str) -> None:
    # conversations UNIQUE(participant_a, participant_b) — one row per pair.
    cid = f"cv-{uid[:8]}-{peer[:8]}"
    conn.execute(
        "INSERT OR IGNORE INTO conversations (id, participant_a, participant_b, updated_at) VALUES (?, ?, ?, ?)",
        (cid, uid, peer, at),
    )
    conn.execute(
        "INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, 'm', ?)",
        (str(uuid.uuid4()), cid, uid, at),
    )


def _saved_search(conn, uid: str, at: str) -> None:
    conn.execute(
        "INSERT INTO saved_searches (id, user_id, created_at) VALUES (?, ?, ?)",
        (str(uuid.uuid4()), uid, at),
    )


def _ai_msg(conn, uid: str, at: str) -> None:
    conn.execute(
        "INSERT INTO guide_ai_messages (id, conversation_id, user_id, role, content, created_at) "
        "VALUES (?, 'aicv', ?, 'user', 'q', ?)",
        (str(uuid.uuid4()), uid, at),
    )


def _handler():
    h = server.Handler.__new__(server.Handler)
    captured: dict = {}
    h.send_json = lambda data, status=200: captured.update(data=data, status=status)  # type: ignore[method-assign]
    h.headers = {}
    h.client_address = ("127.0.0.1", 0)
    return h, captured


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        # ── report-day registrations ────────────────────────────────────────
        u1 = _make_user(conn, _at(REPORT_DAY, 9))          # activates via post + saved search
        u2 = _make_user(conn, _at(REPORT_DAY, 10))         # 1 AI message only → NOT activated
        u4 = _make_user(conn, _at(REPORT_DAY, 11))         # 2 AI messages same day → activated
        p1 = _post(conn, u1, _at(REPORT_DAY, 12))
        _saved_search(conn, u1, _at(REPORT_DAY, 13))
        _ai_msg(conn, u2, _at(REPORT_DAY, 12))
        _ai_msg(conn, u4, _at(REPORT_DAY, 12))
        _ai_msg(conn, u4, _at(REPORT_DAY, 13))

        # seed accounts registered + acting the same day must vanish from every metric
        seed = _make_user(conn, _at(REPORT_DAY, 9))
        server._ensure_content_pack_users_table(conn)
        conn.execute(
            "INSERT INTO content_pack_users (user_id, handle, pack_version, created_at) VALUES (?, 'sx', 'v1', ?)",
            (seed, _at(REPORT_DAY, 9)),
        )
        bot = _make_user(conn, _at(REPORT_DAY, 9), handle="machi_assistant_zz")
        _post(conn, seed, _at(REPORT_DAY, 12))
        _comment(conn, bot, _at(REPORT_DAY, 12), p1)
        _ai_msg(conn, seed, _at(REPORT_DAY, 12))

        # ── vWAU extras: u3 commented 3 days before the report day ──────────
        u3 = _make_user(conn, _at(_day_offset(-20), 9))
        _comment(conn, u3, _at(_day_offset(-3), 15), p1)

        # ── W1 cohort (registered 8–14 days before the report day) ──────────
        u5 = _make_user(conn, _at(_day_offset(-10), 9))    # active reg-day + reg+2 → retained
        u6 = _make_user(conn, _at(_day_offset(-9), 9))     # active 1 day only → not retained
        _saved_search(conn, u5, _at(_day_offset(-10), 15))
        _dm(conn, u5, u6, _at(_day_offset(-8), 15))
        _dm(conn, u6, u5, _at(_day_offset(-9), 15))

        # guest AI message: counts toward volume, never toward activation/vWAU
        _ai_msg(conn, "guest:" + "a" * 16, _at(REPORT_DAY, 14))
        conn.commit()

        report = server.run_nightly_report(conn, jst_day=REPORT_DAY)

        # 1) 新注册: u1/u2/u4 — seed + bot excluded.
        assert report["new_users"] == 3, report
        # 2) 激活: u1 (post) + u4 (2 AI msgs); u2's single AI message is not enough.
        assert report["activated"] == 2, report
        assert abs(report["activation_rate"] - 2 / 3) < 1e-9, report
        # 3) vWAU: u1, u4, u3 (comment 3d ago) — u2/seeds/guests excluded.
        assert report["vwau"] == 3, report
        # 4) W1: cohort={u5,u6}, retained={u5}.
        assert report["w1_cohort"] == 2 and report["w1_retained"] == 1, report
        assert abs(report["w1_retention_rate"] - 0.5) < 1e-9, report
        # 5) saved searches: u1 (report day) + u5 (10d ago).
        assert report["saved_search_total"] == 2, report
        assert report["saved_search_new"] == 1, report
        # 6) AI volume: u2(1) + u4(2) + guest(1) = 4; seed message excluded; no alert.
        assert report["ai_user_messages"] == 4, report
        assert report["ai_alert"] is False, report
        assert REPORT_DAY in report["text"] and "激活率" in report["text"], report["text"]

        # ── /api/guide/sitemap ───────────────────────────────────────────────
        now = server.now_iso()
        conn.execute(
            "INSERT INTO guide_articles (id, title, slug, status, created_at, updated_at) "
            "VALUES ('ga1', 'A', 'pub-article', 'published', ?, ?)", (now, now))
        conn.execute(
            "INSERT INTO guide_articles (id, title, slug, status, created_at, updated_at) "
            "VALUES ('ga2', 'B', 'draft-article', 'draft', ?, ?)", (now, now))
        conn.execute(
            "INSERT INTO guide_schools (id, slug, school_name, status, created_at, updated_at) "
            "VALUES ('gs1', 'pub-school', 'S', 'published', ?, ?)", (now, now))
        conn.execute(
            "INSERT INTO guide_companies (id, company_name, slug, status, created_at, updated_at) "
            "VALUES ('gc1', 'C', 'pub-company', 'published', ?, ?)", (now, now))
        conn.commit()

        h, captured = _handler()
        h.api_guide_sitemap(conn, {})
        assert captured["status"] == 200, captured
        data = captured["data"]
        assert data["ok"] is True, list(data)
        # init_db seeds published guide content, so assert membership, not equality.
        article_slugs = [e["slug"] for e in data["data"]["articles"]]
        assert "pub-article" in article_slugs and "draft-article" not in article_slugs, article_slugs
        assert "pub-school" in [e["slug"] for e in data["data"]["schools"]], "school missing"
        assert "pub-company" in [e["slug"] for e in data["data"]["companies"]], "company missing"
        assert all(e["updated_at"] for e in data["data"]["articles"]), "updated_at missing"

        print("test_nightly_report: all assertions passed")
    finally:
        conn.close()
        try:
            os.unlink(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
