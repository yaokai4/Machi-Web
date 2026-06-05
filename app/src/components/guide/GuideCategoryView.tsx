"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { guide } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ArticleCard,
  ProductCard,
  categoryIconFor,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

export function GuideCategoryView({ categoryKey }: { categoryKey: string }) {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const [activeSub, setActiveSub] = useState("");

  // Honour ?sub=<key> deep links (from goal entries) without forcing the whole
  // route to be dynamic via useSearchParams().
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sub = new URLSearchParams(window.location.search).get("sub");
    if (sub) setActiveSub(sub);
  }, []);

  const cats = useQuery({
    queryKey: ["guide", "categories", country, language],
    queryFn: () => guide.categories(country, language),
    staleTime: 5 * 60_000,
  });
  const articles = useQuery({
    queryKey: ["guide", "cat-articles", country, language, categoryKey, activeSub],
    queryFn: () =>
      guide.articles({ country, language, categoryKey, subCategoryKey: activeSub || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });
  // Related materials & services for this channel — surfaced above the
  // articles so the entry page matches the iOS layout (resources/services
  // first, then guides). A failure here never blocks the articles.
  const products = useQuery({
    queryKey: ["guide", "cat-products", country, language, categoryKey, activeSub],
    queryFn: () =>
      guide.products({ country, language, categoryKey, subCategoryKey: activeSub || undefined, pageSize: 9 }),
    staleTime: 60_000,
  });

  if (cats.isLoading) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (cats.data?.status === "coming_soon" || articles.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }
  const category = cats.data?.categories.find((c) => c.key === categoryKey);
  const Icon = categoryIconFor(category?.icon);
  const subs = category?.subCategories ?? [];

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: category?.color || "#2563EB" }}
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{category?.title || copy.back}</h1>
            {category?.subtitle ? <p className="text-xs text-kx-muted">{category.subtitle}</p> : null}
          </div>
        </div>
        {category?.description ? (
          <p className="mt-2.5 max-w-2xl text-sm leading-7 text-kx-subtle">{category.description}</p>
        ) : null}

        {subs.length ? (
          <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
            <button
              type="button"
              data-active={activeSub === ""}
              onClick={() => setActiveSub("")}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
            >
              {copy.all}
            </button>
            {subs.map((s) => (
              <button
                key={s.key}
                type="button"
                data-active={activeSub === s.key}
                onClick={() => setActiveSub(s.key)}
                className="kx-tab h-8 shrink-0 px-3 text-xs"
              >
                {s.title}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="space-y-7 px-4 py-4 sm:px-6">
        {/* Related materials & services (resources first, like iOS) */}
        {(products.data?.items.length ?? 0) > 0 ? (
          <section>
            <GuideSectionTitle
              title={categoryKey === "jlpt" ? copy.category.jlptTitle : copy.category.relatedTitle}
              subtitle={copy.category.relatedSubtitle}
              href="/guide/services"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.data!.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Channel guides */}
        <section>
          {(products.data?.items.length ?? 0) > 0 ? (
            <GuideSectionTitle title={copy.category.articlesTitle} subtitle={copy.category.articlesSubtitle} />
          ) : null}
          {articles.isLoading ? (
            <InlineLoading />
          ) : articles.isError ? (
            <ErrorState title={copy.category.loadError} subtitle={copy.retryLater} onRetry={() => articles.refetch()} />
          ) : (articles.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={copy.category.emptyTitle} subtitle={copy.category.emptySubtitle} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.data!.items.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </GuideShell>
  );
}
