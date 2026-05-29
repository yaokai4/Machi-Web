import { ArrowUpRight, MapPin } from "lucide-react";
import clsx from "clsx";
import type { City } from "@/data/machi-home";

type CityCardProps = {
  city: City;
};

// Two parallel tone tables — light keeps the colorful glass look, dark
// uses translucent overlays so the card reads as part of the depth
// stack instead of a fluorescent rectangle.
const cityTones: Record<City["tone"], string> = {
  indigo: "from-indigo-500/20 via-white to-sky-100/80 text-indigo-700 dark:from-indigo-500/15 dark:via-slate-900/40 dark:to-sky-500/10 dark:text-indigo-200",
  sky: "from-sky-400/20 via-white to-cyan-100/80 text-sky-700 dark:from-sky-500/15 dark:via-slate-900/40 dark:to-cyan-500/10 dark:text-sky-200",
  green: "from-emerald-400/20 via-white to-lime-100/75 text-emerald-700 dark:from-emerald-500/15 dark:via-slate-900/40 dark:to-lime-500/10 dark:text-emerald-200",
  amber: "from-amber-300/25 via-white to-orange-100/75 text-amber-700 dark:from-amber-500/15 dark:via-slate-900/40 dark:to-orange-500/10 dark:text-amber-200",
  rose: "from-rose-400/20 via-white to-orange-100/75 text-rose-700 dark:from-rose-500/15 dark:via-slate-900/40 dark:to-orange-500/10 dark:text-rose-200",
  violet: "from-violet-500/20 via-white to-fuchsia-100/70 text-violet-700 dark:from-violet-500/15 dark:via-slate-900/40 dark:to-fuchsia-500/10 dark:text-violet-200",
  teal: "from-teal-400/20 via-white to-sky-100/70 text-teal-700 dark:from-teal-500/15 dark:via-slate-900/40 dark:to-sky-500/10 dark:text-teal-200",
  slate: "from-slate-400/20 via-white to-blue-100/70 text-slate-700 dark:from-slate-500/15 dark:via-slate-900/40 dark:to-blue-500/10 dark:text-slate-200",
};

export function CityCard({ city }: CityCardProps) {
  return (
    <article
      className={clsx(
        "group relative min-h-[205px] h-full overflow-hidden rounded-[26px] border border-white/80 bg-gradient-to-br p-5 shadow-[0_22px_60px_-48px_rgba(15,23,42,0.82)]",
        "transition duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_26px_70px_-46px_rgba(15,23,42,0.92)]",
        "dark:border-white/10",
        cityTones[city.tone],
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-8 h-32 w-32 rounded-full bg-white/60 blur-xl dark:bg-white/[0.05]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-[linear-gradient(135deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.72)_100%)] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.05)_100%)]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/80 dark:bg-white/10 dark:ring-white/10">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <ArrowUpRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-slate-500" aria-hidden="true" />
        </div>
        <div className="mt-8">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{city.country}</p>
          <h3 className="mt-2 text-[1.45rem] font-black leading-tight text-slate-950 dark:text-white">{city.name}</h3>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{city.description}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-white/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
            {city.posts}
          </span>
          <span className="rounded-full bg-slate-950/5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-white/5 dark:text-slate-300">
            {city.heat}
          </span>
        </div>
      </div>
    </article>
  );
}
