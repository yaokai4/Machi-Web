"use client";

import Link from "next/link";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  FileText,
  GraduationCap,
  Languages,
  LifeBuoy,
  MapPinned,
} from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { Button } from "./Button";
import { useMarketingI18n } from "./MarketingI18n";

const icons = [
  MapPinned,
  GraduationCap,
  BriefcaseBusiness,
  Languages,
  Building2,
  BookOpenText,
  FileText,
];

export function GuideSection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="guide" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(241,245,249,0)_0%,rgba(238,242,255,0.68)_52%,rgba(241,245,249,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(11,13,18,0)_0%,rgba(30,41,59,0.42)_52%,rgba(11,13,18,0)_100%)]" />
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
          <div>
            <p className="mc-eyebrow">{copy.guideSection.label}</p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
              <BrandPhrase text={copy.guideSection.title} />
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
              <BrandPhrase text={copy.guideSection.body} />
            </p>
            <p className="mt-5 rounded-2xl bg-white/76 px-4 py-3 text-sm font-bold leading-6 text-slate-600 ring-1 ring-slate-200/70 dark:bg-white/[0.05] dark:text-slate-300 dark:ring-white/10">
              {copy.guideSection.expansion}
            </p>
            <div className="mt-7">
              <Button href="/guide" size="md" iconLeft={<LifeBuoy className="h-4 w-4" />}>
                {copy.guideSection.cta}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {copy.guideSection.cards.map(([title, body], index) => {
              const Icon = icons[index] ?? BookOpenText;
              return (
                <Link
                  key={title}
                  href="/guide"
                  className="mc-reveal group rounded-[22px] border border-white/70 bg-white/82 p-4 shadow-[0_16px_44px_-40px_rgba(15,23,42,0.58)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 transition group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-400/20">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-black text-slate-950 dark:text-white">
                    <BrandPhrase text={title} />
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <BrandPhrase text={body} />
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
