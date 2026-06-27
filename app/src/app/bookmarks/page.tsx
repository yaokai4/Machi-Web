"use client";

import { useQuery } from "@tanstack/react-query";
import { Bookmark as BookmarkIcon } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useSession } from "@/lib/store";
import type { KXPost } from "@/lib/types";

export default function BookmarksPage() {
  const me = useSession((s) => s.user);
  const query = useQuery({
    queryKey: ["bookmarks", me?.id],
    queryFn: () => api.userPosts(me!.id, { segment: "bookmarks" }) as Promise<{ items: KXPost[]; next_cursor: string | null }>,
    enabled: !!me,
  });
  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <h1 className="text-lg font-bold">收藏</h1>
      </header>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        {query.isLoading ? (
          <InlineLoading />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : !query.data?.items.length ? (
          <EmptyState title="还没有收藏" subtitle="在 Feed 中点击书签图标即可收藏帖子。" icon={BookmarkIcon} action={{ label: "去逛逛", href: "/home" }} />
        ) : (
          query.data.items.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </AppShell>
  );
}
