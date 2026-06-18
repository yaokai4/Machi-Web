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

export default function BlocksPage() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["blocks"], queryFn: () => api.blocks() });

  const unblock = async (id: string) => {
    try {
      await api.block(id, false);
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">黑名单</h1>
      </header>
      <div className="px-3 sm:px-4 py-3">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="还没有拉黑任何人" subtitle="在他人主页可以拉黑用户。" icon={Shield} />
        ) : (
          <ul className="kx-card p-0 overflow-hidden divide-y divide-kx-stroke/30">
            {q.data.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 px-4 py-3">
                <Avatar user={u} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold flex items-center gap-1">
                    {u.display_name}
                    {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                  </div>
                  <div className="text-kx-muted text-xs">@{u.handle}</div>
                </div>
                <button className="kx-button-ghost h-8 text-xs" onClick={() => unblock(u.id)}>解除拉黑</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
