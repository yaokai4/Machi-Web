"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  Languages,
  MapPin,
  MessageCircle,
  Newspaper,
  PlusCircle,
  Search,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import type { FeedMode, KXPost, Paginated } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { NewsCard } from "@/components/news/NewsCard";
import { EmptyState, ErrorState, PostSkeleton } from "@/components/design/States";
import { ChannelEmptyState } from "@/components/feed/ChannelEmptyState";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { TodayInCityRail } from "@/components/feed/TodayInCityRail";
import { useAuthPrompt, useCompose, useSession, useSettings, useToasts } from "@/lib/store";
import { useI18n, useUiLocale, type Locale } from "@/lib/i18n";
import { Avatar } from "@/components/design/Avatar";
import { LocalNewsStrip } from "@/components/news/LocalNewsStrip";
import { regionFromUser, regionHeaderLabel, type RegionInfo } from "@/lib/regions";
import clsx from "clsx";

type HotScope = "city" | "country" | "all";
// Home tabs are the real feed modes plus a dedicated 资讯 view (rendered
// from api.news rather than the post feed).
type HomeTab = FeedMode | "news";
const HOME_TAB_VALUES: HomeTab[] = ["recommend", "plaza", "news", "local", "hot", "following"];

function isHomeTab(value: string | null): value is HomeTab {
  return !!value && HOME_TAB_VALUES.includes(value as HomeTab);
}

function contentLangLabel(locale: string): string {
  if (locale === "en") return "English";
  if (locale === "ja") return "日本語";
  return "中文";
}

/** Interface-language switcher. Works for guests and logged-in users
 *  alike via the local UI-locale override (see i18n `useUiLocale`). */
