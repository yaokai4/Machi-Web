"""APNs wiring e2e (no Apple credentials needed):

- POST /api/devices/push-token registers a row; re-registering the same
  token from another account REBINDS it; DELETE removes it.
- Social actions (like) run cleanly with APNs unconfigured (enqueue no-op).
- Route ordering: DELETE /api/devices/push-token must NOT be swallowed by
  the session-revoke startswith rule.

Boots its own server on :8797 with a throwaway DB.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = "/tmp/kaix_apns_test.db"
PORT = "8797"
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
            "handle": "apns_a", "email": "apns_a@x.com", "password": "Passw0rd1", "display_name": "A"})
        _, b = call("POST", "/api/auth/register", body={
            "handle": "apns_b", "email": "apns_b@x.com", "password": "Passw0rd1", "display_name": "B"})
        ta, tb = a["token"], b["token"]

        fake = "ab" * 32
        s, r = call("POST", "/api/devices/push-token", token=tb, body={"token": fake, "platform": "ios"})
        assert s == 200 and r.get("ok"), f"register failed: {s} {r}"
        assert r.get("apnsEnabled") is False, "APNs must report disabled without env keys"

        db = sqlite3.connect(DB)
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT user_id FROM device_push_tokens WHERE token = ?", (fake,)).fetchone()
        assert row and row["user_id"] == b["user"]["id"], "token row missing/wrong owner"

        # Shared device: same token registered by A rebinds, never duplicates.
        s, _ = call("POST", "/api/devices/push-token", token=ta, body={"token": fake})
        assert s == 200
        rows = db.execute("SELECT user_id FROM device_push_tokens WHERE token = ?", (fake,)).fetchall()
        assert len(rows) == 1 and rows[0]["user_id"] == a["user"]["id"], "token must rebind to latest login"

        # Social action with APNs dark — must not error.
        s, r = call("POST", "/api/posts", token=tb, body={"content": "apns wiring probe", "content_type": "dynamic"})
        assert s in (200, 201), f"create post failed: {s} {r}"
        post_id = (r.get("post") or r).get("id")
        s, _ = call("POST", f"/api/posts/{post_id}/like", token=ta)
        assert s == 200, f"like failed with APNs dark: {s}"

        s, _ = call("DELETE", "/api/devices/push-token", token=ta, body={"token": fake})
        assert s == 200, "unregister route swallowed or failed"
        gone = db.execute("SELECT 1 FROM device_push_tokens WHERE token = ?", (fake,)).fetchone()
        assert gone is None, "token must be deleted"
        db.close()
        print("OK")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
