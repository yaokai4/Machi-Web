import clsx from "clsx";

type BadgeTone = "indigo" | "sky" | "green" | "amber" | "orange" | "slate" | "white";

type BadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const tones: Record<BadgeTone, string> = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-400/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-400/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
  white: "bg-white/80 text-slate-700 ring-white/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
};

export function Badge({ children, tone = "indigo", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 backdrop-blur",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
