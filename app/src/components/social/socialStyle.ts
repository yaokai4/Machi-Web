// 约局 + 活动的共享样式速查:每个类型/分类一个「性格」(图标 + 颜色),
// 与 iOS 端 KXRoomStyle / KXEventStyle 一一对应,三端同一分类永远长一个样。
//
// 设计上两者彻底区分:
//   约局(Rooms)= 搭子 / 即兴组队,分类按「一起做什么」(动作)
//   活动(Events)= 正式策划活动,分类按「活动的形式」(名词)

import type { LucideIcon } from "lucide-react";
import {
  Beer, BookOpen, Car, Clapperboard, Coffee, Dumbbell, Footprints, Gamepad2,
  Hammer, Languages, MessageCircle, Mountain, Music4, Palette, PartyPopper,
  Presentation, ShoppingBag, Sparkles, Trophy, UtensilsCrossed,
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

// ── 约局(搭子)────────────────────────────────────────────────────────────
export const ROOM_TYPE_STYLES: Record<string, SocialKindStyle> = {
  meal: { icon: UtensilsCrossed, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "饭搭子" },
  drink: { icon: Beer, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "酒搭子" },
  coffee: { icon: Coffee, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "咖啡" },
  sport: { icon: Dumbbell, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "运动搭子" },
  study: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "学习搭子" },
  play: { icon: Gamepad2, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "玩乐" },
  carpool: { icon: Car, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "拼车拼单" },
  outing: { icon: Footprints, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "出行搭子" },
  language: { icon: Languages, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "语言交换" },
  chat: { icon: MessageCircle, text: "text-slate-500", softBg: "bg-slate-500/10", gradient: "from-slate-500 to-slate-400", labelZh: "随便聊" },
  other: FALLBACK,
};
// 旧数据别名(与后端 _ROOM_TYPE_ALIASES 对齐),显示时归并到新分类。
const ROOM_TYPE_ALIASES: Record<string, string> = {
  dining: "meal", drinks: "drink", boardgame: "play", karaoke: "play", sports: "sport", hangout: "chat",
};

// ── 活动(活动形式)────────────────────────────────────────────────────────
export const EVENT_CATEGORY_STYLES: Record<string, SocialKindStyle> = {
  exhibition: { icon: Palette, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "展览" },
  show: { icon: Music4, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "演出" },
  talk: { icon: Presentation, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "讲座沙龙" },
  workshop: { icon: Hammer, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "工作坊" },
  market: { icon: ShoppingBag, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "市集" },
  party: { icon: PartyPopper, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "派对" },
  sports: { icon: Trophy, text: "text-emerald-600", softBg: "bg-emerald-600/10", gradient: "from-emerald-600 to-teal-400", labelZh: "运动赛事" },
  reading: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "读书会" },
  film: { icon: Clapperboard, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "观影" },
  outdoor: { icon: Mountain, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "户外" },
  other: FALLBACK,
};
const EVENT_CATEGORY_ALIASES: Record<string, string> = {
  art: "exhibition", music: "show", food: "party", drinks: "party", social: "party",
};

export function roomStyle(key?: string): SocialKindStyle {
  const k = key ?? "";
  return ROOM_TYPE_STYLES[k] ?? ROOM_TYPE_STYLES[ROOM_TYPE_ALIASES[k]] ?? FALLBACK;
}

export function eventStyle(key?: string): SocialKindStyle {
  const k = key ?? "";
  return EVENT_CATEGORY_STYLES[k] ?? EVENT_CATEGORY_STYLES[EVENT_CATEGORY_ALIASES[k]] ?? FALLBACK;
}

/** Ordered category keys for pickers/rails (excludes "other" — creators still get it via a trailing chip). */
export const ROOM_TYPE_KEYS = ["meal", "drink", "coffee", "sport", "study", "play", "carpool", "outing", "language", "chat"];
export const EVENT_CATEGORY_KEYS = ["exhibition", "show", "talk", "workshop", "market", "party", "sports", "reading", "film", "outdoor"];

// ── 日期 ────────────────────────────────────────────────────────────────────

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
