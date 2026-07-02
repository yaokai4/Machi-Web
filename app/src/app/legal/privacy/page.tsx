import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("privacy", "legal/privacy");
}

export default async function Page() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="privacy" initialLocale={locale} />;
}
