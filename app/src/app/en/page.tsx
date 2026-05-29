import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingI18n";
import { MarketingPageContent } from "@/components/marketing/MarketingPageContent";
import { marketingCopy } from "@/data/machi-home";
import { localeAlternates } from "@/lib/marketing-locale";

const title = "Machi City | Find the echoes of life in every city";
const description =
  "Machi City is a local city life platform organized by country, city, and content language. Discover local news, guides, housing, jobs, secondhand items, events, services, deals, and what is trending nearby.";

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
    url: "https://machicity.com/en",
    siteName: "Machi City",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi City" }],
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
    name: "Machi City",
    url: "https://machicity.com/en",
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
