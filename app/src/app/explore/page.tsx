"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Hash,
  MessageCircle,
  RefreshCw,
  Search,
  TrendingUp,
  UserPlus,
  Eye,
  MapPin,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, Skeleton } from "@/components/design/States";
import {
  DiscoverShortcutGrid,
  getExploreChannelContentTypes,
  getExploreChannelSpec,
  normalizeExploreChannel,
  type ExploreChannelSlug,
} from "@/components/feed/DiscoverShortcuts";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { compactNumber, relativeTime } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import type { KXPost, KXTrendingTopic, KXUser } from "@/lib/types";
import { CONTENT_TYPE_LABELS, showVerifiedBadge } from "@/lib/types";
import {
  popularRegions as allPopularRegions,
  regionFromUser,
  regionHeaderLabel,
  resolveRegion,
  type RegionInfo,
} from "@/lib/regions";
import { Suspense, useEffect, useState } from "react";

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExplorePageSkeleton />}>
      <ExplorePageClient />
    </Suspense>
  );
}

function ExplorePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  const userRegion = regionFromUser(user);
  const currentRegion = regionFromExploreParams(searchParams) || userRegion || resolveRegion("jp.osaka.osaka");
  const selectedChannel = normalizeExploreChannel(searchParams.get("channel"));
  const selectedSpec = getExploreChannelSpec(selectedChannel);
  const selectedContentTypes = getExploreChannelContentTypes(selectedChannel);
  const cityName = currentRegion?.city_name || "本地";

  useEffect(() => {
    if (!selectedChannel) return;
    router.replace(exploreChannelHref(selectedChannel, currentRegion, searchParams), { scroll: false });
  }, [currentRegion, router, searchParams, selectedChannel]);

  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 60_000,
    enabled: true,
  });

  const localHot = useQuery({
    queryKey: ["explore-local-hot", currentRegion?.region_code || "none", selectedChannel || "all"],
    queryFn: () => api.feed("hot", undefined, {
      region_code: currentRegion?.region_code,
      country: currentRegion?.country_code,
      province: currentRegion?.province_code,
      city: currentRegion?.city_code,
      content_type: selectedContentTypes,
    }),
    staleTime: 60_000,
    enabled: !!currentRegion,
  });

  const updateExploreQuery = (next: { region?: RegionInfo; channel?: ExploreChannelSlug }) => {
    const params = new URLSearchParams(searchParams.toString());
    const region = next.region || currentRegion;
    if (region) {
      params.set("city", region.city_code);
      params.set("region", region.region_code);
    }
    if (next.channel) {
      router.push(exploreChannelHref(next.channel, region, params));
      return;
    }
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  };

  const selectChannel = (slug: ExploreChannelSlug) => {
    updateExploreQuery({ channel: slug });
  };

  const persistRegion = async (region: RegionInfo) => {
    setRegionPickerOpen(false);
    updateExploreQuery({ region });
    if (!user) return;
    try {
      const next = await api.updateRegionLanguage({ current_region_code: region.region_code });
      setUser(next);
      localHot.refetch();
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const toggleFollow = async (id: string, current?: boolean) => {
    if (!user) {
      openAuthPrompt("follow");
      return;
    }
    setFollowBusy(id);
    try {
      await api.follow(id, !current);
      trending.refetch();
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("follow");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setFollowBusy(null);
    }
  };

  const topics = prioritizeTopics(trending.data?.topics || [], currentRegion);
  const users = prioritizeUsers((trending.data?.users || []).filter((u) => u.id !== user?.id), currentRegion);

  return (
    <AppShell
      requireAuth={false}
      right={
        <ExploreRightRail
          topics={topics}
          users={users}
          currentRegion={currentRegion}
          onFollow={toggleFollow}
          followBusy={followBusy}
          loading={!trending.data && trending.isLoading}
        />
      }
    >
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label="我的">
              <Avatar user={user} size={44} />
            </Link>
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-kx-md bg-kx-accent text-lg font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
              M
            </span>
          )}
          <h1 className="text-[28px] font-black leading-none tracking-tight text-slate-950 md:text-2xl">发现</h1>
          <button
            type="button"
            onClick={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}
            className="ml-auto inline-flex h-10 items-center gap-1 rounded-full bg-kx-soft px-3 text-xs font-bold text-kx-text transition hover:bg-kx-stroke/40"
            title="切换地区"
          >
            <MapPin className="h-3.5 w-3.5 text-kx-accent" />
            <span className="max-w-[7rem] truncate">{regionHeaderLabel(currentRegion)}</span>
          </button>
          {user ? (
            <Link
              href="/notifications"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-kx-soft transition hover:bg-kx-stroke/40"
              aria-label="通知"
            >
              <Bell className="h-4 w-4 text-kx-text" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-kx-soft transition hover:bg-kx-stroke/40"
              aria-label="通知"
            >
              <Bell className="h-4 w-4 text-kx-text" />
            </button>
          )}
        </div>
        <Link
          href={`/search?city=${encodeURIComponent(currentRegion?.city_code || "")}${selectedChannel ? `&channel=${encodeURIComponent(selectedChannel)}` : ""}`}
          className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 text-sm font-medium text-slate-500 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <Search className="h-4 w-4 text-blue-600" />
          {searchPlaceholder(cityName, selectedChannel)}
        </Link>
      </header>

      <main className="px-3 py-4 sm:px-4">
        <div className="space-y-4">
          <DiscoverShortcutGrid
            region={currentRegion}
            selectedChannel={selectedChannel}
            onSelectChannel={selectChannel}
            getChannelHref={(slug) => exploreChannelHref(slug, currentRegion, searchParams)}
          />

          <LocalHotSection
            title={currentRegion ? `${currentRegion.city_name}热榜` : "本地热榜"}
            subtitle={selectedSpec ? `今天 ${selectedSpec.title} 频道里讨论最多的内容` : "今天本地讨论最多的话题"}
            posts={localHot.data?.items || []}
            loading={localHot.isLoading}
            error={localHot.isError}
            onRetry={() => localHot.refetch()}
          />

          <section className="grid gap-4 xl:hidden">
            <TopicCard topics={topics} currentRegion={currentRegion} loading={!trending.data && trending.isLoading} />
            <RecommendedUsersCard
              users={users}
              currentRegion={currentRegion}
              onFollow={toggleFollow}
              followBusy={followBusy}
              loading={!trending.data && trending.isLoading}
            />
          </section>

          {trending.isError && !trending.data ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white py-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <ErrorState onRetry={() => trending.refetch()} />
            </section>
          ) : null}
        </div>
      </main>

      <RegionPickerDialog
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        onSelect={persistRegion}
        initialCountry={currentRegion?.country_code || user?.country || "jp"}
        allowsAnyCountry={false}
        recentCodes={user?.recent_region_codes}
      />
    </AppShell>
  );
}

