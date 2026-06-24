import type { Metadata } from "next";
import GuideHomeClient from "./GuideHomeClient";
import { localeAlternates, resolveMarketingLocale } from "@/lib/marketing-locale";
import type { GuideHomeResponse } from "@/lib/guide";

export const dynamic = "force-dynamic";

const META = {
  zh: {
    title: "Machi Guide｜今日待办、日历与日本生活管理",
    description:
      "Machi Guide 是面向在日用户的个人行动中心：统一管理 Todo、日历、申请、ES、面试、JLPT、房租、水电、合同、证件到期和资料服务。",
  },
  en: {
    title: "Machi Guide | Today, tasks, calendar, and Japan life management",
    description:
      "Machi Guide is a personal action center for Japan life: todos, calendar, applications, interviews, JLPT, rent, utilities, contracts, document expiry, resources, and services.",
  },
  ja: {
    title: "Machi Guide｜今日のTodo、カレンダー、日本生活管理",
    description:
      "Machi Guide は日本生活のための行動センターです。Todo、カレンダー、出願、ES、面接、JLPT、家賃、公共料金、契約、証件期限、資料とサービスを管理できます。",
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
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi Guide" }],
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
  const initialHome = await loadPublicGuideHome(language);
  const meta = META[locale] ?? META.zh;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Machi Guide",
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
