import type { Metadata } from "next";
import GuideHomeClient from "./GuideHomeClient";
import { localeAlternates, resolveMarketingLocale } from "@/lib/marketing-locale";

const META = {
  zh: {
    title: "Machi Guide｜从日本开始的城市生活指南",
    description:
      "Machi Guide 是 Machi 的城市知识层，先从日本生活、升学、就职、JLPT、学校库、公司库、资料与服务开始，并逐步扩展到更多国家和城市。",
  },
  en: {
    title: "Machi Guide | City-life guides starting with Japan",
    description:
      "Machi Guide is the city knowledge layer of Machi, starting with Japan life, study, career, JLPT, school directories, company directories, materials and services, then expanding to more countries and cities.",
  },
  ja: {
    title: "Machi Guide｜日本から始まる都市生活ガイド",
    description:
      "Machi Guide は Machi の都市知識レイヤーです。日本生活、進学、就職、JLPT、学校データベース、会社データベース、資料、サービスから始まり、より多くの国と都市へ広がります。",
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

export default function GuideHomePage() {
  return <GuideHomeClient />;
}
