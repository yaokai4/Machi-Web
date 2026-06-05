"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Smartphone, ArrowLeft } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { fullDateTime } from "@/lib/format";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() });

  const revoke = async (id: string) => {
    if (!window.confirm(t("devices_revoke_confirm"))) return;
    try {
      await api.revokeDevice(id);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      pushToast({ kind: "success", message: t("devices_revoked") });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">{t("devices_title")}</h1>
      </header>
      <div className="px-3 sm:px-4 py-3">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title={t("devices_empty")} icon={Smartphone} />
        ) : (
          <ul className="kx-card p-0 overflow-hidden divide-y divide-kx-stroke/30">
            {q.data.map((d) => (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                <Smartphone className="w-5 h-5 text-kx-muted mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{d.device_label || d.device_name || d.user_agent.slice(0, 40) || t("devices_unknown")}</div>
                  <div className="mt-0.5 text-xs text-kx-muted">
                    {t("devices_recent_active")} {fullDateTime(d.last_seen_at)} · {d.ip || t("devices_unknown_ip")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold text-kx-muted">
                    <span className="rounded-full bg-kx-soft px-2 py-0.5">{deviceLocation(d, t("devices_unknown_location"))}</span>
                    {d.org ? <span className="rounded-full bg-kx-soft px-2 py-0.5">{d.org}</span> : null}
                    {d.session_count && d.session_count > 1 ? (
                      <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{d.session_count} {t("devices_session_count")}</span>
                    ) : null}
                  </div>
                </div>
                <button className="kx-button-ghost h-8 text-xs text-kx-danger" onClick={() => revoke(d.id)}>{t("devices_revoke")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function deviceLocation(device: { country?: string; region?: string; city?: string }, fallback: string) {
  const parts = [zhGeo(device.country), zhGeo(device.region), zhGeo(device.city)].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

const DEVICE_GEO_ZH: Record<string, string> = {
  japan: "日本",
  "united states": "美国",
  netherlands: "荷兰",
  "united kingdom": "英国",
  taiwan: "中国台湾",
  "south korea": "韩国",
  "hong kong": "中国香港",
  china: "中国",
  tokyo: "东京",
  osaka: "大阪",
  katsushika: "葛饰区",
  flevoland: "弗莱福兰省",
  dronten: "德龙滕",
};

function zhGeo(value?: string) {
  const raw = String(value || "").trim();
  return raw ? DEVICE_GEO_ZH[raw.toLowerCase()] || raw : "";
}
