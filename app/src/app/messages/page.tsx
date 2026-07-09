"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Mail, PenSquare, Search, Trash2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { Dialog } from "@/components/design/Dialog";
import { relativeTime } from "@/lib/format";
import { useToasts } from "@/lib/store";
import { useDebounce } from "@/lib/hooks";
import { useI18n, type Locale } from "@/lib/i18n";

export default function MessagesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const { t, locale } = useI18n();
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  const convos = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations(),
    refetchInterval: 30000,
  });

  const mutualFriends = useQuery({
    queryKey: ["mutual-message-friends", debouncedSearch],
    queryFn: () => api.mutualMessageFriends({ q: debouncedSearch, limit: 50 }),
    enabled: newOpen,
  });

  const startConversation = async (peerId: string) => {
    try {
      const c = await api.openConversation(peerId);
      setNewOpen(false);
      router.push(`/messages/${c.id}`);
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const deleteConv = async (id: string) => {
    try {
      await api.deleteConversation(id);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <h1 className="text-lg font-bold">{t("msg_title")}</h1>
        <button onClick={() => setNewOpen(true)} className="kx-button-ghost h-9 ml-auto" aria-label={t("msg_new")}>
          <PenSquare className="w-4 h-4" /> {t("msg_new")}
        </button>
      </header>

      {convos.isLoading ? (
        <InlineLoading />
      ) : convos.isError ? (
        <ErrorState onRetry={() => convos.refetch()} />
      ) : !convos.data?.length ? (
        <EmptyState title={t("msg_empty_title")} subtitle={t("msg_empty_subtitle")} icon={Mail} action={{ label: t("msg_new"), onClick: () => setNewOpen(true) }} />
      ) : (
        <ul className="divide-y divide-kx-stroke/30">
          {convos.data.map((conv) => {
            const peer = conv.peer;
            return (
              <li key={conv.id} className="group">
                <Link
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-kx-soft"
                >
                  <Avatar user={peer || undefined} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{peer?.display_name || SOMEONE[msgLang(locale)]}</span>
                      {showOfficialBadge(peer) ? <OfficialBadge /> : showVerifiedBadge(peer) ? <VerifiedBadge /> : null}
                      <span className="text-kx-muted text-xs truncate">@{peer?.handle}</span>
                      {conv.last_message ? (
                        <span className="ml-auto text-xs text-kx-muted shrink-0">
                          <time dateTime={conv.last_message.created_at} suppressHydrationWarning>{relativeTime(conv.last_message.created_at, locale)}</time>
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-kx-subtle truncate mt-0.5">
                      {conversationPreview(conv.last_message, locale, t("msg_no_message"))}
                    </div>
                  </div>
                  {conv.unread_count > 0 ? (
                    <span className="bg-kx-accent text-white text-xs rounded-full min-w-5 h-5 inline-flex items-center justify-center px-1.5">
                      {conv.unread_count}
                    </span>
                  ) : null}
                  <button
                    className="opacity-0 group-hover:opacity-100 text-kx-muted hover:text-kx-danger p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (window.confirm(t("msg_delete_confirm"))) deleteConv(conv.id);
                    }}
                    aria-label={t("action_delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title={t("msg_new")}>
	        <div className="flex items-center gap-2 mb-2">
	          <Search className="w-4 h-4 text-kx-muted" />
	          <input
            className="kx-input flex-1"
            placeholder={t("msg_search_user")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
	            autoFocus
	          />
	        </div>
	        <p className="mb-2 text-xs text-kx-muted">{t("msg_mutual_only")}</p>
	        <ul className="max-h-72 overflow-y-auto divide-y divide-kx-stroke/30">
	          {mutualFriends.isLoading ? (
	            <li className="px-2 py-3">
	              <InlineLoading />
	            </li>
	          ) : null}
	          {(mutualFriends.data || []).map((u) => (
	            <li key={u.id}>
	              <button className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-kx-soft rounded-kx-sm" onClick={() => startConversation(u.id)}>
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="font-semibold text-sm truncate flex items-center gap-1">
                    {u.display_name}
                    {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                  </div>
                  <div className="text-xs text-kx-muted">@{u.handle}</div>
                </div>
	              </button>
	            </li>
	          ))}
	          {!mutualFriends.isLoading && !(mutualFriends.data || []).length ? (
	            <li className="text-sm text-kx-muted px-2 py-3">{t("msg_no_users")}</li>
	          ) : null}
	        </ul>
      </Dialog>
    </AppShell>
  );
}

// 会话预览里的媒体占位与「用户」兜底,随语言切换(私信页已三语化,别再漏中文)。
type MsgLang = "zh" | "ja" | "en";
function msgLang(locale: Locale): MsgLang {
  if (locale === "en") return "en";
  if (locale === "ja") return "ja";
  return "zh";
}
const MEDIA_LABELS: Record<MsgLang, { video: string; image: string; file: string }> = {
  zh: { video: "[视频]", image: "[图片]", file: "[附件]" },
  ja: { video: "[動画]", image: "[画像]", file: "[添付ファイル]" },
  en: { video: "[Video]", image: "[Photo]", file: "[Attachment]" },
};
const SOMEONE: Record<MsgLang, string> = { zh: "用户", ja: "ユーザー", en: "User" };

function conversationPreview(
  message: { content?: string; media?: Array<{ type?: string }>; attachments?: Array<{ type?: string; attachment_type?: string }> } | null | undefined,
  locale: Locale,
  noneLabel: string,
): string {
  if (!message) return noneLabel;
  if (message.content?.trim()) return message.content;
  const m = MEDIA_LABELS[msgLang(locale)];
  const attachment = message.attachments?.[0];
  const kind = attachment?.type || attachment?.attachment_type;
  if (kind === "video") return m.video;
  if (kind === "image") return m.image;
  if (message.attachments?.length) return m.file;
  const mediaKind = message.media?.[0]?.type;
  if (mediaKind === "video") return m.video;
  if (message.media?.length) return m.image;
  return noneLabel;
}
