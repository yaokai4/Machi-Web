import type { Metadata } from "next";
import { ExamDatesClient } from "./ExamDatesClient";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

// JLPT 考试日历 — the public official schedule (plain dates only) plus a
// countdown to the next sitting. Backed by /api/guide/jlpt/exam-dates.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const META = {
  zh: {
    title: "JLPT 考试日历｜日本考区日程与倒计时",
    description:
      "日本地区 JLPT 公开考试日程一览:考试日、报名窗口与距下次开考的倒计时。具体报名时间与考点请以 JLPT 官方最新公告为准。",
  },
  en: {
    title: "JLPT Exam Dates | Japan schedule & countdown",
    description:
      "The public JLPT schedule for Japan at a glance: exam days, registration windows, and a countdown to the next sitting. Always confirm details with official JLPT announcements.",
  },
  ja: {
    title: "JLPT 試験日程｜日本会場のスケジュールとカウントダウン",
    description:
      "日本地域の JLPT 公開日程を一覧で。試験日・申込期間・次回試験までのカウントダウン。詳細は JLPT 公式の最新発表をご確認ください。",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const meta = META[locale] ?? META.zh;
  return {
    title: { absolute: `${meta.title} | Machi` },
    description: meta.description,
    alternates: { canonical: "/guide/jlpt/exam-dates" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `${SITE}/guide/jlpt/exam-dates`,
      siteName: "Machi",
      type: "website",
    },
    twitter: { card: "summary", title: meta.title, description: meta.description },
  };
}

export default function JlptExamDatesPage() {
  return <ExamDatesClient />;
}
