"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, History, Hash, MapPin, Search as SearchIcon, X, Trash2, TrendingUp } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { showVerifiedBadge } from "@/lib/types";
import { NavTabs } from "@/components/design/NavTabs";
import { useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { compactNumber } from "@/lib/format";

type Kind = "all" | "post" | "user" | "topic";

/// Same Suspense gating as /login — Next.js 15 wants the boundary.
export default function SearchPage() {
  return (
    <Suspense fallback={<AppShell requireAuth={false}><InlineLoading /></AppShell>}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const KIND_LABEL: Record<Kind, string> = {
    all: t("nav_search"),
    post: t("profile_section_posts"),
    user: t("search_users"),
    topic: t("search_topics"),
  };
  const initialQuery = params.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>("all");
  const [submitted, setSubmitted] = useState(initialQuery);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    setSubmitted(trimmed);
    const usp = new URLSearchParams(trimmed ? { q: trimmed } : {});
    router.replace(`/search${trimmed ? `?${usp.toString()}` : ""}`);
  };

  const search = useQuery({
    queryKey: ["search", submitted, kind],
    queryFn: () => api.search(submitted, kind),
    enabled: !!submitted,
  });

  const history = useQuery({
    queryKey: ["search-history"],
    queryFn: () => api.searchHistory(),
    enabled: true,
  });
  const popularRegions = useQuery({
    queryKey: ["popular-regions"],
    queryFn: () => api.popularRegions(),
    staleTime: 5 * 60_000,
    enabled: !!user,
  });
  const showResults = !!submitted;
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
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

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-3">
        <div className="mx-auto flex max-w-kx-feed items-center gap-2">
          <div className="kx-glass-capsule flex h-12 flex-1 items-center gap-2.5 px-3.5">
            <SearchIcon className="h-5 w-5 shrink-0 text-kx-accent" />
            <input
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
                aria-label="清空"
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
              onChange={(v) => setKind(v as Kind)}
              equalWidth
            />
          </div>

          {search.isError ? (
            <ErrorState onRetry={() => search.refetch()} />
          ) : !search.data ? (
            <InlineLoading />
          ) : (
            <div className="px-3 sm:px-4 py-3 space-y-3">
              {(kind === "all" || kind === "user") && search.data!.users.length > 0 ? (
                <section className="kx-card p-0 overflow-hidden">
                  <h3 className="kx-section-title px-4 pt-3">用户</h3>
                  <ul className="mt-2">
                    {search.data!.users.map((u) => (
                      <li key={u.id} className="px-4 py-2.5 hover:bg-kx-soft flex items-center gap-2.5">
                        <Avatar user={u} size={40} href={`/u/${u.handle}`} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/u/${u.handle}`} className="font-semibold hover:underline truncate flex items-center gap-1">
                            {u.display_name}
                            {showVerifiedBadge(u) ? <VerifiedBadge /> : null}
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
                  <h3 className="kx-section-title mb-3 px-0">话题</h3>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {search.data!.topics.map((t) => (
                      <li key={t.tag}>
                        <Link href={`/t/${encodeURIComponent(t.tag)}`} className="flex items-center gap-2 hover:underline">
                          <Hash className="w-3.5 h-3.5 text-kx-accent" />
                          <span className="font-semibold text-sm truncate">{t.tag}</span>
                          <span className="text-xs text-kx-muted ml-auto">{t.post_count} 帖</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(kind === "all" || kind === "post") && search.data!.posts.length > 0 ? (
                <section className="space-y-3">
                  {search.data!.posts.map((post) => <PostCard key={post.id} post={post} />)}
                </section>
              ) : null}

              {search.data!.posts.length === 0 && search.data!.users.length === 0 && search.data!.topics.length === 0 ? (
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
                  <History className="w-4 h-4" /> 搜索历史
                </h3>
                <button onClick={clearHistory} className="ml-auto text-xs text-kx-muted hover:text-kx-danger inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> 清空
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
            <EmptyState title="开始搜索" subtitle="输入关键词查找帖子、用户、话题。" />
          ) : null}

          {trending.data && trending.data.posts.length > 0 ? (
            <section className="kx-card overflow-hidden">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5 text-kx-text">
                  <TrendingUp className="w-4 h-4 text-kx-accent" /> 正在发生
                </h3>
                <span className="rounded-full border border-kx-stroke/70 bg-kx-soft/70 px-2.5 py-1 text-[11px] font-bold text-kx-muted">本地热度</span>
              </div>
              <ol className="flex flex-col">
                {trending.data.posts.slice(0, 6).map((post, idx) => (
                  <li key={post.id} className="border-b border-kx-stroke/55 last:border-0">
                    <Link href={`/p/${post.id}`} className="group flex items-start gap-3 py-2.5">
                      <span className={idx < 3
                        ? "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kx-heat/25 bg-kx-heat/10 text-sm font-black text-kx-heat"
                        : "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kx-accent/20 bg-kx-accentSoft/60 text-sm font-black text-kx-accent"}>
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-5 text-kx-text line-clamp-2 group-hover:text-kx-accent">
                          {post.content || String(post.attributes?.title || "本地动态")}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-kx-muted">
                          @{post.author?.handle || "unknown"}
                          <span>·</span>
                          <Flame className="h-3.5 w-3.5 text-kx-heat/80" />
                          {compactNumber(post.heat_score)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {popularRegions.data && popularRegions.data.length > 0 ? (
            <section className="kx-card">
              <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-kx-accent" /> 热门城市
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {popularRegions.data.slice(0, 12).map((region) => (
                  <Link
                    key={region.region_code}
                    href={`/c/${encodeURIComponent(region.region_code)}`}
                    className="kx-glass-capsule inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold hover:border-kx-accent/35"
                  >
                    <span>{region.country_emoji || "🌐"}</span>
                    <span>{region.city_name}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
