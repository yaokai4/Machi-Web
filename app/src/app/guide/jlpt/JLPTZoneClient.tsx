"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { guide } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ArticleCard,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

// study-plan CTA route token → concrete web path.
const ROUTE_HREF: Record<string, string> = { guidePlan: "/guide/plan" };

/**
 * JLPT 备考专区 — a curated prep hub (hero, N5–N1 levels, member-priced
 * resources, roadmap articles, FAQ, study-plan CTA) backed by /api/guide/jlpt.
 * Replaces the old generic category view so JLPT reads as a real destination
 * and a concrete membership payoff.
 */
export function JLPTZoneClient() {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const t = (zh: string, ja: string, en: string) =>
    language === "ja" ? ja : language === "en" ? en : zh;

  const zone = useQuery({
    queryKey: ["guide", "jlpt-zone", country, language],
    queryFn: () => guide.jlptZone(country, language),
    staleTime: 60_000,
  });

  if (zone.isLoading) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (zone.isError || !zone.data) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <ErrorState />
      </GuideShell>
    );
  }
  if (zone.data.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  const d = zone.data;
  const planHref = ROUTE_HREF[d.studyPlan?.route || ""] || "/guide/plan";

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          Machi Guide · JLPT
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {d.hero?.title}
        </h1>
        {d.hero?.subtitle ? (
          <p className="mt-1.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))] sm:text-sm">
            {d.hero.subtitle}
          </p>
        ) : null}
      </header>

      {d.studyPlan?.title ? (
        <Link
          href={planHref}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08] px-4 py-3.5 transition hover:bg-[rgb(var(--kx-living-accent))]/[0.12]"
        >
          <div className="min-w-0">
            <p className="text-sm font-black text-[rgb(var(--kx-living-accent))]">{d.studyPlan.title}</p>
            {d.studyPlan.subtitle ? (
              <p className="mt-0.5 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{d.studyPlan.subtitle}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-lg font-black text-[rgb(var(--kx-living-accent))]">→</span>
        </Link>
      ) : null}

      {d.levels && d.levels.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title="N5 – N1" />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.levels.map((lv) => (
              <div
                key={lv.key}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--kx-living-accent))]/[0.12] text-sm font-black text-[rgb(var(--kx-living-accent))]">
                  {lv.label}
                </span>
                <p className="text-xs font-semibold leading-relaxed text-[rgb(var(--kx-living-muted))]">{lv.summary}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {d.resources && d.resources.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("资料与模拟题", "資料・模擬問題", "Resources & mock tests")} />
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {d.resources.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      {d.articles && d.articles.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("备考路线与方法", "学習ロードマップ", "Roadmaps & methods")} />
          <div className="mt-2 space-y-2.5">
            {d.articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      ) : null}

      {d.faq && d.faq.length > 0 ? (
        <section className="mt-6">
          <GuideSectionTitle title={t("常见问题", "よくある質問", "FAQ")} />
          <div className="mt-2 space-y-2">
            {d.faq.map((f) => (
              <details
                key={f.id}
                className="rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-4 py-3"
              >
                <summary className="cursor-pointer text-sm font-bold text-[rgb(var(--kx-living-ink))]">
                  {f.question}
                </summary>
                <p className="mt-2 text-xs font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {d.disclaimer ? (
        <p className="mt-6 rounded-xl bg-[rgb(var(--kx-living-ink))]/[0.04] px-4 py-3 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
          {d.disclaimer}
        </p>
      ) : null}
    </GuideShell>
  );
}
