import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("membership-terms", "legal/membership-terms");
}

export default async function MembershipTermsPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="membership-terms" initialLocale={locale} />;
}
