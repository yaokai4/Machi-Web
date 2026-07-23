"use client";

// Shared building blocks for the JLPT 备考核心 (题库/定级/单词/考试/打卡) web
// surface. Reuses the kx-living-* tokens the JLPT zone already uses, so
// light/dark theming keeps working with zero global CSS touched. Trilingual
// copy is inline (zh/ja/en) like JLPTZoneClient — no shared-dictionary keys, so
// nothing here can break `tsc` on a missing i18n key.
//
// Design language ("考场里的静气"): warm paper ground, teal ink, one warm ember
// (streak / countdown). Depth comes from soft shadows + hairlines + a single
// accent gradient moment, never from a rainbow of hues.

import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import {
  Flame, Timer, Check, X, Lock, Sparkles, Loader, ChevronRight, Trophy,
  Play, Pause, RotateCcw, Headphones, ChevronDown, CloudOff, RefreshCw,
} from "lucide-react";
import {
  guide,
  type GuideJlptStreak,
  type GuideJlptExamCountdown,
  type GuideJlptListeningPolicy,
  type GuideJlptQuestion,
} from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt } from "@/lib/store";
import {
  confirmListeningPlaybackStart,
  failListeningPlaybackStart,
  listeningPlaybackCanStart,
  normalizeListeningPolicy,
  requestListeningPlaybackStart,
} from "./exam/examContract";

export type Tri = (zh: string, ja: string, en: string) => string;

/* ------------------------------------------------------------------ */
/* Shared button + card vocabulary                                     */
/* ------------------------------------------------------------------ */
/* One accent, one ink — text on accent fills always reads through the
 * --kx-on-accent token (white on the deep light-mode green, page ink on the
 * dark-mode mint), so both themes stay WCAG-clean with zero dark: patches. */

export const JLPT_BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-18px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90 active:scale-[0.99] disabled:opacity-55 disabled:active:scale-100";

export const JLPT_BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-5 py-3 text-sm font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))] disabled:opacity-55";

/** The one quiet card surface every JLPT panel shares. */
export const JLPT_CARD =
  "rounded-[24px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] shadow-[0_24px_48px_-42px_rgb(var(--kx-shadow)/0.55)]";

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

// Difficulty ramp N5→N1 (index 0→4). One controlled teal→ink progression, not a
// rainbow: each level's badge deepens by a step. Kept in-file so both the ladder
// and any level chip read identically.
export const LEVEL_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };
export function levelDifficulty(level: string): number {
  return (LEVEL_ORDER[level] ?? 0) + 1; // 1..5 filled dots
}

/** The compliance line every JLPT study page must carry (original/imported,
 *  never unauthorized past-paper text). `t` is optional so server components
 *  (which can't pass functions across the RSC boundary, e.g. the static
 *  levels pages) can supply a pre-resolved `note` string instead. */
