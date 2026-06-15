"use client";

import { Flame, Heart, MessageCircle, Repeat2, Star, TrendingUp } from "lucide-react";
import { HeatBadge } from "./HeatBadge";
import { useMarketingI18n } from "./MarketingI18n";

// The four signals the heat model uses. We show them as soft chips
// rather than a formula equation so the model reads like a designed
// concept, not a math page.
const signalIcons = [Heart, MessageCircle, Star, Repeat2];

export function TrendingSection() {
  const { copy } = useMarketingI18n();

  return (
    <section className="relative overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        {/* ─────────── LEFT — product preview card ─────────── */}
        <div className="mc-reveal relative">
          <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#25211f_0%,#342a2b_58%,#493641_100%)] p-5 text-white shadow-[0_30px_80px_-44px_rgba(55,40,43,0.9)] sm:p-7">
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-orange-400/15 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden="true" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-white/55">
                  {copy.trendingSection.cardSubtitle}
                </p>
                <h3 className="mt-1 text-2xl font-black">{copy.trendingSection.cardTitle}</h3>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] font-bold text-white/80 ring-1 ring-white/10">
                  <TrendingUp className="h-3 w-3 text-orange-300" aria-hidden="true" />
                  {copy.trendingSection.label}
                </p>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-orange-300/20">
                <Flame className="h-6 w-6 fill-orange-400 text-orange-400" aria-hidden="true" />
              </span>
            </div>

            <div className="relative mt-6 space-y-3">
              {copy.trendingPosts.map((post, index) => (
                <article
                  key={post.title}
                  className="flex items-center gap-3 rounded-[18px] bg-white/[0.07] p-3 ring-1 ring-white/[0.08] transition hover:bg-white/[0.10]"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                      index === 0
                        ? "bg-orange-400 text-slate-950"
                        : index === 1
                        ? "bg-orange-300 text-slate-950"
                        : index === 2
                        ? "bg-orange-200 text-slate-950"
                        : "bg-white/15 text-white/80"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black sm:text-base">{post.title}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-white/55">{post.category}</p>
                  </div>
                  <HeatBadge className="shrink-0 bg-orange-400/10 text-orange-200 ring-orange-300/20">
                    {post.heat}
                  </HeatBadge>
                </article>
              ))}
            </div>
          </div>
        </div>

        {/* ─────────── RIGHT — copy + signal chips ─────────── */}
        <div className="mc-reveal">
          <p className="mc-eyebrow" style={{ color: "rgb(194 65 12)" }}>{copy.trendingSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            {copy.trendingSection.title}
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            {copy.trendingSection.subtitle}
          </p>

          <div className="mc-glass mt-8 p-5 sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {copy.trendingSection.formulaTitle}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {signalIcons.map((SignalIcon, index) => (
                <div
                  key={copy.trendingSection.formula[index]}
                  className="flex items-center gap-2 rounded-2xl border border-orange-100/70 bg-orange-50/60 px-3 py-2.5 text-sm font-black text-orange-700 dark:border-orange-400/15 dark:bg-orange-400/10 dark:text-orange-200"
                >
                  <SignalIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{copy.trendingSection.formula[index]}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {copy.trendingSection.heatLabel} ↓ time
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
