"use client";

import { BadgeCheck, BarChart3, Building2, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "./Button";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n, localizedMarketingHref } from "./MarketingI18n";

export function BusinessSection() {
  const { copy, locale } = useMarketingI18n();

  return (
    <section id="business" className="relative overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="mc-aurora" />
      </div>

      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        {/* ─────────── LEFT — pitch ─────────── */}
        <div className="mc-reveal">
          <p className="mc-eyebrow mc-eyebrow--violet">{copy.businessSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.businessSection.title} />
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.businessSection.body} />
          </p>

          <ul className="mt-7 grid gap-2 sm:grid-cols-2">
            {copy.businessItems.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.45)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
              >
                <BadgeCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
                <span className="truncate">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {/* 招商降温：主 CTA 从「申请合作」降级为留资/预约洽谈，指向联系页。 */}
            <Button
              href={localizedMarketingHref("/contact", locale)}
              size="md"
              className="h-12 sm:w-auto"
              iconLeft={<Building2 className="h-4 w-4" />}
            >
              {copy.businessSection.primary}
            </Button>
            <Button
              href={localizedMarketingHref("/ads", locale)}
              variant="secondary"
              size="md"
              className="h-12 sm:w-auto"
              iconLeft={<BarChart3 className="h-4 w-4" />}
            >
              {copy.businessSection.secondary}
            </Button>
          </div>
        </div>

        {/* ─────────── RIGHT — console mock ─────────── */}
        <div className="mc-reveal">
          <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#25211f_0%,#392d31_56%,#4b3543_100%)] p-5 text-white shadow-[0_28px_80px_-44px_rgba(55,40,43,0.9)] sm:p-7">
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-violet-400/20 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden="true" />

            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-white/55">
                  {copy.businessSection.consoleLabel}
                </p>
                <h3 className="mt-1 text-2xl font-black">{copy.businessSection.consoleTitle}</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-emerald-300/25">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.businessSection.verified}
              </span>
            </div>

            <div className="relative mt-6 space-y-3">
              {[
                { icon: Megaphone, tone: "bg-violet-400/10 text-violet-200" },
                { icon: Building2, tone: "bg-amber-400/10 text-amber-200" },
                { icon: Sparkles, tone: "bg-orange-400/10 text-orange-200" },
              ].map((item, index) => {
                const [title, value] = copy.businessSection.campaigns[index];
                const Icon = item.icon;
                const fillPct = [72, 58, 41][index];
                return (
                  <div
                    key={title}
                    className="rounded-[18px] bg-white/[0.06] p-4 ring-1 ring-white/[0.08]"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black sm:text-base">{title}</p>
                        <p className="mt-0.5 text-xs font-semibold text-white/55">{value}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-300"
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative mt-5 flex items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-slate-950 dark:bg-white/[0.08] dark:text-white">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black">{copy.businessSection.partnerTitle}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {copy.businessSection.partnerBody}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
