"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Quote } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMarketingI18n } from "./MarketingI18n";

const FOUNDER_SITE_URL = "https://yaokai.me/about";

export function FounderSection({
  variant = "compact",
  inFrame = false,
}: {
  variant?: "compact" | "full";
  inFrame?: boolean;
}) {
  const { copy, locale } = useMarketingI18n();
  const pathname = usePathname();
  const f = copy.founder;
  const isFull = variant === "full";
  const closingLines = f.closing.split("\n").filter(Boolean);
  const explicitLocale = pathname === "/zh" || pathname.startsWith("/zh/")
    ? "zh"
    : pathname === "/en" || pathname.startsWith("/en/")
      ? "en"
      : pathname === "/ja" || pathname.startsWith("/ja/")
        ? "ja"
        : null;
  const routeLocale = explicitLocale ?? locale;
  const aboutPath = routeLocale === "zh" && !explicitLocale ? "/about" : `/${routeLocale}/about`;
  const aboutHref = `${aboutPath}#founder`;

  const body = (
    <div className={isFull ? "mx-auto max-w-[1080px]" : "mx-auto max-w-[1040px]"}>
      <div className="mc-reveal flex flex-col gap-3">
        {f.eyebrow !== f.title ? <p className="mc-eyebrow">{f.eyebrow}</p> : null}
        <h2 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">{f.title}</h2>
      </div>

      <article
        className={
          isFull
            ? "mc-reveal mt-8 grid overflow-hidden rounded-[30px] border border-white/60 bg-white/80 shadow-[0_28px_90px_-58px_rgba(15,23,42,0.72)] backdrop-blur lg:grid-cols-[0.88fr_1.12fr] dark:border-white/10 dark:bg-white/[0.05]"
            : "mc-reveal relative mt-8 overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 p-6 text-white shadow-[0_34px_90px_-54px_rgba(79,70,229,0.95)] sm:p-9"
        }
      >
        <span aria-hidden="true" className={isFull ? "hidden" : "pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/16 blur-3xl"} />
        <span aria-hidden="true" className={isFull ? "hidden" : "pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"} />

        <aside className={isFull ? "relative overflow-hidden bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 p-6 text-white sm:p-8" : "relative"}>
          {isFull ? (
            <>
              <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            </>
          ) : null}
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className={isFull
                ? "relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/16 text-2xl font-black text-white ring-1 ring-white/20"
                : "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/16 text-2xl font-black text-white ring-1 ring-white/20"}
            >
              {f.avatar}
            </span>
            <div className="min-w-0">
              <h3 className={isFull ? "relative text-lg font-black text-white" : "text-lg font-black text-white"}>{f.name}</h3>
              <p className="mt-0.5 text-sm font-semibold text-white/82">{f.role}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-white/58">{f.meta}</p>
            </div>
          </div>

          {isFull ? (
            <blockquote className="relative mt-6 rounded-[22px] border border-white/15 bg-white/10 p-5 text-base font-black leading-8 text-white backdrop-blur">
              <Quote className="mb-3 h-5 w-5 text-white/72" aria-hidden="true" />
              {f.quote}
            </blockquote>
          ) : null}

          <div className={isFull ? "relative mt-7 border-t border-white/15 pt-6" : "mt-7 max-w-2xl"}>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/58">{f.siteEyebrow}</p>
            <h3 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">{f.siteTitle}</h3>
            <p className="mt-4 text-sm leading-7 text-white/82 sm:text-base">{f.siteBody}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {!isFull ? (
                <Link
                  href={aboutHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-indigo-700 shadow-[0_18px_46px_-26px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5"
                >
                  {f.readMore}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null}
              <a
                href={FOUNDER_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={isFull
                  ? "inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-indigo-700 shadow-[0_18px_46px_-26px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5"
                  : "inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/16"}
              >
                {f.siteCta}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </aside>

        {isFull ? (
          <div className="p-6 sm:p-8">
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
          <p className="relative mt-6 max-w-3xl border-t border-white/15 pt-5 text-[15px] leading-7 text-white/76">{f.bio}</p>
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
    <section id="founder" className="relative scroll-mt-24 overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="pointer-events-none absolute left-[8%] top-20 -z-10 h-52 w-52 rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute bottom-16 right-[8%] -z-10 h-52 w-52 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
      <div className="mx-auto max-w-[1180px]">{body}</div>
    </section>
  );
}
