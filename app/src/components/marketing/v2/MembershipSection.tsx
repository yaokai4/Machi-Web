"use client";

import { ArrowRight, BadgeCheck, Bot, BookLock, CircleGauge, Coins, FileCheck2, ShieldCheck, Sparkles, Store, TicketPercent } from "lucide-react";
import Link from "next/link";
import { membershipBenefitCopy } from "@/lib/membership-ui";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// Membership + wallet + store. The nine benefit cards pull their copy from
// the SAME catalog the in-app membership pages render (membership-ui.ts),
// so the homepage can never drift from what the product actually grants.

const BENEFIT_KEYS = [
  "ai_member_quota",
  "verified_badge",
  "trusted_publish",
  "higher_quota",
  "priority_review",
  "light_boost",
  "exclusive_resources",
  "jlpt_discount",
  "service_priority",
] as const;

const BENEFIT_ICONS = [Bot, BadgeCheck, ShieldCheck, CircleGauge, FileCheck2, Sparkles, BookLock, TicketPercent, Coins];

export function MembershipSection() {
  const { locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const m = v2.membership;
  // membership-ui.ts speaks the app-shell Locale ("zh-Hans" | …)
  const appLocale = locale === "zh" ? ("zh-Hans" as const) : locale;

  return (
    <section id="membership" className="relative px-5 py-20 sm:px-8 lg:px-16 lg:py-28 xl:px-20">
      <div className="mc-aurora" aria-hidden="true" />
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-2xl">
          <span className="mc-eyebrow mc-eyebrow--violet mc-reveal">{m.label}</span>
          <h2 className="mc-section-title mc-reveal mt-4 text-balance">{m.title}</h2>
          <p className="mc-section-lead mc-reveal mt-4">{m.body}</p>
        </div>

        {/* 3×3 benefit grid — copy from the in-app catalog */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFIT_KEYS.map((key, i) => {
            const { title, description } = membershipBenefitCopy(key, appLocale, {});
            const Icon = BENEFIT_ICONS[i];
            return (
              <div key={key} className="mcv2-benefit mc-reveal rounded-2xl border border-slate-200/80 bg-white/80 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.045]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 text-[15px] font-extrabold tracking-[-0.01em] text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-600 dark:text-slate-400">{description}</p>
              </div>
            );
          })}
        </div>

        <div className="mc-reveal mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] leading-5 text-slate-400 dark:text-slate-500">{m.note}</p>
          <Link
            href="/membership"
            className="group inline-flex items-center gap-1.5 text-[14px] font-extrabold text-slate-950 transition hover:text-indigo-600 dark:text-white dark:hover:text-sky-300"
          >
            {m.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        {/* wallet + store */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="mc-reveal rounded-[28px] bg-slate-950 p-7 text-white sm:p-8 dark:bg-white/[0.06] dark:ring-1 dark:ring-white/10">
            <span className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.16em] text-orange-300">
              <Coins className="h-4 w-4" aria-hidden="true" />
              {m.walletTitle}
            </span>
            <p className="mt-3 max-w-md text-[15px] leading-7 text-white/75">{m.walletBody}</p>
            <dl className="mt-6 divide-y divide-white/10 border-t border-white/10">
              {m.walletRows.map(([k, val]) => (
                <div key={k} className="flex items-center justify-between py-3">
                  <dt className="text-[13px] font-bold text-white/60">{k}</dt>
                  <dd className="text-[13px] font-extrabold tabular-nums text-white">{val}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mc-glass mc-reveal mc-reveal-1 flex flex-col p-7 sm:p-8">
            <span className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              <Store className="h-4 w-4" aria-hidden="true" />
              {m.mallTitle}
            </span>
            <p className="mt-3 max-w-md text-[15px] leading-7 text-slate-600 dark:text-slate-300">{m.mallBody}</p>
            <div className="mt-6 grid grid-cols-3 gap-2" aria-hidden="true">
              {["N2", "N1", "ES"].map((tag, i) => (
                <div key={tag} className="mcv2-shelf-card rounded-xl border border-slate-200/80 bg-white p-3 text-center dark:border-white/10 dark:bg-white/[0.05]" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 text-[11px] font-black text-white">{tag}</span>
                  <span className="mt-2 block h-1.5 rounded bg-slate-100 dark:bg-white/10" />
                  <span className="mt-1 block h-1.5 w-2/3 rounded bg-slate-100 dark:bg-white/10" />
                </div>
              ))}
            </div>
            <Link
              href="/guide"
              className="group mt-auto inline-flex items-center gap-1.5 pt-6 text-[14px] font-extrabold text-slate-950 transition hover:text-orange-600 dark:text-white dark:hover:text-orange-300"
            >
              {m.mallCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
