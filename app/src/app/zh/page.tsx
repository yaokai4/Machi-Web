import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi｜让陌生的城市，也有生活的门路";
const description =
  "Machi 按城市和语言，整理租房、生活手续、求职、二手、本地服务、问答与真实经验。先从日本开始，让刚来的人少走弯路，也让住久的人把有用的事留给后来者。";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/zh",
    languages: localeAlternates(""),
  },
  openGraph: {
    title,
    description,
    url: "https://www.machicity.com/zh",
    siteName: "Machi",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi" }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default function ChineseLandingPage() {
  const copy = marketingCopy.zh;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Machi",
    url: "https://www.machicity.com/zh",
    description,
    inLanguage: "zh-CN",
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <main
        id="top"
        className="machi-site min-h-screen overflow-x-hidden text-slate-950 transition-colors duration-300 dark:text-slate-100"
        aria-label={copy.hero.eyebrow}
      >
        <MarketingLocaleProvider initialLocale="zh" preferClientLocale={false}>
          <MarketingPageContent />
        </MarketingLocaleProvider>
      </main>
    </>
  );
}
