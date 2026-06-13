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
import { useI18n, type Locale } from "@/lib/i18n";
import { getChannelTitle } from "@/config/channels";
import {
  countryName as localizedCountryName,
  popularRegions as allPopularRegions,
  regionAccountPatch,
  regionFromUser,
  regionHeaderLabel,
  regionShortLabel,
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
  const { locale } = useI18n();
  const copy = exploreCopy(locale);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [activePanel, setActivePanel] = useState<ExplorePanel>("recommend");
  const [hotScope, setHotScope] = useState<HotScope>("city");

  const userRegion = regionFromUser(user);
  const currentRegion = regionFromExploreParams(searchParams) || userRegion || resolveRegion("jp.tokyo.tokyo");
  const selectedChannel = normalizeExploreChannel(searchParams.get("channel"));
  const cityName = currentRegion ? regionShortLabel(currentRegion, locale) : copy.local;
  const currentCountryName = currentRegion ? localizedCountryName(currentRegion.country_code, locale) : copy.currentCountry;

  useEffect(() => {
    if (!selectedChannel) return;
    router.replace(exploreChannelHref(selectedChannel, currentRegion, searchParams), { scroll: false });
  }, [currentRegion, router, searchParams, selectedChannel]);

  const happening = useQuery({
    queryKey: ["explore-happening", currentRegion?.region_code || "none"],
    queryFn: () => api.exploreHappening({
      limit: 14,
      region_code: currentRegion?.region_code,
      country: currentRegion?.country_code,
      province: currentRegion?.province_code,
      city: currentRegion?.city_code,
    }),
    staleTime: 60_000,
    enabled: !!currentRegion,
  });

  const cityHot = useQuery({
    queryKey: ["explore-hot", "city", currentRegion?.region_code || "none"],
    queryFn: () => api.exploreHot({
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
    queryKey: ["explore-hot", "country", currentRegion?.country_code || "none"],
    queryFn: () => api.exploreHot({ limit: 10, country: currentRegion?.country_code }),
    staleTime: 120_000,
    enabled: !!currentRegion,
  });

  const exploreTopics = useQuery({
    queryKey: ["explore-topics", currentRegion?.region_code || "none"],
    queryFn: () => api.exploreTopics({
      limit: 30,
      region_code: currentRegion?.region_code,
      country: currentRegion?.country_code,
      province: currentRegion?.province_code,
      city: currentRegion?.city_code,
    }),
    staleTime: 120_000,
    enabled: !!currentRegion,
  });

  const trending = useQuery({
    queryKey: ["explore-recommended-users"],
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
      happening.refetch();
      cityHot.refetch();
      countryHot.refetch();
      exploreTopics.refetch();
      pushToast({ kind: "success", message: copy.switched(regionShortLabel(region, locale)) });
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
    ? copy.hotTitle(currentCountryName)
    : copy.hotTitle(cityName);

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
	          topics={exploreTopics.data?.topics || []}
	          users={trending.data?.users || []}
	          trendLoading={trending.isLoading || exploreTopics.isLoading}
	        />
	      }
    >
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label={copy.profileAria}>
              <Avatar user={user} size={44} />
            </Link>
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-kx-md bg-kx-accent text-lg font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
              M
            </span>
          )}
          <h1 className="text-[28px] font-black leading-none tracking-tight text-kx-text md:text-2xl">{copy.pageTitle}</h1>
          <button
            type="button"
            onClick={() => setRegionPickerOpen(true)}
            className="ml-auto inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-card/[0.92] px-3 text-sm font-black text-kx-text shadow-[0_14px_34px_-26px_rgba(37,99,235,0.75)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/35"
            title={copy.switchRegion}
          >
            <span className="max-w-[7.5rem] truncate">{regionHeaderLabel(currentRegion, locale)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-kx-muted" />
          </button>
          {user ? (
            <Link
              href="/notifications"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-kx-card/[0.92] text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60"
              aria-label={copy.notifications}
            >
              <Bell className="h-[18px] w-[18px] text-kx-text" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-kx-card/[0.92] text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60"
              aria-label={copy.notifications}
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
              placeholder={searchPlaceholder(cityName, selectedChannel, locale)}
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-kx-text placeholder:text-kx-muted focus:outline-none"
            />
          </label>
          {searchDraft.trim() ? (
            <button type="submit" className="h-10 rounded-full bg-kx-accent px-4 text-sm font-black text-white shadow-[0_14px_30px_-22px_rgba(37,99,235,0.85)] transition hover:bg-blue-700">
              {copy.search}
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
	            happeningPosts={happening.data?.items || happening.data?.posts || []}
	            happeningLoading={happening.isLoading}
	            happeningError={happening.isError}
	            onHappeningRetry={() => happening.refetch()}
	            hotScope={hotScope}
	            onHotScopeChange={setHotScope}
	            hotTitle={hotTitle}
	            hotPosts={selectedHotQuery.data?.items || selectedHotQuery.data?.posts || []}
	            hotLoading={selectedHotQuery.isLoading}
	            hotError={selectedHotQuery.isError}
	            onHotRetry={() => selectedHotQuery.refetch()}
	            topics={exploreTopics.data?.topics || []}
	            topicLoading={exploreTopics.isLoading}
	            topicError={exploreTopics.isError}
	            onTopicRetry={() => exploreTopics.refetch()}
	            users={trending.data?.users || []}
	            userLoading={trending.isLoading}
	            userError={trending.isError}
	            onUserRetry={() => trending.refetch()}
	            locale={locale}
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
  happeningLoading,
  happeningError,
  onHappeningRetry,
  hotScope,
  onHotScopeChange,
  hotTitle,
  hotPosts,
  hotLoading,
  hotError,
  onHotRetry,
  topics,
  topicLoading,
  topicError,
  onTopicRetry,
  users,
  userLoading,
  userError,
  onUserRetry,
  locale,
}: {
  activePanel: ExplorePanel;
  onPanelChange: (panel: ExplorePanel) => void;
  currentRegion?: RegionInfo;
  happeningPosts: KXPost[];
  happeningLoading?: boolean;
  happeningError?: boolean;
  onHappeningRetry: () => void;
  hotScope: HotScope;
  onHotScopeChange: (scope: HotScope) => void;
  hotTitle: string;
  hotPosts: KXPost[];
  hotLoading?: boolean;
  hotError?: boolean;
  onHotRetry: () => void;
  topics: KXTrendingTopic[];
  topicLoading?: boolean;
  topicError?: boolean;
  onTopicRetry: () => void;
  users: KXUser[];
  userLoading?: boolean;
  userError?: boolean;
  onUserRetry: () => void;
  locale: Locale;
}) {
  const copy = exploreCopy(locale);
  const cityName = currentRegion ? regionShortLabel(currentRegion, locale) : copy.local;
  return (
    <section className="kx-discover-panel">
      <div className="kx-discover-panel-header">
        <ExplorePanelTabs active={activePanel} onChange={onPanelChange} locale={locale} />
      </div>

      <div className="p-3 sm:p-4">
        {activePanel === "recommend" ? (
	          <HappeningSection
	            title={copy.happeningTitle(cityName)}
	            posts={happeningPosts}
	            loading={happeningLoading}
	            error={happeningError}
	            onRetry={onHappeningRetry}
	            locale={locale}
	          />
        ) : null}
        {activePanel === "hot" ? (
          <LocalHotSection
            title={hotTitle}
            subtitle={copy.hotSubtitle}
            posts={hotPosts}
            loading={hotLoading}
            error={hotError}
            onRetry={onHotRetry}
            scope={hotScope}
            onScopeChange={onHotScopeChange}
            region={currentRegion}
            locale={locale}
          />
        ) : null}
        {activePanel === "topics" ? (
	          <TopicBoard topics={topics} loading={topicLoading} error={topicError} onRetry={onTopicRetry} locale={locale} />
	        ) : null}
	        {activePanel === "users" ? (
	          <UserBoard users={users} loading={userLoading} error={userError} onRetry={onUserRetry} locale={locale} />
	        ) : null}
      </div>
    </section>
  );
}

function ExplorePanelTabs({ active, onChange, locale }: { active: ExplorePanel; onChange: (panel: ExplorePanel) => void; locale: Locale }) {
  const copy = exploreCopy(locale);
  const tabs: Array<{ key: ExplorePanel; label: string; icon: typeof Compass }> = [
    { key: "recommend", label: copy.tabRecommend, icon: Compass },
    { key: "hot", label: copy.tabHot, icon: Flame },
    { key: "topics", label: copy.tabTopics, icon: Hash },
    { key: "users", label: copy.tabUsers, icon: Users },
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
  locale,
}: {
  title: string;
  posts: KXPost[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  locale: Locale;
}) {
  const copy = exploreCopy(locale);
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-[17px] font-extrabold text-kx-text/90">
            <Compass className="h-4 w-4 text-kx-accent" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">{copy.happeningSubtitle}</p>
        </div>
        {error ? (
          <button type="button" onClick={onRetry} className="kx-button-ghost h-9 shrink-0 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.reload}
          </button>
        ) : null}
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title={copy.happeningError} onRetry={onRetry} locale={locale} />
      ) : posts.length ? (
        <ol className="divide-y divide-kx-stroke/35">
          {posts.slice(0, 8).map((post, idx) => (
            <HotPostItem key={post.id} post={post} rank={idx + 1} locale={locale} />
          ))}
        </ol>
      ) : (
        <EmptyBoard title={copy.happeningEmptyTitle} subtitle={copy.happeningEmptySubtitle} />
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
  locale,
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
  locale: Locale;
}) {
  const copy = exploreCopy(locale);
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-[17px] font-extrabold text-kx-text/90">
            <TrendingUp className="h-4 w-4 text-kx-accent" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HotScopeTabs scope={scope} onChange={onScopeChange} region={region} locale={locale} />
          {error ? (
            <button type="button" onClick={onRetry} className="kx-button-ghost h-9 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              {copy.reload}
            </button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">{copy.hotErrorTitle}</p>
          <p className="mt-1 text-sm text-kx-subtle">{copy.hotErrorSubtitle}</p>
        </div>
      ) : posts.length ? (
        <ol className="divide-y divide-kx-stroke/35">
          {posts.slice(0, 8).map((post, idx) => (
            <HotPostItem key={post.id} post={post} rank={idx + 1} locale={locale} />
          ))}
        </ol>
      ) : (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">{copy.hotEmptyTitle}</p>
          <p className="mt-1 text-sm text-kx-subtle">{copy.hotEmptySubtitle}</p>
        </div>
      )}
    </section>
  );
}

function HotScopeTabs({ scope, onChange, region, locale }: { scope: HotScope; onChange: (scope: HotScope) => void; region?: RegionInfo; locale: Locale }) {
  const copy = exploreCopy(locale);
  const options: Array<{ key: HotScope; label: string }> = [
    { key: "city", label: region ? regionShortLabel(region, locale) : copy.local },
    { key: "country", label: region ? localizedCountryName(region.country_code, locale) : copy.currentCountry },
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

function HotPostItem({ post, rank, locale }: { post: KXPost; rank: number; locale: Locale }) {
  const title = post.content || String(post.attributes?.title || contentTypeLabel(post.content_type || "dynamic", locale));
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
            <span className="rounded-full bg-kx-soft px-2 py-0.5 font-medium text-kx-subtle">{contentTypeLabel(post.content_type || "dynamic", locale)}</span>
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

function TopicBoard({ topics, loading, error, onRetry, locale }: { topics: KXTrendingTopic[]; loading?: boolean; error?: boolean; onRetry: () => void; locale: Locale }) {
  const copy = exploreCopy(locale);
  return (
    <section className="kx-discover-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-[17px] font-extrabold text-kx-text/90">
            <Hash className="h-4 w-4 text-kx-accent" />
            {copy.topicTitle}
          </h2>
          <p className="mt-1 text-sm text-kx-subtle">{copy.topicSubtitle}</p>
        </div>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title={copy.topicError} onRetry={onRetry} locale={locale} />
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
                <span className="text-xs font-semibold text-kx-muted">{copy.postCount(compactNumber(topic.post_count))}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyBoard title={copy.topicEmptyTitle} subtitle={copy.topicEmptySubtitle} />
      )}
    </section>
  );
}

function UserBoard({ users, loading, error, onRetry, locale }: { users: KXUser[]; loading?: boolean; error?: boolean; onRetry: () => void; locale: Locale }) {
  const copy = exploreCopy(locale);
  return (
    <section className="kx-discover-section">
      <div className="mb-4">
        <h2 className="inline-flex items-center gap-2 text-lg font-black text-kx-text">
          <Users className="h-4 w-4 text-kx-accent" />
          {copy.usersTitle}
        </h2>
        <p className="mt-1 text-sm text-kx-subtle">{copy.usersSubtitle}</p>
      </div>
      {loading ? (
        <HotListSkeleton />
      ) : error ? (
        <RetryState title={copy.usersError} onRetry={onRetry} locale={locale} />
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
        <EmptyBoard title={copy.usersEmptyTitle} subtitle={copy.usersEmptySubtitle} />
      )}
    </section>
  );
}

function RetryState({ title, onRetry, locale }: { title: string; onRetry: () => void; locale: Locale }) {
  const copy = exploreCopy(locale);
  return (
    <div className="kx-discover-state">
      <p className="text-sm font-semibold text-kx-text">{title}</p>
      <button type="button" onClick={onRetry} className="kx-button-primary mt-3 h-9 text-xs">
        <RefreshCw className="h-3.5 w-3.5" />
        {copy.reload}
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
  const { locale } = useI18n();
  const copy = exploreCopy(locale);
  const cityName = region ? regionShortLabel(region, locale) : copy.local;
  return (
    <div className="space-y-3.5 pt-1.5">
      <RailCard
        title={copy.hotTitle(cityName)}
        icon={<Flame className="h-4 w-4 text-orange-500" />}
        badge={copy.last7Days}
      >
        {hotLoading ? (
          <RailSkeleton rows={4} />
        ) : hotPosts.length ? (
          <ol className="space-y-0.5">
            {hotPosts.slice(0, 5).map((post, idx) => (
              <RailHotItem key={post.id} post={post} rank={idx + 1} locale={locale} />
            ))}
          </ol>
        ) : (
          <RailEmpty text={copy.railHotEmpty} />
        )}
      </RailCard>

      <RailCard
        title={copy.railTopics}
        icon={<Hash className="h-4 w-4 text-blue-600" />}
        action={{ label: copy.more, href: "/search?kind=topic" }}
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
          <RailEmpty text={copy.railTopicEmpty} />
        )}
      </RailCard>

      <RailCard
        title={copy.railUsers}
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
          <RailEmpty text={copy.railUserEmpty} />
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

function RailHotItem({ post, rank, locale }: { post: KXPost; rank: number; locale: Locale }) {
  const title = post.content || String(post.attributes?.title || contentTypeLabel(post.content_type || "dynamic", locale));
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

function searchPlaceholder(cityName: string, selectedChannel: ExploreChannelSlug | undefined, locale: Locale) {
  const copy = exploreCopy(locale);
  const channelName = selectedChannel ? getChannelTitle(selectedChannel, locale) : "";
  switch (selectedChannel) {
    case "housing":
      return copy.searchHousing(cityName);
    case "jobs":
      return copy.searchJobs(cityName);
    case "market":
      return copy.searchMarket(cityName);
    case "services":
      return copy.searchServices(cityName);
    case "groups":
      return copy.searchGroups(cityName);
    case "guide":
      return copy.searchGuide(cityName);
    default:
      return channelName ? copy.searchChannel(cityName, channelName) : copy.searchDefault;
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

function exploreCopy(locale: Locale) {
  switch (locale) {
    case "en":
      return {
        pageTitle: "Discover",
        profileAria: "Profile",
        notifications: "Notifications",
        switchRegion: "Switch region",
        search: "Search",
        local: "Local",
        currentCountry: "Current Country",
        switched: (region: string) => `Switched to ${region}`,
        cityPulse: "City Pulse",
        hubTitle: "What is happening, hot posts, topics, and people",
        hubSubtitle: "Local posts and trending content from the home feed live here. Switch between your current city and country anytime.",
        tabRecommend: "Happening",
        tabHot: "Hot",
        tabTopics: "Topics",
        tabUsers: "People",
        happeningTitle: (city: string) => `${city} Happening Now`,
        happeningSubtitle: "Local posts from the home feed, prioritizing recent content with real engagement.",
        happeningError: "Happening posts cannot load right now",
        happeningEmptyTitle: "No new local updates yet",
        happeningEmptySubtitle: "Real experiences, questions, and useful local posts will appear here automatically.",
        hotTitle: (place: string) => `${place} Hot`,
        hotSubtitle: "Sorted by configurable recent heat from local engagement. Switch between city and country scope.",
        hotErrorTitle: "Hot posts cannot load right now",
        hotErrorSubtitle: "The network or service is temporarily unavailable. Please try again later.",
        hotEmptyTitle: "No hot posts in this area yet",
        hotEmptySubtitle: "Switch cities or check back later for new local discussions.",
        topicTitle: "Trending Topics",
        topicSubtitle: "Topics mentioned repeatedly across recent posts, useful for jumping into local discussions.",
        topicError: "Topics cannot load right now",
        topicEmptyTitle: "No trending topics yet",
        topicEmptySubtitle: "This board updates automatically after more real discussions appear.",
        usersTitle: "People Worth Following",
        usersSubtitle: "Real, active accounts that contribute to city content are prioritized.",
        usersError: "Recommended people cannot load right now",
        usersEmptyTitle: "No recommendations yet",
        usersEmptySubtitle: "Trustworthy recommendations will appear once more people publish quality content.",
        reload: "Reload",
        last7Days: "Recent heat",
        more: "More",
        railTopics: "Hot Topics",
        railUsers: "Who to Follow",
        railHotEmpty: "No hot posts in this city yet.",
        railTopicEmpty: "There is not enough discussion to form topic trends yet.",
        railUserEmpty: "Recommended active people will appear here.",
        postCount: (count: string) => `${count} posts`,
        searchDefault: "Search people, topics, and local posts...",
        searchHousing: (city: string) => `Search housing, rooms, listings, and areas in ${city}...`,
        searchJobs: (city: string) => `Search part-time, full-time, hiring, and referrals in ${city}...`,
        searchMarket: (city: string) => `Search secondhand, moving sales, free items, and wanted posts in ${city}...`,
        searchServices: (city: string) => `Search translation, paperwork, pickup, and local services in ${city}...`,
        searchGroups: (city: string) => `Search food meetups, language exchange, and groups in ${city}...`,
        searchGuide: (city: string) => `Search guides, paperwork, banking, and local tips in ${city}...`,
        searchChannel: (city: string, channel: string) => `Search ${channel} in ${city}...`,
      };
    case "ja":
      return {
        pageTitle: "発見",
        profileAria: "マイページ",
        notifications: "通知",
        switchRegion: "地域を切り替え",
        search: "検索",
        local: "ローカル",
        currentCountry: "現在の国",
        switched: (region: string) => `${region}に切り替えました`,
        cityPulse: "街の動き",
        hubTitle: "今起きていること、人気投稿、話題、注目ユーザー",
        hubSubtitle: "ホームの地域投稿とトレンドをここに集約しています。現在の街と国の範囲をいつでも切り替えられます。",
        tabRecommend: "進行中",
        tabHot: "人気",
        tabTopics: "話題",
        tabUsers: "おすすめ",
        happeningTitle: (city: string) => `${city}で今起きていること`,
        happeningSubtitle: "ホームの地域投稿から、最近の反応がある実際の内容を優先して表示します。",
        happeningError: "進行中の投稿を読み込めません",
        happeningEmptyTitle: "新しい地域投稿はまだありません",
        happeningEmptySubtitle: "実体験、質問、生活情報が投稿されると自動でここに表示されます。",
        hotTitle: (place: string) => `${place}の人気`,
        hotSubtitle: "管理画面で設定した期間の反応量と鮮度で並べています。街と国の範囲を切り替えられます。",
        hotErrorTitle: "人気投稿を読み込めません",
        hotErrorSubtitle: "ネットワークまたはサービスが一時的に利用できません。時間を置いてお試しください。",
        hotEmptyTitle: "この地域の人気投稿はまだありません",
        hotEmptySubtitle: "街を切り替えるか、後でもう一度確認してください。",
        topicTitle: "話題のトピック",
        topicSubtitle: "最近繰り返し言及されている話題です。地域の会話にすばやく入れます。",
        topicError: "話題を読み込めません",
        topicEmptyTitle: "話題のトピックはまだありません",
        topicEmptySubtitle: "実際の会話が増えると自動で更新されます。",
        usersTitle: "フォローしたいユーザー",
        usersSubtitle: "地域コンテンツに貢献している実在感のあるアクティブなユーザーを優先します。",
        usersError: "おすすめユーザーを読み込めません",
        usersEmptyTitle: "おすすめはまだありません",
        usersEmptySubtitle: "質の高い投稿が増えると、信頼できるおすすめが表示されます。",
        reload: "再読み込み",
        last7Days: "最近の人気",
        more: "もっと見る",
        railTopics: "人気の話題",
        railUsers: "おすすめユーザー",
        railHotEmpty: "この街の人気投稿はまだありません。",
        railTopicEmpty: "話題トレンドを作るだけの投稿はまだありません。",
        railUserEmpty: "アクティブなおすすめユーザーがここに表示されます。",
        postCount: (count: string) => `${count}件`,
        searchDefault: "ユーザー、話題、地域投稿を検索...",
        searchHousing: (city: string) => `${city}の住まい、シェア、物件、エリアを検索...`,
        searchJobs: (city: string) => `${city}のアルバイト、正社員、求人、紹介を検索...`,
        searchMarket: (city: string) => `${city}の中古品、引っ越し処分、無料譲渡、探し物を検索...`,
        searchServices: (city: string) => `${city}の通訳、手続き、送迎、ローカルサービスを検索...`,
        searchGroups: (city: string) => `${city}の食事会、言語交換、地域グループを検索...`,
        searchGuide: (city: string) => `${city}の攻略、手続き、銀行、生活情報を検索...`,
        searchChannel: (city: string, channel: string) => `${city}の${channel}を検索...`,
      };
    case "zh-Hant":
      return {
        pageTitle: "發現",
        profileAria: "我的",
        notifications: "通知",
        switchRegion: "切換地區",
        search: "搜尋",
        local: "本地",
        currentCountry: "目前國家",
        switched: (region: string) => `已切換到 ${region}`,
        cityPulse: "城市動態",
        hubTitle: "正在發生、熱榜、話題和用戶推薦",
        hubSubtitle: "首頁同城貼文與趨勢內容都在這裡，範圍可在目前城市與目前國家之間切換。",
        tabRecommend: "正在發生",
        tabHot: "熱榜",
        tabTopics: "話題",
        tabUsers: "用戶推薦",
        happeningTitle: (city: string) => `${city}正在發生`,
        happeningSubtitle: "來自首頁資訊流的同城貼文，優先展示近期有互動的真實內容。",
        happeningError: "正在發生暫時無法載入",
        happeningEmptyTitle: "暫時沒有新的同城動態",
        happeningEmptySubtitle: "發布真實經驗、問答或生活資訊後，這裡會自動出現新的內容。",
        hotTitle: (place: string) => `${place}熱榜`,
        hotSubtitle: "按後台設定的近期互動熱度與新鮮度排序，可在目前城市和目前國家之間切換。",
        hotErrorTitle: "熱榜暫時無法載入",
        hotErrorSubtitle: "網路或服務暫時不可用，請稍後再試。",
        hotEmptyTitle: "這個地區暫時沒有熱榜內容",
        hotEmptySubtitle: "可以切換城市，或稍後回來看看新的本地討論。",
        topicTitle: "話題趨勢",
        topicSubtitle: "最近被反覆提到的話題，適合快速進入同城討論。",
        topicError: "話題暫時無法載入",
        topicEmptyTitle: "暫時沒有話題趨勢",
        topicEmptySubtitle: "等更多真實討論出現後，這裡會自動更新。",
        usersTitle: "值得關注的用戶",
        usersSubtitle: "優先展示真實活躍、對城市內容有貢獻的用戶和帳號。",
        usersError: "用戶推薦暫時無法載入",
        usersEmptyTitle: "暫時沒有推薦用戶",
        usersEmptySubtitle: "當用戶開始發布高品質內容後，這裡會出現更可信的推薦。",
        reload: "重新載入",
        last7Days: "近期热度",
        more: "更多",
        railTopics: "熱門話題",
        railUsers: "推薦關注",
        railHotEmpty: "這座城市暫時還沒有熱榜內容。",
        railTopicEmpty: "還沒有足夠的討論形成話題趨勢。",
        railUserEmpty: "活躍用戶出現後，這裡會給出推薦。",
        postCount: (count: string) => `${count} 帖`,
        searchDefault: "搜尋用戶、話題和本地動態...",
        searchHousing: (city: string) => `搜尋${city}租房、合租、房源、區域...`,
        searchJobs: (city: string) => `搜尋${city}兼職、全職、招聘、內推...`,
        searchMarket: (city: string) => `搜尋${city}二手、搬家出清、免費送、求購...`,
        searchServices: (city: string) => `搜尋${city}翻譯、手續、接機、本地服務...`,
        searchGroups: (city: string) => `搜尋${city}Food meetup、語言交換、本地小組...`,
        searchGuide: (city: string) => `搜尋${city}攻略、手續、銀行卡、生活經驗...`,
        searchChannel: (city: string, channel: string) => `搜尋${city}${channel}...`,
      };
    default:
      return {
        pageTitle: "发现",
        profileAria: "我的",
        notifications: "通知",
        switchRegion: "切换地区",
        search: "搜索",
        local: "本地",
        currentCountry: "当前国家",
        switched: (region: string) => `已切换到 ${region}`,
        cityPulse: "城市动态",
        hubTitle: "正在发生、热榜、话题和用户推荐",
        hubSubtitle: "首页同城推文与趋势内容都在这里，范围可在当前城市与当前国家之间切换。",
        tabRecommend: "正在发生",
        tabHot: "热榜",
        tabTopics: "话题",
        tabUsers: "用户推荐",
        happeningTitle: (city: string) => `${city}正在发生`,
        happeningSubtitle: "来自首页信息流的同城推文，优先展示近期有互动的真实内容。",
        happeningError: "正在发生暂时无法加载",
        happeningEmptyTitle: "暂时没有新的同城动态",
        happeningEmptySubtitle: "发布真实经验、问答或生活信息后，这里会自动出现新的内容。",
        hotTitle: (place: string) => `${place}热榜`,
        hotSubtitle: "按后台设置的近期互动热度与新鲜度排序，可在当前城市和当前国家之间切换。",
        hotErrorTitle: "热榜暂时无法加载",
        hotErrorSubtitle: "网络或服务暂时不可用，请稍后再试。",
        hotEmptyTitle: "这个地区暂时没有热榜内容",
        hotEmptySubtitle: "可以切换城市，或稍后回来看看新的本地讨论。",
        topicTitle: "话题趋势",
        topicSubtitle: "最近被反复提到的话题，适合快速进入同城讨论。",
        topicError: "话题暂时无法加载",
        topicEmptyTitle: "暂时没有话题趋势",
        topicEmptySubtitle: "等更多真实讨论出现后，这里会自动更新。",
        usersTitle: "值得关注的用户",
        usersSubtitle: "优先展示真实活跃、对城市内容有贡献的用户和账号。",
        usersError: "用户推荐暂时无法加载",
        usersEmptyTitle: "暂时没有推荐用户",
        usersEmptySubtitle: "当用户开始发布高质量内容后，这里会出现更可信的推荐。",
        reload: "重新加载",
        last7Days: "近期热度",
        more: "更多",
        railTopics: "热门话题",
        railUsers: "推荐关注",
        railHotEmpty: "这座城市暂时还没有热榜内容。",
        railTopicEmpty: "还没有足够的讨论形成话题趋势。",
        railUserEmpty: "活跃用户出现后，这里会给出推荐。",
        postCount: (count: string) => `${count} 帖`,
        searchDefault: "搜索用户、话题和本地动态...",
        searchHousing: (city: string) => `搜索${city}租房、合租、房源、区域...`,
        searchJobs: (city: string) => `搜索${city}兼职、正社员、招聘、内推...`,
        searchMarket: (city: string) => `搜索${city}二手、搬家出清、免费送、求购...`,
        searchServices: (city: string) => `搜索${city}翻译、手续、接机、本地服务...`,
        searchGroups: (city: string) => `搜索${city}Food meetup、语言交换、本地小组...`,
        searchGuide: (city: string) => `搜索${city}攻略、手续、银行卡、生活经验...`,
        searchChannel: (city: string, channel: string) => `搜索${city}${channel}...`,
      };
  }
}

function contentTypeLabel(type: keyof typeof CONTENT_TYPE_LABELS, locale: Locale) {
  if (locale === "en") {
    const labels: Partial<Record<keyof typeof CONTENT_TYPE_LABELS, string>> = {
      dynamic: "Post",
      image_post: "Image",
      long_post: "Long Post",
      news: "News",
      local_info: "Local Info",
      guide: "Guide",
      question: "Q&A",
      rant: "Rant",
      secondhand: "Secondhand",
      housing: "Housing",
      roommate: "Roommate",
      job_seek: "Job Seeking",
      job_post: "Hiring",
      referral: "Referral",
      meetup: "Meetup",
      dining: "Food",
      event: "Event",
      service: "Service",
      merchant: "Business",
      coupon: "Deal",
      warning: "Warning",
      poll: "Poll",
      anonymous: "Anonymous",
    };
    return labels[type] || CONTENT_TYPE_LABELS[type] || type;
  }
  if (locale === "ja") {
    const labels: Partial<Record<keyof typeof CONTENT_TYPE_LABELS, string>> = {
      dynamic: "投稿",
      image_post: "画像投稿",
      long_post: "長文",
      news: "ニュース",
      local_info: "地域情報",
      guide: "ガイド",
      question: "Q&A",
      rant: "つぶやき",
      secondhand: "中古",
      housing: "住まい",
      roommate: "ルームメイト",
      job_seek: "仕事探し",
      job_post: "求人",
      referral: "紹介",
      meetup: "グループ",
      dining: "グルメ",
      event: "イベント",
      service: "サービス",
      merchant: "店舗",
      coupon: "お得情報",
      warning: "注意喚起",
      poll: "投票",
      anonymous: "匿名",
    };
    return labels[type] || CONTENT_TYPE_LABELS[type] || type;
  }
  return CONTENT_TYPE_LABELS[type] || type;
}
