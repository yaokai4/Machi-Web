"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  ChevronDown,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/design/Avatar";
import { ErrorState, Skeleton } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import {
  CORE_EXPLORE_CHANNELS,
  getExploreChannelSpec,
  normalizeExploreChannel,
  type ExploreChannelSlug,
  type ExploreChannelSpec,
} from "@/components/feed/DiscoverShortcuts";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
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

type ChannelScope = "local" | "country";

export default function ExploreChannelPage() {
  return (
    <Suspense fallback={<ExploreChannelSkeleton />}>
      <ExploreChannelClient />
    </Suspense>
  );
}

function ExploreChannelClient() {
  const router = useRouter();
  const params = useParams<{ channel?: string | string[] }>();
  const searchParams = useSearchParams();
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
  const copy = channelPageCopy(locale);
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");

  const rawChannel = Array.isArray(params.channel) ? params.channel[0] : params.channel;
  const channel = normalizeExploreChannel(rawChannel);
  const spec = getExploreChannelSpec(channel);
  const scope: ChannelScope = searchParams.get("scope") === "country" ? "country" : "local";
  const userRegion = regionFromUser(user);
  const currentRegion = regionFromParams(searchParams) || userRegion || resolveRegion("jp.tokyo.tokyo");
  const cityName = currentRegion ? regionShortLabel(currentRegion, locale) : copy.local;
  const countryName = currentRegion ? localizedCountryName(currentRegion.country_code, locale) : copy.currentCountry;
  const activePlace = scope === "country" ? countryName : cityName;

  const feed = useQuery({
    queryKey: ["explore-channel-page", channel || "unknown", scope, currentRegion?.region_code || "none"],
    queryFn: () => {
      const base = {
        country: currentRegion?.country_code,
        content_type: spec?.contentTypes,
      };
      if (scope === "country") return api.feed("plaza", undefined, base);
      return api.feed("local", undefined, {
        ...base,
        region_code: currentRegion?.region_code,
        province: currentRegion?.province_code,
        city: currentRegion?.city_code,
      });
    },
    staleTime: 45_000,
    enabled: !!spec && !!currentRegion,
  });

  const updateUrl = (next: { region?: RegionInfo; scope?: ChannelScope; channel?: ExploreChannelSlug }) => {
    if (!spec && !next.channel) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("v");
    const region = next.region || currentRegion;
    if (region) {
      params.set("city", region.city_code);
      params.set("region", region.region_code);
    }
    if (next.scope === "country") params.set("scope", "country");
    if (next.scope === "local") params.delete("scope");
    const nextChannel = next.channel || spec?.slug;
    router.replace(`/explore/${nextChannel}?${params.toString()}`, { scroll: false });
  };

  const selectRegion = async (region: RegionInfo) => {
    setRegionPickerOpen(false);
    updateUrl({ region });
    if (!user) return;
    try {
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      feed.refetch();
      pushToast({ kind: "success", message: copy.switched(regionShortLabel(region, locale)) });
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const submitSearch = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const q = searchDraft.trim();
    if (!q || !spec) return;
    // /search (and /api/search) honor ONLY `q` + `kind` — there is no city or
    // channel scope on the search endpoint. Appending `city`/`channel` (as we
    // used to) is silently dropped and promises a scope the results can't
    // deliver, exactly the misleading URL /explore's goToSearch deliberately
    // avoids. Instead map the channel to the closest search `kind` so the query
    // lands on the right result category, and keep the URL to params /search
    // actually reads.
    const params = new URLSearchParams();
    params.set("q", q);
    const kind = channelSearchKind(spec.slug);
    if (kind !== "all") params.set("kind", kind);
    router.push(`/search?${params.toString()}`);
  };

  if (!spec) {
    return (
      <AppShell requireAuth={false} right={null}>
        <main className="min-h-[70dvh] px-4 py-8">
          <section className="kx-discover-section mx-auto max-w-xl text-center">
            <ErrorState title={copy.missingTitle} subtitle={copy.missingSubtitle} />
            <Link href="/explore" className="kx-button-primary mx-auto mt-4 w-fit justify-center">
              {copy.backToExplore}
            </Link>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell requireAuth={false} right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <Link
            href={exploreHref(currentRegion)}
            aria-label={copy.backToExplore}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kx-stroke/45 bg-kx-card/[0.92] text-kx-text shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:bg-kx-soft"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          {user ? (
            <Link href="/me" aria-label={copy.profileAria}>
              <Avatar user={user} size={40} />
            </Link>
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-kx-md bg-kx-accent text-base font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
              M
            </span>
          )}
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
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={channelSearchPlaceholder(spec, activePlace, locale)}
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
          <ChannelHero
            spec={spec}
            cityName={cityName}
            countryName={countryName}
            scope={scope}
            onScopeChange={(nextScope) => updateUrl({ scope: nextScope })}
            locale={locale}
          />
          <ChannelPostList
            posts={feed.data?.items || []}
            loading={feed.isLoading}
            error={feed.isError}
            onRetry={() => feed.refetch()}
            placeLabel={activePlace}
            channelLabel={getChannelTitle(spec, locale)}
            scope={scope}
            locale={locale}
          />
          <section className="kx-discover-section">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-kx-text">
              <Sparkles className="h-4 w-4 text-kx-accent" />
              {copy.otherChannels}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CORE_EXPLORE_CHANNELS.filter((item) => item.slug !== spec.slug).slice(0, 7).map((item) => (
                <Link
                  key={item.slug}
                  href={channelHref(item.slug, currentRegion, searchParams)}
                  className="rounded-kx-md border border-kx-stroke/45 bg-kx-card/80 px-3 py-3 text-sm font-semibold text-kx-subtle transition hover:-translate-y-px hover:border-kx-accent/35 hover:bg-kx-accentSoft/35 hover:text-kx-accent hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
                >
                  {getChannelTitle(item, locale)}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <RegionPickerDialog
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        onSelect={selectRegion}
        initialCountry={currentRegion?.country_code || user?.country || "jp"}
        allowsAnyCountry={false}
      />
    </AppShell>
  );
}

function ChannelHero({
  spec,
  cityName,
  countryName,
  scope,
  onScopeChange,
  locale,
}: {
  spec: ExploreChannelSpec;
  cityName: string;
  countryName: string;
  scope: ChannelScope;
  onScopeChange: (scope: ChannelScope) => void;
  locale: Locale;
}) {
  const placeLabel = scope === "country" ? countryName : cityName;
  const helper = channelHeroCopy(spec, locale);
  const channelTitle = getChannelTitle(spec, locale);
  return (
    <section className="kx-discover-panel">
      <div className="relative p-5">
        <div className="relative flex items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${toneClass(spec.tone)}`}>
            <spec.Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black tracking-tight text-kx-text">
              {channelHeroTitle(placeLabel, channelTitle, locale)}
            </h2>
            <p className="mt-1 text-sm leading-6 text-kx-subtle">{helper}</p>
          </div>
        </div>
        <div className="relative mt-4 inline-flex rounded-full border border-kx-stroke/45 bg-kx-soft/70 p-1 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
          {([
            ["local", cityName],
            ["country", countryName],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onScopeChange(value)}
              className={[
                "h-9 rounded-full px-4 text-sm font-semibold transition",
                scope === value ? "bg-kx-accent text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]" : "text-kx-subtle hover:bg-kx-card hover:text-kx-text",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChannelPostList({
  posts,
  loading,
  error,
  onRetry,
  placeLabel,
  channelLabel,
  scope,
  locale,
}: {
  posts: Awaited<ReturnType<typeof api.feed>>["items"];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  placeLabel: string;
  channelLabel: string;
  scope: ChannelScope;
  locale: Locale;
}) {
  const copy = channelPageCopy(locale);
  return (
    <section className="kx-discover-section">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-kx-text">{copy.latest}</h2>
          <p className="mt-1 text-sm text-kx-subtle">
            {scope === "country" ? copy.countryScopeSubtitle(placeLabel, channelLabel) : copy.localScopeSubtitle(placeLabel, channelLabel)}
          </p>
        </div>
        {error ? (
          <button type="button" onClick={onRetry} className="kx-button-ghost h-9 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.reload}
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-36 w-full rounded-3xl" />
          ))}
        </div>
      ) : error ? (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">{copy.contentErrorTitle}</p>
          <p className="mt-1 text-sm text-kx-subtle">{copy.contentErrorSubtitle}</p>
        </div>
      ) : posts.length ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : (
        <div className="kx-discover-state">
          <p className="text-sm font-semibold text-kx-text">{copy.contentEmptyTitle}</p>
          <p className="mt-1 text-sm text-kx-subtle">{copy.contentEmptySubtitle}</p>
        </div>
      )}
    </section>
  );
}

function ExploreChannelSkeleton() {
  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <Skeleton className="h-9 w-48 rounded-full" />
        <Skeleton className="mt-3 h-11 w-full rounded-2xl" />
      </header>
      <main className="px-3 py-4 sm:px-4">
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-96 w-full rounded-3xl" />
        </div>
      </main>
    </AppShell>
  );
}

function regionFromParams(params: { get(name: string): string | null }): RegionInfo | undefined {
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

function channelHref(slug: ExploreChannelSlug, region: RegionInfo | undefined, sourceParams: URLSearchParams | { toString(): string }) {
  const city = region?.city_code || "tokyo";
  if (slug === "market") return `/cities/${encodeURIComponent(city)}/marketplace`;
  if (slug === "housing") return `/cities/${encodeURIComponent(city)}/rentals`;
  if (slug === "jobs") return `/cities/${encodeURIComponent(city)}/jobs`;
  if (slug === "services") return `/cities/${encodeURIComponent(city)}/services`;
  if (slug === "deals") return `/cities/${encodeURIComponent(city)}/deals`;
  const params = new URLSearchParams(sourceParams.toString());
  params.delete("v");
  if (region) {
    params.set("city", region.city_code);
    params.set("region", region.region_code);
  }
  const query = params.toString();
  return `/explore/${slug}${query ? `?${query}` : ""}`;
}

function exploreHref(region?: RegionInfo) {
  if (!region) return "/explore";
  const params = new URLSearchParams({ city: region.city_code, region: region.region_code });
  return `/explore?${params.toString()}`;
}

// Map a discover channel to the closest /search `kind` so a search started from
// the channel lands on the right result category. The transactional channels
// (market/housing/jobs/services/deals) are city listings; guide is the guide
// library; everything else (news/groups/qa) is post content.
function channelSearchKind(slug: ExploreChannelSlug): "all" | "post" | "listing" | "guide" {
  switch (slug) {
    case "market":
    case "housing":
    case "jobs":
    case "services":
    case "deals":
      return "listing";
    case "guide":
      return "guide";
    default:
      return "post";
  }
}

function channelHeroTitle(placeLabel: string, channelLabel: string, locale: Locale) {
  if (locale === "en") return `${channelLabel} in ${placeLabel}`;
  if (locale === "ja") return `${placeLabel}の${channelLabel}`;
  return `${placeLabel}${channelLabel}`;
}

function channelHeroCopy(spec: ExploreChannelSpec, locale: Locale) {
  switch (spec.slug) {
    case "news":
      return localizedChannelLine(locale, {
        "zh-Hans": "本地快讯、交通提醒和城市生活信息会汇集在这里。",
        "zh-Hant": "本地快訊、交通提醒和城市生活資訊會匯集在這裡。",
        en: "Local news, transit alerts, and city life updates are gathered here.",
        ja: "地域ニュース、交通情報、街の生活情報をここに集約します。",
      });
    case "guide":
      return localizedChannelLine(locale, {
        "zh-Hans": "生活经验、路线选择和实用攻略，帮你更快熟悉这座城市。",
        "zh-Hant": "生活經驗、路線選擇和實用攻略，幫你更快熟悉這座城市。",
        en: "Practical guides, routes, and lived experience help you understand the city faster.",
        ja: "生活経験、行き方、実用ガイドでこの街に早く慣れられます。",
      });
    case "housing":
      return localizedChannelLine(locale, {
        "zh-Hans": "房源、合租、转租和区域经验，集中查看更省心。",
        "zh-Hant": "房源、合租、轉租和區域經驗，集中查看更省心。",
        en: "Listings, shared rooms, sublets, and area experience in one focused place.",
        ja: "物件、シェア、転貸、エリア経験をまとめて確認できます。",
      });
    case "jobs":
      return localizedChannelLine(locale, {
        "zh-Hans": "兼职、正社员、求职经验和岗位线索，按城市聚合。",
        "zh-Hant": "兼職、正社員、求職經驗和職缺線索，按城市聚合。",
        en: "Part-time work, full-time roles, job-search stories, and leads grouped by city.",
        ja: "アルバイト、正社員、求職経験、求人情報を街ごとに整理します。",
      });
    case "market":
      return localizedChannelLine(locale, {
        "zh-Hans": "闲置、求购和搬家处理信息，适合快速筛选本地交易。",
        "zh-Hant": "閒置、求購和搬家處理資訊，適合快速篩選本地交易。",
        en: "Secondhand, wanted, and moving-sale posts for faster local trading.",
        ja: "中古品、探し物、引っ越し処分を地域内で素早く探せます。",
      });
    case "groups":
      return localizedChannelLine(locale, {
        "zh-Hans": "Food meetup、语言交换、本地小组和公开城市活动都在这里。",
        "zh-Hant": "Food meetup、語言交換、本地小組和公開城市活動都在這裡。",
        en: "Food meetups, language exchange, local groups, and public city events live here.",
        ja: "食事会、言語交換、地域グループ、公開イベントをここで見つけられます。",
      });
    case "qa":
      return localizedChannelLine(locale, {
        "zh-Hans": "生活疑问、本地手续和实用求助，集中问也集中看。",
        "zh-Hant": "生活疑問、本地手續和實用求助，集中問也集中看。",
        en: "Everyday questions, paperwork help, and practical local requests in one place.",
        ja: "生活の疑問、地域の手続き、実用的な相談をまとめて確認できます。",
      });
    case "services":
      return localizedChannelLine(locale, {
        "zh-Hans": "餐厅、旅行票务、接送交通、翻译手续、搬家清洁和生活开通。",
        "zh-Hant": "餐廳、旅行票務、接送交通、翻譯手續、搬家清潔和生活開通。",
        en: "Restaurants, travel tickets, transfers, paperwork, moving, cleaning, and life setup.",
        ja: "飲食店、旅行チケット、送迎、翻訳・手続き、引越し清掃、生活手続き。",
      });
    case "deals":
      return localizedChannelLine(locale, {
        "zh-Hans": "优惠、折扣和活动福利，适合顺手收藏。",
        "zh-Hant": "優惠、折扣和活動福利，適合順手收藏。",
        en: "Discounts, offers, and event perks worth saving for later.",
        ja: "割引、キャンペーン、イベント特典を気軽に保存できます。",
      });
    default:
      return localizedChannelLine(locale, {
        "zh-Hans": "相关内容会按城市和范围整理在这里。",
        "zh-Hant": "相關內容會按城市和範圍整理在這裡。",
        en: "Related posts are organized here by city and scope.",
        ja: "関連投稿を街と範囲ごとに整理します。",
      });
  }
}

function channelSearchPlaceholder(spec: ExploreChannelSpec, placeLabel: string, locale: Locale) {
  const title = getChannelTitle(spec, locale);
  switch (spec.slug) {
    case "news":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}快讯、交通、提醒...`,
        "zh-Hant": `搜尋${placeLabel}快訊、交通、提醒...`,
        en: `Search news, transit, and alerts in ${placeLabel}...`,
        ja: `${placeLabel}の速報、交通、注意情報を検索...`,
      });
    case "housing":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}租房、合租、房源、区域...`,
        "zh-Hant": `搜尋${placeLabel}租房、合租、房源、區域...`,
        en: `Search housing, rooms, listings, and areas in ${placeLabel}...`,
        ja: `${placeLabel}の住まい、シェア、物件、エリアを検索...`,
      });
    case "jobs":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}兼职、全职、招聘、内推...`,
        "zh-Hant": `搜尋${placeLabel}兼職、全職、招聘、內推...`,
        en: `Search part-time, full-time, hiring, and referrals in ${placeLabel}...`,
        ja: `${placeLabel}のアルバイト、正社員、求人、紹介を検索...`,
      });
    case "market":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}二手、闲置、求购...`,
        "zh-Hant": `搜尋${placeLabel}二手、閒置、求購...`,
        en: `Search secondhand, unused items, and wanted posts in ${placeLabel}...`,
        ja: `${placeLabel}の中古品、不要品、探し物を検索...`,
      });
    case "services":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}翻译、手续、接机、本地服务...`,
        "zh-Hant": `搜尋${placeLabel}翻譯、手續、接機、本地服務...`,
        en: `Search translation, paperwork, pickup, and services in ${placeLabel}...`,
        ja: `${placeLabel}の通訳、手続き、送迎、サービスを検索...`,
      });
    case "groups":
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}Food meetup、语言交换、本地小组...`,
        "zh-Hant": `搜尋${placeLabel}Food meetup、語言交換、本地小組...`,
        en: `Search food meetups, language exchange, and local groups in ${placeLabel}...`,
        ja: `${placeLabel}の食事会、言語交換、地域グループを検索...`,
      });
    default:
      return localizedChannelLine(locale, {
        "zh-Hans": `搜索${placeLabel}${title}...`,
        "zh-Hant": `搜尋${placeLabel}${title}...`,
        en: `Search ${title} in ${placeLabel}...`,
        ja: `${placeLabel}の${title}を検索...`,
      });
  }
}

