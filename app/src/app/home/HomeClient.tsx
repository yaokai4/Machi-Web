"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useInfiniteQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import type { FeedMode, KXPost, Paginated } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { ErrorState, PostSkeleton } from "@/components/design/States";
import { ChannelEmptyState } from "@/components/feed/ChannelEmptyState";
import dynamic from "next/dynamic";
// Code-split the region picker (~385 lines) out of the home entry chunk —
// it's only mounted when the user opens the city selector.
const RegionPickerDialog = dynamic(
  () => import("@/components/feed/RegionPickerDialog").then((m) => m.RegionPickerDialog),
  { ssr: false },
);
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";
import { Avatar } from "@/components/design/Avatar";
import { regionAccountPatch, regionFromUser, regionHeaderLabel, regionShortLabel, type RegionInfo } from "@/lib/regions";
import clsx from "clsx";

export default function HomeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<FeedMode>("recommend");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [, startTransition] = useTransition();
  // Scroll-aware header: deepen the glass bar's shadow once the user scrolls
  // a little, so content reads as sliding *under* a floating bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const setModeSmooth = (next: FeedMode) => startTransition(() => setMode(next));
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const userCountry = user?.country;
  const userProvince = user?.province;
  const userCity = user?.city;
  const userRegionCode = user?.current_region_code;
  const currentRegion = regionFromUser(user);
  const { t, locale } = useI18n();
  const copy = homeCopy(locale);
  const MODES: { value: FeedMode; label: string }[] = [
    { value: "recommend", label: t("tab_recommend") },
    { value: "hot", label: t("tab_hot") },
    { value: "local", label: t("tab_local") },
    { value: "following", label: t("tab_following") },
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
  // Hot follows the selected city in the top region chip, matching iOS.
  // This removes the duplicated city/country/all row under 热榜.
  const feedRegionOpts = useMemo(() => {
    if (mode === "local") return regionOpts;
    if (mode === "hot") return { region_code: regionOpts.region_code, country: regionOpts.country };
    return { country: regionOpts.country };
  }, [mode, regionOpts]);

  const feed = useInfiniteQuery<Paginated<KXPost> & { mode: FeedMode }>({
    queryKey: [
      "feed",
      mode,
      mode === "hot" ? (regionOpts.region_code || regionOpts.city || regionOpts.country || "") : "",
      mode === "local" ? (regionOpts.region_code || regionOpts.city || "") : (regionOpts.country || ""),
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.feed(mode, pageParam as string | undefined, feedRegionOpts),
    getNextPageParam: (last) => last?.next_cursor ?? undefined,
    enabled: (mode !== "following" || !!user) && (mode !== "local" || !!(regionOpts.region_code || regionOpts.city)),
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
  // Depend only on the stable values this effect actually uses — NOT the whole
  // `feed` object (React Query returns a fresh object almost every render, which
  // would tear down + rebuild the observer constantly). fetchNextPage is stable.
  const feedHasNextPage = feed.hasNextPage;
  const feedIsFetching = feed.isFetching;
  const feedFetchNextPage = feed.fetchNextPage;
  useEffect(() => {
    if (!feedHasNextPage || feedIsFetching) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) feedFetchNextPage();
      },
      { rootMargin: "1200px 0px 1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feedHasNextPage, feedIsFetching, feedFetchNextPage]);

  const items = feed.data?.pages.flatMap((p) => (Array.isArray(p.items) ? p.items : [])) ?? [];

  const persistRegion = async (region: RegionInfo) => {
    try {
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["explore-hot-city"] });
      pushToast({ kind: "success", message: copy.switched(regionShortLabel(region, locale)) });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };
  const goToSearch = (value: string) => {
    const query = value.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const submitSearch = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const formValue = event ? String(new FormData(event.currentTarget).get("q") || "") : "";
    goToSearch(formValue || searchDraft);
  };

  return (
    <AppShell requireAuth={false}>
      <div data-scrolled={scrolled ? "true" : "false"} className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label={t("nav_profile")}>
              <Avatar user={user} size={44} />
            </Link>
          ) : null}
          <h1 className="text-[28px] font-black tracking-tight shrink-0 leading-none md:hidden">Machi</h1>
          <button
            type="button"
            onClick={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-white/95 px-3 text-sm font-black text-kx-text shadow-[0_14px_34px_-26px_rgba(37,99,235,0.75)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/35 dark:bg-kx-card/[0.9] dark:hover:bg-kx-accentSoft/55"
            title={copy.switchRegion}
          >
            <span className="max-w-[7.5rem] truncate">
              {regionHeaderLabel(currentRegion, locale)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-kx-muted" />
          </button>
          {user ? (
            <Link
              href="/notifications"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-white/95 text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60 dark:bg-kx-card/[0.88]"
              aria-label={t("nav_notifications")}
            >
              <Bell className="h-[18px] w-[18px] text-kx-text" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/55 bg-white/95 text-kx-text shadow-[0_14px_32px_-26px_rgba(17,22,34,0.65)] transition hover:border-kx-accent/30 hover:bg-kx-accentSoft/60 dark:bg-kx-card/[0.88]"
              aria-label={t("nav_notifications")}
            >
              <Bell className="h-[18px] w-[18px] text-kx-text" />
            </button>
          )}
        </div>
        {/* Tabs + search merged into one slim row to reclaim vertical space:
            tabs on the left, a compact search pill to the right of 关注. */}
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-kx-stroke/40 bg-white/[0.82] p-1 shadow-[0_12px_28px_-24px_rgba(17,22,34,0.55)] ring-1 ring-white/[0.65] dark:bg-kx-card/[0.82] dark:ring-white/10">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={clsx("kx-tab", "px-2 sm:px-3 h-8 text-sm")}
                data-active={mode === m.value}
                onClick={() => setModeSmooth(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <form onSubmit={submitSearch} className="ml-auto min-w-0 flex-1 sm:max-w-[17rem]">
            <label className="group flex h-9 items-center gap-2 rounded-full border border-kx-accent/[0.16] bg-white/[0.94] pl-3 pr-3 shadow-[0_12px_30px_-26px_rgba(17,22,34,0.6)] ring-1 ring-white/70 transition focus-within:border-kx-accent/[0.4] focus-within:ring-2 focus-within:ring-kx-accent/20 dark:bg-kx-card/[0.88] dark:ring-white/10">
              <Search className="h-4 w-4 shrink-0 text-kx-accent" />
              <input
                name="q"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  goToSearch(event.currentTarget.value);
                }}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.search}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-kx-text placeholder:font-medium placeholder:text-kx-muted focus:outline-none"
              />
            </label>
          </form>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {feed.isLoading ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : feed.isError ? (
          <ErrorState title={copy.loadErrorTitle} onRetry={() => feed.refetch()} subtitle={copy.loadErrorSubtitle} />
        ) : items.length === 0 ? (
          mode === "following" ? (
            // Following tab is no longer a dead/silent tab for guests: it offers
            // a path forward (sign up + discover) instead of just blocking.
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-kx-subtle">
              <div className="rounded-full bg-kx-soft p-3">
                <Users className="h-6 w-6 text-kx-accent" />
              </div>
              <div className="mt-3 text-base font-semibold text-kx-text">
                {user ? t("empty_following_title") : t("following_guest_title")}
              </div>
              <div className="mt-2 max-w-sm text-sm text-kx-subtle">
                {user ? t("empty_following_subtitle") : t("following_guest_subtitle")}
              </div>
              <div className="mt-4 flex items-center gap-2">
                {!user ? (
                  <button type="button" className="kx-button-primary" onClick={() => openAuthPrompt("follow")}>
                    {t("following_guest_cta")}
                  </button>
                ) : null}
                <Link href="/explore" className="kx-button-secondary">
                  {t("following_discover_cta")}
                </Link>
              </div>
            </div>
          ) : mode === "local" && !currentRegion ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-kx-subtle">
              <div className="rounded-full bg-kx-soft p-3">
                <MapPin className="h-6 w-6 text-kx-accent" />
              </div>
              <div className="mt-3 text-base font-semibold text-kx-text">{copy.pickCityTitle}</div>
              <div className="mt-2 max-w-sm text-sm text-kx-subtle">{copy.pickCitySubtitle}</div>
              <button type="button" className="kx-button-primary mt-4" onClick={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}>
                {copy.pickCityAction}
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
      {regionPickerOpen && (
        <RegionPickerDialog
          open={regionPickerOpen}
          onClose={() => setRegionPickerOpen(false)}
          onSelect={persistRegion}
          initialCountry={user?.country || currentRegion?.country_code || "jp"}
          allowsAnyCountry={false}
        />
      )}
    </AppShell>
  );
}

function homeCopy(locale: Locale) {
  switch (locale) {
    case "en":
      return {
        switchRegion: "Switch region",
        search: "Search",
        searchPlaceholder: "Search users, posts, news, trending…",
        switched: (region: string) => `Switched to ${region}`,
        loadErrorTitle: "This page cannot load right now",
        loadErrorSubtitle: "The home feed cannot load at the moment. Please try again later.",
        pickCityTitle: "Choose your current city",
        pickCitySubtitle: "The local feed uses your current region to show local updates, lived experience, Q&A, guide snippets, and event discussions.",
        pickCityAction: "Choose City",
      };
    case "ja":
      return {
        switchRegion: "地域を切り替え",
        search: "検索",
        searchPlaceholder: "ユーザー・投稿・ニュース・話題を検索…",
        switched: (region: string) => `${region}に切り替えました`,
        loadErrorTitle: "ページを読み込めません",
        loadErrorSubtitle: "ホームフィードを現在読み込めません。時間を置いてもう一度お試しください。",
        pickCityTitle: "現在の街を選択",
        pickCitySubtitle: "地域フィードは現在の地域をもとに、ローカル情報、体験談、Q&A、ガイド、イベントの会話を表示します。",
        pickCityAction: "街を選択",
      };
    case "zh-Hant":
      return {
        switchRegion: "切換地區",
        search: "搜尋",
        searchPlaceholder: "搜尋用戶、貼文、新聞、熱搜…",
        switched: (region: string) => `已切換到 ${region}`,
        loadErrorTitle: "頁面暫時無法載入",
        loadErrorSubtitle: "首頁內容暫時無法載入，請稍後再試。",
        pickCityTitle: "選擇目前城市",
        pickCitySubtitle: "同城流會根據你的目前地區展示本地動態、經驗分享、問答、攻略片段和活動討論。",
        pickCityAction: "選擇城市",
      };
    default:
      return {
        switchRegion: "切换地区",
        search: "搜索",
        searchPlaceholder: "搜索用户、帖子、新闻、热搜…",
        switched: (region: string) => `已切换到 ${region}`,
        loadErrorTitle: "页面暂时无法加载",
        loadErrorSubtitle: "首页内容暂时无法加载，请稍后再试。",
        pickCityTitle: "选择当前城市",
        pickCitySubtitle: "同城流会根据你的当前地区展示本地动态、经验分享、问答、攻略片段和活动讨论。",
        pickCityAction: "选择城市",
      };
  }
}
