#!/usr/bin/env python3
"""Regression: deleting a post must not leave its reposts dangling.

Before the fix, deleting an original post left its pure-reposts live in every
feed (still rendering the now-deleted content) and their reposters could not
undo them (api_repost 404'd on the deleted original). This covers:

  1. api_delete_post cascades: pure-reposts get soft-deleted, repost
     interactions dropped, and fetch_posts_with_extras stops surfacing the
     deleted original.
  2. api_repost undo tolerates a deleted/legacy original (no 404), so a
     lingering repost can always be cleared.
  3. migration v87 heals rows that were already dangling before the fix.

Run: cd web && python3 scripts/test_repost_deleted_original.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"repost_del_test_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_ENABLE_SCHEDULERS"] = "0"
os.environ["KAIX_PASSWORD_PEPPER"] = "repost-del-test-pepper-not-for-prod"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} :: {detail}")


def handler_for(user_id: str) -> server.Handler:
    h = server.Handler.__new__(server.Handler)
    h.headers = {}
    h.payloads = []
    h.send_json = lambda payload, status=200: h.payloads.append(payload)
    h.current_session = lambda conn, _uid=user_id: {"user_id": _uid}
    return h


def make_user(conn, uid: str, handle: str) -> None:
    now = server.now_iso()
    conn.execute(
        "INSERT INTO users (id, handle, display_name, email, password_hash, created_at, updated_at, joined_at) "
        "VALUES (?, ?, ?, '', 'x', ?, ?, ?)",
        (uid, handle, handle.title(), now, now, now),
    )


def make_post(conn, pid: str, author_id: str) -> None:
    now = server.now_iso()
    conn.execute(
        "INSERT INTO posts (id, author_id, content, status, created_at, updated_at, country, content_type) "
        "VALUES (?, ?, ?, 'published', ?, ?, 'jp', 'dynamic')",
        (pid, author_id, "行程攻略：高田马场→中野→吉祥寺", now, now),
    )


def repost_row(conn, reposter_id: str, original_id: str):
    return conn.execute(
        "SELECT * FROM posts WHERE author_id = ? AND repost_of_id = ? AND COALESCE(content,'')=''",
        (reposter_id, original_id),
    ).fetchone()


def main() -> None:
    server.init_db()
    # Keep the test hermetic: no push/realtime side effects.
    server.server_apns.enqueue = lambda *a, **k: None
    server.HUB.publish = lambda *a, **k: None

    conn = server.db()
    try:
        author = "u_author"
        reposter = "u_reposter"
        make_user(conn, author, "author")
        make_user(conn, reposter, "reposter")

        # ---- Scenario 1: cascade on delete -------------------------------
        p1 = "p_cascade"
        make_post(conn, p1, author)
        handler_for(reposter).api_repost(conn, p1, True)

        rp = repost_row(conn, reposter, p1)
        check("repost row created", rp is not None)
        check("repost row active before delete", rp is not None and rp["deleted_at"] is None and rp["status"] == "active")
        cnt = conn.execute(
            "SELECT COUNT(*) c FROM interactions WHERE target_id=? AND user_id=? AND kind='repost'",
            (p1, reposter),
        ).fetchone()["c"]
        check("repost interaction recorded", cnt == 1)

        # Author deletes the original.
        handler_for(author).api_delete_post(conn, p1)

        rp2 = repost_row(conn, reposter, p1)
        check("repost row soft-deleted by cascade", rp2 is not None and rp2["deleted_at"] is not None and rp2["status"] == "deleted")
        cnt2 = conn.execute(
            "SELECT COUNT(*) c FROM interactions WHERE target_id=? AND kind='repost'", (p1,)
        ).fetchone()["c"]
        check("repost interactions cleared by cascade", cnt2 == 0)

        # The repost no longer appears in any visibility-filtered query.
        visible = conn.execute(
            "SELECT COUNT(*) c FROM posts WHERE id=? AND deleted_at IS NULL AND status IN ('published','active')",
            (rp["id"],),
        ).fetchone()["c"]
        check("repost hidden from feed queries", visible == 0)

        # Even if a stale repost row is hydrated, the deleted original never leaks.
        hydrated = server.fetch_posts_with_extras(conn, [dict(rp)], reposter)
        check("deleted original not surfaced in repost", hydrated and hydrated[0].get("original_post") is None,
              detail=str(hydrated[0].get("original_post") if hydrated else None))

        # ---- Scenario 2: undo tolerates a legacy deleted original --------
        # Simulate a pre-fix state: original soft-deleted directly (no cascade),
        # repost + interaction left dangling.
        p2 = "p_legacy_undo"
        make_post(conn, p2, author)
        handler_for(reposter).api_repost(conn, p2, True)
        conn.execute(
            "UPDATE posts SET status='deleted', deleted_at=? WHERE id=?",
            (server.now_iso(), p2),
        )
        legacy_rp = repost_row(conn, reposter, p2)
        check("legacy repost dangling before undo", legacy_rp is not None and legacy_rp["deleted_at"] is None)

        undo_handler = handler_for(reposter)
        raised = None
        try:
            undo_handler.api_repost(conn, p2, False)
        except server.APIError as e:  # pragma: no cover - the bug we fixed
            raised = e
        check("undo does not 404 on deleted original", raised is None,
              detail=(raised.code if raised else ""))

        legacy_rp2 = repost_row(conn, reposter, p2)
        check("undo soft-deletes the lingering repost", legacy_rp2 is not None and legacy_rp2["deleted_at"] is not None)
        left = conn.execute(
            "SELECT COUNT(*) c FROM interactions WHERE target_id=? AND user_id=? AND kind='repost'",
            (p2, reposter),
        ).fetchone()["c"]
        check("undo removes the repost interaction", left == 0)

        # ---- Scenario 3: reposting a deleted post is still refused --------
        refuse = None
        try:
            handler_for(reposter).api_repost(conn, p2, True)
        except server.APIError as e:
            refuse = e
        check("cannot repost a deleted original", refuse is not None and refuse.status == 404,
              detail=(refuse.code if refuse else "no error"))

        # ---- Scenario 4: migration v87 heals pre-existing dangling rows --
        p3 = "p_migration"
        make_post(conn, p3, author)
        handler_for(reposter).api_repost(conn, p3, True)
        # Delete only the original, bypassing the cascade (legacy data shape).
        conn.execute(
            "UPDATE posts SET status='deleted', deleted_at=? WHERE id=?",
            (server.now_iso(), p3),
        )
        pre = repost_row(conn, reposter, p3)
        check("migration setup: repost dangling", pre is not None and pre["deleted_at"] is None)

        mig_sql = {v: sql for v, _note, sql in server.MIGRATIONS}[87]
        conn.executescript(mig_sql)

        healed = repost_row(conn, reposter, p3)
        check("migration soft-deletes dangling repost", healed is not None and healed["deleted_at"] is not None)
        mig_left = conn.execute(
            "SELECT COUNT(*) c FROM interactions WHERE target_id=? AND kind='repost'", (p3,)
        ).fetchone()["c"]
        check("migration clears orphan repost interactions", mig_left == 0)

        # A healthy repost (live original) must survive the migration untouched.
        p_ok = "p_alive"
        make_post(conn, p_ok, author)
        handler_for(reposter).api_repost(conn, p_ok, True)
        conn.executescript(mig_sql)
        alive = repost_row(conn, reposter, p_ok)
        check("migration leaves live reposts alone", alive is not None and alive["deleted_at"] is None)

        # ---- Scenario 5: account scrub cascades to reposts ---------------
        victim = "u_victim"
        make_user(conn, victim, "victim")
        p5 = "p_scrub"
        make_post(conn, p5, victim)
        handler_for(reposter).api_repost(conn, p5, True)
        server.anonymize_user_account(conn, victim)
        scrub_rp = repost_row(conn, reposter, p5)
        check("account scrub retires reposts of the scrubbed user's posts",
              scrub_rp is not None and scrub_rp["deleted_at"] is not None)
        scrub_left = conn.execute(
            "SELECT COUNT(*) c FROM interactions WHERE target_id=? AND kind='repost'", (p5,)
        ).fetchone()["c"]
        check("account scrub clears repost interactions", scrub_left == 0)

        # A repost of an unrelated live post must not be swept by the scrub.
        p_bystander = "p_bystander"
        make_post(conn, p_bystander, author)
        handler_for(reposter).api_repost(conn, p_bystander, True)
        server.anonymize_user_account(conn, victim)  # idempotent re-run
        bystander = repost_row(conn, reposter, p_bystander)
        check("scrub leaves unrelated live reposts alone",
              bystander is not None and bystander["deleted_at"] is None)

        conn.commit()
    finally:
        conn.close()
        try:
            _TMP.unlink()
        except OSError:
            pass

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
