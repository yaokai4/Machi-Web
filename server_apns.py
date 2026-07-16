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
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
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

# Delivery-policy knobs (env-overridable, same read-at-import style as the
# APNS_* credentials above). Quiet hours mute non-transactional pushes during
# the JST night; the daily cap budgets reminder-type pushes per user. Both
# gates only skip the APNs send — the in-app notification row is written by
# the caller before enqueue() and is never affected.
APNS_QUIET_HOURS_ENABLED = (os.environ.get("APNS_QUIET_HOURS_ENABLED") or "1").strip() != "0"
APNS_QUIET_START_HOUR = int((os.environ.get("APNS_QUIET_START_HOUR") or "22").strip() or "22")
APNS_QUIET_END_HOUR = int((os.environ.get("APNS_QUIET_END_HOUR") or "9").strip() or "9")
APNS_DAILY_CAP_ENABLED = (os.environ.get("APNS_DAILY_CAP_ENABLED") or "1").strip() != "0"
# 默认 2（2026-07 B1-10）：saved_search / system / follow_digest / city_digest
# 四类召回抢每日 1 个名额互相挤兑,提到 2 缓解;env 可覆盖。
APNS_DAILY_CAP_PER_USER = int((os.environ.get("APNS_DAILY_CAP_PER_USER") or "2").strip() or "2")

# Japan-market product: recipient-local night == JST night.
_JST = timezone(timedelta(hours=9))

_log = logging.getLogger("kaix.error")

# Injected by server.py at boot so this module never imports server.py back.
_db_factory: Callable[[], Any] | None = None
_db_lock: Any = None

_queue: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=512)
_worker_started = False
_jwt_cache: tuple[str, float] = ("", 0.0)
_jwt_lock = threading.Lock()

# An iOS APNs device token is lowercase hexadecimal (32 bytes → 64 hex chars
# today; Apple reserves the right to lengthen it). We pin that exact shape and
# re-check it at BOTH ends of the pipe — when a token is registered, and again
# the instant before it is placed in a curl request. This is the load-bearing
# guard against config-file injection: hostile input embedding a `"` or newline
# (aiming to break out of curl's `-K` config to exfiltrate the ES256 provider
# JWT or write arbitrary files via `-o`) simply is not hex, so it is refused at
# every layer. `fullmatch` also rejects a trailing newline, which `$` would not.
_DEVICE_TOKEN_RE = re.compile(r"[0-9a-f]{16,200}")


def _is_valid_device_token(token: str) -> bool:
    """Defense-in-depth predicate: True only for a well-formed lowercase-hex
    APNs device token. Called at registration and again before every send."""
    return bool(token) and _DEVICE_TOKEN_RE.fullmatch(token) is not None


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
    "saved_search": ("有新的匹配信息", "保存した検索に新しい一致があります", "New match for your saved search"),
    # Growth hooks (B6). These have no actor to prefix — the delivery path
    # attaches the body text (real user-facing copy assembled server-side) and
    # falls back to these action strings for the banner title.
    "favorite_price_drop": ("你收藏的信息降价了", "保存した出品が値下げされました", "A listing you saved dropped in price"),
    "favorite_closed": ("你收藏的信息已下架", "保存した出品が掲載終了しました", "A listing you saved was taken down"),
    "follow_digest": ("你关注的人发布了新内容", "フォロー中のユーザーが新しく投稿しました", "People you follow shared new posts"),
    "city_digest": ("你的城市有新动态", "あなたの街に新しい情報があります", "New activity in your city"),
}
_SYSTEM_TITLE = ("系统通知", "システム通知", "System notification")

# Maps a notification type → the settings push toggle that gates it. Types not
# listed (system / repost / bookmark / mention) are always delivered. Missing
# column / settings row defaults to enabled (opt-out, never opt-in by silence).
_PREF_COLUMN = {
    "like": "push_likes",
    "comment": "push_comments",
    "reply": "push_comments",
    "follow": "push_follows",
    "message": "push_messages",
    "listing_inquiry": "push_inquiries",
    "listing_review": "push_inquiries",
    "listing_review_reply": "push_inquiries",
    # v55 declared push_inquiries as the "inquiries/applications/bookings"
    # toggle, so booking pushes honour the same switch.
    "booking": "push_inquiries",
}

