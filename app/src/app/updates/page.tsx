import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("updates", "updates");
}

export default async function UpdatesPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="updates" initialLocale={locale} />;
}
