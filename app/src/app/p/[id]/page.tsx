"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Trash2, Send, Flag, Heart } from "lucide-react";
import clsx from "clsx";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { PostSpecificDetailSection } from "@/components/feed/PostSpecificDetail";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { compactNumber, relativeTime } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { ConfirmDialog } from "@/components/design/Dialog";
import { useI18n } from "@/lib/i18n";
import type { KXComment, KXUser } from "@/lib/types";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const id = params?.id as string;

  const [sort, setSort] = useState<"top" | "new">("top");
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; parentId: string; userId: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const postQuery = useQuery({
    queryKey: ["post", id],
    queryFn: () => api.post(id),
    enabled: !!id,
    retry: false,
  });

  const commentsQuery = useQuery({
    queryKey: ["comments", id, sort],
    queryFn: () => api.comments(id, sort),
    enabled: !!id,
    retry: false,
  });
  const commentThreads = useMemo(() => buildCommentThreads(commentsQuery.data || []), [commentsQuery.data]);

  // Send a view bump so heat reflects desktop reads as well. We do
  // it once per id by keying the effect on `id`.
  useEffect(() => {
    if (id) {
      api.viewPost(id).catch(() => undefined);
    }
  }, [id]);

  const submitReply = async () => {
    if (!user) {
      openAuthPrompt("comment");
      return;
    }
    const text = reply.trim();
    if (!text) return;
    try {
      await api.createComment(id, {
        content: text,
        parent_comment_id: replyTo?.parentId || replyTo?.id,
        reply_to_user_id: replyTo?.userId,
      });
      setReply("");
      setReplyTo(null);
      commentsQuery.refetch();
      postQuery.refetch();
      pushToast({ kind: "success", message: t("comment_published") });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("comment");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const deleteComment = async (cid: string) => {
    try {
      await api.deleteComment(cid);
      setPendingDelete(null);
      commentsQuery.refetch();
      pushToast({ kind: "success", message: t("comment_deleted") });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const toggleCommentLike = async (c: KXComment) => {
    if (!user) {
      openAuthPrompt("like");
      return;
    }
    const next = !c.liked;
    queryClient.setQueryData<KXComment[]>(["comments", id, sort], (old) =>
      (old || []).map((x) => x.id === c.id ? { ...x, liked: next, like_count: c.like_count + (next ? 1 : -1) } : x),
    );
    try {
      await api.toggleCommentLike(c.id, next);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("like");
        commentsQuery.refetch();
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
      commentsQuery.refetch();
    }
  };

  return (
    <AppShell requireAuth={false}>
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
                <MessageCircle className="w-4 h-4" /> {t("comments")} {compactNumber(postQuery.data.comment_count)}
              </h2>
              <div className="ml-auto flex items-center gap-1 rounded-full bg-kx-soft p-1 text-xs ring-1 ring-kx-stroke/60">
                <button className={clsx("kx-tab h-7 px-3 text-xs")} data-active={sort === "top"} onClick={() => setSort("top")}>{t("comment_sort_top")}</button>
                <button className={clsx("kx-tab h-7 px-3 text-xs")} data-active={sort === "new"} onClick={() => setSort("new")}>{t("comment_sort_new")}</button>
              </div>
            </header>

            {user ? (
              <div className="flex gap-2.5 items-start mb-4">
                <Avatar user={user} size={36} />
                <div className="flex-1">
                  {replyTo ? (
                    <div className="text-xs text-kx-subtle mb-1 inline-flex items-center gap-1">
                      正在回复 <span className="text-kx-accent">@{replyTo.name}</span>
                      <button className="text-kx-muted hover:text-kx-text" onClick={() => setReplyTo(null)}>{t("action_cancel")}</button>
                    </div>
                  ) : null}
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="kx-textarea h-16 sm:h-20"
                    placeholder={replyTo ? t("comment_reply_placeholder") : t("comment_placeholder")}
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
                      <Send className="w-4 h-4" /> {t("action_publish")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-kx-subtle text-center py-3">
                <button type="button" onClick={() => openAuthPrompt("comment")} className="kx-link font-bold">{t("login")}</button> 后即可评论。
              </div>
            )}

            {commentsQuery.isLoading ? (
              <InlineLoading />
            ) : commentsQuery.isError ? (
              <ErrorState onRetry={() => commentsQuery.refetch()} />
            ) : (commentsQuery.data || []).length === 0 ? (
              <EmptyState title={t("comment_empty_title")} subtitle={t("comment_empty_subtitle")} />
            ) : (
              <ul className="space-y-3">
                {commentThreads.map(({ root, replies }) => {
                  return (
                    <li key={root.id} className="rounded-kx-md border border-kx-stroke/45 bg-kx-card/70 p-3">
                      <CommentItem
                        comment={root}
                        rootId={root.id}
                        currentUser={user}
                        postAuthorId={postQuery.data!.author_id}
                        onLike={toggleCommentLike}
                        onReply={(comment, rootId) =>
                          user
                            ? setReplyTo({
                                id: comment.id,
                                parentId: rootId,
                                userId: comment.author_id,
                                name: comment.author?.handle || "用户",
                              })
                            : openAuthPrompt("comment")
                        }
                        onDelete={setPendingDelete}
                        onReport={async (comment) => {
                          if (!user) {
                            openAuthPrompt("generic");
                            return;
                          }
                          try {
                            await api.reportComment(comment.id, "inappropriate");
                            pushToast({ kind: "success", message: t("post_report_done") });
                          } catch (err) {
                            if (isAuthRequiredError(err)) {
                              openAuthPrompt("generic");
                              return;
                            }
                            pushToast({ kind: "error", message: (err as APIError).message });
                          }
                        }}
                      />
                      {replies.length ? (
                        <div className="mt-3 space-y-3 border-l-2 border-kx-stroke/60 pl-3 sm:pl-4">
                          {replies.map((replyComment) => (
                            <CommentItem
                              key={replyComment.id}
                              comment={replyComment}
                              rootId={root.id}
                              currentUser={user}
                              postAuthorId={postQuery.data!.author_id}
                              compact
                              onLike={toggleCommentLike}
                              onReply={(comment, rootId) =>
                                user
                                  ? setReplyTo({
                                      id: comment.id,
                                      parentId: rootId,
                                      userId: comment.author_id,
                                      name: comment.author?.handle || "用户",
                                    })
                                  : openAuthPrompt("comment")
                              }
                              onDelete={setPendingDelete}
                              onReport={async (comment) => {
                                if (!user) {
                                  openAuthPrompt("generic");
                                  return;
                                }
                                try {
                                  await api.reportComment(comment.id, "inappropriate");
                                  pushToast({ kind: "success", message: t("post_report_done") });
                                } catch (err) {
                                  if (isAuthRequiredError(err)) {
                                    openAuthPrompt("generic");
                                    return;
                                  }
                                  pushToast({ kind: "error", message: (err as APIError).message });
                                }
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
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
        title={t("comment_delete_title")}
        description={t("comment_delete_desc")}
        destructive
        confirmLabel={t("action_delete")}
        onConfirm={() => pendingDelete && deleteComment(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </AppShell>
  );
}

type CommentThread = {
  root: KXComment;
  replies: KXComment[];
};

function buildCommentThreads(comments: KXComment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const rootCache = new Map<string, string>();
  const rootFor = (comment: KXComment): string => {
    const cached = rootCache.get(comment.id);
    if (cached) return cached;
    const seen = new Set<string>();
    let current = comment;
    while (current.parent_comment_id && byId.has(current.parent_comment_id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parent_comment_id)!;
    }
    rootCache.set(comment.id, current.id);
    return current.id;
  };

  const rootOrder = comments.filter((comment) => !comment.parent_comment_id || !byId.has(comment.parent_comment_id));
  const threads = new Map(rootOrder.map((root) => [root.id, { root, replies: [] as KXComment[] }]));
  for (const comment of comments) {
    const rootId = rootFor(comment);
    if (rootId === comment.id) {
      if (!threads.has(comment.id)) threads.set(comment.id, { root: comment, replies: [] });
      continue;
    }
    const thread = threads.get(rootId);
    if (thread) thread.replies.push(comment);
  }
  return rootOrder
    .map((root) => threads.get(root.id))
    .filter((thread): thread is CommentThread => Boolean(thread))
    .map((thread) => ({
      ...thread,
      replies: [...thread.replies].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }));
}

function CommentItem({
  comment,
  rootId,
  currentUser,
  postAuthorId,
  onLike,
  onReply,
  onDelete,
  onReport,
  compact = false,
}: {
  comment: KXComment;
  rootId: string;
  currentUser: KXUser | null;
  postAuthorId: string;
  onLike: (comment: KXComment) => void;
  onReply: (comment: KXComment, rootId: string) => void;
  onDelete: (id: string) => void;
  onReport: (comment: KXComment) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const canDelete = currentUser?.id === comment.author_id || currentUser?.id === postAuthorId;
  return (
    <div className="flex gap-2.5">
      <Avatar user={comment.author || undefined} size={compact ? 30 : 36} href={comment.author ? `/u/${comment.author.handle}` : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href={comment.author?.handle ? `/u/${comment.author.handle}` : "#"} className="font-semibold text-sm truncate hover:underline">
            {comment.author?.display_name || "用户"}
          </Link>
          {showOfficialBadge(comment.author) ? <OfficialBadge /> : showVerifiedBadge(comment.author) ? <VerifiedBadge /> : null}
          <span className="text-kx-muted text-xs truncate">@{comment.author?.handle || "machi"} · {relativeTime(comment.created_at)}</span>
        </div>
        <p className="text-sm text-kx-text whitespace-pre-wrap break-words mt-1">{comment.content}</p>
        <div className="flex items-center gap-5 mt-2 text-xs font-medium">
          <button
            className="inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-rose-500"
            onClick={() => onLike(comment)}
            aria-pressed={comment.liked}
          >
            <Heart className={clsx("h-[15px] w-[15px] transition-transform duration-150", comment.liked ? "fill-rose-500 text-rose-500 scale-110" : "")} />
            <span className={comment.liked ? "font-semibold text-rose-500" : ""}>{compactNumber(comment.like_count)}</span>
          </button>
          <button
            className="inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-kx-accent"
            onClick={() => onReply(comment, rootId)}
          >
            <MessageCircle className="h-[15px] w-[15px]" /> {t("action_reply")}
          </button>
          {canDelete ? (
            <button className="ml-auto inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-kx-danger" onClick={() => onDelete(comment.id)}>
              <Trash2 className="h-3.5 w-3.5" /> {t("action_delete")}
            </button>
          ) : (
            <button className="ml-auto inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-kx-text" onClick={() => onReport(comment)}>
              <Flag className="h-3.5 w-3.5" /> {t("action_report")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
