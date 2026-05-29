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
    title: "Machi City | 在每一座城市，找到生活的回声",
    description:
      "Machi City 是一个按城市组织真实生活经验的城市社区。切换国家和城市，发现当地新闻、租房、二手、工作、约饭、活动、问答和避坑经验。让散落在群聊、社交平台和朋友间的城市信息重新被看见、被找到、被回应。",
    keywords: [
      "Machi City",
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
      "搭子",
      "约饭",
      "避坑",
      "city community",
    ],
  },
  en: {
    title: "Machi City | Find the echoes of life in every city",
    description:
      "Machi City is a city experience network — a community organised by city, language, topic and trust. Discover news, housing, jobs, secondhand, dining, events, Q&A and what to avoid in every city you care about.",
    keywords: [
      "Machi City",
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
    title: "Machi City | すべての街で、暮らしのこだまを見つける",
    description:
      "Machi City は街ごとに整理されたリアル経験のコミュニティです。国と都市を切り替えて、ニュース、住まい、中古、仕事、食事、イベント、Q&A、避けたい落とし穴を発見できます。",
    keywords: [
      "Machi City",
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
      canonical: locale === "zh" ? "/" : `/${locale}`,
      languages: localeAlternates(""),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url:
        locale === "zh"
          ? "https://machicity.com"
          : `https://machicity.com/${locale}`,
      siteName: "Machi City",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "Machi City",
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
    name: "Machi City",
    url: "https://machicity.com",
    description: META[locale].description,
    inLanguage: locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://machicity.com/search?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Machi City",
    url: "https://machicity.com",
    logo: "https://machicity.com/icon.svg",
    slogan: copy.brandStory.title,
    sameAs: ["https://machicity.com"],
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
