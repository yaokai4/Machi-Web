"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookMarked } from "lucide-react";
import { guide } from "@/lib/guide";
import { isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt } from "@/lib/store";
import { GuideShell } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { QuestionCard, ExplainButton, JlptDisclaimer, LevelPicker, JLPT_LEVELS, type Tri } from "../JlptKit";

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
          <div className="mt-10 flex min-h-[40vh] flex-col items-center justify-center text-center">
            <BookMarked className="h-10 w-10 text-[rgb(var(--kx-living-muted))]" />
            <p className="mt-3 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
              {t("登录后查看你的错题本", "ログインすると間違いノートが見られます", "Log in to see your review book")}
            </p>
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="mt-4 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
            >
              {t("登录", "ログイン", "Log in")}
            </button>
          </div>
        </GuideShell>
      );
    }
    return (
      <GuideShell back={back}>
        <ErrorState />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={back}>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("错题本", "間違いノート", "Review")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("错题本", "間違いノート", "Review book")}
        </h1>
        <p className="mt-1.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] sm:text-sm">
          {t("这里是你最近答错、还没重新答对的题目。", "最近間違えて、まだ正解していない問題です。", "Questions you recently got wrong and haven't since gotten right.")}
        </p>
      </header>

      <div className="mt-4">
        <LevelPicker
          value={level}
          onChange={setLevel}
          levels={["", ...(JLPT_LEVELS as readonly string[])]}
          allLabel={t("全部", "すべて", "All")}
        />
      </div>

      {q.isLoading ? (
        <InlineLoading />
      ) : !q.data?.questions?.length ? (
        <div className="mt-8 flex min-h-[30vh] flex-col items-center justify-center text-center">
          <BookMarked className="h-10 w-10 text-[rgb(var(--kx-living-muted))]" />
          <p className="mt-3 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
            {t("暂时没有错题,继续刷题保持手感!", "間違いはありません。演習を続けましょう!", "No wrong answers yet — keep practicing!")}
          </p>
          <Link
            href="/guide/jlpt/practice"
            className="mt-4 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
          >
            {t("去刷题", "演習へ", "Practice")}
          </Link>
        </div>
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
    </GuideShell>
  );
}
