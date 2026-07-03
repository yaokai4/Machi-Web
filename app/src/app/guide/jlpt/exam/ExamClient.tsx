"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GraduationCap, Loader, Lock, Timer, ArrowLeft, History, Trophy, ChevronRight } from "lucide-react";
import {
  guide,
  type GuideJlptExam,
  type GuideJlptExamStart,
  type GuideJlptExamSubmit,
  type GuideJlptExamHistoryItem,
  type GuideJlptQuestion,
} from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useToasts } from "@/lib/store";
import { GuideShell, GuideSectionTitle } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  QuestionCard,
  ExplainButton,
  JlptDisclaimer,
  LevelPicker,
  JLPT_LEVELS,
  fmtDuration,
  type Tri,
} from "../JlptKit";

type View = "list" | "taking" | "result" | "review";

export function ExamClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);

  const [level, setLevel] = useState<string>("");
  const [view, setView] = useState<View>("list");
  const [session, setSession] = useState<GuideJlptExamStart | null>(null);
  const [result, setResult] = useState<GuideJlptExamSubmit | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);

  const back = { href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") };

  const examsQ = useQuery({
    queryKey: ["guide", "jlpt-exams", level],
    queryFn: () => guide.jlptExams(level || undefined),
    staleTime: 60_000,
  });
  const historyQ = useQuery({
    queryKey: ["guide", "jlpt-exam-history"],
    queryFn: () => guide.jlptExamHistory(),
    retry: false,
    enabled: view === "list",
  });

  const start = useMutation({
    mutationFn: (examId: string) => guide.jlptExamStart(examId),
    onSuccess: (data) => {
      setSession(data);
      setResult(null);
      setView("taking");
    },
    onError: (err) => {
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后参加模考", "ログインして模試を受ける", "Log in to take the exam") });
        return;
      }
      const ae = err as APIError;
      if (ae.status === 403) {
        pushToast({ kind: "info", message: t("该模考为会员专属", "この模試は会員限定です", "This exam is members-only") });
        return;
      }
      pushToast({ kind: "error", message: ae.message });
    },
  });

  if (view === "taking" && session) {
    return (
      <GuideShell back={back}>
        <ExamRunner
          t={t}
          session={session}
          onExit={() => {
            setView("list");
            setSession(null);
          }}
          onSubmitted={(res) => {
            setResult(res);
            setView("result");
          }}
        />
      </GuideShell>
    );
  }

  if (view === "result" && result) {
    return (
      <GuideShell back={back}>
        <ExamResult
          t={t}
          language={language}
          score={result.score}
          passed={result.passed}
          passScore={result.passScore}
          correct={result.correct}
          total={result.total}
          durationSeconds={result.durationSeconds}
          questions={result.questions}
          disclaimer={result.disclaimer}
          backLabel={t("返回模考列表", "模試一覧へ", "Back to exams")}
          onBack={() => {
            setView("list");
            setSession(null);
            setResult(null);
            examsQ.refetch();
            historyQ.refetch();
          }}
        />
      </GuideShell>
    );
  }

  if (view === "review" && reviewSessionId) {
    return (
      <GuideShell back={back}>
        <SessionReview
          t={t}
          language={language}
          sessionId={reviewSessionId}
          onBack={() => {
            setView("list");
            setReviewSessionId(null);
          }}
        />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={back}>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("模考", "模試", "Mock exam")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("在线模考", "オンライン模試", "Online mock exams")}
        </h1>
      </header>

      <div className="mt-4">
        <LevelPicker
          value={level}
          onChange={setLevel}
          levels={["", ...(JLPT_LEVELS as readonly string[])]}
          allLabel={t("全部", "すべて", "All")}
        />
      </div>

      {examsQ.isLoading ? (
        <InlineLoading />
      ) : examsQ.isError ? (
        <ErrorState />
      ) : !examsQ.data?.exams?.length ? (
        <div className="mt-8 flex min-h-[26vh] flex-col items-center justify-center text-center">
          <GraduationCap className="h-10 w-10 text-[rgb(var(--kx-living-muted))]" />
          <p className="mt-3 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
            {t("该等级暂无模考", "このレベルの模試はまだありません", "No exams for this level yet")}
          </p>
        </div>
      ) : (
        <section className="mt-5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {examsQ.data.exams.map((exam) => (
              <ExamCard key={exam.id} t={t} exam={exam} onStart={() => start.mutate(exam.id)} pending={start.isPending} />
            ))}
          </div>
        </section>
      )}

      {historyQ.data?.sessions?.length ? (
        <section className="mt-8">
          <GuideSectionTitle title={t("历史成绩", "受験履歴", "Past attempts")} />
          <div className="mt-2 space-y-2">
            {historyQ.data.sessions.slice(0, 10).map((h) => (
              <HistoryRow
                key={h.sessionId}
                t={t}
                item={h}
                onOpen={() => {
                  setReviewSessionId(h.sessionId);
                  setView("review");
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <JlptDisclaimer t={t} />
    </GuideShell>
  );
}

function ExamCard({ t, exam, onStart, pending }: { t: Tri; exam: GuideJlptExam; onStart: () => void; pending: boolean }) {
  return (
    <div className="flex flex-col rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-sm font-black text-[rgb(var(--kx-living-accent))]">
          {exam.level}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-black text-[rgb(var(--kx-living-ink))]">
            {exam.title}
            {exam.isMemberOnly ? <Lock className="h-3.5 w-3.5 text-[rgb(var(--kx-living-accent))]" /> : null}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
            <span>{t(`${exam.questionCount} 题`, `${exam.questionCount} 問`, `${exam.questionCount} Q`)}</span>
            <span>
              <Timer className="mr-0.5 inline h-3 w-3" />
              {exam.durationSeconds > 0 ? fmtDuration(exam.durationSeconds) : t("不限时", "時間無制限", "Untimed")}
            </span>
            <span>{t(`合格线 ${exam.passScore}`, `合格 ${exam.passScore}`, `Pass ${exam.passScore}`)}</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={pending}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
        {t("开始模考", "模試を受ける", "Start exam")}
      </button>
    </div>
  );
}

function HistoryRow({ t, item, onOpen }: { t: Tri; item: GuideJlptExamHistoryItem; onOpen: () => void }) {
  // Vocab quizzes are graded but have no per-question review bank; only real
  // exam sessions (examId present) can be re-opened for逐题回看.
  const reviewable = !!item.examId;
  const inner = (
    <>
      <span
        className={[
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-black",
          item.passed ? "bg-emerald-500/[0.14] text-emerald-600 dark:text-emerald-400" : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))]",
        ].join(" ")}
      >
        {item.score}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-bold text-[rgb(var(--kx-living-ink))]">{item.title || item.level}</p>
        <p className="text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
          {item.level} · {item.correct}/{item.total} · {item.startedAt.slice(0, 10)}
        </p>
      </div>
      {item.passed ? <Trophy className="h-4 w-4 shrink-0 text-amber-500" /> : null}
      {reviewable ? <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--kx-living-muted))]" /> : null}
    </>
  );
  if (!reviewable) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3">
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("回看这次模考", "この模試を復習", "Review this attempt")}
      className="flex w-full items-center gap-3 rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3 transition hover:border-[rgb(var(--kx-living-accent))]/40"
    >
      {inner}
    </button>
  );
}

