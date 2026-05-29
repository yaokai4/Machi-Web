import {
  BadgePercent,
  BriefcaseBusiness,
  CalendarDays,
  Handshake,
  Home,
  LucideIcon,
  Map,
  MessageCircleQuestion,
  Newspaper,
  Repeat2,
  Utensils,
  UserRoundPlus,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import type { FeatureChannel } from "@/data/machi-home";

type FeatureCardProps = {
  feature: FeatureChannel;
};

const iconMap: Record<string, LucideIcon> = {
  Newspaper,
  Map,
  Repeat2,
  Home,
  BriefcaseBusiness,
  UserRoundPlus,
  Handshake,
  Utensils,
  CalendarDays,
  MessageCircleQuestion,
  Wrench,
  BadgePercent,
};

const tones: Record<FeatureChannel["tone"], string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  yellow: "bg-yellow-50 text-yellow-700 ring-yellow-100 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-400/20",
  purple: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
  green: "bg-green-50 text-green-700 ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/20",
  red: "bg-red-50 text-red-700 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
};

export function FeatureCard({ feature }: FeatureCardProps) {
  const Icon = iconMap[feature.icon] ?? Newspaper;

  return (
    <article className="group h-full rounded-[20px] border border-slate-200/60 bg-white/85 p-4 shadow-[0_10px_30px_-26px_rgba(15,23,42,0.5)] transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_36px_-24px_rgba(15,23,42,0.6)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
      <div className="flex items-center gap-3">
        <span className={clsx("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", tones[feature.tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-base font-black leading-tight text-slate-950 dark:text-white">{feature.title}</h3>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">{feature.description}</p>
      <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{feature.badge}</p>
    </article>
  );
}
