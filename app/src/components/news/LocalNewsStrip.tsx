"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Newspaper, Sparkles } from "lucide-react";
import { api, type EditorialPost } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export const NEWS_CATEGORY_LABELS: Record<string, string> = {
  local_news: "城市快讯",
  traffic_alert: "交通提醒",
  weather_alert: "天气灾害",
  earthquake_alert: "地震提醒",
  typhoon_alert: "台风提醒",
  policy_update: "政策更新",
  immigration_visa: "在留签证",
  city_event: "城市活动",
  life_notice: "生活通知",
  housing_notice: "租房搬家",
  housing_market: "租房提醒",
  work_study: "工作留学",
  public_safety: "公共安全",
  economy: "经济",
  technology: "科技",
  culture: "文化",
  sports: "体育",
  education: "教育",
  health: "健康",
  travel: "旅行",
  digital_life: "数字生活",
  national_notice: "全国公告",
  legal_notice: "法律手续",
  residence_card: "在留卡",
  visa_policy: "签证政策",
  foreign_resident_notice: "外国居民",
  labor_policy: "劳动政策",
  resident_service: "居民服务",
  garbage_rule: "垃圾规则",
  child_support: "育儿补助",
  local_event: "本地活动",
  train_delay: "列车延误",
  commute: "通勤",
  disaster: "灾害提醒",
  disaster_prevention: "防灾",
  food: "美食",
  weekend: "周末",
  exhibition: "展览",
  meetup: "聚会",
  language_exchange: "语言交换",
  editor_pick: "编辑部精选",
  weekly_digest: "本周摘要",
  other: "其他",
};

type Props = {
  country?: string;
  city?: string;
  language?: string;
  title?: string;
  variant?: "home" | "city";
};

export function LocalNewsStrip({ country, city, language, title, variant = "home" }: Props) {
  const latest = useQuery({
    queryKey: ["local-news-strip", country || "", city || "", language || "", variant],
    queryFn: () => api.news({ country, city, language, limit: variant === "city" ? 5 : 4 }),
    staleTime: 60_000,
  });

  if (latest.isLoading) {
    return (
      <section className="kx-card">
        <div className="h-5 w-36 kx-skeleton" />
        <div className="mt-3 space-y-2">
          <div className="h-14 kx-skeleton rounded-kx-md" />
          <div className="h-14 kx-skeleton rounded-kx-md" />
        </div>
      </section>
    );
  }

  const items = latest.data?.items || [];
  if (items.length === 0) return null;

  const pick = items.find((item) => item.category === "editor_pick") || items[0];
  const alerts = items.filter((item) => item.category === "traffic_alert" || item.category === "weather_alert" || item.category === "life_notice").slice(0, 2);
  const rest = items.filter((item) => item.id !== pick.id).slice(0, variant === "city" ? 4 : 3);

  return (
    <section className="kx-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5">
          <Newspaper className="h-4 w-4 text-kx-accent" />
          {title || (variant === "city" ? "本地快讯" : "From Local Desk")}
        </h3>
        <Link href="/news" className="inline-flex items-center gap-1 text-xs font-bold text-kx-accent">
          本地资讯台 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {variant === "city" && alerts.length > 0 ? (
        <div className="mb-3 grid gap-2">
          {alerts.map((item) => (
            <NewsInline key={item.id} item={item} icon={<AlertTriangle className="h-3.5 w-3.5 text-kx-heat" />} />
          ))}
        </div>
      ) : null}

      <Link href={`/news/${pick.id}`} className="block rounded-kx-md bg-kx-soft/70 px-3 py-2.5 hover:bg-kx-soft transition">
        <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-kx-accent">
          <Sparkles className="h-3.5 w-3.5" />
          {NEWS_CATEGORY_LABELS[pick.category] || "编辑部"}
        </div>
        <div className="line-clamp-2 text-sm font-bold text-kx-text">{pick.title}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-5 text-kx-subtle">{pick.summary || pick.body}</div>
        <div className="mt-2 text-[11px] text-kx-muted">
          {pick.author_display_name} · {pick.published_at ? relativeTime(pick.published_at) : "待发布"}
        </div>
      </Link>

      {rest.length > 0 ? (
        <div className="mt-2 divide-y divide-kx-stroke/35">
          {rest.map((item) => <NewsInline key={item.id} item={item} />)}
        </div>
      ) : null}
    </section>
  );
}

function NewsInline({ item, icon }: { item: EditorialPost; icon?: ReactNode }) {
  return (
    <Link href={`/news/${item.id}`} className="flex items-start gap-2 py-2 text-sm hover:text-kx-accent">
      <span className="mt-0.5 shrink-0">{icon || <Newspaper className="h-3.5 w-3.5 text-kx-muted" />}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 font-semibold">{item.title}</span>
        <span className="mt-0.5 block text-[11px] text-kx-muted">
          {NEWS_CATEGORY_LABELS[item.category] || item.category} · {item.source_name || item.author_display_name}
        </span>
      </span>
    </Link>
  );
}
