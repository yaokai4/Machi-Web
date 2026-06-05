#!/usr/bin/env python3
"""Populate the development DB with richer city-channel content.

The script is intentionally idempotent: it uses deterministic UUIDs for
seeded users, posts, interactions, comments, and reports, so re-running it
updates the same rows instead of duplicating content.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import sys
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def stable_id(kind: str, key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"kaix:{kind}:{key}"))


def iso(hours_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


CITIES = [
    ("tokyo", "东京", "jp", "tokyo", "tokyo", "东京生活"),
    ("osaka", "大阪", "jp", "osaka", "osaka", "大阪生活"),
    ("shanghai", "上海", "cn", "shanghai", "shanghai", "上海生活"),
    ("beijing", "北京", "cn", "beijing", "beijing", "北京生活"),
    ("guangzhou", "广州", "cn", "guangdong", "guangzhou", "广州生活"),
    ("shenzhen", "深圳", "cn", "guangdong", "shenzhen", "深圳生活"),
    ("hongkong", "香港", "cn", "hongkong", "hongkong", "香港生活"),
    ("changsha", "长沙", "cn", "hunan", "changsha", "长沙生活"),
    ("xian", "西安", "cn", "shaanxi", "xian", "西安生活"),
    ("wuhan", "武汉", "cn", "hubei", "wuhan", "武汉生活"),
]


USERS = [
    ("city_editor", "城市编辑部", "整理本地新闻、政策提醒和城市频道精选。", "newspaper", "blue", "creator", 1),
    ("rent_notes", "租房笔记", "记录真实租房经验、区域比较、转租和找室友信息。", "house.fill", "green", "creator", 1),
    ("jobdesk", "本地工作板", "发布招聘、求职、兼职、内推和面试经验。", "briefcase.fill", "indigo", "creator", 1),
    ("foodwalk", "美食探店", "周末美食、咖啡、探店和城市散步。", "fork.knife", "pink", "free", 0),
    ("market_loop", "二手循环", "闲置、搬家甩卖、求购和免费赠送。", "tag.fill", "orange", "free", 0),
    ("service_map", "本地服务地图", "搬家、翻译、签证、维修、报税和生活服务。", "wrench.and.screwdriver.fill", "teal", "pro", 1),
    ("eventline", "活动线", "展览、市集、桌游、运动和创业交流。", "calendar", "purple", "free", 0),
    ("warningdesk", "避坑提醒", "整理租房、工作、交易和消费纠纷经验。", "exclamationmark.shield.fill", "red", "creator", 1),
    ("student_life", "留学生活问答", "学校、签证、手机卡、银行卡和医疗求助。", "graduationcap.fill", "mint", "free", 0),
    ("merchant_ops", "本地商家观察", "餐厅、咖啡、美容、健身和本地店铺信息。", "storefront.fill", "brown", "pro", 1),
    ("weekend_groups", "周末小组", "美食讨论、摄影小组、运动小组和语言交换。", "person.2.fill", "cyan", "free", 0),
    ("guide_writer", "生活攻略作者", "把城市生活拆成能落地执行的清单。", "book.fill", "black", "creator", 1),
]


def ensure_user(conn: Any, handle: str, city: tuple[str, str, str, str, str, str], meta: tuple[str, str, str, str, str, str, int]) -> str:
    slug, city_name, country, province, city_code, _topic = city
    suffix, display, bio, symbol, color, tier, verified = meta
    full_handle = f"{slug}_{suffix}"
    user_id = stable_id("user", full_handle)
    region_code = server._resolve_region_code(country, province, city_code)
    now = server.now_iso()
    row = conn.execute("SELECT id FROM users WHERE handle = ?", (full_handle,)).fetchone()
    values = (
        user_id,
        full_handle,
        f"{display} · {city_name}",
        f"{full_handle}@machi.app",
        server.hash_password("123456"),
        f"{bio} 主要关注{city_name}的真实生活信息。",
        city_name,
        symbol,
        color,
        tier,
        verified,
        "creator" if verified else "member",
        country,
        province,
        city_code,
        region_code,
        region_code,
        1 if suffix in {"merchant_ops"} else 0,
        1 if suffix in {"merchant_ops"} else 0,
        now,
        now,
        now,
    )
    if row:
        conn.execute(
            """
            UPDATE users
               SET display_name = ?, bio = ?, location = ?, avatar_symbol = ?, avatar_color = ?,
                   membership_tier = ?, is_verified = ?, role = ?, country = ?, province = ?,
                   city = ?, current_region_code = ?, recent_region_codes = ?,
                   is_merchant = ?, merchant_verified = ?, updated_at = ?
             WHERE id = ?
            """,
            (
                values[2], values[5], values[6], values[7], values[8], values[9],
                values[10], values[11], values[12], values[13], values[14],
                values[15], values[16], values[17], values[18], now, row["id"],
            ),
        )
        user_id = row["id"]
    else:
        conn.execute(
            """
            INSERT INTO users (
                id, handle, display_name, email, password_hash, bio, location,
                avatar_symbol, avatar_color, avatar_url, cover_url, membership_tier,
                is_verified, role, country, province, city, current_region_code,
                recent_region_codes, is_merchant, merchant_verified, joined_at,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)",
            (user_id, now),
        )
    return user_id


