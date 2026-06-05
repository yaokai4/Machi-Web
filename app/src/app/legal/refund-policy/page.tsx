import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("refund-policy", "legal/refund-policy");
}

export default function RefundPolicyPage() {
  return <LocalizedMarketingPage pageId="refund-policy" />;
}
