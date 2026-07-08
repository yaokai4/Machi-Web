import {
  BriefcaseBusiness,
  CalendarDays,
  Home,
  Languages,
  LucideIcon,
  Map,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Repeat2,
  TriangleAlert,
  Utensils,
  UserRoundPlus,
  UsersRound,
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
  Utensils,
  CalendarDays,
  MessageCircleQuestion,
  MessagesSquare,
  Wrench,
  TriangleAlert,
  Languages,
  UsersRound,
};

// Neutral tile + hue-tinted icon. The previous fully-saturated tile per
// tone turned any grid of 4+ cards into a rainbow; keeping colour only in
// the small glyph preserves each channel's identity with restraint.
const tones: Record<FeatureChannel["tone"], string> = {
  blue: "text-blue-600 dark:text-blue-300",
  cyan: "text-cyan-600 dark:text-cyan-300",
  amber: "text-amber-600 dark:text-amber-300",
  yellow: "text-amber-600 dark:text-amber-300",
  purple: "text-indigo-600 dark:text-indigo-300",
  violet: "text-indigo-600 dark:text-indigo-300",
  emerald: "text-emerald-600 dark:text-emerald-300",
  rose: "text-rose-600 dark:text-rose-300",
  orange: "text-orange-600 dark:text-orange-300",
  slate: "text-slate-600 dark:text-slate-300",
  green: "text-emerald-600 dark:text-emerald-300",
  red: "text-red-600 dark:text-red-300",
};

export function FeatureCard({ feature }: FeatureCardProps) {
  const Icon = iconMap[feature.icon] ?? Newspaper;

  return (
    <article className="mc-spot group h-full rounded-[20px] border border-slate-200/60 bg-white/85 p-4 shadow-[0_10px_30px_-26px_rgba(15,23,42,0.5)] transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_36px_-24px_rgba(15,23,42,0.6)] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/[0.045] ring-1 ring-slate-900/[0.07] transition group-hover:bg-slate-900/[0.07] dark:bg-white/[0.07] dark:ring-white/10",
            tones[feature.tone],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-base font-black leading-tight text-slate-950 dark:text-white">{feature.title}</h3>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">{feature.description}</p>
      <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{feature.badge}</p>
    </article>
  );
}
