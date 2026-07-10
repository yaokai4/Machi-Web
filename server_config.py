"""Production configuration + environment-variable resolution, extracted from server.py.

Foundational module: only depends on the standard library + server_errors.APIError,
never on server.py, so any server_* module can `from server_config import ...`.
This includes the env reader helpers, all module-level config constants, the
filesystem paths, and the Sign-in-with-Apple identity-token verifier (kept here
because it is pure JWKS/JWT verification with no other server.py dependency).

Import-time side effects are preserved exactly as they were in server.py:
MEDIA_DIR/STATIC_DIR mkdir, the PRODUCTION default-pepper SystemExit guard, and
env-var normalisation. server.py re-imports every public name back, so existing
`server.PRODUCTION` / `server.DB_PATH` / `server._env(...)` references keep working.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import re
import secrets
import time
import urllib.request
from pathlib import Path
from typing import Any

from server_errors import APIError


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
MEDIA_DIR = ROOT / "media"
# DB location is overridable so the database can live outside the repo
# (kept out of Git) and so tests can point at a throwaway file. `_env` is
# not defined yet at this point, so read os.environ directly.
_db_path_env = (os.environ.get("KAIX_DB_PATH") or "").strip()
DB_PATH = Path(_db_path_env).expanduser() if _db_path_env else ROOT / "kaix.db"
MEDIA_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# production configuration
#
# Everything that should change between dev / staging / prod lives here and
# is overridable through environment variables so secrets and origins never
# need to be committed.
# ---------------------------------------------------------------------------

def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value if value is not None else default


def _read_secret_file(inline: str, path: str) -> str:
    """Return the inline value if set, otherwise read it from a file path.
    PEM keys (WeChat / Alipay) are usually supplied as files, not inline
    env values. The contents are NEVER logged."""
    if inline:
        return inline
    p = (path or "").strip()
    if not p:
        return ""
    try:
        return Path(p).expanduser().read_text(encoding="utf-8")
    except Exception:
        return ""


# Used to derive password hashes. Must be set in production.
PASSWORD_PEPPER = _env("KAIX_PASSWORD_PEPPER", "kaix-dev-pepper-2026").encode("utf-8")
# Reject the dev pepper in production so we don't accidentally ship it.
PRODUCTION = _env("KAIX_ENV", "development").lower() == "production"
if PRODUCTION and PASSWORD_PEPPER == b"kaix-dev-pepper-2026":
    raise SystemExit("Refusing to start in production with the default PASSWORD_PEPPER. Set KAIX_PASSWORD_PEPPER.")

SESSION_TTL_DAYS = int(_env("KAIX_SESSION_TTL_DAYS", "30"))
SESSION_COOKIE_NAME = "machi_session"
MAX_UPLOAD_BYTES = int(_env("KAIX_MAX_UPLOAD_BYTES", str(320 * 1024 * 1024)))
MAX_JSON_BYTES = int(_env("KAIX_MAX_JSON_BYTES", str(256 * 1024)))
# Optional shared secret. When set, only the registration request that
# carries the matching `bootstrap_token` is promoted to admin. Without
# the env var the historical "first-registered user becomes admin"
# behaviour is preserved.
ADMIN_BOOTSTRAP_TOKEN = _env("KAIX_ADMIN_BOOTSTRAP_TOKEN", "")

# ---------------------------------------------------------------------------
# account security + email verification + visitor analytics
#
# Everything below is opt-in and configured through env vars so secrets,
# transports and feature gates never need to live in the repo or the browser
# bundle. Defaults are chosen so existing clients (including the iOS app,
# which logs in with a password only) keep working unchanged; flip the gates
# on per-deploy to enforce email verification on the Web.
# ---------------------------------------------------------------------------

# Default admin bootstrap. Seeded exactly once at startup IF no user with
# this handle already exists. The initial password has NO built-in default:
# it MUST be supplied per-deploy via KAIX_ADMIN_INITIAL_PASSWORD, so no real
# password is ever hardcoded in source. When unset, the admin is simply not
# auto-created (a warning is logged). This value is server-side only — never
# shipped to the browser bundle, never logged, and never returned by any API.
# Rotate the password after first login.
DEFAULT_ADMIN_HANDLE = (_env("KAIX_ADMIN_HANDLE", "admin") or "").strip().lstrip("@").lower()
DEFAULT_ADMIN_PASSWORD = _env("KAIX_ADMIN_INITIAL_PASSWORD", "")
DEFAULT_ADMIN_EMAIL = (_env("KAIX_ADMIN_EMAIL", "") or "").strip()
DEFAULT_ADMIN_DISPLAY_NAME = _env("KAIX_ADMIN_DISPLAY_NAME", "Machi Admin")

# Pepper for hashing email verification / password-reset codes before they
# are stored. Codes are NEVER stored or logged in plaintext. Defaults are
# derived from the password pepper so a single rotation covers both in dev.
EMAIL_CODE_PEPPER = (_env("KAIX_EMAIL_CODE_PEPPER", "").encode("utf-8")) or (b"evc:" + PASSWORD_PEPPER)

# Verification-code policy.
EMAIL_CODE_TTL_SEC = int(_env("KAIX_EMAIL_CODE_TTL_SEC", "600"))            # 10 minutes
EMAIL_CODE_MAX_ATTEMPTS = int(_env("KAIX_EMAIL_CODE_MAX_ATTEMPTS", "5"))
EMAIL_CODE_RESEND_COOLDOWN_SEC = int(_env("KAIX_EMAIL_CODE_RESEND_COOLDOWN_SEC", "60"))
EMAIL_CODE_LENGTH = 6
# Minimum gap between password-changing operations is enforced by the auth
# rate-limit group; nothing extra needed here.

# Feature gates — default OFF so nothing breaks on upgrade. Turn on for Web.
REQUIRE_EMAIL_VERIFICATION = _env("KAIX_REQUIRE_EMAIL_VERIFICATION", "0") == "1"
LOGIN_REQUIRE_CODE = _env("KAIX_LOGIN_REQUIRE_CODE", "0") == "1"

# Self-hosted image CAPTCHA gating the anonymous auth endpoints (bulk-bot
# registration / credential-stuffing guard). Rendered server-side with
# Pillow so every client — Web, iOS, Android, including China-store builds
# with no Google services — just displays a PNG; no third-party SDK.
# KAIX_CAPTCHA_LOGIN_ENABLED:
#   "1"        — every login needs a captcha (requires all clients to ship the UI)
#   "0"        — login never asks (legacy-client compatibility)
#   "adaptive" — only after repeated failures from the same IP / handle.
#                Old app builds keep working (normal users sign in first
#                try), while credential-stuffing bots hit the wall after
#                CAPTCHA_LOGIN_FAIL_THRESHOLD misses. Clients that DO ship
#                the captcha UI pick the row up automatically because
#                /api/auth/captcha?scene=login flips enabled per-IP.
CAPTCHA_ENABLED = _env("KAIX_CAPTCHA_ENABLED", "1") == "1"
CAPTCHA_LOGIN_MODE = (_env("KAIX_CAPTCHA_LOGIN_ENABLED", "1") or "1").strip().lower()
if CAPTCHA_LOGIN_MODE not in ("0", "1", "adaptive"):
    CAPTCHA_LOGIN_MODE = "1"
CAPTCHA_LOGIN_FAIL_THRESHOLD = max(1, int(_env("KAIX_CAPTCHA_LOGIN_FAIL_THRESHOLD", "3")))
CAPTCHA_LOGIN_FAIL_WINDOW_SEC = max(60, int(_env("KAIX_CAPTCHA_LOGIN_FAIL_WINDOW_SEC", "900")))
# Hard lockout (in addition to adaptive captcha): after this many failures for
# the same account/IP inside the window, refuse login outright to blunt
# distributed credential stuffing. 0 disables.
LOGIN_LOCKOUT_THRESHOLD = max(0, int(_env("KAIX_LOGIN_LOCKOUT_THRESHOLD", "12")))
LOGIN_LOCKOUT_WINDOW_SEC = max(60, int(_env("KAIX_LOGIN_LOCKOUT_WINDOW_SEC", "900")))
CAPTCHA_TTL_SEC = int(_env("KAIX_CAPTCHA_TTL_SEC", "300"))                  # 5 minutes
CAPTCHA_LENGTH = max(4, min(int(_env("KAIX_CAPTCHA_LENGTH", "4")), 8))

# Google OAuth. The backend owns the state check and exchanges the code for
# profile info, then issues the same Machi bearer session used by password
# login. For local development, the redirect URI can be inferred from the
# request host; production should set GOOGLE_OAUTH_REDIRECT_URI explicitly.
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_REDIRECT_URI = _env("GOOGLE_OAUTH_REDIRECT_URI", "")
GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_OAUTH_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_OAUTH_STATE_TTL_SEC = int(_env("GOOGLE_OAUTH_STATE_TTL_SEC", "600"))
GOOGLE_IOS_CALLBACK_URL = _env("GOOGLE_IOS_CALLBACK_URL", "machi://auth/google")

# Sign in with Apple (native iOS). The app obtains an identity token (a JWT
# signed by Apple) and posts it here; we verify the signature against Apple's
# published public keys and the audience against our bundle id. No client
# secret needed for the native flow.
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
# Comma-separated list of allowed audiences (bundle ids). Defaults to the app.
APPLE_AUDIENCES = [a.strip() for a in _env("APPLE_BUNDLE_ID", "com.yaokai.kaizi").split(",") if a.strip()]
_apple_jwks_cache: dict[str, Any] = {"keys": [], "fetched_at": 0.0}


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def _fetch_apple_jwks(force: bool = False) -> list[dict[str, Any]]:
    now = time.time()
    if not force and _apple_jwks_cache["keys"] and (now - _apple_jwks_cache["fetched_at"]) < 3600:
        return _apple_jwks_cache["keys"]
    req = urllib.request.Request(APPLE_KEYS_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    keys = data.get("keys", []) if isinstance(data, dict) else []
    if keys:
        _apple_jwks_cache["keys"] = keys
        _apple_jwks_cache["fetched_at"] = now
    return keys


def verify_apple_identity_token(identity_token: str, expected_nonce: str | None = None) -> dict[str, Any]:
    """Verify a Sign in with Apple identity token (RS256 JWT) against Apple's
    published JWKS plus our issuer/audience/expiry (and the nonce, if used).
    Returns the decoded claims (sub, email, ...) or raises APIError. No third-
    party JWT lib — uses the already-present `cryptography` for RSA verify."""
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives import hashes

    parts = (identity_token or "").strip().split(".")
    if len(parts) != 3:
        raise APIError("Apple 凭证格式错误", 400, "apple_token_invalid")
    header_b64, payload_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64))
        claims = json.loads(_b64url_decode(payload_b64))
        signature = _b64url_decode(sig_b64)
    except Exception:
        raise APIError("Apple 凭证解析失败", 400, "apple_token_invalid")
    kid = header.get("kid")
    if header.get("alg") != "RS256" or not kid:
        raise APIError("Apple 凭证算法不支持", 400, "apple_token_invalid")

    def _find_key() -> dict[str, Any] | None:
        for k in _fetch_apple_jwks():
            if k.get("kid") == kid:
                return k
        return None

    jwk = _find_key()
    if jwk is None:  # key rotation — refresh once
        _apple_jwks_cache["fetched_at"] = 0.0
        jwk = _find_key()
    if jwk is None:
        raise APIError("Apple 凭证验证失败", 401, "apple_token_invalid")

    try:
        n = int.from_bytes(_b64url_decode(jwk["n"]), "big")
        e = int.from_bytes(_b64url_decode(jwk["e"]), "big")
        public_key = rsa.RSAPublicNumbers(e=e, n=n).public_key()
        public_key.verify(
            signature,
            f"{header_b64}.{payload_b64}".encode("ascii"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except Exception:
        raise APIError("Apple 凭证签名无效", 401, "apple_token_invalid")

    if claims.get("iss") != APPLE_ISSUER:
        raise APIError("Apple 凭证签发方不匹配", 401, "apple_token_invalid")
    if claims.get("aud") not in APPLE_AUDIENCES:
        raise APIError("Apple 凭证受众不匹配", 401, "apple_token_invalid")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time() - 30:
        raise APIError("Apple 凭证已过期，请重试", 401, "apple_token_expired")
    if expected_nonce:
        if claims.get("nonce") != hashlib.sha256(expected_nonce.encode("utf-8")).hexdigest():
            raise APIError("Apple 凭证校验失败", 401, "apple_token_invalid")
    if not claims.get("sub"):
        raise APIError("Apple 凭证缺少用户标识", 400, "apple_token_invalid")
    return claims

# Email transport. "console_file" (default) writes each message to a local,
# git-ignored dev outbox so codes can be read during development WITHOUT ever
# being written to the logger. Production should use "smtp" or "resend".
EMAIL_TRANSPORT = _env("KAIX_EMAIL_TRANSPORT", "console_file").lower()
EMAIL_FROM = _env("KAIX_EMAIL_FROM", "Machi <no-reply@machi.city>")
EMAIL_REPLY_TO = (_env("KAIX_EMAIL_REPLY_TO", "") or "").strip()
SMTP_HOST = _env("KAIX_SMTP_HOST", "")
SMTP_PORT = int(_env("KAIX_SMTP_PORT", "587"))
SMTP_USERNAME = _env("KAIX_SMTP_USERNAME", "")
SMTP_PASSWORD = _env("KAIX_SMTP_PASSWORD", "")
SMTP_USE_TLS = _env("KAIX_SMTP_USE_TLS", "1") == "1"
RESEND_API_KEY = _env("KAIX_RESEND_API_KEY", "")
_dev_outbox_env = _env("KAIX_DEV_OUTBOX_DIR", "").strip()
DEV_OUTBOX_DIR = Path(_dev_outbox_env).expanduser() if _dev_outbox_env else ROOT / "dev_outbox"
# Test/CI capture. When KAIX_EMAIL_TEST_MODE=outbox (or KAIX_EMAIL_OUTBOX_PATH is
# set), send_email() short-circuits the real SMTP/Resend transport and appends a
# structured JSONL record to the outbox instead — so tests assert delivery
# without a live mail account and without sending real mail. The outbox is a
# local, git-ignored artifact (same trust level as the dev console_file outbox).
EMAIL_TEST_MODE = (_env("KAIX_EMAIL_TEST_MODE", "") or "").strip().lower()
EMAIL_OUTBOX_PATH = (_env("KAIX_EMAIL_OUTBOX_PATH", "") or "").strip()

# Production guard (mirrors the PASSWORD_PEPPER guard above). Only "smtp" and
# "resend" actually deliver mail; every other transport falls back to writing
# the FULL message body — verification codes, password-reset codes — as
# plaintext into the git-ignored dev outbox, and the user never receives the
# email. Shipping that to production is both a sensitive-data-on-disk leak and a
# silent broken auth flow, so refuse to boot rather than fail open. The test/CI
# outbox capture (KAIX_EMAIL_TEST_MODE=outbox / KAIX_EMAIL_OUTBOX_PATH) is
# explicitly exempt so a prod-shaped test harness can still run.
# 许多测试刻意设 KAIX_ENV=production 来跑生产代码路径,但不会配 SMTP。它们是在
# unittest 下导入的(真实生产由 gunicorn/服务器启动导入,不加载 unittest),据此
# 豁免测试进程,避免这个正确的守卫把测试套件打挂。
import sys as _sys, os as _os  # noqa: E402
_ENTRY = _os.path.basename((_sys.argv[0] if _sys.argv else "") or "")
_UNDER_TEST = (
    ("unittest" in _sys.modules) or ("pytest" in _sys.modules)
    or _ENTRY.startswith("test_")            # 直接跑的 test_*.py 脚本(无 unittest)
    or "PYTEST_CURRENT_TEST" in _os.environ
)
if (
    PRODUCTION
    and not _UNDER_TEST
    and EMAIL_TRANSPORT not in ("smtp", "resend")
    and not (EMAIL_TEST_MODE == "outbox" or EMAIL_OUTBOX_PATH)
):
    raise SystemExit(
        "Refusing to start in production with KAIX_EMAIL_TRANSPORT=%r: verification "
        "and password-reset codes would be written as plaintext to the dev outbox and "
        "never delivered. Set KAIX_EMAIL_TRANSPORT=smtp or resend." % EMAIL_TRANSPORT
    )

# Visitor analytics.
VISITOR_LOG_ENABLED = _env("KAIX_VISITOR_LOG_ENABLED", "1") == "1"
# Collapse repeated hits from the same client into one row within this
# window so high-frequency API polling doesn't flood the table.
VISITOR_LOG_DEDUP_SEC = int(_env("KAIX_VISITOR_LOG_DEDUP_SEC", "300"))
VISITOR_LOG_RETENTION_DAYS = int(_env("KAIX_VISITOR_LOG_RETENTION_DAYS", "90"))
# GeoIP resolver: "none" (default, no lookups), "ipapi" (ip-api.com, free,
# no key, rate-limited), or "maxmind" (offline GeoLite2 db, needs geoip2).
# Default is "none" on purpose: "ipapi" ships each visitor's real public IP to a
# third party over plaintext HTTP (privacy + MITM exposure) and silently rate-
# limits at scale, so it must be an explicit, disclosed opt-in — never the
# out-of-the-box behaviour. For production prefer KAIX_GEOIP_TRANSPORT=maxmind
# (offline GeoLite2, no IP leaves the box).
GEOIP_TRANSPORT = _env("KAIX_GEOIP_TRANSPORT", "none").lower()
GEOIP_MAXMIND_DB = _env("KAIX_GEOIP_MAXMIND_DB", "")

# Comma-separated origin allowlist. In production this should be the host(s)
# that serve the Web client. In dev we fall back to "*" so localhost still
# works.
# In production, default to the canonical site origin instead of "" — an empty
# allowlist made _set_cors() reflect ANY Origin back (no Allow-Credentials, so
# not a credential-theft hole, but still over-permissive). Override via env if
# the Web client is served from a different host.
_origins_raw = _env(
    "KAIX_ALLOWED_ORIGINS",
    "*" if not PRODUCTION else "https://machicity.com,https://www.machicity.com",
)
ALLOWED_ORIGINS = {o.strip() for o in _origins_raw.split(",") if o.strip()}

# Number of trusted reverse-proxy hops in front of the app (1 = nginx only,
# 2 = CloudFront -> nginx). The real client IP is the (hops)-th value from the
# RIGHT of X-Forwarded-For; the LEFT entries are attacker-prepended and must
# never be trusted for throttling. 0 = ignore XFF entirely (use the peer).
KAIX_TRUSTED_PROXY_HOPS = max(0, int(_env("KAIX_TRUSTED_PROXY_HOPS", "1")))

# Rate-limit policy. Token-bucket per IP per group. Tuned for an audience
# of "tens of thousands of real users" sharing a few dozen NATs at peak.
RATE_LIMITS = {
    # group           -> (capacity, refill_per_minute)
    "auth":   (10, 5),       # /api/auth/login|register|reset — brute-force guard
    # Session probe (GET /api/auth/me) fires on nearly every page load, tab, and
    # focus-refresh. It MUST NOT share the brute-force bucket, or a normal
    # multi-tab user / QA sweep / prefetch self-429s and gets bounced to login.
    "auth_session": (240, 240),
    # Captcha image fetch and OAuth redirect kickoff are read-shaped and happen
    # before any credential is submitted — give them roomy buckets of their own.
    "auth_captcha": (60, 60),
    "oauth_start":  (40, 40),
    "email":  (5, 2),        # /api/auth/*/send-code — code-spam guard
    # Carrier NAT means many real mobile users can share one apparent IP.
    # Keep auth/payment tight, but let normal writes breathe so a city event
    # with many simultaneous posts does not turn into false 429s.
    "write":  (600, 600),    # mutating endpoints
    "read":   (300, 300),    # reads
    "search": (40, 40),
    "media":  (20, 20),
    # H5: per-account report velocity — stops a single account mass-reporting to
    # suppress content. Keyed by user id (not IP) in api_report.
    "report": (20, 10),
    # Product reviews are a low-frequency, buy-gated write; keep the bucket tight
    # so a bot with a batch of orders can't flood the review queue. Keyed by user
    # id in api_guide_create_or_update_review.
    "review": (10, 5),
    # A 9-image post uses presign + local PUT + complete for every item.
    # Keep uploads in their own bucket so a legitimate album does not
    # exhaust the generic media quota before the post can be created. The
    # authenticated daily upload quota is the abuse guard here; this bucket
    # needs to tolerate many users behind the same carrier/NAT IP.
    "upload": (20000, 20000),
    "upload_stream": (6000, 6000),
    "payment": (20, 10),     # order creation / verify — tight money path
    # UGC-6: per-account velocity for the cheapest harassment vectors, keyed by
    # user id (like report) so comment-flood / follow-spam can't ride the roomy
    # generic "write" bucket.
    "comment": (60, 40),
    "follow":  (60, 30),
    # Signed-out Machi AI taster calls, keyed by IP — a small bucket so one
    # address can't farm extra daily slots by minting fresh guest UUIDs.
    "ai_guest": (10, 5),
}
HTTP_REQUEST_QUEUE_SIZE = max(
    64,
    min(int(_env("KAIX_HTTP_REQUEST_QUEUE_SIZE", "256") or 256), 1024),
)

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
    "video/mp4", "video/quicktime", "video/webm",
    "application/pdf", "application/zip",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
}

IMAGE_UPLOAD_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
}
PDF_UPLOAD_MIME = {"application/pdf"}
VIDEO_UPLOAD_MIME = {"video/mp4", "video/quicktime", "video/webm"}
AUDIO_UPLOAD_MIME = {"audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"}
MESSAGE_FILE_UPLOAD_MIME = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
MESSAGE_FILE_UPLOAD_ENABLED = _env("MESSAGE_FILE_UPLOAD_ENABLED", "0").strip().lower() in {"1", "true", "yes"}

# Canonical file extension per mime. We do NOT trust mimetypes.guess_extension
# because it varies across Python versions and platforms — a fixed table is
# both safer (no surprise extensions on disk) and consistent across deploys.
EXT_BY_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/gif":  ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "video/mp4":        ".mp4",
    "video/quicktime":  ".mov",
    "video/webm":       ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp4":  ".m4a",
    "audio/wav":  ".wav",
    "audio/webm": ".webm",
    "application/pdf":  ".pdf",
    "application/zip":  ".zip",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "text/csv": ".csv",
}

UPLOAD_MIME_BY_EXTENSION: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "heic": "image/heic",
    "heif": "image/heif",
    "mp4": "video/mp4",
    "m4v": "video/mp4",
    "mov": "video/quicktime",
    "qt": "video/quicktime",
    "webm": "video/webm",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "wav": "audio/wav",
    "pdf": "application/pdf",
}

UPLOAD_MIME_ALIASES: dict[str, str] = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
    "video/x-m4v": "video/mp4",
    "application/x-pdf": "application/pdf",
}


# ---------------------------------------------------------------------------
# Amazon S3 / upload storage configuration
#
# Browser/iOS/Android clients never receive AWS credentials. On EC2, boto3 uses
# the AWS SDK default credential chain and reads temporary credentials from the
# attached Instance Profile / IAM Role. Local development falls back to a
# backend-local PUT URL when boto3/credentials are not available.
# ---------------------------------------------------------------------------

PUBLIC_BASE_URL = _env("KAIX_PUBLIC_BASE_URL", "").rstrip("/")
AWS_REGION = _env("AWS_REGION", "ap-northeast-1")
AWS_S3_BUCKET = _env("AWS_S3_BUCKET", "")
AWS_CLOUDFRONT_DOMAIN = _env("AWS_CLOUDFRONT_DOMAIN", "").strip().rstrip("/")
PRIVATE_MEDIA_KEY_B64 = _env("KAIX_PRIVATE_MEDIA_KEY", "").strip()
S3_UPLOAD_MAX_SIZE = int(_env("S3_UPLOAD_MAX_SIZE", str(320 * 1024 * 1024)))
S3_PRESIGN_EXPIRES_SECONDS = max(60, min(int(_env("S3_PRESIGN_EXPIRES_SECONDS", "300")), 900))
S3_PRIVATE_DOWNLOAD_EXPIRES_SECONDS = max(60, min(int(_env("S3_PRIVATE_DOWNLOAD_EXPIRES_SECONDS", "600")), 900))


UPLOAD_PURPOSES: dict[str, dict[str, Any]] = {
    "avatar": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1},
    "profile_cover": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1},
    "post_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 9},
    "post_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "post_audio": {"kind": "audio", "max": 50 * 1024 * 1024, "count": 1, "private": True},
    "article_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 20},
    "article_video": {"kind": "video", "max": 300 * 1024 * 1024, "count": 1},
    "experience_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 9},
    "experience_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "question_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 6},
    "group_post_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 9},
    "group_post_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "secondhand_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 10},
    "secondhand_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "rental_image": {"kind": "image", "max": 15 * 1024 * 1024, "count": 20},
    "rental_video": {"kind": "video", "max": 300 * 1024 * 1024, "count": 1},
    "job_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 5},
    "job_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "service_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 10},
    "service_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "discount_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 5},
    "discount_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1},
    "guide_article_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 20, "admin": True},
    "guide_product_preview": {"kind": "image", "max": 10 * 1024 * 1024, "count": 10, "admin": True},
    "guide_product_file": {"kind": "pdf", "max": 50 * 1024 * 1024, "count": 20, "admin": True, "private": True},
    "member_resource_file": {"kind": "pdf", "max": 50 * 1024 * 1024, "count": 20, "admin": True, "private": True},
    "guide_attachment": {"kind": "verification_file", "max": 20 * 1024 * 1024, "count": 20, "private": True},
    "business_logo": {"kind": "image", "max": 5 * 1024 * 1024, "count": 1},
    "business_cover": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1},
    # 活动封面 / 约局(社交房间)封面。单图,像 business_cover 一样由 URL 列
    # (events.cover_url / social_rooms.cover_url)引用,并把 uploaded_file id 记进
    # cover_file_id —— _uploaded_file_is_referenced 会据此判定「在用」,孤儿 GC 便
    # 不再把它当无主文件删除(此前活动封面误用 post_image+event,48h 后被回收)。
    "event_cover": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1},
    "room_cover": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1},
    "business_verification_file": {"kind": "verification_file", "max": 20 * 1024 * 1024, "count": 10, "private": True},
    "message_attachment": {"kind": "disabled", "max": 0, "count": 0},
    "message_image": {"kind": "image", "max": 10 * 1024 * 1024, "count": 9, "private": True},
    "message_video": {"kind": "video", "max": 200 * 1024 * 1024, "count": 1, "private": True},
    # Private poster/cover for a DM video. Mirrors message_image's private
    # (encrypted, signed-URL) policy so the first frame of a video sent inside an
    # encrypted conversation is NOT served from a public CDN URL. Kept separate
    # from the public `video_thumbnail` (used by feed/post video covers) so those
    # stay on the fast public CDN path.
    "message_video_thumbnail": {"kind": "image", "max": 10 * 1024 * 1024, "count": 1, "private": True},
    "message_file": {"kind": "message_file", "max": 20 * 1024 * 1024, "count": 1, "private": True, "disabled": not MESSAGE_FILE_UPLOAD_ENABLED},
    "video_thumbnail": {"kind": "image", "max": 5 * 1024 * 1024, "count": 20},
    "video_processed_file": {"kind": "video", "max": 300 * 1024 * 1024, "count": 10},
}

LISTING_PURPOSE_BY_TYPE = {
    "secondhand": "secondhand_image",
    "rental": "rental_image",
    "for_sale": "rental_image",
    "job": "job_image",
    "hiring": "job_image",
    "local_service": "service_image",
    "discount": "discount_image",
    "event": "discount_image",
}

LISTING_VIDEO_PURPOSE_BY_TYPE = {
    "secondhand": "secondhand_video",
    "rental": "rental_video",
    "for_sale": "rental_video",
    "job": "job_video",
    "hiring": "job_video",
    "local_service": "service_video",
    "discount": "discount_video",
    "event": "discount_video",
}

LISTING_UPLOAD_PURPOSES = set(LISTING_PURPOSE_BY_TYPE.values()) | set(LISTING_VIDEO_PURPOSE_BY_TYPE.values())


# ---------------------------------------------------------------------------
# Machi Verified membership + payments
#
# Membership price/plan data is database-driven. Seed values only create
# editable defaults; payment amounts are always recomputed from
# `membership_plans` server-side. Payment provider secrets are read from the
# environment and NEVER logged, never returned by any API, and never shipped to
# the browser/app bundle.
# ---------------------------------------------------------------------------

MEMBERSHIP_PLAN_MONTHLY_KEY = "machi_verified_monthly"
MEMBERSHIP_PLAN_YEARLY_KEY = "machi_verified_yearly"
MEMBERSHIP_LEGACY_PLAN_KEY = "machi_verified_monthly_cny_10"
MEMBERSHIP_PLAN_KEY = _env("MEMBERSHIP_PLAN_KEY", MEMBERSHIP_PLAN_MONTHLY_KEY)
# Seed values only. Operators edit membership_plans from admin after boot.
# Membership is a NON-RENEWING one-time purchase. `billing_period`
# (monthly/yearly) is the ACCESS-DURATION engine (monthly = 30 days of access,
# yearly = 365) — NOT recurring billing. Clients render it as a one-time
# "N-day pass", never "monthly/yearly subscription".
# Priced in JPY (Japan-facing product). Internal storage is value×100 for every
# currency; the Stripe edge divides by 100 for zero-decimal currencies like JPY
# (see _stripe_minor_units + STRIPE_ZERO_DECIMAL), so a ¥600 pass is price=600,
# amount_cents=60000, charged as 600 minor units (¥600). The env keys keep the
# historical *_JPY name — the value is denominated in MEMBERSHIP_CURRENCY.
MEMBERSHIP_PRICE_JPY = int(_env("MEMBERSHIP_PRICE_JPY", "600"))                 # 30-day pass (JPY)
MEMBERSHIP_PRICE_YEARLY_JPY = int(_env("MEMBERSHIP_PRICE_YEARLY_JPY", "4800"))  # 365-day pass (JPY)
MEMBERSHIP_CURRENCY = _env("MEMBERSHIP_CURRENCY", "JPY")
MEMBERSHIP_BILLING_CYCLE = "monthly"
# Apple App Store product ids for the same plans. iOS buys through IAP.
APPLE_IAP_PRODUCT_ID = _env("APPLE_IAP_PRODUCT_ID", "machi_yuedu_18")
APPLE_IAP_PRODUCT_ID_YEARLY = _env("APPLE_IAP_PRODUCT_ID_YEARLY", "machi_1niandu_198")
APPLE_IAP_LEGACY_PRODUCT_IDS = {"machi_verified_monthly_cny_10", "machi_verified_yearly_cny_98"}

# Content types that demand an active verified membership to publish.
# Enforced server-side (see api_create_post); the client only mirrors it
# for UX. Unknown values are harmless — normalize_content_type collapses
# anything not in CONTENT_TYPES to "dynamic", which is never gated.
REQUIRES_VERIFIED_MEMBERSHIP: set[str] = {
    "job_post",    # 招聘
    "housing",     # 租房
    "roommate",    # 找室友（含转租场景）
    "service",     # 本地服务
    "coupon",      # 商家优惠
    "merchant",    # 商家 / 商家活动 / 商家合作
    "referral",    # 内推 / 招聘推广
}
# Forward-compat aliases from the product spec that don't (yet) exist as
# real content types. Kept so the rule set reads the same across docs and
# so future types are gated the moment they're added to CONTENT_TYPES.
REQUIRES_VERIFIED_MEMBERSHIP |= {
    "sublet", "merchant_event", "hiring", "rental_listing", "business_promotion",
}

# Daily publish caps. 0 == unlimited (the default, so existing installs and
# ordinary posting are never impeded — constraint #10). Operators who want
# the membership "higher quota" perk can set e.g. FREE=5 / VERIFIED=20.
MEMBERSHIP_DAILY_LIMIT_FREE = int(_env("MEMBERSHIP_DAILY_LIMIT_FREE", "0"))
MEMBERSHIP_DAILY_LIMIT_VERIFIED = int(_env("MEMBERSHIP_DAILY_LIMIT_VERIFIED", "0"))
# Gentle ranking nudge for verified members' content on the hot feed.
# Kept small on purpose so it never overpowers genuine engagement.
VERIFIED_BOOST_SCORE = float(_env("MEMBERSHIP_VERIFIED_BOOST", "1.05"))

# --- Machi AI (原创 in-app assistant) -------------------------------------
# Server-side limits + provider config for the "Machi AI" feature. The
# underlying LLM provider/model is an INTERNAL detail and is never surfaced to
# clients (no provider/model name in any response, error, or user-visible
# string). Daily limits are enforced on the server only — a tampered client
# cannot exceed them. Member daily limit is never echoed back to members.
MACHI_AI_FREE_DAILY_LIMIT = int(_env("MACHI_AI_FREE_DAILY_LIMIT", "10"))
MACHI_AI_MEMBER_DAILY_LIMIT = int(_env("MACHI_AI_MEMBER_DAILY_LIMIT", "30"))
# Tiered on top of free: accounts registered within the last
# MACHI_AI_NEW_USER_WINDOW_DAYS days get a taster bump over the free cap, and
# signed-out guests (stable client UUID in X-Machi-Guest-Id) get a single
# try per JST day. All enforced server-side like the caps above.
MACHI_AI_NEW_USER_DAILY_LIMIT = int(_env("MACHI_AI_NEW_USER_DAILY_LIMIT", "15"))
MACHI_AI_NEW_USER_WINDOW_DAYS = int(_env("MACHI_AI_NEW_USER_WINDOW_DAYS", "30"))
MACHI_AI_GUEST_DAILY_LIMIT = int(_env("MACHI_AI_GUEST_DAILY_LIMIT", "1"))
MACHI_AI_MODEL = _env("MACHI_AI_MODEL", "deepseek-v4-flash")
MACHI_AI_PRO_MODEL = _env("MACHI_AI_PRO_MODEL", "deepseek-v4-pro")
MACHI_AI_TIMEOUT_SEC = float(_env("MACHI_AI_TIMEOUT_SEC", "35"))
MACHI_AI_MAX_INPUT_CHARS = int(_env("MACHI_AI_MAX_INPUT_CHARS", "1200"))
MACHI_AI_MAX_HISTORY_MESSAGES = int(_env("MACHI_AI_MAX_HISTORY_MESSAGES", "10"))
MACHI_AI_MAX_CONTEXT_ITEMS = int(_env("MACHI_AI_MAX_CONTEXT_ITEMS", "6"))

# --- payment providers (all optional; configured per-deploy) ---
WECHAT_PAY_APP_ID = _env("WECHAT_PAY_APP_ID", "")
WECHAT_PAY_MCH_ID = _env("WECHAT_PAY_MCH_ID", "")
WECHAT_PAY_API_V3_KEY = _env("WECHAT_PAY_API_V3_KEY", "")
WECHAT_PAY_SERIAL_NO = _env("WECHAT_PAY_SERIAL_NO", "")
# Accept the merchant private key either inline (WECHAT_PAY_PRIVATE_KEY) or
# as a file path (WECHAT_PAY_PRIVATE_KEY_PATH, e.g. apiclient_key.pem).
WECHAT_PAY_PRIVATE_KEY = _read_secret_file(_env("WECHAT_PAY_PRIVATE_KEY", ""), _env("WECHAT_PAY_PRIVATE_KEY_PATH", ""))
# MS-2: WeChat's PLATFORM public key/cert, used to verify the inbound
# Wechatpay-Signature on webhooks (distinct from the merchant private key above).
# Inline PEM or a file path. Unset => decrypt-only (legacy) with a warning.
WECHAT_PAY_PLATFORM_PUBLIC_KEY = _read_secret_file(
    _env("WECHAT_PAY_PLATFORM_PUBLIC_KEY", ""), _env("WECHAT_PAY_PLATFORM_CERT_PATH", ""))
WECHAT_PAY_NOTIFY_URL = _env("WECHAT_PAY_NOTIFY_URL", "")

# --- WeChat Mini Program login (sns/jscode2session). Separate credentials
# from WeChat Pay; the secret stays server-side only and is never returned to
# the client. When unset, the login endpoint reports a clear 503 so the
# mini-program can show "登录暂未开放" instead of failing opaquely. ---
WECHAT_MINIAPP_APPID = _env("WECHAT_MINIAPP_APPID", "")
WECHAT_MINIAPP_SECRET = _env("WECHAT_MINIAPP_SECRET", "")

ALIPAY_APP_ID = _env("ALIPAY_APP_ID", "")
ALIPAY_PRIVATE_KEY = _read_secret_file(_env("ALIPAY_PRIVATE_KEY", ""), _env("ALIPAY_PRIVATE_KEY_PATH", ""))
ALIPAY_PUBLIC_KEY = _read_secret_file(_env("ALIPAY_PUBLIC_KEY", ""), _env("ALIPAY_PUBLIC_KEY_PATH", ""))
ALIPAY_GATEWAY = _env("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do")
ALIPAY_NOTIFY_URL = _env("ALIPAY_NOTIFY_URL", "")
ALIPAY_RETURN_URL = _env("ALIPAY_RETURN_URL", "")

APPLE_IAP_BUNDLE_ID = _env("APPLE_IAP_BUNDLE_ID", "")
APPLE_IAP_ISSUER_ID = _env("APPLE_IAP_ISSUER_ID", "")
APPLE_IAP_KEY_ID = _env("APPLE_IAP_KEY_ID", "")
APPLE_IAP_PRIVATE_KEY = _read_secret_file(_env("APPLE_IAP_PRIVATE_KEY", ""), _env("APPLE_IAP_PRIVATE_KEY_PATH", ""))
APPLE_IAP_SHARED_SECRET = _env("APPLE_IAP_SHARED_SECRET", "")
APPLE_IAP_ENVIRONMENT = _env("APPLE_IAP_ENVIRONMENT", "Sandbox")
# Pinned Apple Root CA - G3 SHA-256 (DER) fingerprint(s). The StoreKit2 /
# App Store Server JWS x5c chain MUST terminate in this root, else an attacker
# can sign a forged transaction with their own self-issued leaf cert. Override
# via env (comma-separated) ONLY after confirming with:
#   openssl x509 -in AppleRootCA-G3.cer -inform der -fingerprint -sha256 -noout
APPLE_ROOT_CA_SHA256 = {
    fp.strip().lower().replace(":", "")
    for fp in _env(
        "APPLE_ROOT_CA_SHA256",
        "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",
    ).split(",")
    if fp.strip()
}
APPLE_APP_STORE_NOTIFICATION_URL = _env("APPLE_APP_STORE_NOTIFICATION_URL", "https://machicity.com/api/payments/webhook/apple")

# Stripe (card / wallet payments via hosted Checkout). Only the SECRET key
# + webhook signing secret are needed server-side (hosted Checkout handles
# payment UI). Membership is a one-time purchase, not a Stripe subscription:
# the amount and currency always come from membership_plans, same as Guide
# products, so admin pricing is the single source of truth.
STRIPE_SECRET_KEY = _env("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET", "")
STRIPE_CURRENCY = _env("STRIPE_CURRENCY", "usd").lower()  # legacy fallback only
# Currencies Stripe treats as zero-decimal: the "minor unit" IS the whole
# unit (¥500 → unit_amount=500, not 50000). Our plans/products store
# amount_cents as value×100, so amounts in these currencies must be
# divided by 100 on the way to Stripe — forgetting this is a silent
# 100× overcharge.
STRIPE_ZERO_DECIMAL = {"jpy", "krw", "vnd", "clp", "bif", "djf", "gnf", "kmf",
                       "mga", "pyg", "rwf", "ugx", "vuv", "xaf", "xof", "xpf"}
# Reject webhook signatures older than this (replay window). The
# provider+event_id UNIQUE already dedupes exact replays; this bounds
# captured-payload replay before the event was ever recorded.
STRIPE_WEBHOOK_TOLERANCE_SEC = int(_env("STRIPE_WEBHOOK_TOLERANCE_SEC", "300"))
STRIPE_SUCCESS_URL = _env("STRIPE_SUCCESS_URL", "https://machicity.com/membership?paid=1")
STRIPE_CANCEL_URL = _env("STRIPE_CANCEL_URL", "https://machicity.com/membership")

# Mock payments let the Web flow be exercised end-to-end before real
# merchant credentials exist. HARD rule: never available in production.
# A successful "mock paid" can only happen when this is on AND we are not
# in production.
PAYMENT_MOCK_ENABLED = (_env("PAYMENT_MOCK_ENABLED", "0") == "1") and not PRODUCTION
# iOS-first launch: the App Store build sells digital goods via Apple IAP only,
# and the web client's China card rails (WeChat Pay / Alipay) are gated OFF by
# default until merchant config + inbound platform-signature verification (MS-2)
# are in place. Set KAIX_ENABLE_CN_WEB_PAY=1 to re-enable for the China web client.
ENABLE_CN_WEB_PAY = _env("KAIX_ENABLE_CN_WEB_PAY", "0").strip().lower() in ("1", "true", "yes", "on")
# How long an unpaid order stays payable.
# Unpaid orders are auto-closed after this window so they don't linger in the
# user's order list. 20 min by default (long enough to finish a Stripe Checkout,
# short enough that an abandoned cart clears quickly). A genuine payment that
# lands after the order is closed still settles — see mark_order_paid /
# settle_topup, which tolerate the 'closed' state (real money always wins).
PAYMENT_ORDER_TTL_SEC = int(_env("PAYMENT_ORDER_TTL_SEC", "1200"))


# ---------------------------------------------------------------------------
# content type discriminator + per-type attribute validators
#
# Each post carries a `content_type` and a JSON `attributes` blob. The
# blob holds anything that doesn't make sense as a generic posts column
# — price, rent, salary, event_time, meetup_capacity, restaurant_name,
# job_visa_requirement, etc. The discriminator is what city-channel
# tabs and the discover page filter on.
#
# Adding a new type:
#   1. Append it to CONTENT_TYPES below.
#   2. (Optional) add a per-type validator in CONTENT_ATTR_SCHEMAS to
#      whitelist its keys and cap string lengths. Types without a
#      schema accept any string-valued attributes (good enough for
#      the long tail of types whose forms aren't built out yet).
#
# `dynamic` is the implicit default for posts created by older clients
# and for the "just type and post" composer path.
# ---------------------------------------------------------------------------

CONTENT_TYPES: set[str] = {
    "dynamic", "image_post", "long_post",
    "news", "local_info", "guide", "question", "rant",
    "secondhand", "housing", "roommate",
    "job_seek", "job_post", "referral",
    "meetup", "dining", "event",
    "service", "merchant", "coupon",
    "warning", "poll", "anonymous",
}

VISIBLE_POST_STATUSES: tuple[str, ...] = ("published", "active")
POST_STATUSES: set[str] = {"published", "active", "hidden", "deleted", "under_review"}

# Structured city listings. These are deliberately separate from ordinary
# posts: marketplace/rental/job cards need price, status, media, filters,
# moderation and owner workflows that do not belong in the short-form feed.
LISTING_TYPES: set[str] = {
    "secondhand", "rental", "for_sale", "job", "hiring", "local_service", "discount", "event",
}
LISTING_STATUSES: set[str] = {
    "draft", "pending_review", "published", "reserved", "sold", "rented",
    "closed", "expired", "rejected", "hidden",
}
PUBLIC_LISTING_STATUSES: tuple[str, ...] = ("published", "reserved")
LISTING_VERIFICATION_STATUSES: set[str] = {
    "unverified", "pending", "verified", "needs_review", "rejected",
}
LISTING_INQUIRY_STATUSES: set[str] = {
    "submitted", "new", "reviewing", "contacted", "confirmed", "rescheduled",
    "rejected", "withdrawn", "completed", "closed", "spam", "reported",
}
LISTING_PROMOTION_TYPES: set[str] = {
    "top", "featured", "city_home", "category_featured", "urgent_hiring",
    "recommended_rental", "recommended_service",
}
LISTING_VERIFICATION_TYPES: set[str] = {
    "seller", "rental_provider", "recruiter", "service_provider", "business",
}
LISTING_TYPES_DEFAULT_REVIEW: set[str] = {"rental", "for_sale", "job", "hiring", "local_service"}
LISTING_TYPES_REQUIRING_MEMBERSHIP: set[str] = {"rental", "job", "hiring", "local_service", "discount"}
# Workbench information architecture: every listing inquiry belongs to exactly
# one bucket so a record never shows under two conflicting entries.
#   reservation  — scheduled with a time/place (看房 / 订座 / 到店服务)  → 我的预约
#   application  — a real application (招聘报名)                        → 我的申请
#   consultation — a plain question / claim (二手 / 优惠 / 活动)        → 我的咨询
# Slot-based reservations (listing_bookings) and merchant/membership
# applications live in their own tables and join these buckets at the UI layer.
INQUIRY_RESERVATION_LISTING_TYPES: tuple[str, ...] = ("rental", "for_sale", "local_service")
INQUIRY_APPLICATION_LISTING_TYPES: tuple[str, ...] = ("job", "hiring")
BUSINESS_CONSOLE_LISTING_TYPES: tuple[str, ...] = ("local_service", "discount", "event", "hiring")
LISTING_MEMBERSHIP_MONTHLY_FREE_LIMIT = max(0, int(_env("LISTING_MEMBERSHIP_MONTHLY_FREE_LIMIT", "3") or 3))
# Membership gate defaults to STRICT (0): high-trust channels (rental / job /
# hiring / local_service / discount) require an active Machi membership before
# publishing — this keeps moderation & fraud risk contained and matches the
# in-app paywall copy on iOS and Web. Cold-start liquidity is an explicit,
# city-by-city opt-in: set LISTING_FREE_FIRST_PER_TYPE>0 to let a NEW account
# publish that many listings of each gated type for FREE (lifetime) before the
# paywall. When opted in, surface the "first N free, then membership" copy.
LISTING_FREE_FIRST_PER_TYPE = max(0, int(_env("LISTING_FREE_FIRST_PER_TYPE", "0") or 0))
LISTING_MEMBERSHIP_QUOTA_GROUPS: dict[str, set[str]] = {
    "rental": {"rental"},
    "job": {"job", "hiring"},
    "hiring": {"job", "hiring"},
    "local_service": {"local_service", "discount"},
    "discount": {"local_service", "discount"},
}
LISTING_MEMBERSHIP_GROUP_LABELS: dict[str, str] = {
    "rental": "租房",
    "job": "招聘",
    "hiring": "招聘",
    "local_service": "本地商家/服务",
    "discount": "本地商家/服务",
}
HIGH_INTENT_POST_TYPES: set[str] = {
    "secondhand", "housing", "roommate", "job_seek", "job_post",
    "referral", "service", "merchant", "coupon",
}
LISTING_ATTRIBUTE_KEYS: dict[str, set[str]] = {
    "secondhand": {
        "condition", "delivery_method", "pickup_available", "shipping_available",
        "brand", "model", "trade_method", "listing_mode", "original_price",
        "price_negotiable", "purchase_time", "accessories", "defect_note",
        "available_time", "pickup_note",
    },
    "rental": {
        "rent", "deposit", "key_money", "management_fee", "layout", "area_sqm",
        "nearest_station", "station_distance_minutes", "move_in_date", "short_term_allowed",
        "share_allowed", "furnished", "pet_allowed", "floor", "building_type",
        "publisher_type", "initial_cost_note", "lease_term",
        # Partner-import (星域东京 等) rental + 出售/投资 fields, Machi推荐, sparkle
        # badges and the denormalised reservation contact. See server_partners.py.
        "listing_intent", "sale_price", "yield_rate", "building_age", "structure",
        "land_area", "nearest_lines", "source_url", "machi_recommended",
        "machi_badges", "reservation_contact", "reservation_contact_id", "partner_key",
        # 星域东京官网详情接口带来的更完整字段(见 server_stareal.map_item)。
        "total_floors", "room_no", "property_no", "availability_status", "confirmed_at",
        "needs_renovation", "down_payment", "amenities", "nearby_facilities",
    },
    # 买房 (property for sale / investment) — a SEPARATE vertical from 长租.
    # Shares many descriptive fields with rental but the price is a total sale
    # price (not monthly rent) and adds sale-specific fields (利回り/築年/構造/土地).
    "for_sale": {
        "listing_intent", "sale_price", "yield_rate", "layout", "area_sqm", "land_area",
        "building_age", "structure", "floor", "building_type", "nearest_station",
        "station_distance_minutes", "nearest_lines", "management_fee", "move_in_date",
        "parking", "balcony_area", "source_url",
        "machi_recommended", "machi_badges", "reservation_contact",
        "reservation_contact_id", "partner_key",
        # 星域东京官网详情接口带来的更完整字段(见 server_stareal.map_item)。
        "total_floors", "room_no", "property_no", "availability_status", "confirmed_at",
        "needs_renovation", "lease_term", "down_payment", "amenities", "nearby_facilities",
    },
    "job": {
        "salary_min", "salary_max", "salary_type", "employment_type",
        "japanese_level", "visa_support", "working_hours", "company_name",
        "foreigner_friendly", "transportation_fee", "no_experience_ok",
        "student_ok", "night_shift", "weekend", "weekend_available", "job_requirements",
        "remote_ok", "benefits", "holidays", "trial_period",
    },
    "hiring": {
        "salary_min", "salary_max", "salary_type", "employment_type",
        "japanese_level", "visa_support", "working_hours", "company_name",
        "foreigner_friendly", "transportation_fee", "no_experience_ok",
        "student_ok", "night_shift", "weekend", "weekend_available", "job_requirements",
        "remote_ok", "benefits", "holidays", "trial_period",
    },
    "local_service": {
        "service_area", "service_type", "service_vertical", "price_unit", "business_name",
        "certified_provider", "availability", "not_included", "service_process",
        "user_prepare", "cancellation_rule", "no_result_guarantee", "related_guides",
        "booking_required", "rating_note", "license_note",
        # Local-service on-site info
        "open_hours", "price_range", "reservation_required", "store_phone",
        # 餐厅/商家详情:菜单(dishes) + 团购套餐(packages, 先展示不支持购买) + 预约说明
        "menu", "packages", "reservation_note",
        # Lodging inventory and stay details
        "room_type", "max_guests", "check_in_time", "check_out_time",
        "breakfast_included", "near_station", "amenities", "minimum_stay",
        "instant_confirmation", "inventory_note",
        # attractions / day tours / transfers
        "ticket_type", "duration", "meeting_point", "included_items",
        "languages", "pickup_service",
        # airport transfer
        "airport_route", "vehicle_type", "passenger_count", "luggage_count",
        "flight_info_note", "waiting_rule", "surcharge_note",
        # paperwork / translation
        "document_type", "required_materials", "delivery_time",
        # moving / cleaning
        "property_size", "item_volume", "vehicle_staff",
        # life setup / beauty / family support
        "setup_type", "cannot_guarantee", "beauty_service", "medical_disclaimer",
        "service_target",
    },
    "discount": {
        "merchant_name", "discount_info", "valid_until", "usage_rules",
        "business_name", "merchant_verified",
    },
    "event": {
        "event_time", "venue", "fee", "capacity", "registration_method",
        "organizer_name",
    },
}

SERVICE_VERTICAL_BY_CATEGORY: dict[str, str] = {
    "餐厅美食": "food_restaurant",
    "中华料理": "food_restaurant",
    "日本料理": "food_restaurant",
    "居酒屋": "food_restaurant",
    "烧肉火锅": "food_restaurant",
    "拉面": "food_restaurant",
    "寿司海鲜": "food_restaurant",
    "咖啡甜品": "food_restaurant",
    "西餐": "food_restaurant",
    "韩国料理": "food_restaurant",
    "餐饮点评": "dining_booking",
    "优惠预约": "dining_booking",
    "民宿": "lodging",
    "酒店": "lodging",
    "温泉旅馆": "lodging",
    "公寓式酒店": "lodging",
    "短住公寓": "lodging",
    "酒店民宿": "lodging",
    "景点门票": "attraction_ticket",
    "一日游": "day_tour",
    "本地向导": "day_tour",
    "体验活动": "day_tour",
    "包车行程": "day_tour",
    "接送机": "airport_transfer",
    "机场接送": "airport_transfer",
    "车站接送": "airport_transfer",
    "包车": "airport_transfer",
    "行李协助": "airport_transfer",
    "材料翻译": "paperwork_translation",
    "市役所陪同": "paperwork_translation",
    "银行卡协助": "paperwork_translation",
    "手机卡协助": "paperwork_translation",
    "签证材料整理": "paperwork_translation",
    "翻译手续": "paperwork_translation",
    "签证/手续协助": "paperwork_translation",
    "翻译": "paperwork_translation",
    "租房申请协助": "paperwork_translation",
    "认证服务": "paperwork_translation",
    "退房清洁": "moving_cleaning",
    "粗大垃圾协助": "moving_cleaning",
    "行李搬运": "moving_cleaning",
    "家具家电配送协助": "moving_cleaning",
    "搬家清洁": "moving_cleaning",
    "搬家": "moving_cleaning",
    "清洁": "moving_cleaning",
    "手机卡开通": "life_setup",
    "网络开通": "life_setup",
    "水电煤协助": "life_setup",
    "地址登记协助": "life_setup",
    "粗大垃圾预约": "life_setup",
    "生活跑腿": "life_setup",
    "生活支持": "life_setup",
    "美容美发": "beauty_health",
    "美甲": "beauty_health",
    "按摩": "beauty_health",
    "皮肤管理": "beauty_health",
    "体检/牙科预约协助": "beauty_health",
    "宠物寄养": "pet_family",
    "遛狗": "pet_family",
    "临时照看": "pet_family",
    "儿童用品租赁": "pet_family",
    "家庭协助": "pet_family",
    "宠物服务": "pet_family",
}

SERVICE_VERTICAL_COMMON_ATTRS: set[str] = {"business_name", "service_type", "service_vertical", "certified_provider"}
SERVICE_VERTICAL_ATTRIBUTE_KEYS: dict[str, set[str]] = {
    "food_restaurant": {
        "service_area", "open_hours", "price_range", "near_station", "store_phone",
        "reservation_required", "reservation_note", "menu", "packages", "languages",
    },
    "dining_booking": {
        "service_area", "open_hours", "price_range", "near_station", "store_phone",
        "availability", "booking_required", "reservation_required", "reservation_note",
        "service_process", "cancellation_rule", "languages",
    },
    "lodging": {
        "room_type", "max_guests", "price_unit", "check_in_time", "check_out_time",
        "minimum_stay", "amenities", "inventory_note", "breakfast_included",
        "instant_confirmation", "cancellation_rule", "license_note",
    },
    "attraction_ticket": {
        "ticket_type", "availability", "duration", "meeting_point", "included_items",
        "not_included", "user_prepare", "cancellation_rule", "license_note",
    },
    "day_tour": {
        "ticket_type", "availability", "duration", "meeting_point", "included_items",
        "not_included", "user_prepare", "pickup_service", "cancellation_rule", "license_note",
    },
    "airport_transfer": {
        "airport_route", "service_area", "vehicle_type", "passenger_count",
        "luggage_count", "flight_info_note", "waiting_rule", "surcharge_note",
        "cancellation_rule",
    },
    "paperwork_translation": {
        "languages", "document_type", "required_materials", "delivery_time",
        "service_process", "user_prepare", "no_result_guarantee", "license_note",
        "cancellation_rule",
    },
    "moving_cleaning": {
        "service_area", "property_size", "item_volume", "vehicle_staff",
        "included_items", "not_included", "user_prepare", "surcharge_note",
        "cancellation_rule",
    },
    "life_setup": {
        "service_area", "setup_type", "required_materials", "delivery_time",
        "service_process", "user_prepare", "cannot_guarantee", "price_range",
        "cancellation_rule",
    },
    "beauty_health": {
        "service_area", "open_hours", "price_range", "availability", "included_items",
        "not_included", "user_prepare", "beauty_service", "duration",
        "medical_disclaimer", "cancellation_rule", "license_note",
    },
    "pet_family": {
        "service_area", "service_target", "availability", "price_range",
        "user_prepare", "license_note", "cancellation_rule",
    },
}

# Machi Reputation. The server is the source of truth; clients only
# render the current snapshot and configurable rule/level rows.
REPUTATION_DEFAULT_SCORE = 70
REPUTATION_MIN_SCORE = 0
REPUTATION_MAX_SCORE = 100
REPUTATION_MIN_XP = 0
REPUTATION_MAX_RISK = 100
REPUTATION_PUBLIC_TRUST_LABELS = {
    "excellent": "可信贡献者",
    "good": "良好记录",
    "normal": "记录良好",
    "watch": "待建立记录",
    "limited": "待建立记录",
    "high_risk": "待建立记录",
}
REPUTATION_PRIVATE_STATUS_LABELS = {
    "excellent": {"zh": "优秀", "en": "Excellent", "ja": "優秀"},
    "good": {"zh": "良好", "en": "Good", "ja": "良好"},
    "normal": {"zh": "正常", "en": "Normal", "ja": "通常"},
    "watch": {"zh": "需观察", "en": "Watch", "ja": "要確認"},
    "limited": {"zh": "受限", "en": "Limited", "ja": "制限中"},
    "high_risk": {"zh": "高风险", "en": "High risk", "ja": "高リスク"},
}
REPUTATION_LEVEL_DEFAULTS: list[dict[str, Any]] = [
    {"level": 1, "xp": 0, "zh": "新居民", "en": "New Resident", "ja": "新しい住人", "desc": "开始建立城市生活记录。", "privileges": ["普通发帖", "评论", "收藏", "发布少量低风险二手"]},
    {"level": 2, "xp": 100, "zh": "城市探索者", "en": "City Explorer", "ja": "街の探索者", "desc": "持续浏览、收藏并参与本地讨论。", "privileges": ["普通发帖额度提升", "活动小组参与", "二手发布额度提升"]},
    {"level": 3, "xp": 300, "zh": "本地记录者", "en": "Local Recorder", "ja": "ローカル記録者", "desc": "能够提交更多结构化城市信息。", "privileges": ["长文经验", "避坑经验", "提交房源/招聘/服务审核"]},
    {"level": 4, "xp": 700, "zh": "生活贡献者", "en": "Life Contributor", "ja": "暮らしの貢献者", "desc": "真实生活内容获得轻量优先展示。", "privileges": ["普通内容轻微优先展示", "二手发布额度提升", "优质回答徽章申请"]},
    {"level": 5, "xp": 1500, "zh": "城市向导", "en": "City Guide", "ja": "街のガイド", "desc": "可以参与更高质量的城市指南内容。", "privileges": ["城市指南内容提交", "高信任内容优先审核", "Guide 资料优惠"]},
    {"level": 6, "xp": 3000, "zh": "可信发布者", "en": "Trusted Publisher", "ja": "信頼できる投稿者", "desc": "具备申请可信卖家、服务者和招聘方的基础。", "privileges": ["申请可信卖家", "申请认证服务者", "更多发布额度", "可信贡献标识"]},
    {"level": 7, "xp": 6000, "zh": "城市专家", "en": "City Expert", "ja": "街のエキスパート", "desc": "高质量内容和专题共创机会提升。", "privileges": ["精选内容机会", "城市专题共创", "会员折扣券"]},
    {"level": 8, "xp": 12000, "zh": "城市守望者", "en": "City Steward", "ja": "街の見守り人", "desc": "可参与轻量城市内容治理。", "privileges": ["城市内容治理", "有效举报奖励提升", "新功能优先体验"]},
    {"level": 9, "xp": 25000, "zh": "Machi 城市合伙人", "en": "Machi Local Partner", "ja": "Machi 街のパートナー", "desc": "参与城市运营合作和本地活动。", "privileges": ["城市运营合作", "本地活动合作", "官方推荐展示"]},
    {"level": 10, "xp": 50000, "zh": "Machi 城市大使", "en": "Machi Community Ambassador", "ja": "Machi 街のアンバサダー", "desc": "代表高可信城市贡献者参与新城市测试。", "privileges": ["城市大使标识", "官方认证展示", "专属运营联系"]},
]
REPUTATION_RULE_DEFAULTS: list[dict[str, Any]] = [
    {"key": "profile_completed", "name": "完善资料", "kind": "onboarding", "xp": 20, "rep": 0, "risk": -1, "daily": 20, "weekly": 20, "monthly": 20, "target_daily": 0, "one_time": 1, "reviewed": 0, "notify": 0},
    {"key": "email_verified", "name": "绑定邮箱", "kind": "onboarding", "xp": 20, "rep": 2, "risk": -2, "daily": 20, "weekly": 20, "monthly": 20, "target_daily": 0, "one_time": 1, "reviewed": 0, "notify": 0},
    {"key": "city_language_set", "name": "设置城市和语言", "kind": "onboarding", "xp": 10, "rep": 0, "risk": -1, "daily": 10, "weekly": 10, "monthly": 10, "target_daily": 0, "one_time": 1, "reviewed": 0, "notify": 0},
    {"key": "first_bookmark", "name": "首次收藏", "kind": "onboarding", "xp": 5, "rep": 0, "risk": 0, "daily": 5, "weekly": 5, "monthly": 5, "target_daily": 0, "one_time": 1, "reviewed": 0, "notify": 0},
    {"key": "first_post", "name": "首次发帖", "kind": "onboarding", "xp": 20, "rep": 0, "risk": 0, "daily": 20, "weekly": 20, "monthly": 20, "target_daily": 0, "one_time": 1, "reviewed": 0, "notify": 1},
    {"key": "post_dynamic", "name": "发布城市动态", "kind": "content", "xp": 5, "rep": 0, "risk": 0, "daily": 15, "weekly": 80, "monthly": 240, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "post_question", "name": "发布问答", "kind": "content", "xp": 8, "rep": 0, "risk": 0, "daily": 24, "weekly": 120, "monthly": 360, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "post_long", "name": "发布长文经验", "kind": "content", "xp": 20, "rep": 0, "risk": 0, "daily": 40, "weekly": 180, "monthly": 540, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "post_guide", "name": "发布城市攻略", "kind": "content", "xp": 30, "rep": 0, "risk": 0, "daily": 60, "weekly": 240, "monthly": 720, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 1},
    {"key": "post_warning", "name": "发布避坑经验", "kind": "content", "xp": 25, "rep": 0, "risk": 0, "daily": 50, "weekly": 200, "monthly": 600, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 1},
    {"key": "post_news", "name": "发布本地快讯", "kind": "content", "xp": 10, "rep": 0, "risk": 0, "daily": 20, "weekly": 100, "monthly": 300, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "post_event", "name": "发布活动小组内容", "kind": "content", "xp": 10, "rep": 0, "risk": 0, "daily": 20, "weekly": 100, "monthly": 300, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "content_liked", "name": "内容被点赞", "kind": "interaction", "xp": 1, "rep": 0, "risk": 0, "daily": 30, "weekly": 120, "monthly": 360, "target_daily": 10, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "content_bookmarked", "name": "内容被收藏", "kind": "interaction", "xp": 5, "rep": 0, "risk": 0, "daily": 80, "weekly": 240, "monthly": 720, "target_daily": 20, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "content_commented", "name": "内容被评论", "kind": "interaction", "xp": 1, "rep": 0, "risk": 0, "daily": 30, "weekly": 120, "monthly": 360, "target_daily": 10, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "comment_on_question", "name": "回答问题", "kind": "interaction", "xp": 10, "rep": 0, "risk": 0, "daily": 30, "weekly": 150, "monthly": 450, "target_daily": 10, "one_time": 0, "reviewed": 0, "notify": 0},
    {"key": "listing_secondhand_published", "name": "发布二手", "kind": "listing", "xp": 15, "rep": 0, "risk": 0, "daily": 45, "weekly": 150, "monthly": 450, "target_daily": 15, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "listing_rental_approved", "name": "房源通过审核", "kind": "listing", "xp": 30, "rep": 0, "risk": -2, "daily": 60, "weekly": 180, "monthly": 540, "target_daily": 30, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "listing_job_approved", "name": "职位通过审核", "kind": "listing", "xp": 30, "rep": 0, "risk": -2, "daily": 60, "weekly": 180, "monthly": 540, "target_daily": 30, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "listing_service_approved", "name": "服务通过审核", "kind": "listing", "xp": 30, "rep": 0, "risk": -2, "daily": 60, "weekly": 180, "monthly": 540, "target_daily": 30, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "listing_discount_approved", "name": "商家优惠通过审核", "kind": "listing", "xp": 20, "rep": 0, "risk": -1, "daily": 40, "weekly": 160, "monthly": 480, "target_daily": 20, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "valid_report", "name": "有效举报成立", "kind": "governance", "xp": 20, "rep": 2, "risk": -2, "daily": 60, "weekly": 180, "monthly": 540, "target_daily": 20, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "violation_free_30d", "name": "连续 30 天无违规", "kind": "trust", "xp": 50, "rep": 5, "risk": -5, "daily": 50, "weekly": 50, "monthly": 50, "target_daily": 0, "one_time": 0, "reviewed": 0, "notify": 1},
    {"key": "admin_trusted", "name": "管理员标记可信用户", "kind": "trust", "xp": 0, "rep": 10, "risk": -10, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "identity_verified", "name": "完成身份认证", "kind": "trust", "xp": 0, "rep": 10, "risk": -10, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 1, "reviewed": 1, "notify": 1},
    {"key": "merchant_verified", "name": "完成商家/服务方/招聘方认证", "kind": "trust", "xp": 0, "rep": 15, "risk": -15, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "content_removed", "name": "内容被下架", "kind": "moderation", "xp": -50, "rep": -5, "risk": 10, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "spam_ad", "name": "垃圾广告", "kind": "moderation", "xp": -20, "rep": -10, "risk": 20, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "fake_secondhand", "name": "虚假二手", "kind": "moderation", "xp": -50, "rep": -20, "risk": 45, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "fake_rental", "name": "虚假房源", "kind": "moderation", "xp": -80, "rep": -30, "risk": 60, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "fake_job", "name": "虚假招聘", "kind": "moderation", "xp": -100, "rep": -40, "risk": 70, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "prohibited_service", "name": "违规服务", "kind": "moderation", "xp": -100, "rep": -40, "risk": 80, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
    {"key": "adult_illegal", "name": "成人/陪伴/违法内容", "kind": "moderation", "xp": -120, "rep": -60, "risk": 100, "daily": 0, "weekly": 0, "monthly": 0, "target_daily": 0, "one_time": 0, "reviewed": 1, "notify": 1},
]
REPUTATION_LIMIT_DEFAULTS: dict[str, int] = {
    "daily_xp_cap": 200,
    "weekly_xp_cap": 700,
    "monthly_xp_cap": 2000,
    "new_user_days": 7,
    "new_user_daily_xp_cap": 80,
    "rental_min_level": 3,
    "rental_min_reputation": 60,
    "job_min_level": 3,
    "job_min_reputation": 70,
    "service_min_level": 3,
    "service_min_reputation": 70,
    "discount_min_level": 3,
    "discount_min_reputation": 60,
    "dm_daily_new_user": 5,
    "dm_low_reputation_cap": 10,
    "dm_reputation_floor": 50,
    "review_risk_threshold": 61,
    "restrict_risk_threshold": 81,
}
REPUTATION_BADGE_DEFAULTS: list[dict[str, Any]] = [
    {"key": "tokyo_contributor", "name": "东京贡献者", "category": "city", "rarity": "common"},
    {"key": "quality_answerer", "name": "优质回答者", "category": "content", "rarity": "uncommon"},
    {"key": "trusted_seller", "name": "可信卖家", "category": "marketplace", "rarity": "rare"},
    {"key": "trusted_recruiter", "name": "可信招聘方", "category": "jobs", "rarity": "rare"},
    {"key": "verified_service_provider", "name": "认证服务者", "category": "service", "rarity": "rare"},
    {"key": "community_steward", "name": "社区守护者", "category": "governance", "rarity": "epic"},
]
REPUTATION_REWARD_DEFAULTS: list[dict[str, Any]] = [
    {"key": "level3_marketplace_boost", "name": "二手置顶券", "type": "listing_boost", "level": 3, "quantity": 1},
    {"key": "level5_guide_coupon", "name": "Guide 资料优惠券", "type": "guide_coupon", "level": 5, "quantity": 1},
    {"key": "level6_priority_review", "name": "优先审核权益", "type": "priority_review", "level": 6, "quantity": 1},
    {"key": "level7_membership_coupon", "name": "会员折扣券", "type": "membership_coupon", "level": 7, "quantity": 1},
    {"key": "level8_steward_badge_apply", "name": "城市守望者徽章申请资格", "type": "badge_application", "level": 8, "quantity": 1},
]

# Machi Local News Desk / 本地资讯台. This is deliberately separate from
# user posts: editorial content is authored by official desk identities,
# keeps source attribution, and never impersonates ordinary users.
NEWS_DESK_USER_AGENT = _env("KAIX_NEWS_DESK_USER_AGENT", "MachiBot/1.0 (+https://machicity.com)")
NEWS_SOURCE_TYPES = {"rss", "webpage", "metadata", "html_list", "manual", "manual_reference", "api"}
NEWS_CRAWL_STRATEGIES = {"rss", "meta_only", "metadata", "html_list", "manual"}
NEWS_CREDIBILITY_LEVELS = {"official", "media", "community", "commercial", "event_platform"}
NEWS_SOURCE_TIERS = {
    "tier_1_official", "tier_2_city_official", "tier_3_public_media",
    "tier_4_event_lifestyle", "tier_5_manual_reference",
}
NEWS_COPYRIGHT_POLICIES = {
    "metadata_only", "official_attribution", "cc_by", "redistribution_restricted",
    "manual_review_only", "unknown",
}
NEWS_CATEGORIES = {
    "local_news", "traffic_alert", "weather_alert", "earthquake_alert", "typhoon_alert",
    "policy_update", "immigration_visa", "city_event", "life_notice", "housing_notice",
    "housing_market", "work_study", "public_safety", "economy", "technology", "culture",
    "sports", "education", "health", "travel", "editor_pick", "weekly_digest", "other",
    "digital_life", "national_notice", "legal_notice", "residence_card", "visa_policy",
    "foreign_resident_notice", "labor_policy", "resident_service", "garbage_rule",
    "child_support", "local_event", "train_delay", "commute", "disaster",
    "disaster_prevention", "food", "weekend", "exhibition", "meetup", "language_exchange",
}
HIGH_RISK_NEWS_CATEGORIES = {
    "weather_alert", "earthquake_alert", "typhoon_alert", "immigration_visa",
    "policy_update", "public_safety", "health", "legal", "medical", "finance", "crime",
    "legal_notice", "residence_card", "visa_policy", "foreign_resident_notice",
    "disaster", "disaster_prevention",
}
NEWS_ITEM_STATUSES = {"fetched", "draft_created", "ignored", "duplicate", "error", "deleted"}
EDITORIAL_POST_STATUSES = {"draft", "pending_review", "published", "hidden", "deleted"}
EDITORIAL_REVIEW_STATUSES = {"none", "needs_review", "approved", "rejected"}

# Per-type attribute schema: {attribute_name: ("str"|"int"|"float", max_len_for_str)}.
# Any field present that isn't listed is silently dropped (so a buggy
# client can't push unbounded keys into a row). All fields are
# optional at the server layer — the App's typed forms are responsible
# for required-field UX.
_STR = "str"; _INT = "int"; _FLOAT = "float"; _BOOL = "bool"
CONTENT_ATTR_SCHEMAS: dict[str, dict[str, tuple[str, int]]] = {
    "secondhand": {
        "title":        (_STR,  120),
        "price":        (_FLOAT, 0),
        "currency":     (_STR,   8),
        "condition":    (_STR,  40),    # 全新 / 9成新 / 8成新 / 有瑕疵
        "trade_method": (_STR,  60),    # 自取 / 邮寄 / 当面
        "area":         (_STR,  80),
        "status":       (_STR,  20),    # available / reserved / sold
    },
    "housing": {
        "title":            (_STR,  120),
        "rent":             (_FLOAT,  0),
        "currency":         (_STR,    8),
        "room_type":        (_STR,   40),
        "area":             (_STR,   80),
        "nearest_station":  (_STR,   80),
        "move_in_date":     (_STR,   40),
        "deposit":          (_STR,   40),
        "key_money":        (_STR,   40),
        "contact_method":   (_STR,  120),
        "status":           (_STR,   20),    # available / rented
    },
    "roommate": {
        "title":          (_STR, 120),
        "rent_range":     (_STR,  40),
        "area":           (_STR,  80),
        "move_in_date":   (_STR,  40),
        "lifestyle_tags": (_STR, 200),
        "requirements":   (_STR, 600),
        "contact_method": (_STR, 120),
    },
    "job_seek": {
        "desired_job":     (_STR, 120),
        "skills":          (_STR, 400),
        "languages":       (_STR, 200),
        "visa_status":     (_STR,  60),
        "availability":    (_STR,  60),
        "expected_salary": (_STR,  60),
        "resume_url":      (_STR, 400),
        "contact_method":  (_STR, 120),
    },
    "job_post": {
        "job_title":            (_STR, 120),
        "company_name":         (_STR, 120),
        "salary":               (_STR,  80),
        "job_type":             (_STR,  40),    # full_time / part_time / internship / remote
        "language_requirement": (_STR, 120),
        "visa_requirement":     (_STR,  60),
        "work_location":        (_STR, 120),
        "contact_method":       (_STR, 120),
        "company_verified":     (_BOOL,  0),
    },
    "meetup": {
        "title":         (_STR, 120),
        "meetup_type":   (_STR,  60),
        "meetup_time":   (_STR,  40),
        "location":      (_STR, 120),
        "people_limit":  (_INT,   0),
        "budget":        (_STR,  60),
        "description":   (_STR, 1000),
        "safety_notice": (_STR, 200),
    },
    "dining": {
        "title":              (_STR, 120),
        "restaurant_or_area": (_STR, 120),
        "meetup_time":        (_STR,  40),
        "people_limit":       (_INT,   0),
        "budget":             (_STR,  60),
        "description":        (_STR, 1000),
    },
    "event": {
        "title":               (_STR, 120),
        "event_time":          (_STR,  40),
        "location":            (_STR, 120),
        "fee":                 (_STR,  60),
        "capacity":            (_INT,   0),
        "registration_method": (_STR, 120),
        "description":         (_STR, 1500),
    },
    "guide": {
        "title":        (_STR, 120),
        "cover_image":  (_STR, 400),
        "summary":      (_STR, 280),
        "content":      (_STR, 3000),
        "last_updated_at": (_STR, 40),
    },
    "news": {
        "title":        (_STR, 200),
        "source":       (_STR, 120),
        "summary":      (_STR, 400),
        "content":      (_STR, 3000),
        "location":     (_STR, 120),
        "event_time":   (_STR,  40),
        "external_url": (_STR, 400),
    },
    "local_info": {
        "title":        (_STR, 200),
        "source":       (_STR, 120),
        "summary":      (_STR, 400),
        "content":      (_STR, 3000),
        "location":     (_STR, 120),
        "event_time":   (_STR,  40),
        "external_url": (_STR, 400),
    },
    "service": {
        "service_type":     (_STR, 80),
        "price_range":      (_STR, 60),
        "contact_method":   (_STR, 120),
        "merchant_id":      (_STR, 40),
        "verified_status":  (_STR, 20),
    },
    "merchant": {
        "merchant_name":   (_STR, 120),
        "merchant_type":   (_STR,  80),
        "address":         (_STR, 200),
        "opening_hours":   (_STR, 120),
        "contact_method":  (_STR, 120),
        "verified_status": (_STR,  20),
        "rating":          (_FLOAT, 0),
    },
    "coupon": {
        "title":         (_STR, 120),
        "merchant_id":   (_STR,  40),
        "discount_info": (_STR, 120),
        "valid_until":   (_STR,  40),
        "usage_rules":   (_STR, 400),
    },
    "warning": {
        "title":         (_STR, 200),
        "category":      (_STR,  60),
        "description":   (_STR, 1500),
        "evidence_images": (_STR, 800),
        "anonymous":     (_BOOL,  0),
        "review_status": (_STR,  20),
    },
    "anonymous": {
        "title":       (_STR, 120),
        "description": (_STR, 1500),
        "anonymous":   (_BOOL, 0),
    },
    "referral": {
        "job_title":      (_STR, 120),
        "company_name":   (_STR, 120),
        "work_location":  (_STR, 120),
        "contact_method": (_STR, 120),
        "description":    (_STR, 1000),
    },
    "poll": {
        "question":     (_STR, 200),
        "options":      (_STR, 600),   # JSON-stringified array, normalised client-side
        "expires_at":   (_STR,  40),
    },
}

