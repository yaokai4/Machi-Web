"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Book,
  Briefcase,
  CalendarDays,
  ChevronRight,
  EyeOff,
  Flame,
  GraduationCap,
  Hash,
  Home,
  HelpCircle,
  Megaphone,
  Newspaper,
  PartyPopper,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  UserPlus,
  Users,
  Utensils,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import type { CityChannelKey, ContentType } from "@/lib/types";
import { useSession } from "@/lib/store";
import { regionFromUser } from "@/lib/regions";

export interface ShortcutSpec {
  id: string;
  title: string;
  subtitle: string;
  Icon: ComponentType<{ className?: string }>;
  type: ContentType;
  tint: string;
}

// Eight primary shortcuts above the fold — mirrors iOS DiscoverView
// `primarySpecs`. Reorder here ⇄ iOS together.
export const PRIMARY_SHORTCUTS: ShortcutSpec[] = [
  { id: "news", title: "新闻", subtitle: "本地快讯", Icon: Newspaper, type: "news", tint: "text-sky-600 bg-sky-100 dark:text-sky-300 dark:bg-sky-500/15" },
  { id: "guide", title: "攻略", subtitle: "省时省钱经验", Icon: Book, type: "guide", tint: "text-teal-600 bg-teal-100 dark:text-teal-300 dark:bg-teal-500/15" },
  { id: "secondhand", title: "二手", subtitle: "闲置求购", Icon: ShoppingBag, type: "secondhand", tint: "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15" },
  { id: "housing", title: "租房", subtitle: "合租转租", Icon: Home, type: "housing", tint: "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15" },
  { id: "jobseek", title: "找工作", subtitle: "兼职全职", Icon: Briefcase, type: "job_seek", tint: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15" },
  { id: "jobpost", title: "招聘", subtitle: "本地招人", Icon: UserPlus, type: "job_post", tint: "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-500/15" },
  { id: "meetup", title: "搭子", subtitle: "学习运动", Icon: Users, type: "meetup", tint: "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/15" },
  { id: "dining", title: "约饭", subtitle: "吃饭咖啡", Icon: Utensils, type: "dining", tint: "text-rose-600 bg-rose-100 dark:text-rose-300 dark:bg-rose-500/15" },
];

// Twelve "more" channels surfaced inside the MoreChannelSheet.
export const EXTENDED_SHORTCUTS: ShortcutSpec[] = [
  { id: "event", title: "活动", subtitle: "线下聚会", Icon: CalendarDays, type: "event", tint: "text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-500/15" },
  { id: "question", title: "问答", subtitle: "生活求助", Icon: HelpCircle, type: "question", tint: "text-indigo-600 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/15" },
  { id: "service", title: "服务", subtitle: "搬家签证", Icon: Wrench, type: "service", tint: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15" },
  { id: "merchant", title: "商家", subtitle: "本地店铺", Icon: Store, type: "merchant", tint: "text-teal-700 bg-teal-100 dark:text-teal-300 dark:bg-teal-500/15" },
  { id: "coupon", title: "优惠", subtitle: "商家折扣", Icon: Tag, type: "coupon", tint: "text-pink-600 bg-pink-100 dark:text-pink-300 dark:bg-pink-500/15" },
  { id: "warning", title: "避坑", subtitle: "踩雷预警", Icon: ShieldAlert, type: "warning", tint: "text-red-600 bg-red-100 dark:text-red-300 dark:bg-red-500/15" },
  { id: "referral", title: "内推", subtitle: "公司内推", Icon: UserPlus, type: "referral", tint: "text-indigo-700 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-500/15" },
  { id: "poll", title: "投票", subtitle: "选项投票", Icon: Hash, type: "poll", tint: "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-500/15" },
  { id: "anonymous", title: "树洞", subtitle: "匿名倾诉", Icon: EyeOff, type: "anonymous", tint: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/10" },
  { id: "long_post", title: "长文", subtitle: "深度分享", Icon: Sparkles, type: "long_post", tint: "text-slate-700 bg-slate-100 dark:text-slate-200 dark:bg-white/10" },
  { id: "local_info", title: "本地资讯", subtitle: "社区告示", Icon: Megaphone, type: "local_info", tint: "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/15" },
  { id: "roommate", title: "找室友", subtitle: "合租找人", Icon: GraduationCap, type: "roommate", tint: "text-cyan-700 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-500/15" },
];

/// Single shortcut tile. Visual matches the iOS `DiscoverCategoryCell`.
export function ShortcutTile({ spec }: { spec: ShortcutSpec }) {
  const user = useSession((s) => s.user);
  const region = regionFromUser(user);
  const channel = channelForType(spec.type);
  const href = region ? `/c/${encodeURIComponent(region.region_code)}?channel=${channel}` : `/search?q=${encodeURIComponent(spec.title)}`;

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-kx-lg bg-kx-card/95 border border-kx-stroke/70 px-3 py-2.5 text-kx-text hover:border-kx-accent/40 hover:bg-kx-soft/80 hover:shadow-sm transition"
    >
      <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-xl ${spec.tint}`}>
        <spec.Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-kx-text truncate">{spec.title}</span>
        <span className="block text-[11px] text-kx-muted truncate">{spec.subtitle}</span>
      </span>
    </Link>
  );
}

function channelForType(type: ContentType): CityChannelKey {
  switch (type) {
    case "news":
    case "local_info":
      return "news";
    case "guide":
      return "guide";
    case "secondhand":
      return "secondhand";
    case "housing":
    case "roommate":
      return "housing";
    case "job_seek":
      return "jobSeek";
    case "job_post":
    case "referral":
      return "jobPost";
    case "meetup":
      return "meetup";
    case "dining":
      return "dining";
    case "event":
      return "event";
    case "question":
      return "question";
    case "service":
      return "service";
    case "merchant":
      return "merchant";
    case "coupon":
      return "coupon";
    case "warning":
      return "warning";
    default:
      return "dynamic";
  }
}

/// 8 + 1 grid. The 9th cell ("更多") opens MoreChannelSheet.
export function DiscoverShortcutGrid() {
  const [isMoreOpen, setMoreOpen] = useState(false);
  return (
    <section className="kx-card">
      <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-kx-accent" /> 快捷入口
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRIMARY_SHORTCUTS.map((spec) => (
          <ShortcutTile key={spec.id} spec={spec} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex items-center gap-3 rounded-kx-lg bg-kx-accent/5 border border-dashed border-kx-accent/30 px-3 py-2.5 text-left hover:bg-kx-accent/10 transition"
        >
          <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-kx-accent/15 text-kx-accent">
            <PartyPopper className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-kx-text">更多</span>
            <span className="block text-[11px] text-kx-muted truncate">活动 · 问答 · 商家 · 优惠 · 避坑</span>
          </span>
          <ChevronRight className="w-4 h-4 text-kx-muted shrink-0" />
        </button>
      </div>
      <Flame className="w-0 h-0 hidden" />
      {isMoreOpen ? <MoreChannelSheet onClose={() => setMoreOpen(false)} /> : null}
    </section>
  );
}

function MoreChannelSheet({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button type="button" aria-label="关闭" onClick={onClose} className="fixed inset-0 z-[80] bg-black/40" />
      <section
        className="fixed inset-x-0 bottom-0 z-[90] max-h-[80dvh] overflow-y-auto overflow-x-hidden rounded-t-3xl bg-kx-card p-4 text-kx-text border border-kx-stroke shadow-xl animate-kx-slide-up sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold">全部频道</h3>
          <button type="button" onClick={onClose} className="kx-button-ghost h-8 px-3 text-sm">
            关闭
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...PRIMARY_SHORTCUTS, ...EXTENDED_SHORTCUTS].map((spec) => (
            <ShortcutTile key={spec.id} spec={spec} />
          ))}
        </div>
      </section>
    </>,
    document.body,
  );
}
