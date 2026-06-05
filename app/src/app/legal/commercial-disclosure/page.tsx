import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("commercial-disclosure", "legal/commercial-disclosure");
}

export default function CommercialDisclosurePage() {
  return <LocalizedMarketingPage pageId="commercial-disclosure" />;
}
