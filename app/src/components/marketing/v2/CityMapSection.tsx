"use client";

import { useMarketingI18n } from "../MarketingI18n";
import { CITY_POINTS } from "./city-data";
import { v2Copy } from "./theater-copy";

// The city constellation. The WebGL field behind this section re-frames to
// the full archipelago ([data-echo-map]) and the city cores brighten; the
// DOM renders the 13 labels at the same projected coordinates as the
// particles (shared city-data constants), grouped by metro area. Planned
// overseas regions are pinned as "in preparation" — never sold as live.

export function CityMapSection() {
  const { locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const cm = v2.cityMap;
  const lang = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";

  const groups: Array<{ key: "kanto" | "kansai" | "other"; label: string }> = [
    { key: "kanto", label: cm.groups.kanto },
    { key: "kansai", label: cm.groups.kansai },
    { key: "other", label: cm.groups.other },
  ];

  return (
    <section id="cities" data-echo-map className="mcv2-cv-off relative px-5 py-20 sm:px-8 lg:px-16 lg:py-32 xl:px-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-2xl">
          <span className="mc-eyebrow mc-reveal">{cm.label}</span>
          <h2 className="mc-section-title mc-reveal mt-4 text-balance">{cm.title}</h2>
          <p className="mc-section-lead mc-reveal mt-4">{cm.body}</p>
        </div>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ————— label map (canvas draws the land behind it) ————— */}
          <div className="mc-reveal relative mx-auto aspect-[10/9] w-full max-w-[640px]" aria-hidden="true">
            {CITY_POINTS.map((c, i) => (
              <span
                key={c.key}
                className="mcv2-city-label"
                data-group={c.group}
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, animationDelay: `${i * 120}ms` }}
              >
                <span className="mcv2-city-label-dot" />
                {c.name[lang]}
              </span>
            ))}
          </div>

          {/* ————— structured facts ————— */}
          <div className="space-y-6">
            {groups.map(({ key, label }) => (
              <div key={key} className="mc-reveal">
                <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {label}
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold tracking-normal text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {cm.live}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CITY_POINTS.filter((c) => c.group === key).map((c) => (
                    <span key={c.key} className="rounded-full bg-slate-950 px-3 py-1.5 text-[13px] font-extrabold text-white dark:bg-white/10 dark:text-slate-100">
                      {c.name[lang]}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div className="mc-reveal">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{cm.planned}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {cm.plannedRegions.map((r) => (
                  <span key={r} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-[13px] font-bold text-slate-400 dark:border-white/15 dark:text-slate-500">
                    {r} · {cm.planned}
                  </span>
                ))}
              </div>
            </div>

            <dl className="mc-reveal grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/60 dark:border-white/10 dark:bg-white/10">
              {cm.facts.map(([k, val]) => (
                <div key={k} className="bg-white/85 px-4 py-3.5 backdrop-blur dark:bg-slate-950/60">
                  <dt className="text-[12px] font-bold text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="mt-0.5 text-[15px] font-black tabular-nums text-slate-950 dark:text-white">{val}</dd>
                </div>
              ))}
            </dl>

            <p className="mc-reveal text-[13px] leading-6 text-slate-500 dark:text-slate-400">{cm.langNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
