"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { ExamCountdownBar, JlptDisclaimer, type Tri } from "../JlptKit";

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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <GuideShell back={back}>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          JLPT · {t("日历", "日程", "Calendar")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("考试日历", "試験日程", "Exam dates")}
        </h1>
        <p className="mt-1.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] sm:text-sm">
          {t("日本地区 JLPT 公开日程,报名以官方公告为准。", "日本地域の JLPT 公開日程。申込は公式発表に従ってください。", "Public JLPT schedule for Japan. Register per official announcements.")}
        </p>
      </header>

      {q.isLoading ? (
        <InlineLoading />
      ) : q.isError ? (
        <ErrorState />
      ) : (
        <>
          <ExamCountdownBar t={t} countdown={q.data?.countdown} href="/guide/jlpt/exam-dates" />

          {!q.data?.examDates?.length ? (
            <div className="mt-8 flex min-h-[26vh] flex-col items-center justify-center text-center">
              <CalendarClock className="h-10 w-10 text-[rgb(var(--kx-living-muted))]" />
              <p className="mt-3 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
                {t("暂无日程", "日程がありません", "No dates yet")}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {q.data.examDates.map((d) => {
                const upcoming = d.examDate >= today;
                return (
                  <div
                    key={d.id}
                    className={[
                      "flex items-start gap-3 rounded-2xl border px-4 py-3.5",
                      upcoming
                        ? "border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.06]"
                        : "border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] opacity-70",
                    ].join(" ")}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-[rgb(var(--kx-living-accent))]">
                      <CalendarClock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-[rgb(var(--kx-living-ink))]">
                        {d.sessionLabel || d.examDate}
                        {!upcoming ? (
                          <span className="ml-2 text-[10px] font-bold uppercase text-[rgb(var(--kx-living-muted))]">
                            {t("已过", "終了", "Past")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-[rgb(var(--kx-living-muted))]">
                        {t("考试日", "試験日", "Exam")}: {d.examDate || "—"}
                      </p>
                      {d.regOpenDate || d.regCloseDate ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-[rgb(var(--kx-living-muted))]">
                          {t("报名", "申込", "Registration")}: {d.regOpenDate || "?"} — {d.regCloseDate || "?"}
                        </p>
                      ) : null}
                      {d.note ? (
                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">{d.note}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <JlptDisclaimer
        t={t}
        note={t(
          "以上为公开考试日程整理,具体报名时间、考点与费用请以 JLPT 官方最新公告为准。",
          "上記は公開日程の整理です。申込期間・会場・費用は JLPT 公式の最新発表をご確認ください。",
          "The above is a summary of the public schedule. Confirm registration windows, venues, and fees with official JLPT announcements.",
        )}
      />
    </GuideShell>
  );
}
