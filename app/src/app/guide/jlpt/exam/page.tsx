import type { Metadata } from "next";
import { ExamClient } from "./ExamClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 在线模考 — list exams, take a timed exam, submit for scoring, and review
// each question. Backed by /api/guide/jlpt/exam/*. Content is original/imported,
// never unauthorized past-paper text.

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 在线模考｜N1-N5 模拟试题・限时判分・逐题解析",
    description:
      "N2 在线模考、N1-N5 全等级模拟试题：开考前明确显示免费或所需 Machi 币与会员价，限时作答、交卷即出参考分并可逐题复盘。原创/授权题目，不含未授权真题原文。",
  },
  en: {
    title: "JLPT Online Mock Exams | Timed N1–N5 practice tests with scoring",
    description:
      "Take timed JLPT mock exams for N1–N5. Free or Machi Coin access and member pricing are shown before you start; submit for a reference score and per-question review. Original/licensed questions only.",
  },
  ja: {
    title: "JLPT オンライン模擬試験｜N1〜N5 採点・解説つき模試",
    description:
      "N1〜N5 の JLPT 模擬試験。無料または必要な Machi コイン・会員価格を開始前に明示し、提出後は参考スコアと一問ごとの解説を確認できます。オリジナル/許諾済み問題のみ使用。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/exam" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/exam`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptExamPage() {
  return <ExamClient />;
}
