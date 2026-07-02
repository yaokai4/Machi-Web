"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Bell, BellRing, Flame, History, Hash, Search as SearchIcon, X, Trash2, TrendingUp, Loader2, BookOpen, Package } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading, PostSkeleton } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";
import { NavTabs } from "@/components/design/NavTabs";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToMarketingLocale, useI18n } from "@/lib/i18n";
import { compactNumber } from "@/lib/format";
import { getCityBySlug } from "@/config/cities";
import {
  cleanListingText,
  formatListingType,
  formatPrice as formatListingPrice,
  listingSectionForType,
} from "@/lib/listingFormat";
import type { KXCityListing, KXPost } from "@/lib/types";

type Kind = "all" | "post" | "listing" | "user" | "topic" | "guide";

/// Same Suspense gating as /login — Next.js 15 wants the boundary.
export default function SearchPage() {
  return (
    <Suspense fallback={<AppShell requireAuth={false}><InlineLoading /></AppShell>}>
      <SearchPageInner />
    </Suspense>
  );
}

function listingSearchHref(listing: Pick<KXCityListing, "id" | "type" | "city_slug">) {
  const section = listingSectionForType(listing.type);
  return `/cities/${listing.city_slug || "tokyo"}/${section}/${listing.id}`;
}

function listingCityLabel(citySlug?: string | null, fallback = "本地") {
  const slug = cleanListingText(citySlug);
  return getCityBySlug(slug)?.name || slug || fallback;
}

function SearchPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const listingLocale = appLocaleToMarketingLocale(locale);
  const KIND_LABEL: Record<Kind, string> = {
    all: t("nav_search"),
    post: t("search_kind_posts"),
    listing: t("search_kind_listings"),
    user: t("search_users"),
    topic: t("search_topics"),
    guide: t("search_kind_guide"),
  };
  const KIND_VALUES: Kind[] = ["all", "post", "listing", "user", "topic", "guide"];
  const initialQuery = params.get("q") || "";
  const initialKindParam = params.get("kind");
  const initialKind: Kind = KIND_VALUES.includes(initialKindParam as Kind) ? (initialKindParam as Kind) : "all";
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [submitted, setSubmitted] = useState(initialQuery);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  // Keep the active tab in sync when the URL changes externally (back/forward,
  // deep link, share). The URL is the source of truth for the kind tab.
  useEffect(() => {
    setKind(KIND_VALUES.includes(initialKindParam as Kind) ? (initialKindParam as Kind) : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKindParam]);

  // Build a /search URL preserving the current query + the given kind.
  const searchUrl = (q: string, k: Kind) => {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    if (k !== "all") usp.set("kind", k);
    const qs = usp.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  };

  // A submit is a distinct search — push it so it becomes a back-button step.
  const submit = (q: string) => {
    const trimmed = q.trim();
    setSubmitted(trimmed);
    router.push(searchUrl(trimmed, kind));
  };

  // Tab switch is a refinement of the same search — replace so it doesn't
  // clutter history, but still round-trips through the URL so the tab is
  // shareable and survives refresh.
  const selectKind = (k: Kind) => {
    setKind(k);
    router.replace(searchUrl(submitted, k), { scroll: false });
  };

  const search = useQuery({
    queryKey: ["search", submitted, kind],
    queryFn: () => api.search(submitted, kind),
    enabled: !!submitted,
    // Keep the previous results on screen while a new query/tab is fetching so
    // the page doesn't fade to a blank "is it broken?" state between keystrokes
    // and tab switches. `isFetching` + `isPlaceholderData` drive a subtle
    // in-place loading hint instead of a full-page swap.
    placeholderData: keepPreviousData,
  });
  // First-ever search for the current submit (no cached/previous data yet).
  const searchFirstLoad = search.isLoading && !search.data;
  // Refetching while stale results are still shown (query/tab changed).
  const searchRefreshing = search.isFetching && search.isPlaceholderData;

  const history = useQuery({
    queryKey: ["search-history"],
    queryFn: () => api.searchHistory(),
    enabled: true,
  });
  const showResults = !!submitted;
  const weeklyLikes = useQuery({
    queryKey: ["trending-weekly-likes", 7],
    queryFn: () => api.trendingWeeklyLikes({ days: 7, limit: 8 }),
    staleTime: 60_000,
    enabled: !showResults,
  });

  const clearHistory = async () => {
    try {
      await api.clearSearchHistory();
      queryClient.invalidateQueries({ queryKey: ["search-history"] });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  // 订阅当前关键词(保存搜索):换一个关键词后按钮回到可订阅态。
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const [savedSearchFor, setSavedSearchFor] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const searchSaved = !!submitted && savedSearchFor === submitted;
  const saveCurrentSearch = async () => {
    if (!user) {
      openAuthPrompt("saveSearch");
      return;
    }
    if (searchSaved || savingSearch || !submitted) return;
    setSavingSearch(true);
    try {
      await api.createSavedSearch({ keyword: submitted });
      setSavedSearchFor(submitted);
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setSavingSearch(false);
    }
  };

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-3">
        <div className="mx-auto flex max-w-kx-feed items-center gap-2">
          <div className="kx-glass-capsule flex h-12 flex-1 items-center gap-2.5 px-3.5">
            <SearchIcon className="h-5 w-5 shrink-0 text-kx-accent" />
            <input
              type="search"
              aria-label={t("nav_search")}
              className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-kx-text placeholder:text-kx-muted focus:outline-none"
              placeholder={t("search_placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(query);
              }}
            />
            {query ? (
              <button
                className="kx-liquid-button grid h-8 w-8 place-items-center text-kx-muted hover:text-kx-text"
                onClick={() => { setQuery(""); submit(""); }}
                aria-label={t("search_clear")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {showResults ? (
        <div>
          <div className="sticky top-[52px] z-20">
            <NavTabs
              items={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={kind}
              onChange={(v) => selectKind(v as Kind)}
              equalWidth
            />
          </div>

          {search.isError && !search.data ? (
            <ErrorState onRetry={() => search.refetch()} />
          ) : searchFirstLoad ? (
            <div className="px-3 sm:px-4 py-3 space-y-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">{t("search_searching")}</span>
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </div>
          ) : !search.data ? (
            <InlineLoading />
          ) : (
            <div
              className={`px-3 sm:px-4 py-3 space-y-3 transition-opacity ${searchRefreshing ? "opacity-60" : "opacity-100"}`}
              aria-busy={searchRefreshing}
              aria-live="polite"
            >
              {searchRefreshing ? (
                <div className="flex items-center justify-center gap-2 py-1 text-xs font-semibold text-kx-muted" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("search_searching")}
                </div>
              ) : null}
              {(kind === "all" || kind === "user") && search.data!.users.length > 0 ? (
                <section className="kx-card p-0 overflow-hidden">
                  <h3 className="kx-section-title px-4 pt-3">{t("search_users")}</h3>
                  <ul className="mt-2">
                    {search.data!.users.map((u) => (
                      <li key={u.id} className="px-4 py-2.5 hover:bg-kx-soft flex items-center gap-2.5">
                        <Avatar user={u} size={40} href={`/u/${u.handle}`} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/u/${u.handle}`} className="font-semibold hover:underline truncate flex items-center gap-1">
                            {u.display_name}
                            {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                          </Link>
                          <div className="text-kx-muted text-xs">@{u.handle}</div>
                          {u.bio ? <div className="text-sm text-kx-subtle line-clamp-1 mt-0.5">{u.bio}</div> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(kind === "all" || kind === "topic") && search.data!.topics.length > 0 ? (
                <section className="kx-card">
                  <h3 className="kx-section-title mb-3 px-0">{t("search_topics")}</h3>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {search.data!.topics.map((topic) => (
                      <li key={topic.tag}>
                        <Link href={`/t/${encodeURIComponent(topic.tag)}`} className="flex items-center gap-2 hover:underline">
                          <Hash className="w-3.5 h-3.5 text-kx-accent" />
                          <span className="font-semibold text-sm truncate">{topic.tag}</span>
                          <span className="text-xs text-kx-muted ml-auto">{topic.post_count} {t("search_topic_post_suffix")}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(kind === "all" || kind === "listing") && (search.data!.listings || []).length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="kx-section-title px-0">{t("search_listing_label")}</h3>
                    <button
                      type="button"
                      onClick={saveCurrentSearch}
                      disabled={savingSearch}
                      className="inline-flex items-center gap-1.5 rounded-full border border-kx-stroke/60 bg-kx-card px-3 py-1 text-xs font-bold text-kx-subtle transition hover:border-kx-accent/40 hover:text-kx-accent disabled:opacity-60"
                    >
                      {searchSaved ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                      {searchSaved ? t("search_save_search_done") : t("search_save_search")}
                    </button>
                  </div>
                  {search.data!.listings.map((listing) => <SearchListingCard key={listing.id} listing={listing} locale={listingLocale} localFallback={t("search_local_city")} />)}
                </section>
              ) : null}

              {(kind === "all" || kind === "guide") && (search.data!.guide || []).length > 0 ? (
                <section className="space-y-2">
                  <h3 className="kx-section-title px-1">{t("search_kind_guide")}</h3>
                  {(search.data!.guide || []).map((g) => (
                    <Link
                      key={`${g.kind}-${g.id}`}
                      href={g.kind === "article" ? `/guide/articles/${g.slug}` : `/guide/products/${g.slug}`}
                      className="flex items-center gap-3 rounded-2xl border border-kx-stroke/45 bg-kx-card/70 px-4 py-3 transition hover:border-kx-accent/40"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kx-accent/10 text-kx-accent">
                        {g.kind === "article" ? <BookOpen className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-kx-text">{g.title}</span>
                        {g.subtitle ? <span className="block truncate text-xs text-kx-subtle">{g.subtitle}</span> : null}
                      </span>
                    </Link>
                  ))}
                </section>
              ) : null}

              {(kind === "all" || kind === "post") && search.data!.posts.length > 0 ? (
                <section className="space-y-3">
                  {search.data!.posts.map((post) => <PostCard key={post.id} post={post} />)}
                </section>
              ) : null}

              {search.data!.posts.length === 0 && (search.data!.listings || []).length === 0 && search.data!.users.length === 0 && search.data!.topics.length === 0 && (search.data!.guide || []).length === 0 ? (
                <EmptyState title={t("search_empty_title")} subtitle={t("search_empty_subtitle")} />
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 sm:px-4 py-4 space-y-3">
          {history.data && history.data.length > 0 ? (
            <section className="kx-card">
              <div className="flex items-center mb-3">
                <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5">
                  <History className="w-4 h-4" /> {t("search_history")}
                </h3>
                <button onClick={clearHistory} className="ml-auto text-xs text-kx-muted hover:text-kx-danger inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> {t("search_clear")}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.data.map((q) => (
                  <button
                    key={q}
                    className="kx-glass-capsule text-xs font-semibold px-3 py-1 text-kx-text hover:border-kx-accent/35"
                    onClick={() => { setQuery(q); submit(q); }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {!history.data || history.data.length === 0 ? (
            <EmptyState title={t("search_start_title")} subtitle={t("search_start_subtitle")} />
          ) : null}

          {weeklyLikes.data && weeklyLikes.data.posts.length > 0 ? (
            <section className="kx-card overflow-hidden">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5 text-kx-text">
                  <TrendingUp className="w-4 h-4 text-kx-accent" /> {t("search_recent_likes_title")}
                </h3>
                <span className="rounded-full border border-kx-stroke/70 bg-kx-soft/70 px-2.5 py-1 text-[11px] font-bold text-kx-muted">{t("search_recent_likes_badge")}</span>
              </div>
              <ol className="flex flex-col">
                {weeklyLikes.data.posts.slice(0, 6).map((post, idx) => (
                  <li key={post.id} className="border-b border-kx-stroke/55 last:border-0">
                    <Link href={`/p/${post.id}`} className="group flex items-start gap-3 py-2.5">
                      <span className={idx < 3
                        ? "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kx-heat/25 bg-kx-heat/10 text-sm font-black text-kx-heat"
                        : "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kx-accent/20 bg-kx-accentSoft/60 text-sm font-black text-kx-accent"}>
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-5 text-kx-text line-clamp-2 group-hover:text-kx-accent">
                          {post.content || String(post.attributes?.title || t("search_post_fallback"))}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-kx-muted">
                          @{post.author?.handle || "machi"}
                          <span>·</span>
                          <Flame className="h-3.5 w-3.5 text-kx-heat/80" />
                          {compactNumber(weeklyLikeCount(post))}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function weeklyLikeCount(post: KXPost & Partial<KXCityPostLikeCount>): number {
  return Number(post.weekly_like_count || post.weeklyLikes || 0);
}

type KXCityPostLikeCount = {
  weekly_like_count?: number;
  weeklyLikes?: number;
};

function SearchListingCard({ listing, locale, localFallback }: { listing: KXCityListing; locale: "zh" | "en" | "ja"; localFallback: string }) {
  const city = listingCityLabel(listing.city_slug, localFallback);
  const title = cleanListingText(listing.title) || formatListingType(listing.type, locale);
  const location = cleanListingText(listing.location_text) || cleanListingText(listing.category) || city;
  return (
    <Link
      href={listingSearchHref(listing)}
      className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-slate-300 sm:grid-cols-[96px_1fr] dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 sm:aspect-square dark:bg-white/[0.06]">
        {listing.cover_url ? <Image src={listing.cover_url} alt={title} fill sizes="96px" className="object-cover" unoptimized /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">{formatListingType(listing.type, locale)}</span>
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{city}</span>
        </div>
        <h4 className="mt-2 line-clamp-1 text-base font-black text-slate-950 dark:text-white">{title}</h4>
        <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{formatListingPrice(listing, undefined, locale)}</p>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">{location}</p>
      </div>
    </Link>
  );
}
