import { Flame } from "lucide-react";
import clsx from "clsx";

type HeatBadgeProps = {
  children: React.ReactNode;
  className?: string;
};

export function HeatBadge({ children, className }: HeatBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-400/25",
        className,
      )}
    >
      <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" aria-hidden="true" />
      {children}
    </span>
  );
}
