"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { guide, guideCityLabel } from "@/lib/guide";
import { GuideShell, GuideComingSoon, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";
import { appLocaleToGuideLanguage, type Locale, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

function cityFilterLabel(value: string, locale: Locale): string {
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    "": { zh: "全部地区", en: "All areas", ja: "すべての地域" },
    tokyo: { zh: "东京", en: "Tokyo", ja: "東京" },
    osaka: { zh: "大阪", en: "Osaka", ja: "大阪" },
  };
  const lang = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  return table[value]?.[lang] || guideCityLabel(value);
}

function copy(locale: Locale) {
  if (locale === "en") {
    return {
      title: "Interview Reviews",
      subtitle: "Real interview notes submitted by users and shown after review",
      loadError: "Interview reviews are temporarily unavailable",
      emptyTitle: "No interview reviews yet",
      emptySubtitle: "Open a company page and share the first interview note.",
      companyFallback: "Company",
    };
  }
  if (locale === "ja") {
    return {
      title: "面接レビュー",
      subtitle: "ユーザーが投稿し、審査後に掲載される実際の面接体験",
      loadError: "面接レビューを読み込めません",
      emptyTitle: "面接レビューはまだありません",
      emptySubtitle: "会社ページから最初の面接体験を投稿できます。",
      companyFallback: "会社",
    };
  }
  return {
    title: "面试评论",
    subtitle: "来自用户的真实面试经验，经审核后展示",
    loadError: "面试评论暂时无法加载",
    emptyTitle: "还没有面试评论",
    emptySubtitle: "到具体公司页面分享你的第一条面试经验吧。",
    companyFallback: "公司",
  };
}

export default function GuideInterviewReviewsPage() {
  const country = useGuideCountry();
  const [city, setCity] = useState("");
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const g = guideUi(locale);
  const c = copy(locale);

  const q = useQuery({
    queryKey: ["guide", "interview-reviews", country, city, language],
    queryFn: () => guide.interviewReviews({ country, city: city || undefined, language, pageSize: 50 }),
    staleTime: 20_000,
  });

  if (q.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: g.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: g.back }}>
      <header className="px-4 pb-3 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7C3AED] text-white shadow-sm">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{c.title}</h1>
            <p className="text-xs text-kx-muted">{c.subtitle}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {["", "tokyo", "osaka"].map((value) => (
            <button key={value || "all"} type="button" data-active={city === value} onClick={() => setCity(value)} className="kx-tab h-8 px-3 text-xs">
              {cityFilterLabel(value, locale)}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-3 sm:px-6">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState title={c.loadError} subtitle={g.retryLater} onRetry={() => q.refetch()} />
        ) : (q.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={c.emptyTitle}
            subtitle={c.emptySubtitle}
          />
        ) : (
          <div className="space-y-3">
            {q.data!.items.map((r) => (
              <Link
                key={r.id}
                href={r.companySlug ? `/guide/companies/${r.companySlug}/reviews` : "/guide/companies"}
                className="block rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 transition hover:border-kx-accent/40 hover:shadow-kx"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-kx-muted">
                  <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{r.companyName || c.companyFallback}</span>
                  {r.position ? <span>{r.position}</span> : null}
                  {r.result ? <span>· {r.result}</span> : null}
                  <span>· {guideCityLabel(r.city)}</span>
                  {r.interviewYear ? <span>· {r.interviewYear}</span> : null}
                </div>
                {r.questions ? <p className="line-clamp-2 text-sm leading-6 text-kx-subtle">{r.questions}</p> : null}
              </Link>
            ))}
          </div>
        )}
        {q.data?.disclaimer ? <p className="mt-4 text-[11px] leading-5 text-kx-muted">{q.data.disclaimer}</p> : null}
      </div>
    </GuideShell>
  );
}
