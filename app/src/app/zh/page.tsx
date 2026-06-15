import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi｜在每一座城市，找到生活的回声";
const description =
  "Machi 按城市和语言，整理租房、手续、求职、二手、本地服务、问答与真实经验。先把日本市场做透，再走向韩国、澳洲、加拿大、美国、英国等城市。";

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
