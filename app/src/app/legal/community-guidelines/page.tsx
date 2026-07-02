import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("community-guidelines", "legal/community-guidelines");
}

export default async function CommunityGuidelinesPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="community-guidelines" initialLocale={locale} />;
}
