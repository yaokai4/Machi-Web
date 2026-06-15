"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MonitorSmartphone } from "lucide-react";
import { marketingPages, type MarketingPageBlock, type MarketingPageId } from "@/data/marketing-pages";
import type { MarketingLocale } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { MarketingLocaleProvider, useMarketingI18n } from "./MarketingI18n";
import { MarketingCmsBlocks } from "./MarketingCmsBlocks";
import { MarketingCard, MarketingPageFrame } from "./PageShell";
import { StoreButton } from "./StoreButtons";
import { DownloadCTA } from "./DownloadCTA";
import { FounderSection } from "./FounderSection";

const CONTACT_EMAIL = "hi@machicity.com";

const FOUNDER_SITE_URL = "https://yaokai.me/about";

// Closing card for the About page. It both fills the quiet space above the
// footer and points readers to the founder's own world — the page is, after
// all, the story of one person. Copy is trilingual to match the rest of /about.
const founderSiteCopy: Record<MarketingLocale, { eyebrow: string; title: string; body: string; cta: string }> = {
  zh: {
    eyebrow: "关于创始人",
    title: "城市之外，还有一个写代码的人",
    body: "Machi 始于一个人对城市的观察，也始于一份不甘心让有用信息继续散落的执拗。如果你想认识 Machi 背后的人——他走过的路、做过的产品，以及此刻仍在搭建的东西——欢迎到他的个人空间坐一坐。",
    cta: "走进 yaokai.me",
  },
  en: {
    eyebrow: "About the founder",
    title: "Beyond the city, there is a person writing the code",
    body: "Machi began with one person's quiet observation of city life — and a refusal to let useful information stay scattered. If you would like to meet the person behind it: the path he has walked, the things he has built, and what he is still building today, his own space is open.",
    cta: "Visit yaokai.me",
  },
  ja: {
    eyebrow: "創設者について",
    title: "街の向こうに、コードを書くひとりの人がいる",
    body: "Machi は、ひとりの人の街への観察と、「散らばった情報をこのままにしたくない」という小さな意地から始まりました。その背後にいる人——歩んできた道、つくってきたもの、いま挑んでいること——を知りたい方は、彼の個人サイトへどうぞ。",
    cta: "yaokai.me を訪ねる",
  },
};

function FounderSiteCard({ locale }: { locale: MarketingLocale }) {
  const c = founderSiteCopy[locale] ?? founderSiteCopy.zh;
  return (
    <article className="mc-reveal relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 p-7 text-white shadow-[0_30px_80px_-50px_rgba(79,70,229,0.95)] sm:p-10">
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="relative max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">{c.eyebrow}</p>
        <h2 className="mt-3 text-2xl font-black leading-tight sm:text-3xl">{c.title}</h2>
        <p className="mt-4 text-sm leading-7 text-white/90 sm:text-base">{c.body}</p>
        <a
          href={FOUNDER_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-indigo-700 shadow-[0_18px_46px_-26px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {c.cta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

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
  const { locale, copy } = useMarketingI18n();
  const page = marketingPages[pageId][locale] ?? marketingPages[pageId].zh;

  return (
    <MarketingPageFrame eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
      {page.blocks.map((block, index) => (
        <Fragment key={block.title}>
          <MarketingBlock block={block} openLabel={copy.common.open} />
          {pageId === "about" && index === 0 ? <FounderSection variant="full" inFrame /> : null}
        </Fragment>
      ))}
      {pageId === "about" ? <FounderSiteCard locale={locale} /> : null}
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
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-5 text-sm font-black text-white shadow-[0_18px_46px_-26px_rgba(79,70,229,0.95)] transition hover:-translate-y-0.5"
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
              {item.meta ? <p className="text-[11px] font-black uppercase text-indigo-600 dark:text-sky-300">{item.meta}</p> : null}
              <h3 className="text-base font-black text-slate-950 dark:text-white">
                <BrandPhrase text={item.title} />
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.body}</p>
              {item.href ? (
                <Link href={item.href} className="mt-4 inline-flex items-center gap-1 text-sm font-black text-indigo-700 dark:text-sky-300">
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
