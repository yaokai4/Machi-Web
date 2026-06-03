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

export default function GuideHomePage() {
  const country = useGuideCountry();
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");

  const home = useQuery({
    queryKey: ["guide", "home", country],
    queryFn: () => guide.home(country),
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: ["guide", "search", country, keyword],
    queryFn: () => guide.articles({ country, keyword, pageSize: 12 }),
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
        <ErrorState title="指南暂时无法加载" subtitle="请稍后再试。" onRetry={() => home.refetch()} />
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
          <Sparkles className="h-3.5 w-3.5" /> Machi Guide · 日本指南
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
              aria-label="清除搜索"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submitSearch} className="kx-button-primary h-8 px-3 text-xs">
              搜索
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
            <GuideSectionTitle title={`搜索“${keyword}”`} subtitle={`共 ${search.data?.total ?? 0} 条相关指南`} />
            {search.isLoading ? (
              <InlineLoading />
            ) : (search.data?.items.length ?? 0) === 0 ? (
              <div className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-8 text-center text-sm text-kx-muted">
                没有找到相关内容，换个关键词试试。
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
              <GuideSectionTitle title="核心分类" subtitle="升学、就职、留学、日语、生活、资料与服务" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {data.categories.map((c) => (
                  <CategoryCard key={c.key} category={c} />
                ))}
              </div>
            </section>

            {data.resourceEntries?.length ? (
              <section>
                <GuideSectionTitle title="核心资料库" subtitle="学校与公司结构化资料，统一 API 维护" />
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
                <GuideSectionTitle title={data.goals?.title || "你现在想做什么？"} subtitle="按你的目标快速进入" />
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
                <GuideSectionTitle title="精选指南" subtitle="由 Machi 编辑部整理" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.featuredArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Per-zone spotlights */}
            <CategorySpotlight country={country} categoryKey="career_japan" title="日本就职专区" subtitle="就活流程、履历书、面试与公司选择" />
            <CategorySpotlight country={country} categoryKey="study_japan" title="日本升学专区" subtitle="大学院、研究计划书、教授联系与出愿" />
            <CategorySpotlight country={country} categoryKey="study_abroad_japan" title="语言学校与留学专区" subtitle="语言学校、签证、入境与费用" />
            <CategorySpotlight country={country} categoryKey="jlpt" title="日语考级专区" subtitle="JLPT 备考、词汇语法与学习计划" />

            {data.featuredSchools?.length ? (
              <section>
                <GuideSectionTitle title="日本学校库" subtitle="大学、大学院、专门学校与语言学校" href="/guide/schools" />
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
                <GuideSectionTitle title="资料与服务" subtitle="资料包、模板、清单与人工辅导" href="/guide/services" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[...data.featuredProducts, ...data.featuredServices].map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <GuideSectionTitle title="会员专属资料" subtitle="JLPT、升学、就职与生活清单，会员可查看完整内容" href="/guide/member-resources" />
              <Link
                href="/guide/member-resources"
                className="group flex items-center justify-between gap-4 rounded-kx-lg border border-kx-accent/20 bg-kx-accentSoft/60 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/40 hover:shadow-kx"
              >
                <div>
                  <h3 className="text-base font-black text-kx-text group-hover:text-kx-accent">进入会员资料库</h3>
                  <p className="mt-1 text-sm leading-6 text-kx-subtle">
                    查看会员包含的原创资料、模板和申请清单。服务类只展示预约或会员折扣，不作为会员免费内容。
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-kx-card px-3 py-1 text-xs font-bold text-kx-accent">查看资料</span>
              </Link>
            </section>

            {/* Companies */}
            {data.companyHighlights.length ? (
              <section>
                <GuideSectionTitle title="外国人就职公司库" subtitle="适合外国人就职的公司、岗位与评论" href="/guide/companies" />
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
                <GuideSectionTitle title="最新更新" />
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
                <GuideSectionTitle title="常见问题" />
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
  categoryKey,
  title,
  subtitle,
}: {
  country: string;
  categoryKey: string;
  title: string;
  subtitle: string;
}) {
  const q = useQuery({
    queryKey: ["guide", "spotlight", country, categoryKey],
    queryFn: () => guide.articles({ country, categoryKey, pageSize: 3 }),
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
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-bold text-kx-accent">
          <Sparkles className="h-3.5 w-3.5" /> 日本指南
        </div>
        <h3 className="mt-3 text-base font-black text-kx-text">系统化准备日本生活</h3>
        <p className="mt-1 text-sm leading-6 text-kx-subtle">
          留学、升学、就职、日语考试和在日生活手续，由 Machi 编辑部整理，帮你少走弯路。
        </p>
      </section>
      <section className="kx-card">
        <h3 className="kx-section-title mb-2 px-0">快速入口</h3>
        <ul className="space-y-1.5 text-sm font-semibold">
          <li><Link href="/guide/career-japan" className="text-kx-subtle hover:text-kx-accent">· 日本就职</Link></li>
          <li><Link href="/guide/study-japan" className="text-kx-subtle hover:text-kx-accent">· 日本升学</Link></li>
          <li><Link href="/guide/study-abroad-japan" className="text-kx-subtle hover:text-kx-accent">· 留学申请</Link></li>
          <li><Link href="/guide/jlpt" className="text-kx-subtle hover:text-kx-accent">· 日语考级</Link></li>
          <li><Link href="/guide/life" className="text-kx-subtle hover:text-kx-accent">· 日本生活</Link></li>
          <li><Link href="/guide/services" className="text-kx-subtle hover:text-kx-accent">· 资料与服务</Link></li>
          <li><Link href="/guide/member-resources" className="text-kx-subtle hover:text-kx-accent">· 会员专属资料</Link></li>
          <li><Link href="/guide/schools" className="text-kx-subtle hover:text-kx-accent">· 日本学校库</Link></li>
          <li><Link href="/guide/companies" className="text-kx-subtle hover:text-kx-accent">· 外国人就职公司库</Link></li>
        </ul>
      </section>
    </div>
  );
}
