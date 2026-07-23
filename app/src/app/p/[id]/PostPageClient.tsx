"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Trash2, Send, Flag, Heart, CheckCircle2 } from "lucide-react";
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
import { useI18n, type Locale } from "@/lib/i18n";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import type { KXComment, KXUser } from "@/lib/types";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";

// Same tiny local-copy pattern as PostCard's localize(): a handful of
// detail-page strings that previously shipped hardcoded Simplified Chinese.
function localize(locale: Locale, zhHans: string, zhHant: string, en: string, ja: string): string {
  switch (locale) {
    case "en":
      return en;
    case "ja":
      return ja;
    case "zh-Hant":
      return zhHant;
    default:
      return zhHans;
  }
}

export default function PostPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const id = params?.id as string;

  const [sort, setSort] = useState<"top" | "new">("top");
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; parentId: string; userId: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Comment likes in flight — guards against a double-tap firing two toggles
  // (which would flip the like back off and desync the count).
  const [likeBusy, setLikeBusy] = useState<Set<string>>(new Set());

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
    if (submitting) return;
    const text = reply.trim();
    if (!text) return;
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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
    // Ignore re-taps while this comment's toggle is still in flight.
    if (likeBusy.has(c.id)) return;
    // Derive the target state and the ±1 delta from the LATEST cached row, not
    // the render-time snapshot `c` (which may already be stale after an earlier
    // optimistic flip), so the count never drifts.
    const cached = queryClient.getQueryData<KXComment[]>(["comments", id, sort]);
    const currentRow = cached?.find((x) => x.id === c.id) ?? c;
    const next = !currentRow.liked;
    setLikeBusy((prev) => new Set(prev).add(c.id));
    queryClient.setQueryData<KXComment[]>(["comments", id, sort], (old) =>
      (old || []).map((x) => x.id === c.id ? { ...x, liked: next, like_count: Math.max(0, x.like_count + (next ? 1 : -1)) } : x),
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
    } finally {
      setLikeBusy((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(c.id);
        return nextSet;
      });
    }
  };

  const acceptAnswer = async (c: KXComment) => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    const next = !c.is_accepted;
    // One accepted answer per question: flip this one and clear any other.
    queryClient.setQueryData<KXComment[]>(["comments", id, sort], (old) =>
      (old || []).map((x) => {
        if (x.id === c.id) return { ...x, is_accepted: next };
        if (next && x.is_accepted) return { ...x, is_accepted: false };
        return x;
      }),
    );
    try {
      await api.acceptAnswer(c.id, next);
      pushToast({ kind: "success", message: next ? t("answer_accepted_toast") : t("answer_unaccepted_toast") });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        commentsQuery.refetch();
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
      commentsQuery.refetch();
    }
  };

  const isQuestion = postQuery.data?.content_type === "question";
  const isQuestionAuthor = isQuestion && !!user && user.id === postQuery.data?.author_id;
  const resolved = isQuestion && (commentsQuery.data || []).some((c) => c.is_accepted);

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label={t("msg_back")}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        {/* Title names the author (mirrors iOS) instead of a generic
            "post detail"; falls back to the plain label while loading. */}
        <h1 className="min-w-0 truncate text-center font-semibold">
          {postQuery.data?.author?.handle
            ? localize(
                locale,
                `@${postQuery.data.author.handle} 的帖子`,
                `@${postQuery.data.author.handle} 的貼文`,
                `Post by @${postQuery.data.author.handle}`,
                `@${postQuery.data.author.handle}さんの投稿`,
              )
            : localize(locale, "帖子", "貼文", "Post", "投稿")}
        </h1>
        <span />
      </header>

      {postQuery.isLoading ? (
        <div className="px-3 sm:px-4 py-3 space-y-3">
          <FeedSkeleton withMedia />
        </div>
      ) : postQuery.isError || !postQuery.data ? (
        <ErrorState
          onRetry={() => postQuery.refetch()}
          subtitle={localize(
            locale,
            "帖子可能已删除或不存在。",
            "貼文可能已刪除或不存在。",
            "This post may have been deleted or never existed.",
            "この投稿は削除されたか、存在しない可能性があります。",
          )}
        />
      ) : (
        <div className="px-3 sm:px-4 py-3 space-y-3">
          <PostCard
            post={postQuery.data}
            clampContent={false}
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
              {isQuestion ? (
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                    resolved
                      ? "bg-kx-accentSoft text-kx-accent ring-kx-accent/25"
                      : "bg-kx-soft text-kx-subtle ring-kx-stroke/60",
                  )}
                >
                  {resolved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {resolved ? t("qa_resolved") : t("qa_open")}
                </span>
              ) : null}
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
                      {localize(locale, "正在回复", "正在回覆", "Replying to", "返信先")}{" "}
                      <span className="text-kx-accent">@{replyTo.name}</span>
                      <button className="text-kx-muted hover:text-kx-text" onClick={() => setReplyTo(null)}>{t("action_cancel")}</button>
                    </div>
                  ) : null}
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="kx-textarea h-16 rounded-kx-lg px-3.5 sm:h-20"
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
                    <button className="kx-button-primary h-9" onClick={submitReply} disabled={!reply.trim() || submitting}>
                      <Send className="w-4 h-4" /> {t("action_publish")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-kx-subtle text-center py-3">
                <button type="button" onClick={() => openAuthPrompt("comment")} className="kx-link font-bold">{t("login")}</button>
                {localize(locale, " 后即可评论。", " 後即可留言。", " to comment.", " するとコメントできます。")}
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
                    <li
                      key={root.id}
                      className={clsx(
                        "rounded-kx-md border p-3",
                        root.is_accepted
                          ? "border-kx-accent/40 bg-kx-accentSoft/40"
                          : "border-kx-stroke/45 bg-kx-card/70",
                      )}
                    >
                      <CommentItem
                        comment={root}
                        rootId={root.id}
                        currentUser={user}
                        postAuthorId={postQuery.data!.author_id}
                        canAccept={isQuestionAuthor}
                        onAccept={acceptAnswer}
                        onLike={toggleCommentLike}
                        onReply={(comment, rootId) =>
                          user
                            ? setReplyTo({
                                id: comment.id,
                                parentId: rootId,
                                userId: comment.author_id,
                                name: comment.author?.handle || t("unknown_user"),
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
                                      name: comment.author?.handle || t("unknown_user"),
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
    }))
    // Pin the accepted best answer to the top (Array.sort is stable, so the
    // rest keep their server order).
    .sort((a, b) => Number(b.root.is_accepted ?? false) - Number(a.root.is_accepted ?? false));
}

