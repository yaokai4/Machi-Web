"use client";

// Shared building blocks for the JLPT 备考核心 (题库/定级/单词/考试/打卡) web
// surface. Reuses the kx-living-* tokens the JLPT zone already uses, so
// light/dark theming keeps working with zero global CSS touched. Trilingual
// copy is inline (zh/ja/en) like JLPTZoneClient — no shared-dictionary keys, so
// nothing here can break `tsc` on a missing i18n key.

import Link from "next/link";
import { useState } from "react";
import { Flame, Timer, Check, X, Lock, Sparkles, Loader } from "lucide-react";
import { guide, type GuideJlptStreak, type GuideJlptExamCountdown, type GuideJlptQuestion } from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt } from "@/lib/store";

export type Tri = (zh: string, ja: string, en: string) => string;

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export const JLPT_SECTIONS = ["vocab", "grammar", "reading", "listening"] as const;
export type JlptSection = (typeof JLPT_SECTIONS)[number];

export function sectionLabel(t: Tri, section: string): string {
  switch (section) {
    case "vocab":
      return t("文字·词汇", "文字・語彙", "Vocabulary");
    case "grammar":
      return t("语法", "文法", "Grammar");
    case "reading":
      return t("读解", "読解", "Reading");
    case "listening":
      return t("听解", "聴解", "Listening");
    default:
      return t("综合", "総合", "Mixed");
  }
}

/** The compliance line every JLPT study page must carry (original/imported,
 *  never unauthorized past-paper text). */
export function JlptDisclaimer({ t, note }: { t: Tri; note?: string }) {
  return (
    <p className="mt-6 rounded-xl bg-[rgb(var(--kx-living-ink))]/[0.04] px-4 py-3 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
      {note ||
        t(
          "Machi 的 JLPT 题库为原创/授权导入内容,不含未授权官方历年真题原文;请以 JLPT 官方最新公告为准。",
          "Machi の JLPT 問題はオリジナル/許諾済みの導入コンテンツで、無断の公式過去問原文は含みません。最新は JLPT 公式でご確認ください。",
          "Machi's JLPT question bank is original or licensed-import content — never unauthorized official past-paper text. Verify with official JLPT announcements.",
        )}
    </p>
  );
}

/** Compact 打卡 badge (current streak + today's status). */
export function StreakBadge({ t, streak }: { t: Tri; streak?: GuideJlptStreak }) {
  if (!streak) return null;
  const active = streak.currentStreak > 0;
  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black",
        active
          ? "bg-orange-500/[0.12] text-orange-600 dark:text-orange-400"
          : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))]",
      ].join(" ")}
      title={t("连续打卡天数", "連続学習日数", "Study streak")}
    >
      <Flame className="h-3.5 w-3.5" />
      {t(`连续 ${streak.currentStreak} 天`, `${streak.currentStreak} 日連続`, `${streak.currentStreak}-day streak`)}
      {streak.todayDone ? (
        <span className="ml-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </div>
  );
}

/** Last-7-days dot row for 打卡. */
export function StreakDots({ t, streak }: { t: Tri; streak?: GuideJlptStreak }) {
  if (!streak?.last7days?.length) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
        {t("近 7 天", "直近7日", "Last 7 days")}
      </span>
      <div className="flex items-center gap-1.5">
        {streak.last7days.map((d) => (
          <span
            key={d.date}
            title={d.date}
            className={[
              "grid h-6 w-6 place-items-center rounded-md text-[10px] font-black",
              d.done
                ? "bg-emerald-500/[0.16] text-emerald-600 dark:text-emerald-400"
                : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))]",
            ].join(" ")}
          >
            {d.done ? <Check className="h-3.5 w-3.5" /> : d.date.slice(8)}
          </span>
        ))}
      </div>
      <span className="ml-auto text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
        {t(`最长 ${streak.longestStreak} 天`, `最長 ${streak.longestStreak} 日`, `Best ${streak.longestStreak}`)}
      </span>
    </div>
  );
}

