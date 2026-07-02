import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("commercial-disclosure", "legal/commercial-disclosure");
}

export default async function CommercialDisclosurePage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="commercial-disclosure" initialLocale={locale} />;
}