# Delivery-policy classes. Transactional pushes answer something the recipient
# is actively waiting on (DMs, listing inquiries + their status changes, review
# activity on their listings, booking confirmations/cancellations) — they
# deliver day and night, uncapped. Capped types are reminder/digest-flavoured
# (saved-search matches; "system" carries announcements, badges and budget
# reminders today) and share one small daily budget per user. Everything else
# ("guide_reminder" deadline alerts, social like/comment/reply/follow/repost/
# mention/bookmark) is in neither set: uncapped, but muted in quiet hours.
_TRANSACTIONAL_TYPES = {
    "message",
    "listing_inquiry",
    "listing_inquiry_status",
    "listing_review",
    "listing_review_reply",
    "booking",
    # Favorite price-drop / take-down (B6): low-frequency, high-value alerts
    # about a listing the recipient explicitly saved — deliver day and night,
    # uncapped, like other "something you're tracking changed" pushes.
    "favorite_price_drop",
    "favorite_closed",
}
_CAPPED_TYPES = {
    "saved_search",
    "system",
    # Daily digests (B6): follow_digest ("你关注的 N 人发布了新内容" + followed
    # topics) and city_digest (inactive-user recall) are reminder-flavoured, so
    # they share the small per-user daily push budget and can't stack up.
    "follow_digest",
    "city_digest",
}
# High-volume social pushes about one post — collapsed per (type, post) so a
# burst of likes/reposts replaces the previous banner instead of stacking (B6).
_COLLAPSE_TYPES = {
    "like",
    "repost",
}


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
    message_id: str | None = None,
    listing_id: str | None = None,
    title: str = "",
    force: bool = False,
) -> None:
    """Queue one push. No-op when APNs isn't configured or the queue is
    saturated — push delivery is best-effort by design.

    `title` overrides the type-derived banner title (used by admin broadcasts,
    which carry their own copy). `force=True` bypasses the JST quiet-hours mute
    and the per-user daily cap — reserved for deliberate, admin-authored urgent
    broadcasts; it never applies to automated/social pushes."""
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
            "message_id": message_id or "",
            "listing_id": listing_id or "",
            "title": (title or "").strip(),
            "force": bool(force),
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


def _now_jst() -> datetime:
    """Current JST time; a seam so tests can pin the clock."""
    return datetime.now(_JST)


def _in_quiet_hours() -> bool:
    """True inside the JST quiet window [APNS_QUIET_START_HOUR,
    APNS_QUIET_END_HOUR) — with the defaults, [22:00, 09:00)."""
    if not APNS_QUIET_HOURS_ENABLED:
        return False
    hour = _now_jst().hour
    start, end = APNS_QUIET_START_HOUR, APNS_QUIET_END_HOUR
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end  # window wraps midnight (22 → 9)


def _consume_daily_cap(conn: Any, recipient_id: str) -> bool:
    """Atomically claim one slot of today's per-user push budget; False means
    the budget is spent and this send must be skipped. Same UPSERT+RETURNING
    shape as guide_ai_usage, so concurrent workers can never both land under
    the cap. Ledger trouble (e.g. table not migrated yet) fails open — a
    policy gate must never break delivery outright."""
    try:
        row = conn.execute(
            "INSERT INTO apns_push_ledger (user_id, jst_date, count) VALUES (?, ?, 1) "
            "ON CONFLICT(user_id, jst_date) DO UPDATE SET count = apns_push_ledger.count + 1 "
            "RETURNING count",
            (recipient_id, _now_jst().strftime("%Y-%m-%d")),
        ).fetchone()
        return int(row["count"] if row else 1) <= APNS_DAILY_CAP_PER_USER
    except Exception:
        return True


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
        settings_row = conn.execute(
            "SELECT * FROM settings WHERE user_id = ?", (recipient_id,)
        ).fetchone()
        sdict = dict(settings_row) if settings_row else {}
        language = (sdict.get("language") or "")
        # Respect the recipient's per-type push preference (opt-out). Skip the
        # whole delivery if this category is turned off.
        pref_col = _PREF_COLUMN.get(job["ntype"])
        if pref_col is not None and not bool(sdict.get(pref_col, 1)):
            return
        # Forced (urgent) admin broadcasts bypass both throttles below.
        force = bool(job.get("force"))
        # Gate 1 — JST quiet hours: non-transactional pushes never buzz a
        # phone at night; the in-app notification row is still there in the
        # morning. Transactional types (someone is waiting) always go out.
        if not force and job["ntype"] not in _TRANSACTIONAL_TYPES and _in_quiet_hours():
            return
        # Gate 2 — daily budget: reminder-type pushes share one small
        # per-user per-JST-day allowance so saved-search / system nudges
        # can't stack up into spam.
        if (not force and APNS_DAILY_CAP_ENABLED and job["ntype"] in _CAPPED_TYPES
                and not _consume_daily_cap(conn, recipient_id)):
            return
        actor_name = ""
        if job["actor_id"]:
            actor_row = conn.execute(
                "SELECT display_name, handle FROM users WHERE id = ?", (job["actor_id"],)
            ).fetchone()
            if actor_row:
                actor_name = actor_row["display_name"] or actor_row["handle"] or ""
        unread_row = conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL",
            (recipient_id,),
        ).fetchone()
        badge = int(unread_row["c"] if unread_row else 0)

    idx = _lang_index(language)
    # An explicit title (admin broadcast) always wins — it carries its own copy.
    override_title = (job.get("title") or "").strip()
    if override_title:
        title = override_title[:120]
    elif job["ntype"] in _TYPE_COPY and actor_name:
        action = _TYPE_COPY[job["ntype"]][idx]
        title = f"{actor_name}{action}" if idx == 1 else f"{actor_name} {action}"
    elif job["ntype"] in _TYPE_COPY:
        action = _TYPE_COPY[job["ntype"]][idx]
        title = action if idx == 1 else (action[:1].upper() + action[1:]) if idx == 2 else action
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
    if job.get("message_id"):
        payload["messageId"] = job["message_id"]
    if job.get("listing_id"):
        payload["listingId"] = job["listing_id"]
    blob = json.dumps(payload, ensure_ascii=False)

    jwt = _provider_jwt()
    if not jwt:
        return
    # Push aggregation (B6): collapse repeated social notifications about the
    # SAME post into one banner (Apple replaces the previous push with the same
    # apns-collapse-id) — 50 likes on one post shouldn't be 50 lock-screen
    # buzzes. Only for the high-volume social types on a specific post; DMs,
    # inquiries, digests etc. keep their own natural cadence.
    collapse_id = ""
    if job["ntype"] in _COLLAPSE_TYPES and job["post_id"]:
        collapse_id = f"machi.{job['ntype']}.{job['post_id']}"
    dead: list[str] = []
    for entry in tokens:
        # Skip (and purge) any row whose token isn't well-formed hex. New tokens
        # are validated at registration, so this only catches legacy/corrupt
        # rows — but it guarantees nothing malformed is ever handed to curl.
        if not _is_valid_device_token(entry["token"]):
            dead.append(entry["id"])
            continue
        status, response = _post_one(entry["token"], blob, jwt, collapse_id=collapse_id)
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


