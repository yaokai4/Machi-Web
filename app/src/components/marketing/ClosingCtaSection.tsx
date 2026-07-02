"use client";

import { MonitorSmartphone } from "lucide-react";
import { BrandText } from "./BrandText";
import { Button } from "./Button";
import { StoreButton, APP_STORE_URL } from "./StoreButtons";
import { useMarketingI18n } from "./MarketingI18n";

// The page's final beat: after the story, one quiet, confident ask.
// Centered, spacious, exactly two actions — the same pair as the hero,
// so the page opens and closes on the same chord.
export function ClosingCtaSection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="download" className="relative overflow-hidden px-5 py-20 sm:px-6 lg:py-28">
      <div className="mc-echo-field pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-60" aria-hidden="true">
        <span className="mc-echo-ring mc-echo-ring-a" />
        <span className="mc-echo-ring mc-echo-ring-b" />
      </div>

      <div className="mc-reveal mx-auto max-w-[760px] text-center">
        <p className="mc-eyebrow">{copy.closingCta.eyebrow}</p>
        <h2 className="mt-5 text-balance text-4xl font-black leading-[1.08] tracking-[-0.02em] text-slate-950 sm:text-6xl dark:text-white">
          {copy.closingCta.title}
        </h2>
        <p className="mt-5 text-lg font-semibold text-slate-600 sm:text-xl dark:text-slate-300">
          {copy.closingCta.body}
        </p>

        <div className="mx-auto mt-10 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-3">
          <StoreButton kind="app-store" href={APP_STORE_URL} showCaption={false} />
          <Button
            href="/home"
            variant="secondary"
            size="lg"
            className="h-[58px] rounded-[16px] px-6 text-base font-bold tracking-[-0.01em]"
            iconLeft={<MonitorSmartphone className="h-5 w-5" />}
          >
            {copy.closingCta.web}
          </Button>
        </div>

        <p className="mt-5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          {copy.closingCta.note}
        </p>

        <p className="mt-14 select-none text-[clamp(2.6rem,9vw,4.4rem)] font-black leading-none tracking-[-0.03em]" aria-hidden="true">
          <BrandText>Machi</BrandText>
          <span className="text-orange-500 dark:text-orange-400">.</span>
        </p>
      </div>
    </section>
  );
}
