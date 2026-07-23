"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flame, Hash, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState } from "@/components/design/States";
import { FeedSkeletonList } from "@/components/feed/FeedSkeleton";
import { PostCard } from "@/components/feed/PostCard";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useI18n, type Locale } from "@/lib/i18n";

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

export default function TrendingPage() {
  const { locale } = useI18n();
  const trending = useQuery({
    queryKey: ["trending-page"],
    queryFn: () => api.trending(),
    staleTime: 60_000,
  });

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-kx-heat" />
          <h1 className="text-xl font-bold">{pick(locale, "热榜", "トレンド", "Trending")}</h1>
        </div>
        <p className="mt-1 text-sm text-kx-muted">
          {pick(
            locale,
            "正在被本地用户讨论的帖子和话题。",
            "地元のユーザーが今話している投稿と話題。",
            "Posts and topics your local community is talking about right now.",
          )}
        </p>
      </header>

      {trending.isError ? (
        <ErrorState onRetry={() => trending.refetch()} />
      ) : trending.isLoading || !trending.data ? (
        // Post-shaped skeletons instead of a bare spinner — the swap to real
        // trending cards doesn't jump.
        <FeedSkeletonList className="px-3 sm:px-4 py-3" />
      ) : (
        <main className="px-3 sm:px-4 py-3 space-y-3">
          <section className="kx-card">
            <h2 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-kx-accent" />
              {pick(locale, "热门话题", "人気の話題", "Trending topics")}
            </h2>
            {trending.data.topics.length ? (
              <div className="flex flex-wrap gap-2">
                {trending.data.topics.slice(0, 12).map((topic) => (
                  <Link
                    key={topic.tag}
                    href={`/t/${encodeURIComponent(topic.tag)}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-kx-soft px-3 py-1.5 text-sm font-semibold transition hover:bg-kx-accentSoft hover:text-kx-accent"
                  >
                    <Hash className="w-3.5 h-3.5 text-kx-accent" />
                    <span className="truncate max-w-[10rem]">{topic.tag}</span>
                    <span className="text-xs text-kx-muted">{compactNumber(topic.post_count)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-kx-muted">
                {pick(locale, "还没有热门话题。", "まだ人気の話題はありません。", "No trending topics yet.")}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="kx-section-title px-1 inline-flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-kx-heat" />
              {pick(locale, "热门帖子", "人気の投稿", "Trending posts")}
            </h2>
            {trending.data.posts.length ? (
              trending.data.posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="kx-card text-sm text-kx-muted">
                {pick(locale, "还没有热门帖子。", "まだ人気の投稿はありません。", "No trending posts yet.")}
              </div>
            )}
          </section>
        </main>
      )}
    </AppShell>
  );
}
