"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { useSession } from "@/lib/store";
import { regionDisplayName, regionFromUser } from "@/lib/regions";

/// Card surfacing the user's currently-browsing region. Mirrors the iOS
/// `CurrentRegionCard` and gives the discover landing page a clear
/// "you're here" frame.
export function CurrentRegionCard({ onChange }: { onChange?: () => void }) {
  const user = useSession((s) => s.user);
  const region = regionFromUser(user);
  const title = region ? `${region.country_name} · ${region.city_name}` : "选择当前城市";

  return (
    <button
      type="button"
      onClick={onChange}
      className="block w-full rounded-kx-sheet bg-kx-card border border-kx-stroke/70 p-4 text-left shadow-kx hover:border-kx-accent/30 transition"
    >
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-12 h-12 rounded-full bg-kx-card/75 border border-kx-stroke/50 text-2xl shrink-0">
          {region?.country_emoji || "⌖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-kx-text truncate">
            {region ? title : regionDisplayName(region)}
          </div>
          <div className="text-[11px] text-kx-muted truncate">
            {region
              ? `正在浏览${region.city_name}的本地动态和生活信息`
              : "选择城市后，首页、发现和热榜会围绕本地内容展开"}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <MapPin className="w-3.5 h-3.5 text-kx-accent" />
          <span className="text-xs font-bold text-kx-accent">切换城市</span>
          <ChevronRight className="w-3.5 h-3.5 text-kx-muted" />
        </div>
      </div>
    </button>
  );
}
