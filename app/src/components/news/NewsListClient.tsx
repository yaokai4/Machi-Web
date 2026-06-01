"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Clock3, Languages, MapPin, Newspaper, Plus, Radio, SlidersHorizontal, Sparkles } from "lucide-react";
import { api, type EditorialPost, type NewsCategory } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { NEWS_CATEGORY_LABELS } from "@/components/news/LocalNewsStrip";
import { relativeTime } from "@/lib/format";
import { useAuthPrompt, useCompose, useSession } from "@/lib/store";

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
  { value: "economy", label: "经济" },
  { value: "technology", label: "科技" },
  { value: "culture", label: "文化" },
  { value: "sports", label: "体育" },
  { value: "education", label: "教育" },
  { value: "health", label: "健康" },
  { value: "travel", label: "旅行" },
  { value: "editor_pick", label: "精选" },
];

const LANGUAGES = [
  { value: "", label: "全部语言" },
  { value: "zh-CN", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const CITY_OPTIONS_BY_COUNTRY: Record<string, Array<{ value: string; label: string }>> = {
  jp: [
    { value: "", label: "Japan-wide" },
    { value: "tokyo", label: "Tokyo" },
    { value: "osaka", label: "Osaka" },
    { value: "kyoto", label: "Kyoto" },
  ],
  cn: [
    { value: "", label: "China-wide" },
    { value: "shanghai", label: "Shanghai" },
    { value: "hangzhou", label: "Hangzhou" },
  ],
  us: [
    { value: "", label: "United States-wide" },
    { value: "la", label: "Los Angeles" },
  ],
  ca: [
    { value: "", label: "Canada-wide" },
    { value: "montreal", label: "Montreal" },
  ],
};

function cityLabel(city?: string | null, country = "jp"): string {
  const normalized = String(city || "").trim().toLowerCase();
  if (normalized === "tokyo") return "Tokyo";
  if (normalized === "osaka") return "Osaka";
  if (normalized === "kyoto") return "Kyoto";
  if (normalized === "shanghai") return "Shanghai";
  if (normalized === "hangzhou") return "Hangzhou";
  if (normalized === "la") return "Los Angeles";
  if (normalized === "montreal") return "Montreal";
  if (country === "cn") return "China-wide";
  if (country === "us") return "United States-wide";
  if (country === "ca") return "Canada-wide";
  return "Japan-wide";
}

export function NewsListClient({ presetCity = "", title = "本地资讯", subtitle = "看看这座城市最近发生了什么。" }: {
  presetCity?: "" | "tokyo" | "osaka" | "kyoto" | "shanghai" | "hangzhou" | "la" | "montreal";
  title?: string;
  subtitle?: string;
}) {
  const [category, setCategory] = useState<"" | NewsCategory>("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [city, setCity] = useState(presetCity);
  const user = useSession((s) => s.user);
  const country = user?.country || "jp";
  const cityOptions = CITY_OPTIONS_BY_COUNTRY[country] || CITY_OPTIONS_BY_COUNTRY.jp;
  const effectiveCity = cityOptions.some((item) => item.value === city) ? city : "";
  const compose = useCompose((s) => s.open);
  const openAuthPrompt = useAuthPrompt((s) => s.open);

  const opts = useMemo(() => ({
    country,
    city: effectiveCity,
    language,
    category,
    sort,
    limit: 30,
  }), [category, country, effectiveCity, language, sort]);

  const list = useQuery({
    queryKey: ["news", opts],
    queryFn: () => api.news(opts),
    staleTime: 45_000,
  });
  const newsItems = Array.isArray(list.data?.items) ? list.data.items : [];
  const featured = newsItems[0];
  const regularItems = featured ? newsItems.slice(1) : newsItems;
  const openNewsCompose = () => {
    if (!user) {
      openAuthPrompt("publish");
      return;
    }
    compose({ initialContentType: "local_info" });
  };

  return (
    <AppShell requireAuth={false} right={<NewsRightRail items={newsItems} city={cityLabel(effectiveCity, country)} />}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <Newspaper className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">
                <Radio className="h-3 w-3 text-kx-accent" />
                Machi Local Desk
              </div>
              <h1 className="mt-1 text-xl font-black leading-tight">{title}</h1>
              <p className="text-xs leading-5 text-kx-muted">{subtitle}</p>
            </div>
          </div>
          <button type="button" className="kx-button-primary hidden h-9 shrink-0 sm:inline-flex" onClick={openNewsCompose}>
            <Plus className="h-4 w-4" />
            投稿
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-kx-soft/65 p-1.5">
          <select className="kx-input h-8 w-auto min-w-32 px-2 text-xs" value={effectiveCity} onChange={(e) => setCity(e.target.value as typeof city)}>
            {cityOptions.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}
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
          <ErrorState title="本地资讯暂时无法加载" onRetry={() => list.refetch()} subtitle="本地资讯正在整理中，请稍后再试。" />
        ) : newsItems.length === 0 ? (
          <div className="space-y-3">
            <EmptyState title="本地资讯正在整理中" subtitle="Machi 编辑部会持续整理公开来源和本地更新。" />
            {user?.role === "admin" ? (
              <div className="kx-card border-amber-400/30 bg-amber-400/10">
                <div className="text-sm font-bold text-kx-text">{String(list.data?.diagnostics?.hint || "暂无本地资讯。请在后台抓取并发布内容。")}</div>
                <Link href="/admin/japan-news-crawler" className="kx-button-primary mt-3 inline-flex h-9">去后台抓取日本资讯</Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {featured ? <NewsCard item={featured} featured /> : null}
            <div className="grid gap-3">
              {regularItems.map((item) => <NewsCard key={item.id} item={item} />)}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function categoryIcon(category: NewsCategory) {
  if (category === "traffic_alert") return MapPin;
  if (category === "policy_update" || category === "immigration_visa") return Languages;
  if (category === "editor_pick") return Sparkles;
  return Newspaper;
}

function NewsCard({ item, featured = false }: { item: EditorialPost; featured?: boolean }) {
  const category = item.category || "local_news";
  const title = item.title || "未命名资讯";
  const summary = item.summary || item.body || "Machi 编辑部正在整理这条资讯的摘要。";
  const Icon = categoryIcon(category);
  return (
    <Link
      href={`/news/${item.id}`}
      className={[
        "group block overflow-hidden rounded-kx-lg border border-kx-stroke/45 bg-kx-card transition",
        "hover:-translate-y-0.5 hover:border-kx-accent/45 hover:shadow-kx",
        featured ? "p-4 sm:p-5" : "p-3.5 sm:p-4",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
            <span className="rounded-full bg-kx-soft px-2 py-0.5 text-kx-accent">{NEWS_CATEGORY_LABELS[category] || category}</span>
            <span>{cityLabel(item.city)}</span>
            <span>·</span>
            <span className="truncate">{item.author_display_name || "Machi Local Desk"}</span>
            {item.published_at ? (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {relativeTime(item.published_at)}</span>
              </>
            ) : null}
          </div>
          <h2 className={(featured ? "text-lg sm:text-xl " : "text-base ") + "line-clamp-2 font-black leading-snug text-kx-text group-hover:text-kx-accent"}>
            {title}
          </h2>
          <p className={(featured ? "line-clamp-4 " : "line-clamp-3 ") + "mt-1.5 text-sm leading-6 text-kx-subtle"}>
            {summary}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-kx-muted">
            <span className="max-w-[12rem] truncate">{item.source_name || "Machi Local Desk"}</span>
            <span className="inline-flex items-center gap-1"><Bookmark className="h-3 w-3" /> {item.save_count ?? 0}</span>
            <span>分享 {item.share_count ?? 0}</span>
            <span>评论 {item.comment_count ?? 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function NewsRightRail({ items, city }: { items: EditorialPost[]; city: string }) {
  const top = items.slice(0, 6);
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-bold text-kx-accent">
          <Sparkles className="h-3.5 w-3.5" />
          {city}
        </div>
        <h3 className="mt-3 text-base font-black text-kx-text">本地资讯台</h3>
        <p className="mt-1 text-sm leading-6 text-kx-subtle">精选公开来源、编辑部整理和城市生活提醒，适合快速扫一眼今天要注意的事。</p>
      </section>
      {top.length ? (
        <section className="kx-card">
          <h3 className="kx-section-title mb-2 px-0">快速浏览</h3>
          <ol className="space-y-2">
            {top.map((item, index) => (
              <li key={item.id}>
                <Link href={`/news/${item.id}`} className="group flex gap-2 rounded-kx-sm p-1.5 hover:bg-kx-soft">
                  <span className="w-5 shrink-0 text-right text-xs font-black text-kx-accent">{index + 1}</span>
                  <span className="line-clamp-2 text-sm font-semibold text-kx-text group-hover:text-kx-accent">{item.title || "未命名资讯"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