export function JlptDisclaimer({ t, note }: { t?: Tri; note?: string }) {
  return (
    <p className="mt-7 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-ink))]/[0.03] px-4 py-3 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
      {note ||
        (t
          ? t(
              "Machi 的 JLPT 题库为原创/授权导入内容,不含未授权官方历年真题原文;请以 JLPT 官方最新公告为准。",
              "Machi の JLPT 問題はオリジナル/許諾済みの導入コンテンツで、無断の公式過去問原文は含みません。最新は JLPT 公式でご確認ください。",
              "Machi's JLPT question bank is original or licensed-import content — never unauthorized official past-paper text. Verify with official JLPT announcements.",
            )
          : "Machi 的 JLPT 题库为原创/授权导入内容,不含未授权官方历年真题原文;请以 JLPT 官方最新公告为准。")}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-page chrome (light header + centered state card + narrow shell)  */
/* ------------------------------------------------------------------ */

/** The narrow, focused column every JLPT sub-page lives in — matches the zone
 *  landing page so the whole 专区 reads as one calm, premium workspace instead
 *  of a stretched dashboard (GuideShell itself is max-w-6xl). */
export function JlptNarrow({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-5">{children}</div>;
}

/** Light sub-page header: an accent eyebrow + a black title (+ optional
 *  subtitle). No heavy card — clean and quiet, letting the content below carry
 *  the weight. `right` slots a control (e.g. a live timer) on the same row. */
export function JlptPageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgb(var(--kx-living-accent))]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-[26px] font-black leading-[1.12] tracking-[-0.02em] text-[rgb(var(--kx-living-ink))] sm:text-[28px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2.5 max-w-[52ch] text-[13px] leading-relaxed text-[rgb(var(--kx-living-muted))] sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Loading / error primitives (three-state kit)                        */
/* ------------------------------------------------------------------ */

/** One shimmering placeholder block. Pulse is suppressed for
 *  prefers-reduced-motion viewers (`motion-reduce:animate-none`). */
export function JlptSkel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={[
        "animate-pulse rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.05] motion-reduce:animate-none",
        className || "",
      ].join(" ")}
    />
  );
}

/** Page-shaped loading skeletons so first paint mirrors the final layout
 *  instead of a lone spinner. Variants: zone landing / card list / scorecard. */
export function JlptPageSkeleton({
  t,
  variant = "list",
}: {
  t: Tri;
  variant?: "zone" | "list" | "result" | "rows";
}) {
  return (
    <div role="status" className="mt-6 space-y-3">
      <span className="sr-only">{t("加载中…", "読み込み中…", "Loading…")}</span>
      {variant === "zone" ? (
        <>
          <JlptSkel className="h-44 rounded-[28px]" />
          <JlptSkel className="h-[72px] rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <JlptSkel key={i} className="h-[92px] rounded-[24px]" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <JlptSkel className="h-[64px] rounded-[20px]" />
            <JlptSkel className="h-[64px] rounded-[20px]" />
          </div>
        </>
      ) : variant === "result" ? (
        <>
          <JlptSkel className="h-64 rounded-[28px]" />
          <JlptSkel className="h-[72px] rounded-[22px]" />
          <JlptSkel className="h-[72px] rounded-[22px]" />
        </>
      ) : variant === "rows" ? (
        <>
          {Array.from({ length: 4 }).map((_, i) => (
            <JlptSkel key={i} className="h-[76px] rounded-[22px]" />
          ))}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <JlptSkel key={i} className="h-[168px] rounded-[24px]" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Error state with a real way out: retry CTA (and an optional secondary
 *  action) in the shared card language — network blips shouldn't dead-end. */
export function JlptErrorCard({
  t,
  onRetry,
  retrying,
  title,
  body,
  secondary,
}: {
  t: Tri;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  body?: string;
  secondary?: ReactNode;
}) {
  return (
    <div className="mt-6 flex min-h-[34vh] flex-col items-center justify-center">
      <div className={[JLPT_CARD, "w-full max-w-md px-6 py-9 text-center"].join(" ")}>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))]">
          <CloudOff className="h-7 w-7" />
        </span>
        <p className="mt-4 text-[15px] font-bold leading-snug text-[rgb(var(--kx-living-ink))]">
          {title || t("内容加载失败", "読み込みに失敗しました", "Couldn't load this")}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[rgb(var(--kx-living-muted))]">
          {body || t("网络似乎不太稳定，请重试一次。", "ネットワークが不安定なようです。もう一度お試しください。", "The network seems unstable — try again.")}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {onRetry ? (
            <button type="button" onClick={onRetry} disabled={retrying} className={JLPT_BTN_PRIMARY}>
              {retrying ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("重试", "再試行", "Retry")}
            </button>
          ) : null}
          {secondary}
        </div>
      </div>
    </div>
  );
}

/** Self-contained sticky top bar (progress + timer live here during exams).
 *  Owns the negative-margin bleed against JlptNarrow's px-4/sm:px-5 padding so
 *  callers never hand-tune offsets again. */
export function JlptStickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-bg))]/85 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
      {children}
    </div>
  );
}

/** Sticky bottom action bar: keeps the primary CTA under the thumb on mobile,
 *  fading the page behind it with the same paper tone (no new hue). */
export function JlptBottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-gradient-to-t from-[rgb(var(--kx-living-bg))] from-55% via-[rgb(var(--kx-living-bg))]/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-7 sm:-mx-5 sm:px-5">
      {children}
    </div>
  );
}

/** A grouped control panel (filters, section pickers) in the shared card
 *  language: surface + hairline + soft shadow + rounded-[22px]. */
export function JlptPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={[JLPT_CARD, "p-4 sm:p-5", className || ""].join(" ")}>
      {children}
    </div>
  );
}

/** A tiny uppercase field label above a picker. */
export function JlptFieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--kx-living-muted))]">
      {children}
    </p>
  );
}

/** Centered state card (empty / locked / gate / call-to-action) in the shared
 *  card language, so every quiet moment across the专区 looks the same. */
