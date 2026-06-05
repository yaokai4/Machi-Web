import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("community-guidelines", "legal/community-guidelines");
}

export default function CommunityGuidelinesPage() {
  return <LocalizedMarketingPage pageId="community-guidelines" />;
}
