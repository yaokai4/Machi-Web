"use client";

import Link from "next/link";
import { BookOpen, Check } from "lucide-react";
import { BrandPhrase } from "./BrandText";
import { Button } from "./Button";
import { MachiAIMark } from "@/components/brand/MachiAIMark";
import { useMarketingI18n } from "./MarketingI18n";

// 官网首页 Machi AI 重点区块(接近 Hero 级)。沿用首页的 coral→indigo 氛围,但用
// 产品的品牌绿(#147067)给 AI 标志/来源/chip 着色,提示「这是产品的智能层」。
// 右侧暗色「回声」卡复刻 WhyMachiSection 的展示语言,做成一段真实感的对话样例。
// 硬规则:只出现「Machi AI」,绝不出现任何上游供应商名。
export function MachiAISection() {
  const { copy } = useMarketingI18n();
  const c = copy.machiAiSection;

  return (
    <section id="machi-ai" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(241,245,249,0)_0%,rgba(214,240,233,0.5)_52%,rgba(241,245,249,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(11,13,18,0)_0%,rgba(16,42,38,0.5)_52%,rgba(11,13,18,0)_100%)]" />
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal grid gap-8 lg:grid-cols-[0.98fr_1.02fr] lg:items-center">
          <div>
            <p className="mc-eyebrow">{c.label}</p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
              <BrandPhrase text={c.title} />
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">{c.body}</p>
            <ul className="mt-6 space-y-3">
              {c.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#147067]/12 text-[#147067] ring-1 ring-[#147067]/15 dark:bg-[#147067]/25 dark:text-emerald-300 dark:ring-emerald-300/20">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <Button href="/guide/ai" variant="brand" size="md">
                {c.cta}
              </Button>
            </div>
          </div>

          <article className="mc-reveal relative overflow-hidden rounded-[32px] bg-[#151515] p-6 text-white shadow-[0_30px_80px_-48px_rgba(21,21,21,0.85)] sm:p-7">
            <div className="mc-echo-field absolute inset-0 opacity-30" aria-hidden="true">
              <span className="mc-echo-ring mc-echo-ring-a" />
              <span className="mc-echo-ring mc-echo-ring-b" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-3">
                <MachiAIMark className="h-11 w-11" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black">Machi AI</span>
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300">
                      Beta
                    </span>
                  </div>
                  <span className="text-xs text-white/55">{c.label}</span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-sm leading-6">
                  {c.sampleQuestion}
                </div>
                <div className="w-fit max-w-[94%] rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3 text-sm leading-6 text-white/85 ring-1 ring-white/10">
                  {c.sampleAnswer}
                </div>
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-300/20">
                    <BookOpen className="h-3 w-3" aria-hidden="true" />
                    {c.sourceLabel}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {c.chips.map((chip) => (
                  <Link
                    key={chip}
                    href={`/guide/ai?q=${encodeURIComponent(chip)}`}
                    className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:border-emerald-300/40 hover:text-white"
                  >
                    {chip}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
