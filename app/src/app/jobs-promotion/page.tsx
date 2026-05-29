import type { Metadata } from "next";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import { buildSubPageMetadata } from "@/lib/marketing-locale";

export async function generateMetadata(): Promise<Metadata> {
  return buildSubPageMetadata("jobs-promotion", "jobs-promotion");
}

export default function Page() {
  return <LocalizedMarketingPage pageId="jobs-promotion" />;
}
