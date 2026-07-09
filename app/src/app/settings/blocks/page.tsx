"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

// Local zh / ja / en copy — the shared i18n dictionary is owned by another
// workstream, so this page carries its own table to meet the tri-lingual rule
// without cross-file churn (mirrors the settings page approach).
type Lang = "zh" | "ja" | "en";
const COPY: Record<Lang, { title: string; emptyTitle: string; emptySub: string; unblock: string; unblocked: string }> = {
  zh: {
    title: "黑名单",
    emptyTitle: "还没有拉黑任何人",
    emptySub: "在他人主页可以拉黑用户。",
    unblock: "解除拉黑",
    unblocked: "已解除拉黑",
  },
  ja: {
    title: "ブロックリスト",
    emptyTitle: "まだ誰もブロックしていません",
    emptySub: "他の人のプロフィールからユーザーをブロックできます。",
    unblock: "ブロック解除",
    unblocked: "ブロックを解除しました",
  },
  en: {
    title: "Blocklist",
    emptyTitle: "You haven't blocked anyone",
    emptySub: "You can block a user from their profile.",
    unblock: "Unblock",
    unblocked: "Unblocked",
  },
};
function blocksLang(locale: string): Lang {
  if (locale === "ja") return "ja";
  if (locale === "en") return "en";
  return "zh";
}

export default function BlocksPage() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
  const L = COPY[blocksLang(locale)];
  const q = useQuery({ queryKey: ["blocks"], queryFn: () => api.blocks() });

  const unblock = async (id: string) => {
    try {
      await api.block(id, false);
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      pushToast({ kind: "success", message: L.unblocked });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0" aria-label={L.title}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">{L.title}</h1>
      </header>
      <div className="px-3 sm:px-4 py-3">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title={L.emptyTitle} subtitle={L.emptySub} icon={Shield} />
        ) : (
          <ul className="kx-card p-0 overflow-hidden divide-y divide-kx-stroke/30">
            {q.data.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 px-4 py-3 transition hover:bg-kx-soft/50">
                <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar user={u} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold flex items-center gap-1 truncate">
                      {u.display_name}
                      {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                    </div>
                    <div className="text-kx-muted text-xs truncate">@{u.handle}</div>
                  </div>
                </Link>
                <button className="kx-button-ghost h-8 shrink-0 text-xs" onClick={() => unblock(u.id)}>{L.unblock}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
