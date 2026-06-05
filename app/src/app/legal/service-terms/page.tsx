import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("service-terms", "legal/service-terms");
}

export default function ServiceTermsPage() {
  return <LocalizedMarketingPage pageId="service-terms" />;
}
