"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useInfiniteQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Bell, MapPin } from "lucide-react";
import { api, APIError } from "@/lib/api";
import type { FeedMode, KXPost, Paginated } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { EmptyState, ErrorState, PostSkeleton } from "@/components/design/States";
import { ChannelEmptyState } from "@/components/feed/ChannelEmptyState";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/design/Avatar";
import { regionFromUser, regionHeaderLabel, type RegionInfo } from "@/lib/regions";
import clsx from "clsx";

type HotScope = "city" | "country" | "all";

export default function HomePage() {
  const [mode, setMode] = useState<FeedMode>("recommend");
  const [hotScope, setHotScope] = useState<HotScope>("city");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const setModeSmooth = (next: FeedMode) => startTransition(() => setMode(next));
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const userCountry = user?.country;
  const userProvince = user?.province;
  const userCity = user?.city;
  const userRegionCode = user?.current_region_code;
  const currentRegion = regionFromUser(user);
  const { t } = useI18n();
  const MODES: { value: FeedMode; label: string }[] = [
    { value: "recommend", label: t("tab_recommend") },
    { value: "local", label: t("tab_local") },
    { value: "following", label: t("tab_following") },
    { value: "hot", label: t("tab_hot") },
  ];
  const HOT_SCOPES: { value: HotScope; label: string }[] = [
    { value: "city", label: "城市" },
    { value: "country", label: "国家" },
    { value: "all", label: "全站" },
  ];
  // Memo'd so the feed query's useMemo deps don't see a fresh object
  // reference on every render — without this the feed re-derives the
  // ranking context on every hover/key event.
  const regionOpts = useMemo(
    () =>
      userCountry || userProvince || userCity || userRegionCode
        ? {
            country: userCountry,
            province: userProvince,
            city: userCity,
            region_code: userRegionCode,
          }
        : {},
    [userCountry, userProvince, userCity, userRegionCode],
  );
  // For the hot tab the user picks the scope explicitly (city /
  // country / all). For the local tab we always filter by region.
  // Other modes default to country so the feed is at least continent-
  // aware without being all-world.
  const feedRegionOpts = useMemo(() => {
    if (mode === "local") return regionOpts;
    if (mode === "hot") {
      if (hotScope === "city") return { region_code: regionOpts.region_code, country: regionOpts.country };
      if (hotScope === "country") return { country: regionOpts.country };
      return {} as typeof regionOpts;
    }
    return { country: regionOpts.country };
  }, [mode, hotScope, regionOpts]);

  const feed = useInfiniteQuery<Paginated<KXPost> & { mode: FeedMode }>({
    queryKey: [
      "feed",
      mode,
      mode === "hot" ? hotScope : "",
      mode === "local" ? (regionOpts.region_code || regionOpts.city || "") : (regionOpts.country || ""),
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.feed(mode, pageParam as string | undefined, feedRegionOpts),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!user && (mode !== "local" || !!(regionOpts.region_code || regionOpts.city)),
    // Show the old feed while a new mode is being fetched — no flash to
    // blank skeleton when switching 推荐 / 关注 / 热度.
    placeholderData: keepPreviousData,
    // Keep feed in cache for 30s — switching back/forth between tabs
    // no longer triggers a fresh request and the scroll position
    // survives. Garbage-collect after 5 min.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
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
      { rootMargin: "1200px 0px 1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const persistRegion = async (region: RegionInfo) => {
    try {
      const next = await api.updateMe({
        country: region.country_code,
        province: region.province_code,
        city: region.city_code,
        current_region_code: region.region_code,
      });
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["explore-hot-city"] });
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label="我的">
              <Avatar user={user} size={44} />
            </Link>
          ) : null}
          <h1 className="text-[28px] sm:text-[34px] font-black tracking-tight shrink-0 leading-none">Machi</h1>
          <button
            type="button"
            onClick={() => setRegionPickerOpen(true)}
            className="ml-auto inline-flex items-center gap-1 h-10 px-3 rounded-full bg-kx-soft text-xs font-bold text-kx-text hover:bg-kx-stroke/40 transition"
            title="切换地区"
          >
            <MapPin className="w-3.5 h-3.5 text-kx-accent" />
            <span className="max-w-[7rem] truncate">
              {regionHeaderLabel(currentRegion)}
            </span>
          </button>
          <Link
            href="/notifications"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition"
            aria-label={t("nav_notifications")}
          >
            <Bell className="w-4 h-4 text-kx-text" />
          </Link>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-kx-soft kx-tap self-start">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={clsx("kx-tab", "px-2.5 sm:px-3.5 h-8 text-sm")}
              data-active={mode === m.value}
              onClick={() => setModeSmooth(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "hot" ? (
          <div className="flex items-center gap-1 self-start">
            {HOT_SCOPES.map((s) => (
              <button
                key={s.value}
                className="kx-tab px-2.5 h-7 text-xs"
                data-active={hotScope === s.value}
                onClick={() => startTransition(() => setHotScope(s.value))}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {feed.isLoading ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : feed.isError ? (
          <ErrorState onRetry={() => feed.refetch()} subtitle="无法加载 Feed，请检查后端是否运行。" />
        ) : items.length === 0 ? (
          mode === "following" ? (
            <EmptyState
              title={t("empty_following_title")}
              subtitle={t("empty_following_subtitle")}
            />
          ) : mode === "local" && !currentRegion ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-kx-subtle">
              <div className="rounded-full bg-kx-soft p-3">
                <MapPin className="h-6 w-6 text-kx-accent" />
              </div>
              <div className="mt-3 text-base font-semibold text-kx-text">选择当前城市</div>
              <div className="mt-2 max-w-sm text-sm text-kx-subtle">同城流会根据你的当前地区展示本地动态、新闻、攻略、租房、工作、二手和活动。</div>
              <button type="button" className="kx-button-primary mt-4" onClick={() => setRegionPickerOpen(true)}>
                选择城市
              </button>
            </div>
          ) : (
            // Empty feed → invite the user to publish. Mirrors iOS
            // ChannelEmptyState.
            <ChannelEmptyState contentType="dynamic" />
          )
        ) : (
          items.map((post, i) => (
            <div
              key={post.id}
              className="animate-kx-slide-up"
              style={{ animationDelay: `${Math.min(i, 5) * 30}ms`, animationFillMode: "both" }}
            >
              <PostCard post={post} />
            </div>
          ))
        )}
        <div ref={sentinelRef} />
        {feed.isFetchingNextPage ? <PostSkeleton /> : null}
        {!feed.hasNextPage && items.length > 0 ? (
          <div className="text-center text-kx-muted text-xs py-6">{t("no_more")}</div>
        ) : null}
      </div>
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