function LanguageMenu({ label, current }: { label: string; current: Locale }) {
  const setOverride = useUiLocale((s) => s.setOverride);
  const user = useSession((s) => s.user);
  const setSettings = useSettings((s) => s.setSettings);
  const pushToast = useToasts((s) => s.push);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const OPTIONS: { value: Locale; label: string }[] = [
    { value: "zh-Hans", label: "中文" },
    { value: "en", label: "English" },
    { value: "ja", label: "日本語" },
  ];

  const selectLocale = (value: Locale) => {
    setOverride(value);
    setOpen(false);
    if (!user) return;
    void api
      .updateSettings({ language: value })
      .then(setSettings)
      .catch(() => {
        pushToast({ kind: "error", message: "语言已在本机切换，但同步到账号失败。" });
      });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1 rounded-full bg-kx-soft px-2.5 text-xs font-bold text-kx-subtle transition hover:bg-kx-stroke/40"
        title="切换界面语言"
      >
        <Languages className="h-3.5 w-3.5 text-kx-accent" />
        <span className="truncate">{label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 w-32 overflow-hidden rounded-kx-md border border-kx-stroke/60 bg-kx-card p-1 shadow-lg"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              role="menuitem"
              type="button"
              onClick={() => selectLocale(o.value)}
              className={clsx(
                "block w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition",
                o.value === current ? "bg-kx-accentSoft text-kx-accent" : "text-kx-text hover:bg-kx-soft",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact "Today in city" banner for narrow screens (hidden on `xl`,
 * where the right rail carries the city summary). Replaces the old wall
 * of static demo cards: one calm card that states where you are, the
 * brand line, and the three things a newcomer most wants — publish,
 * search, membership.
 */
function CityBanner({
  cityName,
  countryName,
  langLabel,
  onPublish,
}: {
  cityName: string;
  countryName: string;
  langLabel: string;
  onPublish: () => void;
}) {
  return (
    <section className="kx-card !p-4">
      <div className="text-[11px] font-bold tracking-wide text-kx-muted">本地生活</div>
      <h2 className="mt-1 text-xl font-black leading-tight tracking-tight text-kx-text">
        {cityName} 今天的生活回声
      </h2>
      <p className="mt-1 text-sm leading-6 text-kx-subtle">在每一座城市，找到生活的回声。</p>
      <p className="mt-0.5 text-xs font-semibold text-kx-muted">
        {countryName} · {cityName} · {langLabel}内容
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onPublish} className="kx-button-primary h-9 px-3.5 text-sm">
          <PlusCircle className="h-4 w-4" /> 发布本地经验
        </button>
        <Link href="/search" className="kx-button-ghost h-9 px-3.5 text-sm">
          <Search className="h-4 w-4" /> 搜索同城
        </Link>
        <Link href="/membership" className="kx-button-ghost h-9 px-3.5 text-sm">
          <BadgeCheck className="h-4 w-4" /> 认证会员
        </Link>
      </div>
    </section>
  );
}

const COLD_START_PROMPTS = [
  "问一个本地问题",
  "分享一次租房经验",
  "发布一个二手物品",
  "找一个饭搭子",
  "推荐一个本地服务",
  "补充一条避坑提醒",
];

/**
 * Cold-start invite — shown only when the feed is empty. During early
 * launch a city can have little user content; rather than a bare "暂无
 * 内容", this states (honestly, as 编辑部) that the city is filling in,
 * routes to the real 资讯 / 搜索 surfaces, and offers concrete first
 * posts. No fabricated users or fake counts.
 */
function ColdStartCard({ onPublish }: { onPublish: () => void }) {
  return (
    <section className="kx-card !p-4">
      <div className="text-[11px] font-bold tracking-wide text-kx-muted">MACHI 编辑部</div>
      <h3 className="mt-1 text-base font-black text-kx-text">这座城市正在变热</h3>
      <p className="mt-1 text-sm leading-6 text-kx-subtle">
        已有本地资讯、指南和问题陆续整理中。你可以先看看，或者发布第一条内容。
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {COLD_START_PROMPTS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={onPublish}
            className="rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-text hover:bg-kx-stroke/40"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
        <Link href="/news" className="text-kx-accent hover:underline">看本地资讯</Link>
        <span className="text-kx-muted">·</span>
        <Link href="/search" className="text-kx-accent hover:underline">搜索本地内容</Link>
      </div>
    </section>
  );
}

/** 资讯 tab — paginated editorial news for the current region. */
function HomeNewsFeed({ country, city, cityLabel }: { country?: string; city?: string; cityLabel?: string }) {
  const q = useInfiniteQuery({
    queryKey: ["home-news-feed", country || "", city || ""],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.news({ country, city, limit: 12, page: pageParam as number }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!q.hasNextPage || q.isFetching) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) q.fetchNextPage();
      },
      { rootMargin: "800px 0px 800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [q]);

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }
  if (q.isError) {
    return <ErrorState onRetry={() => q.refetch()} subtitle="无法加载本地资讯，请稍后再试。" />;
  }

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <section className="kx-card flex flex-col items-center !p-6 text-center">
        <div className="rounded-full bg-kx-soft p-3">
          <Newspaper className="h-6 w-6 text-kx-accent" />
        </div>
        <div className="mt-3 text-base font-bold text-kx-text">今天还没有新的本地资讯</div>
        <p className="mt-1 max-w-sm text-sm leading-6 text-kx-subtle">
          Machi 编辑部会持续整理交通、政策、安全和生活提醒。
        </p>
        <Link href="/news" className="kx-button-ghost mt-4 h-9 px-4 text-sm">前往本地资讯台</Link>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <NewsCard key={item.id} item={item} contextCity={cityLabel || city} />
      ))}
      <div ref={sentinelRef} />
      {q.isFetchingNextPage ? <PostSkeleton /> : null}
      {!q.hasNextPage ? (
        <div className="px-4 py-6 text-center text-xs leading-5 text-kx-muted">
          今天先看到这里。有新的本地资讯时，Machi 编辑部会继续整理。
        </div>
      ) : null}
    </div>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("recommend");
  const [hotScope, setHotScope] = useState<HotScope>("city");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
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
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const compose = useCompose((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const userCountry = user?.country;
  const userProvince = user?.province;
  const userCity = user?.city;
  const userRegionCode = user?.current_region_code;
  const currentRegion = regionFromUser(user);
  const { t, locale } = useI18n();
  const langLabel = contentLangLabel(locale);
  const cityName = currentRegion?.city_name || "东京";
  const countryName = currentRegion?.country_name || "日本";
  const cityButtonLabel = currentRegion ? regionHeaderLabel(currentRegion) : cityName;
  const goPublish = () => (user ? compose() : openAuthPrompt("publish"));
  const goPickCity = () => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"));
  const setTabSmooth = (next: HomeTab) => {
    startTransition(() => setTab(next));
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "recommend") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(`/home${query ? `?${query}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    const applyTabFromLocation = () => {
      const next = new URLSearchParams(window.location.search).get("tab");
      if (!isHomeTab(next)) return;
      if (next === "following" && !user) {
        openAuthPrompt("follow");
        return;
      }
      setTab(next);
    };
    applyTabFromLocation();
    window.addEventListener("popstate", applyTabFromLocation);
    return () => window.removeEventListener("popstate", applyTabFromLocation);
  }, [user, openAuthPrompt]);

  useEffect(() => {
    const onHomeTab = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isHomeTab(detail)) return;
      if (detail === "following" && !user) {
        openAuthPrompt("follow");
        return;
      }
      startTransition(() => setTab(detail));
      const params = new URLSearchParams(window.location.search);
      if (detail === "recommend") params.delete("tab");
      else params.set("tab", detail);
      const query = params.toString();
      router.replace(`/home${query ? `?${query}` : ""}`, { scroll: false });
    };
    window.addEventListener("machi:home-tab", onHomeTab);
    return () => window.removeEventListener("machi:home-tab", onHomeTab);
  }, [user, openAuthPrompt, router]);

  useEffect(() => {
    const onOpenRegionPicker = () => {
      if (user) setRegionPickerOpen(true);
      else openAuthPrompt("generic");
    };
    window.addEventListener("machi:open-region-picker", onOpenRegionPicker);
    return () => window.removeEventListener("machi:open-region-picker", onOpenRegionPicker);
  }, [user, openAuthPrompt]);

  const isNews = tab === "news";
  // Feed mode for the post feed (news tab borrows recommend's ranking
  // context but never actually fetches — see `enabled`).
  const mode: FeedMode = tab === "news" ? "recommend" : tab;

  const TABS: { value: HomeTab; label: string }[] = [
    { value: "recommend", label: t("tab_recommend") },
    { value: "plaza", label: "广场" },
    { value: "news", label: t("nav_news") },
    { value: "local", label: t("tab_local") },
    { value: "hot", label: t("tab_hot") },
    { value: "following", label: t("tab_following") },
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
    if (mode === "local" || mode === "plaza") return regionOpts;
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
      mode === "local" || mode === "plaza" ? (regionOpts.region_code || regionOpts.city || "") : (regionOpts.country || ""),
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.feed(mode, pageParam as string | undefined, { ...feedRegionOpts, limit: 12 }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled:
      !isNews &&
      (mode !== "following" || !!user) &&
      (mode !== "local" || !!(regionOpts.region_code || regionOpts.city)),
    // Show the old feed while a new mode is being fetched — no flash to
    // blank skeleton when switching 推荐 / 关注 / 热度.
    placeholderData: keepPreviousData,
    // Keep feed in cache for 30s — switching back/forth between tabs
    // no longer triggers a fresh request and the scroll position
    // survives. Garbage-collect after 5 min.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Editorial news for the city. Same query key + params as the right
  // rail so the two share one cached request. Used to interleave 资讯
  // into the 推荐 feed so news genuinely mixes in.
  const homeNews = useQuery({
    queryKey: ["today-in-city-news", currentRegion?.country_code || "", currentRegion?.city_code || ""],
    queryFn: () => api.news({ country: currentRegion?.country_code, city: currentRegion?.city_code, limit: 8 }),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
  const inlineNews = homeNews.data?.items ?? [];

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

  // Build the feed render list, interleaving a real NewsCard after every
  // 4 posts in 推荐 (capped at the news we have).
  const feedNodes: ReactNode[] = [];
  items.forEach((post, i) => {
    feedNodes.push(
      <div
        key={post.id}
        className="animate-kx-slide-up"
        style={{ animationDelay: `${Math.min(i, 5) * 30}ms`, animationFillMode: "both" }}
      >
        <PostCard post={post} />
      </div>,
    );
    if (tab === "recommend" && (i + 1) % 4 === 0) {
      const newsItem = inlineNews[Math.floor((i + 1) / 4) - 1];
      if (newsItem) {
        // In-feed news is desktop-only: on narrow screens the top
        // "今日本地资讯" strip already surfaces the same items, so showing
        // them again interleaved would read as duplication.
        feedNodes.push(
          <div key={`news-${newsItem.id}`} className="hidden xl:block animate-kx-slide-up">
            <NewsCard item={newsItem} contextCity={cityName} />
          </div>,
        );
      }
    }
  });

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
      queryClient.invalidateQueries({ queryKey: ["today-in-city-news"] });
      queryClient.invalidateQueries({ queryKey: ["home-news-feed"] });
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell
      requireAuth={false}
      right={tab === "recommend" ? <TodayInCityRail region={currentRegion} langLabel={langLabel} /> : undefined}
    >
      <div data-scrolled={scrolled ? "true" : "false"} className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2 flex flex-col gap-2">
        {/* Row 1 — city context: who's here, which city, which language. */}
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label="我的" className="shrink-0">
              <Avatar user={user} size={40} />
            </Link>
          ) : null}
          <h1 className="text-2xl font-black tracking-tight shrink-0 leading-none md:hidden">Machi</h1>
          <button
            type="button"
            onClick={goPickCity}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-kx-soft text-sm font-bold text-kx-text hover:bg-kx-stroke/40 transition"
            title="切换城市"
          >
            <MapPin className="w-3.5 h-3.5 text-kx-accent" />
            <span className="max-w-[7rem] truncate">{cityButtonLabel}</span>
          </button>
          <LanguageMenu label={langLabel} current={locale} />
          <div className="ml-auto flex items-center gap-1">
            {user ? (
              <Link
                href="/messages"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition lg:hidden"
                aria-label={t("nav_messages")}
              >
                <MessageCircle className="w-4 h-4 text-kx-text" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthPrompt("message")}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition lg:hidden"
                aria-label={t("nav_messages")}
              >
                <MessageCircle className="w-4 h-4 text-kx-text" />
              </button>
            )}
            {user ? (
              <Link
                href="/notifications"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition"
                aria-label={t("nav_notifications")}
              >
                <Bell className="w-4 h-4 text-kx-text" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuthPrompt("generic")}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition"
                aria-label={t("nav_notifications")}
              >
                <Bell className="w-4 h-4 text-kx-text" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2 — search (always) + publish CTA (wide screens). */}
        <div className="flex items-center gap-2">
          <Link href="/search" className="flex min-h-10 flex-1 items-center gap-2 rounded-full bg-kx-soft px-3 text-sm text-kx-muted hover:bg-kx-stroke/40">
            <Search className="h-4 w-4 text-kx-accent" />
            <span className="truncate">搜索租房、饭搭子、工作、活动、本地问题…</span>
          </Link>
          <button type="button" onClick={goPublish} className="kx-button-primary hidden h-10 px-4 sm:inline-flex">
            <PlusCircle className="h-4 w-4" /> 发布
          </button>
        </div>

        {/* Row 3 — home tabs (feed modes + 资讯). */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-kx-soft kx-tap self-start max-w-full overflow-x-auto">
          {TABS.map((m) => (
            <button
              key={m.value}
              className={clsx("kx-tab shrink-0", "px-2.5 sm:px-3.5 h-8 text-sm")}
              data-active={tab === m.value}
              onClick={() => (m.value === "following" && !user ? openAuthPrompt("follow") : setTabSmooth(m.value))}
            >
              {m.label}
            </button>
          ))}
        </div>
        {tab === "hot" ? (
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
        {/* City summary + news live in the right rail on `xl`; on narrower
            screens the city banner stays as context, while local news only
            opens the recommendation surface instead of repeating on every tab. */}
        <div className="xl:hidden">
          <CityBanner cityName={cityName} countryName={countryName} langLabel={langLabel} onPublish={goPublish} />
        </div>
        {tab === "recommend" ? (
          <div className="xl:hidden">
            <LocalNewsStrip
              country={currentRegion?.country_code || userCountry}
              city={currentRegion?.city_code || userCity}
              title="今日本地资讯"
            />
          </div>
        ) : null}

        {isNews ? (
          <HomeNewsFeed country={currentRegion?.country_code || userCountry} city={currentRegion?.city_code || userCity} cityLabel={cityName} />
        ) : feed.isLoading ? (
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
              <button type="button" className="kx-button-primary mt-4" onClick={goPickCity}>
                选择城市
              </button>
            </div>
          ) : (
            // Empty feed → cold-start invite + publish prompt (mirrors
            // the iOS ChannelEmptyState).
            <div className="space-y-3">
              <ColdStartCard onPublish={goPublish} />
              <ChannelEmptyState contentType="dynamic" />
            </div>
          )
        ) : (
          feedNodes
        )}
        {!isNews && items.length > 0 ? (
          <>
            <div ref={sentinelRef} />
            {feed.isFetchingNextPage ? <PostSkeleton /> : null}
            {!feed.hasNextPage ? (
              <div className="px-4 py-6 text-center text-xs leading-5 text-kx-muted">
                今天先看到这里。有新的本地动态时，Machi 会继续带回来。
              </div>
            ) : null}
          </>
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
