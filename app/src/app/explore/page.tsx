"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  MessageCircle,
  RefreshCw,
  Search,
  TrendingUp,
  Eye,
  ChevronDown,
  Flame,
  Hash,
  Users,
  Compass,
  MapPin,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/design/Avatar";
import { Skeleton } from "@/components/design/States";
import {
  DiscoverShortcutGrid,
  normalizeExploreChannel,
  type ExploreChannelSlug,
} from "@/components/feed/DiscoverShortcuts";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { compactNumber, relativeTime } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import type { KXPost, KXTrendingTopic, KXUser } from "@/lib/types";
import { CONTENT_TYPE_LABELS } from "@/lib/types";
import {
  popularRegions as allPopularRegions,
  regionAccountPatch,
  regionFromUser,
  regionHeaderLabel,
  resolveRegion,
  type RegionInfo,
} from "@/lib/regions";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";

type ExplorePanel = "recommend" | "hot" | "topics" | "users";
type HotScope = "city" | "country";

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
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [activePanel, setActivePanel] = useState<ExplorePanel>("recommend");
  const [hotScope, setHotScope] = useState<HotScope>("city");

  const userRegion = regionFromUser(user);
  const currentRegion = regionFromExploreParams(searchParams) || userRegion || resolveRegion("jp.tokyo.tokyo");
  const selectedChannel = normalizeExploreChannel(searchParams.get("channel"));
  const cityName = currentRegion?.city_name || "本地";

  useEffect(() => {
    if (!selectedChannel) return;
    router.replace(exploreChannelHref(selectedChannel, currentRegion, searchParams), { scroll: false });
  }, [currentRegion, router, searchParams, selectedChannel]);

  const cityHot = useQuery({
    queryKey: ["explore-weekly-hot", "city", currentRegion?.region_code || "none"],
    queryFn: () => api.trendingWeeklyLikes({
      days: 7,
      limit: 12,
      region_code: currentRegion?.region_code,
      country: currentRegion?.country_code,
      province: currentRegion?.province_code,
      city: currentRegion?.city_code,
    }),
    staleTime: 60_000,
    enabled: !!currentRegion,
  });

  const countryHot = useQuery({
    queryKey: ["explore-weekly-hot", "country", currentRegion?.country_code || "none"],
    queryFn: () => api.trendingWeeklyLikes({ days: 7, limit: 10, country: currentRegion?.country_code }),
    staleTime: 120_000,
    enabled: !!currentRegion,
  });

  const trending = useQuery({
    queryKey: ["explore-trending"],
    queryFn: () => api.trending(),
    staleTime: 120_000,
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
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      cityHot.refetch();
      countryHot.refetch();
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const selectedHotQuery = hotScope === "country" ? countryHot : cityHot;
  const hotTitle = hotScope === "country"
    ? `${currentRegion?.country_name || "当前国家"}热榜`
    : `${currentRegion?.city_name || "本地"}热榜`;

  const goToSearch = (value: string) => {
    const q = value.trim();
    if (!q) return;
    const params = new URLSearchParams();
    params.set("q", q);
    if (currentRegion?.city_code) params.set("city", currentRegion.city_code);
    if (selectedChannel) params.set("channel", selectedChannel);
    router.push(`/search?${params.toString()}`);
  };

  const submitSearch = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const formValue = event ? String(new FormData(event.currentTarget).get("q") || "") : "";
    goToSearch(formValue || searchDraft);
  };

  return (
    <AppShell
      requireAuth={false}
      right={
        <ExploreTrendsRail
          region={currentRegion}
          hotPosts={cityHot.data?.items || cityHot.data?.posts || []}
          hotLoading={cityHot.isLoading}
          topics={trending.data?.topics || []}
          users={trending.data?.users || []}
          trendLoading={trending.isLoading}
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
          <h1 className="text-[28px] font-black leading-none tracking-tight text-kx-text md:text-2xl">发现</h1>
          <button
            type="button"
            onClick={() => setRegionPickerOpen(true)}
            className="ml-auto inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-card/[0.92] px-3 text-sm font-black text-kx-text shadow-[0_14px_34px_-26px_rgba(37,99,235,0.75)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/35"
            title="切换地区"
          >
            <span className="max-w-[7.5rem] truncate">{regionHeaderLabel(currentRegion)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-kx-muted" />
          </button>
          {user ? (
            <Link
              href="/notifications"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-kx-card/[0.92] text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60"
              aria-label="通知"
            >
              <Bell className="h-[18px] w-[18px] text-kx-text" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-kx-card/[0.92] text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60"
              aria-label="通知"
            >
              <Bell className="h-[18px] w-[18px] text-kx-text" />
            </button>
          )}
        </div>
        <form onSubmit={submitSearch} className="mt-3 flex items-center gap-2">
          <label className="group flex min-h-12 flex-1 items-center gap-3 rounded-full border border-kx-accent/[0.18] bg-kx-card/[0.92] px-3.5 text-sm font-semibold text-kx-subtle shadow-[0_14px_34px_-28px_rgba(17,22,34,0.62)] ring-1 ring-white/40 transition focus-within:border-kx-accent/[0.38] focus-within:ring-2 focus-within:ring-kx-accent/20 dark:ring-white/10">
            <Search className="h-5 w-5 shrink-0 text-kx-accent" />
            <input
              name="q"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                goToSearch(event.currentTarget.value);
              }}
              placeholder={searchPlaceholder(cityName, selectedChannel)}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-kx-text placeholder:text-kx-muted focus:outline-none"
            />
          </label>
          {searchDraft.trim() ? (
            <button type="submit" className="h-10 rounded-full bg-kx-accent px-4 text-sm font-black text-white shadow-[0_14px_30px_-22px_rgba(37,99,235,0.85)] transition hover:bg-blue-700">
              搜索
            </button>
          ) : null}
        </form>
      </header>

      <main className="px-3 py-4 sm:px-4">
        <div className="space-y-4">
          <DiscoverShortcutGrid
            selectedChannel={selectedChannel}
            onSelectChannel={selectChannel}
            getChannelHref={(slug) => exploreChannelHref(slug, currentRegion, searchParams)}
          />
          <ExploreFeedHub
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            currentRegion={currentRegion}
            happeningPosts={trending.data?.posts || []}
            hotScope={hotScope}
            onHotScopeChange={setHotScope}
            hotTitle={hotTitle}
            hotPosts={selectedHotQuery.data?.items || selectedHotQuery.data?.posts || []}
            hotLoading={selectedHotQuery.isLoading}
            hotError={selectedHotQuery.isError}
            onHotRetry={() => selectedHotQuery.refetch()}
            topics={trending.data?.topics || []}
            users={trending.data?.users || []}
            trendLoading={trending.isLoading}
            trendError={trending.isError}
            onTrendRetry={() => trending.refetch()}
          />
        </div>
      </main>

      <RegionPickerDialog
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        onSelect={persistRegion}
        initialCountry={currentRegion?.country_code || user?.country || "jp"}
        allowsAnyCountry={false}
      />
    </AppShell>
  );
}