export function JlptStateCard({
  icon: Icon,
  title,
  body,
  action,
  tone = "muted",
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: "muted" | "accent";
}) {
  return (
    <div className="mt-6 flex min-h-[38vh] flex-col items-center justify-center">
      <div className={[JLPT_CARD, "w-full max-w-md px-6 py-9 text-center"].join(" ")}>
        {Icon ? (
          <span
            className={[
              "mx-auto grid h-14 w-14 place-items-center rounded-2xl",
              tone === "accent"
                ? "bg-[rgb(var(--kx-living-accent))]/[0.1] text-[rgb(var(--kx-living-accent))]"
                : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))]",
            ].join(" ")}
          >
            <Icon className="h-7 w-7" />
          </span>
        ) : null}
        <p className="mt-4 text-[15px] font-bold leading-snug text-[rgb(var(--kx-living-ink))]">{title}</p>
        {body ? (
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[rgb(var(--kx-living-muted))]">
            {body}
          </p>
        ) : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result surfaces (score hero + progress bar + section breakdown)      */
/* ------------------------------------------------------------------ */

/** A big, layered score hero for exam / quiz / vocab / placement results. `pass`
 *  toggles the celebratory emerald face; otherwise it's the calm accent face. A
 *  faint radial glow + oversized value give the moment weight instead of a flat
 *  white box. `caption` renders a small eyebrow above the value (e.g. 推荐等级),
 *  and `score` may be a number (points) or a string (a level like "N3"). */
export function JlptScoreHero({
  t,
  score,
  caption,
  pass,
  passLabel,
  failLabel,
  metaLine,
  passScore,
}: {
  t: Tri;
  score: number | string;
  caption?: string;
  pass?: boolean;
  passLabel?: string;
  failLabel?: string;
  metaLine: string;
  passScore?: number;
}) {
  const isPass = !!pass;
  return (
    <div className={[JLPT_CARD, "relative overflow-hidden rounded-[28px] px-6 py-9 text-center"].join(" ")}>
      {/* one faint halo behind the number — accent by default, emerald on pass */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background: isPass
            ? "radial-gradient(closest-side, rgb(16 185 129 / 0.16), transparent)"
            : "radial-gradient(closest-side, rgb(var(--kx-living-accent) / 0.14), transparent)",
        }}
      />
      {caption ? (
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--kx-living-muted))]">
          {caption}
        </p>
      ) : null}
      <p
        className={[
          "relative text-[64px] font-black leading-none tracking-[-0.03em] tabular-nums",
          caption ? "mt-3" : "mt-1",
          isPass ? "text-emerald-600 dark:text-emerald-400" : "text-[rgb(var(--kx-living-accent))]",
        ].join(" ")}
      >
        {score}
      </p>
      {pass !== undefined ? (
        <p className="relative mt-4">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1",
              isPass
                ? "bg-emerald-500/[0.12] text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
                : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] ring-[rgb(var(--kx-living-ink))]/[0.08]",
            ].join(" ")}
          >
            {isPass ? <Trophy className="h-3.5 w-3.5" /> : null}
            {isPass ? passLabel || t("合格", "合格", "Passed") : failLabel || t("未通过", "不合格", "Not passed")}
          </span>
        </p>
      ) : null}
      <p className="relative mt-3 text-[13px] font-semibold text-[rgb(var(--kx-living-ink))]">{metaLine}</p>
      {typeof passScore === "number" ? (
        <p className="relative mt-1 text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">
          {t(`合格线 ${passScore}`, `合格ライン ${passScore}`, `Pass mark ${passScore}`)}
        </p>
      ) : null}
    </div>
  );
}

/** One section accuracy row (定级分项 / any per-section breakdown): label + a
 *  filled meter + fraction. Weak sections flip to a warm-red bar with a chip. */
