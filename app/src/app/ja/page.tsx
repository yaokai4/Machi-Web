import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi｜どの街でも、暮らしの声を見つける";
const description =
  "Machi は街と言語ごとに、住まい、手続き、仕事、譲り合い、地域サービス、Q&A、実体験を整理します。まず日本から丁寧につくり、韓国、オーストラリア、カナダ、米国、英国へ広げていきます。";

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
    url: "https://www.machicity.com/ja",
    siteName: "Machi",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi" }],
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
    name: "Machi",
    url: "https://www.machicity.com/ja",
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
