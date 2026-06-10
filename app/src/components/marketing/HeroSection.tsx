"use client";

import { ArrowRight, Building2, ChevronDown, MonitorSmartphone, Sparkles, UsersRound } from "lucide-react";
import { AppMockup } from "./AppMockup";
import { BrandPhrase } from "./BrandText";
import { Button } from "./Button";
import { StoreButton } from "./StoreButtons";
import { useMarketingI18n } from "./MarketingI18n";

export function HeroSection() {
  const { copy } = useMarketingI18n();

  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-4 sm:px-8 sm:pt-6 lg:px-16 lg:pb-24 lg:pt-10 xl:px-20">
      <div className="mc-map-grid pointer-events-none absolute inset-x-0 top-16 -z-10 h-[640px] opacity-50 dark:opacity-15" />
      <div className="mc-echo-field pointer-events-none absolute left-[-8%] top-10 -z-10 h-[520px] w-[520px] opacity-70" aria-hidden="true">
        <span className="mc-echo-ring mc-echo-ring-a" />
        <span className="mc-echo-ring mc-echo-ring-b" />
      </div>
      <div className="pointer-events-none absolute left-[6%] top-36 -z-10 h-1.5 w-1.5 rounded-full bg-orange-500/70 shadow-[0_0_0_10px_rgba(255,107,74,0.10)]" />
      <div className="pointer-events-none absolute right-[10%] top-56 -z-10 h-1.5 w-1.5 rounded-full bg-indigo-500/70 shadow-[0_0_0_10px_rgba(79,70,229,0.10)]" />

      <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] xl:gap-16">
        {/* ─────────── LEFT — pitch + CTA ─────────── */}
        <div className="mc-reveal order-1 mx-auto w-full min-w-0 max-w-[620px] text-center lg:mx-0 lg:text-left">
          <span className="mc-pill inline-flex items-center gap-1.5 bg-white/80 text-indigo-700 ring-1 ring-indigo-100 backdrop-blur dark:bg-white/[0.06] dark:text-sky-200 dark:ring-white/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <BrandPhrase text={copy.hero.eyebrow} />
          </span>

          {/* The slogan IS the hero. The previous display-size gradient
              wordmark duplicated the header logo and split focus across
              two competing headlines; one ink statement reads calmer and
              far more premium. The brand word keeps a single refined
              gradient accent. */}
          <h1 className="mx-auto mt-6 max-w-[22rem] text-balance text-[clamp(2.3rem,9vw,3.4rem)] font-black leading-[1.08] tracking-[-0.02em] text-slate-950 [overflow-wrap:anywhere] [word-break:break-word] sm:max-w-none sm:text-[clamp(2.6rem,4.6vw,4.35rem)] sm:leading-[1.04] sm:[word-break:normal] lg:mx-0 dark:text-white">
            {copy.hero.headline}
          </h1>

          <p className="mx-auto mt-6 max-w-[21rem] text-base leading-7 text-slate-600 [overflow-wrap:anywhere] sm:max-w-xl sm:text-lg sm:leading-8 lg:mx-0 dark:text-slate-300">
            <BrandPhrase text={copy.hero.subtitle} />
          </p>
          <p className="mx-auto mt-3 max-w-[21rem] text-sm leading-6 text-slate-500 [overflow-wrap:anywhere] sm:max-w-xl lg:mx-0 dark:text-slate-400">
            {copy.hero.supporting}
          </p>

          <div className="mx-auto mt-9 flex w-full max-w-[460px] flex-col gap-3 sm:flex-row lg:mx-0">
            <Button
              href="/home"
              size="lg"
              className="flex-1 px-7 text-base font-bold sm:h-14"
              iconRight={<ArrowRight className="h-5 w-5" />}
            >
              {copy.hero.primary}
            </Button>
            <Button
              href="#waitlist-form"
              variant="secondary"
              size="lg"
              className="flex-1 px-7 text-base font-bold sm:h-14"
              iconLeft={<UsersRound className="h-5 w-5" />}
            >
              {copy.hero.secondary}
            </Button>
          </div>

          <div className="mx-auto mt-4 flex w-full max-w-[460px] flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:mx-0 lg:justify-start">
            <a
              href="#guide"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:text-white"
            >
              <Sparkles className="h-4 w-4 text-orange-500/80" aria-hidden="true" />
              {copy.hero.tertiary}
            </a>
            <span className="hidden text-slate-300 sm:inline dark:text-white/20" aria-hidden="true">·</span>
            <a
              href="#business"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-300 dark:hover:text-white"
            >
              <Building2 className="h-4 w-4 text-indigo-500/80" aria-hidden="true" />
              {copy.hero.quaternary}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="mx-auto mt-6 flex w-full max-w-[460px] flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 lg:mx-0">
            <StoreButton
              kind="app-store"
              label={copy.hero.appStore}
              caption={copy.hero.appStoreCaption}
              href="#waitlist-form"
              className="items-center sm:items-start"
            />
            <StoreButton
              kind="google-play"
              label={copy.hero.googlePlay}
              caption={copy.hero.googlePlayCaption}
              href="#waitlist-form"
              className="items-center sm:items-start"
            />
            <a
              href="#waitlist-form"
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-200/80 bg-white/86 px-4 py-3 text-sm font-black text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-200"
            >
              <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
              {copy.hero.webBetaCaption}
            </a>
          </div>

          <div className="mx-auto mt-8 grid w-full max-w-[420px] grid-cols-3 gap-3 sm:max-w-lg lg:mx-0">
            {copy.hero.stats.map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/70 bg-white/72 px-3 py-3 text-left shadow-[0_8px_24px_-18px_rgba(15,23,42,0.4)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05]"
              >
                <p className="text-base font-black text-slate-950 sm:text-lg dark:text-white">{value}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─────────── RIGHT — App mockup ─────────── */}
        <div className="mc-reveal order-2 lg:justify-self-end">
          <AppMockup />
        </div>
      </div>

      <a
        href="#story"
        aria-label={copy.hero.scrollLabel}
        className="mc-scroll-cue absolute bottom-5 left-1/2 hidden h-11 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur transition hover:text-indigo-600 md:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-sky-300"
      >
        <ChevronDown className="h-4 w-4" />
      </a>
    </section>
  );
}
