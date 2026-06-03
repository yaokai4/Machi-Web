"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Image as ImageIcon, Loader2, MessageCircle, Play, Send, Smile, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { MediaGrid } from "@/components/design/MediaGrid";
import { relativeTime } from "@/lib/format";
import { useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { KXMedia, KXMessage, KXUser } from "@/lib/types";
import { showVerifiedBadge } from "@/lib/types";

const EMOJI_GROUPS = [
  {
    label: "常用",
    items: ["😀", "😄", "😂", "🤣", "😊", "🥹", "😍", "😘", "😎", "🤔", "😮", "😭", "😴", "🙈", "😋", "😌"],
  },
  {
    label: "回应",
    items: ["👍", "👎", "🙏", "👏", "🙌", "🤝", "💪", "👌", "🤏", "🫶", "✌️", "🤟", "✅", "👀", "💯", "🫡"],
  },
  {
    label: "心情",
    items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "✨", "🔥", "🎉", "🌟", "💡", "💬", "🌙", "☀️", "🌧️", "🍀"],
  },
  {
    label: "本地生活",
    items: ["☕", "🍜", "🍣", "🍱", "🍻", "🍰", "🏠", "🚇", "🚕", "📍", "📷", "🎧", "📚", "💼", "🛒", "🧳"],
  },
];

const QUICK_REPLIES = ["你好，我想了解一下", "现在方便聊吗？", "谢谢，我晚点回复"];

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
        if (f.size > 50 * 1024 * 1024) {
          pushToast({ kind: "error", message: `${f.name} 超过 50MB 限制` });
          continue;
        }
        const m = await api.uploadMediaBase64(f);
        uploaded.push(m);
      }
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 9));
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
      await api.sendMessage(id, draft.trim(), attachments.map((m) => m.id));
      setDraft("");
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
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/70 bg-white/70 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.08)] transition hover:bg-white"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {peer ? (
            <a href={`/u/${peer.handle}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar user={peer} size={42} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[15px] font-black leading-tight text-kx-text">
                  <span className="truncate">{peer.display_name}</span>
                  {showVerifiedBadge(peer) ? <VerifiedBadge /> : null}
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-kx-muted">@{peer.handle}</div>
              </div>
            </a>
          ) : (
            <div className="min-w-0">
              <div className="text-[15px] font-black text-kx-text">对话</div>
              <div className="text-xs text-kx-muted">私信</div>
            </div>
          )}
          <span className="ml-auto hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100 sm:inline-flex">
            私信对话
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
            <div className="mb-2 flex gap-2 overflow-x-auto rounded-[22px] border border-white/70 bg-white/60 p-2 shadow-[0_12px_34px_-28px_rgba(15,23,42,0.5)] backdrop-blur">
              {attachments.map((m) => (
                <div key={m.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-kx-soft ring-1 ring-white/70">
                  {m.type === "video" ? (
                    <>
                      <video
                        src={m.url}
                        poster={m.thumb_url && m.thumb_url !== m.url ? m.thumb_url : undefined}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/10">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">
                          <Play className="h-4 w-4" />
                        </span>
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb_url || m.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white backdrop-blur"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== m.id))}
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
              disabled={uploading}
              aria-label="添加图片或视频"
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
                if (e.target.files) onFiles(e.target.files);
                e.target.value = "";
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
  return (
    <div className="grid min-h-[18rem] place-items-center px-5 py-10">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/78 text-kx-accent shadow-[0_18px_50px_-36px_rgba(15,23,42,0.7)] ring-1 ring-white/80 backdrop-blur">
          <MessageCircle className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm font-semibold text-kx-subtle">{title}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => onPick(reply)}
              className="rounded-full border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-kx-text shadow-[0_10px_26px_-22px_rgba(15,23,42,0.55)] transition hover:-translate-y-px hover:bg-white"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="kx-chat-emoji-panel mb-2 p-3">
      <div className="space-y-3">
        {EMOJI_GROUPS.map((group) => (
          <section key={group.label}>
            <div className="mb-1.5 px-1 text-[11px] font-bold text-kx-muted">{group.label}</div>
            <div className="grid grid-cols-8 gap-1">
              {group.items.map((emoji, idx) => (
                <button
                  key={`${group.label}-${emoji}-${idx}`}
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-2xl text-lg transition hover:bg-kx-accentSoft active:scale-95"
                  onClick={() => onPick(emoji)}
                  aria-label={`插入 ${emoji}`}
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
  const mine = msg.sender_id === mineId;
  return (
    <div className={clsx("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine ? <Avatar user={peer || undefined} size={30} /> : null}
      <div className={clsx("flex max-w-[82%] flex-col gap-1.5 sm:max-w-[76%]", mine && "items-end")}>
        {msg.media?.length ? (
          <div className={clsx("overflow-hidden rounded-[20px] shadow-[0_12px_34px_-26px_rgba(15,23,42,0.58)]", mine ? "ring-1 ring-blue-200/70" : "ring-1 ring-white/80")}>
            <MediaGrid items={msg.media} rounded={false} />
          </div>
        ) : null}
        {msg.content ? (
          <div
            className={clsx(
              "whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-6 shadow-[0_12px_34px_-28px_rgba(15,23,42,0.58)]",
              mine
                ? "rounded-[22px] rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
                : "rounded-[22px] rounded-bl-md border border-white/80 bg-white/[0.86] text-kx-text backdrop-blur",
            )}
          >
            {msg.content}
          </div>
        ) : null}
        <div className={clsx("flex items-center gap-1 text-[10px] font-medium text-kx-muted", mine && "flex-row-reverse")}>
          <span>{relativeTime(msg.created_at)}</span>
          {mine ? (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className="opacity-60 transition hover:text-kx-danger sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
