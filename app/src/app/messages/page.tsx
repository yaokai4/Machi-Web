"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, PenSquare, Search, Trash2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { showVerifiedBadge } from "@/lib/types";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { Dialog } from "@/components/design/Dialog";
import { relativeTime } from "@/lib/format";
import { useToasts } from "@/lib/store";
import { useDebounce } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

export default function MessagesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const [newOpen, setNewOpen] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const [peerSearchText, setPeerSearchText] = useState("");
  const debouncedSearch = useDebounce(peerSearchText, 250);

  const convos = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations(),
    refetchInterval: 30000,
  });

  const peerSearch = useQuery({
    queryKey: ["peer-search", debouncedSearch],
    queryFn: () => api.search(debouncedSearch, "user"),
    enabled: debouncedSearch.length > 0 && newOpen,
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

  const visibleConvos = useMemo(() => {
    const items = convos.data || [];
    const q = listFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((conv) => {
      const peer = conv.peer;
      const haystack = [
        peer?.display_name,
        peer?.handle,
        conv.last_message?.content,
        conv.last_message?.media?.length ? "图片 视频 附件 media" : "",
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [convos.data, listFilter]);

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-kx-md bg-kx-accentSoft text-kx-accent">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black leading-tight">{t("msg_title")}</h1>
            <p className="truncate text-xs text-kx-muted">朋友、商家和同城联系集中在这里</p>
          </div>
          <button onClick={() => setNewOpen(true)} className="kx-button-primary ml-auto h-9 shrink-0" aria-label={t("msg_new")}>
            <PenSquare className="w-4 h-4" /> <span className="hidden sm:inline">{t("msg_new")}</span>
          </button>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-kx-md border border-kx-stroke/70 bg-kx-card/80 px-3 text-sm text-kx-muted">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="搜索会话、用户名或消息内容"
            className="min-w-0 flex-1 bg-transparent text-kx-text outline-none placeholder:text-kx-muted"
          />
        </label>
      </header>

      {convos.isLoading ? (
        <InlineLoading />
      ) : convos.isError ? (
        <ErrorState onRetry={() => convos.refetch()} />
      ) : !convos.data?.length ? (
        <EmptyState title={t("msg_empty_title")} subtitle={t("msg_empty_subtitle")} icon={Mail} />
      ) : !visibleConvos.length ? (
        <EmptyState title="没有匹配的会话" subtitle="换个关键词试试，或者发起一条新私信。" icon={Search} />
      ) : (
        <ul className="space-y-2 px-3 py-3 sm:px-4">
          {visibleConvos.map((conv) => {
            const peer = conv.peer;
            return (
              <li key={conv.id} className="group">
                <Link
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-3 rounded-kx-lg border border-kx-stroke/60 bg-kx-card/90 px-3 py-3 shadow-sm transition hover:border-kx-accent/35 hover:bg-kx-soft/70"
                >
                  <Avatar user={peer || undefined} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate font-semibold">{peer?.display_name || "用户"}</span>
                      {showVerifiedBadge(peer) ? <VerifiedBadge /> : null}
                      <span className="min-w-0 truncate text-xs text-kx-muted">@{peer?.handle || "unknown"}</span>
                      {conv.last_message ? (
                        <span className="ml-auto text-xs text-kx-muted shrink-0">
                          {relativeTime(conv.last_message.created_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-kx-subtle truncate mt-0.5">
                      {conv.last_message?.content || (conv.last_message?.media?.length ? "[图片]" : "开始对话…")}
                    </div>
                  </div>
                  {conv.unread_count > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-kx-accent px-1.5 text-xs text-white">
                      {conv.unread_count}
                    </span>
                  ) : null}
                  <button
                    className="rounded-full p-1 text-kx-muted opacity-100 transition hover:bg-kx-danger/10 hover:text-kx-danger sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (window.confirm("删除整个会话？")) deleteConv(conv.id);
                    }}
                    aria-label="删除"
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
            value={peerSearchText}
            onChange={(e) => setPeerSearchText(e.target.value)}
            autoFocus
          />
        </div>
        <ul className="max-h-72 overflow-y-auto divide-y divide-kx-stroke/30">
          {(peerSearch.data?.users || []).map((u) => (
            <li key={u.id}>
              <button className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-kx-soft rounded-kx-sm" onClick={() => startConversation(u.id)}>
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="font-semibold text-sm truncate flex items-center gap-1">
                    {u.display_name}
                    {showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                  </div>
                  <div className="text-xs text-kx-muted">@{u.handle}</div>
                </div>
              </button>
            </li>
          ))}
          {debouncedSearch && !peerSearch.isLoading && !(peerSearch.data?.users || []).length ? (
            <li className="text-sm text-kx-muted px-2 py-3">{t("msg_no_users")}</li>
          ) : null}
        </ul>
      </Dialog>
    </AppShell>
  );
}
