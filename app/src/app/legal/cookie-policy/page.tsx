import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("cookie-policy", "legal/cookie-policy");
}

export default async function CookiePolicyPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="cookie-policy" initialLocale={locale} />;
}
