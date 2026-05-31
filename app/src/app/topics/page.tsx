"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hash, Search } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";

export default function TopicsPage() {
  const trending = useQuery({
    queryKey: ["topics-page"],
    queryFn: () => api.topics(),
    staleTime: 60_000,
  });

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-kx-accent" />
          <h1 className="text-xl font-black">话题</h1>
        </div>
        <Link href="/search?kind=topic" className="mt-3 h-10 rounded-kx-md bg-kx-soft text-kx-muted px-3 flex items-center gap-2 text-sm">
          <Search className="w-4 h-4" />
          搜索帖子、用户、话题
        </Link>
      </header>

      {trending.isError ? (
        <ErrorState onRetry={() => trending.refetch()} />
      ) : trending.isLoading || !trending.data ? (
        <InlineLoading />
      ) : trending.data.topics.length === 0 ? (
        <div className="p-4 text-sm text-kx-muted">还没有热门话题。</div>
      ) : (
        <main className="px-3 sm:px-4 py-3">
          <section className="kx-card">
            <h2 className="kx-section-title mb-3 px-0">话题排行榜</h2>
            <ul className="divide-y divide-kx-stroke/50">
              {trending.data.topics.map((topic, index) => (
                <li key={topic.tag}>
                  <Link href={`/t/${encodeURIComponent(topic.tag)}`} className="flex items-center gap-3 py-3 group">
                    <span className="w-7 text-right text-kx-accent font-black">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold group-hover:underline">#{topic.tag}</span>
                    <span className="text-xs text-kx-muted">{compactNumber(topic.post_count)} 帖</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </AppShell>
  );
}
