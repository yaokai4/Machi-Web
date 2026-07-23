"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GraduationCap, Loader, Lock, Timer, ArrowLeft, History, Trophy, ChevronRight, ChevronDown, Coins, ListChecks, NotebookPen } from "lucide-react";
import {
  guide,
  type GuideJlptExam,
  type GuideJlptExamStart,
  type GuideJlptExamSubmit,
  type GuideJlptExamHistoryItem,
  type GuideJlptExamPreflight,
  type GuideJlptPaperAttempt,
  type GuideJlptQuestion,
  type GuideJlptScaledResult,
} from "@/lib/guide";
import { ScaledScorePanel } from "./ScaledScorePanel";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useToasts } from "@/lib/store";
import { GuideShell, GuideSectionTitle } from "@/components/guide/GuideKit";
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
  JlptPageSkeleton,
  JlptErrorCard,
  JlptStickyBar,
  JLPT_BTN_PRIMARY,
  JLPT_BTN_GHOST,
  JLPT_CARD,
  JLPT_LEVELS,
  levelDifficulty,
  fmtDuration,
  type Tri,
} from "../JlptKit";
import {
  answerInputLocked,
  examDeadlineReached,
  fullAnswerSnapshot,
  localizedScoreDivisionLabel,
  localizedScoreReferenceNote,
  newExamStartKey,
  normalizeListeningPolicy,
  resolvePaperSectionIndex,
  restoreAuthoritativeJlptSession,
  retryTransientJlptWrite,
  restoredAnswerState,
} from "./examContract";

type View = "list" | "taking" | "result" | "review" | "paper";

// 历史成绩 default row cap; 「查看全部」 expands to the full (filtered) list.
const HISTORY_COLLAPSED_ROWS = 6;
type ConfirmedStart = {
  exam: GuideJlptExam;
  preflight: GuideJlptExamPreflight;
  requestKey: string;
};
type ExamStartReceipt = {
  requestKey: string;
  confirmedChargeCoins: number;
};

