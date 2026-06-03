"use client";

import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";

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

export function LocalNewsStrip({ title, variant = "home" }: Props) {
  return (
    <section className="kx-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="kx-section-title inline-flex items-center gap-1.5 px-0">
          <BookOpen className="h-4 w-4 text-kx-accent" />
          {title || (variant === "city" ? "日本生活指南" : "Machi Guide")}
        </h3>
        <Link href="/guide" className="inline-flex items-center gap-1 text-xs font-bold text-kx-accent">
          打开指南 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <Link href="/guide" className="block rounded-kx-md bg-kx-soft/70 px-3 py-3 transition hover:bg-kx-soft">
        <div className="text-sm font-bold text-kx-text">升学、就职、留学和日本生活资料已迁移到 Machi Guide</div>
        <p className="mt-1 text-xs leading-5 text-kx-subtle">旧本地资讯流已退休，指南内容按主题整理，并提供资料、服务预约与公司经验入口。</p>
      </Link>
    </section>
  );
}
