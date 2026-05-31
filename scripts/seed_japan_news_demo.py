#!/usr/bin/env python3
"""Seed development-only published Japan news demo posts.

This command is intentionally not part of server startup. It exists to prove
the public /news surface is wired to published editorial_posts, not merely to
make the UI look populated.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


DEMO_SOURCE = "Machi Demo Source"


def main() -> None:
    if os.environ.get("KAIX_ENV", "development").lower() == "production":
        print("refusing to seed demo news in production", file=sys.stderr)
        sys.exit(2)

    server.init_db()
    now = datetime.now(timezone.utc)
    entries = [
        ("tokyo-local-news", "tokyo", "local_news", "zh-CN", "东京生活服务窗口本周更新", "面向东京居民的本地生活服务提醒。"),
        ("tokyo-traffic-alert", "tokyo", "traffic_alert", "zh-CN", "东京主要线路出行提醒", "通勤前请确认官方交通信息。"),
        ("tokyo-city-event", "tokyo", "city_event", "zh-CN", "东京周末公开活动精选", "适合在东京生活和短期停留用户查看。"),
        ("osaka-local-news", "osaka", "local_news", "zh-CN", "大阪生活通知更新", "大阪本地公共服务信息有新提醒。"),
        ("osaka-traffic-alert", "osaka", "traffic_alert", "zh-CN", "大阪交通运行提醒", "出行前请确认运营方发布。"),
        ("japan-policy-update", "", "policy_update", "zh-CN", "日本全国政策信息更新", "全国范围公开政策信息摘要。"),
        ("japan-weather-alert", "", "weather_alert", "zh-CN", "日本天气灾害信息提醒", "请以气象厅等官方来源为准。"),
        ("japan-immigration-visa", "", "immigration_visa", "zh-CN", "在留签证相关公开信息更新", "面向在日生活、学习、工作用户。"),
        ("tokyo-life-notice", "tokyo", "life_notice", "zh-CN", "东京生活手续提醒", "请查看对应官方页面确认最新办理要求。"),
        ("osaka-city-event", "osaka", "city_event", "zh-CN", "大阪公开活动信息", "大阪地区公共活动信息摘要。"),
    ]
    with server.DB_LOCK, server.db() as conn:
        admin = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").fetchone()
        admin_id = admin["id"] if admin else ""
        for idx, (key, city, category, language, title, summary) in enumerate(entries):
            post_id = f"demo-japan-news-{key}"
            published_at = (now - timedelta(minutes=idx * 9)).isoformat()
            author_type = server._news_author_type_for_scope("jp", city)
            author_name = server._news_author_display_name("jp", city, language, author_type)
            body = server._safe_editorial_body(language, DEMO_SOURCE, f"https://machicity.com/demo-news/{key}")
            existing = conn.execute("SELECT id FROM editorial_posts WHERE id = ?", (post_id,)).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE editorial_posts
                       SET author_type = ?, author_display_name = ?, country = 'jp', city = ?,
                           language = ?, category = ?, title = ?, summary = ?, body = ?,
                           source_name = ?, source_url = ?, original_url = ?, status = 'published',
                           review_status = 'approved', published_at = ?, is_demo = 1, updated_at = ?
                     WHERE id = ?
                    """,
                    (
                        author_type, author_name, city, language, category, title, summary, body,
                        DEMO_SOURCE, "https://machicity.com/demo-news", f"https://machicity.com/demo-news/{key}",
                        published_at, server.now_iso(), post_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO editorial_posts
                        (id, news_item_id, author_type, author_display_name, country, city,
                         language, category, title, summary, body, source_name, source_url,
                         original_url, source_published_at, status, review_status,
                         reviewed_by_admin_id, reviewed_at, published_at, view_count,
                         is_ai_assisted, created_by_admin_id, is_demo, created_at, updated_at)
                    VALUES (?, NULL, ?, ?, 'jp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published',
                            'approved', ?, ?, ?, 0, 0, ?, 1, ?, ?)
                    """,
                    (
                        post_id, author_type, author_name, city, language, category, title, summary,
                        body, DEMO_SOURCE, "https://machicity.com/demo-news",
                        f"https://machicity.com/demo-news/{key}", published_at, admin_id,
                        published_at, published_at, admin_id, server.now_iso(), server.now_iso(),
                    ),
                )
    print(f"seeded {len(entries)} published Japan news demo posts into {server.DB_PATH}")


if __name__ == "__main__":
    main()
