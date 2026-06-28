import type { Metadata } from "next";
import GuideHomeClient from "./GuideHomeClient";
import { localeAlternates, resolveMarketingLocale } from "@/lib/marketing-locale";
import type { GuideHomeResponse } from "@/lib/guide";

export const dynamic = "force-dynamic";

const META = {
  zh: {
    title: "Machi AI｜日本生活・升学・就职 智能助手与指南",
    description:
      "Machi AI 是 Machi 的原创智能助手：用对话解决在日本生活、升学、就职的问题，并查阅日本学校库、外国人就职公司库与指南文章。",
  },
  en: {
    title: "Machi AI | Your Japan life, study & work assistant",
    description:
      "Machi AI is Machi's original assistant — ask anything about living, studying, and working in Japan, and browse the Japan school library, company library, and guides.",
  },
  ja: {
    title: "Machi AI｜日本の生活・進学・就職アシスタント",
    description:
      "Machi AI は Machi のオリジナルアシスタント。日本での生活・進学・就職を対話で解決し、学校データベース・企業データベース・ガイド記事も閲覧できます。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: "/guide",
      languages: localeAlternates("guide"),
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: "https://www.machicity.com/guide",
      siteName: "Machi",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi AI" }],
      locale: locale === "zh" ? "zh_CN" : locale === "ja" ? "ja_JP" : "en_US",
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

export default async function GuideHomePage() {
  const locale = await resolveMarketingLocale();
  const language = locale === "ja" ? "ja" : locale === "en" ? "en" : "zh-CN";
  const initialHome = await loadPublicGuideHome(language) ?? guestGuideFallback(language);
  const meta = META[locale] ?? META.zh;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Machi AI",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS",
    url: "https://www.machicity.com/guide",
    description: meta.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <GuideHomeClient initialHome={initialHome} />
    </>
  );
}

async function loadPublicGuideHome(language: string): Promise<GuideHomeResponse | undefined> {
  const base = process.env.KAIX_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/guide/home?country=jp&language=${encodeURIComponent(language)}`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) },
    );
    if (!response.ok) return undefined;
    return await response.json() as GuideHomeResponse;
  } catch {
    return undefined;
  }
}

function guestGuideFallback(language: string): GuideHomeResponse {
  const lang = language === "ja" ? "ja" : language === "en" ? "en" : "zh";
  const copy = {
    zh: {
      hero: ["今日", "把今天最重要的事情完成。", "先行动，再在需要时查升学、就职、日语、日本生活和服务。"],
      categories: [
        ["study_japan", "日本升学", "大学院・专门学校・编入", "大学院、专门学校、学部编入、研究计划书、教授联系和出愿材料。", "graduation", "#2563EB", 8, 10],
        ["career_japan", "日本就职", "就活・履历书・面试・内定", "日本求职流程、履历书、ES、面试、内定、签证变更和行业选择。", "briefcase", "#0F8798", 12, 12],
        ["study_abroad_japan", "留学申请", "语言学校・签证・入境", "语言学校、留学材料、签证、入境准备、费用和申请流程。", "plane", "#7C3AED", 8, 4],
        ["jlpt", "日语考级", "JLPT N5-N1・词汇语法", "JLPT N5-N1、词汇、语法、阅读、听力、学习计划和资料包。", "language", "#DB2777", 8, 15],
        ["life_japan", "日本生活", "在留卡・役所・租房・打工", "在留卡、役所手续、租房、打工、银行卡、手机卡、保险和生活避坑。", "home", "#15976B", 12, 11],
        ["guide_services", "资料与服务", "资料包・模板・咨询辅导", "资料包、模板、课程、咨询、简历修改、研究计划书修改和申请辅导。", "package", "#D97706", 8, 24],
      ],
      resources: [
        ["japan_schools", "日本学校库", "查找日本大学、大学院、专门学校、语言学校和留学生申请信息。", "school", "/guide/schools"],
        ["foreigner_friendly_companies", "外国人就职公司库", "查找适合外国人就职的日本公司、行业、岗位、面试经验和工作评价。", "building", "/guide/companies"],
      ],
      journeys: [
        ["jlpt", "JLPT N1", "把学习安排拆成今日 Todo 和考试倒数。", "language", "#DB2777"],
        ["job_hunting", "2027 新卒就职", "统一管理 ES、笔试、面试和 Offer。", "briefcase", "#0F8798"],
        ["visa", "在留资格更新", "记录到期日并提前安排材料和提醒。", "document", "#6366F1"],
      ],
    },
    ja: {
      hero: ["今日", "今日いちばん大事なことを終わらせる。", "まず行動し、必要な時に進学・就職・日本語・生活・サービスを調べます。"],
      categories: [
        ["study_japan", "日本進学", "大学院・専門学校・編入", "大学院、専門学校、編入、研究計画書、教授連絡、出願資料。", "graduation", "#2563EB", 8, 10],
        ["career_japan", "日本就職", "就活・履歴書・面接・内定", "就活、履歴書、ES、面接、内定、在留資格変更、業界選び。", "briefcase", "#0F8798", 12, 12],
        ["study_abroad_japan", "留学申請", "語学学校・ビザ・入国", "語学学校、留学資料、ビザ、入国準備、費用と申請。", "plane", "#7C3AED", 8, 4],
        ["jlpt", "日本語試験", "JLPT N5-N1・語彙文法", "JLPT、語彙、文法、読解、聴解、学習計画と教材。", "language", "#DB2777", 8, 15],
        ["life_japan", "日本生活", "在留カード・役所・住まい", "在留カード、役所、住まい、仕事、銀行、携帯、保険。", "home", "#15976B", 12, 11],
        ["guide_services", "資料・サービス", "教材・テンプレート・相談", "教材、テンプレート、講座、相談、書類添削、申請サポート。", "package", "#D97706", 8, 24],
      ],
      resources: [
        ["japan_schools", "日本の学校データベース", "大学、大学院、専門学校、語学学校と留学生向け出願情報を検索。", "school", "/guide/schools"],
        ["foreigner_friendly_companies", "外国人向け企業データベース", "外国人採用企業、業界、求人、面接体験、職場評価を検索。", "building", "/guide/companies"],
      ],
      journeys: [
        ["jlpt", "JLPT N1", "学習を今日のTodoと試験カウントダウンに分けます。", "language", "#DB2777"],
        ["job_hunting", "2027 新卒就職", "ES、Webテスト、面接、内定を一元管理。", "briefcase", "#0F8798"],
        ["visa", "在留資格更新", "期限を登録し、資料とリマインダーを準備。", "document", "#6366F1"],
      ],
    },
    en: {
      hero: ["Today", "Finish what matters today.", "Act first, then find study, career, Japanese, life, and service guidance when needed."],
      categories: [
        ["study_japan", "Study in Japan", "Graduate and vocational schools", "Admissions, research proposals, professor outreach, and application documents.", "graduation", "#2563EB", 8, 10],
        ["career_japan", "Careers in Japan", "Job search, resumes, interviews", "Japanese job search, ES, interviews, offers, visa changes, and industries.", "briefcase", "#0F8798", 12, 12],
        ["study_abroad_japan", "Study Abroad", "Language schools, visa, arrival", "Language schools, documents, visa, arrival preparation, costs, and applications.", "plane", "#7C3AED", 8, 4],
        ["jlpt", "Japanese Exams", "JLPT N5-N1 and study plans", "Vocabulary, grammar, reading, listening, study plans, and resources.", "language", "#DB2777", 8, 15],
        ["life_japan", "Life in Japan", "Residence, city hall, housing", "Residence procedures, housing, work, banking, mobile, insurance, and daily life.", "home", "#15976B", 12, 11],
        ["guide_services", "Resources & Services", "Packs, templates, coaching", "Resources, templates, courses, coaching, document review, and application support.", "package", "#D97706", 8, 24],
      ],
      resources: [
        ["japan_schools", "Japan School Library", "Search universities, graduate, vocational, and language schools.", "school", "/guide/schools"],
        ["foreigner_friendly_companies", "Foreigner-Friendly Companies", "Search employers, industries, roles, interviews, and workplace reviews.", "building", "/guide/companies"],
      ],
      journeys: [
        ["jlpt", "JLPT N1", "Turn study into today's todos and an exam countdown.", "language", "#DB2777"],
        ["job_hunting", "2027 New Graduate", "Manage ES, tests, interviews, and offers together.", "briefcase", "#0F8798"],
        ["visa", "Residence Renewal", "Track expiry and prepare documents and reminders.", "document", "#6366F1"],
      ],
    },
  }[lang];

  const categories = copy.categories.map(([key, title, subtitle, description, icon, color, articleCount, productCount], index) => ({
    id: `guest-${key}`,
    key: String(key),
    parentKey: "",
    title: String(title),
    subtitle: String(subtitle),
    description: String(description),
    icon: String(icon),
    color: String(color),
    country: "jp",
    language,
    sortOrder: index + 1,
    articleCount: Number(articleCount),
    productCount: Number(productCount),
    isActive: true,
    subCategories: [],
  }));
  const journeys = copy.journeys.map(([key, title, subtitle, icon, color], index) => ({
    id: `guest-${key}`,
    key: String(key),
    country: "jp",
    language,
    title: String(title),
    subtitle: String(subtitle),
    audience: "",
    icon: String(icon),
    color: String(color),
    heroTitle: String(title),
    heroSubtitle: String(subtitle),
    estimatedDays: 30,
    sortOrder: index + 1,
    status: "published",
    stepCount: 0,
  }));
  const resourceEntries = copy.resources.map(([key, title, description, icon, href]) => ({
    key: String(key),
    title: String(title),
    description: String(description),
    icon: String(icon),
    href: String(href),
  }));

  return {
    status: "ok",
    country: "jp",
    language,
    hero: {
      title: copy.hero[0],
      subtitle: copy.hero[1],
      note: copy.hero[2],
      searchPlaceholder: "",
      quickTags: [],
    },
    categories,
    resourceEntries,
    goals: { title: copy.hero[0], entries: [] },
    goalEntries: [],
    journeys,
    featuredArticles: [],
    featuredProducts: [],
    featuredServices: [],
    featuredSchools: [],
    companyHighlights: [],
    latestArticles: [],
    faq: [],
  };
}
