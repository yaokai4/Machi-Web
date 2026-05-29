"use client";

import { MapPin } from "lucide-react";
import { CityCard } from "./CityCard";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

export function CityShowcaseSection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="cities" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="mc-aurora" />
      </div>
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="mc-eyebrow">{copy.citySection.label}</p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
              <BrandPhrase text={copy.citySection.title} />
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
              <BrandPhrase text={copy.citySection.body} />
            </p>
          </div>
          <div className="mc-pill border border-white/70 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
            {copy.citySection.badge}
          </div>
        </div>

        {/* ─── Lightweight "active city / switchable cities" demo. Static
            UI — no business logic — but communicates the multi-city model
            at a glance. ─── */}
        <div className="mc-reveal mt-8 flex flex-wrap items-center gap-3 rounded-[24px] border border-white/70 bg-white/75 px-5 py-4 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.55)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-400/20">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {copy.citySection.switcherLabel}
              </p>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                {copy.citySection.switcherActive}
              </p>
            </div>
          </div>

          <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-white/10" aria-hidden="true" />

          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {copy.citySection.switcherHint}
          </span>
          <ul className="flex flex-wrap gap-2">
            {copy.citySection.switcherCities.map((city) => (
              <li key={city}>
                <span className="inline-flex h-8 items-center rounded-full bg-slate-950/[0.04] px-3 text-xs font-black text-slate-700 ring-1 ring-slate-900/[0.06] transition hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-100 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-100">
                  {city}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.cities.map((city) => (
            <div className="mc-reveal" key={city.name}>
              <CityCard city={city} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
