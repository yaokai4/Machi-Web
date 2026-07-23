"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Target, ListChecks, BookOpenCheck, GraduationCap, NotebookPen, CalendarDays, ArrowRight } from "lucide-react";
import { guide, type GuideJlptZone } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ArticleCard,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";
import {
  JlptHero, JlptActionGrid, JlptLevelLadder, ExamCountdownBar, JlptDisclaimer,
  JlptNarrow, JlptPageSkeleton, JlptErrorCard,
  type Tri, type JlptAction,
} from "./JlptKit";
import { MyStudySection } from "./MyStudy";

// study-plan CTA route token → concrete web path.
const ROUTE_HREF: Record<string, string> = { guidePlan: "/guide/plan" };

/**
 * JLPT 备考专区 — a curated prep hub (hero, N5–N1 levels, member-priced
 * resources, roadmap articles, FAQ, study-plan CTA) backed by /api/guide/jlpt.
 * Also the launchpad for the interactive 备考核心: 定级 / 题库 / 单词 / 在线考试
 * + 打卡 streak + exam countdown. Study content is original/imported, never
 * unauthorized past-paper text (compliance note carried on every page).
 *
 * Layout: a focused single column (max-w-3xl) so the prep tools read as a calm,
 * premium workspace rather than a stretched full-width dashboard.
 */
