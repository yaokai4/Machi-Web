"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Hash } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";

export default function TopicPage() {
  const params = useParams<{ tag: string }>();
  const router = useRouter();
  const tag = decodeURIComponent(params?.tag || "");
  const topic = useQuery({
    queryKey: ["topic", tag],
    queryFn: () => api.topic(tag),
    enabled: !!tag,
  });

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label="返回">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 font-semibold text-lg">
          <Hash className="w-4 h-4 text-kx-accent" /> {tag}
        </div>
      </header>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {topic.isLoading ? (
          <InlineLoading />
        ) : topic.isError ? (
          <ErrorState onRetry={() => topic.refetch()} />
        ) : !topic.data?.items.length ? (
          <EmptyState title="这个话题还没有帖子" subtitle="成为第一个发布的人。" />
        ) : (
          topic.data.items.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </AppShell>
  );
}
