"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { regionAccountPatch, regionShortLabel, resolveRegion } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";

/// Horizontal chip row showing the user's recently-visited city codes.
/// Mirrors iOS `recentRegionsSection`. Empty list → renders nothing.
export function RecentCityChips() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { locale } = useI18n();
  const currentCountry = user?.country || "jp";
  const recent = (user?.recent_region_codes ?? []).filter((code) => resolveRegion(code)?.country_code === currentCountry);
  if (!recent.length) return null;

  const selectRegion = async (code: string) => {
    const region = resolveRegion(code);
    if (!region) return;
    setBusy(code);
    try {
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["explore-hot-city"] });
      pushToast({ kind: "success", message: `已切换到 ${regionShortLabel(region, locale)}` });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h3 className="kx-section-title mb-2 px-0">最近浏览</h3>
      <div className="flex gap-1.5 overflow-x-auto kx-scroll -mx-3 px-3 pb-1">
        {recent.slice(0, 8).map((code) => {
          const region = resolveRegion(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => selectRegion(code)}
              disabled={busy === code || !region}
              className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-full bg-kx-card border border-kx-stroke/60 text-sm font-semibold text-kx-text hover:border-kx-accent/40 hover:bg-kx-soft/80 hover:shadow-sm transition disabled:opacity-60"
            >
              <span>{region?.country_emoji || "🌐"}</span>
              <span className="truncate max-w-[7rem]">{region ? regionShortLabel(region, locale) : code}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
