"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flame, Hash, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";

export default function TrendingPage() {
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
          <h1 className="text-xl font-black">热榜</h1>
        </div>
        <p className="mt-1 text-sm text-kx-muted">正在被本地用户讨论的帖子和话题。</p>
      </header>

      {trending.isError ? (
        <ErrorState onRetry={() => trending.refetch()} />
      ) : trending.isLoading || !trending.data ? (
        <InlineLoading />
      ) : (
        <main className="px-3 sm:px-4 py-3 space-y-3">
          <section className="kx-card">
            <h2 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-kx-accent" />
              热门话题
            </h2>
            {trending.data.topics.length ? (
              <div className="flex flex-wrap gap-2">
                {trending.data.topics.slice(0, 12).map((topic) => (
                  <Link key={topic.tag} href={`/t/${encodeURIComponent(topic.tag)}`} className="inline-flex items-center gap-1.5 rounded-full bg-kx-soft px-3 py-1.5 text-sm font-semibold hover:bg-kx-stroke/40">
                    #{topic.tag}
                    <span className="text-xs text-kx-muted">{compactNumber(topic.post_count)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-kx-muted">还没有热门话题。</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="kx-section-title px-1 inline-flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-kx-heat" />
              热门帖子
            </h2>
            {trending.data.posts.length ? (
              trending.data.posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="kx-card text-sm text-kx-muted">还没有热门帖子。</div>
            )}
          </section>
        </main>
      )}
    </AppShell>
  );
}
