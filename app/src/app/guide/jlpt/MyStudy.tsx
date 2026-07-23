"use client";

// 「我的学习」zone strip — a signed-in learner's four快照 cards (定级结果 /
// 最近成绩 / 错题数 / 词汇进度) on the JLPT hub landing. Data comes ONLY from
// endpoints that already exist (exam history / review book / vocab progress);
// the placement result has no server read endpoint, so the placement card reads
// a per-user localStorage snapshot written when the user finishes定级 (see
// storePlacementResult, called by PlacementClient). Everything degrades
// silently: each failed/empty source simply hides its card, and if nothing is
// available the whole section disappears — the zone's main flow never blocks.

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, GraduationCap, NotebookPen, BookOpenCheck, UserRound, ChevronRight } from "lucide-react";
import { guide, type GuideJlptPlacementResult } from "@/lib/guide";
import { useSession, useAuthPrompt } from "@/lib/store";
import { GuideSectionTitle } from "@/components/guide/GuideKit";
import { JlptSkel, type Tri } from "./JlptKit";

/* ------------------------------------------------------------------ */
/* Placement snapshot (localStorage — no server read endpoint exists)  */
/* ------------------------------------------------------------------ */

const PLACEMENT_STORE_PREFIX = "machi:jlpt:placement:";

export type StoredPlacement = {
  recommendedLevel: string;
  suggestedDailyMinutes: number;
  /** ISO timestamp of when the placement was taken. */
  at: string;
};

/** Persist the just-scored placement result for the zone's 我的学习 card.
 *  Keyed per user id so switching accounts never shows someone else's level.
 *  Best-effort: private mode / quota errors only mean the card won't show. */
export function storePlacementResult(userId: string, result: GuideJlptPlacementResult): void {
  if (typeof window === "undefined" || !userId || !result?.recommendedLevel) return;
  try {
    window.localStorage.setItem(
      PLACEMENT_STORE_PREFIX + userId,
      JSON.stringify({
        recommendedLevel: result.recommendedLevel,
        suggestedDailyMinutes: result.suggestedDailyMinutes || 0,
        at: new Date().toISOString(),
      } satisfies StoredPlacement),
    );
  } catch {
    /* best-effort */
  }
}

