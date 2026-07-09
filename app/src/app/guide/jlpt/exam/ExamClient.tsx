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
  JlptNarrow,
  JlptPageHeader,
  JlptStateCard,
  JlptScoreHero,
  JlptProgress,
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
        <JlptNarrow>
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
        </JlptNarrow>
      </GuideShell>
    );
  }

  if (view === "result" && result) {
    return (
      <GuideShell back={back}>
        <JlptNarrow>
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
        </JlptNarrow>
      </GuideShell>
    );
  }

  if (view === "review" && reviewSessionId) {
    return (
      <GuideShell back={back}>
        <JlptNarrow>
          <SessionReview
            t={t}
            language={language}
            sessionId={reviewSessionId}
            onBack={() => {
              setView("list");
              setReviewSessionId(null);
            }}
          />
        </JlptNarrow>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={back}>
      <JlptNarrow>
        <JlptPageHeader
          eyebrow={`JLPT · ${t("模考", "模試", "Mock exam")}`}
          title={t("在线模考", "オンライン模試", "Online mock exams")}
          subtitle={t("限时组卷,交卷即出分与逐题解析。", "時間制限つきで採点し、問題ごとに解説。", "Timed papers — scoring and per-question review on submit.")}
        />

        <div className="mt-6">
          <LevelPicker
            value={level}
            onChange={setLevel}
            levels={["", ...(JLPT_LEVELS as readonly string[])]}
            allLabel={t("全部", "すべて", "All")}
          />
        </div>

        {examsQ.isLoading ? (
          <div className="mt-6">
            <InlineLoading />
          </div>
        ) : examsQ.isError ? (
          <div className="mt-6">
            <ErrorState />
          </div>
        ) : !examsQ.data?.exams?.length ? (
          <JlptStateCard
            icon={GraduationCap}
            title={t("该等级暂无模考", "このレベルの模試はまだありません", "No exams for this level yet")}
            body={t("换个等级看看,或先去刷题。", "他のレベルを見るか、まず演習しましょう。", "Try another level, or start with practice.")}
          />
        ) : (
          <section className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      </JlptNarrow>
    </GuideShell>
  );
}

function ExamCard({ t, exam, onStart, pending }: { t: Tri; exam: GuideJlptExam; onStart: () => void; pending: boolean }) {
  return (
    <div className="flex flex-col rounded-[22px] border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] p-[18px] shadow-[0_20px_44px_-40px_rgb(var(--kx-shadow)/0.7)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/35 hover:shadow-[0_26px_52px_-34px_rgb(var(--kx-shadow)/0.7)]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--kx-living-accent))]/[0.1] text-sm font-black text-[rgb(var(--kx-living-accent))]">
          {exam.level}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-black leading-tight text-[rgb(var(--kx-living-ink))]">
            {exam.title}
            {exam.isMemberOnly ? <Lock className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--kx-living-accent))]" /> : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] px-2 py-0.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
              {t(`${exam.questionCount} 题`, `${exam.questionCount} 問`, `${exam.questionCount} Q`)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] px-2 py-0.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
              <Timer className="h-3 w-3" />
              {exam.durationSeconds > 0 ? fmtDuration(exam.durationSeconds) : t("不限时", "時間無制限", "Untimed")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] px-2 py-0.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
              {t(`合格线 ${exam.passScore}`, `合格 ${exam.passScore}`, `Pass ${exam.passScore}`)}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={pending}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-4 py-2.5 text-sm font-black text-white shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.9)] transition hover:opacity-90 disabled:opacity-60"
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
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black tabular-nums",
          item.passed ? "bg-emerald-500/[0.14] text-emerald-600 dark:text-emerald-400" : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))]",
        ].join(" ")}
      >
        {item.score}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-black text-[rgb(var(--kx-living-ink))]">{item.title || item.level}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
          {item.level} · {item.correct}/{item.total} · {item.startedAt.slice(0, 10)}
        </p>
      </div>
      {item.passed ? <Trophy className="h-4 w-4 shrink-0 text-amber-500" /> : null}
      {reviewable ? <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--kx-living-muted))]" /> : null}
    </>
  );
  if (!reviewable) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] px-4 py-3 shadow-[0_16px_38px_-38px_rgb(var(--kx-shadow)/0.7)]">
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("回看这次模考", "この模試を復習", "Review this attempt")}
      className="flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] px-4 py-3 shadow-[0_16px_38px_-38px_rgb(var(--kx-shadow)/0.7)] transition hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/40"
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

  // Wall-clock start, captured once at mount. The countdown is derived from the
  // real elapsed time rather than a per-second decrement, so a backgrounded
  // (throttled) tab can't let the timer drift slow.
  const startedAt = useRef<number>(Date.now());
  // The most recent answer-save promise. Auto-submit waits on this so a
  // last-second pick isn't dropped by the server's saved-rows scoring.
  const lastAnswerSave = useRef<Promise<unknown>>(Promise.resolve());
  const submitting = useRef(false);

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
    // Allow a retry if a submit fails — clear the in-flight guard.
    onSettled: () => {
      submitting.current = false;
    },
  });

  const submitRef = useRef(submit.mutate);
  submitRef.current = submit.mutate;

  // Persist each answer to the server as it's picked (resumable, server grades).
  const pick = useCallback(
    (questionId: string, sel: number) => {
      setAnswers((prev) => ({ ...prev, [questionId]: sel }));
      lastAnswerSave.current = guide
        .jlptExamAnswer({ sessionId: session.sessionId, questionId, selectedIndex: sel })
        .catch(() => {
          /* best-effort; the answer is still submitted at the end via saved rows */
        });
    },
    [session.sessionId],
  );

  // Single submit path (manual + auto). Flush the last answer save first, then
  // grade — and guard against a double submit (e.g. clicking as the timer hits 0).
  const doSubmit = useCallback(() => {
    if (submitting.current) return;
    submitting.current = true;
    Promise.resolve(lastAnswerSave.current).finally(() => submitRef.current());
  }, []);

  // Countdown timer (only when the exam is timed). Auto-submits at zero.
  useEffect(() => {
    if (!session.durationSeconds) return;
    const total = session.durationSeconds;
    const tick = () => {
      const left = Math.max(0, Math.ceil(total - (Date.now() - startedAt.current) / 1000));
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        doSubmit();
      }
    };
    const id = window.setInterval(tick, 500);
    tick();
    return () => window.clearInterval(id);
  }, [session.durationSeconds, doSubmit]);

  const answeredCount = Object.keys(answers).length;
  const lowTime = session.durationSeconds > 0 && remaining <= 60;

  return (
    <div>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {t("退出模考", "模試を終了", "Exit exam")}
      </button>

      <JlptPageHeader
        eyebrow={`${session.level} · ${t("模考", "模試", "Exam")}`}
        title={session.title}
        right={
          session.durationSeconds > 0 ? (
            <div
              className={[
                "flex items-center gap-2 rounded-2xl px-3.5 py-2.5 ring-1 transition",
                lowTime
                  ? "bg-red-500/[0.1] text-red-600 ring-red-500/25 dark:text-red-400"
                  : "bg-[rgb(var(--kx-living-accent))]/[0.1] text-[rgb(var(--kx-living-accent))] ring-[rgb(var(--kx-living-accent))]/20",
              ].join(" ")}
            >
              <Timer className={["h-4 w-4", lowTime ? "animate-pulse" : ""].join(" ")} />
              <span className="text-[17px] font-black leading-none tabular-nums">{fmtDuration(remaining)}</span>
            </div>
          ) : null
        }
      />

      <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-bg))]/85 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <JlptProgress
          value={answeredCount}
          total={session.total}
          label={t(`已答 ${answeredCount} / ${session.total}`, `${answeredCount} / ${session.total} 回答`, `${answeredCount} / ${session.total} answered`)}
        />
      </div>

      <div className="mt-4 space-y-3">
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
        onClick={doSubmit}
        disabled={submit.isPending}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_32px_-18px_rgb(var(--kx-living-accent)/0.9)] transition hover:opacity-90 disabled:opacity-60"
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
  // The session response carries no pass threshold, so we look it up from the
  // exam catalog to keep the "合格线 N" line consistent with the post-submit
  // result view. Shares the list view's "All" cache (level ""); best-effort — if
  // the exam is no longer in the catalog the line is simply omitted (no change
  // from before).
  const examsQ = useQuery({
    queryKey: ["guide", "jlpt-exams", ""],
    queryFn: () => guide.jlptExams(""),
    staleTime: 300_000,
  });

  if (sessionQ.isLoading) return <InlineLoading />;
  if (sessionQ.isError || !sessionQ.data) return <ErrorState />;

  const s = sessionQ.data;
  const passScore = examsQ.data?.exams?.find((e) => e.id === s.examId)?.passScore;
  return (
    <ExamResult
      t={t}
      language={language}
      score={s.score}
      passed={s.passed}
      passScore={passScore}
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
      <JlptPageHeader
        eyebrow={`JLPT · ${t("成绩", "結果", "Result")}`}
        title={passed ? t("恭喜通过!", "合格おめでとう!", "Passed!") : t("再接再厉", "次回に向けて", "Keep going")}
      />

      <div className="mt-6">
        <JlptScoreHero
          t={t}
          score={score}
          pass={passed}
          passLabel={t("已通过", "合格", "Passed")}
          failLabel={t("未通过", "不合格", "Not passed")}
          metaLine={`${t(`答对 ${correct} / ${total}`, `${correct} / ${total} 正解`, `${correct} / ${total} correct`)} · ${fmtDuration(durationSeconds)}`}
          passScore={typeof passScore === "number" ? passScore : undefined}
        />
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
        className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-5 py-3 text-sm font-black text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40"
      >
        <History className="h-4 w-4" /> {backLabel}
      </button>

      <JlptDisclaimer t={t} note={disclaimer} />
    </div>
  );
}
