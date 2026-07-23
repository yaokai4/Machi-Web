"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState, useRef, useEffect } from "react";
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
import { useI18n, type Locale } from "@/lib/i18n";
import type { KXPost } from "@/lib/types";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";
import { makeRegion, regionHeaderLabel, resolveRegion } from "@/lib/regions";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { MediaGrid } from "@/components/design/MediaGrid";
import { Dialog, ConfirmDialog } from "@/components/design/Dialog";
import { CONTENT_TYPE_LABELS } from "@/lib/types";
import { contentTypeLabel } from "@/lib/contentTypes";

interface PostCardProps {
  post: KXPost;
  onUpdate?: (post: KXPost) => void;
  onDeleted?: (post: KXPost) => void;
  compact?: boolean;
  showOriginal?: boolean;
  /** Feed cards clamp the body to 4 lines with an inline 展开全文/收起 toggle
   *  (mirrors iOS). The post-detail page passes false so the full body always
   *  shows with no truncation — the detail view is the canonical full text. */
  clampContent?: boolean;
}

// Query keys whose caches can contain KXPost objects. Optimistic
// interaction updates only need to reconcile these — not every query in
// the client (admin tables, settings, guide, wallet, …).
const POST_BEARING_QUERY_KEYS = new Set<string>([
  "feed",
  "post",
  "trending",
  "trending-page",
  "trending-weekly-likes",
  "profile-segment",
  "city-feed",
  "comments",
  "bookmarks",
  "search",
  "topic",
  "topics-page",
  "explore-happening",
  "explore-channel-page",
]);

// Tiny locale switch for the handful of strings that need parameters or
// are too incidental to warrant a shared i18n key (project uses the same
// local-copy pattern in HomeClient's homeCopy()).
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

function emptyContentError(locale: Locale): string {
  return localize(locale, "内容不能为空", "內容不能為空", "Content can't be empty", "内容を入力してください");
}

function shareCopyFailed(locale: Locale): string {
  return localize(
    locale,
    "复制失败，请手动复制链接",
    "複製失敗，請手動複製連結",
    "Couldn't copy — copy the link manually",
    "コピーできません。リンクを手動でコピーしてください",
  );
}

function openPostLabel(locale: Locale): string {
  return localize(locale, "打开帖子", "開啟貼文", "Open post", "投稿を開く");
}

function peopleLabel(count: string, locale: Locale): string {
  const value = count.trim();
  if (!value) return "";
  return localize(locale, `${value} 人`, `${value} 人`, `${value} people`, `${value}人`);
}

function pollVotesLabel(total: number, locale: Locale): string {
  return localize(
    locale,
    `${total} 票`,
    `${total} 票`,
    `${total} ${total === 1 ? "vote" : "votes"}`,
    `${total}票`,
  );
}

// The backend hands us `poll.expires_at` as a raw ISO string
// (e.g. "2026-07-15T09:00:00+00:00"). Render it as a short, human "MM-DD HH:mm"
// deadline. Pinned to Asia/Tokyo (the app's canonical timezone for JP-first
// users) so SSR and client agree and no machine-timezone leaks in. Returns ""
// for a missing / unparseable value so the caller can fall back gracefully
// instead of printing a machine string.
function formatPollDeadline(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const mm = get("month");
    const dd = get("day");
    const hh = get("hour");
    const mi = get("minute");
    if (!mm || !dd || !hh || !mi) return "";
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return "";
  }
}

function reportReasons(locale: Locale): { value: string; label: string }[] {
  return [
    { value: "inappropriate", label: localize(locale, "包含不当内容", "包含不當內容", "Inappropriate content", "不適切な内容") },
    { value: "harassment", label: localize(locale, "辱骂或骚扰", "辱罵或騷擾", "Abuse or harassment", "暴言・嫌がらせ") },
    { value: "spam", label: localize(locale, "广告 / 垃圾信息", "廣告 / 垃圾訊息", "Ads / spam", "広告・スパム") },
    { value: "misinfo", label: localize(locale, "虚假信息", "虛假資訊", "Misinformation", "虚偽の情報") },
    {
      value: "prohibited_offline_service",
      label: localize(
        locale,
        "禁止线下高风险服务 / 成人或性内容",
        "禁止線下高風險服務 / 成人或性內容",
        "Prohibited high-risk offline service / adult content",
        "禁止された高リスクの対面サービス / アダルト内容",
      ),
    },
    { value: "other", label: localize(locale, "其他", "其他", "Other", "その他") },
  ];
}

