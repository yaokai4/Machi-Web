import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("faq", "faq");
}

export default async function FAQPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="faq" initialLocale={locale} />;
}
