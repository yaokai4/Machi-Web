"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Hash, Loader2, Plus } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useI18n, type Locale } from "@/lib/i18n";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

export default function TopicPage() {
  const params = useParams<{ tag: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const tag = decodeURIComponent(params?.tag || "");
  const topic = useQuery({
    queryKey: ["topic", tag],
    queryFn: () => api.topic(tag),
    enabled: !!tag,
  });

  // Follow state is optimistic and self-heals from the server response. On an
  // older backend the /follow endpoint 404s — we then hide the button entirely.
  const [following, setFollowing] = useState(false);
  const [followUnsupported, setFollowUnsupported] = useState(false);
  useEffect(() => {
    if (typeof topic.data?.following === "boolean") setFollowing(topic.data.following);
  }, [topic.data?.following]);

  const followMutation = useMutation({
    mutationFn: (next: boolean) => api.followTopic(tag, next),
    onMutate: (next) => {
      const prev = following;
      setFollowing(next);
      return { prev };
    },
    onError: (err, _next, ctx) => {
      setFollowing(ctx?.prev ?? false);
      if (err instanceof APIError && err.status === 404) {
        setFollowUnsupported(true);
        return;
      }
      pushToast({ kind: "error", message: err instanceof Error ? err.message : t("topic_follow_failed") });
    },
    onSuccess: (_data, next) => {
      pushToast({ kind: "success", message: next ? t("topic_followed") : t("topic_unfollowed") });
    },
  });

  const onToggleFollow = () => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    followMutation.mutate(!following);
  };

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label={pick(locale, "返回", "戻る", "Back")}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1 font-semibold text-lg">
          <Hash className="w-4 h-4 shrink-0 text-kx-accent" /> <span className="truncate">{tag}</span>
        </div>
        {!followUnsupported ? (
          <button
            type="button"
            onClick={onToggleFollow}
            disabled={followMutation.isPending}
            className={[
              "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-bold transition disabled:opacity-60",
              following
                ? "border border-kx-stroke bg-kx-card text-kx-subtle hover:border-kx-accent/40"
                : "bg-kx-accent text-white hover:brightness-105",
            ].join(" ")}
          >
            {followMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : following ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {following ? t("topic_following") : t("topic_follow")}
          </button>
        ) : null}
      </header>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {topic.isLoading ? (
          <InlineLoading />
        ) : topic.isError ? (
          <ErrorState onRetry={() => topic.refetch()} />
        ) : !topic.data?.items.length ? (
          <EmptyState
            title={pick(locale, "这个话题还没有帖子", "この話題にはまだ投稿がありません", "No posts in this topic yet")}
            subtitle={pick(locale, "成为第一个发布的人。", "最初の投稿者になりましょう。", "Be the first to post.")}
          />
        ) : (
          topic.data.items.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </AppShell>
  );
}
