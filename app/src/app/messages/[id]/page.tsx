"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { showVerifiedBadge } from "@/lib/types";

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
      <div className="flex min-h-[100dvh] flex-col bg-kx-bg/35">
        <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label="返回">
              <ArrowLeft className="w-4 h-4" />
            </button>
            {peer ? (
              <Link href={`/u/${peer.handle}`} className="flex min-w-0 items-center gap-2">
                <Avatar user={peer} size={36} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 truncate font-semibold">
                    {peer.display_name}
                    {showVerifiedBadge(peer) ? <VerifiedBadge /> : null}
                  </div>
                  <div className="truncate text-xs text-kx-muted">@{peer.handle}</div>
                </div>
              </Link>
            ) : (
              <span className="font-semibold">对话</span>
            )}
            <span className="ml-auto rounded-full bg-kx-soft px-2 py-1 text-[11px] font-semibold text-kx-muted">
              私信
            </span>
          </div>
        </header>

        <main className="flex-1 space-y-2 px-3 py-4 pb-5 sm:px-4">
          {messagesQuery.isLoading ? (
            <InlineLoading />
          ) : messagesQuery.isError ? (
            <ErrorState onRetry={() => messagesQuery.refetch()} />
          ) : !(messagesQuery.data || []).length ? (
            <div className="rounded-kx-lg border border-dashed border-kx-stroke bg-kx-card/60 px-4 py-10 text-center text-sm text-kx-muted">
              还没有消息，发送第一条吧。
            </div>
          ) : (
            (messagesQuery.data || []).map((msg: KXMessage) => <Bubble key={msg.id} msg={msg} mineId={me?.id} onDelete={removeMessage} />)
          )}
          <div ref={bottomRef} />
        </main>

        <div className="sticky bottom-0 z-30 border-t border-kx-stroke/40 bg-kx-bg/90 px-3 py-2 shadow-[0_-10px_30px_rgb(0_0_0/0.06)] backdrop-blur sm:px-4"
             style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}>
          {attachments.length ? (
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {attachments.map((m) => (
                <div key={m.id} className="relative aspect-square overflow-hidden rounded-kx-md bg-kx-soft">
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
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== m.id))}
                    aria-label="移除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2 rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-1.5">
            <button className="kx-button-ghost h-10 w-10 shrink-0 p-0" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="附件">
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
              className="min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-kx-text outline-none placeholder:text-kx-muted"
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
            <button className="kx-button-primary h-10 w-10 shrink-0 p-0" onClick={send} disabled={sending} aria-label="发送">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Bubble({ msg, mineId, onDelete }: { msg: KXMessage; mineId?: string; onDelete: (id: string) => void }) {
  const mine = msg.sender_id === mineId;
  return (
    <div className={clsx("flex group", mine ? "justify-end" : "justify-start")}>
      <div className={clsx("flex max-w-[82%] flex-col gap-1 sm:max-w-[32rem]", mine && "items-end")}>
        {msg.media?.length ? <MediaGrid items={msg.media} /> : null}
        {msg.content ? (
          <div
            className={clsx(
              "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-6 shadow-sm",
              mine ? "rounded-br-md bg-kx-accent text-white" : "rounded-bl-md border border-kx-stroke/60 bg-kx-card text-kx-text",
            )}
          >
            {msg.content}
          </div>
        ) : null}
        <div className={clsx("text-[10px] text-kx-muted flex items-center gap-1", mine && "flex-row-reverse")}>
          {relativeTime(msg.created_at)}
          {mine ? (
            <button onClick={() => onDelete(msg.id)} className="text-kx-muted opacity-100 hover:text-kx-danger sm:opacity-0 sm:group-hover:opacity-100" aria-label="删除">
              <Trash2 className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
