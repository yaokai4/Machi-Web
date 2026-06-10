"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { useSession } from "@/lib/store";
import { regionDisplayName, regionFromUser, regionShortLabel } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";

/// Card surfacing the user's currently-browsing region. Mirrors the iOS
/// `CurrentRegionCard` and gives the discover landing page a clear
/// "you're here" frame.
export function CurrentRegionCard({ onChange }: { onChange?: () => void }) {
  const user = useSession((s) => s.user);
  const { locale } = useI18n();
  const region = regionFromUser(user);
  const title = regionDisplayName(region, locale);
  const city = regionShortLabel(region, locale);
  const subtitle = region
    ? locale === "ja"
      ? `ホーム、発見、ランキングは${city}を中心に更新されます`
      : locale === "en"
        ? `Home, Discover and Trending refresh around ${city}`
        : `首页、发现和热榜会围绕${city}更新`
    : locale === "ja"
      ? "都市を選ぶと、ホーム、発見、ランキングに地域コンテンツが表示されます"
      : locale === "en"
        ? "Choose a city to make Home, Discover and Trending local"
        : "选择城市后，首页、发现和热榜会围绕本地内容展开";
  const switchLabel = locale === "ja" ? "都市を切り替え" : locale === "en" ? "Switch city" : "切换城市";

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
            {title}
          </div>
          <div className="text-[11px] text-kx-muted truncate">
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <MapPin className="w-3.5 h-3.5 text-kx-accent" />
          <span className="text-xs font-bold text-kx-accent">{switchLabel}</span>
          <ChevronRight className="w-3.5 h-3.5 text-kx-muted" />
        </div>
      </div>
    </button>
  );
}
