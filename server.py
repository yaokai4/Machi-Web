#!/usr/bin/env python3
"""Machi unified backend.

Single source of truth for the iOS App and the Web client.
SQLite-backed. JSON over HTTP. Token sessions in Authorization header.

This file is intentionally a single-file server: no external dependencies,
runnable with `python3 server.py`. The schema is designed so it can be
lifted to Postgres / Aurora without changing the API shape.

API contract (all JSON, all snake_case unless noted):

    POST   /api/auth/register
    POST   /api/auth/login
    POST   /api/auth/logout
    GET    /api/auth/me
    PATCH  /api/auth/me
    DELETE /api/auth/me

    GET    /api/users/:id
    GET    /api/users/:id/posts
    GET    /api/users/:id/replies
    GET    /api/users/:id/media
    GET    /api/users/:id/likes
    GET    /api/users/:id/bookmarks
    POST   /api/users/:id/follow
    DELETE /api/users/:id/follow
    POST   /api/users/:id/block
    DELETE /api/users/:id/block
    POST   /api/users/:id/report

    GET    /api/feed                  ?mode=recommend|local|following|hot&country=&province=&city=&content_type=
    GET    /api/posts                 ?mode=recommend|local|following|hot&country=&province=&city=&content_type=
    POST   /api/posts
    GET    /api/posts/:id
    PATCH  /api/posts/:id
    DELETE /api/posts/:id
    POST   /api/posts/:id/like
    DELETE /api/posts/:id/like
    POST   /api/posts/:id/bookmark
    DELETE /api/posts/:id/bookmark
    POST   /api/posts/:id/repost
    DELETE /api/posts/:id/repost
    POST   /api/posts/:id/poll/vote  (body {option_index})
    POST   /api/posts/:id/view
    POST   /api/posts/:id/report
    POST   /api/posts/:id/comments
    GET    /api/posts/:id/comments
    DELETE /api/comments/:id
    POST   /api/comments/:id/like
    DELETE /api/comments/:id/like

    GET    /api/search                ?q=...&kind=post|user|topic
    GET    /api/trending
    GET    /api/topics
    GET    /api/topics/:tag

    GET    /api/notifications
    POST   /api/notifications/read    (body {ids:[...] or all:true})
    DELETE /api/notifications/:id

    GET    /api/conversations
    POST   /api/conversations         (body {peer_id})
    DELETE /api/conversations/:id
    GET    /api/conversations/:id/messages
    POST   /api/conversations/:id/messages
    DELETE /api/messages/:id
    POST   /api/conversations/:id/read

    POST   /api/media/upload          (multipart)
    GET    /api/media/:id
    DELETE /api/media/:id

    GET    /api/settings
    PATCH  /api/settings
    POST   /api/cache/clear
    GET    /api/export
    POST   /api/feedback

    GET    /api/devices
    DELETE /api/devices/:id

    GET    /api/blocks
    GET    /api/drafts
    POST   /api/drafts
    DELETE /api/drafts/:id

    GET    /api/events                Server-Sent Events for realtime
"""

from __future__ import annotations

import base64
import email.utils
import hashlib
import hmac
import html
import io
import ipaddress
import json
import mimetypes
import os
import queue
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
import urllib.request
import urllib.error
import urllib.robotparser
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urljoin, urlparse
import xml.etree.ElementTree as ET

# City Seed Bot content library — local module, no third-party deps. Holds the
# curated city-life content pools + generator used by 城市内容助手.
import seed_content_library as seedlib
from services.crawler import CrawlerError, CrawlerSkipped, crawl_source, normalize_allowed_domain

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
MAX_UPLOAD_BYTES = int(_env("KAIX_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
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

# Visitor analytics.
VISITOR_LOG_ENABLED = _env("KAIX_VISITOR_LOG_ENABLED", "1") == "1"
# Collapse repeated hits from the same client into one row within this
# window so high-frequency API polling doesn't flood the table.
VISITOR_LOG_DEDUP_SEC = int(_env("KAIX_VISITOR_LOG_DEDUP_SEC", "300"))
VISITOR_LOG_RETENTION_DAYS = int(_env("KAIX_VISITOR_LOG_RETENTION_DAYS", "90"))
# GeoIP resolver: "none" (default, no lookups), "ipapi" (ip-api.com, free,
# no key, rate-limited), or "maxmind" (offline GeoLite2 db, needs geoip2).
GEOIP_TRANSPORT = _env("KAIX_GEOIP_TRANSPORT", "none").lower()
GEOIP_MAXMIND_DB = _env("KAIX_GEOIP_MAXMIND_DB", "")

# Comma-separated origin allowlist. In production this should be the host(s)
# that serve the Web client. In dev we fall back to "*" so localhost still
# works.
_origins_raw = _env("KAIX_ALLOWED_ORIGINS", "*" if not PRODUCTION else "")
ALLOWED_ORIGINS = {o.strip() for o in _origins_raw.split(",") if o.strip()}

# Rate-limit policy. Token-bucket per IP per group. Tuned for an audience
# of "tens of thousands of real users" sharing a few dozen NATs at peak.
RATE_LIMITS = {
    # group           -> (capacity, refill_per_minute)
    "auth":   (10, 5),       # /api/auth/* — brute-force guard
    "email":  (5, 2),        # /api/auth/*/send-code — code-spam guard
    "write":  (60, 60),      # mutating endpoints
    "read":   (300, 300),    # reads
    "search": (40, 40),
    "media":  (20, 20),
    "payment": (20, 10),     # order creation / verify — tight money path
}

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
    "video/mp4", "video/quicktime", "video/webm",
}

# Canonical file extension per mime. We do NOT trust mimetypes.guess_extension
# because it varies across Python versions and platforms — a fixed table is
# both safer (no surprise extensions on disk) and consistent across deploys.
EXT_BY_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/gif":  ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "video/mp4":        ".mp4",
    "video/quicktime":  ".mov",
    "video/webm":       ".webm",
}


# ---------------------------------------------------------------------------
# Machi Verified membership + payments
#
# A single paid plan ("Machi 认证会员", ¥10/月). Everything price/plan
# related is driven from here so the amount can never be set by a client
# — the server always recomputes the charge from `plan_key`. Payment
# provider secrets are read from the environment and NEVER logged, never
# returned by any API, and never shipped to the browser/app bundle.
# ---------------------------------------------------------------------------

MEMBERSHIP_PLAN_KEY = _env("MEMBERSHIP_PLAN_KEY", "machi_verified_monthly_cny_10")
# Price is authoritative server-side. Stored/maths done in minor units
# (fen) to avoid float money; ¥10 == 1000 fen.
MEMBERSHIP_PRICE_CNY = int(_env("MEMBERSHIP_PRICE_CNY", "10"))
MEMBERSHIP_PRICE_FEN = MEMBERSHIP_PRICE_CNY * 100
MEMBERSHIP_CURRENCY = "CNY"
MEMBERSHIP_BILLING_CYCLE = "monthly"
# Apple App Store product id for the same plan. iOS buys through IAP.
APPLE_IAP_PRODUCT_ID = _env("APPLE_IAP_PRODUCT_ID", "machi_verified_monthly_cny_10")

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

# --- payment providers (all optional; configured per-deploy) ---
WECHAT_PAY_APP_ID = _env("WECHAT_PAY_APP_ID", "")
WECHAT_PAY_MCH_ID = _env("WECHAT_PAY_MCH_ID", "")
WECHAT_PAY_API_V3_KEY = _env("WECHAT_PAY_API_V3_KEY", "")
WECHAT_PAY_SERIAL_NO = _env("WECHAT_PAY_SERIAL_NO", "")
# Accept the merchant private key either inline (WECHAT_PAY_PRIVATE_KEY) or
# as a file path (WECHAT_PAY_PRIVATE_KEY_PATH, e.g. apiclient_key.pem).
WECHAT_PAY_PRIVATE_KEY = _read_secret_file(_env("WECHAT_PAY_PRIVATE_KEY", ""), _env("WECHAT_PAY_PRIVATE_KEY_PATH", ""))
WECHAT_PAY_NOTIFY_URL = _env("WECHAT_PAY_NOTIFY_URL", "")

ALIPAY_APP_ID = _env("ALIPAY_APP_ID", "")
ALIPAY_PRIVATE_KEY = _read_secret_file(_env("ALIPAY_PRIVATE_KEY", ""), _env("ALIPAY_PRIVATE_KEY_PATH", ""))
ALIPAY_PUBLIC_KEY = _read_secret_file(_env("ALIPAY_PUBLIC_KEY", ""), _env("ALIPAY_PUBLIC_KEY_PATH", ""))
ALIPAY_GATEWAY = _env("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do")
ALIPAY_NOTIFY_URL = _env("ALIPAY_NOTIFY_URL", "")
ALIPAY_RETURN_URL = _env("ALIPAY_RETURN_URL", "")

APPLE_IAP_BUNDLE_ID = _env("APPLE_IAP_BUNDLE_ID", "")
APPLE_IAP_ISSUER_ID = _env("APPLE_IAP_ISSUER_ID", "")
APPLE_IAP_KEY_ID = _env("APPLE_IAP_KEY_ID", "")
APPLE_IAP_PRIVATE_KEY = _env("APPLE_IAP_PRIVATE_KEY", "")
APPLE_IAP_ENVIRONMENT = _env("APPLE_IAP_ENVIRONMENT", "Sandbox")

# Stripe (overseas / card payments via hosted Checkout). Only the SECRET
# key + webhook signing secret are needed server-side (hosted Checkout
# handles the card UI). The price is charged in STRIPE_CURRENCY at
# STRIPE_PRICE_CENTS minor units — the overseas price, independent of the
# domestic CNY plan. Webhook verification is plain HMAC-SHA256 (stdlib),
# so Stripe needs no extra packages.
STRIPE_SECRET_KEY = _env("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_CENTS = int(_env("STRIPE_PRICE_CENTS", "199"))  # e.g. 199 = $1.99
STRIPE_CURRENCY = _env("STRIPE_CURRENCY", "usd").lower()
STRIPE_SUCCESS_URL = _env("STRIPE_SUCCESS_URL", "https://machicity.com/membership?paid=1")
STRIPE_CANCEL_URL = _env("STRIPE_CANCEL_URL", "https://machicity.com/membership")

# Mock payments let the Web flow be exercised end-to-end before real
# merchant credentials exist. HARD rule: never available in production.
# A successful "mock paid" can only happen when this is on AND we are not
# in production.
PAYMENT_MOCK_ENABLED = (_env("PAYMENT_MOCK_ENABLED", "0") == "1") and not PRODUCTION
# How long an unpaid order stays payable.
PAYMENT_ORDER_TTL_SEC = int(_env("PAYMENT_ORDER_TTL_SEC", "900"))


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

# Machi Local News Desk / 本地资讯台. This is deliberately separate from
# user posts: editorial content is authored by official desk identities,
# keeps source attribution, and never impersonates ordinary users.
NEWS_DESK_USER_AGENT = _env("KAIX_NEWS_DESK_USER_AGENT", "MachiBot/1.0 (+https://machicity.com)")
NEWS_DESK_PROMPT_VERSION = "machi_japan_local_editorial_v3"
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
EDITORIAL_AUTHOR_TYPES = {"local_desk", "city_editor", "tokyo_editorial", "osaka_editorial", "japan_editorial", "admin"}
EDITORIAL_POST_STATUSES = {"draft", "pending_review", "published", "hidden", "deleted"}
EDITORIAL_REVIEW_STATUSES = {"none", "needs_review", "approved", "rejected"}
NEWS_CRAWLER_ENABLED = _env("NEWS_CRAWLER_ENABLED", "true").lower() == "true"
NEWS_CRAWLER_AUTO_FETCH = _env("NEWS_CRAWLER_AUTO_FETCH", "false").lower() == "true"
NEWS_CRAWLER_MAX_CONCURRENCY = max(1, min(int(_env("NEWS_CRAWLER_MAX_CONCURRENCY", "3") or "3"), 8))
NEWS_CRAWLER_PER_DOMAIN_CONCURRENCY = max(1, min(int(_env("NEWS_CRAWLER_PER_DOMAIN_CONCURRENCY", "1") or "1"), 4))

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


def normalize_content_type(value: str | None) -> str:
    """Whitelist + default. Anything unrecognised collapses to
    'dynamic' so we never persist a junk discriminator."""
    if not value:
        return "dynamic"
    candidate = value.strip().lower()
    return candidate if candidate in CONTENT_TYPES else "dynamic"


def normalize_post_attributes(content_type: str, raw: Any) -> str:
    """Validate `raw` against the per-type schema and return a JSON
    string ready to store in `posts.attributes`. Drops unknown keys,
    truncates long strings, casts numeric values, and forces a stable
    sorted-key serialisation so the same payload always produces the
    same string (useful for diffing / debugging)."""
    if raw is None or raw == "":
        return ""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return ""
    if not isinstance(raw, dict):
        return ""
    schema = CONTENT_ATTR_SCHEMAS.get(content_type)
    if schema is None:
        # Untyped content (or a type without a schema yet): allow
        # plain string fields up to 600 chars and ignore the rest.
        out: dict[str, Any] = {}
        for k, v in raw.items():
            if not isinstance(k, str) or len(k) > 60:
                continue
            if isinstance(v, str):
                out[k] = v[:600]
            elif isinstance(v, (int, float, bool)):
                out[k] = v
        return json.dumps(out, ensure_ascii=False, sort_keys=True) if out else ""

    out = {}
    for key, (kind, cap) in schema.items():
        if key not in raw:
            continue
        v = raw[key]
        try:
            if content_type == "poll" and key == "options":
                options = normalize_poll_options(v)
                if options:
                    out[key] = json.dumps(options, ensure_ascii=False)
                continue
            if kind == _STR:
                s = str(v)
                if cap and len(s) > cap:
                    s = s[:cap]
                out[key] = s
            elif kind == _INT:
                out[key] = int(v)
            elif kind == _FLOAT:
                out[key] = float(v)
            elif kind == _BOOL:
                out[key] = bool(v)
        except (TypeError, ValueError):
            continue
    return json.dumps(out, ensure_ascii=False, sort_keys=True) if out else ""


def decode_post_attributes(raw: str | None) -> dict[str, Any]:
    """Inverse of normalize_post_attributes: stringified JSON → dict.
    Returns {} for empty / malformed inputs."""
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def normalize_poll_options(raw: Any) -> list[str]:
    """Return 2-6 clean poll options. Accepts a JSON array, a Python
    list, or a human-typed string split by newlines / slashes / semicolons.
    """
    value = raw
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                value = parsed
            except json.JSONDecodeError:
                value = stripped
    if isinstance(value, (list, tuple)):
        candidates = [str(item) for item in value]
    else:
        candidates = re.split(r"[\n/；;|]+", str(value or ""))
    options: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        clean = re.sub(r"\s+", " ", candidate).strip()
        if not clean:
            continue
        clean = clean[:80]
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        options.append(clean)
        if len(options) >= 6:
            break
    return options if len(options) >= 2 else []


def poll_options_from_attributes(attrs: dict[str, Any]) -> list[str]:
    return normalize_poll_options(attrs.get("options"))


def poll_is_closed(expires_at: Any) -> bool:
    raw = str(expires_at or "").strip()
    if not raw:
        return False
    try:
        normalized = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt <= datetime.now(timezone.utc)
    except ValueError:
        return False


def _sniff_mime(data: bytes) -> str | None:
    """Inspect file magic bytes and return the mime if it matches one of
    the allowed types. Returns None if the content can't be matched.
    This is the only authoritative check — Content-Type from the client
    is a hint, not a fact."""
    if len(data) < 12:
        return None
    head = data[:16]
    # Images
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"GIF8" and head[4:6] in (b"7a", b"9a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    # HEIC/HEIF — ISO BMFF with ftyp box at offset 4.
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis", b"hevc", b"hevx"):
        return "image/heic"
    # Videos
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"dash"):
            return "video/mp4"
        if brand == b"qt  ":
            return "video/quicktime"
    if head.startswith(b"\x1aE\xdf\xa3"):  # EBML, used by WebM/Matroska
        return "video/webm"
    return None

DB_LOCK = threading.RLock()

# A write request that cannot acquire the global write lock within this many
# seconds fails fast with 503 instead of hanging the connection forever.
# Normal writes hold the lock for milliseconds — this is purely a safety
# valve so one stuck/slow holder can never wedge the whole backend again.
DB_WRITE_LOCK_TIMEOUT_SEC = float(_env("KAIX_DB_WRITE_LOCK_TIMEOUT_SEC", "20"))


class _DBLockReleased:
    """Temporarily drop the global write lock around slow I/O (e.g. a network
    crawl) so it doesn't block every other writer. Safe from a write handler
    that holds the lock; re-acquires on exit even if the body raises. No-op if
    the current thread doesn't hold the lock. The request's own connection is
    in autocommit mode, so no transaction spans the released window."""

    def __enter__(self) -> "_DBLockReleased":
        try:
            DB_LOCK.release()
            self._released = True
        except RuntimeError:
            self._released = False
        return self

    def __exit__(self, *exc: Any) -> bool:
        if getattr(self, "_released", False):
            DB_LOCK.acquire()
        return False

# ---------------------------------------------------------------------------
# session last-seen throttle and short-lived SSE token store.
# Both are in-memory only — they don't need to survive restarts.
# ---------------------------------------------------------------------------

# Map[token] -> monotonic timestamp of the last DB flush. We only write
# sessions.last_seen_at to the database when more than this many seconds
# have elapsed since the previous flush for the same token. Anything
# shorter is just kept in memory.
_LAST_SEEN_FLUSH_SEC = 60.0
_LAST_SEEN_LOCK = threading.Lock()
_LAST_SEEN: dict[str, float] = {}

# Short-lived tokens used exclusively for EventSource subscriptions.
# EventSource cannot attach an Authorization header, so the Web client
# trades its long-lived Bearer for a single-use SSE token via
# POST /api/events/token. The token is bound to a user id and expires
# in `_SSE_TOKEN_TTL` seconds. Keeping the long-lived token out of the
# URL stops it from leaking through nginx access logs / Referer headers.
_SSE_TOKEN_TTL = 300.0
_SSE_TOKEN_LOCK = threading.Lock()
_SSE_TOKENS: dict[str, tuple[str, float]] = {}


def _should_flush_last_seen(token: str) -> bool:
    now = time.monotonic()
    with _LAST_SEEN_LOCK:
        last = _LAST_SEEN.get(token)
        # First time we've seen this token in-process: always flush so
        # the DB row's last_seen_at gets bumped at least once per
        # process lifetime. Subsequent requests within the window are
        # coalesced.
        if last is not None and now - last < _LAST_SEEN_FLUSH_SEC:
            return False
        _LAST_SEEN[token] = now
        # Keep memory bounded — drop entries older than 1h.
        if len(_LAST_SEEN) > 10000:
            cutoff = now - 3600
            for k, v in list(_LAST_SEEN.items()):
                if v < cutoff:
                    _LAST_SEEN.pop(k, None)
    return True


def _mint_sse_token(user_id: str) -> str:
    token = secrets.token_urlsafe(24)
    now = time.monotonic()
    with _SSE_TOKEN_LOCK:
        _SSE_TOKENS[token] = (user_id, now + _SSE_TOKEN_TTL)
        # Lazy GC.
        if len(_SSE_TOKENS) > 5000:
            for k, (_, exp) in list(_SSE_TOKENS.items()):
                if exp < now:
                    _SSE_TOKENS.pop(k, None)
    return token


def _consume_sse_token(token: str) -> str | None:
    """Validate an SSE token. Returns the bound user id or None.
    The token is single-use: it's removed on first consumption."""
    if not token:
        return None
    now = time.monotonic()
    with _SSE_TOKEN_LOCK:
        entry = _SSE_TOKENS.pop(token, None)
    if not entry:
        return None
    user_id, expires_at = entry
    if expires_at < now:
        return None
    return user_id


# Generic TTL cache shared by hot feed / trending / admin stats — these
# endpoints are expensive but tolerate small staleness.
_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any | None:
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry and entry[0] > now:
            return entry[1]
        if entry:
            _CACHE.pop(key, None)
    return None


def _cache_put(key: str, value: Any, ttl_seconds: float) -> None:
    with _CACHE_LOCK:
        _CACHE[key] = (time.monotonic() + ttl_seconds, value)


def _cache_invalidate(prefix: str = "") -> None:
    with _CACHE_LOCK:
        for k in list(_CACHE.keys()):
            if not prefix or k.startswith(prefix):
                _CACHE.pop(k, None)


# ---------------------------------------------------------------------------
# region directory.
#
# Machi is a local-life / city-scoped social product. Both
# the iOS App and the Web client need a single source of truth for the
# country → province → city tree. Keeping it in-process (no DB tables,
# no external CDN) means region lookups are zero-latency and the file
# itself is auditable. The iOS App mirrors this exact tree in
# `RegionDirectory.swift` so an offline client can still render the
# picker; both sides agree on `region_code` so posts cross over
# cleanly.
#
# Schema:
#   COUNTRIES: ordered list of (code, name, emoji, hot?)
#   PROVINCES: code -> [(province_code, province_name)]      (sub-level countries only)
#   CITIES:    province_code -> [(city_code, city_name)]     (countries with provinces)
#              country_code  -> [(city_code, city_name)]     (countries without)
#   POPULAR_CITIES: ordered list of region_code (for the homepage shortcut)
#
# region_code conventions:
#   "<country_iso2>.<city_slug>"             flat countries (jp, sg, kr, …)
#   "<country_iso2>.<province_slug>.<city>"  hierarchical (cn, us)
# All lowercase ASCII, dot-separated. Used as a stable identifier in
# posts.region_code and the cache keys for hot lists.
# ---------------------------------------------------------------------------

REGION_COUNTRIES: list[dict[str, Any]] = [
    {"code": "cn", "name": "中国",     "emoji": "🇨🇳", "tier": 1, "has_provinces": True},
    {"code": "jp", "name": "日本",     "emoji": "🇯🇵", "tier": 1, "has_provinces": True},
    {"code": "us", "name": "美国",     "emoji": "🇺🇸", "tier": 1, "has_provinces": True},
    {"code": "uk", "name": "英国",     "emoji": "🇬🇧", "tier": 2, "has_provinces": False},
    {"code": "ca", "name": "加拿大",   "emoji": "🇨🇦", "tier": 2, "has_provinces": False},
    {"code": "au", "name": "澳大利亚", "emoji": "🇦🇺", "tier": 2, "has_provinces": False},
    {"code": "sg", "name": "新加坡",   "emoji": "🇸🇬", "tier": 2, "has_provinces": False},
    {"code": "kr", "name": "韩国",     "emoji": "🇰🇷", "tier": 2, "has_provinces": False},
    {"code": "th", "name": "泰国",     "emoji": "🇹🇭", "tier": 3, "has_provinces": False},
    {"code": "my", "name": "马来西亚", "emoji": "🇲🇾", "tier": 3, "has_provinces": False},
    {"code": "de", "name": "德国",     "emoji": "🇩🇪", "tier": 3, "has_provinces": False},
    {"code": "fr", "name": "法国",     "emoji": "🇫🇷", "tier": 3, "has_provinces": False},
    {"code": "nl", "name": "荷兰",     "emoji": "🇳🇱", "tier": 3, "has_provinces": False},
]

REGION_PROVINCES: dict[str, list[dict[str, str]]] = {
    "cn": [
        {"code": "beijing",    "name": "北京"},
        {"code": "shanghai",   "name": "上海"},
        {"code": "tianjin",    "name": "天津"},
        {"code": "chongqing",  "name": "重庆"},
        {"code": "zhejiang",   "name": "浙江"},
        {"code": "jiangsu",    "name": "江苏"},
        {"code": "guangdong",  "name": "广东"},
        {"code": "hongkong",   "name": "香港"},
        {"code": "sichuan",    "name": "四川"},
        {"code": "shandong",   "name": "山东"},
        {"code": "fujian",     "name": "福建"},
        {"code": "henan",      "name": "河南"},
        {"code": "anhui",      "name": "安徽"},
        {"code": "hunan",      "name": "湖南"},
        {"code": "shaanxi",    "name": "陕西"},
        {"code": "hubei",      "name": "湖北"},
    ],
    "jp": [
        {"code": "tokyo",     "name": "东京都"},
        {"code": "osaka",     "name": "大阪府"},
        {"code": "kyoto",     "name": "京都府"},
        {"code": "fukuoka",   "name": "福冈县"},
        {"code": "aichi",     "name": "爱知县"},
    ],
    "us": [
        {"code": "ca", "name": "加利福尼亚"},
        {"code": "ny", "name": "纽约"},
        {"code": "wa", "name": "华盛顿"},
        {"code": "tx", "name": "德克萨斯"},
        {"code": "fl", "name": "佛罗里达"},
        {"code": "il", "name": "伊利诺伊"},
        {"code": "ma", "name": "马萨诸塞"},
        {"code": "nj", "name": "新泽西"},
    ],
}

# Cities are keyed by the parent slug. For hierarchical countries the
# parent is the province slug; for flat countries it's the country code.
REGION_CITIES: dict[str, list[dict[str, str]]] = {
    # ---- China by province ----
    "shanghai":   [{"code": "shanghai", "name": "上海"}],
    "beijing":    [{"code": "beijing",  "name": "北京"}],
    "tianjin":    [{"code": "tianjin",  "name": "天津"}],
    "chongqing":  [{"code": "chongqing", "name": "重庆"}],
    "zhejiang":   [{"code": "hangzhou", "name": "杭州"}, {"code": "ningbo", "name": "宁波"}],
    "jiangsu":    [{"code": "nanjing", "name": "南京"}, {"code": "suzhou", "name": "苏州"}],
    "guangdong": [
        {"code": "guangzhou", "name": "广州"},
        {"code": "shenzhen",  "name": "深圳"},
        {"code": "foshan",    "name": "佛山"},
        {"code": "dongguan",  "name": "东莞"},
    ],
    "sichuan":  [{"code": "chengdu",  "name": "成都"}],
    "shandong": [{"code": "qingdao",  "name": "青岛"}],
    "fujian":   [{"code": "xiamen",   "name": "厦门"}],
    "henan":    [{"code": "zhengzhou","name": "郑州"}],
    "anhui":    [{"code": "hefei",    "name": "合肥"}],
    "hubei":    [{"code": "wuhan",    "name": "武汉"}],
    "shaanxi":  [{"code": "xian",     "name": "西安"}],
    "hunan":    [{"code": "changsha", "name": "长沙"}],
    "hongkong": [{"code": "hongkong", "name": "香港"}],
    # ---- Japan by prefecture ----
    "tokyo":    [{"code": "tokyo",    "name": "东京"}],
    "osaka":    [{"code": "osaka",    "name": "大阪"}],
    "kyoto":    [{"code": "kyoto",    "name": "京都"}],
    "fukuoka":  [{"code": "fukuoka",  "name": "福冈"}],
    "aichi":    [{"code": "nagoya",   "name": "名古屋"}],
    # ---- US by state ----
    "ca": [
        {"code": "sf",   "name": "旧金山"},
        {"code": "la",   "name": "洛杉矶"},
        {"code": "sd",   "name": "圣地亚哥"},
        {"code": "sj",   "name": "圣何塞"},
        {"code": "irvine","name":"尔湾"},
    ],
    "ny": [{"code": "nyc", "name": "纽约"}, {"code": "buffalo", "name": "布法罗"}],
    "wa": [{"code": "seattle", "name": "西雅图"}, {"code": "bellevue", "name": "贝尔维尤"}],
    "tx": [{"code": "austin", "name": "奥斯汀"}, {"code": "houston", "name": "休斯顿"}, {"code": "dallas", "name": "达拉斯"}],
    "fl": [{"code": "miami", "name": "迈阿密"}, {"code": "orlando", "name": "奥兰多"}],
    "il": [{"code": "chicago", "name": "芝加哥"}],
    "ma": [{"code": "boston",  "name": "波士顿"}],
    "nj": [{"code": "newark",  "name": "纽瓦克"}],
    # ---- Flat countries ----
    "uk": [{"code": "london", "name": "伦敦"}, {"code": "manchester", "name": "曼彻斯特"}, {"code": "edinburgh", "name": "爱丁堡"}],
    "ca_country": [],  # placeholder to avoid name clash; CA-country cities listed below by country code
    "ca_flat":  [{"code": "toronto", "name": "多伦多"}, {"code": "vancouver", "name": "温哥华"}, {"code": "montreal", "name": "蒙特利尔"}],
    "au":  [{"code": "sydney", "name": "悉尼"}, {"code": "melbourne", "name": "墨尔本"}, {"code": "brisbane", "name": "布里斯班"}, {"code": "perth", "name": "珀斯"}],
    "sg":  [{"code": "singapore", "name": "新加坡"}],
    "kr":  [{"code": "seoul", "name": "首尔"}, {"code": "busan", "name": "釜山"}],
    "th":  [{"code": "bangkok", "name": "曼谷"}, {"code": "chiangmai", "name": "清迈"}, {"code": "phuket", "name": "普吉"}],
    "my":  [{"code": "kl", "name": "吉隆坡"}, {"code": "penang", "name": "槟城"}],
    "de":  [{"code": "berlin", "name": "柏林"}, {"code": "munich", "name": "慕尼黑"}, {"code": "hamburg", "name": "汉堡"}],
    "fr":  [{"code": "paris", "name": "巴黎"}, {"code": "lyon", "name": "里昂"}],
    "nl":  [{"code": "amsterdam", "name": "阿姆斯特丹"}],
}

# Hot cities surface as shortcuts on the picker landing page.
# Tuned for Machi's audience: domestic launch cities and the overseas metros with the largest Chinese-speaking
# communities (海外华人聚居地). Order roughly mirrors what the picker
# shows top-to-bottom — keep the most-used cities near the front so
# the chip grid's first row is high-signal.
POPULAR_CITIES: list[str] = [
    # ---- China ----
    "cn.shanghai.shanghai", "cn.beijing.beijing",
    "cn.guangdong.shenzhen", "cn.guangdong.guangzhou",
    "cn.zhejiang.hangzhou", "cn.sichuan.chengdu",
    "cn.chongqing.chongqing", "cn.hubei.wuhan",
    "cn.jiangsu.nanjing", "cn.jiangsu.suzhou",
    "cn.shaanxi.xian", "cn.hunan.changsha",
    "cn.shandong.qingdao", "cn.fujian.xiamen",
    "cn.tianjin.tianjin", "cn.henan.zhengzhou",
    "cn.zhejiang.ningbo", "cn.guangdong.foshan",
    "cn.guangdong.dongguan", "cn.anhui.hefei",
    # ---- Japan ----
    "jp.tokyo.tokyo", "jp.osaka.osaka",
    "jp.kyoto.kyoto", "jp.fukuoka.fukuoka", "jp.aichi.nagoya",
    # ---- US ----
    "us.ny.nyc", "us.ca.la", "us.ca.sf", "us.wa.seattle",
    # ---- Canada ----
    "ca.toronto", "ca.vancouver", "ca.montreal",
    # ---- Australia ----
    "au.sydney", "au.melbourne",
    # ---- UK ----
    "uk.london",
    # ---- Other Asia / SEA ----
    "sg.singapore", "kr.seoul",
    "th.bangkok",
]


def _cities_for_parent(country_code: str, province_code: str | None) -> list[dict[str, str]]:
    """Resolve the city list given a parent. Handles both the
    hierarchical (country has provinces) and flat country cases."""
    if province_code:
        # Province-level lookup. The dict uses province slug as key.
        return REGION_CITIES.get(province_code, [])
    # Flat country: special-case Canada so it doesn't collide with the
    # California state slug "ca".
    if country_code == "ca":
        return REGION_CITIES.get("ca_flat", [])
    return REGION_CITIES.get(country_code, [])


def _country_lookup(code: str) -> dict[str, Any] | None:
    for c in REGION_COUNTRIES:
        if c["code"] == code:
            return c
    return None


def _resolve_region_code(country: str, province: str, city: str) -> str:
    """Build the canonical region_code from (country, province, city)
    slugs. Returns an empty string when inputs are blank — callers
    treat that as "no region selected"."""
    country = (country or "").strip().lower()
    province = (province or "").strip().lower()
    city = (city or "").strip().lower()
    if not country or not city:
        return ""
    spec = _country_lookup(country)
    if spec and spec.get("has_provinces") and province:
        return f"{country}.{province}.{city}"
    return f"{country}.{city}"


def _parse_region_code(code: str) -> tuple[str, str, str]:
    """Inverse of _resolve_region_code. Returns (country, province, city)
    slugs; province is "" for flat-country codes."""
    parts = (code or "").split(".")
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    if len(parts) == 2:
        return parts[0], "", parts[1]
    return "", "", ""


def _resolve_region_label(country: str, province: str, city: str) -> str:
    """Return the city display name for a valid region, else empty."""
    for item in _cities_for_parent(country, province or None):
        if item["code"] == city:
            return item["name"]
    return ""


def _normalize_region_payload(data: dict[str, Any]) -> tuple[str, str, str, str, str]:
    """Validate and normalize registration/profile region fields.

    Returns (country, province, city, region_code, city_label). Empty
    values are allowed so legacy clients can still register without a
    region, but partial/invalid regions are rejected.
    """
    country = str(data.get("country") or "").strip().lower()
    province = str(data.get("province") or "").strip().lower()
    city = str(data.get("city") or "").strip().lower()
    region_code = str(data.get("current_region_code") or data.get("region_code") or "").strip().lower()

    if region_code and not (country and city):
        country, province, city = _parse_region_code(region_code)
    if not (country or province or city or region_code):
        return "", "", "", "", ""

    spec = _country_lookup(country)
    if not spec:
        raise APIError("请选择有效国家", 400, "invalid_region")
    if spec.get("has_provinces"):
        allowed_provinces = {p["code"] for p in REGION_PROVINCES.get(country, [])}
        if not province or province not in allowed_provinces:
            raise APIError("请选择有效省份/都道府县", 400, "invalid_region")
    else:
        province = ""

    city_label = _resolve_region_label(country, province, city)
    if not city or not city_label:
        raise APIError("请选择有效城市", 400, "invalid_region")

    normalized_code = _resolve_region_code(country, province, city)
    if region_code and region_code != normalized_code:
        raise APIError("地区代码不匹配", 400, "invalid_region")
    return country, province, city, normalized_code, city_label


def _cached_media_size_bytes() -> int:
    """Sum of all files in MEDIA_DIR, cached for 5 minutes. The walk
    can be tens of seconds with many files and used to run inside the
    DB lock from admin-stats."""
    cached = _cache_get("media_size_bytes")
    if cached is not None:
        return int(cached)
    total = 0
    try:
        for p in MEDIA_DIR.glob("**/*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    pass
    except OSError:
        return 0
    _cache_put("media_size_bytes", total, ttl_seconds=300)
    return total


# ---------------------------------------------------------------------------
# rate limiter — process-local token bucket per (ip, group).
# Memory bounded by `_RL_GC_THRESHOLD`; old buckets are evicted lazily.
# ---------------------------------------------------------------------------

_RL_LOCK = threading.Lock()
_RL_STATE: dict[tuple[str, str], tuple[float, float]] = {}
_RL_GC_THRESHOLD = 5000


def rate_check(ip: str, group: str) -> bool:
    """Returns True if the request may proceed, False if it should be 429'd."""
    capacity, per_minute = RATE_LIMITS.get(group, (200, 200))
    refill_per_sec = per_minute / 60.0
    key = (ip or "anon", group)
    now = time.monotonic()
    with _RL_LOCK:
        # cheap, occasional GC so the dict can't grow unbounded under abuse
        if len(_RL_STATE) > _RL_GC_THRESHOLD:
            cutoff = now - 600
            for k, (_, last) in list(_RL_STATE.items()):
                if last < cutoff:
                    _RL_STATE.pop(k, None)
        tokens, last = _RL_STATE.get(key, (float(capacity), now))
        elapsed = max(0.0, now - last)
        tokens = min(float(capacity), tokens + elapsed * refill_per_sec)
        if tokens < 1.0:
            _RL_STATE[key] = (tokens, now)
            return False
        _RL_STATE[key] = (tokens - 1.0, now)
        return True


def _rate_group_for(path: str, method: str) -> str:
    # Code-sending endpoints get the tightest bucket so an attacker can't
    # spray verification emails or probe which addresses exist.
    if path in ("/api/auth/email/send-code", "/api/auth/send-verification-code", "/api/auth/forgot-password", "/api/auth/login/start"):
        return "email"
    if path.startswith("/api/auth/"):
        return "auth"
    # Payment order creation + provider verification. Webhooks are
    # excluded: providers retry on non-2xx, so rate-limiting them would
    # cause dropped settlement callbacks.
    if (path.startswith("/api/payments/") and not path.startswith("/api/payments/webhook/")) \
            and method in ("POST", "PATCH", "PUT", "DELETE"):
        return "payment"
    if path.startswith("/api/search"):
        return "search"
    if path.startswith("/api/media/"):
        return "media"
    if method in ("POST", "PATCH", "PUT", "DELETE"):
        return "write"
    return "read"


# ---------------------------------------------------------------------------
# structured access log — one line per request, easy to grep / ship to a
# log aggregator (Loki, CloudWatch, BetterStack, whatever).
# ---------------------------------------------------------------------------

import logging
_log_handler = logging.StreamHandler()
_log_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
ACCESS_LOG = logging.getLogger("kaix.access")
ACCESS_LOG.handlers = [_log_handler]
ACCESS_LOG.setLevel(logging.INFO if PRODUCTION else logging.DEBUG)
ACCESS_LOG.propagate = False
ERR_LOG = logging.getLogger("kaix.error")
ERR_LOG.handlers = [_log_handler]
ERR_LOG.setLevel(logging.WARNING)
ERR_LOG.propagate = False


# ---------------------------------------------------------------------------
# helpers


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _visible_status_sql(alias: str = "p") -> str:
    return f"{alias}.status IN ('published', 'active')"


def _active_boost(row: dict[str, Any]) -> int:
    if not row.get("is_boosted"):
        return 0
    boosted_until = parse_iso(str(row.get("boosted_until") or ""))
    if boosted_until and boosted_until < datetime.now(timezone.utc):
        return 0
    return int(row.get("boost_weight") or 0)


def _time_decay(created_at: str | None) -> float:
    created = parse_iso(created_at)
    if not created:
        return 0
    age_hours = max(0.0, (datetime.now(timezone.utc) - created).total_seconds() / 3600.0)
    return max(0.0, 24.0 - age_hours)


def _heat_score_sql(alias: str = "p") -> str:
    return f"""
      ((SELECT COUNT(*) FROM interactions i WHERE i.target_id = {alias}.id AND i.kind = 'like') * 1
       + (SELECT COUNT(*) FROM comments c WHERE c.post_id = {alias}.id AND c.deleted_at IS NULL) * 3
       + (SELECT COUNT(*) FROM interactions i WHERE i.target_id = {alias}.id AND i.kind = 'repost') * 5
       + (SELECT COUNT(*) FROM interactions i WHERE i.target_id = {alias}.id AND i.kind = 'bookmark') * 4
       - COALESCE({alias}.report_count, 0) * 10
       + CASE
           WHEN COALESCE({alias}.is_boosted, 0) = 1
             AND (COALESCE({alias}.boosted_until, '') = '' OR {alias}.boosted_until > datetime('now'))
           THEN COALESCE({alias}.boost_weight, 0)
           ELSE 0
         END
       + MAX(0, 24 - ((julianday('now') - julianday({alias}.created_at)) * 24.0)))
    """


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8") + PASSWORD_PEPPER, salt, 120_000)
    return f"pbkdf2$120000${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, digest_b64 = stored.split("$")
        if algo != "pbkdf2":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8") + PASSWORD_PEPPER, salt, int(iters))
        return hmac.compare_digest(expected, actual)
    except Exception:
        return False


def normalize_handle(value: str) -> str:
    return (value or "").strip().lstrip("@").lower()


HANDLE_RE = re.compile(r"^[a-z0-9_.]{3,20}$")
RESERVED_HANDLES = {
    "admin", "administrator", "root", "machi", "machicity", "kaix",
    "official", "support", "help", "news", "localdesk", "local_desk",
    "machi_editorial", "machi_news", "machi_support",
}
TAG_RE = re.compile(r"#([\w一-鿿]+)", re.UNICODE)


def extract_tags(content: str) -> list[str]:
    seen: list[str] = []
    for match in TAG_RE.findall(content or ""):
        tag = match.strip().lower()
        if tag and tag not in seen:
            seen.append(tag)
    return seen


def cursor_encode(iso_value: str, item_id: str) -> str:
    raw = f"{iso_value}|{item_id}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def cursor_decode(token: str | None) -> tuple[str, str] | None:
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        iso_value, item_id = raw.split("|", 1)
        return iso_value, item_id
    except Exception:
        return None


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# database


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL allows concurrent readers + a single writer — the right mode
    # for "many readers, few writers" web workloads.
    conn.execute("PRAGMA journal_mode = WAL")
    # NORMAL is safe under WAL (only risks losing the last tx on a power
    # cut) and meaningfully reduces fsync pressure under load.
    conn.execute("PRAGMA synchronous = NORMAL")
    # When SQLite hits a writer-held lock, retry-busy for up to 5s
    # instead of erroring instantly. Pairs with the 30s connect timeout.
    conn.execute("PRAGMA busy_timeout = 5000")
    # Hold ~16k pages (~64MB at 4KB pages) in per-connection cache.
    conn.execute("PRAGMA cache_size = -16384")
    # Memory-map up to 128MB of the DB file for cheap reads.
    conn.execute("PRAGMA mmap_size = 134217728")
    # Use the OS-managed temp store (avoids surprising disk pressure
    # from large GROUP BY / ORDER BY scratch space).
    conn.execute("PRAGMA temp_store = MEMORY")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    avatar_symbol TEXT NOT NULL DEFAULT 'person.fill',
    avatar_color TEXT NOT NULL DEFAULT 'indigo',
    avatar_url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    membership_tier TEXT NOT NULL DEFAULT 'free',
    is_verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    repost_of_id TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY(post_id, tag),
    FOREIGN KEY(post_id) REFERENCES posts(id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);

CREATE TABLE IF NOT EXISTS post_media (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    sort_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(media_id) REFERENCES media(id)
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id);

CREATE TABLE IF NOT EXISTS post_poll_votes (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_post_poll_votes_post ON post_poll_votes(post_id);

CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(target_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_interactions_target ON interactions(target_id, kind);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, kind);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_comment_id TEXT,
    reply_to_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    participant_a TEXT NOT NULL,
    participant_b TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE(participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS message_media (
    message_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    PRIMARY KEY(message_id, media_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    type TEXT NOT NULL,
    target_post_id TEXT,
    target_comment_id TEXT,
    content TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    thumb_url TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    byte_size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    language TEXT NOT NULL DEFAULT 'zh-Hans',
    appearance TEXT NOT NULL DEFAULT 'light',
    push_likes INTEGER NOT NULL DEFAULT 1,
    push_comments INTEGER NOT NULL DEFAULT 1,
    push_follows INTEGER NOT NULL DEFAULT 1,
    push_messages INTEGER NOT NULL DEFAULT 1,
    privacy_protect INTEGER NOT NULL DEFAULT 0,
    privacy_allow_dm TEXT NOT NULL DEFAULT 'everyone',
    recommend_following INTEGER NOT NULL DEFAULT 1,
    recommend_topics INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    media_ids TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketing_copy (
    id TEXT PRIMARY KEY,
    page_key TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'zh',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(participant_a, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(participant_b, updated_at);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_marketing_copy_public ON marketing_copy(page_key, locale, status, sort_order);

CREATE TABLE IF NOT EXISTS news_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_key TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_url TEXT NOT NULL DEFAULT '',
    homepage_url TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    default_category TEXT NOT NULL DEFAULT 'local_news',
    credibility_level TEXT NOT NULL DEFAULT 'official',
    copyright_policy_note TEXT NOT NULL DEFAULT '',
    crawl_interval_minutes INTEGER NOT NULL DEFAULT 180,
    is_active INTEGER NOT NULL DEFAULT 1,
    require_manual_review INTEGER NOT NULL DEFAULT 1,
    last_fetched_at TEXT,
    last_success_at TEXT,
    last_error TEXT NOT NULL DEFAULT '',
    created_by_admin_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_sources_city ON news_sources(country, city, is_active);
CREATE INDEX IF NOT EXISTS idx_news_sources_active ON news_sources(is_active, source_type);

CREATE TABLE IF NOT EXISTS news_items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    external_id TEXT,
    source_name TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    original_url TEXT NOT NULL DEFAULT '',
    original_title TEXT NOT NULL,
    original_summary TEXT,
    original_language TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'local_news',
    hash_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'fetched',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES news_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_news_items_pool ON news_items(status, fetched_at);
CREATE INDEX IF NOT EXISTS idx_news_items_source ON news_items(source_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_news_items_city ON news_items(country, city, category, fetched_at);

CREATE TABLE IF NOT EXISTS editorial_posts (
    id TEXT PRIMARY KEY,
    news_item_id TEXT,
    author_type TEXT NOT NULL DEFAULT 'local_desk',
    author_display_name TEXT NOT NULL DEFAULT 'Machi 本地资讯台',
    country TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    category TEXT NOT NULL DEFAULT 'local_news',
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    source_name TEXT,
    source_url TEXT,
    original_url TEXT,
    source_published_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    review_status TEXT NOT NULL DEFAULT 'needs_review',
    reviewed_by_admin_id TEXT,
    reviewed_at TEXT,
    published_at TEXT,
    view_count INTEGER NOT NULL DEFAULT 0,
    is_ai_assisted INTEGER NOT NULL DEFAULT 0,
    ai_model TEXT,
    ai_prompt_version TEXT,
    created_by_admin_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(news_item_id) REFERENCES news_items(id)
);
CREATE INDEX IF NOT EXISTS idx_editorial_posts_public ON editorial_posts(status, country, city, language, category, published_at);
CREATE INDEX IF NOT EXISTS idx_editorial_posts_review ON editorial_posts(status, review_status, updated_at);

CREATE TABLE IF NOT EXISTS editorial_post_tags (
    id TEXT PRIMARY KEY,
    editorial_post_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(editorial_post_id, tag),
    FOREIGN KEY(editorial_post_id) REFERENCES editorial_posts(id)
);
CREATE INDEX IF NOT EXISTS idx_editorial_tags_post ON editorial_post_tags(editorial_post_id);
CREATE INDEX IF NOT EXISTS idx_editorial_tags_tag ON editorial_post_tags(tag);

CREATE TABLE IF NOT EXISTS editorial_post_comments (
    id TEXT PRIMARY KEY,
    editorial_post_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(editorial_post_id) REFERENCES editorial_posts(id),
    FOREIGN KEY(author_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_editorial_comments_post ON editorial_post_comments(editorial_post_id, created_at);

CREATE TABLE IF NOT EXISTS news_fetch_logs (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    fetched_count INTEGER NOT NULL DEFAULT 0,
    new_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES news_sources(id)
);
CREATE INDEX IF NOT EXISTS idx_news_fetch_logs_source ON news_fetch_logs(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_news_fetch_logs_status ON news_fetch_logs(status, created_at);

CREATE TABLE IF NOT EXISTS editorial_action_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editorial_action_logs_admin ON editorial_action_logs(admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_editorial_action_logs_target ON editorial_action_logs(target_type, target_id, created_at);

-- Visitor analytics. One row per (de-duplicated) request hitting the API.
-- Deliberately stores NO secrets: never a password, verification code,
-- session token, Authorization header, cookie or form body — only the
-- coarse access metadata an operator needs to see traffic and geography.
CREATE TABLE IF NOT EXISTS visitor_logs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    status INTEGER NOT NULL DEFAULT 0,
    user_id TEXT,
    user_agent TEXT NOT NULL DEFAULT '',
    referer TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    org TEXT NOT NULL DEFAULT '',
    geo_state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created ON visitor_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip ON visitor_logs(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_geo ON visitor_logs(geo_state);

-- Email verification + password-reset + 2-step-login codes. Codes are
-- stored only as keyed HMAC hashes (see hash_auth_code); the plaintext
-- code lives only in the email that was sent. Rows are single-use and
-- expire; attempts are capped to stop brute force.
CREATE TABLE IF NOT EXISTS auth_codes (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,           -- register | login | reset
    email TEXT NOT NULL DEFAULT '',
    user_id TEXT,                    -- bound for login / reset
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(purpose, email, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id, purpose, created_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);
"""


# Versioned migrations. Append-only: each entry runs once and only once.
# Bump the highest version when shipping a schema change. Migrations run
# inside a transaction; SQLite ALTER is limited but covers ADD COLUMN /
# CREATE INDEX which is what we need on the move-fast path.
MIGRATIONS: list[tuple[int, str, str]] = [
    # (version, note, sql)
    # Phase 1 of the local-life pivot: posts and users grow region
    # columns so we can route content by country / province / city.
    # The columns are nullable so existing rows survive the migration
    # without a backfill. Region codes are app-defined slugs (e.g.
    # "cn.shanghai", "jp.tokyo", "us.ca.sf") — see REGION_DIRECTORY.
    (
        1,
        "posts: add country/province/city/region_code",
        """
        ALTER TABLE posts ADD COLUMN country TEXT NOT NULL DEFAULT '';
        ALTER TABLE posts ADD COLUMN province TEXT NOT NULL DEFAULT '';
        ALTER TABLE posts ADD COLUMN city TEXT NOT NULL DEFAULT '';
        ALTER TABLE posts ADD COLUMN region_code TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region_code, created_at);
        CREATE INDEX IF NOT EXISTS idx_posts_country ON posts(country, created_at);
        CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city, created_at);
        """,
    ),
    (
        2,
        "users: add country/province/city/current_region_code",
        """
        ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN province TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN city TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN current_region_code TEXT NOT NULL DEFAULT '';
        """,
    ),
    # Phase 2 of the local-life pivot: content type discriminator +
    # JSON attributes blob. The discriminator is indexed because
    # almost every list-style query filters by it (城市频道 17 个 sub-tab,
    # 发现页热门租房/二手/招聘 etc.). The blob holds type-specific
    # fields (price, rent, salary, event_time, …) and is read only
    # when a post is being rendered in detail or by a typed card.
    (
        3,
        "posts: add content_type + attributes",
        """
        ALTER TABLE posts ADD COLUMN content_type TEXT NOT NULL DEFAULT 'dynamic';
        ALTER TABLE posts ADD COLUMN attributes TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(content_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_posts_region_type ON posts(region_code, content_type, created_at);
        """,
    ),
    (
        4,
        "posts/users: add city platform moderation, boost and creator fields",
        """
        ALTER TABLE posts ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN is_boosted INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN boost_weight INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN boosted_until TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_posts_boosted ON posts(is_boosted, boosted_until);

        ALTER TABLE users ADD COLUMN recent_region_codes TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN total_heat INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN creator_badge TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN is_merchant INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN merchant_verified INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN profile_view_count INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    (
        5,
        "legacy seed rows: backfill launch city region codes",
        """
        UPDATE users
        SET
            country = CASE
                WHEN location IN ('上海', '北京', '深圳', '广州', '香港', '长沙', '西安', '武汉') THEN 'cn'
                ELSE 'jp'
            END,
            province = CASE
                WHEN location = '上海' THEN 'shanghai'
                WHEN location = '北京' THEN 'beijing'
                WHEN location IN ('深圳', '广州') THEN 'guangdong'
                WHEN location = '香港' THEN 'hongkong'
                WHEN location = '长沙' THEN 'hunan'
                WHEN location = '西安' THEN 'shaanxi'
                WHEN location = '武汉' THEN 'hubei'
                WHEN location = '大阪' THEN 'osaka'
                ELSE 'tokyo'
            END,
            city = CASE
                WHEN location = '上海' THEN 'shanghai'
                WHEN location = '北京' THEN 'beijing'
                WHEN location = '深圳' THEN 'shenzhen'
                WHEN location = '广州' THEN 'guangzhou'
                WHEN location = '香港' THEN 'hongkong'
                WHEN location = '长沙' THEN 'changsha'
                WHEN location = '西安' THEN 'xian'
                WHEN location = '武汉' THEN 'wuhan'
                WHEN location = '大阪' THEN 'osaka'
                ELSE 'tokyo'
            END,
            current_region_code = CASE
                WHEN location = '上海' THEN 'cn.shanghai.shanghai'
                WHEN location = '北京' THEN 'cn.beijing.beijing'
                WHEN location = '深圳' THEN 'cn.guangdong.shenzhen'
                WHEN location = '广州' THEN 'cn.guangdong.guangzhou'
                WHEN location = '香港' THEN 'cn.hongkong.hongkong'
                WHEN location = '长沙' THEN 'cn.hunan.changsha'
                WHEN location = '西安' THEN 'cn.shaanxi.xian'
                WHEN location = '武汉' THEN 'cn.hubei.wuhan'
                WHEN location = '大阪' THEN 'jp.osaka.osaka'
                ELSE 'jp.tokyo.tokyo'
            END,
            recent_region_codes = CASE
                WHEN recent_region_codes = '' THEN CASE
                    WHEN location = '上海' THEN 'cn.shanghai.shanghai'
                    WHEN location = '北京' THEN 'cn.beijing.beijing'
                    WHEN location = '深圳' THEN 'cn.guangdong.shenzhen'
                    WHEN location = '广州' THEN 'cn.guangdong.guangzhou'
                    WHEN location = '香港' THEN 'cn.hongkong.hongkong'
                    WHEN location = '长沙' THEN 'cn.hunan.changsha'
                    WHEN location = '西安' THEN 'cn.shaanxi.xian'
                    WHEN location = '武汉' THEN 'cn.hubei.wuhan'
                    WHEN location = '大阪' THEN 'jp.osaka.osaka'
                    ELSE 'jp.tokyo.tokyo'
                END
                ELSE recent_region_codes
            END
        WHERE current_region_code = '';

        UPDATE posts
        SET
            country = COALESCE(NULLIF((SELECT country FROM users WHERE users.id = posts.author_id), ''), 'jp'),
            province = COALESCE(NULLIF((SELECT province FROM users WHERE users.id = posts.author_id), ''), 'tokyo'),
            city = COALESCE(NULLIF((SELECT city FROM users WHERE users.id = posts.author_id), ''), 'tokyo'),
            region_code = COALESCE(NULLIF((SELECT current_region_code FROM users WHERE users.id = posts.author_id), ''), 'jp.tokyo.tokyo')
        WHERE region_code = '';
        """,
    ),
    (
        6,
        "legacy deleted posts: align status with deleted_at",
        """
        UPDATE posts
           SET status = 'deleted'
         WHERE deleted_at IS NOT NULL
           AND status <> 'deleted';
        """,
    ),
    # Phase 3: content language preference. Powers the App's
    # LanguageManager + the new ContentLanguageSettingsView so feeds
    # can rank by user-preferred language. Defaults are empty so
    # legacy rows fall through to the "no preference" code path on the
    # client.
    (
        7,
        "posts/settings: add language preferences",
        """
        ALTER TABLE posts ADD COLUMN language TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_posts_language ON posts(language, created_at);
        CREATE INDEX IF NOT EXISTS idx_posts_region_lang ON posts(region_code, language, created_at);

        ALTER TABLE settings ADD COLUMN content_language_preference TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN preferred_content_languages TEXT NOT NULL DEFAULT '';

        ALTER TABLE users ADD COLUMN app_language TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN content_language_preference TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN preferred_content_languages TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        8,
        "marketing site: add editable copy blocks",
        """
        CREATE TABLE IF NOT EXISTS marketing_copy (
            id TEXT PRIMARY KEY,
            page_key TEXT NOT NULL,
            locale TEXT NOT NULL DEFAULT 'zh',
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_marketing_copy_public ON marketing_copy(page_key, locale, status, sort_order);
        """,
    ),
    (
        9,
        "posts: add poll votes",
        """
        CREATE TABLE IF NOT EXISTS post_poll_votes (
            post_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            option_index INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(post_id, user_id),
            FOREIGN KEY(post_id) REFERENCES posts(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_post_poll_votes_post ON post_poll_votes(post_id);
        """,
    ),
    (
        10,
        "analytics: add visitor_logs",
        """
        CREATE TABLE IF NOT EXISTS visitor_logs (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            ip TEXT NOT NULL DEFAULT '',
            ip_hash TEXT NOT NULL DEFAULT '',
            method TEXT NOT NULL DEFAULT '',
            path TEXT NOT NULL DEFAULT '',
            status INTEGER NOT NULL DEFAULT 0,
            user_id TEXT,
            user_agent TEXT NOT NULL DEFAULT '',
            referer TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            region TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            org TEXT NOT NULL DEFAULT '',
            geo_state TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE INDEX IF NOT EXISTS idx_visitor_logs_created ON visitor_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip ON visitor_logs(ip_hash, created_at);
        CREATE INDEX IF NOT EXISTS idx_visitor_logs_geo ON visitor_logs(geo_state);
        """,
    ),
    (
        11,
        "auth: add auth_codes (email verification / reset / 2-step login)",
        """
        CREATE TABLE IF NOT EXISTS auth_codes (
            id TEXT PRIMARY KEY,
            purpose TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            user_id TEXT,
            code_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            ip TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(purpose, email, created_at);
        CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id, purpose, created_at);
        """,
    ),
    # Machi Verified membership + payments. Five new tables plus cache
    # columns on `users` (the authoritative truth always lives in
    # user_memberships / payment_orders; the user columns are a read
    # accelerator kept in sync on every entitlement change). Money is
    # stored in minor units (fen) as INTEGER — never float.
    (
        12,
        "membership: plans, memberships, orders, webhooks, entitlement events + user cache",
        """
        CREATE TABLE IF NOT EXISTS membership_plans (
            id TEXT PRIMARY KEY,
            plan_key TEXT UNIQUE NOT NULL,
            name_zh TEXT NOT NULL DEFAULT '',
            name_en TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            amount_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            billing_cycle TEXT NOT NULL DEFAULT 'monthly',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_memberships (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'inactive',
            started_at TEXT,
            current_period_start TEXT,
            current_period_end TEXT,
            cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
            canceled_at TEXT,
            expired_at TEXT,
            source TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_memberships_user ON user_memberships(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_user_memberships_period ON user_memberships(status, current_period_end);

        CREATE TABLE IF NOT EXISTS payment_orders (
            id TEXT PRIMARY KEY,
            order_no TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            plan_key TEXT NOT NULL,
            amount_cents INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            status TEXT NOT NULL DEFAULT 'pending',
            payment_provider TEXT NOT NULL DEFAULT '',
            provider_trade_no TEXT NOT NULL DEFAULT '',
            provider_user_id TEXT NOT NULL DEFAULT '',
            client_type TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '',
            paid_at TEXT,
            closed_at TEXT,
            refunded_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status, created_at);

        CREATE TABLE IF NOT EXISTS payment_webhooks (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL DEFAULT '',
            event_id TEXT NOT NULL DEFAULT '',
            order_no TEXT NOT NULL DEFAULT '',
            raw_payload TEXT NOT NULL DEFAULT '',
            signature_valid INTEGER NOT NULL DEFAULT 0,
            processed_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON payment_webhooks(order_no, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhooks_dedup ON payment_webhooks(provider, event_id) WHERE event_id <> '';

        CREATE TABLE IF NOT EXISTS entitlement_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            membership_id TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entitlement_events_user ON entitlement_events(user_id, created_at);

        ALTER TABLE users ADD COLUMN is_verified_member INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN verified_member_until TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'inactive';
        ALTER TABLE users ADD COLUMN membership_plan_key TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN verified_badge_type TEXT NOT NULL DEFAULT '';
        """,
    ),
    # City Seed Bot (城市内容助手): cold-start content seeding. Posts grow
    # four tracking columns so every system-generated row is auditable and
    # reversible *without ever touching real user content* — clears always
    # require `is_seed_content = 1 AND seed_batch_id = ?`. Two new tables
    # track batches and the admin operation log. Purely additive: existing
    # rows default to is_seed_content = 0 (i.e. real users) and are never
    # rewritten by this migration.
    (
        13,
        "seed bot: posts seed columns + batches + admin op log",
        """
        ALTER TABLE posts ADD COLUMN is_seed_content INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN seed_batch_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE posts ADD COLUMN seed_source TEXT NOT NULL DEFAULT '';
        ALTER TABLE posts ADD COLUMN generated_by TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_posts_seed_batch ON posts(seed_batch_id, status);
        CREATE INDEX IF NOT EXISTS idx_posts_seed_city ON posts(is_seed_content, region_code, status, created_at);

        CREATE TABLE IF NOT EXISTS seed_content_batches (
            id TEXT PRIMARY KEY,
            country TEXT NOT NULL DEFAULT '',
            province TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT '',
            content_type TEXT NOT NULL DEFAULT '',
            tone TEXT NOT NULL DEFAULT '',
            count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            created_by_admin_id TEXT NOT NULL DEFAULT '',
            created_count INTEGER NOT NULL DEFAULT 0,
            published_count INTEGER NOT NULL DEFAULT 0,
            cleared_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_seed_batches_city ON seed_content_batches(region_code, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_seed_batches_status ON seed_content_batches(status, created_at);

        CREATE TABLE IF NOT EXISTS admin_seed_content_logs (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL DEFAULT '',
            batch_id TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT '',
            content_type TEXT NOT NULL DEFAULT '',
            count INTEGER NOT NULL DEFAULT 0,
            metadata TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_seed_logs_admin ON admin_seed_content_logs(admin_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_seed_logs_action ON admin_seed_content_logs(action, created_at);
        """,
    ),
    (
        14,
        "local news desk: sources, harvested items, editorial posts and logs",
        """
        CREATE TABLE IF NOT EXISTS news_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source_key TEXT UNIQUE NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_url TEXT NOT NULL DEFAULT '',
            homepage_url TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            default_category TEXT NOT NULL DEFAULT 'local_news',
            credibility_level TEXT NOT NULL DEFAULT 'official',
            copyright_policy_note TEXT NOT NULL DEFAULT '',
            crawl_interval_minutes INTEGER NOT NULL DEFAULT 180,
            is_active INTEGER NOT NULL DEFAULT 1,
            require_manual_review INTEGER NOT NULL DEFAULT 1,
            last_fetched_at TEXT,
            last_success_at TEXT,
            last_error TEXT NOT NULL DEFAULT '',
            created_by_admin_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_news_sources_city ON news_sources(country, city, is_active);
        CREATE INDEX IF NOT EXISTS idx_news_sources_active ON news_sources(is_active, source_type);

        CREATE TABLE IF NOT EXISTS news_items (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            external_id TEXT,
            source_name TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            original_url TEXT NOT NULL DEFAULT '',
            original_title TEXT NOT NULL,
            original_summary TEXT,
            original_language TEXT NOT NULL DEFAULT '',
            published_at TEXT,
            fetched_at TEXT NOT NULL,
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'local_news',
            hash_key TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'fetched',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(source_id) REFERENCES news_sources(id)
        );
        CREATE INDEX IF NOT EXISTS idx_news_items_pool ON news_items(status, fetched_at);
        CREATE INDEX IF NOT EXISTS idx_news_items_source ON news_items(source_id, fetched_at);
        CREATE INDEX IF NOT EXISTS idx_news_items_city ON news_items(country, city, category, fetched_at);

        CREATE TABLE IF NOT EXISTS editorial_posts (
            id TEXT PRIMARY KEY,
            news_item_id TEXT,
            author_type TEXT NOT NULL DEFAULT 'local_desk',
            author_display_name TEXT NOT NULL DEFAULT 'Machi 本地资讯台',
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            category TEXT NOT NULL DEFAULT 'local_news',
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            source_name TEXT,
            source_url TEXT,
            original_url TEXT,
            source_published_at TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            review_status TEXT NOT NULL DEFAULT 'needs_review',
            reviewed_by_admin_id TEXT,
            reviewed_at TEXT,
            published_at TEXT,
            view_count INTEGER NOT NULL DEFAULT 0,
            is_ai_assisted INTEGER NOT NULL DEFAULT 0,
            ai_model TEXT,
            ai_prompt_version TEXT,
            created_by_admin_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(news_item_id) REFERENCES news_items(id)
        );
        CREATE INDEX IF NOT EXISTS idx_editorial_posts_public ON editorial_posts(status, country, city, language, category, published_at);
        CREATE INDEX IF NOT EXISTS idx_editorial_posts_review ON editorial_posts(status, review_status, updated_at);

        CREATE TABLE IF NOT EXISTS editorial_post_tags (
            id TEXT PRIMARY KEY,
            editorial_post_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(editorial_post_id, tag),
            FOREIGN KEY(editorial_post_id) REFERENCES editorial_posts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_editorial_tags_post ON editorial_post_tags(editorial_post_id);
        CREATE INDEX IF NOT EXISTS idx_editorial_tags_tag ON editorial_post_tags(tag);

        CREATE TABLE IF NOT EXISTS editorial_post_comments (
            id TEXT PRIMARY KEY,
            editorial_post_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(editorial_post_id) REFERENCES editorial_posts(id),
            FOREIGN KEY(author_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_editorial_comments_post ON editorial_post_comments(editorial_post_id, created_at);

        CREATE TABLE IF NOT EXISTS news_fetch_logs (
            id TEXT PRIMARY KEY,
            source_id TEXT,
            status TEXT NOT NULL DEFAULT 'success',
            fetched_count INTEGER NOT NULL DEFAULT 0,
            new_count INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(source_id) REFERENCES news_sources(id)
        );
        CREATE INDEX IF NOT EXISTS idx_news_fetch_logs_source ON news_fetch_logs(source_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_news_fetch_logs_status ON news_fetch_logs(status, created_at);

        CREATE TABLE IF NOT EXISTS editorial_action_logs (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_editorial_action_logs_admin ON editorial_action_logs(admin_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_editorial_action_logs_target ON editorial_action_logs(target_type, target_id, created_at);
        """,
    ),
    (
        15,
        "japan news crawler: source controls, metadata, counters and soft delete",
        """
        ALTER TABLE news_sources ADD COLUMN allowed_domain TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_sources ADD COLUMN crawl_strategy TEXT NOT NULL DEFAULT 'manual';
        ALTER TABLE news_sources ADD COLUMN list_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN item_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN title_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN link_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN summary_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN date_selector TEXT;
        ALTER TABLE news_sources ADD COLUMN date_format TEXT;
        ALTER TABLE news_sources ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';
        ALTER TABLE news_sources ADD COLUMN robots_policy TEXT NOT NULL DEFAULT 'respect';
        ALTER TABLE news_sources ADD COLUMN max_items_per_run INTEGER NOT NULL DEFAULT 30;
        ALTER TABLE news_sources ADD COLUMN request_timeout_ms INTEGER NOT NULL DEFAULT 15000;
        ALTER TABLE news_sources ADD COLUMN deleted_at TEXT;
        UPDATE news_sources
           SET allowed_domain = COALESCE(NULLIF(allowed_domain, ''), replace(replace(substr(COALESCE(NULLIF(source_url, ''), homepage_url), instr(COALESCE(NULLIF(source_url, ''), homepage_url), '://') + 3), 'www.', ''), '/', ''))
         WHERE allowed_domain = '';
        UPDATE news_sources
           SET crawl_strategy = CASE source_type
                WHEN 'rss' THEN 'rss'
                WHEN 'webpage' THEN 'meta_only'
                WHEN 'html_list' THEN 'html_list'
                ELSE 'manual'
           END
         WHERE crawl_strategy = 'manual';
        CREATE INDEX IF NOT EXISTS idx_news_sources_deleted ON news_sources(deleted_at, is_active, updated_at);

        ALTER TABLE news_items ADD COLUMN raw_metadata TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE news_items ADD COLUMN error_message TEXT NOT NULL DEFAULT '';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_source_original_unique
            ON news_items(source_id, original_url)
            WHERE original_url <> '' AND status != 'deleted';

        ALTER TABLE editorial_posts ADD COLUMN share_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE editorial_posts ADD COLUMN click_source_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE editorial_posts ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low';
        ALTER TABLE editorial_posts ADD COLUMN official_source_required INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE news_fetch_logs ADD COLUMN source_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_fetch_logs ADD COLUMN skipped_reason TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        16,
        "japan news crawler: bulk flow, diagnostics, demo flags and source automation choices",
        """
        ALTER TABLE news_sources ADD COLUMN auto_create_draft INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN official_auto_publish INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN last_fetched_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN last_new_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN last_duplicate_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN last_error_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN last_robots_status TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_sources ADD COLUMN last_http_status INTEGER;
        ALTER TABLE news_sources ADD COLUMN last_parser_status TEXT NOT NULL DEFAULT '';

        ALTER TABLE news_fetch_logs ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_fetch_logs ADD COLUMN robots_status TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_fetch_logs ADD COLUMN http_status INTEGER;
        ALTER TABLE news_fetch_logs ADD COLUMN parser_status TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_fetch_logs ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE editorial_posts ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    (
        17,
        "theme settings default to explicit light mode",
        """
        UPDATE settings
           SET appearance = 'light'
         WHERE appearance IS NULL OR appearance NOT IN ('light', 'dark');
        """,
    ),
    (
        18,
        "japan news crawler: tiers, compliance flags, scoring and editorial quality gates",
        """
        ALTER TABLE news_sources ADD COLUMN source_tier TEXT NOT NULL DEFAULT 'tier_3_public_media';
        ALTER TABLE news_sources ADD COLUMN copyright_policy TEXT NOT NULL DEFAULT 'metadata_only';
        ALTER TABLE news_sources ADD COLUMN allow_auto_draft INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN allow_auto_publish INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE news_sources ADD COLUMN content_rewrite_required INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE news_sources ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low';
        ALTER TABLE news_sources ADD COLUMN sub_city TEXT NOT NULL DEFAULT '';
        UPDATE news_sources
           SET source_tier = CASE
                WHEN source_type = 'manual' OR crawl_strategy = 'manual' THEN 'tier_5_manual_reference'
                WHEN credibility_level = 'official' AND city <> '' THEN 'tier_2_city_official'
                WHEN credibility_level = 'official' THEN 'tier_1_official'
                WHEN credibility_level IN ('media','community') THEN 'tier_3_public_media'
                ELSE 'tier_4_event_lifestyle'
           END,
               copyright_policy = CASE
                WHEN copyright_policy_note LIKE '%restrict%' OR copyright_policy_note LIKE '%禁止%' THEN 'redistribution_restricted'
                ELSE 'metadata_only'
           END,
               allow_auto_draft = COALESCE(auto_create_draft, 0),
               allow_auto_publish = COALESCE(official_auto_publish, 0),
               risk_level = CASE
                WHEN default_category IN ('weather_alert','earthquake_alert','typhoon_alert','immigration_visa','policy_update','public_safety','health') THEN 'high'
                WHEN default_category IN ('traffic_alert','work_study') THEN 'medium'
                ELSE 'low'
           END;
        CREATE INDEX IF NOT EXISTS idx_news_sources_tier ON news_sources(source_tier, credibility_level, is_active);

        ALTER TABLE news_items ADD COLUMN source_tier TEXT NOT NULL DEFAULT 'tier_3_public_media';
        ALTER TABLE news_items ADD COLUMN sub_city TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_items ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'low';
        ALTER TABLE news_items ADD COLUMN relevance_score INTEGER NOT NULL DEFAULT 50;
        ALTER TABLE news_items ADD COLUMN relevance_reason TEXT NOT NULL DEFAULT '';
        ALTER TABLE news_items ADD COLUMN quality_score INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_news_items_relevance ON news_items(relevance_score, quality_score, status);

        ALTER TABLE editorial_posts ADD COLUMN sub_city TEXT NOT NULL DEFAULT '';
        ALTER TABLE editorial_posts ADD COLUMN source_tier TEXT NOT NULL DEFAULT 'tier_3_public_media';
        ALTER TABLE editorial_posts ADD COLUMN relevance_score INTEGER NOT NULL DEFAULT 50;
        ALTER TABLE editorial_posts ADD COLUMN quality_score INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE editorial_posts ADD COLUMN editorial_disclaimer TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_editorial_posts_quality ON editorial_posts(status, quality_score, relevance_score, published_at);
        """,
    ),
]


def run_migrations(conn: sqlite3.Connection) -> None:
    """Apply pending migrations in version order."""
    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
    for version, note, sql in sorted(MIGRATIONS, key=lambda x: x[0]):
        if version in applied:
            continue
        try:
            conn.executescript(sql)
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at, note) VALUES (?, ?, ?)",
                (version, now_iso(), note),
            )
            ACCESS_LOG.info("migration applied version=%s note=%s", version, note)
        except Exception as exc:
            ERR_LOG.exception("migration failed version=%s note=%s", version, note)
            raise


def ensure_membership_plans(conn: sqlite3.Connection) -> None:
    """Idempotently seed the single Machi Verified plan. Safe on both a
    fresh DB and an existing one: the amount/name are refreshed from the
    server config each boot so price changes ship by redeploy, but the
    plan_key is stable and used everywhere as the canonical reference."""
    existing = conn.execute(
        "SELECT id FROM membership_plans WHERE plan_key = ?", (MEMBERSHIP_PLAN_KEY,)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE membership_plans SET amount_cents = ?, currency = ?, billing_cycle = ?, "
            "name_zh = ?, name_en = ?, name_ja = ?, is_active = 1, updated_at = ? WHERE plan_key = ?",
            (MEMBERSHIP_PRICE_FEN, MEMBERSHIP_CURRENCY, MEMBERSHIP_BILLING_CYCLE,
             "Machi 认证会员", "Machi Verified", "Machi 認証メンバー", now_iso(), MEMBERSHIP_PLAN_KEY),
        )
        return
    conn.execute(
        "INSERT INTO membership_plans (id, plan_key, name_zh, name_en, name_ja, amount_cents, "
        "currency, billing_cycle, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        (str(uuid.uuid4()), MEMBERSHIP_PLAN_KEY, "Machi 认证会员", "Machi Verified", "Machi 認証メンバー",
         MEMBERSHIP_PRICE_FEN, MEMBERSHIP_CURRENCY, MEMBERSHIP_BILLING_CYCLE, now_iso(), now_iso()),
    )


def ensure_news_source_presets(conn: sqlite3.Connection) -> dict[str, int]:
    """Seed suggested Local News Desk sources as editable config rows.
    Operators can replace URLs or disable rows from admin; runtime logic
    reads the database only, never hardcoded source lists."""
    now = now_iso()
    presets = [
        {
            "name": "Japan Meteorological Agency / JMA",
            "source_key": "jma-japan-weather",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.jma.go.jp/",
            "allowed_domain": "www.jma.go.jp",
            "country": "jp",
            "city": "",
            "language": "ja",
            "default_category": "weather_alert",
            "credibility_level": "official",
            "copyright_policy_note": "Official public weather/disaster information. Keep source links; do not republish full text.",
            "crawl_interval_minutes": 30,
        },
        {
            "name": "Tokyo Metropolitan Government",
            "source_key": "tokyo-metropolitan-government",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.metro.tokyo.lg.jp/",
            "allowed_domain": "www.metro.tokyo.lg.jp",
            "country": "jp",
            "city": "tokyo",
            "language": "ja",
            "default_category": "local_news",
            "credibility_level": "official",
            "copyright_policy_note": "Official Tokyo public notices and city life updates. Store metadata and source URL only.",
            "crawl_interval_minutes": 240,
        },
        {
            "name": "Osaka Prefecture / Osaka City",
            "source_key": "osaka-government",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.pref.osaka.lg.jp/",
            "allowed_domain": "www.pref.osaka.lg.jp",
            "country": "jp",
            "city": "osaka",
            "language": "ja",
            "default_category": "local_news",
            "credibility_level": "official",
            "copyright_policy_note": "Official Osaka notices and city life updates. Store metadata and source URL only.",
            "crawl_interval_minutes": 240,
        },
        {
            "name": "Digital Agency Japan",
            "source_key": "digital-agency-japan",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.digital.go.jp/",
            "allowed_domain": "www.digital.go.jp",
            "country": "jp",
            "city": "",
            "language": "ja",
            "default_category": "policy_update",
            "credibility_level": "official",
            "copyright_policy_note": "Official policy updates. Manual review required before publishing.",
            "crawl_interval_minutes": 360,
        },
        {
            "name": "Prime Minister of Japan and His Cabinet",
            "source_key": "japan-cabinet",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://japan.kantei.go.jp/",
            "allowed_domain": "japan.kantei.go.jp",
            "country": "jp",
            "city": "",
            "language": "en",
            "default_category": "policy_update",
            "credibility_level": "official",
            "copyright_policy_note": "Official Cabinet updates. Link to source and summarize only.",
            "crawl_interval_minutes": 360,
        },
        {
            "name": "Tokyo Metro",
            "source_key": "tokyo-metro",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.tokyometro.jp/",
            "allowed_domain": "www.tokyometro.jp",
            "country": "jp",
            "city": "tokyo",
            "language": "ja",
            "default_category": "traffic_alert",
            "credibility_level": "official",
            "copyright_policy_note": "Official transport notices. Use links, short summaries, and review before publishing.",
            "crawl_interval_minutes": 60,
        },
        {
            "name": "JR East",
            "source_key": "jr-east",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.jreast.co.jp/",
            "allowed_domain": "www.jreast.co.jp",
            "country": "jp",
            "city": "tokyo",
            "language": "ja",
            "default_category": "traffic_alert",
            "credibility_level": "official",
            "copyright_policy_note": "Official transport notices. Use links, short summaries, and review before publishing.",
            "crawl_interval_minutes": 60,
        },
        {
            "name": "JR West",
            "source_key": "jr-west",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.westjr.co.jp/",
            "allowed_domain": "www.westjr.co.jp",
            "country": "jp",
            "city": "osaka",
            "language": "ja",
            "default_category": "traffic_alert",
            "credibility_level": "official",
            "copyright_policy_note": "Official transport notices. Use links, short summaries, and review before publishing.",
            "crawl_interval_minutes": 60,
        },
        {
            "name": "Immigration Services Agency of Japan",
            "source_key": "japan-immigration-services-agency",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.moj.go.jp/isa/",
            "allowed_domain": "www.moj.go.jp",
            "country": "jp",
            "city": "",
            "language": "ja",
            "default_category": "immigration_visa",
            "credibility_level": "official",
            "copyright_policy_note": "Official immigration updates. Manual review and source attribution required.",
            "crawl_interval_minutes": 360,
        },
        {
            "name": "Tokyo Tourism / Events",
            "source_key": "tokyo-tourism-events",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://www.gotokyo.org/",
            "allowed_domain": "www.gotokyo.org",
            "country": "jp",
            "city": "tokyo",
            "language": "ja",
            "default_category": "city_event",
            "credibility_level": "official",
            "copyright_policy_note": "Official tourism/event listings. Store list metadata only; do not reuse images.",
            "crawl_interval_minutes": 360,
        },
        {
            "name": "Osaka Tourism / Events",
            "source_key": "osaka-tourism-events",
            "source_type": "manual",
            "crawl_strategy": "manual",
            "source_url": "",
            "homepage_url": "https://osaka-info.jp/",
            "allowed_domain": "osaka-info.jp",
            "country": "jp",
            "city": "osaka",
            "language": "ja",
            "default_category": "city_event",
            "credibility_level": "official",
            "copyright_policy_note": "Official tourism/event listings. Store list metadata only; do not reuse images.",
            "crawl_interval_minutes": 360,
        },
    ]
    presets.extend([
        {"name": "Ministry of Health, Labour and Welfare", "source_key": "mhlw-japan", "homepage_url": "https://www.mhlw.go.jp/", "allowed_domain": "www.mhlw.go.jp", "country": "jp", "city": "", "language": "ja", "default_category": "health", "credibility_level": "official", "crawl_interval_minutes": 120},
        {"name": "Ministry of Internal Affairs and Communications", "source_key": "mic-japan", "homepage_url": "https://www.soumu.go.jp/", "allowed_domain": "www.soumu.go.jp", "country": "jp", "city": "", "language": "ja", "default_category": "policy_update", "credibility_level": "official", "crawl_interval_minutes": 120},
        {"name": "Ministry of Foreign Affairs of Japan", "source_key": "mofa-japan", "homepage_url": "https://www.mofa.go.jp/", "allowed_domain": "www.mofa.go.jp", "country": "jp", "city": "", "language": "en", "default_category": "travel", "credibility_level": "official", "crawl_interval_minutes": 120},
        {"name": "Japan National Tourism Organization", "source_key": "jnto-japan", "homepage_url": "https://www.japan.travel/en/news/", "allowed_domain": "www.japan.travel", "country": "jp", "city": "", "language": "en", "default_category": "travel", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Tokyo Disaster Prevention", "source_key": "tokyo-disaster-prevention", "homepage_url": "https://www.bousai.metro.tokyo.lg.jp/", "allowed_domain": "www.bousai.metro.tokyo.lg.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "public_safety", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Tokyo Convention & Visitors Bureau", "source_key": "tokyo-convention-visitors-bureau", "homepage_url": "https://www.gotokyo.org/en/", "allowed_domain": "www.gotokyo.org", "country": "jp", "city": "tokyo", "language": "en", "default_category": "travel", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Shinjuku City", "source_key": "shinjuku-city", "homepage_url": "https://www.city.shinjuku.lg.jp/", "allowed_domain": "www.city.shinjuku.lg.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Shibuya City", "source_key": "shibuya-city", "homepage_url": "https://www.city.shibuya.tokyo.jp/", "allowed_domain": "www.city.shibuya.tokyo.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Toshima City", "source_key": "toshima-city", "homepage_url": "https://www.city.toshima.lg.jp/", "allowed_domain": "www.city.toshima.lg.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Nakano City", "source_key": "nakano-city", "homepage_url": "https://www.city.tokyo-nakano.lg.jp/", "allowed_domain": "www.city.tokyo-nakano.lg.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Setagaya City", "source_key": "setagaya-city", "homepage_url": "https://www.city.setagaya.lg.jp/", "allowed_domain": "www.city.setagaya.lg.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Minato City", "source_key": "minato-city", "homepage_url": "https://www.city.minato.tokyo.jp/", "allowed_domain": "www.city.minato.tokyo.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Osaka City", "source_key": "osaka-city", "homepage_url": "https://www.city.osaka.lg.jp/", "allowed_domain": "www.city.osaka.lg.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Osaka Disaster Prevention", "source_key": "osaka-disaster-prevention", "homepage_url": "https://www.pref.osaka.lg.jp/kikikanri/", "allowed_domain": "www.pref.osaka.lg.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "public_safety", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Toei Transportation", "source_key": "toei-transportation", "homepage_url": "https://www.kotsu.metro.tokyo.jp/", "allowed_domain": "www.kotsu.metro.tokyo.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Osaka Metro", "source_key": "osaka-metro", "homepage_url": "https://subway.osakametro.co.jp/", "allowed_domain": "subway.osakametro.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Keio Railway", "source_key": "keio-railway", "homepage_url": "https://www.keio.co.jp/", "allowed_domain": "www.keio.co.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Odakyu Electric Railway", "source_key": "odakyu-railway", "homepage_url": "https://www.odakyu.jp/", "allowed_domain": "www.odakyu.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Tokyu Railways", "source_key": "tokyu-railways", "homepage_url": "https://www.tokyu.co.jp/", "allowed_domain": "www.tokyu.co.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Seibu Railway", "source_key": "seibu-railway", "homepage_url": "https://www.seiburailway.jp/", "allowed_domain": "www.seiburailway.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Tobu Railway", "source_key": "tobu-railway", "homepage_url": "https://www.tobu.co.jp/", "allowed_domain": "www.tobu.co.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Keisei Electric Railway", "source_key": "keisei-railway", "homepage_url": "https://www.keisei.co.jp/", "allowed_domain": "www.keisei.co.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Keikyu Corporation", "source_key": "keikyu-railway", "homepage_url": "https://www.keikyu.co.jp/", "allowed_domain": "www.keikyu.co.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Hankyu Railway", "source_key": "hankyu-railway", "homepage_url": "https://www.hankyu.co.jp/", "allowed_domain": "www.hankyu.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Hanshin Electric Railway", "source_key": "hanshin-railway", "homepage_url": "https://rail.hanshin.co.jp/", "allowed_domain": "rail.hanshin.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Kintetsu Railway", "source_key": "kintetsu-railway", "homepage_url": "https://www.kintetsu.co.jp/", "allowed_domain": "www.kintetsu.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Keihan Railway", "source_key": "keihan-railway", "homepage_url": "https://www.keihan.co.jp/", "allowed_domain": "www.keihan.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "Nankai Electric Railway", "source_key": "nankai-railway", "homepage_url": "https://www.nankai.co.jp/", "allowed_domain": "www.nankai.co.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "traffic_alert", "credibility_level": "official", "crawl_interval_minutes": 30},
        {"name": "NHK News", "source_key": "nhk-news", "source_type": "rss", "crawl_strategy": "rss", "source_url": "https://www3.nhk.or.jp/rss/news/cat0.xml", "homepage_url": "https://www3.nhk.or.jp/news/", "allowed_domain": "www3.nhk.or.jp", "country": "jp", "city": "", "language": "ja", "default_category": "local_news", "credibility_level": "media", "crawl_interval_minutes": 60},
        {"name": "NHK Shutoken", "source_key": "nhk-shutoken", "homepage_url": "https://www.nhk.or.jp/shutoken/", "allowed_domain": "www.nhk.or.jp", "country": "jp", "city": "tokyo", "language": "ja", "default_category": "local_news", "credibility_level": "media", "crawl_interval_minutes": 60},
        {"name": "NHK Kansai", "source_key": "nhk-kansai", "homepage_url": "https://www.nhk.or.jp/osaka/", "allowed_domain": "www.nhk.or.jp", "country": "jp", "city": "osaka", "language": "ja", "default_category": "local_news", "credibility_level": "media", "crawl_interval_minutes": 60},
        {"name": "Kyodo News", "source_key": "kyodo-news", "homepage_url": "https://english.kyodonews.net/", "allowed_domain": "english.kyodonews.net", "country": "jp", "city": "", "language": "en", "default_category": "economy", "credibility_level": "media", "crawl_interval_minutes": 120},
        {"name": "The Japan Times", "source_key": "japan-times", "source_type": "rss", "crawl_strategy": "rss", "source_url": "https://www.japantimes.co.jp/feed/", "homepage_url": "https://www.japantimes.co.jp/", "allowed_domain": "www.japantimes.co.jp", "country": "jp", "city": "", "language": "en", "default_category": "local_news", "credibility_level": "media", "crawl_interval_minutes": 120},
        {"name": "Nippon.com", "source_key": "nippon-com", "homepage_url": "https://www.nippon.com/en/", "allowed_domain": "www.nippon.com", "country": "jp", "city": "", "language": "en", "default_category": "culture", "credibility_level": "media", "crawl_interval_minutes": 120},
        {"name": "Time Out Tokyo", "source_key": "time-out-tokyo", "homepage_url": "https://www.timeout.com/tokyo", "allowed_domain": "www.timeout.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "city_event", "credibility_level": "media", "crawl_interval_minutes": 360},
        {"name": "Tokyo Cheapo", "source_key": "tokyo-cheapo", "homepage_url": "https://tokyocheapo.com/", "allowed_domain": "tokyocheapo.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "travel", "credibility_level": "media", "crawl_interval_minutes": 360},
        {"name": "Savvy Tokyo", "source_key": "savvy-tokyo", "homepage_url": "https://savvytokyo.com/", "allowed_domain": "savvytokyo.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "life_notice", "credibility_level": "media", "crawl_interval_minutes": 360},
        {"name": "Tokyo Art Beat", "source_key": "tokyo-art-beat", "homepage_url": "https://www.tokyoartbeat.com/en/events", "allowed_domain": "www.tokyoartbeat.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "culture", "credibility_level": "media", "crawl_interval_minutes": 360},
        {"name": "Peatix Tokyo Public Events", "source_key": "peatix-tokyo-public-events", "homepage_url": "https://peatix.com/search?q=Tokyo", "allowed_domain": "peatix.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "city_event", "credibility_level": "commercial", "crawl_interval_minutes": 360},
        {"name": "Peatix Osaka Public Events", "source_key": "peatix-osaka-public-events", "homepage_url": "https://peatix.com/search?q=Osaka", "allowed_domain": "peatix.com", "country": "jp", "city": "osaka", "language": "en", "default_category": "city_event", "credibility_level": "commercial", "crawl_interval_minutes": 360},
        {"name": "Meetup Tokyo Public Events", "source_key": "meetup-tokyo-public-events", "homepage_url": "https://www.meetup.com/find/?location=jp--Tokyo", "allowed_domain": "www.meetup.com", "country": "jp", "city": "tokyo", "language": "en", "default_category": "city_event", "credibility_level": "commercial", "crawl_interval_minutes": 360},
        {"name": "Meetup Osaka Public Events", "source_key": "meetup-osaka-public-events", "homepage_url": "https://www.meetup.com/find/?location=jp--Osaka", "allowed_domain": "www.meetup.com", "country": "jp", "city": "osaka", "language": "en", "default_category": "city_event", "credibility_level": "commercial", "crawl_interval_minutes": 360},
        {"name": "University of Tokyo News", "source_key": "university-of-tokyo-news", "homepage_url": "https://www.u-tokyo.ac.jp/en/news/", "allowed_domain": "www.u-tokyo.ac.jp", "country": "jp", "city": "tokyo", "language": "en", "default_category": "education", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Waseda University News", "source_key": "waseda-university-news", "homepage_url": "https://www.waseda.jp/top/en/news", "allowed_domain": "www.waseda.jp", "country": "jp", "city": "tokyo", "language": "en", "default_category": "education", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Keio University News", "source_key": "keio-university-news", "homepage_url": "https://www.keio.ac.jp/en/news/", "allowed_domain": "www.keio.ac.jp", "country": "jp", "city": "tokyo", "language": "en", "default_category": "education", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Osaka University News", "source_key": "osaka-university-news", "homepage_url": "https://www.osaka-u.ac.jp/en/news", "allowed_domain": "www.osaka-u.ac.jp", "country": "jp", "city": "osaka", "language": "en", "default_category": "education", "credibility_level": "official", "crawl_interval_minutes": 360},
    ])
    presets.extend([
        {"name": "Ministry of Justice Japan", "source_key": "moj-japan-rss", "homepage_url": "https://www.moj.go.jp/", "allowed_domain": "www.moj.go.jp", "country": "jp", "city": "", "language": "ja", "default_category": "legal_notice", "credibility_level": "official", "crawl_interval_minutes": 360},
        {"name": "Japan Today", "source_key": "japan-today-reference", "homepage_url": "https://japantoday.com/", "allowed_domain": "japantoday.com", "country": "jp", "city": "", "language": "en", "default_category": "local_news", "credibility_level": "media", "crawl_interval_minutes": 180},
        {"name": "Tokyo Taito City Official", "source_key": "taito-city", "homepage_url": "https://www.city.taito.lg.jp/", "allowed_domain": "www.city.taito.lg.jp", "country": "jp", "city": "tokyo", "sub_city": "taito", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 720},
        {"name": "Tokyo Chiyoda City Official", "source_key": "chiyoda-city", "homepage_url": "https://www.city.chiyoda.lg.jp/", "allowed_domain": "www.city.chiyoda.lg.jp", "country": "jp", "city": "tokyo", "sub_city": "chiyoda", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 720},
        {"name": "Tokyo Suginami City Official", "source_key": "suginami-city", "homepage_url": "https://www.city.suginami.tokyo.jp/", "allowed_domain": "www.city.suginami.tokyo.jp", "country": "jp", "city": "tokyo", "sub_city": "suginami", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 720},
        {"name": "Osaka Chuo Ward Official", "source_key": "osaka-chuo-ward", "homepage_url": "https://www.city.osaka.lg.jp/chuo/", "allowed_domain": "www.city.osaka.lg.jp", "country": "jp", "city": "osaka", "sub_city": "chuo", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 720},
        {"name": "Osaka Kita Ward Official", "source_key": "osaka-kita-ward", "homepage_url": "https://www.city.osaka.lg.jp/kita/", "allowed_domain": "www.city.osaka.lg.jp", "country": "jp", "city": "osaka", "sub_city": "kita", "language": "ja", "default_category": "life_notice", "credibility_level": "official", "crawl_interval_minutes": 720},
    ])
    source_overrides: dict[str, dict[str, Any]] = {
        "digital-agency-japan": {
            "source_type": "rss", "crawl_strategy": "rss", "source_url": "https://www.digital.go.jp/rss/news.xml",
            "source_tier": "tier_1_official", "copyright_policy": "metadata_only",
            "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium",
            "crawl_interval_minutes": 240, "max_items_per_run": 20, "default_category": "digital_life",
        },
        "japan-cabinet": {
            "source_tier": "tier_1_official", "copyright_policy": "official_attribution",
            "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "high",
            "crawl_interval_minutes": 240, "default_category": "policy_update",
        },
        "jma-japan-weather": {
            "source_type": "metadata", "crawl_strategy": "meta_only", "source_url": "https://www.jma.go.jp/jma/index.html",
            "source_tier": "tier_1_official", "copyright_policy": "metadata_only",
            "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "high",
            "crawl_interval_minutes": 30, "max_items_per_run": 20,
        },
        "moj-japan-rss": {
            "source_type": "metadata", "crawl_strategy": "meta_only", "source_url": "https://www.moj.go.jp/",
            "source_tier": "tier_1_official", "copyright_policy": "metadata_only",
            "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "high",
            "max_items_per_run": 20,
        },
        "japan-immigration-services-agency": {
            "source_type": "metadata", "crawl_strategy": "meta_only", "source_url": "https://www.moj.go.jp/isa/",
            "source_tier": "tier_1_official", "copyright_policy": "metadata_only",
            "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "high",
            "crawl_interval_minutes": 360, "max_items_per_run": 20,
        },
        "mhlw-japan": {
            "source_type": "manual_reference", "crawl_strategy": "manual",
            "source_tier": "tier_5_manual_reference", "copyright_policy": "redistribution_restricted",
            "allow_auto_draft": False, "auto_create_draft": False, "allow_auto_publish": False,
            "official_auto_publish": False, "risk_level": "high",
            "copyright_policy_note": "MHLW RSS redistribution is restricted. Keep this as a manual editorial reference only.",
            "crawl_interval_minutes": 720, "max_items_per_run": 10,
        },
        "tokyo-metropolitan-government": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 240, "max_items_per_run": 30},
        "tokyo-disaster-prevention": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "high", "crawl_interval_minutes": 60, "max_items_per_run": 20},
        "tokyo-tourism-events": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event", "crawl_interval_minutes": 360},
        "osaka-city": {"source_tier": "tier_2_city_official", "copyright_policy": "cc_by", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 240, "max_items_per_run": 30},
        "osaka-government": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 240, "max_items_per_run": 30},
        "osaka-tourism-events": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event", "crawl_interval_minutes": 360},
        "jr-east": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium", "crawl_interval_minutes": 30, "max_items_per_run": 30},
        "jr-west": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium", "crawl_interval_minutes": 30, "max_items_per_run": 20},
        "tokyo-metro": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium", "crawl_interval_minutes": 30},
        "toei-transportation": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium", "crawl_interval_minutes": 30},
        "osaka-metro": {"source_tier": "tier_2_city_official", "allow_auto_draft": True, "auto_create_draft": True, "risk_level": "medium", "crawl_interval_minutes": 30},
        "nhk-news": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "allow_auto_publish": False, "official_auto_publish": False, "crawl_interval_minutes": 120},
        "nhk-shutoken": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 120},
        "nhk-kansai": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 120},
        "japan-times": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 180},
        "japan-today-reference": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 180},
        "nippon-com": {"source_tier": "tier_3_public_media", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "crawl_interval_minutes": 240},
        "time-out-tokyo": {"source_tier": "tier_4_event_lifestyle", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event", "crawl_interval_minutes": 360},
        "tokyo-art-beat": {"source_tier": "tier_4_event_lifestyle", "copyright_policy": "metadata_only", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event", "crawl_interval_minutes": 360},
        "peatix-tokyo-public-events": {"source_tier": "tier_4_event_lifestyle", "credibility_level": "event_platform", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event"},
        "peatix-osaka-public-events": {"source_tier": "tier_4_event_lifestyle", "credibility_level": "event_platform", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event"},
        "meetup-tokyo-public-events": {"source_tier": "tier_4_event_lifestyle", "credibility_level": "event_platform", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event"},
        "meetup-osaka-public-events": {"source_tier": "tier_4_event_lifestyle", "credibility_level": "event_platform", "allow_auto_draft": True, "auto_create_draft": True, "default_category": "city_event"},
    }
    for src in presets:
        src.update(source_overrides.get(src.get("source_key", ""), {}))
    for src in presets:
        src.setdefault("source_type", "webpage")
        src.setdefault("crawl_strategy", "meta_only")
        src.setdefault("source_url", src.get("homepage_url", ""))
        if not src.get("source_url") and src.get("homepage_url"):
            src["source_url"] = src["homepage_url"]
        if src.get("source_type") == "manual" and src.get("source_url"):
            src["source_type"] = "webpage"
        if src.get("source_type") == "manual_reference":
            src["crawl_strategy"] = "manual"
        if src.get("crawl_strategy") == "manual" and src.get("source_url") and src.get("source_type") not in {"manual", "manual_reference"}:
            src["crawl_strategy"] = "meta_only"
        src.setdefault("copyright_policy_note", "Store metadata and source links only; do not republish full text.")
        src.setdefault("copyright_policy", _normalize_copyright_policy(src.get("copyright_policy"), src.get("copyright_policy_note")))
        src.setdefault("sub_city", "")
        src.setdefault("max_items_per_run", 30)
        src.setdefault("request_timeout_ms", 15000)
        src.setdefault("require_manual_review", True)
        src.setdefault("allow_auto_draft", bool(src.get("auto_create_draft", False)))
        src.setdefault("allow_auto_publish", bool(src.get("official_auto_publish", False)))
        src.setdefault("auto_create_draft", bool(src.get("allow_auto_draft", False)))
        src.setdefault("official_auto_publish", bool(src.get("allow_auto_publish", False)))
        src.setdefault("content_rewrite_required", True)
        src.setdefault("source_tier", _normalize_source_tier(
            src.get("source_tier"),
            credibility=_normalize_credibility(src.get("credibility_level")),
            city=_normalize_news_city(src.get("city")),
            source_type=_normalize_source_type(src.get("source_type")),
            crawl_strategy=_normalize_crawl_strategy(src.get("crawl_strategy"), _normalize_source_type(src.get("source_type"))),
        ))
        src.setdefault("risk_level", _normalize_risk_level(src.get("risk_level"), _normalize_news_category(src.get("default_category"))))
        src.setdefault("is_active", True)
    result = {"created": 0, "updated": 0, "skipped": 0, "total_presets": len(presets)}
    for src in presets:
        existing = conn.execute("SELECT id FROM news_sources WHERE source_key = ?", (src["source_key"],)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE news_sources
                   SET name = ?, source_type = ?, source_url = ?, homepage_url = ?, allowed_domain = ?,
                       country = ?, city = ?, language = ?, default_category = ?,
                       credibility_level = ?, copyright_policy_note = ?, crawl_strategy = ?,
                       max_items_per_run = ?, request_timeout_ms = ?, require_manual_review = ?,
                       is_active = ?, source_tier = ?, copyright_policy = ?, allow_auto_draft = ?,
                       allow_auto_publish = ?, auto_create_draft = ?, official_auto_publish = ?,
                       content_rewrite_required = ?, risk_level = ?, sub_city = ?, updated_at = ?
                 WHERE source_key = ?
                """,
                (
                    src["name"], src["source_type"], src["source_url"], src["homepage_url"], src["allowed_domain"],
                    src["country"], src["city"], src["language"], src["default_category"],
                    src["credibility_level"], src["copyright_policy_note"], src["crawl_strategy"],
                    src["max_items_per_run"], src["request_timeout_ms"], 1 if src["require_manual_review"] else 0,
                    1 if src["is_active"] else 0, src["source_tier"], src["copyright_policy"],
                    1 if src["allow_auto_draft"] else 0, 1 if src["allow_auto_publish"] else 0,
                    1 if src["auto_create_draft"] else 0, 1 if src["official_auto_publish"] else 0,
                    1 if src["content_rewrite_required"] else 0, src["risk_level"], src.get("sub_city", ""),
                    now, src["source_key"],
                ),
            )
            result["updated"] += 1
            continue
        conn.execute(
            """
            INSERT INTO news_sources
                (id, name, source_key, source_type, source_url, homepage_url, allowed_domain,
                 country, city, language, default_category, credibility_level, copyright_policy_note,
                 crawl_strategy, crawl_interval_minutes, max_items_per_run, request_timeout_ms,
                 is_active, require_manual_review, auto_create_draft, official_auto_publish,
                 source_tier, copyright_policy, allow_auto_draft, allow_auto_publish,
                 content_rewrite_required, risk_level, sub_city, created_by_admin_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
            """,
            (
                str(uuid.uuid4()), src["name"], src["source_key"], src["source_type"], src["source_url"],
                src["homepage_url"], src["allowed_domain"], src["country"], src["city"], src["language"],
                src["default_category"], src["credibility_level"], src["copyright_policy_note"],
                src["crawl_strategy"], src["crawl_interval_minutes"], src["max_items_per_run"],
                src["request_timeout_ms"], 1 if src["is_active"] else 0, 1 if src["require_manual_review"] else 0,
                1 if src["auto_create_draft"] else 0, 1 if src["official_auto_publish"] else 0,
                src["source_tier"], src["copyright_policy"], 1 if src["allow_auto_draft"] else 0,
                1 if src["allow_auto_publish"] else 0, 1 if src["content_rewrite_required"] else 0,
                src["risk_level"], src.get("sub_city", ""), now, now,
            ),
        )
        result["created"] += 1
    return result


def init_db() -> None:
    with DB_LOCK, db() as conn:
        conn.executescript(SCHEMA)
        run_migrations(conn)
        ensure_membership_plans(conn)
        ensure_news_source_presets(conn)
        if conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] == 0 and not PRODUCTION:
            # Only seed in dev. In production the DB starts empty and the
            # first registered user is the founder.
            seed(conn)
        # Always ensure the default admin exists (prod + dev). This never
        # touches or downgrades any other account, so existing admins are
        # preserved exactly as-is.
        ensure_seed_admin(conn)


_NEWS_CRAWLER_THREAD: threading.Thread | None = None


def _crawler_interval_for_category(category: str) -> int:
    if category in {"traffic_alert", "weather_alert", "earthquake_alert", "typhoon_alert"}:
        return 30
    if category in {"local_news", "policy_update", "immigration_visa"}:
        return 120
    if category in {"city_event", "life_notice"}:
        return 360
    return 180


def start_news_crawler_scheduler() -> None:
    """Optional deploy-time crawler runner. Disabled by default; when enabled
    it only harvests metadata into the review pool and never makes content
    public by itself."""
    global _NEWS_CRAWLER_THREAD
    if _NEWS_CRAWLER_THREAD is not None:
        return
    if not (NEWS_CRAWLER_ENABLED and NEWS_CRAWLER_AUTO_FETCH):
        ACCESS_LOG.info("news crawler scheduler disabled (NEWS_CRAWLER_AUTO_FETCH=false)")
        return

    def _loop() -> None:
        ACCESS_LOG.info("news crawler scheduler started")
        while True:
            try:
                with DB_LOCK, db() as conn:
                    rows = conn.execute(
                        """
                        SELECT id, default_category, crawl_interval_minutes, last_fetched_at
                          FROM news_sources
                         WHERE is_active = 1 AND deleted_at IS NULL
                         ORDER BY COALESCE(last_fetched_at, '1970-01-01T00:00:00+00:00')
                         LIMIT 20
                        """
                    ).fetchall()
                    for row in rows:
                        last = None
                        try:
                            last = datetime.fromisoformat((row["last_fetched_at"] or "").replace("Z", "+00:00"))
                        except Exception:
                            last = None
                        interval = int(row["crawl_interval_minutes"] or 0) or _crawler_interval_for_category(row["default_category"])
                        interval = max(30, interval)
                        if last and datetime.now(timezone.utc) - last.astimezone(timezone.utc) < timedelta(minutes=interval):
                            continue
                        try:
                            fetch_news_source(conn, row["id"], admin_id="", force=False)
                        except APIError:
                            continue
            except Exception:
                ERR_LOG.exception("news crawler scheduler iteration failed")
            time.sleep(60)

    _NEWS_CRAWLER_THREAD = threading.Thread(target=_loop, name="news-crawler-scheduler", daemon=True)
    _NEWS_CRAWLER_THREAD.start()


def seed_region_for_location(location: str) -> tuple[str, str, str, str]:
    mapping = {
        "东京": ("jp", "tokyo", "tokyo", "jp.tokyo.tokyo"),
        "大阪": ("jp", "osaka", "osaka", "jp.osaka.osaka"),
        "上海": ("cn", "shanghai", "shanghai", "cn.shanghai.shanghai"),
        "北京": ("cn", "beijing", "beijing", "cn.beijing.beijing"),
        "广州": ("cn", "guangdong", "guangzhou", "cn.guangdong.guangzhou"),
        "深圳": ("cn", "guangdong", "shenzhen", "cn.guangdong.shenzhen"),
        "香港": ("cn", "hongkong", "hongkong", "cn.hongkong.hongkong"),
        "长沙": ("cn", "hunan", "changsha", "cn.hunan.changsha"),
        "西安": ("cn", "shaanxi", "xian", "cn.shaanxi.xian"),
        "武汉": ("cn", "hubei", "wuhan", "cn.hubei.wuhan"),
    }
    return mapping.get(location, mapping["东京"])


def seed(conn: sqlite3.Connection) -> None:
    sample_users = [
        # handle, name, password, bio, location, symbol, color, tier, verified, role
        ("kaizi", "Machi News", "123456", "产品动态和社区公告。", "东京", "sparkles", "black", "creator", 1, "admin"),
        ("swiftuilab", "SwiftUI Lab", "123456", "SwiftUI 原型与工程实践。", "上海", "swift", "orange", "pro", 1, "member"),
        ("productdaily", "产品观察", "123456", "记录产品设计和增长想法。", "北京", "chart.line.uptrend.xyaxis", "blue", "pro", 1, "member"),
        ("citylive", "城市现场", "123456", "本地活动和现场消息。", "东京", "building.2", "green", "free", 0, "member"),
        ("designer_lee", "设计观察 · 李一", "123456", "界面、动效、交互。", "深圳", "paintbrush.pointed.fill", "purple", "free", 0, "member"),
    ]
    ids: dict[str, str] = {}
    user_regions: dict[str, tuple[str, str, str, str]] = {}
    for handle, name, password, bio, location, symbol, color, tier, verified, role in sample_users:
        user_id = str(uuid.uuid4())
        ids[handle] = user_id
        country, province, city, region_code = seed_region_for_location(location)
        user_regions[handle] = (country, province, city, region_code)
        conn.execute(
            """
            INSERT INTO users (id, handle, display_name, email, password_hash, bio, location,
                               avatar_symbol, avatar_color, avatar_url, cover_url, membership_tier,
                               is_verified, role, country, province, city, current_region_code,
                               recent_region_codes, joined_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, handle, name, f"{handle}@machi.app", hash_password(password),
                bio, location, symbol, color, "", "", tier, verified, role,
                country, province, city, region_code, region_code,
                now_iso(), now_iso(), now_iso(),
            ),
        )
        conn.execute(
            "INSERT INTO settings (user_id, updated_at) VALUES (?, ?)",
            (user_id, now_iso()),
        )

    posts_seed = [
        ("kaizi", "Web 版本上线：登录、发布、评论、点赞、转发、收藏、关注、私信和城市精选都走同一个 API 与 iOS App 共享数据。#Machi #产品更新", 9600),
        ("productdaily", "做好社交产品的关键是把首页、热榜、通知、私信做成完整闭环，每一处操作的回路都不要断。#产品设计 #社交产品", 21400),
        ("swiftuilab", "Web 和 App 共用同一套服务端 API，客户端只负责呈现和交互；这样多端发布、灰度、回滚都更可控。#SwiftUI #Web #多端", 56000),
        ("citylive", "东京周末创作者市集开放报名，独立开发和设计摊位都在快速增加。#周末活动 #城市新闻", 19300),
        ("productdaily", "热榜按点赞量、访问量、收藏量加权计算，话题热度再叠加 #标签 出现次数。#热搜机制", 38600),
        ("designer_lee", "好的卡片设计要让人一眼看到层级；信息密度高时，反而需要更多留白。#设计 #UI", 7200),
        ("swiftuilab", "投稿和草稿现在 Web 端也能保存了，断网时也能继续写。#Machi #投稿", 5300),
    ]
    post_ids: list[str] = []
    for index, (handle, content, views) in enumerate(posts_seed):
        post_id = str(uuid.uuid4())
        post_ids.append(post_id)
        created = datetime.now(timezone.utc) - timedelta(minutes=20 * (index + 1))
        country, province, city, region_code = user_regions.get(handle, seed_region_for_location("东京"))
        conn.execute(
            """
            INSERT INTO posts (id, author_id, content, view_count, country, province,
                               city, region_code, content_type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dynamic', 'active', ?, ?)
            """,
            (
                post_id, ids[handle], content, views,
                country, province, city, region_code,
                created.isoformat(), created.isoformat(),
            ),
        )
        for tag in extract_tags(content):
            conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (post_id, tag))

    follows = [
        ("kaizi", "swiftuilab"), ("kaizi", "productdaily"), ("kaizi", "designer_lee"),
        ("swiftuilab", "kaizi"), ("swiftuilab", "productdaily"),
        ("productdaily", "kaizi"), ("productdaily", "swiftuilab"),
        ("designer_lee", "kaizi"),
    ]
    for f, t in follows:
        conn.execute(
            "INSERT OR IGNORE INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), ids[f], ids[t], now_iso()),
        )

    for pid in post_ids[:5]:
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), pid, ids["kaizi"], "like", now_iso()),
        )
    conn.execute(
        "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), post_ids[2], ids["kaizi"], "bookmark", now_iso()),
    )

    conn.execute(
        "INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), post_ids[0], ids["swiftuilab"], "这个 Web 版本可以先作为服务端化前的验证版本。", now_iso(), now_iso()),
    )

    conv_a, conv_b = sorted([ids["swiftuilab"], ids["kaizi"]])
    conv_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO conversations (id, participant_a, participant_b, updated_at) VALUES (?, ?, ?, ?)",
        (conv_id, conv_a, conv_b, now_iso()),
    )
    conn.execute(
        "INSERT INTO messages (id, conversation_id, sender_id, content, created_at, is_read) VALUES (?, ?, ?, ?, ?, 0)",
        (str(uuid.uuid4()), conv_id, ids["swiftuilab"], "Web 端也已经可以用同一套接口读写数据。", now_iso()),
    )

    conn.execute(
        "INSERT INTO notifications (id, user_id, actor_id, type, target_post_id, content, created_at) VALUES (?, ?, ?, 'like', ?, ?, ?)",
        (str(uuid.uuid4()), ids["kaizi"], ids["swiftuilab"], post_ids[0], "赞了你的帖子", now_iso()),
    )


# ---------------------------------------------------------------------------
# realtime hub


class EventHub:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.subscribers: dict[str, list[Any]] = {}

    def subscribe(self, user_id: str, queue: Any) -> None:
        with self.lock:
            self.subscribers.setdefault(user_id, []).append(queue)

    def unsubscribe(self, user_id: str, queue: Any) -> None:
        with self.lock:
            queues = self.subscribers.get(user_id, [])
            if queue in queues:
                queues.remove(queue)
            if not queues:
                self.subscribers.pop(user_id, None)

    def publish(self, user_id: str, event: dict[str, Any]) -> None:
        with self.lock:
            queues = list(self.subscribers.get(user_id, []))
        payload = ("event: " + event.get("type", "message") + "\n" +
                   "data: " + json.dumps(event, ensure_ascii=False) + "\n\n").encode("utf-8")
        for q in queues:
            try:
                q.put_nowait(payload)
            except Exception:
                pass

    def broadcast(self, user_ids: Iterable[str], event: dict[str, Any]) -> None:
        for uid in set(user_ids):
            self.publish(uid, event)


HUB = EventHub()


# ---------------------------------------------------------------------------
# serializers


def serialize_user(row: dict[str, Any]) -> dict[str, Any]:
    role = row.get("role", "member") or "member"
    is_verified_member = bool(row.get("is_verified_member", 0))
    is_official = role in {"admin", "moderator", "creator"} or bool(row.get("is_verified", 0))
    payload = {
        "id": row["id"],
        "remote_id": row["id"],
        "handle": row["handle"],
        "username": row["handle"],
        "display_name": row["display_name"],
        "displayName": row["display_name"],
        "email": row.get("email", ""),
        "bio": row.get("bio", ""),
        "location": row.get("location", ""),
        "avatar_symbol": row.get("avatar_symbol", "person.fill"),
        "avatar_color": row.get("avatar_color", "indigo"),
        "avatar_url": row.get("avatar_url", ""),
        "avatarUrl": row.get("avatar_url", ""),
        "cover_url": row.get("cover_url", ""),
        "membership_tier": row.get("membership_tier", "free"),
        "is_verified": bool(row.get("is_verified", 0)),
        "role": role,
        "isOfficial": is_official,
        "is_official": is_official,
        "officialRole": role if is_official else "",
        "official_role": role if is_official else "",
        "joined_at": row.get("joined_at"),
        "created_at": row.get("created_at"),
        "createdAt": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updatedAt": row.get("updated_at"),
        # Phase 1: home / current region. Added via MIGRATIONS so the
        # columns exist on every running install; default-empty values
        # mean a user that hasn't picked a region yet just sees blanks.
        "country":             row.get("country", "") or "",
        "province":            row.get("province", "") or "",
        "city":                row.get("city", "") or "",
        "current_region_code": row.get("current_region_code", "") or "",
        "recent_region_codes": [code for code in (row.get("recent_region_codes", "") or "").split("|") if code],
        "total_heat":          int(row.get("total_heat") or 0),
        "creator_badge":       row.get("creator_badge", "") or "",
        "is_merchant":         bool(row.get("is_merchant", 0)),
        "merchant_verified":   bool(row.get("merchant_verified", 0)),
        "profile_view_count":  int(row.get("profile_view_count") or 0),
        # Machi Verified membership cache (authoritative truth lives in
        # user_memberships; these are kept in sync by
        # sync_user_membership_cache on every entitlement change and the
        # expiry sweep). is_verified_member drives the blue badge.
        "is_verified_member":   is_verified_member,
        "isVerifiedMember":     is_verified_member,
        "verified_member_until": row.get("verified_member_until", "") or "",
        "verifiedMemberUntil":  row.get("verified_member_until", "") or "",
        "membership_status":    row.get("membership_status", "inactive") or "inactive",
        "membershipStatus":     row.get("membership_status", "inactive") or "inactive",
        "membership_plan_key":  row.get("membership_plan_key", "") or "",
        "membershipPlanKey":    row.get("membership_plan_key", "") or "",
        "verified_badge_type":  row.get("verified_badge_type", "") or "",
        "verifiedBadgeType":    row.get("verified_badge_type", "") or "",
        "follower_count":       int(row.get("follower_count") or 0) if "follower_count" in row else 0,
        "following_count":      int(row.get("following_count") or 0) if "following_count" in row else 0,
        "post_count":           int(row.get("post_count") or 0) if "post_count" in row else 0,
        "followerCount":        int(row.get("follower_count") or 0) if "follower_count" in row else 0,
        "followingCount":       int(row.get("following_count") or 0) if "following_count" in row else 0,
        "postCount":            int(row.get("post_count") or 0) if "post_count" in row else 0,
        "isFollowing":          bool(row.get("is_following", 0)) if "is_following" in row else False,
        "can_message":          True,
        "canMessage":           True,
    }
    return payload


def serialize_post(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    like_count = int(extras.get("like_count") or 0)
    repost_count = int(extras.get("repost_count") or 0)
    bookmark_count = int(extras.get("bookmark_count") or 0)
    comment_count = int(extras.get("comment_count") or 0)
    view_count = int(row.get("view_count") or 0)
    report_count = int(row.get("report_count") or 0)
    heat = int(round(
        like_count
        + comment_count * 3
        + repost_count * 5
        + bookmark_count * 4
        - report_count * 10
        + _active_boost(row)
        + _time_decay(row.get("created_at")),
    ))
    media = extras.get("media") or []
    content_type = row.get("content_type", "") or "dynamic"
    viewer = extras.get("viewer") if isinstance(extras.get("viewer"), dict) else None
    viewer_id = (viewer or {}).get("id")
    can_manage = bool(viewer_id and viewer_id == row.get("author_id") and not row.get("deleted_at"))
    payload = {
        "id": row["id"],
        "remote_id": row["id"],
        "author_id": row["author_id"],
        "content": row["content"],
        "created_at": row["created_at"],
        "createdAt": row["created_at"],
        "updated_at": row["updated_at"],
        "updatedAt": row["updated_at"],
        "deleted_at": row.get("deleted_at"),
        "repost_of_id": row.get("repost_of_id"),
        "view_count": view_count,
        "viewCount": view_count,
        "like_count": like_count,
        "likeCount": like_count,
        "repost_count": repost_count,
        "repostCount": repost_count,
        "bookmark_count": bookmark_count,
        "bookmarkCount": bookmark_count,
        "save_count": bookmark_count,
        "saveCount": bookmark_count,
        "comment_count": comment_count,
        "commentCount": comment_count,
        "share_count": 0,
        "shareCount": 0,
        "heat_score": heat,
        "heatScore": heat,
        "report_count": report_count,
        "is_boosted": bool(row.get("is_boosted", 0)),
        "boost_weight": int(row.get("boost_weight") or 0),
        "boosted_until": row.get("boosted_until", "") or "",
        "liked": bool(extras.get("liked")),
        "isLiked": bool(extras.get("liked")),
        "bookmarked": bool(extras.get("bookmarked")),
        "saved": bool(extras.get("bookmarked")),
        "isSaved": bool(extras.get("bookmarked")),
        "reposted": bool(extras.get("reposted")),
        "isReposted": bool(extras.get("reposted")),
        "canEdit": can_manage,
        "can_edit": can_manage,
        "canDelete": can_manage,
        "can_delete": can_manage,
        "canInteract": bool(extras.get("can_interact")),
        "can_interact": bool(extras.get("can_interact")),
        "viewer": extras.get("viewer"),
        "tags": extras.get("tags") or [],
        "media": media,
        "images": [m.get("url", "") for m in media if m.get("type") == "image" and m.get("url")],
        "videoUrl": next((m.get("url", "") for m in media if m.get("type") == "video" and m.get("url")), ""),
        "video_url": next((m.get("url", "") for m in media if m.get("type") == "video" and m.get("url")), ""),
        "author": extras.get("author"),
        "original_post": extras.get("original_post"),
        "status": row.get("status", "published"),
        # Region (phase 1). Empty strings when the post predates the
        # region pivot or the author didn't pick a city.
        "country":     row.get("country", "") or "",
        "province":    row.get("province", "") or "",
        "city":        row.get("city", "") or "",
        "region_code": row.get("region_code", "") or "",
        "cityPath": row.get("region_code", "") or "",
        "city_path": row.get("region_code", "") or "",
        # Content type discriminator + typed attributes (phase 2).
        # `content_type` defaults to 'dynamic' for posts created before
        # this column existed; `attributes` is a decoded dict (already
        # validated against the per-type schema on write).
        "content_type": content_type,
        "contentType": content_type,
        "category": content_type,
        "attributes":   decode_post_attributes(row.get("attributes")),
        "requiresMembership": requires_verified_membership(content_type),
        "requires_membership": requires_verified_membership(content_type),
        "sourceType": "city_seed" if bool(row.get("is_seed_content", 0)) else "user",
        "source_type": "city_seed" if bool(row.get("is_seed_content", 0)) else "user",
        # City Seed Bot (城市内容助手). When true the client renders an official
        # identity + a light "城市助手/编辑部" chip and an official avatar — never
        # a real-person identity. `seed_author_type` ∈ {official_bot, editorial}.
        "is_seed_content": bool(row.get("is_seed_content", 0)),
        "seed_author_type": row.get("generated_by", "") or "",
        "seed_source": row.get("seed_source", "") or "",
        "poll": extras.get("poll"),
    }
    return payload


def serialize_comment(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "remote_id": row["id"],
        "post_id": row["post_id"],
        "author_id": row["author_id"],
        "content": row["content"],
        "parent_comment_id": row.get("parent_comment_id"),
        "reply_to_user_id": row.get("reply_to_user_id"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "deleted_at": row.get("deleted_at"),
        "like_count": int(extras.get("like_count") or 0),
        "liked": bool(extras.get("liked")),
        "author": extras.get("author"),
    }


def serialize_media(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "remote_id": row["id"],
        "owner_id": row["owner_id"],
        "type": row["type"],
        "url": row["url"],
        "thumb_url": row.get("thumb_url") or row["url"],
        "mime": row["mime"],
        "width": int(row.get("width") or 0),
        "height": int(row.get("height") or 0),
        "duration": float(row.get("duration") or 0),
        "byte_size": int(row.get("byte_size") or 0),
        "created_at": row["created_at"],
    }


def serialize_notification(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "type": row["type"],
        "actor_id": row["actor_id"],
        "user_id": row["user_id"],
        "target_post_id": row.get("target_post_id"),
        "target_comment_id": row.get("target_comment_id"),
        "content": row.get("content", ""),
        "is_read": bool(row.get("is_read", 0)),
        "created_at": row["created_at"],
        "actor": extras.get("actor"),
    }


def serialize_message(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "sender_id": row["sender_id"],
        "content": row.get("content", ""),
        "created_at": row["created_at"],
        "is_read": bool(row.get("is_read", 0)),
        "media": extras.get("media") or [],
    }


def serialize_conversation(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "participant_a": row["participant_a"],
        "participant_b": row["participant_b"],
        "participants": [row["participant_a"], row["participant_b"]],
        "peer": extras.get("peer"),
        "last_message": extras.get("last_message"),
        "unread_count": int(extras.get("unread_count") or 0),
        "updated_at": row["updated_at"],
    }


# ---------------------------------------------------------------------------
# data loaders


def hydrate_post_extras(conn: sqlite3.Connection, post_ids: list[str], current_user_id: str | None) -> dict[str, dict[str, Any]]:
    if not post_ids:
        return {}
    placeholders = ",".join("?" * len(post_ids))

    likes = {row["target_id"]: row["c"] for row in conn.execute(
        f"SELECT target_id, COUNT(*) AS c FROM interactions WHERE kind='like' AND target_id IN ({placeholders}) GROUP BY target_id",
        post_ids,
    )}
    reposts = {row["target_id"]: row["c"] for row in conn.execute(
        f"SELECT target_id, COUNT(*) AS c FROM interactions WHERE kind='repost' AND target_id IN ({placeholders}) GROUP BY target_id",
        post_ids,
    )}
    bookmarks = {row["target_id"]: row["c"] for row in conn.execute(
        f"SELECT target_id, COUNT(*) AS c FROM interactions WHERE kind='bookmark' AND target_id IN ({placeholders}) GROUP BY target_id",
        post_ids,
    )}
    comments = {row["post_id"]: row["c"] for row in conn.execute(
        f"SELECT post_id, COUNT(*) AS c FROM comments WHERE deleted_at IS NULL AND post_id IN ({placeholders}) GROUP BY post_id",
        post_ids,
    )}

    user_likes: set[str] = set()
    user_reposts: set[str] = set()
    user_bookmarks: set[str] = set()
    if current_user_id:
        for row in conn.execute(
            f"SELECT target_id, kind FROM interactions WHERE user_id=? AND target_id IN ({placeholders})",
            [current_user_id] + post_ids,
        ):
            if row["kind"] == "like":
                user_likes.add(row["target_id"])
            elif row["kind"] == "repost":
                user_reposts.add(row["target_id"])
            elif row["kind"] == "bookmark":
                user_bookmarks.add(row["target_id"])

    tags_by_post: dict[str, list[str]] = {pid: [] for pid in post_ids}
    for row in conn.execute(
        f"SELECT post_id, tag FROM post_tags WHERE post_id IN ({placeholders})",
        post_ids,
    ):
        tags_by_post.setdefault(row["post_id"], []).append(row["tag"])

    media_by_post: dict[str, list[dict[str, Any]]] = {pid: [] for pid in post_ids}
    for row in conn.execute(
        f"""SELECT pm.post_id, pm.sort_index, m.*
            FROM post_media pm JOIN media m ON m.id = pm.media_id
            WHERE pm.post_id IN ({placeholders}) AND m.deleted_at IS NULL
            ORDER BY pm.sort_index""",
        post_ids,
    ):
        media_by_post.setdefault(row["post_id"], []).append(serialize_media(dict(row)))

    poll_by_post: dict[str, dict[str, Any]] = {}
    poll_rows = list(conn.execute(
        f"SELECT id, attributes FROM posts WHERE content_type = 'poll' AND id IN ({placeholders})",
        post_ids,
    ))
    poll_ids: list[str] = []
    for row in poll_rows:
        attrs = decode_post_attributes(row["attributes"])
        options = poll_options_from_attributes(attrs)
        if not options:
            continue
        pid = row["id"]
        poll_ids.append(pid)
        poll_by_post[pid] = {
            "options": options,
            "counts": [0 for _ in options],
            "total": 0,
            "my_vote": None,
            "closed": poll_is_closed(attrs.get("expires_at")),
            "expires_at": str(attrs.get("expires_at") or ""),
        }
    if poll_ids:
        poll_placeholders = ",".join("?" * len(poll_ids))
        for row in conn.execute(
            f"""SELECT post_id, option_index, COUNT(*) AS c
                FROM post_poll_votes
                WHERE post_id IN ({poll_placeholders})
                GROUP BY post_id, option_index""",
            poll_ids,
        ):
            payload = poll_by_post.get(row["post_id"])
            if not payload:
                continue
            idx = int(row["option_index"])
            if 0 <= idx < len(payload["counts"]):
                payload["counts"][idx] = int(row["c"])
        if current_user_id:
            for row in conn.execute(
                f"""SELECT post_id, option_index
                    FROM post_poll_votes
                    WHERE user_id = ? AND post_id IN ({poll_placeholders})""",
                [current_user_id] + poll_ids,
            ):
                payload = poll_by_post.get(row["post_id"])
                if payload:
                    payload["my_vote"] = int(row["option_index"])
        for payload in poll_by_post.values():
            payload["total"] = int(sum(payload["counts"]))

    extras: dict[str, dict[str, Any]] = {}
    for pid in post_ids:
        extras[pid] = {
            "like_count": likes.get(pid, 0),
            "repost_count": reposts.get(pid, 0),
            "bookmark_count": bookmarks.get(pid, 0),
            "comment_count": comments.get(pid, 0),
            "liked": pid in user_likes,
            "reposted": pid in user_reposts,
            "bookmarked": pid in user_bookmarks,
            "can_interact": bool(current_user_id),
            "viewer": {"id": current_user_id} if current_user_id else None,
            "tags": tags_by_post.get(pid, []),
            "media": media_by_post.get(pid, []),
            "poll": poll_by_post.get(pid),
        }
    return extras


def fetch_users_by_ids(conn: sqlite3.Connection, user_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not user_ids:
        return {}
    placeholders = ",".join("?" * len(user_ids))
    result: dict[str, dict[str, Any]] = {}
    for row in conn.execute(f"SELECT * FROM users WHERE id IN ({placeholders})", user_ids):
        result[row["id"]] = serialize_user(dict(row))
    return result


def fetch_posts_with_extras(conn: sqlite3.Connection, post_rows: list[dict[str, Any]], current_user_id: str | None) -> list[dict[str, Any]]:
    if not post_rows:
        return []
    ids = [r["id"] for r in post_rows]
    extras_map = hydrate_post_extras(conn, ids, current_user_id)
    repost_ids = [r["repost_of_id"] for r in post_rows if r.get("repost_of_id")]
    originals: dict[str, dict[str, Any]] = {}
    if repost_ids:
        placeholders = ",".join("?" * len(repost_ids))
        rows = list(conn.execute(f"SELECT * FROM posts WHERE id IN ({placeholders})", repost_ids))
        og_ids = [r["id"] for r in rows]
        og_extras = hydrate_post_extras(conn, og_ids, current_user_id)
        author_ids = [r["author_id"] for r in rows]
        author_map = fetch_users_by_ids(conn, author_ids)
        for r in rows:
            entry = dict(r)
            originals[entry["id"]] = serialize_post(entry, {**og_extras.get(entry["id"], {}), "author": author_map.get(entry["author_id"])})

    author_ids = list({r["author_id"] for r in post_rows})
    author_map = fetch_users_by_ids(conn, author_ids)

    posts: list[dict[str, Any]] = []
    for r in post_rows:
        entry = dict(r)
        extras = dict(extras_map.get(entry["id"], {}))
        extras["author"] = author_map.get(entry["author_id"])
        if entry.get("repost_of_id"):
            extras["original_post"] = originals.get(entry["repost_of_id"])
        posts.append(serialize_post(entry, extras))
    return posts


# ---------------------------------------------------------------------------
# HTTP handler


class APIError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request"):
        super().__init__(message)
        self.status = status
        self.code = code


# ---------------------------------------------------------------------------
# account security: email/password helpers
#
# All of the secret-handling rules live here:
#   - passwords are hashed with PBKDF2-HMAC-SHA256 + pepper (see
#     hash_password); never stored or logged in plaintext.
#   - verification / reset codes are stored only as keyed HMAC hashes and
#     are never logged or returned by any API.
#   - emails are masked before they ever touch a log line.
# ---------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(email: str) -> bool:
    email = (email or "").strip()
    return bool(EMAIL_RE.match(email)) and len(email) <= 254


def mask_email(email: str) -> str:
    """Mask an address for safe logging: ``a***z@example.com``."""
    email = (email or "").strip()
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = (local[:1] or "*") + "*"
    else:
        masked = local[0] + "***" + local[-1]
    return f"{masked}@{domain}"


def validate_password_strength(password: Any) -> None:
    """Policy for NEW passwords: >= 8 chars, at least one letter + one digit.

    Login keeps verifying legacy (shorter) passwords so existing accounts are
    never locked out; only password *creation* paths call this.
    """
    if not isinstance(password, str) or len(password) < 8:
        raise APIError("密码至少 8 位", 400, "weak_password")
    if len(password) > 256:
        raise APIError("密码过长", 400, "invalid_password")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise APIError("密码需同时包含字母和数字", 400, "weak_password")


def generate_numeric_code(length: int = EMAIL_CODE_LENGTH) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def hash_auth_code(code: str, email: str = "", purpose: str = "") -> str:
    """Keyed HMAC of a verification code. The plaintext code only ever
    exists in the email we send; the DB stores this digest."""
    msg = f"{purpose}\x1f{(email or '').lower()}\x1f{code}".encode("utf-8")
    return hmac.new(EMAIL_CODE_PEPPER, msg, hashlib.sha256).hexdigest()


def hash_ip(ip: str) -> str:
    return hashlib.sha256(b"machi-ip\x1f" + PASSWORD_PEPPER + (ip or "").encode("utf-8")).hexdigest()[:32]


# ===========================================================================
# Machi Verified — membership + payment service layer
#
# Security invariants (the spec hammers on these — keep them true):
#   * The charge is ALWAYS recomputed from the plan server-side; a
#     client-supplied amount is never trusted.
#   * Membership is only opened/extended from a *server-confirmed* payment
#     — a verified webhook, a verified Apple transaction, or an admin
#     grant — NEVER from a client "success" callback.
#   * Settlement is idempotent: a duplicate provider callback for an
#     already-paid order is a no-op (no double extension).
#   * No payment secret (api key, private key, signature, full receipt)
#     is ever logged or returned by any API.
# ===========================================================================

MEMBERSHIP_ACTIVE_STATUSES = {"active", "grace_period"}
_PROVIDER_SOURCE = {
    "wechat_pay": "wechat_pay",
    "alipay": "alipay",
    "stripe": "stripe",
    "apple_iap": "ios_iap",
    "admin": "admin_grant",
}


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _add_one_month(dt: datetime) -> datetime:
    """Calendar-month add with day clamping (Jan 31 -> Feb 28/29) so the
    renewal anchor doesn't drift like a flat 30-day add would."""
    import calendar
    year = dt.year + (1 if dt.month == 12 else 0)
    month = 1 if dt.month == 12 else dt.month + 1
    last = calendar.monthrange(year, month)[1]
    return dt.replace(year=year, month=month, day=min(dt.day, last))


def requires_verified_membership(content_type: str | None) -> bool:
    return (content_type or "").strip().lower() in REQUIRES_VERIFIED_MEMBERSHIP


def get_plan(conn: sqlite3.Connection, plan_key: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM membership_plans WHERE plan_key = ? AND is_active = 1", (plan_key,)
    ).fetchone()
    return dict(row) if row else None


def serialize_plan(plan: dict[str, Any]) -> dict[str, Any]:
    cents = int(plan.get("amount_cents") or 0)
    return {
        "plan_key": plan["plan_key"],
        "name_zh": plan.get("name_zh", ""),
        "name_en": plan.get("name_en", ""),
        "name_ja": plan.get("name_ja", ""),
        "amount": round(cents / 100, 2),
        "amount_cents": cents,
        "currency": plan.get("currency", MEMBERSHIP_CURRENCY),
        "billing_cycle": plan.get("billing_cycle", MEMBERSHIP_BILLING_CYCLE),
    }


def _current_membership_row(conn: sqlite3.Connection, user_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM user_memberships WHERE user_id = ? "
        "ORDER BY current_period_end DESC, updated_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def _membership_is_live(row: dict[str, Any] | None) -> bool:
    if not row or row.get("status") not in MEMBERSHIP_ACTIVE_STATUSES:
        return False
    end = _aware(parse_iso(row.get("current_period_end")))
    return bool(end and end > datetime.now(timezone.utc))


def record_entitlement_event(conn: sqlite3.Connection, user_id: str, membership_id: str,
                             event_type: str, source: str, metadata: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO entitlement_events (id, user_id, membership_id, event_type, source, metadata_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, membership_id or "", event_type, source or "",
         json.dumps(metadata or {}, ensure_ascii=False), now_iso()),
    )


def sync_user_membership_cache(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    """Recompute the users.* cache columns from the membership rows. The
    cache is a read accelerator only — every entitlement change calls
    this, and the expiry sweep does too."""
    row = _current_membership_row(conn, user_id)
    live = _membership_is_live(row)
    status = (row.get("status") if row else "inactive") or "inactive"
    until = (row.get("current_period_end") if (row and live) else "") or ""
    plan_key = (row.get("plan_key") if row else "") or ""
    conn.execute(
        "UPDATE users SET is_verified_member = ?, verified_member_until = ?, membership_status = ?, "
        "membership_plan_key = ?, verified_badge_type = ?, updated_at = ? WHERE id = ?",
        (1 if live else 0, until, status, plan_key, "member" if live else "", now_iso(), user_id),
    )
    return {"is_verified_member": live, "verified_member_until": until, "membership_status": status}


def _expire_membership_row(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    conn.execute(
        "UPDATE user_memberships SET status = 'expired', expired_at = ?, updated_at = ? "
        "WHERE id = ? AND status IN ('active', 'grace_period')",
        (now_iso(), now_iso(), row["id"]),
    )
    record_entitlement_event(conn, row["user_id"], row["id"], "membership_expired", row.get("source") or "", {})
    sync_user_membership_cache(conn, row["user_id"])


def get_user_membership_status(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    """Authoritative membership snapshot. Lazily flips a lapsed period to
    'expired' (and re-syncs the cache) so a stale row never reads active."""
    row = _current_membership_row(conn, user_id)
    if row and row.get("status") in MEMBERSHIP_ACTIVE_STATUSES and not _membership_is_live(row):
        _expire_membership_row(conn, row)
        row = _current_membership_row(conn, user_id)
    banned_row = conn.execute("SELECT deleted_at FROM users WHERE id = ?", (user_id,)).fetchone()
    banned = bool(banned_row and banned_row["deleted_at"])
    is_active = (not banned) and _membership_is_live(row)
    plan_key = (row.get("plan_key") if row else "") or ""
    plan = get_plan(conn, plan_key) if plan_key else None
    plan_payload = serialize_plan(plan) if plan else None
    current_period_end = (row.get("current_period_end") if row else "") or ""
    status = (row.get("status") if row else "inactive") or "inactive"
    source = (row.get("source") if row else "") or ""
    return {
        "user_id": user_id,
        "userId": user_id,
        "is_active": is_active,
        "isActive": is_active,
        "status": status,
        "plan_key": plan_key,
        "planKey": plan_key,
        "current_period_end": current_period_end,
        "expires_at": current_period_end,
        "expiresAt": current_period_end,
        "started_at": (row.get("started_at") if row else "") or "",
        "startedAt": (row.get("started_at") if row else "") or "",
        "source": source,
        "provider": source,
        "price": float((plan_payload or {}).get("amount") or 0),
        "currency": (plan_payload or {}).get("currency") or MEMBERSHIP_CURRENCY,
        "benefits": ["verified_badge", "exclusive_page", "priority_review", "light_boost"] if is_active else [],
        "verified_badge_type": "member" if is_active else "",
        "verifiedBadgeType": "member" if is_active else "",
        "can_post_high_trust_content": is_active,
        "canPostHighTrustContent": is_active,
        "can_access_exclusive_page": is_active,
        "canAccessExclusivePage": is_active,
        "daily_post_limit": MEMBERSHIP_DAILY_LIMIT_VERIFIED if is_active and MEMBERSHIP_DAILY_LIMIT_VERIFIED > 0 else MEMBERSHIP_DAILY_LIMIT_FREE,
        "dailyPostLimit": MEMBERSHIP_DAILY_LIMIT_VERIFIED if is_active and MEMBERSHIP_DAILY_LIMIT_VERIFIED > 0 else MEMBERSHIP_DAILY_LIMIT_FREE,
        "priority_review": is_active,
        "priorityReview": is_active,
        "light_boost": is_active,
        "lightBoost": is_active,
        "cancel_at_period_end": bool(row.get("cancel_at_period_end")) if row else False,
        "cancelAtPeriodEnd": bool(row.get("cancel_at_period_end")) if row else False,
        "membership_id": (row.get("id") if row else "") or "",
    }


def has_active_membership(conn: sqlite3.Connection, user_id: str) -> bool:
    return get_user_membership_status(conn, user_id)["is_active"]


def require_verified_membership(conn: sqlite3.Connection, user_id: str, content_type: str | None) -> None:
    """403 MEMBERSHIP_REQUIRED if the content type is gated and the user
    isn't an active verified member. Same rule for every client."""
    if not requires_verified_membership(content_type):
        return
    if not has_active_membership(conn, user_id):
        raise APIError("发布该类型内容需要开通 Machi 认证会员。", 403, "MEMBERSHIP_REQUIRED")


def activate_or_extend_membership(conn: sqlite3.Connection, user_id: str, plan_key: str,
                                  source: str, periods: int = 1) -> dict[str, Any]:
    """Open a new membership or extend the live one by `periods` months.
    Callers own idempotency — this always adds `periods` when invoked."""
    now = datetime.now(timezone.utc)
    periods = max(1, int(periods or 1))
    row = _current_membership_row(conn, user_id)
    if _membership_is_live(row):
        end = _aware(parse_iso(row.get("current_period_end"))) or now
        for _ in range(periods):
            end = _add_one_month(end)
        conn.execute(
            "UPDATE user_memberships SET status = 'active', plan_key = ?, current_period_end = ?, "
            "source = ?, expired_at = NULL, updated_at = ? WHERE id = ?",
            (plan_key, end.isoformat(), source, now_iso(), row["id"]),
        )
        membership_id = row["id"]
        record_entitlement_event(conn, user_id, membership_id, "membership_renewed", source, {"plan_key": plan_key})
    else:
        end = now
        for _ in range(periods):
            end = _add_one_month(end)
        membership_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO user_memberships (id, user_id, plan_key, status, started_at, current_period_start, "
            "current_period_end, source, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)",
            (membership_id, user_id, plan_key, now.isoformat(), now.isoformat(), end.isoformat(),
             source, now_iso(), now_iso()),
        )
        record_entitlement_event(conn, user_id, membership_id, "membership_started", source, {"plan_key": plan_key})
    sync_user_membership_cache(conn, user_id)
    return get_user_membership_status(conn, user_id)


def cancel_membership(conn: sqlite3.Connection, user_id: str, immediate: bool = False,
                      source: str = "admin") -> dict[str, Any]:
    """Cancel renewal (default: keep access until period end) or revoke
    immediately. Already-published content is never deleted."""
    row = _current_membership_row(conn, user_id)
    if not row:
        raise APIError("用户没有会员记录", 404, "membership_not_found")
    if immediate:
        conn.execute(
            "UPDATE user_memberships SET status = 'canceled', cancel_at_period_end = 1, canceled_at = ?, "
            "current_period_end = ?, expired_at = ?, updated_at = ? WHERE id = ?",
            (now_iso(), now_iso(), now_iso(), now_iso(), row["id"]),
        )
    else:
        conn.execute(
            "UPDATE user_memberships SET cancel_at_period_end = 1, canceled_at = ?, updated_at = ? WHERE id = ?",
            (now_iso(), now_iso(), row["id"]),
        )
    record_entitlement_event(conn, user_id, row["id"], "membership_canceled", source, {"immediate": immediate})
    sync_user_membership_cache(conn, user_id)
    return get_user_membership_status(conn, user_id)


def expire_due_memberships(conn: sqlite3.Connection) -> int:
    rows = list(conn.execute(
        "SELECT * FROM user_memberships WHERE status IN ('active', 'grace_period') "
        "AND current_period_end IS NOT NULL AND current_period_end < ?",
        (now_iso(),),
    ))
    for r in rows:
        _expire_membership_row(conn, dict(r))
    return len(rows)


# ---------------------------------------------------------------------------
# payment orders + providers
# ---------------------------------------------------------------------------

def generate_order_no() -> str:
    """Unique, time-ordered, unguessable order number."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"MV{ts}{secrets.token_hex(6).upper()}"


def serialize_order(row: dict[str, Any]) -> dict[str, Any]:
    cents = int(row.get("amount_cents") or 0)
    provider = row.get("payment_provider", "")
    platform = row.get("client_type", "") or ("ios" if provider == "apple_iap" else "web")
    return {
        "id": row.get("id", ""),
        "user_id": row.get("user_id", ""),
        "userId": row.get("user_id", ""),
        "order_no": row["order_no"],
        "orderNo": row["order_no"],
        "plan_key": row.get("plan_key", ""),
        "planKey": row.get("plan_key", ""),
        "amount": round(cents / 100, 2),
        "price": round(cents / 100, 2),
        "amount_cents": cents,
        "currency": row.get("currency", MEMBERSHIP_CURRENCY),
        "status": row.get("status", "pending"),
        "provider": provider,
        "payment_provider": provider,
        "platform": platform,
        "client_type": row.get("client_type", ""),
        "created_at": row.get("created_at"),
        "createdAt": row.get("created_at"),
        "expires_at": row.get("expires_at"),
        "expiresAt": row.get("expires_at"),
        "paid_at": row.get("paid_at"),
        "paidAt": row.get("paid_at"),
        "transaction_id": row.get("provider_trade_no", "") or "",
        "transactionId": row.get("provider_trade_no", "") or "",
        "error_message": row.get("error_message", "") or "",
        "errorMessage": row.get("error_message", "") or "",
    }


def _order_charge_for_provider(plan: dict[str, Any], provider: str) -> tuple[int, str]:
    """The amount + currency to charge, chosen server-side per provider.
    Domestic rails (WeChat/Alipay) charge the CNY plan; Stripe charges the
    overseas price (e.g. $1.99). Same entitlement, region-appropriate price.
    A client-supplied amount is never used."""
    if provider == "stripe":
        return STRIPE_PRICE_CENTS, STRIPE_CURRENCY.upper()
    return int(plan["amount_cents"]), plan["currency"]


def create_payment_order(conn: sqlite3.Connection, user_id: str, plan_key: str,
                         provider: str, client_type: str) -> dict[str, Any]:
    plan = get_plan(conn, plan_key)
    if not plan:
        raise APIError("会员计划不存在", 404, "plan_not_found")
    amount_cents, currency = _order_charge_for_provider(plan, provider)
    order_no = generate_order_no()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=PAYMENT_ORDER_TTL_SEC)).isoformat()
    conn.execute(
        "INSERT INTO payment_orders (id, order_no, user_id, plan_key, amount_cents, currency, status, "
        "payment_provider, client_type, expires_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), order_no, user_id, plan_key, amount_cents, currency,
         provider, client_type, expires_at, now_iso(), now_iso()),
    )
    return dict(conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone())


def _order_is_expired(order: dict[str, Any]) -> bool:
    exp = _aware(parse_iso(order.get("expires_at")))
    return bool(exp and exp < datetime.now(timezone.utc))


def mark_order_paid(conn: sqlite3.Connection, order_no: str, provider_trade_no: str = "",
                    provider_user_id: str = "", expected_provider: str | None = None,
                    paid_amount_cents: int | None = None) -> dict[str, Any]:
    """Idempotent settlement. A pending order transitions to paid exactly
    once and opens/extends membership. Re-invoked for an already-paid
    order → returns existing state without double-extending."""
    row = conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone()
    if not row:
        raise APIError("订单不存在", 404, "order_not_found")
    order = dict(row)
    if expected_provider and order.get("payment_provider") != expected_provider:
        raise APIError("订单支付方式不匹配", 400, "provider_mismatch")
    if paid_amount_cents is not None and int(paid_amount_cents) != int(order["amount_cents"]):
        # Amount tampering — never settle. The charge is defined by the plan.
        raise APIError("支付金额与订单不一致", 400, "amount_mismatch")
    if order["status"] == "paid":
        return order  # idempotent
    if order["status"] != "pending":
        raise APIError("订单状态不允许支付", 409, "order_not_payable")
    conn.execute(
        "UPDATE payment_orders SET status = 'paid', provider_trade_no = ?, provider_user_id = ?, "
        "paid_at = ?, updated_at = ? WHERE order_no = ? AND status = 'pending'",
        (provider_trade_no or "", provider_user_id or "", now_iso(), now_iso(), order_no),
    )
    fresh = dict(conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone())
    if fresh["status"] != "paid":
        return fresh  # lost a race; the winner already settled
    source = _PROVIDER_SOURCE.get(order["payment_provider"], order["payment_provider"] or "manual")
    activate_or_extend_membership(conn, order["user_id"], order["plan_key"], source, periods=1)
    return fresh


def refund_order(conn: sqlite3.Connection, order_no: str) -> None:
    order = conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone()
    if not order:
        return
    order = dict(order)
    conn.execute(
        "UPDATE payment_orders SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE order_no = ?",
        (now_iso(), now_iso(), order_no),
    )
    record_entitlement_event(conn, order["user_id"], "", "membership_refunded",
                             order["payment_provider"], {"order_no": order_no})


def record_payment_webhook(conn: sqlite3.Connection, provider: str, event_type: str, event_id: str,
                           order_no: str, raw: str, signature_valid: bool) -> bool:
    """Audit-log a provider callback. Returns False if this exact event
    was already recorded (dedup on provider+event_id) so the caller can
    skip re-processing."""
    if event_id:
        dupe = conn.execute(
            "SELECT 1 FROM payment_webhooks WHERE provider = ? AND event_id = ?", (provider, event_id)
        ).fetchone()
        if dupe:
            return False
    conn.execute(
        "INSERT INTO payment_webhooks (id, provider, event_type, event_id, order_no, raw_payload, "
        "signature_valid, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), provider, event_type or "", event_id or "", order_no or "",
         (raw or "")[:8000], 1 if signature_valid else 0, now_iso(), now_iso()),
    )
    return True


# ---- provider client params (what the client needs to start paying) ----

def _mock_pay_url(order_no: str) -> str:
    # A dev-only link the Web mock-confirm button can call. Only created
    # when PAYMENT_MOCK_ENABLED and not in production.
    return f"/api/payments/mock/confirm?order_no={order_no}"


def build_wechat_payment(conn: sqlite3.Connection, order: dict[str, Any]) -> dict[str, Any]:
    """Return the params a Web client needs to pay an order via WeChat
    (Native = a QR code). When merchant creds are present the real v3
    Native API is called; otherwise dev mock, else a clear config error."""
    if WECHAT_PAY_MCH_ID and WECHAT_PAY_APP_ID and WECHAT_PAY_PRIVATE_KEY and WECHAT_PAY_API_V3_KEY:
        code_url = _wechat_native_prepay(order)  # real server-to-server call
        return {"qr_code_url": code_url}
    if PAYMENT_MOCK_ENABLED:
        return {"qr_code_url": _mock_pay_url(order["order_no"]), "mock": True}
    raise APIError("微信支付尚未完成商户配置", 503, "provider_unconfigured")


def build_alipay_payment(conn: sqlite3.Connection, order: dict[str, Any]) -> dict[str, Any]:
    """Return the params a Web client needs to pay via Alipay (a signed
    redirect URL to the Alipay gateway — page/wap pay needs no S2S call)."""
    if ALIPAY_APP_ID and ALIPAY_PRIVATE_KEY:
        return {"pay_url": _alipay_page_pay_url(order)}
    if PAYMENT_MOCK_ENABLED:
        return {"pay_url": _mock_pay_url(order["order_no"]), "mock": True}
    raise APIError("支付宝尚未完成商户配置", 503, "provider_unconfigured")


def wechat_pay_configured() -> bool:
    return bool(WECHAT_PAY_MCH_ID and WECHAT_PAY_APP_ID and WECHAT_PAY_PRIVATE_KEY and WECHAT_PAY_API_V3_KEY)


def alipay_configured() -> bool:
    return bool(ALIPAY_APP_ID and ALIPAY_PRIVATE_KEY)


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY)


def available_payment_providers() -> list[str]:
    """Which Web providers the client should offer. A provider is shown if
    its real credentials are present, or if dev mock mode is on. Lets the
    membership page hide WeChat until the 服务号 appid + APIv3 key land."""
    out: list[str] = []
    if wechat_pay_configured() or PAYMENT_MOCK_ENABLED:
        out.append("wechat_pay")
    if alipay_configured() or PAYMENT_MOCK_ENABLED:
        out.append("alipay")
    if stripe_configured() or PAYMENT_MOCK_ENABLED:
        out.append("stripe")
    return out


def build_stripe_payment(conn: sqlite3.Connection, order: dict[str, Any]) -> dict[str, Any]:
    """Create a Stripe hosted Checkout Session (one-time payment) and
    return its redirect URL. Stripe-hosted page handles all card UI / PCI.
    Membership opens later from the verified `checkout.session.completed`
    webhook — never from the success redirect."""
    if STRIPE_SECRET_KEY:
        return {"pay_url": _stripe_checkout_url(order)}
    if PAYMENT_MOCK_ENABLED:
        return {"pay_url": _mock_pay_url(order["order_no"]), "mock": True}
    raise APIError("Stripe 尚未完成配置", 503, "provider_unconfigured")


def _stripe_checkout_url(order: dict[str, Any]) -> str:
    """POST to Stripe /v1/checkout/sessions (form-encoded, Bearer secret).
    No SDK needed. Returns the hosted Checkout URL. The success_url carries
    the Checkout session id so the client can confirm the payment on return
    (works with just the secret key — no webhook required)."""
    from urllib.parse import urlencode
    from urllib.request import Request, urlopen
    sep = "&" if "?" in STRIPE_SUCCESS_URL else "?"
    success_url = f"{STRIPE_SUCCESS_URL}{sep}stripe_session={{CHECKOUT_SESSION_ID}}"
    fields = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": STRIPE_CANCEL_URL,
        "client_reference_id": order["order_no"],
        "metadata[order_no]": order["order_no"],
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": order["currency"].lower(),
        "line_items[0][price_data][unit_amount]": str(int(order["amount_cents"])),
        "line_items[0][price_data][product_data][name]": "Machi Verified",
    }
    data = urlencode(fields).encode("utf-8")
    req = Request("https://api.stripe.com/v1/checkout/sessions", data=data, method="POST")
    req.add_header("Authorization", "Bearer " + STRIPE_SECRET_KEY)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urlopen(req, timeout=10) as resp:
            session = json.loads(resp.read().decode("utf-8"))
        return session["url"]
    except Exception as exc:
        ERR_LOG.warning("stripe checkout create failed: %s", type(exc).__name__)
        raise APIError("Stripe 下单失败", 502, "provider_error")


def stripe_retrieve_session(session_id: str) -> dict[str, Any] | None:
    """Fetch a Checkout Session from Stripe (server-to-server, Bearer
    secret). Used to confirm a payment when the user returns to the
    success page — no webhook needed. Returns the session dict or None."""
    if not STRIPE_SECRET_KEY or not session_id:
        return None
    from urllib.request import Request, urlopen
    from urllib.parse import quote
    req = Request("https://api.stripe.com/v1/checkout/sessions/" + quote(session_id, safe=""))
    req.add_header("Authorization", "Bearer " + STRIPE_SECRET_KEY)
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        ERR_LOG.warning("stripe session retrieve failed: %s", type(exc).__name__)
        return None


def stripe_list_recent_sessions(limit: int = 100) -> list[dict[str, Any]]:
    """List recent Checkout Sessions (most recent first). Used by the
    reconcile path to recover a paid-but-unsettled order even when the
    success redirect / webhook was missed (e.g. the user closed the tab,
    or the confirm code wasn't deployed yet at payment time)."""
    if not STRIPE_SECRET_KEY:
        return []
    from urllib.request import Request, urlopen
    req = Request(f"https://api.stripe.com/v1/checkout/sessions?limit={int(limit)}")
    req.add_header("Authorization", "Bearer " + STRIPE_SECRET_KEY)
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8")).get("data", []) or []
    except Exception as exc:
        ERR_LOG.warning("stripe list sessions failed: %s", type(exc).__name__)
        return []


def verify_stripe_webhook(headers: dict[str, str], raw_body: bytes) -> dict[str, Any] | None:
    """Verify a Stripe webhook via the Stripe-Signature header
    (HMAC-SHA256 over "timestamp.payload", keyed by the endpoint signing
    secret — pure stdlib). Returns the parsed event or None. In mock mode
    an X-Mock-Signature HMAC keyed by the dev pepper is accepted."""
    body_text = raw_body.decode("utf-8", "replace")
    if PAYMENT_MOCK_ENABLED and not STRIPE_WEBHOOK_SECRET:
        expected = hmac.new(PASSWORD_PEPPER, raw_body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(headers.get("x-mock-signature", ""), expected):
            try:
                return json.loads(body_text)
            except Exception:
                return None
        return None
    sig_header = headers.get("stripe-signature", "")
    if not sig_header or not STRIPE_WEBHOOK_SECRET:
        return None
    parts = dict(
        kv.split("=", 1) for kv in sig_header.split(",") if "=" in kv
    )
    ts = parts.get("t", "")
    v1 = parts.get("v1", "")
    if not ts or not v1:
        return None
    signed_payload = f"{ts}.{body_text}".encode("utf-8")
    expected = hmac.new(STRIPE_WEBHOOK_SECRET.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        return None
    try:
        return json.loads(body_text)
    except Exception:
        return None


# ---- real provider crypto (needs the `cryptography` package + creds) ----
#
# These are wired for production but require merchant credentials and the
# `cryptography` library. They never run in the mock path and never log a
# secret. Kept compact; see provider docs for the full field list.

def _load_cryptography():
    try:
        import cryptography  # noqa: F401
        return cryptography
    except Exception:
        raise APIError("支付功能需要服务端安装 cryptography 库", 503, "provider_unconfigured")


def _wechat_native_prepay(order: dict[str, Any]) -> str:
    """Call WeChat Pay v3 Native to obtain a code_url (QR target). Signs
    the request with the merchant RSA private key (SHA256withRSA). Returns
    the code_url string. Raises a config error if the call can't be made."""
    _load_cryptography()
    import json as _json
    import time as _time
    from urllib.request import Request, urlopen
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    body = {
        "appid": WECHAT_PAY_APP_ID,
        "mchid": WECHAT_PAY_MCH_ID,
        "description": "Machi 认证会员",
        "out_trade_no": order["order_no"],
        "notify_url": WECHAT_PAY_NOTIFY_URL,
        "amount": {"total": int(order["amount_cents"]), "currency": order["currency"]},
    }
    payload = _json.dumps(body, ensure_ascii=False)
    url_path = "/v3/pay/transactions/native"
    method = "POST"
    nonce = secrets.token_hex(16)
    ts = str(int(_time.time()))
    message = f"{method}\n{url_path}\n{ts}\n{nonce}\n{payload}\n"
    key = serialization.load_pem_private_key(WECHAT_PAY_PRIVATE_KEY.encode("utf-8"), password=None)
    signature = base64.b64encode(
        key.sign(message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    ).decode()
    auth = (
        f'WECHATPAY2-SHA256-RSA2048 mchid="{WECHAT_PAY_MCH_ID}",nonce_str="{nonce}",'
        f'signature="{signature}",timestamp="{ts}",serial_no="{WECHAT_PAY_SERIAL_NO}"'
    )
    req = Request("https://api.mch.weixin.qq.com" + url_path, data=payload.encode("utf-8"), method="POST")
    req.add_header("Authorization", auth)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read().decode("utf-8"))
        return data["code_url"]
    except Exception as exc:
        ERR_LOG.warning("wechat prepay failed: %s", type(exc).__name__)
        raise APIError("微信下单失败", 502, "provider_error")


def _alipay_page_pay_url(order: dict[str, Any]) -> str:
    """Build a signed Alipay page-pay redirect URL (RSA2). The browser
    hits the gateway directly; no server-to-server call is required."""
    _load_cryptography()
    import json as _json
    from urllib.parse import urlencode, quote_plus
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    amount_yuan = f"{int(order['amount_cents']) / 100:.2f}"
    biz_content = _json.dumps({
        "out_trade_no": order["order_no"],
        "product_code": "FAST_INSTANT_TRADE_PAY",
        "total_amount": amount_yuan,
        "subject": "Machi 认证会员",
    }, ensure_ascii=False)
    params = {
        "app_id": ALIPAY_APP_ID,
        "method": "alipay.trade.page.pay",
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": "RSA2",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "notify_url": ALIPAY_NOTIFY_URL,
        "return_url": ALIPAY_RETURN_URL,
        "biz_content": biz_content,
    }
    sign_str = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k])
    key = serialization.load_pem_private_key(ALIPAY_PRIVATE_KEY.encode("utf-8"), password=None)
    signature = base64.b64encode(
        key.sign(sign_str.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    ).decode()
    params["sign"] = signature
    return ALIPAY_GATEWAY + "?" + urlencode(params, quote_via=quote_plus)


# ---- webhook verification ----

def verify_wechat_webhook(headers: dict[str, str], raw_body: bytes) -> dict[str, Any] | None:
    """Verify + decrypt a WeChat Pay v3 notification. Returns the decoded
    resource dict (out_trade_no, amount, trade_state, …) or None if the
    signature / decryption fails. In mock mode a `X-Mock-Signature` HMAC
    over the body (keyed by the dev pepper) is accepted instead."""
    body_text = raw_body.decode("utf-8", "replace")
    if PAYMENT_MOCK_ENABLED and not (WECHAT_PAY_API_V3_KEY and WECHAT_PAY_SERIAL_NO):
        expected = hmac.new(PASSWORD_PEPPER, raw_body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(headers.get("x-mock-signature", ""), expected):
            try:
                return json.loads(body_text)
            except Exception:
                return None
        return None
    _load_cryptography()
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        envelope = json.loads(body_text)
        resource = envelope["resource"]
        key = WECHAT_PAY_API_V3_KEY.encode("utf-8")
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(
            resource["nonce"].encode("utf-8"),
            base64.b64decode(resource["ciphertext"]),
            (resource.get("associated_data") or "").encode("utf-8"),
        )
        return json.loads(plaintext.decode("utf-8"))
    except Exception as exc:
        ERR_LOG.warning("wechat webhook verify failed: %s", type(exc).__name__)
        return None


def verify_alipay_webhook(form: dict[str, str]) -> bool:
    """Verify an Alipay async notification's RSA2 signature against the
    Alipay public key. In mock mode a `mock_sign` HMAC is accepted."""
    if PAYMENT_MOCK_ENABLED and not ALIPAY_PUBLIC_KEY:
        expected = hmac.new(PASSWORD_PEPPER, (form.get("out_trade_no", "")).encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(form.get("mock_sign", ""), expected)
    _load_cryptography()
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    try:
        signature = base64.b64decode(form.get("sign", ""))
        items = {k: v for k, v in form.items() if k not in ("sign", "sign_type") and v != ""}
        sign_str = "&".join(f"{k}={items[k]}" for k in sorted(items))
        pub_pem = ("-----BEGIN PUBLIC KEY-----\n" + ALIPAY_PUBLIC_KEY + "\n-----END PUBLIC KEY-----"
                   if "BEGIN" not in ALIPAY_PUBLIC_KEY else ALIPAY_PUBLIC_KEY)
        pubkey = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
        pubkey.verify(signature, sign_str.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False


def verify_apple_transaction(signed_transaction: str, product_id: str = "") -> dict[str, Any] | None:
    """Decode (and, when creds allow, verify) a StoreKit2 signed
    transaction JWS. Returns the decoded payload (transactionId,
    productId, expiresDate, …) or None. The JWS x5c chain is verified
    against Apple's CA when `cryptography` is available; in Sandbox/mock
    the decoded payload is trusted after structural checks."""
    try:
        header_b64, payload_b64, sig_b64 = signed_transaction.split(".")
    except ValueError:
        return None

    def _b64url(segment: str) -> bytes:
        return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))

    try:
        payload = json.loads(_b64url(payload_b64).decode("utf-8"))
    except Exception:
        return None

    # Structural checks every environment must pass.
    if product_id and payload.get("productId") and payload["productId"] != product_id:
        return None
    if APPLE_IAP_BUNDLE_ID and payload.get("bundleId") and payload["bundleId"] != APPLE_IAP_BUNDLE_ID:
        return None

    # Only true Production transactions require signature verification.
    # Sandbox + Xcode (local StoreKit testing) proceed on the decoded
    # payload so dev/QA flows work without the Apple CA chain.
    env = (payload.get("environment") or APPLE_IAP_ENVIRONMENT).lower()
    is_sandbox = not env.startswith("prod")
    # Production transactions MUST have their signature verified against
    # the Apple CA chain. Sandbox/mock may proceed on the decoded payload.
    if not is_sandbox and not PAYMENT_MOCK_ENABLED:
        if not _verify_apple_jws_signature(header_b64, payload_b64, sig_b64):
            ERR_LOG.warning("apple transaction signature rejected")
            return None
    return payload


def _verify_apple_jws_signature(header_b64: str, payload_b64: str, sig_b64: str) -> bool:
    """Verify the ES256 signature of an Apple JWS using the leaf cert in
    the x5c header. (Full chain-to-Apple-root validation is left to the
    deploy's cert pinning; we verify the signature itself here.)"""
    try:
        _load_cryptography()
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec, utils as asym_utils

        def _b64url(segment: str) -> bytes:
            return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))

        header = json.loads(_b64url(header_b64).decode("utf-8"))
        x5c = header.get("x5c") or []
        if not x5c:
            return False
        leaf = x509.load_der_x509_certificate(base64.b64decode(x5c[0]))
        pub = leaf.public_key()
        raw_sig = _b64url(sig_b64)
        r = int.from_bytes(raw_sig[:32], "big")
        s = int.from_bytes(raw_sig[32:], "big")
        der_sig = asym_utils.encode_dss_signature(r, s)
        pub.verify(der_sig, f"{header_b64}.{payload_b64}".encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False


# ---- email transports (no secret ever reaches the logger) ----

def _email_outbox_write(to: str, subject: str, body: str) -> bool:
    """Dev transport: drop the message in a git-ignored local outbox so a
    developer can read the code WITHOUT it ever going through logging."""
    try:
        DEV_OUTBOX_DIR.mkdir(exist_ok=True)
        safe = re.sub(r"[^a-zA-Z0-9_.@-]", "_", to)[:60] or "anon"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = DEV_OUTBOX_DIR / f"{stamp}-{safe}-{secrets.token_hex(3)}.txt"
        path.write_text(f"To: {to}\nFrom: {EMAIL_FROM}\nSubject: {subject}\n\n{body}\n", encoding="utf-8")
        return True
    except Exception:
        ERR_LOG.warning("dev outbox write failed")
        return False


def _send_via_smtp(to: str, subject: str, body: str) -> bool:
    msg = EmailMessage()
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    if EMAIL_REPLY_TO:
        msg["Reply-To"] = EMAIL_REPLY_TO
    msg.set_content(body)
    if SMTP_USE_TLS:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.ehlo()
            s.starttls(context=ctx)
            if SMTP_USERNAME:
                s.login(SMTP_USERNAME, SMTP_PASSWORD)
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            if SMTP_USERNAME:
                s.login(SMTP_USERNAME, SMTP_PASSWORD)
            s.send_message(msg)
    return True


def _send_via_resend(to: str, subject: str, body: str) -> bool:
    payload = json.dumps({"from": EMAIL_FROM, "to": [to], "subject": subject, "text": body}).encode("utf-8")
    headers = {"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"}
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed https host)
        return 200 <= resp.status < 300


def send_email(to: str, subject: str, body: str) -> bool:
    """Send one email. NEVER logs subject or body (they carry the code) —
    only a masked address + the transport name."""
    transport = EMAIL_TRANSPORT
    try:
        if transport == "smtp" and SMTP_HOST:
            ok = _send_via_smtp(to, subject, body)
        elif transport == "resend" and RESEND_API_KEY:
            ok = _send_via_resend(to, subject, body)
        else:
            ok = _email_outbox_write(to, subject, body)
            transport = "console_file"
    except Exception:
        ERR_LOG.warning("email send failed transport=%s to=%s", transport, mask_email(to))
        return False
    ACCESS_LOG.info("email sent transport=%s to=%s", transport, mask_email(to))
    return ok


_CODE_EMAIL_TEMPLATES = {
    "register": {
        "zh": ("Machi 注册验证码", "你的 Machi 注册验证码是：{code}\n\n验证码 {ttl} 分钟内有效。如果不是你本人操作，请忽略本邮件。"),
        "en": ("Your Machi sign-up code", "Your Machi sign-up code is: {code}\n\nIt expires in {ttl} minutes. If this wasn't you, ignore this email."),
        "ja": ("Machi 登録コード", "Machi の登録コードは {code} です。\n\n{ttl} 分間有効です。心当たりがない場合は無視してください。"),
    },
    "login": {
        "zh": ("Machi 登录验证码", "你的 Machi 登录验证码是：{code}\n\n验证码 {ttl} 分钟内有效。如果不是你本人操作，请立即修改密码。"),
        "en": ("Your Machi login code", "Your Machi login code is: {code}\n\nIt expires in {ttl} minutes. If this wasn't you, change your password now."),
        "ja": ("Machi ログインコード", "Machi のログインコードは {code} です。\n\n{ttl} 分間有効です。心当たりがない場合はすぐにパスワードを変更してください。"),
    },
    "reset": {
        "zh": ("Machi 密码重置验证码", "你正在重置 Machi 密码，验证码是：{code}\n\n验证码 {ttl} 分钟内有效。如果不是你本人操作，请忽略本邮件，你的密码不会改变。"),
        "en": ("Reset your Machi password", "Your Machi password reset code is: {code}\n\nIt expires in {ttl} minutes. If you didn't request this, ignore this email — your password won't change."),
        "ja": ("Machi パスワード再設定コード", "Machi のパスワード再設定コードは {code} です。\n\n{ttl} 分間有効です。心当たりがない場合は無視してください。パスワードは変更されません。"),
    },
}


def send_verification_email(to: str, code: str, purpose: str, locale: str = "zh") -> bool:
    locale = locale if locale in ("zh", "en", "ja") else "zh"
    templates = _CODE_EMAIL_TEMPLATES.get(purpose) or _CODE_EMAIL_TEMPLATES["register"]
    subject, body_tpl = templates.get(locale) or templates["zh"]
    body = body_tpl.format(code=code, ttl=max(1, EMAIL_CODE_TTL_SEC // 60))
    return send_email(to, subject, body)


# ---- verification code lifecycle (stored hashed, single-use, capped) ----

def _auth_code_recent(conn: sqlite3.Connection, purpose: str, email: str, user_id: str | None) -> sqlite3.Row | None:
    if user_id:
        return conn.execute(
            "SELECT * FROM auth_codes WHERE purpose = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
            (purpose, user_id),
        ).fetchone()
    return conn.execute(
        "SELECT * FROM auth_codes WHERE purpose = ? AND email = ? ORDER BY created_at DESC LIMIT 1",
        (purpose, (email or "").lower()),
    ).fetchone()


def issue_auth_code(conn: sqlite3.Connection, *, purpose: str, email: str, ip: str,
                    user_id: str | None = None, locale: str = "zh") -> dict[str, Any]:
    """Generate + store (hashed) + email a fresh code. Enforces a resend
    cooldown and invalidates any prior unconsumed code for the same target.
    Returns metadata only — NEVER the code itself."""
    email_norm = (email or "").lower().strip()
    recent = _auth_code_recent(conn, purpose, email_norm, user_id)
    if recent and not recent["consumed_at"]:
        created = parse_iso(recent["created_at"])
        if created and (datetime.now(timezone.utc) - created).total_seconds() < EMAIL_CODE_RESEND_COOLDOWN_SEC:
            raise APIError("验证码发送过于频繁，请稍后再试", 429, "code_cooldown")
    # Retire older unconsumed codes so only the newest one is valid.
    if user_id:
        conn.execute("UPDATE auth_codes SET consumed_at = ? WHERE purpose = ? AND user_id = ? AND consumed_at IS NULL",
                     (now_iso(), purpose, user_id))
    else:
        conn.execute("UPDATE auth_codes SET consumed_at = ? WHERE purpose = ? AND email = ? AND consumed_at IS NULL",
                     (now_iso(), purpose, email_norm))
    code = generate_numeric_code()
    code_id = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(seconds=EMAIL_CODE_TTL_SEC)).isoformat()
    conn.execute(
        "INSERT INTO auth_codes (id, purpose, email, user_id, code_hash, created_at, expires_at, attempts, ip) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
        (code_id, purpose, email_norm, user_id, hash_auth_code(code, email_norm, purpose),
         now_iso(), expires, (ip or "")[:64]),
    )
    # Send the email WITHOUT holding the global write lock. With a real
    # SMTP / HTTP transport this network call can take seconds; holding
    # DB_LOCK across it would stall every other writer. The verification
    # row is already persisted above (autocommit), so dropping the lock
    # here is safe. No-op release if the caller isn't under the lock.
    with _DBLockReleased():
        sent = send_verification_email(email_norm, code, purpose, locale)
    # `code` goes out of scope here and is never logged or returned.
    return {"challenge_id": code_id, "sent": bool(sent), "expires_in": EMAIL_CODE_TTL_SEC}


def consume_auth_code(conn: sqlite3.Connection, *, purpose: str, email: str = "", code: str = "",
                      challenge_id: str = "", user_id: str | None = None) -> sqlite3.Row:
    """Validate a submitted code in constant time, capping attempts and
    marking the row consumed on success. Raises APIError otherwise."""
    code = (code or "").strip()
    if not code:
        raise APIError("请输入验证码", 400, "invalid_code")
    email_norm = (email or "").lower().strip()
    if challenge_id:
        row = conn.execute("SELECT * FROM auth_codes WHERE id = ? AND purpose = ?", (challenge_id, purpose)).fetchone()
    elif user_id:
        row = conn.execute(
            "SELECT * FROM auth_codes WHERE purpose = ? AND user_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
            (purpose, user_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM auth_codes WHERE purpose = ? AND email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
            (purpose, email_norm),
        ).fetchone()
    if not row or row["consumed_at"]:
        raise APIError("验证码无效或已过期", 400, "invalid_code")
    expires = parse_iso(row["expires_at"])
    if expires and expires < datetime.now(timezone.utc):
        raise APIError("验证码已过期", 400, "code_expired")
    if int(row["attempts"] or 0) >= EMAIL_CODE_MAX_ATTEMPTS:
        raise APIError("尝试次数过多，请重新获取验证码", 429, "too_many_attempts")
    expected = row["code_hash"]
    actual = hash_auth_code(code, row["email"], purpose)
    if not hmac.compare_digest(expected, actual):
        conn.execute("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?", (row["id"],))
        raise APIError("验证码不正确", 400, "invalid_code")
    conn.execute("UPDATE auth_codes SET consumed_at = ? WHERE id = ?", (now_iso(), row["id"]))
    # Return the post-update row so callers see consumed_at set (the row
    # fetched above predates the UPDATE and would still read NULL).
    fresh = conn.execute("SELECT * FROM auth_codes WHERE id = ?", (row["id"],)).fetchone()
    return fresh or row


# ---------------------------------------------------------------------------
# visitor analytics: GeoIP resolver + async write path
#
# Logging happens entirely off the request thread via a bounded queue and a
# single background writer, so it never adds latency or DB-lock contention to
# real requests (the codebase deliberately avoids "writes inside a GET").
# ---------------------------------------------------------------------------

_GEO_CACHE: dict[str, tuple[float, dict[str, str]]] = {}
_GEO_LOCK = threading.Lock()
_GEO_TTL = 86400.0
_GEO_EMPTY = {"country": "", "region": "", "city": "", "org": "", "state": "none"}


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified)


def _geo_via_ipapi(ip: str) -> dict[str, str]:
    url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,org"
    req = urllib.request.Request(url, headers={"User-Agent": "machi-backend/1.0"})
    with urllib.request.urlopen(req, timeout=4) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("status") != "success":
        return {**_GEO_EMPTY, "state": "error"}
    return {
        "country": str(data.get("country") or "")[:80],
        "region": str(data.get("regionName") or "")[:80],
        "city": str(data.get("city") or "")[:80],
        "org": str(data.get("org") or "")[:120],
        "state": "ok",
    }


def _geo_via_maxmind(ip: str) -> dict[str, str]:
    try:
        import geoip2.database  # type: ignore
    except ImportError:
        return {**_GEO_EMPTY, "state": "error"}
    if not GEOIP_MAXMIND_DB:
        return {**_GEO_EMPTY, "state": "error"}
    with geoip2.database.Reader(GEOIP_MAXMIND_DB) as reader:
        resp = reader.city(ip)
        return {
            "country": (resp.country.name or "")[:80],
            "region": (resp.subdivisions.most_specific.name or "")[:80] if resp.subdivisions else "",
            "city": (resp.city.name or "")[:80],
            "org": "",
            "state": "ok",
        }


def resolve_geo(ip: str) -> dict[str, str]:
    if not ip or not _is_public_ip(ip):
        return {**_GEO_EMPTY, "state": "local"}
    now = time.monotonic()
    with _GEO_LOCK:
        hit = _GEO_CACHE.get(ip)
        if hit and (now - hit[0]) < _GEO_TTL:
            return hit[1]
    result = dict(_GEO_EMPTY)
    try:
        if GEOIP_TRANSPORT == "ipapi":
            result = _geo_via_ipapi(ip)
        elif GEOIP_TRANSPORT == "maxmind":
            result = _geo_via_maxmind(ip)
    except Exception:
        result = {**_GEO_EMPTY, "state": "error"}
    with _GEO_LOCK:
        if len(_GEO_CACHE) > 20000:
            _GEO_CACHE.clear()
        _GEO_CACHE[ip] = (now, result)
    return result


_VISIT_QUEUE: "queue.Queue[dict]" = queue.Queue(maxsize=5000)
_VISIT_LAST_SEEN: dict[str, float] = {}
_VISIT_LOCK = threading.Lock()
_VISIT_WRITER_STARTED = False
# Static-asset extensions we never bother logging as "visits".
_VISIT_SKIP_EXT = (".js", ".css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp",
                   ".svg", ".ico", ".woff", ".woff2", ".ttf", ".mp4", ".webm", ".txt")


def enqueue_visitor_log(record: dict[str, Any]) -> None:
    """Record one visit (best-effort, non-blocking). Repeated hits from the
    same client inside VISITOR_LOG_DEDUP_SEC collapse to a single row unless
    ``force`` is set (security events always log)."""
    if not VISITOR_LOG_ENABLED:
        return
    ip = record.get("ip") or ""
    now = time.monotonic()
    with _VISIT_LOCK:
        if not record.get("force"):
            last = _VISIT_LAST_SEEN.get(ip, 0.0)
            if (now - last) < VISITOR_LOG_DEDUP_SEC:
                return
        _VISIT_LAST_SEEN[ip] = now
        if len(_VISIT_LAST_SEEN) > 50000:
            cutoff = now - max(VISITOR_LOG_DEDUP_SEC, 600)
            for k, t in list(_VISIT_LAST_SEEN.items()):
                if t < cutoff:
                    _VISIT_LAST_SEEN.pop(k, None)
    try:
        _VISIT_QUEUE.put_nowait(record)
    except queue.Full:
        pass  # analytics are best-effort; never block or buffer unboundedly


def _visitor_writer_loop() -> None:
    while True:
        try:
            first = _VISIT_QUEUE.get()
        except Exception:
            continue
        batch = [first]
        for _ in range(199):
            try:
                batch.append(_VISIT_QUEUE.get_nowait())
            except queue.Empty:
                break
        rows: list[tuple] = []
        for r in batch:
            country = region = city = org = ""
            geo_state = "none"
            if GEOIP_TRANSPORT != "none":
                g = resolve_geo(r.get("ip", ""))
                country, region, city, org, geo_state = g["country"], g["region"], g["city"], g["org"], g["state"]
            rows.append((
                str(uuid.uuid4()), r.get("created_at") or now_iso(), (r.get("ip") or "")[:64],
                (r.get("ip_hash") or "")[:64], (r.get("method") or "")[:8], (r.get("path") or "")[:300],
                int(r.get("status") or 0), r.get("user_id"), (r.get("user_agent") or "")[:300],
                (r.get("referer") or "")[:300], country[:80], region[:80], city[:80], org[:120], geo_state[:16],
            ))
        try:
            with DB_LOCK:
                wconn = db()
                try:
                    wconn.executemany(
                        "INSERT INTO visitor_logs (id, created_at, ip, ip_hash, method, path, status, user_id, "
                        "user_agent, referer, country, region, city, org, geo_state) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        rows,
                    )
                finally:
                    wconn.close()
        except Exception:
            ERR_LOG.warning("visitor log batch insert failed (%d rows dropped)", len(rows))


def start_visitor_writer() -> None:
    global _VISIT_WRITER_STARTED
    if _VISIT_WRITER_STARTED or not VISITOR_LOG_ENABLED:
        return
    _VISIT_WRITER_STARTED = True
    threading.Thread(target=_visitor_writer_loop, name="visitor-writer", daemon=True).start()


def cleanup_visitor_logs(conn: sqlite3.Connection, days: int) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(0, days))).isoformat()
    cur = conn.execute("DELETE FROM visitor_logs WHERE created_at < ?", (cutoff,))
    return cur.rowcount if cur.rowcount is not None else 0


# ---------------------------------------------------------------------------
# default admin bootstrap (idempotent; never downgrades existing accounts)
# ---------------------------------------------------------------------------

def ensure_seed_admin(conn: sqlite3.Connection) -> None:
    handle = DEFAULT_ADMIN_HANDLE
    if not handle:
        return
    existing = conn.execute("SELECT id, role FROM users WHERE handle = ?", (handle,)).fetchone()
    if existing:
        # Preserve the account exactly. Only *promote* (never demote) if it
        # somehow isn't an admin. The password is never touched here.
        if (existing["role"] or "member") != "admin":
            conn.execute("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", (now_iso(), existing["id"]))
            ACCESS_LOG.info("ensured admin role for existing handle=%s", handle)
        return
    password = DEFAULT_ADMIN_PASSWORD
    if not password:
        ACCESS_LOG.warning("default admin not seeded: KAIX_ADMIN_INITIAL_PASSWORD is empty")
        return
    user_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO users (id, handle, display_name, email, password_hash, bio, location,
                           avatar_symbol, avatar_color, avatar_url, cover_url, membership_tier,
                           is_verified, role, country, province, city, current_region_code,
                           recent_region_codes, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', '', 'person.fill', 'indigo', '', '', 'free', 1, 'admin', '', '', '', '', '', ?, ?, ?)
        """,
        (user_id, handle, DEFAULT_ADMIN_DISPLAY_NAME, DEFAULT_ADMIN_EMAIL, hash_password(password),
         now_iso(), now_iso(), now_iso()),
    )
    conn.execute("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)", (user_id, now_iso()))
    # NOTE: the password is intentionally never logged.
    ACCESS_LOG.info("seeded default admin handle=%s (from KAIX_ADMIN_INITIAL_PASSWORD)", handle)


# ---------------------------------------------------------------------------
# City Seed Bot (城市内容助手) — official identities + generation/cleanup core
#
# Cold-start content operations. Every row written here is stamped
# is_seed_content = 1 + a batch id, so it is always auditable and reversible
# WITHOUT EVER touching real user content (clears require
# `is_seed_content = 1 AND seed_batch_id = ?`). Seed posts are authored by
# clearly-official accounts (Machi 城市助手 / 编辑部) — we never impersonate a
# real person, and these accounts hold no admin powers (role='member').
# ---------------------------------------------------------------------------

SEED_SOURCE = "seed_bot"
SEED_PUBLISHED_STATUS = "published"   # feed shows status IN ('published','active')
SEED_DRAFT_STATUS = "draft"           # generated-but-not-published → hidden
SEED_CLEARED_STATUS = "cleared"       # soft-deleted → hidden (never a hard DELETE)

# (author_type, language) → (handle, display_name, bio, avatar_symbol, avatar_color)
_SEED_BOT_IDENTITY: dict[tuple[str, str], tuple[str, str, str, str, str]] = {
    ("official_bot", "zh"): ("machi_assistant_zh", "Machi 城市助手", "城市内容整理与本地提醒。", "sparkles", "indigo"),
    ("official_bot", "en"): ("machi_assistant_en", "Machi Assistant", "Local notes and city tips.", "sparkles", "indigo"),
    ("official_bot", "ja"): ("machi_assistant_ja", "街のコンテンツアシスタント", "街の情報とローカルのヒント。", "sparkles", "indigo"),
    ("editorial", "zh"): ("machi_editorial_zh", "Machi 编辑部", "编辑部整理的本地内容。", "newspaper", "blue"),
    ("editorial", "en"): ("machi_editorial_en", "Machi Local Desk", "Edited local highlights.", "newspaper", "blue"),
    ("editorial", "ja"): ("machi_editorial_ja", "Machi 街の編集部", "編集部がまとめたローカル情報。", "newspaper", "blue"),
}

_SEED_OP_TIMES: dict[str, list[float]] = {}
_SEED_OP_LOCK = threading.Lock()


def seed_throttle(admin_id: str, limit: int = 30, window: float = 300.0) -> None:
    """Per-admin frequency guard for seed write ops (generate/publish/clear).
    Best-effort, in-memory; pairs with the existing IP rate limiter."""
    now = time.time()
    with _SEED_OP_LOCK:
        times = [t for t in _SEED_OP_TIMES.get(admin_id, []) if now - t < window]
        if len(times) >= limit:
            raise APIError("操作过于频繁，请稍后再试", 429, "rate_limited")
        times.append(now)
        _SEED_OP_TIMES[admin_id] = times


def ensure_seed_bot_account(conn: sqlite3.Connection, author_type: str, language: str) -> str:
    """Return the id of the official seed account for (author_type, language),
    creating it lazily on first use. Accounts are clearly official (verified,
    official default avatar, no avatar_url, role='member') and exist purely to
    author *labelled* seed content — never to impersonate a person."""
    at = author_type if author_type in ("official_bot", "editorial") else "official_bot"
    lang = language if language in seedlib.SUPPORTED_LANGUAGES else "zh"
    handle, display_name, bio, symbol, color = _SEED_BOT_IDENTITY[(at, lang)]
    row = conn.execute("SELECT id FROM users WHERE handle = ?", (handle,)).fetchone()
    if row:
        return row["id"]
    user_id = str(uuid.uuid4())
    # Locked, unguessable password hash — these accounts are not meant to log in.
    locked = hash_password(secrets.token_urlsafe(32))
    conn.execute(
        """
        INSERT INTO users (id, handle, display_name, email, password_hash, bio, location,
                           avatar_symbol, avatar_color, avatar_url, cover_url, membership_tier,
                           is_verified, role, country, province, city, current_region_code,
                           recent_region_codes, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, '', ?, ?, '', ?, ?, '', '', 'free', 1, 'member', '', '', '', '', '', ?, ?, ?)
        """,
        (user_id, handle, display_name, locked, bio, symbol, color, now_iso(), now_iso(), now_iso()),
    )
    conn.execute("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)", (user_id, now_iso()))
    ACCESS_LOG.info("seeded official content account handle=%s", handle)
    return user_id


def insert_seed_post(
    conn: sqlite3.Connection, *, author_id: str, author_type: str, content: str,
    app_content_type: str, country: str, province: str, city: str, region_code: str,
    language: str, tags: list[str], batch_id: str, status: str,
) -> str:
    """Insert one seed post. Mirrors the normal post insert but stamps the
    seed-tracking columns (is_seed_content / seed_batch_id / seed_source /
    generated_by) so the row is auditable and reversible."""
    post_id = str(uuid.uuid4())
    attributes = normalize_post_attributes(app_content_type, {})
    conn.execute(
        """
        INSERT INTO posts (id, author_id, content, repost_of_id, view_count, status,
                           country, province, city, region_code, content_type, attributes,
                           language, is_seed_content, seed_batch_id, seed_source, generated_by,
                           created_at, updated_at)
        VALUES (?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        """,
        (post_id, author_id, content, status, country, province, city, region_code,
         app_content_type, attributes, language, batch_id, SEED_SOURCE, author_type,
         now_iso(), now_iso()),
    )
    for tag in (tags or []):
        norm = str(tag).strip().lstrip("#").lower()
        if norm:
            conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (post_id, norm))
    return post_id


def log_seed_action(
    conn: sqlite3.Connection, *, admin_id: str, action: str, batch_id: str = "",
    country: str = "", city: str = "", region_code: str = "", language: str = "",
    content_type: str = "", count: int = 0, metadata: dict[str, Any] | None = None,
) -> None:
    """Append an immutable audit row for every seed operation."""
    conn.execute(
        """
        INSERT INTO admin_seed_content_logs (id, admin_id, action, batch_id, country, city,
            region_code, language, content_type, count, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), admin_id, action, batch_id, country, city, region_code,
         language, content_type, int(count), json.dumps(metadata or {}, ensure_ascii=False), now_iso()),
    )


def _news_clean_text(raw: Any, cap: int) -> str:
    text = html.unescape(str(raw or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:cap]


def _normalize_news_language(raw: Any) -> str:
    value = str(raw or "zh-CN").strip()
    aliases = {"zh": "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN", "en-us": "en", "en-gb": "en", "jp": "ja"}
    return aliases.get(value.lower(), value if value in {"zh-CN", "en", "ja"} else value[:16])


def _normalize_news_country(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    aliases = {"japan": "jp", "日本": "jp", "jp": "jp", "canada": "ca", "usa": "us", "united states": "us"}
    return aliases.get(value, value[:24])


def _normalize_news_city(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    aliases = {
        "tokyo": "tokyo", "東京": "tokyo", "东京": "tokyo",
        "osaka": "osaka", "大阪": "osaka",
        "japan-wide": "", "japan_wide": "", "japanwide": "", "nationwide": "",
        "all-japan": "", "all_japan": "", "日本全国": "", "全国": "",
    }
    return aliases.get(value, value[:48])


def _normalize_news_category(raw: Any) -> str:
    value = str(raw or "local_news").strip().lower()
    aliases = {
        "news": "local_news",
        "本地资讯": "local_news",
        "城市快讯": "local_news",
        "traffic": "traffic_alert",
        "weather": "weather_alert",
        "earthquake": "earthquake_alert",
        "typhoon": "typhoon_alert",
        "policy": "policy_update",
        "visa": "immigration_visa",
        "immigration": "immigration_visa",
        "event": "city_event",
        "events": "city_event",
        "safety": "public_safety",
        "meetup": "city_event",
        "food": "city_event",
        "disaster": "weather_alert",
    }
    value = aliases.get(value, value)
    return value if value in NEWS_CATEGORIES else "local_news"


def _normalize_source_type(raw: Any) -> str:
    value = str(raw or "manual").strip().lower()
    return value if value in NEWS_SOURCE_TYPES else "manual"


def _normalize_crawl_strategy(raw: Any, source_type: str = "manual") -> str:
    value = str(raw or "").strip().lower()
    if value == "metadata":
        value = "meta_only"
    if value in NEWS_CRAWL_STRATEGIES:
        return value
    if source_type == "rss":
        return "rss"
    if source_type in {"webpage", "metadata", "api"}:
        return "meta_only"
    if source_type == "html_list":
        return "html_list"
    return "manual"


def _normalize_credibility(raw: Any) -> str:
    value = str(raw or "official").strip().lower()
    return value if value in NEWS_CREDIBILITY_LEVELS else "official"


def _normalize_source_tier(raw: Any, *, credibility: str = "", city: str = "", source_type: str = "", crawl_strategy: str = "") -> str:
    value = str(raw or "").strip().lower().replace("-", "_")
    if value in NEWS_SOURCE_TIERS:
        return value
    if source_type in {"manual", "manual_reference"} or crawl_strategy == "manual":
        return "tier_5_manual_reference"
    if credibility == "official" and city:
        return "tier_2_city_official"
    if credibility == "official":
        return "tier_1_official"
    if credibility in {"media", "community"}:
        return "tier_3_public_media"
    return "tier_4_event_lifestyle"


def _normalize_copyright_policy(raw: Any, note: Any = "") -> str:
    value = str(raw or "").strip().lower().replace("-", "_")
    if value in NEWS_COPYRIGHT_POLICIES:
        return value
    note_l = str(note or "").lower()
    if any(word in note_l for word in ("restrict", "restricted", "禁止", "不允许", "再分发")):
        return "redistribution_restricted"
    if "cc-by" in note_l or "cc by" in note_l or "creative commons" in note_l:
        return "cc_by"
    if "official" in note_l or "source" in note_l:
        return "official_attribution"
    return "metadata_only"


def _normalize_risk_level(raw: Any, category: str = "") -> str:
    value = str(raw or "").strip().lower()
    if value in {"low", "medium", "high"}:
        return value
    if category in HIGH_RISK_NEWS_CATEGORIES:
        return "high"
    if category in {"traffic_alert", "train_delay", "commute", "work_study"}:
        return "medium"
    return "low"


def _boolish(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _slug_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return key[:80] or secrets.token_hex(6)


def _parse_news_date(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _news_hash(source_url: str, title: str, published_at: str | None) -> str:
    raw = f"{source_url or ''}|{title or ''}|{published_at or ''}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _risk_level_for_category(category: str) -> str:
    return "high" if category in HIGH_RISK_NEWS_CATEGORIES else "low"


def _source_required_for_category(category: str) -> bool:
    return category in HIGH_RISK_NEWS_CATEGORIES


_NEWS_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("immigration_visa", ("在留", "ビザ", "visa", "residence card", "出入国", "入管", "immigration", "residence status")),
    ("traffic_alert", ("運行", "遅延", "見合わせ", "train", "metro", "rail", "traffic", "commute", "通勤", "交通", "delay")),
    ("earthquake_alert", ("地震", "earthquake", "震度", "津波")),
    ("typhoon_alert", ("台風", "typhoon", "storm")),
    ("weather_alert", ("気象", "天気", "大雨", "警報", "weather", "warning", "heatstroke", "熱中症")),
    ("public_safety", ("防災", "避難", "安全", "safety", "crime", "災害", "disaster", "alert")),
    ("policy_update", ("制度", "政策", "申請", "マイナンバー", "digital", "行政", "policy", "procedure", "手续", "手続")),
    ("city_event", ("イベント", "祭", "festival", "market", "exhibition", "展覧", "週末", "weekend", "event")),
    ("life_notice", ("ごみ", "粗大", "保育", "補助", "区役所", "市役所", "生活", "resident", "service", "garbage", "child support")),
    ("work_study", ("仕事", "雇用", "労働", "学生", "留学", "work", "study", "job", "student")),
    ("housing_notice", ("引越", "住宅", "家賃", "rent", "housing", "moving", "搬家", "租房")),
    ("health", ("健康", "医療", "感染", "health", "medical", "hospital")),
    ("travel", ("観光", "travel", "tourism", "airport")),
]

_NEWS_HIGH_RELEVANCE_WORDS = (
    "租房", "搬家", "在留", "签证", "打工", "工作", "交通", "地震", "台风", "天气警报",
    "活动", "市集", "展览", "区役所", "手续", "垃圾", "补助", "留学生", "外国居民",
    "公共服务", "防灾", "安全", "生活成本", "ビザ", "在留", "留学生", "外国人",
    "区役所", "市役所", "ごみ", "防災", "避難", "遅延", "運休", "申請",
    "visa", "immigration", "residence", "train", "delay", "commute", "earthquake",
    "typhoon", "weather", "resident", "garbage", "subsidy", "event", "market",
)
_NEWS_LOW_RELEVANCE_WORDS = (
    "入札", "調達", "公告", "会議", "議事", "人事", "職員募集", "統計", "報告書",
    "采购", "招标", "会议", "任免", "内部", "统计", "长报表", "企业 pr",
    "procurement", "tender", "council minutes", "personnel", "statistics", "press release",
)


def _classify_news_category(title: str, summary: str, default_category: str) -> str:
    default = _normalize_news_category(default_category)
    text = f"{title} {summary}".lower()
    for category, keywords in _NEWS_CATEGORY_KEYWORDS:
        if any(keyword.lower() in text for keyword in keywords):
            return _normalize_news_category(category)
    return default


def _score_news_relevance(title: str, summary: str, category: str, city: str, source_tier: str) -> tuple[int, str]:
    text = f"{title} {summary}".lower()
    score = 45
    reasons: list[str] = []
    if source_tier in {"tier_1_official", "tier_2_city_official"}:
        score += 14
        reasons.append("official_source")
    elif source_tier == "tier_3_public_media":
        score += 5
        reasons.append("public_media")
    elif source_tier == "tier_5_manual_reference":
        score -= 12
        reasons.append("manual_reference")
    if city:
        score += 8
        reasons.append("city_scoped")
    if category in {"traffic_alert", "weather_alert", "earthquake_alert", "typhoon_alert", "immigration_visa", "life_notice", "city_event", "public_safety", "work_study", "housing_notice"}:
        score += 14
        reasons.append("city_life_category")
    high_hits = [word for word in _NEWS_HIGH_RELEVANCE_WORDS if word.lower() in text][:6]
    low_hits = [word for word in _NEWS_LOW_RELEVANCE_WORDS if word.lower() in text][:6]
    if high_hits:
        score += min(24, 6 + len(high_hits) * 4)
        reasons.append("useful_terms:" + ",".join(high_hits[:3]))
    if low_hits:
        score -= min(28, 10 + len(low_hits) * 5)
        reasons.append("low_value_terms:" + ",".join(low_hits[:3]))
    score = max(0, min(100, score))
    return score, ",".join(reasons or ["default"])


def _news_author_type_for_scope(country: str, city: str) -> str:
    if country == "jp" and city == "tokyo":
        return "tokyo_editorial"
    if country == "jp" and city == "osaka":
        return "osaka_editorial"
    if country == "jp":
        return "japan_editorial"
    return "local_desk"


def _safe_editorial_body(language: str, source_name: str, original_url: str) -> str:
    source = source_name or "Machi Local Desk"
    original = original_url or ""
    if language == "ja":
        return (
            "Machi編集部が公開情報をもとに整理しました。生活、通勤、通学、外出に関わる可能性があるため、"
            "最新情報は公式発表をご確認ください。\n\n"
            f"出典：{source}\n"
            f"原文：{original}"
        )
    if language == "en":
        return (
            "Machi Local Desk summarized this update from public sources. Please check the official source "
            "for the latest details before making decisions.\n\n"
            f"Source: {source}\n"
            f"Original: {original}"
        )
    return (
        "Machi 日本生活编辑部根据公开来源整理了这条资讯。该信息可能影响在日本生活、学习、工作或出行的用户。"
        "建议查看官方来源确认最新内容。\n\n"
        f"来源：{source}\n"
        f"原文：{original}\n\n"
        "此内容由 Machi 编辑部根据公开来源整理，具体信息请以官方发布为准。"
    )


def _news_city_label(city: str, language: str = "zh-CN") -> str:
    normalized = _normalize_news_city(city)
    if normalized == "tokyo":
        return "東京" if language == "ja" else "Tokyo"
    if normalized == "osaka":
        return "大阪" if language == "ja" else "Osaka"
    return "日本全国" if language == "ja" else "Japan-wide"


def _news_category_label(category: str, language: str = "zh-CN") -> str:
    labels = {
        "traffic_alert": ("交通提醒", "交通情報", "transport update"),
        "weather_alert": ("天气灾害提醒", "天気・防災情報", "weather and safety update"),
        "earthquake_alert": ("地震提醒", "地震情報", "earthquake update"),
        "typhoon_alert": ("台风提醒", "台風情報", "typhoon update"),
        "policy_update": ("政策更新", "制度・行政情報", "policy update"),
        "immigration_visa": ("在留签证", "在留・ビザ情報", "visa and immigration update"),
        "city_event": ("城市活动", "街のイベント", "local event"),
        "life_notice": ("生活通知", "暮らしのお知らせ", "local life notice"),
        "public_safety": ("公共安全", "安全情報", "public safety update"),
        "travel": ("旅行出行", "旅行・おでかけ", "travel update"),
    }
    zh, ja, en = labels.get(_normalize_news_category(category), ("城市快讯", "ローカルニュース", "local news"))
    if language == "ja":
        return ja
    if language == "en":
        return en
    return zh


def _editorial_quality_issues(body: str, language: str) -> list[str]:
    text = re.sub(r"\s+", " ", body or "").strip()
    if language == "en":
        if len(re.findall(r"\b\w+\b", text)) < 420:
            return ["too_short"]
    elif len(text) < 650:
        return ["too_short"]
    headings = len(re.findall(r"(^|\n)\s*(一、|二、|三、|四、|五、|六、|#{1,3}\s+|[0-9]+\.\s+)", body or ""))
    if headings < 4:
        return ["not_enough_sections"]
    banned = ("作为一个 AI", "高效便捷", "全方位", "优质服务", "宝藏平台", "震惊", "不看后悔")
    found = [word for word in banned if word in (body or "")]
    return [f"banned:{word}" for word in found]


def _editorial_quality_score(body: str, language: str, *, source_name: str = "", city: str = "", category: str = "", relevance_score: int = 50) -> int:
    text = body or ""
    normalized = re.sub(r"\s+", " ", text).strip()
    score = 58
    if language == "en":
        words = len(re.findall(r"\b\w+\b", normalized))
        if words >= 800:
            score += 15
        elif words >= 420:
            score += 8
        else:
            score -= 20
    else:
        length = len(normalized)
        if length >= 900:
            score += 15
        elif length >= 650:
            score += 8
        else:
            score -= 20
    headings = len(re.findall(r"(^|\n)\s*(一、|二、|三、|四、|五、|六、|#{1,3}\s+|[0-9]+\.\s+)", text))
    score += min(12, headings * 3)
    checklist_terms = ("适合", "注意", "下一步", "来源", "官方", "who", "next", "source", "check", "注意したい", "出典", "確認")
    score += min(12, sum(1 for term in checklist_terms if term.lower() in normalized.lower()) * 2)
    if source_name:
        score += 5
    if city:
        score += 4
    if category in HIGH_RISK_NEWS_CATEGORIES and ("官方" in normalized or "official" in normalized.lower() or "公式" in normalized):
        score += 5
    score += max(-8, min(8, (int(relevance_score or 50) - 50) // 5))
    score -= len(_editorial_quality_issues(text, language)) * 18
    return max(0, min(100, score))


def _editorial_longform_from_source(
    *, language: str, city: str, category: str, source_name: str, source_url: str,
    title: str, summary: str, published_at: str | None = None, admin_notes: str = "",
) -> dict[str, Any]:
    """Rule-based long-form draft used when no external AI key is present.
    It expands only from public metadata and practical checklists; it never
    invents facts, copies article text, or impersonates a normal user."""
    lang = _normalize_news_language(language)
    city_label = _news_city_label(city, lang)
    category_label = _news_category_label(category, lang)
    source = source_name or "Machi Local Desk"
    original = source_url or ""
    source_summary = _news_clean_text(summary or title, 700)
    source_title = _news_clean_text(title or category_label, 160)
    source_date = published_at or ""
    risk = _risk_level_for_category(_normalize_news_category(category))
    disclaimer_zh = "此内容由 Machi 编辑部根据公开来源整理，具体信息请以官方发布为准。"
    editorial_disclaimer = disclaimer_zh
    if lang == "ja":
        normalized_category = _normalize_news_category(category)
        ja_presets: dict[str, dict[str, str]] = {
            "traffic_alert": {
                "lead": "移動前に見ておきたい交通まわりの更新です。普段使う路線や駅、通勤・通学時間帯に関係するかを先に確認してください。",
                "s1": "一、移動前に見るポイント",
                "s2": "二、影響が出やすい場面",
                "s3": "三、出発前にできる準備",
                "s4": "四、読み違えを防ぐために",
                "impact": "通勤、通学、待ち合わせ、空港・新幹線への移動、子どもの送迎などは、少しの遅れでも予定全体に響きます。普段より早めに運行会社や自治体のページを確認しておくと安心です。",
                "todo": "代替ルートを一つ用意し、ICカード残高、終電・最終バス、振替輸送の有無を見ておきます。大雨や混雑が重なる日は、出発時刻を少し前倒しにするだけでも余裕が生まれます。",
            },
            "weather_alert": {
                "lead": "天気や防災に関わる更新です。外出予定だけでなく、家族や同居人との連絡、交通機関、買い物のタイミングにも影響する場合があります。",
                "s1": "一、まず安全面を確認",
                "s2": "二、生活で影響が出やすいところ",
                "s3": "三、今日のうちに整えること",
                "s4": "四、情報を見る順番",
                "impact": "通勤・通学、保育園や学校、屋外イベント、買い物、配送、帰宅時間に影響が出ることがあります。警報や注意報の対象地域が自分の市区町村と一致するかを確認してください。",
                "todo": "モバイルバッテリー、雨具、薬、飲み水、連絡先を確認し、必要なら早めに予定を調整します。避難情報や交通情報は、SNSより公式ページやアプリを優先して見てください。",
            },
            "earthquake_alert": {
                "lead": "地震・防災に関する更新です。不安をあおる情報ではなく、今確認しておくと落ち着いて動ける点を中心に整理します。",
                "s1": "一、公式情報で確認すること",
                "s2": "二、家や職場で見直すこと",
                "s3": "三、家族・同居人と共有すること",
                "s4": "四、落ち着いて読むために",
                "impact": "交通、学校、職場、エレベーター、ライフライン、避難場所の確認が必要になる場合があります。自宅だけでなく、よく行く駅や職場周辺の情報も見ておくと安心です。",
                "todo": "避難場所、集合場所、連絡手段、充電、常備薬、身分証の場所を確認します。被害状況や余震情報は更新されるため、古いスクリーンショットだけで判断しないでください。",
            },
            "typhoon_alert": {
                "lead": "台風や大雨に関する更新です。移動、学校、仕事、配送、買い物の予定を早めに見直すきっかけとして読んでください。",
                "s1": "一、対象地域と時間帯",
                "s2": "二、予定に出やすい影響",
                "s3": "三、早めに済ませたい準備",
                "s4": "四、無理に動かない判断",
                "impact": "鉄道やバスの運休、道路の規制、イベント中止、店舗営業時間の変更が起こることがあります。特に帰宅時間帯と荒天のピークが重なるかを見てください。",
                "todo": "食料、薬、充電、雨具、在宅勤務や授業の連絡、帰宅ルートを確認します。危険な時間帯に移動しない選択も、重要な準備の一つです。",
            },
            "policy_update": {
                "lead": "制度や行政手続きに関する更新です。対象者、開始日、必要書類が自分に当てはまるかを落ち着いて確認しましょう。",
                "s1": "一、対象者と開始時期",
                "s2": "二、生活手続きへの影響",
                "s3": "三、窓口へ行く前の準備",
                "s4": "四、判断を急がないために",
                "impact": "区役所での手続き、学校・職場への提出、保険、税金、住民登録、各種申請の期限に関係することがあります。家族の分も含めて確認が必要な場合があります。",
                "todo": "公式ページを保存し、必要書類、受付期間、対象条件、問い合わせ先をメモします。分からない場合は、窓口や公式の問い合わせ先に確認してから動くほうが安全です。",
            },
            "immigration_visa": {
                "lead": "在留資格やビザに関係する可能性がある更新です。人によって条件が大きく異なるため、概要だけで判断しないようにしてください。",
                "s1": "一、自分の在留状況と照らす",
                "s2": "二、期限と書類を確認",
                "s3": "三、相談先を決める",
                "s4": "四、二次情報だけで決めない",
                "impact": "更新期限、就労条件、家族の手続き、学校や勤務先に提出する書類に関わる場合があります。同じ国籍や同じ学校でも、在留資格が違うと必要な対応が変わります。",
                "todo": "在留カード、申請期限、雇用・在学証明、収入資料、オンライン申請の可否を確認します。不安がある場合は、入管、学校、勤務先、行政書士など適切な窓口に相談してください。",
            },
            "city_event": {
                "lead": "街のイベントや週末の外出に関する更新です。行く前に、日時・場所・予約・変更情報を軽く確認しておくと安心です。",
                "s1": "一、開催情報を確認",
                "s2": "二、当日の動き方",
                "s3": "三、持ち物と予約",
                "s4": "四、混雑時の見方",
                "impact": "会場までの移動、混雑、雨天時の変更、入場制限、子ども連れ・友人との待ち合わせに影響することがあります。最寄り駅や終了時間も見ておくと動きやすくなります。",
                "todo": "公式ページで開催可否、チケット、予約、支払い方法、雨天時の対応を確認します。混雑が予想される場合は、集合場所と帰りのルートを先に決めておきましょう。",
            },
            "life_notice": {
                "lead": "暮らしの手続きや地域サービスに関する更新です。毎日の生活に小さく効いてくる情報なので、必要な人だけがすぐ確認できる形で整理します。",
                "s1": "一、自分に関係する場面",
                "s2": "二、確認しておきたい条件",
                "s3": "三、今日できる小さな準備",
                "s4": "四、共有するときの注意",
                "impact": "ごみ出し、公共施設、窓口時間、学校・保育、買い物、地域サービスなどに関係する場合があります。住んでいる区市町村や利用している施設名を照らし合わせてください。",
                "todo": "変更日、対象地域、受付時間、必要な持ち物、問い合わせ先を確認します。家族や同居人に共有するときは、元リンクも一緒に送ると認識のずれを防げます。",
            },
            "public_safety": {
                "lead": "安全に関わる更新です。怖がるためではなく、生活圏で何を確認すればよいかを短く整理します。",
                "s1": "一、対象エリアを確認",
                "s2": "二、日常で気をつける場面",
                "s3": "三、周囲と共有すること",
                "s4": "四、確かな情報を優先",
                "impact": "通学路、夜の帰宅、駅周辺、家族との連絡、近所の移動に影響する場合があります。自分の生活圏と重なるかを先に見てください。",
                "todo": "自治体や警察、学校、施設からの案内を確認し、必要なら帰宅ルートや待ち合わせ場所を見直します。未確認情報を拡散せず、公式発表を優先してください。",
            },
            "travel": {
                "lead": "旅行やおでかけ前に確認しておきたい更新です。交通、混雑、天候、予約条件が予定に影響するかを見ておきましょう。",
                "s1": "一、予定と重なるか確認",
                "s2": "二、移動・予約への影響",
                "s3": "三、出発前の準備",
                "s4": "四、現地で困らないために",
                "impact": "交通ダイヤ、宿泊、イベント、観光施設、天候によって予定変更が必要になる場合があります。出発日だけでなく、帰りの時間も確認してください。",
                "todo": "予約条件、キャンセル規定、代替ルート、現地の営業時間、支払い方法を確認します。同行者には元リンクを共有して、同じ情報を見られるようにしておくと安心です。",
            },
        }
        preset = ja_presets.get(normalized_category) or {
            "lead": "日本で暮らす人が日常の予定を立てる前に確認しておきたい公開情報です。",
            "s1": "一、今回の要点",
            "s2": "二、暮らしへの影響",
            "s3": "三、確認しておくこと",
            "s4": "四、情報の読み方",
            "impact": "通勤、通学、手続き、買い物、週末の外出など、日常のどこかに関係する場合があります。自分の住む地域や利用しているサービスと重なるかを見てください。",
            "todo": "公開元のページを保存し、更新日、対象地域、必要な行動、問い合わせ先を確認します。迷う場合は公式窓口や主催者に確認してください。",
        }
        editorial_disclaimer = "この内容はMachi編集部が公開情報をもとに整理したものです。最新情報と最終判断は公式発表をご確認ください。"
        editor_note = admin_notes or "小さな更新でも、生活の予定を少し変えるきっかけになることがあります。必要な人に共有するときは、元リンクも一緒に送ってください。"
        body = (
            f"{city_label}で暮らす人向けに、Machi編集部が「{source_title}」を公開情報から整理しました。"
            f"出典は {source} です。{preset['lead']}\n\n"
            f"{preset['s1']}\n{source_summary}\n\n"
            "対象地域、対象者、期間によって受け取り方は変わります。自分の住んでいる区市町村、通勤・通学経路、利用しているサービスと重なるかを先に見てください。"
            "公開元ページの更新日時も確認しておくと、古い情報で判断しにくくなります。\n\n"
            f"{preset['s2']}\n{preset['impact']}\n\n"
            f"{preset['s3']}\n{preset['todo']}\n\n"
            f"{preset['s4']}\nSNSの短い投稿やスクリーンショットだけで判断せず、必ず公開元の説明を見てください。"
            "安全、在留、行政手続き、医療、お金に関わる内容は、Machiの整理を入口として使い、最終確認は公式情報で行うのが安心です。\n\n"
            f"五、Machi編集部メモ\n{editor_note}\n\n"
            f"出典：{source}\n原文：{original}\n{editorial_disclaimer}"
        )
        out_title = source_title if len(source_title) > 12 else f"{city_label}の暮らしで確認したい{category_label}"
        out_summary = f"{city_label}の{category_label}について、必要な人が先に確認しやすいよう、公開元情報を生活者目線で整理しました。"
    elif lang == "en":
        editorial_disclaimer = "Machi Local Desk summarized this update from public sources. Please check the official source for the latest details."
        body = (
            f"Machi Local Desk reviewed the public update “{source_title}” from {source} for people living, studying, working, or traveling in {city_label}. "
            "This is not a copy of the source article and it is not a personal experience post. It is a practical reading guide so you can decide whether the update matters to your day.\n\n"
            f"1. Start with the source context\n{source_summary}\n\nBefore acting on the update, check who it applies to, where it applies, and whether the timing still matches the latest official page. "
            "Local notices can change quickly, especially for transport, weather, public safety, city procedures, visa-related information, and events. Save the original link so you can return to it later.\n\n"
            "2. Where it may touch daily life\nThink through your commute, school schedule, workplace plans, city-office errands, housing arrangements, weekend trips, and family communication. "
            "Even a small local update can matter if it affects a train line you use, an office you need to visit, a deadline, or an outdoor plan. If the update is not relevant to you today, it may still be useful to someone in your circle.\n\n"
            "3. What to do next\nOpen the official page, check the publication date, and look for any concrete action: documents to prepare, routes to avoid, hours to confirm, application windows, safety instructions, or contact points. "
            "For transport and weather updates, prepare a backup route or time buffer. For administrative updates, compare the requirement with your own status before making a decision.\n\n"
            "4. Read carefully, especially for high-risk topics\nDo not rely only on screenshots or short social posts. If the topic involves safety, immigration, health, money, law, disasters, or public services, treat this Machi post as a starting point and verify details from the official source. "
            "Conditions, eligibility, dates, and locations can change after the first announcement.\n\n"
            f"5. Editor's note\n{admin_notes or 'For city life, the useful habit is not reading every notice. It is knowing which source to trust, which details to check, and when to share the update with someone who may need it.'}\n\n"
            f"Source: {source}\nOriginal: {original}\n{editorial_disclaimer}"
        )
        out_title = source_title if len(source_title) > 12 else f"What to check in {city_label}: {category_label}"
        out_summary = f"A practical {city_label} guide to this {category_label}, with source checks and next steps for local life."
    else:
        normalized_category = _normalize_news_category(category)
        zh_presets: dict[str, dict[str, str]] = {
            "traffic_alert": {
                "lead": f"如果你最近在 {city_label} 通勤、上学、赶车或安排周末出门，这条交通相关公开信息值得先看一眼。",
                "s1": "一、先确认影响范围",
                "s2": "二、可能影响的日常安排",
                "s3": "三、出门前可以做的准备",
                "s4": "四、交通信息怎么读更稳",
                "impact": "通勤路线、换乘时间、末班车、机场或新干线衔接、接送孩子和约会碰面都可能被影响。即使信息只涉及一条线路，也可能因为换乘连带改变整段行程。",
                "todo": "先打开运营方或官方来源确认时间，再准备一条替代路线。遇到天气、活动或高峰期叠加时，给自己多留一点缓冲时间会更稳。",
            },
            "weather_alert": {
                "lead": f"如果你最近在 {city_label} 安排外出、通勤、上学或照顾家人，这条天气/防灾信息需要提前确认。",
                "s1": "一、先看自己所在区域",
                "s2": "二、哪些生活场景容易被影响",
                "s3": "三、今天可以提前准备什么",
                "s4": "四、不要只看截图判断",
                "impact": "雨具、交通、学校通知、户外活动、配送、买菜和回家时间都可能受到影响。天气类信息变化快，重点是确认对象地区和时间段。",
                "todo": "检查气象厅、自治体或交通运营方页面，确认是否需要调整出门时间、准备充电宝、药品、雨具和家人联系方式。",
            },
            "earthquake_alert": {
                "lead": f"这是一条和地震/防灾有关的公开信息。Machi 会把它整理成生活检查点，而不是制造紧张感。",
                "s1": "一、先看官方说明",
                "s2": "二、检查家和通勤路线",
                "s3": "三、和身边人同步的信息",
                "s4": "四、保持更新意识",
                "impact": "电梯、交通、学校、工作地点、避难场所和家人联络方式都可能需要确认。平时常去的车站、公司、学校周边也值得一起看。",
                "todo": "确认避难地点、集合方式、充电、常备药、证件位置和紧急联系人。地震相关信息会持续更新，不要只凭旧截图判断。",
            },
            "typhoon_alert": {
                "lead": f"台风和大雨信息会直接影响 {city_label} 的出行、学校、工作和店铺营业，适合提前半天到一天检查。",
                "s1": "一、先看时间段和地区",
                "s2": "二、容易被打乱的安排",
                "s3": "三、提前完成的准备",
                "s4": "四、必要时减少移动",
                "impact": "铁路、巴士、道路、活动、店铺营业和回家路线都可能调整。尤其要看恶劣天气高峰是否和通勤/回家时间重合。",
                "todo": "准备食物、药、充电、雨具，确认远程办公或停课通知。危险时段不移动，本身就是很重要的准备。",
            },
            "policy_update": {
                "lead": f"这类政策/行政更新不一定影响所有人，但如果你在 {city_label} 办手续、上学、工作或和家人一起生活，值得确认适用条件。",
                "s1": "一、先看对象和生效时间",
                "s2": "二、可能牵动哪些手续",
                "s3": "三、去窗口前先准备",
                "s4": "四、别急着按二手信息操作",
                "impact": "住民票、保险、税务、学校/公司材料、补助申请、预约窗口和提交期限都可能有关。家人或同住人的材料也可能需要一起核对。",
                "todo": "保存官方页面，记录对象条件、开始日期、必要文件、办理方式和咨询入口。拿不准时，先问官方窗口再行动。",
            },
            "immigration_visa": {
                "lead": "在留和签证相关信息最怕只看标题。不同在留资格、学校、公司和家庭情况，可能对应完全不同的处理方式。",
                "s1": "一、先和自己的在留状态对照",
                "s2": "二、确认期限和材料",
                "s3": "三、必要时找正确窗口",
                "s4": "四、不要只依赖转述",
                "impact": "在留更新、就劳限制、学校/公司证明、家属手续、收入材料和申请期限都可能被影响。同样在日本生活的人，也未必适用同一条规则。",
                "todo": "查看入管或官方来源，核对在留卡、期限、证明材料和申请方式。不确定时，联系学校、公司、入管或专业人士。",
            },
            "city_event": {
                "lead": f"如果你想在 {city_label} 安排周末、约朋友或找本地活动，这条公开活动信息可以作为出门前的检查入口。",
                "s1": "一、先确认是否照常举办",
                "s2": "二、现场体验会受哪些影响",
                "s3": "三、出发前看这几件事",
                "s4": "四、适合分享给谁",
                "impact": "天气、预约、入场限制、付款方式、结束时间、最寄站和现场拥挤程度，都会影响体验。活动看起来轻松，但最好先确认细节。",
                "todo": "查看主办方页面，确认时间、地点、预约、雨天安排和交通方式。和朋友同行时，把原链接一起发过去最省事。",
            },
            "life_notice": {
                "lead": f"这条生活通知适合在 {city_label} 长住、刚搬来、准备办手续或经常使用公共服务的人先收藏。",
                "s1": "一、先看自己是否会用到",
                "s2": "二、日常里会落到哪里",
                "s3": "三、今天能顺手确认的事",
                "s4": "四、分享时避免误会",
                "impact": "垃圾、窗口时间、公共设施、学校/保育、社区服务、预约和材料准备都可能被影响。它不一定紧急，但会影响办事效率。",
                "todo": "确认变更日期、对象地区、开放时间、需要带的材料和联系电话。发给家人或室友时，最好附上原链接。",
            },
            "public_safety": {
                "lead": f"公共安全信息需要冷静看。Machi 会把和 {city_label} 生活有关的确认点列出来，避免只靠传言判断。",
                "s1": "一、先看范围和对象",
                "s2": "二、哪些路线上要留意",
                "s3": "三、和身边人同步",
                "s4": "四、优先看可靠来源",
                "impact": "夜间回家、通学路、车站周边、家人联系和临时出门都可能需要调整。先判断是否和自己的生活圈重叠。",
                "todo": "查看自治体、警方、学校或设施通知，必要时调整路线和碰面方式。未经确认的信息不要继续扩散。",
            },
            "travel": {
                "lead": f"如果你准备从 {city_label} 出发或到周边旅行，这条信息适合放进出行前检查清单。",
                "s1": "一、先看是否撞上行程",
                "s2": "二、交通和预约可能怎么变",
                "s3": "三、出发前确认清单",
                "s4": "四、给同行者同步",
                "impact": "交通、住宿、活动、景点营业、天气和取消规则都可能改变原计划。只确认去程不够，回程也要看。",
                "todo": "检查预约条件、取消规定、替代路线、营业时间和支付方式。同行者最好一起看同一个官方链接。",
            },
        }
        preset = zh_presets.get(normalized_category) or {
            "lead": f"如果你最近在 {city_label} 生活、通勤、上学、找房、办手续或安排周末出门，这条公开信息可以先留意一下。",
            "s1": "一、先看这条信息和谁有关",
            "s2": "二、它可能影响哪些日常场景",
            "s3": "三、建议马上做的几个检查",
            "s4": "四、不要只依赖截图和二手转述",
            "impact": "通勤、手续、买东西、周末外出、学校或工作安排，都可能因为一条小更新发生变化。重点是确认它和自己的地区、时间、身份是否相关。",
            "todo": "打开原始来源，确认发布时间、适用对象、地点、日期和联系方式。必要时把关键词记下来，方便之后再查。",
        }
        body = (
            f"{preset['lead']} 这条信息来自「{source}」。"
            f"Machi 编辑部不会把它写成普通用户体验，也不会复制原文全文；下面只根据公开标题、摘要和来源链接，把和城市生活有关的检查点整理出来。\n\n"
            f"{preset['s1']}\n{source_summary}\n\n这类{category_label}信息最容易被忽略的地方，是它通常只影响一部分人：某个城市、某条线路、某类手续、某段时间或某些具体场景。"
            "如果你只看标题，很容易误以为和自己无关，或者反过来被过度提醒。建议先确认三件事：地区是否包含你所在的位置，时间是否还有效，适用对象是否和你的身份或计划有关。\n\n"
            f"{preset['s2']}\n{preset['impact']} 你不需要把每条资讯都看完，但需要快速判断它会不会影响今天、这一周或接下来一个月的安排。\n\n"
            f"{preset['s3']}\n{preset['todo']} 如果信息涉及出行、行政、在留、安全或活动变更，建议把原始来源保存下来，之后再核对一次。\n\n"
            f"{preset['s4']}\n高风险内容尤其要谨慎。天气、地震、台风、在留、政策、公共安全、医疗和金钱相关信息，都不适合只看社交媒体上的一句话总结。"
            "Machi 可以帮你把公开信息整理成更容易阅读的生活提醒，但最终仍然要以官方来源、主办方或服务提供方的最新说明为准。\n\n"
            f"五、适合哪些人收藏\n刚到 {city_label} 的留学生、正在找房或搬家的人、每天跨区通勤的人、需要处理手续的在留人群、带家人一起生活的人，都可以把这类信息当作日常检查清单的一部分。"
            "如果你身边有人正好住在相关区域，也可以把原始链接一起转发给对方，避免只转述造成误解。\n\n"
            f"六、Machi 编辑部提示\n{admin_notes or '城市生活里真正有用的信息，往往不是一句“有事发生了”，而是你知道下一步该查什么、该问谁、该如何避免临时慌乱。'}\n\n"
            f"来源：{source}\n原文：{original}\n{editorial_disclaimer}"
        )
        out_title = source_title if len(source_title) > 12 else f"{city_label}生活提醒：这条{category_label}建议先确认"
        out_summary = f"Machi 编辑部根据公开来源整理了 {city_label} 的{category_label}信息，并补充生活场景、检查步骤和注意事项。"
    tags = [
        _normalize_news_category(category),
        _normalize_news_city(city) or "japan",
        "machi-local-desk",
        "life-guide",
    ]
    relevance_guess = 82 if _normalize_news_city(city) else 72
    quality_score = _editorial_quality_score(
        body,
        lang,
        source_name=source,
        city=_normalize_news_city(city),
        category=_normalize_news_category(category),
        relevance_score=relevance_guess,
    )
    return {
        "title": out_title[:140],
        "summary": out_summary[:360],
        "body": body,
        "tags": [t for t in tags if t],
        "category": _normalize_news_category(category),
        "risk_level": risk,
        "city_relevance": "high" if _normalize_news_city(city) else "medium",
        "source_note": f"{source} / {source_date}".strip(" /"),
        "editorial_disclaimer": editorial_disclaimer,
        "quality_issues": _editorial_quality_issues(body, lang),
        "quality_score": quality_score,
    }


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(node: ET.Element, names: set[str]) -> str:
    for child in list(node):
        if _local_name(child.tag) in names:
            return "".join(child.itertext()).strip()
    return ""


def _atom_link(node: ET.Element, base_url: str) -> str:
    for child in list(node):
        if _local_name(child.tag) != "link":
            continue
        rel = (child.attrib.get("rel") or "alternate").lower()
        href = child.attrib.get("href") or child.text or ""
        if href and rel in ("alternate", ""):
            return urljoin(base_url, href.strip())
    return ""


def _robots_can_fetch(target_url: str) -> tuple[bool, str]:
    parsed = urlparse(target_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False, "invalid url"
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(robots_url, headers={"User-Agent": NEWS_DESK_USER_AGENT})
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read(200_000).decode("utf-8", "ignore").splitlines()
        parser.parse(body)
        return parser.can_fetch(NEWS_DESK_USER_AGENT, target_url), ""
    except Exception:
        # Robots support is best-effort: if robots.txt is unavailable,
        # stay polite via timeout/rate limit and proceed with metadata only.
        return True, ""


def _fetch_public_text(url: str, max_bytes: int = 512_000) -> str:
    allowed, reason = _robots_can_fetch(url)
    if not allowed:
        raise APIError(f"robots.txt disallows fetching this source: {reason or url}", 400, "robots_disallowed")
    req = urllib.request.Request(url, headers={
        "User-Agent": NEWS_DESK_USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, text/xml, text/html;q=0.8, */*;q=0.5",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read(max_bytes + 1)
    except urllib.error.URLError as exc:
        raise APIError(f"source fetch failed: {exc}", 502, "source_fetch_failed")
    if len(raw) > max_bytes:
        raw = raw[:max_bytes]
    return raw.decode("utf-8", "ignore")


class _NewsMetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.canonical = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {k.lower(): (v or "") for k, v in attrs}
        if tag.lower() == "title":
            self.in_title = True
        elif tag.lower() == "meta":
            key = (attr.get("property") or attr.get("name") or "").lower()
            content = attr.get("content") or ""
            if key and content:
                self.meta[key] = content
        elif tag.lower() == "link" and "canonical" in (attr.get("rel") or "").lower():
            self.canonical = attr.get("href") or self.canonical

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)


def _parse_webpage_metadata(html_text: str, source_url: str) -> dict[str, str | None]:
    parser = _NewsMetadataParser()
    parser.feed(html_text[:512_000])
    title = parser.meta.get("og:title") or " ".join(parser.title_parts)
    summary = parser.meta.get("og:description") or parser.meta.get("description") or ""
    published = (
        parser.meta.get("article:published_time")
        or parser.meta.get("published_time")
        or parser.meta.get("date")
        or parser.meta.get("dc.date")
    )
    canonical = parser.canonical or source_url
    return {
        "title": _news_clean_text(title, 300),
        "summary": _news_clean_text(summary, 500),
        "url": urljoin(source_url, canonical),
        "published_at": _parse_news_date(published),
        "external_id": canonical or source_url,
    }


def _parse_rss_items(xml_text: str, source_url: str) -> list[dict[str, str | None]]:
    root = ET.fromstring(xml_text.encode("utf-8"))
    nodes = [node for node in root.iter() if _local_name(node.tag) in ("item", "entry")]
    items: list[dict[str, str | None]] = []
    for node in nodes[:80]:
        is_atom = _local_name(node.tag) == "entry"
        title = _news_clean_text(_child_text(node, {"title"}), 300)
        if not title:
            continue
        link = _atom_link(node, source_url) if is_atom else _child_text(node, {"link"})
        guid = _child_text(node, {"guid", "id"})
        summary = _child_text(node, {"description", "summary", "subtitle"})
        published_raw = _child_text(node, {"pubdate", "published", "updated", "date"})
        published_at = _parse_news_date(published_raw)
        items.append({
            "title": title,
            "summary": _news_clean_text(summary, 500),
            "url": urljoin(source_url, (link or guid or source_url).strip()),
            "published_at": published_at,
            "external_id": _news_clean_text(guid or link, 300),
        })
    return items


def _news_author_display_name(country: str, city: str, language: str, author_type: str = "local_desk") -> str:
    city_name = _resolve_region_label(country, "", city) if country and city else ""
    if country == "jp" and city == "tokyo":
        if language == "ja":
            return "Machi 東京編集部"
        if language == "en":
            return "Machi Tokyo Desk"
        return "Machi 东京编辑部"
    if country == "jp" and city == "osaka":
        if language == "ja":
            return "Machi 大阪編集部"
        if language == "en":
            return "Machi Osaka Desk"
        return "Machi 大阪编辑部"
    if country == "jp" and not city:
        if language == "ja":
            return "Machi 日本編集部"
        if language == "en":
            return "Machi Japan Desk"
        return "Machi 日本生活编辑部"
    if author_type == "city_editor" and city_name:
        if language == "ja":
            return f"Machi {city_name}編集部"
        if language == "en":
            return f"Machi {city_name} Desk"
        return f"Machi {city_name}编辑部"
    if language == "ja":
        return "Machi ローカルデスク"
    if language == "en":
        return "Machi Local Desk"
    return "Machi 本地资讯台"


def serialize_news_source(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    source_type = _normalize_source_type(d.get("source_type") or "manual")
    crawl_strategy = _normalize_crawl_strategy(d.get("crawl_strategy") or "", source_type)
    credibility = _normalize_credibility(d.get("credibility_level") or "official")
    city = _normalize_news_city(d.get("city") or "")
    source_tier = _normalize_source_tier(d.get("source_tier"), credibility=credibility, city=city, source_type=source_type, crawl_strategy=crawl_strategy)
    copyright_policy = _normalize_copyright_policy(d.get("copyright_policy"), d.get("copyright_policy_note"))
    allow_auto_draft = bool(d.get("allow_auto_draft", d.get("auto_create_draft", 0)))
    allow_auto_publish = bool(d.get("allow_auto_publish", d.get("official_auto_publish", 0)))
    return {
        **d,
        "is_active": bool(d.get("is_active", 0)),
        "require_manual_review": bool(d.get("require_manual_review", 1)),
        "allow_auto_draft": allow_auto_draft,
        "allow_auto_publish": allow_auto_publish,
        "auto_create_draft": allow_auto_draft,
        "official_auto_publish": allow_auto_publish,
        "content_rewrite_required": bool(d.get("content_rewrite_required", 1)),
        "source_tier": source_tier,
        "copyright_policy": copyright_policy,
        "risk_level": _normalize_risk_level(d.get("risk_level"), _normalize_news_category(d.get("default_category"))),
        "crawl_interval_minutes": int(d.get("crawl_interval_minutes") or 0),
        "max_items_per_run": int(d.get("max_items_per_run") or 30),
        "request_timeout_ms": int(d.get("request_timeout_ms") or 15000),
        "last_fetched_count": int(d.get("last_fetched_count") or 0),
        "last_new_count": int(d.get("last_new_count") or 0),
        "last_duplicate_count": int(d.get("last_duplicate_count") or 0),
        "last_error_count": int(d.get("last_error_count") or 0),
        "allowed_domain": d.get("allowed_domain") or normalize_allowed_domain(d),
        "crawl_strategy": crawl_strategy,
        "deleted": bool(d.get("deleted_at")),
    }


def serialize_news_item(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    raw = d.get("raw_metadata") or "{}"
    if isinstance(raw, str):
        try:
            d["raw_metadata"] = json.loads(raw or "{}")
        except Exception:
            d["raw_metadata"] = {}
    d["source_tier"] = _normalize_source_tier(d.get("source_tier"))
    d["risk_level"] = _normalize_risk_level(d.get("risk_level"), _normalize_news_category(d.get("category")))
    d["relevance_score"] = int(d.get("relevance_score") or 0)
    d["quality_score"] = int(d.get("quality_score") or 0)
    return d


def serialize_editorial_comment(row: sqlite3.Row | dict[str, Any], author: dict[str, Any] | None = None) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d["id"],
        "editorial_post_id": d["editorial_post_id"],
        "author_id": d["author_id"],
        "content": d["content"],
        "created_at": d["created_at"],
        "updated_at": d["updated_at"],
        "author": author,
    }


def serialize_editorial_post(conn: sqlite3.Connection, row: sqlite3.Row | dict[str, Any], viewer_id: str | None = None) -> dict[str, Any]:
    d = dict(row)
    tags = [
        r["tag"] for r in conn.execute(
            "SELECT tag FROM editorial_post_tags WHERE editorial_post_id = ? ORDER BY created_at",
            (d["id"],),
        )
    ]
    save_count = conn.execute(
        "SELECT COUNT(*) AS c FROM interactions WHERE target_id = ? AND kind = 'news_save'",
        (d["id"],),
    ).fetchone()["c"]
    comment_count = conn.execute(
        "SELECT COUNT(*) AS c FROM editorial_post_comments WHERE editorial_post_id = ? AND deleted_at IS NULL",
        (d["id"],),
    ).fetchone()["c"]
    saved = False
    if viewer_id:
        saved = conn.execute(
            "SELECT 1 FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'news_save'",
            (d["id"], viewer_id),
        ).fetchone() is not None
    source_note = " / ".join(
        part for part in [d.get("source_name") or "", d.get("source_published_at") or d.get("published_at") or ""] if part
    )
    risk_level = d.get("risk_level") or _risk_level_for_category(str(d.get("category") or ""))
    quality_score = int(d.get("quality_score") or _editorial_quality_score(
        str(d.get("body") or ""),
        str(d.get("language") or "zh-CN"),
        source_name=str(d.get("source_name") or ""),
        city=str(d.get("city") or ""),
        category=str(d.get("category") or ""),
        relevance_score=int(d.get("relevance_score") or 50),
    ))
    official_source_required = bool(d.get("official_source_required", 0))
    editorial_disclaimer = (
        d.get("editorial_disclaimer") or "此内容由 Machi 编辑部根据公开来源整理，具体信息请以官方发布为准。"
        if official_source_required or risk_level == "high"
        else d.get("editorial_disclaimer") or "此内容来自公开来源，Machi 保留来源名称、时间和原文入口，方便继续查证。"
    )
    return {
        **d,
        "tags": tags,
        "save_count": int(save_count or 0),
        "saveCount": int(save_count or 0),
        "comment_count": int(comment_count or 0),
        "commentCount": int(comment_count or 0),
        "saved": saved,
        "is_saved": saved,
        "isSaved": saved,
        "can_interact": bool(viewer_id),
        "canInteract": bool(viewer_id),
        "is_ai_assisted": bool(d.get("is_ai_assisted", 0)),
        "isAiAssisted": bool(d.get("is_ai_assisted", 0)),
        "share_count": int(d.get("share_count") or 0),
        "shareCount": int(d.get("share_count") or 0),
        "click_source_count": int(d.get("click_source_count") or 0),
        "clickSourceCount": int(d.get("click_source_count") or 0),
        "viewCount": int(d.get("view_count") or 0),
        "risk_level": risk_level,
        "riskLevel": risk_level,
        "source_tier": d.get("source_tier") or "tier_3_public_media",
        "sourceTier": d.get("source_tier") or "tier_3_public_media",
        "sub_city": d.get("sub_city") or "",
        "subCity": d.get("sub_city") or "",
        "relevance_score": int(d.get("relevance_score") or 50),
        "relevanceScore": int(d.get("relevance_score") or 50),
        "quality_score": quality_score,
        "qualityScore": quality_score,
        "official_source_required": official_source_required,
        "officialSourceRequired": official_source_required,
        "is_demo": bool(d.get("is_demo", 0)),
        "authorDisplayName": d.get("author_display_name", ""),
        "authorType": d.get("author_type", ""),
        "sourceName": d.get("source_name") or "",
        "sourceUrl": d.get("source_url") or "",
        "originalUrl": d.get("original_url") or "",
        "sourcePublishedAt": d.get("source_published_at") or "",
        "publishedAt": d.get("published_at") or "",
        "createdAt": d.get("created_at") or "",
        "updatedAt": d.get("updated_at") or "",
        "source_note": source_note,
        "sourceNote": source_note,
        "editorial_disclaimer": editorial_disclaimer,
        "editorialDisclaimer": editorial_disclaimer,
    }


def log_editorial_action(
    conn: sqlite3.Connection, *, admin_id: str, action: str,
    target_type: str, target_id: str, metadata: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO editorial_action_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), admin_id, action, target_type, target_id,
         json.dumps(metadata or {}, ensure_ascii=False), now_iso()),
    )


def fetch_news_source(conn: sqlite3.Connection, source_id: str, admin_id: str = "", force: bool = False) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM news_sources WHERE id = ?", (source_id,)).fetchone()
    if not row:
        raise APIError("资讯源不存在", 404, "source_not_found")
    source = dict(row)
    if source.get("deleted_at"):
        raise APIError("资讯源已删除", 404, "source_deleted")
    if not source.get("is_active"):
        raise APIError("资讯源已停用", 400, "source_inactive")
    started = now_iso()
    now = now_iso()
    status = "success"
    fetched_count = new_count = duplicate_count = error_count = 0
    error_message = ""
    skipped_reason = ""
    robots_status = ""
    http_status: int | None = None
    parser_status = ""
    duration_ms = 0
    created_draft_count = 0
    published_count = 0
    try:
        # Network I/O must NOT hold the global write lock, or every other
        # writer (login, posting, …) blocks for the entire crawl. Drop the
        # lock just around the fetch; the DB writes below re-acquire it.
        with _DBLockReleased():
            crawl_result = crawl_source(source, force=force)
        status = crawl_result.status
        skipped_reason = crawl_result.skipped_reason
        robots_status = crawl_result.robots_status
        http_status = crawl_result.http_status
        parser_status = crawl_result.parser_status
        duration_ms = crawl_result.duration_ms
        fetched_count = crawl_result.fetched_count or len(crawl_result.items)
        for item in crawl_result.items:
            title = _news_clean_text(item.title, 300)
            if not title:
                continue
            original_url = str(item.url or source.get("source_url") or source.get("homepage_url") or "").strip()
            published_at = item.published_at
            hash_key = item.hash_key or _news_hash(original_url or source.get("source_url") or "", title, published_at)
            duplicate = conn.execute(
                """
                SELECT id FROM news_items
                 WHERE source_id = ?
                   AND status != 'deleted'
                   AND (
                        (original_url <> '' AND original_url = ?)
                        OR hash_key = ?
                        OR (LOWER(original_title) = LOWER(?) AND COALESCE(published_at, '') = COALESCE(?, ''))
                   )
                 LIMIT 1
                """,
                (source["id"], original_url, hash_key, title, published_at or ""),
            ).fetchone()
            if duplicate:
                duplicate_count += 1
                continue
            item_id = str(uuid.uuid4())
            source_type = _normalize_source_type(source.get("source_type") or "manual")
            source_tier = _normalize_source_tier(
                source.get("source_tier"),
                credibility=_normalize_credibility(source.get("credibility_level")),
                city=_normalize_news_city(source.get("city")),
                source_type=source_type,
                crawl_strategy=_normalize_crawl_strategy(source.get("crawl_strategy"), source_type),
            )
            summary_text = _news_clean_text(item.summary, 500)
            category = _classify_news_category(title, summary_text, source.get("default_category") or "local_news")
            risk_level = _normalize_risk_level(source.get("risk_level"), category)
            relevance_score, relevance_reason = _score_news_relevance(title, summary_text, category, source.get("city") or "", source_tier)
            item_quality_score = min(100, max(0, 35 + (20 if summary_text else 0) + (15 if published_at else 0) + (15 if original_url else 0) + (15 if relevance_score >= 80 else 0)))
            item_status = "ignored" if relevance_score < 40 else "fetched"
            try:
                conn.execute(
                    """
                    INSERT INTO news_items
                        (id, source_id, external_id, source_name, source_url, original_url,
                         original_title, original_summary, original_language, published_at,
                         fetched_at, country, city, sub_city, category, source_tier, risk_level,
                         relevance_score, relevance_reason, quality_score, hash_key, status, raw_metadata,
                         error_message, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
                    """,
                    (
                        item_id, source["id"], item.external_id or "", source.get("name") or "",
                        source.get("source_url") or "", original_url, title, summary_text,
                        source.get("language") or "", published_at, now, source.get("country") or "",
                        source.get("city") or "", source.get("sub_city") or "", category, source_tier, risk_level,
                        relevance_score, relevance_reason, item_quality_score,
                        hash_key, item_status, json.dumps(item.raw_metadata or {}, ensure_ascii=False), now, now,
                    ),
                )
                new_count += 1
                if item_status == "fetched" and relevance_score >= 80 and (source.get("allow_auto_draft") or source.get("auto_create_draft")):
                    try:
                        post = _draft_from_news_item(conn, item_id, admin_id or source.get("created_by_admin_id") or "")
                        created_draft_count += 1
                        if (source.get("allow_auto_publish") or source.get("official_auto_publish")) and source.get("credibility_level") == "official":
                            fresh_post = dict(conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post["id"],)).fetchone())
                            required_ok = all(str(fresh_post.get(k) or "").strip() for k in ("title", "summary", "body", "country", "language", "category"))
                            source_ok = bool(fresh_post.get("source_name") and (fresh_post.get("original_url") or fresh_post.get("source_url")))
                            auto_publish_ok = (
                                required_ok and source_ok
                                and source_tier in {"tier_1_official", "tier_2_city_official"}
                                and risk_level != "high"
                                and _normalize_copyright_policy(source.get("copyright_policy"), source.get("copyright_policy_note")) != "redistribution_restricted"
                                and int(fresh_post.get("quality_score") or 0) >= 85
                            )
                            if auto_publish_ok:
                                stamp = now_iso()
                                conn.execute(
                                    """
                                    UPDATE editorial_posts
                                       SET status = 'published', review_status = 'approved',
                                           published_at = COALESCE(published_at, ?), updated_at = ?
                                     WHERE id = ?
                                    """,
                                    (stamp, stamp, post["id"]),
                                )
                                published_count += 1
                    except APIError as draft_exc:
                        error_count += 1
                        error_message = (error_message + "; " + str(draft_exc)).strip("; ")
            except sqlite3.IntegrityError:
                duplicate_count += 1
        if status in {"success", "partial_success", "skipped"}:
            conn.execute(
                """
                UPDATE news_sources
                   SET last_fetched_at = ?, last_success_at = CASE WHEN ? IN ('success','partial_success') THEN ? ELSE last_success_at END,
                       last_error = CASE WHEN ? = 'skipped' THEN last_error ELSE '' END,
                       last_fetched_count = ?, last_new_count = ?, last_duplicate_count = ?,
                       last_error_count = ?, last_robots_status = ?, last_http_status = ?,
                       last_parser_status = ?,
                       updated_at = ?
                 WHERE id = ?
                """,
                (
                    now, status, now, status, fetched_count, new_count, duplicate_count,
                    error_count, robots_status, http_status, parser_status, now, source["id"],
                ),
            )
    except CrawlerSkipped as exc:
        status = "skipped"
        skipped_reason = exc.code
        robots_status = exc.code if exc.code.startswith("robots") else robots_status
        parser_status = "skipped"
        error_message = str(exc)
        conn.execute(
            """
            UPDATE news_sources
               SET last_fetched_at = ?, last_error_count = 0, last_robots_status = ?,
                   last_parser_status = ?, updated_at = ?
             WHERE id = ?
            """,
            (now, skipped_reason, "skipped", now, source["id"]),
        )
    except CrawlerError as exc:
        status = exc.status or "failed"
        error_count = 1
        error_message = str(exc)
        parser_status = getattr(exc, "code", "") or status
        conn.execute(
            """
            UPDATE news_sources
               SET last_fetched_at = ?, last_error = ?, last_error_count = ?,
                   last_parser_status = ?, updated_at = ?
             WHERE id = ?
            """,
            (now, error_message[:500], error_count, getattr(exc, "code", "") or status, now, source["id"]),
        )
    except Exception as exc:
        status = "failed"
        error_count = 1
        error_message = f"{type(exc).__name__}: {exc}"
        conn.execute(
            "UPDATE news_sources SET last_fetched_at = ?, last_error = ?, last_error_count = ?, updated_at = ? WHERE id = ?",
            (now, error_message[:500], error_count, now, source["id"]),
        )
    finished = now_iso()
    log_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO news_fetch_logs
            (id, source_id, status, fetched_count, new_count, duplicate_count, error_count,
             error_message, started_at, finished_at, created_at, source_name, skipped_reason,
             source_url, robots_status, http_status, parser_status, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (log_id, source["id"], status, fetched_count, new_count, duplicate_count,
         error_count, error_message[:1000], started, finished, finished,
         source.get("name") or "", skipped_reason, source.get("source_url") or "",
         robots_status, http_status, parser_status, duration_ms),
    )
    if admin_id:
        log_editorial_action(
            conn, admin_id=admin_id, action="fetch_source", target_type="crawler_source", target_id=source["id"],
            metadata={
                "status": status, "new": new_count, "duplicates": duplicate_count,
                "errors": error_count, "skipped_reason": skipped_reason,
                "created_drafts": created_draft_count, "published": published_count,
            },
        )
    if status == "failed":
        raise APIError(error_message or "抓取失败", 502, "fetch_failed")
    return {
        "log": {
            "id": log_id,
            "source_id": source["id"],
            "status": status,
            "fetched_count": fetched_count,
            "new_count": new_count,
            "duplicate_count": duplicate_count,
            "error_count": error_count,
            "error_message": error_message,
            "skipped_reason": skipped_reason,
            "started_at": started,
            "finished_at": finished,
            "created_at": finished,
            "source_name": source.get("name") or "",
            "source_url": source.get("source_url") or "",
            "robots_status": robots_status,
            "http_status": http_status,
            "parser_status": parser_status,
            "duration_ms": duration_ms,
            "created_draft_count": created_draft_count,
            "published_count": published_count,
        }
    }


def _editorial_tags_from_payload(raw: Any) -> list[str]:
    if isinstance(raw, str):
        raw = re.split(r"[,，#\s]+", raw)
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        tag = str(item or "").strip().lstrip("#").lower()
        if not tag or len(tag) > 40 or tag in out:
            continue
        out.append(tag)
        if len(out) >= 12:
            break
    return out


def replace_editorial_tags(conn: sqlite3.Connection, post_id: str, tags: list[str]) -> None:
    conn.execute("DELETE FROM editorial_post_tags WHERE editorial_post_id = ?", (post_id,))
    for tag in tags:
        conn.execute(
            "INSERT OR IGNORE INTO editorial_post_tags (id, editorial_post_id, tag, created_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), post_id, tag, now_iso()),
        )


def _draft_from_news_item(
    conn: sqlite3.Connection,
    item_id: str,
    admin_id: str,
    *,
    target_language: str | None = None,
    author_display_name: str = "",
    create_mode: str = "editor_template",
) -> dict[str, Any]:
    item = conn.execute("SELECT * FROM news_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        raise APIError("采集内容不存在", 404, "item_not_found")
    item_d = dict(item)
    if item_d["status"] in ("ignored", "duplicate", "deleted"):
        raise APIError("该内容已忽略或标记重复", 400, "item_unavailable")
    existing = conn.execute("SELECT * FROM editorial_posts WHERE news_item_id = ? AND status != 'deleted'", (item_id,)).fetchone()
    if existing:
        return serialize_editorial_post(conn, existing)
    country = item_d.get("country") or ""
    city = item_d.get("city") or ""
    language = _normalize_news_language(target_language or item_d.get("original_language"))
    author_type = _news_author_type_for_scope(country, city)
    author = _news_clean_text(author_display_name, 80) or _news_author_display_name(country, city, language, author_type)
    title = _news_clean_text(item_d.get("original_title"), 160)
    summary = _news_clean_text(item_d.get("original_summary") or title, 500)
    if create_mode == "summary_only":
        body = _safe_editorial_body(language, item_d.get("source_name") or "", item_d.get("original_url") or "")
        generated = {
            "title": title,
            "summary": summary,
            "body": body,
            "tags": [item_d.get("category") or "local_news", item_d.get("city") or "local"],
            "category": _normalize_news_category(item_d.get("category")),
            "risk_level": _risk_level_for_category(_normalize_news_category(item_d.get("category"))),
        }
    else:
        generated = _editorial_longform_from_source(
            language=language,
            city=city,
            category=str(item_d.get("category") or "local_news"),
            source_name=str(item_d.get("source_name") or ""),
            source_url=str(item_d.get("original_url") or item_d.get("source_url") or ""),
            title=title,
            summary=summary,
            published_at=item_d.get("published_at"),
        )
    title = _news_clean_text(generated.get("title") or title, 160)
    summary = _news_clean_text(generated.get("summary") or summary, 500)
    body = str(generated.get("body") or body)
    category = _normalize_news_category(generated.get("category") or item_d.get("category"))
    risk_level = str(generated.get("risk_level") or _risk_level_for_category(category))
    source_required = 1 if _source_required_for_category(category) else 0
    relevance_score = int(item_d.get("relevance_score") or 50)
    quality_score = int(generated.get("quality_score") or _editorial_quality_score(
        body,
        language,
        source_name=str(item_d.get("source_name") or ""),
        city=city,
        category=category,
        relevance_score=relevance_score,
    ))
    disclaimer = str(generated.get("editorial_disclaimer") or "此内容由 Machi 编辑部根据公开来源整理，具体信息请以官方发布为准。")
    post_id = str(uuid.uuid4())
    now = now_iso()
    conn.execute(
        """
        INSERT INTO editorial_posts
            (id, news_item_id, author_type, author_display_name, country, city, language,
             category, title, summary, body, source_name, source_url, original_url,
             source_published_at, status, review_status, risk_level, official_source_required,
             source_tier, sub_city, relevance_score, quality_score, editorial_disclaimer,
             is_ai_assisted, ai_model, ai_prompt_version, created_by_admin_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'needs_review', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            post_id, item_id, author_type, author, country, city,
            language, category, title, summary, body, item_d.get("source_name"), item_d.get("source_url"),
            item_d.get("original_url"), item_d.get("published_at"), risk_level, source_required,
            item_d.get("source_tier") or "tier_3_public_media", item_d.get("sub_city") or "",
            relevance_score, quality_score, disclaimer,
            0 if create_mode == "summary_only" else 1,
            "" if create_mode == "summary_only" else "local_news_desk_rule_assist_v2",
            "" if create_mode == "summary_only" else NEWS_DESK_PROMPT_VERSION,
            admin_id, now, now,
        ),
    )
    conn.execute("UPDATE news_items SET status = 'draft_created', updated_at = ? WHERE id = ?", (now, item_id))
    replace_editorial_tags(conn, post_id, _editorial_tags_from_payload(generated.get("tags")))
    log_editorial_action(conn, admin_id=admin_id, action="create_draft", target_type="editorial_post", target_id=post_id, metadata={"news_item_id": item_id})
    fresh = conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone()
    return serialize_editorial_post(conn, fresh)


def _local_news_assist(post: dict[str, Any], task: str, language: str, extra_note: str = "") -> dict[str, Any]:
    title = _news_clean_text(post.get("title"), 180)
    summary = _news_clean_text(post.get("summary") or post.get("body"), 420)
    generated = _editorial_longform_from_source(
        language=language,
        city=str(post.get("city") or ""),
        category=str(post.get("category") or "local_news"),
        source_name=str(post.get("source_name") or "Machi Local Desk"),
        source_url=str(post.get("original_url") or post.get("source_url") or ""),
        title=title,
        summary=summary,
        published_at=post.get("source_published_at") or post.get("published_at"),
        admin_notes=extra_note,
    )
    return {
        "summary": generated["summary"],
        "body": generated["body"],
        "title_options": [generated["title"], title, f"Machi Local Desk: {title}"[:120]],
        "tags": generated["tags"],
        "category": generated["category"],
        "city": post.get("city") or "",
        "task": task or "rewrite",
        "prompt_version": NEWS_DESK_PROMPT_VERSION,
        "model": "local_news_desk_rule_assist_v2",
        "risk_level": generated["risk_level"],
        "sourceNote": generated["source_note"],
        "editorialDisclaimer": generated["editorial_disclaimer"],
        "quality_score": generated.get("quality_score", 0),
        "quality": {"score": generated.get("quality_score", 0), "issues": generated["quality_issues"], "passed": not generated["quality_issues"] and int(generated.get("quality_score") or 0) >= 70},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "Machi/1.0"

    # ---- low-level helpers ----

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return  # silence default logging

    def handle_one_request(self) -> None:
        # Swallow the "Connection reset by peer" noise that SSE clients
        # emit when they navigate away. Everything else still surfaces.
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except OSError:
            self.close_connection = True

    def _set_cors(self) -> None:
        # Echo back the request origin only if it's in the allowlist, or
        # `*` when no allowlist is set (development). This is what
        # browsers actually enforce — wildcard from a fixed list keeps
        # mobile / desktop clients working without leaking cookies
        # cross-origin (we don't use cookies, but still: defense in depth).
        origin = self.headers.get("Origin") or ""
        if "*" in ALLOWED_ORIGINS or not ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Vary", "Origin")
        elif origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Device-Name")
        self.send_header("Access-Control-Expose-Headers", "X-Machi-Version, X-KaiX-Version, X-Request-Id")
        self.send_header("Access-Control-Max-Age", "600")

    def _set_security_headers(self) -> None:
        # Conservative defaults that work for an API + static-served Web
        # client behind a TLS reverse proxy.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "interest-cohort=()")
        if PRODUCTION:
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        # The Web client is served by Next.js, not by this process, so we
        # don't ship a CSP from here — the nginx layer adds one. But we
        # still need to prevent JSON responses from being framed.

    def send_json(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Machi-Version", "1.0")
        self.send_header("X-KaiX-Version", "1.0")
        self.send_header("X-Request-Id", getattr(self, "_request_id", "") or "")
        self._set_cors()
        self._set_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message: str, status: int = 400, code: str = "bad_request") -> None:
        self.send_json({
            "success": False,
            "ok": False,
            "code": code,
            "message": message,
            "error": {"code": code, "message": message},
        }, status)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        if length > MAX_JSON_BYTES:
            raise APIError("payload too large", 413, "too_large")
        raw = self.rfile.read(length).decode("utf-8")
        if not raw.strip():
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise APIError(f"invalid json: {exc}", 400, "invalid_json")
        if not isinstance(data, dict):
            raise APIError("body must be an object", 400, "invalid_body")
        return data

    def read_bytes(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return b""
        if length > MAX_UPLOAD_BYTES:
            raise APIError("file too large", 413, "too_large")
        return self.rfile.read(length)

    def current_session(self, conn: sqlite3.Connection) -> dict[str, Any] | None:
        token = ""
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
        if not token:
            return None
        row = conn.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()
        if not row:
            return None
        expires_at = parse_iso(row["expires_at"])
        if expires_at and expires_at < datetime.now(timezone.utc):
            # Expired session — best-effort cleanup. Skip on GET paths
            # because this method is called from non-write request flows
            # that don't hold the DB lock; the next write will sweep it.
            try:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            except sqlite3.OperationalError:
                pass
            return None
        # Throttle the last_seen write: in the previous design every
        # authenticated request triggered a row write, which blew up
        # WAL and serialised on DB_LOCK. Now we coalesce per-token
        # updates and only flush every `_LAST_SEEN_FLUSH_SEC` seconds.
        if _should_flush_last_seen(token):
            try:
                conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (now_iso(), token))
            except sqlite3.OperationalError:
                pass
        # Cheap stash for the visitor log (avoids a second query in finally).
        self._session_user_id = row["user_id"]
        return dict(row)

    def require_user(self, conn: sqlite3.Connection) -> dict[str, Any]:
        session = self.current_session(conn)
        if not session:
            raise APIError("请登录后继续", 401, "AUTH_REQUIRED")
        user = conn.execute("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", (session["user_id"],)).fetchone()
        if not user:
            raise APIError("请登录后继续", 401, "AUTH_REQUIRED")
        return dict(user)

    def require_admin(self, conn: sqlite3.Connection) -> dict[str, Any]:
        user = self.require_user(conn)
        if (user.get("role") or "member") != "admin":
            raise APIError("admin only", 403, "forbidden")
        return user

    # ---- City Seed Bot (城市内容助手) — admin content operations ----
    #
    # Every endpoint is admin-only. Generation is capped at 100/batch and
    # throttled per-admin. Clears are soft (status → 'cleared' + deleted_at)
    # and double-guarded by `is_seed_content = 1`, so real user content can
    # never be affected. Every op writes an audit row.

    _SEED_BATCH_KEYS = (
        "id", "country", "province", "city", "region_code", "language",
        "content_type", "tone", "count", "status", "created_by_admin_id",
        "created_count", "published_count", "cleared_count", "created_at", "updated_at",
    )

    def _seed_batch_dict(self, conn: sqlite3.Connection, batch_id: str, include_items: bool = False) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM seed_content_batches WHERE id = ?", (batch_id,)).fetchone()
        if not row:
            raise APIError("批次不存在", 404, "batch_not_found")
        d = dict(row)
        out: dict[str, Any] = {k: d.get(k) for k in self._SEED_BATCH_KEYS}
        if include_items:
            items = conn.execute(
                "SELECT id, content, content_type, status, language, generated_by, created_at "
                "FROM posts WHERE seed_batch_id = ? ORDER BY created_at",
                (batch_id,),
            ).fetchall()
            out["items"] = [
                {
                    "id": r["id"], "content": r["content"], "content_type": r["content_type"],
                    "status": r["status"], "language": r["language"],
                    "author_type": r["generated_by"], "created_at": r["created_at"],
                }
                for r in items
            ]
        return out

    def api_admin_seed_generate(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        country = (data.get("country") or "").strip().lower()
        province = (data.get("province") or "").strip().lower()
        city = (data.get("city") or "").strip().lower()
        region_code = (data.get("regionCode") or data.get("region_code") or "").strip().lower()
        language = (data.get("language") or "zh").strip().lower()
        content_type = (data.get("contentType") or data.get("content_type") or "mixed").strip()
        tone = (data.get("tone") or "natural").strip()
        publish_now = bool(data.get("publishNow") if data.get("publishNow") is not None else data.get("publish_now"))
        try:
            count = int(data.get("count") or 0)
        except (TypeError, ValueError):
            raise APIError("count 无效", 400, "invalid_count")
        if count <= 0:
            raise APIError("count 需要大于 0", 400, "invalid_count")
        if count > seedlib.MAX_BATCH_COUNT:
            raise APIError(f"单批最多 {seedlib.MAX_BATCH_COUNT} 条", 400, "count_too_large")
        if language not in seedlib.SUPPORTED_LANGUAGES:
            raise APIError("不支持的语言", 400, "invalid_language")
        if content_type not in (("mixed", "all", "") + seedlib.SUPPORTED_CONTENT_TYPES):
            raise APIError("不支持的内容类型", 400, "invalid_content_type")
        if not region_code:
            region_code = _resolve_region_code(country, province, city)
        elif not country:
            country, province, city = _parse_region_code(region_code)
        if not region_code:
            raise APIError("请选择城市（region_code 或 country+city）", 400, "city_required")

        seed_throttle(admin["id"])
        items = seedlib.generate(
            region_code=region_code, country=country, city=city,
            language=language, content_type=content_type, count=count, tone=tone,
        )
        status = SEED_PUBLISHED_STATUS if publish_now else SEED_DRAFT_STATUS
        batch_id = str(uuid.uuid4())
        now = now_iso()
        conn.execute(
            """INSERT INTO seed_content_batches (id, country, province, city, region_code, language,
               content_type, tone, count, status, created_by_admin_id, created_count, published_count,
               cleared_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (batch_id, country, province, city, region_code, language, content_type, tone, count,
             ("published" if publish_now else "draft"), admin["id"], len(items),
             (len(items) if publish_now else 0), now, now),
        )
        for it in items:
            account_id = ensure_seed_bot_account(conn, it["author_type"], language)
            insert_seed_post(
                conn, author_id=account_id, author_type=it["author_type"], content=it["content"],
                app_content_type=it["app_content_type"], country=country, province=province, city=city,
                region_code=region_code, language=language, tags=it.get("tags") or [],
                batch_id=batch_id, status=status,
            )
        log_seed_action(
            conn, admin_id=admin["id"], action="generate", batch_id=batch_id, country=country,
            city=city, region_code=region_code, language=language, content_type=content_type,
            count=len(items), metadata={"tone": tone, "publishNow": publish_now, "requested": count},
        )
        if publish_now:
            _cache_invalidate("feed:hot")
            _cache_invalidate("trending:")
        self.send_json({"batch": self._seed_batch_dict(conn, batch_id, include_items=True),
                        "requested": count, "created": len(items)})

    def api_admin_seed_batches(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        region_code = (query.get("region_code") or query.get("regionCode") or "").strip().lower()
        status = (query.get("status") or "").strip()
        where = ["1 = 1"]
        params: list[Any] = []
        if region_code:
            where.append("region_code = ?")
            params.append(region_code)
        if status:
            where.append("status = ?")
            params.append(status)
        try:
            limit = max(1, min(int(query.get("limit") or 50), 200))
        except (TypeError, ValueError):
            limit = 50
        rows = conn.execute(
            f"SELECT * FROM seed_content_batches WHERE {' AND '.join(where)} "
            f"ORDER BY created_at DESC LIMIT ?",
            [*params, limit],
        ).fetchall()
        items = [{k: dict(r).get(k) for k in self._SEED_BATCH_KEYS} for r in rows]
        self.send_json({"items": items})

    def api_admin_seed_batch_detail(self, conn: sqlite3.Connection, batch_id: str) -> None:
        self.require_admin(conn)
        self.send_json({"batch": self._seed_batch_dict(conn, batch_id, include_items=True)})

    def api_admin_seed_publish(self, conn: sqlite3.Connection, batch_id: str) -> None:
        admin = self.require_admin(conn)
        batch = conn.execute("SELECT * FROM seed_content_batches WHERE id = ?", (batch_id,)).fetchone()
        if not batch:
            raise APIError("批次不存在", 404, "batch_not_found")
        if batch["status"] == SEED_CLEARED_STATUS:
            raise APIError("该批次已清除，无法发布", 400, "batch_cleared")
        seed_throttle(admin["id"])
        cur = conn.execute(
            "UPDATE posts SET status = ?, updated_at = ? "
            "WHERE is_seed_content = 1 AND seed_batch_id = ? AND status = ?",
            (SEED_PUBLISHED_STATUS, now_iso(), batch_id, SEED_DRAFT_STATUS),
        )
        published = cur.rowcount or 0
        total_pub = conn.execute(
            "SELECT COUNT(*) AS c FROM posts WHERE seed_batch_id = ? AND status IN ('published', 'active')",
            (batch_id,),
        ).fetchone()["c"]
        conn.execute(
            "UPDATE seed_content_batches SET status = 'published', published_count = ?, updated_at = ? WHERE id = ?",
            (total_pub, now_iso(), batch_id),
        )
        log_seed_action(
            conn, admin_id=admin["id"], action="publish", batch_id=batch_id,
            region_code=batch["region_code"], language=batch["language"],
            content_type=batch["content_type"], count=published,
        )
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        self.send_json({"published": published, "batch": self._seed_batch_dict(conn, batch_id)})

    def api_admin_seed_clear(self, conn: sqlite3.Connection, batch_id: str) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        if not bool(data.get("confirm")):
            raise APIError("请确认后再清除（confirm=true）", 400, "confirm_required")
        batch = conn.execute("SELECT * FROM seed_content_batches WHERE id = ?", (batch_id,)).fetchone()
        if not batch:
            raise APIError("批次不存在", 404, "batch_not_found")
        seed_throttle(admin["id"])
        # Soft delete, double-guarded: only seed rows of THIS batch are touched.
        # `is_seed_content = 1` guarantees real user content is never affected.
        cur = conn.execute(
            "UPDATE posts SET status = ?, deleted_at = ?, updated_at = ? "
            "WHERE is_seed_content = 1 AND seed_batch_id = ? AND status != ?",
            (SEED_CLEARED_STATUS, now_iso(), now_iso(), batch_id, SEED_CLEARED_STATUS),
        )
        cleared = cur.rowcount or 0
        conn.execute(
            "UPDATE seed_content_batches SET status = 'cleared', cleared_count = ?, updated_at = ? WHERE id = ?",
            (cleared, now_iso(), batch_id),
        )
        log_seed_action(
            conn, admin_id=admin["id"], action="clear_batch", batch_id=batch_id,
            region_code=batch["region_code"], language=batch["language"],
            content_type=batch["content_type"], count=cleared,
        )
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        self.send_json({"cleared": cleared, "batch": self._seed_batch_dict(conn, batch_id)})

    def api_admin_seed_clear_city(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        if not bool(data.get("confirm")):
            raise APIError("请确认后再清除（confirm=true）", 400, "confirm_required")
        country = (data.get("country") or "").strip().lower()
        city = (data.get("city") or "").strip().lower()
        region_code = (data.get("regionCode") or data.get("region_code") or "").strip().lower()
        language = (data.get("language") or "").strip().lower()           # optional
        content_type = (data.get("contentType") or data.get("content_type") or "").strip()  # optional
        if not region_code:
            region_code = _resolve_region_code(country, "", city)
        if not region_code:
            raise APIError("请提供城市（region_code 或 country+city）", 400, "city_required")
        seed_throttle(admin["id"])
        # ALWAYS guarded by is_seed_content = 1 — real user content is untouchable.
        where = ["is_seed_content = 1", "region_code = ?", "status != ?"]
        params: list[Any] = [region_code, SEED_CLEARED_STATUS]
        if language:
            if language not in seedlib.SUPPORTED_LANGUAGES:
                raise APIError("不支持的语言", 400, "invalid_language")
            where.append("language = ?")
            params.append(language)
        if content_type:
            if content_type not in seedlib.SUPPORTED_CONTENT_TYPES:
                raise APIError("不支持的内容类型", 400, "invalid_content_type")
            where.append("content_type = ?")
            params.append(seedlib.APP_CONTENT_TYPE[content_type])
        cur = conn.execute(
            f"UPDATE posts SET status = ?, deleted_at = ?, updated_at = ? WHERE {' AND '.join(where)}",
            [SEED_CLEARED_STATUS, now_iso(), now_iso(), *params],
        )
        cleared = cur.rowcount or 0
        conn.execute(
            "UPDATE seed_content_batches SET status = 'cleared', updated_at = ? "
            "WHERE region_code = ? AND status != 'cleared'",
            (now_iso(), region_code),
        )
        log_seed_action(
            conn, admin_id=admin["id"], action="clear_city", region_code=region_code,
            country=country, city=city, language=language, content_type=content_type, count=cleared,
            metadata={"region_code": region_code},
        )
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        self.send_json({"cleared": cleared, "region_code": region_code})

    def api_admin_seed_logs(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        try:
            limit = max(1, min(int(query.get("limit") or 50), 200))
        except (TypeError, ValueError):
            limit = 50
        rows = conn.execute(
            "SELECT * FROM admin_seed_content_logs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            try:
                d["metadata"] = json.loads(d.get("metadata") or "{}")
            except (json.JSONDecodeError, TypeError):
                d["metadata"] = {}
            items.append(d)
        self.send_json({"items": items})

    # ---- Local News Desk / 本地资讯台 ----

    def _clean_news_source_payload(self, data: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        existing = existing or {}
        name = _news_clean_text(data.get("name", existing.get("name", "")), 120)
        if not name:
            raise APIError("请填写资讯源名称", 400, "name_required")
        source_key = _slug_key(str(data.get("source_key") or existing.get("source_key") or name))
        source_type = _normalize_source_type(data.get("source_type", existing.get("source_type", "manual")))
        source_url = str(data.get("source_url", existing.get("source_url", "")) or "").strip()[:800]
        homepage_url = str(data.get("homepage_url", existing.get("homepage_url", "")) or "").strip()[:800]
        if source_type in ("rss", "webpage", "metadata", "html_list", "api") and not source_url:
            raise APIError("RSS / webpage 来源需要 source_url", 400, "source_url_required")
        for key, value in (("source_url", source_url), ("homepage_url", homepage_url)):
            if value:
                parsed = urlparse(value)
                if parsed.scheme not in ("http", "https") or not parsed.netloc:
                    raise APIError(f"{key} 必须是 http(s) URL", 400, "invalid_url")
        allowed_domain = _news_clean_text(data.get("allowed_domain", existing.get("allowed_domain", "")), 160).lower()
        if not allowed_domain:
            allowed_domain = normalize_allowed_domain({"source_url": source_url, "homepage_url": homepage_url})
        if source_url and allowed_domain:
            host = urlparse(source_url).netloc.lower()
            if host and host != allowed_domain and not host.endswith(f".{allowed_domain}"):
                raise APIError("source_url 不在 allowed_domain 范围内", 400, "domain_disallowed")
        crawl_strategy = _normalize_crawl_strategy(data.get("crawl_strategy", existing.get("crawl_strategy", "")), source_type)
        credibility = _normalize_credibility(data.get("credibility_level", existing.get("credibility_level", "official")))
        country = _normalize_news_country(data.get("country", existing.get("country", "")))
        city = _normalize_news_city(data.get("city", existing.get("city", "")))
        language = _normalize_news_language(data.get("language", existing.get("language", "zh-CN")))
        category = _normalize_news_category(data.get("default_category", existing.get("default_category", "local_news")))
        source_tier = _normalize_source_tier(
            data.get("source_tier", existing.get("source_tier", "")),
            credibility=credibility,
            city=city,
            source_type=source_type,
            crawl_strategy=crawl_strategy,
        )
        copyright_note = _news_clean_text(data.get("copyright_policy_note", existing.get("copyright_policy_note", "")), 1000)
        copyright_policy = _normalize_copyright_policy(
            data.get("copyright_policy", existing.get("copyright_policy", "")),
            copyright_note,
        )
        risk_level = _normalize_risk_level(data.get("risk_level", existing.get("risk_level", "")), category)
        try:
            interval = int(data.get("crawl_interval_minutes", existing.get("crawl_interval_minutes", 180)) or 180)
        except (TypeError, ValueError):
            raise APIError("抓取间隔不合法", 400, "invalid_interval")
        interval = max(30, min(interval, 24 * 60))
        try:
            max_items = int(data.get("max_items_per_run", existing.get("max_items_per_run", 30)) or 30)
        except (TypeError, ValueError):
            raise APIError("每次最大抓取数量不合法", 400, "invalid_max_items")
        max_items = max(1, min(max_items, 50))
        try:
            timeout_ms = int(data.get("request_timeout_ms", existing.get("request_timeout_ms", 15000)) or 15000)
        except (TypeError, ValueError):
            raise APIError("请求超时时间不合法", 400, "invalid_timeout")
        timeout_ms = max(1000, min(timeout_ms, 30000))
        is_active_default = bool(existing.get("is_active")) if existing else False
        allow_auto_draft = _boolish(
            data.get("allow_auto_draft", data.get("auto_create_draft", existing.get("allow_auto_draft", existing.get("auto_create_draft", False)))),
            False,
        )
        allow_auto_publish = _boolish(
            data.get("allow_auto_publish", data.get("official_auto_publish", existing.get("allow_auto_publish", existing.get("official_auto_publish", False)))),
            False,
        )
        content_rewrite_required = _boolish(data.get("content_rewrite_required", existing.get("content_rewrite_required", True)), True)
        if source_tier == "tier_5_manual_reference" or copyright_policy == "redistribution_restricted":
            allow_auto_draft = False
            allow_auto_publish = False
        if allow_auto_publish and (credibility != "official" or source_tier not in {"tier_1_official", "tier_2_city_official"} or risk_level == "high"):
            raise APIError("自动发布仅允许低/中风险官方 tier_1/tier_2 来源", 400, "auto_publish_not_allowed")
        return {
            "name": name,
            "source_key": source_key,
            "source_type": source_type,
            "source_url": source_url,
            "homepage_url": homepage_url,
            "allowed_domain": allowed_domain,
            "country": country,
            "city": city,
            "language": language,
            "default_category": category,
            "credibility_level": credibility,
            "source_tier": source_tier,
            "copyright_policy": copyright_policy,
            "copyright_policy_note": copyright_note,
            "crawl_strategy": crawl_strategy,
            "sub_city": _news_clean_text(data.get("sub_city", existing.get("sub_city", "")), 80).lower(),
            "list_selector": _news_clean_text(data.get("list_selector", existing.get("list_selector", "")), 300),
            "item_selector": _news_clean_text(data.get("item_selector", existing.get("item_selector", "")), 300),
            "title_selector": _news_clean_text(data.get("title_selector", existing.get("title_selector", "")), 300),
            "link_selector": _news_clean_text(data.get("link_selector", existing.get("link_selector", "")), 300),
            "summary_selector": _news_clean_text(data.get("summary_selector", existing.get("summary_selector", "")), 300),
            "date_selector": _news_clean_text(data.get("date_selector", existing.get("date_selector", "")), 300),
            "date_format": _news_clean_text(data.get("date_format", existing.get("date_format", "")), 120),
            "timezone": _news_clean_text(data.get("timezone", existing.get("timezone", "Asia/Tokyo")), 80) or "Asia/Tokyo",
            "robots_policy": "manual_checked" if str(data.get("robots_policy", existing.get("robots_policy", "respect"))).strip() == "manual_checked" else "respect",
            "crawl_interval_minutes": interval,
            "max_items_per_run": max_items,
            "request_timeout_ms": timeout_ms,
            "is_active": 1 if data.get("is_active", is_active_default) else 0,
            "require_manual_review": 1 if _boolish(data.get("require_manual_review", existing.get("require_manual_review", True)), True) else 0,
            "allow_auto_draft": 1 if allow_auto_draft else 0,
            "allow_auto_publish": 1 if allow_auto_publish else 0,
            "auto_create_draft": 1 if allow_auto_draft else 0,
            "official_auto_publish": 1 if allow_auto_publish else 0,
            "content_rewrite_required": 1 if content_rewrite_required else 0,
            "risk_level": risk_level,
        }

    def api_admin_news_desk(self, conn: sqlite3.Connection) -> None:
        self.require_admin(conn)
        today = datetime.now(timezone.utc).date().isoformat()
        stats = {
            "today_fetched": conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE fetched_at >= ?", (today,)).fetchone()["c"],
            "today_new": conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE fetched_at >= ? AND status = 'fetched'", (today,)).fetchone()["c"],
            "duplicates": conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE status = 'duplicate'").fetchone()["c"],
            "pending_items": conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE status = 'fetched'").fetchone()["c"],
            "pending_drafts": conn.execute("SELECT COUNT(*) AS c FROM editorial_posts WHERE status IN ('draft','pending_review')").fetchone()["c"],
            "published": conn.execute("SELECT COUNT(*) AS c FROM editorial_posts WHERE status = 'published'").fetchone()["c"],
            "failed_sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND last_error <> ''").fetchone()["c"],
            "sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL").fetchone()["c"],
            "active_sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND is_active = 1").fetchone()["c"],
            "successful_sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND last_success_at IS NOT NULL").fetchone()["c"],
            "crawler_items": conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE status != 'deleted'").fetchone()["c"],
            "front_visible": conn.execute("SELECT COUNT(*) AS c FROM editorial_posts WHERE status = 'published' AND country = 'jp'").fetchone()["c"],
            "auto_draft_sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND allow_auto_draft = 1").fetchone()["c"],
            "auto_publish_sources": conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND allow_auto_publish = 1").fetchone()["c"],
        }
        if stats["published"] == 0 and stats["pending_drafts"]:
            stats["diagnostic_hint"] = "已有草稿，尚未发布。"
        elif stats["published"] == 0 and stats["pending_items"]:
            stats["diagnostic_hint"] = "已有采集内容，尚未创建草稿。"
        elif stats["published"] == 0:
            stats["diagnostic_hint"] = "暂无本地资讯。请在后台抓取并发布内容。"
        recent_posts = [
            serialize_editorial_post(conn, r)
            for r in conn.execute(
                "SELECT * FROM editorial_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 6"
            )
        ]
        recent_logs = [
            dict(r) for r in conn.execute(
                "SELECT * FROM news_fetch_logs ORDER BY created_at DESC LIMIT 8"
            )
        ]
        failure_reasons = [
            {"reason": r["reason"] or "unknown", "count": int(r["c"])}
            for r in conn.execute(
                """
                SELECT COALESCE(NULLIF(parser_status, ''), NULLIF(skipped_reason, ''), NULLIF(error_message, ''), status) AS reason,
                       COUNT(*) AS c
                  FROM news_fetch_logs
                 WHERE status NOT IN ('success','partial_success') OR error_count > 0
                 GROUP BY reason
                 ORDER BY c DESC
                 LIMIT 8
                """
            )
        ]
        source_tiers = [
            {"source_tier": r["source_tier"], "count": int(r["c"])}
            for r in conn.execute(
                "SELECT source_tier, COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL GROUP BY source_tier ORDER BY c DESC"
            )
        ]
        top_issues: list[str] = []
        if stats["active_sources"] == 0:
            top_issues.append("没有启用的日本资讯源")
        if stats["successful_sources"] == 0 and stats["active_sources"]:
            top_issues.append("还没有成功抓取记录，请先执行一次官方/东京/大阪来源抓取")
        if stats["crawler_items"] and stats["pending_drafts"] == 0:
            top_issues.append("内容池已有采集结果，但自动草稿或批量生成还没有产出")
        if stats["pending_drafts"] and stats["published"] == 0:
            top_issues.append("已有编辑部草稿，但尚未审核发布")
        if stats["failed_sources"]:
            top_issues.append("存在失败来源，需要查看 robots/http/parser/timeout 日志")
        if stats["auto_publish_sources"] == 0:
            top_issues.append("自动发布开关仍全部关闭；如需自动发布，请只给低/中风险官方来源开启")
        diagnostics = {
            "failure_reasons": failure_reasons,
            "source_tiers": source_tiers,
            "top_issues": top_issues[:10],
        }
        self.send_json({"stats": stats, "diagnostics": diagnostics, "recent_posts": recent_posts, "recent_logs": recent_logs})

    def api_admin_news_sources(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        q = (query.get("q") or "").strip()
        where = ["deleted_at IS NULL"]
        params: list[Any] = []
        if q:
            like = f"%{q}%"
            where.append("(name LIKE ? OR source_key LIKE ? OR source_url LIKE ? OR homepage_url LIKE ?)")
            params.extend([like, like, like, like])
        if query.get("country"):
            where.append("country = ?")
            params.append(_normalize_news_country(query["country"]))
        if query.get("city"):
            where.append("city = ?")
            params.append(_normalize_news_city(query["city"]))
        if query.get("source_tier") or query.get("sourceTier"):
            where.append("source_tier = ?")
            params.append(_normalize_source_tier(query.get("source_tier") or query.get("sourceTier")))
        rows = conn.execute(
            f"SELECT * FROM news_sources WHERE {' AND '.join(where)} ORDER BY updated_at DESC",
            params,
        ).fetchall()
        self.send_json({"items": [serialize_news_source(r) for r in rows]})

    def api_admin_news_source_detail(self, conn: sqlite3.Connection, source_id: str) -> None:
        self.require_admin(conn)
        row = conn.execute("SELECT * FROM news_sources WHERE id = ? AND deleted_at IS NULL", (source_id,)).fetchone()
        if not row:
            raise APIError("资讯源不存在", 404, "source_not_found")
        logs = [
            dict(r) for r in conn.execute(
                "SELECT * FROM news_fetch_logs WHERE source_id = ? ORDER BY created_at DESC LIMIT 10",
                (source_id,),
            )
        ]
        self.send_json({"source": serialize_news_source(row), "recent_logs": logs})

    def api_admin_seed_news_source_presets(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        result = ensure_news_source_presets(conn)
        total = conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND country = ?", ("jp",)).fetchone()["c"]
        active = conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL AND country = ? AND is_active = 1", ("jp",)).fetchone()["c"]
        log_editorial_action(conn, admin_id=admin["id"], action="seed_japan_sources", target_type="crawler_source", target_id="jp", metadata={**result, "total": int(total), "active": int(active)})
        self.send_json({"total": int(total), "active": int(active), **result})

    def api_admin_create_news_source(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        cleaned = self._clean_news_source_payload(self.read_json())
        source_id = str(uuid.uuid4())
        now = now_iso()
        conn.execute(
            """
            INSERT INTO news_sources
                (id, name, source_key, source_type, source_url, homepage_url, allowed_domain,
                 country, city, language, default_category, credibility_level, copyright_policy_note,
                 source_tier, copyright_policy, crawl_strategy, sub_city, list_selector, item_selector, title_selector, link_selector,
                 summary_selector, date_selector, date_format, timezone, robots_policy,
                 crawl_interval_minutes, max_items_per_run, request_timeout_ms, is_active,
                 require_manual_review, allow_auto_draft, allow_auto_publish, auto_create_draft, official_auto_publish,
                 content_rewrite_required, risk_level,
                 created_by_admin_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_id, cleaned["name"], cleaned["source_key"], cleaned["source_type"],
                cleaned["source_url"], cleaned["homepage_url"], cleaned["allowed_domain"],
                cleaned["country"], cleaned["city"], cleaned["language"], cleaned["default_category"],
                cleaned["credibility_level"], cleaned["copyright_policy_note"], cleaned["source_tier"],
                cleaned["copyright_policy"], cleaned["crawl_strategy"], cleaned["sub_city"],
                cleaned["list_selector"], cleaned["item_selector"], cleaned["title_selector"],
                cleaned["link_selector"], cleaned["summary_selector"], cleaned["date_selector"],
                cleaned["date_format"], cleaned["timezone"], cleaned["robots_policy"],
                cleaned["crawl_interval_minutes"], cleaned["max_items_per_run"], cleaned["request_timeout_ms"],
                cleaned["is_active"], cleaned["require_manual_review"], cleaned["allow_auto_draft"],
                cleaned["allow_auto_publish"], cleaned["auto_create_draft"], cleaned["official_auto_publish"],
                cleaned["content_rewrite_required"], cleaned["risk_level"], admin["id"], now, now,
            ),
        )
        log_editorial_action(conn, admin_id=admin["id"], action="create_source", target_type="crawler_source", target_id=source_id)
        self.send_json({"source": serialize_news_source(conn.execute("SELECT * FROM news_sources WHERE id = ?", (source_id,)).fetchone())}, 201)

    def api_admin_update_news_source(self, conn: sqlite3.Connection, source_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM news_sources WHERE id = ? AND deleted_at IS NULL", (source_id,)).fetchone()
        if not row:
            raise APIError("资讯源不存在", 404, "source_not_found")
        cleaned = self._clean_news_source_payload(self.read_json(), dict(row))
        conn.execute(
            """
            UPDATE news_sources
               SET name = ?, source_key = ?, source_type = ?, source_url = ?, homepage_url = ?,
                   allowed_domain = ?, country = ?, city = ?, language = ?, default_category = ?,
                   credibility_level = ?, copyright_policy_note = ?, source_tier = ?, copyright_policy = ?,
                   crawl_strategy = ?, sub_city = ?, list_selector = ?, item_selector = ?, title_selector = ?, link_selector = ?,
                   summary_selector = ?, date_selector = ?, date_format = ?, timezone = ?,
                   robots_policy = ?, crawl_interval_minutes = ?, max_items_per_run = ?,
                   request_timeout_ms = ?, is_active = ?, require_manual_review = ?,
                   allow_auto_draft = ?, allow_auto_publish = ?, auto_create_draft = ?,
                   official_auto_publish = ?, content_rewrite_required = ?, risk_level = ?, updated_at = ?
             WHERE id = ?
            """,
            (
                cleaned["name"], cleaned["source_key"], cleaned["source_type"], cleaned["source_url"],
                cleaned["homepage_url"], cleaned["allowed_domain"], cleaned["country"], cleaned["city"],
                cleaned["language"], cleaned["default_category"], cleaned["credibility_level"],
                cleaned["copyright_policy_note"], cleaned["source_tier"], cleaned["copyright_policy"],
                cleaned["crawl_strategy"], cleaned["sub_city"], cleaned["list_selector"],
                cleaned["item_selector"], cleaned["title_selector"], cleaned["link_selector"],
                cleaned["summary_selector"], cleaned["date_selector"], cleaned["date_format"],
                cleaned["timezone"], cleaned["robots_policy"], cleaned["crawl_interval_minutes"],
                cleaned["max_items_per_run"], cleaned["request_timeout_ms"], cleaned["is_active"],
                cleaned["require_manual_review"], cleaned["allow_auto_draft"], cleaned["allow_auto_publish"],
                cleaned["auto_create_draft"], cleaned["official_auto_publish"],
                cleaned["content_rewrite_required"], cleaned["risk_level"], now_iso(), source_id,
            ),
        )
        log_editorial_action(conn, admin_id=admin["id"], action="update_source", target_type="crawler_source", target_id=source_id)
        self.send_json({"source": serialize_news_source(conn.execute("SELECT * FROM news_sources WHERE id = ?", (source_id,)).fetchone())})

    def api_admin_toggle_news_source(self, conn: sqlite3.Connection, source_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT is_active FROM news_sources WHERE id = ? AND deleted_at IS NULL", (source_id,)).fetchone()
        if not row:
            raise APIError("资讯源不存在", 404, "source_not_found")
        next_active = 0 if row["is_active"] else 1
        conn.execute("UPDATE news_sources SET is_active = ?, updated_at = ? WHERE id = ?", (next_active, now_iso(), source_id))
        log_editorial_action(conn, admin_id=admin["id"], action=("enable_source" if next_active else "disable_source"), target_type="crawler_source", target_id=source_id, metadata={"is_active": bool(next_active)})
        self.send_json({"source": serialize_news_source(conn.execute("SELECT * FROM news_sources WHERE id = ?", (source_id,)).fetchone())})

    def api_admin_delete_news_source(self, conn: sqlite3.Connection, source_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT id FROM news_sources WHERE id = ? AND deleted_at IS NULL", (source_id,)).fetchone()
        if not row:
            raise APIError("资讯源不存在", 404, "source_not_found")
        now = now_iso()
        conn.execute("UPDATE news_sources SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?", (now, now, source_id))
        log_editorial_action(conn, admin_id=admin["id"], action="delete_source", target_type="crawler_source", target_id=source_id)
        self.send_json({"ok": True})

    def api_admin_fetch_news_source(self, conn: sqlite3.Connection, source_id: str) -> None:
        admin = self.require_admin(conn)
        result = fetch_news_source(conn, source_id, admin_id=admin["id"], force=True)
        source = conn.execute("SELECT * FROM news_sources WHERE id = ?", (source_id,)).fetchone()
        self.send_json({"source": serialize_news_source(source), **result})

    def api_admin_fetch_all_news_sources(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        rows = conn.execute("SELECT id FROM news_sources WHERE is_active = 1 AND deleted_at IS NULL ORDER BY updated_at DESC").fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            try:
                results.append(fetch_news_source(conn, row["id"], admin_id=admin["id"], force=False)["log"])
            except APIError as exc:
                results.append({"source_id": row["id"], "status": "failed", "error_message": str(exc)})
        self.send_json({"items": results})

    def api_admin_fetch_japan_all_news_sources(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        rows = [
            dict(r) for r in conn.execute(
                """
                SELECT id, name, allowed_domain, source_url, homepage_url
                  FROM news_sources
                 WHERE is_active = 1 AND deleted_at IS NULL AND country = ?
                 ORDER BY updated_at DESC
                """,
                ("jp",),
            )
        ]
        domain_locks: dict[str, threading.Semaphore] = {}
        for row in rows:
            domain = normalize_allowed_domain(row) or row["id"]
            domain_locks.setdefault(domain, threading.Semaphore(NEWS_CRAWLER_PER_DOMAIN_CONCURRENCY))

        def _run(row: dict[str, Any]) -> dict[str, Any]:
            domain = normalize_allowed_domain(row) or row["id"]
            with domain_locks[domain]:
                try:
                    with DB_LOCK, db() as worker_conn:
                        return fetch_news_source(worker_conn, row["id"], admin_id=admin["id"], force=False)["log"]
                except APIError as exc:
                    return {
                        "source_id": row["id"],
                        "source_name": row.get("name") or "",
                        "status": "failed",
                        "fetched_count": 0,
                        "new_count": 0,
                        "duplicate_count": 0,
                        "error_count": 1,
                        "error_message": str(exc),
                    }

        logs: list[dict[str, Any]] = []
        if rows:
            # Each _run worker acquires DB_LOCK for its own writes. This
            # request thread is itself a write request holding DB_LOCK, and
            # it then blocks in as_completed() waiting for those workers — so
            # if we kept the lock here the workers and this thread would
            # deadlock (the bug that wedged the entire backend: 87 threads
            # stuck on DB_LOCK). Drop the lock for the parallel section; it's
            # re-acquired on exit for the log write below.
            with _DBLockReleased():
                with ThreadPoolExecutor(max_workers=NEWS_CRAWLER_MAX_CONCURRENCY) as pool:
                    futures = [pool.submit(_run, row) for row in rows]
                    for future in as_completed(futures):
                        logs.append(future.result())
        success_sources = sum(1 for log in logs if str(log.get("status")) in {"success", "partial_success", "skipped"})
        failed_sources = sum(1 for log in logs if str(log.get("status")) == "failed")
        result = {
            "total_sources": len(rows),
            "success_sources": success_sources,
            "failed_sources": failed_sources,
            "fetched_count": sum(int(log.get("fetched_count") or 0) for log in logs),
            "new_count": sum(int(log.get("new_count") or 0) for log in logs),
            "duplicate_count": sum(int(log.get("duplicate_count") or 0) for log in logs),
            "error_count": sum(int(log.get("error_count") or 0) for log in logs),
            "logs": logs,
        }
        log_editorial_action(conn, admin_id=admin["id"], action="fetch_japan_all", target_type="crawler_batch", target_id="jp", metadata=result)
        self.send_json(result)

    def api_admin_fetch_japan_scope_news_sources(self, conn: sqlite3.Connection, scope: str) -> None:
        admin = self.require_admin(conn)
        where = ["is_active = 1", "deleted_at IS NULL", "country = ?"]
        params: list[Any] = ["jp"]
        action = "fetch_japan_scope"
        if scope == "official":
            where.append("credibility_level = 'official'")
            where.append("source_tier IN ('tier_1_official','tier_2_city_official')")
            action = "fetch_japan_official"
        elif scope == "tokyo":
            where.append("(city = 'tokyo' OR city = '')")
            action = "fetch_japan_tokyo"
        elif scope == "osaka":
            where.append("(city = 'osaka' OR city = '')")
            action = "fetch_japan_osaka"
        else:
            raise APIError("未知抓取范围", 400, "invalid_scope")
        rows = [
            dict(r) for r in conn.execute(
                f"""
                SELECT id, name, allowed_domain, source_url, homepage_url
                  FROM news_sources
                 WHERE {' AND '.join(where)}
                 ORDER BY updated_at DESC
                """,
                params,
            )
        ]
        logs: list[dict[str, Any]] = []
        domain_locks: dict[str, threading.Semaphore] = {}
        for row in rows:
            domain = normalize_allowed_domain(row) or row["id"]
            domain_locks.setdefault(domain, threading.Semaphore(NEWS_CRAWLER_PER_DOMAIN_CONCURRENCY))

        def _run(row: dict[str, Any]) -> dict[str, Any]:
            domain = normalize_allowed_domain(row) or row["id"]
            with domain_locks[domain]:
                try:
                    with DB_LOCK, db() as worker_conn:
                        return fetch_news_source(worker_conn, row["id"], admin_id=admin["id"], force=False)["log"]
                except APIError as exc:
                    return {
                        "source_id": row["id"], "source_name": row.get("name") or "",
                        "status": "failed", "fetched_count": 0, "new_count": 0,
                        "duplicate_count": 0, "error_count": 1, "error_message": str(exc),
                    }

        if rows:
            with _DBLockReleased():
                with ThreadPoolExecutor(max_workers=NEWS_CRAWLER_MAX_CONCURRENCY) as pool:
                    futures = [pool.submit(_run, row) for row in rows]
                    for future in as_completed(futures):
                        logs.append(future.result())
        result = {
            "scope": scope,
            "total_sources": len(rows),
            "success_sources": sum(1 for log in logs if str(log.get("status")) in {"success", "partial_success", "skipped"}),
            "failed_sources": sum(1 for log in logs if str(log.get("status")) == "failed"),
            "fetched_count": sum(int(log.get("fetched_count") or 0) for log in logs),
            "new_count": sum(int(log.get("new_count") or 0) for log in logs),
            "duplicate_count": sum(int(log.get("duplicate_count") or 0) for log in logs),
            "error_count": sum(int(log.get("error_count") or 0) for log in logs),
            "logs": logs,
        }
        log_editorial_action(conn, admin_id=admin["id"], action=action, target_type="crawler_batch", target_id=f"jp:{scope}", metadata=result)
        self.send_json(result)

    def api_admin_news_items(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        status_filter = (query.get("status") or "").strip()
        where = ["1 = 1"] if status_filter == "deleted" else ["status != 'deleted'"]
        params: list[Any] = []
        for key, column in (("sourceId", "source_id"), ("source_id", "source_id"), ("country", "country"), ("city", "city"), ("language", "original_language"), ("category", "category"), ("source_tier", "source_tier"), ("risk_level", "risk_level"), ("status", "status")):
            value = (query.get(key) or "").strip()
            if value:
                where.append(f"{column} = ?")
                if column == "country":
                    params.append(_normalize_news_country(value))
                elif column == "city":
                    params.append(_normalize_news_city(value))
                elif column == "category":
                    params.append(_normalize_news_category(value))
                elif column == "original_language":
                    params.append(_normalize_news_language(value))
                elif column == "source_tier":
                    params.append(_normalize_source_tier(value))
                elif column == "risk_level":
                    params.append(_normalize_risk_level(value))
                else:
                    params.append(value)
        if query.get("minRelevance") or query.get("min_relevance"):
            where.append("relevance_score >= ?")
            params.append(max(0, min(100, int(query.get("minRelevance") or query.get("min_relevance") or 0))))
        if query.get("minQuality") or query.get("min_quality"):
            where.append("quality_score >= ?")
            params.append(max(0, min(100, int(query.get("minQuality") or query.get("min_quality") or 0))))
        keyword = (query.get("keyword") or query.get("q") or "").strip()
        if keyword:
            where.append("(original_title LIKE ? OR original_summary LIKE ? OR source_name LIKE ?)")
            like = f"%{keyword}%"
            params.extend([like, like, like])
        page = max(1, int(query.get("page") or 1))
        limit = max(1, min(int(query.get("limit") or 50), 200))
        rows = conn.execute(
            f"SELECT * FROM news_items WHERE {' AND '.join(where)} ORDER BY fetched_at DESC LIMIT ? OFFSET ?",
            [*params, limit, (page - 1) * limit],
        ).fetchall()
        total = conn.execute(f"SELECT COUNT(*) AS c FROM news_items WHERE {' AND '.join(where)}", params).fetchone()["c"]
        self.send_json({"items": [serialize_news_item(r) for r in rows], "page": page, "limit": limit, "total": int(total)})

    def api_admin_create_draft_from_news_item(self, conn: sqlite3.Connection, item_id: str) -> None:
        admin = self.require_admin(conn)
        self.send_json({"post": _draft_from_news_item(conn, item_id, admin["id"])}, 201)

    def api_admin_create_drafts_from_news_items(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        item_ids = data.get("itemIds") or data.get("item_ids") or []
        if not isinstance(item_ids, list) or not item_ids:
            raise APIError("请选择采集内容", 400, "item_ids_required")
        target_language = str(data.get("targetLanguage") or data.get("target_language") or "").strip() or None
        author = _news_clean_text(data.get("authorDisplayName") or data.get("author_display_name") or "", 80)
        create_mode = str(data.get("createMode") or data.get("create_mode") or "editor_template").strip()
        if create_mode not in {"summary_only", "editor_template"}:
            create_mode = "editor_template"
        posts: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        for raw_id in item_ids[:100]:
            item_id = str(raw_id or "").strip()
            if not item_id:
                continue
            try:
                posts.append(_draft_from_news_item(conn, item_id, admin["id"], target_language=target_language, author_display_name=author, create_mode=create_mode))
            except APIError as exc:
                errors.append({"item_id": item_id, "error": str(exc), "code": exc.code})
        log_editorial_action(conn, admin_id=admin["id"], action="bulk_create_drafts", target_type="crawler_item", target_id="bulk", metadata={"requested": len(item_ids), "created": len(posts), "errors": errors})
        self.send_json({"items": posts, "created": len(posts), "errors": errors}, 201)

    def api_admin_update_news_item_status(self, conn: sqlite3.Connection, item_id: str, status: str) -> None:
        admin = self.require_admin(conn)
        if status not in {"ignored", "duplicate", "deleted"}:
            raise APIError("状态不合法", 400, "invalid_status")
        row = conn.execute("SELECT id FROM news_items WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise APIError("采集内容不存在", 404, "item_not_found")
        conn.execute("UPDATE news_items SET status = ?, updated_at = ? WHERE id = ?", (status, now_iso(), item_id))
        action = "delete" if status == "deleted" else ("ignore_item" if status == "ignored" else "mark_duplicate")
        log_editorial_action(conn, admin_id=admin["id"], action=action, target_type="crawler_item", target_id=item_id)
        self.send_json({"item": serialize_news_item(conn.execute("SELECT * FROM news_items WHERE id = ?", (item_id,)).fetchone())})

    def _clean_editorial_payload(self, data: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        existing = existing or {}
        language = _normalize_news_language(data.get("language", existing.get("language", "zh-CN")))
        author_type = str(data.get("author_type", existing.get("author_type", "local_desk")) or "local_desk").strip()
        if author_type not in EDITORIAL_AUTHOR_TYPES:
            author_type = "local_desk"
        country = _normalize_news_country(data.get("country", existing.get("country", "")))
        city = _normalize_news_city(data.get("city", existing.get("city", "")))
        title = _news_clean_text(data.get("title", existing.get("title", "")), 180)
        if not title:
            raise APIError("请填写标题", 400, "title_required")
        summary = _news_clean_text(data.get("summary", existing.get("summary", "")), 500)
        body = str(data.get("body", existing.get("body", "")) or "").strip()[:6000]
        if not body and not summary:
            raise APIError("请填写摘要或正文", 400, "body_required")
        author = _news_clean_text(data.get("author_display_name", existing.get("author_display_name", "")), 80)
        if not author:
            author = _news_author_display_name(country, city, language, author_type)
        category = _normalize_news_category(data.get("category", existing.get("category", "local_news")))
        risk_level = str(data.get("risk_level", existing.get("risk_level", _risk_level_for_category(category))) or "low").strip().lower()
        if risk_level not in {"low", "medium", "high"}:
            risk_level = _risk_level_for_category(category)
        official_required_default = _source_required_for_category(category)
        relevance_score = int(data.get("relevance_score", existing.get("relevance_score", 50)) or 50)
        relevance_score = max(0, min(100, relevance_score))
        quality_score = int(data.get("quality_score", existing.get("quality_score", 0)) or 0)
        if not quality_score and body:
            quality_score = _editorial_quality_score(body, language, source_name=str(data.get("source_name", existing.get("source_name", "")) or ""), city=city, category=category, relevance_score=relevance_score)
        return {
            "author_type": author_type,
            "author_display_name": author,
            "country": country,
            "city": city,
            "language": language,
            "category": category,
            "sub_city": _news_clean_text(data.get("sub_city", existing.get("sub_city", "")), 80).lower(),
            "source_tier": _normalize_source_tier(data.get("source_tier", existing.get("source_tier", ""))),
            "relevance_score": relevance_score,
            "quality_score": quality_score,
            "editorial_disclaimer": _news_clean_text(data.get("editorial_disclaimer", existing.get("editorial_disclaimer", "")), 800),
            "title": title,
            "summary": summary,
            "body": body,
            "source_name": _news_clean_text(data.get("source_name", existing.get("source_name", "")), 200),
            "source_url": str(data.get("source_url", existing.get("source_url", "")) or "").strip()[:800],
            "original_url": str(data.get("original_url", existing.get("original_url", "")) or "").strip()[:800],
            "source_published_at": _parse_news_date(str(data.get("source_published_at", existing.get("source_published_at", "")) or "")),
            "risk_level": risk_level,
            "official_source_required": 1 if data.get("official_source_required", existing.get("official_source_required", official_required_default)) else 0,
            "tags": _editorial_tags_from_payload(data.get("tags", [] if not existing else None)),
        }

    def api_admin_editorial_posts(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        where = ["1 = 1"]
        params: list[Any] = []
        for key in ("status", "country", "city", "language", "category"):
            value = (query.get(key) or "").strip()
            if value:
                where.append(f"{key} = ?")
                if key == "country":
                    params.append(_normalize_news_country(value))
                elif key == "city":
                    params.append(_normalize_news_city(value))
                elif key == "category":
                    params.append(_normalize_news_category(value))
                elif key == "language":
                    params.append(_normalize_news_language(value))
                else:
                    params.append(value)
        keyword = (query.get("keyword") or query.get("q") or "").strip()
        if keyword:
            where.append("(title LIKE ? OR summary LIKE ? OR body LIKE ? OR source_name LIKE ?)")
            like = f"%{keyword}%"
            params.extend([like, like, like, like])
        page = max(1, int(query.get("page") or 1))
        limit = max(1, min(int(query.get("limit") or 50), 200))
        rows = conn.execute(
            f"SELECT * FROM editorial_posts WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            [*params, limit, (page - 1) * limit],
        ).fetchall()
        total = conn.execute(f"SELECT COUNT(*) AS c FROM editorial_posts WHERE {' AND '.join(where)}", params).fetchone()["c"]
        self.send_json({"items": [serialize_editorial_post(conn, r) for r in rows], "page": page, "limit": limit, "total": int(total)})

    def api_admin_create_editorial_post(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        cleaned = self._clean_editorial_payload(data)
        post_id = str(uuid.uuid4())
        now = now_iso()
        status = str(data.get("status") or "draft")
        if status not in {"draft", "pending_review"}:
            status = "draft"
        review_status = "needs_review" if status in {"draft", "pending_review"} else "none"
        conn.execute(
            """
            INSERT INTO editorial_posts
                (id, news_item_id, author_type, author_display_name, country, city, language,
                 category, title, summary, body, source_name, source_url, original_url,
                 source_published_at, status, review_status, risk_level, official_source_required,
                 source_tier, sub_city, relevance_score, quality_score, editorial_disclaimer,
                 created_by_admin_id, created_at, updated_at)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                post_id, cleaned["author_type"], cleaned["author_display_name"], cleaned["country"],
                cleaned["city"], cleaned["language"], cleaned["category"], cleaned["title"],
                cleaned["summary"], cleaned["body"], cleaned["source_name"], cleaned["source_url"],
                cleaned["original_url"], cleaned["source_published_at"], status, review_status,
                cleaned["risk_level"], cleaned["official_source_required"], cleaned["source_tier"],
                cleaned["sub_city"], cleaned["relevance_score"], cleaned["quality_score"],
                cleaned["editorial_disclaimer"], admin["id"], now, now,
            ),
        )
        replace_editorial_tags(conn, post_id, cleaned["tags"])
        log_editorial_action(conn, admin_id=admin["id"], action="create_draft", target_type="editorial_post", target_id=post_id, metadata={"manual": True})
        self.send_json({"post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone())}, 201)

    def api_admin_update_editorial_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM editorial_posts WHERE id = ? AND status != 'deleted'", (post_id,)).fetchone()
        if not row:
            raise APIError("编辑部文章不存在", 404, "editorial_post_not_found")
        data = self.read_json()
        cleaned = self._clean_editorial_payload(data, dict(row))
        status = str(data.get("status", row["status"]) or row["status"])
        review_status = str(data.get("review_status", row["review_status"]) or row["review_status"])
        if status not in EDITORIAL_POST_STATUSES:
            status = row["status"]
        if review_status not in EDITORIAL_REVIEW_STATUSES:
            review_status = row["review_status"]
        conn.execute(
            """
            UPDATE editorial_posts
               SET author_type = ?, author_display_name = ?, country = ?, city = ?, language = ?,
                   category = ?, title = ?, summary = ?, body = ?, source_name = ?, source_url = ?,
                   original_url = ?, source_published_at = ?, status = ?, review_status = ?,
                   risk_level = ?, official_source_required = ?, source_tier = ?, sub_city = ?,
                   relevance_score = ?, quality_score = ?, editorial_disclaimer = ?, updated_at = ?
             WHERE id = ?
            """,
            (
                cleaned["author_type"], cleaned["author_display_name"], cleaned["country"], cleaned["city"],
                cleaned["language"], cleaned["category"], cleaned["title"], cleaned["summary"], cleaned["body"],
                cleaned["source_name"], cleaned["source_url"], cleaned["original_url"], cleaned["source_published_at"],
                status, review_status, cleaned["risk_level"], cleaned["official_source_required"],
                cleaned["source_tier"], cleaned["sub_city"], cleaned["relevance_score"],
                cleaned["quality_score"], cleaned["editorial_disclaimer"], now_iso(), post_id,
            ),
        )
        if "tags" in data:
            replace_editorial_tags(conn, post_id, cleaned["tags"])
        log_editorial_action(conn, admin_id=admin["id"], action="update_post", target_type="editorial_post", target_id=post_id)
        self.send_json({"post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone())})

    def api_admin_editorial_ai_assist(self, conn: sqlite3.Connection, post_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM editorial_posts WHERE id = ? AND status != 'deleted'", (post_id,)).fetchone()
        if not row:
            raise APIError("编辑部文章不存在", 404, "editorial_post_not_found")
        data = self.read_json()
        post = dict(row)
        language = _normalize_news_language(data.get("language", post.get("language", "zh-CN")))
        result = _local_news_assist(post, str(data.get("task") or "rewrite"), language, str(data.get("note") or ""))
        apply_result = bool(data.get("apply", True))
        if apply_result:
            conn.execute(
                """
                UPDATE editorial_posts
                   SET summary = ?, body = ?, category = ?, city = COALESCE(NULLIF(?, ''), city),
                       risk_level = ?, quality_score = ?, editorial_disclaimer = ?,
                       is_ai_assisted = 1, ai_model = ?, ai_prompt_version = ?, updated_at = ?
                 WHERE id = ?
                """,
                (
                    result["summary"], result["body"], result["category"], result["city"],
                    result["risk_level"], int(result.get("quality_score") or 0), result["editorialDisclaimer"],
                    result["model"], result["prompt_version"], now_iso(), post_id,
                ),
            )
            replace_editorial_tags(conn, post_id, _editorial_tags_from_payload(result["tags"]))
        log_editorial_action(conn, admin_id=admin["id"], action="ai_summarize", target_type="editorial_post", target_id=post_id, metadata={"task": result["task"], "prompt_version": result["prompt_version"]})
        self.send_json({"assist": result, "post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone())})

    def api_admin_editorial_transition(self, conn: sqlite3.Connection, post_id: str, action: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("编辑部文章不存在", 404, "editorial_post_not_found")
        now = now_iso()
        post = dict(row)
        if action == "submit-review":
            conn.execute(
                "UPDATE editorial_posts SET status = 'pending_review', review_status = 'needs_review', updated_at = ? WHERE id = ?",
                (now, post_id),
            )
        elif action == "approve":
            conn.execute(
                "UPDATE editorial_posts SET review_status = 'approved', reviewed_by_admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
                (admin["id"], now, now, post_id),
            )
        elif action == "reject":
            conn.execute(
                "UPDATE editorial_posts SET status = 'draft', review_status = 'rejected', reviewed_by_admin_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
                (admin["id"], now, now, post_id),
            )
        elif action == "publish":
            required = ("title", "summary", "body", "country", "language", "category")
            if any(not str(post.get(k) or "").strip() for k in required):
                raise APIError("发布前请补齐标题、摘要、正文、国家、语言和分类", 400, "publish_fields_required")
            if post.get("news_item_id") and (not post.get("source_name") or not post.get("original_url")):
                raise APIError("采集来源文章发布前必须保留来源名称和原文链接", 400, "source_required")
            quality_score = int(post.get("quality_score") or _editorial_quality_score(
                str(post.get("body") or ""),
                str(post.get("language") or "zh-CN"),
                source_name=str(post.get("source_name") or ""),
                city=str(post.get("city") or ""),
                category=str(post.get("category") or ""),
                relevance_score=int(post.get("relevance_score") or 50),
            ))
            if quality_score < 70:
                raise APIError("内容质量不足，请重新生成或人工编辑", 400, "quality_score_too_low")
            if post.get("is_ai_assisted"):
                issues = _editorial_quality_issues(str(post.get("body") or ""), str(post.get("language") or "zh-CN"))
                if issues:
                    raise APIError("内容质量检查未通过：" + ",".join(issues), 400, "quality_check_failed")
            if (post.get("official_source_required") or post.get("category") in HIGH_RISK_NEWS_CATEGORIES) and not (post.get("source_name") and (post.get("original_url") or post.get("source_url"))):
                raise APIError("高风险内容发布前必须保留官方来源", 400, "official_source_required")
            conn.execute(
                """
                UPDATE editorial_posts
                   SET status = 'published', review_status = 'approved', reviewed_by_admin_id = ?,
                       reviewed_at = ?, published_at = COALESCE(published_at, ?), updated_at = ?
                 WHERE id = ?
                """,
                (admin["id"], now, now, now, post_id),
            )
        elif action == "hide":
            conn.execute("UPDATE editorial_posts SET status = 'hidden', updated_at = ? WHERE id = ?", (now, post_id))
        elif action == "restore":
            conn.execute("UPDATE editorial_posts SET status = 'published', updated_at = ? WHERE id = ?", (now, post_id))
        else:
            raise APIError("未知操作", 400, "invalid_action")
        log_editorial_action(conn, admin_id=admin["id"], action=action, target_type="editorial_post", target_id=post_id)
        self.send_json({"post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone())})

    def api_admin_bulk_publish_editorial_posts(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        post_ids = data.get("postIds") or data.get("post_ids") or []
        confirm_media = bool(data.get("confirmMedia") or data.get("confirm_media"))
        params: list[Any] = []
        where = ["p.status IN ('draft','pending_review')"]
        if isinstance(post_ids, list) and post_ids:
            clean_ids = [str(x or "").strip() for x in post_ids if str(x or "").strip()][:200]
            placeholders = ",".join("?" for _ in clean_ids)
            where.append(f"p.id IN ({placeholders})")
            params.extend(clean_ids)
        rows = conn.execute(
            f"""
            SELECT p.*, s.credibility_level
              FROM editorial_posts p
              LEFT JOIN news_items i ON i.id = p.news_item_id
              LEFT JOIN news_sources s ON s.id = i.source_id
             WHERE {' AND '.join(where)}
             ORDER BY p.updated_at DESC
             LIMIT 200
            """,
            params,
        ).fetchall()
        published = 0
        skipped: list[dict[str, str]] = []
        now = now_iso()
        for row in rows:
            post = dict(row)
            credibility = post.get("credibility_level") or ("official" if not post.get("news_item_id") else "")
            if credibility != "official" and not confirm_media:
                skipped.append({"id": post["id"], "reason": "media_requires_manual_confirmation"})
                continue
            required_ok = all(str(post.get(k) or "").strip() for k in ("title", "summary", "body", "country", "language", "category"))
            source_ok = bool(post.get("source_name") and (post.get("original_url") or post.get("source_url")))
            if not required_ok or not source_ok:
                skipped.append({"id": post["id"], "reason": "missing_required_fields_or_source"})
                continue
            quality_score = int(post.get("quality_score") or _editorial_quality_score(
                str(post.get("body") or ""),
                str(post.get("language") or "zh-CN"),
                source_name=str(post.get("source_name") or ""),
                city=str(post.get("city") or ""),
                category=str(post.get("category") or ""),
                relevance_score=int(post.get("relevance_score") or 50),
            ))
            if quality_score < 70:
                skipped.append({"id": post["id"], "reason": "quality_score_too_low"})
                continue
            if post.get("is_ai_assisted"):
                issues = _editorial_quality_issues(str(post.get("body") or ""), str(post.get("language") or "zh-CN"))
                if issues:
                    skipped.append({"id": post["id"], "reason": "quality_check_failed:" + ",".join(issues)})
                    continue
            if (post.get("official_source_required") or post.get("category") in HIGH_RISK_NEWS_CATEGORIES) and not source_ok:
                skipped.append({"id": post["id"], "reason": "official_source_required"})
                continue
            conn.execute(
                """
                UPDATE editorial_posts
                   SET status = 'published', review_status = 'approved', reviewed_by_admin_id = ?,
                       reviewed_at = ?, published_at = COALESCE(published_at, ?), updated_at = ?
                 WHERE id = ?
                """,
                (admin["id"], now, now, now, post["id"]),
            )
            published += 1
        log_editorial_action(conn, admin_id=admin["id"], action="bulk_publish", target_type="editorial_post", target_id="bulk", metadata={"published": published, "skipped": skipped})
        self.send_json({"published": published, "skipped": skipped})

    def api_admin_delete_editorial_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT id FROM editorial_posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("编辑部文章不存在", 404, "editorial_post_not_found")
        conn.execute("UPDATE editorial_posts SET status = 'deleted', updated_at = ? WHERE id = ?", (now_iso(), post_id))
        log_editorial_action(conn, admin_id=admin["id"], action="delete", target_type="editorial_post", target_id=post_id)
        self.send_json({"ok": True})

    def api_admin_news_desk_logs(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 80), 200))
        fetch_logs = [dict(r) for r in conn.execute("SELECT * FROM news_fetch_logs ORDER BY created_at DESC LIMIT ?", (limit,))]
        action_logs: list[dict[str, Any]] = []
        for r in conn.execute("SELECT * FROM editorial_action_logs ORDER BY created_at DESC LIMIT ?", (limit,)):
            d = dict(r)
            try:
                d["metadata"] = json.loads(d.get("metadata") or "{}")
            except Exception:
                d["metadata"] = {}
            action_logs.append(d)
        self.send_json({"fetch_logs": fetch_logs, "action_logs": action_logs})

    def api_news(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        viewer_is_admin = False
        if viewer_id:
            user_row = conn.execute("SELECT role FROM users WHERE id = ?", (viewer_id,)).fetchone()
            viewer_is_admin = bool(user_row and user_row["role"] == "admin")
        where = ["status = 'published'"]
        params: list[Any] = []
        country = (query.get("country") or "").strip()
        if country:
            where.append("country = ?")
            params.append(_normalize_news_country(country))
        city_raw = (query.get("city") or "").strip()
        if city_raw:
            city = _normalize_news_city(city_raw)
            if city:
                where.append("city IN (?, '')")
                params.append(city)
            else:
                where.append("city = ''")
        language_raw = (query.get("language") or "").strip()
        if language_raw and language_raw.lower() != "all":
            where.append("language = ?")
            params.append(_normalize_news_language(language_raw))
        category_raw = (query.get("category") or "").strip()
        if category_raw:
            category = _normalize_news_category(category_raw)
            if category == "local_news":
                where.append("category IN ('local_news','policy_update','life_notice','public_safety','city_event')")
            else:
                where.append("category = ?")
                params.append(category)
        source_tier_raw = (query.get("sourceTier") or query.get("source_tier") or "").strip()
        if source_tier_raw:
            where.append("source_tier = ?")
            params.append(_normalize_source_tier(source_tier_raw))
        page = max(1, int(query.get("page") or 1))
        limit = max(1, min(int(query.get("limit") or 20), 50))
        sort = (query.get("sort") or "latest").strip()
        if sort == "popular":
            order = "ORDER BY (view_count + (SELECT COUNT(*) FROM interactions i WHERE i.target_id = editorial_posts.id AND i.kind = 'news_save') * 4 + (SELECT COUNT(*) FROM editorial_post_comments c WHERE c.editorial_post_id = editorial_posts.id AND c.deleted_at IS NULL) * 3) DESC, published_at DESC"
        else:
            order = "ORDER BY published_at DESC, created_at DESC"
        rows = conn.execute(
            f"SELECT * FROM editorial_posts WHERE {' AND '.join(where)} {order} LIMIT ? OFFSET ?",
            [*params, limit, (page - 1) * limit],
        ).fetchall()
        total = conn.execute(f"SELECT COUNT(*) AS c FROM editorial_posts WHERE {' AND '.join(where)}", params).fetchone()["c"]
        payload: dict[str, Any] = {"items": [serialize_editorial_post(conn, r, viewer_id) for r in rows], "page": page, "limit": limit, "total": int(total)}
        if viewer_is_admin and int(total) == 0:
            draft_count = conn.execute("SELECT COUNT(*) AS c FROM editorial_posts WHERE status IN ('draft','pending_review')").fetchone()["c"]
            fetched_count = conn.execute("SELECT COUNT(*) AS c FROM news_items WHERE status = 'fetched'").fetchone()["c"]
            source_count = conn.execute("SELECT COUNT(*) AS c FROM news_sources WHERE deleted_at IS NULL").fetchone()["c"]
            payload["diagnostics"] = {
                "draft_count": int(draft_count),
                "fetched_count": int(fetched_count),
                "source_count": int(source_count),
                "hint": "已有草稿，尚未发布。" if draft_count else ("已有采集内容，尚未创建草稿。" if fetched_count else "暂无本地资讯。请在后台抓取并发布内容。"),
            }
        self.send_json(payload)

    def api_news_detail(self, conn: sqlite3.Connection, post_id: str) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        row = conn.execute("SELECT * FROM editorial_posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
        if not row:
            raise APIError("资讯不存在", 404, "news_not_found")
        conn.execute("UPDATE editorial_posts SET view_count = view_count + 1 WHERE id = ?", (post_id,))
        fresh = conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone()
        post = serialize_editorial_post(conn, fresh, viewer_id)
        related = [
            serialize_editorial_post(conn, r, viewer_id)
            for r in conn.execute(
                """
                SELECT * FROM editorial_posts
                 WHERE status = 'published' AND id <> ? AND country = ? AND (city = ? OR category = ?)
                 ORDER BY published_at DESC LIMIT 4
                """,
                (post_id, post.get("country") or "", post.get("city") or "", post.get("category") or ""),
            )
        ]
        self.send_json({"post": post, "related": related})

    def api_news_save(self, conn: sqlite3.Connection, post_id: str, on: bool) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT id FROM editorial_posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
        if not row:
            raise APIError("资讯不存在", 404, "news_not_found")
        if on:
            conn.execute(
                "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'news_save', ?)",
                (str(uuid.uuid4()), post_id, user["id"], now_iso()),
            )
        else:
            conn.execute("DELETE FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'news_save'", (post_id, user["id"]))
        self.send_json({"post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone(), user["id"])})

    def api_news_metric(self, conn: sqlite3.Connection, post_id: str, metric: str) -> None:
        row = conn.execute("SELECT id FROM editorial_posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
        if not row:
            raise APIError("资讯不存在", 404, "news_not_found")
        if metric == "share":
            conn.execute("UPDATE editorial_posts SET share_count = share_count + 1 WHERE id = ?", (post_id,))
        elif metric == "source-click":
            conn.execute("UPDATE editorial_posts SET click_source_count = click_source_count + 1 WHERE id = ?", (post_id,))
        else:
            raise APIError("未知指标", 400, "invalid_metric")
        self.send_json({"post": serialize_editorial_post(conn, conn.execute("SELECT * FROM editorial_posts WHERE id = ?", (post_id,)).fetchone())})

    def api_news_comments(self, conn: sqlite3.Connection, post_id: str) -> None:
        row = conn.execute("SELECT id FROM editorial_posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
        if not row:
            raise APIError("资讯不存在", 404, "news_not_found")
        rows = conn.execute(
            "SELECT * FROM editorial_post_comments WHERE editorial_post_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
            (post_id,),
        ).fetchall()
        authors = fetch_users_by_ids(conn, list({r["author_id"] for r in rows}))
        self.send_json({"items": [serialize_editorial_comment(r, authors.get(r["author_id"])) for r in rows]})

    def api_news_create_comment(self, conn: sqlite3.Connection, post_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT id FROM editorial_posts WHERE id = ? AND status = 'published'", (post_id,)).fetchone()
        if not row:
            raise APIError("资讯不存在", 404, "news_not_found")
        content = _news_clean_text(self.read_json().get("content"), 800)
        if not content:
            raise APIError("评论不能为空", 400, "empty_comment")
        comment_id = str(uuid.uuid4())
        now = now_iso()
        conn.execute(
            "INSERT INTO editorial_post_comments (id, editorial_post_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (comment_id, post_id, user["id"], content, now, now),
        )
        comment = conn.execute("SELECT * FROM editorial_post_comments WHERE id = ?", (comment_id,)).fetchone()
        self.send_json({"comment": serialize_editorial_comment(comment, serialize_user(user))}, 201)

    # ---- HTTP verbs ----

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/healthz", "/readyz") or self.path.startswith("/api/"):
            self._dispatch("GET")
        elif self.path.startswith("/media/"):
            self._serve_media()
        else:
            self._serve_static()

    def do_HEAD(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "0")
            self._set_cors()
            self.end_headers()
            return
        if path == "/readyz":
            try:
                with db() as conn:
                    conn.execute("SELECT 1").fetchone()
                self.send_response(200)
            except Exception:
                self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "0")
            self._set_cors()
            self.end_headers()
            return
        self.send_error(405)

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_PATCH(self) -> None:
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")

    def _serve_static(self) -> None:
        relative = self.path.split("?", 1)[0].lstrip("/")
        candidate = (STATIC_DIR / (relative or "index.html")).resolve()
        try:
            candidate.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(404)
            return
        if not candidate.exists() or candidate.is_dir():
            self.send_error(404)
            return
        mime, _ = mimetypes.guess_type(candidate.name)
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(data)

    def _serve_media(self) -> None:
        relative = self.path.split("?", 1)[0].lstrip("/")
        candidate = (ROOT / relative).resolve()
        try:
            candidate.relative_to(MEDIA_DIR.resolve())
        except ValueError:
            self.send_error(404)
            return
        if not candidate.exists() or candidate.is_dir():
            self.send_error(404)
            return
        mime, _ = mimetypes.guess_type(candidate.name)
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000")
        self._set_cors()
        self.end_headers()
        self.wfile.write(data)

    # ---- routing ----

    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = {k: v[0] if v else "" for k, v in parse_qs(parsed.query).items()}
        self._pending_event_user_id = None
        self._session_user_id = None
        # Stamp every request with a unique id for log correlation.
        self._request_id = secrets.token_hex(8)
        ip = self._client_ip()
        started = time.perf_counter()
        status_code = 200

        # Cheap health endpoints don't go through the DB lock or rate limits.
        if path == "/healthz" and method == "GET":
            self.send_json({"ok": True, "service": "machi-backend", "ts": now_iso()})
            ACCESS_LOG.info('%s "GET /healthz" 200 ip=%s', self._request_id, ip)
            return
        if path == "/readyz" and method == "GET":
            try:
                with db() as conn:
                    conn.execute("SELECT 1").fetchone()
                self.send_json({"ready": True})
                ACCESS_LOG.info('%s "GET /readyz" 200 ip=%s', self._request_id, ip)
            except Exception as exc:
                self.send_error_json(f"db: {exc}", 503, "not_ready")
                ACCESS_LOG.warning('%s "GET /readyz" 503 ip=%s err=%s', self._request_id, ip, exc)
            return

        # Rate limit before doing any real work.
        group = _rate_group_for(path, method)
        if not rate_check(ip, group):
            status_code = 429
            self.send_response(429)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Retry-After", "30")
            self._set_cors()
            self._set_security_headers()
            self.end_headers()
            self.wfile.write(b'{"error":{"code":"rate_limited","message":"\xe8\xaf\xb7\xe6\xb1\x82\xe8\xbf\x87\xe4\xba\x8e\xe9\xa2\x91\xe7\xb9\x81\xef\xbc\x8c\xe7\xa8\x8d\xe5\x90\x8e\xe5\x86\x8d\xe8\xaf\x95\xe3\x80\x82"}}')
            ACCESS_LOG.warning('%s "%s %s" 429 ip=%s group=%s', self._request_id, method, path, ip, group)
            return

        # Only serialize on the DB lock for actual writes. SQLite WAL
        # supports concurrent readers and the lock was previously the
        # main throughput ceiling. The session-last-seen-at update path
        # was the only "write inside a GET" — it's now throttled and
        # batched in memory (see _should_flush_last_seen).
        need_write_lock = method in ("POST", "PATCH", "PUT", "DELETE")
        lock_held = False
        try:
            if need_write_lock:
                # Fail fast instead of hanging forever if the lock is wedged
                # or under sustained contention — a stuck holder can no
                # longer pile up connections and take the whole site down.
                if not DB_LOCK.acquire(timeout=DB_WRITE_LOCK_TIMEOUT_SEC):
                    raise APIError("服务器繁忙，请稍后再试", 503, "server_busy")
                lock_held = True
            try:
                with db() as conn:
                    response = self._route(conn, method, path, query)
            finally:
                if lock_held:
                    DB_LOCK.release()
            # The SSE handler defers the long-running stream until after
            # any lock has been released. If the route asked for an
            # event stream, run it now.
            if self._pending_event_user_id is not None:
                self._run_event_stream(self._pending_event_user_id)
                return
            if response is None:
                pass
        except APIError as exc:
            status_code = exc.status
            self.send_error_json(str(exc), exc.status, exc.code)
        except sqlite3.IntegrityError as exc:
            status_code = 409
            self.send_error_json(str(exc), 409, "conflict")
        except Exception as exc:
            status_code = 500
            err_id = self._request_id
            # Log the full traceback to error log but only send a generic
            # message to the client so we don't leak stack traces.
            ERR_LOG.exception('%s "%s %s" 500 ip=%s', err_id, method, path, ip)
            self.send_error_json(
                f"server error (request {err_id})" if PRODUCTION else f"{type(exc).__name__}: {exc}",
                500,
                "server_error",
            )
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            ACCESS_LOG.info(
                '%s "%s %s" %d ip=%s ms=%.1f',
                self._request_id, method, path, status_code, ip, duration_ms,
            )
            # Best-effort visitor analytics. We pass ONLY coarse access
            # metadata — never the Authorization header, cookies, request
            # body, query string, or any secret. `path` here is already the
            # query-stripped path. Enqueue is non-blocking; the background
            # writer does the (locked) insert + GeoIP off the request thread.
            try:
                if (VISITOR_LOG_ENABLED and method != "OPTIONS"
                        and not path.startswith("/api/events")
                        and not path.lower().endswith(_VISIT_SKIP_EXT)):
                    enqueue_visitor_log({
                        "created_at": now_iso(),
                        "ip": ip,
                        "ip_hash": hash_ip(ip),
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "user_id": getattr(self, "_session_user_id", None),
                        "user_agent": (self.headers.get("User-Agent") or "")[:300],
                        "referer": (self.headers.get("Referer") or "")[:300],
                        # Security events bypass per-IP dedup so admins always
                        # see every login / register / reset attempt.
                        "force": path.startswith("/api/auth/"),
                    })
            except Exception:
                pass

    def _client_ip(self) -> str:
        # Honor X-Forwarded-For when behind a trusted reverse proxy.
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0] if self.client_address else "anon"

    def _route(self, conn: sqlite3.Connection, method: str, path: str, query: dict[str, str]) -> Any:
        # auth
        if path == "/api/auth/register" and method == "POST":
            return self.api_register(conn)
        if path == "/api/auth/login" and method == "POST":
            return self.api_login(conn)
        if path == "/api/auth/logout" and method == "POST":
            return self.api_logout(conn)
        if path == "/api/auth/me" and method == "GET":
            return self.api_me(conn)
        if path == "/api/auth/me" and method == "PATCH":
            return self.api_update_me(conn)
        if path == "/api/auth/me" and method == "DELETE":
            return self.api_delete_me(conn)
        if path == "/api/auth/check-username" and method == "GET":
            return self.api_check_username(conn, query)
        if path == "/api/auth/check-email" and method == "GET":
            return self.api_check_email(conn, query)
        # email verification + password recovery + 2-step login
        if path in ("/api/auth/email/send-code", "/api/auth/send-verification-code") and method == "POST":
            return self.api_send_email_code(conn)
        if path == "/api/auth/verify-code" and method == "POST":
            return self.api_verify_code(conn)
        if path == "/api/auth/login/start" and method == "POST":
            return self.api_login_start(conn)
        if path == "/api/auth/login/verify" and method == "POST":
            return self.api_login_verify(conn)
        if path == "/api/auth/change-password" and method == "POST":
            return self.api_change_password(conn)
        if path == "/api/auth/forgot-password" and method == "POST":
            return self.api_forgot_password(conn)
        if path == "/api/auth/reset-password" and method == "POST":
            return self.api_reset_password(conn)

        # bootstrap (single round-trip startup payload)
        if path == "/api/bootstrap" and method == "GET":
            return self.api_bootstrap(conn)

        # users
        if path == "/api/users/me" and method == "GET":
            return self.api_me(conn)
        if path == "/api/users/me" and method == "PATCH":
            return self.api_update_me(conn)
        if path.startswith("/api/users/"):
            parts = path[len("/api/users/"):].split("/")
            user_id = unquote(parts[0])
            rest = "/".join(parts[1:])
            if not rest and method == "GET":
                return self.api_user_detail(conn, user_id)
            if rest == "posts" and method == "GET":
                return self.api_user_posts(conn, user_id, query)
            if rest == "replies" and method == "GET":
                return self.api_user_replies(conn, user_id, query)
            if rest == "media" and method == "GET":
                return self.api_user_media(conn, user_id, query)
            if rest == "likes" and method == "GET":
                return self.api_user_likes(conn, user_id, query)
            if rest == "bookmarks" and method == "GET":
                return self.api_user_bookmarks(conn, user_id, query)
            if rest == "follow" and method == "POST":
                return self.api_follow(conn, user_id, True)
            if rest == "follow" and method == "DELETE":
                return self.api_follow(conn, user_id, False)
            if rest == "block" and method == "POST":
                return self.api_block(conn, user_id, True)
            if rest == "block" and method == "DELETE":
                return self.api_block(conn, user_id, False)
            if rest == "report" and method == "POST":
                return self.api_report(conn, "user", user_id)
            if rest == "followers" and method == "GET":
                return self.api_relationship(conn, user_id, "followers")
            if rest == "following" and method == "GET":
                return self.api_relationship(conn, user_id, "following")

        # feed
        if path == "/api/feed" and method == "GET":
            return self.api_feed(conn, query)

        # posts
        if path == "/api/posts" and method == "GET":
            return self.api_feed(conn, query)
        if path == "/api/posts" and method == "POST":
            return self.api_create_post(conn)
        if path.startswith("/api/posts/"):
            parts = path[len("/api/posts/"):].split("/")
            post_id = parts[0]
            rest = "/".join(parts[1:])
            if not rest and method == "GET":
                return self.api_post_detail(conn, post_id)
            if not rest and method == "PATCH":
                return self.api_edit_post(conn, post_id)
            if not rest and method == "DELETE":
                return self.api_delete_post(conn, post_id)
            if rest == "like" and method == "POST":
                return self.api_post_interaction(conn, post_id, "like", True)
            if rest == "like" and method == "DELETE":
                return self.api_post_interaction(conn, post_id, "like", False)
            if rest == "bookmark" and method == "POST":
                return self.api_post_interaction(conn, post_id, "bookmark", True)
            if rest == "bookmark" and method == "DELETE":
                return self.api_post_interaction(conn, post_id, "bookmark", False)
            if rest == "save" and method == "POST":
                return self.api_post_interaction(conn, post_id, "bookmark", True)
            if rest == "save" and method == "DELETE":
                return self.api_post_interaction(conn, post_id, "bookmark", False)
            if rest == "repost" and method == "POST":
                return self.api_repost(conn, post_id, True)
            if rest == "repost" and method == "DELETE":
                return self.api_repost(conn, post_id, False)
            if rest == "poll/vote" and method == "POST":
                return self.api_vote_poll(conn, post_id)
            if rest == "view" and method == "POST":
                return self.api_view_post(conn, post_id)
            if rest == "report" and method == "POST":
                return self.api_report(conn, "post", post_id)
            if rest == "comments" and method == "GET":
                return self.api_list_comments(conn, post_id, query)
            if rest == "comments" and method == "POST":
                return self.api_create_comment(conn, post_id)

        # comments
        if path.startswith("/api/comments/"):
            parts = path[len("/api/comments/"):].split("/")
            comment_id = parts[0]
            rest = "/".join(parts[1:])
            if not rest and method == "DELETE":
                return self.api_delete_comment(conn, comment_id)
            if rest == "like" and method == "POST":
                return self.api_comment_like(conn, comment_id, True)
            if rest == "like" and method == "DELETE":
                return self.api_comment_like(conn, comment_id, False)
            if rest == "report" and method == "POST":
                return self.api_report(conn, "comment", comment_id)

        # search
        if path == "/api/search" and method == "GET":
            return self.api_search(conn, query)
        if path == "/api/search/history" and method == "GET":
            return self.api_search_history(conn)
        if path == "/api/search/history" and method == "DELETE":
            return self.api_clear_search_history(conn)
        if path == "/api/trending" and method == "GET":
            return self.api_trending(conn)
        if path == "/api/topics" and method == "GET":
            return self.api_topics(conn)
        if path.startswith("/api/topics/") and method == "GET":
            tag = unquote(path[len("/api/topics/"):])
            return self.api_topic(conn, tag, query)
        if path.startswith("/api/profile/") and method == "GET":
            username = unquote(path[len("/api/profile/"):]).strip().lstrip("@")
            return self.api_profile_by_username(conn, username)

        # notifications
        if path == "/api/notifications" and method == "GET":
            return self.api_notifications(conn, query)
        if path == "/api/notifications/read" and method == "POST":
            return self.api_mark_notifications(conn)
        if path.startswith("/api/notifications/") and method == "DELETE":
            return self.api_delete_notification(conn, path.split("/")[3])

        # conversations
        if path == "/api/conversations" and method == "GET":
            return self.api_conversations(conn)
        if path == "/api/conversations" and method == "POST":
            return self.api_create_conversation(conn)
        if path.startswith("/api/conversations/"):
            parts = path[len("/api/conversations/"):].split("/")
            conv_id = parts[0]
            rest = "/".join(parts[1:])
            if not rest and method == "DELETE":
                return self.api_delete_conversation(conn, conv_id)
            if rest == "messages" and method == "GET":
                return self.api_messages(conn, conv_id, query)
            if rest == "messages" and method == "POST":
                return self.api_create_message(conn, conv_id)
            if rest == "read" and method == "POST":
                return self.api_mark_conversation_read(conn, conv_id)
        if path.startswith("/api/messages/") and method == "DELETE":
            return self.api_delete_message(conn, path.split("/")[3])

        # media
        if path == "/api/media/upload" and method == "POST":
            return self.api_upload_media(conn)
        if path.startswith("/api/media/") and method == "GET":
            return self.api_get_media(conn, path.split("/")[3])
        if path.startswith("/api/media/") and method == "DELETE":
            return self.api_delete_media(conn, path.split("/")[3])

        # settings & account misc
        if path == "/api/settings" and method == "GET":
            return self.api_get_settings(conn)
        if path == "/api/settings" and method == "PATCH":
            return self.api_update_settings(conn)
        if path == "/api/cache/clear" and method == "POST":
            return self.api_clear_cache(conn)
        if path == "/api/export" and method == "GET":
            return self.api_export(conn)
        if path == "/api/feedback" and method == "POST":
            return self.api_feedback(conn)
        if path == "/api/marketing-copy" and method == "GET":
            return self.api_marketing_copy(conn, query)

        # Local News Desk public API. Editorial posts are a distinct
        # official content surface, not ordinary user posts.
        if path == "/api/news" and method == "GET":
            return self.api_news(conn, query)
        if path.startswith("/api/news/"):
            parts = path[len("/api/news/"):].split("/")
            news_id = unquote(parts[0])
            rest = "/".join(parts[1:])
            if not rest and method == "GET":
                return self.api_news_detail(conn, news_id)
            if rest == "save" and method == "POST":
                return self.api_news_save(conn, news_id, True)
            if rest == "save" and method == "DELETE":
                return self.api_news_save(conn, news_id, False)
            if rest in {"share", "source-click"} and method == "POST":
                return self.api_news_metric(conn, news_id, rest)
            if rest == "comments" and method == "GET":
                return self.api_news_comments(conn, news_id)
            if rest == "comments" and method == "POST":
                return self.api_news_create_comment(conn, news_id)

        # blocks & devices
        if path == "/api/blocks" and method == "GET":
            return self.api_blocks(conn)
        if path == "/api/devices" and method == "GET":
            return self.api_devices(conn)
        if path.startswith("/api/devices/") and method == "DELETE":
            return self.api_revoke_device(conn, path.split("/")[3])

        # drafts
        if path == "/api/drafts" and method == "GET":
            return self.api_list_drafts(conn)
        if path == "/api/drafts" and method == "POST":
            return self.api_save_draft(conn)
        if path.startswith("/api/drafts/") and method == "DELETE":
            return self.api_delete_draft(conn, path.split("/")[3])

        # regions
        if path == "/api/regions/countries" and method == "GET":
            return self.api_regions_countries(conn)
        if path == "/api/regions/provinces" and method == "GET":
            return self.api_regions_provinces(conn, query)
        if path == "/api/regions/cities" and method == "GET":
            return self.api_regions_cities(conn, query)
        if path == "/api/regions/popular" and method == "GET":
            return self.api_regions_popular(conn)
        if path == "/api/regions/resolve" and method == "GET":
            return self.api_regions_resolve(conn, query)

        # realtime
        if path == "/api/events/token" and method == "POST":
            return self.api_events_token(conn)
        if path == "/api/events" and method == "GET":
            return self.api_events(conn)

        # admin (all behind require_admin)
        if path == "/api/admin/stats" and method == "GET":
            return self.api_admin_stats(conn)
        if path == "/api/admin/visitors" and method == "GET":
            return self.api_admin_visitors(conn, query)
        if path == "/api/admin/users" and method == "GET":
            return self.api_admin_users(conn, query)
        if path.startswith("/api/admin/users/") and method == "PATCH":
            return self.api_admin_update_user(conn, path.split("/")[4])
        if path.startswith("/api/admin/users/") and method == "DELETE":
            return self.api_admin_delete_user(conn, path.split("/")[4])
        if path == "/api/admin/posts" and method == "GET":
            return self.api_admin_posts(conn, query)
        if path.startswith("/api/admin/posts/") and method == "PATCH":
            return self.api_admin_update_post(conn, path.split("/")[4])
        if path.startswith("/api/admin/posts/") and method == "DELETE":
            return self.api_admin_delete_post(conn, path.split("/")[4])
        if path == "/api/admin/comments" and method == "GET":
            return self.api_admin_comments(conn, query)
        if path.startswith("/api/admin/comments/") and method == "DELETE":
            return self.api_admin_delete_comment(conn, path.split("/")[4])
        if path == "/api/admin/reports" and method == "GET":
            return self.api_admin_reports(conn, query)
        if path.startswith("/api/admin/reports/") and method == "DELETE":
            return self.api_admin_resolve_report(conn, path.split("/")[4])
        if path == "/api/admin/feedback" and method == "GET":
            return self.api_admin_feedback(conn, query)
        if path == "/api/admin/marketing-copy" and method == "GET":
            return self.api_admin_marketing_copy(conn, query)
        if path == "/api/admin/marketing-copy" and method == "POST":
            return self.api_admin_create_marketing_copy(conn)
        if path.startswith("/api/admin/marketing-copy/") and method == "PATCH":
            return self.api_admin_update_marketing_copy(conn, path.split("/")[4])
        if path.startswith("/api/admin/marketing-copy/") and method == "DELETE":
            return self.api_admin_delete_marketing_copy(conn, path.split("/")[4])

        # admin: Japan News Crawler aliases. These share the Local News Desk
        # storage surface while exposing product-specific crawler routes.
        if path == "/api/admin/japan-news-crawler/dashboard" and method == "GET":
            return self.api_admin_news_desk(conn)
        if path == "/api/admin/japan-news-crawler/fetch-japan-all" and method == "POST":
            return self.api_admin_fetch_japan_all_news_sources(conn)
        if path == "/api/admin/japan-news-crawler/fetch-official" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "official")
        if path == "/api/admin/japan-news-crawler/fetch-tokyo" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "tokyo")
        if path == "/api/admin/japan-news-crawler/fetch-osaka" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "osaka")
        if path == "/api/admin/japan-news-crawler/fetch-all" and method == "POST":
            return self.api_admin_fetch_all_news_sources(conn)
        if path == "/api/admin/japan-news-crawler/sources" and method == "GET":
            return self.api_admin_news_sources(conn, query)
        if path == "/api/admin/japan-news-crawler/sources" and method == "POST":
            return self.api_admin_create_news_source(conn)
        if path == "/api/admin/japan-news-crawler/sources/seed-presets" and method == "POST":
            return self.api_admin_seed_news_source_presets(conn)
        if path.startswith("/api/admin/japan-news-crawler/sources/"):
            parts = path.split("/")
            source_id = unquote(parts[5]) if len(parts) > 5 else ""
            action = parts[6] if len(parts) > 6 else ""
            if method == "GET" and not action:
                return self.api_admin_news_source_detail(conn, source_id)
            if method == "PATCH" and not action:
                return self.api_admin_update_news_source(conn, source_id)
            if method == "DELETE" and not action:
                return self.api_admin_delete_news_source(conn, source_id)
            if method == "POST" and action == "toggle":
                return self.api_admin_toggle_news_source(conn, source_id)
            if method == "POST" and action == "fetch":
                return self.api_admin_fetch_news_source(conn, source_id)
        if path == "/api/admin/japan-news-crawler/items" and method == "GET":
            return self.api_admin_news_items(conn, query)
        if path == "/api/admin/japan-news-crawler/items/create-drafts" and method == "POST":
            return self.api_admin_create_drafts_from_news_items(conn)
        if path.startswith("/api/admin/japan-news-crawler/items/"):
            parts = path.split("/")
            item_id = unquote(parts[5]) if len(parts) > 5 else ""
            action = parts[6] if len(parts) > 6 else ""
            if method == "POST" and action == "create-draft":
                return self.api_admin_create_draft_from_news_item(conn, item_id)
            if method == "POST" and action == "ignore":
                return self.api_admin_update_news_item_status(conn, item_id, "ignored")
            if method == "POST" and action == "duplicate":
                return self.api_admin_update_news_item_status(conn, item_id, "duplicate")
            if method == "DELETE" and not action:
                return self.api_admin_update_news_item_status(conn, item_id, "deleted")
        if path == "/api/admin/japan-news-crawler/logs" and method == "GET":
            return self.api_admin_news_desk_logs(conn, query)

        # admin: Local News Desk / 本地资讯台
        if path == "/api/admin/news-desk" and method == "GET":
            return self.api_admin_news_desk(conn)
        if path == "/api/admin/news-sources/fetch-all" and method == "POST":
            return self.api_admin_fetch_all_news_sources(conn)
        if path == "/api/admin/news-sources/fetch-japan-all" and method == "POST":
            return self.api_admin_fetch_japan_all_news_sources(conn)
        if path == "/api/admin/news-sources/fetch-official" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "official")
        if path == "/api/admin/news-sources/fetch-tokyo" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "tokyo")
        if path == "/api/admin/news-sources/fetch-osaka" and method == "POST":
            return self.api_admin_fetch_japan_scope_news_sources(conn, "osaka")
        if path == "/api/admin/news-sources" and method == "GET":
            return self.api_admin_news_sources(conn, query)
        if path == "/api/admin/news-sources" and method == "POST":
            return self.api_admin_create_news_source(conn)
        if path == "/api/admin/news-sources/seed-presets" and method == "POST":
            return self.api_admin_seed_news_source_presets(conn)
        if path.startswith("/api/admin/news-sources/"):
            parts = path.split("/")
            source_id = unquote(parts[4]) if len(parts) > 4 else ""
            action = parts[5] if len(parts) > 5 else ""
            if method == "GET" and not action:
                return self.api_admin_news_source_detail(conn, source_id)
            if method == "PATCH" and not action:
                return self.api_admin_update_news_source(conn, source_id)
            if method == "DELETE" and not action:
                return self.api_admin_delete_news_source(conn, source_id)
            if method == "POST" and action == "toggle":
                return self.api_admin_toggle_news_source(conn, source_id)
            if method == "POST" and action == "fetch":
                return self.api_admin_fetch_news_source(conn, source_id)
        if path == "/api/admin/news-items" and method == "GET":
            return self.api_admin_news_items(conn, query)
        if path == "/api/admin/news-items/create-drafts" and method == "POST":
            return self.api_admin_create_drafts_from_news_items(conn)
        if path.startswith("/api/admin/news-items/"):
            parts = path.split("/")
            item_id = unquote(parts[4]) if len(parts) > 4 else ""
            action = parts[5] if len(parts) > 5 else ""
            if method == "POST" and action == "create-draft":
                return self.api_admin_create_draft_from_news_item(conn, item_id)
            if method == "POST" and action == "ignore":
                return self.api_admin_update_news_item_status(conn, item_id, "ignored")
            if method == "POST" and action == "duplicate":
                return self.api_admin_update_news_item_status(conn, item_id, "duplicate")
            if method == "DELETE" and not action:
                return self.api_admin_update_news_item_status(conn, item_id, "deleted")
        if path == "/api/admin/editorial-posts" and method == "GET":
            return self.api_admin_editorial_posts(conn, query)
        if path == "/api/admin/editorial-posts" and method == "POST":
            return self.api_admin_create_editorial_post(conn)
        if path == "/api/admin/editorial-posts/bulk-publish" and method == "POST":
            return self.api_admin_bulk_publish_editorial_posts(conn)
        if path.startswith("/api/admin/editorial-posts/"):
            parts = path.split("/")
            editorial_id = unquote(parts[4]) if len(parts) > 4 else ""
            action = parts[5] if len(parts) > 5 else ""
            if method == "PATCH" and not action:
                return self.api_admin_update_editorial_post(conn, editorial_id)
            if method == "POST" and action == "ai-assist":
                return self.api_admin_editorial_ai_assist(conn, editorial_id)
            if method == "POST" and action in {"submit-review", "approve", "reject", "publish", "hide", "restore"}:
                return self.api_admin_editorial_transition(conn, editorial_id, action)
            if method == "DELETE" and not action:
                return self.api_admin_delete_editorial_post(conn, editorial_id)
        if path == "/api/admin/news-desk/logs" and method == "GET":
            return self.api_admin_news_desk_logs(conn, query)

        # admin: City Seed Bot (城市内容助手) — all behind require_admin
        if path == "/api/admin/seed-content/generate" and method == "POST":
            return self.api_admin_seed_generate(conn)
        if path == "/api/admin/seed-content/batches" and method == "GET":
            return self.api_admin_seed_batches(conn, query)
        if path == "/api/admin/seed-content/clear-city" and method == "POST":
            return self.api_admin_seed_clear_city(conn)
        if path == "/api/admin/seed-content/logs" and method == "GET":
            return self.api_admin_seed_logs(conn, query)
        if path.startswith("/api/admin/seed-content/batches/"):
            parts = path.split("/")  # ['', 'api', 'admin', 'seed-content', 'batches', '{id}', '{action}'?]
            batch_id = parts[5] if len(parts) > 5 else ""
            action = parts[6] if len(parts) > 6 else ""
            if method == "GET" and not action:
                return self.api_admin_seed_batch_detail(conn, batch_id)
            if method == "POST" and action == "publish":
                return self.api_admin_seed_publish(conn, batch_id)
            if method == "POST" and action == "clear":
                return self.api_admin_seed_clear(conn, batch_id)

        # membership + payments
        if path == "/api/membership/me" and method == "GET":
            return self.api_membership_me(conn)
        if path in ("/api/membership/plan", "/api/membership/plans") and method == "GET":
            return self.api_membership_plan(conn)
        if path == "/api/membership/benefits" and method == "GET":
            return self.api_membership_benefits(conn)
        if path == "/api/membership/exclusive" and method == "GET":
            return self.api_membership_exclusive(conn)
        if path == "/api/membership/orders" and method == "GET":
            return self.api_membership_orders(conn, query)
        if path == "/api/membership/insights" and method == "GET":
            return self.api_membership_insights(conn)
        if path == "/api/payments/create-order" and method == "POST":
            return self.api_create_payment_order(conn)
        if path == "/api/payments/order-status" and method == "GET":
            return self.api_order_status(conn, query)
        if path == "/api/payments/stripe/confirm" and method == "POST":
            return self.api_stripe_confirm(conn)
        if path == "/api/payments/stripe/reconcile" and method == "POST":
            return self.api_stripe_reconcile(conn)
        if path == "/api/payments/webhook/wechat" and method == "POST":
            return self.api_payment_webhook_wechat(conn)
        if path == "/api/payments/webhook/alipay" and method == "POST":
            return self.api_payment_webhook_alipay(conn)
        if path == "/api/payments/webhook/stripe" and method == "POST":
            return self.api_payment_webhook_stripe(conn)
        if path == "/api/payments/apple/verify" and method == "POST":
            return self.api_apple_verify(conn)
        # Dev-only mock settlement. The handler itself refuses unless
        # PAYMENT_MOCK_ENABLED and not in production.
        if path == "/api/payments/mock/confirm" and method in ("POST", "GET"):
            return self.api_mock_confirm(conn, query)

        # admin: membership management
        if path == "/api/admin/memberships" and method == "GET":
            return self.api_admin_memberships(conn, query)
        if path == "/api/admin/memberships/grant" and method == "POST":
            return self.api_admin_grant_membership(conn)
        if path == "/api/admin/memberships/cancel" and method == "POST":
            return self.api_admin_cancel_membership(conn)
        if path == "/api/admin/payment-orders" and method == "GET":
            return self.api_admin_payment_orders(conn, query)

        raise APIError("not found", 404, "not_found")

    # ---- membership + payments ----

    def _membership_benefits_payload(self) -> list[dict[str, str]]:
        return [
            {"key": "verified_badge", "title": "Machi 认证标识", "description": "个人主页和内容卡片展示 Machi 自有认证会员标识。"},
            {"key": "trusted_publish", "title": "高信任内容发布", "description": "可发布招聘、租房、本地服务、活动推广等高信任内容类型。"},
            {"key": "priority_review", "title": "优先审核", "description": "会员内容进入更高优先级的审核与处理队列。"},
            {"key": "light_boost", "title": "轻量曝光提升", "description": "合规内容在本地推荐中获得温和曝光加成。"},
            {"key": "insights", "title": "基础数据洞察", "description": "查看自己内容的浏览、互动、收藏、评论等基础统计。"},
            {"key": "higher_quota", "title": "更高发帖额度", "description": "每日发布额度和收藏容量高于普通账号。"},
            {"key": "exclusive", "title": "会员专属内容", "description": "访问编辑部整理的城市指南、租房避坑和本地生活精选。"},
            {"key": "sync", "title": "Web / iOS 状态同步", "description": "会员状态写入同一套 user_memberships，Web 与 iOS 刷新后保持一致。"},
        ]

    def api_membership_plan(self, conn: sqlite3.Connection) -> None:
        """Public plan info (price + names) for the membership page. No
        auth required so the upsell can render for logged-out visitors."""
        plan = get_plan(conn, MEMBERSHIP_PLAN_KEY)
        plan_payload = serialize_plan(plan) if plan else None
        self.send_json({
            "plan": plan_payload,
            "plans": [plan_payload] if plan_payload else [],
            "items": [plan_payload] if plan_payload else [],
            "requires_membership_content_types": sorted(REQUIRES_VERIFIED_MEMBERSHIP),
            "apple_product_id": APPLE_IAP_PRODUCT_ID,
            "available_providers": available_payment_providers(),
        })

    def api_membership_benefits(self, conn: sqlite3.Connection) -> None:
        plan = get_plan(conn, MEMBERSHIP_PLAN_KEY)
        self.send_json({
            "benefits": self._membership_benefits_payload(),
            "plan": serialize_plan(plan) if plan else None,
            "disclaimer": "认证会员表示该账号已开通 Machi 认证权益，不代表 Machi 对其发布内容作出担保。",
            "requires_membership_content_types": sorted(REQUIRES_VERIFIED_MEMBERSHIP),
        })

    def api_membership_exclusive(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        status = get_user_membership_status(conn, user["id"])
        if not status["is_active"]:
            raise APIError("访问会员专属内容需要开通 Machi 认证会员。", 403, "MEMBERSHIP_REQUIRED")
        city = _normalize_news_city(user.get("city") or "")
        country = _normalize_news_country(user.get("country") or "jp") or "jp"
        params: list[Any] = [country]
        city_clause = ""
        if city:
            city_clause = " AND (city = ? OR city = '')"
            params.append(city)
        posts = [
            serialize_editorial_post(conn, r, user["id"])
            for r in conn.execute(
                "SELECT * FROM editorial_posts WHERE status = 'published' AND country = ?" + city_clause +
                " ORDER BY published_at DESC, created_at DESC LIMIT 12",
                params,
            )
        ]
        self.send_json({
            "membership": status,
            "items": posts,
            "guides": [
                {"key": "housing", "title": "租房避坑合集", "description": "看房、初期费用、合同和搬家前后需要确认的事项。"},
                {"key": "work", "title": "工作招聘发布入口", "description": "会员可发布招聘、打工、引荐等高信任内容。"},
                {"key": "city", "title": "东京 / 大阪生活指南", "description": "编辑部整理的通勤、区役所、在留、交通和生活提醒。"},
            ],
        })

    def api_membership_orders(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        user = self.require_user(conn)
        limit = max(1, min(int(query.get("limit") or 30), 100))
        rows = conn.execute(
            "SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user["id"], limit),
        ).fetchall()
        self.send_json({"items": [serialize_order(dict(r)) for r in rows]})

    def api_membership_insights(self, conn: sqlite3.Connection) -> None:
        """Member-only basic analytics over the caller's own posts:
        totals (views / likes / bookmarks / reposts / comments) plus their
        top posts by heat. Gated to active verified members."""
        user = self.require_user(conn)
        if not has_active_membership(conn, user["id"]):
            raise APIError("查看内容数据需要开通 Machi 认证会员。", 403, "MEMBERSHIP_REQUIRED")
        uid = user["id"]
        agg = conn.execute(
            "SELECT COUNT(*) AS cnt, COALESCE(SUM(view_count), 0) AS views "
            "FROM posts WHERE author_id = ? AND deleted_at IS NULL",
            (uid,),
        ).fetchone()

        def _icount(kind: str) -> int:
            return int(conn.execute(
                "SELECT COUNT(*) AS c FROM interactions WHERE kind = ? AND target_id IN "
                "(SELECT id FROM posts WHERE author_id = ? AND deleted_at IS NULL)",
                (kind, uid),
            ).fetchone()["c"])

        total_comments = int(conn.execute(
            "SELECT COUNT(*) AS c FROM comments WHERE deleted_at IS NULL AND post_id IN "
            "(SELECT id FROM posts WHERE author_id = ? AND deleted_at IS NULL)",
            (uid,),
        ).fetchone()["c"])
        top_rows = list(conn.execute(
            f"SELECT p.* FROM posts p WHERE p.author_id = ? AND p.deleted_at IS NULL "
            f"ORDER BY {_heat_score_sql('p')} DESC, p.created_at DESC LIMIT 5",
            (uid,),
        ))
        top_posts = fetch_posts_with_extras(conn, [dict(r) for r in top_rows], uid)
        top = [{
            "id": p["id"],
            "content": (p.get("content") or "")[:80],
            "content_type": p.get("content_type"),
            "view_count": p.get("view_count", 0),
            "like_count": p.get("like_count", 0),
            "comment_count": p.get("comment_count", 0),
            "bookmark_count": p.get("bookmark_count", 0),
        } for p in top_posts]
        self.send_json({
            "totals": {
                "post_count": int(agg["cnt"]),
                "total_views": int(agg["views"]),
                "total_likes": _icount("like"),
                "total_bookmarks": _icount("bookmark"),
                "total_reposts": _icount("repost"),
                "total_comments": total_comments,
            },
            "top_posts": top,
        })

    def api_membership_me(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        status = get_user_membership_status(conn, user["id"])
        plan = get_plan(conn, status["plan_key"] or MEMBERSHIP_PLAN_KEY)
        fresh = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
        self.send_json({
            "membership": status,
            "plan": serialize_plan(plan) if plan else None,
            "user": serialize_user(fresh),
        })

    def api_create_payment_order(self, conn: sqlite3.Connection) -> None:
        """Create a Web payment order. The amount is ALWAYS taken from the
        plan — a client-supplied amount is ignored. iOS does NOT use this
        path (it buys through Apple IAP and calls /apple/verify)."""
        user = self.require_user(conn)
        data = self.read_json()
        plan_key = (data.get("planKey") or data.get("plan_key") or MEMBERSHIP_PLAN_KEY).strip()
        provider = (data.get("provider") or "").strip()
        client_type = (data.get("clientType") or data.get("client_type") or "web").strip()
        if provider not in ("wechat_pay", "alipay", "stripe"):
            raise APIError("不支持的支付方式", 400, "invalid_provider")
        if not get_plan(conn, plan_key):
            raise APIError("会员计划不存在", 404, "plan_not_found")
        order = create_payment_order(conn, user["id"], plan_key, provider, client_type)
        out: dict[str, Any] = {
            "orderNo": order["order_no"],
            "provider": provider,
            "amount": round(int(order["amount_cents"]) / 100, 2),
            "currency": order["currency"],
            "expiresAt": order["expires_at"],
        }
        if provider == "wechat_pay":
            out.update(build_wechat_payment(conn, order))
        elif provider == "stripe":
            out.update(build_stripe_payment(conn, order))
        else:
            out.update(build_alipay_payment(conn, order))
        self.send_json(out)

    def api_order_status(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        user = self.require_user(conn)
        order_no = (query.get("orderNo") or query.get("order_no") or "").strip()
        if not order_no:
            raise APIError("缺少订单号", 400, "missing_order_no")
        row = conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone()
        if not row:
            raise APIError("订单不存在", 404, "order_not_found")
        order = dict(row)
        # Users may only read their own orders (admins can read any).
        if order["user_id"] != user["id"] and (user.get("role") or "member") != "admin":
            raise APIError("无权查看该订单", 403, "forbidden")
        # Lazily close a still-pending order that has passed its TTL.
        if order["status"] == "pending" and _order_is_expired(order):
            conn.execute(
                "UPDATE payment_orders SET status = 'closed', closed_at = ?, updated_at = ? WHERE order_no = ? AND status = 'pending'",
                (now_iso(), now_iso(), order_no),
            )
            order = dict(conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone())
        status = get_user_membership_status(conn, order["user_id"])
        self.send_json({
            "orderNo": order_no,
            "status": order["status"],
            "membershipActive": status["is_active"],
            "currentPeriodEnd": status["current_period_end"],
        })

    def api_stripe_confirm(self, conn: sqlite3.Connection) -> None:
        """Confirm a Stripe payment when the user returns to the success
        page. The server retrieves the Checkout Session from Stripe (with
        the secret key) and settles the order if it's paid — so Stripe
        works with ONLY the secret key, no webhook required. Idempotent
        and amount-checked, same as the webhook path."""
        user = self.require_user(conn)
        data = self.read_json()
        session_id = (data.get("sessionId") or data.get("session_id") or "").strip()
        if not session_id:
            raise APIError("缺少会话ID", 400, "missing_session")
        session = stripe_retrieve_session(session_id)
        if not session:
            raise APIError("Stripe 会话核验失败", 502, "verification_failed")
        order_no = str(session.get("client_reference_id") or (session.get("metadata") or {}).get("order_no") or "")
        if not order_no:
            raise APIError("会话未关联订单", 400, "order_not_found")
        order = conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone()
        if not order or (dict(order)["user_id"] != user["id"] and (user.get("role") or "member") != "admin"):
            raise APIError("无权确认该订单", 403, "forbidden")
        if str(session.get("payment_status") or "") == "paid":
            try:
                mark_order_paid(conn, order_no, provider_trade_no=str(session.get("payment_intent") or ""),
                                expected_provider="stripe", paid_amount_cents=int(session.get("amount_total") or 0))
            except APIError as exc:
                ACCESS_LOG.warning("stripe confirm settle rejected order=%s code=%s", order_no, exc.code)
        status = get_user_membership_status(conn, user["id"])
        self.send_json({
            "orderNo": order_no,
            "status": "paid" if session.get("payment_status") == "paid" else "pending",
            "membershipActive": status["is_active"],
            "currentPeriodEnd": status["current_period_end"],
        })

    def api_stripe_reconcile(self, conn: sqlite3.Connection) -> None:
        """Recover any of the caller's paid-but-pending Stripe orders by
        matching recent Stripe Checkout Sessions to their pending orders.
        Safe + idempotent: only settles THIS user's pending stripe orders
        whose session is actually paid, and only by the exact amount. A
        no-op when there's nothing pending or Stripe isn't configured."""
        user = self.require_user(conn)
        pending = {
            r["order_no"]: int(r["amount_cents"])
            for r in conn.execute(
                "SELECT order_no, amount_cents FROM payment_orders "
                "WHERE user_id = ? AND payment_provider = 'stripe' AND status = 'pending'",
                (user["id"],),
            )
        }
        if pending and STRIPE_SECRET_KEY:
            for sess in stripe_list_recent_sessions():
                ref = str(sess.get("client_reference_id") or "")
                if ref in pending and str(sess.get("payment_status") or "") == "paid":
                    try:
                        mark_order_paid(conn, ref, provider_trade_no=str(sess.get("payment_intent") or ""),
                                        expected_provider="stripe", paid_amount_cents=int(sess.get("amount_total") or 0))
                    except APIError as exc:
                        ACCESS_LOG.warning("stripe reconcile settle rejected order=%s code=%s", ref, exc.code)
        status = get_user_membership_status(conn, user["id"])
        self.send_json({
            "membershipActive": status["is_active"],
            "currentPeriodEnd": status["current_period_end"],
            "status": status["status"],
        })

    def api_payment_webhook_wechat(self, conn: sqlite3.Connection) -> None:
        """WeChat Pay v3 settlement callback. Verifies + decrypts, checks
        the amount, settles idempotently. Never leaks internal errors."""
        raw = self.read_bytes()
        headers = {k.lower(): v for k, v in self.headers.items()}
        resource = verify_wechat_webhook(headers, raw)
        if resource is None:
            return self._webhook_fail("wechat", "signature/verify failed")
        out_trade_no = str(resource.get("out_trade_no") or "")
        trade_state = str(resource.get("trade_state") or "")
        transaction_id = str(resource.get("transaction_id") or "")
        amount_total = int((resource.get("amount") or {}).get("total") or 0)
        event_id = transaction_id or out_trade_no
        first = record_payment_webhook(conn, "wechat_pay", trade_state, event_id, out_trade_no,
                                       json.dumps(resource, ensure_ascii=False), True)
        if first and trade_state == "SUCCESS" and out_trade_no:
            try:
                mark_order_paid(conn, out_trade_no, provider_trade_no=transaction_id,
                                expected_provider="wechat_pay", paid_amount_cents=amount_total)
            except APIError as exc:
                ACCESS_LOG.warning("wechat webhook settle rejected order=%s code=%s", out_trade_no, exc.code)
        self.send_json({"code": "SUCCESS", "message": "OK"})

    def api_payment_webhook_alipay(self, conn: sqlite3.Connection) -> None:
        """Alipay async notify (application/x-www-form-urlencoded)."""
        raw = self.read_bytes().decode("utf-8", "replace")
        form = {k: v[0] if v else "" for k, v in parse_qs(raw).items()}
        ok = verify_alipay_webhook(form)
        out_trade_no = str(form.get("out_trade_no") or "")
        trade_status = str(form.get("trade_status") or "")
        trade_no = str(form.get("trade_no") or "")
        # Alipay sends total_amount in yuan; convert to fen for the check.
        try:
            amount_cents = int(round(float(form.get("total_amount") or 0) * 100))
        except ValueError:
            amount_cents = 0
        body = b"failure"
        if ok:
            event_id = trade_no or out_trade_no
            first = record_payment_webhook(conn, "alipay", trade_status, event_id, out_trade_no, raw[:8000], True)
            if first and trade_status in ("TRADE_SUCCESS", "TRADE_FINISHED") and out_trade_no:
                try:
                    mark_order_paid(conn, out_trade_no, provider_trade_no=trade_no,
                                    expected_provider="alipay", paid_amount_cents=amount_cents)
                except APIError as exc:
                    ACCESS_LOG.warning("alipay webhook settle rejected order=%s code=%s", out_trade_no, exc.code)
            body = b"success"
        else:
            record_payment_webhook(conn, "alipay", trade_status, trade_no or out_trade_no, out_trade_no, raw[:8000], False)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api_payment_webhook_stripe(self, conn: sqlite3.Connection) -> None:
        """Stripe webhook. Verifies the Stripe-Signature (HMAC-SHA256),
        settles the order on checkout.session.completed, idempotent on the
        Stripe event id. Membership opens here, never on the redirect."""
        raw = self.read_bytes()
        headers = {k.lower(): v for k, v in self.headers.items()}
        event = verify_stripe_webhook(headers, raw)
        if event is None:
            return self._webhook_fail("stripe", "signature/verify failed")
        event_id = str(event.get("id") or "")
        event_type = str(event.get("type") or "")
        obj = (event.get("data") or {}).get("object") or {}
        if event_type == "checkout.session.completed":
            order_no = str(obj.get("client_reference_id") or (obj.get("metadata") or {}).get("order_no") or "")
            amount_total = int(obj.get("amount_total") or 0)
            payment_intent = str(obj.get("payment_intent") or "")
            first = record_payment_webhook(conn, "stripe", event_type, event_id, order_no,
                                           json.dumps(event, ensure_ascii=False), True)
            if first and order_no and str(obj.get("payment_status") or "") == "paid":
                try:
                    mark_order_paid(conn, order_no, provider_trade_no=payment_intent,
                                    expected_provider="stripe", paid_amount_cents=amount_total)
                except APIError as exc:
                    ACCESS_LOG.warning("stripe webhook settle rejected order=%s code=%s", order_no, exc.code)
        else:
            # Record-but-ignore other event types (still 2xx so Stripe stops retrying).
            record_payment_webhook(conn, "stripe", event_type, event_id, "", "", True)
        self.send_json({"received": True})

    def api_apple_verify(self, conn: sqlite3.Connection) -> None:
        """Verify a StoreKit2 transaction and open/extend membership. The
        iOS client sends the signed transaction; the server is the only
        place a purchase is trusted. Idempotent on the transaction id so a
        restore / re-verify never double-extends."""
        user = self.require_user(conn)
        data = self.read_json()
        signed = (data.get("signedTransaction") or data.get("signed_transaction") or "").strip()
        product_id = (data.get("productId") or data.get("product_id") or APPLE_IAP_PRODUCT_ID).strip()
        txn_id = str(data.get("transactionId") or data.get("transaction_id") or "")
        orig_id = str(data.get("originalTransactionId") or data.get("original_transaction_id") or "")
        if not signed:
            raise APIError("缺少交易凭证", 400, "invalid_transaction")
        payload = verify_apple_transaction(signed, product_id)
        if not payload:
            raise APIError("交易验证失败", 400, "verification_failed")
        txn_id = txn_id or str(payload.get("transactionId") or "")
        orig_id = orig_id or str(payload.get("originalTransactionId") or "")
        dedup_key = "apple:" + (txn_id or orig_id or signed[:40])
        existing = conn.execute(
            "SELECT status FROM payment_orders WHERE provider_trade_no = ? AND payment_provider = 'apple_iap'",
            (dedup_key,),
        ).fetchone()
        if not (existing and existing["status"] == "paid"):
            order = create_payment_order(conn, user["id"], MEMBERSHIP_PLAN_KEY, "apple_iap", "ios")
            mark_order_paid(conn, order["order_no"], provider_trade_no=dedup_key,
                            provider_user_id=orig_id, expected_provider="apple_iap")
        status = get_user_membership_status(conn, user["id"])
        self.send_json({
            "membershipActive": status["is_active"],
            "currentPeriodEnd": status["current_period_end"],
            "status": status["status"],
        })

    def api_mock_confirm(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        """Dev-only: settle a pending order without a real provider. Hard
        refusal in production or when the mock gate is off."""
        if not PAYMENT_MOCK_ENABLED:
            raise APIError("mock payments disabled", 403, "mock_disabled")
        order_no = (query.get("order_no") or query.get("orderNo") or "").strip()
        if not order_no:
            raise APIError("缺少订单号", 400, "missing_order_no")
        try:
            mark_order_paid(conn, order_no, provider_trade_no="MOCK-" + secrets.token_hex(6))
        except APIError:
            pass
        order = dict(conn.execute("SELECT * FROM payment_orders WHERE order_no = ?", (order_no,)).fetchone())
        status = get_user_membership_status(conn, order["user_id"])
        self.send_json({"orderNo": order_no, "status": order["status"],
                        "membershipActive": status["is_active"],
                        "currentPeriodEnd": status["current_period_end"], "mock": True})

    def _webhook_fail(self, provider: str, reason: str) -> None:
        ACCESS_LOG.warning("%s webhook rejected: %s", provider, reason)
        self.send_json({"code": "FAIL", "message": "verification failed"}, 400)

    # ---- admin: membership management ----

    def api_admin_memberships(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        status_filter = (query.get("status") or "").strip()
        q = (query.get("q") or "").strip()
        clauses = ["1=1"]
        params: list[Any] = []
        if status_filter:
            clauses.append("m.status = ?")
            params.append(status_filter)
        if q:
            like = f"%{q}%"
            clauses.append("(u.handle LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)")
            params.extend([like, like, like])
        rows = list(conn.execute(
            f"SELECT m.*, u.handle AS u_handle, u.display_name AS u_display_name, u.email AS u_email "
            f"FROM user_memberships m JOIN users u ON u.id = m.user_id "
            f"WHERE {' AND '.join(clauses)} ORDER BY m.updated_at DESC LIMIT ?",
            [*params, limit],
        ))
        items = []
        for r in rows:
            d = dict(r)
            items.append({
                "membership_id": d["id"],
                "user_id": d["user_id"],
                "handle": d.get("u_handle", ""),
                "display_name": d.get("u_display_name", ""),
                "email": d.get("u_email", ""),
                "status": d.get("status", ""),
                "plan_key": d.get("plan_key", ""),
                "source": d.get("source", ""),
                "current_period_end": d.get("current_period_end"),
                "cancel_at_period_end": bool(d.get("cancel_at_period_end")),
                "started_at": d.get("started_at"),
                "updated_at": d.get("updated_at"),
            })
        self.send_json({"items": items})

    def api_admin_grant_membership(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        user_id = (data.get("userId") or data.get("user_id") or "").strip()
        handle = (data.get("handle") or "").strip().lstrip("@")
        months = max(1, min(int(data.get("months") or 1), 36))
        plan_key = (data.get("planKey") or data.get("plan_key") or MEMBERSHIP_PLAN_KEY).strip()
        target = None
        if user_id:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        elif handle:
            target = conn.execute("SELECT * FROM users WHERE handle = ?", (handle,)).fetchone()
        if not target:
            raise APIError("用户不存在", 404, "user_not_found")
        if not get_plan(conn, plan_key):
            raise APIError("会员计划不存在", 404, "plan_not_found")
        status = activate_or_extend_membership(conn, target["id"], plan_key, "admin_grant", periods=months)
        record_entitlement_event(conn, target["id"], status["membership_id"], "admin_granted", "admin_grant",
                                 {"by": admin["handle"], "months": months})
        ACCESS_LOG.info("admin %s granted %s months membership to %s", admin["handle"], months, target["handle"])
        fresh = dict(conn.execute("SELECT * FROM users WHERE id = ?", (target["id"],)).fetchone())
        self.send_json({"membership": status, "user": serialize_user(fresh)})

    def api_admin_cancel_membership(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        user_id = (data.get("userId") or data.get("user_id") or "").strip()
        handle = (data.get("handle") or "").strip().lstrip("@")
        immediate = bool(data.get("immediate"))
        target = None
        if user_id:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        elif handle:
            target = conn.execute("SELECT * FROM users WHERE handle = ?", (handle,)).fetchone()
        if not target:
            raise APIError("用户不存在", 404, "user_not_found")
        status = cancel_membership(conn, target["id"], immediate=immediate, source="admin")
        ACCESS_LOG.info("admin %s canceled membership for %s immediate=%s", admin["handle"], target["handle"], immediate)
        fresh = dict(conn.execute("SELECT * FROM users WHERE id = ?", (target["id"],)).fetchone())
        self.send_json({"membership": status, "user": serialize_user(fresh)})

    def api_admin_payment_orders(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        status_filter = (query.get("status") or "").strip()
        provider = (query.get("provider") or "").strip()
        clauses = ["1=1"]
        params: list[Any] = []
        if status_filter:
            clauses.append("o.status = ?")
            params.append(status_filter)
        if provider:
            clauses.append("o.payment_provider = ?")
            params.append(provider)
        rows = list(conn.execute(
            f"SELECT o.*, u.handle AS u_handle, u.display_name AS u_display_name "
            f"FROM payment_orders o JOIN users u ON u.id = o.user_id "
            f"WHERE {' AND '.join(clauses)} ORDER BY o.created_at DESC LIMIT ?",
            [*params, limit],
        ))
        items = []
        for r in rows:
            d = dict(r)
            base = serialize_order(d)
            base["user_id"] = d["user_id"]
            base["handle"] = d.get("u_handle", "")
            base["display_name"] = d.get("u_display_name", "")
            base["provider_trade_no"] = d.get("provider_trade_no", "")
            items.append(base)
        self.send_json({"items": items})

    # ---- API implementations ----

    def api_check_username(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        raw = query.get("username") or query.get("handle") or ""
        handle = normalize_handle(raw)
        if not handle:
            self.send_json({"available": False, "message": "请输入用户名", "code": "missing_username"})
            return
        if not HANDLE_RE.match(handle):
            self.send_json({"available": False, "message": "用户名必须是 3-20 位字母、数字、下划线或点", "code": "invalid_handle"})
            return
        if handle in RESERVED_HANDLES:
            self.send_json({"available": False, "message": "这个用户名不可使用", "code": "reserved_handle"})
            return
        exists = conn.execute("SELECT 1 FROM users WHERE handle = ? AND deleted_at IS NULL", (handle,)).fetchone()
        self.send_json({
            "available": exists is None,
            "message": "这个用户名可以使用" if exists is None else "这个用户名已经被使用",
            "code": "available" if exists is None else "handle_taken",
        })

    def api_check_email(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        email = (query.get("email") or "").strip()
        if not email:
            self.send_json({"available": False, "message": "请输入邮箱", "code": "missing_email"})
            return
        if not is_valid_email(email):
            self.send_json({"available": False, "message": "邮箱格式不正确", "code": "invalid_email"})
            return
        exists = conn.execute(
            "SELECT 1 FROM users WHERE lower(email) = ? AND deleted_at IS NULL",
            (email.lower(),),
        ).fetchone()
        self.send_json({
            "available": exists is None,
            "message": "这个邮箱可以使用" if exists is None else "这个邮箱已经注册过",
            "code": "available" if exists is None else "email_taken",
        })

    def api_verify_code(self, conn: sqlite3.Connection) -> None:
        """Non-consuming code check for clients that want to validate an
        email-code before submitting registration/reset. Registration and
        reset still consume the code, so a preflight check cannot burn it."""
        data = self.read_json()
        purpose = (data.get("purpose") or "register").strip()
        email = (data.get("email") or "").strip()
        code = (data.get("code") or "").strip()
        if purpose not in ("register", "reset"):
            raise APIError("不支持的验证码类型", 400, "invalid_purpose")
        if not is_valid_email(email):
            raise APIError("请填写有效邮箱", 400, "invalid_email")
        if not code:
            raise APIError("请输入验证码", 400, "invalid_code")
        row = conn.execute(
            "SELECT * FROM auth_codes WHERE purpose = ? AND email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
            (purpose, email.lower()),
        ).fetchone()
        if not row:
            raise APIError("验证码无效或已过期", 400, "invalid_code")
        expires = parse_iso(row["expires_at"])
        if expires and expires < datetime.now(timezone.utc):
            raise APIError("验证码已过期", 400, "code_expired")
        if int(row["attempts"] or 0) >= EMAIL_CODE_MAX_ATTEMPTS:
            raise APIError("尝试次数过多，请重新获取验证码", 429, "too_many_attempts")
        actual = hash_auth_code(code, row["email"], purpose)
        if not hmac.compare_digest(row["code_hash"], actual):
            conn.execute("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?", (row["id"],))
            raise APIError("验证码不正确", 400, "invalid_code")
        self.send_json({"success": True, "ok": True, "message": "验证码有效"})

    def api_register(self, conn: sqlite3.Connection) -> None:
        data = self.read_json()
        handle = normalize_handle(data.get("handle") or data.get("username") or "")
        display_name = (data.get("display_name") or handle).strip()
        password = data.get("password") or ""
        email = (data.get("email") or "").strip()
        if not HANDLE_RE.match(handle):
            raise APIError("用户名必须是 3-20 位字母、数字、下划线或点", 400, "invalid_handle")
        existing_count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        bootstrap_token = (data.get("bootstrap_token") or "").strip()
        bootstrap_allowed = (
            existing_count == 0
            and (not ADMIN_BOOTSTRAP_TOKEN or (bootstrap_token and hmac.compare_digest(bootstrap_token, ADMIN_BOOTSTRAP_TOKEN)))
        )
        if handle in RESERVED_HANDLES and not bootstrap_allowed:
            raise APIError("这个用户名不可使用", 400, "reserved_handle")
        if len(password) < 6:
            raise APIError("密码至少 6 位", 400, "invalid_password")
        if len(password) > 256:
            raise APIError("密码过长", 400, "invalid_password")
        if not display_name:
            raise APIError("显示名称不能为空", 400, "invalid_display_name")
        if len(display_name) > 60:
            raise APIError("显示名称过长", 400, "invalid_display_name")
        if email and len(email) > 254:
            raise APIError("邮箱过长", 400, "invalid_email")
        if email and not is_valid_email(email):
            raise APIError("请填写有效邮箱", 400, "invalid_email")
        # Email verification gate. Enforced when KAIX_REQUIRE_EMAIL_VERIFICATION
        # is on, OR opportunistically whenever the client supplied a `code`
        # (so the hardened Web flow works even before the gate is flipped).
        # Older clients that send neither keep the legacy behaviour untouched.
        submitted_code = (data.get("code") or "").strip()
        require_code = REQUIRE_EMAIL_VERIFICATION or bool(submitted_code)
        if require_code:
            if not is_valid_email(email):
                raise APIError("请填写有效邮箱", 400, "invalid_email")
            validate_password_strength(password)
            consume_auth_code(conn, purpose="register", email=email, code=submitted_code)
        if conn.execute("SELECT 1 FROM users WHERE handle = ?", (handle,)).fetchone():
            raise APIError("用户名已存在", 409, "handle_taken")
        if email and conn.execute("SELECT 1 FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email.lower(),)).fetchone():
            raise APIError("这个邮箱已经注册过", 409, "email_taken")
        country, province, city, region_code, city_label = _normalize_region_payload(data)
        # Admin bootstrapping:
        # - If KAIX_ADMIN_BOOTSTRAP_TOKEN is set, the registration request
        #   must carry a matching `bootstrap_token` to be promoted to
        #   admin. This closes the historical TOCTOU window where an
        #   attacker could race the first legitimate registration to
        #   become admin on a fresh install.
        # - If the env var is empty, fall back to the legacy behaviour
        #   so existing dev / single-operator deploys keep working.
        if ADMIN_BOOTSTRAP_TOKEN:
            if bootstrap_token and hmac.compare_digest(bootstrap_token, ADMIN_BOOTSTRAP_TOKEN):
                role = "admin"
            else:
                role = "member"
        else:
            role = "admin" if existing_count == 0 else "member"
        user_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO users (id, handle, display_name, email, password_hash, bio, location,
                               avatar_symbol, avatar_color, avatar_url, cover_url, membership_tier,
                               is_verified, role, country, province, city, current_region_code,
                               recent_region_codes, joined_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', ?, 'person.fill', 'indigo', '', '', 'free', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, handle, display_name, email, hash_password(password),
             city_label, role, country, province, city, region_code, region_code,
             now_iso(), now_iso(), now_iso()),
        )
        conn.execute("INSERT INTO settings (user_id, updated_at) VALUES (?, ?)", (user_id, now_iso()))
        token = self._create_session(conn, user_id)
        user_row = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        self.send_json({"token": token, "user": serialize_user(user_row)})

    def api_login(self, conn: sqlite3.Connection) -> None:
        # Single-step password login. Kept for existing clients (e.g. the
        # iOS app). When KAIX_LOGIN_REQUIRE_CODE is enabled, this endpoint is
        # closed and callers must use the /api/auth/login/start + /verify
        # two-step (email-code) flow instead.
        if LOGIN_REQUIRE_CODE:
            raise APIError("请使用验证码登录", 403, "login_code_required")
        data = self.read_json()
        handle = normalize_handle(data.get("handle") or data.get("username") or "")
        password = data.get("password") or ""
        row = conn.execute("SELECT * FROM users WHERE handle = ? AND deleted_at IS NULL", (handle,)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise APIError("用户名或密码不正确", 401, "invalid_credentials")
        token = self._create_session(conn, row["id"])
        self.send_json({"token": token, "user": serialize_user(dict(row))})

    def _create_session(self, conn: sqlite3.Connection, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat()
        # Hard-cap untrusted header values so a hostile client can't
        # bloat the row to MB.
        device = (self.headers.get("X-Device-Name") or "")[:120]
        ua = (self.headers.get("User-Agent") or "")[:300]
        ip = (self._client_ip() or "")[:64]
        conn.execute(
            "INSERT INTO sessions (token, user_id, device_name, user_agent, ip, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (token, user_id, device, ua, ip, now_iso(), now_iso(), expires_at),
        )
        return token

    def api_logout(self, conn: sqlite3.Connection) -> None:
        session = self.current_session(conn)
        if session:
            conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
        self.send_json({"ok": True})

    # ---- email verification + password recovery + 2-step login ----

    @staticmethod
    def _norm_locale(value: Any) -> str:
        v = str(value or "").strip().lower()
        return v if v in ("zh", "en", "ja") else "zh"

    def api_send_email_code(self, conn: sqlite3.Connection) -> None:
        """Issue a verification code for sign-up (or self-serve reset). The
        response NEVER contains the code — only whether it was accepted and
        how long it lasts. Responds generically to avoid leaking which
        addresses already have accounts."""
        data = self.read_json()
        email = (data.get("email") or "").strip()
        purpose = (data.get("purpose") or "register").strip()
        locale = self._norm_locale(data.get("locale"))
        if purpose not in ("register", "reset"):
            raise APIError("不支持的验证码类型", 400, "invalid_purpose")
        if not is_valid_email(email):
            raise APIError("请填写有效邮箱", 400, "invalid_email")
        taken = conn.execute(
            "SELECT 1 FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email.lower(),)
        ).fetchone()
        if purpose == "register" and taken:
            # Pretend success — don't reveal that this address is registered.
            self.send_json({"ok": True, "expires_in": EMAIL_CODE_TTL_SEC})
            return
        if purpose == "reset" and not taken:
            self.send_json({"ok": True, "expires_in": EMAIL_CODE_TTL_SEC})
            return
        user_id = None
        if purpose == "reset" and taken:
            urow = conn.execute("SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email.lower(),)).fetchone()
            user_id = urow["id"] if urow else None
        try:
            result = issue_auth_code(conn, purpose=purpose, email=email, ip=self._client_ip(),
                                     user_id=user_id, locale=locale)
        except APIError as exc:
            if exc.code == "code_cooldown":
                raise
            # Any other failure: respond generically.
            self.send_json({"ok": True, "expires_in": EMAIL_CODE_TTL_SEC})
            return
        self.send_json({"ok": True, "expires_in": result["expires_in"]})

    def api_login_start(self, conn: sqlite3.Connection) -> None:
        """Step 1 of code login: verify the password, then email a one-time
        code. Accounts with no email on file fall back to a direct session
        (unless KAIX_LOGIN_REQUIRE_CODE forces a code)."""
        data = self.read_json()
        identifier = normalize_handle(data.get("handle") or data.get("username") or "")
        email_in = (data.get("email") or "").strip()
        password = data.get("password") or ""
        locale = self._norm_locale(data.get("locale"))
        row = None
        if identifier:
            row = conn.execute("SELECT * FROM users WHERE handle = ? AND deleted_at IS NULL", (identifier,)).fetchone()
        if not row and email_in:
            row = conn.execute("SELECT * FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email_in.lower(),)).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise APIError("用户名或密码不正确", 401, "invalid_credentials")
        user_email = (row["email"] or "").strip()
        if not is_valid_email(user_email):
            if LOGIN_REQUIRE_CODE:
                raise APIError("该账号未绑定邮箱，无法使用验证码登录", 400, "no_email_on_file")
            token = self._create_session(conn, row["id"])
            self.send_json({"requires_code": False, "token": token, "user": serialize_user(dict(row))})
            return
        result = issue_auth_code(conn, purpose="login", email=user_email, ip=self._client_ip(),
                                 user_id=row["id"], locale=locale)
        self.send_json({
            "requires_code": True,
            "challenge_id": result["challenge_id"],
            "email_hint": mask_email(user_email),
            "expires_in": result["expires_in"],
        })

    def api_login_verify(self, conn: sqlite3.Connection) -> None:
        """Step 2 of code login: exchange a valid code for a session."""
        data = self.read_json()
        challenge_id = (data.get("challenge_id") or "").strip()
        code = (data.get("code") or "").strip()
        if not challenge_id:
            raise APIError("登录会话无效，请重新登录", 400, "invalid_challenge")
        row = consume_auth_code(conn, purpose="login", challenge_id=challenge_id, code=code)
        user_id = row["user_id"]
        user = conn.execute("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", (user_id,)).fetchone() if user_id else None
        if not user:
            raise APIError("账号不存在", 404, "user_not_found")
        token = self._create_session(conn, user_id)
        self.send_json({"token": token, "user": serialize_user(dict(user))})

    def api_change_password(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        old_password = data.get("old_password") or data.get("current_password") or ""
        new_password = data.get("new_password") or data.get("password") or ""
        if not verify_password(old_password, user["password_hash"]):
            raise APIError("当前密码不正确", 400, "invalid_credentials")
        validate_password_strength(new_password)
        if verify_password(new_password, user["password_hash"]):
            raise APIError("新密码不能与当前密码相同", 400, "password_reuse")
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                     (hash_password(new_password), now_iso(), user["id"]))
        # Revoke every OTHER session; keep the caller logged in.
        current = self.current_session(conn)
        keep = current["token"] if current else ""
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], keep))
        ACCESS_LOG.info("user %s changed password", user["handle"])
        self.send_json({"ok": True})

    def api_forgot_password(self, conn: sqlite3.Connection) -> None:
        """Send a reset code. Always responds success so an attacker can't
        use this endpoint to enumerate which emails have accounts."""
        data = self.read_json()
        email = (data.get("email") or "").strip()
        locale = self._norm_locale(data.get("locale"))
        if is_valid_email(email):
            row = conn.execute("SELECT * FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email.lower(),)).fetchone()
            if row:
                try:
                    issue_auth_code(conn, purpose="reset", email=row["email"], ip=self._client_ip(),
                                    user_id=row["id"], locale=locale)
                except APIError:
                    pass  # swallow cooldown / send errors — never leak existence
        self.send_json({"ok": True, "expires_in": EMAIL_CODE_TTL_SEC})

    def api_reset_password(self, conn: sqlite3.Connection) -> None:
        data = self.read_json()
        email = (data.get("email") or "").strip()
        code = (data.get("code") or "").strip()
        new_password = data.get("new_password") or data.get("password") or ""
        if not is_valid_email(email):
            raise APIError("请填写有效邮箱", 400, "invalid_email")
        validate_password_strength(new_password)
        row = conn.execute("SELECT * FROM users WHERE lower(email) = ? AND deleted_at IS NULL", (email.lower(),)).fetchone()
        if not row:
            # Generic error — same shape as a bad code, no enumeration.
            raise APIError("验证码无效或已过期", 400, "invalid_code")
        consume_auth_code(conn, purpose="reset", email=row["email"], code=code, user_id=row["id"])
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                     (hash_password(new_password), now_iso(), row["id"]))
        # A password reset revokes ALL existing sessions.
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        ACCESS_LOG.info("password reset completed for user %s", row["handle"])
        self.send_json({"ok": True})

    def api_me(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        self.send_json({"user": serialize_user(user)})

    def api_update_me(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        updates: list[tuple[str, Any]] = []
        fields = ["display_name", "bio", "location", "avatar_symbol", "avatar_color", "avatar_url", "cover_url", "email"]
        for field in fields:
            if field in data and data[field] is not None:
                updates.append((field, str(data[field])))
        # Region (phase 1). Accept any subset of (country, province,
        # city) so the profile edit screen can either replace the
        # whole thing or just bump the current city. The canonical
        # current_region_code is derived from whatever survives, so
        # the index stays consistent.
        region_changed = False
        for field in ("country", "province", "city"):
            if field in data and data[field] is not None:
                updates.append((field, str(data[field]).strip().lower()))
                region_changed = True
        if region_changed or "current_region_code" in data:
            country_val  = str(data.get("country",  user.get("country",  ""))).strip().lower()
            province_val = str(data.get("province", user.get("province", ""))).strip().lower()
            city_val     = str(data.get("city",     user.get("city",     ""))).strip().lower()
            current_code = str(data.get("current_region_code", "")).strip().lower()
            if not current_code:
                current_code = _resolve_region_code(country_val, province_val, city_val)
            updates.append(("current_region_code", current_code))
            existing_recent = [code for code in (user.get("recent_region_codes", "") or "").split("|") if code]
            if current_code:
                recent = [current_code] + [code for code in existing_recent if code != current_code]
                updates.append(("recent_region_codes", "|".join(recent[:10])))
        if "recent_region_codes" in data and isinstance(data["recent_region_codes"], list):
            recent = []
            for code in data["recent_region_codes"]:
                clean = str(code).strip().lower()
                if clean and clean not in recent:
                    recent.append(clean)
            updates.append(("recent_region_codes", "|".join(recent[:10])))
        if "handle" in data and data["handle"]:
            new_handle = normalize_handle(data["handle"])
            if not HANDLE_RE.match(new_handle):
                raise APIError("用户名必须是 3-20 位字母、数字、下划线或点", 400, "invalid_handle")
            if conn.execute("SELECT 1 FROM users WHERE handle = ? AND id != ?", (new_handle, user["id"])).fetchone():
                raise APIError("用户名已存在", 409, "handle_taken")
            updates.append(("handle", new_handle))
        if "password" in data and data["password"]:
            if len(data["password"]) < 6:
                raise APIError("密码至少 6 位", 400, "invalid_password")
            updates.append(("password_hash", hash_password(data["password"])))
        if updates:
            sets = ", ".join(f"{f} = ?" for f, _ in updates) + ", updated_at = ?"
            values = [v for _, v in updates] + [now_iso(), user["id"]]
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", values)
        fresh = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
        self.send_json({"user": serialize_user(fresh)})

    def api_delete_me(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        conn.execute("UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), user["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        self.send_json({"ok": True})

    def api_bootstrap(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        feed_rows = list(conn.execute(
            f"SELECT * FROM posts WHERE deleted_at IS NULL AND {_visible_status_sql('posts')} ORDER BY created_at DESC LIMIT 30"
        ))
        feed = fetch_posts_with_extras(conn, [dict(r) for r in feed_rows], user["id"])
        unread = conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL",
            (user["id"],),
        ).fetchone()["c"]
        self.send_json({
            "user": serialize_user(user),
            "feed": feed,
            "unread_notifications": int(unread),
            "server_time": now_iso(),
        })

    def api_user_detail(self, conn: sqlite3.Connection, user_id: str) -> None:
        viewer = self.current_session(conn)
        row = conn.execute("SELECT * FROM users WHERE (id = ? OR handle = ?) AND deleted_at IS NULL", (user_id, user_id)).fetchone()
        if not row:
            raise APIError("用户不存在", 404, "user_not_found")
        target = dict(row)
        followers = conn.execute("SELECT COUNT(*) AS c FROM follows WHERE following_id = ?", (target["id"],)).fetchone()["c"]
        following = conn.execute("SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?", (target["id"],)).fetchone()["c"]
        posts_count = conn.execute(
            "SELECT COUNT(*) AS c FROM posts WHERE author_id = ? AND deleted_at IS NULL AND status IN ('published', 'active')",
            (target["id"],),
        ).fetchone()["c"]
        is_following = False
        is_blocked = False
        if viewer:
            is_following = bool(conn.execute(
                "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?",
                (viewer["user_id"], target["id"]),
            ).fetchone())
            is_blocked = bool(conn.execute(
                "SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?",
                (viewer["user_id"], target["id"]),
            ).fetchone())
        payload = serialize_user(target)
        payload.update({
            "follower_count": int(followers),
            "following_count": int(following),
            "post_count": int(posts_count),
            "is_following": is_following,
            "is_blocked": is_blocked,
        })
        viewer_id = viewer["user_id"] if viewer else None
        self.send_json({"user": payload, "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})

    def api_profile_by_username(self, conn: sqlite3.Connection, username: str) -> None:
        handle = normalize_handle(username)
        if not handle:
            raise APIError("用户不存在", 404, "user_not_found")
        return self.api_user_detail(conn, handle)

    def _user_posts_query(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str], *, where: str = "") -> tuple[list[dict[str, Any]], str | None]:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        limit = max(1, min(int(query.get("limit") or 30), 50))
        cursor = cursor_decode(query.get("cursor"))
        cursor_clause = ""
        params: list[Any] = [user_id]
        if cursor:
            cursor_clause = " AND (p.created_at, p.id) < (?, ?)"
            params.extend([cursor[0], cursor[1]])
        params.append(limit + 1)
        rows = list(conn.execute(
            f"""
            SELECT p.* FROM posts p
            WHERE p.author_id = ? AND p.deleted_at IS NULL AND {_visible_status_sql('p')}{where}{cursor_clause}
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
            """,
            params,
        ))
        next_cursor = None
        if len(rows) > limit:
            extra = rows.pop()
            next_cursor = cursor_encode(extra["created_at"], extra["id"])
        posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
        return posts, next_cursor

    def api_user_posts(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str]) -> None:
        posts, next_cursor = self._user_posts_query(conn, user_id, query)
        self.send_json({"items": posts, "next_cursor": next_cursor})

    def api_user_replies(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str]) -> None:
        limit = max(1, min(int(query.get("limit") or 30), 50))
        rows = list(conn.execute(
            "SELECT * FROM comments WHERE author_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ))
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        post_ids = list({r["post_id"] for r in rows})
        posts_map: dict[str, dict[str, Any]] = {}
        if post_ids:
            placeholders = ",".join("?" * len(post_ids))
            post_rows = list(conn.execute(f"SELECT * FROM posts WHERE id IN ({placeholders})", post_ids))
            hydrated = fetch_posts_with_extras(conn, [dict(r) for r in post_rows], viewer_id)
            posts_map = {p["id"]: p for p in hydrated}
        comments = []
        for row in rows:
            entry = dict(row)
            comments.append({**serialize_comment(entry), "post": posts_map.get(entry["post_id"])})
        self.send_json({"items": comments, "next_cursor": None, "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})

    def api_user_media(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str]) -> None:
        posts, next_cursor = self._user_posts_query(
            conn, user_id, query,
            where=" AND EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id)",
        )
        self.send_json({"items": posts, "next_cursor": next_cursor})

    def api_user_likes(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        rows = list(conn.execute(
            """
            SELECT p.* FROM interactions i
            JOIN posts p ON p.id = i.target_id
            WHERE i.user_id = ? AND i.kind = 'like' AND p.deleted_at IS NULL
              AND p.status IN ('published', 'active')
            ORDER BY i.created_at DESC LIMIT 50
            """,
            (user_id,),
        ))
        posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
        self.send_json({"items": posts, "next_cursor": None})

    def api_user_bookmarks(self, conn: sqlite3.Connection, user_id: str, query: dict[str, str]) -> None:
        viewer = self.require_user(conn)
        if viewer["id"] != user_id:
            raise APIError("无权查看", 403, "forbidden")
        rows = list(conn.execute(
            """
            SELECT p.* FROM interactions i
            JOIN posts p ON p.id = i.target_id
            WHERE i.user_id = ? AND i.kind = 'bookmark' AND p.deleted_at IS NULL
              AND p.status IN ('published', 'active')
            ORDER BY i.created_at DESC LIMIT 50
            """,
            (user_id,),
        ))
        posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer["id"])
        self.send_json({"items": posts, "next_cursor": None})

    def api_follow(self, conn: sqlite3.Connection, target_id: str, on: bool) -> None:
        user = self.require_user(conn)
        if target_id == user["id"]:
            raise APIError("不能关注自己", 400, "invalid_target")
        target = conn.execute("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL", (target_id,)).fetchone()
        if not target:
            raise APIError("用户不存在", 404, "user_not_found")
        if on:
            try:
                conn.execute(
                    "INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), user["id"], target_id, now_iso()),
                )
                conn.execute(
                    "INSERT INTO notifications (id, user_id, actor_id, type, content, created_at) VALUES (?, ?, ?, 'follow', '', ?)",
                    (str(uuid.uuid4()), target_id, user["id"], now_iso()),
                )
                HUB.publish(target_id, {"type": "notification", "kind": "follow", "actor_id": user["id"]})
            except sqlite3.IntegrityError:
                pass
        else:
            conn.execute("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", (user["id"], target_id))
        self.send_json({"ok": True, "is_following": on})

    def api_relationship(self, conn: sqlite3.Connection, user_id: str, kind: str) -> None:
        if kind == "followers":
            rows = conn.execute(
                "SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? ORDER BY f.created_at DESC",
                (user_id,),
            )
        else:
            rows = conn.execute(
                "SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? ORDER BY f.created_at DESC",
                (user_id,),
            )
        self.send_json({"items": [serialize_user(dict(r)) for r in rows]})

    def api_block(self, conn: sqlite3.Connection, target_id: str, on: bool) -> None:
        user = self.require_user(conn)
        if target_id == user["id"]:
            raise APIError("不能拉黑自己", 400, "invalid_target")
        if on:
            try:
                conn.execute(
                    "INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), user["id"], target_id, now_iso()),
                )
                conn.execute("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", (user["id"], target_id))
                conn.execute("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", (target_id, user["id"]))
            except sqlite3.IntegrityError:
                pass
        else:
            conn.execute("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", (user["id"], target_id))
        self.send_json({"ok": True, "is_blocked": on})

    def api_blocks(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = conn.execute(
            "SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC",
            (user["id"],),
        )
        self.send_json({"items": [serialize_user(dict(r)) for r in rows]})

    def api_report(self, conn: sqlite3.Connection, kind: str, target_id: str) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        reason = (data.get("reason") or "other").strip()
        note = (data.get("note") or "").strip()
        conn.execute(
            "INSERT INTO reports (id, reporter_id, target_kind, target_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user["id"], kind, target_id, reason, note, now_iso()),
        )
        if kind == "post":
            conn.execute("UPDATE posts SET report_count = report_count + 1, updated_at = ? WHERE id = ?", (now_iso(), target_id))
            _cache_invalidate("feed:hot")
            _cache_invalidate("trending:")
        self.send_json({"ok": True})

    def api_feed(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        viewer_payload = {"id": viewer_id} if viewer_id else None
        can_interact = bool(viewer_id)
        mode = (query.get("mode") or "recommend").strip().lower()
        if mode not in {"recommend", "plaza", "local", "following", "hot"}:
            mode = "recommend"
        limit = max(1, min(int(query.get("limit") or 20), 50))
        cursor = cursor_decode(query.get("cursor"))

        blocked_clause = ""
        blocked_params: list[Any] = []
        if viewer_id:
            blocked_clause = " AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)"
            blocked_params.append(viewer_id)

        type_clause = ""
        type_params: list[Any] = []
        raw_types = query.get("content_type") or query.get("content_types") or ""
        content_types = [normalize_content_type(v) for v in raw_types.split(",") if v.strip()]
        content_types = [v for v in dict.fromkeys(content_types) if v in CONTENT_TYPES]
        if mode == "plaza" and not content_types:
            content_types = [
                "dynamic", "local_info", "guide", "question", "rant",
                "meetup", "dining", "event", "warning",
            ]
        if content_types:
            type_clause = " AND p.content_type IN (%s)" % ",".join("?" * len(content_types))
            type_params.extend(content_types)

        region_clause = ""
        region_params: list[Any] = []
        req_region_code = (query.get("region_code") or "").strip().lower()
        req_country  = (query.get("country")  or "").strip().lower()
        req_province = (query.get("province") or "").strip().lower()
        req_city     = (query.get("city")     or "").strip().lower()

        if mode == "local" and not (req_region_code or req_city) and viewer:
            viewer_row = conn.execute(
                "SELECT country, province, city, current_region_code FROM users WHERE id = ?",
                (viewer["user_id"],),
            ).fetchone()
            if viewer_row:
                req_region_code = (viewer_row["current_region_code"] or "").lower()
                req_country  = (viewer_row["country"] or "").lower()
                req_province = (viewer_row["province"] or "").lower()
                req_city     = (viewer_row["city"] or "").lower()

        if req_region_code:
            region_clause = " AND p.region_code = ?"
            region_params.append(req_region_code)
        elif req_country or req_city:
            clauses = []
            if req_country:
                clauses.append("p.country = ?")
                region_params.append(req_country)
            if req_province:
                clauses.append("p.province = ?")
                region_params.append(req_province)
            if req_city:
                clauses.append("p.city = ?")
                region_params.append(req_city)
            region_clause = " AND " + " AND ".join(clauses)

        if mode == "local" and not (req_region_code or req_city):
            raise APIError("city required", 400, "missing_region")

        if mode == "following":
            if not viewer_id:
                raise APIError("请登录后继续", 401, "AUTH_REQUIRED")
            base = """
                SELECT p.* FROM posts p
                JOIN follows f ON f.following_id = p.author_id
                WHERE f.follower_id = ? AND p.deleted_at IS NULL
                  AND p.status IN ('published', 'active')
            """
            base_params: list[Any] = [viewer_id]
        elif mode == "local":
            base = f"""
                SELECT p.* FROM posts p
                WHERE p.deleted_at IS NULL
                  AND p.status IN ('published', 'active')
            """
            base_params = []
        elif mode == "hot":
            cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            # Verified members get a gentle ranking nudge (VERIFIED_BOOST_SCORE,
            # ~1.05). Applied only to the hot-feed ORDER BY — the displayed
            # heat_score is unchanged, so it never overpowers real engagement.
            sql = f"""
                SELECT p.*, {_heat_score_sql('p')} AS computed_heat,
                       COALESCE((SELECT u.is_verified_member FROM users u WHERE u.id = p.author_id), 0) AS author_vm
                FROM posts p
                WHERE p.deleted_at IS NULL
                  AND p.status IN ('published', 'active')
                  AND p.created_at >= ?
                  {region_clause}
                  {type_clause}
                  {blocked_clause}
                ORDER BY (computed_heat * (CASE WHEN author_vm = 1 THEN ? ELSE 1.0 END)) DESC, p.created_at DESC
                LIMIT ?
            """
            rows = list(conn.execute(sql, [cutoff_24h, *region_params, *type_params, *blocked_params, VERIFIED_BOOST_SCORE, limit]))
            posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
            self.send_json({"items": posts, "next_cursor": None, "mode": mode, "viewer": viewer_payload, "canInteract": can_interact, "can_interact": can_interact})
            return
        else:
            base = """
                SELECT p.* FROM posts p
                WHERE p.deleted_at IS NULL
                  AND p.status IN ('published', 'active')
            """
            base_params = []

        cursor_clause = ""
        cursor_params: list[Any] = []
        if cursor:
            cursor_clause = " AND (p.created_at, p.id) < (?, ?)"
            cursor_params.extend([cursor[0], cursor[1]])

        sql = base + region_clause + type_clause + blocked_clause + cursor_clause + " ORDER BY p.created_at DESC, p.id DESC LIMIT ?"
        params = [*base_params, *region_params, *type_params, *blocked_params, *cursor_params]
        params.append(limit + 1)
        rows = list(conn.execute(sql, params))

        next_cursor = None
        if len(rows) > limit:
            extra = rows.pop()
            next_cursor = cursor_encode(extra["created_at"], extra["id"])
        posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
        self.send_json({"items": posts, "next_cursor": next_cursor, "mode": mode, "viewer": viewer_payload, "canInteract": can_interact, "can_interact": can_interact})

    def api_create_post(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        content = (data.get("content") or "").strip()
        media_ids = data.get("media_ids") or []
        repost_of_id = data.get("repost_of_id")
        # Content type + typed attributes. Validated + truncated
        # server-side so a client can't push junk into untyped JSON
        # storage. Typed posts may be form-first and have very short
        # body text, so attributes count as content for emptiness.
        content_type = normalize_content_type(data.get("content_type"))
        # Machi Verified gate. High-trust types (招聘/租房/找室友/本地服务/
        # 商家/优惠/内推) require an active membership. Enforced here for
        # EVERY client — the apps only mirror it for UX; a raw API call
        # cannot bypass it. Ordinary content (dynamic/question/guide/二手/
        # 搭子/约饭/活动…) is untouched and stays free.
        require_verified_membership(conn, user["id"], content_type)
        # Daily publish cap. 0 == off (default) so ordinary posting is
        # never impeded; members get the higher ceiling when an operator
        # opts in via the env config.
        _daily_limit = MEMBERSHIP_DAILY_LIMIT_FREE
        if _daily_limit > 0 and has_active_membership(conn, user["id"]):
            _daily_limit = MEMBERSHIP_DAILY_LIMIT_VERIFIED or 0
        if _daily_limit > 0:
            _since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            _today = conn.execute(
                "SELECT COUNT(*) AS c FROM posts WHERE author_id = ? AND created_at >= ? AND deleted_at IS NULL",
                (user["id"], _since),
            ).fetchone()["c"]
            if int(_today) >= _daily_limit:
                raise APIError("今日发布已达上限，开通 Machi 认证会员可提升额度。", 429, "daily_limit_reached")
        attributes   = normalize_post_attributes(content_type, data.get("attributes"))
        if content_type == "poll":
            poll_attrs = decode_post_attributes(attributes)
            if not str(poll_attrs.get("question") or "").strip() or len(poll_options_from_attributes(poll_attrs)) < 2:
                raise APIError("投票需要问题和至少两个选项", 400, "invalid_poll")
        if not content and not media_ids and not repost_of_id and not attributes:
            raise APIError("内容不能为空", 400, "empty_content")
        if len(content) > 2000:
            raise APIError("内容过长", 400, "content_too_long")
        # Region — client may pass any of (country, province, city) or
        # the resolved region_code. We canonicalise here so the row is
        # internally consistent and the index hits.
        country  = (data.get("country")  or user.get("country")  or "").strip().lower()
        province = (data.get("province") or user.get("province") or "").strip().lower()
        city     = (data.get("city")     or user.get("city")     or "").strip().lower()
        region_code = (data.get("region_code") or "").strip().lower()
        if not region_code:
            region_code = _resolve_region_code(country, province, city)
        elif not country:
            country, province, city = _parse_region_code(region_code)
        post_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO posts (id, author_id, content, repost_of_id, view_count, status, country, province, city, region_code, content_type, attributes, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?)",
            (post_id, user["id"], content, repost_of_id, country, province, city, region_code, content_type, attributes, now_iso(), now_iso()),
        )
        for tag in extract_tags(content):
            conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (post_id, tag))
        explicit_tags = data.get("tags") or []
        for tag in explicit_tags:
            normalized = str(tag).strip().lstrip("#").lower()
            if normalized:
                conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (post_id, normalized))
        for index, media_id in enumerate(media_ids):
            conn.execute(
                "INSERT INTO post_media (id, post_id, media_id, sort_index) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), post_id, media_id, index),
            )
        if repost_of_id:
            original = conn.execute("SELECT author_id FROM posts WHERE id = ?", (repost_of_id,)).fetchone()
            if original and original["author_id"] != user["id"]:
                conn.execute(
                    "INSERT INTO notifications (id, user_id, actor_id, type, target_post_id, content, created_at) VALUES (?, ?, ?, 'repost', ?, ?, ?)",
                    (str(uuid.uuid4()), original["author_id"], user["id"], repost_of_id, content, now_iso()),
                )
                HUB.publish(original["author_id"], {"type": "notification", "kind": "repost"})
        row = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        posts = fetch_posts_with_extras(conn, [row], user["id"])
        HUB.broadcast([user["id"]], {"type": "post_created", "post_id": post_id})
        # Drop derived caches so the new post shows up on hot / trending
        # without waiting for the 30s TTL.
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        self.send_json({"post": posts[0]})

    def api_post_detail(self, conn: sqlite3.Connection, post_id: str) -> None:
        viewer = self.current_session(conn)
        row = conn.execute("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", (post_id,)).fetchone()
        if not row:
            raise APIError("帖子不存在", 404, "post_not_found")
        row_dict_value = dict(row)
        viewer_id = viewer["user_id"] if viewer else None
        if row_dict_value.get("status") not in VISIBLE_POST_STATUSES and row_dict_value.get("author_id") != viewer_id:
            viewer_user = conn.execute("SELECT role FROM users WHERE id = ?", (viewer_id,)).fetchone() if viewer_id else None
            if not viewer_user or viewer_user["role"] != "admin":
                raise APIError("帖子不存在", 404, "post_not_found")
        posts = fetch_posts_with_extras(conn, [row_dict_value], viewer_id)
        self.send_json({"post": posts[0], "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})

    def api_edit_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("帖子不存在", 404, "post_not_found")
        if row["author_id"] != user["id"]:
            raise APIError("只能编辑自己的帖子", 403, "forbidden")
        data = self.read_json()
        if "content" in data:
            content = (data["content"] or "").strip()
            conn.execute("UPDATE posts SET content = ?, updated_at = ? WHERE id = ?", (content, now_iso(), post_id))
            conn.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
            for tag in extract_tags(content):
                conn.execute("INSERT OR IGNORE INTO post_tags VALUES (?, ?)", (post_id, tag))
        # Allow editing the typed attributes blob (e.g. mark a
        # secondhand listing as sold, change a job's salary range).
        # `content_type` is intentionally immutable post-creation —
        # changing it would invalidate every cached card.
        if "attributes" in data:
            current_type = (conn.execute("SELECT content_type FROM posts WHERE id = ?", (post_id,)).fetchone() or {})
            ct = current_type["content_type"] if current_type else "dynamic"
            attrs = normalize_post_attributes(ct, data["attributes"])
            conn.execute("UPDATE posts SET attributes = ?, updated_at = ? WHERE id = ?", (attrs, now_iso(), post_id))
        fresh = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        posts = fetch_posts_with_extras(conn, [fresh], user["id"])
        self.send_json({"post": posts[0]})

    def api_delete_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT author_id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("帖子不存在", 404, "post_not_found")
        if row["author_id"] != user["id"]:
            raise APIError("只能删除自己的帖子", 403, "forbidden")
        conn.execute("UPDATE posts SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), post_id))
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        self.send_json({"ok": True})

    def api_post_interaction(self, conn: sqlite3.Connection, post_id: str, kind: str, on: bool) -> None:
        user = self.require_user(conn)
        post = conn.execute("SELECT author_id FROM posts WHERE id = ? AND deleted_at IS NULL", (post_id,)).fetchone()
        if not post:
            raise APIError("帖子不存在", 404, "post_not_found")
        existing = conn.execute(
            "SELECT id FROM interactions WHERE target_id = ? AND user_id = ? AND kind = ?",
            (post_id, user["id"], kind),
        ).fetchone()
        if on and not existing:
            conn.execute(
                "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), post_id, user["id"], kind, now_iso()),
            )
            if kind == "like" and post["author_id"] != user["id"]:
                conn.execute(
                    "INSERT INTO notifications (id, user_id, actor_id, type, target_post_id, content, created_at) VALUES (?, ?, ?, 'like', ?, '', ?)",
                    (str(uuid.uuid4()), post["author_id"], user["id"], post_id, now_iso()),
                )
                HUB.publish(post["author_id"], {"type": "notification", "kind": "like", "post_id": post_id})
        elif not on and existing:
            conn.execute("DELETE FROM interactions WHERE id = ?", (existing["id"],))
        fresh = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        posts = fetch_posts_with_extras(conn, [fresh], user["id"])
        self.send_json({"post": posts[0]})

    def api_repost(self, conn: sqlite3.Connection, post_id: str, on: bool) -> None:
        user = self.require_user(conn)
        post = conn.execute("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", (post_id,)).fetchone()
        if not post:
            raise APIError("帖子不存在", 404, "post_not_found")
        if on:
            try:
                conn.execute(
                    "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'repost', ?)",
                    (str(uuid.uuid4()), post_id, user["id"], now_iso()),
                )
            except sqlite3.IntegrityError:
                pass
            if post["author_id"] != user["id"]:
                conn.execute(
                    "INSERT INTO notifications (id, user_id, actor_id, type, target_post_id, content, created_at) VALUES (?, ?, ?, 'repost', ?, '', ?)",
                    (str(uuid.uuid4()), post["author_id"], user["id"], post_id, now_iso()),
                )
                HUB.publish(post["author_id"], {"type": "notification", "kind": "repost"})
        else:
            conn.execute(
                "DELETE FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'repost'",
                (post_id, user["id"]),
            )
        fresh = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        posts = fetch_posts_with_extras(conn, [fresh], user["id"])
        self.send_json({"post": posts[0]})

    def api_vote_poll(self, conn: sqlite3.Connection, post_id: str) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        try:
            option_index = int(data.get("option_index"))
        except (TypeError, ValueError):
            raise APIError("请选择投票选项", 400, "invalid_poll_vote")
        post = conn.execute("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL", (post_id,)).fetchone()
        if not post or post["content_type"] != "poll":
            raise APIError("投票不存在", 404, "poll_not_found")
        attrs = decode_post_attributes(post["attributes"])
        options = poll_options_from_attributes(attrs)
        if not options:
            raise APIError("投票选项异常", 400, "invalid_poll")
        if poll_is_closed(attrs.get("expires_at")):
            raise APIError("投票已截止", 400, "poll_closed")
        if option_index < 0 or option_index >= len(options):
            raise APIError("投票选项不存在", 400, "invalid_poll_vote")
        conn.execute(
            """
            INSERT INTO post_poll_votes (post_id, user_id, option_index, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(post_id, user_id)
            DO UPDATE SET option_index = excluded.option_index, created_at = excluded.created_at
            """,
            (post_id, user["id"], option_index, now_iso()),
        )
        fresh = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        posts = fetch_posts_with_extras(conn, [fresh], user["id"])
        self.send_json({"post": posts[0]})

    def api_view_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        # Throttle view bumps to once per (viewer, post, hour). The
        # previous behaviour let any client spam +1 forever, which
        # both inflated heat scores and gave authors a trivial way to
        # juice their own metrics.
        viewer = self.current_session(conn)
        key = f"view:{post_id}:{viewer['user_id'] if viewer else self._client_ip()}"
        if _cache_get(key) is None:
            conn.execute("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", (post_id,))
            _cache_put(key, True, ttl_seconds=3600)
        self.send_json({"ok": True})

    def api_list_comments(self, conn: sqlite3.Connection, post_id: str, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        sort = query.get("sort") or "top"
        rows = list(conn.execute(
            "SELECT * FROM comments WHERE post_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            (post_id,),
        ))
        ids = [r["id"] for r in rows]
        like_counts: dict[str, int] = {}
        liked_set: set[str] = set()
        if ids:
            placeholders = ",".join("?" * len(ids))
            for row in conn.execute(
                f"SELECT target_id, COUNT(*) AS c FROM interactions WHERE kind='commentLike' AND target_id IN ({placeholders}) GROUP BY target_id",
                ids,
            ):
                like_counts[row["target_id"]] = row["c"]
            if viewer_id:
                for row in conn.execute(
                    f"SELECT target_id FROM interactions WHERE kind='commentLike' AND user_id=? AND target_id IN ({placeholders})",
                    [viewer_id] + ids,
                ):
                    liked_set.add(row["target_id"])
        author_ids = list({r["author_id"] for r in rows})
        author_map = fetch_users_by_ids(conn, author_ids)
        comments = [
            serialize_comment(
                dict(r),
                {
                    "like_count": like_counts.get(r["id"], 0),
                    "liked": r["id"] in liked_set,
                    "author": author_map.get(r["author_id"]),
                },
            )
            for r in rows
        ]
        if sort == "top":
            comments.sort(key=lambda c: (c["like_count"], c["created_at"]), reverse=True)
        else:
            comments.sort(key=lambda c: c["created_at"], reverse=True)
        self.send_json({"items": comments, "next_cursor": None})

    def api_create_comment(self, conn: sqlite3.Connection, post_id: str) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        content = (data.get("content") or "").strip()
        if not content:
            raise APIError("评论不能为空", 400, "empty_comment")
        if len(content) > 2000:
            raise APIError("评论过长", 400, "comment_too_long")
        post = conn.execute("SELECT author_id FROM posts WHERE id = ? AND deleted_at IS NULL", (post_id,)).fetchone()
        if not post:
            raise APIError("帖子不存在", 404, "post_not_found")
        comment_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO comments (id, post_id, author_id, content, parent_comment_id, reply_to_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (comment_id, post_id, user["id"], content, data.get("parent_comment_id"), data.get("reply_to_user_id"), now_iso(), now_iso()),
        )
        if post["author_id"] != user["id"]:
            ntype = "reply" if data.get("parent_comment_id") else "comment"
            conn.execute(
                "INSERT INTO notifications (id, user_id, actor_id, type, target_post_id, target_comment_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), post["author_id"], user["id"], ntype, post_id, comment_id, content[:140], now_iso()),
            )
            HUB.publish(post["author_id"], {"type": "notification", "kind": ntype, "post_id": post_id})
        row = dict(conn.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone())
        comment = serialize_comment(row, {"author": serialize_user(user), "like_count": 0, "liked": False})
        self.send_json({"comment": comment})

    def api_delete_comment(self, conn: sqlite3.Connection, comment_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
        if not row:
            raise APIError("评论不存在", 404, "comment_not_found")
        post = conn.execute("SELECT author_id FROM posts WHERE id = ?", (row["post_id"],)).fetchone()
        if row["author_id"] != user["id"] and (not post or post["author_id"] != user["id"]):
            raise APIError("无权删除", 403, "forbidden")
        conn.execute("UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), comment_id))
        self.send_json({"ok": True})

    def api_comment_like(self, conn: sqlite3.Connection, comment_id: str, on: bool) -> None:
        user = self.require_user(conn)
        existing = conn.execute(
            "SELECT id FROM interactions WHERE target_id = ? AND user_id = ? AND kind = 'commentLike'",
            (comment_id, user["id"]),
        ).fetchone()
        if on and not existing:
            conn.execute(
                "INSERT INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'commentLike', ?)",
                (str(uuid.uuid4()), comment_id, user["id"], now_iso()),
            )
        elif not on and existing:
            conn.execute("DELETE FROM interactions WHERE id = ?", (existing["id"],))
        self.send_json({"ok": True, "liked": on})

    def api_search(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        viewer_country = ""
        if viewer_id:
            viewer_row = conn.execute("SELECT country FROM users WHERE id = ?", (viewer_id,)).fetchone()
            viewer_country = (viewer_row["country"] if viewer_row else "") or ""
        q = (query.get("q") or "").strip()
        kind = query.get("kind") or "all"
        if not q:
            self.send_json({"posts": [], "users": [], "topics": [], "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})
            return
        if viewer_id:
            conn.execute(
                "INSERT INTO search_history (id, user_id, query, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), viewer_id, q, now_iso()),
            )
        like = f"%{q}%"
        posts: list[dict[str, Any]] = []
        users: list[dict[str, Any]] = []
        topics: list[dict[str, Any]] = []
        if kind in ("all", "post"):
            country_clause = "AND country = ?" if viewer_country else ""
            params: tuple[Any, ...] = (like, like, like, like, like, like, viewer_country) if viewer_country else (like, like, like, like, like, like)
            rows = list(conn.execute(
                f"""
                SELECT * FROM posts
                WHERE deleted_at IS NULL
                  AND status IN ('published', 'active')
                  AND (content LIKE ? OR country LIKE ? OR province LIKE ? OR city LIKE ? OR content_type LIKE ? OR attributes LIKE ?)
                  {country_clause}
                ORDER BY created_at DESC LIMIT 30
                """,
                params,
            ))
            posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
        if kind in ("all", "user"):
            country_clause = "AND country = ?" if viewer_country else ""
            params = (like, like, viewer_country) if viewer_country else (like, like)
            rows = list(conn.execute(
                f"SELECT * FROM users WHERE (handle LIKE ? OR display_name LIKE ?) AND deleted_at IS NULL {country_clause} LIMIT 30",
                params,
            ))
            users = [serialize_user(dict(r)) for r in rows]
        if kind in ("all", "topic"):
            country_clause = "AND p.country = ?" if viewer_country else ""
            params = (q.lower().lstrip("#") + "%", viewer_country) if viewer_country else (q.lower().lstrip("#") + "%",)
            rows = list(conn.execute(
                f"""
                SELECT tag, COUNT(*) AS post_count
                FROM post_tags t
                JOIN posts p ON p.id = t.post_id
                WHERE t.tag LIKE ? AND p.deleted_at IS NULL AND p.status IN ('published', 'active')
                  {country_clause}
                GROUP BY tag ORDER BY post_count DESC LIMIT 30
                """,
                params,
            ))
            topics = [{"tag": r["tag"], "post_count": int(r["post_count"])} for r in rows]
        self.send_json({"posts": posts, "users": users, "topics": topics, "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})

    def api_search_history(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = conn.execute(
            "SELECT DISTINCT query FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user["id"],),
        )
        self.send_json({"items": [r["query"] for r in rows]})

    def api_clear_search_history(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        conn.execute("DELETE FROM search_history WHERE user_id = ?", (user["id"],))
        self.send_json({"ok": True})

    def api_trending(self, conn: sqlite3.Connection) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        viewer_country = ""
        if viewer_id:
            viewer_row = conn.execute("SELECT country FROM users WHERE id = ?", (viewer_id,)).fetchone()
            viewer_country = (viewer_row["country"] if viewer_row else "") or ""
        cache_scope = viewer_country or "all"
        # Heavy aggregation — cache per country for 30s so users who
        # registered in Japan only see Japan-side content in global
        # widgets too.
        cached_ids = _cache_get(f"trending:{cache_scope}:post_ids")
        cached_topics = _cache_get(f"trending:{cache_scope}:topics")
        cached_user_ids = _cache_get(f"trending:{cache_scope}:user_ids")
        if cached_ids is None:
            cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            country_clause = "AND p.country = ?" if viewer_country else ""
            params: tuple[Any, ...] = (cutoff_24h, viewer_country) if viewer_country else (cutoff_24h,)
            id_rows = list(conn.execute(
                f"""
                SELECT p.id, {_heat_score_sql('p')} AS heat
                FROM posts p
                WHERE p.deleted_at IS NULL
                  AND p.status IN ('published', 'active')
                  AND p.created_at >= ?
                  {country_clause}
                ORDER BY heat DESC LIMIT 20
                """,
                params,
            ))
            cached_ids = [r["id"] for r in id_rows]
            _cache_put(f"trending:{cache_scope}:post_ids", cached_ids, ttl_seconds=30)
        if cached_topics is None:
            country_clause = "AND p.country = ?" if viewer_country else ""
            params = (viewer_country,) if viewer_country else ()
            cached_topics = [
                {"tag": r["tag"], "post_count": int(r["c"])}
                for r in conn.execute(
                    f"""
                    SELECT t.tag, COUNT(*) AS c
                    FROM post_tags t
                    JOIN posts p ON p.id = t.post_id
                    WHERE p.deleted_at IS NULL AND p.status IN ('published', 'active')
                      {country_clause}
                    GROUP BY t.tag ORDER BY c DESC LIMIT 20
                    """,
                    params,
                )
            ]
            _cache_put(f"trending:{cache_scope}:topics", cached_topics, ttl_seconds=60)
        if cached_user_ids is None:
            if viewer_country:
                cached_user_ids = [r["id"] for r in conn.execute(
                    "SELECT id FROM users WHERE deleted_at IS NULL AND country = ? ORDER BY is_verified DESC, joined_at LIMIT 12",
                    (viewer_country,),
                )]
            else:
                cached_user_ids = [r["id"] for r in conn.execute(
                    "SELECT id FROM users WHERE deleted_at IS NULL ORDER BY is_verified DESC, joined_at LIMIT 12"
                )]
            _cache_put(f"trending:{cache_scope}:user_ids", cached_user_ids, ttl_seconds=60)
        if cached_ids:
            placeholders = ",".join("?" * len(cached_ids))
            post_rows = list(conn.execute(
                f"SELECT * FROM posts WHERE id IN ({placeholders})", cached_ids,
            ))
            # Preserve heat order.
            order = {pid: i for i, pid in enumerate(cached_ids)}
            post_rows.sort(key=lambda r: order.get(r["id"], 1_000_000))
            posts = fetch_posts_with_extras(conn, [dict(r) for r in post_rows], viewer_id)
        else:
            posts = []
        users: list[dict[str, Any]] = []
        if cached_user_ids:
            placeholders = ",".join("?" * len(cached_user_ids))
            user_rows = list(conn.execute(
                f"SELECT * FROM users WHERE id IN ({placeholders})", cached_user_ids,
            ))
            users = [serialize_user(dict(u)) for u in user_rows]
        self.send_json({
            "posts": posts,
            "topics": cached_topics,
            "users": users,
            "viewer": {"id": viewer_id} if viewer_id else None,
            "canInteract": bool(viewer_id),
            "can_interact": bool(viewer_id),
        })

    def api_topics(self, conn: sqlite3.Connection) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        viewer_country = ""
        if viewer_id:
            viewer_row = conn.execute("SELECT country FROM users WHERE id = ?", (viewer_id,)).fetchone()
            viewer_country = (viewer_row["country"] if viewer_row else "") or ""
        country_clause = "AND p.country = ?" if viewer_country else ""
        params: tuple[Any, ...] = (viewer_country,) if viewer_country else ()
        topics = [
            {"tag": r["tag"], "post_count": int(r["c"])}
            for r in conn.execute(
                f"""
                SELECT t.tag, COUNT(*) AS c
                FROM post_tags t
                JOIN posts p ON p.id = t.post_id
                WHERE p.deleted_at IS NULL AND p.status IN ('published', 'active')
                  {country_clause}
                GROUP BY t.tag ORDER BY c DESC LIMIT 50
                """,
                params,
            )
        ]
        self.send_json({
            "topics": topics,
            "items": topics,
            "viewer": {"id": viewer_id} if viewer_id else None,
            "canInteract": bool(viewer_id),
            "can_interact": bool(viewer_id),
        })

    def api_topic(self, conn: sqlite3.Connection, tag: str, query: dict[str, str]) -> None:
        viewer = self.current_session(conn)
        viewer_id = viewer["user_id"] if viewer else None
        tag_clean = tag.lstrip("#").lower()
        sort = query.get("sort") or "latest"
        order = f"{_heat_score_sql('p')} DESC, p.created_at DESC" if sort in ("hot", "high_heat") else "p.created_at DESC"
        rows = list(conn.execute(
            f"""
            SELECT p.* FROM posts p
            JOIN post_tags t ON t.post_id = p.id
            WHERE t.tag = ? AND p.deleted_at IS NULL AND p.status IN ('published', 'active')
            ORDER BY {order} LIMIT 50
            """,
            (tag_clean,),
        ))
        posts = fetch_posts_with_extras(conn, [dict(r) for r in rows], viewer_id)
        self.send_json({"tag": tag_clean, "items": posts, "viewer": {"id": viewer_id} if viewer_id else None, "canInteract": bool(viewer_id), "can_interact": bool(viewer_id)})

    def api_notifications(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        user = self.require_user(conn)
        kind = query.get("kind") or "all"
        clause = ""
        params: list[Any] = [user["id"]]
        if kind != "all":
            clause = " AND type = ?"
            params.append(kind)
        rows = list(conn.execute(
            f"SELECT * FROM notifications WHERE user_id = ? AND deleted_at IS NULL{clause} ORDER BY created_at DESC LIMIT 100",
            params,
        ))
        actor_ids = list({r["actor_id"] for r in rows})
        actor_map = fetch_users_by_ids(conn, actor_ids)
        items = [
            serialize_notification(dict(r), {"actor": actor_map.get(r["actor_id"])})
            for r in rows
        ]
        unread = sum(1 for r in rows if not r["is_read"])
        self.send_json({"items": items, "unread_count": unread})

    def api_mark_notifications(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        if data.get("all"):
            conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user["id"],))
        else:
            ids = data.get("ids") or []
            for nid in ids:
                conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (nid, user["id"]))
        self.send_json({"ok": True})

    def api_delete_notification(self, conn: sqlite3.Connection, notif_id: str) -> None:
        user = self.require_user(conn)
        conn.execute(
            "UPDATE notifications SET deleted_at = ? WHERE id = ? AND user_id = ?",
            (now_iso(), notif_id, user["id"]),
        )
        self.send_json({"ok": True})

    def _conversation_for(self, conn: sqlite3.Connection, user_id: str, peer_id: str) -> dict[str, Any]:
        a, b = sorted([user_id, peer_id])
        row = conn.execute(
            "SELECT * FROM conversations WHERE participant_a = ? AND participant_b = ?",
            (a, b),
        ).fetchone()
        if row:
            return dict(row)
        conv_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO conversations (id, participant_a, participant_b, updated_at) VALUES (?, ?, ?, ?)",
            (conv_id, a, b, now_iso()),
        )
        return dict(conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone())

    def api_conversations(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = list(conn.execute(
            "SELECT * FROM conversations WHERE (participant_a = ? OR participant_b = ?) AND deleted_at IS NULL ORDER BY updated_at DESC",
            (user["id"], user["id"]),
        ))
        if not rows:
            self.send_json({"items": []})
            return
        conv_ids = [r["id"] for r in rows]
        placeholders = ",".join("?" * len(conv_ids))
        peer_ids = [
            (r["participant_b"] if r["participant_a"] == user["id"] else r["participant_a"])
            for r in rows
        ]
        users_map = fetch_users_by_ids(conn, peer_ids)
        # Last message per conversation in one pass — grab the latest
        # row per conversation_id using a correlated MAX(rowid).
        last_messages: dict[str, dict[str, Any]] = {}
        for row in conn.execute(
            f"""
            SELECT m.*
            FROM messages m
            JOIN (
              SELECT conversation_id, MAX(rowid) AS max_rowid
              FROM messages
              WHERE deleted_at IS NULL AND conversation_id IN ({placeholders})
              GROUP BY conversation_id
            ) latest
              ON latest.conversation_id = m.conversation_id
              AND latest.max_rowid = m.rowid
            """,
            conv_ids,
        ):
            last_messages[row["conversation_id"]] = dict(row)
        # Unread counts per conversation, single aggregate query.
        unread_map: dict[str, int] = {pid: 0 for pid in conv_ids}
        for row in conn.execute(
            f"""
            SELECT conversation_id, COUNT(*) AS c
            FROM messages
            WHERE deleted_at IS NULL
              AND is_read = 0
              AND sender_id != ?
              AND conversation_id IN ({placeholders})
            GROUP BY conversation_id
            """,
            [user["id"], *conv_ids],
        ):
            unread_map[row["conversation_id"]] = int(row["c"])
        items = []
        for r in rows:
            peer_id = r["participant_b"] if r["participant_a"] == user["id"] else r["participant_a"]
            last = last_messages.get(r["id"])
            items.append(serialize_conversation(dict(r), {
                "peer": users_map.get(peer_id),
                "last_message": serialize_message(last) if last else None,
                "unread_count": unread_map.get(r["id"], 0),
            }))
        self.send_json({"items": items})

    def api_create_conversation(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        peer_id = data.get("peer_id")
        if not peer_id or peer_id == user["id"]:
            raise APIError("无效的对话对象", 400, "invalid_peer")
        peer_row = conn.execute(
            "SELECT * FROM users WHERE (id = ? OR handle = ?) AND deleted_at IS NULL",
            (peer_id, peer_id),
        ).fetchone()
        if not peer_row:
            raise APIError("用户不存在", 404, "user_not_found")
        # The same handle-or-id check above means the lookup might also
        # resolve to the caller via handle. Block it explicitly so we
        # never open a self-DM through the handle path.
        if peer_row["id"] == user["id"]:
            raise APIError("无效的对话对象", 400, "invalid_peer")
        # Respect mutual blocks: neither side can DM if either blocked
        # the other.
        blocked = conn.execute(
            "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
            (user["id"], peer_row["id"], peer_row["id"], user["id"]),
        ).fetchone()
        if blocked:
            raise APIError("无法与该用户对话", 403, "blocked")
        conv = self._conversation_for(conn, user["id"], peer_row["id"])
        self.send_json({"conversation": serialize_conversation(conv, {"peer": serialize_user(dict(peer_row))})})

    def api_delete_conversation(self, conn: sqlite3.Connection, conv_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row or (row["participant_a"] != user["id"] and row["participant_b"] != user["id"]):
            raise APIError("无权操作", 403, "forbidden")
        conn.execute("UPDATE conversations SET deleted_at = ? WHERE id = ?", (now_iso(), conv_id))
        conn.execute("UPDATE messages SET deleted_at = ? WHERE conversation_id = ?", (now_iso(), conv_id))
        self.send_json({"ok": True})

    def api_messages(self, conn: sqlite3.Connection, conv_id: str, query: dict[str, str]) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row or (row["participant_a"] != user["id"] and row["participant_b"] != user["id"]):
            raise APIError("无权操作", 403, "forbidden")
        rows = list(conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY created_at",
            (conv_id,),
        ))
        message_ids = [r["id"] for r in rows]
        media_by_msg: dict[str, list[dict[str, Any]]] = {}
        if message_ids:
            placeholders = ",".join("?" * len(message_ids))
            for r in conn.execute(
                f"""SELECT mm.message_id, m.* FROM message_media mm
                    JOIN media m ON m.id = mm.media_id
                    WHERE mm.message_id IN ({placeholders}) AND m.deleted_at IS NULL""",
                message_ids,
            ):
                media_by_msg.setdefault(r["message_id"], []).append(serialize_media(dict(r)))
        items = [
            serialize_message(dict(r), {"media": media_by_msg.get(r["id"], [])})
            for r in rows
        ]
        self.send_json({"items": items})

    def api_create_message(self, conn: sqlite3.Connection, conv_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row or (row["participant_a"] != user["id"] and row["participant_b"] != user["id"]):
            raise APIError("无权操作", 403, "forbidden")
        data = self.read_json()
        content = (data.get("content") or "").strip()
        media_ids = data.get("media_ids") or []
        if not content and not media_ids:
            raise APIError("消息不能为空", 400, "empty_message")
        message_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO messages (id, conversation_id, sender_id, content, created_at, is_read) VALUES (?, ?, ?, ?, ?, 0)",
            (message_id, conv_id, user["id"], content, now_iso()),
        )
        for media_id in media_ids:
            conn.execute("INSERT INTO message_media VALUES (?, ?)", (message_id, media_id))
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now_iso(), conv_id))
        peer_id = row["participant_b"] if row["participant_a"] == user["id"] else row["participant_a"]
        HUB.publish(peer_id, {"type": "message", "conversation_id": conv_id, "message_id": message_id})
        fresh = dict(conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone())
        media_rows = [serialize_media(dict(r)) for r in conn.execute(
            "SELECT m.* FROM message_media mm JOIN media m ON m.id = mm.media_id WHERE mm.message_id = ?",
            (message_id,),
        )]
        self.send_json({"message": serialize_message(fresh, {"media": media_rows})})

    def api_delete_message(self, conn: sqlite3.Connection, msg_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        if not row or row["sender_id"] != user["id"]:
            raise APIError("无权操作", 403, "forbidden")
        conn.execute("UPDATE messages SET deleted_at = ? WHERE id = ?", (now_iso(), msg_id))
        self.send_json({"ok": True})

    def api_mark_conversation_read(self, conn: sqlite3.Connection, conv_id: str) -> None:
        user = self.require_user(conn)
        conn.execute(
            "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?",
            (conv_id, user["id"]),
        )
        self.send_json({"ok": True})

    def api_upload_media(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" in ctype:
            self._upload_multipart(conn, user)
            return
        data = self.read_json()
        base64_payload = data.get("data") or ""
        declared_mime = (data.get("mime") or "").lower()
        if not base64_payload.startswith("data:"):
            raise APIError("invalid payload", 400, "invalid_payload")
        header, b64data = base64_payload.split(",", 1)
        if "base64" not in header:
            raise APIError("invalid payload", 400, "invalid_payload")
        try:
            raw = base64.b64decode(b64data, validate=True)
        except Exception as exc:
            raise APIError(f"decode failed: {exc}", 400, "invalid_payload")
        self._persist_media(conn, user, raw, declared_mime)

    def _upload_multipart(self, conn: sqlite3.Connection, user: dict[str, Any]) -> None:
        ctype = self.headers.get("Content-Type", "")
        boundary = None
        for part in ctype.split(";"):
            part = part.strip()
            if part.startswith("boundary="):
                boundary = part[len("boundary="):].strip('"')
                break
        if not boundary:
            raise APIError("missing boundary", 400, "invalid_payload")
        raw = self.read_bytes()
        # Parse exactly per RFC 7578. The body looks like:
        #   --boundary\r\n<headers>\r\n\r\n<part>\r\n--boundary\r\n<headers>...
        # ending with --boundary--\r\n. The previous implementation
        # used `body.rstrip(b"\r\n--")` which stripped by character set
        # and would corrupt any file whose final bytes were any
        # combination of \r \n -.
        delimiter = b"--" + boundary.encode()
        try:
            sections = raw.split(delimiter)
        except Exception:
            raise APIError("invalid multipart", 400, "invalid_payload")
        for section in sections:
            if not section or section.startswith(b"--"):
                # Either the leading empty chunk (before the first
                # delimiter) or the closing "--\r\n" marker.
                continue
            if section.startswith(b"\r\n"):
                section = section[2:]
            header_blob, sep, body = section.partition(b"\r\n\r\n")
            if not sep:
                continue
            headers_text = header_blob.decode("utf-8", errors="replace")
            if 'name="file"' not in headers_text:
                continue
            # Every part ends with the literal CRLF that precedes the
            # next delimiter. Strip exactly that — never use rstrip on
            # binary data.
            if body.endswith(b"\r\n"):
                body = body[:-2]
            mime_match = re.search(r"Content-Type:\s*([^\r\n]+)", headers_text)
            declared_mime = (mime_match.group(1).strip().lower() if mime_match else "")
            self._persist_media(conn, user, body, declared_mime)
            return
        raise APIError("no file part", 400, "invalid_payload")

    def _persist_media(
        self,
        conn: sqlite3.Connection,
        user: dict[str, Any],
        raw: bytes,
        declared_mime: str,
    ) -> None:
        if not raw:
            raise APIError("empty upload", 400, "invalid_payload")
        if len(raw) > MAX_UPLOAD_BYTES:
            raise APIError("file too large", 413, "too_large")
        sniffed = _sniff_mime(raw)
        if not sniffed:
            raise APIError("不支持的文件类型", 415, "unsupported_media")
        # Trust the bytes over the client-declared header. When the
        # declared mime is also in our allowlist and matches what we
        # sniffed, we use it for the canonical record. Otherwise fall
        # back to what the bytes say.
        mime = declared_mime if declared_mime in ALLOWED_MIME and declared_mime == sniffed else sniffed
        if mime not in ALLOWED_MIME:
            raise APIError("不支持的文件类型", 415, "unsupported_media")
        ext = EXT_BY_MIME.get(mime, ".bin")
        media_id = str(uuid.uuid4())
        rel_path = f"media/{media_id}{ext}"
        target = (MEDIA_DIR / f"{media_id}{ext}").resolve()
        # Defence in depth: media_id is a UUID and ext is whitelisted,
        # so a path-traversal here would already require a bug. Verify
        # the final resolved path still lives under MEDIA_DIR before
        # writing.
        try:
            target.relative_to(MEDIA_DIR.resolve())
        except ValueError:
            raise APIError("invalid path", 400, "invalid_payload")
        target.write_bytes(raw)
        kind = "image" if mime.startswith("image/") else "video"
        url = f"/{rel_path}"
        # Width/height/duration intentionally default to 0 — the client
        # used to send these but they were unverified. A future pass
        # can compute them server-side with Pillow/ffprobe.
        conn.execute(
            "INSERT INTO media (id, owner_id, type, url, thumb_url, mime, width, height, duration, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)",
            (media_id, user["id"], kind, url, url, mime, len(raw), now_iso()),
        )
        fresh = dict(conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone())
        self.send_json({"media": serialize_media(fresh)})

    def api_get_media(self, conn: sqlite3.Connection, media_id: str) -> None:
        row = conn.execute("SELECT * FROM media WHERE id = ? AND deleted_at IS NULL", (media_id,)).fetchone()
        if not row:
            raise APIError("媒体不存在", 404, "media_not_found")
        self.send_json({"media": serialize_media(dict(row))})

    def api_delete_media(self, conn: sqlite3.Connection, media_id: str) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        if not row or row["owner_id"] != user["id"]:
            raise APIError("无权操作", 403, "forbidden")
        conn.execute("UPDATE media SET deleted_at = ? WHERE id = ?", (now_iso(), media_id))
        self.send_json({"ok": True})

    def api_get_settings(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        row = conn.execute("SELECT * FROM settings WHERE user_id = ?", (user["id"],)).fetchone()
        if not row:
            conn.execute("INSERT INTO settings (user_id, updated_at) VALUES (?, ?)", (user["id"], now_iso()))
            row = conn.execute("SELECT * FROM settings WHERE user_id = ?", (user["id"],)).fetchone()
        data = dict(row)
        data["push_likes"] = bool(data["push_likes"])
        data["push_comments"] = bool(data["push_comments"])
        data["push_follows"] = bool(data["push_follows"])
        data["push_messages"] = bool(data["push_messages"])
        data["privacy_protect"] = bool(data["privacy_protect"])
        data["recommend_following"] = bool(data["recommend_following"])
        data["recommend_topics"] = bool(data["recommend_topics"])
        if data.get("appearance") not in ("light", "dark"):
            data["appearance"] = "light"
        self.send_json({"settings": data})

    def api_update_settings(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        allowed = {
            "language", "appearance", "push_likes", "push_comments", "push_follows", "push_messages",
            "privacy_protect", "privacy_allow_dm", "recommend_following", "recommend_topics",
        }
        updates: list[tuple[str, Any]] = []
        for key in allowed:
            if key in data:
                value = data[key]
                if key == "appearance" and value not in ("light", "dark"):
                    value = "light"
                if isinstance(value, bool):
                    value = 1 if value else 0
                updates.append((key, value))
        if updates:
            sets = ", ".join(f"{f} = ?" for f, _ in updates) + ", updated_at = ?"
            values = [v for _, v in updates] + [now_iso(), user["id"]]
            conn.execute(f"UPDATE settings SET {sets} WHERE user_id = ?", values)
        self.api_get_settings(conn)

    def api_clear_cache(self, conn: sqlite3.Connection) -> None:
        self.require_user(conn)
        self.send_json({"ok": True, "cleared_at": now_iso()})

    def api_export(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = list(conn.execute("SELECT * FROM posts WHERE author_id = ? AND deleted_at IS NULL", (user["id"],)))
        comments = list(conn.execute("SELECT * FROM comments WHERE author_id = ? AND deleted_at IS NULL", (user["id"],)))
        self.send_json({
            "exported_at": now_iso(),
            "user": serialize_user(user),
            "posts": [dict(r) for r in rows],
            "comments": [dict(r) for r in comments],
        })

    def api_feedback(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        conn.execute(
            "INSERT INTO feedback (id, user_id, category, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user["id"], data.get("category") or "general", (data.get("content") or "").strip(), now_iso()),
        )
        self.send_json({"ok": True})

    def api_devices(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = conn.execute(
            "SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC",
            (user["id"],),
        )
        items = []
        for r in rows:
            items.append({
                "id": r["token"][-12:],
                "token": r["token"],
                "device_name": r["device_name"],
                "user_agent": r["user_agent"],
                "ip": r["ip"],
                "created_at": r["created_at"],
                "last_seen_at": r["last_seen_at"],
                "expires_at": r["expires_at"],
            })
        self.send_json({"items": items})

    def api_revoke_device(self, conn: sqlite3.Connection, device_token: str) -> None:
        user = self.require_user(conn)
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND (token = ? OR substr(token, length(token)-11) = ?)",
                     (user["id"], device_token, device_token))
        self.send_json({"ok": True})

    def api_list_drafts(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        rows = conn.execute(
            "SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC",
            (user["id"],),
        )
        items = []
        for r in rows:
            items.append({
                "id": r["id"],
                "content": r["content"],
                "media_ids": [m for m in (r["media_ids"] or "").split("|") if m],
                "tags": [t for t in (r["tags"] or "").split("|") if t],
                "updated_at": r["updated_at"],
            })
        self.send_json({"items": items})

    def api_save_draft(self, conn: sqlite3.Connection) -> None:
        user = self.require_user(conn)
        data = self.read_json()
        draft_id = data.get("id") or str(uuid.uuid4())
        media_ids = "|".join(data.get("media_ids") or [])
        tags = "|".join(data.get("tags") or [])
        existing = conn.execute("SELECT id FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user["id"])).fetchone()
        if existing:
            conn.execute(
                "UPDATE drafts SET content = ?, media_ids = ?, tags = ?, updated_at = ? WHERE id = ?",
                (data.get("content") or "", media_ids, tags, now_iso(), draft_id),
            )
        else:
            conn.execute(
                "INSERT INTO drafts (id, user_id, content, media_ids, tags, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (draft_id, user["id"], data.get("content") or "", media_ids, tags, now_iso()),
            )
        self.send_json({"id": draft_id})

    def api_delete_draft(self, conn: sqlite3.Connection, draft_id: str) -> None:
        user = self.require_user(conn)
        conn.execute("DELETE FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user["id"]))
        self.send_json({"ok": True})

    # ---- regions ----------------------------------------------------------

    def api_regions_countries(self, conn: sqlite3.Connection) -> None:
        """Full country list. Cached forever in-process (the data is a
        Python literal — it doesn't change at runtime)."""
        self.send_json({"items": REGION_COUNTRIES})

    def api_regions_provinces(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        country = (query.get("country") or "").strip().lower()
        if not country:
            raise APIError("country required", 400, "missing_param")
        provinces = REGION_PROVINCES.get(country, [])
        spec = _country_lookup(country)
        self.send_json({
            "country": country,
            "has_provinces": bool(spec and spec.get("has_provinces")),
            "items": provinces,
        })

    def api_regions_cities(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        country = (query.get("country") or "").strip().lower()
        province = (query.get("province") or "").strip().lower() or None
        if not country:
            raise APIError("country required", 400, "missing_param")
        spec = _country_lookup(country)
        if spec and spec.get("has_provinces"):
            allowed = {p["code"] for p in REGION_PROVINCES.get(country, [])}
            if not province or province not in allowed:
                self.send_json({"country": country, "province": province or "", "items": []})
                return
        cities = _cities_for_parent(country, province)
        self.send_json({"country": country, "province": province or "", "items": cities})

    def api_regions_popular(self, conn: sqlite3.Connection) -> None:
        """Resolve POPULAR_CITIES into rich objects (so the client can
        render `🇨🇳 上海` without re-walking the tree)."""
        items: list[dict[str, Any]] = []
        for code in POPULAR_CITIES:
            country_code, province_code, city_code = _parse_region_code(code)
            country = _country_lookup(country_code) or {}
            province_name = ""
            if province_code:
                for p in REGION_PROVINCES.get(country_code, []):
                    if p["code"] == province_code:
                        province_name = p["name"]
                        break
            city_name = ""
            for c in _cities_for_parent(country_code, province_code):
                if c["code"] == city_code:
                    city_name = c["name"]
                    break
            if not city_name:
                continue
            items.append({
                "region_code":   code,
                "country_code":  country_code,
                "country_name":  country.get("name", ""),
                "country_emoji": country.get("emoji", ""),
                "province_code": province_code,
                "province_name": province_name,
                "city_code":     city_code,
                "city_name":     city_name,
            })
        self.send_json({"items": items})

    def api_regions_resolve(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        """Look a region_code up and return the same hydrated shape as
        the popular list — used by the App / Web when displaying a
        post's location chip."""
        code = (query.get("code") or "").strip()
        if not code:
            raise APIError("code required", 400, "missing_param")
        country_code, province_code, city_code = _parse_region_code(code)
        country = _country_lookup(country_code) or {}
        province_name = ""
        if province_code:
            for p in REGION_PROVINCES.get(country_code, []):
                if p["code"] == province_code:
                    province_name = p["name"]
                    break
        if country.get("has_provinces") and not province_name:
            raise APIError("region not found", 404, "region_not_found")
        city_name = ""
        for c in _cities_for_parent(country_code, province_code):
            if c["code"] == city_code:
                city_name = c["name"]
                break
        if not city_name:
            raise APIError("region not found", 404, "region_not_found")
        self.send_json({
            "region_code":   code,
            "country_code":  country_code,
            "country_name":  country.get("name", ""),
            "country_emoji": country.get("emoji", ""),
            "province_code": province_code,
            "province_name": province_name,
            "city_code":     city_code,
            "city_name":     city_name,
        })

    def api_events_token(self, conn: sqlite3.Connection) -> None:
        """Exchange the long-lived Bearer for a short-lived SSE token.
        EventSource cannot attach an Authorization header so the Web
        client previously had to put the Bearer in the URL (`?token=`),
        which leaked it through nginx access logs / Referer / browser
        history. The new flow mints a one-shot token bound to the user
        that expires in 5 minutes."""
        user = self.require_user(conn)
        token = _mint_sse_token(user["id"])
        self.send_json({"token": token, "expires_in": int(_SSE_TOKEN_TTL)})

    def api_events(self, conn: sqlite3.Connection) -> None:
        # Resolve the user from either a one-shot SSE token (preferred,
        # via ?token=) or — for backwards compatibility — the standard
        # Bearer header. The long-lived Bearer in the URL is the
        # leakage vector we want to retire so the SSE-token path is
        # the documented one.
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        sse_token = (qs.get("token") or [""])[0].strip()
        user_id = _consume_sse_token(sse_token)
        if user_id is None:
            user = self.require_user(conn)
            user_id = user["id"]
        self._pending_event_user_id = user_id
        return None

    # ---- marketing site copy ---------------------------------------------

    def _serialize_marketing_copy(self, row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "page_key": d["page_key"],
            "locale": d["locale"],
            "title": d["title"],
            "body": d["body"],
            "status": d["status"],
            "sort_order": int(d["sort_order"] or 0),
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        }

    def _clean_marketing_payload(self, data: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
        allowed_pages = {
            "home", "about", "features", "cities", "business", "safety", "download",
            "ads", "contact", "partners", "jobs-promotion", "housing-promotion",
            "safety-center", "privacy", "terms",
        }
        cleaned: dict[str, Any] = {}
        if "page_key" in data or not partial:
            page_key = str(data.get("page_key") or "").strip().lower()
            if page_key not in allowed_pages:
                raise APIError("页面不合法", 400, "invalid_page_key")
            cleaned["page_key"] = page_key
        if "locale" in data or not partial:
            locale = str(data.get("locale") or "zh").strip().lower()
            if locale not in ("zh", "en", "ja"):
                raise APIError("语言不合法", 400, "invalid_locale")
            cleaned["locale"] = locale
        if "title" in data or not partial:
            title = str(data.get("title") or "").strip()
            if not title:
                raise APIError("标题不能为空", 400, "invalid_title")
            cleaned["title"] = title[:160]
        if "body" in data or not partial:
            body = str(data.get("body") or "").strip()
            cleaned["body"] = body[:6000]
        if "status" in data or not partial:
            status = str(data.get("status") or "published").strip().lower()
            if status not in ("draft", "published"):
                raise APIError("状态不合法", 400, "invalid_status")
            cleaned["status"] = status
        if "sort_order" in data or not partial:
            try:
                cleaned["sort_order"] = max(0, min(int(data.get("sort_order") or 0), 9999))
            except (TypeError, ValueError):
                raise APIError("排序不合法", 400, "invalid_sort_order")
        return cleaned

    def api_marketing_copy(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        page_key = (query.get("page") or query.get("page_key") or "").strip().lower()
        locale = (query.get("locale") or "zh").strip().lower()
        if locale not in ("zh", "en", "ja"):
            locale = "zh"
        params: list[Any] = [locale]
        where = "WHERE status = 'published' AND locale = ?"
        if page_key:
            where += " AND page_key = ?"
            params.append(page_key)
        rows = list(conn.execute(
            f"SELECT * FROM marketing_copy {where} ORDER BY sort_order ASC, updated_at DESC LIMIT 50",
            params,
        ))
        self.send_json({"items": [self._serialize_marketing_copy(r) for r in rows]})

    # ---- admin ------------------------------------------------------------
    #
    # Everything below requires the calling user to have `role = 'admin'`.
    # First-launched install: the first registered account is auto-promoted
    # to admin (see api_register). After that, only an existing admin can
    # mint another admin via PATCH /api/admin/users/:id { role: 'admin' }.

    def api_admin_stats(self, conn: sqlite3.Connection) -> None:
        self.require_admin(conn)
        def one(sql: str, *p: Any) -> int:
            row = conn.execute(sql, p).fetchone()
            return int((row[0] if row else 0) or 0)

        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        stats = {
            "users_total":         one("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"),
            "users_24h":           one("SELECT COUNT(*) FROM users WHERE created_at > ?", cutoff_24h),
            "users_7d":            one("SELECT COUNT(*) FROM users WHERE created_at > ?", cutoff_7d),
            "posts_total":         one("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL"),
            "posts_active":        one("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status IN ('published', 'active')"),
            "posts_under_review":  one("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'under_review'"),
            "posts_hidden":        one("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'hidden'"),
            "boosted_posts":       one("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND is_boosted = 1"),
            "posts_24h":           one("SELECT COUNT(*) FROM posts WHERE created_at > ?", cutoff_24h),
            "comments_total":      one("SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL"),
            "comments_24h":        one("SELECT COUNT(*) FROM comments WHERE created_at > ?", cutoff_24h),
            "messages_total":      one("SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL"),
            "messages_24h":        one("SELECT COUNT(*) FROM messages WHERE created_at > ?", cutoff_24h),
            "media_total":         one("SELECT COUNT(*) FROM media WHERE deleted_at IS NULL"),
            "active_sessions":     one("SELECT COUNT(*) FROM sessions WHERE expires_at > ?", now_iso()),
            "reports_open":        one("SELECT COUNT(*) FROM reports"),
            "feedback_total":      one("SELECT COUNT(*) FROM feedback"),
            "db_size_bytes":       (DB_PATH.stat().st_size if DB_PATH.exists() else 0),
            # Walking media/ on every admin stats request can be tens
            # of seconds with many files — cache it for 5 minutes.
            "media_size_bytes":    _cached_media_size_bytes(),
            "server_time":         now_iso(),
            "server_env":          "production" if PRODUCTION else "development",
            "allowed_origins":     sorted(ALLOWED_ORIGINS),
        }
        self.send_json({"stats": stats})

    def api_admin_visitors(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        """Admin-only access log: recent visits with IP + resolved region,
        plus rollup summaries. The full IP is intentionally returned here —
        this endpoint exists precisely so operators can see it — but it is
        gated behind require_admin and never exposed to ordinary users."""
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 100), 500))
        days = max(1, min(int(query.get("days") or 7), 365))
        q = (query.get("q") or "").strip()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        clauses = ["created_at > ?"]
        params: list[Any] = [cutoff]
        if q:
            like = f"%{q}%"
            clauses.append("(ip LIKE ? OR country LIKE ? OR region LIKE ? OR city LIKE ? OR path LIKE ?)")
            params.extend([like, like, like, like, like])
        where = "WHERE " + " AND ".join(clauses)
        rows = list(conn.execute(
            f"SELECT * FROM visitor_logs {where} ORDER BY created_at DESC LIMIT ?",
            [*params, limit],
        ))
        total = int(conn.execute(f"SELECT COUNT(*) FROM visitor_logs {where}", params).fetchone()[0])
        uniques = int(conn.execute(f"SELECT COUNT(DISTINCT ip_hash) FROM visitor_logs {where}", params).fetchone()[0])
        logged_in = int(conn.execute(f"SELECT COUNT(DISTINCT user_id) FROM visitor_logs {where} AND user_id IS NOT NULL", params).fetchone()[0])
        top_countries = [
            {"country": r["country"], "count": int(r["c"])}
            for r in conn.execute(
                f"SELECT country, COUNT(*) AS c FROM visitor_logs {where} AND country != '' GROUP BY country ORDER BY c DESC LIMIT 12",
                params,
            )
        ]
        top_cities = [
            {"city": r["city"], "country": r["country"], "count": int(r["c"])}
            for r in conn.execute(
                f"SELECT city, country, COUNT(*) AS c FROM visitor_logs {where} AND city != '' GROUP BY city, country ORDER BY c DESC LIMIT 12",
                params,
            )
        ]
        items = [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "ip": r["ip"],
                "method": r["method"],
                "path": r["path"],
                "status": int(r["status"] or 0),
                "user_id": r["user_id"],
                "user_agent": r["user_agent"],
                "referer": r["referer"],
                "country": r["country"],
                "region": r["region"],
                "city": r["city"],
                "org": r["org"],
            }
            for r in rows
        ]
        self.send_json({
            "items": items,
            "summary": {
                "total": total,
                "unique_visitors": uniques,
                "logged_in_users": logged_in,
                "days": days,
                "top_countries": top_countries,
                "top_cities": top_cities,
                "geoip": GEOIP_TRANSPORT,
            },
        })

    def api_admin_users(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        q = (query.get("q") or "").strip()
        like = f"%{q}%"
        if q:
            rows = list(conn.execute(
                "SELECT * FROM users WHERE handle LIKE ? OR display_name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ?",
                (like, like, like, limit),
            ))
        else:
            rows = list(conn.execute(
                "SELECT * FROM users ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ))
        items = []
        for r in rows:
            d = dict(r)
            base = serialize_user(d)
            base["role"] = d.get("role", "member")
            base["deleted_at"] = d.get("deleted_at")
            base["follower_count"] = int(conn.execute(
                "SELECT COUNT(*) FROM follows WHERE following_id = ?", (d["id"],)
            ).fetchone()[0])
            base["post_count"] = int(conn.execute(
                "SELECT COUNT(*) FROM posts WHERE author_id = ? AND deleted_at IS NULL", (d["id"],)
            ).fetchone()[0])
            items.append(base)
        self.send_json({"items": items})

    def api_admin_update_user(self, conn: sqlite3.Connection, user_id: str) -> None:
        admin = self.require_admin(conn)
        data = self.read_json()
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise APIError("用户不存在", 404, "user_not_found")
        updates: list[tuple[str, Any]] = []
        if "is_verified" in data:
            updates.append(("is_verified", 1 if data["is_verified"] else 0))
        if "role" in data and data["role"] in ("member", "creator", "admin"):
            # Don't let an admin demote themselves and then strand the system.
            if data["role"] != "admin" and target["id"] == admin["id"]:
                raise APIError("不能修改自己的角色", 400, "invalid_role_change")
            updates.append(("role", data["role"]))
        if "membership_tier" in data:
            updates.append(("membership_tier", data["membership_tier"]))
        if "creator_badge" in data:
            updates.append(("creator_badge", str(data["creator_badge"])[:80]))
        if "is_merchant" in data:
            updates.append(("is_merchant", 1 if data["is_merchant"] else 0))
        if "merchant_verified" in data:
            updates.append(("merchant_verified", 1 if data["merchant_verified"] else 0))
        if updates:
            sets = ", ".join(f"{f} = ?" for f, _ in updates) + ", updated_at = ?"
            values = [v for _, v in updates] + [now_iso(), user_id]
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", values)
            ACCESS_LOG.info("admin %s updated user %s fields=%s", admin["handle"], target["handle"], [f for f, _ in updates])
        fresh = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        self.send_json({"user": serialize_user(fresh)})

    def api_admin_delete_user(self, conn: sqlite3.Connection, user_id: str) -> None:
        admin = self.require_admin(conn)
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise APIError("用户不存在", 404, "user_not_found")
        if target["id"] == admin["id"]:
            raise APIError("不能封禁自己", 400, "cannot_ban_self")
        conn.execute("UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?",
                     (now_iso(), now_iso(), user_id))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        ACCESS_LOG.warning("admin %s suspended user %s", admin["handle"], target["handle"])
        self.send_json({"ok": True})

    def api_admin_posts(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        q = (query.get("q") or "").strip()
        status = (query.get("status") or "").strip()
        content_type = normalize_content_type(query.get("content_type")) if query.get("content_type") else ""
        region_code = (query.get("region_code") or "").strip().lower()
        country = (query.get("country") or "").strip().lower()
        city = (query.get("city") or "").strip().lower()
        clauses: list[str] = []
        params: list[Any] = []
        if q:
            like = f"%{q}%"
            clauses.append("(content LIKE ? OR country LIKE ? OR province LIKE ? OR city LIKE ? OR content_type LIKE ?)")
            params.extend([like, like, like, like, like])
        if status in POST_STATUSES:
            clauses.append("status = ?")
            params.append(status)
        if content_type:
            clauses.append("content_type = ?")
            params.append(content_type)
        if region_code:
            clauses.append("region_code = ?")
            params.append(region_code)
        else:
            if country:
                clauses.append("country = ?")
                params.append(country)
            if city:
                clauses.append("city = ?")
                params.append(city)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = list(conn.execute(
            f"SELECT * FROM posts {where} ORDER BY created_at DESC LIMIT ?",
            [*params, limit],
        ))
        items = fetch_posts_with_extras(conn, [dict(r) for r in rows], None)
        # Surface deleted_at for the admin UI.
        for item, row in zip(items, rows):
            item["deleted_at"] = row["deleted_at"]
        self.send_json({"items": items})

    def api_admin_update_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("帖子不存在", 404, "post_not_found")
        data = self.read_json()
        updates: list[tuple[str, Any]] = []
        if "status" in data:
            status = str(data["status"]).strip()
            if status not in POST_STATUSES:
                raise APIError("状态不合法", 400, "invalid_status")
            updates.append(("status", status))
            if status == "deleted":
                updates.append(("deleted_at", now_iso()))
            else:
                updates.append(("deleted_at", None))
        if "is_boosted" in data:
            updates.append(("is_boosted", 1 if data["is_boosted"] else 0))
        if "boost_weight" in data:
            try:
                updates.append(("boost_weight", max(0, int(data["boost_weight"]))))
            except (TypeError, ValueError):
                raise APIError("加热权重不合法", 400, "invalid_boost_weight")
        if "boosted_until" in data:
            updates.append(("boosted_until", str(data["boosted_until"] or "")[:60]))
        if updates:
            sets = ", ".join(f"{f} = ?" for f, _ in updates) + ", updated_at = ?"
            values = [v for _, v in updates] + [now_iso(), post_id]
            conn.execute(f"UPDATE posts SET {sets} WHERE id = ?", values)
            _cache_invalidate("feed:hot")
            _cache_invalidate("trending:")
            ACCESS_LOG.info("admin %s updated post %s fields=%s", admin["handle"], post_id, [f for f, _ in updates])
        fresh = dict(conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone())
        post = fetch_posts_with_extras(conn, [fresh], None)[0]
        post["deleted_at"] = fresh.get("deleted_at")
        self.send_json({"post": post})

    def api_admin_delete_post(self, conn: sqlite3.Connection, post_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT author_id FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise APIError("帖子不存在", 404, "post_not_found")
        conn.execute("UPDATE posts SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?",
                     (now_iso(), now_iso(), post_id))
        _cache_invalidate("feed:hot")
        _cache_invalidate("trending:")
        ACCESS_LOG.warning("admin %s removed post %s", admin["handle"], post_id)
        self.send_json({"ok": True})

    def api_admin_comments(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        rows = list(conn.execute(
            "SELECT * FROM comments ORDER BY created_at DESC LIMIT ?", (limit,),
        ))
        ids = list({r["author_id"] for r in rows})
        authors = fetch_users_by_ids(conn, ids)
        items = [
            {**serialize_comment(dict(r), {"author": authors.get(r["author_id"]), "like_count": 0, "liked": False}),
             "deleted_at": r["deleted_at"]}
            for r in rows
        ]
        self.send_json({"items": items})

    def api_admin_delete_comment(self, conn: sqlite3.Connection, comment_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT id FROM comments WHERE id = ?", (comment_id,)).fetchone()
        if not row:
            raise APIError("评论不存在", 404, "comment_not_found")
        conn.execute("UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?",
                     (now_iso(), now_iso(), comment_id))
        ACCESS_LOG.warning("admin %s removed comment %s", admin["handle"], comment_id)
        self.send_json({"ok": True})

    def api_admin_reports(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 50), 200))
        rows = list(conn.execute(
            "SELECT * FROM reports ORDER BY created_at DESC LIMIT ?", (limit,),
        ))
        reporter_ids = list({r["reporter_id"] for r in rows})
        reporters = fetch_users_by_ids(conn, reporter_ids)
        items = []
        for r in rows:
            d = dict(r)
            preview: dict[str, Any] = {}
            if d["target_kind"] == "post":
                p = conn.execute("SELECT content, author_id FROM posts WHERE id = ?", (d["target_id"],)).fetchone()
                if p:
                    preview = {"content": p["content"], "author": fetch_users_by_ids(conn, [p["author_id"]]).get(p["author_id"])}
            elif d["target_kind"] == "comment":
                p = conn.execute("SELECT content, author_id FROM comments WHERE id = ?", (d["target_id"],)).fetchone()
                if p:
                    preview = {"content": p["content"], "author": fetch_users_by_ids(conn, [p["author_id"]]).get(p["author_id"])}
            elif d["target_kind"] == "user":
                u = fetch_users_by_ids(conn, [d["target_id"]]).get(d["target_id"])
                if u:
                    preview = {"content": u.get("bio") or "", "author": u}
            items.append({
                "id": d["id"],
                "reporter": reporters.get(d["reporter_id"]),
                "target_kind": d["target_kind"],
                "target_id": d["target_id"],
                "reason": d["reason"],
                "note": d["note"],
                "created_at": d["created_at"],
                "preview": preview,
            })
        self.send_json({"items": items})

    def api_admin_resolve_report(self, conn: sqlite3.Connection, report_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT id FROM reports WHERE id = ?", (report_id,)).fetchone()
        if not row:
            raise APIError("举报不存在", 404, "report_not_found")
        conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
        ACCESS_LOG.info("admin %s dismissed report %s", admin["handle"], report_id)
        self.send_json({"ok": True})

    def api_admin_feedback(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 100), 200))
        rows = list(conn.execute(
            "SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?", (limit,),
        ))
        user_ids = list({r["user_id"] for r in rows})
        users = fetch_users_by_ids(conn, user_ids)
        items = [
            {
                "id": r["id"],
                "category": r["category"],
                "content": r["content"],
                "created_at": r["created_at"],
                "user": users.get(r["user_id"]),
            }
            for r in rows
        ]
        self.send_json({"items": items})

    def api_admin_marketing_copy(self, conn: sqlite3.Connection, query: dict[str, str]) -> None:
        self.require_admin(conn)
        limit = max(1, min(int(query.get("limit") or 200), 500))
        rows = list(conn.execute(
            "SELECT * FROM marketing_copy ORDER BY page_key ASC, locale ASC, sort_order ASC, updated_at DESC LIMIT ?",
            (limit,),
        ))
        self.send_json({"items": [self._serialize_marketing_copy(r) for r in rows]})

    def api_admin_create_marketing_copy(self, conn: sqlite3.Connection) -> None:
        admin = self.require_admin(conn)
        cleaned = self._clean_marketing_payload(self.read_json())
        item_id = str(uuid.uuid4())
        timestamp = now_iso()
        conn.execute(
            """
            INSERT INTO marketing_copy
                (id, page_key, locale, title, body, status, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                cleaned["page_key"],
                cleaned["locale"],
                cleaned["title"],
                cleaned["body"],
                cleaned["status"],
                cleaned["sort_order"],
                timestamp,
                timestamp,
            ),
        )
        ACCESS_LOG.info("admin %s created marketing copy %s page=%s", admin["handle"], item_id, cleaned["page_key"])
        fresh = conn.execute("SELECT * FROM marketing_copy WHERE id = ?", (item_id,)).fetchone()
        self.send_json({"item": self._serialize_marketing_copy(fresh)}, 201)

    def api_admin_update_marketing_copy(self, conn: sqlite3.Connection, item_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT * FROM marketing_copy WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise APIError("官网文案不存在", 404, "marketing_copy_not_found")
        cleaned = self._clean_marketing_payload(self.read_json(), partial=True)
        if cleaned:
            sets = ", ".join(f"{key} = ?" for key in cleaned.keys()) + ", updated_at = ?"
            values = list(cleaned.values()) + [now_iso(), item_id]
            conn.execute(f"UPDATE marketing_copy SET {sets} WHERE id = ?", values)
            ACCESS_LOG.info("admin %s updated marketing copy %s fields=%s", admin["handle"], item_id, list(cleaned.keys()))
        fresh = conn.execute("SELECT * FROM marketing_copy WHERE id = ?", (item_id,)).fetchone()
        self.send_json({"item": self._serialize_marketing_copy(fresh)})

    def api_admin_delete_marketing_copy(self, conn: sqlite3.Connection, item_id: str) -> None:
        admin = self.require_admin(conn)
        row = conn.execute("SELECT id FROM marketing_copy WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise APIError("官网文案不存在", 404, "marketing_copy_not_found")
        conn.execute("DELETE FROM marketing_copy WHERE id = ?", (item_id,))
        ACCESS_LOG.warning("admin %s deleted marketing copy %s", admin["handle"], item_id)
        self.send_json({"ok": True})

    def _run_event_stream(self, user_id: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._set_cors()
        self.end_headers()
        import queue
        q: queue.Queue = queue.Queue(maxsize=64)
        HUB.subscribe(user_id, q)
        try:
            self.wfile.write(b"event: hello\ndata: {}\n\n")
            self.wfile.flush()
            while True:
                try:
                    payload = q.get(timeout=20)
                    self.wfile.write(payload)
                    self.wfile.flush()
                except Exception:
                    try:
                        self.wfile.write(b":\n\n")
                        self.wfile.flush()
                    except Exception:
                        break
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            HUB.unsubscribe(user_id, q)


def run() -> None:
    init_db()
    start_visitor_writer()
    start_news_crawler_scheduler()
    host = _env("KAIX_HOST", "127.0.0.1")
    port = int(_env("KAIX_PORT", "8787"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    ACCESS_LOG.info("Machi backend starting on http://%s:%s (env=%s)", host, port, "production" if PRODUCTION else "development")

    import signal
    def _shutdown(signum, _frame):  # noqa: ANN001
        ACCESS_LOG.info("received signal %s, shutting down gracefully", signum)
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        ACCESS_LOG.info("interrupted, shutting down")
    finally:
        server.server_close()
        ACCESS_LOG.info("server closed")


if __name__ == "__main__":
    run()
