"use client";

import {
  AlertTriangle,
  BadgeCheck,
  EyeOff,
  Flag,
  LockKeyhole,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

// Each safety item gets a calm slate / emerald icon — no red panels,
// no danger-style alerts. The goal is "trustworthy and mature", not
// "scared of the platform".
const icons = [Flag, EyeOff, ShieldCheck, AlertTriangle, Siren, BadgeCheck, LockKeyhole];

export function SafetySection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="safety" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="mc-aurora" />
      </div>

      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal max-w-3xl">
          <p className="mc-eyebrow" style={{ color: "rgb(15 118 110)" }}>{copy.safetySection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.safetySection.title} />
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.safetySection.body} />
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {copy.safetyItems.map((item, index) => {
            const Icon = icons[index] ?? ShieldCheck;
            return (
              <article
                key={item}
                className="mc-reveal group rounded-[22px] border border-emerald-100/70 bg-white/85 p-5 shadow-[0_14px_44px_-40px_rgba(15,23,42,0.55)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-black leading-snug text-slate-950 dark:text-white">
                  {item}
                </h3>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
