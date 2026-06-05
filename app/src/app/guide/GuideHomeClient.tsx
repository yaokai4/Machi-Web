"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Sparkles, X } from "lucide-react";
import { guide, type GuideArticle } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  CategoryCard,
  ResourceEntryCard,
  ArticleCard,
  ProductCard,
  SchoolCard,
  CompanyCard,
  GoalChip,
  categoryHref,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

export default function GuideHomeClient() {
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");

  const home = useQuery({
    queryKey: ["guide", "home", country, language],
    queryFn: () => guide.home(country, language),
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: ["guide", "search", country, language, keyword],
    queryFn: () => guide.articles({ country, language, keyword, pageSize: 12 }),
    enabled: keyword.trim().length > 0,
    staleTime: 30_000,
  });

  if (home.isLoading) {
    return (
      <GuideShell>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (home.isError || !home.data) {
    return (
      <GuideShell>
        <ErrorState title={t("guide_load_error_title")} subtitle={t("guide_load_error_subtitle")} onRetry={() => home.refetch()} />
      </GuideShell>
    );
  }
  const data = home.data;
  if (data.status === "coming_soon") {
    return (
      <GuideShell>
        <GuideComingSoon empty={data.emptyState} />
      </GuideShell>
    );
  }

  const hero = data.hero;
  const submitSearch = () => setKeyword(draft.trim());
  const searching = keyword.trim().length > 0;

  return (
    <GuideShell right={<GuideRightRail />}>
      {/* Hero */}
      <header className="bg-gradient-to-b from-[#FFF7EE] to-[#FBF9F6] px-4 pb-5 pt-6 dark:from-kx-surface dark:to-transparent sm:px-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-kx-card px-2.5 py-1 text-[11px] font-bold text-kx-accent shadow-sm">
          <Sparkles className="h-3.5 w-3.5" /> {t("guide_badge")}
        </div>
        <h1 className="mt-3 text-2xl font-black leading-tight text-kx-text sm:text-3xl">{hero.title}</h1>
        <p className="mt-1.5 text-sm font-semibold text-kx-subtle sm:text-base">{hero.subtitle}</p>
        <p className="mt-1 max-w-xl text-xs leading-6 text-kx-muted">{hero.note}</p>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
            placeholder={hero.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-kx-text outline-none placeholder:text-kx-muted"
          />
          {searching ? (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setDraft("");
              }}
              className="rounded-full p-1 text-kx-muted hover:bg-kx-soft"
              aria-label={t("guide_clear_search")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submitSearch} className="kx-button-primary h-8 px-3 text-xs">
              {t("guide_search_button")}
            </button>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {hero.quickTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setDraft(tag);
                setKeyword(tag);
              }}
              className="rounded-full bg-kx-card px-3 py-1 text-xs font-semibold text-kx-subtle shadow-sm transition hover:text-kx-accent"
            >
              {tag}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-8 px-4 py-6 sm:px-6">
        {searching ? (
          <section>
            <GuideSectionTitle title={`${t("guide_search_results_prefix")} "${keyword}"`} subtitle={`${search.data?.total ?? 0} ${t("guide_search_results_suffix")}`} />
            {search.isLoading ? (
              <InlineLoading />
            ) : (search.data?.items.length ?? 0) === 0 ? (
              <div className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-8 text-center text-sm text-kx-muted">
                {t("guide_search_empty")}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {search.data!.items.map((a) => (
                  <ArticleCard key={a.id} article={a} compact />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Core categories */}
            <section>
              <GuideSectionTitle title={t("guide_core_categories")} subtitle={t("guide_core_categories_subtitle")} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {data.categories.map((c) => (
                  <CategoryCard key={c.key} category={c} />
                ))}
              </div>
            </section>

            {data.resourceEntries?.length ? (
              <section>
                <GuideSectionTitle title={t("guide_resource_library")} subtitle={t("guide_resource_library_subtitle")} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.resourceEntries.map((entry) => (
                    <ResourceEntryCard key={entry.key} entry={entry} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Goal entries */}
            {data.goalEntries.length ? (
              <section>
                <GuideSectionTitle title={data.goals?.title || t("guide_goals_fallback")} subtitle={t("guide_goals_subtitle")} />
                <div className="flex flex-wrap gap-2">
                  {data.goalEntries.map((g) => (
                    <GoalChip key={g.targetKey} goal={g} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Featured guides */}
            {data.featuredArticles.length ? (
              <section>
                <GuideSectionTitle title={t("guide_featured")} subtitle={t("guide_featured_subtitle")} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.featuredArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Per-zone spotlights */}
            <CategorySpotlight country={country} language={language} categoryKey="career_japan" title={t("guide_career_title")} subtitle={t("guide_career_subtitle")} />
            <CategorySpotlight country={country} language={language} categoryKey="study_japan" title={t("guide_study_title")} subtitle={t("guide_study_subtitle")} />
            <CategorySpotlight country={country} language={language} categoryKey="study_abroad_japan" title={t("guide_abroad_title")} subtitle={t("guide_abroad_subtitle")} />
            <CategorySpotlight country={country} language={language} categoryKey="jlpt" title={t("guide_jlpt_title")} subtitle={t("guide_jlpt_subtitle")} />

            {data.featuredSchools?.length ? (
              <section>
                <GuideSectionTitle title={t("guide_schools_title")} subtitle={t("guide_schools_subtitle")} href="/guide/schools" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.featuredSchools.map((school) => (
                    <SchoolCard key={school.id} school={school} />
                  ))}
                </div>
                {data.schoolDisclaimer ? (
                  <p className="mt-2 text-[11px] leading-5 text-kx-muted">{data.schoolDisclaimer}</p>
                ) : null}
              </section>
            ) : null}

            {/* Materials & services */}
            {data.featuredProducts.length || data.featuredServices.length ? (
              <section>
                <GuideSectionTitle title={t("guide_materials_title")} subtitle={t("guide_materials_subtitle")} href="/guide/services" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[...data.featuredProducts, ...data.featuredServices].map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <GuideSectionTitle title={t("guide_member_resources_title")} subtitle={t("guide_member_resources_subtitle")} href="/guide/member-resources" />
              <Link
                href="/guide/member-resources"
                className="group flex items-center justify-between gap-4 rounded-kx-lg border border-kx-accent/20 bg-kx-accentSoft/60 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/40 hover:shadow-kx"
              >
                <div>
                  <h3 className="text-base font-black text-kx-text group-hover:text-kx-accent">{t("guide_member_resources_card_title")}</h3>
                  <p className="mt-1 text-sm leading-6 text-kx-subtle">
                    {t("guide_member_resources_card_body")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-kx-card px-3 py-1 text-xs font-bold text-kx-accent">{t("guide_member_resources_cta")}</span>
              </Link>
            </section>

            {/* Companies */}
            {data.companyHighlights.length ? (
              <section>
                <GuideSectionTitle title={t("guide_companies_title")} subtitle={t("guide_companies_subtitle")} href="/guide/companies" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.companyHighlights.map((c) => (
                    <CompanyCard key={c.id} company={c} />
                  ))}
                </div>
                {data.companyDisclaimer || data.reviewDisclaimer ? (
                  <p className="mt-2 text-[11px] leading-5 text-kx-muted">{data.companyDisclaimer || data.reviewDisclaimer}</p>
                ) : null}
              </section>
            ) : null}

            {/* Latest */}
            {data.latestArticles.length ? (
              <section>
                <GuideSectionTitle title={t("guide_latest")} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.latestArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} compact />
                  ))}
                </div>
              </section>
            ) : null}

            {/* FAQ */}
            {data.faq.length ? (
              <section>
                <GuideSectionTitle title={t("guide_faq")} />
                <div className="space-y-2">
                  {data.faq.map((f) => (
                    <details key={f.id} className="group rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                      <summary className="cursor-pointer list-none text-sm font-bold text-kx-text marker:hidden">
                        {f.question}
                      </summary>
                      <p className="mt-2 text-sm leading-7 text-kx-subtle">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </GuideShell>
  );
}

function CategorySpotlight({
  country,
  language,
  categoryKey,
  title,
  subtitle,
}: {
  country: string;
  language: string;
  categoryKey: string;
  title: string;
  subtitle: string;
}) {
  const q = useQuery({
    queryKey: ["guide", "spotlight", country, language, categoryKey],
    queryFn: () => guide.articles({ country, language, categoryKey, pageSize: 3 }),
    staleTime: 60_000,
  });
  const items: GuideArticle[] = q.data?.items ?? [];
  if (!q.isLoading && items.length === 0) return null;
  return (
    <section>
      <GuideSectionTitle title={title} subtitle={subtitle} href={categoryHref(categoryKey)} />
      {q.isLoading ? (
        <InlineLoading />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((a) => (
            <ArticleCard key={a.id} article={a} compact />
          ))}
        </div>
      )}
    </section>
  );
}

function GuideRightRail() {
  const { t } = useI18n();
  const links = [
    { href: "/guide/career-japan", label: t("guide_career_title") },
    { href: "/guide/study-japan", label: t("guide_study_title") },
    { href: "/guide/study-abroad-japan", label: t("guide_abroad_title") },
    { href: "/guide/jlpt", label: t("guide_jlpt_title") },
    { href: "/guide/life-japan", label: t("guide_materials_title") },
    { href: "/guide/services", label: t("guide_materials_title") },
    { href: "/guide/member-resources", label: t("guide_member_resources_title") },
    { href: "/guide/schools", label: t("guide_schools_title") },
    { href: "/guide/companies", label: t("guide_companies_title") },
  ];
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-bold text-kx-accent">
          <Sparkles className="h-3.5 w-3.5" /> {t("guide_badge")}
        </div>
        <h3 className="mt-3 text-base font-black text-kx-text">{t("guide_right_title")}</h3>
        <p className="mt-1 text-sm leading-6 text-kx-subtle">
          {t("guide_right_body")}
        </p>
      </section>
      <section className="kx-card">
        <h3 className="kx-section-title mb-2 px-0">{t("guide_quick_links")}</h3>
        <ul className="space-y-1.5 text-sm font-semibold">
          {links.map((link) => (
            <li key={link.href}><Link href={link.href} className="text-kx-subtle hover:text-kx-accent">· {link.label}</Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
