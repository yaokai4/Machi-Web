"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Image as ImageIcon, Loader2, MessageCircle, Play, Send, Smile, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { api, APIError, isUploadImageFile, isUploadVideoFile } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { MediaGrid } from "@/components/design/MediaGrid";
import { Lightbox } from "@/components/design/Lightbox";
import { relativeTime } from "@/lib/format";
import { useSession, useToasts } from "@/lib/store";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { fallbackVideoPoster, isVideoMedia, mediaCardAspectRatio, mediaPreviewImageUrl, sameOriginApiUrl } from "@/lib/media";
import type { KXMedia, KXMessage, KXMessageAttachment, KXUser } from "@/lib/types";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";

const EMOJI_GROUPS: { labelKey: I18nKey; items: string[] }[] = [
  {
    labelKey: "msg_emoji_group_common",
    items: ["😀", "😄", "😂", "🤣", "😊", "🥹", "😍", "😘", "😎", "🤔", "😮", "😭", "😴", "🙈", "😋", "😌"],
  },
  {
    labelKey: "msg_emoji_group_reactions",
    items: ["👍", "👎", "🙏", "👏", "🙌", "🤝", "💪", "👌", "🤏", "🫶", "✌️", "🤟", "✅", "👀", "💯", "🫡"],
  },
  {
    labelKey: "msg_emoji_group_mood",
    items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "✨", "🔥", "🎉", "🌟", "💡", "💬", "🌙", "☀️", "🌧️", "🍀"],
  },
  {
    labelKey: "msg_emoji_group_local",
    items: ["☕", "🍜", "🍣", "🍱", "🍻", "🍰", "🏠", "🚇", "🚕", "📍", "📷", "🎧", "📚", "💼", "🛒", "🧳"],
  },
];

