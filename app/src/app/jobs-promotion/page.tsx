import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata, resolveMarketingLocale } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("jobs-promotion", "jobs-promotion");
}

export default async function Page() {
  const locale = await resolveMarketingLocale();
  return <LocalizedMarketingPage pageId="jobs-promotion" initialLocale={locale} />;
}