function localizedChannelLine(locale: Locale, copy: Record<Locale, string>) {
  return copy[locale] || copy["zh-Hans"];
}

function channelPageCopy(locale: Locale) {
  switch (locale) {
    case "en":
      return {
        local: "Local",
        currentCountry: "Current Country",
        switched: (region: string) => `Switched to ${region}`,
        missingTitle: "Channel not found",
        missingSubtitle: "This discover channel is not available right now. Go back to Discover and choose another one.",
        backToExplore: "Back to Discover",
        profileAria: "Profile",
        switchRegion: "Switch region",
        notifications: "Notifications",
        search: "Search",
        latest: "Latest",
        countryScopeSubtitle: (place: string, channel: string) => `${channel} posts across ${place}`,
        localScopeSubtitle: (place: string, channel: string) => `${channel} posts related to ${place}`,
        reload: "Reload",
        contentErrorTitle: "Content cannot load right now",
        contentErrorSubtitle: "Please try again later, or switch city and scope.",
        contentEmptyTitle: "No content in this channel yet",
        contentEmptySubtitle: "Switch the scope or publish the first related post.",
        otherChannels: "Other Channels",
      };
    case "ja":
      return {
        local: "ローカル",
        currentCountry: "現在の国",
        switched: (region: string) => `${region}に切り替えました`,
        missingTitle: "チャンネルが見つかりません",
        missingSubtitle: "この発見チャンネルは現在利用できません。発見ページに戻って選び直してください。",
        backToExplore: "発見に戻る",
        profileAria: "マイページ",
        switchRegion: "地域を切り替え",
        notifications: "通知",
        search: "検索",
        latest: "最新",
        countryScopeSubtitle: (place: string, channel: string) => `${place}全体の${channel}投稿`,
        localScopeSubtitle: (place: string, channel: string) => `${place}に関連する${channel}投稿`,
        reload: "再読み込み",
        contentErrorTitle: "コンテンツを読み込めません",
        contentErrorSubtitle: "時間を置いて再試行するか、街と範囲を切り替えてください。",
        contentEmptyTitle: "このチャンネルにはまだ投稿がありません",
        contentEmptySubtitle: "範囲を切り替えるか、最初の関連投稿を公開できます。",
        otherChannels: "他のチャンネル",
      };
    case "zh-Hant":
      return {
        local: "本地",
        currentCountry: "目前國家",
        switched: (region: string) => `已切換到 ${region}`,
        missingTitle: "頻道不存在",
        missingSubtitle: "這個發現頻道暫時不可用，可以回到發現頁重新選擇。",
        backToExplore: "回到發現",
        profileAria: "我的",
        switchRegion: "切換地區",
        notifications: "通知",
        search: "搜尋",
        latest: "最新內容",
        countryScopeSubtitle: (place: string, channel: string) => `${place}範圍內的${channel}內容`,
        localScopeSubtitle: (place: string, channel: string) => `${place}${channel}相關內容`,
        reload: "重新載入",
        contentErrorTitle: "內容暫時無法載入",
        contentErrorSubtitle: "請稍後再試，或切換城市和範圍。",
        contentEmptyTitle: "這個頻道暫時沒有內容",
        contentEmptySubtitle: "可以切換範圍，或發布第一條相關內容。",
        otherChannels: "其他頻道",
      };
    default:
      return {
        local: "本地",
        currentCountry: "当前国家",
        switched: (region: string) => `已切换到 ${region}`,
        missingTitle: "频道不存在",
        missingSubtitle: "这个发现频道暂时不可用，可以回到发现页重新选择。",
        backToExplore: "回到发现",
        profileAria: "我的",
        switchRegion: "切换地区",
        notifications: "通知",
        search: "搜索",
        latest: "最新内容",
        countryScopeSubtitle: (place: string, channel: string) => `${place}范围内的${channel}内容`,
        localScopeSubtitle: (place: string, channel: string) => `${place}${channel}相关内容`,
        reload: "重新加载",
        contentErrorTitle: "内容暂时无法加载",
        contentErrorSubtitle: "请稍后再试，或切换城市和范围。",
        contentEmptyTitle: "这个频道暂时没有内容",
        contentEmptySubtitle: "可以切换范围，或发布第一条相关内容。",
        otherChannels: "其他频道",
      };
  }
}

function toneClass(tone: ExploreChannelSpec["tone"]) {
  switch (tone) {
    case "blue":
      return "bg-blue-600/10 text-blue-600";
    case "emerald":
      return "bg-emerald-600/10 text-emerald-600";
    case "indigo":
      return "bg-indigo-600/10 text-indigo-600";
    case "violet":
      return "bg-violet-600/10 text-violet-600";
    case "teal":
      return "bg-teal-600/10 text-teal-600";
    case "rose":
      return "bg-rose-600/10 text-rose-600";
    case "orange":
      return "bg-orange-500/10 text-orange-600";
    case "fuchsia":
      return "bg-fuchsia-600/10 text-fuchsia-600";
    default:
      return "bg-kx-soft text-kx-subtle";
  }
}
