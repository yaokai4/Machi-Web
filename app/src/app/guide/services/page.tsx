// Server component wrapper for the 资料与服务 store page (W2-2). Adds
// generateMetadata so the store is visible to search engines; the interactive
// grid (filters + React Query) lives in the client component. The client's
// header copy (guideUi) renders on the server too, so the SSR first paint
// carries indexable text.

import type { Metadata } from "next";
import ServicesClient from "./ServicesClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "资料与服务商城｜日本升学・就职・JLPT 备考资料与人工服务",
    description:
      "Machi 资料与服务商城：日本升学、就职、JLPT 备考的 PDF 资料、模板、清单与课程，以及简历修改、申请辅导等人工服务，支持会员权益与 Machi 币购买。",
  },
  en: {
    title: "Resources & Services Store | Study, career & JLPT prep materials for Japan",
    description:
      "Machi's store for life in Japan: PDF guides, templates, checklists and courses for study, career and JLPT prep, plus human services like resume review and application coaching.",
  },
  ja: {
    title: "資料・サービスストア｜進学・就職・JLPT 対策の教材と個別サービス",
    description:
      "Machi の資料・サービスストア：進学・就職・JLPT 対策の PDF 教材、テンプレート、チェックリスト、講座に加え、書類添削や申請サポートなどの個別サービスも提供。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/services" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/services`,
      siteName: "Machi",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi" }],
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

export default function GuideServicesPage() {
  return <ServicesClient />;
}
