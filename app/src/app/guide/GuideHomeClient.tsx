"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Crown, FileText, IdCard, PackageCheck, Search, Sparkles, WalletCards, X } from "lucide-react";
import { guide, type GuideSearchResponse } from "@/lib/guide";
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
  JourneyCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import {
  GuideIdentityCard,
  GuideMaterialServiceRail,
  GuidePlanSummary,
  GuideTodayTodos,
  GuideUpcomingDeadlines,
} from "@/components/guide/GuideOS";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useSession } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

export default function GuideHomeClient() {
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");
  const user = useSession((s) => s.user);

  const home = useQuery({
    queryKey: ["guide", "home", country, language],
    queryFn: () => guide.home(country, language),
    staleTime: 60_000,
  });
  // Unified search — same endpoint and grouped scopes the iOS app uses.
  const search = useQuery({
    queryKey: ["guide", "usearch", country, language, keyword],
    queryFn: () => guide.search(keyword, country, language),
    enabled: keyword.trim().length > 0,
    staleTime: 30_000,
  });
  const activePlan = useQuery({
    queryKey: ["guide", "active-plan", user?.id || "guest", language],
    queryFn: () => guide.activePlan(language),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
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
    <GuideShell>
      {/* Hero */}
      <header className="kx-guide-hero px-4 pb-6 pt-7 sm:px-7 sm:pt-9">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">
          <Sparkles className="h-3.5 w-3.5" /> {t("guide_badge")}
        </div>
        <h1 className="mt-4 max-w-2xl text-3xl font-black leading-[1.12] tracking-[-0.025em] text-kx-text sm:text-4xl">{hero.title}</h1>
        <p className="mt-2 text-sm font-semibold text-kx-subtle sm:text-base">{hero.subtitle}</p>
        <p className="mt-1.5 max-w-xl text-xs leading-6 text-kx-muted">{hero.note}</p>

        <div className="kx-guide-search mt-6">
          <Search className="h-5 w-5 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch();
            }}
            placeholder={hero.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-kx-text outline-none placeholder:text-kx-muted"
          />
          {searching ? (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setDraft("");
              }}
              className="rounded-full p-1.5 text-kx-muted hover:bg-kx-soft"
              aria-label={t("guide_clear_search")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submitSearch} className="kx-guide-search-button">
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
              className="rounded-full border border-kx-stroke/35 bg-white/55 px-3 py-1 text-xs font-semibold text-kx-subtle transition hover:border-kx-accent/35 hover:text-kx-accent dark:bg-white/5"
            >
              {tag}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-10 px-4 py-7 sm:px-7">
        {searching ? (
          <GuideSearchResults keyword={keyword} result={search.data} isLoading={search.isLoading} />
        ) : (
          <>
            <GuidePlanSummary data={activePlan.data} />
            <GuideOSQuickActions />

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <GuideTodayTodos todos={activePlan.data?.todayTodos || []} />
              <GuideIdentityCard profile={activePlan.data?.profile} />
              <GuideUpcomingDeadlines todos={activePlan.data?.upcomingTodos || activePlan.data?.openTodos || []} />
            </section>

            <section>
              <GuideSectionTitle title="完成任务的工具" subtitle="按你的 Todo、身份和目标推荐资料/服务，不再把商城和任务割裂开" href="/guide/services" hrefLabel="全部资料服务" />
              <GuideMaterialServiceRail
                products={activePlan.data?.recommendedProducts ?? []}
                services={activePlan.data?.recommendedServices ?? []}
              />
            </section>

            {/* Situation -> action path: the primary entry, above categories */}
            {data.journeys?.length ? (
              <section>
                <GuideSectionTitle
                  title="你现在想解决什么？"
                  subtitle="选一个目标，Machi 把手续、资料、经验和服务整理成可执行步骤"
                  href="/guide/journeys"
                  hrefLabel="全部路径"
                />
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {data.journeys.map((j) => (
                    <JourneyCard key={j.key} journey={j} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Core categories */}
            <section>
              <GuideSectionTitle title={t("guide_core_categories")} subtitle={t("guide_core_categories_subtitle")} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {data.categories.map((c) => (
                  <CategoryCard key={c.key} category={c} />
                ))}
              </div>
            </section>

            <GuideActionHub productCount={data.featuredProducts.length} serviceCount={data.featuredServices.length} />

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

            {/* Trust: keep only FAQ below the entry points — the featured /
                per-zone / schools / commerce / companies / latest blocks were
                all duplicate routes into content the categories + journeys +
                resource library above already cover. */}
            {/* FAQ */}
            {data.faq.length ? (
              <section>
                <GuideSectionTitle title={t("guide_faq")} />
                <div className="space-y-2">
                  {data.faq.map((f) => (
                    <details key={f.id} className="kx-guide-faq group p-4">
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

function GuideOSQuickActions() {
  const actions = [
    { href: "/guide/plan", title: "我的计划", body: "今日任务和下一步", icon: ClipboardList },
    { href: "/guide/calendar", title: "日历倒数", body: "截止日、面试、账单", icon: CalendarDays },
    { href: "/guide/profile", title: "身份路径", body: "位置、在留、目标", icon: IdCard },
    { href: "/guide/life", title: "生活缴费", body: "房租、学费、水电网络", icon: WalletCards },
    { href: "/guide/applications", title: "出愿 / ES", body: "升学、就职、转职", icon: FileText },
    { href: "/guide/services", title: "资料服务", body: "模板、辅导、代办", icon: PackageCheck },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link key={action.href} href={action.href} className="group rounded-kx-lg border border-kx-stroke/45 bg-kx-card/90 p-4 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.42)] transition hover:-translate-y-0.5 hover:border-kx-accent/35">
            <span className="grid h-10 w-10 place-items-center rounded-kx-md bg-kx-accentSoft text-kx-accent">
              <Icon className="h-5 w-5" />
            </span>
            <span className="mt-3 block text-sm font-black text-kx-text group-hover:text-kx-accent">{action.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-kx-muted">{action.body}</span>
          </Link>
        );
      })}
    </section>
  );
}

function GuideSearchResults({
  keyword,
  result,
  isLoading,
}: {
  keyword: string;
  result?: GuideSearchResponse;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const title = `${t("guide_search_results_prefix")} "${keyword}"`;
  if (isLoading) {
    return (
      <section>
        <GuideSectionTitle title={title} />
        <InlineLoading />
      </section>
    );
  }
  const groups = result?.groups ?? {};
  const total =
    (groups.journeys?.length ?? 0) +
    (groups.articles?.length ?? 0) +
    (groups.schools?.length ?? 0) +
    (groups.companies?.length ?? 0) +
    (groups.products?.length ?? 0) +
    (groups.faq?.length ?? 0);
  if (total === 0) {
    return (
      <section>
        <GuideSectionTitle title={title} subtitle={`0 ${t("guide_search_results_suffix")}`} />
        <div className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-8 text-center text-sm text-kx-muted">
          {t("guide_search_empty")}
        </div>
      </section>
    );
  }
  return (
    <div className="space-y-8">
      <GuideSectionTitle title={title} subtitle={`${total} ${t("guide_search_results_suffix")}`} />
      {groups.journeys?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">路径</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {groups.journeys.map((j) => (
              <JourneyCard key={j.key} journey={j} />
            ))}
          </div>
        </section>
      ) : null}
      {groups.articles?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">指南</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.articles.map((a) => (
              <ArticleCard key={a.id} article={a} compact />
            ))}
          </div>
        </section>
      ) : null}
      {groups.schools?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">学校</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.schools.map((s) => (
              <SchoolCard key={s.id} school={s} />
            ))}
          </div>
        </section>
      ) : null}
      {groups.companies?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">公司</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.companies.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        </section>
      ) : null}
      {groups.products?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">资料 / 服务</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}
      {groups.faq?.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-kx-text">常见问题</h3>
          <div className="space-y-2">
            {groups.faq.map((f) => (
              <details key={f.id} className="kx-guide-faq group p-4">
                <summary className="cursor-pointer list-none text-sm font-bold text-kx-text marker:hidden">{f.question}</summary>
                <p className="mt-2 text-sm leading-7 text-kx-subtle">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function GuideActionHub({ productCount, serviceCount }: { productCount: number; serviceCount: number }) {
  const { t } = useI18n();
  const cards = [
    {
      href: "/guide/member-resources",
      icon: Crown,
      title: t("guide_member_resources_title"),
      body: t("guide_member_resources_card_body"),
      cta: t("guide_member_resources_cta"),
      stat: t("guide_member_resources_cta"),
    },
    {
      href: "/guide/services",
      icon: PackageCheck,
      title: t("guide_materials_title"),
      body: t("guide_materials_subtitle"),
      cta: t("guide_enter_library"),
      stat: `${productCount + serviceCount} ${t("guide_action_hub_items")}`,
    },
  ];
  return (
    <section>
      <GuideSectionTitle title={t("guide_action_hub_title")} subtitle={t("guide_action_hub_subtitle")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="kx-guide-action-card group p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-black text-kx-text group-hover:text-kx-accent">{card.title}</h3>
                    <span className="shrink-0 rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-bold text-kx-muted">
                      {card.stat}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-kx-subtle">{card.body}</p>
                  <span className="mt-3 inline-flex rounded-full bg-kx-accent px-3 py-1.5 text-xs font-bold text-white">
                    {card.cta}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