def channel_payloads(city_name: str, topic: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "dynamic",
            "author": "city_editor",
            "title": f"{city_name}今日城市观察",
            "content": f"今天的{city_name}很适合做一次慢一点的城市观察：早高峰的通勤节奏比上周缓和，几个常去的生活圈都有新店开业，也有不少人开始分享换季搬家、找工作和周末活动的经验。欢迎把你看到的街区变化、排队情况、交通提醒和生活小发现贴出来，城市频道会把这些真实的一线信息汇总给同城用户。#{topic} #城市观察 #动态",
            "attrs": {"title": f"{city_name}今日城市观察"},
        },
        {
            "type": "image_post",
            "author": "foodwalk",
            "title": f"{city_name}街角图文记录",
            "content": f"这组{city_name}街角记录拍的是日常生活里最容易被忽略的部分：便利店门口的季节海报、傍晚开始亮灯的小店、下班路上的车站人流、以及社区公告栏里密密麻麻的本地信息。图文帖不一定要宏大，越具体越能帮后来的人理解一个区域的真实气质。#{topic} #图文 #城市见闻",
            "attrs": {"title": f"{city_name}街角图文记录"},
        },
        {
            "type": "long_post",
            "author": "guide_writer",
            "title": f"住在{city_name}三个月后的复盘",
            "content": f"如果只看攻略，{city_name}像是由交通、房租、商圈和景点组成；真正住下来以后，影响体验的反而是更细的东西：晚上回家的路是否安心，附近有没有能稳定吃饭的店，维修和快递沟通是否顺畅，周末能不能不用花太多钱也找到放松方式。三个月后最大的建议是，不要急着追求一步到位，先选一个能降低日常摩擦的区域，再慢慢扩展自己的城市半径。#{topic} #长文 #生活复盘",
            "attrs": {"title": f"住在{city_name}三个月后的复盘", "summary": "从通勤、生活成本、安全感和社交半径复盘居住体验。"},
        },
        {
            "type": "news",
            "author": "city_editor",
            "title": f"{city_name}本周交通和生活提醒",
            "content": f"{city_name}本周有多处交通、商圈和公共服务调整。通勤用户建议提前查看常用线路的运营通知，周末准备出门的人也要留意热门区域的人流限制。对刚搬来的用户，建议把居住区、工作区、常去医院和最近车站都加入收藏，遇到临时变更时能更快判断替代路线。#{topic} #本地新闻 #交通提醒",
            "attrs": {"title": f"{city_name}本周交通和生活提醒", "source": "Machi 城市编辑部", "summary": "交通、商圈和公共服务的综合提醒。", "location": city_name, "event_time": "本周"},
        },
        {
            "type": "local_info",
            "author": "city_editor",
            "title": f"{city_name}公共服务窗口时间更新",
            "content": f"{city_name}近期有部分公共服务窗口、社区设施和咨询点调整开放时间。需要办理地址、证明、学校或生活手续的人，建议出门前确认预约要求、材料清单和是否支持线上提交。很多同城问题不是难，而是信息分散；如果你刚处理完类似手续，也欢迎补充最新流程。#{topic} #本地资讯 #生活提醒",
            "attrs": {"title": f"{city_name}公共服务窗口时间更新", "source": "社区用户补充", "summary": "公共服务窗口和生活手续办理提醒。", "location": city_name, "event_time": "近期"},
        },
        {
            "type": "guide",
            "author": "guide_writer",
            "title": f"{city_name}新住民生活清单",
            "content": f"刚到{city_name}，最容易卡住的是三件事：住哪里、钱怎么流转、遇到问题找谁。建议先确定通勤半径，再比较不同区域的租金、超市、医院和夜间安全；随后处理银行卡、手机卡、网络、常用交通卡和医疗预约；最后把搬家、维修、翻译、法律咨询等服务先做备份。这个清单不是一次做完，而是按优先级逐步补齐。#{topic} #生活攻略 #新住民",
            "attrs": {"title": f"{city_name}新住民生活清单", "summary": "从租房、交通、银行卡、手机卡、医院到搬家的落地清单。", "last_updated_at": "2026-05-26"},
        },
        {
            "type": "rant",
            "author": "student_life",
            "title": f"{city_name}生活小吐槽",
            "content": f"今天又被{city_name}的生活细节教育了一次：看起来很近的地方，换乘和等车加起来会把时间拉长；网上评价很好的店，真正适不适合自己还得看预算和排队；很多规则没人主动解释，踩过一次才会记住。吐槽归吐槽，写出来也算给后来的人留个提醒。#{topic} #吐槽 #城市生活",
            "attrs": {"title": f"{city_name}生活小吐槽", "category": "生活细节"},
        },
        {
            "type": "secondhand",
            "author": "market_loop",
            "title": f"{city_name}搬家闲置一组",
            "content": f"准备从{city_name}当前住处搬走，整理出一组还能继续使用的家具和生活用品。桌椅、收纳架、台灯、电饭锅和一些小家电都保存得不错，适合刚入住、预算有限、想一次配齐基础用品的人。优先同城自取，可现场确认状态，价格也可以按多件打包再商量。#{topic} #二手 #搬家甩卖",
            "attrs": {"title": "搬家闲置一组", "price": 6800, "currency": "JPY" if "东京" in city_name or "大阪" in city_name else "CNY", "condition": "8-9成新", "trade_method": "同城自取 / 可打包", "area": city_name, "status": "available"},
        },
        {
            "type": "housing",
            "author": "rent_notes",
            "title": f"{city_name}通勤友好房源观察",
            "content": f"最近整理{city_name}几个通勤友好区域的房源，感受是不要只看租金数字，还要把到车站的真实步行时间、夜路照明、楼下噪音、垃圾规则、网络安装和退租条款一起算进去。看房时建议拍下水压、窗户、插座、储物、厨房和浴室细节，签约前确认押金、礼金、中介费、更新费和违约金。#{topic} #租房 #房源分享",
            "attrs": {"title": "通勤友好房源观察", "rent": 82000 if "东京" in city_name or "大阪" in city_name else 5200, "currency": "JPY" if "东京" in city_name or "大阪" in city_name else "CNY", "room_type": "1K / 单间", "area": city_name, "nearest_station": "主线车站步行 8-12 分钟", "move_in_date": "可商量", "status": "available"},
        },
        {
            "type": "roommate",
            "author": "rent_notes",
            "title": f"{city_name}找室友：作息稳定优先",
            "content": f"想在{city_name}找一位作息稳定、沟通清楚的室友一起合租。希望公共区域保持干净，访客提前说明，水电网费用透明分摊。房子倾向选择通勤方便、生活配套完整的区域，不追求豪华，但希望隔音、采光和安全都过得去。#{topic} #找室友 #合租",
            "attrs": {"title": "找室友：作息稳定优先", "rent_range": "预算可商量", "area": city_name, "move_in_date": "一个月内", "lifestyle_tags": "安静 / 不抽烟 / 规律作息", "requirements": "公共区域共同维护，账单透明。", "contact_method": "站内私信"},
        },
        {
            "type": "job_seek",
            "author": "jobdesk",
            "title": f"{city_name}求职：运营/客服/内容方向",
            "content": f"在{city_name}寻找运营、客服或内容相关工作。过往做过社群运营、用户答疑、内容整理和简单数据分析，能适应中英或中日沟通，也愿意从兼职、实习或远程协作开始。希望岗位说明清楚，试用期和薪资结算透明，不接受无合同、长期无偿试岗。#{topic} #找工作 #求职",
            "attrs": {"desired_job": "运营 / 客服 / 内容", "skills": "社群运营、用户沟通、文档整理、基础数据分析", "languages": "中文 / 英文或日文日常沟通", "visa_status": "可沟通", "availability": "两周内", "expected_salary": "面议", "contact_method": "站内私信"},
        },
        {
            "type": "job_post",
            "author": "jobdesk",
            "title": f"{city_name}本地商家招聘兼职",
            "content": f"{city_name}本地生活服务团队招聘兼职助理，主要负责客户沟通、预约确认、资料整理和简单线下协助。希望候选人守时、沟通清楚、能处理基础表格和消息回复。工作时间可按周排班，适合学生、转职过渡期或想了解本地服务行业的人。#{topic} #招聘 #兼职",
            "attrs": {"job_title": "本地服务兼职助理", "company_name": f"{city_name}生活服务团队", "salary": "时薪面议", "job_type": "part_time", "language_requirement": "中文流利，能基础本地语言沟通更好", "visa_requirement": "需具备合法工作资格", "work_location": city_name, "contact_method": "站内私信", "company_verified": True},
        },
        {
            "type": "referral",
            "author": "jobdesk",
            "title": f"{city_name}内推：双语客户成功",
            "content": f"朋友团队在{city_name}招双语客户成功，主要面对本地商家和跨境用户，工作内容包括需求整理、上线培训、续约跟进和问题排查。比较看重沟通耐心、文档能力和对本地生活行业的理解。感兴趣可以先私信发经历摘要，我会帮忙确认岗位匹配度。#{topic} #内推 #招聘",
            "attrs": {"job_title": "双语客户成功", "company_name": "本地生活 SaaS 团队", "work_location": city_name, "contact_method": "站内私信", "description": "适合有商家服务、客服、运营或 SaaS 经验的人。"},
        },
        {
            "type": "meetup",
            "author": "weekend_groups",
            "title": f"{city_name}周末城市散步小组",
            "content": f"这个周末想在{city_name}发起一个城市散步小组，从咖啡店开始，沿着生活气息比较强的街区慢慢走，顺手拍点店招、路口、市场和居民区的小细节。节奏不赶，适合想熟悉城市、练习拍照、参与本地讨论的人。出发前会共享路线和集合点，安全第一，迟到提前说。#{topic} #本地小组 #Citywalk",
            "attrs": {"title": "周末城市散步小组", "meetup_type": "Citywalk / 摄影", "meetup_time": "周六下午", "location": city_name, "people_limit": 4, "budget": "咖啡自理", "description": "慢走、拍照、参与本地讨论，安全集合。", "safety_notice": "公共场所集合，路线提前共享。"},
        },
        {
            "type": "dining",
            "author": "foodwalk",
            "title": f"{city_name}美食讨论：想试一家口碑小店",
            "content": f"想在{city_name}整理一家口碑稳定但不用排太久的小店，预算控制在普通工作日晚餐水平。欢迎补充忌口、预算、排队情况和附近交通信息。希望讨论轻松真实，不推销、不刷屏。#{topic} #美食 #探店",
            "attrs": {"title": "美食讨论：口碑小店", "restaurant_or_area": city_name, "meetup_time": "工作日晚上或周末中午", "people_limit": 4, "budget": "人均可商量", "description": "轻松讨论，提前确认忌口、预算和店铺信息。"},
        },
        {
            "type": "event",
            "author": "eventline",
            "title": f"{city_name}周末线下交流活动",
            "content": f"{city_name}周末有一场小型线下交流活动，主题围绕本地生活、求职经验、租房避坑和新朋友认识。形式不会太正式，先自我介绍，再分主题讨论，最后自由交流。适合刚搬来、想拓展信息源、也愿意分享自己经验的人。#{topic} #活动 #线下聚会",
            "attrs": {"title": "周末线下交流活动", "event_time": "周日下午 14:00", "location": city_name, "fee": "AA 或免费", "capacity": 20, "registration_method": "站内私信报名", "description": "生活信息、求职租房经验和新朋友交流。"},
        },
        {
            "type": "question",
            "author": "student_life",
            "title": f"{city_name}生活求助",
            "content": f"刚到{city_name}，想请教几个实际问题：手机卡和网络一般怎么选，附近医院初诊要不要预约，租房合同里哪些费用最容易被忽略，通勤路线有没有必要提前买月票？希望有经验的朋友能按优先级给一点建议。#{topic} #问答 #本地求助",
            "attrs": {"question": f"刚到{city_name}，手机卡、医院、租房合同和通勤月票应该先处理哪一个？", "category": "新住民生活"},
        },
        {
            "type": "service",
            "author": "service_map",
            "title": f"{city_name}搬家与生活手续协助",
            "content": f"提供{city_name}本地搬家、地址变更、手机卡、网络、简单翻译和资料整理协助。服务会先确认需求清单、时间、预算和是否需要现场办理协助，再给出可执行方案。不承诺不合规事项，费用透明，复杂问题建议咨询专业人士。#{topic} #本地服务 #搬家",
            "attrs": {"service_type": "搬家 / 翻译 / 生活手续", "price_range": "按需求报价", "contact_method": "站内私信", "verified_status": "verified"},
        },
        {
            "type": "merchant",
            "author": "merchant_ops",
            "title": f"{city_name}安静咖啡店推荐",
            "content": f"{city_name}这家咖啡店适合工作日白天办公或安静聊天，桌距比较舒服，插座位置够用，店员不会催促，甜点选择不算多但品质稳定。周末下午人会明显变多，如果要带电脑建议避开高峰。适合约见、写东西、等朋友。#{topic} #商家 #咖啡店",
            "attrs": {"merchant_name": f"{city_name}安静咖啡", "merchant_type": "咖啡店", "address": f"{city_name}核心生活区", "opening_hours": "10:00-20:00", "contact_method": "店铺电话见主页", "verified_status": "pending", "rating": 4.6},
        },
        {
            "type": "coupon",
            "author": "merchant_ops",
            "title": f"{city_name}新客咖啡优惠",
            "content": f"{city_name}本地咖啡店做新客优惠，工作日下午到店出示 Machi 城市频道页面，可享指定饮品折扣。优惠适合附近上班、上课或刚搬来想找固定咖啡点的人。数量有限，建议到店前先确认是否还有名额。#{topic} #优惠 #咖啡",
            "attrs": {"title": "新客咖啡优惠", "merchant_id": f"{city_name}-coffee", "discount_info": "指定饮品 8 折", "valid_until": "2026-06-30", "usage_rules": "工作日下午可用，不与其他活动叠加。"},
        },
        {
            "type": "warning",
            "author": "warningdesk",
            "title": f"{city_name}租房签约避坑提醒",
            "content": f"最近看到几起{city_name}租房签约纠纷，集中在口头承诺没有写进合同、退租清洁费不清楚、维修责任含糊、提前解约成本过高。建议看房时保存聊天记录和房屋照片，签约前逐条确认费用和退租条件，不要因为房源紧张就跳过合同检查。#{topic} #避坑 #租房避坑",
            "attrs": {"title": "租房签约避坑提醒", "category": "租房避坑", "description": "口头承诺、退租费用、维修责任和提前解约条款都需要落到书面。", "anonymous": False, "review_status": "active"},
            "reports": 2,
        },
        {
            "type": "poll",
            "author": "city_editor",
            "title": f"{city_name}生活成本投票",
            "content": f"想做一期{city_name}真实生活成本整理，先用投票收集大家的体感：你觉得每月最容易超预算的是房租、交通、吃饭、社交，还是各种手续和意外支出？投票结果会整理成攻略，帮助新来的人做更接近现实的预算。#{topic} #投票 #生活成本",
            "attrs": {"question": f"你在{city_name}最容易超预算的是哪一项？", "options": "房租 / 交通 / 吃饭 / 社交 / 手续和意外支出", "expires_at": "2026-06-15"},
        },
        {
            "type": "anonymous",
            "author": "warningdesk",
            "title": f"{city_name}树洞：适应期",
            "content": f"匿名说一句，刚到{city_name}的适应期比想象中更消耗。语言、通勤、找房、工作和社交都要重新建立，白天看起来在解决问题，晚上才会意识到自己其实很累。写在这里不是求安慰，只是想告诉同样处在过渡期的人：慢一点也没关系，先把生活恢复到可持续。#{topic} #树洞 #新生活",
            "attrs": {"title": f"{city_name}树洞：适应期", "description": "新城市适应期的匿名记录。", "anonymous": True},
        },
    ]


