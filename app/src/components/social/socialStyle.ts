// 社交房间 + 活动的共享样式速查:每个类型/分类一个「性格」(图标名 + 颜色),
// 与 iOS 端 KXRoomStyle / KXEventStyle 一一对应,三端同一种局永远长一个样。

import type { LucideIcon } from "lucide-react";
import {
  Beer, BookOpen, Coffee, Dices, Dumbbell, Footprints, Landmark, Mic2,
  Music4, Users, UtensilsCrossed, Languages, MicVocal, Sparkles, Palette,
  Leaf, ShoppingBag, Presentation, Trophy, HeartHandshake,
} from "lucide-react";

export interface SocialKindStyle {
  icon: LucideIcon;
  /** Tailwind text-* class for the accent color. */
  text: string;
  /** Tailwind bg-* class at ~10% for chips. */
  softBg: string;
  /** Tailwind gradient classes for icon squircles / fallback covers. */
  gradient: string;
  labelZh: string;
}

const FALLBACK: SocialKindStyle = {
  icon: Sparkles, text: "text-slate-500", softBg: "bg-slate-500/10",
  gradient: "from-slate-500 to-slate-400", labelZh: "其他",
};

export const ROOM_TYPE_STYLES: Record<string, SocialKindStyle> = {
  dining: { icon: UtensilsCrossed, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "约饭" },
  drinks: { icon: Beer, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "约酒" },
  coffee: { icon: Coffee, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "咖啡闲聊" },
  boardgame: { icon: Dices, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "桌游电玩" },
  sports: { icon: Dumbbell, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "运动" },
  study: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "自习学习" },
  language: { icon: Languages, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "语言交换" },
  karaoke: { icon: MicVocal, text: "text-fuchsia-500", softBg: "bg-fuchsia-500/10", gradient: "from-fuchsia-500 to-pink-400", labelZh: "唱K" },
  outing: { icon: Footprints, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "出行看展" },
  hangout: { icon: Users, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "交友闲聊" },
  other: FALLBACK,
};

export const EVENT_CATEGORY_STYLES: Record<string, SocialKindStyle> = {
  drinks: { icon: Beer, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "酒局小聚" },
  food: { icon: UtensilsCrossed, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "美食饭局" },
  art: { icon: Palette, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "展览艺术" },
  reading: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "读书会" },
  music: { icon: Music4, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "音乐演出" },
  outdoor: { icon: Leaf, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "户外徒步" },
  market: { icon: ShoppingBag, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "市集" },
  talk: { icon: Presentation, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "讲座分享" },
  sports: { icon: Trophy, text: "text-emerald-600", softBg: "bg-emerald-600/10", gradient: "from-emerald-600 to-teal-400", labelZh: "运动" },
  social: { icon: HeartHandshake, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "交友社群" },
  other: FALLBACK,
};

export function roomStyle(key?: string): SocialKindStyle {
  return ROOM_TYPE_STYLES[key ?? ""] ?? FALLBACK;
}

export function eventStyle(key?: string): SocialKindStyle {
  return EVENT_CATEGORY_STYLES[key ?? ""] ?? FALLBACK;
}

// 保底引用,避免「导入但未用」告警(Landmark/Mic2 留给后续分类扩展)。
void Landmark; void Mic2;

// ---- 日期 ----

export function parseISO(raw?: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Luma 式日期块:「7月」+「12」。 */
export function dateBadge(raw?: string | null): { month: string; day: string } | null {
  const date = parseISO(raw);
  if (!date) return null;
  return {
    month: date.toLocaleDateString("zh-CN", { month: "short" }),
    day: String(date.getDate()),
  };
}

export function eventTimeLine(startRaw?: string | null, endRaw?: string | null): string {
  const start = parseISO(startRaw);
  if (!start) return startRaw ?? "";
  const day = start.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  const startTime = start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const end = parseISO(endRaw);
  if (end) {
    const endTime = end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} ${startTime} – ${endTime}`;
  }
  return `${day} ${startTime}`;
}

export function relativeTime(raw?: string | null): string {
  const date = parseISO(raw);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
