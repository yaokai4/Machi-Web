import type { Metadata } from "next";
import { ReviewClient } from "./ReviewClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 错题本 — questions whose latest attempt was wrong, with answers +
// explanations revealed and member AI 讲解. Backed by /api/guide/jlpt/review.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 错题本｜答错的题集中复盘,配 AI 逐题讲解",
    description:
      "自动收集你最近答错、还没重新答对的 JLPT 题目,按 N1-N5 等级筛选,逐题查看解析并可用 Machi AI 讲解,把弱点一个个清掉。",
  },
  en: {
    title: "JLPT Review Book | Revisit your wrong answers with AI explanations",
    description:
      "Your recent wrong JLPT answers in one place, filterable by N1–N5, each with explanations and optional Machi AI walkthroughs — clear your weak spots one by one.",
  },
  ja: {
    title: "JLPT 間違いノート｜間違えた問題を AI 解説つきで復習",
    description:
      "最近間違えてまだ正解していない JLPT 問題を自動で集約。N1〜N5 で絞り込み、解説と Machi AI の解説で弱点を一つずつ潰せます。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/review" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/review`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptReviewPage() {
  return <ReviewClient />;
}
