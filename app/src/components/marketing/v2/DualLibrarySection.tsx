"use client";

import { ArrowRight, Building2, GraduationCap, MessageSquareQuote, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// School library × company library, side by side, plus a compact strip of
// guide domains (reusing the admin-overridable guideSection.cards copy).
// The 20×5 company matrix renders as a literal 20×5 dot grid that lights
// up in a diagonal wave — the row/column counts ARE the data.

export function DualLibrarySection() {
  const { copy, locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const lib = v2.dualLibrary;

  return (
    <section id="library" className="relative px-5 py-20 sm:px-8 lg:px-16 lg:py-28 xl:px-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-2xl">
          <span className="mc-eyebrow mc-reveal">{lib.label}</span>
          <h2 className="mc-section-title mc-reveal mt-4 text-balance">{lib.title}</h2>
          <p className="mc-section-lead mc-reveal mt-4">{lib.body}</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* ————— school library ————— */}
          <article className="mc-glass mc-reveal flex flex-col p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <GraduationCap className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <span className="mc-pill text-[11px] font-extrabold">{lib.japanOnly}</span>
            </div>
            <h3 className="mt-5 text-xl font-black tracking-[-0.01em] text-slate-950 dark:text-white">{lib.school.title}</h3>
            <p className="mt-2 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{lib.school.body}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {lib.school.types.map((t) => (
                <span key={t} className="rounded-full bg-slate-950 px-3 py-1.5 text-[12px] font-extrabold text-white dark:bg-white/10 dark:text-slate-100">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {lib.school.filters.map((f) => (
                <span key={f} className="rounded-full border border-dashed border-indigo-300/80 px-3 py-1.5 text-[12px] font-bold text-indigo-600 dark:border-indigo-400/30 dark:text-indigo-300">
                  {f}
                </span>
              ))}
            </div>
            <Link
              href="/guide"
              className="group mt-auto inline-flex items-center gap-1.5 pt-6 text-[14px] font-extrabold text-slate-950 transition hover:text-indigo-600 dark:text-white dark:hover:text-sky-300"
            >
              {lib.school.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </article>

          {/* ————— company library ————— */}
          <article className="mc-glass mc-reveal mc-reveal-1 flex flex-col p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                <Building2 className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <span className="mc-pill text-[11px] font-extrabold">{lib.japanOnly}</span>
            </div>
            <h3 className="mt-5 text-xl font-black tracking-[-0.01em] text-slate-950 dark:text-white">{lib.company.title}</h3>
            <p className="mt-2 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{lib.company.body}</p>

            {/* the 20×5 matrix, literally */}
            <div className="mt-5" aria-label={lib.company.matrix}>
              <div className="mcv2-matrix" aria-hidden="true">
                {Array.from({ length: 100 }, (_, i) => {
                  const row = Math.floor(i / 20);
                  const col = i % 20;
                  return <span key={i} className="mcv2-matrix-dot" style={{ animationDelay: `${(row + col) * 60}ms` }} />;
                })}
              </div>
              <p className="mt-2 text-[12px] font-extrabold tabular-nums tracking-wide text-slate-500 dark:text-slate-400">{lib.company.matrix}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-700 dark:bg-white/[0.07] dark:text-slate-200">
                <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
                {lib.company.reviews}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-700 dark:bg-white/[0.07] dark:text-slate-200">
                <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
                {lib.company.interviews}
              </span>
            </div>
            <Link
              href="/guide"
              className="group mt-auto inline-flex items-center gap-1.5 pt-6 text-[14px] font-extrabold text-slate-950 transition hover:text-orange-600 dark:text-white dark:hover:text-orange-300"
            >
              {lib.company.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </article>
        </div>

        {/* guide domains strip — reuses overridable guideSection.cards copy */}
        <div className="mc-reveal mt-8">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{lib.guideRowTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {copy.guideSection.cards.map(([title]) => (
              <Link
                key={title}
                href="/guide"
                className="rounded-full border border-slate-200/90 bg-white/70 px-3.5 py-1.5 text-[13px] font-bold text-slate-700 backdrop-blur transition hover:border-indigo-300 hover:text-indigo-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:text-sky-300"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