function ExploreFeedHub({
  activePanel,
  onPanelChange,
  currentRegion,
  happeningPosts,
  hotScope,
  onHotScopeChange,
  hotTitle,
  hotPosts,
  hotLoading,
  hotError,
  onHotRetry,
  topics,
  users,
  trendLoading,
  trendError,
  onTrendRetry,
}: {
  activePanel: ExplorePanel;
  onPanelChange: (panel: ExplorePanel) => void;
  currentRegion?: RegionInfo;
  happeningPosts: KXPost[];
  hotScope: HotScope;
  onHotScopeChange: (scope: HotScope) => void;
  hotTitle: string;
  hotPosts: KXPost[];
  hotLoading?: boolean;
  hotError?: boolean;
  onHotRetry: () => void;
  topics: KXTrendingTopic[];
  users: KXUser[];
  trendLoading?: boolean;
  trendError?: boolean;
  onTrendRetry: () => void;
}) {
  return (
    <section className="kx-discover-panel">
      <div className="kx-discover-panel-header">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-kx-text px-3 py-1 text-[11px] font-black text-kx-card shadow-kx">
              <Compass className="h-3.5 w-3.5" />
              城市动态
            </div>
            <h2 className="mt-3 text-[22px] font-black leading-tight text-kx-text">正在发生、热榜、话题和用户推荐</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-kx-subtle">
              首页同城推文与趋势内容都在这里，范围可在当前城市与当前国家之间切换。
            </p>
          </div>
          <ExplorePanelTabs active={activePanel} onChange={onPanelChange} />
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {activePanel === "recommend" ? (
          <HappeningSection
            title={`${currentRegion?.city_name || "本地"}正在发生`}
            posts={happeningPosts}
            loading={trendLoading}
            error={trendError}
            onRetry={onTrendRetry}
          />
        ) : null}
        {activePanel === "hot" ? (
          <LocalHotSection
            title={hotTitle}
            subtitle="按最近 7 天点赞热度排序，可在当前城市和当前国家之间切换。"
            posts={hotPosts}
            loading={hotLoading}
            error={hotError}
            onRetry={onHotRetry}
            scope={hotScope}
            onScopeChange={onHotScopeChange}
            region={currentRegion}
          />
        ) : null}
        {activePanel === "topics" ? (
          <TopicBoard topics={topics} loading={trendLoading} error={trendError} onRetry={onTrendRetry} />
        ) : null}
        {activePanel === "users" ? (
          <UserBoard users={users} loading={trendLoading} error={trendError} onRetry={onTrendRetry} />
        ) : null}
      </div>
    </section>
  );
}

