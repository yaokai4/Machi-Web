"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  EyeOff,
  Flag,
  LockKeyhole,
  ShieldCheck,
  Siren,
  UsersRound,
} from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

// Each safety item gets a calm slate / emerald icon — no red panels,
// no danger-style alerts. The goal is "trustworthy and mature", not
// "scared of the platform".
const icons = [UsersRound, ShieldCheck, AlertTriangle, EyeOff, Flag, LockKeyhole, Siren, BadgeCheck, Ban, ShieldCheck];
const flowByLocale = {
  zh: ["举报", "审核", "拉黑", "下架", "账号限制"],
  en: ["Report", "Review", "Block", "Remove", "Limit"],
  ja: ["通報", "審査", "ブロック", "削除", "制限"],
};

export function SafetySection() {
  const { copy, locale } = useMarketingI18n();

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

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {copy.safetyItems.map((item, index) => {
            const Icon = icons[index] ?? ShieldCheck;
            return (
              <article
                key={item.title}
                className="mc-reveal group rounded-[22px] border border-emerald-100/70 bg-white/85 p-5 shadow-[0_14px_44px_-40px_rgba(15,23,42,0.55)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-black leading-snug text-slate-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{item.body}</p>
              </article>
            );
          })}
        </div>

        <div className="mc-reveal mt-8 rounded-[28px] border border-emerald-100/80 bg-white/82 p-5 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {flowByLocale[locale].map((step, index) => (
              <div key={step} className="flex flex-1 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                  {index + 1}
                </span>
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">{step}</span>
                {index < 4 ? <span className="hidden h-px flex-1 bg-emerald-100 md:block dark:bg-white/10" /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
