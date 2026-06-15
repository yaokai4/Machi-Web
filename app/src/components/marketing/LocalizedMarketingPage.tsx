"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MonitorSmartphone } from "lucide-react";
import { marketingPages, type MarketingPageBlock, type MarketingPageId } from "@/data/marketing-pages";
import type { MarketingLocale } from "@/data/machi-home";
import { applyMarketingCopyOverrides, scopeMarketingCopyOverrides } from "@/lib/marketingCopyOverrides";
import { BrandPhrase } from "./BrandText";
import { MarketingLocaleProvider, useMarketingI18n } from "./MarketingI18n";
import { MarketingCmsBlocks } from "./MarketingCmsBlocks";
import { MarketingCard, MarketingPageFrame } from "./PageShell";
import { StoreButton } from "./StoreButtons";
import { DownloadCTA } from "./DownloadCTA";
import { FounderSection } from "./FounderSection";

const CONTACT_EMAIL = "hi@machicity.com";

export function LocalizedMarketingPage({
  pageId,
  initialLocale,
}: {
  pageId: MarketingPageId;
  initialLocale?: MarketingLocale;
}) {
  return (
    <MarketingLocaleProvider initialLocale={initialLocale} preferClientLocale={!initialLocale}>
      <LocalizedMarketingPageInner pageId={pageId} />
    </MarketingLocaleProvider>
  );
}

function LocalizedMarketingPageInner({ pageId }: { pageId: MarketingPageId }) {
  const { locale, copy, overrides } = useMarketingI18n();
  const page = useMemo(
    () => applyMarketingCopyOverrides(
      marketingPages[pageId][locale] ?? marketingPages[pageId].zh,
      scopeMarketingCopyOverrides(overrides, `pages.${pageId}.`),
    ),
    [locale, overrides, pageId],
  );

  return (
    <MarketingPageFrame eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
      {page.blocks.map((block, index) => (
        <Fragment key={block.title}>
          <MarketingBlock block={block} openLabel={copy.common.open} />
          {pageId === "about" && index === 0 ? <FounderSection variant="full" inFrame /> : null}
        </Fragment>
      ))}
      {pageId === "download" ? <DownloadCTA /> : null}
      <MarketingCmsBlocks pageId={pageId} />
    </MarketingPageFrame>
  );
}

function MarketingBlock({ block, openLabel }: { block: MarketingPageBlock; openLabel: string }) {
  const bodyParagraphs = block.subtitle && block.body ? block.body.split("\n\n") : [];

  if (block.variant === "store") {
    return (
      <MarketingCard title={block.title} subtitle={block.body} className="mc-reveal">
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <StoreButton kind="app-store" label="App Store" href="/register" className="justify-center sm:min-w-64" />
          <StoreButton kind="google-play" label="Google Play" href="/register" className="justify-center sm:min-w-64" />
        </div>
      </MarketingCard>
    );
  }

  if (block.variant === "contact") {
    return (
      <MarketingCard title={block.title} subtitle={block.body} className="mc-reveal">
        <Link
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[linear-gradient(110deg,#ff7657_0%,#d94b5f_48%,#84658f_100%)] px-5 text-sm font-black text-white shadow-[0_18px_46px_-26px_rgba(201,74,88,0.72)] transition hover:-translate-y-0.5"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {CONTACT_EMAIL}
        </Link>
      </MarketingCard>
    );
  }

  return (
    <MarketingCard title={block.title} subtitle={block.subtitle ?? block.body} className="mc-reveal">
      {bodyParagraphs.length ? (
        <div className="mt-5 max-w-3xl space-y-4 text-sm leading-7 text-slate-600 sm:text-base dark:text-slate-300">
          {bodyParagraphs.map((paragraph) => (
            <p key={paragraph} className="whitespace-pre-line">
              <BrandPhrase text={paragraph} />
            </p>
          ))}
        </div>
      ) : null}
      {block.items?.length ? (
        <div className={block.variant === "list" || block.variant === "legal" ? "mt-6 space-y-3" : "mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {block.items.map((item) => (
            <article
              key={item.title}
              className="group rounded-[22px] bg-white/[0.62] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.78),0_18px_46px_-42px_rgba(15,23,42,0.65)] transition duration-300 hover:-translate-y-0.5 hover:bg-white/80 dark:bg-white/[0.05] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]"
            >
              {item.meta ? <p className="text-[11px] font-black uppercase text-[#9a536f] dark:text-rose-200">{item.meta}</p> : null}
              <h3 className="text-base font-black text-slate-950 dark:text-white">
                <BrandPhrase text={item.title} />
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.body}</p>
              {item.href ? (
                <Link href={item.href} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-[#76576f] dark:text-rose-200">
                  <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                  <span>{openLabel}</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </MarketingCard>
  );
}
