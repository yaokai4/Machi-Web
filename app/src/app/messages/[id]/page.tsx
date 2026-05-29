"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Image as ImageIcon, Loader2, Play, Send, Smile, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { MediaGrid } from "@/components/design/MediaGrid";
import { relativeTime } from "@/lib/format";
import { useSession, useToasts } from "@/lib/store";
import type { KXMedia, KXMessage } from "@/lib/types";

const EMOJI_CHOICES = ["😀", "😂", "😍", "🥹", "👍", "🙏", "👏", "🔥", "🎉", "❤️", "💜", "✨", "😮", "😢", "😡", "🤝", "☕", "🍜", "🏠", "📍"];

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const me = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data?.length]);

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
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
    setEmojiOpen(false);
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
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label="返回">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {peer ? (
          <a href={`/u/${peer.handle}`} className="flex items-center gap-2 min-w-0">
            <Avatar user={peer} size={36} />
            <div className="min-w-0">
              <div className="font-semibold truncate flex items-center gap-1">
                {peer.display_name}
                {peer.is_verified ? <VerifiedBadge /> : null}
              </div>
              <div className="text-xs text-kx-muted truncate">@{peer.handle}</div>
            </div>
          </a>
        ) : (
          <span className="font-semibold">对话</span>
        )}
      </header>

      <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 200px)" }}>
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2">
          {messagesQuery.isLoading ? (
            <InlineLoading />
          ) : messagesQuery.isError ? (
            <ErrorState onRetry={() => messagesQuery.refetch()} />
          ) : !(messagesQuery.data || []).length ? (
            <div className="text-center text-kx-muted text-sm py-12">还没有消息，发送第一条吧。</div>
          ) : (
            (messagesQuery.data || []).map((msg: KXMessage) => <Bubble key={msg.id} msg={msg} mineId={me?.id} onDelete={removeMessage} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="sticky bottom-0 bg-kx-bg/85 backdrop-blur border-t border-kx-stroke/40 px-3 sm:px-4 py-2"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}>
        {attachments.length ? (
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {attachments.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-kx-sm overflow-hidden bg-kx-soft">
                {m.type === "video" ? (
                  <>
                    <video
                      src={m.url}
                      poster={m.thumb_url && m.thumb_url !== m.url ? m.thumb_url : undefined}
                      className="w-full h-full object-cover"
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
                  <img src={m.thumb_url || m.url} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== m.id))}
                  aria-label="移除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <button className="kx-button-ghost h-10 w-10 p-0 shrink-0" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="附件">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
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
          <div className="relative shrink-0">
            <button
              className="kx-button-ghost h-10 w-10 p-0"
              onClick={() => setEmojiOpen((v) => !v)}
              type="button"
              aria-label="表情"
            >
              <Smile className="w-4 h-4" />
            </button>
            {emojiOpen ? (
              <div className="absolute bottom-full left-0 z-40 mb-2 grid w-56 grid-cols-5 gap-1 rounded-kx-md border border-kx-stroke bg-kx-card p-2 shadow-kx">
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-kx-sm text-lg hover:bg-kx-soft"
                    onClick={() => insertEmoji(emoji)}
                    aria-label={`插入 ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            className="kx-textarea flex-1 max-h-32 min-h-10 py-2"
            placeholder="输入消息，⌘/Ctrl + Enter 发送"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="kx-button-primary h-10 w-10 p-0 shrink-0" onClick={send} disabled={sending} aria-label="发送">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Bubble({ msg, mineId, onDelete }: { msg: KXMessage; mineId?: string; onDelete: (id: string) => void }) {
  const mine = msg.sender_id === mineId;
  return (
    <div className={clsx("flex group", mine ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[78%] flex flex-col gap-1", mine && "items-end")}>
        {msg.media?.length ? <MediaGrid items={msg.media} /> : null}
        {msg.content ? (
          <div
            className={clsx(
              "rounded-kx-md px-3 py-2 text-sm whitespace-pre-wrap break-words",
              mine ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-text",
            )}
          >
            {msg.content}
          </div>
        ) : null}
        <div className={clsx("text-[10px] text-kx-muted flex items-center gap-1", mine && "flex-row-reverse")}>
          {relativeTime(msg.created_at)}
          {mine ? (
            <button onClick={() => onDelete(msg.id)} className="text-kx-muted hover:text-kx-danger opacity-0 group-hover:opacity-100" aria-label="删除">
              <Trash2 className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
