"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  ExamCountdownBar,
  JlptDisclaimer,
  JlptNarrow,
  JlptPageHeader,
  JlptStateCard,
  JlptPageSkeleton,
  JlptErrorCard,
  type Tri,
} from "../JlptKit";

export function ExamDatesClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);

  const q = useQuery({
    queryKey: ["guide", "jlpt-exam-dates", "jp"],
    queryFn: () => guide.jlptExamDates("jp"),
    staleTime: 300_000,
  });

  const back = { href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") };
  // Compare against the JST calendar date (audience is in Japan): a UTC "today"
  // reads as yesterday during the JST 00:00–09:00 window, off-by-one'ing the
  // upcoming/past split for a session held that very day.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <GuideShell back={back}>
      <JlptNarrow>
        <JlptPageHeader
          eyebrow={`JLPT · ${t("日历", "日程", "Calendar")}`}
          title={t("考试日历", "試験日程", "Exam dates")}
          subtitle={t("日本地区 JLPT 公开日程,报名以官方公告为准。", "日本地域の JLPT 公開日程。申込は公式発表に従ってください。", "Public JLPT schedule for Japan. Register per official announcements.")}
        />

        {q.isLoading ? (
          <JlptPageSkeleton t={t} variant="rows" />
        ) : q.isError ? (
          <JlptErrorCard
            t={t}
            onRetry={() => q.refetch()}
            retrying={q.isFetching}
            title={t("日程加载失败", "日程を読み込めませんでした", "Couldn't load the schedule")}
          />
        ) : (
          <div className="mt-6">
            {/* Static banner — this IS the exam-dates page, no self-link. */}
            <ExamCountdownBar t={t} countdown={q.data?.countdown} href={null} />

            {!q.data?.examDates?.length ? (
              <JlptStateCard
                icon={CalendarClock}
                title={t("暂无日程", "日程がありません", "No dates yet")}
                body={t("请稍后再来,或以官方公告为准。", "後ほどご確認いただくか、公式発表をご参照ください。", "Check back later, or refer to official announcements.")}
              />
            ) : (
              <div className="mt-3 space-y-2.5">
                {q.data.examDates.map((d) => {
                  const upcoming = d.examDate >= today;
                  return (
                    <div
                      key={d.id}
                      className={[
                        "flex items-start gap-3.5 rounded-[22px] border px-4 py-4 transition",
                        upcoming
                          ? "border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.06] shadow-[0_20px_44px_-40px_rgb(var(--kx-shadow)/0.7)]"
                          : "border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] opacity-65",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                          upcoming
                            ? "bg-[rgb(var(--kx-living-accent))]/[0.14] text-[rgb(var(--kx-living-accent))]"
                            : "bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))]",
                        ].join(" ")}
                      >
                        <CalendarClock className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[15px] font-bold text-[rgb(var(--kx-living-ink))]">
                          {d.sessionLabel || d.examDate}
                          {!upcoming ? (
                            <span className="rounded-md bg-[rgb(var(--kx-living-ink))]/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
                              {t("已过", "終了", "Past")}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
                          {t("考试日", "試験日", "Exam")}: {d.examDate || "—"}
                        </p>
                        {d.regOpenDate || d.regCloseDate ? (
                          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-[rgb(var(--kx-living-muted))]">
                            {t("报名", "申込", "Registration")}: {d.regOpenDate || "?"} — {d.regCloseDate || "?"}
                          </p>
                        ) : null}
                        {d.note ? (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-[rgb(var(--kx-living-muted))]">{d.note}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <JlptDisclaimer
          t={t}
          note={t(
            "以上为公开考试日程整理,具体报名时间、考点与费用请以 JLPT 官方最新公告为准。",
            "上記は公開日程の整理です。申込期間・会場・費用は JLPT 公式の最新発表をご確認ください。",
            "The above is a summary of the public schedule. Confirm registration windows, venues, and fees with official JLPT announcements.",
          )}
        />
      </JlptNarrow>
    </GuideShell>
  );
}
