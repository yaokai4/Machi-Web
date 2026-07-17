"use client";

import clsx from "clsx";
import { ChevronDown, MonitorSmartphone, Sparkles } from "lucide-react";
import { BrandPhrase, BrandText } from "../BrandText";
import { Button } from "../Button";
import { StoreButton, APP_STORE_URL } from "../StoreButtons";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// V2 hero: typography floating over the WebGL archipelago. The section
// itself is the [data-echo-zoom] marker — as it scrolls away the particle
// camera pushes from the full archipelago into Kanto. The "fact line" is a
// hairline-ruled row of checkable facts (the info anchor of the first
// viewport); all copy is SSR'd through the marketing i18n provider.

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

export function HeroV2() {
  const { copy, locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const isJapanese = locale === "ja";

  return (
    <section data-echo-zoom className="relative flex min-h-[calc(100svh-var(--mc-header-offset))] flex-col px-5 pb-14 pt-6 sm:px-8 lg:px-16 lg:pt-10 xl:px-20">
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-center">
        <div className={clsx("mc-reveal w-full min-w-0", isJapanese ? "max-w-[760px]" : "max-w-[720px]")}>
          <span className="mc-pill inline-flex items-center gap-1.5 bg-white/80 text-[#76576f] ring-1 ring-rose-100 backdrop-blur dark:bg-white/[0.06] dark:text-rose-200 dark:ring-white/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <BrandPhrase text={copy.hero.eyebrow} />
          </span>

          {/* One h1, two registers — brand wordmark + locked slogan. */}
          <h1 className="mt-7">
            <span className="block text-[clamp(3.4rem,16vw,4.6rem)] font-black leading-[0.95] tracking-[-0.03em] sm:text-[clamp(4rem,9vw,7rem)]">
              <BrandText>{copy.hero.titleTop || "Machi"}</BrandText>
              <span aria-hidden="true" className="text-orange-500 dark:text-orange-400">.</span>
            </span>
            <span
              className={clsx(
                "mt-4 block text-balance font-black leading-[1.14] tracking-[-0.015em] text-slate-950 [overflow-wrap:anywhere] sm:leading-[1.08] dark:text-white",
                isJapanese
                  ? "text-[clamp(1.9rem,6.6vw,2.3rem)] sm:text-[clamp(2.3rem,3.4vw,3.2rem)]"
                  : "text-[clamp(1.8rem,7vw,2.1rem)] sm:text-[clamp(2.3rem,3.9vw,3.6rem)]",
              )}
            >
              {splitDisplayLines(copy.hero.headline).map((segment, index) => (
                <span key={index} className="inline-block">{segment}</span>
              ))}
            </span>
          </h1>

          <p className={clsx("mt-6 text-slate-600 [overflow-wrap:anywhere] dark:text-slate-300", isJapanese ? "max-w-[36rem] text-[1.0625rem] leading-8" : "max-w-[34rem] text-lg leading-8")}>
            <BrandPhrase text={copy.hero.subtitle} />
          </p>

          <div className="mt-9 flex flex-wrap items-end gap-x-4 gap-y-3">
            <StoreButton kind="app-store" caption={copy.hero.appStoreCaption} href={APP_STORE_URL} className="items-start" />
            <StoreButton kind="google-play" caption={copy.hero.googlePlayCaption} href="/download#waitlist-form" className="items-start" />
            <Button
              href="/home"
              variant="brand"
              size="lg"
              className="h-[58px] px-7 text-base font-bold tracking-[-0.01em]"
              iconLeft={<MonitorSmartphone className="h-5 w-5" />}
            >
              {copy.hero.primary}
            </Button>
          </div>

          {/* fact line — hairline-ruled, every entry checkable in the app */}
          <ul className="mt-10 flex max-w-[720px] flex-wrap items-center gap-y-2 border-t border-slate-900/10 pt-5 dark:border-white/10">
            {v2.factLine.map((fact, i) => (
              <li key={fact} className="flex items-center text-[13px] font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                {i > 0 && <span aria-hidden="true" className="mx-3 h-3 w-px bg-slate-900/15 dark:bg-white/15" />}
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <a
        href="#theater"
        aria-label={copy.hero.scrollLabel}
        className="mc-scroll-cue absolute bottom-5 left-1/2 hidden h-11 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-500 shadow-sm backdrop-blur transition hover:text-indigo-600 md:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-sky-300"
      >
        <ChevronDown className="h-4 w-4" />
      </a>
    </section>
  );
}
