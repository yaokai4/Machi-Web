"""APNs push delivery for Machi — stdlib + `cryptography` + system curl.

Sends real Apple Push Notifications so likes / comments / follows / DMs
reach users even when the app is killed. Token-based auth (ES256 JWT from
a .p8 key); HTTP/2 transport via the system `curl` binary so the server
keeps its zero-extra-pip-dependency policy (Amazon Linux 2023 curl ships
HTTP/2).

Configuration (all env; missing key == feature off, zero behavior change):
    APNS_TEAM_ID      Apple Developer Team ID (10 chars)
    APNS_KEY_ID       Key ID of the .p8 auth key (10 chars)
    APNS_KEY_P8       The .p8 private key PEM **content** …
    APNS_KEY_P8_PATH  … or a path to the .p8 file (wins when both set)
    APNS_BUNDLE_ID    apns-topic, default com.yaokai.kaizi
    APNS_ENVIRONMENT  production | sandbox (default production)

Wire-up: server.py calls `configure(...)` once at boot, then fires
`enqueue(...)` after each notifications INSERT. Everything network happens
on one daemon worker; failures only ever drop a push, never a request.
"""

from __future__ import annotations

import json
import logging
import os
import queue
import subprocess
import threading
import time
import uuid
from typing import Any, Callable

APNS_TEAM_ID = (os.environ.get("APNS_TEAM_ID") or "").strip()
APNS_KEY_ID = (os.environ.get("APNS_KEY_ID") or "").strip()
APNS_KEY_P8 = (os.environ.get("APNS_KEY_P8") or "").strip()
APNS_KEY_P8_PATH = (os.environ.get("APNS_KEY_P8_PATH") or "").strip()
APNS_BUNDLE_ID = (os.environ.get("APNS_BUNDLE_ID") or "com.yaokai.kaizi").strip()
APNS_HOST = (
    "https://api.sandbox.push.apple.com"
    if (os.environ.get("APNS_ENVIRONMENT") or "production").strip().lower() == "sandbox"
    else "https://api.push.apple.com"
)

_log = logging.getLogger("kaix.error")

# Injected by server.py at boot so this module never imports server.py back.
_db_factory: Callable[[], Any] | None = None
_db_lock: Any = None

_queue: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=512)
_worker_started = False
_jwt_cache: tuple[str, float] = ("", 0.0)
_jwt_lock = threading.Lock()


