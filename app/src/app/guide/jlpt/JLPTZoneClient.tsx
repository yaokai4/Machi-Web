"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Target, ListChecks, BookOpenCheck, GraduationCap, ChevronRight } from "lucide-react";
import { guide } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ArticleCard,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";
import { StreakBadge, StreakDots, ExamCountdownBar, JlptDisclaimer, type Tri } from "./JlptKit";

// study-plan CTA route token → concrete web path.
const ROUTE_HREF: Record<string, string> = { guidePlan: "/guide/plan" };

/**
 * JLPT 备考专区 — a curated prep hub (hero, N5–N1 levels, member-priced
 * resources, roadmap articles, FAQ, study-plan CTA) backed by /api/guide/jlpt.
 * Now also the launchpad for the interactive JLPT 备考核心: 定级 / 题库 / 单词 /
 * 在线考试 + 打卡 streak + exam countdown. Study content is original/imported,
 * never unauthorized past-paper text (compliance note carried on every page).
 */
export function JLPTZoneClient() {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);

  const zone = useQuery({
    queryKey: ["guide", "jlpt-zone", country, language],
    queryFn: () => guide.jlptZone(country, language),
    staleTime: 60_000,
  });

  if (zone.isLoading) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (zone.isError || !zone.data) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <ErrorState />
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

  const entries: Array<{
    href: string;
    icon: typeof Target;
    title: string;
    subtitle: string;
    enabled: boolean;
    accent?: boolean;
  }> = [
    {
      href: "/guide/jlpt/placement",
      icon: Target,
      title: t("能力定级测试", "レベル判定テスト", "Placement test"),
      subtitle: t("十几道题,推荐适合的备考等级", "十数問で最適な学習レベルを提案", "A dozen questions → your recommended level"),
      enabled: core?.hasPlacement ?? false,
      accent: true,
    },
    {
      href: "/guide/jlpt/practice",
      icon: ListChecks,
      title: t("刷题练习", "問題演習", "Practice questions"),
      subtitle: t("按等级与题型练习,即时解析", "レベル・分野別に演習、即時解説", "Drill by level & section with instant explanations"),
      enabled: core?.hasPractice ?? false,
    },
    {
      href: "/guide/jlpt/vocab",
      icon: BookOpenCheck,
      title: t("高频单词", "頻出単語", "Vocabulary decks"),
      subtitle: t("词表背诵 + 考单词在线测验", "単語帳と「単語テスト」", "Word decks + a vocab quiz"),
      enabled: core?.hasVocab ?? false,
    },
    {
      href: "/guide/jlpt/exam",
      icon: GraduationCap,
      title: t("在线模考", "オンライン模試", "Online mock exams"),
      subtitle: t("限时组卷,交卷看分与逐题解析", "時間制限つきで採点・解説", "Timed exams with scoring & per-question review"),
      enabled: core?.hasExams ?? false,
    },
  ];

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="kx-guide-channel-header">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
            Machi Guide · JLPT
          </p>
          {core?.streak ? <StreakBadge t={t} streak={core.streak} /> : null}
        </div>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {d.hero?.title}
        </h1>
        {d.hero?.subtitle ? (
          <p className="mt-1.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] sm:text-sm">
            {d.hero.subtitle}
          </p>
        ) : null}
        {core?.streak ? <StreakDots t={t} streak={core.streak} /> : null}
      </header>

      <ExamCountdownBar t={t} countdown={core?.examCountdown} />

      {/* Interactive JLPT 备考核心 entries. */}
      <section className="mt-6">
        <GuideSectionTitle title={t("练起来", "はじめる", "Start studying")} />
        <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {entries.map((e) => {
            const Icon = e.icon;
            const card = (
              <>
                <span
                  className={[
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    e.accent
                      ? "bg-[rgb(var(--kx-living-accent))] text-white"
                      : "bg-[rgb(var(--kx-living-accent))]/[0.12] text-[rgb(var(--kx-living-accent))]",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[rgb(var(--kx-living-ink))]">{e.title}</p>
                  <p className="mt-0.5 text-xs font-semibold leading-snug text-[rgb(var(--kx-living-muted))]">
                    {e.subtitle}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 self-center text-[rgb(var(--kx-living-muted))]" />
              </>
            );
            const base =
              "flex items-start gap-3 rounded-2xl border px-3.5 py-3.5 transition";
            if (!e.enabled) {
              return (
                <div
                  key={e.href}
                  className={[base, "cursor-not-allowed border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] opacity-55"].join(" ")}
                  title={t("内容即将上线", "近日公開", "Coming soon")}
                >
                  {card}
                </div>
              );
            }
            return (
              <Link
                key={e.href}
                href={e.href}
                className={[
                  base,
                  "border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] hover:border-[rgb(var(--kx-living-accent))]/40 hover:bg-[rgb(var(--kx-living-accent))]/[0.05]",
                ].join(" ")}
              >
                {card}
              </Link>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/guide/jlpt/review"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-3.5 py-1.5 text-xs font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
          >
            {t("错题本", "間違いノート", "Review book")}
          </Link>
          <Link
            href="/guide/jlpt/exam-dates"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-3.5 py-1.5 text-xs font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
          >
            {t("考试日历", "試験日程", "Exam dates")}
          </Link>
        </div>
      </section>

      {d.studyPlan?.title ? (
        <Link
          href={planHref}
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08] px-4 py-3.5 transition hover:bg-[rgb(var(--kx-living-accent))]/[0.12]"
        >
          <div className="min-w-0">
            <p className="text-sm font-black text-[rgb(var(--kx-living-accent))]">{d.studyPlan.title}</p>
            {d.studyPlan.subtitle ? (
              <p className="mt-0.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{d.studyPlan.subtitle}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-lg font-black text-[rgb(var(--kx-living-accent))]">→</span>
        </Link>
      ) : null}

      {d.levels && d.levels.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title="N5 – N1" />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.levels.map((lv) => (
              <div
                key={lv.key}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--kx-living-accent))]/[0.12] text-sm font-black text-[rgb(var(--kx-living-accent))]">
                  {lv.label}
                </span>
                <p className="text-xs font-semibold leading-relaxed text-[rgb(var(--kx-living-muted))]">{lv.summary}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {d.resources && d.resources.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("资料与模拟题", "資料・模擬問題", "Resources & mock tests")} />
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {d.resources.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      {d.articles && d.articles.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("备考路线与方法", "学習ロードマップ", "Roadmaps & methods")} />
          <div className="mt-2 space-y-2.5">
            {d.articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      ) : null}

      {d.faq && d.faq.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("常见问题", "よくある質問", "FAQ")} />
          <div className="mt-2 space-y-2">
            {d.faq.map((f) => (
              <details
                key={f.id}
                className="rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-4 py-3"
              >
                <summary className="cursor-pointer text-sm font-bold text-[rgb(var(--kx-living-ink))]">
                  {f.question}
                </summary>
                <p className="mt-2 text-xs font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <JlptDisclaimer t={t} note={d.disclaimer} />
    </GuideShell>
  );
}
