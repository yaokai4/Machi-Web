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
  JlptNarrow,
  JlptPageHeader,
  JlptPanel,
  JlptFieldLabel,
  JlptStateCard,
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
      <JlptNarrow>
        <JlptPageHeader
          eyebrow={`JLPT · ${t("刷题", "演習", "Practice")}`}
          title={t("刷题练习", "問題演習", "Practice questions")}
          subtitle={t("按等级与题型抽题,答完即时判分与解析。", "レベル・分野で出題、回答後すぐに採点と解説。", "Drill by level & section — instant grading and explanations.")}
        />

        <div className="mt-6">
          <JlptPanel className="space-y-4">
            <div>
              <JlptFieldLabel>{t("等级", "レベル", "Level")}</JlptFieldLabel>
              <LevelPicker value={level} onChange={setLevel} />
            </div>
            <div>
              <JlptFieldLabel>{t("题型", "分野", "Section")}</JlptFieldLabel>
              <SectionPicker t={t} value={section} onChange={setSection} />
            </div>
            <button
              type="button"
              onClick={() => load.mutate()}
              disabled={load.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90 disabled:opacity-60"
            >
              {load.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              {t("换一组题", "問題を取得", "Get a set")}
            </button>
          </JlptPanel>
        </div>

        {started && questions.length > 0 ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-[rgb(var(--kx-living-muted))]">
              {t(`本组 ${questions.length} 题 · 已答 ${answeredCount}`, `${questions.length} 問中 ${answeredCount} 回答`, `${answeredCount} of ${questions.length} answered`)}
            </p>
            {answeredCount === questions.length ? (
              <button
                type="button"
                onClick={() => load.mutate()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--kx-living-accent))]/[0.1] px-3 py-1.5 text-xs font-black text-[rgb(var(--kx-living-accent))] transition hover:bg-[rgb(var(--kx-living-accent))]/[0.16]"
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
          <JlptStateCard
            icon={ListChecks}
            title={t("该组合暂无题目", "この条件では問題がありません", "No questions for this filter")}
            body={t("换个等级或题型再试一次。", "レベルや分野を変えてみてください。", "Try another level or section.")}
          />
        ) : null}

        <JlptDisclaimer t={t} />
      </JlptNarrow>
    </GuideShell>
  );
}
