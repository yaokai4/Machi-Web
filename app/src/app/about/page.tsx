import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("about", "about");
}

export default async function AboutPage() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="about" initialLocale={locale} />;
}
