import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import {
  DEFAULT_LOCALE,
  localeAlternates,
  resolveMarketingLocale,
} from "@/lib/marketing-locale";

// All three locales share the same `/` route so existing visitors and
// inbound links keep working. The server resolves the right locale
// from the cookie / Accept-Language and pre-renders the matching copy.
// SEO-distinct copies live at /en and /ja.

const META: Record<"zh" | "en" | "ja", { title: string; description: string; keywords: string[] }> = {
  zh: {
    title: "Machi｜在每一座城市，找到生活的回声",
    description:
      "Machi 按城市和语言，整理租房、手续、求职、二手、本地服务、问答与真实经验。先把日本市场做透，再走向韩国、澳洲、加拿大、美国、英国等城市。",
    keywords: [
      "Machi",
      "Machi",
      "城市社区",
      "城市经验",
      "城市生活",
      "海外生活",
      "日本生活",
      "东京生活",
      "租房",
      "二手",
      "找工作",
      "招聘",
      "本地小组",
      "美食讨论",
      "避坑",
      "city community",
    ],
  },
  en: {
    title: "Machi | Find the echoes of real life in every city",
    description:
      "Machi organizes housing, paperwork, jobs, secondhand exchange, local services, Q&A, and lived experience by city and language. We are starting in Japan, then expanding to Korea, Australia, Canada, the United States, and the United Kingdom.",
    keywords: [
      "Machi",
      "Machi",
      "city community",
      "city experience",
      "expat life",
      "Japan life",
      "Tokyo life",
      "housing",
      "secondhand",
      "jobs",
      "hiring",
      "meetup",
      "events",
      "real experience",
    ],
  },
  ja: {
    title: "Machi｜どの街でも、暮らしの声を見つける",
    description:
      "Machi は街と言語ごとに、住まい、手続き、仕事、譲り合い、地域サービス、Q&A、実体験を整理します。まず日本から丁寧につくり、韓国、オーストラリア、カナダ、米国、英国へ広げていきます。",
    keywords: [
      "Machi",
      "Machi",
      "街のコミュニティ",
      "海外生活",
      "東京生活",
      "賃貸",
      "中古",
      "求人",
      "仕事",
      "イベント",
      "リアル経験",
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale];
  return {
    title: { absolute: meta.title },
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      // Self-canonicalize to the LOCALE-PREFIXED URL (/zh, /en, /ja) so the
      // canonical is always a member of this page's own hreflang cluster
      // (which lists /zh, /en, /ja + x-default) and stays stable per URL
      // instead of shifting with Accept-Language. This mirrors the sub-page
      // strategy in buildSubPageMetadata and de-dupes "/" ⇄ /zh|/en|/ja.
      canonical: `/${locale}`,
      languages: localeAlternates(""),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      // Match the canonical: one stable locale-prefixed URL per language.
      url: `https://www.machicity.com/${locale}`,
      siteName: "Machi",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "Machi",
        },
      ],
      locale: locale === "zh" ? "zh_CN" : locale === "ja" ? "ja_JP" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-image.png"],
    },
  };
}

export default async function LandingPage() {
  const locale = await resolveMarketingLocale();
  const copy = marketingCopy[locale] ?? marketingCopy[DEFAULT_LOCALE];
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Machi",
    url: "https://www.machicity.com",
    description: META[locale].description,
    inLanguage: locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.machicity.com/search?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Machi",
    url: "https://www.machicity.com",
    logo: "https://www.machicity.com/icon.svg",
    slogan: copy.brandStory.title,
    founder: {
      "@type": "Person",
      name: "Yao Kai / YAOKAI",
      jobTitle: "Founder",
    },
    sameAs: ["https://www.machicity.com"],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
      <main
        id="top"
        className="machi-site min-h-screen overflow-x-hidden text-slate-950 transition-colors duration-300 dark:text-slate-100"
      >
        <MarketingLocaleProvider initialLocale={locale}>
          <MarketingPageContent />
        </MarketingLocaleProvider>
      </main>
    </>
  );
}
