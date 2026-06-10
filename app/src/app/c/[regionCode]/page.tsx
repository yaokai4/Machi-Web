"use client";

import { use, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import clsx from "clsx";
import { Briefcase, ChevronLeft, Flame, Info, Leaf, Newspaper, ShoppingBag, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { ChannelEmptyState } from "@/components/feed/ChannelEmptyState";
import { ErrorState, PostSkeleton } from "@/components/design/States";
import { api } from "@/lib/api";
import {
  CITY_PRIMARY_CATEGORIES,
  CITY_PRIMARY_CHANNELS,
  CITY_PRIMARY_LABELS,
  CITY_CHANNEL_CONTENT_TYPES,
  CITY_CHANNEL_DESCRIPTIONS,
  CITY_CHANNEL_LABELS,
  CITY_CHANNELS,
  type CityPrimary,
  type CityChannelKey,
  type KXPost,
  type Paginated,
} from "@/lib/types";
import { resolveRegion, regionDisplayName, regionHeaderLabel } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";

const PRIMARY_ICONS: Record<CityPrimary, React.ComponentType<{ className?: string }>> = {
  recommend: Sparkles,
  life: Leaf,
  marketplace: ShoppingBag,
  work: Briefcase,
  social: Users,
  info: Newspaper,
};

/// Web mirror of iOS `CityChannelView`. Surfaces a 6-way primary
/// category picker and a secondary chip row scoped to the picked
/// primary so the user is never confronted with the full 17-channel
/// list at once.
export default function CityChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ regionCode: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { regionCode } = use(params);
  const { channel } = use(searchParams);
  const { locale } = useI18n();
  const decodedCode = decodeURIComponent(regionCode);
  const initialChannel = CITY_CHANNELS.includes(channel as CityChannelKey) ? (channel as CityChannelKey) : "recommend";
  const [primary, setPrimary] = useState<CityPrimary>(() => primaryForChannel(initialChannel));
  const channels = CITY_PRIMARY_CHANNELS[primary];
  const [activeChannel, setActiveChannel] = useState<CityChannelKey>(initialChannel);
  const [, startTransition] = useTransition();
  const region = useMemo(() => resolveRegion(decodedCode), [decodedCode]);

  useEffect(() => {
    const next = CITY_CHANNELS.includes(channel as CityChannelKey) ? (channel as CityChannelKey) : "recommend";
    setPrimary(primaryForChannel(next));
    setActiveChannel(next);
  }, [channel]);

  // Keep the active channel valid when the primary changes — snap to the
  // first channel of the new primary.
  useEffect(() => {
    if (!channels.includes(activeChannel)) {
      setActiveChannel(channels[0] ?? "recommend");
    }
  }, [primary, channels, activeChannel]);

  const [country, province, city] = useMemo(() => {
    // Region codes look like "cn.guangdong.shenzhen" / "jp.tokyo.tokyo" /
    // "ca.toronto". Split conservatively — anything that doesn't fit
    // the pattern falls back to using the whole code as the city slug.
    const parts = decodedCode.split(".");
    if (parts.length === 3) return [parts[0], parts[1], parts[2]];
    if (parts.length === 2) return [parts[0], "", parts[1]];
    return [decodedCode, "", ""];
  }, [decodedCode]);

  const feed = useInfiniteQuery<Paginated<KXPost>>({
    queryKey: ["city-feed", decodedCode, activeChannel],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.feed(activeChannel === "hot" ? "hot" : "local", pageParam as string | undefined, {
        region_code: decodedCode,
        country,
        province,
        city,
        content_type: CITY_CHANNEL_CONTENT_TYPES[activeChannel],
      }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!feed.hasNextPage || feed.isFetching) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) feed.fetchNextPage();
      },
      { rootMargin: "800px 0px 800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <Link href="/explore" className="grid place-items-center w-8 h-8 rounded-full bg-kx-soft text-kx-muted hover:text-kx-text">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-base font-bold tracking-tight">{regionHeaderLabel(region, locale)}</h1>
            <span className="text-[11px] text-kx-muted">城市频道 · {region ? regionDisplayName(region, locale) : decodedCode}</span>
          </div>
        </div>

        {/* Primary categories */}
        <div className="mt-2 -mx-3 px-3 flex gap-1.5 overflow-x-auto kx-scroll">
          {CITY_PRIMARY_CATEGORIES.map((p) => {
            const Icon = PRIMARY_ICONS[p];
            return (
              <button
                key={p}
                type="button"
                data-active={primary === p}
                className="kx-tab shrink-0 inline-flex items-center gap-1 px-3 h-8 text-sm whitespace-nowrap"
                onClick={() => startTransition(() => setPrimary(p))}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{CITY_PRIMARY_LABELS[p]}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary chips */}
        <div className="mt-2 -mx-3 px-3 flex gap-1.5 overflow-x-auto kx-scroll">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              data-active={activeChannel === c}
              className={clsx(
                "kx-tab shrink-0 px-2.5 h-7 text-xs whitespace-nowrap",
              )}
              onClick={() => startTransition(() => setActiveChannel(c))}
            >
              {CITY_CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-kx-md bg-kx-soft/75 px-3 py-2 text-xs font-semibold leading-5 text-kx-muted">
          {activeChannel === "hot" ? <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kx-heat" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kx-accent" />}
          <span>{CITY_CHANNEL_DESCRIPTIONS[activeChannel]}</span>
        </div>
      </header>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {feed.isLoading ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : feed.isError ? (
          <ErrorState onRetry={() => feed.refetch()} subtitle="无法加载该城市频道,请稍后重试。" />
        ) : items.length === 0 ? (
          <ChannelEmptyState contentType={CITY_CHANNEL_CONTENT_TYPES[activeChannel]?.[0] || "dynamic"} />
        ) : (
          items.map((post) => <PostCard key={post.id} post={post} />)
        )}
        <div ref={sentinelRef} />
        {feed.isFetchingNextPage ? <PostSkeleton /> : null}
        {!feed.hasNextPage && items.length > 0 ? (
          <div className="text-center text-kx-muted text-xs py-6">已经到底啦</div>
        ) : null}
      </div>
    </AppShell>
  );
}

function primaryForChannel(channel: CityChannelKey): CityPrimary {
  for (const primary of CITY_PRIMARY_CATEGORIES) {
    if (CITY_PRIMARY_CHANNELS[primary].includes(channel)) return primary;
  }
  return "recommend";
}
