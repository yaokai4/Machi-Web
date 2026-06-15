import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi | Find the echoes of real life in every city";
const description =
  "Machi organizes housing, paperwork, jobs, secondhand exchange, local services, Q&A, and lived experience by city and language. We are starting in Japan, then expanding to Korea, Australia, Canada, the United States, and the United Kingdom.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/en",
    languages: localeAlternates(""),
  },
  openGraph: {
    title,
    description,
    url: "https://www.machicity.com/en",
    siteName: "Machi",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export default function EnglishLandingPage() {
  const copy = marketingCopy.en;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Machi",
    url: "https://www.machicity.com/en",
    description,
    inLanguage: "en-US",
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
        <MarketingLocaleProvider initialLocale="en" preferClientLocale={false}>
          <MarketingPageContent />
        </MarketingLocaleProvider>
      </main>
    </>
  );
}