function CommentItem({
  comment,
  rootId,
  currentUser,
  postAuthorId,
  canAccept = false,
  onAccept,
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
  canAccept?: boolean;
  onAccept?: (comment: KXComment) => void;
  onLike: (comment: KXComment) => void;
  onReply: (comment: KXComment, rootId: string) => void;
  onDelete: (id: string) => void;
  onReport: (comment: KXComment) => void;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const canDelete = currentUser?.id === comment.author_id || currentUser?.id === postAuthorId;
  return (
    <div className="flex gap-2.5">
      <Avatar user={comment.author || undefined} size={compact ? 30 : 36} href={comment.author ? `/u/${comment.author.handle}` : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href={comment.author?.handle ? `/u/${comment.author.handle}` : "#"} className="font-semibold text-sm truncate hover:underline">
            {comment.author?.display_name || t("unknown_user")}
          </Link>
          {showOfficialBadge(comment.author) ? <OfficialBadge /> : showVerifiedBadge(comment.author) ? <VerifiedBadge /> : null}
          {comment.is_accepted ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-kx-accentSoft px-1.5 py-0.5 text-[11px] font-semibold text-kx-accent ring-1 ring-inset ring-kx-accent/25">
              <CheckCircle2 className="h-3 w-3" /> {t("answer_accepted_badge")}
            </span>
          ) : null}
          <span className="text-kx-muted text-xs truncate">@{comment.author?.handle || "machi"} · <time dateTime={comment.created_at} suppressHydrationWarning>{relativeTime(comment.created_at, locale)}</time></span>
        </div>
        <p className="text-sm text-kx-text whitespace-pre-wrap break-words mt-1">{comment.content}</p>
        <div className="flex items-center gap-5 mt-2 text-xs font-medium">
          <button
            className="inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-kx-like"
            onClick={() => onLike(comment)}
            aria-pressed={comment.liked}
          >
            <Heart className={clsx("h-[15px] w-[15px] transition-transform duration-150", comment.liked ? "fill-kx-like text-kx-like scale-110" : "")} />
            <span className={comment.liked ? "font-semibold text-kx-like" : ""}>{compactNumber(comment.like_count)}</span>
          </button>
          <button
            className="inline-flex items-center gap-1.5 py-1 text-kx-muted transition-colors hover:text-kx-accent"
            onClick={() => onReply(comment, rootId)}
          >
            <MessageCircle className="h-[15px] w-[15px]" /> {t("action_reply")}
          </button>
          {canAccept ? (
            <button
              className={clsx(
                "inline-flex items-center gap-1.5 py-1 transition-colors",
                comment.is_accepted ? "font-semibold text-kx-accent" : "text-kx-muted hover:text-kx-accent",
              )}
              onClick={() => onAccept?.(comment)}
              aria-pressed={comment.is_accepted}
            >
              <CheckCircle2 className="h-[15px] w-[15px]" /> {comment.is_accepted ? t("answer_unaccept") : t("answer_accept")}
            </button>
          ) : null}
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
