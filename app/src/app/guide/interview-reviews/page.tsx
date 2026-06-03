"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { guide, guideCityLabel } from "@/lib/guide";
import { GuideShell, GuideComingSoon, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";

const CITY_FILTERS = [
  { value: "", label: "全部地区" },
  { value: "tokyo", label: "东京" },
  { value: "osaka", label: "大阪" },
];

export default function GuideInterviewReviewsPage() {
  const country = useGuideCountry();
  const [city, setCity] = useState("");

  const q = useQuery({
    queryKey: ["guide", "interview-reviews", country, city],
    queryFn: () => guide.interviewReviews({ country, city: city || undefined, pageSize: 50 }),
    staleTime: 20_000,
  });

  if (q.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <header className="px-4 pb-3 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7C3AED] text-white shadow-sm">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">面试评论</h1>
            <p className="text-xs text-kx-muted">来自用户的真实面试经验，经审核后展示</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {CITY_FILTERS.map((c) => (
            <button key={c.value || "all"} type="button" data-active={city === c.value} onClick={() => setCity(c.value)} className="kx-tab h-8 px-3 text-xs">
              {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-3 sm:px-6">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState title="面试评论暂时无法加载" subtitle="请稍后再试。" onRetry={() => q.refetch()} />
        ) : (q.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="还没有面试评论"
            subtitle="到具体公司页面分享你的第一条面试经验吧。"
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
                  <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{r.companyName || "公司"}</span>
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
