"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, ExternalLink, MessageCircle, Send, Share2 } from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { NEWS_CATEGORY_LABELS } from "@/components/news/LocalNewsStrip";
import { fullDateTime, relativeTime } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

function newsCityLabel(city?: string | null): string {
  const normalized = String(city || "").trim().toLowerCase();
  if (normalized === "tokyo") return "Tokyo";
  if (normalized === "osaka") return "Osaka";
  return "Japan-wide";
}

export default function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const user = useSession((s) => s.user);
  const [comment, setComment] = useState("");

  const detail = useQuery({
    queryKey: ["news-detail", id],
    queryFn: () => api.newsDetail(id),
    staleTime: 30_000,
  });
  const comments = useQuery({
    queryKey: ["news-comments", id],
    queryFn: () => api.newsComments(id),
    enabled: !!detail.data,
  });
  const save = useMutation({
    mutationFn: (next: boolean) => api.saveNews(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["news"] });
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("bookmark");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  const shareMetric = useMutation({
    mutationFn: () => api.shareNews(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-detail", id] }),
  });
  const sourceClick = useMutation({
    mutationFn: () => api.trackNewsSourceClick(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-detail", id] }),
  });
  const sendComment = useMutation({
    mutationFn: () => api.createNewsComment(id, comment),
    onSuccess: () => {
      setComment("");
      comments.refetch();
      queryClient.invalidateQueries({ queryKey: ["news-detail", id] });
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) {
        openAuthPrompt("comment");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      shareMetric.mutate();
      pushToast({ kind: "success", message: "链接已复制" });
    } catch {
      pushToast({ kind: "error", message: "复制失败" });
    }
  };

  if (detail.isLoading) {
    return <AppShell requireAuth={false}><InlineLoading /></AppShell>;
  }
  if (detail.isError || !detail.data) {
    return <AppShell requireAuth={false}><ErrorState onRetry={() => detail.refetch()} subtitle="这条资讯可能已隐藏或删除。" /></AppShell>;
  }

  const post = detail.data.post;

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/news" className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-muted hover:text-kx-text">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">本地资讯</h1>
          <p className="truncate text-[11px] text-kx-muted">{post.author_display_name}</p>
        </div>
        <button type="button" onClick={copyLink} className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-muted hover:text-kx-text" aria-label="分享">
          <Share2 className="h-4 w-4" />
        </button>
      </header>

      <article className="px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-kx-muted">
          <span className="rounded-full bg-kx-accentSoft px-2 py-1 text-kx-accent">{NEWS_CATEGORY_LABELS[post.category] || post.category}</span>
          <span>{newsCityLabel(post.city)}</span>
          <span>{post.language}</span>
          {post.published_at ? <span>{relativeTime(post.published_at)}</span> : null}
        </div>

        <h2 className="text-2xl font-black leading-tight tracking-normal text-kx-text">{post.title}</h2>

        <div className="mt-4 flex items-center gap-2 rounded-kx-md bg-kx-soft/70 px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-kx-md bg-kx-accent text-white font-black">M</div>
          <div className="min-w-0">
            <div className="text-sm font-bold">{post.author_display_name}</div>
            <div className="text-xs text-kx-muted">Machi 官方编辑部</div>
          </div>
        </div>

        {post.summary ? (
          <p className="mt-4 rounded-kx-md border border-kx-stroke/50 bg-kx-card px-3 py-3 text-sm font-semibold leading-6 text-kx-text">
            {post.summary}
          </p>
        ) : null}

        <div className="prose prose-sm max-w-none whitespace-pre-wrap py-5 leading-7 text-kx-text dark:prose-invert">
          {post.body}
        </div>

        <div className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/60 px-3 py-3 text-sm">
          <div className="font-bold text-kx-text">来源：{post.source_name || "Machi Local Desk"}</div>
          {post.source_published_at ? <div className="mt-1 text-xs text-kx-muted">原文发布时间：{fullDateTime(post.source_published_at)}</div> : null}
          {(post.original_url || post.source_url) ? (
            <a href={post.original_url || post.source_url || "#"} target="_blank" rel="noreferrer" onClick={() => sourceClick.mutate()} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-kx-accent">
              查看原文 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {(post.official_source_required || post.risk_level === "high") ? (
          <div className="mt-3 rounded-kx-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold leading-5 text-kx-text">
            此内容由 Machi 编辑部根据公开来源整理，具体信息请以官方发布为准。
          </div>
        ) : null}

        {post.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-kx-soft px-2 py-1 text-xs font-semibold text-kx-muted">#{tag}</span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2 border-y border-kx-stroke/40 py-3">
          <button
            type="button"
            onClick={() => {
              if (!user) {
                openAuthPrompt("bookmark");
                return;
              }
              save.mutate(!post.saved);
            }}
            className="kx-button-ghost h-9"
            disabled={save.isPending}
          >
            <Bookmark className={post.saved ? "h-4 w-4 fill-current" : "h-4 w-4"} />
            {post.saved ? "已收藏" : "收藏"} {post.save_count}
          </button>
          <button type="button" onClick={copyLink} className="kx-button-ghost h-9">
            <Share2 className="h-4 w-4" /> 分享 {post.share_count}
          </button>
        </div>
      </article>

      <section className="px-4 pb-5">
        <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-black">
          <MessageCircle className="h-4 w-4 text-kx-accent" /> 评论
        </h3>
        <div className="mb-3 flex gap-2">
          {user ? <Avatar user={user} size={34} /> : null}
          <input
            className="kx-input h-10 flex-1"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onFocus={() => {
              if (!user) openAuthPrompt("comment");
            }}
            placeholder={user ? "写一条评论" : "登录后可以评论"}
            readOnly={!user}
          />
          <button
            className="kx-button-primary h-10 px-3"
            disabled={user ? !comment.trim() || sendComment.isPending : sendComment.isPending}
            onClick={() => {
              if (!user) {
                openAuthPrompt("comment");
                return;
              }
              sendComment.mutate();
            }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {comments.isLoading ? <InlineLoading /> : (
          <div className="space-y-2">
            {(comments.data || []).map((item) => (
              <div key={item.id} className="rounded-kx-md bg-kx-card px-3 py-2">
                <div className="text-xs font-bold text-kx-muted">{item.author?.display_name || "Machi 用户"} · {relativeTime(item.created_at)}</div>
                <div className="mt-1 text-sm leading-6">{item.content}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {detail.data.related.length > 0 ? (
        <section className="px-4 pb-8">
          <h3 className="mb-3 text-sm font-black">相关内容</h3>
          <div className="space-y-2">
            {detail.data.related.map((item) => (
              <Link href={`/news/${item.id}`} key={item.id} className="block rounded-kx-md bg-kx-card px-3 py-2 hover:bg-kx-soft transition">
                <div className="line-clamp-1 text-sm font-bold">{item.title}</div>
                <div className="mt-0.5 text-xs text-kx-muted">{NEWS_CATEGORY_LABELS[item.category] || item.category}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
