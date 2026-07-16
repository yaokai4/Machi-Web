import type { Metadata } from "next";
import { PlacementClient } from "./PlacementClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 能力定级测试 — a mixed-section difficulty ladder that recommends a level
// and links straight into the study-plan generator. Backed by
// /api/guide/jlpt/placement/{start,submit}. Content is original/imported.

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 能力定级测试（免费）｜十几道题测出适合你的 N1-N5 等级",
    description:
      "免费 JLPT 定级测试：十几道混合题型的阶梯难度题，几分钟测出适合你的备考等级（N1-N5），并直接生成对应的学习计划。",
  },
  en: {
    title: "Free JLPT Level Test | Find your N1–N5 level in minutes",
    description:
      "Take a free JLPT placement test: a dozen mixed-section questions on a difficulty ladder recommend your target level (N1–N5) and feed straight into a study plan.",
  },
  ja: {
    title: "JLPT レベル診断テスト（無料）｜数分で N1〜N5 のレベルを判定",
    description:
      "無料の JLPT レベル判定テスト。難易度ラダー式の十数問に答えるだけで、あなたに合った受験レベル（N1〜N5）を提案し、学習プランにつなげます。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/placement" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/placement`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptPlacementPage() {
  return <PlacementClient />;
}