/** Countdown bar to the next public exam date. */
export function ExamCountdownBar({
  t,
  countdown,
  href = "/guide/jlpt/exam-dates",
}: {
  t: Tri;
  countdown?: GuideJlptExamCountdown | null;
  href?: string;
}) {
  if (!countdown?.examDate) return null;
  return (
    <Link
      href={href}
      className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08] px-4 py-3 transition hover:bg-[rgb(var(--kx-living-accent))]/[0.12]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Timer className="h-5 w-5 shrink-0 text-[rgb(var(--kx-living-accent))]" />
        <div className="min-w-0">
          <p className="text-sm font-black text-[rgb(var(--kx-living-ink))]">
            {t("距下次 JLPT", "次回 JLPT まで", "Next JLPT")} · {countdown.sessionLabel}
          </p>
          <p className="text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">{countdown.examDate}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl font-black leading-none text-[rgb(var(--kx-living-accent))]">
          {Math.max(0, countdown.daysRemaining)}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
          {t("天", "日", "days")}
        </p>
      </div>
    </Link>
  );
}

export function LevelPicker({
  value,
  onChange,
  levels = JLPT_LEVELS as unknown as string[],
  allLabel,
}: {
  value: string;
  onChange: (lv: string) => void;
  levels?: string[];
  allLabel?: string; // shown for the "" option, if present
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {levels.map((lv) => (
        <button
          key={lv || "all"}
          type="button"
          onClick={() => onChange(lv)}
          className={[
            "rounded-full px-3.5 py-1.5 text-xs font-black transition",
            value === lv
              ? "bg-[rgb(var(--kx-living-accent))] text-white"
              : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))] hover:bg-[rgb(var(--kx-living-ink))]/[0.1]",
          ].join(" ")}
        >
          {lv || allLabel || "All"}
        </button>
      ))}
    </div>
  );
}

