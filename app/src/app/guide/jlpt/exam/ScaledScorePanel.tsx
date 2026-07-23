"use client";

// JLPT 标准出分面板（全真卷，score_mode='jlpt_scaled'）——笔试缩放总分(0-120)
// + 各科分条(0-60 或 N4·N5 合并 0-120，带基准点刻度) + 参考合格判定。
// 只用既有 kx-living-* token 与 Tailwind 工具类拼装（JlptKit 同款零全局 CSS
// 约定）；不含聴解，note 免责必须展示，绝不暗示与官方成绩等价。

import type { GuideJlptScaledResult } from "@/lib/guide";
import { fmtDuration, JLPT_CARD, type Tri } from "../JlptKit";
import {
  localizedScoreDivisionLabel,
  localizedScoreReferenceNote,
} from "./examContract";

export function ScaledScorePanel({
  t,
  language,
  scaled,
  correct,
  total,
  durationSeconds,
}: {
  t: Tri;
  language: string;
  scaled: GuideJlptScaledResult;
  correct?: number;
  total?: number;
  durationSeconds?: number;
}) {
  const passRef = scaled.passedWrittenReference;
  const accent = passRef ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  // JLPT 的两道门：总分达参考线 + 每科过基准点。总分够了却栽在某科基准点上是
  // 真实且常见的落榜方式——此时必须说清是「科目」而不是「总分」不够，否则
  // 分数明明 ≥ 参考线却写「未达参考线」，考生会以为出分算错了。
  const totalReached = scaled.writtenTotal >= scaled.passLineWritten;
  const failedScales = scaled.scales.filter((s) => !s.passed);
  const label = (key: string, fallback: string) =>
    localizedScoreDivisionLabel(language, key, fallback);
  const verdict = passRef
    ? t(`达到笔试参考线 ${scaled.passLineWritten}`, `筆記参考ライン ${scaled.passLineWritten} 到達`, `Reached written reference line ${scaled.passLineWritten}`)
    : totalReached && failedScales.length > 0
      ? t(
          `总分达线，但「${failedScales.map((s) => label(s.key, s.label)).join("・")}」未过基准点`,
          `合計は到達、ただし「${failedScales.map((s) => label(s.key, s.label)).join("・")}」が基準点未満`,
          `Total reached, but ${failedScales.map((s) => label(s.key, s.label)).join(" / ")} is below its section minimum`,
        )
      : t(`未达笔试参考线 ${scaled.passLineWritten}`, `筆記参考ライン ${scaled.passLineWritten} 未達`, `Below written reference line ${scaled.passLineWritten}`);
  return (
    <div className={[JLPT_CARD, "relative overflow-hidden rounded-[28px] px-6 py-8 text-center sm:px-7"].join(" ")}>
      {/* one faint halo behind the number — same scorecard face as JlptScoreHero */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background: passRef
            ? "radial-gradient(closest-side, rgb(16 185 129 / 0.14), transparent)"
            : "radial-gradient(closest-side, rgb(245 158 11 / 0.1), transparent)",
        }}
      />
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--kx-living-muted))]">
        {t("JLPT 标准出分 · 笔试参考", "JLPT 準拠スコア・筆記参考", "JLPT-style written score")}
      </p>

      <p className="relative mt-3 leading-none">
        <span className={["text-[56px] font-black tabular-nums tracking-[-0.02em]", accent].join(" ")}>{scaled.writtenTotal}</span>
        <span className="ml-1.5 text-base font-semibold text-[rgb(var(--kx-living-muted))]">/ {scaled.writtenMax}</span>
      </p>

      <p
        className={[
          "relative mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ring-1",
          passRef
            ? "bg-emerald-500/[0.1] text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
            : "bg-amber-500/[0.1] text-amber-600 ring-amber-500/25 dark:text-amber-400",
        ].join(" ")}
      >
        {verdict}
      </p>

      {typeof correct === "number" && typeof total === "number" && total > 0 ? (
        <p className="relative mt-2.5 text-xs font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
          {t(`答对 ${correct} / ${total}`, `正解 ${correct} / ${total}`, `${correct} / ${total} correct`)}
          {typeof durationSeconds === "number" && durationSeconds > 0 ? ` · ${fmtDuration(durationSeconds)}` : null}
        </p>
      ) : null}

      <div className="relative mt-6 space-y-4 text-left">
        {scaled.scales.map((scale) => {
          const max = Math.max(1, scale.scaledMax);
          const fillPct = Math.min(100, Math.max(2, (scale.scaled / max) * 100));
          const minPct = Math.min(100, Math.max(0, (scale.sectionMin / max) * 100));
          const barTone = scale.passed ? "bg-emerald-500" : "bg-amber-500";
          return (
            <div key={scale.key}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-[rgb(var(--kx-living-ink))]">{label(scale.key, scale.label)}</p>
                <p className="text-sm font-bold tabular-nums">
                  <span className={scale.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>{scale.scaled}</span>
                  <span className="text-[11px] font-medium text-[rgb(var(--kx-living-muted))]"> / {scale.scaledMax}</span>
                </p>
              </div>
              <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-[rgb(var(--kx-living-ink))]/[0.06]">
                <div className={["h-full rounded-full", barTone].join(" ")} style={{ width: `${fillPct}%` }} />
                {scale.sectionMin > 0 ? (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-[rgb(var(--kx-living-ink))]/40"
                    style={{ left: `${minPct}%` }}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
                <span>{t(`答对 ${scale.raw}/${scale.rawMax}`, `正解 ${scale.raw}/${scale.rawMax}`, `${scale.raw}/${scale.rawMax} correct`)}</span>
                {scale.sectionMin > 0 ? (
                  <span>{t(`基准点 ${scale.sectionMin}`, `基準点 ${scale.sectionMin}`, `Section min ${scale.sectionMin}`)}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="relative mt-6 text-[11px] leading-relaxed text-[rgb(var(--kx-living-muted))]">
        {localizedScoreReferenceNote(language, "written")}
      </p>
    </div>
  );
}
