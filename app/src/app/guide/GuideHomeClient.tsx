"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { guide, type GuideHomeResponse } from "@/lib/guide";
import { MachiAIMark } from "@/components/brand/MachiAIMark";
import {
  CategoryCard,
  GuideShell,
  GuideComingSoon,
  ResourceEntryCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

// Machi AI 是这个版块的主卖场:首页头部是 AI 对话入口,下面保留六大指南、
// 学校库与公司库。个人行动类工具(待办/日历/记账/申请/合同/证件/路径)已和 iOS
// 一致地移到「我的工作台」(/my/features),这里只留一个轻入口。

const SUPPORT_CATEGORY_KEYS = [
  "study_japan",
  "career_japan",
  "study_abroad_japan",
  "jlpt",
  "life_japan",
  "guide_services",
];

function pick(locale: string, zh: string, ja: string, en: string): string {
  if (locale.startsWith("ja")) return ja;
  if (locale.startsWith("en")) return en;
  return zh;
}

const HERO_SUGGESTIONS: Record<"zh" | "ja" | "en", string[]> = {
  zh: [
    "在留卡快到期了，我该怎么续？",
    "想考 JLPT N2，怎么安排复习？",
    "在日本租房要准备哪些材料？",
    "新卒就职的时间线是怎样的？",
  ],
  ja: [
    "在留カードの更新はどうすればいい？",
    "JLPT N2 に向けた勉強計画は？",
    "日本で部屋を借りる時の必要書類は？",
    "新卒就活のスケジュールは？",
  ],
  en: [
    "How do I renew my residence card?",
    "How should I prepare for JLPT N2?",
    "What documents do I need to rent in Japan?",
    "What's the new-grad job-hunting timeline?",
  ],
};

export default function GuideHomeClient({ initialHome }: { initialHome?: GuideHomeResponse }) {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);

  const home = useQuery({
    queryKey: ["guide", "home", country, language],
    queryFn: () => guide.home(country, language),
    initialData: country === "jp" ? initialHome : undefined,
    initialDataUpdatedAt: initialHome ? Date.now() : undefined,
    staleTime: 60_000,
  });

  const supportCategories = useMemo(() => {
    const categories = (home.data?.categories || []).filter((category) => !category.parentKey);
    return SUPPORT_CATEGORY_KEYS
      .map((key) => categories.find((category) => category.key === key))
      .filter((category): category is NonNullable<typeof category> => Boolean(category));
  }, [home.data?.categories]);

  if (home.isLoading) {
    return (
      <GuideShell>
        <HomeSkeleton />
      </GuideShell>
    );
  }
  if (home.isError || !home.data) {
    return (
      <GuideShell>
        <div className="px-4 py-8 sm:px-7">
          <ErrorState title="Machi AI 加载失败" subtitle="请稍后重试。" onRetry={() => home.refetch()} />
        </div>
      </GuideShell>
    );
  }
  if (home.data.status === "coming_soon") {
    return (
      <GuideShell>
        <GuideComingSoon empty={home.data.emptyState} />
      </GuideShell>
    );
  }

  return (
    <GuideShell>
      <main className="space-y-8 px-4 py-6 sm:px-7">
        <MachiAIHero locale={locale} />

        <section>
          <SectionHeading
            title={pick(locale, "六大指南与资料", "6つのガイドと資料", "Six guides & resources")}
            subtitle={pick(
              locale,
              "查方法、学校、就职信息，或购买资料与服务，从这里进入。",
              "方法・学校・就職情報の確認、資料やサービスの購入はこちらから。",
              "Find methods, schools, and job info, or buy resources and services.",
            )}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {supportCategories.map((category) => (
              <CategoryCard key={category.key} category={category} />
            ))}
          </div>
        </section>

        {(home.data.resourceEntries || []).length ? (
          <section>
            <SectionHeading
              title={pick(locale, "学校与公司资料库", "学校・企業データベース", "School & company library")}
              subtitle={pick(
                locale,
                "查询大学、大学院、专门学校、语言学校，以及适合外国人就职的日本公司。",
                "大学・大学院・専門学校・語学学校、外国人採用の日本企業を検索。",
                "Browse universities, graduate, vocational, and language schools, plus foreigner-friendly employers.",
              )}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {(home.data.resourceEntries || []).map((entry) => (
                <ResourceEntryCard key={entry.key} entry={entry} />
              ))}
            </div>
          </section>
        ) : null}

        <GuideWorkbenchCTA locale={locale} />
      </main>
    </GuideShell>
  );
}

