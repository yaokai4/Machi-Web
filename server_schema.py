#!/usr/bin/env python3
"""Database schema and migration SQL for Machi backend."""

from __future__ import annotations

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

-- WeChat Mini Program identity bindings. Maps a WeChat openid/unionid to a
-- Machi user so the mini-program shares the same accounts/data as Web/iOS/
-- Android. We never store the WeChat session_key (sensitive); only the stable
-- openid/unionid keys are persisted.
CREATE TABLE IF NOT EXISTS miniapp_openid_bindings (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'wechat',
    openid TEXT NOT NULL,
    unionid TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(platform, openid)
);
CREATE INDEX IF NOT EXISTS idx_miniapp_bindings_user ON miniapp_openid_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_miniapp_bindings_unionid ON miniapp_openid_bindings(unionid);

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
-- NOTE: the ranking columns (like_count/comment_count/repost_count/bookmark_count/
-- hot_score via migration 85, last_activity_at via migration 86) and their indexes
-- (idx_posts_hot, idx_posts_last_activity) are added by MIGRATIONS, not here — this
-- table CREATE predates them and fresh DBs pick them up through the migration chain.

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

-- Topic (hashtag) subscriptions. A user follows a bare tag (no leading '#');
-- the follow_digest task rolls new posts under followed tags into the daily
-- "你关注的话题" summary. Tag is stored lowercased, matching post_tags.
CREATE TABLE IF NOT EXISTS topic_follows (
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_topic_follows_user ON topic_follows(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_topic_follows_tag ON topic_follows(tag);

-- 邀请裂变 (referral growth loop). One stable code per user; each invite
-- relationship is one referrals row with a small status machine. Rewards ride
-- the wallet ledger (entry_type='referral_bonus'), so no money table is added
-- here. See server_referral.py. Types stay INTEGER/TEXT so migration v99 is
-- byte-identical on SQLite and Postgres.
CREATE TABLE IF NOT EXISTS referral_codes (
    user_id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL UNIQUE,          -- a user can only be invited once
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending → qualified → rewarded / rejected
    reward_state TEXT NOT NULL DEFAULT 'none',-- none → both_paid / invitee_paid / blocked
    signup_ip TEXT NOT NULL DEFAULT '',
    qualified_at TEXT NOT NULL DEFAULT '',
    rewarded_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, reward_state);
CREATE INDEX IF NOT EXISTS idx_referrals_ip ON referrals(signup_ip, created_at);

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
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    action TEXT NOT NULL DEFAULT '',
    resolved_by TEXT NOT NULL DEFAULT '',
    resolved_note TEXT NOT NULL DEFAULT '',
    resolved_at TEXT
);

-- UGC moderation audit trail (App Store 1.2 / legal): every takedown,
-- restore, dismissal and auto-hide is recorded with who/why so report
-- handling is accountable instead of a fire-and-forget row delete.
CREATE TABLE IF NOT EXISTS content_moderation_actions (
    id TEXT PRIMARY KEY,
    moderator_id TEXT NOT NULL DEFAULT '',
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    report_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

-- Known-bad media fingerprints (e.g. CSAM PhotoDNA-style SHA-256 hashes the
-- operator imports). An upload whose content hash matches is rejected outright.
CREATE TABLE IF NOT EXISTS blocked_media_hashes (
    sha256 TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
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
    language TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT 'light',
    push_likes INTEGER NOT NULL DEFAULT 1,
    push_comments INTEGER NOT NULL DEFAULT 1,
    push_follows INTEGER NOT NULL DEFAULT 1,
    push_messages INTEGER NOT NULL DEFAULT 1,
    push_inquiries INTEGER NOT NULL DEFAULT 1,
    privacy_protect INTEGER NOT NULL DEFAULT 0,
    privacy_allow_dm TEXT NOT NULL DEFAULT 'everyone',
    recommend_following INTEGER NOT NULL DEFAULT 1,
    recommend_topics INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    media_ids TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    region_code TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'dynamic',
    attributes TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS marketing_copy_overrides (
    locale TEXT NOT NULL,
    copy_key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(locale, copy_key)
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
CREATE INDEX IF NOT EXISTS idx_marketing_copy_overrides_locale ON marketing_copy_overrides(locale, copy_key);

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

CREATE TABLE IF NOT EXISTS security_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id, created_at);

-- =====================================================================
-- Machi Guide / 日本指南.
--
-- Replaces the old crawler "资讯" surface with an editorial knowledge +
-- service module (升学 / 就职 / 留学 / JLPT / 在日生活 / 资料与服务 +
-- 公司选择与面试评论). Every content table carries `country` (default
-- 'jp') so the structure is multi-region ready, but the front-end only
-- opens Japan today. Old news_* / editorial_posts tables are kept for
-- compatibility — the Guide front never reads them.
-- =====================================================================

CREATE TABLE IF NOT EXISTS guide_categories (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    parent_key TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(key, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_categories_scope ON guide_categories(country, is_active, parent_key, sort_order);

CREATE TABLE IF NOT EXISTS guide_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT '',
    sub_category_key TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'guide',
    country TEXT NOT NULL DEFAULT 'jp',
    city TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    cover_image TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    related_article_slugs TEXT NOT NULL DEFAULT '',
    related_product_slugs TEXT NOT NULL DEFAULT '',
    author_type TEXT NOT NULL DEFAULT 'editorial',
    author_name TEXT NOT NULL DEFAULT 'Machi 日本指南编辑部',
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_free INTEGER NOT NULL DEFAULT 1,
    is_paid INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    view_count INTEGER NOT NULL DEFAULT 0,
    save_count INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE(slug, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_articles_scope ON guide_articles(country, status, category_key, sub_category_key, published_at);
CREATE INDEX IF NOT EXISTS idx_guide_articles_featured ON guide_articles(country, status, is_featured, published_at);

CREATE TABLE IF NOT EXISTS guide_article_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    last_read_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_guide_article_progress_user ON guide_article_progress(user_id, updated_at);

CREATE TABLE IF NOT EXISTS guide_products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT 'guide_services',
    sub_category_key TEXT NOT NULL DEFAULT '',
    product_type TEXT NOT NULL DEFAULT 'pdf_material',
    price INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    price_label TEXT NOT NULL DEFAULT '',
    original_price INTEGER NOT NULL DEFAULT 0,
    member_price INTEGER NOT NULL DEFAULT 0,
    discount_label TEXT NOT NULL DEFAULT '',
    is_price_hidden INTEGER NOT NULL DEFAULT 0,
    is_appointment_only INTEGER NOT NULL DEFAULT 0,
    stripe_product_id TEXT NOT NULL DEFAULT '',
    stripe_price_id TEXT NOT NULL DEFAULT '',
    ios_iap_product_id TEXT NOT NULL DEFAULT '',
    apple_product_id TEXT NOT NULL DEFAULT '',
    price_region TEXT NOT NULL DEFAULT '',
    tax_included INTEGER NOT NULL DEFAULT 1,
    billing_type TEXT NOT NULL DEFAULT 'one_time',
    billing_period TEXT NOT NULL DEFAULT 'none',
    service_price_type TEXT NOT NULL DEFAULT '',
    starting_price INTEGER NOT NULL DEFAULT 0,
    member_discount_percent INTEGER NOT NULL DEFAULT 0,
    service_duration_minutes INTEGER NOT NULL DEFAULT 0,
    deposit_required INTEGER NOT NULL DEFAULT 0,
    deposit_amount INTEGER NOT NULL DEFAULT 0,
    cancellation_policy TEXT NOT NULL DEFAULT '',
    cover_image TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    related_article_slugs TEXT NOT NULL DEFAULT '',
    topic_slugs TEXT NOT NULL DEFAULT '',
    target_audience TEXT NOT NULL DEFAULT '',
    delivery_method TEXT NOT NULL DEFAULT '',
    preview_content TEXT NOT NULL DEFAULT '',
    purchase_content TEXT NOT NULL DEFAULT '',
    file_url TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    is_digital INTEGER NOT NULL DEFAULT 1,
    is_service INTEGER NOT NULL DEFAULT 0,
    is_free INTEGER NOT NULL DEFAULT 0,
    is_paid INTEGER NOT NULL DEFAULT 1,
    is_member_included INTEGER NOT NULL DEFAULT 0,
    is_member_discount INTEGER NOT NULL DEFAULT 0,
    is_coming_soon INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'coming_soon',
    purchase_count INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 0,
    -- Denormalized review aggregate. `rating` is sum/count (avg); the count/sum
    -- feed the CAS increment in apply_review_to_aggregate so we never AVG the
    -- whole review table on read. Only 'published' reviews contribute.
    rating_count INTEGER NOT NULL DEFAULT 0,
    rating_sum INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    refund_policy TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    -- Machi Points purchasing. Prices are server-side only; clients never send
    -- a points amount. wallet_eligible gates whether points can buy this item;
    -- platform_policy / fulfillment_type drive which CTA each client shows.
    wallet_price_points INTEGER NOT NULL DEFAULT 0,
    member_wallet_price_points INTEGER NOT NULL DEFAULT 0,
    wallet_eligible INTEGER NOT NULL DEFAULT 0,
    app_store_eligible INTEGER NOT NULL DEFAULT 1,
    google_play_eligible INTEGER NOT NULL DEFAULT 1,
    external_payment_allowed INTEGER NOT NULL DEFAULT 0,
    fulfillment_type TEXT NOT NULL DEFAULT 'digital_unlock',
    entitlement_type TEXT NOT NULL DEFAULT 'guide_product',
    platform_policy TEXT NOT NULL DEFAULT 'digital_iap_required',
    points_purchase_limit INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE(slug, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_products_scope ON guide_products(country, status, category_key, product_type, sort_order);

CREATE TABLE IF NOT EXISTS guide_product_files (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    file_url TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    download_limit INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES guide_products(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_product_files_product ON guide_product_files(product_id);

CREATE TABLE IF NOT EXISTS guide_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    order_no TEXT UNIQUE NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'pending',
    payment_provider TEXT NOT NULL DEFAULT '',
    payment_order_id TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    price_points INTEGER NOT NULL DEFAULT 0,
    wallet_ledger_entry_id TEXT NOT NULL DEFAULT '',
    entitlement_id TEXT NOT NULL DEFAULT '',
    provider_trade_no TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    paid_at TEXT,
    cancelled_at TEXT,
    refunded_at TEXT,
    fulfilled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_guide_orders_user ON guide_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_orders_product ON guide_orders(product_id, status);

-- Buyer product reviews (1-5 stars + body). One review per (user, product) via
-- the UNIQUE — a re-submit UPSERTs the same row. Only status='published' counts
-- toward guide_products.rating / rating_count / rating_sum (maintained by the
-- CAS in apply_review_to_aggregate). status: pending / published / rejected /
-- hidden / withdrawn.
CREATE TABLE IF NOT EXISTS guide_reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    order_id TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    helpful_count INTEGER NOT NULL DEFAULT 0,
    report_count INTEGER NOT NULL DEFAULT 0,
    anonymous INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, product_id),
    FOREIGN KEY(product_id) REFERENCES guide_products(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_reviews_product ON guide_reviews(product_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_reviews_user ON guide_reviews(user_id, created_at);

-- "有帮助" votes on a review. One vote per (review, user) via the UNIQUE; the
-- denormalized helpful_count on guide_reviews is bumped by CAS from row presence.
CREATE TABLE IF NOT EXISTS guide_review_votes (
    review_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_guide_review_votes_review ON guide_review_votes(review_id);

CREATE TABLE IF NOT EXISTS guide_service_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL DEFAULT '',
    service_type TEXT NOT NULL DEFAULT '',
    contact_method TEXT NOT NULL DEFAULT '',
    contact_value TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    preferred_time TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_service_requests_user ON guide_service_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_service_requests_status ON guide_service_requests(status, created_at);

CREATE TABLE IF NOT EXISTS guide_companies (
    id TEXT PRIMARY KEY,
    corporate_number TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL,
    company_name_jp TEXT NOT NULL DEFAULT '',
    company_name_en TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    industry TEXT NOT NULL DEFAULT '',
    sub_industry TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    prefecture TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    ward TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    website TEXT NOT NULL DEFAULT '',
    career_url TEXT NOT NULL DEFAULT '',
    new_graduate_url TEXT NOT NULL DEFAULT '',
    mid_career_url TEXT NOT NULL DEFAULT '',
    global_career_url TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    company_size TEXT NOT NULL DEFAULT '',
    founded_year INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    short_description TEXT NOT NULL DEFAULT '',
    is_foreigner_friendly INTEGER NOT NULL DEFAULT -1,
    accepts_foreign_applicants INTEGER NOT NULL DEFAULT -1,
    supports_work_visa INTEGER NOT NULL DEFAULT -1,
    supports_new_graduate INTEGER NOT NULL DEFAULT -1,
    supports_mid_career INTEGER NOT NULL DEFAULT -1,
    has_english_positions INTEGER NOT NULL DEFAULT -1,
    has_global_roles INTEGER NOT NULL DEFAULT -1,
    has_foreign_employees INTEGER NOT NULL DEFAULT -1,
    japanese_level_required TEXT NOT NULL DEFAULT 'unknown',
    english_level_required TEXT NOT NULL DEFAULT 'unknown',
    employment_types TEXT NOT NULL DEFAULT '',
    average_salary_min INTEGER NOT NULL DEFAULT 0,
    average_salary_max INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JPY',
    foreigner_friendly_score REAL NOT NULL DEFAULT 0,
    visa_support_score REAL NOT NULL DEFAULT 0,
    interview_difficulty_score REAL NOT NULL DEFAULT 0,
    overtime_score REAL NOT NULL DEFAULT 0,
    salary_benefit_score REAL NOT NULL DEFAULT 0,
    work_life_balance_score REAL NOT NULL DEFAULT 0,
    career_growth_score REAL NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    interview_review_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_name TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source_last_checked_at TEXT,
    verification_status TEXT NOT NULL DEFAULT 'needs_review',
    data_quality_score INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    view_count INTEGER NOT NULL DEFAULT 0,
    save_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(slug, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_companies_scope ON guide_companies(country, status, industry, city);

CREATE TABLE IF NOT EXISTS guide_schools (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    school_name TEXT NOT NULL,
    school_name_jp TEXT NOT NULL DEFAULT '',
    school_name_en TEXT NOT NULL DEFAULT '',
    school_type TEXT NOT NULL DEFAULT 'other',
    country TEXT NOT NULL DEFAULT 'jp',
    prefecture TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    ward TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    website TEXT NOT NULL DEFAULT '',
    admission_url TEXT NOT NULL DEFAULT '',
    international_admission_url TEXT NOT NULL DEFAULT '',
    application_url TEXT NOT NULL DEFAULT '',
    scholarship_url TEXT NOT NULL DEFAULT '',
    career_support_url TEXT NOT NULL DEFAULT '',
    language_support_url TEXT NOT NULL DEFAULT '',
    dormitory_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    short_description TEXT NOT NULL DEFAULT '',
    is_accepting_international_students INTEGER NOT NULL DEFAULT -1,
    has_english_program INTEGER NOT NULL DEFAULT -1,
    has_japanese_program INTEGER NOT NULL DEFAULT -1,
    has_scholarship INTEGER NOT NULL DEFAULT -1,
    has_dormitory INTEGER NOT NULL DEFAULT -1,
    has_career_support INTEGER NOT NULL DEFAULT -1,
    has_language_support INTEGER NOT NULL DEFAULT -1,
    tuition_min INTEGER NOT NULL DEFAULT 0,
    tuition_max INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JPY',
    application_periods TEXT NOT NULL DEFAULT '',
    admission_months TEXT NOT NULL DEFAULT '',
    required_japanese_level TEXT NOT NULL DEFAULT 'unknown',
    required_english_level TEXT NOT NULL DEFAULT 'unknown',
    eju_required TEXT NOT NULL DEFAULT 'unknown',
    jlpt_required TEXT NOT NULL DEFAULT 'unknown',
    toefl_required TEXT NOT NULL DEFAULT 'unknown',
    ielts_required TEXT NOT NULL DEFAULT 'unknown',
    fields_of_study TEXT NOT NULL DEFAULT '',
    departments TEXT NOT NULL DEFAULT '',
    faculties TEXT NOT NULL DEFAULT '',
    graduate_schools TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_name TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source_last_checked_at TEXT,
    verification_status TEXT NOT NULL DEFAULT 'needs_review',
    data_quality_score INTEGER NOT NULL DEFAULT 0,
    is_featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    view_count INTEGER NOT NULL DEFAULT 0,
    save_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(slug, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_schools_scope ON guide_schools(country, status, school_type, prefecture, city);
CREATE INDEX IF NOT EXISTS idx_guide_schools_featured ON guide_schools(country, status, is_featured, updated_at);

CREATE TABLE IF NOT EXISTS guide_school_programs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    program_name TEXT NOT NULL,
    program_name_jp TEXT NOT NULL DEFAULT '',
    program_name_en TEXT NOT NULL DEFAULT '',
    degree_level TEXT NOT NULL DEFAULT 'other',
    program_type TEXT NOT NULL DEFAULT 'regular',
    field TEXT NOT NULL DEFAULT '',
    sub_field TEXT NOT NULL DEFAULT '',
    faculty_name TEXT NOT NULL DEFAULT '',
    department_name TEXT NOT NULL DEFAULT '',
    graduate_school_name TEXT NOT NULL DEFAULT '',
    language_of_instruction TEXT NOT NULL DEFAULT '',
    duration_months INTEGER NOT NULL DEFAULT 0,
    admission_months TEXT NOT NULL DEFAULT '',
    application_period TEXT NOT NULL DEFAULT '',
    tuition INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JPY',
    required_japanese_level TEXT NOT NULL DEFAULT 'unknown',
    required_english_level TEXT NOT NULL DEFAULT 'unknown',
    eju_required TEXT NOT NULL DEFAULT 'unknown',
    jlpt_required TEXT NOT NULL DEFAULT 'unknown',
    toefl_required TEXT NOT NULL DEFAULT 'unknown',
    ielts_required TEXT NOT NULL DEFAULT 'unknown',
    description TEXT NOT NULL DEFAULT '',
    application_url TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'needs_review',
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(school_id) REFERENCES guide_schools(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_school_programs_school ON guide_school_programs(school_id, status, degree_level);

CREATE TABLE IF NOT EXISTS guide_school_admissions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    program_id TEXT NOT NULL DEFAULT '',
    admission_type TEXT NOT NULL DEFAULT 'international_student',
    target_student_type TEXT NOT NULL DEFAULT '',
    application_start TEXT,
    application_deadline TEXT,
    exam_date TEXT,
    result_date TEXT,
    enrollment_month TEXT NOT NULL DEFAULT '',
    required_documents TEXT NOT NULL DEFAULT '',
    selection_method TEXT NOT NULL DEFAULT '',
    application_fee INTEGER NOT NULL DEFAULT 0,
    tuition_first_year INTEGER NOT NULL DEFAULT 0,
    scholarship_info TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'needs_review',
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(school_id) REFERENCES guide_schools(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_school_admissions_school ON guide_school_admissions(school_id, status, enrollment_month);

CREATE TABLE IF NOT EXISTS guide_company_positions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    position_title TEXT NOT NULL,
    position_title_jp TEXT NOT NULL DEFAULT '',
    position_category TEXT NOT NULL DEFAULT 'other',
    employment_type TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    remote_type TEXT NOT NULL DEFAULT '',
    salary_min INTEGER NOT NULL DEFAULT 0,
    salary_max INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'JPY',
    japanese_level_required TEXT NOT NULL DEFAULT 'unknown',
    english_level_required TEXT NOT NULL DEFAULT 'unknown',
    visa_support TEXT NOT NULL DEFAULT 'unknown',
    description TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'needs_review',
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(company_id) REFERENCES guide_companies(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_company_positions_company ON guide_company_positions(company_id, status, position_category);

CREATE TABLE IF NOT EXISTS guide_correction_reports (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    field_name TEXT NOT NULL DEFAULT '',
    current_value TEXT NOT NULL DEFAULT '',
    suggested_value TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_corrections_target ON guide_correction_reports(target_type, target_id, status, created_at);

CREATE TABLE IF NOT EXISTS guide_company_reviews (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    anonymous INTEGER NOT NULL DEFAULT 1,
    position TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT '',
    work_period TEXT NOT NULL DEFAULT '',
    pros TEXT NOT NULL DEFAULT '',
    cons TEXT NOT NULL DEFAULT '',
    overtime_level TEXT NOT NULL DEFAULT '',
    foreigner_support TEXT NOT NULL DEFAULT '',
    visa_support TEXT NOT NULL DEFAULT '',
    salary_benefits TEXT NOT NULL DEFAULT '',
    career_growth TEXT NOT NULL DEFAULT '',
    work_life_balance TEXT NOT NULL DEFAULT '',
    recommendation_score REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    report_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(company_id) REFERENCES guide_companies(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_company_reviews_company ON guide_company_reviews(company_id, status, created_at);

CREATE TABLE IF NOT EXISTS guide_interview_reviews (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    anonymous INTEGER NOT NULL DEFAULT 1,
    position TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT '',
    interview_year INTEGER NOT NULL DEFAULT 0,
    city TEXT NOT NULL DEFAULT '',
    interview_language TEXT NOT NULL DEFAULT '',
    interview_rounds INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL DEFAULT '',
    questions TEXT NOT NULL DEFAULT '',
    process_description TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    offer_received INTEGER NOT NULL DEFAULT -1,
    duration_weeks INTEGER NOT NULL DEFAULT 0,
    tips TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    report_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(company_id) REFERENCES guide_companies(id)
);
CREATE INDEX IF NOT EXISTS idx_guide_interview_reviews_company ON guide_interview_reviews(company_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_interview_reviews_filter ON guide_interview_reviews(status, city, interview_year);

CREATE TABLE IF NOT EXISTS guide_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(key, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_tags_scope ON guide_tags(country, category_key, sort_order);

CREATE TABLE IF NOT EXISTS guide_topics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    article_slugs TEXT NOT NULL DEFAULT '',
    product_slugs TEXT NOT NULL DEFAULT '',
    cover_image TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE(slug, country)
);
CREATE INDEX IF NOT EXISTS idx_guide_topics_scope ON guide_topics(country, status, category_key, sort_order);

CREATE TABLE IF NOT EXISTS guide_faq (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    category_key TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_faq_scope ON guide_faq(country, status, sort_order);

CREATE TABLE IF NOT EXISTS guide_home_modules (
    id TEXT PRIMARY KEY,
    module_key TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    subtitle TEXT NOT NULL DEFAULT '',
    content_json TEXT NOT NULL DEFAULT '{}',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(module_key, country, language)
);
CREATE INDEX IF NOT EXISTS idx_guide_home_modules_scope ON guide_home_modules(country, language, status, is_active, sort_order);

-- Machi AI (原创 in-app assistant). Conversations + messages + a per-day usage
-- counter + thumbs feedback. Message content is functional data and is stored,
-- but the underlying provider/model is an internal detail (kept in
-- model_internal, never returned to clients) and nothing here is written to the
-- ordinary access log. See server.py machi_ai_* / api_guide_ai_*.
CREATE TABLE IF NOT EXISTS guide_ai_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'jp',
    language TEXT NOT NULL DEFAULT 'zh-CN',
    last_message_preview TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_guide_ai_conversations_user_updated ON guide_ai_conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_guide_ai_conversations_user_deleted ON guide_ai_conversations(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS guide_ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    source_count INTEGER NOT NULL DEFAULT 0,
    sources_json TEXT NOT NULL DEFAULT '',
    model_internal TEXT NOT NULL DEFAULT '',
    finish_reason TEXT NOT NULL DEFAULT '',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_ai_messages_conversation_created ON guide_ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_ai_messages_user_created ON guide_ai_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS guide_ai_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    free_count INTEGER NOT NULL DEFAULT 0,
    member_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_ai_usage_user_date ON guide_ai_usage(user_id, usage_date);

CREATE TABLE IF NOT EXISTS guide_ai_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    rating TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_ai_feedback_message ON guide_ai_feedback(message_id, created_at);

CREATE TABLE IF NOT EXISTS listing_taxonomy_categories (
    id TEXT PRIMARY KEY,
    listing_type TEXT NOT NULL,
    category_key TEXT NOT NULL,
    label TEXT NOT NULL,
    label_ja TEXT NOT NULL DEFAULT '',
    label_en TEXT NOT NULL DEFAULT '',
    section_key TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(listing_type, category_key)
);
CREATE INDEX IF NOT EXISTS idx_listing_taxonomy_categories_scope
    ON listing_taxonomy_categories(listing_type, is_active, section_key, sort_order);

CREATE TABLE IF NOT EXISTS listing_taxonomy_fields (
    id TEXT PRIMARY KEY,
    listing_type TEXT NOT NULL,
    category_key TEXT NOT NULL DEFAULT '',
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    label_ja TEXT NOT NULL DEFAULT '',
    label_en TEXT NOT NULL DEFAULT '',
    field_kind TEXT NOT NULL DEFAULT 'text',
    placeholder TEXT NOT NULL DEFAULT '',
    placeholder_ja TEXT NOT NULL DEFAULT '',
    placeholder_en TEXT NOT NULL DEFAULT '',
    help_text TEXT NOT NULL DEFAULT '',
    options_json TEXT NOT NULL DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(listing_type, category_key, field_key)
);
CREATE INDEX IF NOT EXISTS idx_listing_taxonomy_fields_scope
    ON listing_taxonomy_fields(listing_type, category_key, is_active, sort_order);

CREATE TABLE IF NOT EXISTS device_push_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'ios',
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON device_push_tokens(user_id);

-- Machi Points wallet. A points balance is internal scrip: it can be bought
-- (Stripe / Apple IAP / Google Play), spent on digital guide products, and
-- refunded back, but it is NEVER cash — no withdrawal, no transfer, no fiat
-- conversion. balance_points is the live balance; the ledger is the audit of
-- every movement and the source of truth a balance can be rebuilt from.
CREATE TABLE IF NOT EXISTS wallet_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    balance_points INTEGER NOT NULL DEFAULT 0,
    lifetime_purchased_points INTEGER NOT NULL DEFAULT 0,
    lifetime_bonus_points INTEGER NOT NULL DEFAULT 0,
    lifetime_spent_points INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    points_delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    source_type TEXT NOT NULL DEFAULT '',
    source_order_id TEXT NOT NULL DEFAULT '',
    source_transaction_id TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idem ON wallet_ledger_entries(user_id, idempotency_key) WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger_entries(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_source ON wallet_ledger_entries(source_type, source_transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_product ON wallet_ledger_entries(product_id, created_at);

CREATE TABLE IF NOT EXISTS wallet_topup_products (
    id TEXT PRIMARY KEY,
    pack_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    points INTEGER NOT NULL,
    bonus_points INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    stripe_price_id TEXT NOT NULL DEFAULT '',
    apple_product_id TEXT NOT NULL DEFAULT '',
    ios_iap_product_id TEXT NOT NULL DEFAULT '',
    google_product_id TEXT NOT NULL DEFAULT '',
    huawei_product_id TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_topup_orders (
    id TEXT PRIMARY KEY,
    order_no TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    pack_key TEXT NOT NULL,
    points INTEGER NOT NULL,
    bonus_points INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'pending',
    payment_provider TEXT NOT NULL DEFAULT '',
    provider_trade_no TEXT NOT NULL DEFAULT '',
    provider_user_id TEXT NOT NULL DEFAULT '',
    provider_product_id TEXT NOT NULL DEFAULT '',
    checkout_session_id TEXT NOT NULL DEFAULT '',
    client_type TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    paid_at TEXT,
    fulfilled_at TEXT,
    refunded_at TEXT,
    closed_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_user ON wallet_topup_orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_status ON wallet_topup_orders(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_topup_orders_trade ON wallet_topup_orders(payment_provider, provider_trade_no) WHERE provider_trade_no <> '';

-- Generic post-purchase grants. A user "owns" a resource (a guide product /
-- file / member resource / boost / quota) via an active entitlement row, no
-- matter how it was acquired (points spend, Stripe, IAP, membership, admin).
-- download-url / detail views read this table so all paths share one check.
CREATE TABLE IF NOT EXISTS user_entitlements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    entitlement_type TEXT NOT NULL DEFAULT 'own',
    status TEXT NOT NULL DEFAULT 'active',
    source_type TEXT NOT NULL DEFAULT '',
    source_order_id TEXT NOT NULL DEFAULT '',
    source_ledger_id TEXT NOT NULL DEFAULT '',
    granted_at TEXT NOT NULL,
    expires_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, resource_type, resource_id, entitlement_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_entitlements_user ON user_entitlements(user_id, status, resource_type);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_resource ON user_entitlements(resource_type, resource_id);

-- ── External partner import backends (星域东京 等专属后台) ──────────────────
-- A partner is a scoped, token-gated mini-backend served at /partner/<key>.
-- It can batch-import listings (owned by ONE system seller account) and manage
-- its own reservation contacts. A partner is NEVER a site admin: the access
-- token only authorises that partner's own listings + contacts, nothing else.
CREATE TABLE IF NOT EXISTS partners (
    id TEXT PRIMARY KEY,
    partner_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    name_ja TEXT NOT NULL DEFAULT '',
    name_en TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    access_token_hash TEXT NOT NULL DEFAULT '',
    token_hint TEXT NOT NULL DEFAULT '',
    token_rotated_at TEXT NOT NULL DEFAULT '',
    seller_user_id TEXT NOT NULL DEFAULT '',
    default_city_slug TEXT NOT NULL DEFAULT 'tokyo',
    default_region_code TEXT NOT NULL DEFAULT '',
    default_country_code TEXT NOT NULL DEFAULT 'jp',
    default_listing_type TEXT NOT NULL DEFAULT 'rental',
    default_category TEXT NOT NULL DEFAULT '',
    sale_enabled INTEGER NOT NULL DEFAULT 0,
    brand_color TEXT NOT NULL DEFAULT '',
    accent_color TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    machi_recommended_default INTEGER NOT NULL DEFAULT 1,
    default_badges_json TEXT NOT NULL DEFAULT '[]',
    intro TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    listing_count INTEGER NOT NULL DEFAULT 0,
    created_by_admin_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_key ON partners(partner_key);

-- Reservation contacts (预约联系人) shown on a partner's imported listings.
CREATE TABLE IF NOT EXISTS partner_contacts (
    id TEXT PRIMARY KEY,
    partner_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    name_ja TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    line_id TEXT NOT NULL DEFAULT '',
    wechat_id TEXT NOT NULL DEFAULT '',
    whatsapp TEXT NOT NULL DEFAULT '',
    languages TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner ON partner_contacts(partner_key, sort_order);

-- 热搜/热榜 ranking snapshots: the hot-score refresher writes the top-N tags per
-- scope+window every ~10 min so rankDelta (this rank vs the previous snapshot's)
-- and velocity (this window's heat vs the previous equal-length window's) become
-- real instead of hard-coded 0. Retained ~7 days; the refresher prunes older rows.
-- NOTE: "window" and "rank" are reserved words in PostgreSQL (window functions),
-- so they MUST be double-quoted everywhere they appear as column identifiers —
-- in this DDL, the indexes, and every INSERT/SELECT against this table. SQLite
-- accepts the same double-quoted identifiers, so the quoting is portable.
CREATE TABLE IF NOT EXISTS topic_rank_snapshots (
    scope TEXT NOT NULL,
    "window" TEXT NOT NULL,
    tag TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    heat INTEGER NOT NULL DEFAULT 0,
    captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topic_rank_snapshots_lookup
    ON topic_rank_snapshots(scope, "window", captured_at);
CREATE INDEX IF NOT EXISTS idx_topic_rank_snapshots_tag
    ON topic_rank_snapshots(scope, "window", tag, captured_at);

-- Semantic-RAG index for Machi AI Guide retrieval (BE5). One row per public
-- Guide entity (article/school/company/product/faq). `vector` is a JSON array
-- of L2-normalized floats stored as TEXT so the DDL is SQLite/Postgres-identical
-- (no vector type, no _pg_xlate change). `content_hash` drives incremental
-- rebuilds — only rows whose source text changed are re-embedded. `model`/`dim`
-- let a model swap force a full rebuild. Empty/degraded (no embedding key) means
-- this table stays empty and retrieval runs pure LIKE, exactly as today.
CREATE TABLE IF NOT EXISTS guide_embeddings (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'jp',
    content_hash TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    dim INTEGER NOT NULL DEFAULT 0,
    vector TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_guide_embeddings_country ON guide_embeddings(country, entity_type);

-- JLPT 备考核心 (BE6/BE7): 题库 + 定级 + 打卡 + 单词 + 在线考试 + 考试日历.
-- Original / imported study content only — never unauthorized past-paper text
-- (source column keeps provenance auditable so 'imported'真题 can be pulled).
-- All types are TEXT/INTEGER so this DDL is byte-identical on SQLite / Postgres.
CREATE TABLE IF NOT EXISTS jlpt_questions (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'N5',
    section TEXT NOT NULL DEFAULT 'vocab',
    question_type TEXT NOT NULL DEFAULT 'single',
    stem TEXT NOT NULL DEFAULT '',
    passage TEXT NOT NULL DEFAULT '',
    audio_media_id TEXT NOT NULL DEFAULT '',
    choices_json TEXT NOT NULL DEFAULT '[]',
    answer_index INTEGER NOT NULL DEFAULT 0,
    explanation TEXT NOT NULL DEFAULT '',
    difficulty INTEGER NOT NULL DEFAULT 3,
    tags TEXT NOT NULL DEFAULT '',
    is_member_only INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'original',
    review_status TEXT NOT NULL DEFAULT 'approved',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jlpt_questions_pick ON jlpt_questions(level, section, status, review_status, is_member_only);

CREATE TABLE IF NOT EXISTS jlpt_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL DEFAULT '',
    selected_index INTEGER NOT NULL DEFAULT -1,
    is_correct INTEGER NOT NULL DEFAULT 0,
    session_id TEXT NOT NULL DEFAULT '',
    source_kind TEXT NOT NULL DEFAULT 'practice',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user ON jlpt_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user_q ON jlpt_attempts(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user_correct ON jlpt_attempts(user_id, is_correct);

CREATE TABLE IF NOT EXISTS jlpt_vocab_words (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'N5',
    word TEXT NOT NULL DEFAULT '',
    reading TEXT NOT NULL DEFAULT '',
    meaning_zh TEXT NOT NULL DEFAULT '',
    meaning_en TEXT NOT NULL DEFAULT '',
    pos TEXT NOT NULL DEFAULT '',
    example TEXT NOT NULL DEFAULT '',
    example_zh TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'original',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_words_level ON jlpt_vocab_words(level, status);

CREATE TABLE IF NOT EXISTS jlpt_vocab_decks (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'N5',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    word_count INTEGER NOT NULL DEFAULT 0,
    is_member_only INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_decks_level ON jlpt_vocab_decks(level, status);

CREATE TABLE IF NOT EXISTS jlpt_vocab_deck_words (
    deck_id TEXT NOT NULL,
    word_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(deck_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_deck_words_deck ON jlpt_vocab_deck_words(deck_id, sort_order);

CREATE TABLE IF NOT EXISTS jlpt_user_vocab (
    user_id TEXT NOT NULL,
    word_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'learning',
    review_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_jlpt_user_vocab_state ON jlpt_user_vocab(user_id, state);

CREATE TABLE IF NOT EXISTS jlpt_exams (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'N5',
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'mock',
    section TEXT NOT NULL DEFAULT '',
    question_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    pass_score INTEGER NOT NULL DEFAULT 60,
    is_member_only INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jlpt_exams_level ON jlpt_exams(level, status);

CREATE TABLE IF NOT EXISTS jlpt_exam_questions (
    exam_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(exam_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_jlpt_exam_questions_exam ON jlpt_exam_questions(exam_id, sort_order);

CREATE TABLE IF NOT EXISTS jlpt_exam_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    question_ids_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_jlpt_exam_sessions_user ON jlpt_exam_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS jlpt_exam_answers (
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    selected_index INTEGER NOT NULL DEFAULT -1,
    is_correct INTEGER NOT NULL DEFAULT 0,
    UNIQUE(session_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_jlpt_exam_answers_session ON jlpt_exam_answers(session_id);

CREATE TABLE IF NOT EXISTS jlpt_exam_dates (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL DEFAULT 'jp',
    session_label TEXT NOT NULL DEFAULT '',
    exam_date TEXT NOT NULL DEFAULT '',
    reg_open_date TEXT NOT NULL DEFAULT '',
    reg_close_date TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published'
);
CREATE INDEX IF NOT EXISTS idx_jlpt_exam_dates_region ON jlpt_exam_dates(region, exam_date);

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
    (
        19,
        "account security: verification audit logs",
        """
        CREATE TABLE IF NOT EXISTS security_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL DEFAULT '',
            ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id, created_at);
        """,
    ),
    (
        20,
        "machi guide: japan schools and foreigner-friendly company database",
        """
        CREATE TABLE IF NOT EXISTS guide_schools (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            school_name TEXT NOT NULL,
            school_name_jp TEXT NOT NULL DEFAULT '',
            school_name_en TEXT NOT NULL DEFAULT '',
            school_type TEXT NOT NULL DEFAULT 'other',
            country TEXT NOT NULL DEFAULT 'jp',
            prefecture TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL DEFAULT '',
            website TEXT NOT NULL DEFAULT '',
            admission_url TEXT NOT NULL DEFAULT '',
            international_admission_url TEXT NOT NULL DEFAULT '',
            application_url TEXT NOT NULL DEFAULT '',
            scholarship_url TEXT NOT NULL DEFAULT '',
            career_support_url TEXT NOT NULL DEFAULT '',
            language_support_url TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            short_description TEXT NOT NULL DEFAULT '',
            is_accepting_international_students INTEGER NOT NULL DEFAULT -1,
            has_english_program INTEGER NOT NULL DEFAULT -1,
            has_japanese_program INTEGER NOT NULL DEFAULT -1,
            has_scholarship INTEGER NOT NULL DEFAULT -1,
            has_dormitory INTEGER NOT NULL DEFAULT -1,
            has_career_support INTEGER NOT NULL DEFAULT -1,
            has_language_support INTEGER NOT NULL DEFAULT -1,
            tuition_min INTEGER NOT NULL DEFAULT 0,
            tuition_max INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            application_periods TEXT NOT NULL DEFAULT '',
            admission_months TEXT NOT NULL DEFAULT '',
            required_japanese_level TEXT NOT NULL DEFAULT 'unknown',
            required_english_level TEXT NOT NULL DEFAULT 'unknown',
            eju_required TEXT NOT NULL DEFAULT 'unknown',
            jlpt_required TEXT NOT NULL DEFAULT 'unknown',
            toefl_required TEXT NOT NULL DEFAULT 'unknown',
            ielts_required TEXT NOT NULL DEFAULT 'unknown',
            fields_of_study TEXT NOT NULL DEFAULT '',
            departments TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_name TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            source_last_checked_at TEXT,
            verification_status TEXT NOT NULL DEFAULT 'needs_review',
            is_featured INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            view_count INTEGER NOT NULL DEFAULT 0,
            save_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(slug, country)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_schools_scope ON guide_schools(country, status, school_type, prefecture, city);
        CREATE INDEX IF NOT EXISTS idx_guide_schools_featured ON guide_schools(country, status, is_featured, updated_at);

        CREATE TABLE IF NOT EXISTS guide_school_programs (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL,
            program_name TEXT NOT NULL,
            program_name_jp TEXT NOT NULL DEFAULT '',
            program_name_en TEXT NOT NULL DEFAULT '',
            degree_level TEXT NOT NULL DEFAULT 'other',
            program_type TEXT NOT NULL DEFAULT 'regular',
            field TEXT NOT NULL DEFAULT '',
            language_of_instruction TEXT NOT NULL DEFAULT '',
            duration_months INTEGER NOT NULL DEFAULT 0,
            admission_months TEXT NOT NULL DEFAULT '',
            application_period TEXT NOT NULL DEFAULT '',
            tuition INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            required_japanese_level TEXT NOT NULL DEFAULT 'unknown',
            required_english_level TEXT NOT NULL DEFAULT 'unknown',
            eju_required TEXT NOT NULL DEFAULT 'unknown',
            jlpt_required TEXT NOT NULL DEFAULT 'unknown',
            toefl_required TEXT NOT NULL DEFAULT 'unknown',
            ielts_required TEXT NOT NULL DEFAULT 'unknown',
            description TEXT NOT NULL DEFAULT '',
            application_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(school_id) REFERENCES guide_schools(id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_school_programs_school ON guide_school_programs(school_id, status, degree_level);

        CREATE TABLE IF NOT EXISTS guide_school_admissions (
            id TEXT PRIMARY KEY,
            school_id TEXT NOT NULL,
            program_id TEXT NOT NULL DEFAULT '',
            admission_type TEXT NOT NULL DEFAULT 'international_student',
            target_student_type TEXT NOT NULL DEFAULT '',
            application_start TEXT,
            application_deadline TEXT,
            exam_date TEXT,
            result_date TEXT,
            enrollment_month TEXT NOT NULL DEFAULT '',
            required_documents TEXT NOT NULL DEFAULT '',
            selection_method TEXT NOT NULL DEFAULT '',
            application_fee INTEGER NOT NULL DEFAULT 0,
            tuition_first_year INTEGER NOT NULL DEFAULT 0,
            scholarship_info TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(school_id) REFERENCES guide_schools(id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_school_admissions_school ON guide_school_admissions(school_id, status, enrollment_month);

        CREATE TABLE IF NOT EXISTS guide_company_positions (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            position_title TEXT NOT NULL,
            position_title_jp TEXT NOT NULL DEFAULT '',
            position_category TEXT NOT NULL DEFAULT 'other',
            employment_type TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            remote_type TEXT NOT NULL DEFAULT '',
            salary_min INTEGER NOT NULL DEFAULT 0,
            salary_max INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            japanese_level_required TEXT NOT NULL DEFAULT 'unknown',
            english_level_required TEXT NOT NULL DEFAULT 'unknown',
            visa_support TEXT NOT NULL DEFAULT 'unknown',
            description TEXT NOT NULL DEFAULT '',
            requirements TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(company_id) REFERENCES guide_companies(id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_company_positions_company ON guide_company_positions(company_id, status, position_category);

        CREATE TABLE IF NOT EXISTS guide_correction_reports (
            id TEXT PRIMARY KEY,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            field_name TEXT NOT NULL DEFAULT '',
            current_value TEXT NOT NULL DEFAULT '',
            suggested_value TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_corrections_target ON guide_correction_reports(target_type, target_id, status, created_at);
        """,
    ),
    (
        21,
        "auth: add google oauth identities and state table",
        """
        ALTER TABLE users ADD COLUMN google_sub TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
        ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub <> '';
        CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider, created_at);

        CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT 'google',
            client TEXT NOT NULL DEFAULT 'web',
            redirect TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT,
            ip TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at, consumed_at);
        """,
    ),
    (
        22,
        "settings: let unset language follow system defaults",
        """
        UPDATE settings
           SET language = ''
         WHERE language = 'zh-Hans';
        """,
    ),
    (
        23,
        "auth: oauth_states intent + link_user_id (bind google to an existing account)",
        """
        ALTER TABLE oauth_states ADD COLUMN intent TEXT NOT NULL DEFAULT 'login';
        ALTER TABLE oauth_states ADD COLUMN link_user_id TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        24,
        "city listings: structured marketplace, rentals, jobs and services",
        """
        CREATE TABLE IF NOT EXISTS seller_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            bio TEXT NOT NULL DEFAULT '',
            verification_status TEXT NOT NULL DEFAULT 'unverified',
            rating REAL NOT NULL DEFAULT 0,
            listing_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS business_profiles (
            id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL DEFAULT '',
            business_name TEXT NOT NULL,
            business_type TEXT NOT NULL DEFAULT '',
            country_code TEXT NOT NULL DEFAULT '',
            city_slug TEXT NOT NULL DEFAULT '',
            verification_status TEXT NOT NULL DEFAULT 'pending',
            contact_method TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(owner_user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_business_profiles_city ON business_profiles(country_code, city_slug, verification_status);

        CREATE TABLE IF NOT EXISTS city_listings (
            id TEXT PRIMARY KEY,
            country_code TEXT NOT NULL DEFAULT '',
            city_id TEXT NOT NULL DEFAULT '',
            city_slug TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            type TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            price REAL,
            currency TEXT NOT NULL DEFAULT 'JPY',
            price_type TEXT NOT NULL DEFAULT '',
            location_text TEXT NOT NULL DEFAULT '',
            latitude REAL,
            longitude REAL,
            status TEXT NOT NULL DEFAULT 'published',
            verification_status TEXT NOT NULL DEFAULT 'unverified',
            seller_user_id TEXT NOT NULL DEFAULT '',
            business_id TEXT DEFAULT NULL,
            contact_method TEXT NOT NULL DEFAULT '',
            view_count INTEGER NOT NULL DEFAULT 0,
            inquiry_count INTEGER NOT NULL DEFAULT 0,
            favorite_count INTEGER NOT NULL DEFAULT 0,
            report_count INTEGER NOT NULL DEFAULT 0,
            is_promoted INTEGER NOT NULL DEFAULT 0,
            promotion_weight INTEGER NOT NULL DEFAULT 0,
            published_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(seller_user_id) REFERENCES users(id),
            FOREIGN KEY(business_id) REFERENCES business_profiles(id)
        );
        CREATE INDEX IF NOT EXISTS idx_city_listings_public ON city_listings(city_slug, type, status, published_at);
        CREATE INDEX IF NOT EXISTS idx_city_listings_region ON city_listings(region_code, type, status, published_at);
        CREATE INDEX IF NOT EXISTS idx_city_listings_seller ON city_listings(seller_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_city_listings_review ON city_listings(status, verification_status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_city_listings_search ON city_listings(type, category, city_slug, updated_at);

        CREATE TABLE IF NOT EXISTS listing_media (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            media_type TEXT NOT NULL DEFAULT 'image',
            url TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_cover INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(listing_id) REFERENCES city_listings(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_media_listing ON listing_media(listing_id, sort_order);

        CREATE TABLE IF NOT EXISTS listing_attributes (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '',
            value_type TEXT NOT NULL DEFAULT 'string',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(listing_id, key),
            FOREIGN KEY(listing_id) REFERENCES city_listings(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_attributes_key ON listing_attributes(key, value);

        CREATE TABLE IF NOT EXISTS listing_inquiries (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            sender_user_id TEXT NOT NULL DEFAULT '',
            seller_user_id TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            contact_value TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(sender_user_id) REFERENCES users(id),
            FOREIGN KEY(seller_user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_listing ON listing_inquiries(listing_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_user ON listing_inquiries(sender_user_id, created_at);

        CREATE TABLE IF NOT EXISTS listing_favorites (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(listing_id, user_id),
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_favorites_user ON listing_favorites(user_id, created_at);

        -- Reservation calendar (no money): merchants/landlords publish bookable
        -- time slots on a listing (看房 / 餐厅订座 / 服务预约); users reserve a slot.
        CREATE TABLE IF NOT EXISTS listing_booking_slots (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            start_at TEXT NOT NULL,
            end_at TEXT NOT NULL DEFAULT '',
            capacity INTEGER NOT NULL DEFAULT 1,
            booked_count INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_booking_slots_listing ON listing_booking_slots(listing_id, start_at);

        CREATE TABLE IF NOT EXISTS listing_bookings (
            id TEXT PRIMARY KEY,
            slot_id TEXT NOT NULL,
            listing_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_user ON listing_bookings(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_slot ON listing_bookings(slot_id);
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_owner ON listing_bookings(owner_id, created_at);

        CREATE TABLE IF NOT EXISTS listing_reports (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            reporter_id TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT 'other',
            note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(reporter_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_reports_listing ON listing_reports(listing_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_reports_status ON listing_reports(status, created_at);

        CREATE TABLE IF NOT EXISTS listing_admin_logs (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL DEFAULT '',
            listing_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_listing_admin_logs_listing ON listing_admin_logs(listing_id, created_at);
        """,
    ),
    (
        25,
        "city listings: inquiry contract, promotion and verification foundations",
        """
        ALTER TABLE listing_inquiries ADD COLUMN from_user_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE listing_inquiries ADD COLUMN to_user_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE listing_inquiries ADD COLUMN type TEXT NOT NULL DEFAULT 'general';
        UPDATE listing_inquiries
           SET from_user_id = sender_user_id
         WHERE from_user_id = '' AND sender_user_id != '';
        UPDATE listing_inquiries
           SET to_user_id = seller_user_id
         WHERE to_user_id = '' AND seller_user_id != '';
        UPDATE listing_inquiries
           SET status = 'new'
         WHERE status = 'open';
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_from ON listing_inquiries(from_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_to ON listing_inquiries(to_user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_status ON listing_inquiries(status, created_at);

        CREATE TABLE IF NOT EXISTS listing_promotions (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            promotion_type TEXT NOT NULL DEFAULT 'top',
            placement TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            weight INTEGER NOT NULL DEFAULT 10,
            starts_at TEXT,
            ends_at TEXT,
            purchased_by_user_id TEXT NOT NULL DEFAULT '',
            business_id TEXT DEFAULT NULL,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(purchased_by_user_id) REFERENCES users(id),
            FOREIGN KEY(business_id) REFERENCES business_profiles(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_promotions_listing ON listing_promotions(listing_id, status, ends_at);
        CREATE INDEX IF NOT EXISTS idx_listing_promotions_type ON listing_promotions(promotion_type, placement, status, ends_at);

        CREATE TABLE IF NOT EXISTS listing_verifications (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL DEFAULT '',
            subject_type TEXT NOT NULL DEFAULT 'seller',
            subject_id TEXT NOT NULL DEFAULT '',
            verification_type TEXT NOT NULL DEFAULT 'seller',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewer_admin_id TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            submitted_at TEXT NOT NULL,
            reviewed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(reviewer_admin_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_verifications_status ON listing_verifications(status, subject_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_verifications_listing ON listing_verifications(listing_id, status);
        """,
    ),
    (
        26,
        "city listings: platform promotion payment metadata",
        """
        ALTER TABLE listing_promotions ADD COLUMN price REAL;
        ALTER TABLE listing_promotions ADD COLUMN currency TEXT NOT NULL DEFAULT 'JPY';
        ALTER TABLE listing_promotions ADD COLUMN payment_provider TEXT NOT NULL DEFAULT '';
        ALTER TABLE listing_promotions ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
        CREATE INDEX IF NOT EXISTS idx_listing_promotions_payment ON listing_promotions(payment_provider, payment_status, created_at);
        """,
    ),
    (
        27,
        "city listings: remove launch placeholder names",
        """
        UPDATE listing_attributes
           SET value = 'Machi Dining'
         WHERE key = 'company_name' AND value LIKE 'Machi Dining D%';
        UPDATE listing_attributes
           SET value = 'Machi Partner'
         WHERE key = 'company_name' AND value LIKE 'Machi Partner D%';
        UPDATE listing_attributes
           SET value = 'Machi Coffee'
         WHERE key = 'merchant_name' AND value LIKE 'Machi Coffee D%';
        """,
    ),
    (
        28,
        "city reputation: xp, trust, badges, rewards and admin audit",
        """
        CREATE TABLE IF NOT EXISTS user_reputation (
            user_id TEXT PRIMARY KEY,
            xp INTEGER NOT NULL DEFAULT 0,
            reputation_score INTEGER NOT NULL DEFAULT 70,
            level INTEGER NOT NULL DEFAULT 1,
            risk_score INTEGER NOT NULL DEFAULT 0,
            reputation_status TEXT NOT NULL DEFAULT 'normal',
            growth_frozen INTEGER NOT NULL DEFAULT 0,
            frozen_until TEXT,
            freeze_reason TEXT NOT NULL DEFAULT '',
            frozen_by_admin_id TEXT NOT NULL DEFAULT '',
            last_event_at TEXT,
            violation_count INTEGER NOT NULL DEFAULT 0,
            helped_users INTEGER NOT NULL DEFAULT 0,
            quality_posts INTEGER NOT NULL DEFAULT 0,
            favorites_received INTEGER NOT NULL DEFAULT 0,
            reports_validated INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_reputation_level ON user_reputation(level, xp);
        CREATE INDEX IF NOT EXISTS idx_user_reputation_risk ON user_reputation(risk_score, reputation_score);

        CREATE TABLE IF NOT EXISTS reputation_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL DEFAULT '',
            admin_id TEXT NOT NULL DEFAULT '',
            rule_key TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL DEFAULT '',
            target_kind TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            xp_delta INTEGER NOT NULL DEFAULT 0,
            reputation_delta INTEGER NOT NULL DEFAULT 0,
            risk_delta INTEGER NOT NULL DEFAULT 0,
            xp_before INTEGER NOT NULL DEFAULT 0,
            xp_after INTEGER NOT NULL DEFAULT 0,
            reputation_before INTEGER NOT NULL DEFAULT 70,
            reputation_after INTEGER NOT NULL DEFAULT 70,
            risk_before INTEGER NOT NULL DEFAULT 0,
            risk_after INTEGER NOT NULL DEFAULT 0,
            level_before INTEGER NOT NULL DEFAULT 1,
            level_after INTEGER NOT NULL DEFAULT 1,
            reason TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reputation_events_user ON reputation_events(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_reputation_events_rule ON reputation_events(rule_key, user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_reputation_events_target ON reputation_events(target_kind, target_id, created_at);

        CREATE TABLE IF NOT EXISTS reputation_rules (
            key TEXT PRIMARY KEY,
            name_zh TEXT NOT NULL,
            name_en TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            event_type TEXT NOT NULL DEFAULT '',
            xp_delta INTEGER NOT NULL DEFAULT 0,
            reputation_delta INTEGER NOT NULL DEFAULT 0,
            risk_delta INTEGER NOT NULL DEFAULT 0,
            daily_xp_cap INTEGER NOT NULL DEFAULT 0,
            weekly_xp_cap INTEGER NOT NULL DEFAULT 0,
            monthly_xp_cap INTEGER NOT NULL DEFAULT 0,
            per_target_daily_xp_cap INTEGER NOT NULL DEFAULT 0,
            is_one_time INTEGER NOT NULL DEFAULT 0,
            requires_reviewed INTEGER NOT NULL DEFAULT 0,
            notify_user INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reputation_levels (
            level INTEGER PRIMARY KEY,
            xp_required INTEGER NOT NULL DEFAULT 0,
            name_zh TEXT NOT NULL,
            name_en TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            description_zh TEXT NOT NULL DEFAULT '',
            description_en TEXT NOT NULL DEFAULT '',
            description_ja TEXT NOT NULL DEFAULT '',
            privileges_json TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reputation_privileges (
            id TEXT PRIMARY KEY,
            level INTEGER NOT NULL DEFAULT 1,
            key TEXT NOT NULL,
            title_zh TEXT NOT NULL,
            title_en TEXT NOT NULL DEFAULT '',
            title_ja TEXT NOT NULL DEFAULT '',
            description_zh TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            UNIQUE(level, key)
        );
        CREATE INDEX IF NOT EXISTS idx_reputation_privileges_level ON reputation_privileges(level, sort_order);

        CREATE TABLE IF NOT EXISTS badges (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            name_zh TEXT NOT NULL,
            name_en TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            rarity TEXT NOT NULL DEFAULT 'common',
            description_zh TEXT NOT NULL DEFAULT '',
            is_official INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_badges (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            granted_by_admin_id TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            is_displayed INTEGER NOT NULL DEFAULT 1,
            revoked_at TEXT,
            revoked_by_admin_id TEXT NOT NULL DEFAULT '',
            revoke_reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, badge_id, revoked_at),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(badge_id) REFERENCES badges(id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, revoked_at, created_at);

        CREATE TABLE IF NOT EXISTS reputation_rewards (
            id TEXT PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            name_zh TEXT NOT NULL,
            name_en TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            reward_type TEXT NOT NULL DEFAULT '',
            required_level INTEGER NOT NULL DEFAULT 1,
            quantity INTEGER NOT NULL DEFAULT 1,
            metadata TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_rewards (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            reward_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'available',
            quantity INTEGER NOT NULL DEFAULT 1,
            source_event_id TEXT NOT NULL DEFAULT '',
            claimed_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, reward_id, source_event_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(reward_id) REFERENCES reputation_rewards(id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_rewards(user_id, status, created_at);

        CREATE TABLE IF NOT EXISTS reputation_limits (
            key TEXT PRIMARY KEY,
            value INTEGER NOT NULL DEFAULT 0,
            description TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trust_reviews (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            target_kind TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            review_type TEXT NOT NULL DEFAULT 'risk',
            status TEXT NOT NULL DEFAULT 'open',
            risk_score INTEGER NOT NULL DEFAULT 0,
            reasons TEXT NOT NULL DEFAULT '',
            assigned_admin_id TEXT NOT NULL DEFAULT '',
            resolved_by_admin_id TEXT NOT NULL DEFAULT '',
            resolution TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            resolved_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_trust_reviews_status ON trust_reviews(status, risk_score, created_at);
        CREATE INDEX IF NOT EXISTS idx_trust_reviews_user ON trust_reviews(user_id, created_at);

        CREATE TABLE IF NOT EXISTS admin_action_logs (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            target_kind TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_admin_action_logs_target ON admin_action_logs(target_kind, target_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_admin_action_logs_admin ON admin_action_logs(admin_id, created_at);
        """,
    ),
    # Contacting a city listing now opens a real DM thread instead of a
    # write-only inquiry form. Notifications grow listing/conversation
    # targets so the seller's bell deep-links straight into the chat, and
    # each inquiry remembers the conversation it spawned so 我的咨询 can jump
    # back into the thread. Nullable columns — existing rows survive.
    (
        29,
        "listing inquiries: bind conversation + notification deep-links",
        """
        ALTER TABLE notifications ADD COLUMN target_listing_id TEXT;
        ALTER TABLE notifications ADD COLUMN target_conversation_id TEXT;
        ALTER TABLE listing_inquiries ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_notifications_listing ON notifications(target_listing_id, created_at);
        """,
    ),
    # Structured intake: rental 预约看房 / job 申请 / service 预约 forms post a
    # details=[{label,value}] payload that we keep as JSON on the inquiry so
    # 我的预约/我的申请 and the poster's 管理 can render the full brief.
    (
        30,
        "listing inquiries: structured intake payload",
        """
        ALTER TABLE listing_inquiries ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
        """,
    ),
    (
        31,
        "site settings: editable public brand metadata",
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );
        """,
    ),
    # Fast lookup for the inquiry idempotency / anti-double-submit dedupe window
    # (listing_id + from_user_id + created_at), and a hot index for "我的咨询".
    (
        32,
        "listing inquiries: dedupe + my-inquiries indexes",
        """
        CREATE INDEX IF NOT EXISTS idx_listing_inquiries_dedupe ON listing_inquiries(listing_id, from_user_id, created_at);
        """,
    ),
    (
        33,
        "uploads: S3 uploaded files, audit logs and listing associations",
        """
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id TEXT PRIMARY KEY,
            upload_id TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            bucket TEXT NOT NULL,
            object_key TEXT NOT NULL,
            public_url TEXT NOT NULL DEFAULT '',
            cdn_url TEXT NOT NULL DEFAULT '',
            content_type TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_type TEXT NOT NULL DEFAULT 'other',
            purpose TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT '',
            entity_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0,
            duration REAL NOT NULL DEFAULT 0,
            checksum TEXT NOT NULL DEFAULT '',
            etag TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_uploaded_files_user ON uploaded_files(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_uploaded_files_entity ON uploaded_files(entity_type, entity_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_uploaded_files_status ON uploaded_files(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_uploaded_files_object ON uploaded_files(object_key);

        CREATE TABLE IF NOT EXISTS upload_audit_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT '',
            uploaded_file_id TEXT NOT NULL DEFAULT '',
            upload_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_upload_audit_file ON upload_audit_logs(uploaded_file_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_upload_audit_user ON upload_audit_logs(user_id, created_at);

        ALTER TABLE listing_media ADD COLUMN uploaded_file_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_product_files ADD COLUMN uploaded_file_id TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_listing_media_uploaded_file ON listing_media(uploaded_file_id);
        CREATE INDEX IF NOT EXISTS idx_guide_product_files_uploaded_file ON guide_product_files(uploaded_file_id);
        """,
    ),
    (
        34,
        "uploads: post video media and private message attachments",
        """
        ALTER TABLE post_media ADD COLUMN uploaded_file_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE post_media ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image';
        ALTER TABLE post_media ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE post_media ADD COLUMN is_cover INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE post_media ADD COLUMN thumbnail_file_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE post_media ADD COLUMN duration_seconds REAL NOT NULL DEFAULT 0;
        ALTER TABLE post_media ADD COLUMN width INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE post_media ADD COLUMN height INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE post_media ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'none';
        ALTER TABLE post_media ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
        ALTER TABLE post_media ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_post_media_uploaded_file ON post_media(uploaded_file_id);
        CREATE INDEX IF NOT EXISTS idx_post_media_type ON post_media(media_type, processing_status);

        CREATE TABLE IF NOT EXISTS message_attachments (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            uploaded_file_id TEXT NOT NULL,
            attachment_type TEXT NOT NULL DEFAULT 'image',
            thumbnail_file_id TEXT NOT NULL DEFAULT '',
            duration_seconds REAL NOT NULL DEFAULT 0,
            file_name TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            content_type TEXT NOT NULL DEFAULT '',
            visibility TEXT NOT NULL DEFAULT 'thread_members_only',
            status TEXT NOT NULL DEFAULT 'ready',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, status);
        CREATE INDEX IF NOT EXISTS idx_message_attachments_thread ON message_attachments(thread_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_message_attachments_file ON message_attachments(uploaded_file_id);
        """,
    ),
    (
        35,
        "idempotency: generic Idempotency-Key store for safe write retries",
        """
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            scope TEXT NOT NULL,
            idem_key TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            ip TEXT NOT NULL DEFAULT '',
            status INTEGER NOT NULL,
            response_body BLOB NOT NULL,
            created_epoch INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            PRIMARY KEY (scope, idem_key)
        );
        CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_epoch);
        """,
    ),
    (
        36,
        "post media: reconcile legacy link types with stored object mime",
        """
        UPDATE post_media
           SET media_type = (
               SELECT CASE
                   WHEN lower(m.mime) LIKE 'video/%' OR lower(m.type) = 'video' THEN 'video'
                   WHEN lower(m.mime) LIKE 'image/%' OR lower(m.type) = 'image' THEN 'image'
                   ELSE post_media.media_type
               END
                 FROM media m
                WHERE m.id = post_media.media_id
           )
         WHERE EXISTS (
               SELECT 1
                 FROM media m
                WHERE m.id = post_media.media_id
                  AND (
                      (lower(m.mime) LIKE 'video/%' OR lower(m.type) = 'video')
                      OR (lower(m.mime) LIKE 'image/%' OR lower(m.type) = 'image')
                  )
           );
        """,
    ),
    (
        37,
        "messages: per-user conversation hide state",
        """
        ALTER TABLE conversations ADD COLUMN hidden_for_a_at TEXT;
        ALTER TABLE conversations ADD COLUMN hidden_for_b_at TEXT;
        """,
    ),
    (
        38,
        "email campaigns: admin bulk email drafts and delivery logs",
        """
        CREATE TABLE IF NOT EXISTS email_campaigns (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            audience TEXT NOT NULL DEFAULT 'all',
            status TEXT NOT NULL DEFAULT 'draft',
            recipient_count INTEGER NOT NULL DEFAULT 0,
            sent_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status, created_at);

        CREATE TABLE IF NOT EXISTS email_campaign_recipients (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            sent_at TEXT,
            UNIQUE(campaign_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id, status);
        """,
    ),
    (
        39,
        "seller profiles: enforce one profile per user for listing upserts",
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_profiles_user_unique
            ON seller_profiles(user_id);
        """,
    ),
    (
        40,
        "search: pg_trgm GIN indexes so user-facing ILIKE '%q%' search stops seq-scanning (PostgreSQL only)",
        """
        -- backend: postgres
        DO $kaix_trgm$
        BEGIN
            BEGIN
                CREATE EXTENSION IF NOT EXISTS pg_trgm;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'pg_trgm extension unavailable, skipping trigram indexes: %', SQLERRM;
            END;
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
                CREATE INDEX IF NOT EXISTS idx_trgm_posts_content
                    ON posts USING gin (content gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_listings_title
                    ON city_listings USING gin (title gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_listings_description
                    ON city_listings USING gin (description gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_listings_location
                    ON city_listings USING gin (location_text gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_listings_category
                    ON city_listings USING gin (category gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_users_handle
                    ON users USING gin (handle gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_users_display_name
                    ON users USING gin (display_name gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_trgm_post_tags_tag
                    ON post_tags USING gin (tag gin_trgm_ops);
            END IF;
        END
        $kaix_trgm$;
        """,
    ),
    (
        41,
        "messaging privacy: users.dm_privacy gates who may start or continue direct messages",
        """
        ALTER TABLE users ADD COLUMN dm_privacy TEXT NOT NULL DEFAULT 'everyone';
        """,
    ),
    (
        42,
        "APNs: per-device push tokens so social notifications reach killed apps",
        """
        CREATE TABLE IF NOT EXISTS device_push_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            platform TEXT NOT NULL DEFAULT 'ios',
            created_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON device_push_tokens(user_id);
        """,
    ),
    (
        43,
        "businesses: real merchant application, document review and console metadata",
        """
        ALTER TABLE business_profiles ADD COLUMN legal_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN representative_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN registration_number TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN email TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN website TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN address TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN service_categories TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE business_profiles ADD COLUMN service_cities TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE business_profiles ADD COLUMN opening_hours TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE business_profiles ADD COLUMN logo_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN application_note TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
        ALTER TABLE business_profiles ADD COLUMN submitted_at TEXT;
        ALTER TABLE business_profiles ADD COLUMN reviewed_at TEXT;
        ALTER TABLE business_profiles ADD COLUMN reviewer_admin_id TEXT NOT NULL DEFAULT '';

        CREATE INDEX IF NOT EXISTS idx_business_profiles_owner
            ON business_profiles(owner_user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_business_profiles_review
            ON business_profiles(verification_status, submitted_at, updated_at);

        CREATE TABLE IF NOT EXISTS business_verification_documents (
            id TEXT PRIMARY KEY,
            business_id TEXT NOT NULL,
            uploaded_file_id TEXT NOT NULL,
            document_type TEXT NOT NULL DEFAULT 'registration',
            label TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'submitted',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(business_id, uploaded_file_id),
            FOREIGN KEY(business_id) REFERENCES business_profiles(id),
            FOREIGN KEY(uploaded_file_id) REFERENCES uploaded_files(id)
        );
        CREATE INDEX IF NOT EXISTS idx_business_documents_business
            ON business_verification_documents(business_id, status, created_at);

        CREATE TABLE IF NOT EXISTS business_review_logs (
            id TEXT PRIMARY KEY,
            business_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            from_status TEXT NOT NULL DEFAULT '',
            to_status TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY(business_id) REFERENCES business_profiles(id),
            FOREIGN KEY(actor_user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_business_review_logs_business
            ON business_review_logs(business_id, created_at);
        """,
    ),
    (
        44,
        "listing reviews: local-service ratings on services/deals + denormalized listing aggregates",
        """
        CREATE TABLE IF NOT EXISTS listing_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            business_id TEXT NOT NULL DEFAULT '',
            user_id TEXT NOT NULL,
            rating INTEGER NOT NULL DEFAULT 5,
            content TEXT NOT NULL DEFAULT '',
            visit_date TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            owner_reply TEXT NOT NULL DEFAULT '',
            owner_reply_at TEXT,
            helpful_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(listing_id, user_id),
            FOREIGN KEY(listing_id) REFERENCES city_listings(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_reviews_listing
            ON listing_reviews(listing_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_reviews_user
            ON listing_reviews(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_reviews_business
            ON listing_reviews(business_id, status, created_at);

        ALTER TABLE city_listings ADD COLUMN rating_avg REAL NOT NULL DEFAULT 0;
        ALTER TABLE city_listings ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_city_listings_rating
            ON city_listings(type, status, rating_avg, rating_count);
        """,
    ),
    (
        45,
        "auth: add Sign in with Apple identity column",
        """
        ALTER TABLE users ADD COLUMN apple_sub TEXT NOT NULL DEFAULT '';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub <> '';
        """,
    ),
    (
        46,
        "marketing: editable master copy overrides",
        """
        CREATE TABLE IF NOT EXISTS marketing_copy_overrides (
            locale TEXT NOT NULL,
            copy_key TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY(locale, copy_key)
        );
        CREATE INDEX IF NOT EXISTS idx_marketing_copy_overrides_locale
            ON marketing_copy_overrides(locale, copy_key);
        """,
    ),
    (
        47,
        "guide cms: editable taxonomy, topics, home modules and article SEO",
        """
        -- backend: postgres
        ALTER TABLE guide_categories ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_categories ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';

        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS related_article_slugs TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS related_product_slugs TEXT NOT NULL DEFAULT '';

        ALTER TABLE guide_tags ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_tags ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE guide_tags ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT '';

        CREATE TABLE IF NOT EXISTS guide_topics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            slug TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category_key TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            article_slugs TEXT NOT NULL DEFAULT '',
            product_slugs TEXT NOT NULL DEFAULT '',
            cover_image TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT 'jp',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            published_at TEXT,
            UNIQUE(slug, country)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_topics_scope
            ON guide_topics(country, status, category_key, sort_order);

        CREATE TABLE IF NOT EXISTS guide_home_modules (
            id TEXT PRIMARY KEY,
            module_key TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            subtitle TEXT NOT NULL DEFAULT '',
            content_json TEXT NOT NULL DEFAULT '{}',
            country TEXT NOT NULL DEFAULT 'jp',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(module_key, country, language)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_home_modules_scope
            ON guide_home_modules(country, language, status, is_active, sort_order);
        """,
    ),
    (
        48,
        "guide products: related articles and topic associations",
        """
        -- backend: postgres
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS related_article_slugs TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS topic_slugs TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        49,
        "listing taxonomy: editable categories and fields",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS listing_taxonomy_categories (
            id TEXT PRIMARY KEY,
            listing_type TEXT NOT NULL,
            category_key TEXT NOT NULL,
            label TEXT NOT NULL,
            label_ja TEXT NOT NULL DEFAULT '',
            label_en TEXT NOT NULL DEFAULT '',
            section_key TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(listing_type, category_key)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_taxonomy_categories_scope
            ON listing_taxonomy_categories(listing_type, is_active, section_key, sort_order);

        CREATE TABLE IF NOT EXISTS listing_taxonomy_fields (
            id TEXT PRIMARY KEY,
            listing_type TEXT NOT NULL,
            category_key TEXT NOT NULL DEFAULT '',
            field_key TEXT NOT NULL,
            label TEXT NOT NULL,
            label_ja TEXT NOT NULL DEFAULT '',
            label_en TEXT NOT NULL DEFAULT '',
            field_kind TEXT NOT NULL DEFAULT 'text',
            placeholder TEXT NOT NULL DEFAULT '',
            placeholder_ja TEXT NOT NULL DEFAULT '',
            placeholder_en TEXT NOT NULL DEFAULT '',
            help_text TEXT NOT NULL DEFAULT '',
            options_json TEXT NOT NULL DEFAULT '[]',
            required INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(listing_type, category_key, field_key)
        );
        CREATE INDEX IF NOT EXISTS idx_listing_taxonomy_fields_scope
            ON listing_taxonomy_fields(listing_type, category_key, is_active, sort_order);
        """,
    ),
    (
        50,
        "membership copy: remove legacy subscription wording",
        """
        -- backend: postgres
        UPDATE membership_plans
           SET subtitle = '按月购买，到期前可再次续购'
         WHERE plan_key IN ('machi_verified_monthly', 'machi_verified_monthly_cny_10')
           AND subtitle = '按月订阅，随时管理';

        UPDATE membership_plans
           SET description = '一次购买一年，同步获得 Machi 认证会员全部权益。'
         WHERE plan_key = 'machi_verified_yearly'
           AND description = '包年订阅，同步获得 Machi 认证会员全部权益。';
        """,
    ),
    (
        51,
        "users: admin-grantable official badge",
        """
        -- backend: postgres
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_official INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS official_role TEXT NOT NULL DEFAULT '';
        UPDATE users
           SET is_official = 1,
               official_role = CASE WHEN official_role = '' THEN 'admin' ELSE official_role END
         WHERE role = 'admin';
        """,
    ),
    (
        52,
        "membership plans: App Store Connect production IAP ids",
        """
        -- backend: postgres
        UPDATE membership_plans
           SET price = CASE WHEN price IN (0, 10) THEN 18 ELSE price END,
               amount_cents = CASE WHEN amount_cents IN (0, 1000) THEN 1800 ELSE amount_cents END,
               price_label = CASE WHEN price_label IN ('', '¥10 / 月') THEN '¥18 / 月' ELSE price_label END,
               ios_iap_product_id = CASE WHEN ios_iap_product_id IN ('', 'machi_verified_monthly_cny_10') THEN 'machi_yuedu_18' ELSE ios_iap_product_id END,
               apple_product_id = CASE WHEN apple_product_id IN ('', 'machi_verified_monthly_cny_10') THEN 'machi_yuedu_18' ELSE apple_product_id END
         WHERE plan_key = 'machi_verified_monthly'
           AND (ios_iap_product_id IN ('', 'machi_verified_monthly_cny_10')
                OR apple_product_id IN ('', 'machi_verified_monthly_cny_10')
                OR price_label = '¥10 / 月');

        UPDATE membership_plans
           SET price = CASE WHEN price IN (0, 98, 138) THEN 198 ELSE price END,
               amount_cents = CASE WHEN amount_cents IN (0, 9800, 13800) THEN 19800 ELSE amount_cents END,
               price_label = CASE WHEN price_label IN ('', '¥98 / 年', '¥138 / 年') THEN '¥198 / 年' ELSE price_label END,
               original_price = CASE WHEN original_price IN (0, 120) THEN 216 ELSE original_price END,
               discount_label = CASE WHEN discount_label IN ('', '约省 2 个月') THEN '约省 1 个月' ELSE discount_label END,
               ios_iap_product_id = CASE WHEN ios_iap_product_id IN ('', 'machi_verified_yearly_cny_98') THEN 'machi_1niandu_198' ELSE ios_iap_product_id END,
               apple_product_id = CASE WHEN apple_product_id IN ('', 'machi_verified_yearly_cny_98') THEN 'machi_1niandu_198' ELSE apple_product_id END
         WHERE plan_key = 'machi_verified_yearly'
           AND (ios_iap_product_id IN ('', 'machi_verified_yearly_cny_98')
                OR apple_product_id IN ('', 'machi_verified_yearly_cny_98')
                OR price_label IN ('¥98 / 年', '¥138 / 年'));
        """,
    ),
    (
        53,
        "social graph: dedupe follows and enforce unique pairs",
        """
        -- backend: postgres
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY follower_id, following_id
                       ORDER BY created_at ASC, id ASC
                   ) AS rn
              FROM follows
        )
        DELETE FROM follows
         WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_unique_pair
            ON follows(follower_id, following_id);
        """,
    ),
    (
        54,
        "drafts: persist structured publish metadata",
        """
        -- backend: postgres
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS province TEXT NOT NULL DEFAULT '';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS region_code TEXT NOT NULL DEFAULT '';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'dynamic';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS attributes TEXT NOT NULL DEFAULT '';
        ALTER TABLE drafts ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        55,
        "settings: per-type push toggle for listing inquiries/applications/bookings",
        """
        -- backend: postgres
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS push_inquiries INTEGER NOT NULL DEFAULT 1;
        """,
    ),
    (
        56,
        "reservation calendar: booking slots + bookings (no money)",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS listing_booking_slots (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            start_at TEXT NOT NULL,
            end_at TEXT NOT NULL DEFAULT '',
            capacity INTEGER NOT NULL DEFAULT 1,
            booked_count INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_booking_slots_listing ON listing_booking_slots(listing_id, start_at);
        CREATE TABLE IF NOT EXISTS listing_bookings (
            id TEXT PRIMARY KEY,
            slot_id TEXT NOT NULL,
            listing_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'confirmed',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_user ON listing_bookings(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_slot ON listing_bookings(slot_id);
        CREATE INDEX IF NOT EXISTS idx_listing_bookings_owner ON listing_bookings(owner_id, created_at);
        """,
    ),
    (
        57,
        "guide journeys: situation -> action path tables + article freshness fields",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_journeys (
            id TEXT PRIMARY KEY,
            journey_key TEXT NOT NULL,
            country TEXT NOT NULL DEFAULT 'jp',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            audience TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            hero_title TEXT NOT NULL DEFAULT '',
            hero_subtitle TEXT NOT NULL DEFAULT '',
            estimated_days INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(journey_key, country, language)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_journeys_scope ON guide_journeys(country, language, status, sort_order);
        CREATE TABLE IF NOT EXISTS guide_journey_steps (
            id TEXT PRIMARY KEY,
            journey_key TEXT NOT NULL,
            step_key TEXT NOT NULL,
            country TEXT NOT NULL DEFAULT 'jp',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            action_label TEXT NOT NULL DEFAULT '',
            action_type TEXT NOT NULL DEFAULT '',
            action_target TEXT NOT NULL DEFAULT '',
            category_key TEXT NOT NULL DEFAULT '',
            article_slugs TEXT NOT NULL DEFAULT '',
            product_slugs TEXT NOT NULL DEFAULT '',
            school_filters TEXT NOT NULL DEFAULT '{}',
            company_filters TEXT NOT NULL DEFAULT '{}',
            required INTEGER NOT NULL DEFAULT 1,
            estimated_minutes INTEGER NOT NULL DEFAULT 0,
            deadline_hint TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(journey_key, step_key, country, language)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_journey_steps_scope ON guide_journey_steps(journey_key, country, status, sort_order);
        CREATE TABLE IF NOT EXISTS guide_user_progress (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            journey_key TEXT NOT NULL,
            step_key TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'in_progress',
            completed_at TEXT,
            reminder_at TEXT,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, journey_key, step_key)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_user_progress_user ON guide_user_progress(user_id, journey_key, updated_at);
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS verified_at TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_articles ADD COLUMN IF NOT EXISTS stale_after_days INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    (
        58,
        "guide os: identity profile + plans + todos + reminders + applications + life items + calendar + product relations",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_user_profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            identity_type TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT 'jp',
            city TEXT NOT NULL DEFAULT '',
            is_in_japan INTEGER NOT NULL DEFAULT 0,
            visa_status TEXT NOT NULL DEFAULT '',
            visa_expires_at TEXT,
            japanese_level TEXT NOT NULL DEFAULT '',
            target_japanese_level TEXT NOT NULL DEFAULT '',
            graduation_date TEXT,
            target_entry_term TEXT NOT NULL DEFAULT '',
            target_industry TEXT NOT NULL DEFAULT '',
            target_school_type TEXT NOT NULL DEFAULT '',
            weekly_available_minutes INTEGER NOT NULL DEFAULT 0,
            needs_materials INTEGER NOT NULL DEFAULT 0,
            needs_services INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_user_profiles_user ON guide_user_profiles(user_id);
        CREATE TABLE IF NOT EXISTS guide_plans (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_type TEXT NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            target_date TEXT,
            started_at TEXT,
            progress_percent INTEGER NOT NULL DEFAULT 0,
            current_todo_id TEXT NOT NULL DEFAULT '',
            source_journey_key TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_plans_user ON guide_plans(user_id, status, updated_at);
        CREATE TABLE IF NOT EXISTS guide_todos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL DEFAULT '',
            source_type TEXT NOT NULL DEFAULT '',
            source_id TEXT NOT NULL DEFAULT '',
            journey_key TEXT NOT NULL DEFAULT '',
            step_key TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            todo_type TEXT NOT NULL DEFAULT 'guide_step',
            status TEXT NOT NULL DEFAULT 'not_started',
            priority TEXT NOT NULL DEFAULT 'normal',
            planned_date TEXT,
            due_at TEXT,
            reminder_at TEXT,
            completed_at TEXT,
            estimated_minutes INTEGER NOT NULL DEFAULT 0,
            notes TEXT NOT NULL DEFAULT '',
            related_article_slugs TEXT NOT NULL DEFAULT '',
            related_product_slugs TEXT NOT NULL DEFAULT '',
            related_service_slugs TEXT NOT NULL DEFAULT '',
            recurrence TEXT NOT NULL DEFAULT '',
            steps TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_todos_user_date ON guide_todos(user_id, status, due_at, planned_date);
        CREATE INDEX IF NOT EXISTS idx_guide_todos_plan ON guide_todos(plan_id, status, updated_at);
        CREATE TABLE IF NOT EXISTS guide_reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            todo_id TEXT NOT NULL DEFAULT '',
            plan_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            reminder_at TEXT,
            channel TEXT NOT NULL DEFAULT 'app',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, todo_id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_reminders_user_time ON guide_reminders(user_id, status, reminder_at);
        CREATE TABLE IF NOT EXISTS guide_applications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL DEFAULT 'school',
            name TEXT NOT NULL,
            department TEXT NOT NULL DEFAULT '',
            position TEXT NOT NULL DEFAULT '',
            deadline TEXT,
            interview_at TEXT,
            result_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_applications_user ON guide_applications(user_id, status, deadline);
        CREATE TABLE IF NOT EXISTS guide_life_items (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT '',
            amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            payment_method TEXT NOT NULL DEFAULT '',
            auto_debit INTEGER NOT NULL DEFAULT 0,
            due_day INTEGER NOT NULL DEFAULT 0,
            due_at TEXT,
            recurrence TEXT NOT NULL DEFAULT 'monthly',
            reminder_days_before INTEGER NOT NULL DEFAULT 3,
            notes TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_life_items_user ON guide_life_items(user_id, active, due_at);
        CREATE TABLE IF NOT EXISTS guide_calendar_items (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            todo_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            date TEXT,
            start_at TEXT,
            end_at TEXT,
            type TEXT NOT NULL DEFAULT 'todo',
            status TEXT NOT NULL DEFAULT 'active',
            plan_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_calendar_items_user_date ON guide_calendar_items(user_id, date, start_at);
        CREATE TABLE IF NOT EXISTS guide_product_relations (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            plan_type TEXT NOT NULL DEFAULT '',
            todo_type TEXT NOT NULL DEFAULT '',
            journey_key TEXT NOT NULL DEFAULT '',
            step_key TEXT NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_product_relations_scope ON guide_product_relations(plan_type, todo_type, journey_key, step_key, priority);
        """,
    ),
    (
        59,
        "guide progress: add planning fields for journey detail compatibility",
        """
        -- backend: postgres
        ALTER TABLE guide_user_progress ADD COLUMN IF NOT EXISTS planned_date TEXT;
        ALTER TABLE guide_user_progress ADD COLUMN IF NOT EXISTS due_at TEXT;
        ALTER TABLE guide_user_progress ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
        ALTER TABLE guide_user_progress ADD COLUMN IF NOT EXISTS notify_enabled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE guide_user_progress ADD COLUMN IF NOT EXISTS calendar_note TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        60,
        "guide os: admin-editable plan templates (milestone ladders)",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_plan_templates (
            id TEXT PRIMARY KEY,
            template_key TEXT NOT NULL,
            offset_days INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            todo_type TEXT NOT NULL DEFAULT 'guide_step',
            product_slugs TEXT NOT NULL DEFAULT '',
            service_slugs TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_plan_templates_key ON guide_plan_templates(template_key, status, offset_days);
        """,
    ),
    (
        61,
        "guide os: add recurrence to existing todo tables",
        """
        -- backend: postgres
        ALTER TABLE guide_todos ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        62,
        "guide os: add subtask steps (checklist) to todos",
        """
        -- backend: postgres
        ALTER TABLE guide_todos ADD COLUMN IF NOT EXISTS steps TEXT NOT NULL DEFAULT '[]';
        """,
    ),
    (
        63,
        "guide os: first-class contracts and document expiry reminders",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_contracts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            title TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT '',
            start_date TEXT,
            end_date TEXT,
            cancellation_window_start TEXT,
            cancellation_window_end TEXT,
            auto_renew INTEGER NOT NULL DEFAULT 0,
            monthly_cost INTEGER NOT NULL DEFAULT 0,
            yearly_cost INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            reminder_days_before INTEGER NOT NULL DEFAULT 30,
            contact_info TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_contracts_user_date
            ON guide_contracts(user_id, status, end_date, cancellation_window_start);
        CREATE TABLE IF NOT EXISTS guide_documents (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            title TEXT NOT NULL,
            expires_at TEXT,
            reminder_days_before INTEGER NOT NULL DEFAULT 60,
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_documents_user_date
            ON guide_documents(user_id, status, expires_at);
        """,
    ),
    (
        64,
        "guide os: application pipeline, stage history, links and contact fields",
        """
        -- backend: postgres
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS career_track TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'saved';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS website_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS interview_location TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS meeting_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS favorite INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_applications ADD COLUMN IF NOT EXISTS archived_at TEXT;
        CREATE TABLE IF NOT EXISTS guide_application_stages (
            id TEXT PRIMARY KEY,
            application_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_application_stages_app
            ON guide_application_stages(application_id, occurred_at, created_at);
        """,
    ),
    (
        65,
        "guide os: life payment history and recurring payment closure",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_life_payments (
            id TEXT PRIMARY KEY,
            life_item_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            payment_method TEXT NOT NULL DEFAULT '',
            paid_at TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_life_payments_item
            ON guide_life_payments(life_item_id, paid_at);
        """,
    ),
    (
        66,
        "guide os: todo custom lists and tags",
        """
        -- backend: postgres
        ALTER TABLE guide_todos ADD COLUMN IF NOT EXISTS list_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_todos ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        67,
        "guide os: first-class calendar events",
        """
        -- backend: postgres
        ALTER TABLE guide_calendar_items ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_calendar_items ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_calendar_items ADD COLUMN IF NOT EXISTS reminder_at TEXT;
        ALTER TABLE guide_calendar_items ADD COLUMN IF NOT EXISTS all_day INTEGER NOT NULL DEFAULT 1;
        """,
    ),
    (
        68,
        "guide os: article reading progress",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_article_progress (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            article_id TEXT NOT NULL,
            slug TEXT NOT NULL DEFAULT '',
            progress_percent INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            last_read_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, article_id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_article_progress_user ON guide_article_progress(user_id, updated_at);
        """,
    ),
    (
        69,
        "guide os: add auto_debit to life items",
        """
        -- backend: postgres
        ALTER TABLE guide_life_items ADD COLUMN IF NOT EXISTS auto_debit INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    (
        70,
        "guide finance: manual income/expense ledger",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'expense',
            amount BIGINT NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            category TEXT NOT NULL DEFAULT 'other',
            account TEXT NOT NULL DEFAULT '',
            occurred_on TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            source_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_transactions_user ON guide_transactions(user_id, occurred_on, kind);
        """,
    ),
    (
        71,
        "guide finance: per-category monthly budgets",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS guide_budgets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            category TEXT NOT NULL,
            monthly_limit BIGINT NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'JPY',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, category)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_budgets_user ON guide_budgets(user_id, category);
        """,
    ),
    (
        72,
        "miniapp: wechat openid -> machi user bindings",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS miniapp_openid_bindings (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL DEFAULT 'wechat',
            openid TEXT NOT NULL,
            unionid TEXT NOT NULL DEFAULT '',
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login_at TEXT NOT NULL DEFAULT '',
            UNIQUE(platform, openid)
        );
        CREATE INDEX IF NOT EXISTS idx_miniapp_bindings_user ON miniapp_openid_bindings(user_id);
        CREATE INDEX IF NOT EXISTS idx_miniapp_bindings_unionid ON miniapp_openid_bindings(unionid);
        """,
    ),
    # Machi Points wallet + generic entitlements. New tables mirror the SCHEMA
    # block above (fresh SQLite gets them from SCHEMA); this PG-only migration
    # creates them on the live PostgreSQL DB and grows guide_products /
    # guide_orders with the points-purchase columns. SQLite picks up the same
    # columns via _ensure_columns at boot. Purely additive; safe defaults.
    (
        73,
        "wallet: points accounts/ledger/topup packs+orders, user entitlements, guide points pricing",
        """
        -- backend: postgres
        CREATE TABLE IF NOT EXISTS wallet_accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            balance_points BIGINT NOT NULL DEFAULT 0,
            lifetime_purchased_points BIGINT NOT NULL DEFAULT 0,
            lifetime_bonus_points BIGINT NOT NULL DEFAULT 0,
            lifetime_spent_points BIGINT NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            entry_type TEXT NOT NULL,
            points_delta BIGINT NOT NULL,
            balance_after BIGINT NOT NULL,
            source_type TEXT NOT NULL DEFAULT '',
            source_order_id TEXT NOT NULL DEFAULT '',
            source_transaction_id TEXT NOT NULL DEFAULT '',
            idempotency_key TEXT NOT NULL DEFAULT '',
            product_id TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idem ON wallet_ledger_entries(user_id, idempotency_key) WHERE idempotency_key <> '';
        CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger_entries(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_wallet_ledger_source ON wallet_ledger_entries(source_type, source_transaction_id);
        CREATE INDEX IF NOT EXISTS idx_wallet_ledger_product ON wallet_ledger_entries(product_id, created_at);

        CREATE TABLE IF NOT EXISTS wallet_topup_products (
            id TEXT PRIMARY KEY,
            pack_key TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            points BIGINT NOT NULL,
            bonus_points BIGINT NOT NULL DEFAULT 0,
            amount_cents BIGINT NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            stripe_price_id TEXT NOT NULL DEFAULT '',
            apple_product_id TEXT NOT NULL DEFAULT '',
            ios_iap_product_id TEXT NOT NULL DEFAULT '',
            google_product_id TEXT NOT NULL DEFAULT '',
            huawei_product_id TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet_topup_orders (
            id TEXT PRIMARY KEY,
            order_no TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            pack_key TEXT NOT NULL,
            points BIGINT NOT NULL,
            bonus_points BIGINT NOT NULL DEFAULT 0,
            total_points BIGINT NOT NULL,
            amount_cents BIGINT NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'CNY',
            status TEXT NOT NULL DEFAULT 'pending',
            payment_provider TEXT NOT NULL DEFAULT '',
            provider_trade_no TEXT NOT NULL DEFAULT '',
            provider_user_id TEXT NOT NULL DEFAULT '',
            provider_product_id TEXT NOT NULL DEFAULT '',
            checkout_session_id TEXT NOT NULL DEFAULT '',
            client_type TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            paid_at TEXT,
            fulfilled_at TEXT,
            refunded_at TEXT,
            closed_at TEXT,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_user ON wallet_topup_orders(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_wallet_topup_orders_status ON wallet_topup_orders(status, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_topup_orders_trade ON wallet_topup_orders(payment_provider, provider_trade_no) WHERE provider_trade_no <> '';

        CREATE TABLE IF NOT EXISTS user_entitlements (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            entitlement_type TEXT NOT NULL DEFAULT 'own',
            status TEXT NOT NULL DEFAULT 'active',
            source_type TEXT NOT NULL DEFAULT '',
            source_order_id TEXT NOT NULL DEFAULT '',
            source_ledger_id TEXT NOT NULL DEFAULT '',
            granted_at TEXT NOT NULL,
            expires_at TEXT NOT NULL DEFAULT '',
            revoked_at TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, resource_type, resource_id, entitlement_type) WHERE status = 'active';
        CREATE INDEX IF NOT EXISTS idx_user_entitlements_user ON user_entitlements(user_id, status, resource_type);
        CREATE INDEX IF NOT EXISTS idx_user_entitlements_resource ON user_entitlements(resource_type, resource_id);

        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS wallet_price_points BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS member_wallet_price_points BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS wallet_eligible INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS app_store_eligible INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS google_play_eligible INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS external_payment_allowed INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'digital_unlock';
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS entitlement_type TEXT NOT NULL DEFAULT 'guide_product';
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS platform_policy TEXT NOT NULL DEFAULT 'digital_iap_required';
        ALTER TABLE guide_products ADD COLUMN IF NOT EXISTS points_purchase_limit INTEGER NOT NULL DEFAULT 0;

        ALTER TABLE guide_orders ADD COLUMN IF NOT EXISTS price_points BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE guide_orders ADD COLUMN IF NOT EXISTS wallet_ledger_entry_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_orders ADD COLUMN IF NOT EXISTS entitlement_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE guide_orders ADD COLUMN IF NOT EXISTS provider_trade_no TEXT NOT NULL DEFAULT '';
        """,
    ),
    # H5: a reporter may only count ONCE per target. De-dup existing rows
    # (keep the earliest) then add the UNIQUE index, so report_count reflects
    # DISTINCT reporters and can't be inflated by repeated POSTs to bury content.
    # Backend-split because SQLite (rowid) and Postgres (ctid) de-dup differently.
    (
        74,
        "reports: dedup + UNIQUE(reporter,kind,target) [H5] (sqlite)",
        """
        -- backend: sqlite
        DELETE FROM reports WHERE rowid NOT IN (
            SELECT MIN(rowid) FROM reports GROUP BY reporter_id, target_kind, target_id
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique ON reports(reporter_id, target_kind, target_id);
        """,
    ),
    (
        75,
        "reports: dedup + UNIQUE(reporter,kind,target) [H5] (postgres)",
        """
        -- backend: postgres
        DELETE FROM reports a USING reports b
         WHERE a.ctid > b.ctid
           AND a.reporter_id = b.reporter_id
           AND a.target_kind = b.target_kind
           AND a.target_id = b.target_id;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique ON reports(reporter_id, target_kind, target_id);
        """,
    ),
    # Apple/Stripe over-grant race guard: one external transaction
    # (payment_provider, provider_trade_no) must map to at most ONE order, so
    # concurrent /apple/verify (double-tap / restore racing a notification) can't
    # create two paid orders and extend membership twice. Partial index excludes
    # the many pending orders whose provider_trade_no is still ''. De-dup keeps
    # the earliest row (the duplicate is an erroneous double-record of the same
    # external txn, not real distinct money).
    (
        76,
        "payment_orders: UNIQUE(provider, provider_trade_no) over-grant guard (sqlite)",
        """
        -- backend: sqlite
        DELETE FROM payment_orders WHERE provider_trade_no <> '' AND rowid NOT IN (
            SELECT MIN(rowid) FROM payment_orders WHERE provider_trade_no <> ''
            GROUP BY payment_provider, provider_trade_no
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_trade
            ON payment_orders(payment_provider, provider_trade_no) WHERE provider_trade_no <> '';
        """,
    ),
    (
        77,
        "payment_orders: UNIQUE(provider, provider_trade_no) over-grant guard (postgres)",
        """
        -- backend: postgres
        DELETE FROM payment_orders a USING payment_orders b
         WHERE a.ctid > b.ctid
           AND a.provider_trade_no <> ''
           AND a.payment_provider = b.payment_provider
           AND a.provider_trade_no = b.provider_trade_no;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_trade
            ON payment_orders(payment_provider, provider_trade_no) WHERE provider_trade_no <> '';
        """,
    ),
    # UGC moderation (App Store 1.2 / legal): give the generic `reports` table a
    # real close-loop (status/action/resolver/audit) instead of a fire-and-forget
    # row delete, plus a moderation audit trail and a known-bad media-hash blocklist.
    # Postgres-scoped (production); fresh SQLite gets these from SCHEMA and existing
    # SQLite dev DBs from ensure_moderation_schema().
    (
        78,
        "ugc moderation: reports close-loop + moderation audit + blocked media hashes (postgres)",
        """
        -- backend: postgres
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_note TEXT NOT NULL DEFAULT '';
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TEXT;
        CREATE TABLE IF NOT EXISTS content_moderation_actions (
            id TEXT PRIMARY KEY,
            moderator_id TEXT NOT NULL DEFAULT '',
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            action TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            report_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS blocked_media_hashes (
            sha256 TEXT PRIMARY KEY,
            reason TEXT NOT NULL DEFAULT '',
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_content_mod_actions_target
            ON content_moderation_actions(target_kind, target_id, created_at);
        """,
    ),
    # ---- City-life OS (product upgrade) — see server_lifehub.py ----
    (
        79,
        "user_life_profiles (onboarding city-life profile)",
        """
        CREATE TABLE IF NOT EXISTS user_life_profiles (
            user_id TEXT PRIMARY KEY,
            life_stage TEXT NOT NULL DEFAULT '',
            primary_intent TEXT NOT NULL DEFAULT '',
            secondary_intents TEXT NOT NULL DEFAULT '[]',
            onboarding_completed_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """,
    ),
    (
        80,
        "local_action_events (north-star: Weekly Solved Local Actions)",
        """
        CREATE TABLE IF NOT EXISTS local_action_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            target_kind TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_action_user ON local_action_events(user_id, created_at);
        """,
    ),
    (
        81,
        "comments.is_accepted (Q&A best answer)",
        """
        ALTER TABLE comments ADD COLUMN is_accepted INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    # UGC-5: graduated enforcement (timed mute/suspend) + user appeals.
    (
        82,
        "users mute columns + appeals queue (UGC-5)",
        """
        ALTER TABLE users ADD COLUMN muted_until TEXT NOT NULL DEFAULT '';
        ALTER TABLE users ADD COLUMN mute_reason TEXT NOT NULL DEFAULT '';
        CREATE TABLE IF NOT EXISTS appeals (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            target_kind TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            resolution TEXT NOT NULL DEFAULT '',
            handled_by TEXT NOT NULL DEFAULT '',
            resolved_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id, created_at);
        """,
    ),
    # Machi AI (原创 in-app assistant): conversations / messages / per-day usage
    # counter / feedback. No backend marker → runs on both SQLite and Postgres
    # (fresh installs also get these from SCHEMA). All idempotent.
    (
        83,
        "machi ai: conversations + messages + usage + feedback",
        """
        CREATE TABLE IF NOT EXISTS guide_ai_conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT 'jp',
            language TEXT NOT NULL DEFAULT 'zh-CN',
            last_message_preview TEXT NOT NULL DEFAULT '',
            message_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_guide_ai_conversations_user_updated ON guide_ai_conversations(user_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_guide_ai_conversations_user_deleted ON guide_ai_conversations(user_id, deleted_at);
        CREATE TABLE IF NOT EXISTS guide_ai_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            source_count INTEGER NOT NULL DEFAULT 0,
            sources_json TEXT NOT NULL DEFAULT '',
            model_internal TEXT NOT NULL DEFAULT '',
            finish_reason TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_ai_messages_conversation_created ON guide_ai_messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_guide_ai_messages_user_created ON guide_ai_messages(user_id, created_at);
        CREATE TABLE IF NOT EXISTS guide_ai_usage (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            free_count INTEGER NOT NULL DEFAULT 0,
            member_count INTEGER NOT NULL DEFAULT 0,
            total_count INTEGER NOT NULL DEFAULT 0,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_ai_usage_user_date ON guide_ai_usage(user_id, usage_date);
        CREATE TABLE IF NOT EXISTS guide_ai_feedback (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            rating TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guide_ai_feedback_message ON guide_ai_feedback(message_id, created_at);
        """,
    ),
    # External partner import backends (星域东京 等专属后台). Token-gated,
    # scoped-to-self mini backends that batch-import listings + manage their own
    # reservation contacts. No backend marker → runs on SQLite and Postgres
    # (fresh installs also get these from SCHEMA). All idempotent.
    (
        84,
        "partners: partner backends + reservation contacts",
        """
        CREATE TABLE IF NOT EXISTS partners (
            id TEXT PRIMARY KEY,
            partner_key TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            name_en TEXT NOT NULL DEFAULT '',
            website TEXT NOT NULL DEFAULT '',
            access_token_hash TEXT NOT NULL DEFAULT '',
            token_hint TEXT NOT NULL DEFAULT '',
            token_rotated_at TEXT NOT NULL DEFAULT '',
            seller_user_id TEXT NOT NULL DEFAULT '',
            default_city_slug TEXT NOT NULL DEFAULT 'tokyo',
            default_region_code TEXT NOT NULL DEFAULT '',
            default_country_code TEXT NOT NULL DEFAULT 'jp',
            default_listing_type TEXT NOT NULL DEFAULT 'rental',
            default_category TEXT NOT NULL DEFAULT '',
            sale_enabled INTEGER NOT NULL DEFAULT 0,
            brand_color TEXT NOT NULL DEFAULT '',
            accent_color TEXT NOT NULL DEFAULT '',
            logo_url TEXT NOT NULL DEFAULT '',
            machi_recommended_default INTEGER NOT NULL DEFAULT 1,
            default_badges_json TEXT NOT NULL DEFAULT '[]',
            intro TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            listing_count INTEGER NOT NULL DEFAULT 0,
            created_by_admin_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_key ON partners(partner_key);
        CREATE TABLE IF NOT EXISTS partner_contacts (
            id TEXT PRIMARY KEY,
            partner_key TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            name_ja TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            line_id TEXT NOT NULL DEFAULT '',
            wechat_id TEXT NOT NULL DEFAULT '',
            whatsapp TEXT NOT NULL DEFAULT '',
            languages TEXT NOT NULL DEFAULT '',
            photo_url TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner ON partner_contacts(partner_key, sort_order);
        """,
    ),
    (
        85,
        "posts: denormalized engagement counters + hot_score for scalable ranking",
        """
        ALTER TABLE posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN repost_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN bookmark_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN hot_score REAL NOT NULL DEFAULT 0;

        UPDATE posts SET like_count =
            (SELECT COUNT(*) FROM interactions i WHERE i.target_id = posts.id AND i.kind = 'like');
        UPDATE posts SET repost_count =
            (SELECT COUNT(*) FROM interactions i WHERE i.target_id = posts.id AND i.kind = 'repost');
        UPDATE posts SET bookmark_count =
            (SELECT COUNT(*) FROM interactions i WHERE i.target_id = posts.id AND i.kind = 'bookmark');
        UPDATE posts SET comment_count =
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = posts.id AND c.deleted_at IS NULL);

        -- Seed an engagement-only baseline so the board has a sane order the
        -- instant the migration finishes; the hot_score refresher then layers
        -- on recency decay within ~1 minute of boot. Mirrors the engagement
        -- weights in _heat_score_sql (like 1, comment 3, repost 5, bookmark 4,
        -- report -10) plus any active boost.
        UPDATE posts SET hot_score =
            like_count * 1.0
            + comment_count * 3.0
            + repost_count * 5.0
            + bookmark_count * 4.0
            - COALESCE(report_count, 0) * 10.0
            + CASE WHEN COALESCE(is_boosted, 0) = 1 THEN COALESCE(boost_weight, 0) ELSE 0 END;

        CREATE INDEX IF NOT EXISTS idx_posts_hot ON posts(status, hot_score);
        """,
    ),
    (
        86,
        "posts: last_activity_at for the 正在发生 radar + subquery-free 热榜",
        """
        ALTER TABLE posts ADD COLUMN last_activity_at TEXT NOT NULL DEFAULT '';

        -- Latest non-deleted comment time per post. Posts with no comments keep
        -- '' and read paths fall back to created_at (activity == creation). This
        -- lets 正在发生 rank by *recency of activity* (an old post getting fresh
        -- comments resurfaces) and lets the 热榜 drop its correlated EXISTS.
        UPDATE posts SET last_activity_at = (
            SELECT MAX(c.created_at) FROM comments c
             WHERE c.post_id = posts.id AND c.deleted_at IS NULL
        )
        WHERE EXISTS (
            SELECT 1 FROM comments c
             WHERE c.post_id = posts.id AND c.deleted_at IS NULL
        );
        """,
    ),
    (
        87,
        "reposts: retire pure-reposts whose original was deleted",
        # Heals data left dangling before api_delete_post cascaded. A pure
        # repost (empty body) of a since-deleted original used to stay live in
        # every feed showing the deleted content, and its reposter could not
        # undo it. Soft-delete those orphan reposts and drop the now-meaningless
        # repost interactions. deleted_at reuses the row's own created_at so the
        # value is non-null on both SQLite and Postgres (only its null-ness is
        # ever queried). Quote-reposts (non-empty body) are intentionally left
        # alone. Pure SQL, so it runs identically on both backends.
        """
        UPDATE posts
           SET status = 'deleted',
               deleted_at = COALESCE(NULLIF(created_at, ''), 'deleted'),
               updated_at = updated_at
         WHERE repost_of_id IS NOT NULL
           AND COALESCE(content, '') = ''
           AND deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM posts o
                WHERE o.id = posts.repost_of_id
                  AND o.deleted_at IS NULL
                  AND o.status IN ('published', 'active')
           );

        DELETE FROM interactions
         WHERE kind = 'repost'
           AND NOT EXISTS (
               SELECT 1 FROM posts o
                WHERE o.id = interactions.target_id
                  AND o.deleted_at IS NULL
                  AND o.status IN ('published', 'active')
           );
        """,
    ),
    (
        88,
        "partners: persistent website sync jobs",
        """
        CREATE TABLE IF NOT EXISTS partner_sync_jobs (
          id TEXT PRIMARY KEY,
          partner_key TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'queued',
          stage TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          progress INTEGER NOT NULL DEFAULT 0,
          total_steps INTEGER NOT NULL DEFAULT 0,
          processed_steps INTEGER NOT NULL DEFAULT 0,
          fetched_count INTEGER NOT NULL DEFAULT 0,
          mapped_count INTEGER NOT NULL DEFAULT 0,
          image_count INTEGER NOT NULL DEFAULT 0,
          missing_image_count INTEGER NOT NULL DEFAULT 0,
          created_count INTEGER NOT NULL DEFAULT 0,
          updated_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          options_json TEXT NOT NULL DEFAULT '{}',
          summary_json TEXT NOT NULL DEFAULT '{}',
          result_json TEXT NOT NULL DEFAULT '{}',
          warnings_json TEXT NOT NULL DEFAULT '[]',
          error_code TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          created_by_user_id TEXT NOT NULL DEFAULT '',
          created_by_role TEXT NOT NULL DEFAULT '',
          started_at TEXT,
          finished_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_partner_sync_jobs_partner_source_created
          ON partner_sync_jobs(partner_key, source, created_at);
        CREATE INDEX IF NOT EXISTS idx_partner_sync_jobs_status
          ON partner_sync_jobs(status, updated_at);
        """,
    ),
    (
        89,
        "city_listings: backfill empty region_code from city_slug (JP)",
        # Historical listings (notably partner uploads whose partner had no
        # default_region_code) landed with region_code='' — invisible to any
        # region_code / metro-circle / 都道府县 filter. Stamp the canonical JP
        # region_code from the known city_slug. Only touches empty rows, never
        # overwrites an existing value → idempotent. City slugs are unique
        # across JP prefectures (verified), so the scalar subquery is unambiguous.
        """
        WITH region_map(city, code) AS (
            VALUES
            ('tokyo','jp.tokyo.tokyo'), ('hachioji','jp.tokyo.hachioji'), ('machida','jp.tokyo.machida'),
            ('tachikawa','jp.tokyo.tachikawa'), ('musashino','jp.tokyo.musashino'), ('osaka','jp.osaka.osaka'),
            ('sakai','jp.osaka.sakai'), ('suita','jp.osaka.suita'), ('toyonaka','jp.osaka.toyonaka'),
            ('higashiosaka','jp.osaka.higashiosaka'), ('kyoto','jp.kyoto.kyoto'), ('uji','jp.kyoto.uji'),
            ('fukuoka','jp.fukuoka.fukuoka'), ('kitakyushu','jp.fukuoka.kitakyushu'), ('kurume','jp.fukuoka.kurume'),
            ('nagoya','jp.aichi.nagoya'), ('toyota','jp.aichi.toyota'), ('okazaki','jp.aichi.okazaki'),
            ('ichinomiya','jp.aichi.ichinomiya'), ('yokohama','jp.kanagawa.yokohama'), ('kawasaki','jp.kanagawa.kawasaki'),
            ('sagamihara','jp.kanagawa.sagamihara'), ('kamakura','jp.kanagawa.kamakura'), ('fujisawa','jp.kanagawa.fujisawa'),
            ('yokosuka','jp.kanagawa.yokosuka'), ('saitama','jp.saitama.saitama'), ('kawaguchi','jp.saitama.kawaguchi'),
            ('kawagoe','jp.saitama.kawagoe'), ('tokorozawa','jp.saitama.tokorozawa'), ('koshigaya','jp.saitama.koshigaya'),
            ('chiba','jp.chiba.chiba'), ('funabashi','jp.chiba.funabashi'), ('matsudo','jp.chiba.matsudo'),
            ('kashiwa','jp.chiba.kashiwa'), ('ichikawa','jp.chiba.ichikawa'), ('narita','jp.chiba.narita'),
            ('kobe','jp.hyogo.kobe'), ('nishinomiya','jp.hyogo.nishinomiya'), ('himeji','jp.hyogo.himeji'),
            ('amagasaki','jp.hyogo.amagasaki'), ('sapporo','jp.hokkaido.sapporo'), ('asahikawa','jp.hokkaido.asahikawa'),
            ('hakodate','jp.hokkaido.hakodate'), ('sendai','jp.miyagi.sendai'), ('ishinomaki','jp.miyagi.ishinomaki'),
            ('hiroshima','jp.hiroshima.hiroshima'), ('fukuyama','jp.hiroshima.fukuyama'), ('naha','jp.okinawa.naha'),
            ('okinawa','jp.okinawa.okinawa'), ('shizuoka','jp.shizuoka.shizuoka'), ('hamamatsu','jp.shizuoka.hamamatsu'),
            ('numazu','jp.shizuoka.numazu'), ('tsukuba','jp.ibaraki.tsukuba'), ('mito','jp.ibaraki.mito'),
            ('hitachinaka','jp.ibaraki.hitachinaka'), ('nara','jp.nara.nara'), ('ikoma','jp.nara.ikoma'),
            ('yokkaichi','jp.mie.yokkaichi'), ('tsu','jp.mie.tsu'), ('kumamoto','jp.kumamoto.kumamoto'),
            ('kagoshima','jp.kagoshima.kagoshima'), ('nagano','jp.nagano.nagano'), ('matsumoto','jp.nagano.matsumoto'),
            ('kanazawa','jp.ishikawa.kanazawa'), ('komatsu','jp.ishikawa.komatsu'), ('okayama','jp.okayama.okayama'),
            ('kurashiki','jp.okayama.kurashiki'), ('niigata','jp.niigata.niigata'), ('nagaoka','jp.niigata.nagaoka'),
            ('utsunomiya','jp.tochigi.utsunomiya'), ('oyama','jp.tochigi.oyama'), ('takasaki','jp.gunma.takasaki'),
            ('maebashi','jp.gunma.maebashi'), ('otsu','jp.shiga.otsu'), ('kusatsu','jp.shiga.kusatsu'),
            ('gifu','jp.gifu.gifu'), ('ogaki','jp.gifu.ogaki'), ('aomori','jp.aomori.aomori'),
            ('hachinohe','jp.aomori.hachinohe'), ('morioka','jp.iwate.morioka'), ('ichinoseki','jp.iwate.ichinoseki'),
            ('akita','jp.akita.akita'), ('yamagata','jp.yamagata.yamagata'), ('tsuruoka','jp.yamagata.tsuruoka'),
            ('fukushima','jp.fukushima.fukushima'), ('koriyama','jp.fukushima.koriyama'), ('iwaki','jp.fukushima.iwaki'),
            ('toyama','jp.toyama.toyama'), ('takaoka','jp.toyama.takaoka'), ('fukui','jp.fukui.fukui'),
            ('kofu','jp.yamanashi.kofu'), ('wakayama','jp.wakayama.wakayama'), ('tottori','jp.tottori.tottori'),
            ('yonago','jp.tottori.yonago'), ('matsue','jp.shimane.matsue'), ('izumo','jp.shimane.izumo'),
            ('yamaguchi','jp.yamaguchi.yamaguchi'), ('shimonoseki','jp.yamaguchi.shimonoseki'), ('tokushima','jp.tokushima.tokushima'),
            ('takamatsu','jp.kagawa.takamatsu'), ('matsuyama','jp.ehime.matsuyama'), ('imabari','jp.ehime.imabari'),
            ('kochi','jp.kochi.kochi'), ('saga','jp.saga.saga'), ('nagasaki','jp.nagasaki.nagasaki'),
            ('sasebo','jp.nagasaki.sasebo'), ('oita','jp.oita.oita'), ('beppu','jp.oita.beppu'),
            ('miyazaki','jp.miyazaki.miyazaki')
        )
        UPDATE city_listings
           SET region_code = (SELECT code FROM region_map WHERE region_map.city = city_listings.city_slug)
         WHERE (region_code IS NULL OR region_code = '')
           AND country_code IN ('jp', '')
           AND city_slug IN (SELECT city FROM region_map);
        """,
    ),
    (
        90,
        "apns: per-user daily push ledger (delivery cap)",
        # Counts APNs sends of reminder-type notifications (saved_search /
        # system) per user per JST day so server_apns can enforce a small
        # daily budget. SQLite also creates it via
        # ensure_apns_push_ledger_schema; both sides are IF NOT EXISTS.
        """
        CREATE TABLE IF NOT EXISTS apns_push_ledger (
            user_id TEXT NOT NULL,
            jst_date TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, jst_date)
        );
        """,
    ),
    (
        91,
        "guide_user_profiles: add arrival_stage (来日阶段)",
        # 'pre_arrival' | 'just_arrived' | 'first_year' | 'long_term'
        # (NULL/'' = unset). Postgres-only because SQLite lacks ADD COLUMN
        # IF NOT EXISTS; SQLite gets the column via _ensure_columns at boot.
        """
        -- backend: postgres
        ALTER TABLE guide_user_profiles ADD COLUMN IF NOT EXISTS arrival_stage TEXT;
        """,
    ),
    (
        92,
        "conversations: initiator_id (真实主动私信配额) + created_at + manual_unread flags",
        # initiator_id records who *opened* the DM so the daily active-DM quota
        # counts only conversations this user started (old code counted any
        # conversation the user touched — passive/replied/bumped — because it
        # keyed off updated_at + either participant). participant_a is the
        # sorted-smaller id, NOT the creator, so we cannot backfill it; old rows
        # keep '' and simply don't count toward the quota (they're outside the
        # 24h window anyway). created_at gives the quota a stable window anchor
        # (updated_at moves on every reply); backfilled from updated_at so a
        # pre-existing row has a sane, non-moving value. manual_unread_{a,b} let
        # a user flag a conversation unread even when it has no inbound message
        # (the old is_read=false path silently no-op'd those). Plain ADD COLUMN
        # runs on both backends here (fresh version ⇒ no pre-existing column);
        # mirrors migrations 85/86.
        """
        ALTER TABLE conversations ADD COLUMN initiator_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE conversations ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
        ALTER TABLE conversations ADD COLUMN manual_unread_a INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE conversations ADD COLUMN manual_unread_b INTEGER NOT NULL DEFAULT 0;
        UPDATE conversations SET created_at = updated_at WHERE COALESCE(created_at, '') = '';
        """,
    ),
    (
        93,
        "posts: always-populate last_activity_at + index it for the 正在发生 radar",
        # The 正在发生 radar now filters+sorts on the bare last_activity_at column
        # (no COALESCE/NULLIF), so every live post must carry a real value.
        # Migration 86 only stamped posts that HAD comments; posts with none kept
        # '' and would sort/filter out under the bare-column query. Backfill those
        # from created_at (activity == creation when nothing else happened) and add
        # the covering index. Both statements are idempotent (only touches empty
        # rows; IF NOT EXISTS on the index) and run on SQLite + Postgres alike.
        """
        UPDATE posts SET last_activity_at = created_at
         WHERE COALESCE(last_activity_at, '') = '';
        CREATE INDEX IF NOT EXISTS idx_posts_last_activity ON posts(status, last_activity_at);
        """,
    ),
    (
        94,
        "interactions: dedup + UNIQUE(target_id,user_id,kind) to kill double-counts",
        # A UNIQUE constraint on (target_id, user_id, kind) makes the write path
        # idempotent (INSERT ... ON CONFLICT DO NOTHING) and closes the
        # check-then-insert race that could double-count a like/收藏/repost under
        # concurrency. Fresh DBs already have this as an inline table constraint;
        # this migration retrofits existing SQLite dev DBs and production Postgres.
        # Must DELETE duplicate rows first (keeping one per group) or the unique
        # index creation fails. The dedup keeps the lowest id per group — portable
        # correlated NOT EXISTS, no window functions (SQLite-safe).
        """
        DELETE FROM interactions
         WHERE EXISTS (
             SELECT 1 FROM interactions d
              WHERE d.target_id = interactions.target_id
                AND d.user_id = interactions.user_id
                AND d.kind = interactions.kind
                AND d.id < interactions.id
         );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_unique
            ON interactions(target_id, user_id, kind);
        """,
    ),
    (
        95,
        "posts: hot_score_engaged (engagement-only heat) for de-inflated 热搜 tags",
        # 热搜 tag heat summed hot_score, which bakes in the new-post freshness
        # "曝光分". A flood of brand-new posts under a tag could inflate its rank on
        # freshness alone. hot_score_engaged is the SAME heat WITHOUT the freshness
        # term (engagement × decay × member × seed) — the hot_score refresher keeps
        # both columns; tag heat now sums this one. Seeded here to the current
        # engagement baseline so tag ranking is sane before the first refresh tick.
        """
        ALTER TABLE posts ADD COLUMN hot_score_engaged REAL NOT NULL DEFAULT 0;
        UPDATE posts SET hot_score_engaged =
            (like_count * 1.0
             + comment_count * 3.0
             + repost_count * 5.0
             + bookmark_count * 4.0
             - COALESCE(report_count, 0) * 10.0)
            * (CASE WHEN COALESCE(is_seed_content, 0) = 1 THEN 0.6 ELSE 1.0 END);
        """,
    ),
    (
        96,
        "topic_rank_snapshots: 热搜/热榜 rank + heat history for real rankDelta / velocity",
        # The hot-score refresher writes the top-N tags per scope+window every
        # ~10 min into this table so api_discover_hot's rankDelta (was hard-coded
        # 0) becomes (prev_rank - current_rank) and api_trending's velocity can
        # compare this window's heat against the previous equal-length window's.
        # Retained ~7 days; the refresher prunes older rows on each pass.
        # "window" and "rank" are PostgreSQL reserved words → double-quoted here
        # and in every query. IF NOT EXISTS everywhere so re-running is safe and
        # a fresh DB (which already got the table from SCHEMA) records this as a
        # no-op cleanly. Runs on SQLite + Postgres alike (both accept the quotes).
        """
        CREATE TABLE IF NOT EXISTS topic_rank_snapshots (
            scope TEXT NOT NULL,
            "window" TEXT NOT NULL,
            tag TEXT NOT NULL,
            "rank" INTEGER NOT NULL,
            heat INTEGER NOT NULL DEFAULT 0,
            captured_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_topic_rank_snapshots_lookup
            ON topic_rank_snapshots(scope, "window", captured_at);
        CREATE INDEX IF NOT EXISTS idx_topic_rank_snapshots_tag
            ON topic_rank_snapshots(scope, "window", tag, captured_at);
        """,
    ),
    (
        97,
        "posts: weighted_interaction_score (互刷边际递减) feeds hot_score, display counts stay real",
        # Anti mutual-刷: heat should not scale linearly with a ring of accounts
        # liking each other. reconcile_post_counters recomputes this weighted sum
        # from the interactions table — the Nth like/repost/bookmark from the SAME
        # user to the SAME author within 30 days decays 1.0/0.5/0.25…, and a like
        # from an account registered <48h ago counts 0.3×. hot_score reads THIS
        # column for its like/repost/bookmark heat; the raw like_count/etc. columns
        # stay exact real counts (what users see). Seeded to the un-weighted
        # baseline (like*1 + repost*5 + bookmark*4, self-interactions excluded) so
        # ranking is sane before the first reconcile pass fills the real weights.
        """
        ALTER TABLE posts ADD COLUMN weighted_interaction_score REAL NOT NULL DEFAULT 0;
        UPDATE posts SET weighted_interaction_score =
            COALESCE((SELECT
                SUM(CASE i.kind WHEN 'like' THEN 1.0 WHEN 'repost' THEN 5.0 WHEN 'bookmark' THEN 4.0 ELSE 0.0 END)
                FROM interactions i
                WHERE i.target_id = posts.id
                  AND i.kind IN ('like','repost','bookmark')
                  AND i.user_id <> posts.author_id), 0.0);
        """,
    ),
    (
        98,
        "topic_follows: 话题关注 (hashtag subscriptions) for the follow_digest",
        # A user follows a bare tag (stored lowercased, no '#'); the daily
        # follow_digest task folds new posts under followed tags into one
        # "你关注的话题有 N 条新帖" line. UNIQUE(user_id, tag) makes follow
        # idempotent. IF NOT EXISTS everywhere so a fresh DB (which already got
        # the table from SCHEMA) records this as a clean no-op.
        """
        CREATE TABLE IF NOT EXISTS topic_follows (
            user_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_topic_follows_user ON topic_follows(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_topic_follows_tag ON topic_follows(tag);
        """,
    ),
    (
        99,
        "referral_codes / referrals: 邀请裂变 (invite growth loop)",
        # One stable invite code per user + one referrals row per invite
        # relationship (pending → qualified → rewarded / rejected). Rewards ride
        # the existing wallet ledger (entry_type='referral_bonus') so NO money
        # table is introduced here. Only INTEGER/TEXT are used so this DDL is
        # identical on SQLite and Postgres (_pg_xlate does not translate types);
        # FKs are omitted in the PG migration path per the wallet_* precedent.
        # IF NOT EXISTS everywhere so a fresh DB (already got these from SCHEMA)
        # records this as a clean no-op.
        """
        CREATE TABLE IF NOT EXISTS referral_codes (
            user_id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

        CREATE TABLE IF NOT EXISTS referrals (
            id TEXT PRIMARY KEY,
            inviter_id TEXT NOT NULL,
            invitee_id TEXT NOT NULL UNIQUE,
            code TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            reward_state TEXT NOT NULL DEFAULT 'none',
            signup_ip TEXT NOT NULL DEFAULT '',
            qualified_at TEXT NOT NULL DEFAULT '',
            rewarded_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, reward_state);
        CREATE INDEX IF NOT EXISTS idx_referrals_ip ON referrals(signup_ip, created_at);
        """,
    ),
    (
        100,
        "guide_reviews / guide_review_votes: 产品 UGC 评价 + 反范式均分",
        # Buyer product reviews (1-5 stars). One review per (user, product); only
        # 'published' rows feed guide_products.rating via apply_review_to_aggregate.
        # The rating_count / rating_sum columns on guide_products are added by
        # _ensure_columns (backend-aware ALTER) at boot — NOT here — so this DDL
        # stays SQLite/Postgres-identical (only CREATE TABLE/INDEX IF NOT EXISTS,
        # only INTEGER/TEXT types; _pg_xlate leaves these untouched). FKs omitted
        # in the PG migration path per the guide_orders / wallet_* precedent. A
        # fresh DB already has these tables from SCHEMA, so this records as a
        # clean no-op there.
        """
        CREATE TABLE IF NOT EXISTS guide_reviews (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            order_id TEXT NOT NULL DEFAULT '',
            rating INTEGER NOT NULL DEFAULT 0,
            body TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            helpful_count INTEGER NOT NULL DEFAULT 0,
            report_count INTEGER NOT NULL DEFAULT 0,
            anonymous INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_reviews_product ON guide_reviews(product_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_guide_reviews_user ON guide_reviews(user_id, created_at);

        CREATE TABLE IF NOT EXISTS guide_review_votes (
            review_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(review_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_review_votes_review ON guide_review_votes(review_id);
        """,
    ),
    (
        101,
        "guide_embeddings: 语义 RAG 向量索引 (semantic retrieval, graceful LIKE degrade)",
        # One row per public Guide entity (article/school/company/product/faq).
        # The vector is a JSON array of L2-normalized floats stored as TEXT so
        # this DDL is byte-identical on SQLite and Postgres — no vector type, no
        # _pg_xlate change. content_hash drives incremental rebuilds; model/dim
        # force a full rebuild on a model swap. Without an embedding key the
        # table simply stays empty and retrieval runs pure LIKE (zero regression
        # vs today). Only TEXT/INTEGER types + CREATE ... IF NOT EXISTS, so a
        # fresh DB (already got this from SCHEMA) records a clean no-op. FKs
        # omitted per the wallet_* / guide_reviews migration precedent.
        """
        CREATE TABLE IF NOT EXISTS guide_embeddings (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            country TEXT NOT NULL DEFAULT 'jp',
            content_hash TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            dim INTEGER NOT NULL DEFAULT 0,
            vector TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_guide_embeddings_country ON guide_embeddings(country, entity_type);
        """,
    ),
    (
        102,
        "jlpt_*: JLPT 备考核心 (题库/定级/打卡/单词/在线考试/考试日历)",
        # BE6/BE7. Original + admin-imported study content (source column keeps
        # provenance auditable — never unauthorized past-paper text). One
        # migration builds ALL JLPT tables so BE7 只加 handler/种子, 不再新建迁移.
        # Only TEXT/INTEGER + CREATE ... IF NOT EXISTS, so this DDL is byte-
        # identical on SQLite / Postgres (no _pg_xlate change) and records as a
        # clean no-op on a fresh DB (SCHEMA already built these). FKs omitted per
        # the wallet_* / guide_reviews migration precedent.
        """
        CREATE TABLE IF NOT EXISTS jlpt_questions (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'N5',
            section TEXT NOT NULL DEFAULT 'vocab',
            question_type TEXT NOT NULL DEFAULT 'single',
            stem TEXT NOT NULL DEFAULT '',
            passage TEXT NOT NULL DEFAULT '',
            audio_media_id TEXT NOT NULL DEFAULT '',
            choices_json TEXT NOT NULL DEFAULT '[]',
            answer_index INTEGER NOT NULL DEFAULT 0,
            explanation TEXT NOT NULL DEFAULT '',
            difficulty INTEGER NOT NULL DEFAULT 3,
            tags TEXT NOT NULL DEFAULT '',
            is_member_only INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'original',
            review_status TEXT NOT NULL DEFAULT 'approved',
            status TEXT NOT NULL DEFAULT 'published',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_questions_pick ON jlpt_questions(level, section, status, review_status, is_member_only);

        CREATE TABLE IF NOT EXISTS jlpt_attempts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT '',
            section TEXT NOT NULL DEFAULT '',
            selected_index INTEGER NOT NULL DEFAULT -1,
            is_correct INTEGER NOT NULL DEFAULT 0,
            session_id TEXT NOT NULL DEFAULT '',
            source_kind TEXT NOT NULL DEFAULT 'practice',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user ON jlpt_attempts(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user_q ON jlpt_attempts(user_id, question_id);
        CREATE INDEX IF NOT EXISTS idx_jlpt_attempts_user_correct ON jlpt_attempts(user_id, is_correct);

        CREATE TABLE IF NOT EXISTS jlpt_vocab_words (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'N5',
            word TEXT NOT NULL DEFAULT '',
            reading TEXT NOT NULL DEFAULT '',
            meaning_zh TEXT NOT NULL DEFAULT '',
            meaning_en TEXT NOT NULL DEFAULT '',
            pos TEXT NOT NULL DEFAULT '',
            example TEXT NOT NULL DEFAULT '',
            example_zh TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'original',
            status TEXT NOT NULL DEFAULT 'published',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_words_level ON jlpt_vocab_words(level, status);

        CREATE TABLE IF NOT EXISTS jlpt_vocab_decks (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'N5',
            title TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            word_count INTEGER NOT NULL DEFAULT 0,
            is_member_only INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_decks_level ON jlpt_vocab_decks(level, status);

        CREATE TABLE IF NOT EXISTS jlpt_vocab_deck_words (
            deck_id TEXT NOT NULL,
            word_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            UNIQUE(deck_id, word_id)
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_vocab_deck_words_deck ON jlpt_vocab_deck_words(deck_id, sort_order);

        CREATE TABLE IF NOT EXISTS jlpt_user_vocab (
            user_id TEXT NOT NULL,
            word_id TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'learning',
            review_count INTEGER NOT NULL DEFAULT 0,
            last_seen_at TEXT NOT NULL DEFAULT '',
            UNIQUE(user_id, word_id)
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_user_vocab_state ON jlpt_user_vocab(user_id, state);

        CREATE TABLE IF NOT EXISTS jlpt_exams (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL DEFAULT 'N5',
            title TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL DEFAULT 'mock',
            section TEXT NOT NULL DEFAULT '',
            question_count INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            pass_score INTEGER NOT NULL DEFAULT 60,
            is_member_only INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'published',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_exams_level ON jlpt_exams(level, status);

        CREATE TABLE IF NOT EXISTS jlpt_exam_questions (
            exam_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            UNIQUE(exam_id, question_id)
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_exam_questions_exam ON jlpt_exam_questions(exam_id, sort_order);

        CREATE TABLE IF NOT EXISTS jlpt_exam_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'in_progress',
            started_at TEXT NOT NULL,
            submitted_at TEXT NOT NULL DEFAULT '',
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0,
            correct INTEGER NOT NULL DEFAULT 0,
            score INTEGER NOT NULL DEFAULT 0,
            passed INTEGER NOT NULL DEFAULT 0,
            question_ids_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_exam_sessions_user ON jlpt_exam_sessions(user_id, started_at);

        CREATE TABLE IF NOT EXISTS jlpt_exam_answers (
            session_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            selected_index INTEGER NOT NULL DEFAULT -1,
            is_correct INTEGER NOT NULL DEFAULT 0,
            UNIQUE(session_id, question_id)
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_exam_answers_session ON jlpt_exam_answers(session_id);

        CREATE TABLE IF NOT EXISTS jlpt_exam_dates (
            id TEXT PRIMARY KEY,
            region TEXT NOT NULL DEFAULT 'jp',
            session_label TEXT NOT NULL DEFAULT '',
            exam_date TEXT NOT NULL DEFAULT '',
            reg_open_date TEXT NOT NULL DEFAULT '',
            reg_close_date TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published'
        );
        CREATE INDEX IF NOT EXISTS idx_jlpt_exam_dates_region ON jlpt_exam_dates(region, exam_date);
        """,
    ),
    (
        103,
        "email_campaigns.audience_user_ids: 指定用户群发 (选定收件人)",
        """
        ALTER TABLE email_campaigns ADD COLUMN audience_user_ids TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        104,
        "social_rooms / members / messages: 交友·约局·约饭 社交房间 (server_rooms.py)",
        """
        CREATE TABLE IF NOT EXISTS social_rooms (
            id TEXT PRIMARY KEY,
            host_user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            room_type TEXT NOT NULL DEFAULT 'hangout',
            country_code TEXT NOT NULL DEFAULT 'jp',
            city_slug TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            location_hint TEXT NOT NULL DEFAULT '',
            starts_at TEXT NOT NULL DEFAULT '',
            capacity INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'open',
            member_count INTEGER NOT NULL DEFAULT 1,
            message_count INTEGER NOT NULL DEFAULT 0,
            last_activity_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_social_rooms_city ON social_rooms(city_slug, status, last_activity_at);
        CREATE INDEX IF NOT EXISTS idx_social_rooms_region ON social_rooms(region_code, status, last_activity_at);
        CREATE INDEX IF NOT EXISTS idx_social_rooms_host ON social_rooms(host_user_id, created_at);

        CREATE TABLE IF NOT EXISTS social_room_members (
            room_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT NOT NULL,
            UNIQUE(room_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_social_room_members_room ON social_room_members(room_id, joined_at);
        CREATE INDEX IF NOT EXISTS idx_social_room_members_user ON social_room_members(user_id, joined_at);

        CREATE TABLE IF NOT EXISTS social_room_messages (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_social_room_messages_room ON social_room_messages(room_id, created_at);
        """,
    ),
    (
        105,
        "events / event_form_fields / event_registrations: Machi 活动 (Luma 式, server_events.py)",
        """
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            organizer_user_id TEXT NOT NULL,
            partner_name TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'social',
            cover_url TEXT NOT NULL DEFAULT '',
            starts_at TEXT NOT NULL,
            ends_at TEXT NOT NULL DEFAULT '',
            timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
            venue_name TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL DEFAULT '',
            country_code TEXT NOT NULL DEFAULT 'jp',
            city_slug TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            capacity INTEGER NOT NULL DEFAULT 0,
            price_text TEXT NOT NULL DEFAULT '',
            external_url TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'published',
            is_featured INTEGER NOT NULL DEFAULT 0,
            going_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_events_status_starts ON events(status, starts_at);
        CREATE INDEX IF NOT EXISTS idx_events_city ON events(city_slug, status, starts_at);
        CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_user_id, created_at);

        CREATE TABLE IF NOT EXISTS event_form_fields (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            label TEXT NOT NULL,
            field_type TEXT NOT NULL DEFAULT 'text',
            options_json TEXT NOT NULL DEFAULT '[]',
            required INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_event_form_fields_event ON event_form_fields(event_id, sort_order);

        CREATE TABLE IF NOT EXISTS event_registrations (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'going',
            answers_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(event_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations(user_id, created_at);
        """,
    ),
    (
        106,
        "saved_searches: 订阅提醒表纳入迁移链 (PG 端此前缺表)",
        # N4 saved-search alerts. Historically this table was created only by
        # ensure_saved_search_schema() — which runs in the SQLite boot path but
        # NOT on Postgres (init_db returns early on PG; apply_postgres_migrations
        # never called it). Result: production Postgres was missing the table
        # entirely, so /api/saved_searches + the digest job errored. Fold it into
        # the migration chain (mirrors apns_push_ledger / migration 90) so every
        # backend gets it. DDL is byte-identical to ensure_saved_search_schema
        # (only TEXT/INTEGER + IF NOT EXISTS) → SQLite/Postgres-identical, and a
        # DB that already has it (fresh SQLite via the ensure_ helper) records a
        # clean no-op. Runs on BOTH backends (no -- backend marker).
        """
        CREATE TABLE IF NOT EXISTS saved_searches (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            vertical TEXT NOT NULL DEFAULT '',
            city_slug TEXT NOT NULL DEFAULT '',
            region_code TEXT NOT NULL DEFAULT '',
            country_code TEXT NOT NULL DEFAULT '',
            keyword TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            filter_json TEXT NOT NULL DEFAULT '{}',
            label TEXT NOT NULL DEFAULT '',
            cadence TEXT NOT NULL DEFAULT 'instant',
            last_notified_at TEXT NOT NULL DEFAULT '',
            match_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_saved_searches_match ON saved_searches(vertical, cadence);
        """,
    ),
    (
        107,
        "users: restore UNIQUE(handle) lost in the PG port (postgres)",
        # SCHEMA declares users.handle UNIQUE inline; the SQLite→PG port
        # (migrate_sqlite_to_postgres.build_ddl) historically dropped inline
        # UNIQUE, so production Postgres could race two registrations onto the
        # same handle. Postgres-only because fresh SQLite still enforces the
        # inline constraint. Handles are provably unique in practice — the app
        # rejects taken handles, and anonymize_user_account rewrites a deleted
        # user's handle to a unique `deleted_<hex>` — so this dedup is a defensive
        # no-op. Crucially it is NON-DESTRUCTIVE: rather than DELETE a duplicate
        # (which would erase a real person + orphan their content), it RENAMES the
        # higher-id duplicate to a guaranteed-unique value (handle||'__dupe_'||id,
        # id being the unique PK) so CREATE UNIQUE INDEX can never abort the
        # deploy. Index name matches migrate_restore_pg_constraints.py so an
        # operator who already ran that supervised script converges to a no-op.
        """
        -- backend: postgres
        UPDATE users
           SET handle = handle || '__dupe_' || id
         WHERE EXISTS (
             SELECT 1 FROM users d
              WHERE d.handle = users.handle
                AND d.id < users.id
         );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_unique ON users(handle);
        """,
    ),
    (
        108,
        "users: partial UNIQUE(lower(email)) among active accounts (both backends)",
        # Email uniqueness was only ever enforced at the app layer
        # (SELECT ... WHERE lower(email)=? AND deleted_at IS NULL), never by the
        # DB — on NEITHER backend (email has no inline UNIQUE in SCHEMA). A
        # concurrent register/change-email pair (DB_LOCK is a no-op on PG) could
        # therefore bind one email to two accounts. Add a PARTIAL, FUNCTIONAL
        # unique index that mirrors the app invariant exactly: unique on
        # lower(email) but only over rows with a non-empty email that aren't
        # soft-deleted (anonymize_user_account blanks email to '', and many
        # accounts legitimately share email='' — a plain UNIQUE would collide on
        # them). Both SQLite (≥3.9) and Postgres support partial + expression
        # indexes, so this DDL is portable and runs on BOTH backends. The dedup
        # is NON-DESTRUCTIVE (never deletes an account): it blanks the email of
        # the higher-id duplicate only, keeping the earliest account's email, so
        # the index can never fail the deploy. Idempotent: a second run finds no
        # duplicates and touches nothing.
        """
        UPDATE users
           SET email = ''
         WHERE email <> ''
           AND deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM users d
              WHERE d.email <> ''
                AND d.deleted_at IS NULL
                AND lower(d.email) = lower(users.email)
                AND d.id < users.id
         );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
            ON users(lower(email)) WHERE email <> '' AND deleted_at IS NULL;
        """,
    ),
    (
        109,
        "conversations/blocks/miniapp: restore inline UNIQUE lost in the PG port (postgres)",
        # SCHEMA declares three creation-time UNIQUEs that the PG port dropped:
        # blocks(blocker_id,blocked_id), miniapp_openid_bindings(platform,openid),
        # conversations(participant_a,participant_b). On Postgres this let silent
        # data corruption accumulate — duplicate blocks, one WeChat openid bound
        # to several Machi users (login account confusion), and duplicate DM
        # conversations that split a chat's history across rows and scramble unread
        # counts. Postgres-only: fresh SQLite still enforces all three inline.
        # Index names match migrate_restore_pg_constraints.py so re-running is a
        # no-op. Every statement is idempotent, so a partial-failure retry on the
        # next deploy is safe.
        #
        #  * blocks — a duplicate is pure redundancy; keep the earliest (ctid).
        #  * miniapp — one openid must map to ONE user; keep the most recently
        #    active binding (max last_login_at, ties by ctid) so the account the
        #    user actually signs into survives.
        #  * conversations — must NOT lose messages: re-point every message from a
        #    duplicate conversation onto the canonical (lowest-id) row for that
        #    participant pair, delete the emptied duplicates, THEN enforce UNIQUE.
        """
        -- backend: postgres
        DELETE FROM blocks a USING blocks b
         WHERE a.ctid > b.ctid
           AND a.blocker_id = b.blocker_id
           AND a.blocked_id = b.blocked_id;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_unique ON blocks(blocker_id, blocked_id);

        DELETE FROM miniapp_openid_bindings a USING miniapp_openid_bindings b
         WHERE a.platform = b.platform
           AND a.openid = b.openid
           AND ( COALESCE(a.last_login_at, '') < COALESCE(b.last_login_at, '')
              OR ( COALESCE(a.last_login_at, '') = COALESCE(b.last_login_at, '')
                   AND a.ctid > b.ctid ) );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_miniapp_openid_unique
            ON miniapp_openid_bindings(platform, openid);

        UPDATE messages m
           SET conversation_id = keep.keep_id
          FROM conversations dup
          JOIN (
                SELECT participant_a, participant_b, MIN(id) AS keep_id
                  FROM conversations
                 GROUP BY participant_a, participant_b
          ) keep
            ON dup.participant_a = keep.participant_a
           AND dup.participant_b = keep.participant_b
         WHERE m.conversation_id = dup.id
           AND dup.id <> keep.keep_id;

        DELETE FROM conversations dup
         USING (
                SELECT participant_a, participant_b, MIN(id) AS keep_id
                  FROM conversations
                 GROUP BY participant_a, participant_b
         ) keep
         WHERE dup.participant_a = keep.participant_a
           AND dup.participant_b = keep.participant_b
           AND dup.id <> keep.keep_id;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair_unique
            ON conversations(participant_a, participant_b);
        """,
    ),
    (
        110,
        "events/rooms covers + 活动 luma 化(审核制报名/签到);社交房间加封面",
        # 两件事一次迁移(纯 ADD COLUMN,SQLite/Postgres 通用、只跑一次):
        #  1) 照片修复 —— events.cover_file_id / social_rooms.cover_url +
        #     cover_file_id。封面从「裸 URL 字符串」升级为「URL + 关联 uploaded_file」。
        #     _uploaded_file_is_referenced 认这两个 cover_file_id 后,孤儿 GC 不再把
        #     活动/房间封面当无主文件 48h 后删除(此前活动封面误走 post_image+event、
        #     entity 为空、无引用 → 被回收,表现为「照片不在 S3、加载失败」)。
        #     serialize 借 cover_file_id 取异步生成的缩略图 WebP,列表卡片不再拉原图。
        #  2) 活动 luma 化 —— events.requires_approval(主办方审核制报名)+
        #     event_registrations.checked_in_at(现场签到)。status 新增 'pending'
        #     (待审核)语义,由应用层写入,无需改列。
        """
        ALTER TABLE events ADD COLUMN cover_file_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE events ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE social_rooms ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE social_rooms ADD COLUMN cover_file_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE event_registrations ADD COLUMN checked_in_at TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        111,
        "push_campaigns: 管理员自定义 App 推送广播;notifications.title 自定义标题",
        # 管理员在后台/App 内编写自定义推送(标题+正文+受众+可选跳转+紧急)。
        # 每条 campaign 记录一次群发任务;实际投递写 notifications 行(站内)+
        # server_apns.enqueue(APNs 横幅)。notifications.title 让系统类通知能带
        # 自定义标题(其余类型留空,标题仍按类型派生)。纯 ADD/CREATE,只跑一次,
        # SQLite / Postgres 通用。
        """
        CREATE TABLE IF NOT EXISTS push_campaigns (
            id TEXT PRIMARY KEY,
            admin_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            audience TEXT NOT NULL DEFAULT 'all',
            audience_user_ids TEXT NOT NULL DEFAULT '',
            deep_link_type TEXT NOT NULL DEFAULT '',
            deep_link_id TEXT NOT NULL DEFAULT '',
            urgent INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            recipient_count INTEGER NOT NULL DEFAULT 0,
            sent_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_push_campaigns_status ON push_campaigns(status, created_at);
        ALTER TABLE notifications ADD COLUMN title TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        112,
        "funnel_events: 商城变现漏斗事件落表（store_view→purchase_success）",
        # 2026-07 商城激活：商城/会员漏斗事件（store_view / sku_view /
        # purchase_start / purchase_success / membership_view）从「仅结构化日志」
        # 升级为落表，30 天 go/no-go 判据可直接用 SQL 计算
        # （scripts/report_store_funnel.py）。旧 listing/compose 事件保持仅日志。
        # SQLite 侧由 ensure_funnel_schema 建表（镜像 apns_push_ledger 模式）。
        """
        CREATE TABLE IF NOT EXISTS funnel_events (
            id TEXT PRIMARY KEY,
            event TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            guest_id TEXT NOT NULL DEFAULT '',
            entity_type TEXT NOT NULL DEFAULT '',
            entity_id TEXT NOT NULL DEFAULT '',
            props_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_funnel_events_event_time ON funnel_events(event, created_at);
        """,
    ),
    (
        113,
        "city_listings: 清除无真实评论支撑的 seed 假评分（rating_avg/rating_count 归零）",
        # 2026-07 信任止血（B1-2）：历史 seed 内容包给 city_listings 直写过杜撰的
        # rating_avg / rating_count（4.9×「88 条」这类），而 listing_reviews 里没有
        # 任何真实评论——详情页出现「4.9·88 条」与「暂无点评」同屏。把没有已发布
        # 真实评论支撑的评分聚合清零；有真实评论的行由 recompute_listing_rating
        # 维护，不动。种子源头（seed_listings_packs / ensure_city_listing_seed /
        # import_premium_listings）已同步删除评分写入防回归。幂等：清零后不再命中
        # WHERE 条件，重复执行是 no-op。SQLite / Postgres 通用。
        """
        UPDATE city_listings
           SET rating_avg = 0, rating_count = 0
         WHERE (rating_count > 0 OR rating_avg > 0)
           AND id NOT IN (
                SELECT listing_id FROM listing_reviews WHERE status = 'published'
           );
        """,
    ),
    (
        114,
        "nightly_reports: 夜报指标落库（含契约 C-5 付费口径），趋势可查",
        # 2026-07 B1-6：run_nightly_report 的结果从「仅邮件」升级为落表——没有
        # 每日趋势，30 天 go/no-go 等于盲飞。report_date 为 JST 日（主键，重跑
        # UPSERT 覆盖）；metrics_json 存全部结构化指标（含真金直购单/币购单/
        # 充值单/会员开通的 C-5 拆分）；report_text 存纯文本报告原文。落库不依赖
        # KAIX_REPORT_EMAIL（邮件仍按原逻辑可选）。SQLite / Postgres 通用。
        """
        CREATE TABLE IF NOT EXISTS nightly_reports (
            report_date TEXT PRIMARY KEY,
            metrics_json TEXT NOT NULL DEFAULT '{}',
            report_text TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """,
    ),
    (
        115,
        "device_push_tokens: 游客推送归属（city_slug + digest_sent_at，契约 C-3）",
        # 2026-07 B1-9：游客授了推送权限却收不到任何推送。游客 token 以
        # user_id='guest:'+sha256(stableClientId)[:16]（复用 machi_ai_guest_key
        # 的隐私处理，原始设备 id 不落库）写进同一张表；city_slug 让
        # run_city_digests 能把「城市已知的游客」纳入城市召回；digest_sent_at
        # 是游客侧的 20h 防重闸（登录用户走 notifications 表的
        # _digest_recently_sent，游客不能写 notifications——user_id 有外键）。
        # 登录后同 token 经 register_token 的 DELETE+INSERT 重绑到真实账号，
        # 游客行消失，天然防双发。纯 ADD COLUMN，SQLite / Postgres 通用。
        """
        ALTER TABLE device_push_tokens ADD COLUMN city_slug TEXT NOT NULL DEFAULT '';
        ALTER TABLE device_push_tokens ADD COLUMN digest_sent_at TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        116,
        "jlpt_study_reminders: 学习类提醒共享 sent-ledger（断签 B2-2 / 错题复习 B2-3）",
        # 2026-07 B2-2/B2-3：断签提醒与错题复习提醒共享「每用户每 JST 日学习类
        # 提醒 ≤1 条」的约束——主键 (user_id, jst_date) 就是这条约束本身，两个
        # 调度器发送前都先 INSERT 认领，冲突即让位（防重 + 防同日双发一次解决）。
        # kind 记录当天实际发出的是哪类（streak/review），复盘可查。推送本身走
        # ntype='guide_reminder'（不占每日预算、受 JST 静音保护）。SQLite /
        # Postgres 通用。
        """
        CREATE TABLE IF NOT EXISTS jlpt_study_reminders (
            user_id TEXT NOT NULL,
            jst_date TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            PRIMARY KEY (user_id, jst_date)
        );
        """,
    ),
    (
        117,
        "guide_product_relations: 清除 jlpt 旅程的旧 seed 悬空推荐（B2-1）",
        # 2026-07 B2-1：旧代码 seed 给 jlpt 旅程挂了 4 个 coming_soon 占位 SKU
        # （*-20-year-trend-analysis / *-original-mock-20），推荐位点进去买不了。
        # 仅当该旅程的推荐仍完全落在旧 seed 集合内（即 admin 从未增改过）才整组
        # 删除；删空后 SQLite 启动路径的 _guide_seed_product_relations 会用新的
        # published SKU 常量立即重播。admin 手工加过任何商品则一行不动（策展
        # 优先）。幂等：重播后的新 slug 不在旧集合内，条件不再命中。
        # SQLite / Postgres 通用（Postgres 部署需随后重跑关系 seed 或在后台补挂）。
        # 先 CREATE IF NOT EXISTS（与 ensure_guide_schema_extensions / 迁移 58 同
        # DDL）：SQLite 侧该表由启动扩展在迁移之后才建，全新库跑到这里表还不存在。
        """
        CREATE TABLE IF NOT EXISTS guide_product_relations (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            plan_type TEXT NOT NULL DEFAULT '',
            todo_type TEXT NOT NULL DEFAULT '',
            journey_key TEXT NOT NULL DEFAULT '',
            step_key TEXT NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        DELETE FROM guide_product_relations
         WHERE journey_key = 'jlpt'
           AND NOT EXISTS (
                SELECT 1 FROM guide_product_relations r2
                JOIN guide_products p2 ON p2.id = r2.product_id
                WHERE r2.journey_key = 'jlpt'
                  AND p2.slug NOT IN (
                        'jlpt-n2-20-year-trend-analysis', 'jlpt-n1-20-year-trend-analysis',
                        'jlpt-n5-n1-roadmap', 'jlpt-n2-original-mock-20', 'jlpt-n1-original-mock-20'
                  )
           );
        """,
    ),
    (
        118,
        "jlpt 全真模考：score_mode（JLPT 缩放分）+ 会话 scaled_json 结果",
        # 2026-07 全真模考：jlpt_exams.score_mode ∈ ('percent','jlpt_scaled')。
        # 'jlpt_scaled' 时 submit_exam_session 额外按官方计分结构输出缩放分
        # （笔试两科各 0-60 / N4·N5 合并 0-120，含科目基准点与参考合格线），
        # 结果整块存进会话行的 scaled_json，历史/回看直接反序列化，老客户端
        # 只认原有 score(0-100) 字段照常工作。纯 ADD COLUMN，SQLite/Postgres 通用。
        """
        ALTER TABLE jlpt_exams ADD COLUMN score_mode TEXT NOT NULL DEFAULT 'percent';
        ALTER TABLE jlpt_exam_sessions ADD COLUMN scaled_json TEXT NOT NULL DEFAULT '';
        """,
    ),
    (
        119,
        "jlpt 分科整卷：parent_exam_id 把父卷(paper)与各计时子科目(section)关联",
        # 2026-07 全真分科：真实 JLPT 分两个独立计时块（言語知識・読解 → 聴解）。
        # 用「父卷 kind='paper' + 子科目 kind='section' 靠 parent_exam_id 关联」建模，
        # 每个子科目仍是一张普通 exam（独立 duration/session/续考/CAS 交卷/出分），
        # 客户端按 sort_order 顺序推进。父卷本身不组卷、不计时，只做聚合入口。
        # 纯 ADD COLUMN + 索引，SQLite/Postgres 通用；老的独立 mock 卷 parent 为 ''
        # 照常工作。
        """
        ALTER TABLE jlpt_exams ADD COLUMN parent_exam_id TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_jlpt_exams_parent ON jlpt_exams(parent_exam_id);
        """,
    ),
    (
        120,
        "jlpt 考试消耗 Machi 币：jlpt_exams.coin_cost + 回填 v1 单卷",
        # 2026-07 全真模考/分科整卷开考消耗 Machi 币(练习/定级/错题本免费)。
        # coin_cost 记在被开考的 exam 行:单卷记自身;分科卷记笔试子科目(整卷第一个
        # 开考、只扣一次),父卷卡的价由 list_exams 聚合子科目显示。会员价在读取处
        # 按 5 折计算、不入库。开考前原子扣币(wallet_post_ledger),续考不重复扣。
        # 回填现有 v1 单卷默认价 100~400(1币=1JPY)。纯 ADD COLUMN,SQLite/Postgres 通用。
        """
        ALTER TABLE jlpt_exams ADD COLUMN coin_cost INTEGER NOT NULL DEFAULT 0;
        UPDATE jlpt_exams SET coin_cost = CASE level
            WHEN 'N5' THEN 100 WHEN 'N4' THEN 150 WHEN 'N3' THEN 250
            WHEN 'N2' THEN 350 WHEN 'N1' THEN 400 ELSE 200 END
         WHERE kind = 'mock' AND id LIKE 'mockv1-%';
        """,
    ),
    (
        121,
        "PAY-01：修复迁移 120 后 fresh DB 才写入的 mockv1 零价格",
        # 迁移 120 早于启动 seed：旧库已有 mockv1 行时能正确回填，fresh DB 当时
        # 尚无行，随后 seed 接受 DEFAULT 0，造成五档全免费。新 fresh DB 由 seed
        # 显式写价；本迁移只修复历史版本创建的五个规范 id，且不触碰其它免费卷或
        # 已有非零运营价。SQLite / PostgreSQL 都支持该 CASE + UPDATE。
        """
        UPDATE jlpt_exams SET coin_cost = CASE level
            WHEN 'N5' THEN 100 WHEN 'N4' THEN 150 WHEN 'N3' THEN 250
            WHEN 'N2' THEN 350 WHEN 'N1' THEN 400 ELSE coin_cost END
         WHERE coin_cost = 0 AND kind = 'mock' AND (
               (id = 'mockv1-n5' AND level = 'N5')
            OR (id = 'mockv1-n4' AND level = 'N4')
            OR (id = 'mockv1-n3' AND level = 'N3')
            OR (id = 'mockv1-n2' AND level = 'N2')
            OR (id = 'mockv1-n1' AND level = 'N1')
         );
        """,
    ),
]


__all__ = ["SCHEMA", "MIGRATIONS"]
