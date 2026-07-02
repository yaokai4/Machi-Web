import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("service-terms", "legal/service-terms");
}

export default async function ServiceTermsPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="service-terms" initialLocale={locale} />;
}