export function ExamClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);

  const [level, setLevel] = useState<string>("");
  const [historyLevel, setHistoryLevel] = useState<string>("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [view, setView] = useState<View>("list");
  const [session, setSession] = useState<GuideJlptExamStart | null>(null);
  const [result, setResult] = useState<GuideJlptExamSubmit | null>(null);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [confirmedStart, setConfirmedStart] = useState<ConfirmedStart | null>(null);
  const [sessionStartReceipt, setSessionStartReceipt] = useState<ExamStartReceipt | null>(null);
  const preflightEpoch = useRef(0);

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

  const preflight = useMutation({
    mutationFn: ({ exam }: { exam: GuideJlptExam; epoch: number }) =>
      guide.jlptExamPreflight(exam.id),
    onSuccess: (data, request) => {
      if (request.epoch !== preflightEpoch.current) return;
      setConfirmedStart({
        exam: request.exam,
        preflight: data,
        requestKey: newExamStartKey(request.exam.id),
      });
    },
    onError: (err, request) => {
      if (request.epoch !== preflightEpoch.current) return;
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后参加模考", "ログインして模試を受ける", "Log in to take the exam") });
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    },
  });

  const start = useMutation({
    mutationFn: (request: ConfirmedStart) =>
      guide.jlptExamStart(request.exam.id, {
        confirmedChargeCoins: request.preflight.requiredCoins,
        requestKey: request.requestKey,
      }),
    onSuccess: (data, request) => {
      setConfirmedStart(null);
      setSessionStartReceipt({
        requestKey: request.requestKey,
        confirmedChargeCoins: request.preflight.requiredCoins,
      });
      setSession(data);
      setResult(null);
      setView("taking");
    },
    onError: (err, request) => {
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后参加模考", "ログインして模試を受ける", "Log in to take the exam") });
        return;
      }
      const ae = err as APIError;
      if (ae.code === "exam_price_changed") {
        setConfirmedStart(null);
        pushToast({ kind: "info", message: t("价格或权益已变化，请重新确认。", "価格または権利が変更されました。再確認してください。", "Price or access changed. Please confirm again.") });
        const epoch = ++preflightEpoch.current;
        preflight.mutate({ exam: request.exam, epoch });
        return;
      }
      if (ae.status === 403) {
        pushToast({ kind: "info", message: t("该模考为会员专属", "この模試は会員限定です", "This exam is members-only") });
        return;
      }
      if (ae.status === 402 || ae.code === "EXAM_INSUFFICIENT_COINS") {
        pushToast({ kind: "info", message: t("Machi 币不足，请到「钱包」充值后再开考。", "Machi コインが不足しています。ウォレットでチャージしてください。", "Not enough Machi Coins — top up in your wallet first.") });
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
            resumeStart={sessionStartReceipt}
            onExit={() => {
              setView("list");
              setSession(null);
              setSessionStartReceipt(null);
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
            scaled={result.scaled}
            correct={result.correct}
            total={result.total}
            durationSeconds={result.durationSeconds}
            questions={result.questions}
            disclaimer={result.disclaimer}
            backLabel={t("返回模考列表", "模試一覧へ", "Back to exams")}
            onBack={() => {
              setView("list");
              setSession(null);
              setSessionStartReceipt(null);
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

  if (view === "paper" && paperId) {
    return (
      <GuideShell back={back}>
        <JlptNarrow>
          <PaperFlow
            t={t}
            language={language}
            paperId={paperId}
            onOpenReview={(sid) => {
              setReviewSessionId(sid);
              setView("review");
            }}
            onExit={() => {
              setView("list");
              setPaperId(null);
              examsQ.refetch();
              historyQ.refetch();
            }}
          />
        </JlptNarrow>
      </GuideShell>
    );
  }

  // ── 历史成绩: pure frontend grouping of the already-fetched history payload
  // (no new endpoint). Chips only list levels that actually have records, and
  // a vanished level (e.g. after refetch) falls back to 全部 instead of an
  // empty list.
  const historySessions = historyQ.data?.sessions ?? [];
  const historyLevels = (JLPT_LEVELS as readonly string[]).filter((lv) =>
    historySessions.some((h) => h.level === lv),
  );
  const activeHistoryLevel = historyLevels.includes(historyLevel) ? historyLevel : "";
  const filteredHistory = activeHistoryLevel
    ? historySessions.filter((h) => h.level === activeHistoryLevel)
    : historySessions;
  const visibleHistory = historyExpanded
    ? filteredHistory
    : filteredHistory.slice(0, HISTORY_COLLAPSED_ROWS);

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
            onChange={(nextLevel) => {
              setLevel(nextLevel);
              preflightEpoch.current += 1;
              setConfirmedStart(null);
            }}
            levels={["", ...(JLPT_LEVELS as readonly string[])]}
            allLabel={t("全部", "すべて", "All")}
          />
        </div>

        {confirmedStart ? (
          <StartConfirmation
            t={t}
            title={confirmedStart.exam.title}
            preflight={confirmedStart.preflight}
            pending={start.isPending}
            onCancel={() => setConfirmedStart(null)}
            onConfirm={() => start.mutate(confirmedStart)}
          />
        ) : null}

        {examsQ.isLoading ? (
          <JlptPageSkeleton t={t} variant="list" />
        ) : examsQ.isError ? (
          <JlptErrorCard
            t={t}
            onRetry={() => examsQ.refetch()}
            retrying={examsQ.isFetching}
            title={t("模考列表加载失败", "模試一覧を読み込めませんでした", "Couldn't load the exam list")}
          />
        ) : !examsQ.data?.exams?.length ? (
          <JlptStateCard
            icon={GraduationCap}
            title={t("该等级暂无模考", "このレベルの模試はまだありません", "No exams for this level yet")}
            body={t("换个等级看看,或先去刷题。", "他のレベルを見るか、まず演習しましょう。", "Try another level, or start with practice.")}
            action={
              <Link href="/guide/jlpt/practice" className={JLPT_BTN_PRIMARY}>
                <ListChecks className="h-4 w-4" />
                {t("先去刷题", "演習をする", "Practice instead")}
              </Link>
            }
          />
        ) : (
          <section className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {examsQ.data.exams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  t={t}
                  exam={exam}
                  onStart={() => {
                    if (exam.isPaper) {
                      setConfirmedStart(null);
                      setPaperId(exam.id);
                      setView("paper");
                    } else {
                      const epoch = ++preflightEpoch.current;
                      preflight.mutate({ exam, epoch });
                    }
                  }}
                  pending={start.isPending || preflight.isPending}
                />
              ))}
            </div>
          </section>
        )}

        {historySessions.length ? (
          <section className="mt-8">
            <GuideSectionTitle
              title={t("历史成绩", "受験履歴", "Past attempts")}
              subtitle={t(`共 ${historySessions.length} 次记录`, `全 ${historySessions.length} 件`, `${historySessions.length} attempts`)}
            />
            {historyLevels.length > 1 ? (
              <div className="mb-1">
                <LevelPicker
                  value={activeHistoryLevel}
                  onChange={setHistoryLevel}
                  levels={["", ...historyLevels]}
                  allLabel={t("全部", "すべて", "All")}
                />
              </div>
            ) : null}
            <div className="mt-2 space-y-2">
              {visibleHistory.map((h) => (
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
            {filteredHistory.length > HISTORY_COLLAPSED_ROWS ? (
              <button
                type="button"
                onClick={() => setHistoryExpanded((v) => !v)}
                aria-expanded={historyExpanded}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] px-4 py-2.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]"
              >
                <ChevronDown
                  className={["h-3.5 w-3.5 transition-transform motion-reduce:transition-none", historyExpanded ? "rotate-180" : ""].join(" ")}
                />
                {historyExpanded
                  ? t("收起", "折りたたむ", "Show less")
                  : t(`查看全部 ${filteredHistory.length} 条`, `全 ${filteredHistory.length} 件を表示`, `View all ${filteredHistory.length}`)}
              </button>
            ) : null}
          </section>
        ) : null}

        <JlptDisclaimer t={t} />
      </JlptNarrow>
    </GuideShell>
  );
}

function StartConfirmation({
  t,
  title,
  preflight,
  pending,
  onCancel,
  onConfirm,
}: {
  t: Tri;
  title: string;
  preflight: GuideJlptExamPreflight;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const locked = preflight.accessDecision === "LOCKED";
  const confirmationCopy = preflight.oneTimePaperPayment
    ? preflight.requiredCoins > 0
      ? t(
          `本次完整卷一次扣除 ${preflight.requiredCoins} Machi 币，后续科目不再扣费。`,
          `この模試全体で ${preflight.requiredCoins} Machi コインを一度だけ消費し、後続科目では再課金しません。`,
          `This full paper charges ${preflight.requiredCoins} Machi Coins once; later sections are not charged again.`,
        )
      : t(
          "本次完整卷已解锁，可以继续当前科目，不会重复扣费。",
          "この模試はすでに利用可能です。現在の科目から再開でき、二重課金されません。",
          "This full paper is already unlocked. Resume the current section without another charge.",
        )
    : preflight.requiredCoins > 0
      ? t(
          `本次开考将扣除 ${preflight.requiredCoins} Machi 币。`,
          `開始時に ${preflight.requiredCoins} Machi コインを消費します。`,
          `Starting this attempt charges ${preflight.requiredCoins} Machi Coins.`,
        )
      : t("本次考试免费。", "この試験は無料です。", "This attempt is free.");
  const accessSource = (() => {
    switch (preflight.unlockSource) {
      case "paper_attempt":
        return t("已解锁整卷", "模試全体を解放済み", "Paper already unlocked");
      case "exam_attempt":
        return t("已有考试进度", "受験中の進捗あり", "Existing attempt");
      case "membership":
      case "member":
        return t("会员权益", "会員特典", "Membership");
      case "free":
        return t("免费考试", "無料試験", "Free attempt");
      case "locked":
        return t("暂未解锁", "未解放", "Locked");
      default:
        return t("Machi 币", "Machi コイン", "Machi Coins");
    }
  })();
  const refundPolicyCopy = t(
    "开考后不自动退款；若因平台故障无法作答，可依据审计记录申请人工冲正。",
    "開始後の自動返金はありません。プラットフォーム障害で受験できない場合は、監査記録に基づき個別対応を申請できます。",
    "Attempts are not automatically refunded after starting. If a platform failure prevents completion, support can review the audit trail for a manual reversal.",
  );
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.scrollIntoView({ block: "nearest" });
    headingRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);
  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal={false}
      aria-labelledby="jlpt-start-confirm-title"
      aria-describedby="jlpt-start-confirm-copy jlpt-start-refund-policy"
      className={[JLPT_CARD, "mt-5 border-[rgb(var(--kx-living-accent))]/25 p-5 sm:p-6"].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
        {t("开考前确认", "受験前の確認", "Confirm before starting")}
      </p>
      <h2
        ref={headingRef}
        id="jlpt-start-confirm-title"
        tabIndex={-1}
        className="mt-1.5 text-lg font-bold text-[rgb(var(--kx-living-ink))] outline-none"
      >
        {title}
      </h2>
      <p id="jlpt-start-confirm-copy" className="mt-2 text-sm leading-relaxed text-[rgb(var(--kx-living-muted))]">
        {confirmationCopy}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("本次扣除", "今回の消費", "Charge now"), `${preflight.requiredCoins}`],
          [t("当前余额", "現在残高", "Balance"), `${preflight.balance}`],
          [t("会员价", "会員価格", "Member price"), `${preflight.memberCoinCost}`],
          [t("解锁来源", "利用権", "Access source"), accessSource],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.04] px-3 py-2.5">
            <p className="text-[10px] font-medium text-[rgb(var(--kx-living-muted))]">{label}</p>
            <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-[rgb(var(--kx-living-ink))]">{value}</p>
          </div>
        ))}
      </div>
      {preflight.shortfall > 0 ? (
        <p className="mt-3 rounded-2xl bg-amber-500/[0.12] px-3.5 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {t(`还差 ${preflight.shortfall} Machi 币，请先到钱包充值。`, `${preflight.shortfall} Machi コイン不足しています。先にウォレットでチャージしてください。`, `You need ${preflight.shortfall} more Machi Coins. Top up your wallet first.`)}
        </p>
      ) : null}
      {locked ? (
        <p className="mt-3 rounded-2xl bg-[rgb(var(--kx-living-accent))]/[0.08] px-3.5 py-2.5 text-xs font-semibold text-[rgb(var(--kx-living-accent))]">
          {t("当前账户没有这场考试的访问权限。", "この試験へのアクセス権がありません。", "Your account does not have access to this exam.")}
        </p>
      ) : null}
      <p id="jlpt-start-refund-policy" className="mt-3 text-[11px] leading-relaxed text-[rgb(var(--kx-living-muted))]">
        {refundPolicyCopy}
      </p>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={["py-2.5", JLPT_BTN_GHOST].join(" ")}
        >
          {t("取消", "キャンセル", "Cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || !preflight.canStart}
          className={["py-2.5", JLPT_BTN_PRIMARY].join(" ")}
        >
          {pending ? <Loader className="h-4 w-4 animate-spin" /> : preflight.requiredCoins > 0 ? <Coins className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
          {preflight.requiredCoins > 0
            ? t(`确认扣除 ${preflight.requiredCoins} 币并开考`, `${preflight.requiredCoins} コインで開始`, `Pay ${preflight.requiredCoins} and start`)
            : t("确认并继续", "確認して続ける", "Confirm and continue")}
        </button>
      </div>
    </section>
  );
}

function ExamCard({ t, exam, onStart, pending }: { t: Tri; exam: GuideJlptExam; onStart: () => void; pending: boolean }) {
  // Level badge deepens with difficulty — same controlled ramp as the ladder.
  const tint = 0.1 + (levelDifficulty(exam.level) - 1) * 0.035;
  return (
    <div className={[JLPT_CARD, "flex flex-col p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/30 hover:shadow-[0_28px_56px_-38px_rgb(var(--kx-shadow)/0.6)] motion-reduce:hover:translate-y-0"].join(" ")}>
      <div className="flex items-start gap-3.5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[15px] font-black text-[rgb(var(--kx-living-accent))]"
          style={{ background: `rgb(var(--kx-living-accent) / ${tint})` }}
        >
          {exam.level}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-bold leading-snug text-[rgb(var(--kx-living-ink))]">
            {exam.title}
            {exam.isMemberOnly ? <Lock className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--kx-living-accent))]" aria-label={t("会员专属", "会員限定", "Members only")} /> : null}
          </p>
          {/* One quiet meta line instead of a chip pile-up. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[rgb(var(--kx-living-muted))]">
            <span className="tabular-nums">{t(`${exam.questionCount} 题`, `${exam.questionCount} 問`, `${exam.questionCount} questions`)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Timer className="h-3 w-3" />
              {exam.durationSeconds > 0 ? fmtDuration(exam.durationSeconds) : t("不限时", "時間無制限", "Untimed")}
            </span>
            <span aria-hidden>·</span>
            <span>
              {exam.isPaper || exam.scoreMode === "jlpt_scaled"
                ? t("JLPT 标准出分", "JLPT 準拠採点", "JLPT-style scoring")
                : t(`合格线 ${exam.passScore}`, `合格 ${exam.passScore}`, `Pass ${exam.passScore}`)}
            </span>
          </p>
          {(exam.isPaper && exam.sectionCount) || (exam.coinCost && exam.coinCost > 0) ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {exam.isPaper && exam.sectionCount ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--kx-living-accent))]/[0.1] px-2.5 py-1 text-[11px] font-bold text-[rgb(var(--kx-living-accent))]">
                  {t(`分科整卷 · ${exam.sectionCount} 科`, `分野別 · ${exam.sectionCount} 科目`, `${exam.sectionCount} timed sections`)}
                </span>
              ) : null}
              {exam.coinCost && exam.coinCost > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/[0.12] px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  <Coins className="h-3 w-3" />
                  {exam.coinCost}
                  {exam.coinCostMember && exam.coinCostMember < exam.coinCost
                    ? t(` · 会员 ${exam.coinCostMember}`, ` · 会員 ${exam.coinCostMember}`, ` · Member ${exam.coinCostMember}`)
                    : ""}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={pending}
        className={["mt-4 w-full py-2.5", JLPT_BTN_PRIMARY].join(" ")}
      >
        {pending ? <Loader className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
        {t("开始模考", "模試を受ける", "Start exam")}
      </button>
    </div>
  );
}

// ── 分科整卷流转（父卷 → 逐段独立计时 → 中间休息 → 合并成绩）──────────────────
function PaperFlow({
  t,
  language,
  paperId,
  onExit,
  onOpenReview,
}: {
  t: Tri;
  language: string;
  paperId: string;
  onExit: () => void;
  onOpenReview: (sessionId: string) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const [phase, setPhase] = useState<"intro" | "section" | "break" | "result">("intro");
  const [idx, setIdx] = useState(0);
  const [section, setSection] = useState<GuideJlptExamStart | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [confirmedStart, setConfirmedStart] = useState<ConfirmedStart | null>(null);
  const [sectionStartReceipt, setSectionStartReceipt] = useState<ExamStartReceipt | null>(null);

  const paperQ = useQuery({
    queryKey: ["guide", "jlpt-paper", paperId],
    queryFn: () => guide.jlptPaper(paperId),
    staleTime: 60_000,
  });
  const sections = paperQ.data?.sections ?? [];

  const preflight = useMutation({
    mutationFn: (exam: GuideJlptExam) => guide.jlptExamPreflight(exam.id),
    onSuccess: (data, requestedExam) => {
      const progress = data.paperAttempt as GuideJlptPaperAttempt;
      const nextIndex = resolvePaperSectionIndex(
        sections,
        progress?.id
          ? progress
          : {
              currentSectionExamId: data.currentSectionExamId,
              currentSectionIndex: 0,
            },
      );
      const target = sections[nextIndex] ?? requestedExam;
      setIdx(nextIndex);
      if (progress?.id) setAttemptId(progress.id);
      setConfirmedStart({
        exam: target,
        preflight: data,
        requestKey: newExamStartKey(target.id),
      });
    },
    onError: (err) => {
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后参加模考", "ログインして模試を受ける", "Log in to take the exam") });
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    },
  });

  const startSection = useMutation({
    mutationFn: (request: ConfirmedStart) =>
      guide.jlptExamStart(request.exam.id, {
        confirmedChargeCoins: request.preflight.requiredCoins,
        requestKey: request.requestKey,
      }),
    onSuccess: (data, request) => {
      setConfirmedStart(null);
      setSectionStartReceipt({
        requestKey: request.requestKey,
        confirmedChargeCoins: request.preflight.requiredCoins,
      });
      if (data.paperAttempt?.id) {
        setAttemptId(data.paperAttempt.id);
        setIdx(resolvePaperSectionIndex(sections, data.paperAttempt));
      }
      setSection(data);
      setPhase("section");
    },
    onError: (err, request) => {
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后参加模考", "ログインして模試を受ける", "Log in to take the exam") });
        return;
      }
      const ae = err as APIError;
      if (ae.code === "exam_price_changed" || ae.code === "paper_section_out_of_order") {
        setConfirmedStart(null);
        pushToast({ kind: "info", message: t("考试状态已变化，正在重新读取当前科目与价格。", "試験状態が変わりました。現在の科目と価格を再確認します。", "Exam state changed. Refreshing the current section and price.") });
        preflight.mutate(request.exam);
        return;
      }
      if (ae.status === 403) {
        pushToast({ kind: "info", message: t("该科目为会员专属", "この科目は会員限定です", "This section is members-only") });
        return;
      }
      if (ae.status === 402 || ae.code === "EXAM_INSUFFICIENT_COINS") {
        pushToast({ kind: "info", message: t("Machi 币不足，请到「钱包」充值后再开考。", "Machi コインが不足しています。ウォレットでチャージしてください。", "Not enough Machi Coins — top up in your wallet first.") });
        return;
      }
      pushToast({ kind: "error", message: ae.message });
    },
  });

  if (paperQ.isLoading) return <JlptPageSkeleton t={t} variant="rows" />;
  if (paperQ.isError || !paperQ.data) {
    return (
      <JlptErrorCard
        t={t}
        onRetry={() => paperQ.refetch()}
        retrying={paperQ.isFetching}
        title={t("整卷信息加载失败", "模試情報を読み込めませんでした", "Couldn't load this paper")}
        secondary={
          <button type="button" onClick={onExit} className={JLPT_BTN_GHOST}>
            {t("返回列表", "一覧へ", "Back to list")}
          </button>
        }
      />
    );
  }

  if (confirmedStart) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirmedStart(null)}
          disabled={startSection.isPending}
          className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回整卷说明", "試験案内へ戻る", "Back to paper details")}
        </button>
        <StartConfirmation
          t={t}
          title={confirmedStart.exam.title}
          preflight={confirmedStart.preflight}
          pending={startSection.isPending}
          onCancel={() => setConfirmedStart(null)}
          onConfirm={() => startSection.mutate(confirmedStart)}
        />
      </div>
    );
  }

  const advance = (submitted: GuideJlptExamSubmit) => {
    const progress = submitted.paperAttempt;
    if (progress?.id) {
      setAttemptId(progress.id);
      if (progress.status === "completed") {
        setPhase("result");
        return;
      }
      setIdx(resolvePaperSectionIndex(sections, progress));
      setSection(null);
      setPhase("break");
      return;
    }
    if (idx + 1 < sections.length) {
      setIdx(idx + 1);
      setSection(null);
      setPhase("break");
      return;
    }
    setPhase("result");
  };

  // 逐段答题：复用单卷 ExamRunner（含听力音频播放器 via QuestionCard）。
  if (phase === "section" && section) {
    return (
      <ExamRunner
        t={t}
        session={section}
        resumeStart={sectionStartReceipt}
        onExit={onExit}
        onSubmitted={advance}
      />
    );
  }

  const cur = sections[idx];
  const paperTitle = paperQ.data.paper.title;

  // 中间休息屏：真实 JLPT 各科之间的过渡。
  if (phase === "break" && cur) {
    return (
      <div>
        <JlptPageHeader eyebrow={paperTitle} title={t("下一科目", "次の科目", "Next section")} />
        <div className={[JLPT_CARD, "mt-6 rounded-[28px] px-6 py-9 text-center"].join(" ")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
            {t(`第 ${idx + 1} / ${sections.length} 科`, `${idx + 1} / ${sections.length} 科目`, `Section ${idx + 1} / ${sections.length}`)}
          </p>
          <p className="mt-2 text-xl font-black tracking-[-0.01em] text-[rgb(var(--kx-living-ink))]">{cur.title}</p>
          <p className="mt-1.5 text-sm text-[rgb(var(--kx-living-muted))]">
            {cur.section === "listening"
              ? t("聴解：本科目含听力音频，请准备好耳机。", "聴解：音声問題があります。イヤホンをご準備ください。", "Listening: this section includes audio — headphones recommended.")
              : t(`${cur.questionCount} 题 · ${fmtDuration(cur.durationSeconds)}`, `${cur.questionCount} 問 · ${fmtDuration(cur.durationSeconds)}`, `${cur.questionCount} Q · ${fmtDuration(cur.durationSeconds)}`)}
          </p>
          <button
            type="button"
            onClick={() => preflight.mutate(cur)}
            disabled={startSection.isPending || preflight.isPending}
            className={["mt-6 px-7", JLPT_BTN_PRIMARY].join(" ")}
          >
            {startSection.isPending || preflight.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
            {t("开始本科目", "この科目を開始", "Start this section")}
          </button>
        </div>
        <JlptDisclaimer t={t} />
      </div>
    );
  }

  if (phase === "result") {
    return <PaperResult t={t} language={language} paperId={paperId} attemptId={attemptId} onExit={onExit} onOpenReview={onOpenReview} />;
  }

  // intro：整卷概览 + 各科目一览。
  return (
    <div>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {t("返回列表", "一覧へ", "Back")}
      </button>
      <JlptPageHeader
        eyebrow={`JLPT · ${paperQ.data.paper.level}`}
        title={paperTitle}
        subtitle={t(`按官方结构分 ${sections.length} 段独立计时，全部完成后合并出分。`, `本番構成に合わせて ${sections.length} セクションを個別に計時し、完了後に合算採点します。`, `${sections.length} independently timed sections following the official structure, scored together when complete.`)}
      />
      <div className="mt-5 space-y-2.5">
        {sections.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-3.5 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.09] text-sm font-bold text-[rgb(var(--kx-living-accent))]">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[rgb(var(--kx-living-ink))]">{s.title}</p>
              <p className="mt-0.5 text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">
                {s.questionCount} {t("题", "問", "Q")} · {fmtDuration(s.durationSeconds)}
                {s.section === "listening" ? ` · ${t("含听力音频", "音声あり", "with audio")}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => paperQ.data?.paper && preflight.mutate(paperQ.data.paper)}
        disabled={startSection.isPending || preflight.isPending || !sections.length}
        className={["mt-6 w-full py-3.5", JLPT_BTN_PRIMARY].join(" ")}
      >
        {startSection.isPending || preflight.isPending ? <Loader className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
        {attemptId ? t("恢复当前科目", "現在の科目を再開", "Resume current section") : t("检查价格并开始", "価格を確認して開始", "Check price and start")}
      </button>
      <JlptDisclaimer t={t} note={paperQ.data.disclaimer} />
    </div>
  );
}

// 分科整卷合并成绩：笔试缩放分（ScaledScorePanel）+ 聴解百分比 + 各科回看。
function PaperResult({
  t,
  language,
  paperId,
  attemptId,
  onExit,
  onOpenReview,
}: {
  t: Tri;
  language: string;
  paperId: string;
  attemptId: string;
  onExit: () => void;
  onOpenReview: (sessionId: string) => void;
}) {
  const q = useQuery({
    queryKey: ["guide", "jlpt-paper-result", paperId, attemptId],
    queryFn: () => guide.jlptPaperResult(paperId, attemptId),
    retry: false,
  });
  if (q.isLoading) return <JlptPageSkeleton t={t} variant="result" />;
  if (q.isError || !q.data) {
    return (
      <JlptErrorCard
        t={t}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
        title={t("成绩加载失败", "結果を読み込めませんでした", "Couldn't load your result")}
        body={t("成绩已安全保存在服务器,重试即可查看。", "結果はサーバーに保存されています。再試行してください。", "Your result is safely stored — just retry.")}
        secondary={
          <button type="button" onClick={onExit} className={JLPT_BTN_GHOST}>
            {t("返回列表", "一覧へ", "Back to list")}
          </button>
        }
      />
    );
  }
  const r = q.data;
  const paperPassed = r.officialScore?.passedReference ?? r.scaled?.passedWrittenReference ?? false;
  return (
    <div>
      <JlptPageHeader
        eyebrow={`JLPT · ${r.level} · ${t("成绩", "結果", "Result")}`}
        title={paperPassed ? t("达到整卷参考线!", "総合参考ライン到達!", "Reached the full-paper reference line!") : t("再接再厉", "次回に向けて", "Keep going")}
      />
      <div className="mt-6 space-y-4">
        {r.officialScore ? (
          <section
            aria-label={t("整卷参考成绩", "総合参考スコア", "Full-paper reference score")}
            className={[JLPT_CARD, "rounded-[28px] p-6 text-center"].join(" ")}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--kx-living-muted))]">
              {t("整卷参考分", "総合参考スコア", "Full-paper reference score")}
            </p>
            <p className="mt-3 leading-none">
              <span className={["text-[52px] font-black tabular-nums tracking-[-0.02em]", paperPassed ? "text-emerald-600 dark:text-emerald-400" : "text-[rgb(var(--kx-living-accent))]"].join(" ")}>
                {r.officialScore.total}
              </span>
              <span className="ml-1.5 text-base font-semibold text-[rgb(var(--kx-living-muted))]">/ {r.officialScore.totalMax}</span>
            </p>
            <p className="mt-3 text-xs font-medium text-[rgb(var(--kx-living-muted))]">
              {t(`参考总分线 ${r.officialScore.passLine}，且各得分区分均须达基准`, `参考総合ライン ${r.officialScore.passLine}、各得点区分の基準も必要`, `Reference total ${r.officialScore.passLine}, with every score division above its minimum`)}
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {r.officialScore.divisions.map((division) => (
                <div key={division.key} className="rounded-2xl bg-[rgb(var(--kx-living-canvas))] px-3 py-3">
                  <p className="text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">
                    {localizedScoreDivisionLabel(language, division.key, division.label)}
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-[rgb(var(--kx-living-ink))]">{division.scaled} / {division.scaledMax}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-5 text-[rgb(var(--kx-living-muted))]">
              {localizedScoreReferenceNote(language, "full")}
            </p>
          </section>
        ) : r.scaled ? <ScaledScorePanel t={t} language={language} scaled={r.scaled} /> : null}
        {!r.officialScore && r.listening ? (
          <div className={[JLPT_CARD, "p-5"].join(" ")}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--kx-living-accent))]">
              {t("聴解（参考）", "聴解（参考）", "Listening (reference)")}
            </p>
            <p className="mt-2 text-sm font-bold text-[rgb(var(--kx-living-ink))]">
              {t(`答对 ${r.listening.correct}/${r.listening.total} · 得分 ${r.listening.score}`, `正解 ${r.listening.correct}/${r.listening.total} · ${r.listening.score}点`, `${r.listening.correct}/${r.listening.total} correct · ${r.listening.score}`)}
            </p>
          </div>
        ) : null}
        <div className={[JLPT_CARD, "p-2"].join(" ")}>
          {r.sections.map((s) => (
            <button
              key={s.examId}
              type="button"
              disabled={!s.done || !s.sessionId}
              onClick={() => s.sessionId && onOpenReview(s.sessionId)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[rgb(var(--kx-living-accent))]/[0.05] disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[rgb(var(--kx-living-ink))]">{s.title || s.sectionLabel}</p>
                <p className="mt-0.5 text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">
                  {s.done ? t(`答对 ${s.correct}/${s.total}`, `正解 ${s.correct}/${s.total}`, `${s.correct}/${s.total} correct`) : t("未完成", "未完了", "Not done")}
                </p>
              </div>
              {s.done && s.sessionId ? <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--kx-living-muted))]" /> : null}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onExit}
        className={["mt-6 w-full", JLPT_BTN_GHOST].join(" ")}
      >
        <History className="h-4 w-4" /> {t("返回模考列表", "一覧へ戻る", "Back to exams")}
      </button>
      <JlptDisclaimer t={t} note={r.disclaimer} />
    </div>
  );
}

function HistoryRow({ t, item, onOpen }: { t: Tri; item: GuideJlptExamHistoryItem; onOpen: () => void }) {
  // Vocab quizzes are graded but have no per-question review bank; only real
  // exam sessions (examId present) can be re-opened for逐题回看.
  const reviewable = !!item.examId;
  // 全真卷显示缩放笔试分(0-120,按参考线判色);普通卷维持 0-100 百分比。
  const displayScore = item.scaled ? item.scaled.writtenTotal : item.score;
  const displayPassed = item.scaled ? item.scaled.passedWrittenReference : item.passed;
  // 出分模式徽标: score_mode='jlpt_scaled' (或带 scaled 块的老会话) → JLPT 标准;
  // 其余为百分制。
  const scaledMode = item.scoreMode === "jlpt_scaled" || !!item.scaled;
  const inner = (
    <>
      <span
        className={[
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums",
          displayPassed ? "bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400" : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))]",
        ].join(" ")}
      >
        {displayScore}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-[rgb(var(--kx-living-ink))]">{item.title || item.level}</p>
          <span
            className={[
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
              scaledMode
                ? "bg-[rgb(var(--kx-living-accent))]/[0.1] text-[rgb(var(--kx-living-accent))]"
                : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))]",
            ].join(" ")}
            title={
              scaledMode
                ? t("按 JLPT 官方计分结构出缩放分", "JLPT 公式の得点区分に基づく換算採点", "Scored on the official JLPT scale structure")
                : t("百分制计分", "100点満点の採点", "Percent-based scoring")
            }
          >
            {scaledMode ? t("JLPT 标准", "JLPT 準拠", "JLPT scale") : t("百分制", "百分率", "Percent")}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
          {item.scaled ? `${item.scaled.writtenTotal}/${item.scaled.writtenMax} · ` : ""}
          {item.level} · {item.correct}/{item.total} · {item.startedAt.slice(0, 10)}
        </p>
      </div>
      {displayPassed ? <Trophy className="h-4 w-4 shrink-0 text-amber-500" /> : null}
      {reviewable ? <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--kx-living-muted))]" /> : null}
    </>
  );
  const rowCls =
    "flex items-center gap-3 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3";
  if (!reviewable) {
    return <div className={rowCls}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("回看这次模考", "この模試を復習", "Review this attempt")}
      className={[rowCls, "w-full transition hover:border-[rgb(var(--kx-living-accent))]/35 hover:bg-[rgb(var(--kx-living-accent))]/[0.04]"].join(" ")}
    >
      {inner}
    </button>
  );
}

// ── exam runner (timer + answer + submit) ─────────────────────────────────────
function ExamRunner({
  t,
  session,
  resumeStart,
  onExit,
  onSubmitted,
}: {
  t: Tri;
  session: GuideJlptExamStart;
  resumeStart: ExamStartReceipt | null;
  onExit: () => void;
  onSubmitted: (res: GuideJlptExamSubmit) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const restored = useRef(restoredAnswerState(session)).current;
  const initiallyExpired = examDeadlineReached(
    session.durationSeconds,
    restored.remainingSeconds,
  );
  const [answers, setAnswers] = useState<Record<string, number>>(restored.answers);
  const answersRef = useRef<Record<string, number>>(restored.answers);
  const answerRevision = useRef(restored.answerRevision);
  const [remaining, setRemaining] = useState<number>(restored.remainingSeconds);
  const [sealing, setSealing] = useState(false);
  const [deadlineReached, setDeadlineReached] = useState(initiallyExpired);
  const [saveError, setSaveError] = useState("");

  // Wall-clock start, captured once at mount. The countdown is derived from the
  // real elapsed time rather than a per-second decrement, so a backgrounded
  // (throttled) tab can't let the timer drift slow.
  const startedAt = useRef<number>(Date.now());
  // Every save is serialized under the session-wide optimistic revision. Auto
  // submit waits for this whole chain, not merely whichever request finished
  // last, so rapid answer changes cannot arrive out of order.
  const answerSaveChain = useRef<Promise<void>>(Promise.resolve());
  const submitting = useRef(false);
  const deadlineReachedRef = useRef(initiallyExpired);

  const restoreAuthoritativeProgress = useCallback(async () => {
    if (!resumeStart) {
      throw new Error("JLPT start receipt missing while restoring progress");
    }
    const resumed = await restoreAuthoritativeJlptSession({
      start: guide.jlptExamStart,
      examId: session.examId,
      expectedSessionId: session.sessionId,
      requestKey: resumeStart.requestKey,
      confirmedChargeCoins: resumeStart.confirmedChargeCoins,
    });
    const authoritative = restoredAnswerState(resumed);
    answerRevision.current = authoritative.answerRevision;
    answersRef.current = authoritative.answers;
    setAnswers(authoritative.answers);
    return authoritative;
  }, [resumeStart, session.examId, session.sessionId]);

  const submit = useMutation({
    mutationFn: async () => {
      await answerSaveChain.current;
      const baseRevision = answerRevision.current;
      return guide.jlptExamSubmit(session.sessionId, {
        answersSnapshot: fullAnswerSnapshot(session.questions, answersRef.current),
        baseRevision,
        revision: baseRevision + 1,
      });
    },
    onSuccess: (res) => onSubmitted(res),
    onError: async (err) => {
      const ae = err as APIError;
      if (ae.code === "already_submitted") {
        pushToast({ kind: "info", message: t("该考试已提交", "この試験は提出済みです", "Already submitted") });
        onExit();
        return;
      }
      if (ae.code === "answer_revision_conflict") {
        try {
          await restoreAuthoritativeProgress();
          setSaveError(t("已恢复服务器上的最新作答。请检查答案后重新交卷。", "サーバー上の最新回答を復元しました。確認してから再提出してください。", "The latest server answers were restored. Review them before submitting again."));
        } catch {
          setSaveError(t("另一设备或标签页已更新作答。请退出后重新进入，以服务器进度为准。", "別の端末またはタブで回答が更新されました。いったん退出して再開してください。", "Answers changed in another tab or device. Exit and reopen to restore the server state."));
        }
      }
      pushToast({ kind: "error", message: ae.message });
    },
    // Allow a retry if a submit fails — clear the in-flight guard.
    onSettled: () => {
      submitting.current = false;
      setSealing(false);
    },
  });

  const submitRef = useRef(submit.mutate);
  submitRef.current = submit.mutate;

  // Persist each answer to the server as it's picked (resumable, server grades).
  const pick = useCallback(
    (questionId: string, sel: number) => {
      if (submitting.current || deadlineReachedRef.current) return;
      const nextAnswers = { ...answersRef.current, [questionId]: sel };
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
      setSaveError("");
      answerSaveChain.current = answerSaveChain.current.then(async () => {
        const baseRevision = answerRevision.current;
        try {
          const request = {
            sessionId: session.sessionId,
            questionId,
            selectedIndex: sel,
            baseRevision,
            revision: baseRevision + 1,
          };
          const saved = await retryTransientJlptWrite(() =>
            guide.jlptExamAnswer(request),
          );
          answerRevision.current = saved.answerRevision;
          // A prior conflict recovery may have replaced local state with the
          // authoritative server snapshot while later queued picks were still
          // waiting. Re-apply each successfully persisted queued pick to keep
          // the UI and the server on the same revision.
          const persistedAnswers = { ...answersRef.current, [questionId]: sel };
          answersRef.current = persistedAnswers;
          setAnswers(persistedAnswers);
        } catch (err) {
          const ae = err as APIError;
          if (ae.code === "answer_revision_conflict") {
            try {
              await restoreAuthoritativeProgress();
              setSaveError(t("检测到其他设备的更新，已恢复服务器答案。请继续前先核对。", "別端末の更新を検出し、サーバーの回答を復元しました。続行前に確認してください。", "Another device updated this attempt. Server answers were restored; review them before continuing."));
            } catch {
              setSaveError(t("作答版本发生冲突，请退出后重新进入恢复服务器进度。", "回答バージョンが競合しました。退出して再開してください。", "Answer versions conflicted. Exit and reopen to restore server progress."));
            }
          } else {
            setSaveError(t("有一道答案暂未同步；交卷时会在截止时间前发送完整答案快照。", "一部の回答を同期できませんでした。制限時間内の提出時に全回答を再送します。", "One answer did not sync; the full snapshot will be sent if you submit before the deadline."));
          }
        }
      });
    },
    [restoreAuthoritativeProgress, session.sessionId, t],
  );

  // Single submit path (manual + auto). Flush the last answer save first, then
  // grade — and guard against a double submit (e.g. clicking as the timer hits 0).
  const doSubmit = useCallback(() => {
    if (submitting.current) return;
    submitting.current = true;
    setSealing(true);
    submitRef.current();
  }, []);

  // Countdown timer (only when the exam is timed). Auto-submits at zero.
  useEffect(() => {
    if (!session.durationSeconds) return;
    const total = restored.remainingSeconds;
    const tick = () => {
      const left = Math.max(0, Math.ceil(total - (Date.now() - startedAt.current) / 1000));
      setRemaining(left);
      if (left <= 0) {
        deadlineReachedRef.current = true;
        setDeadlineReached(true);
        window.clearInterval(id);
        doSubmit();
      }
    };
    const id = window.setInterval(tick, 500);
    tick();
    return () => window.clearInterval(id);
  }, [session.durationSeconds, restored.remainingSeconds, doSubmit]);

  const answeredCount = Object.keys(answers).length;
  const lowTime = session.durationSeconds > 0 && remaining <= 60;
  const answersLocked = answerInputLocked({ sealing, deadlineReached });
  // A live timed exam must remain strict during a mixed-version deployment.
  // Practice/review cards intentionally keep their separate permissive default.
  const listeningPolicy = normalizeListeningPolicy(
    session.listeningPolicy,
    session.durationSeconds > 0 ? "strict" : "practice",
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => { if (!submitting.current) onExit(); }}
        disabled={sealing}
        className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ArrowLeft className="h-4 w-4" /> {t("退出模考", "模試を終了", "Exit exam")}
      </button>

      <JlptPageHeader
        eyebrow={`${session.level} · ${t("模考", "模試", "Exam")}`}
        title={session.title}
      />

      {/* Sticky exam head: progress + the countdown live together at the top of
          the viewport, so remaining time never scrolls out of sight on a long
          paper. Pure presentation — reads the same `remaining` state as before. */}
      <div className="mt-4">
        <JlptStickyBar>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <JlptProgress
                value={answeredCount}
                total={session.total}
                label={t(`已答 ${answeredCount} / ${session.total}`, `${answeredCount} / ${session.total} 回答`, `${answeredCount} / ${session.total} answered`)}
              />
            </div>
            {session.durationSeconds > 0 ? (
              <div
                className={[
                  "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 ring-1 transition",
                  lowTime
                    ? "bg-red-500/[0.1] text-red-600 ring-red-500/25 dark:text-red-400"
                    : "bg-[rgb(var(--kx-living-accent))]/[0.08] text-[rgb(var(--kx-living-accent))] ring-[rgb(var(--kx-living-accent))]/20",
                ].join(" ")}
              >
                <Timer className={["h-4 w-4", lowTime ? "animate-pulse motion-reduce:animate-none" : ""].join(" ")} />
                <span className="text-[15px] font-bold leading-none tabular-nums">{fmtDuration(remaining)}</span>
              </div>
            ) : null}
          </div>
        </JlptStickyBar>
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
            disabled={answersLocked}
            listeningPolicy={listeningPolicy}
            audioPlaybackKey={`${session.sessionId}:${q.id}`}
          />
        ))}
      </div>

      {saveError ? (
        <p role="status" className="mt-4 rounded-2xl bg-amber-500/[0.12] px-4 py-3 text-xs font-bold leading-relaxed text-amber-700 dark:text-amber-300">
          {saveError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={doSubmit}
        disabled={sealing || submit.isPending}
        className={["mt-5 w-full py-3.5", JLPT_BTN_PRIMARY].join(" ")}
      >
        {sealing || submit.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
        {deadlineReached && submit.isError
          ? t("重试交卷", "提出を再試行", "Retry submit")
          : answeredCount < session.total
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

  if (sessionQ.isLoading) return <JlptPageSkeleton t={t} variant="result" />;
  if (sessionQ.isError || !sessionQ.data) {
    return (
      <JlptErrorCard
        t={t}
        onRetry={() => sessionQ.refetch()}
        retrying={sessionQ.isFetching}
        title={t("回看加载失败", "復習データを読み込めませんでした", "Couldn't load this review")}
        secondary={
          <button type="button" onClick={onBack} className={JLPT_BTN_GHOST}>
            {t("返回历史成绩", "履歴に戻る", "Back to history")}
          </button>
        }
      />
    );
  }

  const s = sessionQ.data;
  const passScore = examsQ.data?.exams?.find((e) => e.id === s.examId)?.passScore;
  return (
    <ExamResult
      t={t}
      language={language}
      score={s.score}
      passed={s.passed}
      passScore={passScore}
      scaled={s.scaled}
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
  scaled,
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
  /** 全真卷（score_mode='jlpt_scaled'）附带的 JLPT 缩放分整块；有则替代百分比出分。 */
  scaled?: GuideJlptScaledResult | null;
  correct: number;
  total: number;
  durationSeconds: number;
  questions: GuideJlptQuestion[];
  disclaimer?: string;
  backLabel: string;
  onBack: () => void;
}) {
  const headlinePassed = scaled ? scaled.passedWrittenReference : passed;
  return (
    <div>
      <JlptPageHeader
        eyebrow={`JLPT · ${t("成绩", "結果", "Result")}`}
        title={
          scaled
            ? headlinePassed
              ? t("达到笔试参考线!", "筆記参考ライン到達!", "Reached the written reference line!")
              : t("再接再厉", "次回に向けて", "Keep going")
            : passed
              ? t("恭喜通过!", "合格おめでとう!", "Passed!")
              : t("再接再厉", "次回に向けて", "Keep going")
        }
      />

      <div className="mt-6">
        {scaled ? (
          <ScaledScorePanel t={t} language={language} scaled={scaled} correct={correct} total={total} durationSeconds={durationSeconds} />
        ) : (
          <JlptScoreHero
            t={t}
            score={score}
            pass={passed}
            passLabel={t("已通过", "合格", "Passed")}
            failLabel={t("未通过", "不合格", "Not passed")}
            metaLine={`${t(`答对 ${correct} / ${total}`, `${correct} / ${total} 正解`, `${correct} / ${total} correct`)} · ${fmtDuration(durationSeconds)}`}
            passScore={typeof passScore === "number" ? passScore : undefined}
          />
        )}
      </div>

      {/* Action-oriented close: clear the wrong answers, or keep drilling. */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Link
          href="/guide/jlpt/review"
          className="group flex items-center justify-center gap-2 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 text-[13px] font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]"
        >
          <NotebookPen className="h-4 w-4 text-[rgb(var(--kx-living-accent))]" />
          {t("错题已进错题本", "間違いノートへ", "Review wrong answers")}
        </Link>
        <Link
          href="/guide/jlpt/practice"
          className="group flex items-center justify-center gap-2 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 text-[13px] font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]"
        >
          <ListChecks className="h-4 w-4 text-[rgb(var(--kx-living-accent))]" />
          {t("继续刷题", "演習を続ける", "Keep practicing")}
        </Link>
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
        className={["mt-6 w-full", JLPT_BTN_GHOST].join(" ")}
      >
        <History className="h-4 w-4" /> {backLabel}
      </button>

      <JlptDisclaimer t={t} note={disclaimer} />
    </div>
  );
}