def _post_one(device_token: str, payload: str, jwt: str, *, collapse_id: str = "") -> tuple[int, str]:
    """One HTTP/2 POST via system curl. The JWT travels through stdin
    (`-K -`) so it never appears in the process list. An optional
    `collapse_id` sets apns-collapse-id so repeated pushes about the same
    entity replace each other on the device instead of stacking up.

    Injection hardening: the device token is the only externally-influenced
    value here, so it is (1) asserted to be strict hex before use and (2) passed
    as an explicit ``--url`` command-line argument rather than interpolated into
    the ``-K`` config text. The config file therefore contains ONLY
    server-controlled values (the ES256 provider JWT, the bundle id, a sanitized
    collapse id), closing the config-directive injection surface entirely."""
    # (2nd) assertion — a malformed token must never reach curl. Registration
    # already enforces this shape; refusing again here is defense in depth.
    if not _is_valid_device_token(device_token):
        _log.warning("apns: refusing to send to malformed device token")
        return 0, ""
    url = f"{APNS_HOST}/3/device/{device_token}"
    config = (
        f'header = "authorization: bearer {jwt}"\n'
        f'header = "apns-topic: {APNS_BUNDLE_ID}"\n'
        'header = "apns-push-type: alert"\n'
        'header = "apns-priority: 10"\n'
        'header = "content-type: application/json"\n'
    )
    if collapse_id:
        # Server-generated (machi.<type>.<id>), but strip to a strict allowlist
        # and cap at APNs' 64-byte limit so nothing but [A-Za-z0-9._-] can ever
        # land in the config directive — no quote/newline can escape the header.
        safe_collapse = re.sub(r"[^A-Za-z0-9._-]", "", collapse_id)[:64]
        if safe_collapse:
            config += f'header = "apns-collapse-id: {safe_collapse}"\n'
    try:
        proc = subprocess.run(
            ["curl", "--http2", "-sS", "-K", "-", "--url", url, "-X", "POST",
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


def register_token(conn: Any, user_id: str, token: str, platform: str, now_iso: str,
                   *, city_slug: str = "") -> None:
    """Upsert a device token. A token moving between accounts re-binds to
    the latest login (shared devices). `city_slug` is only meaningful for
    guest rows (user_id = 'guest:…', C-3): it lets run_city_digests recall a
    signed-out device whose city is known. The DELETE-then-INSERT keyed on the
    token is also the guest→user merge: after login the same token re-binds to
    the real account and the guest row disappears, so nothing double-sends."""
    token = (token or "").strip().lower()
    # Reject anything that is not a well-formed hex device token. This subsumes
    # the old length guard (the regex bounds length to 16–200) and, crucially,
    # blocks tokens carrying quotes/newlines that could later break out of the
    # curl `-K` config on the send path. Silently drop — a bad token is either a
    # client bug or an attack, and push is best-effort anyway.
    if not _is_valid_device_token(token):
        return
    conn.execute("DELETE FROM device_push_tokens WHERE token = ?", (token,))
    conn.execute(
        "INSERT INTO device_push_tokens (id, user_id, token, platform, city_slug, created_at, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, token, (platform or "ios")[:16], (city_slug or "")[:48], now_iso, now_iso),
    )


def unregister_token(conn: Any, token: str) -> None:
    token = (token or "").strip().lower()
    if token:
        conn.execute("DELETE FROM device_push_tokens WHERE token = ?", (token,))
