import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi City | すべての街で、暮らしのこだまを見つける";
const description =
  "Machi City は、国・都市・コンテンツ言語でつながるローカルライフプラットフォームです。ニュース、生活ガイド、賃貸、中古品、仕事、求人、イベント、Q&A、ローカルサービス、クーポン、話題の投稿を見つけられます。";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/ja",
    languages: localeAlternates(""),
  },
  openGraph: {
    title,
    description,
    url: "https://machicity.com/ja",
    siteName: "Machi City",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi City" }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default function JapaneseLandingPage() {
  const copy = marketingCopy.ja;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Machi City",
    url: "https://machicity.com/ja",
    description,
    inLanguage: "ja-JP",
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
        <MarketingLocaleProvider initialLocale="ja" preferClientLocale={false}>
          <MarketingPageContent />
        </MarketingLocaleProvider>
      </main>
    </>
  );
}
