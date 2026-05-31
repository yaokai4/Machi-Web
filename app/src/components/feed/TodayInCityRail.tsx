"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, ChevronRight, Hash, Newspaper, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { NEWS_CATEGORY_LABELS } from "@/components/news/LocalNewsStrip";
import type { RegionInfo } from "@/lib/regions";

const ALERT_CATEGORIES = new Set([
  "traffic_alert",
  "weather_alert",
  "earthquake_alert",
  "typhoon_alert",
  "public_safety",
  "life_notice",
]);

function capitalizeCity(code?: string): string {
  if (!code) return "Tokyo";
  return code.charAt(0).toUpperCase() + code.slice(1);
}

/**
 * PC right rail — a calm, editorial "city summary" for the current
 * region. Not an ad slot: it reads as *what this city is doing today*.
 * All data is real (api.news + api.trending) and cached for 5 minutes so
 * tab switches and feed scrolling never re-fetch it. Hidden below `xl`
 * by AppShell's RightSidebar, so this only renders on wide screens.
 */
export function TodayInCityRail({
  region,
  langLabel,
}: {
  region?: RegionInfo;
  langLabel: string;
}) {
  const country = region?.country_code;
  const city = region?.city_code;
  const englishCity = capitalizeCity(city);
  const cityName = region?.city_name || "东京";
  const countryName = region?.country_name || "日本";

  const news = useQuery({
    queryKey: ["today-in-city-news", country || "", city || ""],
    queryFn: () => api.news({ country, city, limit: 8 }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const items = news.data?.items ?? [];
  const editorPick = items.find((it) => it.category === "editor_pick");
  const alert = items.find((it) => ALERT_CATEGORIES.has(it.category));
  // Headlines = everything that isn't already surfaced as the pick / alert.
  const usedIds = new Set([editorPick?.id, alert?.id].filter(Boolean) as string[]);
  const headlines = items.filter((it) => !usedIds.has(it.id)).slice(0, 4);
  const topics = (trending.data?.topics ?? []).slice(0, 4);

  return (
    <>
      {/* City summary header */}
      <section className="kx-card !p-4">
        <h2 className="text-lg font-black tracking-tight text-kx-text">Today in {englishCity}</h2>
        <p className="mt-0.5 text-xs font-semibold text-kx-muted">
          {countryName} · {cityName} · {langLabel}内容
        </p>
      </section>

      {/* 今日资讯 */}
      <section className="kx-card !p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-black text-kx-text">
            <Newspaper className="h-4 w-4 text-kx-accent" /> 今日资讯
          </h3>
          <Link href="/news" className="inline-flex items-center gap-0.5 text-xs font-bold text-kx-accent hover:underline">
            本地资讯台 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {news.isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-full kx-skeleton" />
            <div className="h-4 w-2/3 kx-skeleton" />
          </div>
        ) : headlines.length > 0 ? (
          <ul className="divide-y divide-kx-stroke/35">
            {headlines.map((it) => (
              <li key={it.id}>
                <Link href={`/news/${it.id}`} className="group flex items-start gap-2 py-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-kx-accent/60" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold leading-5 text-kx-text group-hover:text-kx-accent">
                      {it.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-kx-muted">
                      {NEWS_CATEGORY_LABELS[it.category] || "城市快讯"} · {it.published_at ? relativeTime(it.published_at) : "今天"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-5 text-kx-muted">
            今天还没有新的本地资讯。Machi 编辑部会持续整理交通、政策、安全和生活提醒。
          </p>
        )}
      </section>

      {/* 这座城市正在讨论 */}
      {topics.length > 0 ? (
        <section className="kx-card !p-4">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-sm font-black text-kx-text">
            <Hash className="h-4 w-4 text-kx-accent" /> 这座城市正在讨论
          </h3>
          <ul className="flex flex-col">
            {topics.map((tp, idx) => (
              <li key={tp.tag} className="border-b border-kx-stroke/35 last:border-0">
                <Link
                  href={`/t/${encodeURIComponent(tp.tag)}`}
                  className="group flex items-center gap-2.5 py-2"
                >
                  <span className={`w-4 shrink-0 text-right text-xs font-black ${idx < 2 ? "text-kx-heat" : "text-kx-muted"}`}>
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-kx-text group-hover:text-kx-accent">
                      #{tp.tag}
                    </span>
                    <span className="text-[11px] text-kx-muted">今天 {tp.post_count} 帖讨论</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 本地提醒 */}
      <section className="kx-card !p-4">
        <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-black text-kx-text">
          <AlertTriangle className="h-4 w-4 text-kx-heat" /> 本地提醒
        </h3>
        {alert ? (
          <Link href={`/news/${alert.id}`} className="block rounded-kx-md bg-kx-heat/5 p-2.5 hover:bg-kx-heat/10">
            <div className="text-[11px] font-bold text-kx-heat">{NEWS_CATEGORY_LABELS[alert.category] || "提醒"}</div>
            <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-kx-text">{alert.title}</div>
          </Link>
        ) : (
          <p className="text-xs leading-5 text-kx-muted">
            今天没有紧急提醒。出门前可以留意天气、交通和地震信息。
          </p>
        )}
      </section>

      {/* 编辑部精选 */}
      {editorPick ? (
        <section className="kx-card !p-4">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-black text-kx-text">
            <Sparkles className="h-4 w-4 text-kx-accent" /> 编辑部精选
          </h3>
          <Link href={`/news/${editorPick.id}`} className="block rounded-kx-md bg-kx-soft/70 p-2.5 hover:bg-kx-soft">
            <div className="line-clamp-2 text-sm font-bold leading-5 text-kx-text">{editorPick.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-kx-subtle">{editorPick.summary || editorPick.body}</div>
            <div className="mt-1.5 text-[11px] text-kx-muted">{editorPick.author_display_name}</div>
          </Link>
        </section>
      ) : null}

      {/* Machi 认证会员 */}
      <MemberRailCard />

      <p className="px-1 pb-2 text-[11px] leading-4 text-kx-muted">
        Machi · {countryName} · {cityName}。在每一座城市，找到生活的回声。
      </p>
    </>
  );
}

function MemberRailCard() {
  return (
    <section className="kx-card !p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kx-verified/15 text-kx-verified">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-kx-text">Machi 认证会员</h3>
          <p className="mt-1 text-xs leading-5 text-kx-muted">
            建立你的本地可信身份。适合发布租房、招聘、服务、商家内容，或长期收藏本地信息的人。
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-semibold text-kx-subtle">
            <li>· 高信任发布</li>
            <li>· 优先审核</li>
            <li>· 会员专属内容</li>
            <li>· 高级收藏</li>
          </ul>
          <Link href="/membership" className="mt-3 inline-flex text-xs font-bold text-kx-accent hover:underline">
            查看会员权益
          </Link>
        </div>
      </div>
    </section>
  );
}
