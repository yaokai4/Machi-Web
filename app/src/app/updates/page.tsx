import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("updates", "updates");
}

export default function UpdatesPage() {
  return <LocalizedMarketingPage pageId="updates" />;
}