const QUICK_REPLY_KEYS: I18nKey[] = ["msg_quick_reply_1", "msg_quick_reply_2", "msg_quick_reply_3"];
const MESSAGE_IMAGE_LIMIT = 9;
const MESSAGE_VIDEO_LIMIT = 1;
const MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MESSAGE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ duration: 0, width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: { duration: number; width: number; height: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    // Guard against containers that never fire loadedmetadata/onerror,
    // otherwise the send pipeline hangs forever.
    const timeout = window.setTimeout(() => done({ duration: 0, width: 0, height: 0 }), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => done({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
    });
    video.onerror = () => done({ duration: 0, width: 0, height: 0 });
    video.src = url;
  });
}

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const id = params?.id as string;

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<KXMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const convQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations(),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.messages(id),
    refetchInterval: 5000,
    enabled: !!id,
  });

  const conv = convQuery.data?.find((c) => c.id === id);
  const peer = conv?.peer;
  const imageCount = attachments.filter((item) => item.type === "image").length;
  const hasVideo = attachments.some((item) => item.type === "video");
  const attachmentLimitReached = hasVideo || imageCount >= MESSAGE_IMAGE_LIMIT;

  useEffect(() => {
    if (id) api.markConversationRead(id).catch(() => undefined);
  }, [id, messagesQuery.data?.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQuery.data?.length]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const onFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const uploaded: KXMedia[] = [];
      for (const f of list) {
        const isVideo = isUploadVideoFile(f);
        const isImage = isUploadImageFile(f);
        if (!isVideo && !isImage) {
          pushToast({ kind: "error", message: `${f.name || t("msg_media_selected_file")} ${t("msg_media_unsupported")}` });
          continue;
        }
        const purpose = isVideo ? "message_video" : "message_image";
        const maxBytes = isVideo ? MESSAGE_VIDEO_MAX_BYTES : MESSAGE_IMAGE_MAX_BYTES;
        if (f.size > maxBytes) {
          pushToast({ kind: "error", message: `${f.name || t("msg_media_selected_file")} ${isVideo ? t("msg_media_over_size_video") : t("msg_media_over_size_image")}` });
          continue;
        }
        const nextItems = [...attachments, ...uploaded];
        if (isVideo && nextItems.length > 0) {
          pushToast({ kind: "error", message: t("msg_video_only_no_mix") });
          continue;
        }
        if (!isVideo && nextItems.some((item) => item.type === "video")) {
          pushToast({ kind: "error", message: t("msg_video_no_more_images") });
          continue;
        }
        if (isVideo && nextItems.filter((item) => item.type === "video").length >= MESSAGE_VIDEO_LIMIT) {
          pushToast({ kind: "error", message: t("msg_video_max_one") });
          continue;
        }
        if (!isVideo && nextItems.filter((item) => item.type === "image").length >= MESSAGE_IMAGE_LIMIT) {
          pushToast({ kind: "error", message: t("msg_image_max_nine") });
          continue;
        }
        const videoMeta = isVideo ? await readVideoMetadata(f) : { duration: 0, width: 0, height: 0 };
        if (isVideo && videoMeta.duration > 120) {
          pushToast({ kind: "error", message: `${f.name || t("msg_media_selected_file")} ${t("msg_media_over_duration")}` });
          continue;
        }
        const { media } = await api.uploadFile(f, {
          purpose,
          entityType: "message",
          threadId: id,
          duration: videoMeta.duration,
          width: videoMeta.width,
          height: videoMeta.height,
          metadata: isVideo ? { durationSeconds: videoMeta.duration } : {},
        });
        const previewUrl = URL.createObjectURL(f);
        uploaded.push({ ...media, url: previewUrl, thumb_url: previewUrl });
      }
      setAttachments((prev) => {
        const next = [...prev, ...uploaded];
        return next.some((item) => item.type === "video") ? next.slice(0, MESSAGE_VIDEO_LIMIT) : next.slice(0, MESSAGE_IMAGE_LIMIT);
      });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (sending) return;
    if (!draft.trim() && attachments.length === 0) return;
    setSending(true);
    try {
      await api.sendMessage(id, draft.trim(), [], attachments.map((m) => m.id));
      setDraft("");
      attachments.forEach((item) => {
        if (item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
      });
      setAttachments([]);
      setEmojiOpen(false);
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setDraft((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const removeMessage = async (msgId: string) => {
    try {
      await api.deleteMessage(msgId);
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell>
      <section className="kx-chat-page flex flex-col">
        <header className="z-30 kx-glass-bar flex shrink-0 items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/70 bg-white/70 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.08)] transition hover:bg-white dark:border-white/10 dark:bg-kx-card dark:text-kx-subtle dark:hover:bg-kx-soft"
            aria-label={t("msg_back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {peer ? (
            <a href={`/u/${peer.handle}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar user={peer} size={42} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[15px] font-black leading-tight text-kx-text">
                  <span className="truncate">{peer.display_name}</span>
                  {showOfficialBadge(peer) ? <OfficialBadge /> : showVerifiedBadge(peer) ? <VerifiedBadge /> : null}
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-kx-muted">@{peer.handle}</div>
              </div>
            </a>
          ) : (
            <div className="min-w-0">
              <div className="text-[15px] font-black text-kx-text">{t("msg_conversation")}</div>
              <div className="text-xs text-kx-muted">{t("msg_private")}</div>
            </div>
          )}
          <span className="ml-auto hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100 dark:bg-kx-accentSoft dark:text-kx-accent dark:ring-kx-accent/20 sm:inline-flex">
            {t("msg_dm_badge")}
          </span>
        </header>

        <div className="kx-chat-scroll flex-1 space-y-3 px-3 py-4 sm:px-4 sm:py-5">
          {messagesQuery.isLoading ? (
            <InlineLoading />
          ) : messagesQuery.isError ? (
            <ErrorState onRetry={() => messagesQuery.refetch()} />
          ) : !(messagesQuery.data || []).length ? (
            <EmptyConversation onPick={(text) => setDraft(text)} title={t("msg_start_chat")} />
          ) : (
            (messagesQuery.data || []).map((msg: KXMessage) => (
              <Bubble key={msg.id} msg={msg} mineId={me?.id} peer={peer} onDelete={removeMessage} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="kx-chat-composer shrink-0 px-3 pt-2 sm:px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.55rem)" }}>
          {attachments.length ? (
            <div className="mb-2 flex gap-2 overflow-x-auto rounded-kx-lg border border-white/70 bg-white/60 p-2 shadow-kx-card backdrop-blur dark:border-white/10 dark:bg-kx-card/70">
              {attachments.map((m) => (
                <div key={m.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-kx-soft ring-1 ring-white/70">
                  {isVideoMedia(m) ? (
                    <>
                      {mediaPreviewImageUrl(m) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaPreviewImageUrl(m)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)]" />
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/10">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">
                          <Play className="h-4 w-4" />
                        </span>
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreviewImageUrl(m) || m.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white backdrop-blur"
                    onClick={() => {
                      if (m.url?.startsWith("blob:")) URL.revokeObjectURL(m.url);
                      setAttachments((prev) => prev.filter((x) => x.id !== m.id));
                    }}
                    aria-label="移除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {emojiOpen ? <EmojiPanel onPick={insertEmoji} /> : null}

          <div className="kx-chat-compose-surface">
            <button
              type="button"
              className="kx-chat-tool-button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading || attachmentLimitReached}
              aria-label={t("msg_add_media")}
              title={hasVideo ? t("msg_media_video_added") : imageCount >= MESSAGE_IMAGE_LIMIT ? t("msg_media_image_limit_hint") : undefined}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                // Snapshot before clearing: FileList is live and value="" empties it.
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onFiles(files);
              }}
            />
            <button
              type="button"
              className={clsx("kx-chat-tool-button", emojiOpen && "bg-kx-accentSoft text-kx-accent")}
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="表情"
            >
              <Smile className="h-5 w-5" />
            </button>
            <textarea
              ref={textareaRef}
              className="kx-chat-textarea"
              placeholder={t("msg_input_placeholder")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 120)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="kx-chat-send-button"
              onClick={send}
              disabled={sending || uploading || (!draft.trim() && attachments.length === 0)}
              aria-label="发送"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function EmptyConversation({ title, onPick }: { title: string; onPick: (text: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[18rem] place-items-center px-5 py-10">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/78 text-kx-accent shadow-kx-float ring-1 ring-white/80 backdrop-blur dark:bg-kx-card dark:ring-white/10">
          <MessageCircle className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm font-semibold text-kx-subtle">{title}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_REPLY_KEYS.map((replyKey) => {
            const reply = t(replyKey);
            return (
              <button
                key={replyKey}
                type="button"
                onClick={() => onPick(reply)}
                className="rounded-full border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-kx-text shadow-[0_10px_26px_-22px_rgba(15,23,42,0.55)] transition hover:-translate-y-px hover:bg-white dark:border-white/10 dark:bg-kx-card dark:hover:bg-kx-soft"
              >
                {reply}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="kx-chat-emoji-panel mb-2 p-3">
      <div className="space-y-3">
        {EMOJI_GROUPS.map((group) => (
          <section key={group.labelKey}>
            <div className="mb-1.5 px-1 text-[11px] font-bold text-kx-muted">{t(group.labelKey)}</div>
            <div className="grid grid-cols-8 gap-1">
              {group.items.map((emoji, idx) => (
                <button
                  key={`${group.labelKey}-${emoji}-${idx}`}
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-2xl text-lg transition hover:bg-kx-accentSoft active:scale-95"
                  onClick={() => onPick(emoji)}
                  aria-label={`${t("msg_insert_emoji")} ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Bubble({ msg, mineId, peer, onDelete }: { msg: KXMessage; mineId?: string; peer?: KXUser | null; onDelete: (id: string) => void }) {
  const { locale, t } = useI18n();
  const mine = msg.sender_id === mineId;
  return (
    <div className={clsx("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine ? <Avatar user={peer || undefined} size={30} /> : null}
      <div className={clsx("flex max-w-[82%] flex-col gap-1.5 sm:max-w-[76%]", mine && "items-end")}>
        {msg.media?.length ? (
          <div className={clsx("overflow-hidden rounded-[20px] shadow-kx-card", mine ? "ring-1 ring-kx-accent/25" : "ring-1 ring-white/80 dark:ring-white/10")}>
            <MediaGrid items={msg.media} rounded={false} />
          </div>
        ) : null}
        {msg.attachments?.length ? (
          <PrivateAttachmentGrid messageId={msg.id} attachments={msg.attachments} mine={mine} />
        ) : null}
        {msg.content ? (
          <div
            className={clsx(
              "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-6 shadow-kx-card",
              mine
                ? "rounded-kx-lg rounded-br-md bg-[linear-gradient(135deg,rgb(34_140_126),rgb(var(--kx-accent))_54%,rgb(12_78_70))] text-white"
                : "rounded-kx-lg rounded-bl-md border border-white/80 bg-white/[0.86] text-kx-text backdrop-blur dark:border-white/10 dark:bg-kx-card",
            )}
          >
            {msg.content}
          </div>
        ) : null}
        <div className={clsx("flex items-center gap-1 text-[10px] font-medium text-kx-muted", mine && "flex-row-reverse")}>
          <time dateTime={msg.created_at} suppressHydrationWarning>{relativeTime(msg.created_at, locale)}</time>
          {mine ? (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className="opacity-60 transition hover:text-kx-danger sm:opacity-0 sm:group-hover:opacity-100"
              aria-label={t("action_delete")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PrivateAttachmentGrid({ messageId, attachments, mine }: { messageId: string; attachments: KXMessageAttachment[]; mine: boolean }) {
  return (
    <div
      className={clsx(
        "grid max-w-[18rem] gap-1 overflow-hidden rounded-[20px] p-1 shadow-kx-card",
        attachments.length === 1 ? "grid-cols-1" : "grid-cols-2",
        mine ? "bg-kx-accentSoft ring-1 ring-kx-accent/20" : "bg-white/80 ring-1 ring-white/80 dark:bg-kx-card dark:ring-white/10",
      )}
    >
      {attachments.map((attachment) => (
        <SignedMessageAttachment key={attachment.id} messageId={messageId} attachment={attachment} />
      ))}
    </div>
  );
}

function SignedMessageAttachment({ messageId, attachment }: { messageId: string; attachment: KXMessageAttachment }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const isVideo = attachment.type === "video";
  const isImage = attachment.type === "image";

  const load = async () => {
    if (loading || url) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.messageAttachmentViewUrl(messageId, attachment.id);
      // The backend signs an ABSOLUTE url from its own request base; behind a
      // proxy that host/scheme can be unreachable for the browser. Route it
      // through the page origin instead.
      setUrl(sameOriginApiUrl(result.url));
    } catch (err) {
      setError((err as APIError).message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isImage || isVideo) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id, isImage, isVideo]);

  if (url && isVideo) {
    return (
      <video
        src={url}
        poster={fallbackVideoPoster}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-2xl bg-black object-contain"
      />
    );
  }

  if (url && isImage) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="block w-full overflow-hidden rounded-2xl bg-kx-soft"
          style={{ aspectRatio: mediaCardAspectRatio(attachment) }}
          aria-label="查看图片"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        </button>
        {viewerOpen ? (
          <Lightbox
            items={[{ id: attachment.id, type: "image", url, width: attachment.width, height: attachment.height } as KXMedia]}
            startIndex={0}
            onClose={() => setViewerOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={url ? () => window.open(url, "_blank", "noopener,noreferrer") : load}
      className="grid min-h-[7rem] place-items-center rounded-2xl bg-white/70 p-3 text-center text-xs font-bold text-kx-muted ring-1 ring-white/80 transition hover:bg-white hover:text-kx-accent dark:bg-kx-card dark:ring-white/10 dark:hover:bg-kx-soft"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : error ? (
        <span>加载失败，点击重试</span>
      ) : isVideo ? (
        <span className="grid gap-2 place-items-center"><Play className="h-6 w-6" />视频</span>
      ) : isImage ? (
        <span className="grid gap-2 place-items-center"><ImageIcon className="h-6 w-6" />图片</span>
      ) : (
        <span>{attachment.file_name || "附件"}</span>
      )}
    </button>
  );
}
