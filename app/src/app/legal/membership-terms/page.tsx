import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("membership-terms", "legal/membership-terms");
}

export default function MembershipTermsPage() {
  return <LocalizedMarketingPage pageId="membership-terms" />;
}