export function readPlacementResult(userId: string): StoredPlacement | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(PLACEMENT_STORE_PREFIX + userId);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredPlacement> | null;
    if (!data || typeof data.recommendedLevel !== "string" || !/^N[1-5]$/.test(data.recommendedLevel)) {
      return null;
    }
    return {
      recommendedLevel: data.recommendedLevel,
      suggestedDailyMinutes:
        typeof data.suggestedDailyMinutes === "number" && Number.isFinite(data.suggestedDailyMinutes)
          ? Math.max(0, Math.round(data.suggestedDailyMinutes))
          : 0,
      at: typeof data.at === "string" ? data.at : "",
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The strip                                                           */
/* ------------------------------------------------------------------ */

// The review endpoint caps at 50 questions; length===50 renders as "50+".
const REVIEW_COUNT_CAP = 50;

type StudyCard = {
  key: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Tailwind text-color class for the big value. */
  valueCls: string;
  sub: string;
};

export function MyStudySection({ t }: { t: Tri }) {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const authed = status === "authed" && !!user;

  // localStorage is read in an effect (never during render) so the SSR'd HTML
  // and the first client paint stay identical — no hydration mismatch.
  const [placement, setPlacement] = useState<StoredPlacement | null>(null);
  useEffect(() => {
    setPlacement(authed && user ? readPlacementResult(user.id) : null);
  }, [authed, user]);

  // All three sources are existing read endpoints. retry:false + hidden-on-error
  // keeps a flaky network from ever blocking the zone (silent degrade).
  const historyQ = useQuery({
    queryKey: ["guide", "jlpt-exam-history"],
    queryFn: () => guide.jlptExamHistory(),
    enabled: authed,
    retry: false,
    staleTime: 60_000,
  });
  const reviewQ = useQuery({
    queryKey: ["guide", "jlpt-review-pending"],
    queryFn: () => guide.jlptReview({ count: REVIEW_COUNT_CAP }),
    enabled: authed,
    retry: false,
    staleTime: 60_000,
  });
  const vocabQ = useQuery({
    queryKey: ["guide", "jlpt-vocab-progress", ""],
    queryFn: () => guide.jlptVocabProgress(),
    enabled: authed,
    retry: false,
    staleTime: 60_000,
  });

  const title = t("我的学习", "学習の記録", "My study");

  // Confirmed guest → a quiet login nudge card. (idle/loading/degraded render
  // nothing at all: we don't know yet, and the zone must not flicker.)
  if (status === "unauthed") {
    return (
      <section className="mt-8">
        <GuideSectionTitle title={title} />
        <button
          type="button"
          onClick={() =>
            openAuthPrompt({
              kind: "generic",
              title: t("登录后同步学习进度", "ログインして学習記録を同期", "Log in to sync your study progress"),
            })
          }
          className="group flex w-full items-center gap-3.5 rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-4 text-left transition hover:border-[rgb(var(--kx-living-accent))]/30"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.09] text-[rgb(var(--kx-living-accent))]">
            <UserRound className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[rgb(var(--kx-living-ink))]">
              {t("登录后查看学习进度", "ログインして学習状況を見る", "Log in to see your progress")}
            </span>
            <span className="mt-0.5 block text-xs text-[rgb(var(--kx-living-muted))]">
              {t(
                "定级结果、模考成绩、错题与单词进度会同步在这里。",
                "レベル判定・模試の成績・間違いノート・単語の進捗をここに表示します。",
                "Your placement, mock scores, review book and vocab progress will show up here.",
              )}
            </span>
          </span>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-hover:translate-x-0.5 group-hover:bg-[rgb(var(--kx-living-accent))]/[0.12] group-hover:text-[rgb(var(--kx-living-accent))]">
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </section>
    );
  }

  if (!authed) return null;

  const loading = historyQ.isLoading || reviewQ.isLoading || vocabQ.isLoading;

  const latest = historyQ.data?.sessions?.[0];
  const wrongCount = reviewQ.data?.questions?.length ?? 0;
  const vocab = vocabQ.data;

  const cards: StudyCard[] = [];
  if (placement) {
    cards.push({
      key: "placement",
      href: "/guide/jlpt/placement",
      icon: Target,
      label: t("定级结果", "判定レベル", "Placement"),
      value: placement.recommendedLevel,
      valueCls: "text-[rgb(var(--kx-living-accent))]",
      sub:
        placement.suggestedDailyMinutes > 0
          ? t(
              `建议每天 ${placement.suggestedDailyMinutes} 分钟`,
              `1日 ${placement.suggestedDailyMinutes} 分を推奨`,
              `~${placement.suggestedDailyMinutes} min/day`,
            )
          : t("推荐备考等级", "おすすめレベル", "Recommended level"),
    });
  }
  if (latest) {
    // 全真卷显示缩放笔试分(0-120,按参考线判色);普通卷维持 0-100 百分比 —
    // same display contract as the exam page's HistoryRow.
    const displayScore = latest.scaled ? latest.scaled.writtenTotal : latest.score;
    const displayPassed = latest.scaled ? latest.scaled.passedWrittenReference : latest.passed;
    const when = (latest.submittedAt || latest.startedAt || "").slice(0, 10);
    cards.push({
      key: "score",
      href: "/guide/jlpt/exam",
      icon: GraduationCap,
      label: t("最近成绩", "直近の成績", "Latest score"),
      value: `${displayScore}`,
      valueCls: displayPassed
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-[rgb(var(--kx-living-ink))]",
      sub: [latest.level, when].filter(Boolean).join(" · "),
    });
  }
  if (wrongCount > 0) {
    cards.push({
      key: "review",
      href: "/guide/jlpt/review",
      icon: NotebookPen,
      label: t("错题本", "間違いノート", "Review book"),
      value: wrongCount >= REVIEW_COUNT_CAP ? `${REVIEW_COUNT_CAP}+` : `${wrongCount}`,
      valueCls: "text-[rgb(var(--kx-living-ink))]",
      sub: t("道错题待复习", "問 復習待ち", "waiting for review"),
    });
  }
  if (vocab && vocab.total > 0 && vocab.mastered > 0) {
    cards.push({
      key: "vocab",
      href: "/guide/jlpt/vocab",
      icon: BookOpenCheck,
      label: t("词汇进度", "単語の進捗", "Vocabulary"),
      value: `${vocab.mastered}`,
      valueCls: "text-[rgb(var(--kx-living-ink))]",
      sub: t(`已掌握 · 共 ${vocab.total} 词`, `習得済み · 全 ${vocab.total} 語`, `mastered of ${vocab.total}`),
    });
  }

  // Nothing to show and nothing on the way → the section quietly disappears
  // (fresh accounts and total-failure cases look identical: no dead chrome).
  if (!loading && cards.length === 0) return null;

  return (
    <section className="mt-8">
      <GuideSectionTitle
        title={title}
        subtitle={t("你的备考进度,一眼看全", "学習状況をひと目で", "Your prep at a glance")}
      />
      {loading && cards.length === 0 ? (
        <div role="status" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <span className="sr-only">{t("加载中…", "読み込み中…", "Loading…")}</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <JlptSkel key={i} className="h-[96px] rounded-[20px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.key}
                href={c.href}
                className="group rounded-[20px] border border-[rgb(var(--kx-living-ink))]/[0.06] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/30 motion-reduce:hover:translate-y-0"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--kx-living-accent))]" />
                  <span className="truncate">{c.label}</span>
                </p>
                <p className={["mt-2 text-[22px] font-black leading-none tracking-[-0.01em] tabular-nums", c.valueCls].join(" ")}>
                  {c.value}
                </p>
                <p className="mt-1.5 truncate text-[11px] font-medium text-[rgb(var(--kx-living-muted))]">{c.sub}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
