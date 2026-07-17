"use client";

import { MonitorSmartphone } from "lucide-react";
import { marketingCopy, type MarketingLocale } from "@/data/machi-home";
import { Button } from "../Button";
import { StoreButton, APP_STORE_URL } from "../StoreButtons";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// Curtain call. Crossing [data-echo-finale] makes every city core in the
// particle field fire one last echo ring together; the locked slogan is
// reprinted in all three languages (the current locale leads). Keeps the
// historical id="download" so /#download links keep landing here.

const SLOGAN_ORDER: MarketingLocale[] = ["zh", "en", "ja"];

export function FinaleSection() {
  const { copy, locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const others = SLOGAN_ORDER.filter((l) => l !== locale);

  return (
    <section id="download" data-echo-finale className="relative overflow-hidden px-5 pb-24 pt-24 text-center sm:px-8 lg:pb-32 lg:pt-32">
      <div className="mx-auto max-w-[880px]">
        <span className="mc-eyebrow mc-reveal">{copy.closingCta.eyebrow}</span>
        <h2 className="mc-reveal mt-5 text-balance text-[clamp(2.2rem,6vw,4rem)] font-black leading-[1.08] tracking-[-0.025em] text-slate-950 dark:text-white">
          {copy.closingCta.title}
        </h2>
        <p className="mc-section-lead mc-reveal mx-auto mt-4">{copy.closingCta.body}</p>

        <div className="mc-reveal mt-9 flex flex-wrap items-end justify-center gap-x-4 gap-y-3">
          <StoreButton kind="app-store" caption={copy.hero.appStoreCaption} href={APP_STORE_URL} className="items-center" />
          <StoreButton kind="google-play" caption={copy.hero.googlePlayCaption} href="/download#waitlist-form" className="items-center" />
          <Button
            href="/home"
            variant="brand"
            size="lg"
            className="h-[58px] px-7 text-base font-bold tracking-[-0.01em]"
            iconLeft={<MonitorSmartphone className="h-5 w-5" />}
          >
            {copy.closingCta.web}
          </Button>
        </div>
        <p className="mc-reveal mt-4 text-[13px] text-slate-500 dark:text-slate-400">{copy.closingCta.note}</p>

        {/* the slogan, three languages, current locale leading */}
        <div className="mc-reveal mt-16 border-t border-slate-900/10 pt-10 dark:border-white/10">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">{v2.finale.sloganNote}</p>
          <p className="mt-4 text-balance text-[clamp(1.3rem,3vw,1.9rem)] font-black leading-snug tracking-[-0.015em] text-slate-950 dark:text-white">
            {copy.hero.headline}
          </p>
          {others.map((l) => (
            <p key={l} lang={l === "zh" ? "zh-CN" : l} className="mt-2 text-[15px] font-semibold text-slate-400 dark:text-slate-500">
              {marketingCopy[l].hero.headline}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
