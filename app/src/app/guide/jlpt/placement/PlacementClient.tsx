"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Target, Loader, ArrowRight } from "lucide-react";
import { guide, type GuideJlptQuestion, type GuideJlptPlacementResult } from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useToasts } from "@/lib/store";
import { GuideShell, GuideSectionTitle } from "@/components/guide/GuideKit";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  QuestionCard,
  JlptDisclaimer,
  sectionLabel,
  JlptNarrow,
  JlptPageHeader,
  JlptScoreHero,
  JlptSectionBar,
  JlptProgress,
  JlptStickyBar,
  JlptBottomBar,
  JLPT_BTN_PRIMARY,
  JLPT_CARD,
  type Tri,
} from "../JlptKit";

type Phase = "intro" | "answering" | "result";

export function PlacementClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);

  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<GuideJlptQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<GuideJlptPlacementResult | null>(null);

  const start = useMutation({
    mutationFn: () => guide.jlptPlacementStart(),
    onSuccess: (data) => {
      if (!data.questions?.length) {
        pushToast({ kind: "info", message: t("暂无定级题目", "判定用の問題がありません", "No placement questions yet") });
        return;
      }
      setQuestions(data.questions);
      setAnswers({});
      setResult(null);
      setPhase("answering");
    },
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  const submit = useMutation({
    mutationFn: () =>
      guide.jlptPlacementSubmit(
        questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] ?? -1 })),
      ),
    onSuccess: (data) => {
      setResult(data);
      setPhase("result");
    },
    onError: (err) => {
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后查看结果", "ログインして結果を見る", "Log in to see your result") });
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    },
  });

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  return (
    <GuideShell back={{ href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") }}>
      <JlptNarrow>
        <JlptPageHeader
          eyebrow={`JLPT · ${t("能力定级", "レベル判定", "Placement")}`}
          title={t("能力定级测试", "レベル判定テスト", "Placement test")}
        />

        {phase === "intro" ? (
          <div className="mt-6">
            <div className={[JLPT_CARD, "relative overflow-hidden rounded-[28px] px-6 py-10 text-center"].join(" ")}>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-60 blur-3xl"
                style={{ background: "radial-gradient(closest-side, rgb(var(--kx-living-accent)/0.13), transparent)" }}
              />
              <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-[rgb(var(--kx-living-accent))]/[0.1] text-[rgb(var(--kx-living-accent))]">
                <Target className="h-8 w-8" />
              </span>
              <h2 className="relative mt-5 text-lg font-black leading-snug tracking-[-0.01em] text-[rgb(var(--kx-living-ink))]">
                {t("十几道题,找到你的起点", "十数問であなたの出発点を", "A dozen questions to find your starting level")}
              </h2>
              <p className="relative mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-[rgb(var(--kx-living-muted))]">
                {t(
                  "涵盖 N5–N1 的词汇、语法、读解题目。作答后我们会推荐适合的备考等级和薄弱环节,并可一键生成学习计划。",
                  "N5〜N1 の語彙・文法・読解を横断。回答後におすすめの学習レベルと弱点を提案し、学習計画も作成できます。",
                  "Spans vocabulary, grammar, and reading from N5–N1. We'll recommend a level and weak spots, then let you build a study plan.",
                )}
              </p>
              <div className="relative mx-auto mt-6 grid max-w-sm grid-cols-3 gap-2">
                {[
                  [t("题量", "問題数", "Questions"), t("约 15", "約15", "~15")],
                  [t("用时", "所要時間", "Time"), t("约 10 分钟", "約10分", "~10 min")],
                  [t("产出", "結果", "You get"), t("等级 + 计划", "レベル+計画", "Level + plan")],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.04] px-2 py-2.5">
                    <p className="text-[10px] font-medium text-[rgb(var(--kx-living-muted))]">{label}</p>
                    <p className="mt-0.5 text-xs font-bold text-[rgb(var(--kx-living-ink))]">{value}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => start.mutate()}
                disabled={start.isPending}
                className={["relative mt-6 px-7", JLPT_BTN_PRIMARY].join(" ")}
              >
                {start.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                {t("开始测试", "テスト開始", "Start test")}
              </button>
            </div>
            <JlptDisclaimer t={t} />
          </div>
        ) : null}

        {phase === "answering" ? (
          <div className="mt-5">
            <div className="mb-3">
              <JlptStickyBar>
                <JlptProgress
                  value={answeredCount}
                  total={questions.length}
                  label={t(`已答 ${answeredCount} / ${questions.length}`, `${answeredCount} / ${questions.length} 回答`, `${answeredCount} / ${questions.length} answered`)}
                />
              </JlptStickyBar>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  t={t}
                  question={q}
                  index={i}
                  total={questions.length}
                  selectedIndex={answers[q.id]}
                  onSelect={(sel) => setAnswers((prev) => ({ ...prev, [q.id]: sel }))}
                />
              ))}
            </div>

            {/* Sticky so the submit stays under the thumb while reviewing answers. */}
            <JlptBottomBar>
              <button
                type="button"
                onClick={() => submit.mutate()}
                disabled={!allAnswered || submit.isPending}
                className={["w-full py-3.5", JLPT_BTN_PRIMARY].join(" ")}
              >
                {submit.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
                {allAnswered
                  ? t("提交,看我的等级", "提出してレベルを見る", "Submit for my level")
                  : t(`还剩 ${questions.length - answeredCount} 题`, `残り ${questions.length - answeredCount} 問`, `${questions.length - answeredCount} left`)}
              </button>
            </JlptBottomBar>
            <JlptDisclaimer t={t} />
          </div>
        ) : null}

        {phase === "result" && result ? (
          <div className="mt-6">
            <JlptScoreHero
              t={t}
              caption={t("推荐备考等级", "おすすめレベル", "Recommended level")}
              score={result.recommendedLevel}
              metaLine={t(
                `建议每天学习约 ${result.suggestedDailyMinutes} 分钟`,
                `1日約 ${result.suggestedDailyMinutes} 分の学習を推奨`,
                `Suggested ~${result.suggestedDailyMinutes} min/day`,
              )}
            />

            {result.sectionBreakdown.some((s) => s.total > 0) ? (
              <section className="mt-6">
                <GuideSectionTitle title={t("分项表现", "分野別の結果", "Section breakdown")} />
                <div className="mt-2 space-y-2">
                  {result.sectionBreakdown
                    .filter((s) => s.total > 0)
                    .map((s) => (
                      <JlptSectionBar
                        key={s.section}
                        label={sectionLabel(t, s.section)}
                        correct={s.correct}
                        total={s.total}
                        accuracy={s.accuracy}
                        weak={result.weakSections.includes(s.section)}
                        weakLabel={t("薄弱", "弱点", "Weak")}
                      />
                    ))}
                </div>
              </section>
            ) : null}

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              <Link
                href={`/guide/plan?targetLevel=${encodeURIComponent(result.studyPlanPrefill?.targetLevel || result.recommendedLevel)}&dailyMinutes=${result.studyPlanPrefill?.dailyMinutes || result.suggestedDailyMinutes}`}
                className="group flex items-center justify-between gap-3 rounded-[22px] bg-[rgb(var(--kx-living-accent))] px-5 py-4 text-[rgb(var(--kx-on-accent))] shadow-[0_20px_40px_-24px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
              >
                <span className="text-sm font-bold">{t("生成学习计划", "学習計画を作る", "Build study plan")}</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={`/guide/jlpt/practice?level=${encodeURIComponent(result.recommendedLevel)}`}
                className="group flex items-center justify-between gap-3 rounded-[22px] border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-5 py-4 text-[rgb(var(--kx-living-ink))] shadow-[0_24px_48px_-42px_rgb(var(--kx-shadow)/0.55)] transition hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/40 motion-reduce:hover:translate-y-0"
              >
                <span className="text-sm font-bold">{t("按此等级刷题", "このレベルで演習", "Practice at this level")}</span>
                <ArrowRight className="h-4 w-4 text-[rgb(var(--kx-living-accent))] transition group-hover:translate-x-0.5" />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => {
                setPhase("intro");
                setResult(null);
              }}
              className="mt-3 w-full rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] px-4 py-2.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]"
            >
              {t("重新测试", "もう一度", "Retake")}
            </button>
            <JlptDisclaimer t={t} />
          </div>
        ) : null}
      </JlptNarrow>
    </GuideShell>
  );
}
