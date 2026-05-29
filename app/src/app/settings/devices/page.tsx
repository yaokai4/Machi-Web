"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Smartphone, ArrowLeft } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { fullDateTime } from "@/lib/format";
import { useToasts } from "@/lib/store";

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() });

  const revoke = async (id: string) => {
    if (!window.confirm("撤销这个登录设备？")) return;
    try {
      await api.revokeDevice(id);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      pushToast({ kind: "success", message: "已撤销" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">登录设备</h1>
      </header>
      <div className="px-3 sm:px-4 py-3">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="没有登录设备" icon={Smartphone} />
        ) : (
          <ul className="kx-card p-0 overflow-hidden divide-y divide-kx-stroke/30">
            {q.data.map((d) => (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                <Smartphone className="w-5 h-5 text-kx-muted mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{d.device_name || d.user_agent.slice(0, 40) || "未知设备"}</div>
                  <div className="text-xs text-kx-muted mt-0.5">最近活跃 {fullDateTime(d.last_seen_at)} · {d.ip || "未知 IP"}</div>
                </div>
                <button className="kx-button-ghost h-8 text-xs text-kx-danger" onClick={() => revoke(d.id)}>撤销</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
