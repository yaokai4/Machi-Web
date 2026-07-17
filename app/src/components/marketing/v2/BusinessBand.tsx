"use client";

import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { useMarketingI18n, localizedMarketingHref } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// Slim business strip: one honest sentence, two CTAs, no invented metrics.
// Replaces the old BusinessSection console mock (which carried decorative
// 72/58/41% progress bars). Copy keys stay on the admin-overridable
// businessSection tree.

export function BusinessBand() {
  const { copy, locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;

  return (
    <section id="business" className="px-5 py-14 sm:px-8 lg:px-16 xl:px-20">
      <div className="mc-glass mc-reveal mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 p-7 sm:p-9 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <span className="mc-eyebrow mc-eyebrow--violet inline-flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
            {copy.businessSection.label}
          </span>
          <h2 className="mt-3 text-balance text-[clamp(1.35rem,2.4vw,1.8rem)] font-black leading-snug tracking-[-0.015em] text-slate-950 dark:text-white">
            {copy.businessSection.title}
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-slate-500 dark:text-slate-400">{v2.business.note}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={localizedMarketingHref("/contact", locale)}
            className="inline-flex h-12 items-center gap-1.5 rounded-full bg-slate-950 px-6 text-[14px] font-extrabold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
          >
            {copy.businessSection.primary}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href={localizedMarketingHref("/ads", locale)}
            className="inline-flex h-12 items-center rounded-full border border-slate-300/80 bg-white/70 px-6 text-[14px] font-extrabold text-slate-700 backdrop-blur transition hover:-translate-y-0.5 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-200"
          >
            {copy.businessSection.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
