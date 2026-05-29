"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Flame, Hash, Search, ShoppingBag, Tag, TrendingUp, UserPlus } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { CurrentRegionCard } from "@/components/feed/CurrentRegionCard";
import { DiscoverShortcutGrid } from "@/components/feed/DiscoverShortcuts";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { compactNumber } from "@/lib/format";
import { useSession, useToasts } from "@/lib/store";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { CONTENT_TYPE_LABELS, type ContentType, type KXPost, type KXRegion } from "@/lib/types";
import { countryName, hotCitiesForCountry, normalizeRegion, regionFromUser, type RegionInfo } from "@/lib/regions";

export default function ExplorePage() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const currentRegion = regionFromUser(user);
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 60_000,
    enabled: !!user,
  });
  const cityHot = useQuery({
    queryKey: ["explore-hot-city", user?.current_region_code || user?.city || ""],
    queryFn: () => api.feed("hot", undefined, { region_code: user?.current_region_code, country: user?.country, province: user?.province, city: user?.city }),
    staleTime: 60_000,
    enabled: !!user && !!(user.current_region_code || user.city),
  });
  const countryHot = useQuery({
    queryKey: ["explore-hot-country", user?.country || ""],
    queryFn: () => api.feed("hot", undefined, { country: user?.country }),
    staleTime: 60_000,
    enabled: !!user && !!user.country,
  });
  const popularRegions = useQuery({
    queryKey: ["popular-regions"],
    queryFn: () => api.popularRegions(),
    staleTime: 5 * 60_000,
    enabled: !!user,
  });
  const popularCities = hotCitiesForCountry(user?.country);
  const popularRegionItems = (popularRegions.data || [])
    .filter((region) => !user?.country || region.country_code === user.country)
    .slice(0, 12);

  const toggleFollow = async (id: string, current?: boolean) => {
    if (!user) return;
    setFollowBusy(id);
    try {
      await api.follow(id, !current);
      trending.refetch();
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setFollowBusy(null);
    }
  };

  const persistRegion = async (region: RegionInfo) => {
    try {
      const next = await api.updateMe({
        country: region.country_code,
        province: region.province_code,
        city: region.city_code,
        current_region_code: region.region_code,
      });
      setUser(next);
      cityHot.refetch();
      countryHot.refetch();
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-center gap-3">
          {user ? <Avatar user={user} size={40} href="/me" /> : null}
          <h1 className="text-xl font-black">发现</h1>
        </div>
        <Link href="/search" className="mt-3 h-10 rounded-kx-md bg-kx-soft text-kx-muted px-3 flex items-center gap-2 text-sm">
          <Search className="w-4 h-4" /> 搜索帖子、用户、话题、城市和本地信息
        </Link>
      </header>

      {trending.isError ? (
        <ErrorState onRetry={() => trending.refetch()} />
      ) : !trending.data ? (
        <InlineLoading />
      ) : (
        <div className="px-3 sm:px-4 py-3 space-y-3">
          {/* 1) 当前地区（小巧，提示用户上下文） */}
          <CurrentRegionCard onChange={() => setRegionPickerOpen(true)} />

          {/* 2) 快捷入口 — 用户要求置顶 */}
          <DiscoverShortcutGrid />

          {/* 3) 本国热榜（首屏关键发现入口） */}
          <section className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-kx-heat" /> 本国热榜
            </h3>
            <ul className="flex flex-col">
              {trending.data!.posts.map((post, idx) => (
                <li key={post.id} className="border-b border-kx-stroke/40 last:border-0">
                  <Link
                    href={`/p/${post.id}`}
                    className="flex items-start gap-3 py-2.5 group"
                  >
                    <span className="text-kx-heat font-bold w-5 text-right">{idx + 1}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-kx-text group-hover:underline line-clamp-2">
                        {post.content}
                      </div>
                      <div className="text-xs text-kx-muted mt-0.5">
                        {compactNumber(post.heat_score)} 热度 · @{post.author?.handle} · {compactNumber(post.view_count)} 阅读
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* 4) 同城热榜（紧凑卡片） */}
          <MiniHotSection
            title={currentRegion ? `${currentRegion.city_name}热榜` : "当前城市热榜"}
            icon={<Building2 className="w-4 h-4 text-kx-accent" />}
            posts={cityHot.data?.items || []}
            empty="选择当前城市后展示同城热榜"
          />

          {/* 5) 同国热榜（紧凑卡片） */}
          <MiniHotSection
            title={user?.country ? `${currentRegion?.country_name || countryName(user.country)} 热榜` : "当前国家热榜"}
            icon={<Flame className="w-4 h-4 text-kx-heat" />}
            posts={countryHot.data?.items || []}
            empty="选择国家后展示国家热榜"
          />

          {/* 6) 话题排行榜 */}
          <section className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-kx-accent" /> 话题排行榜
            </h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
              {trending.data!.topics.map((t, idx) => (
                <li key={t.tag}>
                  <Link href={`/t/${encodeURIComponent(t.tag)}`} className="flex items-center gap-2 hover:underline">
                    <span className="w-5 text-right text-kx-accent font-bold">{idx + 1}</span>
                    <span className="font-semibold text-sm truncate">#{t.tag}</span>
                    <span className="text-xs text-kx-muted ml-auto">{t.post_count} 帖</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* 7) 热门城市 */}
          <section className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-kx-accent" /> 热门城市
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {popularRegionItems.length > 0
                ? popularRegionItems.map((region) => <RegionChip key={region.region_code} region={region} />)
                : popularCities.map((city) => (
                    <Link key={city.region_code} href={`/c/${encodeURIComponent(city.region_code)}`} className="px-3 py-1 rounded-full bg-kx-soft text-xs font-semibold hover:bg-kx-stroke/40">
                      {city.country_emoji} {city.city_name}
                    </Link>
                  ))}
            </div>
          </section>

          {/* 8) 分类热榜（与快捷入口区分：这里是「分类下24h热度」） */}
          <section className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-kx-bookmark" /> 分类热榜
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                ["secondhand", Tag],
                ["housing", Building2],
                ["job_post", UserPlus],
                ["event", CalendarDays],
                ["meetup", UserPlus],
                ["merchant", ShoppingBag],
                ["coupon", Flame],
                ["guide", Hash],
              ] as Array<[ContentType, ComponentType<{ className?: string }>]>) .map(([type, Icon]) => (
                <Link key={type} href={`/search?q=${encodeURIComponent(CONTENT_TYPE_LABELS[type])}`} className="rounded-kx-md bg-kx-soft p-3 hover:bg-kx-stroke/40 transition">
                  <Icon className="w-4 h-4 text-kx-accent mb-2" />
                  <div className="font-semibold text-sm">{CONTENT_TYPE_LABELS[type]}</div>
                  <div className="text-xs text-kx-muted mt-0.5">24h 热门内容</div>
                </Link>
              ))}
            </div>
          </section>

          <section className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-kx-repost" /> 推荐关注
            </h3>
            <ul className="grid sm:grid-cols-2 gap-3">
              {trending.data!.users.filter((u) => u.id !== user?.id).map((u) => (
                <li key={u.id} className="flex items-center gap-2.5">
                  <Avatar user={u} size={40} href={`/u/${u.handle}`} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${u.handle}`} className="font-semibold text-sm hover:underline truncate flex items-center gap-1">
                      {u.display_name}
                      {u.is_verified ? <VerifiedBadge /> : null}
                    </Link>
                    <div className="text-kx-muted text-xs truncate">@{u.handle}</div>
                  </div>
                  <button
                    className="kx-button-ghost text-xs h-8 px-3"
                    onClick={() => toggleFollow(u.id, u.is_following)}
                    disabled={followBusy === u.id}
                  >
                    {u.is_following ? "已关注" : "关注"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <RegionPickerDialog
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        onSelect={persistRegion}
        initialCountry={user?.country || currentRegion?.country_code}
        allowsAnyCountry={!user?.country}
        recentCodes={user?.recent_region_codes}
      />
    </AppShell>
  );
}

function RegionChip({ region }: { region: KXRegion | RegionInfo }) {
  const item = normalizeRegion(region);
  return (
    <Link
      href={`/c/${encodeURIComponent(item.region_code)}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-kx-soft px-3 py-1 text-xs font-semibold hover:bg-kx-stroke/40"
      title={`${item.country_name} · ${item.province_name ? `${item.province_name} · ` : ""}${item.city_name}`}
    >
      <span>{item.country_emoji || "🌐"}</span>
      <span>{item.city_name}</span>
    </Link>
  );
}

function MiniHotSection({ title, icon, posts, empty }: { title: string; icon: ReactNode; posts: KXPost[]; empty: string }) {
  return (
    <section className="kx-card">
      <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {posts.length ? (
        <ol className="space-y-2">
          {posts.slice(0, 5).map((post, idx) => (
            <li key={post.id}>
              <Link href={`/p/${post.id}`} className="flex items-start gap-2 group">
                <span className="text-kx-heat font-bold w-5 text-right">{idx + 1}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-kx-text line-clamp-2 group-hover:underline">{post.content || String(post.attributes?.title || CONTENT_TYPE_LABELS[post.content_type || "dynamic"])}</div>
                  <div className="text-xs text-kx-muted mt-0.5">🔥 {compactNumber(post.heat_score)} · {CONTENT_TYPE_LABELS[post.content_type || "dynamic"]}</div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-sm text-kx-muted">{empty}</div>
      )}
    </section>
  );
}
