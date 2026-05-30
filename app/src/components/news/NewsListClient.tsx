"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Languages, MapPin, Newspaper, SlidersHorizontal } from "lucide-react";
import { api, type NewsCategory } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { NEWS_CATEGORY_LABELS } from "@/components/news/LocalNewsStrip";
import { relativeTime } from "@/lib/format";

const CATEGORIES: Array<{ value: "" | NewsCategory; label: string }> = [
  { value: "", label: "全部" },
  { value: "local_news", label: "本地快讯" },
  { value: "traffic_alert", label: "交通" },
  { value: "weather_alert", label: "天气" },
  { value: "earthquake_alert", label: "地震" },
  { value: "typhoon_alert", label: "台风" },
  { value: "policy_update", label: "政策" },
  { value: "immigration_visa", label: "在留" },
  { value: "city_event", label: "活动" },
  { value: "life_notice", label: "生活" },
  { value: "public_safety", label: "安全" },
  { value: "editor_pick", label: "精选" },
];

const LANGUAGES = [
  { value: "", label: "全部语言" },
  { value: "zh-CN", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const JAPAN_CITIES = [
  { value: "", label: "Japan-wide" },
  { value: "tokyo", label: "Tokyo" },
  { value: "osaka", label: "Osaka" },
];

export function NewsListClient({ presetCity = "", title = "本地资讯", subtitle = "看看这座城市最近发生了什么。" }: {
  presetCity?: "" | "tokyo" | "osaka";
  title?: string;
  subtitle?: string;
}) {
  const [category, setCategory] = useState<"" | NewsCategory>("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [city, setCity] = useState(presetCity);

  const opts = useMemo(() => ({
    country: "jp",
    city,
    language,
    category,
    sort,
    limit: 30,
  }), [category, city, language, sort]);

  const list = useQuery({
    queryKey: ["news", opts],
    queryFn: () => api.news(opts),
    staleTime: 45_000,
  });

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-kx-accent" />
          <div className="min-w-0">
            <h1 className="text-xl font-black">{title}</h1>
            <p className="text-xs text-kx-muted">{subtitle}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="kx-input h-8 w-auto min-w-32 px-2 text-xs" value={city} onChange={(e) => setCity(e.target.value as "" | "tokyo" | "osaka")}>
            {JAPAN_CITIES.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}
          </select>
          <select className="kx-input h-8 w-auto min-w-28 px-2 text-xs" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
          </select>
          <button type="button" className="kx-tab h-8 px-3 text-xs inline-flex items-center gap-1" data-active={sort === "popular"} onClick={() => setSort(sort === "latest" ? "popular" : "latest")}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {sort === "latest" ? "最新" : "热门"}
          </button>
        </div>

        <div className="mt-2 -mx-1 flex gap-1 overflow-x-auto kx-scroll px-1">
          {CATEGORIES.map((item) => (
            <button
              key={item.value || "all"}
              type="button"
              data-active={category === item.value}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
              onClick={() => setCategory(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-3 sm:px-4 py-3">
        {list.isLoading ? (
          <InlineLoading />
        ) : list.isError ? (
          <ErrorState onRetry={() => list.refetch()} subtitle="无法加载本地资讯，请稍后重试。" />
        ) : !list.data?.items.length ? (
          <EmptyState title="暂无本地资讯" subtitle="编辑部发布后会显示在这里。" />
        ) : (
          <div className="space-y-3">
            {list.data.items.map((item) => (
              <Link key={item.id} href={`/news/${item.id}`} className="kx-card block hover:border-kx-accent/40 transition">
                <div className="flex items-start gap-3">
                  <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-kx-md bg-kx-accentSoft text-kx-accent">
                    {item.category === "traffic_alert" ? <MapPin className="h-4 w-4" /> : item.category === "policy_update" ? <Languages className="h-4 w-4" /> : <Newspaper className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
                      <span>{NEWS_CATEGORY_LABELS[item.category] || item.category}</span>
                      <span>·</span>
                      <span>{item.city || "Japan-wide"}</span>
                      <span>·</span>
                      <span>{item.author_display_name}</span>
                      {item.published_at ? <><span>·</span><span>{relativeTime(item.published_at)}</span></> : null}
                    </div>
                    <h2 className="line-clamp-2 text-base font-black leading-snug text-kx-text">{item.title}</h2>
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-kx-subtle">{item.summary || item.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-kx-muted">
                      <span>{item.source_name || "Machi Local Desk"}</span>
                      <span className="inline-flex items-center gap-1"><Bookmark className="h-3 w-3" /> {item.save_count}</span>
                      <span>分享 {item.share_count}</span>
                      <span>评论 {item.comment_count}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
