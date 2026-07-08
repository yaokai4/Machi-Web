"use client";

import { MarketingLocaleProvider } from "./MarketingI18n";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BrandPhrase } from "./BrandText";
import { MarketingMotion } from "./MarketingMotion";

/// Shell wrapper for every standalone marketing route (`/about`,
/// `/features`, `/cities`, …). Reuses the same Header + Footer as
/// the landing page so navigating between them feels seamless, and
/// inherits the dark-mode + locale context.
export function MarketingPageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <MarketingLocaleProvider>
      <MarketingPageFrame eyebrow={eyebrow} title={title} intro={intro}>
        {children}
      </MarketingPageFrame>
    </MarketingLocaleProvider>
  );
}

export function MarketingPageFrame({
  eyebrow,
  title,
  intro,
  meta,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  /** Optional slot under the intro — used for legal "last updated" lines. */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
      <main
        id="top"
        className="machi-site min-h-screen overflow-x-hidden text-slate-950 transition-colors duration-300 dark:text-slate-100"
      >
        <MarketingMotion />
        <Header />
        <section className="relative px-6 pb-12 pt-9 sm:px-8 sm:pb-16 sm:pt-10 lg:pt-14">
          <div className="mx-auto max-w-[1080px]">
            {eyebrow ? (
              <p className="text-sm font-black uppercase tracking-wide text-[#b94f42] dark:text-orange-200">{eyebrow}</p>
            ) : null}
            <h1 className="mt-3 text-4xl font-black leading-[1.05] text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
              <BrandPhrase text={title} />
            </h1>
            {intro ? (
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
                <BrandPhrase text={intro} />
              </p>
            ) : null}
            {meta ? <div className="mt-6">{meta}</div> : null}
          </div>
        </section>

        <section className="px-6 pb-24 sm:px-8">
          <div className="mx-auto max-w-[1080px] space-y-8">{children}</div>
        </section>

        <Footer />
      </main>
  );
}

/// Card primitive matching the landing aesthetic. Use inside page bodies
/// so /about /features etc share the same look.
export function MarketingCard({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={
        "rounded-[28px] border border-white/40 bg-white/75 p-6 shadow-[0_20px_60px_-46px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8 dark:border-white/8 dark:bg-white/[0.04] " +
        (className ?? "")
      }
    >
      {title ? <h2 className="text-2xl font-black text-slate-950 sm:text-3xl dark:text-white"><BrandPhrase text={title} /></h2> : null}
      {subtitle ? (
        <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base dark:text-slate-300"><BrandPhrase text={subtitle} /></p>
      ) : null}
      {children}
    </article>
  );
}