function ExplorePageSkeleton() {
  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="mt-3 h-11 w-full rounded-2xl" />
      </header>
      <main className="px-3 py-4 sm:px-4">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-80 w-full rounded-3xl" />
        </div>
      </main>
    </AppShell>
  );
}

function LocalHotSection({
  title,
  subtitle,
  posts,
  loading,
  error,
  onRetry,
}: {
  title: string;
  subtitle: string;
  posts: KXPost[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {error ? (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        ) : null}
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-900">热榜暂时无法加载</p>
          <p className="mt-1 text-sm text-slate-500">网络或服务暂时不可用，请稍后再试。</p>
        </div>
      ) : posts.length ? (
        <ol className="divide-y divide-slate-200/70">
          {posts.slice(0, 8).map((post, idx) => (
            <HotPostItem key={post.id} post={post} rank={idx + 1} />
          ))}
        </ol>
      ) : (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-900">这座城市暂时没有热榜内容</p>
          <p className="mt-1 text-sm text-slate-500">可以切换城市，或稍后回来看看新的本地讨论。</p>
        </div>
      )}
    </section>
  );
}

function HotPostItem({ post, rank }: { post: KXPost; rank: number }) {
  const title = post.content || String(post.attributes?.title || CONTENT_TYPE_LABELS[post.content_type || "dynamic"]);
  return (
    <li>
      <Link href={`/p/${post.id}`} className="group -mx-2 flex items-start gap-3 rounded-2xl px-2 py-3 transition hover:bg-slate-50/80">
        <span className={[
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
          rank <= 3 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500",
        ].join(" ")}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-6 text-slate-900 group-hover:text-blue-700">{title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span className="truncate">@{post.author?.handle || "machi"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">{CONTENT_TYPE_LABELS[post.content_type || "dynamic"]}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {compactNumber(post.comment_count)}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {compactNumber(post.view_count)}</span>
            <span>{relativeTime(post.created_at)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function TopicCard({ topics, currentRegion, loading }: { topics: KXTrendingTopic[]; currentRegion?: RegionInfo; loading?: boolean }) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
          <Hash className="h-4 w-4 text-blue-600" />
          {currentRegion ? `${currentRegion.city_name}话题` : "热门话题"}
        </h3>
        <Link href="/search?kind=topic" className="rounded-full px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50">查看全部</Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded-2xl" />
          <Skeleton className="h-9 w-full rounded-2xl" />
          <Skeleton className="h-9 w-4/5 rounded-2xl" />
        </div>
      ) : (
        <ul className="space-y-1">
          {topics.slice(0, 8).map((topic, idx) => (
            <li key={topic.tag}>
              <Link href={`/t/${encodeURIComponent(topic.tag)}`} className="flex items-center gap-2 rounded-2xl px-2 py-2 transition hover:bg-slate-50/80">
                <span className="w-5 text-right text-xs font-semibold text-slate-400">{idx + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">#{topic.tag}</span>
                <span className="text-xs text-slate-400">{topic.post_count} 帖</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecommendedUsersCard({
  users,
  currentRegion,
  onFollow,
  followBusy,
  loading,
}: {
  users: KXUser[];
  currentRegion?: RegionInfo;
  onFollow: (id: string, current?: boolean) => void;
  followBusy: string | null;
  loading?: boolean;
}) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <h3 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-slate-900">
        <UserPlus className="h-4 w-4 text-blue-600" />
        推荐关注
      </h3>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-5/6 rounded-2xl" />
        </div>
      ) : (
        <ul className="space-y-3">
          {users.slice(0, 6).map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 rounded-2xl transition hover:bg-slate-50/80">
              <Avatar user={u} size={38} href={`/u/${u.handle}`} />
              <div className="min-w-0 flex-1 py-1">
                <Link href={`/u/${u.handle}`} className="flex items-center gap-1 truncate text-sm font-semibold text-slate-900 hover:text-blue-700">
                  {u.display_name}
                  {showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                </Link>
                <div className="truncate text-xs text-slate-400">{recommendReason(u, currentRegion)}</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                onClick={() => onFollow(u.id, u.is_following)}
                disabled={followBusy === u.id}
              >
                {u.is_following ? "已关注" : "关注"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExploreRightRail({
  topics,
  users,
  currentRegion,
  onFollow,
  followBusy,
  loading,
}: {
  topics: KXTrendingTopic[];
  users: KXUser[];
  currentRegion?: RegionInfo;
  onFollow: (id: string, current?: boolean) => void;
  followBusy: string | null;
  loading?: boolean;
}) {
  return (
    <>
      <TopicCard topics={topics} currentRegion={currentRegion} loading={loading} />
      <RecommendedUsersCard
        users={users}
        currentRegion={currentRegion}
        onFollow={onFollow}
        followBusy={followBusy}
        loading={loading}
      />
    </>
  );
}

function HotListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="flex gap-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function regionFromExploreParams(params: { get(name: string): string | null }): RegionInfo | undefined {
  const regionParam = params.get("region");
  const cityParam = params.get("city");
  if (regionParam) {
    const region = resolveRegion(regionParam);
    if (region) return region;
  }
  if (!cityParam) return undefined;
  const candidate = cityParam.toLowerCase();
  if (candidate.includes(".")) return resolveRegion(candidate);
  return allPopularRegions().find((region) => region.city_code === candidate || region.city_name.toLowerCase() === candidate);
}

function searchPlaceholder(cityName: string, selectedChannel?: ExploreChannelSlug) {
  switch (selectedChannel) {
    case "housing":
      return `搜索${cityName}租房、合租、房源、区域...`;
    case "jobs":
    case "recruiting":
    case "referral":
      return `搜索${cityName}兼职、正社员、招聘、内推...`;
    case "food":
      return `搜索${cityName}约饭、咖啡、探店、饭搭子...`;
    case "guide":
      return `搜索${cityName}攻略、手续、银行卡、生活经验...`;
    default:
      return `搜索${cityName}的租房、工作、约饭、攻略...`;
  }
}

function exploreChannelHref(slug: ExploreChannelSlug, region: RegionInfo | undefined, sourceParams: URLSearchParams | { toString(): string }) {
  const params = new URLSearchParams(sourceParams.toString());
  params.delete("channel");
  params.delete("v");
  if (region) {
    params.set("city", region.city_code);
    params.set("region", region.region_code);
  }
  const query = params.toString();
  return `/explore/${slug}${query ? `?${query}` : ""}`;
}

function prioritizeTopics(topics: KXTrendingTopic[], region?: RegionInfo) {
  const city = region?.city_name || "";
  const cityCode = region?.city_code || "";
  return [...topics].sort((a, b) => topicScore(b, city, cityCode) - topicScore(a, city, cityCode));
}

function topicScore(topic: KXTrendingTopic, cityName: string, cityCode: string) {
  const tag = topic.tag.toLowerCase();
  let score = topic.post_count || 0;
  if (cityName && topic.tag.includes(cityName)) score += 1000;
  if (cityCode && tag.includes(cityCode)) score += 800;
  return score;
}

function prioritizeUsers(users: KXUser[], region?: RegionInfo) {
  return [...users].sort((a, b) => userScore(b, region) - userScore(a, region));
}

function userScore(user: KXUser, region?: RegionInfo) {
  const haystack = `${user.display_name} ${user.handle} ${user.city || ""} ${user.current_region_code || ""}`.toLowerCase();
  const cityCode = region?.city_code || "";
  const cityName = region?.city_name || "";
  let score = user.follower_count || 0;
  if (cityCode && haystack.includes(cityCode)) score += 1000;
  if (cityName && haystack.includes(cityName.toLowerCase())) score += 1000;
  if (/(job|work|hire|招聘|兼职|岗位)/i.test(haystack)) score += 80;
  return score;
}

function recommendReason(user: KXUser, region?: RegionInfo) {
  const haystack = `${user.display_name} ${user.handle}`.toLowerCase();
  if (/(job|work|hire|招聘|兼职|岗位)/i.test(haystack)) return "招聘 / 兼职 / 本地岗位";
  if (/(food|dining|饭|咖啡|美食)/i.test(haystack)) return "约饭 / 探店 / 本地生活";
  if (/(room|rent|house|租房|房源)/i.test(haystack)) return "租房 / 合租 / 区域经验";
  return region ? `${region.city_name}本地内容` : "本地内容与城市讨论";
}