export function SectionPicker({
  t,
  value,
  onChange,
}: {
  t: Tri;
  value: string;
  onChange: (sec: string) => void;
}) {
  const opts: Array<{ key: string; label: string }> = [
    { key: "", label: t("综合", "総合", "Mixed") },
    ...JLPT_SECTIONS.map((s) => ({ key: s, label: sectionLabel(t, s) })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button
          key={o.key || "all"}
          type="button"
          onClick={() => onChange(o.key)}
          className={[
            "rounded-full px-3 py-1.5 text-xs font-bold transition",
            value === o.key
              ? "bg-[rgb(var(--kx-living-ink))] text-[rgb(var(--kx-living-surface))]"
              : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))] hover:bg-[rgb(var(--kx-living-ink))]/[0.1]",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A single answerable question card. `state` drives colouring after grading:
 *  the correct index goes green, a wrong pick goes red. `revealed` locks input
 *  and shows the correct answer (review / exam回看). */
export function QuestionCard({
  t,
  question,
  index,
  total,
  selectedIndex,
  onSelect,
  gradedCorrectIndex,
  disabled,
  revealed,
}: {
  t: Tri;
  question: GuideJlptQuestion;
  index: number;
  total?: number;
  selectedIndex?: number;
  onSelect?: (i: number) => void;
  gradedCorrectIndex?: number; // set once graded
  disabled?: boolean;
  revealed?: boolean;
}) {
  const correctIdx =
    gradedCorrectIndex !== undefined
      ? gradedCorrectIndex
      : revealed && question.answerIndex !== undefined
        ? question.answerIndex
        : undefined;
  const locked = disabled || revealed || correctIdx !== undefined;

  return (
    <div className="rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
        <span className="rounded-md bg-[rgb(var(--kx-living-accent))]/[0.12] px-2 py-0.5 text-[rgb(var(--kx-living-accent))]">
          {question.level}
        </span>
        <span>{
          // The server's sectionLabel is always Chinese, so for any known
          // section localize it client-side; only fall back to the server label
          // for a section we don't recognize.
          (JLPT_SECTIONS as readonly string[]).includes(question.section)
            ? sectionLabel(t, question.section)
            : (question.sectionLabel || sectionLabel(t, question.section))
        }</span>
        {total ? (
          <span className="ml-auto">
            {index + 1} / {total}
          </span>
        ) : null}
        {question.isMemberOnly ? (
          <Lock className="h-3.5 w-3.5 text-[rgb(var(--kx-living-accent))]" aria-label={t("会员题", "会員問題", "Member")} />
        ) : null}
      </div>

      {question.passage ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[rgb(var(--kx-living-ink))]/[0.03] px-3.5 py-3 text-sm font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
          {question.passage}
        </p>
      ) : null}

      <p className="mt-3 whitespace-pre-wrap text-base font-bold leading-relaxed text-[rgb(var(--kx-living-ink))]">
        {question.stem}
      </p>

      <div className="mt-3.5 grid gap-2">
        {question.choices.map((choice, i) => {
          const isSelected = selectedIndex === i;
          const isCorrect = correctIdx === i;
          const isWrongPick = correctIdx !== undefined && isSelected && !isCorrect;
          let cls =
            "border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] hover:border-[rgb(var(--kx-living-accent))]/40";
          if (isCorrect) cls = "border-emerald-500/60 bg-emerald-500/[0.1]";
          else if (isWrongPick) cls = "border-red-500/60 bg-red-500/[0.08]";
          else if (isSelected && correctIdx === undefined)
            cls = "border-[rgb(var(--kx-living-accent))] bg-[rgb(var(--kx-living-accent))]/[0.08]";
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => onSelect?.(i)}
              className={[
                "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition disabled:cursor-default",
                cls,
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-black",
                  isCorrect
                    ? "bg-emerald-500 text-white"
                    : isWrongPick
                      ? "bg-red-500 text-white"
                      : isSelected
                        ? "bg-[rgb(var(--kx-living-accent))] text-white"
                        : "bg-[rgb(var(--kx-living-ink))]/[0.08] text-[rgb(var(--kx-living-muted))]",
                ].join(" ")}
              >
                {isCorrect ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 text-[rgb(var(--kx-living-ink))]">{choice}</span>
            </button>
          );
        })}
      </div>

      {correctIdx !== undefined && question.explanation ? (
        <div className="mt-3.5 rounded-xl border border-[rgb(var(--kx-living-accent))]/20 bg-[rgb(var(--kx-living-accent))]/[0.06] px-3.5 py-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-accent))]">
            {t("解析", "解説", "Explanation")}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
            {question.explanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Machi AI 逐题讲解 button (会员权益; free callers spend their normal Machi AI
 *  daily quota, or get an upgrade/quota prompt from the server). Only useful
 *  once a question has been graded / revealed, so callers gate on that. */
export function ExplainButton({
  t,
  questionId,
  language,
}: {
  t: Tri;
  questionId: string;
  language: string;
}) {
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await guide.jlptExplain({ questionId, language });
      setText(res.explanation || "");
    } catch (e) {
      if (isAuthRequiredError(e)) {
        openAuthPrompt({ kind: "generic", title: t("登录后使用 AI 讲解", "ログインして AI 解説を使う", "Log in to use AI explanations") });
        return;
      }
      const ae = e as APIError;
      if (ae.status === 403) {
        setErr(
          t(
            "今日免费 AI 讲解次数已用完,开通会员可用 Pro 模型无限讲解。",
            "本日の無料 AI 解説の回数を使い切りました。会員なら Pro モデルで無制限に解説できます。",
            "You're out of free AI explanations today. Members get unlimited Pro-model explanations.",
          ),
        );
        return;
      }
      setErr(ae.message || t("暂时无法讲解,请稍后再试", "解説できません。後ほどお試しください", "Couldn't explain — try again shortly"));
    } finally {
      setLoading(false);
    }
  };

  if (text) {
    return (
      <div className="mt-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-3.5 py-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" /> Machi AI
        </p>
        <p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/[0.08] px-3.5 py-1.5 text-xs font-black text-violet-600 transition hover:bg-violet-500/[0.14] disabled:opacity-60 dark:text-violet-400"
      >
        {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {t("AI 讲解这道题", "AI に解説してもらう", "Explain with AI")}
      </button>
      {err ? <p className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">{err}</p> : null}
    </div>
  );
}

/** Format seconds as m:ss for the exam timer / duration. */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}
