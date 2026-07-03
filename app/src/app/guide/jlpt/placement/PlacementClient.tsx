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
import { QuestionCard, JlptDisclaimer, sectionLabel, type Tri } from "../JlptKit";

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
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("能力定级", "レベル判定", "Placement")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("能力定级测试", "レベル判定テスト", "Placement test")}
        </h1>
      </header>

      {phase === "intro" ? (
        <div className="mt-6 flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-[rgb(var(--kx-living-accent))]">
            <Target className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-black text-[rgb(var(--kx-living-ink))]">
            {t("十几道题,找到你的起点", "十数問であなたの出発点を", "A dozen questions to find your starting level")}
          </h2>
          <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
            {t(
              "涵盖 N5–N1 的词汇、语法、读解题目。作答后我们会推荐适合的备考等级和薄弱环节,并可一键生成学习计划。",
              "N5〜N1 の語彙・文法・読解を横断。回答後におすすめの学習レベルと弱点を提案し、学習計画も作成できます。",
              "Spans vocabulary, grammar, and reading from N5–N1. We'll recommend a level and weak spots, then let you build a study plan.",
            )}
          </p>
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-6 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {start.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {t("开始测试", "テスト開始", "Start test")}
          </button>
          <JlptDisclaimer t={t} />
        </div>
      ) : null}

      {phase === "answering" ? (
        <div className="mt-5">
          <div className="sticky top-0 z-10 -mx-4 mb-3 bg-[rgb(var(--kx-living-bg,255_255_255))]/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.08]">
              <div
                className="h-full rounded-full bg-[rgb(var(--kx-living-accent))] transition-all"
                style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
              {t(`已答 ${answeredCount} / ${questions.length}`, `${answeredCount} / ${questions.length} 回答`, `${answeredCount} / ${questions.length} answered`)}
            </p>
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

          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!allAnswered || submit.isPending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-6 py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submit.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
            {allAnswered
              ? t("提交,看我的等级", "提出してレベルを見る", "Submit for my level")
              : t(`还剩 ${questions.length - answeredCount} 题`, `残り ${questions.length - answeredCount} 問`, `${questions.length - answeredCount} left`)}
          </button>
          <JlptDisclaimer t={t} />
        </div>
      ) : null}

      {phase === "result" && result ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08] p-6 text-center">
            <p className="text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
              {t("推荐备考等级", "おすすめレベル", "Recommended level")}
            </p>
            <p className="mt-1 text-5xl font-black text-[rgb(var(--kx-living-accent))]">{result.recommendedLevel}</p>
            <p className="mt-2 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">
              {t(
                `建议每天学习约 ${result.suggestedDailyMinutes} 分钟`,
                `1日約 ${result.suggestedDailyMinutes} 分の学習を推奨`,
                `Suggested ~${result.suggestedDailyMinutes} min/day`,
              )}
            </p>
          </div>

          {result.sectionBreakdown.some((s) => s.total > 0) ? (
            <section className="mt-6">
              <GuideSectionTitle title={t("分项表现", "分野別の結果", "Section breakdown")} />
              <div className="mt-2 space-y-2">
                {result.sectionBreakdown
                  .filter((s) => s.total > 0)
                  .map((s) => {
                    const pct = Math.round(s.accuracy * 100);
                    const weak = result.weakSections.includes(s.section);
                    return (
                      <div key={s.section} className="rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-[rgb(var(--kx-living-ink))]">
                            {sectionLabel(t, s.section)}
                            {weak ? (
                              <span className="ml-2 rounded-md bg-red-500/[0.12] px-1.5 py-0.5 text-[10px] font-black text-red-600 dark:text-red-400">
                                {t("薄弱", "弱点", "Weak")}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[rgb(var(--kx-living-muted))]">
                            {s.correct}/{s.total} · {pct}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.08]">
                          <div
                            className={["h-full rounded-full", weak ? "bg-red-500" : "bg-[rgb(var(--kx-living-accent))]"].join(" ")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          ) : null}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <Link
              href={`/guide/plan?targetLevel=${encodeURIComponent(result.studyPlanPrefill?.targetLevel || result.recommendedLevel)}&dailyMinutes=${result.studyPlanPrefill?.dailyMinutes || result.suggestedDailyMinutes}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[rgb(var(--kx-living-accent))] px-4 py-3.5 text-white transition hover:opacity-90"
            >
              <span className="text-sm font-black">{t("生成学习计划", "学習計画を作る", "Build study plan")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/guide/jlpt/practice?level=${encodeURIComponent(result.recommendedLevel)}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
            >
              <span className="text-sm font-black">{t("按此等级刷题", "このレベルで演習", "Practice at this level")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => {
              setPhase("intro");
              setResult(null);
            }}
            className="mt-3 w-full rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] px-4 py-2.5 text-xs font-bold text-[rgb(var(--kx-living-muted))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
          >
            {t("重新测试", "もう一度", "Retake")}
          </button>
          <JlptDisclaimer t={t} />
        </div>
      ) : null}
    </GuideShell>
  );
}
