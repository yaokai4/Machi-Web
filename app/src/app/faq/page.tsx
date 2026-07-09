import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { marketingPages } from "@/data/marketing-pages";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("faq", "faq");
}

// Build FAQPage JSON-LD from the very copy that renders below, so the dedicated
// /faq landing page becomes eligible for Google's FAQ rich results (previously
// only the homepage FAQSection carried this markup). Every Q&A item in the
// localized marketing FAQ becomes a Question/Answer pair, keeping the structured
// data and the visible accordion in lockstep (a Google requirement).
export default async function FAQPage() {
  const locale = await resolveMarketingLocale();
  const page = marketingPages.faq[locale] ?? marketingPages.faq.zh;
  const mainEntity = page.blocks.flatMap((block) =>
    (block.items ?? []).map((item) => ({
      "@type": "Question",
      name: item.title,
      acceptedAnswer: { "@type": "Answer", text: item.body },
    })),
  );
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US",
    mainEntity,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
      />
      <LocalizedMarketingPage pageId="faq" initialLocale={locale} />
    </>
  );
}
