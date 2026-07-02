"use client";

import { FeatureCard } from "./FeatureCard";
import { useMarketingI18n } from "./MarketingI18n";

// The 12 channels are organised into three semantic clusters
// (information / opportunity / connection) per the marketing brief.
// Visually each group is a soft card with its own subtitle and a
// nested 2- or 4-column grid of channel cards. All 12 channels are
// still rendered; we never drop a feature.
export function FeatureChannelGrid() {
  const { copy } = useMarketingI18n();
  const byKey = Object.fromEntries(copy.features.map((feature) => [feature.key, feature]));

  return (
    <section id="features" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal mx-auto max-w-3xl text-center">
          <p className="mc-eyebrow">{copy.featureSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            {copy.featureSection.title}
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            {copy.featureSection.body}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {copy.featureSection.groups.map((group) => {
            const channels = group.channels.map((key) => byKey[key]).filter(Boolean);
            // Stable data key, not display-text matching — copy edits can
            // never silently drop the dark treatment again.
            const socialGroup = group.key === "social";
            return (
              <section
                key={group.title}
                className={socialGroup ? "mc-reveal relative overflow-hidden rounded-[28px] bg-[#151515] p-5 text-white shadow-[0_28px_80px_-48px_rgba(21,21,21,0.8)] sm:p-6" : "mc-reveal mc-glass relative overflow-hidden p-5 sm:p-6"}
              >
                <div className={socialGroup ? "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-orange-400/20 blur-2xl" : "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-orange-300/20 blur-2xl dark:bg-orange-500/15"} />
                <header>
                  <h3 className={socialGroup ? "text-xl font-black text-white" : "text-xl font-black text-slate-950 dark:text-white"}>
                    {group.title}
                  </h3>
                  <p className={socialGroup ? "mt-2 text-sm leading-6 text-white/65" : "mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400"}>
                    {group.description}
                  </p>
                </header>
                <ul className="relative mt-5 grid gap-3 sm:grid-cols-2">
                  {channels.map((feature) => (
                    <li key={feature.key} className="contents">
                      <FeatureCard feature={feature} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
