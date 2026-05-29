import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("features", "features");
}

export default function Page() {
  return <LocalizedMarketingPage pageId="features" />;
}
