"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  Globe2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Suspense, useState } from "react";
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
import {
  popularRegions as allPopularRegions,
  regionFromUser,
  regionHeaderLabel,
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
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);

  const rawChannel = Array.isArray(params.channel) ? params.channel[0] : params.channel;
  const channel = normalizeExploreChannel(rawChannel);
  const spec = getExploreChannelSpec(channel);
  const scope: ChannelScope = searchParams.get("scope") === "country" ? "country" : "local";
  const userRegion = regionFromUser(user);
  const currentRegion = regionFromParams(searchParams) || userRegion || resolveRegion("jp.osaka.osaka");
  const cityName = currentRegion?.city_name || "本地";
  const countryName = currentRegion?.country_name || "全国";
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
      const next = await api.updateRegionLanguage({ current_region_code: region.region_code });
      setUser(next);
      feed.refetch();
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  if (!spec) {
    return (
      <AppShell requireAuth={false}>
        <main className="min-h-[70dvh] bg-slate-50/60 px-4 py-8">
          <section className="mx-auto max-w-xl rounded-3xl border border-slate-200/70 bg-white p-6 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <ErrorState title="频道不存在" subtitle="这个发现频道暂时不可用，可以回到发现页重新选择。" />
            <Link href="/explore" className="kx-button-primary mx-auto mt-4 w-fit justify-center">
              回到发现
            </Link>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <Link
            href={exploreHref(currentRegion)}
            aria-label="返回发现"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          {user ? (
            <Link href="/me" aria-label="我的">
              <Avatar user={user} size={40} />
            </Link>
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-kx-md bg-kx-accent text-base font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
              M
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-blue-600">{regionHeaderLabel(currentRegion)}</div>
            <h1 className="truncate text-[23px] font-black leading-none tracking-tight text-slate-950 md:text-2xl">
              {activePlace}{spec.title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setRegionPickerOpen(true)}
            className="ml-auto inline-flex h-10 items-center gap-1 rounded-full bg-kx-soft px-3 text-xs font-bold text-kx-text transition hover:bg-kx-stroke/40"
            title="切换地区"
          >
            <MapPin className="h-3.5 w-3.5 text-kx-accent" />
            <span className="hidden max-w-[7rem] truncate sm:inline">{regionHeaderLabel(currentRegion)}</span>
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
          href={`/search?city=${encodeURIComponent(currentRegion?.city_code || "")}&channel=${encodeURIComponent(spec.slug)}`}
          className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 text-sm font-medium text-slate-500 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50/70"
        >
          <Search className="h-4 w-4 text-blue-600" />
          搜索{activePlace}{spec.title}...
        </Link>
      </header>

      <main className="bg-slate-50/60 px-3 py-4 sm:px-4">
        <div className="space-y-4">
          <ChannelHero
            spec={spec}
            cityName={cityName}
            countryName={countryName}
            scope={scope}
            onScopeChange={(nextScope) => updateUrl({ scope: nextScope })}
          />
          <ChannelPostList
            posts={feed.data?.items || []}
            loading={feed.isLoading}
            error={feed.isError}
            onRetry={() => feed.refetch()}
            placeLabel={activePlace}
            channelLabel={spec.title}
          />
          <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" />
              其他频道
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CORE_EXPLORE_CHANNELS.filter((item) => item.slug !== spec.slug).slice(0, 7).map((item) => (
                <Link
                  key={item.slug}
                  href={channelHref(item.slug, currentRegion, searchParams)}
                  className="rounded-2xl border border-slate-200/70 bg-white px-3 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-700 hover:shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
                >
                  {item.title}
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
        recentCodes={user?.recent_region_codes}
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
}: {
  spec: ExploreChannelSpec;
  cityName: string;
  countryName: string;
  scope: ChannelScope;
  onScopeChange: (scope: ChannelScope) => void;
}) {
  const placeLabel = scope === "country" ? countryName : cityName;
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_10px_34px_rgba(15,23,42,0.055)]">
      <div className="bg-gradient-to-br from-white via-blue-50/35 to-slate-50/70 p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${toneClass(spec.tone)}`}>
            <spec.Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-600/8 px-2.5 py-1 text-xs font-semibold text-blue-700">
              <Globe2 className="h-3.5 w-3.5" />
              {placeLabel}
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{placeLabel}{spec.title}</h2>
            <p className="mt-1 text-sm text-slate-500">默认看本城，也可以切到全国范围。</p>
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-full border border-slate-200/80 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
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
                scope === value ? "bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
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
}: {
  posts: Awaited<ReturnType<typeof api.feed>>["items"];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  placeLabel: string;
  channelLabel: string;
}) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">最新内容</h2>
          <p className="mt-1 text-sm text-slate-500">{placeLabel}{channelLabel}相关帖子和本地信息</p>
        </div>
        {error ? (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
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
        <div className="rounded-2xl bg-slate-50/80 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-900">内容暂时无法加载</p>
          <p className="mt-1 text-sm text-slate-500">请稍后再试，或切换城市和范围。</p>
        </div>
      ) : posts.length ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-900">这个频道暂时没有内容</p>
          <p className="mt-1 text-sm text-slate-500">可以切换范围，或发布第一条相关内容。</p>
        </div>
      )}
    </section>
  );
}

function ExploreChannelSkeleton() {
  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/82 px-4 py-3 backdrop-blur-xl">
        <Skeleton className="h-9 w-48 rounded-full" />
        <Skeleton className="mt-3 h-11 w-full rounded-2xl" />
      </header>
      <main className="bg-slate-50/60 px-3 py-4 sm:px-4">
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
      return "bg-slate-600/10 text-slate-600";
  }
}
