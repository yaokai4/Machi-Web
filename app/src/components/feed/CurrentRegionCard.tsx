"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { useSession } from "@/lib/store";
import { regionDisplayName, regionFromUser } from "@/lib/regions";

/// Lightweight current-region strip. It keeps the country / city context
/// visible without adding another heavy bordered card to the page.
export function CurrentRegionCard({ onChange }: { onChange?: () => void }) {
  const user = useSession((s) => s.user);
  const region = regionFromUser(user);
  const title = region ? `${region.country_name} · ${region.city_name}` : "选择当前城市";

  return (
    <button
      type="button"
      onClick={onChange}
      className="block w-full px-1 py-2 text-left transition hover:bg-kx-soft/45"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-kx-soft text-2xl">
          {region?.country_emoji || "⌖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-kx-text">
            {region ? title : regionDisplayName(region)}
          </div>
          <div className="truncate text-xs font-semibold text-kx-muted">
            {region
              ? `正在浏览${region.city_name}的本地动态和生活信息`
              : "选择城市后，首页、发现和热榜会围绕本地内容展开"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-kx-accent">
          <MapPin className="w-3.5 h-3.5 text-kx-accent" />
          <span className="text-xs font-bold">切换国家</span>
          <ChevronRight className="w-3.5 h-3.5 text-kx-muted" />
        </div>
      </div>
    </button>
  );
}
