"use client";

import Link from "next/link";
import { ArrowRight, Quote } from "lucide-react";
import { useMarketingI18n } from "./MarketingI18n";

// Founder / 创始人 / 創設者 module. Additive + presentational only — every
// string comes from marketingCopy[locale].founder, so it is trilingual
// automatically and inherits the site's light/dark + responsive behaviour
// (no new tokens or colors). Reused in two places:
//   • home page  -> <FounderSection />                 (compact: one-line bio + link)
//   • About page -> <FounderSection variant="full" inFrame />  (full story + slogan)
// `inFrame` drops the standalone <section> padding so it sits cleanly inside
// the About page's MarketingPageFrame container.
export function FounderSection({
  variant = "compact",
  inFrame = false,
}: {
  variant?: "compact" | "full";
  inFrame?: boolean;
}) {
  const { copy } = useMarketingI18n();
  const f = copy.founder;
  const isFull = variant === "full";
  const closingLines = f.closing.split("\n").filter(Boolean);

  const body = (
    <div className={isFull ? "mx-auto max-w-[1080px]" : "mx-auto max-w-3xl"}>
      <div className="mc-reveal flex flex-col gap-3">
        {f.eyebrow !== f.title ? <p className="mc-eyebrow">{f.eyebrow}</p> : null}
        <h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">{f.title}</h2>
      </div>

      <article
        className={
          isFull
            ? "mc-reveal mt-8 grid gap-7 rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_22px_70px_-50px_rgba(15,23,42,0.65)] backdrop-blur sm:p-7 lg:grid-cols-[0.86fr_1.14fr] dark:border-white/10 dark:bg-white/[0.05]"
            : "mc-reveal mt-8 rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_22px_70px_-50px_rgba(15,23,42,0.65)] backdrop-blur sm:p-9 dark:border-white/10 dark:bg-white/[0.05]"
        }
      >
        <aside className={isFull ? "rounded-[24px] bg-slate-50/80 p-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:bg-white/[0.045] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : ""}>
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-sky-500 text-2xl font-black text-white shadow-[0_14px_30px_-14px_rgba(79,70,229,0.8)]"
            >
              {f.avatar}
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{f.name}</h3>
              <p className="mt-0.5 text-sm font-semibold text-indigo-700 dark:text-sky-300">{f.role}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">{f.meta}</p>
            </div>
          </div>

          {isFull ? (
            <blockquote className="mt-6 rounded-[22px] border border-slate-900/[0.06] bg-white/75 p-5 text-base font-black leading-8 text-slate-900 shadow-[0_18px_50px_-44px_rgba(15,23,42,0.7)] dark:border-white/10 dark:bg-slate-950/25 dark:text-white">
              <Quote className="mb-3 h-5 w-5 text-indigo-600 dark:text-sky-300" aria-hidden="true" />
              {f.quote}
            </blockquote>
          ) : null}
        </aside>

        {isFull ? (
          <div>
            <div className="space-y-4">
              {f.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-[15px] leading-7 text-slate-600 dark:text-slate-300">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-900/[0.06] pt-5 text-base font-black leading-8 text-slate-950 dark:border-white/10 dark:text-white">
              {closingLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="mt-5 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{f.bio}</p>
            <Link
              href="/about#founder"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-indigo-700 transition hover:gap-2.5 dark:text-sky-300"
            >
              <span>{f.readMore}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </article>
    </div>
  );

  if (inFrame) {
    return (
      <div id="founder" className="scroll-mt-24">
        {body}
      </div>
    );
  }
  return (
    <section id="founder" className="relative scroll-mt-24 px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-[1180px]">{body}</div>
    </section>
  );
}
