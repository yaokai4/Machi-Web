"use client";

import { Compass, Globe2, MessagesSquare, ShieldCheck } from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const pillarMeta = [
  { icon: Globe2, tone: "from-indigo-500 to-sky-500" },
  { icon: Compass, tone: "from-emerald-500 to-sky-500" },
  { icon: MessagesSquare, tone: "from-orange-500 to-rose-500" },
  { icon: ShieldCheck, tone: "from-teal-500 to-emerald-500" },
];

export function BrandIntroSection() {
  const { copy } = useMarketingI18n();

  return (
    <section className="px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal max-w-3xl">
          <p className="mc-eyebrow">{copy.brandIntro.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.brandIntro.title} />
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.brandIntro.body} />
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {copy.brandIntro.pillars.map(([title, description], index) => {
            const meta = pillarMeta[index];
            const Icon = meta.icon;
            return (
              <article key={title} className="mc-reveal mc-glass p-5 sm:p-6">
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.tone} text-white shadow-[0_14px_30px_-14px_rgba(79,70,229,0.6)]`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-black text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
