"use client";

import { ArrowRight, Globe2, Languages, LocateFixed } from "lucide-react";
import { useMarketingI18n } from "./MarketingI18n";

export function LanguageSection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="language" className="px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        {/* ─────────── LEFT — copy ─────────── */}
        <div className="mc-reveal">
          <p className="mc-eyebrow mc-eyebrow--teal">{copy.languageSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.015em] text-slate-950 sm:text-5xl dark:text-white">
            {copy.languageSection.title}
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            {copy.languageSection.body}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {copy.languageSection.chips.map((language) => (
              <span
                key={language}
                className="rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.5)] backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
              >
                {language}
              </span>
            ))}
          </div>
        </div>

        {/* ─────────── RIGHT — product rule card ─────────── */}
        <div className="mc-reveal mc-glass-strong overflow-hidden p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {copy.languageSection.contextLabel}
              </p>
              <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                {copy.languageSection.contextTitle}
              </h3>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-300/20">
              <Languages className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-emerald-100/70 bg-emerald-50/40 p-4 dark:border-emerald-400/15 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.languageSection.regionLabel}
              </div>
              <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">
                {copy.languageSection.region}
              </p>
            </div>
            <div className="rounded-[18px] border border-sky-100/70 bg-sky-50/40 p-4 dark:border-sky-400/15 dark:bg-sky-500/10">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.languageSection.contentLanguageLabel}
              </div>
              <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">
                {copy.languageSection.contentLanguage}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] bg-slate-950 p-5 text-white">
            <p className="text-[11px] font-black uppercase tracking-wider text-white/55">
              {copy.languageSection.priorityLabel}
            </p>
            <ol className="mt-4 space-y-2">
              {copy.languageSection.priority.map((item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/[0.06]"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-slate-950">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{item}</span>
                  {index < copy.languageSection.priority.length - 1 ? (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
