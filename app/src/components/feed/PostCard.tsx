"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState, useTransition, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  Bookmark,
  BarChart3,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share2,
  Trash2,
  Edit3,
  Flag,
  Loader2,
  Quote,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { compactNumber, relativeTime, tokenizeContent } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { KXPost } from "@/lib/types";
import { showVerifiedBadge } from "@/lib/types";
import { makeRegion, regionHeaderLabel, resolveRegion } from "@/lib/regions";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { MediaGrid } from "@/components/design/MediaGrid";
import { Dialog, ConfirmDialog } from "@/components/design/Dialog";
import { CONTENT_TYPE_LABELS } from "@/lib/types";

interface PostCardProps {
  post: KXPost;
  onUpdate?: (post: KXPost) => void;
  onDeleted?: (post: KXPost) => void;
  compact?: boolean;
  showOriginal?: boolean;
}

function PostCardImpl({ post, onUpdate, onDeleted, compact = false, showOriginal = true }: PostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const currentUser = useSession((s) => s.user);
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(post.content);

  // Keep the edit-text in sync with the post when the dialog opens
  // (the user might have updated the post elsewhere in the meantime).
  useEffect(() => {
    if (editOpen) setEditText(post.content ?? "");
  }, [editOpen, post.content]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");

  // Decide which post to show: a pure repost shows the original; a
  // quote-repost shows both (current post + quoted preview).
  // Backend can return null for content (image-only posts, deleted
  // remnants); coerce to empty string so .trim() never throws and
  // takes the page down via the route error boundary.
  const postContent = post.content ?? "";
  const isQuote = !!post.repost_of_id && postContent.trim().length > 0;
  const isPureRepost = !!post.repost_of_id && postContent.trim().length === 0;
  const displayPost = isPureRepost && post.original_post ? post.original_post : post;
  const displayAuthor = isPureRepost && post.original_post ? post.original_post.author : post.author;
  const displayMedia = isPureRepost && post.original_post ? post.original_post.media : post.media;
  const displayRegion = resolveRegion(displayPost.region_code) || makeRegion(displayPost.country, displayPost.province, displayPost.city);
  const repostHeader = post.repost_of_id ? (
    <div className="flex items-center gap-1.5 text-kx-meta font-semibold text-kx-subtle pl-1">
      <Repeat2 className="w-3.5 h-3.5" />
      <span>
        {post.author?.display_name || t("unknown_user")}{" "}
        {isQuote ? t("post_quoted") : t("post_reposted")}
      </span>
    </div>
  ) : null;

  const isOwner = currentUser?.id === post.author_id;

  const mutate = (next: KXPost) => {
    onUpdate?.(next);
    queryClient.setQueriesData<unknown>({}, (data: unknown) => replacePostInQueryData(data, next));
    queryClient.setQueryData(["post", next.id], next);
  };

  const handleLike = () => {
    if (!currentUser) return openAuthPrompt("like");
    const liked = Boolean(post.liked);
    const optimistic = {
      ...post,
      liked: !liked,
      like_count: Math.max(0, (post.like_count || 0) + (liked ? -1 : 1)),
    };
    onUpdate?.(optimistic);
    startTransition(() => {
      api
        .toggleLike(post.id, !liked)
        .then(mutate)
        .catch((err) => {
          onUpdate?.(post);
          if (isAuthRequiredError(err)) {
            openAuthPrompt("like");
            return;
          }
          pushToast({ kind: "error", message: (err as APIError).message });
        });
    });
  };

  const handleBookmark = () => {
    if (!currentUser) return openAuthPrompt("bookmark");
    const bookmarked = Boolean(post.bookmarked);
    const optimistic = {
      ...post,
      bookmarked: !bookmarked,
      bookmark_count: Math.max(0, (post.bookmark_count || 0) + (bookmarked ? -1 : 1)),
    };
    onUpdate?.(optimistic);
    api
      .toggleBookmark(post.id, !bookmarked)
      .then(mutate)
      .catch((err) => {
        onUpdate?.(post);
        if (isAuthRequiredError(err)) {
          openAuthPrompt("bookmark");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      });
  };

  const handleRepost = (mode: "repost" | "undo") => {
    if (!currentUser) return openAuthPrompt("generic");
    const on = mode === "repost";
    const wasReposted = Boolean(post.reposted);
    const optimistic = {
      ...post,
      reposted: on,
      repost_count: Math.max(0, (post.repost_count || 0) + (on === wasReposted ? 0 : on ? 1 : -1)),
    };
    mutate(optimistic);
    api
      .toggleRepost(post.id, on)
      .then((next) => {
        mutate(next);
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        queryClient.invalidateQueries({ queryKey: ["trending"] });
        queryClient.invalidateQueries({ queryKey: ["post", post.id] });
        pushToast({ kind: "success", message: on ? t("post_reposted") : t("action_undo_repost") });
      })
      .catch((err) => {
        mutate(post);
        if (isAuthRequiredError(err)) {
          openAuthPrompt("generic");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      });
  };

  const handleQuote = () => {
    if (!currentUser) return openAuthPrompt("generic");
    const trimmed = quoteText.trim();
    if (!trimmed) return;
    api
      .quoteRepost(post.id, trimmed)
      .then(() => {
        setQuoteOpen(false);
        setQuoteText("");
        pushToast({ kind: "success", message: t("post_quote_done") });
        queryClient.invalidateQueries({ queryKey: ["feed"] });
      })
      .catch((err) => {
        if (isAuthRequiredError(err)) {
          openAuthPrompt("generic");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      });
  };

  const handleDelete = () => {
    api
      .deletePost(post.id)
      .then(() => {
        setConfirmDelete(false);
        onDeleted?.(post);
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        pushToast({ kind: "success", message: t("post_deleted") });
      })
      .catch((err) => {
        if (isAuthRequiredError(err)) {
          openAuthPrompt("generic");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      });
  };

  const handleEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed) {
      pushToast({ kind: "error", message: "内容不能为空" });
      return;
    }
    api
      .editPost(post.id, trimmed)
      .then((next) => {
        mutate(next);
        // Force the post-detail query to refresh too so /p/[id] picks up
        // the new content immediately.
        queryClient.invalidateQueries({ queryKey: ["post", post.id] });
        setEditOpen(false);
        pushToast({ kind: "success", message: t("post_updated") });
      })
      .catch((err) => pushToast({ kind: "error", message: (err as APIError).message }));
  };

  const handleReport = () => {
    if (!currentUser) {
      openAuthPrompt("generic");
      return;
    }
    api
      .reportPost(post.id, reportReason)
      .then(() => {
        setReportOpen(false);
        pushToast({ kind: "success", message: t("post_report_done") });
      })
      .catch((err) => pushToast({ kind: "error", message: (err as APIError).message }));
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, text: (displayPost.content ?? "").slice(0, 80) });
      } else {
        await navigator.clipboard.writeText(url);
        pushToast({ kind: "success", message: t("post_share_copied") });
      }
    } catch {
      // user cancelled
    }
  };

  const openPost = () => router.push(`/p/${post.id}`);

  return (
    <article
      className={clsx(
        "kx-card cursor-pointer hover:bg-kx-card/95 hover:-translate-y-0.5 transition duration-200 relative",
        compact && "p-3",
        isPending && "opacity-90",
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, .kx-stop")) return;
        openPost();
      }}
    >
      {repostHeader}

      <header className="flex gap-3 items-start mt-1">
        <Avatar user={displayAuthor || undefined} size={42} href={displayAuthor ? `/u/${displayAuthor.handle}` : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={displayAuthor ? `/u/${displayAuthor.handle}` : "#"}
                className="truncate font-semibold text-kx-text hover:underline"
              >
                {displayAuthor?.display_name || t("unknown_user")}
              </Link>
              {showVerifiedBadge(displayAuthor) ? <VerifiedBadge /> : null}
            </div>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-kx-muted text-kx-meta">
              <span className="truncate">@{displayAuthor?.handle || "machi"} · {relativeTime(displayPost.created_at)}</span>
              {displayRegion ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    href={`/c/${encodeURIComponent(displayRegion.region_code)}`}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-kx-accent hover:bg-kx-accent/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {regionHeaderLabel(displayRegion)}
                  </Link>
                </>
              ) : null}
            </span>
          </div>

          <ContentText content={displayPost.content ?? ""} />

          <PostMetadata post={displayPost} />
          <TypedSummary post={displayPost} />
          {displayPost.content_type === "poll" ? (
            <PostPoll
              post={displayPost}
              onVoted={(next) => {
                mutate(next);
              }}
            />
          ) : null}

          {(() => {
            // X-style: hashtags read as plain accent text, no chip.
            // Hide any tag that's already inline in the body so the
            // card doesn't repeat the same topic twice.
            const tagsRaw = displayPost.tags ?? [];
            const displayContent = displayPost.content ?? "";
            const inlineTags = new Set(
              Array.from(displayContent.matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) => normalizeTagLabel(m[1])),
            );
            const redundantTags = redundantContentTags(displayPost);
            const visible = tagsRaw.filter((t) => {
              const normalized = normalizeTagLabel(t);
              return normalized && !inlineTags.has(normalized) && !redundantTags.has(normalized);
            });
            if (visible.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {visible.slice(0, 6).map((tag) => (
                  <Link
                    key={tag}
                    href={`/t/${encodeURIComponent(tag)}`}
                    className="text-sm font-semibold text-kx-accent hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            );
          })()}

          {displayMedia?.length ? (
            <div className="mt-3">
              <MediaGrid items={displayMedia} />
            </div>
          ) : null}

          {isQuote && post.original_post && showOriginal ? (
            <QuotedPreview post={post.original_post} />
          ) : null}

          <InteractionBar
            post={post}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onRepost={handleRepost}
            onQuote={() => (currentUser ? setQuoteOpen(true) : openAuthPrompt("generic"))}
            onComment={openPost}
          />
        </div>

        <div className="relative kx-stop">
          <button
            className="text-kx-muted hover:text-kx-text rounded-full hover:bg-kx-soft w-9 h-9 inline-flex items-center justify-center transition"
            aria-label={t("action_more")}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen ? (
            <PostMenu
              onClose={() => setMenuOpen(false)}
              isOwner={isOwner}
              onEdit={() => setEditOpen(true)}
              onDelete={() => setConfirmDelete(true)}
              onReport={() => (currentUser ? setReportOpen(true) : openAuthPrompt("generic"))}
              onShare={handleShare}
            />
          ) : null}
        </div>
      </header>

      <ConfirmDialog
        open={confirmDelete}
        title={t("post_delete_title")}
        description={t("post_delete_desc")}
        destructive
        confirmLabel={t("action_delete")}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <Dialog
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title={t("action_quote")}
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setQuoteOpen(false)}>{t("action_cancel")}</button>
            <button className="kx-button-primary" onClick={handleQuote} disabled={!quoteText.trim()}>{t("action_publish")}</button>
          </>
        }
      >
        <textarea
          className="kx-textarea h-28"
          placeholder={t("post_quote_placeholder")}
          value={quoteText}
          onChange={(e) => setQuoteText(e.target.value)}
          maxLength={2000}
          autoFocus
        />
        <div className="mt-3">
          <QuotedPreview post={displayPost} />
        </div>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t("post_edit_title")}
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setEditOpen(false)}>{t("action_cancel")}</button>
            <button className="kx-button-primary" onClick={handleEdit} disabled={!editText.trim()}>{t("action_save")}</button>
          </>
        }
      >
        <textarea
          className="kx-textarea h-40"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          maxLength={2000}
        />
      </Dialog>

      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={t("post_report_title")}
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setReportOpen(false)}>{t("action_cancel")}</button>
            <button className="kx-button-primary" onClick={handleReport}>{t("action_confirm")}</button>
          </>
        }
      >
        <div className="space-y-2">
          {([
            ["inappropriate", "包含不当内容"],
            ["harassment", "辱骂或骚扰"],
            ["spam", "广告 / 垃圾信息"],
            ["misinfo", "虚假信息"],
            ["prohibited_offline_service", "禁止线下高风险服务 / 成人或性内容"],
            ["other", "其他"],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="report"
                value={value}
                checked={reportReason === value}
                onChange={() => setReportReason(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Dialog>
    </article>
  );
}

function normalizeTagLabel(value: string) {
  return value.replace(/^#/, "").trim().replace(/\s+/g, "").toLowerCase();
}

function redundantContentTags(post: KXPost) {
  const type = post.content_type || "dynamic";
  const redundant = new Set<string>();
  const typeLabel = CONTENT_TYPE_LABELS[type as keyof typeof CONTENT_TYPE_LABELS];
  if (typeLabel) redundant.add(normalizeTagLabel(typeLabel));
  if (type === "warning") {
    ["避坑", "warning", "注意喚起", "风险", "風險", "踩雷", "avoidscams"].forEach((tag) => {
      redundant.add(normalizeTagLabel(tag));
    });
  }
  return redundant;
}

function PostMetadata({ post }: { post: KXPost }) {
  const type = post.content_type || "dynamic";
  if (type === "dynamic" && !post.is_boosted) return null;
  const style = contentTypeStyle(type);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {type !== "dynamic" ? (
        <span className={clsx("px-2.5 py-1 rounded-full text-xs font-bold", style)}>
          {CONTENT_TYPE_LABELS[type as keyof typeof CONTENT_TYPE_LABELS] || type}
        </span>
      ) : null}
      {post.is_boosted ? (
        <span className="px-2.5 py-1 rounded-full bg-kx-heat/10 text-kx-heat text-xs font-semibold">
          Boost +{post.boost_weight || 0}
        </span>
      ) : null}
    </div>
  );
}

function TypedSummary({ post }: { post: KXPost }) {
  const attrs = post.attributes || {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = attrs[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return "";
  };
  const type = post.content_type || "dynamic";
  const chips: string[] = [];
  if (type === "secondhand") chips.push(pick("price") ? `¥ ${pick("price")}` : "", pick("condition"), pick("trade_method"), pick("area"));
  if (type === "housing") chips.push(pick("rent") ? `¥ ${pick("rent")}` : "", pick("room_type"), pick("area"), pick("nearest_station"), pick("move_in_date"));
  if (type === "roommate") chips.push(pick("rent_range"), pick("area"), pick("move_in_date"));
  if (type === "job_seek") chips.push(pick("desired_job"), pick("skills"), pick("visa_status"));
  if (type === "job_post") chips.push(pick("job_title"), pick("salary"), pick("job_type"), pick("work_location"));
  if (type === "meetup") chips.push(pick("meetup_type"), pick("meetup_time"), pick("location"), pick("people_limit") ? `${pick("people_limit")} 人` : "");
  if (type === "dining") chips.push(pick("restaurant_or_area"), pick("meetup_time"), pick("people_limit") ? `${pick("people_limit")} 人` : "", pick("budget"));
  if (type === "event") chips.push(pick("event_time"), pick("location"), pick("fee"), pick("capacity") ? `${pick("capacity")} 人` : "");
  if (type === "guide") chips.push(pick("title"), pick("summary"));
  if (type === "news" || type === "local_info") chips.push(pick("source"), pick("summary"));
  if (type === "service") chips.push(pick("service_type"), pick("price_range"), pick("verified_status"));
  if (type === "merchant") chips.push(pick("merchant_name"), pick("rating") ? `★ ${pick("rating")}` : "", pick("address"));
  if (type === "coupon") chips.push(pick("discount_info"), pick("valid_until"));
  if (type === "warning") {
    const category = pick("category");
    const tagSet = new Set((post.tags || []).map(normalizeTagLabel));
    chips.push(category && !tagSet.has(normalizeTagLabel(category)) ? category : "");
    chips.push(formatWarningReviewStatus(pick("review_status")));
  }
  if (type === "poll") return null;
  const visible = chips.filter(Boolean).slice(0, 5);
  if (!visible.length) return null;
  const tint = contentTypeTint(type);
  return (
    <div
      className={clsx(
        "mt-2 rounded-kx-md border px-3 py-2 text-xs font-semibold leading-5 text-kx-subtle",
        tint.border,
        tint.bg,
      )}
    >
      {visible.join(" · ")}
    </div>
  );
}

function formatWarningReviewStatus(value: string) {
  const raw = value.trim();
  const normalized = raw.toLowerCase();
  if (!raw || normalized === "active" || normalized === "approved" || normalized === "published") return "";
  if (normalized === "under_review" || normalized === "pending" || normalized === "reviewing") return "待审核";
  if (normalized === "rejected" || normalized === "blocked") return "未通过";
  return raw;
}

function contentTypeStyle(type: string): string {
  switch (type) {
    case "warning":
      return "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:border-orange-400/20";
    case "guide":
    case "secondhand":
      return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20";
    case "housing":
    case "roommate":
      return "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-400/20";
    case "job_post":
    case "job_seek":
    case "referral":
      return "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:border-violet-400/20";
    case "dining":
      return "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-400/20";
    default:
      return "bg-kx-accentSoft text-kx-accent border-kx-accent/10";
  }
}

function contentTypeTint(type: string): { bg: string; border: string } {
  switch (type) {
    case "warning":
      return { bg: "bg-orange-50/70 dark:bg-orange-500/5", border: "border-orange-100 dark:border-orange-400/15" };
    case "housing":
    case "roommate":
      return { bg: "bg-blue-50/70 dark:bg-blue-500/5", border: "border-blue-100 dark:border-blue-400/15" };
    case "job_post":
    case "job_seek":
    case "referral":
      return { bg: "bg-violet-50/70 dark:bg-violet-500/5", border: "border-violet-100 dark:border-violet-400/15" };
    case "guide":
    case "secondhand":
      return { bg: "bg-emerald-50/70 dark:bg-emerald-500/5", border: "border-emerald-100 dark:border-emerald-400/15" };
    default:
      return { bg: "bg-kx-soft/70", border: "border-kx-stroke/60" };
  }
}

function PostPoll({ post, onVoted }: { post: KXPost; onVoted?: (post: KXPost) => void }) {
  const currentUser = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [localPost, setLocalPost] = useState(post);

  useEffect(() => {
    setLocalPost(post);
  }, [post]);

  const poll = normalizePostPoll(localPost);
  if (!poll) return null;

  const vote = async (index: number) => {
    if (!currentUser) {
      openAuthPrompt("generic");
      return;
    }
    if (poll.closed || busyIndex !== null) return;
    const previous = localPost;
    const optimistic = optimisticPollVote(localPost, index);
    setLocalPost(optimistic);
    onVoted?.(optimistic);
    setBusyIndex(index);
    try {
      const next = await api.votePoll(post.id, index);
      setLocalPost(next);
      onVoted?.(next);
    } catch (err) {
      setLocalPost(previous);
      onVoted?.(previous);
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <div className="kx-stop mt-3 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/60 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-kx-text">
        <BarChart3 className="h-4 w-4 text-kx-accent" />
        <span className="line-clamp-2">{poll.question || "投票"}</span>
      </div>
      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const selected = poll.my_vote === index;
          const count = poll.counts[index] || 0;
          const percent = poll.total ? Math.round((count / poll.total) * 100) : 0;
          const showResults = poll.my_vote !== null || poll.closed || poll.total > 0;
          return (
            <button
              key={`${option}-${index}`}
              type="button"
              className={clsx(
                "relative min-h-10 w-full overflow-hidden rounded-kx-md border px-3 py-2 text-left transition active:scale-[0.99]",
                selected
                  ? "border-kx-accent bg-kx-accentSoft text-kx-accent"
                  : "border-kx-stroke bg-kx-card text-kx-text hover:border-kx-accent/50",
                (poll.closed || busyIndex !== null) && "cursor-default",
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                vote(index);
              }}
              disabled={poll.closed || busyIndex !== null}
            >
              {showResults ? (
                <span
                  className="absolute inset-y-0 left-0 bg-kx-accent/10 transition-all"
                  style={{ width: `${percent}%` }}
                />
              ) : null}
              <span className="relative flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{option}</span>
                {busyIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {showResults ? (
                  <span className="shrink-0 text-xs font-bold text-kx-muted">
                    {percent}% · {count}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-kx-muted">
        <span>{poll.total} 票</span>
        {poll.closed ? <span>已截止</span> : poll.expires_at ? <span>截止 {poll.expires_at}</span> : <span>可更改选择</span>}
      </div>
    </div>
  );
}

function normalizePostPoll(post: KXPost): {
  question: string;
  options: string[];
  counts: number[];
  total: number;
  my_vote: number | null;
  closed: boolean;
  expires_at: string;
} | null {
  const attr = post.attributes || {};
  const options = (post.poll?.options?.length ? post.poll.options : parsePollOptions(attr.options)).filter(Boolean);
  if (options.length < 2) return null;
  const counts = options.map((_, index) => Number(post.poll?.counts?.[index] || 0));
  return {
    question: String(attr.question || "").trim(),
    options,
    counts,
    total: Number(post.poll?.total ?? counts.reduce((sum, item) => sum + item, 0)),
    my_vote: post.poll?.my_vote ?? null,
    closed: Boolean(post.poll?.closed),
    expires_at: String(post.poll?.expires_at || attr.expires_at || ""),
  };
}

function optimisticPollVote(post: KXPost, optionIndex: number): KXPost {
  const poll = normalizePostPoll(post);
  if (!poll || optionIndex < 0 || optionIndex >= poll.options.length) return post;

  const counts = poll.counts.map((count) => Math.max(0, Number(count) || 0));
  const previous = typeof poll.my_vote === "number" ? poll.my_vote : null;
  if (previous === null || previous < 0 || previous >= counts.length) {
    counts[optionIndex] = (counts[optionIndex] || 0) + 1;
  } else if (previous !== optionIndex) {
    counts[previous] = Math.max(0, (counts[previous] || 0) - 1);
    counts[optionIndex] = (counts[optionIndex] || 0) + 1;
  }

  return {
    ...post,
    poll: {
      options: poll.options,
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
      my_vote: optionIndex,
      closed: poll.closed,
      expires_at: poll.expires_at,
    },
  };
}

function isPostLike(value: unknown): value is KXPost {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.author_id === "string" &&
    typeof record.created_at === "string" &&
    typeof record.like_count === "number" &&
    Array.isArray(record.media)
  );
}

function replacePostInQueryData(data: unknown, next: KXPost): unknown {
  if (!data) return data;
  if (Array.isArray(data)) {
    let changed = false;
    const items = data.map((item) => {
      const replaced = replacePostInQueryData(item, next);
      if (replaced !== item) changed = true;
      return replaced;
    });
    return changed ? items : data;
  }
  if (typeof data !== "object") return data;

  if (isPostLike(data)) {
    const current = data;
    const replacedPost = current.id === next.id ? next : current;
    if (replacedPost.original_post?.id === next.id && replacedPost.original_post !== next) {
      return { ...replacedPost, original_post: next };
    }
    return replacedPost;
  }

  const record = data as Record<string, unknown>;
  const nextRecord: Record<string, unknown> = { ...record };
  let changed = false;
  for (const key of ["pages", "items", "posts", "post", "original_post"]) {
    if (!(key in record)) continue;
    const replaced = replacePostInQueryData(record[key], next);
    if (replaced !== record[key]) {
      nextRecord[key] = replaced;
      changed = true;
    }
  }
  return changed ? nextRecord : data;
}

function parsePollOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // Use separator parsing below.
    }
  }
  return raw.split(/[\n/；;|]+/).map((item) => item.trim()).filter(Boolean);
}

function pollStateKey(post: KXPost): string {
  const attrs = post.attributes || {};
  try {
    return JSON.stringify({
      poll: post.poll || null,
      question: attrs.question || "",
      options: attrs.options || "",
      expires_at: attrs.expires_at || "",
      original_poll: post.original_post?.poll || null,
    });
  } catch {
    return "";
  }
}

function ContentText({ content }: { content: string }) {
  if (!content) return null;
  const segments = tokenizeContent(content);
  return (
    <p className="mt-2 text-[15.5px] leading-relaxed text-kx-text whitespace-pre-wrap break-words">
      {segments.map((seg, i) => {
        if (seg.kind === "hashtag") {
          return (
            <Link key={i} href={`/t/${encodeURIComponent(seg.value.slice(1))}`} className="kx-hashtag" onClick={(e) => e.stopPropagation()}>
              {seg.value}
            </Link>
          );
        }
        if (seg.kind === "mention") {
          return (
            <Link key={i} href={`/${seg.value}`} className="kx-mention" onClick={(e) => e.stopPropagation()}>
              {seg.value}
            </Link>
          );
        }
        if (seg.kind === "url") {
          return (
            <a key={i} href={seg.value} target="_blank" rel="noreferrer" className="kx-link" onClick={(e) => e.stopPropagation()}>
              {seg.value}
            </a>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </p>
  );
}

function QuotedPreview({ post }: { post: KXPost }) {
  const router = useRouter();
  const author = post.author;
  return (
    <div
      className="mt-3 rounded-kx-md border border-kx-stroke/60 bg-kx-soft p-3 cursor-pointer hover:bg-kx-stroke/30 transition"
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/p/${post.id}`);
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Avatar user={author || undefined} size={20} />
        <span className="font-semibold text-sm text-kx-text truncate">{author?.display_name || "未知用户"}</span>
        {showVerifiedBadge(author) ? <VerifiedBadge /> : null}
        <span className="text-kx-muted text-xs truncate">@{author?.handle || "machi"}</span>
      </div>
      <p className="text-sm text-kx-text mt-1 line-clamp-4 whitespace-pre-wrap break-words">{post.content}</p>
      {post.media?.length ? (
        <div className="mt-2">
          <MediaGrid items={post.media} />
        </div>
      ) : null}
    </div>
  );
}

function InteractionBar({
  post,
  onLike,
  onBookmark,
  onRepost,
  onQuote,
  onComment,
}: {
  post: KXPost;
  onLike: () => void;
  onBookmark: () => void;
  onRepost: (mode: "repost" | "undo") => void;
  onQuote: () => void;
  onComment: () => void;
}) {
  const { t } = useI18n();
  const [repostMenu, setRepostMenu] = useState(false);
  const repostButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!repostMenu) return;
    const handler = (e: MouseEvent) => {
      if (!repostButtonRef.current?.contains(e.target as Node)) setRepostMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [repostMenu]);

  return (
    <div className="mt-3 grid max-w-sm grid-cols-4 items-center gap-1 text-kx-subtle">
      <button className="kx-metric" onClick={onComment} aria-label={t("action_comment")}>
        <MessageCircle className="w-4 h-4" /> {compactNumber(post.comment_count)}
      </button>
      <div className="relative kx-stop" ref={repostButtonRef}>
        <button
          className="kx-metric"
          data-active={post.reposted ? "repost" : undefined}
          aria-label={t("action_repost")}
          onClick={(e) => {
            e.stopPropagation();
            if (post.reposted) setRepostMenu(true);
            else onRepost("repost");
          }}
        >
          <Repeat2 className="w-4 h-4" /> {compactNumber(post.repost_count)}
        </button>
        {repostMenu ? (
          <div className="absolute z-50 left-0 top-full mt-1 kx-glass-surface p-1 w-40 text-sm animate-kx-scale-in">
            <button
              className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft text-kx-danger transition"
              onClick={(e) => { e.stopPropagation(); setRepostMenu(false); onRepost("undo"); }}
            >
              {t("action_undo_repost")}
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft inline-flex items-center gap-2 transition"
              onClick={(e) => { e.stopPropagation(); setRepostMenu(false); onQuote(); }}
            >
              <Quote className="w-4 h-4" /> {t("action_quote")}
            </button>
          </div>
        ) : null}
      </div>
      <button className="kx-metric" data-active={post.liked ? "like" : undefined} onClick={onLike} aria-label={t("action_like")}>
        <Heart className={clsx("w-4 h-4", post.liked && "fill-kx-like")} /> {compactNumber(post.like_count)}
      </button>
      <button className="kx-metric" data-active={post.bookmarked ? "bookmark" : undefined} onClick={onBookmark} aria-label={t("action_bookmark")}>
        <Bookmark className={clsx("w-4 h-4", post.bookmarked && "fill-kx-bookmark")} /> {compactNumber(post.bookmark_count)}
      </button>
    </div>
  );
}

function PostMenu({
  onClose,
  isOwner,
  onEdit,
  onDelete,
  onReport,
  onShare,
}: {
  onClose: () => void;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onShare: () => void;
}) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Properly distinguish clicks inside the menu from outside.
  // Without the ref check, clicking any menu item closed the menu BEFORE
  // its own onClick had a chance to take effect on some browsers.
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Register on next tick so the same click that opened the menu
    // doesn't immediately close it.
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("keydown", onEsc);
    });
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  // Each menu action also explicitly closes the menu so the visible state
  // matches "this fired" regardless of any document handler timing.
  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div ref={menuRef} className="absolute right-0 top-8 z-50 kx-glass-surface w-44 p-1 text-sm animate-kx-scale-in">
      <button className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft inline-flex items-center gap-2 transition" onClick={wrap(onShare)}>
        <Share2 className="w-4 h-4" /> {t("action_share")}
      </button>
      {isOwner ? (
        <>
          <button className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft inline-flex items-center gap-2 transition" onClick={wrap(onEdit)}>
            <Edit3 className="w-4 h-4" /> {t("action_edit")}
          </button>
          <button
            className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft inline-flex items-center gap-2 text-kx-danger transition"
            onClick={wrap(onDelete)}
          >
            <Trash2 className="w-4 h-4" /> {t("action_delete")}
          </button>
        </>
      ) : (
        <button
          className="w-full text-left px-3 py-2 rounded-kx-sm hover:bg-kx-soft inline-flex items-center gap-2 text-kx-danger transition"
          onClick={wrap(onReport)}
        >
          <Flag className="w-4 h-4" /> {t("action_report")}
        </button>
      )}
    </div>
  );
}


export const PostCard = memo(PostCardImpl, (prev, next) => {
  const p = prev.post;
  const n = next.post;
  return (
    p.id === n.id &&
    p.updated_at === n.updated_at &&
    p.content === n.content &&
    p.like_count === n.like_count &&
    p.bookmark_count === n.bookmark_count &&
    p.repost_count === n.repost_count &&
    p.comment_count === n.comment_count &&
    p.liked === n.liked &&
    p.bookmarked === n.bookmarked &&
    p.reposted === n.reposted &&
    pollStateKey(p) === pollStateKey(n) &&
    p.media.length === n.media.length &&
    p.tags.join(",") === n.tags.join(",") &&
    p.is_boosted === n.is_boosted &&
    p.language === n.language &&
    prev.compact === next.compact &&
    prev.showOriginal === next.showOriginal
  );
});
