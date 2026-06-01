"use client";

import { ArrowRight, MapPinned, MessageCircle, Quote, Radio, Sparkles } from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const highlightIcons = [MessageCircle, Sparkles, MapPinned];

export function BrandStorySection() {
  const { copy } = useMarketingI18n();

  return (
    <section id="story" className="relative overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(248,250,252,0)_0%,rgba(239,246,255,0.9)_42%,rgba(248,250,252,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(11,13,18,0)_0%,rgba(15,23,42,0.72)_48%,rgba(11,13,18,0)_100%)]" />
      <div className="absolute left-[8%] top-16 -z-10 h-40 w-40 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/15" />
      <div className="absolute right-[6%] bottom-12 -z-10 h-44 w-44 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/15" />

      <div className="mx-auto max-w-[1120px]">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="mc-reveal lg:py-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100 backdrop-blur dark:bg-white/10 dark:text-sky-300 dark:ring-white/10">
              <Radio className="h-3.5 w-3.5" />
              {copy.brandStory.label}
            </div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
              <BrandPhrase text={copy.brandStory.title} />
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
              <BrandPhrase text={copy.brandStory.lead} />
            </p>

            <div className="mt-7 rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.9)] backdrop-blur dark:border-white/10 dark:bg-white/5">
              <Quote className="h-7 w-7 text-indigo-500" />
              <p className="mt-4 text-xl font-black leading-8 text-slate-950 dark:text-white">
                <BrandPhrase text={copy.brandStory.closing} />
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-[28px] border border-indigo-100/80 bg-white/[0.76] p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-700 dark:text-sky-300">
                <Radio className="h-4 w-4" />
                <span>{copy.brandStory.echoLabel}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {copy.brandStory.echoNodes.map((node, index) => (
                  <div key={node} className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white dark:bg-white dark:text-slate-950">
                      {node}
                    </span>
                    {index < copy.brandStory.echoNodes.length - 1 ? (
                      <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mc-reveal space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {copy.brandStory.cityLines.map((line) => (
                <div
                  key={line}
                  className="rounded-2xl border border-slate-200/70 bg-white/[0.72] px-4 py-3 text-sm font-semibold leading-6 text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  {line}
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {copy.brandStory.highlights.map(([title, body], index) => {
                const Icon = highlightIcons[index] ?? Sparkles;
                return (
                  <div
                    key={title}
                    className="rounded-2xl border border-slate-200/70 bg-white/[0.78] p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-3 text-sm font-black text-slate-950 dark:text-white">{title}</h3>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{body}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 rounded-[28px] border border-slate-200/70 bg-white/[0.68] p-5 text-sm leading-7 text-slate-600 shadow-sm backdrop-blur sm:grid-cols-2 sm:p-6 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {copy.brandStory.paragraphs.map((paragraph) => (
                <p key={paragraph}><BrandPhrase text={paragraph} /></p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
