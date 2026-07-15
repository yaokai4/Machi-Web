import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("fund-settlement-act", "legal/fund-settlement-act");
}

export default async function FundSettlementActPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="fund-settlement-act" initialLocale={locale} />;
}
