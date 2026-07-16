import type { Metadata } from "next";
import { JLPTZoneClient } from "./JLPTZoneClient";
import type { GuideJlptZone } from "@/lib/guide";
import { guideLanguageForLocale } from "@/lib/server/guidePrefetch";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// 日语考级 is now a dedicated 备考专区 (JLPT prep hub): N5–N1 levels,
// member-priced resources/mock tests, roadmap articles, FAQ, and a study-plan
// CTA — backed by /api/guide/jlpt. (JLPT 备考的循环任务仍由「管理 → 目标/路径」
// 里的 JLPT 路径模板生成,专区页只做浏览与入口。)
// W2-2: server wrapper adds generateMetadata + an anonymous zone prefetch so
// crawlers get a real SSR first paint instead of a loading spinner.

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 在线备考专区｜免费定级测试・刷题练习・在线模考（N1-N5）",
    description:
      "Machi JLPT 备考专区：免费能力定级测试、N1-N5 刷题练习、高频单词、在线模考与错题本，即时判分与解析，配套备考资料与学习计划。",
  },
  en: {
    title: "JLPT Prep Hub | Free level test, practice drills & online mock exams (N1–N5)",
    description:
      "Machi's JLPT prep hub: a free placement test, N1–N5 practice drills, vocabulary decks, timed online mock exams and a review book — instant grading and explanations.",
  },
  ja: {
    title: "JLPT 対策｜無料レベル判定・問題演習・オンライン模擬試験（N1〜N5）",
    description:
      "Machi の JLPT 対策ページ：無料レベル判定テスト、N1〜N5 の問題演習、頻出単語、時間制限つきオンライン模擬試験と間違いノート。即時採点・解説つき。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt`,
      siteName: "Machi",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi JLPT" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-image.png"],
    },
  };
}

// Best-effort anonymous prefetch of the zone payload (public fields only —
// streak/countdown need auth and stay client-fetched). Null on any error so
// the client silently falls back to its normal loading path.
async function loadZone(language: string): Promise<GuideJlptZone | undefined> {
  const base = process.env.KAIX_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/guide/jlpt?country=jp&language=${encodeURIComponent(language)}`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return undefined;
    return (await res.json()) as GuideJlptZone;
  } catch {
    return undefined;
  }
}

export default async function JlptPage() {
  const locale = await resolveMarketingLocale();
  const initialZone = await loadZone(guideLanguageForLocale(locale));
  return <JLPTZoneClient initialZone={initialZone} />;
}