function ExplorePanelTabs({ active, onChange }: { active: ExplorePanel; onChange: (panel: ExplorePanel) => void }) {
  const tabs: Array<{ key: ExplorePanel; label: string; icon: typeof Compass }> = [
    { key: "recommend", label: "正在发生", icon: Compass },
    { key: "hot", label: "热榜", icon: Flame },
    { key: "topics", label: "话题", icon: Hash },
    { key: "users", label: "用户推荐", icon: Users },
  ];
  return (
    <div className="kx-discover-tabset">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          data-active={active === key}
          className="kx-discover-tab"
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function HappeningSection({
  title,
  posts,
  loading,
  error,
  onRetry,
}: {
  title: string;
  posts: KXPost[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-black text-kx-text">
            <Compass className="h-4 w-4 text-kx-accent" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">来自首页信息流的同城推文，优先展示近期有互动的真实内容。</p>
        </div>
        {error ? (
          <button type="button" onClick={onRetry} className="kx-button-ghost h-9 shrink-0 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        ) : null}
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title="正在发生暂时无法加载" onRetry={onRetry} />
      ) : posts.length ? (
        <ol className="divide-y divide-kx-stroke/35">
          {posts.slice(0, 8).map((post, idx) => (
            <HotPostItem key={post.id} post={post} rank={idx + 1} />
          ))}
        </ol>
      ) : (
        <EmptyBoard title="暂时没有新的同城动态" subtitle="发布真实经验、问答或生活信息后，这里会自动出现新的内容。" />
      )}
    </section>
  );
}

function ExplorePageSkeleton() {
  return (
    <AppShell requireAuth={false} right={null}>
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
  scope,
  onScopeChange,
  region,
}: {
  title: string;
  subtitle: string;
  posts: KXPost[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  scope: HotScope;
  onScopeChange: (scope: HotScope) => void;
  region?: RegionInfo;
}) {
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-black text-kx-text">
            <TrendingUp className="h-4 w-4 text-kx-accent" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HotScopeTabs scope={scope} onChange={onScopeChange} region={region} />
          {error ? (
            <button type="button" onClick={onRetry} className="kx-button-ghost h-9 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              重新加载
            </button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">热榜暂时无法加载</p>
          <p className="mt-1 text-sm text-kx-subtle">网络或服务暂时不可用，请稍后再试。</p>
        </div>
      ) : posts.length ? (
        <ol className="divide-y divide-kx-stroke/35">
          {posts.slice(0, 8).map((post, idx) => (
            <HotPostItem key={post.id} post={post} rank={idx + 1} />
          ))}
        </ol>
      ) : (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">这座城市暂时没有热榜内容</p>
          <p className="mt-1 text-sm text-kx-subtle">可以切换城市，或稍后回来看看新的本地讨论。</p>
        </div>
      )}
    </section>
  );
}

function HotScopeTabs({ scope, onChange, region }: { scope: HotScope; onChange: (scope: HotScope) => void; region?: RegionInfo }) {
  const options: Array<{ key: HotScope; label: string }> = [
    { key: "city", label: region?.city_name || "本地" },
    { key: "country", label: region?.country_name || "当前国家" },
  ];
  return (
    <div className="inline-flex rounded-full border border-kx-stroke/45 bg-kx-soft/70 p-1">
      {options.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={[
            "inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-black transition",
            scope === item.key ? "bg-kx-card text-kx-accent shadow-sm ring-1 ring-kx-accent/20" : "text-kx-subtle hover:text-kx-text",
          ].join(" ")}
        >
          {item.key === "city" ? <MapPin className="h-3.5 w-3.5" /> : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HotPostItem({ post, rank }: { post: KXPost; rank: number }) {
  const title = post.content || String(post.attributes?.title || CONTENT_TYPE_LABELS[post.content_type || "dynamic"]);
  return (
    <li>
      <Link href={`/p/${post.id}`} className="group kx-discover-row -mx-2 flex items-start gap-3 px-2 py-3">
        <span className={[
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
          rank <= 3 ? "bg-kx-accentSoft text-kx-accent" : "bg-kx-soft text-kx-muted",
        ].join(" ")}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-6 text-kx-text group-hover:text-kx-accent">{title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kx-muted">
            <span className="truncate">@{post.author?.handle || "machi"}</span>
            <span className="rounded-full bg-kx-soft px-2 py-0.5 font-medium text-kx-subtle">{CONTENT_TYPE_LABELS[post.content_type || "dynamic"]}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {compactNumber(post.comment_count)}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {compactNumber(post.view_count)}</span>
            <span>{relativeTime(post.created_at)}</span>
          </div>
        </div>
      </Link>
    </li>
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

function TopicBoard({ topics, loading, error, onRetry }: { topics: KXTrendingTopic[]; loading?: boolean; error?: boolean; onRetry: () => void }) {
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-black text-kx-text">
            <Hash className="h-4 w-4 text-kx-accent" />
            话题趋势
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">最近被反复提到的话题，适合快速进入同城讨论。</p>
        </div>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title="话题暂时无法加载" onRetry={onRetry} />
      ) : topics.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {topics.slice(0, 12).map((topic, idx) => (
            <Link
              key={topic.tag}
              href={`/t/${encodeURIComponent(topic.tag)}`}
              className="group flex min-h-14 items-center gap-3 rounded-kx-md border border-kx-stroke/45 bg-kx-card/[0.72] px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-kx-accent/35 hover:bg-kx-accentSoft/35"
            >
              <span className={["grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black", idx < 3 ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted"].join(" ")}>
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-kx-text group-hover:text-kx-accent">#{topic.tag}</span>
                <span className="text-xs font-semibold text-kx-muted">{compactNumber(topic.post_count)} 帖</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyBoard title="暂时没有话题趋势" subtitle="等更多真实讨论出现后，这里会自动更新。" />
      )}
    </section>
  );
}

function UserBoard({ users, loading, error, onRetry }: { users: KXUser[]; loading?: boolean; error?: boolean; onRetry: () => void }) {
  return (
    <section className="kx-discover-section">
      <div className="mb-4">
        <h2 className="inline-flex items-center gap-2 text-lg font-black text-kx-text">
          <Users className="h-4 w-4 text-kx-accent" />
          值得关注的用户
        </h2>
        <p className="mt-1 text-sm text-kx-subtle">优先展示真实活跃、对城市内容有贡献的用户和账号。</p>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title="用户推荐暂时无法加载" onRetry={onRetry} />
      ) : users.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {users.slice(0, 10).map((target) => (
            <Link
              key={target.id}
              href={`/u/${target.handle}`}
              className="group flex min-h-16 items-center gap-3 rounded-kx-md border border-kx-stroke/45 bg-kx-card/[0.72] p-3 transition hover:-translate-y-0.5 hover:border-kx-accent/35 hover:bg-kx-accentSoft/35"
            >
              <Avatar user={target} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-kx-text group-hover:text-kx-accent">{target.display_name}</span>
                <span className="block truncate text-xs font-semibold text-kx-muted">@{target.handle}</span>
              </span>
              <span className="rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-black text-kx-subtle">
                {compactNumber(target.total_heat || target.post_count || 0)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyBoard title="暂时没有推荐用户" subtitle="当用户开始发布高质量内容后，这里会出现更可信的推荐。" />
      )}
    </section>
  );
}

function RetryState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="kx-discover-state">
      <p className="text-sm font-semibold text-kx-text">{title}</p>
      <button type="button" onClick={onRetry} className="kx-button-primary mt-3 h-9 text-xs">
        <RefreshCw className="h-3.5 w-3.5" />
        重新加载
      </button>
    </div>
  );
}

function EmptyBoard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="kx-discover-state">
      <p className="text-sm font-semibold text-kx-text">{title}</p>
      <p className="mt-1 text-sm text-kx-subtle">{subtitle}</p>
    </div>
  );
}

// Persistent right rail for desktop (xl+): always-visible trends so the
// discovery hub no longer strands ~470px of empty space. Reuses data the
// page already fetched — no extra network calls.
function ExploreTrendsRail({
  region,
  hotPosts,
  hotLoading,
  topics,
  users,
  trendLoading,
}: {
  region?: RegionInfo;
  hotPosts: KXPost[];
  hotLoading?: boolean;
  topics: KXTrendingTopic[];
  users: KXUser[];
  trendLoading?: boolean;
}) {
  const cityName = region?.city_name || "本地";
  return (
    <div className="space-y-3.5 pt-1.5">
      <RailCard
        title={`${cityName}热榜`}
        icon={<Flame className="h-4 w-4 text-orange-500" />}
        badge="近 7 天"
      >
        {hotLoading ? (
          <RailSkeleton rows={4} />
        ) : hotPosts.length ? (
          <ol className="space-y-0.5">
            {hotPosts.slice(0, 5).map((post, idx) => (
              <RailHotItem key={post.id} post={post} rank={idx + 1} />
            ))}
          </ol>
        ) : (
          <RailEmpty text="这座城市暂时还没有热榜内容。" />
        )}
      </RailCard>

      <RailCard
        title="热门话题"
        icon={<Hash className="h-4 w-4 text-blue-600" />}
        action={{ label: "更多", href: "/search?kind=topic" }}
      >
        {trendLoading ? (
          <RailSkeleton rows={5} />
        ) : topics.length ? (
          <ol className="space-y-0.5">
            {topics.slice(0, 7).map((topic, idx) => (
              <li key={topic.tag}>
                <Link
                  href={`/t/${encodeURIComponent(topic.tag)}`}
                  className="group kx-discover-row flex items-center gap-2.5 px-1.5 py-1.5"
                >
                  <span className={railRankChip(idx)}>{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-kx-text group-hover:text-kx-accent">#{topic.tag}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-kx-muted">{compactNumber(topic.post_count)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <RailEmpty text="还没有足够的讨论形成话题趋势。" />
        )}
      </RailCard>

      <RailCard
        title="推荐关注"
        icon={<Users className="h-4 w-4 text-violet-600" />}
      >
        {trendLoading ? (
          <RailSkeleton rows={4} />
        ) : users.length ? (
          <ul className="space-y-0.5">
            {users.slice(0, 5).map((target) => (
              <li key={target.id}>
                <Link
                  href={`/u/${target.handle}`}
                  className="group kx-discover-row flex items-center gap-2.5 px-1.5 py-1.5"
                >
                  <Avatar user={target} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-kx-text group-hover:text-kx-accent">{target.display_name}</span>
                    <span className="block truncate text-[11px] text-kx-muted">@{target.handle}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-kx-soft px-2 py-0.5 text-[10px] font-black text-kx-subtle">
                    {compactNumber(target.total_heat || target.post_count || 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <RailEmpty text="活跃用户出现后，这里会给出推荐。" />
        )}
      </RailCard>
    </div>
  );
}

function RailCard({
  title,
  icon,
  badge,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge?: string;
  action?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <section className="kx-discover-section p-3.5 sm:p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-black text-kx-text">
          {icon}
          {title}
        </h3>
        {badge ? (
          <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[10px] font-black text-kx-subtle">{badge}</span>
        ) : action ? (
          <Link href={action.href} className="text-[11px] font-bold text-kx-muted transition hover:text-kx-accent">{action.label}</Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function RailHotItem({ post, rank }: { post: KXPost; rank: number }) {
  const title = post.content || String(post.attributes?.title || CONTENT_TYPE_LABELS[post.content_type || "dynamic"]);
  return (
    <li>
      <Link href={`/p/${post.id}`} className="group kx-discover-row flex items-start gap-2.5 px-1.5 py-1.5">
        <span className={railRankChip(rank - 1)}>{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-[13px] font-bold leading-5 text-kx-text group-hover:text-kx-accent">{title}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-kx-muted">
            <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{compactNumber(post.comment_count)}</span>
            <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{compactNumber(post.view_count)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function railRankChip(idx: number) {
  return [
    "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-black",
    idx < 3 ? "bg-kx-heat/10 text-kx-heat" : "bg-kx-soft text-kx-muted",
  ].join(" ");
}

function RailSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center gap-2.5">
          <Skeleton className="h-5 w-5 rounded-md" />
          <Skeleton className="h-3.5 flex-1 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function RailEmpty({ text }: { text: string }) {
  return <p className="px-1.5 py-2 text-xs leading-5 text-kx-muted">{text}</p>;
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
      return `搜索${cityName}兼职、正社员、招聘、内推...`;
    case "market":
      return `搜索${cityName}二手、搬家出清、免费送、求购...`;
    case "services":
      return `搜索${cityName}翻译、手续、接机、本地服务...`;
    case "groups":
      return `搜索${cityName}Food meetup、语言交换、本地小组...`;
    case "guide":
      return `搜索${cityName}攻略、手续、银行卡、生活经验...`;
    default:
      return "搜索用户、话题和本地动态…";
  }
}

function exploreChannelHref(slug: ExploreChannelSlug, region: RegionInfo | undefined, sourceParams: URLSearchParams | { toString(): string }) {
  const city = region?.city_code || "tokyo";
  if (slug === "market") return `/cities/${encodeURIComponent(city)}/marketplace`;
  if (slug === "housing") return `/cities/${encodeURIComponent(city)}/rentals`;
  if (slug === "jobs") return `/cities/${encodeURIComponent(city)}/jobs`;
  if (slug === "services") return `/cities/${encodeURIComponent(city)}/services`;
  if (slug === "deals") return `/cities/${encodeURIComponent(city)}/deals`;
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
