import type { Metadata } from "next";
import { VocabClient } from "./VocabClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 高频单词 — vocab decks (member-gated content), per-word 掌握 marking, and
// a 考单词 online quiz. Backed by /api/guide/jlpt/vocab/*. Content is
// original/imported, never unauthorized past-paper text.

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 高频单词表｜N1-N5 词汇背诵与在线单词测验",
    description:
      "按 N1-N5 等级背 JLPT 高频单词：读音、释义、例句齐全，支持逐词标记掌握进度，并可用「考单词」在线测验巩固记忆。",
  },
  en: {
    title: "JLPT Vocabulary Lists | N1–N5 word decks with readings & online quizzes",
    description:
      "Study JLPT vocabulary by level (N1–N5): word decks with readings, meanings and example sentences, per-word mastery tracking, and an online vocab quiz.",
  },
  ja: {
    title: "JLPT 頻出単語｜N1〜N5 単語帳と単語テスト",
    description:
      "N1〜N5 の JLPT 頻出単語を単語帳で学習。読み・意味・例文つきで、習得マークと「単語テスト」で定着度をオンラインで確認できます。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/vocab" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/vocab`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptVocabPage() {
  return <VocabClient />;
}
