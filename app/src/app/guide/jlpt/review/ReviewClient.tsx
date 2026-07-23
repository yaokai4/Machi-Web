"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookMarked } from "lucide-react";
import { guide } from "@/lib/guide";
import { isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt } from "@/lib/store";
import { GuideShell } from "@/components/guide/GuideKit";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  QuestionCard,
  ExplainButton,
  JlptDisclaimer,
  LevelPicker,
  JlptNarrow,
  JlptPageHeader,
  JlptStateCard,
  JlptPageSkeleton,
  JlptErrorCard,
  JLPT_BTN_PRIMARY,
  JLPT_LEVELS,
  type Tri,
} from "../JlptKit";

export function ReviewClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const [level, setLevel] = useState<string>("");

  const q = useQuery({
    queryKey: ["guide", "jlpt-review", level],
    queryFn: () => guide.jlptReview({ level: level || undefined, count: 30 }),
    retry: false,
  });

  const back = { href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") };

  if (q.isError) {
    if (isAuthRequiredError(q.error)) {
      return (
        <GuideShell back={back}>
          <JlptNarrow>
            <JlptPageHeader
              eyebrow={`JLPT · ${t("错题本", "間違いノート", "Review")}`}
              title={t("错题本", "間違いノート", "Review book")}
            />
            <JlptStateCard
              icon={BookMarked}
              tone="accent"
              title={t("登录后查看你的错题本", "ログインすると間違いノートが見られます", "Log in to see your review book")}
              action={
                <button
                  type="button"
                  onClick={() => openAuthPrompt("generic")}
                  className={JLPT_BTN_PRIMARY}
                >
                  {t("登录", "ログイン", "Log in")}
                </button>
              }
            />
          </JlptNarrow>
        </GuideShell>
      );
    }
    return (
      <GuideShell back={back}>
        <JlptNarrow>
          <JlptErrorCard
            t={t}
            onRetry={() => q.refetch()}
            retrying={q.isFetching}
            title={t("错题本加载失败", "間違いノートを読み込めませんでした", "Couldn't load your review book")}
          />
        </JlptNarrow>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={back}>
      <JlptNarrow>
        <JlptPageHeader
          eyebrow={`JLPT · ${t("错题本", "間違いノート", "Review")}`}
          title={t("错题本", "間違いノート", "Review book")}
          subtitle={t("这里是你最近答错、还没重新答对的题目。", "最近間違えて、まだ正解していない問題です。", "Questions you recently got wrong and haven't since gotten right.")}
        />

        <div className="mt-6">
          <LevelPicker
            value={level}
            onChange={setLevel}
            levels={["", ...(JLPT_LEVELS as readonly string[])]}
            allLabel={t("全部", "すべて", "All")}
          />
        </div>

        {q.isLoading ? (
          <JlptPageSkeleton t={t} variant="rows" />
        ) : !q.data?.questions?.length ? (
          <JlptStateCard
            icon={BookMarked}
            tone="accent"
            title={t("暂时没有错题", "間違いはありません", "No wrong answers yet")}
            body={t("继续刷题保持手感!", "演習を続けて感覚を保ちましょう!", "Keep practicing to stay sharp!")}
            action={
              <Link href="/guide/jlpt/practice" className={JLPT_BTN_PRIMARY}>
                {t("去刷题", "演習へ", "Practice")}
              </Link>
            }
          />
        ) : (
          <div className="mt-4 space-y-3">
            {q.data.questions.map((question, i) => (
              <div key={question.id}>
                <QuestionCard t={t} question={question} index={i} total={q.data.questions.length} revealed />
                <ExplainButton t={t} questionId={question.id} language={language} />
              </div>
            ))}
          </div>
        )}

        <JlptDisclaimer t={t} note={q.data?.disclaimer} />
      </JlptNarrow>
    </GuideShell>
  );
}
