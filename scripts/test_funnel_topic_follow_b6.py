#!/usr/bin/env python3
"""B6 endpoints e2e (no external services needed): boots a real server on a
throwaway DB and exercises

  * POST /api/funnel — guest + logged-in, event whitelist (400 on unknown),
    returns {ok:true}; writes nothing to a table (structured log only).
  * POST/DELETE /api/topics/<tag>/follow — idempotent follow/unfollow, requires
    auth; GET /api/my/topic-follows lists the caller's followed tags.
  * @mention end-to-end: creating a post that @-mentions another user writes a
    'mention' notification for that user (real routing, not just the helper).

Boots its own server on :8798 with a throwaway DB.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "/tmp/kaix_b6_endpoints_test.db"
PORT = "8798"
BASE = f"http://127.0.0.1:{PORT}"


def call(method, path, token=None, body=None):
    req = urllib.request.Request(
        BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json",
                 **({"Authorization": "Bearer " + token} if token else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    for ext in ("", "-wal", "-shm"):
        try:
            os.remove(DB + ext)
        except FileNotFoundError:
            pass
    env = {**os.environ, "KAIX_DB_PATH": DB, "KAIX_PORT": PORT,
           "KAIX_ENABLE_SCHEDULERS": "0", "KAIX_CAPTCHA_ENABLED": "0"}
    proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py")],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            time.sleep(0.5)
            try:
                urllib.request.urlopen(BASE + "/healthz", timeout=2)
                break
            except Exception:
                continue
        else:
            raise SystemExit("server failed to boot")

        _, a = call("POST", "/api/auth/register", body={
            "handle": "b6_alice", "email": "b6_alice@x.com", "password": "Passw0rd1", "display_name": "Alice"})
        _, b = call("POST", "/api/auth/register", body={
            "handle": "b6_bob", "email": "b6_bob@x.com", "password": "Passw0rd1", "display_name": "Bob"})
        ta, tb = a["token"], b["token"]

        # ---- /api/funnel ----
        # guest funnel event, whitelisted -> ok
        s, r = call("POST", "/api/funnel", body={"event": "listing_impression", "entityType": "listing", "entityId": "L1"})
        assert s == 200 and r.get("ok"), f"guest funnel should succeed: {s} {r}"
        # logged-in funnel event -> ok
        s, r = call("POST", "/api/funnel", token=ta, body={"event": "compose_open"})
        assert s == 200 and r.get("ok"), f"logged-in funnel should succeed: {s} {r}"
        # unknown event -> 400
        s, r = call("POST", "/api/funnel", body={"event": "totally_made_up"})
        assert s == 400 and r.get("code") == "invalid_event", f"unknown event must 400: {s} {r}"

        # ---- topic follow ----
        # unauth follow -> 401/403
        s, _ = call("POST", "/api/topics/ramen/follow")
        assert s in (401, 403), f"topic follow must require auth, got {s}"
        # follow (idempotent)
        s, r = call("POST", "/api/topics/ramen/follow", token=ta)
        assert s == 200 and r.get("following") is True and r.get("tag") == "ramen", f"follow failed: {s} {r}"
        s, r = call("POST", "/api/topics/ramen/follow", token=ta)
        assert s == 200, "second follow must be idempotent, not error"
        # follow a second tag with a leading '#'
        s, r = call("POST", "/api/topics/%23tokyo/follow", token=ta)
        assert s == 200 and r.get("tag") == "tokyo", f"'#' must be stripped: {s} {r}"
        # list my follows
        s, r = call("GET", "/api/my/topic-follows", token=ta)
        assert s == 200 and set(r.get("tags") or []) == {"ramen", "tokyo"}, f"my follows wrong: {s} {r}"
        # unfollow
        s, r = call("DELETE", "/api/topics/ramen/follow", token=ta)
        assert s == 200 and r.get("following") is False, f"unfollow failed: {s} {r}"
        s, r = call("GET", "/api/my/topic-follows", token=ta)
        assert set(r.get("tags") or []) == {"tokyo"}, f"unfollow not reflected: {r}"

        db = sqlite3.connect(DB)
        db.row_factory = sqlite3.Row
        cnt = db.execute("SELECT COUNT(*) AS c FROM topic_follows WHERE user_id = ?", (a["user"]["id"],)).fetchone()["c"]
        assert cnt == 1, f"exactly one topic_follows row should remain, got {cnt}"

        # ---- @mention end-to-end (real /api/posts route) ----
        s, r = call("POST", "/api/posts", token=tb,
                    body={"content": "hey @b6_alice check this out", "content_type": "dynamic"})
        assert s in (200, 201), f"create post failed: {s} {r}"
        # give the request thread a beat to have committed
        time.sleep(0.3)
        m = db.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'mention'",
            (a["user"]["id"],),
        ).fetchone()["c"]
        assert m == 1, f"alice should have exactly one mention notification, got {m}"
        # the author themself must not get a self-mention row
        s2, r2 = call("POST", "/api/posts", token=tb,
                      body={"content": "note to self @b6_bob", "content_type": "dynamic"})
        assert s2 in (200, 201)
        time.sleep(0.3)
        self_m = db.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'mention'",
            (b["user"]["id"],),
        ).fetchone()["c"]
        assert self_m == 0, f"self-mention must not notify, got {self_m}"
        db.close()
        print("OK")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        for ext in ("", "-wal", "-shm"):
            try:
                os.remove(DB + ext)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    main()
