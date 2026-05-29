import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("about", "about");
}

export default function AboutPage() {
  return <LocalizedMarketingPage pageId="about" />;
}
