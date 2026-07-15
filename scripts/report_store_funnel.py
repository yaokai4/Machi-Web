#!/usr/bin/env python3
"""商城 30 天 go/no-go 漏斗报表（Phase 1 判据）。

数据源：funnel_events 表（store_view / sku_view / purchase_start /
purchase_success / membership_view）+ guide_orders + wallet_topup_orders。
判据（MACHI_商城化改造与内容规划_2026-07-16.md §七）：
  30 天付费订单 ≥ 5 单，否则暂停 Phase 2、先复盘供给/定价/信任。

Run:  cd web && python3 scripts/report_store_funnel.py [--days 30] [--db kaix.db]
"""
from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timedelta, timezone

KILL_CRITERIA_PAID_ORDERS = 5


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--db", default="kaix.db")
    args = ap.parse_args()
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    def one(sql: str, *params) -> int:
        row = conn.execute(sql, params).fetchone()
        return int(row[0] or 0) if row else 0

    print(f"== Machi 商城漏斗（近 {args.days} 天，since {since[:19]}Z）==\n")

    events = {}
    for r in conn.execute(
            "SELECT event, COUNT(*) AS c, COUNT(DISTINCT COALESCE(NULLIF(user_id,''), guest_id)) AS u "
            "FROM funnel_events WHERE created_at >= ? GROUP BY event", (since,)):
        events[r["event"]] = (int(r["c"]), int(r["u"]))
    for name, label in (("store_view", "商城曝光"), ("sku_view", "商品详情"),
                        ("purchase_start", "购买发起"), ("purchase_success", "购买完成(前端)"),
                        ("membership_view", "会员页曝光")):
        c, u = events.get(name, (0, 0))
        print(f"  {label:<12} {c:>6} 次 / {u:>5} 人")

    # purchase_start 按支付方式拆分
    rows = conn.execute(
        "SELECT props_json, COUNT(*) AS c FROM funnel_events "
        "WHERE event = 'purchase_start' AND created_at >= ? GROUP BY props_json", (since,)).fetchall()
    if rows:
        print("\n  购买发起按方式：")
        for r in rows:
            print(f"    {r['props_json'][:60]:<60} {r['c']}")

    # 订单侧真相（排除沙盒）
    paid_wallet = one(
        "SELECT COUNT(*) FROM guide_orders WHERE payment_method = 'wallet_points' "
        "AND status = 'fulfilled' AND price_points > 0 AND created_at >= ?", since)
    paid_iap = one(
        "SELECT COUNT(*) FROM guide_orders WHERE payment_provider = 'apple_iap' "
        "AND status = 'fulfilled' AND payment_method != 'apple_iap_sandbox' AND created_at >= ?", since)
    paid_stripe = one(
        "SELECT COUNT(*) FROM guide_orders WHERE payment_provider = 'stripe' "
        "AND status IN ('paid','fulfilled') AND created_at >= ?", since)
    free_unlocks = one(
        "SELECT COUNT(*) FROM guide_orders WHERE status = 'fulfilled' AND price_points = 0 "
        "AND payment_provider NOT IN ('apple_iap','stripe') AND created_at >= ?", since)
    topups = one(
        "SELECT COUNT(*) FROM wallet_topup_orders WHERE status IN ('paid','fulfilled') "
        "AND COALESCE(client_type,'') <> 'ios_sandbox' AND created_at >= ?", since)
    topup_jpy = one(
        "SELECT COALESCE(SUM(amount_cents),0)/100 FROM wallet_topup_orders WHERE status IN ('paid','fulfilled') "
        "AND COALESCE(client_type,'') <> 'ios_sandbox' AND created_at >= ?", since)

    paid_total = paid_wallet + paid_iap + paid_stripe
    print(f"\n  付费订单（订单表真相，排除沙盒）：")
    print(f"    币购 {paid_wallet} · 单品IAP {paid_iap} · Stripe {paid_stripe} → 合计 {paid_total}")
    print(f"    免费领取 {free_unlocks} · 充值订单 {topups}（¥{topup_jpy:,} JPY）")

    print(f"\n== 判据：30 天付费订单 ≥ {KILL_CRITERIA_PAID_ORDERS} ==")
    if paid_total >= KILL_CRITERIA_PAID_ORDERS:
        print(f"  ✅ 达标（{paid_total} 单）——可以启动 Phase 2 会员编入")
    else:
        print(f"  ❌ 未达标（{paid_total} 单）——暂停 Phase 2，先复盘：")
        sv = events.get("store_view", (0, 0))[0]
        kv = events.get("sku_view", (0, 0))[0]
        ps = events.get("purchase_start", (0, 0))[0]
        if sv == 0:
            print("     · 商城无曝光 → 入口/流量问题")
        elif kv * 5 < sv:
            print("     · 曝光→详情转化差 → 门面/选品问题")
        elif ps == 0:
            print("     · 有详情无购买发起 → 定价/信任问题（样张/评价/退款政策）")
        else:
            print("     · 发起未完成 → 支付链路摩擦（充值两跳/IAP 失败率）")
    conn.close()


if __name__ == "__main__":
    main()