// ── exam runner (timer + answer + submit) ─────────────────────────────────────
function ExamRunner({
  t,
  session,
  onExit,
  onSubmitted,
}: {
  t: Tri;
  session: GuideJlptExamStart;
  onExit: () => void;
  onSubmitted: (res: GuideJlptExamSubmit) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState<number>(session.durationSeconds || 0);

  const submit = useMutation({
    mutationFn: () => guide.jlptExamSubmit(session.sessionId),
    onSuccess: (res) => onSubmitted(res),
    onError: (err) => {
      const ae = err as APIError;
      if (ae.code === "already_submitted") {
        pushToast({ kind: "info", message: t("该考试已提交", "この試験は提出済みです", "Already submitted") });
        onExit();
        return;
      }
      pushToast({ kind: "error", message: ae.message });
    },
  });

  const submitRef = useRef(submit.mutate);
  submitRef.current = submit.mutate;

  // Persist each answer to the server as it's picked (resumable, server grades).
  const pick = useCallback(
    (questionId: string, sel: number) => {
      setAnswers((prev) => ({ ...prev, [questionId]: sel }));
      guide
        .jlptExamAnswer({ sessionId: session.sessionId, questionId, selectedIndex: sel })
        .catch(() => {
          /* best-effort; the answer is still submitted at the end via saved rows */
        });
    },
    [session.sessionId],
  );

  // Countdown timer (only when the exam is timed). Auto-submits at zero.
  useEffect(() => {
    if (!session.durationSeconds) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          submitRef.current();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.durationSeconds]);

  const answeredCount = Object.keys(answers).length;
  const lowTime = session.durationSeconds > 0 && remaining <= 60;

  return (
    <div>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 px-4 pt-1 text-sm font-semibold text-kx-muted hover:text-kx-accent sm:px-6"
      >
        <ArrowLeft className="h-4 w-4" /> {t("退出模考", "模試を終了", "Exit exam")}
      </button>

      <header className="kx-guide-channel-header">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
              {session.level} · {t("模考", "模試", "Exam")}
            </p>
            <h1 className="mt-1 truncate text-lg font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-xl">
              {session.title}
            </h1>
          </div>
          {session.durationSeconds > 0 ? (
            <div
              className={[
                "shrink-0 rounded-xl px-3 py-2 text-center",
                lowTime ? "bg-red-500/[0.12] text-red-600 dark:text-red-400" : "bg-[rgb(var(--kx-living-accent))]/[0.1] text-[rgb(var(--kx-living-accent))]",
              ].join(" ")}
            >
              <Timer className="mx-auto h-4 w-4" />
              <p className="mt-0.5 text-sm font-black tabular-nums">{fmtDuration(remaining)}</p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.08]">
        <div
          className="h-full rounded-full bg-[rgb(var(--kx-living-accent))] transition-all"
          style={{ width: `${session.total ? (answeredCount / session.total) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
        {t(`已答 ${answeredCount} / ${session.total}`, `${answeredCount} / ${session.total} 回答`, `${answeredCount} / ${session.total} answered`)}
      </p>

      <div className="mt-3 space-y-3">
        {session.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            t={t}
            question={q}
            index={i}
            total={session.total}
            selectedIndex={answers[q.id]}
            onSelect={(sel) => pick(q.id, sel)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => submit.mutate()}
        disabled={submit.isPending}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {submit.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
        {answeredCount < session.total
          ? t(`交卷(还有 ${session.total - answeredCount} 题未答)`, `提出(未回答 ${session.total - answeredCount} 問)`, `Submit (${session.total - answeredCount} unanswered)`)
          : t("交卷看成绩", "提出して採点", "Submit for score")}
      </button>

      <JlptDisclaimer t={t} note={session.disclaimer} />
    </div>
  );
}

// ── session review (fetch a past submitted session for逐题回看) ────────────────
function SessionReview({
  t,
  language,
  sessionId,
  onBack,
}: {
  t: Tri;
  language: string;
  sessionId: string;
  onBack: () => void;
}) {
  const sessionQ = useQuery({
    queryKey: ["guide", "jlpt-exam-session", sessionId],
    queryFn: () => guide.jlptExamSession(sessionId),
    retry: false,
  });

  if (sessionQ.isLoading) return <InlineLoading />;
  if (sessionQ.isError || !sessionQ.data) return <ErrorState />;

  const s = sessionQ.data;
  return (
    <ExamResult
      t={t}
      language={language}
      score={s.score}
      passed={s.passed}
      correct={s.correct}
      total={s.total}
      durationSeconds={s.durationSeconds}
      questions={s.questions}
      disclaimer={s.disclaimer}
      backLabel={t("返回历史成绩", "履歴に戻る", "Back to history")}
      onBack={onBack}
    />
  );
}

// ── exam result / review (shared by post-submit result + past-session回看) ──────
function ExamResult({
  t,
  language,
  score,
  passed,
  passScore,
  correct,
  total,
  durationSeconds,
  questions,
  disclaimer,
  backLabel,
  onBack,
}: {
  t: Tri;
  language: string;
  score: number;
  passed: boolean;
  passScore?: number;
  correct: number;
  total: number;
  durationSeconds: number;
  questions: GuideJlptQuestion[];
  disclaimer?: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("成绩", "結果", "Result")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {passed ? t("恭喜通过!", "合格おめでとう!", "Passed!") : t("再接再厉", "次回に向けて", "Keep going")}
        </h1>
      </header>

      <div
        className={[
          "mt-4 rounded-2xl border p-6 text-center",
          passed
            ? "border-emerald-500/30 bg-emerald-500/[0.08]"
            : "border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08]",
        ].join(" ")}
      >
        <p className={["text-5xl font-black", passed ? "text-emerald-600 dark:text-emerald-400" : "text-[rgb(var(--kx-living-accent))]"].join(" ")}>
          {score}
        </p>
        <p className="mt-2 text-sm font-bold text-[rgb(var(--kx-living-ink))]">
          {t(`答对 ${correct} / ${total}`, `${correct} / ${total} 正解`, `${correct} / ${total} correct`)}
          {typeof passScore === "number" ? (
            <>
              {" · "}
              {t(`合格线 ${passScore}`, `合格 ${passScore}`, `Pass ${passScore}`)}
            </>
          ) : null}
          {" · "}
          {fmtDuration(durationSeconds)}
        </p>
      </div>

      <GuideSectionTitle title={t("逐题回看", "問題ごとの復習", "Question review")} />
      <div className="mt-2 space-y-3">
        {questions.map((q, i) => (
          <div key={q.id}>
            <QuestionCard
              t={t}
              question={q}
              index={i}
              total={questions.length}
              selectedIndex={q.selectedIndex}
              revealed
            />
            <ExplainButton t={t} questionId={q.id} language={language} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-6 w-full rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] px-5 py-3 text-sm font-black text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
      >
        <History className="mr-1.5 inline h-4 w-4" /> {backLabel}
      </button>

      <JlptDisclaimer t={t} note={disclaimer} />
    </div>
  );
}
