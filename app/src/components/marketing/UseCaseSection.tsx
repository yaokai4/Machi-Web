"use client";

import {
  BriefcaseBusiness,
  CircleHelp,
  LucideIcon,
  MapPinned,
  PackageOpen,
  Sparkles,
  Store,
} from "lucide-react";
import { useMarketingI18n } from "./MarketingI18n";

const iconMap: Record<string, LucideIcon> = {
  MapPinned,
  PackageOpen,
  BriefcaseBusiness,
  Sparkles,
  CircleHelp,
  Store,
};

export function UseCaseSection() {
  const { copy } = useMarketingI18n();

  return (
    <section className="px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal mx-auto max-w-3xl text-center">
          <p className="mc-eyebrow" style={{ color: "rgb(190 18 60)" }}>{copy.useCaseSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            {copy.useCaseSection.title}
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.useCases.map((useCase) => {
            const Icon = iconMap[useCase.icon] ?? Sparkles;
            return (
              <article
                key={useCase.title}
                className="mc-reveal group rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_14px_44px_-40px_rgba(15,23,42,0.55)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_22px_60px_-44px_rgba(15,23,42,0.7)] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.6)] dark:bg-white dark:text-slate-950">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-black text-slate-950 dark:text-white">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{useCase.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
