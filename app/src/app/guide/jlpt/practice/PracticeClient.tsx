"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ListChecks, Loader, RefreshCw } from "lucide-react";
import { guide, type GuideJlptQuestion } from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useToasts } from "@/lib/store";
import { GuideShell } from "@/components/guide/GuideKit";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  QuestionCard,
  ExplainButton,
  JlptDisclaimer,
  LevelPicker,
  SectionPicker,
  JLPT_LEVELS,
  type Tri,
} from "../JlptKit";

interface Graded {
  correctIndex: number;
  selectedIndex: number;
}

export function PracticeClient() {
  const params = useSearchParams();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);

  const initialLevel = (params.get("level") || "N5").toUpperCase();
  const [level, setLevel] = useState<string>(
    (JLPT_LEVELS as readonly string[]).includes(initialLevel) ? initialLevel : "N5",
  );
  const [section, setSection] = useState<string>("");
  const [questions, setQuestions] = useState<GuideJlptQuestion[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [graded, setGraded] = useState<Record<string, Graded>>({});
  const [started, setStarted] = useState(false);

  const load = useMutation({
    mutationFn: () => guide.jlptPractice({ level, section: section || undefined, count: 10 }),
    onSuccess: (data) => {
      setQuestions(data.questions || []);
      setSelected({});
      setGraded({});
      setStarted(true);
      if (!data.questions?.length) {
        pushToast({ kind: "info", message: t("该组合暂无题目,换个题型试试", "この条件では問題がありません", "No questions for this filter yet") });
      }
    },
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  const answeredCount = Object.keys(graded).length;

  const grade = async (q: GuideJlptQuestion, sel: number) => {
    setSelected((prev) => ({ ...prev, [q.id]: sel }));
    try {
      const res = await guide.jlptAttempt({ questionId: q.id, selectedIndex: sel, sourceKind: "practice" });
      setGraded((prev) => ({ ...prev, [q.id]: { correctIndex: res.correctIndex, selectedIndex: sel } }));
      // Server returns the explanation on the attempt; stitch it onto the card.
      if (res.explanation) {
        setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, explanation: res.explanation } : x)));
      }
    } catch (err) {
      if (isAuthRequiredError(err)) {
        setSelected((prev) => {
          const next = { ...prev };
          delete next[q.id];
          return next;
        });
        openAuthPrompt({ kind: "generic", title: t("登录后记录练习进度", "ログインして進捗を記録", "Log in to save your practice") });
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  // If arriving with ?level=… pre-selected, auto-load the first set.
  useEffect(() => {
    if (!started) load.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GuideShell back={{ href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") }}>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("刷题", "演習", "Practice")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("刷题练习", "問題演習", "Practice questions")}
        </h1>
      </header>

      <div className="mt-4 space-y-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] p-4">
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
            {t("等级", "レベル", "Level")}
          </p>
          <LevelPicker value={level} onChange={setLevel} />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
            {t("题型", "分野", "Section")}
          </p>
          <SectionPicker t={t} value={section} onChange={setSection} />
        </div>
        <button
          type="button"
          onClick={() => load.mutate()}
          disabled={load.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {load.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
          {t("换一组题", "問題を取得", "Get a set")}
        </button>
      </div>

      {started && questions.length > 0 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs font-bold text-[rgb(var(--kx-living-muted))]">
            {t(`本组 ${questions.length} 题,已答 ${answeredCount}`, `${questions.length} 問中 ${answeredCount} 回答`, `${answeredCount} of ${questions.length} answered`)}
          </p>
          {answeredCount === questions.length ? (
            <button
              type="button"
              onClick={() => load.mutate()}
              className="inline-flex items-center gap-1.5 text-xs font-black text-[rgb(var(--kx-living-accent))]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {t("再来一组", "次のセット", "Next set")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {questions.map((q, i) => {
          const g = graded[q.id];
          return (
            <div key={q.id}>
              <QuestionCard
                t={t}
                question={q}
                index={i}
                total={questions.length}
                selectedIndex={selected[q.id]}
                onSelect={(sel) => {
                  if (!graded[q.id]) grade(q, sel);
                }}
                gradedCorrectIndex={g?.correctIndex}
              />
              {g ? <ExplainButton t={t} questionId={q.id} language={language} /> : null}
            </div>
          );
        })}
      </div>

      {started && questions.length === 0 && !load.isPending ? (
        <div className="mt-8 flex min-h-[30vh] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
            {t("该组合暂无题目,换个等级或题型。", "この条件では問題がありません。レベルや分野を変えてみてください。", "No questions for this filter — try another level or section.")}
          </p>
        </div>
      ) : null}

      <JlptDisclaimer t={t} />
    </GuideShell>
  );
}