def ensure_post(conn: Any, city: tuple[str, str, str, str, str, str], payload: dict[str, Any], author_id: str, index: int) -> str:
    slug, city_name, country, province, city_code, _topic = city
    content_type = payload["type"]
    post_id = stable_id("post", f"{slug}:{content_type}:{payload['title']}")
    created = iso(0.25 + index * 0.22)
    region_code = server._resolve_region_code(country, province, city_code)
    attrs = server.normalize_post_attributes(content_type, payload.get("attrs", {}))
    report_count = int(payload.get("reports") or 0)
    boost_weight = 20 if content_type in {"guide", "news", "event"} and slug in {"tokyo", "shanghai"} else 0
    boosted_until = iso(-24) if boost_weight else ""
    row = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    values = (
        author_id,
        payload["content"],
        900 + index * 37,
        "active",
        country,
        province,
        city_code,
        region_code,
        content_type,
        attrs,
        report_count,
        1 if boost_weight else 0,
        boost_weight,
        boosted_until,
        created,
        created,
        post_id,
    )
    if row:
        conn.execute(
            """
            UPDATE posts
               SET author_id = ?, content = ?, view_count = ?, status = ?, country = ?,
                   province = ?, city = ?, region_code = ?, content_type = ?, attributes = ?,
                   report_count = ?, is_boosted = ?, boost_weight = ?, boosted_until = ?,
                   created_at = ?, updated_at = ?
             WHERE id = ?
            """,
            values,
        )
    else:
        conn.execute(
            """
            INSERT INTO posts (
                author_id, content, view_count, status, country, province, city,
                region_code, content_type, attributes, report_count, is_boosted,
                boost_weight, boosted_until, created_at, updated_at, id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )
    conn.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    for tag in server.extract_tags(payload["content"]):
        conn.execute("INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)", (post_id, tag))
    return post_id


def ensure_engagement(conn: Any, post_id: str, author_id: str, all_user_ids: list[str], heat_seed: int) -> None:
    voters = [uid for uid in all_user_ids if uid != author_id]
    for offset, uid in enumerate(voters[: 4 + heat_seed % 5]):
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'like', ?)",
            (stable_id("like", f"{post_id}:{uid}"), post_id, uid, iso(offset / 10)),
        )
    for uid in voters[: 1 + heat_seed % 3]:
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'bookmark', ?)",
            (stable_id("bookmark", f"{post_id}:{uid}"), post_id, uid, iso(0.2)),
        )
    if heat_seed % 4 == 0 and voters:
        conn.execute(
            "INSERT OR IGNORE INTO interactions (id, target_id, user_id, kind, created_at) VALUES (?, ?, ?, 'repost', ?)",
            (stable_id("repost", f"{post_id}:{voters[0]}"), post_id, voters[0], iso(0.1)),
        )
    if heat_seed % 3 == 0 and voters:
        comment = "这条信息很实用，尤其是费用、时间和注意事项写得清楚，建议后续也按这个格式继续更新。"
        conn.execute(
            """
            INSERT OR IGNORE INTO comments (id, post_id, author_id, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (stable_id("comment", f"{post_id}:{voters[-1]}"), post_id, voters[-1], comment, iso(0.05), iso(0.05)),
        )


def ensure_reports(conn: Any, post_id: str, reporter_ids: list[str]) -> None:
    for idx, uid in enumerate(reporter_ids[:2]):
        conn.execute(
            "INSERT OR IGNORE INTO reports (id, reporter_id, target_kind, target_id, reason, note, created_at) VALUES (?, ?, 'post', ?, 'warning_review', ?, ?)",
            (
                stable_id("report", f"{post_id}:{uid}"),
                uid,
                post_id,
                "种子数据：避坑频道审核流示例。",
                iso(idx / 10),
            ),
        )


def main() -> None:
    server.init_db()
    with server.DB_LOCK, server.db() as conn:
        conn.execute("BEGIN")
        users_by_city: dict[str, dict[str, str]] = {}
        all_user_ids: list[str] = []
        for city in CITIES:
            city_users: dict[str, str] = {}
            for user_meta in USERS:
                suffix = user_meta[0]
                uid = ensure_user(conn, suffix, city, user_meta)
                city_users[suffix] = uid
                all_user_ids.append(uid)
            users_by_city[city[0]] = city_users

        created_posts: list[tuple[str, str, str, dict[str, Any]]] = []
        index = 0
        for city in CITIES:
            city_users = users_by_city[city[0]]
            for local_index, payload in enumerate(channel_payloads(city[1], city[5])):
                author_id = city_users[payload["author"]]
                post_id = ensure_post(conn, city, payload, author_id, local_index)
                created_posts.append((post_id, author_id, city[0], payload))
                index += 1

        unique_users = list(dict.fromkeys(all_user_ids))
        for heat_seed, (post_id, author_id, _slug, payload) in enumerate(created_posts):
            ensure_engagement(conn, post_id, author_id, unique_users[heat_seed % len(unique_users):] + unique_users[: heat_seed % len(unique_users)], heat_seed)
            if payload["type"] == "warning":
                ensure_reports(conn, post_id, [uid for uid in unique_users if uid != author_id])

        # Lightweight follow graph so recommendation/following surfaces
        # have enough users to render.
        for city_slug, city_users in users_by_city.items():
            editor = city_users["city_editor"]
            for suffix, uid in city_users.items():
                if uid == editor:
                    continue
                conn.execute(
                    "INSERT OR IGNORE INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                    (stable_id("follow", f"{city_slug}:{uid}:editor"), uid, editor, server.now_iso()),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)",
                    (stable_id("follow", f"{city_slug}:editor:{uid}"), editor, uid, server.now_iso()),
                )

        # Backfill total_heat-ish profile signal with a simple local
        # approximation so profile/admin cards do not look empty.
        conn.execute(
            """
            UPDATE users
               SET total_heat = (
                   SELECT COALESCE(SUM(p.view_count / 20), 0)
                     FROM posts p
                    WHERE p.author_id = users.id AND p.deleted_at IS NULL
               ),
                   profile_view_count = profile_view_count + 12
             WHERE handle LIKE '%\\_%' ESCAPE '\\'
            """
        )
        conn.execute("COMMIT")

    with server.db() as conn:
        user_count = conn.execute("SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL").fetchone()["c"]
        post_count = conn.execute("SELECT COUNT(*) AS c FROM posts WHERE deleted_at IS NULL").fetchone()["c"]
        typed = conn.execute(
            "SELECT content_type, COUNT(*) AS c FROM posts WHERE deleted_at IS NULL GROUP BY content_type ORDER BY c DESC"
        ).fetchall()
    print(json.dumps({
        "ok": True,
        "users": user_count,
        "posts": post_count,
        "content_types": {row["content_type"]: row["c"] for row in typed},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
