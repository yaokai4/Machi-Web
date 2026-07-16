import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticeClient } from "./PracticeClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 刷题练习 — pick a level + section, drill questions with instant grading
// and explanations, plus member AI 逐题讲解. Backed by
// /api/guide/jlpt/{practice,attempt,explain}. Content is original/imported.

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 在线刷题练习｜N1-N5 词汇・语法・读解 免费练习题",
    description:
      "按 N1-N5 等级与题型（文字词汇/语法/读解）在线刷 JLPT 练习题，答完即时判分并附解析，支持 AI 逐题讲解与错题本复习。",
  },
  en: {
    title: "JLPT Practice Questions Online | Free N1–N5 vocabulary, grammar & reading drills",
    description:
      "Drill JLPT practice questions by level (N1–N5) and section — vocabulary, grammar, reading — with instant grading, explanations, AI walkthroughs and a review book.",
  },
  ja: {
    title: "JLPT 問題演習（無料）｜N1〜N5 語彙・文法・読解のオンライン練習",
    description:
      "N1〜N5 のレベルと分野（文字語彙・文法・読解）を選んで JLPT の練習問題に挑戦。即時採点・解説つき、AI 解説と間違いノートにも対応。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/practice" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/practice`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptPracticePage() {
  return (
    <Suspense>
      <PracticeClient />
    </Suspense>
  );
}