def _load_private_key_pem() -> str:
    if APNS_KEY_P8_PATH:
        try:
            with open(APNS_KEY_P8_PATH, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return ""
    # Allow literal "\n" in env values (systemd EnvironmentFile is one-line).
    return APNS_KEY_P8.replace("\\n", "\n")


def apns_configured() -> bool:
    return bool(APNS_TEAM_ID and APNS_KEY_ID and (APNS_KEY_P8 or APNS_KEY_P8_PATH))


def _provider_jwt() -> str:
    """ES256 provider token, cached ~50 min (Apple allows 20–60)."""
    global _jwt_cache
    with _jwt_lock:
        token, born = _jwt_cache
        if token and time.time() - born < 50 * 60:
            return token
        try:
            import base64
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import ec, utils

            key = serialization.load_pem_private_key(_load_private_key_pem().encode("utf-8"), password=None)

            def b64url(data: bytes) -> str:
                return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

            header = b64url(json.dumps({"alg": "ES256", "kid": APNS_KEY_ID}).encode())
            claims = b64url(json.dumps({"iss": APNS_TEAM_ID, "iat": int(time.time())}).encode())
            signing_input = f"{header}.{claims}".encode("ascii")
            der_sig = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
            # JWT wants raw r||s, not DER.
            r, s = utils.decode_dss_signature(der_sig)
            raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
            token = f"{header}.{claims}.{b64url(raw)}"
            _jwt_cache = (token, time.time())
            return token
        except Exception:
            _log.warning("apns: provider JWT signing failed (check APNS_KEY_*)")
            return ""


def configure(db_factory: Callable[[], Any], db_lock: Any) -> None:
    """Inject the database accessors and start the worker (idempotent)."""
    global _db_factory, _db_lock, _worker_started
    _db_factory = db_factory
    _db_lock = db_lock
    if apns_configured() and not _worker_started:
        _worker_started = True
        threading.Thread(target=_worker, name="apns-push", daemon=True).start()
        logging.getLogger("kaix.access").info("apns push delivery enabled (%s)", APNS_HOST)


# Banner copy per notification type, mirrored from the clients so a push
# reads the same as the in-app row. Keyed zh/ja/en by recipient language.
_TYPE_COPY = {
    "like":     ("赞了你的帖子", "があなたの投稿にいいねしました", "liked your post"),
    "repost":   ("转发了你的帖子", "があなたの投稿をリポストしました", "reposted your post"),
    "comment":  ("评论了你的帖子", "があなたの投稿にコメントしました", "commented on your post"),
    "reply":    ("回复了你", "があなたに返信しました", "replied to you"),
    "mention":  ("提到了你", "があなたをメンションしました", "mentioned you"),
    "follow":   ("关注了你", "があなたをフォローしました", "followed you"),
    "bookmark": ("收藏了你的帖子", "があなたの投稿を保存しました", "bookmarked your post"),
    "message":  ("给你发来私信", "からメッセージが届きました", "sent you a message"),
    "listing_inquiry": ("咨询了你的发布", "があなたの出品に問い合わせました", "asked about your listing"),
}
_SYSTEM_TITLE = ("系统通知", "システム通知", "System notification")


def _lang_index(language: str) -> int:
    lang = (language or "").lower()
    if lang.startswith("ja"):
        return 1
    if lang.startswith("en"):
        return 2
    return 0


def enqueue(
    recipient_id: str,
    *,
    ntype: str,
    actor_id: str = "",
    content: str = "",
    post_id: str | None = None,
    conversation_id: str | None = None,
) -> None:
    """Queue one push. No-op when APNs isn't configured or the queue is
    saturated — push delivery is best-effort by design."""
    if not apns_configured() or not recipient_id:
        return
    if actor_id and actor_id == recipient_id:
        return  # never push your own actions back at you
    try:
        _queue.put_nowait({
            "recipient_id": recipient_id,
            "ntype": (ntype or "system").strip() or "system",
            "actor_id": actor_id or "",
            "content": (content or "").strip(),
            "post_id": post_id or "",
            "conversation_id": conversation_id or "",
        })
    except queue.Full:
        pass


def _worker() -> None:
    while True:
        job = _queue.get()
        try:
            _deliver(job)
        except Exception:
            _log.warning("apns: delivery worker error", exc_info=True)


def _deliver(job: dict[str, Any]) -> None:
    if _db_factory is None:
        return
    recipient_id = job["recipient_id"]
    with _db_factory() as conn:
        tokens = [
            dict(r) for r in conn.execute(
                "SELECT id, token FROM device_push_tokens WHERE user_id = ?", (recipient_id,)
            )
        ]
        if not tokens:
            return
        lang_row = conn.execute(
            "SELECT language FROM settings WHERE user_id = ?", (recipient_id,)
        ).fetchone()
        language = (lang_row["language"] if lang_row else "") or ""
        actor_name = ""
        if job["actor_id"]:
            actor_row = conn.execute(
                "SELECT display_name, handle FROM users WHERE id = ?", (job["actor_id"],)
            ).fetchone()
            if actor_row:
                actor_name = actor_row["display_name"] or actor_row["handle"] or ""
        unread_row = conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0", (recipient_id,)
        ).fetchone()
        badge = int(unread_row["c"] if unread_row else 0)

    idx = _lang_index(language)
    if job["ntype"] in _TYPE_COPY and actor_name:
        action = _TYPE_COPY[job["ntype"]][idx]
        title = f"{actor_name}{action}" if idx == 1 else f"{actor_name} {action}"
    elif job["ntype"] in _TYPE_COPY:
        action = _TYPE_COPY[job["ntype"]][idx]
        title = action if idx == 1 else action[0].upper() + action[1:] if idx == 2 else action
    else:
        title = _SYSTEM_TITLE[idx]

    aps: dict[str, Any] = {
        "alert": {"title": title},
        "sound": "default",
        "thread-id": f"machi.{job['ntype']}",
        "badge": max(0, badge),
    }
    body = job["content"]
    # Action-echo content ("赞了你的帖子") under an identical title reads
    # broken — only attach real user text.
    if body and body not in {c[0] for c in _TYPE_COPY.values()}:
        aps["alert"]["body"] = body[:160]
    payload: dict[str, Any] = {"aps": aps, "type": job["ntype"]}
    if job["post_id"]:
        payload["postId"] = job["post_id"]
    if job["conversation_id"]:
        payload["conversationId"] = job["conversation_id"]
    blob = json.dumps(payload, ensure_ascii=False)

    jwt = _provider_jwt()
    if not jwt:
        return
    dead: list[str] = []
    for entry in tokens:
        status, response = _post_one(entry["token"], blob, jwt)
        if status in (400, 410) and ("BadDeviceToken" in response or "Unregistered" in response or status == 410):
            dead.append(entry["id"])
    if dead:
        try:
            if _db_lock is not None:
                with _db_lock, _db_factory() as conn:
                    for token_id in dead:
                        conn.execute("DELETE FROM device_push_tokens WHERE id = ?", (token_id,))
            else:
                with _db_factory() as conn:
                    for token_id in dead:
                        conn.execute("DELETE FROM device_push_tokens WHERE id = ?", (token_id,))
        except Exception:
            pass


def _post_one(device_token: str, payload: str, jwt: str) -> tuple[int, str]:
    """One HTTP/2 POST via system curl. The JWT travels through stdin
    (`-K -`) so it never appears in the process list."""
    url = f"{APNS_HOST}/3/device/{device_token}"
    config = (
        f'url = "{url}"\n'
        f'header = "authorization: bearer {jwt}"\n'
        f'header = "apns-topic: {APNS_BUNDLE_ID}"\n'
        'header = "apns-push-type: alert"\n'
        'header = "apns-priority: 10"\n'
        'header = "content-type: application/json"\n'
    )
    try:
        proc = subprocess.run(
            ["curl", "--http2", "-sS", "-K", "-", "-X", "POST",
             "--data-binary", payload, "-w", "\n%{http_code}", "--max-time", "10"],
            input=config.encode("utf-8") + b"\n",
            capture_output=True,
            timeout=15,
        )
        out = proc.stdout.decode("utf-8", "replace").strip()
        body, _, code = out.rpartition("\n")
        return int(code or 0), body
    except Exception:
        return 0, ""


def register_token(conn: Any, user_id: str, token: str, platform: str, now_iso: str) -> None:
    """Upsert a device token. A token moving between accounts re-binds to
    the latest login (shared devices)."""
    token = (token or "").strip().lower()
    if not token or len(token) > 200:
        return
    conn.execute("DELETE FROM device_push_tokens WHERE token = ?", (token,))
    conn.execute(
        "INSERT INTO device_push_tokens (id, user_id, token, platform, created_at, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, token, (platform or "ios")[:16], now_iso, now_iso),
    )


def unregister_token(conn: Any, token: str) -> None:
    token = (token or "").strip().lower()
    if token:
        conn.execute("DELETE FROM device_push_tokens WHERE token = ?", (token,))
