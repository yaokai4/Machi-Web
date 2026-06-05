"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Eye } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell, GuideComingSoon, ArticleCard, categoryHref, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { relativeTime } from "@/lib/format";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

export default function GuideArticlePage() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const q = useQuery({
    queryKey: ["guide", "article", country, language, slug],
    queryFn: () => guide.article(slug, country, language),
    enabled: country === "jp" && slug.length > 0,
    staleTime: 60_000,
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  if (q.isLoading) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (q.isError || !q.data?.article) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <ErrorState
          title={locale === "en" ? "Guide article not found" : locale === "ja" ? "ガイド記事が見つかりません" : "指南内容不存在"}
          subtitle={locale === "en" ? "It may have been moved or unpublished." : locale === "ja" ? "移動または非公開になった可能性があります。" : "它可能已被移动或下线。"}
          onRetry={() => q.refetch()}
        />
      </GuideShell>
    );
  }
  const a = q.data.article;
  const related = q.data.related || [];
  const paragraphs = (a.body || "").split(/\n{2,}/).filter((p) => p.trim());

  return (
    <GuideShell
      back={{ href: categoryHref(a.categoryKey), label: locale === "en" ? "Back to category" : locale === "ja" ? "カテゴリに戻る" : "返回分类" }}
      right={<ArticleRightRail related={related} />}
    >
      <article className="px-4 py-4 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
          <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{locale === "en" ? "Guide" : locale === "ja" ? "ガイド" : "指南"}</span>
          <span>{a.authorName}</span>
          {a.publishedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> {relativeTime(a.publishedAt)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> {a.viewCount}
          </span>
        </div>
        <h1 className="text-2xl font-black leading-tight text-kx-text sm:text-3xl">{a.title}</h1>
        {a.summary ? <p className="mt-3 text-base leading-8 text-kx-subtle">{a.summary}</p> : null}
        {a.tags?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.tags.map((t) => (
              <span key={t} className="rounded-full bg-kx-soft px-2.5 py-0.5 text-xs text-kx-muted">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 space-y-4 border-t border-kx-stroke/40 pt-5">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line text-[15px] leading-8 text-kx-text/90">
              {p}
            </p>
          ))}
        </div>

        <div className="mt-8 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 text-xs leading-6 text-kx-muted">
          {locale === "en" ? `This content is curated by ${a.authorName} for reference only. For visas, immigration, exams and other official procedures, always check the latest official notices as well.` : locale === "ja" ? `本コンテンツは ${a.authorName} が参考用に整理したものです。ビザ、入管、試験などの公式手続きについては、必ず公式の最新案内も確認してください。` : `本内容由 ${a.authorName} 整理，仅供参考。涉及签证、入管、考试等官方流程时，请同时以官方最新公告为准。`}
        </div>

        {related.length ? (
          <section className="mt-8 xl:hidden">
            <h2 className="mb-3 text-lg font-black text-kx-text">{locale === "en" ? "Related guides" : locale === "ja" ? "関連ガイド" : "相关指南"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <ArticleCard key={r.id} article={r} compact />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </GuideShell>
  );
}

function ArticleRightRail({ related }: { related: Array<{ id: string; slug: string; title: string; summary: string; tags: string[]; authorName: string }> }) {
  const { locale } = useI18n();
  const copy = guideUi(locale);
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <h3 className="kx-section-title mb-2 px-0">{locale === "en" ? "Related guides" : locale === "ja" ? "関連ガイド" : "相关指南"}</h3>
        {related.length ? (
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/guide/articles/${r.slug}`} className="group flex gap-2 rounded-kx-sm p-1.5 hover:bg-kx-soft">
                  <span className="line-clamp-2 text-sm font-semibold text-kx-text group-hover:text-kx-accent">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-kx-muted">{locale === "en" ? "No related content yet." : locale === "ja" ? "関連コンテンツはまだありません。" : "暂无相关内容。"}</p>
        )}
      </section>
      <section className="kx-card">
        <h3 className="text-base font-black text-kx-text">{locale === "en" ? "Need resources or support?" : locale === "ja" ? "資料やサポートが必要ですか？" : "需要资料或辅导？"}</h3>
        <p className="mt-1 text-sm leading-6 text-kx-subtle">{copy.services.subtitle}</p>
        <Link href="/guide/services" className="kx-button-primary mt-3 inline-flex h-9">{copy.services.title}</Link>
      </section>
    </div>
  );
}