export function JLPTZoneClient({ initialZone }: { initialZone?: GuideJlptZone }) {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);

  const zone = useQuery({
    queryKey: ["guide", "jlpt-zone", country, language],
    queryFn: () => guide.jlptZone(country, language),
    // Server-prefetched (anonymous) zone → real SSR first paint for crawlers.
    // Marked stale (updatedAt 0) so signed-in viewers refetch immediately and
    // get their streak/countdown, which the anonymous prefetch can't carry.
    initialData: country === "jp" ? initialZone : undefined,
    initialDataUpdatedAt: initialZone ? 0 : undefined,
    staleTime: 60_000,
  });

  if (zone.isLoading) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <JlptNarrow>
          <JlptPageSkeleton t={t} variant="zone" />
        </JlptNarrow>
      </GuideShell>
    );
  }
  if (zone.isError || !zone.data) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <JlptNarrow>
          <JlptErrorCard
            t={t}
            onRetry={() => zone.refetch()}
            retrying={zone.isFetching}
            title={t("专区加载失败", "読み込みに失敗しました", "Couldn't load the JLPT hub")}
          />
        </JlptNarrow>
      </GuideShell>
    );
  }
  if (zone.data.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  const d = zone.data;
  const planHref = ROUTE_HREF[d.studyPlan?.route || ""] || "/guide/plan";
  const core = d.jlptCore;

  const actions: JlptAction[] = [
    {
      href: "/guide/jlpt/placement",
      icon: Target,
      title: t("能力定级测试", "レベル判定テスト", "Placement test"),
      subtitle: t("十几道题,推荐适合的备考等级", "十数問で最適な学習レベルを提案", "A dozen questions → your recommended level"),
      enabled: core?.hasPlacement ?? false,
      primary: true,
    },
    {
      href: "/guide/jlpt/practice",
      icon: ListChecks,
      title: t("刷题练习", "問題演習", "Practice"),
      subtitle: t("按等级与题型练习,即时解析", "レベル・分野別に演習、即時解説", "Drill by level & section, instant explanations"),
      enabled: core?.hasPractice ?? false,
    },
    {
      href: "/guide/jlpt/vocab",
      icon: BookOpenCheck,
      title: t("高频单词", "頻出単語", "Vocabulary"),
      subtitle: t("词表背诵 + 考单词在线测验", "単語帳と「単語テスト」", "Word decks + a vocab quiz"),
      enabled: core?.hasVocab ?? false,
    },
    {
      href: "/guide/jlpt/exam",
      icon: GraduationCap,
      title: t("在线模考", "オンライン模試", "Mock exams"),
      subtitle: t("限时组卷,交卷看分与逐题解析", "時間制限つきで採点・解説", "Timed exams, scoring & per-question review"),
      enabled: core?.hasExams ?? false,
    },
  ];

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <JlptNarrow>
        <JlptHero t={t} title={d.hero?.title} subtitle={d.hero?.subtitle} streak={core?.streak} />

        {core?.examCountdown?.examDate ? (
          <div className="mt-3">
            <ExamCountdownBar t={t} countdown={core.examCountdown} />
          </div>
        ) : null}

        {/* 我的学习 — signed-in progress snapshot (guests get a login nudge).
            Self-contained: fetches its own data, hides itself when empty. */}
        <MyStudySection t={t} />

        {/* Interactive 备考核心 entries. */}
        <section className="mt-8">
          <GuideSectionTitle
            title={t("练起来", "はじめる", "Start studying")}
            subtitle={t("定级 · 刷题 · 背单词 · 模考,一站式备考", "レベル判定・演習・単語・模試", "Placement · drills · vocab · mocks")}
          />
          <JlptActionGrid t={t} actions={actions} />
          {/* Companion tools as thumb-sized tiles (not tiny pills). */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              href="/guide/jlpt/review"
              className="group flex items-center gap-3 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 transition hover:border-[rgb(var(--kx-living-accent))]/30"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.09] text-[rgb(var(--kx-living-accent))]">
                <NotebookPen className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-[13px] font-bold text-[rgb(var(--kx-living-ink))] group-hover:text-[rgb(var(--kx-living-accent))]">
                {t("错题本", "間違いノート", "Review book")}
              </span>
            </Link>
            <Link
              href="/guide/jlpt/exam-dates"
              className="group flex items-center gap-3 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 transition hover:border-[rgb(var(--kx-living-accent))]/30"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.09] text-[rgb(var(--kx-living-accent))]">
                <CalendarDays className="h-4 w-4" />
              </span>
              <span className="min-w-0 text-[13px] font-bold text-[rgb(var(--kx-living-ink))] group-hover:text-[rgb(var(--kx-living-accent))]">
                {t("考试日历", "試験日程", "Exam dates")}
              </span>
            </Link>
          </div>
        </section>

        {d.studyPlan?.title ? (
          <Link
            href={planHref}
            className="group mt-4 flex items-center justify-between gap-3 rounded-[20px] border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.06] px-4 py-4 transition hover:border-[rgb(var(--kx-living-accent))]/45 hover:bg-[rgb(var(--kx-living-accent))]/[0.09]"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-[rgb(var(--kx-living-accent))]">{d.studyPlan.title}</p>
              {d.studyPlan.subtitle ? (
                <p className="mt-0.5 text-xs text-[rgb(var(--kx-living-muted))]">{d.studyPlan.subtitle}</p>
              ) : null}
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))] transition group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ) : null}

        {d.levels && d.levels.length > 0 ? (
          <section className="mt-9">
            <GuideSectionTitle
              title="N5 – N1"
              subtitle={t("选择目标等级,点开看合格线与题型构成", "目標レベルを選んで、合格ラインと構成を見る", "Pick a level — pass lines & structure inside")}
            />
            {/* Each ladder row links to its W2-3 static intro page. */}
            <JlptLevelLadder t={t} levels={d.levels} />
          </section>
        ) : null}

        {d.resources && d.resources.length > 0 ? (
          <section className="mt-9">
            <GuideSectionTitle title={t("资料与模拟题", "資料・模擬問題", "Resources & mock tests")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {d.resources.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}

        {d.articles && d.articles.length > 0 ? (
          <section className="mt-9">
            <GuideSectionTitle title={t("备考路线与方法", "学習ロードマップ", "Roadmaps & methods")} />
            <div className="space-y-3">
              {d.articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        ) : null}

        {d.faq && d.faq.length > 0 ? (
          <section className="mt-9">
            <GuideSectionTitle title={t("常见问题", "よくある質問", "FAQ")} />
            <div className="space-y-2.5">
              {d.faq.map((f) => (
                <details
                  key={f.id}
                  className="group rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 transition hover:border-[rgb(var(--kx-living-accent))]/25"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[rgb(var(--kx-living-ink))] [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-open:rotate-45 motion-reduce:transition-none">
                      <span className="text-base leading-none">+</span>
                    </span>
                  </summary>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-[rgb(var(--kx-living-muted))]">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <JlptDisclaimer t={t} note={d.disclaimer} />
      </JlptNarrow>
    </GuideShell>
  );
}
