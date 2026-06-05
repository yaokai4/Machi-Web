import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("cookie-policy", "legal/cookie-policy");
}

export default function CookiePolicyPage() {
  return <LocalizedMarketingPage pageId="cookie-policy" />;
}
