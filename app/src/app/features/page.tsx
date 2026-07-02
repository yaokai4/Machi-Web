import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("features", "features");
}

export default async function Page() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="features" initialLocale={locale} />;
}