type BusyInteraction = "like" | "bookmark" | "repost" | null;

function PostCardImpl({ post: incomingPost, onUpdate, onDeleted, compact = false, showOriginal = true, clampContent = true }: PostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const currentUser = useSession((s) => s.user);
  const { t, locale } = useI18n();
  const [post, setPost] = useState(incomingPost);
  const [busyInteraction, setBusyInteraction] = useState<BusyInteraction>(null);
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
  // Single in-flight guard for the menu/dialog actions (quote / edit / delete /
  // report). These dialogs are mutually exclusive, so one flag is enough to
  // stop a fast double-click from firing the API call twice (duplicate
  // quote-reposts, double reports, a redundant delete 404).
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPost(incomingPost);
  }, [incomingPost]);

  // Decide which post to show: a pure repost shows the original; a
  // quote-repost shows both (current post + quoted preview).
  // Backend can return null for content (image-only posts, deleted
  // remnants); coerce to empty string so .trim() never throws and
  // takes the page down via the route error boundary.
  const postContent = post.content ?? "";
  const isQuote = !!post.repost_of_id && postContent.trim().length > 0;
  const isPureRepost = !!post.repost_of_id && postContent.trim().length === 0;
  const displayPost = isPureRepost && post.original_post ? post.original_post : post;
  const interactionPost = isPureRepost && post.original_post ? post.original_post : post;
  const displayAuthor = isPureRepost && post.original_post ? post.original_post.author : post.author;
  const displayMedia = isPureRepost && post.original_post ? post.original_post.media : post.media;
  const displayRegion = resolveRegion(displayPost.region_code) || makeRegion(displayPost.country, displayPost.province, displayPost.city);
  const repostHeader = post.repost_of_id ? (
    <div className="flex items-center gap-1.5 text-kx-meta font-semibold text-kx-subtle pl-1">
      <Repeat2 className="w-3.5 h-3.5 shrink-0" />
      {post.author ? (
        <Link
          href={`/u/${post.author.handle}`}
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-kx-accent"
        >
          <Avatar user={post.author} size={18} />
          <span className="truncate font-bold text-kx-text">{post.author.display_name || t("unknown_user")}</span>
        </Link>
      ) : (
        <span className="font-bold">{t("unknown_user")}</span>
      )}
      <span className="shrink-0">{isQuote ? t("post_quoted") : t("post_reposted")}</span>
    </div>
  ) : null;

  const isOwner = currentUser?.id === post.author_id && !isPureRepost;

  const mutate = (next: KXPost) => {
    setPost((current) => {
      const replaced = replacePostInQueryData(current, next);
      return isPostLike(replaced) ? replaced : current;
    });
    onUpdate?.(next);
    // Only walk caches that actually hold posts (feed / detail / profile /
    // trending / search …) instead of every query in the client. An empty
    // {} filter deep-traversed unrelated caches (admin tables, settings,
    // guide, wallet…) on every optimistic like/bookmark/repost.
    queryClient.setQueriesData<unknown>(
      { predicate: (query) => POST_BEARING_QUERY_KEYS.has(String(query.queryKey?.[0] ?? "")) },
      (data: unknown) => replacePostInQueryData(data, next),
    );
    queryClient.setQueryData(["post", next.id], next);
  };

  const handleLike = () => {
    if (!currentUser) return openAuthPrompt("like");
    if (busyInteraction === "like") return;
    const targetPost = interactionPost;
    const liked = Boolean(targetPost.liked);
    const optimistic = {
      ...targetPost,
      liked: !liked,
      like_count: Math.max(0, (targetPost.like_count || 0) + (liked ? -1 : 1)),
    };
    mutate(optimistic);
    setBusyInteraction("like");
    api
      .toggleLike(targetPost.id, !liked)
      .then(mutate)
      .catch((err) => {
        mutate(targetPost);
        if (isAuthRequiredError(err)) {
          openAuthPrompt("like");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      })
      .finally(() => setBusyInteraction((current) => (current === "like" ? null : current)));
  };

  const handleBookmark = () => {
    if (!currentUser) return openAuthPrompt("bookmark");
    if (busyInteraction === "bookmark") return;
    const targetPost = interactionPost;
    const bookmarked = Boolean(targetPost.bookmarked);
    const optimistic = {
      ...targetPost,
      bookmarked: !bookmarked,
      bookmark_count: Math.max(0, (targetPost.bookmark_count || 0) + (bookmarked ? -1 : 1)),
    };
    mutate(optimistic);
    setBusyInteraction("bookmark");
    api
      .toggleBookmark(targetPost.id, !bookmarked)
      .then(mutate)
      .catch((err) => {
        mutate(targetPost);
        if (isAuthRequiredError(err)) {
          openAuthPrompt("bookmark");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      })
      .finally(() => setBusyInteraction((current) => (current === "bookmark" ? null : current)));
  };

  const handleRepost = (mode: "repost" | "undo") => {
    if (!currentUser) return openAuthPrompt("generic");
    if (busyInteraction === "repost") return;
    const targetPost = interactionPost;
    const on = mode === "repost";
    const wasReposted = Boolean(targetPost.reposted);
    const optimistic = {
      ...targetPost,
      reposted: on,
      repost_count: Math.max(0, (targetPost.repost_count || 0) + (on === wasReposted ? 0 : on ? 1 : -1)),
    };
    mutate(optimistic);
    setBusyInteraction("repost");
    api
      .toggleRepost(targetPost.id, on)
      .then((next) => {
        mutate(next);
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        queryClient.invalidateQueries({ queryKey: ["trending"] });
        queryClient.invalidateQueries({ queryKey: ["profile-segment"] });
        queryClient.invalidateQueries({ queryKey: ["post", targetPost.id] });
        pushToast({ kind: "success", message: on ? t("post_reposted") : t("action_undo_repost") });
      })
      .catch((err) => {
        mutate(targetPost);
        if (isAuthRequiredError(err)) {
          openAuthPrompt("generic");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      })
      .finally(() => setBusyInteraction((current) => (current === "repost" ? null : current)));
  };

  const handleQuote = () => {
    if (!currentUser) return openAuthPrompt("generic");
    const trimmed = quoteText.trim();
    if (!trimmed) return;
    if (submitting) return;
    setSubmitting(true);
    api
      .quoteRepost(interactionPost.id, trimmed)
      .then(() => {
        setQuoteOpen(false);
        setQuoteText("");
        pushToast({ kind: "success", message: t("post_quote_done") });
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        queryClient.invalidateQueries({ queryKey: ["profile-segment"] });
      })
      .catch((err) => {
        if (isAuthRequiredError(err)) {
          openAuthPrompt("generic");
          return;
        }
        pushToast({ kind: "error", message: (err as APIError).message });
      })
      .finally(() => setSubmitting(false));
  };

  const handleDelete = () => {
    if (submitting) return;
    setSubmitting(true);
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
      })
      .finally(() => setSubmitting(false));
  };

  const handleEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed) {
      pushToast({ kind: "error", message: emptyContentError(locale) });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
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
      .catch((err) => pushToast({ kind: "error", message: (err as APIError).message }))
      .finally(() => setSubmitting(false));
  };

  const handleReport = () => {
    if (!currentUser) {
      openAuthPrompt("generic");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    api
      .reportPost(post.id, reportReason)
      .then(() => {
        setReportOpen(false);
        pushToast({ kind: "success", message: t("post_report_done") });
      })
      .catch((err) => pushToast({ kind: "error", message: (err as APIError).message }))
      .finally(() => setSubmitting(false));
  };

  const handleShare = async () => {
    const sharePost = isPureRepost && displayPost ? displayPost : post;
    const url = `${window.location.origin}/p/${sharePost.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ url, text: (displayPost.content ?? "").slice(0, 80) });
        return;
      } catch (err) {
        // Dismissing the native share sheet throws AbortError — that's a
        // deliberate cancel, not a failure, so stay silent. Any other error
        // falls through to the clipboard path below.
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      // NB: don't optional-chain the call — if navigator.clipboard is
      // undefined (insecure http context / old browser), `?.` would resolve
      // to undefined and we'd falsely toast "copied". Throw into the manual
      // fallback instead.
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      pushToast({ kind: "success", message: t("post_share_copied") });
    } catch {
      // Clipboard blocked (insecure http context / permission denied / old
      // browser): don't fail silently — surface the link so the user can
      // copy it by hand instead of thinking it worked.
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        window.prompt(shareCopyFailed(locale), url);
      } else {
        pushToast({ kind: "error", message: shareCopyFailed(locale) });
      }
    }
  };

  const openPost = () => router.push(`/p/${(isPureRepost && displayPost ? displayPost : post).id}`);

  return (
    <article
      className={clsx(
        // Calm hover (mirrors iOS KXCard): the border and resting shadow
        // deepen slightly — no translate/opacity jump, so scrolling a long
        // feed doesn't make the whole column shimmy.
        "kx-card relative cursor-pointer transition-[border-color,box-shadow] duration-200 ease-out hover:border-kx-stroke/55 hover:shadow-kx-float",
        compact && "p-3",
        busyInteraction && "opacity-90",
      )}
      // Deliberately NOT a role="link"/tabIndex element: the card contains real
      // links and buttons (author, region, tags, "more", the interaction bar),
      // and nesting interactive descendants inside an interactive ARIA role is
      // invalid — a screen reader announces the whole card as one link yet still
      // exposes several focusable controls, and Tab order becomes inconsistent
      // across browsers/AT. Mouse users keep click-to-open via the handler
      // below (which bails on nested links/buttons and on an active text
      // selection); keyboard & screen-reader users get a real permalink on the
      // timestamp in the header.
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, .kx-stop")) return;
        // Don't hijack an in-progress text selection into a navigation — let
        // the user finish selecting / copying body text on the card.
        if (window.getSelection()?.toString()) return;
        openPost();
      }}
    >
      {repostHeader}

      <header className="flex gap-3 items-start mt-1">
        <Avatar user={displayAuthor || undefined} size={42} href={displayAuthor ? `/u/${displayAuthor.handle}` : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* Name a step larger than body, meta a step smaller — the
                  iOS card's type hierarchy reads through size, not weight. */}
              <Link
                href={displayAuthor ? `/u/${displayAuthor.handle}` : "#"}
                className="truncate text-[16px] font-semibold leading-[21px] text-kx-text hover:underline"
              >
                {displayAuthor?.display_name || t("unknown_user")}
              </Link>
              {showOfficialBadge(displayAuthor) ? <OfficialBadge /> : showVerifiedBadge(displayAuthor) ? <VerifiedBadge /> : null}
            </div>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-kx-muted text-kx-meta">
              <span className="truncate">
                @{displayAuthor?.handle || "machi"} ·{" "}
                {/* The timestamp is the post permalink — the keyboard- and
                    screen-reader-accessible "open post" affordance now that the
                    card itself is no longer a link. */}
                <Link
                  href={`/p/${displayPost.id}`}
                  aria-label={openPostLabel(locale)}
                  className="rounded-sm transition-colors hover:text-kx-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/45"
                  onClick={(e) => e.stopPropagation()}
                >
                  <time dateTime={displayPost.created_at} suppressHydrationWarning>
                    {relativeTime(displayPost.created_at, locale)}
                  </time>
                </Link>
              </span>
              {displayRegion ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    href={`/c/${encodeURIComponent(displayRegion.region_code)}`}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-kx-accent hover:bg-kx-accent/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {regionHeaderLabel(displayRegion, locale)}
                  </Link>
                </>
              ) : null}
            </span>
          </div>

          <ContentText content={displayPost.content ?? ""} clamp={clampContent} />

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
            post={interactionPost}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onRepost={handleRepost}
            onQuote={() => (currentUser ? setQuoteOpen(true) : openAuthPrompt("generic"))}
            onComment={openPost}
            onShare={handleShare}
            busyInteraction={busyInteraction}
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
            <button className="kx-button-primary" onClick={handleQuote} disabled={!quoteText.trim() || submitting}>{t("action_publish")}</button>
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
            <button className="kx-button-primary" onClick={handleEdit} disabled={!editText.trim() || submitting}>{t("action_save")}</button>
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
            <button className="kx-button-primary" onClick={handleReport} disabled={submitting}>{t("action_confirm")}</button>
          </>
        }
      >
        <div className="space-y-1">
          {reportReasons(locale).map(({ value, label }) => (
            <label
              key={value}
              className={clsx(
                "flex cursor-pointer items-center gap-2.5 rounded-kx-md border px-3 py-2.5 text-sm transition",
                reportReason === value
                  ? "border-kx-accent/50 bg-kx-accentSoft text-kx-text"
                  : "border-kx-stroke/60 hover:border-kx-accent/30 hover:bg-kx-soft/60",
              )}
            >
              <input
                type="radio"
                name="report"
                className="accent-kx-accent"
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
  const { locale } = useI18n();
  const type = post.content_type || "dynamic";
  if (type === "dynamic" && !post.is_boosted) return null;
  const style = contentTypeStyle(type);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {type !== "dynamic" ? (
        <span className={clsx("px-2.5 py-1 rounded-full text-xs font-bold", style)}>
          {contentTypeLabel(type, locale)}
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

type SummaryChip = { label: string; emphasis?: boolean };

function TypedSummary({ post }: { post: KXPost }) {
  const { locale } = useI18n();
  const attrs = post.attributes || {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = attrs[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value);
    }
    return "";
  };
  const type = post.content_type || "dynamic";
  const chips: (SummaryChip | string)[] = [];
  // Respect the listing's currency when present; default to ¥ (JP-first).
  const cur = (() => {
    const code = pick("currency", "currency_code").toUpperCase();
    if (code === "USD") return "$";
    if (code === "EUR") return "€";
    if (code === "KRW") return "₩";
    if (code === "GBP") return "£";
    return "¥";
  })();
  if (type === "secondhand") chips.push(pick("price") ? { label: `${cur} ${pick("price")}`, emphasis: true } : "", pick("condition"), pick("trade_method"), pick("area"));
  if (type === "housing") chips.push(pick("rent") ? { label: `${cur} ${pick("rent")}`, emphasis: true } : "", pick("room_type"), pick("area"), pick("nearest_station"), pick("move_in_date"));
  if (type === "roommate") chips.push(pick("rent_range"), pick("area"), pick("move_in_date"));
  if (type === "job_seek") chips.push(pick("desired_job"), pick("skills"), pick("visa_status"));
  if (type === "job_post") chips.push(pick("job_title"), pick("salary"), pick("job_type"), pick("work_location"));
  if (type === "meetup") chips.push(pick("meetup_type"), pick("meetup_time"), pick("location"), peopleLabel(pick("people_limit"), locale));
  if (type === "dining") chips.push(pick("restaurant_or_area"), pick("meetup_time"), peopleLabel(pick("people_limit"), locale), pick("budget"));
  if (type === "event") chips.push(pick("event_time"), pick("location"), pick("fee"), peopleLabel(pick("capacity"), locale));
  if (type === "guide") chips.push(pick("title"), pick("summary"));
  if (type === "news" || type === "local_info") chips.push(pick("source"), pick("summary"));
  if (type === "service") chips.push(pick("service_type"), pick("price_range"), pick("verified_status"));
  if (type === "merchant") chips.push(pick("merchant_name"), pick("rating") ? `★ ${pick("rating")}` : "", pick("address"));
  if (type === "coupon") chips.push(pick("discount_info"), pick("valid_until"));
  if (type === "warning") {
    const category = pick("category");
    const tagSet = new Set((post.tags || []).map(normalizeTagLabel));
    chips.push(category && !tagSet.has(normalizeTagLabel(category)) ? category : "");
    chips.push(formatWarningReviewStatus(pick("review_status"), locale));
  }
  if (type === "poll") return null;
  const visible = chips
    .map((chip) => (typeof chip === "string" ? { label: chip } : chip))
    .filter((chip) => chip.label)
    .slice(0, 5);
  if (!visible.length) return null;
  // One capsule per attribute — mirrors iOS CategoryChip (tint 0.095 fill,
  // hairline 0.14 stroke). Warnings stay in the warm semantic tier; every
  // other type reads in the single 墨绿 accent family.
  const warm = type === "warning";
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((chip, index) => (
        <span
          key={`${chip.label}-${index}`}
          className={clsx(
            "inline-flex h-[22px] max-w-full items-center rounded-full px-2 text-[11px] leading-none ring-1 ring-inset",
            chip.emphasis ? "font-bold" : "font-semibold",
            warm
              ? "bg-kx-heat/[0.095] text-kx-heat ring-kx-heat/[0.18]"
              : "bg-kx-accent/[0.095] text-kx-accent ring-kx-accent/[0.14]",
          )}
        >
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  );
}

function formatWarningReviewStatus(value: string, locale: Locale) {
  const raw = value.trim();
  const normalized = raw.toLowerCase();
  if (!raw || normalized === "active" || normalized === "approved" || normalized === "published") return "";
  if (normalized === "under_review" || normalized === "pending" || normalized === "reviewing") {
    return localize(locale, "待审核", "審核中", "Under review", "審査中");
  }
  if (normalized === "rejected" || normalized === "blocked") {
    return localize(locale, "未通过", "未通過", "Rejected", "非承認");
  }
  return raw;
}

// Two-tier type-pill palette (mirrors iOS): one 墨绿 accent family for
// everything, plus the warm --kx-heat tier reserved for warnings (Boost
// already uses --kx-heat). The old six-colour Tailwind palette — and its
// per-colour dark: patches — is gone; both themes resolve through tokens.
function contentTypeStyle(type: string): string {
  if (type === "warning") return "bg-kx-heat/10 text-kx-heat ring-1 ring-inset ring-kx-heat/20";
  return "bg-kx-accentSoft/80 text-kx-accent ring-1 ring-inset ring-kx-accent/15";
}

function PostPoll({ post, onVoted }: { post: KXPost; onVoted?: (post: KXPost) => void }) {
  const currentUser = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
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
        <span className="line-clamp-2">{poll.question || localize(locale, "投票", "投票", "Poll", "投票")}</span>
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
        <span>{pollVotesLabel(poll.total, locale)}</span>
        {(() => {
          if (poll.closed) {
            return <span>{localize(locale, "已截止", "已截止", "Closed", "締め切り")}</span>;
          }
          const deadline = formatPollDeadline(poll.expires_at);
          if (deadline) {
            return (
              <span>
                {localize(locale, "截止", "截止", "Closes", "締切")} {deadline}
              </span>
            );
          }
          return (
            <span>{localize(locale, "可更改选择", "可更改選擇", "You can change your vote", "投票は変更できます")}</span>
          );
        })()}
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

function interactionStateKey(post?: KXPost | null): string {
  if (!post) return "";
  return [
    post.id,
    post.like_count,
    post.bookmark_count,
    post.repost_count,
    post.comment_count,
    post.liked ? "1" : "0",
    post.bookmarked ? "1" : "0",
    post.reposted ? "1" : "0",
  ].join(":");
}

function ContentText({ content, clamp = true }: { content: string; clamp?: boolean }) {
  const { locale } = useI18n();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Whether the clamped body actually overflows 4 lines — measured from the DOM
  // (scrollHeight > clientHeight), not a character heuristic, so 展开全文 appears
  // only when text is genuinely cut. iOS uses a char heuristic and can miss CJK
  // wrapping; the web measurement is exact.
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (!clamp) {
      setOverflowing(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    // Only measure in the clamped state. Once expanded, the clamp is dropped so
    // scrollHeight ≈ clientHeight — re-measuring then would wrongly hide 收起, so
    // we leave `overflowing` true and skip the measure while expanded.
    const measure = () => {
      if (expanded) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    // Re-measure on width changes (viewport resize, sidebar toggle) and after
    // fonts/images reflow, or the button can be stale on first paint.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, clamp, expanded]);

  if (!content) return null;
  const segments = tokenizeContent(content);
  const isClamped = clamp && !expanded;
  return (
    <>
      <p
        ref={ref}
        className={clsx(
          "mt-2 text-[15.5px] leading-relaxed text-kx-text whitespace-pre-wrap break-words",
          isClamped && "line-clamp-4",
        )}
      >
        {segments.map((seg, i) => {
          if (seg.kind === "hashtag") {
            return (
              <Link key={i} href={`/t/${encodeURIComponent(seg.value.slice(1))}`} className="kx-hashtag" onClick={(e) => e.stopPropagation()}>
                {seg.value}
              </Link>
            );
          }
          if (seg.kind === "mention") {
            // Mentions link to the profile route /u/<handle> (matching the
            // author links). `/@handle` has no route and 404s.
            return (
              <Link key={i} href={`/u/${seg.value.replace(/^@/, "")}`} className="kx-mention" onClick={(e) => e.stopPropagation()}>
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
      {clamp && overflowing ? (
        <button
          type="button"
          className="mt-0.5 text-sm font-semibold text-kx-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded
            ? localize(locale, "收起", "收起", "Show less", "閉じる")
            : localize(locale, "展开全文", "展開全文", "Show more", "続きを読む")}
        </button>
      ) : null}
    </>
  );
}

function QuotedPreview({ post }: { post: KXPost }) {
  const router = useRouter();
  const { t } = useI18n();
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
        <span className="font-semibold text-sm text-kx-text truncate">{author?.display_name || t("unknown_user")}</span>
        {showOfficialBadge(author) ? <OfficialBadge /> : showVerifiedBadge(author) ? <VerifiedBadge /> : null}
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
  onShare,
  busyInteraction,
}: {
  post: KXPost;
  onLike: () => void;
  onBookmark: () => void;
  onRepost: (mode: "repost" | "undo") => void;
  onQuote: () => void;
  onComment: () => void;
  onShare: () => void;
  busyInteraction?: BusyInteraction;
}) {
  const { t, locale } = useI18n();
  const [repostMenu, setRepostMenu] = useState(false);
  // Heart-pop is keyed to the click (not the liked attribute) so hearts
  // never animate when already-liked cards simply mount during scroll.
  const [likePop, setLikePop] = useState(false);
  const likePopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repostButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (likePopTimer.current) clearTimeout(likePopTimer.current);
  }, []);

  useEffect(() => {
    if (!repostMenu) return;
    const handler = (e: MouseEvent) => {
      if (!repostButtonRef.current?.contains(e.target as Node)) setRepostMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [repostMenu]);

  return (
    // Five keys spread across the card (comment / repost / like / bookmark /
    // share) — full-width justify-between on mobile, capped at max-w-md on
    // desktop. -ml-2 optically aligns the first icon with the text column.
    <div className="-ml-2 mt-2.5 flex items-center justify-between gap-0.5 text-kx-subtle sm:max-w-md">
      <button
        className="kx-metric"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onComment();
        }}
        aria-label={t("action_comment")}
      >
        <MessageCircle className="w-4 h-4" /> {compactNumber(post.comment_count)}
      </button>
      <div className="relative kx-stop" ref={repostButtonRef}>
        <button
          className="kx-metric"
          data-active={post.reposted ? "repost" : undefined}
          aria-label={post.reposted ? t("action_undo_repost") : t("action_repost")}
          aria-pressed={!!post.reposted}
          disabled={busyInteraction === "repost"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busyInteraction === "repost") return;
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
      <button
        className="kx-metric"
        data-active={post.liked ? "like" : undefined}
        disabled={busyInteraction === "like"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!post.liked) {
            setLikePop(true);
            if (likePopTimer.current) clearTimeout(likePopTimer.current);
            likePopTimer.current = setTimeout(() => setLikePop(false), 450);
          }
          onLike();
        }}
        aria-label={post.liked ? localize(locale, "取消赞", "取消讚", "Unlike", "いいねを取り消す") : t("action_like")}
        aria-pressed={!!post.liked}
      >
        <Heart className={clsx("w-4 h-4", post.liked && "fill-kx-like", likePop && "kx-heart-pop")} /> {compactNumber(post.like_count)}
      </button>
      <button
        className="kx-metric"
        data-active={post.bookmarked ? "bookmark" : undefined}
        disabled={busyInteraction === "bookmark"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onBookmark();
        }}
        aria-label={post.bookmarked ? localize(locale, "取消收藏", "取消收藏", "Remove bookmark", "ブックマークを外す") : t("action_bookmark")}
        aria-pressed={!!post.bookmarked}
      >
        <Bookmark className={clsx("w-4 h-4", post.bookmarked && "fill-kx-bookmark")} /> {compactNumber(post.bookmark_count)}
      </button>
      <button
        className="kx-metric"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onShare();
        }}
        aria-label={t("action_share")}
      >
        <Share2 className="w-4 h-4" />
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
    interactionStateKey(p.original_post) === interactionStateKey(n.original_post) &&
    pollStateKey(p) === pollStateKey(n) &&
    p.media.length === n.media.length &&
    p.tags.join(",") === n.tags.join(",") &&
    p.is_boosted === n.is_boosted &&
    p.language === n.language &&
    prev.compact === next.compact &&
    prev.showOriginal === next.showOriginal &&
    prev.clampContent === next.clampContent
  );
});
