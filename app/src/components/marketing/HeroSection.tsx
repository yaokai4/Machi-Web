"use client";

import clsx from "clsx";
import { BookOpen, ChevronDown, MonitorSmartphone, Sparkles } from "lucide-react";
import { AppMockup } from "./AppMockup";
import { BrandPhrase, BrandText } from "./BrandText";
import { Button } from "./Button";
import { StoreButton, APP_STORE_URL } from "./StoreButtons";
import { useMarketingI18n, localizedMarketingHref } from "./MarketingI18n";

// CJK text wraps between any two characters, so at display sizes the
// slogan can split mid-word (在每一座城市，找/到…). Cutting the line into
// inline-block segments at ideographic commas makes the browser prefer
// those punctuation points; Latin copy has none and passes through
// as one segment with normal word wrapping.
function splitDisplayLines(text: string): string[] {
  const segments: string[] = [];
  let buffer = "";
  for (const ch of text) {
    buffer += ch;
    if (ch === "，" || ch === "、") {
      segments.push(buffer);
      buffer = "";
    }
  }
  if (buffer) segments.push(buffer);
  return segments;
}

export function HeroSection() {
  const { copy, locale } = useMarketingI18n();
  const isJapanese = locale === "ja";
  const headlineSizeClass = isJapanese
    ? "text-[clamp(1.95rem,7.2vw,2.3rem)] sm:text-[clamp(2.25rem,3.25vw,3rem)] lg:text-[clamp(2.35rem,3vw,3.1rem)] xl:text-[clamp(2.55rem,3vw,3.25rem)]"
    : "text-[clamp(1.7rem,7.4vw,1.95rem)] sm:text-[clamp(2.1rem,3.6vw,3.3rem)]";
  const subtitleClass = isJapanese
    ? "max-w-[22rem] text-[1rem] leading-[1.9] sm:max-w-2xl sm:text-[1.0625rem] sm:leading-8"
    : "max-w-[21rem] text-[1.0625rem] leading-[1.8] sm:max-w-xl sm:text-xl sm:leading-9";
  const ctaWidthClass = isJapanese ? "max-w-[560px]" : "max-w-[460px]";
  const ctaButtonClass = isJapanese
    ? "h-14 px-6 text-base font-bold tracking-[-0.01em] whitespace-nowrap"
    : "h-14 px-7 text-base font-bold tracking-[-0.01em]";

  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-4 sm:px-8 sm:pt-6 lg:px-16 lg:pb-24 lg:pt-10 xl:px-20">
      <div className="mc-map-grid pointer-events-none absolute inset-x-0 top-16 -z-10 h-[640px] opacity-50 dark:opacity-15" />
      <div className="mc-hero-glow -z-10 hidden lg:block lg:left-[-4%] lg:top-[2%] lg:h-[620px] lg:w-[620px]" aria-hidden="true" />
      <div className="mc-echo-field pointer-events-none absolute left-[-8%] top-10 -z-10 h-[520px] w-[520px] opacity-70" aria-hidden="true">
        <span className="mc-echo-ring mc-echo-ring-a" />
        <span className="mc-echo-ring mc-echo-ring-b" />
      </div>
      <div className="pointer-events-none absolute left-[6%] top-36 -z-10 h-1.5 w-1.5 rounded-full bg-orange-500/70 shadow-[0_0_0_10px_rgba(255,107,74,0.10)]" />
      <div className="pointer-events-none absolute right-[10%] top-56 -z-10 h-1.5 w-1.5 rounded-full bg-indigo-500/70 shadow-[0_0_0_10px_rgba(79,70,229,0.10)]" />

      <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] xl:gap-16">
        {/* ─────────── LEFT — pitch + CTA ─────────── */}
        <div className={clsx("mc-reveal order-1 mx-auto w-full min-w-0 text-center lg:mx-0 lg:text-left", isJapanese ? "max-w-[660px]" : "max-w-[620px]")}>
          <span className="mc-pill inline-flex items-center gap-1.5 bg-white/80 text-[#76576f] ring-1 ring-rose-100 backdrop-blur dark:bg-white/[0.06] dark:text-rose-200 dark:ring-white/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <BrandPhrase text={copy.hero.eyebrow} />
          </span>

          {/* One h1, two registers: the display-size gradient wordmark is
              the visual anchor (the brand IS the hero), the ink slogan
              sits beneath at roughly half scale so the two never compete.
              Both live in the h1 so SEO keeps brand + slogan together. */}
          <h1 className="mt-7 lg:mt-8">
            <span className="block text-[clamp(3.3rem,15vw,4.5rem)] font-black leading-[0.95] tracking-[-0.03em] sm:text-[clamp(3.8rem,8vw,6.5rem)]">
              <BrandText>{[copy.hero.titleTop, copy.hero.titleBottom].filter(Boolean).join(" ") || "Machi"}</BrandText>
              <span aria-hidden="true" className="text-orange-500 dark:text-orange-400">.</span>
            </span>
            <span className={clsx("mx-auto mt-3 block max-w-[20rem] text-balance font-black leading-[1.18] tracking-[-0.015em] text-slate-950 [overflow-wrap:anywhere] [word-break:break-word] sm:mt-4 sm:max-w-none sm:leading-[1.1] sm:[word-break:normal] lg:mx-0 dark:text-white", headlineSizeClass)}>
              {splitDisplayLines(copy.hero.headline).map((segment, index) => (
                <span key={index} className="inline-block">{segment}</span>
              ))}
            </span>
          </h1>

          <p className={clsx("mx-auto mt-6 text-slate-600 [overflow-wrap:anywhere] lg:mx-0 dark:text-slate-300", subtitleClass)}>
            <BrandPhrase text={copy.hero.subtitle} />
          </p>
          <p className="mx-auto mt-3 max-w-[21rem] text-[15px] leading-7 text-slate-500 sm:max-w-xl dark:text-slate-400">
            {copy.hero.supporting}
          </p>

          {/* The download IS the hero ask: official-style store badges
              first (iOS live, Android in development), then one gradient
              pill for the web app beside the founder-story entrance. */}
          <div className="mx-auto mt-9 flex w-full flex-wrap items-end justify-center gap-x-4 gap-y-3 lg:mx-0 lg:justify-start">
            <StoreButton
              kind="app-store"
              caption={copy.hero.appStoreCaption}
              href={APP_STORE_URL}
              className="items-center sm:items-start"
            />
            <StoreButton
              kind="google-play"
              caption={copy.hero.googlePlayCaption}
              href="/download#waitlist-form"
              className="items-center sm:items-start"
            />
          </div>

          {/* Grid, not flex-col: `flex-1` children inside a column flexbox
              collapse h-14 on phones — grid rows always honour the height. */}
          <div className={clsx("mx-auto mt-5 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:mx-0", ctaWidthClass)}>
            <Button
              href="/home"
              variant="brand"
              size="lg"
              className={ctaButtonClass}
              iconLeft={<MonitorSmartphone className="h-5 w-5" />}
            >
              {copy.hero.primary}
            </Button>
            <Button
              href={`${localizedMarketingHref("/about", locale)}#founder`}
              variant="secondary"
              size="lg"
              className={ctaButtonClass}
              iconLeft={<BookOpen className="h-5 w-5" />}
            >
              {copy.hero.secondary}
            </Button>
          </div>

          {/* Quiet proof strip — one hairline row instead of three cards,
              so the hero keeps a single visual centre of gravity. */}
          <div className="mx-auto mt-8 flex w-full max-w-[520px] items-start justify-center divide-x divide-slate-900/10 border-t border-slate-900/10 pt-5 text-left lg:mx-0 lg:justify-start dark:divide-white/10 dark:border-white/10">
            {copy.hero.stats.map(([value, label]) => (
              <div key={label} className="min-w-0 flex-1 px-3 first:pl-0 last:pr-0">
                <p className="text-[15px] font-black leading-5 text-slate-950 sm:text-base dark:text-white">{value}</p>
                <p className="mt-1 text-[12px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{label}</p>
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
        href="#why"
        aria-label={copy.hero.scrollLabel}
        className="mc-scroll-cue absolute bottom-5 left-1/2 hidden h-11 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur transition hover:text-indigo-600 md:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-sky-300"
      >
        <ChevronDown className="h-4 w-4" />
      </a>
    </section>
  );
}
