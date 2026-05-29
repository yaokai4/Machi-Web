"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Trash2, Send, Flag } from "lucide-react";
import clsx from "clsx";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { PostSpecificDetailSection } from "@/components/feed/PostSpecificDetail";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { compactNumber, relativeTime } from "@/lib/format";
import { useSession, useToasts } from "@/lib/store";
import { ConfirmDialog } from "@/components/design/Dialog";
import type { KXComment } from "@/lib/types";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const id = params?.id as string;

  const [sort, setSort] = useState<"top" | "new">("top");
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const postQuery = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.post(id),
    enabled: !!id,
  });

  const commentsQuery = useQuery({
    queryKey: ["comments", id, sort],
    queryFn: () => api.comments(id, sort),
    enabled: !!id,
  });

  // Send a view bump so heat reflects desktop reads as well. We do
  // it once per id by keying the effect on `id`.
  useEffect(() => {
    if (id) {
      api.viewPost(id).catch(() => undefined);
    }
  }, [id]);

  const submitReply = async () => {
    const text = reply.trim();
    if (!text) return;
    try {
      await api.createComment(id, {
        content: text,
        parent_comment_id: replyTo?.id,
        reply_to_user_id: replyTo?.userId,
      });
      setReply("");
      setReplyTo(null);
      commentsQuery.refetch();
      postQuery.refetch();
      pushToast({ kind: "success", message: "评论已发布" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const deleteComment = async (cid: string) => {
    try {
      await api.deleteComment(cid);
      setPendingDelete(null);
      commentsQuery.refetch();
      pushToast({ kind: "success", message: "已删除" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const toggleCommentLike = async (c: KXComment) => {
    const next = !c.liked;
    queryClient.setQueryData<KXComment[]>(["comments", id, sort], (old) =>
      (old || []).map((x) => x.id === c.id ? { ...x, liked: next, like_count: c.like_count + (next ? 1 : -1) } : x),
    );
    try {
      await api.toggleCommentLike(c.id, next);
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
      commentsQuery.refetch();
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label="返回">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-center font-semibold">帖子详情</h1>
        <span />
      </header>

      {postQuery.isLoading ? (
        <InlineLoading />
      ) : postQuery.isError || !postQuery.data ? (
        <ErrorState onRetry={() => postQuery.refetch()} subtitle="帖子可能已删除或不存在。" />
      ) : (
        <div className="px-3 sm:px-4 py-3 space-y-3">
          <PostCard
            post={postQuery.data}
            onDeleted={() => {
              // On the detail page the only sensible thing to do after
              // delete is to leave — the post is gone.
              router.replace("/home");
            }}
          />

          <PostSpecificDetailSection post={postQuery.data} />

          <section className="kx-card">
            <header className="flex items-center gap-2 mb-3">
              <h2 className="kx-section-title px-0 inline-flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> 评论 {compactNumber(postQuery.data.comment_count)}
              </h2>
              <div className="ml-auto flex items-center gap-1 rounded-full bg-kx-soft p-1 text-xs ring-1 ring-kx-stroke/60">
                <button className={clsx("kx-tab h-7 px-3 text-xs")} data-active={sort === "top"} onClick={() => setSort("top")}>高赞</button>
                <button className={clsx("kx-tab h-7 px-3 text-xs")} data-active={sort === "new"} onClick={() => setSort("new")}>最新</button>
              </div>
            </header>

            {user ? (
              <div className="flex gap-2.5 items-start mb-4">
                <Avatar user={user} size={36} />
                <div className="flex-1">
                  {replyTo ? (
                    <div className="text-xs text-kx-subtle mb-1 inline-flex items-center gap-1">
                      正在回复 <span className="text-kx-accent">@{replyTo.name}</span>
                      <button className="text-kx-muted hover:text-kx-text" onClick={() => setReplyTo(null)}>取消</button>
                    </div>
                  ) : null}
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="kx-textarea h-16 sm:h-20"
                    placeholder={replyTo ? "回复评论…" : "写下你的想法…"}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        submitReply();
                      }
                    }}
                    maxLength={2000}
                  />
                  <div className="flex justify-end mt-2">
                    <button className="kx-button-primary h-9" onClick={submitReply} disabled={!reply.trim()}>
                      <Send className="w-4 h-4" /> 发布
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-kx-subtle text-center py-3">
                <Link href="/login" className="kx-link">登录</Link> 后即可评论。
              </div>
            )}

            {commentsQuery.isLoading ? (
              <InlineLoading />
            ) : commentsQuery.isError ? (
              <ErrorState onRetry={() => commentsQuery.refetch()} />
            ) : (commentsQuery.data || []).length === 0 ? (
              <EmptyState title="还没有评论" subtitle="来说两句吧。" />
            ) : (
              <ul className="space-y-3">
                {(commentsQuery.data || []).map((c) => {
                  const canDelete = user?.id === c.author_id || user?.id === postQuery.data!.author_id;
                  return (
                    <li key={c.id} className="flex gap-2.5">
                      <Avatar user={c.author || undefined} size={36} href={c.author ? `/u/${c.author.handle}` : undefined} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Link href={`/u/${c.author?.handle}`} className="font-semibold text-sm truncate hover:underline">
                            {c.author?.display_name || "用户"}
                          </Link>
                          {c.author?.is_verified ? <VerifiedBadge /> : null}
                          <span className="text-kx-muted text-xs truncate">@{c.author?.handle} · {relativeTime(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-kx-text whitespace-pre-wrap break-words mt-0.5">{c.content}</p>
                        <div className="flex items-center gap-1 mt-1.5 text-xs">
                          <button className="kx-metric h-7" onClick={() => toggleCommentLike(c)} data-active={c.liked ? "like" : undefined}>
                            ♥ {compactNumber(c.like_count)}
                          </button>
                          <button
                            className="kx-metric h-7"
                            onClick={() =>
                              setReplyTo({
                                id: c.id,
                                userId: c.author_id,
                                name: c.author?.handle || "用户",
                              })
                            }
                          >
                            回复
                          </button>
                          {canDelete ? (
                            <button className="kx-metric h-7 text-kx-danger" onClick={() => setPendingDelete(c.id)}>
                              <Trash2 className="w-3.5 h-3.5" /> 删除
                            </button>
                          ) : (
                            <button
                              className="kx-metric h-7"
                              onClick={async () => {
                                try {
                                  await api.reportComment(c.id, "inappropriate");
                                  pushToast({ kind: "success", message: "举报已提交" });
                                } catch (err) {
                                  pushToast({ kind: "error", message: (err as APIError).message });
                                }
                              }}
                            >
                              <Flag className="w-3.5 h-3.5" /> 举报
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这条评论？"
        description="删除后无法恢复。"
        destructive
        confirmLabel="删除"
        onConfirm={() => pendingDelete && deleteComment(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}
