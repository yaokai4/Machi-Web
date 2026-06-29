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
  const { locale, t } = useI18n();
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
          <ErrorState title={t("guide_home_ai_load_error_title")} subtitle={t("guide_home_ai_load_error_subtitle")} onRetry={() => home.refetch()} />
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
            title={t("guide_home_six_guides_title")}
            subtitle={t("guide_home_six_guides_subtitle")}
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
              title={t("guide_home_library_title")}
              subtitle={t("guide_home_library_subtitle")}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {(home.data.resourceEntries || []).map((entry) => (
                <ResourceEntryCard key={entry.key} entry={entry} />
              ))}
            </div>
          </section>
        ) : null}

        <GuideWorkbenchCTA />
      </main>
    </GuideShell>
  );
}

// 主卖场:Machi AI 纯入口卡。不再有输入框——整块是「入口」,点进去才到聊天页
// /guide/ai;示例问题是快捷入口,带着问题进入。彩色 logo + 柔光呼应品牌。
function MachiAIHero({ locale }: { locale: string }) {
  const { t } = useI18n();
  const lang = locale.startsWith("ja") ? "ja" : locale.startsWith("en") ? "en" : "zh";
  const cta = t("guide_home_ai_cta");
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-kx-stroke/40 bg-kx-card px-5 py-7 shadow-[0_24px_70px_-50px_rgba(30,30,70,0.45)] sm:px-8 sm:py-8">
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#A06BF0]/18 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-[#36D6C3]/16 blur-3xl" />
      <div className="relative">
        <Link
          href="/guide/ai"
          aria-label={t("guide_home_ai_open_aria")}
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
              {t("guide_home_ai_blurb")}
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
function GuideWorkbenchCTA() {
  const { t } = useI18n();
  return (
    <Link
      href="/my/features"
      className="group flex items-center gap-3 rounded-2xl border border-kx-stroke/40 bg-kx-card/70 px-4 py-3.5 transition hover:border-kx-accent/35 hover:bg-kx-soft/50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kx-soft text-kx-subtle">
        <LayoutDashboard className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-kx-text">{t("guide_home_workbench_title")}</p>
        <p className="text-xs text-kx-muted">
          {t("guide_home_workbench_subtitle")}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-kx-muted transition group-hover:translate-x-0.5 group-hover:text-kx-accent" />
    </Link>
  );
}

function SectionHeading({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] text-kx-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-kx-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-xs font-bold text-kx-accent hover:underline">
          {t("guide_home_section_view")}
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