export function JlptSectionBar({
  label,
  correct,
  total,
  accuracy,
  weak,
  weakLabel,
}: {
  label: string;
  correct: number;
  total: number;
  accuracy: number;
  weak?: boolean;
  weakLabel?: string;
}) {
  const pct = Math.round(accuracy * 100);
  return (
    <div className="rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 font-semibold text-[rgb(var(--kx-living-ink))]">
          {label}
          {weak ? (
            <span className="rounded-md bg-red-500/[0.1] px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
              {weakLabel || "Weak"}
            </span>
          ) : null}
        </span>
        <span className="font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
          {correct}/{total} · {pct}%
        </span>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.06]">
        <div
          className={["h-full rounded-full transition-all", weak ? "bg-red-500/80" : "bg-[rgb(var(--kx-living-accent))]"].join(" ")}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** A slim labeled progress bar (answered / total) with a percent-driven fill —
 *  the shared calm progress meter for exams and placement. */
export function JlptProgress({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.07]">
        <div className="h-full rounded-full bg-[rgb(var(--kx-living-accent))] transition-all" style={{ width: `${pct}%` }} />
      </div>
      {label ? (
        <p className="mt-2 text-[11px] font-semibold tabular-nums text-[rgb(var(--kx-living-muted))]">{label}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero + primary surfaces (presentational, data passed in)           */
/* ------------------------------------------------------------------ */

/** Flagship JLPT hero: warm paper card with a faint teal glow + a large kana
 *  watermark, streak ember top-right, and an integrated last-7-days strip. */
export function JlptHero({
  t,
  title,
  subtitle,
  streak,
}: {
  t: Tri;
  title?: string;
  subtitle?: string;
  streak?: GuideJlptStreak;
}) {
  return (
    <header className={[JLPT_CARD, "relative overflow-hidden rounded-[28px] px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7"].join(" ")}>
      {/* one faint accent glow, kept quiet so the text stays crisp */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgb(var(--kx-living-accent)/0.13), transparent)" }}
      />
      {/* oversized kana watermark */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-8 right-2 select-none text-[8rem] font-black leading-none text-[rgb(var(--kx-living-accent))]/[0.05] sm:text-[10rem]"
      >
        日本語
      </span>

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgb(var(--kx-living-accent))]">
          Machi Guide · JLPT
        </p>
        {streak ? <StreakBadge t={t} streak={streak} /> : null}
      </div>

      <h1 className="relative mt-3 max-w-[22ch] text-[26px] font-black leading-[1.12] tracking-[-0.02em] text-[rgb(var(--kx-living-ink))] sm:text-[32px]">
        {title}
      </h1>
      {subtitle ? (
        <p className="relative mt-2.5 max-w-[46ch] text-[13px] leading-relaxed text-[rgb(var(--kx-living-muted))] sm:text-sm">
          {subtitle}
        </p>
      ) : null}

      {streak?.last7days?.length ? (
        <div className="relative mt-5">
          <StreakDots t={t} streak={streak} />
        </div>
      ) : null}
    </header>
  );
}

/** One primary-action card in the 练起来 grid. `primary` gives it the filled
 *  accent treatment (the entry-funnel action, e.g. 定级). */
export type JlptAction = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  enabled: boolean;
  primary?: boolean;
};

export function JlptActionGrid({ t, actions }: { t: Tri; actions: JlptAction[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {actions.map((a) => {
        const Icon = a.icon;
        const inner = (
          <>
            <span
              className={[
                "grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition",
                a.primary
                  ? "bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))] shadow-[0_10px_22px_-12px_rgb(var(--kx-living-accent)/0.8)]"
                  : "bg-[rgb(var(--kx-living-accent))]/[0.09] text-[rgb(var(--kx-living-accent))]",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight text-[rgb(var(--kx-living-ink))]">{a.title}</p>
              <p className="mt-1 text-xs leading-snug text-[rgb(var(--kx-living-muted))]">{a.subtitle}</p>
            </div>
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-hover:translate-x-0.5 group-hover:bg-[rgb(var(--kx-living-accent))]/[0.12] group-hover:text-[rgb(var(--kx-living-accent))]">
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </>
        );
        const base =
          "group flex items-start gap-3.5 rounded-[24px] border p-4 transition duration-200 sm:p-5";
        if (!a.enabled) {
          return (
            <div
              key={a.href}
              title={t("内容即将上线", "近日公開", "Coming soon")}
              className={[base, "cursor-not-allowed border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] opacity-55"].join(" ")}
            >
              {inner}
            </div>
          );
        }
        return (
          <Link
            key={a.href}
            href={a.href}
            className={[
              base,
              "shadow-[0_24px_48px_-42px_rgb(var(--kx-shadow)/0.55)] hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-38px_rgb(var(--kx-shadow)/0.6)] motion-reduce:hover:translate-y-0",
              a.primary
                ? "border-[rgb(var(--kx-living-accent))]/30 bg-[rgb(var(--kx-living-accent))]/[0.05] hover:border-[rgb(var(--kx-living-accent))]/50"
                : "border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] hover:border-[rgb(var(--kx-living-accent))]/30",
            ].join(" ")}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

export type JlptLevelItem = { key: string; label: string; summary: string };

/** N5–N1 ladder: a level badge on a controlled teal→ink difficulty ramp + a
 *  5-dot difficulty meter + the level blurb. */
export function JlptLevelLadder({ t, levels }: { t: Tri; levels: JlptLevelItem[] }) {
  const nameOf = (label: string): string => {
    switch (label) {
      case "N5": return t("入门", "入門", "Beginner");
      case "N4": return t("初级", "初級", "Elementary");
      case "N3": return t("过渡", "中級", "Intermediate");
      case "N2": return t("就职门槛", "準上級", "Upper-int.");
      case "N1": return t("高级", "上級", "Advanced");
      default: return "";
    }
  };
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {levels.map((lv) => {
        const diff = levelDifficulty(lv.label);
        // deepen the badge tint by difficulty (0.10 → 0.24 accent), ink text
        const tint = 0.1 + (diff - 1) * 0.035;
        // W2-3 static intro pages exist for n1–n5; link the whole row there so
        // the ladder doubles as the "了解 N3" entry (no extra pill row needed).
        const introHref = /^n[1-5]$/i.test(lv.label) ? `/guide/jlpt/levels/${lv.label.toLowerCase()}` : null;
        const inner = (
          <>
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[15px] font-black text-[rgb(var(--kx-living-accent))]"
              style={{ background: `rgb(var(--kx-living-accent) / ${tint})` }}
            >
              {lv.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-[rgb(var(--kx-living-ink))]">{nameOf(lv.label)}</p>
                <span className="flex items-center gap-[3px]" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={[
                        "h-[5px] w-[5px] rounded-full",
                        i < diff ? "bg-[rgb(var(--kx-living-accent))]/70" : "bg-[rgb(var(--kx-living-ink))]/[0.12]",
                      ].join(" ")}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[rgb(var(--kx-living-muted))]">{lv.summary}</p>
            </div>
            {introHref ? (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-hover:translate-x-0.5 group-hover:bg-[rgb(var(--kx-living-accent))]/[0.12] group-hover:text-[rgb(var(--kx-living-accent))]">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </>
        );
        const rowCls =
          "flex items-center gap-3.5 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5";
        if (!introHref) {
          return (
            <div key={lv.key} className={rowCls}>
              {inner}
            </div>
          );
        }
        return (
          <Link
            key={lv.key}
            href={introHref}
            aria-label={t(`${lv.label} 等级介绍`, `${lv.label} とは`, `About ${lv.label}`)}
            className={[rowCls, "group transition hover:border-[rgb(var(--kx-living-accent))]/30"].join(" ")}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Streak + countdown                                                  */
/* ------------------------------------------------------------------ */

/** Compact 打卡 badge (current streak + today's status) — a warm ember pill. */
export function StreakBadge({ t, streak }: { t: Tri; streak?: GuideJlptStreak }) {
  if (!streak) return null;
  const active = streak.currentStreak > 0;
  return (
    <div
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition",
        active
          ? "bg-[rgb(var(--kx-living-warm))]/[0.14] text-[rgb(var(--kx-living-warm))] ring-[rgb(var(--kx-living-warm))]/25"
          : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] ring-transparent",
      ].join(" ")}
      title={t("连续打卡天数", "連続学習日数", "Study streak")}
    >
      <Flame className="h-3.5 w-3.5" />
      {t(`连续 ${streak.currentStreak} 天`, `${streak.currentStreak} 日連続`, `${streak.currentStreak}-day streak`)}
      {streak.todayDone ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : null}
    </div>
  );
}

/** Last-7-days strip for 打卡 — labeled, today ringed, done cells filled. */
export function StreakDots({ t, streak }: { t: Tri; streak?: GuideJlptStreak }) {
  if (!streak?.last7days?.length) return null;
  const days = streak.last7days.slice(-7);
  return (
    <div className="flex items-end gap-2.5">
      <span className="pb-1 text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
        {t("近 7 天", "直近7日", "Last 7 days")}
      </span>
      <div className="flex items-center gap-1.5">
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1" title={d.date}>
              <span
                className={[
                  "grid h-7 w-7 place-items-center rounded-[10px] text-[10px] font-bold transition",
                  d.done
                    ? "bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))] shadow-[0_6px_14px_-8px_rgb(var(--kx-living-accent)/0.8)]"
                    : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))]",
                  isToday && !d.done ? "ring-2 ring-[rgb(var(--kx-living-accent))]/40" : "",
                ].join(" ")}
              >
                {d.done ? <Check className="h-3.5 w-3.5" /> : d.date.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
      <span className="ml-auto pb-1 text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
        {t(`最长 ${streak.longestStreak} 天`, `最長 ${streak.longestStreak} 日`, `Best ${streak.longestStreak}`)}
      </span>
    </div>
  );
}

/** Countdown bar to the next public exam date — a focused motivator row.
 *  Pass `href={null}` to render a static banner (e.g. on the exam-dates page
 *  itself, where a self-link would be noise). */
export function ExamCountdownBar({
  t,
  countdown,
  href = "/guide/jlpt/exam-dates",
}: {
  t: Tri;
  countdown?: GuideJlptExamCountdown | null;
  href?: string | null;
}) {
  if (!countdown?.examDate) return null;
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-[rgb(var(--kx-living-accent))]">
          <Timer className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[rgb(var(--kx-living-ink))]">
            {t("距下次 JLPT", "次回 JLPT まで", "Next JLPT")} · {countdown.sessionLabel}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">{countdown.examDate}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-baseline gap-1">
        <span className="text-[26px] font-black leading-none tabular-nums text-[rgb(var(--kx-living-accent))]">
          {Math.max(0, countdown.daysRemaining)}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
          {t("天", "日", "days")}
        </span>
      </div>
    </>
  );
  const base =
    "flex items-center justify-between gap-3 rounded-[20px] border border-[rgb(var(--kx-living-accent))]/20 bg-[rgb(var(--kx-living-accent))]/[0.05] px-4 py-3.5";
  if (!href) {
    return <div className={base}>{inner}</div>;
  }
  return (
    <Link
      href={href}
      className={[base, "group transition hover:border-[rgb(var(--kx-living-accent))]/35 hover:bg-[rgb(var(--kx-living-accent))]/[0.08]"].join(" ")}
    >
      {inner}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Pickers                                                             */
/* ------------------------------------------------------------------ */

export function LevelPicker({
  value,
  onChange,
  levels = JLPT_LEVELS as unknown as string[],
  allLabel,
}: {
  value: string;
  onChange: (lv: string) => void;
  levels?: string[];
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {levels.map((lv) => (
        <button
          key={lv || "all"}
          type="button"
          aria-pressed={value === lv}
          onClick={() => onChange(lv)}
          className={[
            "rounded-full px-4 py-2 text-xs font-bold transition",
            value === lv
              ? "bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))] shadow-[0_10px_20px_-12px_rgb(var(--kx-living-accent)/0.8)]"
              : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] hover:bg-[rgb(var(--kx-living-ink))]/[0.09]",
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
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={[
            "rounded-full px-3.5 py-2 text-xs font-semibold transition",
            value === o.key
              ? "bg-[rgb(var(--kx-living-ink))] text-[rgb(var(--kx-living-surface))]"
              : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] hover:bg-[rgb(var(--kx-living-ink))]/[0.09]",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Question card                                                       */
/* ------------------------------------------------------------------ */

/** A single answerable question card. `state` drives colouring after grading:
 *  the correct index goes green, a wrong pick goes red. `revealed` locks input
 *  and shows the correct answer (review / exam回看). */
function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** JLPT 听力音频播放器：播放/暂停 + 可拖动进度 + 时间 + 重播。用既有 kx-living-*
 *  token，零全局 CSS。不用原生 <audio controls>（各浏览器样式不一、不够精致）,
 *  自绘控件包一个隐藏 <audio>。 */
export function JlptAudioPlayer({
  t,
  src,
  policy: rawPolicy,
  playbackKey,
}: {
  t: Tri;
  src: string;
  policy?: GuideJlptListeningPolicy;
  playbackKey?: string;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const rawPolicyMode = rawPolicy?.mode;
  const policy = useMemo(
    () => normalizeListeningPolicy(rawPolicyMode ? { mode: rawPolicyMode } : undefined),
    [rawPolicyMode],
  );
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playbackStart, setPlaybackStart] = useState({
    playsStarted: 0,
    pendingNewPlay: false,
  });
  const storageKey = playbackKey ? `machi:jlpt:listening-play:${playbackKey}` : "";

  useEffect(() => {
    // 换题时重置（同一组件被复用到不同 src）。
    setPlaying(false); setCur(0); setDur(0); setReady(false); setFailed(false); setEnded(false);
    if (policy.mode === "strict" && storageKey && typeof window !== "undefined") {
      const stored = Number(window.localStorage.getItem(storageKey) || 0);
      setPlaybackStart({
        playsStarted: Number.isFinite(stored) ? Math.max(0, Math.trunc(stored)) : 0,
        pendingNewPlay: false,
      });
    } else {
      setPlaybackStart({ playsStarted: 0, pendingNewPlay: false });
    }
  }, [src, storageKey, policy.mode]);

  const confirmPlaybackStarted = useCallback(() => {
    setPlaying(true);
    setPlaybackStart((current) => {
      const next = confirmListeningPlaybackStart(policy, current);
      if (
        next.playsStarted !== current.playsStarted
        && policy.mode === "strict"
        && storageKey
        && typeof window !== "undefined"
      ) {
        window.localStorage.setItem(storageKey, String(next.playsStarted));
      }
      return next;
    });
  }, [policy, storageKey]);

  const failPlaybackStart = useCallback(() => {
    setPlaying(false);
    setFailed(true);
    setPlaybackStart((current) => failListeningPlaybackStart(current));
  }, []);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (!a.paused) {
      if (policy.allowPause) a.pause();
      return;
    }
    if (!listeningPlaybackCanStart(policy, playbackStart.playsStarted, a.currentTime, ended)) return;
    setPlaybackStart(requestListeningPlaybackStart(
      policy,
      playbackStart,
      a.currentTime,
      ended,
    ));
    if (ended) {
      a.currentTime = 0;
      setCur(0);
      setEnded(false);
    }
    setFailed(false);
    a.play().catch(failPlaybackStart);
  }, [ended, failPlaybackStart, playbackStart, policy]);
  const replay = useCallback(() => {
    const a = ref.current;
    if (!a || !policy.allowReplay) return;
    a.currentTime = 0;
    setEnded(false);
    setFailed(false);
    a.play().catch(failPlaybackStart);
  }, [failPlaybackStart, policy.allowReplay]);
  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    a.currentTime = (Number(e.target.value) / 1000) * dur;
    setCur(a.currentTime);
  }, [dur]);

  const pct = dur > 0 ? Math.min(1000, (cur / dur) * 1000) : 0;
  const playBlocked = !playing && !listeningPlaybackCanStart(
    policy, playbackStart.playsStarted, cur, ended,
  );

  return (
    <div className="mt-3.5 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.05] px-4 py-3.5">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration || 0); setReady(true); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlaying={confirmPlaybackStarted}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setEnded(true); }}
        onError={failPlaybackStart}
        onAbort={() => setPlaybackStart((current) => failListeningPlaybackStart(current))}
      />
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--kx-living-accent))]">
        <Headphones className="h-3.5 w-3.5" />
        {t("听力音频", "リスニング音声", "Listening audio")}
      </div>
      {policy.mode === "strict" ? (
        <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-[rgb(var(--kx-living-muted))]">
          {t("正式模考：仅播放一次，不可拖动或重播。", "本番モード：再生は1回のみで、シーク・再生し直しはできません。", "Exam mode: one play only; seeking and replay are disabled.")}
        </p>
      ) : null}
      {failed ? (
        <p className="mt-2 text-[13px] font-semibold text-[rgb(var(--kx-living-muted))]">
          {t("音频加载失败，请检查网络后重试。", "音声を読み込めませんでした。", "Couldn't load the audio.")}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            disabled={playBlocked}
            aria-label={playBlocked ? t("本题音频已播放", "この音声は再生済みです", "Audio already played") : playing ? t("暂停", "一時停止", "Pause") : t("播放", "再生", "Play")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))] shadow-[0_10px_22px_-12px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90 active:scale-95 disabled:opacity-45"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
          </button>
          <div className="min-w-0 flex-1">
            {policy.allowSeek ? (
              <input
                type="range"
                min={0}
                max={1000}
                value={pct}
                onChange={seek}
                disabled={!ready}
                aria-label={t("音频进度", "再生位置", "Seek")}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[rgb(var(--kx-living-ink))]/[0.12] accent-[rgb(var(--kx-living-accent))]"
                style={{ background: `linear-gradient(to right, rgb(var(--kx-living-accent)) ${pct / 10}%, rgb(var(--kx-living-ink)/0.12) ${pct / 10}%)` }}
              />
            ) : (
              <div
                role="progressbar"
                aria-label={t("音频播放进度", "音声の再生進捗", "Audio playback progress")}
                aria-valuemin={0}
                aria-valuemax={1000}
                aria-valuenow={Math.round(pct)}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.12]"
              >
                <div className="h-full bg-[rgb(var(--kx-living-accent))]" style={{ width: `${pct / 10}%` }} />
              </div>
            )}
            <div className="mt-1 flex justify-between text-[11px] font-bold tabular-nums text-[rgb(var(--kx-living-muted))]">
              <span>{fmtClock(cur)}</span>
              <span>{fmtClock(dur)}</span>
            </div>
          </div>
          {policy.allowReplay ? (
            <button
              type="button"
              onClick={replay}
              aria-label={t("重播", "もう一度", "Replay")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[rgb(var(--kx-living-accent))]/30 text-[rgb(var(--kx-living-accent))] transition hover:bg-[rgb(var(--kx-living-accent))]/[0.08]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
      </div>
    </div>
  );
}

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
  listeningPolicy,
  audioPlaybackKey,
}: {
  t: Tri;
  question: GuideJlptQuestion;
  index: number;
  total?: number;
  selectedIndex?: number;
  onSelect?: (i: number) => void;
  gradedCorrectIndex?: number;
  disabled?: boolean;
  revealed?: boolean;
  listeningPolicy?: GuideJlptListeningPolicy;
  audioPlaybackKey?: string;
}) {
  const correctIdx =
    gradedCorrectIndex !== undefined
      ? gradedCorrectIndex
      : revealed && question.answerIndex !== undefined
        ? question.answerIndex
        : undefined;
  const locked = disabled || revealed || correctIdx !== undefined;
  const hasAudio = !!question.audioUrl;
  // 听力题:答题时默认不显示脚本(听力就是要「听」);回看/已判分时或手动展开后
  // 才显示原文脚本，便于对照学习。
  const graded = correctIdx !== undefined;
  const policy = normalizeListeningPolicy(listeningPolicy);
  const [showScript, setShowScript] = useState(false);
  const scriptVisible = !hasAudio || graded || (policy.showTranscriptDuringAttempt && showScript);

  return (
    <div className={[JLPT_CARD, "p-5 sm:p-6"].join(" ")}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
        <span className="rounded-md bg-[rgb(var(--kx-living-accent))]/[0.1] px-2 py-0.5 font-bold text-[rgb(var(--kx-living-accent))]">
          {question.level}
        </span>
        <span>{
          (JLPT_SECTIONS as readonly string[]).includes(question.section)
            ? sectionLabel(t, question.section)
            : (question.sectionLabel || sectionLabel(t, question.section))
        }</span>
        {total ? (
          <span className="ml-auto tabular-nums">
            {index + 1} / {total}
          </span>
        ) : null}
        {question.isMemberOnly ? (
          <Lock className="h-3.5 w-3.5 text-[rgb(var(--kx-living-accent))]" aria-label={t("会员题", "会員問題", "Member")} />
        ) : null}
      </div>

      {hasAudio ? (
        <JlptAudioPlayer
          t={t}
          src={question.audioUrl as string}
          policy={graded ? undefined : policy}
          playbackKey={audioPlaybackKey}
        />
      ) : null}

      {question.passage && hasAudio && !scriptVisible && policy.showTranscriptDuringAttempt ? (
        <button
          type="button"
          onClick={() => setShowScript(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] px-3 py-1.5 text-[12px] font-bold text-[rgb(var(--kx-living-muted))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          {t("显示听力原文", "スクリプトを表示", "Show transcript")}
        </button>
      ) : null}

      {question.passage && scriptVisible ? (
        <p className="mt-3.5 whitespace-pre-wrap rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.03] px-4 py-3.5 text-sm font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
          {question.passage}
        </p>
      ) : null}

      <p className="mt-3.5 whitespace-pre-wrap text-[17px] font-bold leading-relaxed text-[rgb(var(--kx-living-ink))]">
        {question.stem}
      </p>

      <div className="mt-4 grid gap-2.5">
        {question.choices.map((choice, i) => {
          const isSelected = selectedIndex === i;
          const isCorrect = correctIdx === i;
          const isWrongPick = correctIdx !== undefined && isSelected && !isCorrect;
          let cls =
            "border-[rgb(var(--kx-living-ink))]/[0.09] bg-[rgb(var(--kx-living-surface))] hover:border-[rgb(var(--kx-living-accent))]/45 hover:bg-[rgb(var(--kx-living-accent))]/[0.04]";
          if (isCorrect) cls = "border-emerald-500/55 bg-emerald-500/[0.1]";
          else if (isWrongPick) cls = "border-red-500/55 bg-red-500/[0.08]";
          else if (isSelected && correctIdx === undefined)
            cls = "border-[rgb(var(--kx-living-accent))]/70 bg-[rgb(var(--kx-living-accent))]/[0.08]";
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => onSelect?.(i)}
              className={[
                "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition disabled:cursor-default",
                cls,
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold transition",
                  isCorrect
                    ? "bg-emerald-500 text-white"
                    : isWrongPick
                      ? "bg-red-500 text-white"
                      : isSelected
                        ? "bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))]"
                        : "bg-[rgb(var(--kx-living-ink))]/[0.07] text-[rgb(var(--kx-living-muted))]",
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
        <div className="mt-4 rounded-2xl border border-[rgb(var(--kx-living-accent))]/20 bg-[rgb(var(--kx-living-accent))]/[0.05] px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--kx-living-accent))]">
            {t("解析", "解説", "Explanation")}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[rgb(var(--kx-living-ink))]">
            {question.explanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Machi AI 逐题讲解 button (会员权益; free callers spend their normal Machi AI
 *  daily quota, or get an upgrade/quota prompt from the server). */
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
      <div className="mt-3 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.05] px-4 py-3.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--kx-living-accent))]">
          <Sparkles className="h-3.5 w-3.5" /> Machi AI
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[rgb(var(--kx-living-ink))]">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-accent))]/30 bg-[rgb(var(--kx-living-accent))]/[0.07] px-3.5 py-2 text-xs font-bold text-[rgb(var(--kx-living-accent))] transition hover:bg-[rgb(var(--kx-living-accent))]/[0.12] disabled:opacity-60"
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
