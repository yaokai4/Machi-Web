#!/usr/bin/env python3
"""Dev-only: create (or rotate) a demo partner 'stareal' in the real kaix.db so
the /partner/stareal page can be verified. Prints the access token. Not shipped."""
import os, sys, uuid
os.environ.pop("KAIX_DB_PATH", None)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # web/
sys.path.insert(0, ROOT)
import server  # noqa
import server_partners as sp  # noqa

conn = server.db()
key = "stareal"
now = server.now_iso()
existing = sp.get_partner(conn, key)
if existing:
    token = sp.rotate_partner_token(conn, key, now=now)
    conn.commit()
    print("ROTATED", token)
else:
    uid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id,handle,display_name,email,password_hash,bio,location,avatar_symbol,avatar_color,avatar_url,cover_url,membership_tier,is_verified,role,country,province,city,current_region_code,recent_region_codes,joined_at,created_at,updated_at)"
        " VALUES (?,?,?, '', ?, '','','building.2.fill','teal','','','free',1,'member','jp','','','','',?,?,?)",
        (uid, "partner_stareal", "星域东京", server.hash_password(uuid.uuid4().hex), now, now, now),
    )
    conn.execute("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?,?)", (uid, now))
    partner, token = sp.create_partner(
        conn, key=key, name="星域东京", seller_user_id=uid, name_ja="スタリアル东京",
        website="https://stareal.jp", default_city_slug="tokyo", default_region_code="jp.tokyo.tokyo",
        default_category="マンション", sale_enabled=True, brand_color="#1f6feb", accent_color="#1f6feb",
        default_badges=["Machi推荐", "星域臻选", "认证房源"], machi_recommended_default=True,
        intro="星域东京 · 为在日华人提供租房、购房与投资房产一站式服务。", now=now,
    )
    # a demo reservation contact
    sp.create_partner_contact(conn, key, {
        "name": "田中 翔", "name_ja": "田中 翔", "title": "中文营业担当",
        "phone": "03-1234-5678", "line_id": "stareal-tanaka", "wechat_id": "stareal_jp",
        "languages": "中文 / 日本語 / English", "is_default": True,
    }, now=now)
    conn.commit()
    print("CREATED", token)
