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
    title: "Machi｜在每一座城市，找到生活的回声｜本地生活与同城社交社区",
    description:
      "Machi 是按城市和语言组织的本地生活与同城社交社区，帮助用户发现租房、二手、工作、招聘、活动、约饭、问答、避坑经验和本地服务，也能认识同城朋友、饭搭子、活动搭子和语言交换伙伴。",
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
      "搭子",
      "约饭",
      "避坑",
      "city community",
    ],
  },
  en: {
    title: "Machi | Find the Echoes of Life in Every City | Local Life & Social Community",
    description:
      "Machi is a local life and social community organized by city and language, helping people discover housing, jobs, secondhand deals, events, dining, Q&A, local tips and trusted services — and meet local friends, dining buddies, event companions and language exchange partners.",
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
    title: "Machi｜すべての街で、暮らしの響きを見つける｜ローカル生活・ソーシャルコミュニティ",
    description:
      "Machi は都市と言語で整理されたローカル生活・ソーシャルコミュニティです。住まい、中古、仕事、求人、イベント、食事、Q&A、生活情報、地域サービスを見つけ、同じ街の友達、食事仲間、イベント仲間、言語交換パートナーともつながれます。",
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
      canonical: locale === "zh" ? "/" : `/${locale}`,
      languages: localeAlternates(""),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url:
        locale === "zh"
          ? "https://www.machicity.com/zh"
          : `https://www.machicity.com/${locale}`,
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