// 主卖场:Machi AI 纯入口卡。不再有输入框——整块是「入口」,点进去才到聊天页
// /guide/ai;示例问题是快捷入口,带着问题进入。彩色 logo + 柔光呼应品牌。
function MachiAIHero({ locale }: { locale: string }) {
  const lang = locale.startsWith("ja") ? "ja" : locale.startsWith("en") ? "en" : "zh";
  const cta = pick(locale, "开始对话", "対話を始める", "Start chat");
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-kx-stroke/40 bg-kx-card px-5 py-7 shadow-[0_24px_70px_-50px_rgba(30,30,70,0.45)] sm:px-8 sm:py-8">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#A06BF0]/18 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-[#36D6C3]/16 blur-3xl" />
      <div className="relative">
        <Link
          href="/guide/ai"
          aria-label={pick(locale, "进入 Machi AI", "Machi AI を開く", "Open Machi AI")}
          className="group flex items-center gap-4 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-kx-accent/40"
        >
          <MachiAIMark className="h-16 w-16 shrink-0 shadow-[0_16px_38px_-18px_rgba(91,141,239,0.85)] transition duration-300 group-hover:scale-[1.04]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-kx-text sm:text-3xl">Machi AI</h1>
              <span className="rounded-full bg-kx-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-kx-accent">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm font-medium leading-6 text-kx-subtle">
              {pick(
                locale,
                "日本生活、升学、就职和 Machi 使用问题，先问问 Machi AI。",
                "日本の生活・進学・就職や Machi の使い方、まず Machi AI に聞いてみよう。",
                "Ask Machi AI anything about life, study, work in Japan, or using Machi.",
              )}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-kx-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm transition group-hover:gap-2.5 sm:inline-flex">
            {cta} <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        {/* 快捷入口:带着问题直接进入聊天页 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href="/guide/ai"
            className="inline-flex items-center gap-1.5 rounded-full bg-kx-accent px-4 py-2 text-sm font-bold text-white shadow-sm transition active:scale-95 sm:hidden"
          >
            {cta} <ArrowRight className="h-4 w-4" />
          </Link>
          {HERO_SUGGESTIONS[lang].map((s) => (
            <Link
              key={s}
              href={`/guide/ai?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-kx-accent/30 bg-kx-card/80 px-3 py-1.5 text-xs font-semibold text-kx-accent transition hover:border-kx-accent/55 hover:bg-kx-accentSoft/60"
            >
              {s}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// 轻入口:个人事务都在「我的工作台」。和 iOS 的 GuidePersonalWorkbenchCTA 一致。
function GuideWorkbenchCTA({ locale }: { locale: string }) {
  return (
    <Link
      href="/my/features"
      className="group flex items-center gap-3 rounded-2xl border border-kx-stroke/40 bg-kx-card/70 px-4 py-3.5 transition hover:border-kx-accent/35 hover:bg-kx-soft/50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kx-soft text-kx-subtle">
        <LayoutDashboard className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-kx-text">{pick(locale, "我的工作台", "マイ・ワークベンチ", "My workbench")}</p>
        <p className="text-xs text-kx-muted">
          {pick(
            locale,
            "待办、日历、记账、申请、合同、证件等个人事务都在这里。",
            "ToDo・カレンダー・家計簿・申請・契約・書類はこちら。",
            "Todos, calendar, finance, applications, contracts & documents.",
          )}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-kx-muted transition group-hover:translate-x-0.5 group-hover:text-kx-accent" />
    </Link>
  );
}

function SectionHeading({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] text-kx-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-kx-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-xs font-bold text-kx-accent hover:underline">
          查看
        </Link>
      ) : null}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-7">
      <div className="rounded-[2rem] border border-kx-stroke/40 bg-kx-card/70 p-7">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 animate-pulse rounded-[28%] bg-kx-soft" />
          <div className="space-y-2">
            <div className="h-7 w-32 animate-pulse rounded-full bg-kx-soft" />
            <div className="h-4 w-64 animate-pulse rounded-full bg-kx-soft" />
          </div>
        </div>
        <div className="mt-5 h-12 w-full animate-pulse rounded-2xl bg-kx-soft" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-kx-soft" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-kx-lg bg-kx-card" />
        ))}
      </div>
    </div>
  );
}
