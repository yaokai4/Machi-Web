import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("refund-policy", "legal/refund-policy");
}

export default async function RefundPolicyPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="refund-policy" initialLocale={locale} />;
}
