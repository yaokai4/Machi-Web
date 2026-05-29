"use client";

import { ArrowRight, Building2, ChevronDown, MapPinned, Sparkles } from "lucide-react";
import { AppMockup } from "./AppMockup";
import { BrandPhrase, BrandText } from "./BrandText";
import { Button } from "./Button";
import { StoreButton } from "./StoreButtons";
import { useMarketingI18n } from "./MarketingI18n";

export function HeroSection() {
  const { copy } = useMarketingI18n();

  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-4 sm:px-8 sm:pt-6 lg:px-16 lg:pb-24 lg:pt-10 xl:px-20">
      {/* Page-level mesh lives on `.machi-site`; here we just add a
          whisper-of-a-city-map texture. Opacity intentionally far below
          conscious-perception so it never competes with the copy. */}
      <div className="mc-map-grid pointer-events-none absolute inset-x-0 top-16 -z-10 h-[640px] opacity-30 dark:opacity-15" />
      <div className="pointer-events-none absolute left-[6%] top-36 -z-10 h-1.5 w-1.5 rounded-full bg-indigo-500/70 shadow-[0_0_0_10px_rgba(99,102,241,0.08)]" />
      <div className="pointer-events-none absolute right-[10%] top-56 -z-10 h-1.5 w-1.5 rounded-full bg-sky-500/70 shadow-[0_0_0_10px_rgba(14,165,233,0.08)]" />

      <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] xl:gap-16">
        {/* ─────────── LEFT — pitch + CTA ─────────── */}
        <div className="mc-reveal order-1 mx-auto max-w-[620px] text-center lg:mx-0 lg:text-left">
          <span className="mc-pill inline-flex items-center gap-1.5 bg-white/80 text-indigo-700 ring-1 ring-indigo-100 backdrop-blur dark:bg-white/[0.06] dark:text-sky-200 dark:ring-white/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <BrandPhrase text={copy.hero.eyebrow} />
          </span>

          {/* Wordmark — restrained so the headline below it carries
              the visual weight. Hidden on small screens to keep the
              fold uncluttered. */}
          <h1 className="mt-5 hidden text-[clamp(2.4rem,6vw,4.2rem)] font-black leading-[0.95] sm:block">
            <BrandText>{copy.hero.titleTop} {copy.hero.titleBottom}</BrandText>
          </h1>

          {/* Main marketing headline — the line that anchors the page.
              We let it scale large on desktop so it feels like a billboard. */}
          <h2 className="mt-5 text-[clamp(1.85rem,4.4vw,3.05rem)] font-black leading-[1.1] tracking-tight text-slate-950 dark:text-white">
            {copy.hero.headline}
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 lg:mx-0 dark:text-slate-300">
            {copy.hero.subtitle}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-indigo-700 sm:text-base lg:mx-0 dark:text-sky-300">
            {copy.hero.supporting}
          </p>

          {/* ─── CTA stack — primary / secondary / tertiary hierarchy.
              Stacked vertically on mobile, inline on desktop. ─── */}
          <div className="mx-auto mt-8 flex max-w-[420px] flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:mx-0 lg:max-w-none lg:justify-start">
            <Button
              href="#waitlist-form"
              size="lg"
              className="h-14 px-6 text-base font-black sm:w-auto"
              iconRight={<ArrowRight className="h-5 w-5" />}
            >
              {copy.hero.primary}
            </Button>
            <Button
              href="#cities"
              variant="secondary"
              size="lg"
              className="h-14 px-6 text-base font-black sm:w-auto"
              iconLeft={<MapPinned className="h-5 w-5" />}
            >
              {copy.hero.secondary}
            </Button>
            <Button
              href="#business"
              variant="text"
              size="lg"
              className="h-14 px-3 text-base font-black sm:w-auto"
              iconLeft={<Building2 className="h-5 w-5" />}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {copy.hero.tertiary}
            </Button>
          </div>

          {/* ─── Store badges — explicitly marked as Coming Soon so
              users don't tap expecting an install. Anchored to
              #waitlist-form to convert the intent instead. ─── */}
          <div className="mx-auto mt-6 flex max-w-[420px] flex-col items-center gap-3 sm:flex-row sm:items-end sm:gap-4 lg:mx-0">
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
          </div>

          {/* ─── Stats — quieter than CTAs, but still scannable. ─── */}
          <div className="mx-auto mt-8 grid max-w-[420px] grid-cols-3 gap-3 sm:max-w-lg lg:mx-0">
            {copy.hero.stats.map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/70 bg-white/65 px-3 py-3 text-left shadow-[0_8px_24px_-18px_rgba(15,23,42,0.4)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05]"
              >
                <p className="text-xl font-black text-slate-950 sm:text-2xl dark:text-white">{value}</p>
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
