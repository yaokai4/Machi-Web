"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Package, Wrench } from "lucide-react";
import { guide, type GuideProduct } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ArticleCard,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

// Primary split: digital materials vs. human services. The shop reads cleaner
// when these are grouped instead of mixed in one flat grid.
const KIND_FILTERS = ["all", "material", "service"] as const;
type Kind = (typeof KIND_FILTERS)[number];

const MATERIAL_TYPES = [
  { value: "", zh: "全部资料", en: "All resources", ja: "すべての資料" },
  { value: "pdf_material", zh: "PDF 资料", en: "PDF resources", ja: "PDF 資料" },
  { value: "template", zh: "模板", en: "Templates", ja: "テンプレート" },
  { value: "checklist", zh: "清单", en: "Checklists", ja: "チェックリスト" },
  { value: "course", zh: "课程", en: "Courses", ja: "講座" },
];

const SERVICE_ARTICLE_COPY = {
  zh: { title: "服务指南", subtitle: "先看流程、材料、价格口径和退款规则，再决定购买或预约。" },
  en: { title: "Service guides", subtitle: "Read scope, materials, pricing notes and refund rules before booking." },
  ja: { title: "サービスガイド", subtitle: "予約前に流れ、必要資料、料金、返金条件を確認できます。" },
};

function serviceArticleCopy(locale: string) {
  if (locale === "en") return SERVICE_ARTICLE_COPY.en;
  if (locale === "ja") return SERVICE_ARTICLE_COPY.ja;
  return SERVICE_ARTICLE_COPY.zh;
}

export default function GuideServicesPage() {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const [kind, setKind] = useState<Kind>("all");
  const [materialType, setMaterialType] = useState("");

  const products = useQuery({
    queryKey: ["guide", "services", country, language],
    queryFn: () => guide.products({ country, language, pageSize: 60 }),
    staleTime: 30_000,
  });
  const articles = useQuery({
    queryKey: ["guide", "services", "articles", country, language],
    queryFn: () => guide.articles({ country, language, categoryKey: "guide_services", pageSize: 9 }),
    staleTime: 60_000,
  });

  const all = useMemo(() => products.data?.items ?? [], [products.data]);
  const materials = useMemo(
    () => all.filter((p) => !p.isService && (!materialType || p.productType === materialType)),
    [all, materialType],
  );
  const services = useMemo(() => all.filter((p) => p.isService), [all]);

  if (products.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  const showMaterials = kind === "all" || kind === "material";
  const showServices = kind === "all" || kind === "service";
  const articleCopy = serviceArticleCopy(locale);
  const isEmpty =
    !products.isLoading &&
    !products.isError &&
    (showMaterials ? materials.length : 0) + (showServices ? services.length : 0) === 0;

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D97706] text-white shadow-sm">
            <Package className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{copy.services.title}</h1>
            <p className="text-xs text-kx-muted">{copy.services.subtitle}</p>
          </div>
        </div>
        <p className="mt-2.5 max-w-2xl text-sm leading-7 text-kx-subtle">
          {copy.services.body}
        </p>
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
          {KIND_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-active={kind === f}
              onClick={() => setKind(f)}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
            >
              {f === "all" ? copy.all : f === "material" ? copy.services.digitalTitle : copy.services.humanTitle}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-7 px-4 py-4 sm:px-6">
        {products.isLoading ? (
          <InlineLoading />
        ) : products.isError ? (
          <ErrorState title={copy.services.loadError} subtitle={copy.retryLater} onRetry={() => products.refetch()} />
        ) : isEmpty ? (
          <EmptyState title={copy.services.emptyTitle} subtitle={copy.services.emptySubtitle} />
        ) : (
          <>
            {showMaterials && materials.length > 0 ? (
              <section>
                <GuideSectionTitle title={copy.services.digitalTitle} subtitle={copy.services.digitalSubtitle} />
                {/* secondary type filter only inside the materials group */}
                <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
                  {MATERIAL_TYPES.map((t) => (
                    <button
                      key={t.value || "all"}
                      type="button"
                      data-active={materialType === t.value}
                      onClick={() => setMaterialType(t.value)}
                      className="kx-tab h-7 shrink-0 px-3 text-[11px]"
                    >
                      {locale === "en" ? t.en : locale === "ja" ? t.ja : t.zh}
                    </button>
                  ))}
                </div>
                <ProductGrid items={materials} icon={<FileText className="h-4 w-4" />} />
              </section>
            ) : null}

            {showServices && services.length > 0 ? (
              <section>
                <GuideSectionTitle title={copy.services.humanTitle} subtitle={copy.services.humanSubtitle} />
                <ProductGrid items={services} icon={<Wrench className="h-4 w-4" />} />
              </section>
            ) : null}

            {(articles.data?.items.length ?? 0) > 0 ? (
              <section>
                <GuideSectionTitle
                  title={articleCopy.title}
                  subtitle={articleCopy.subtitle}
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {articles.data!.items.map((article) => (
                    <ArticleCard key={article.id} article={article} compact />
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

function ProductGrid({ items, icon }: { items: GuideProduct[]; icon: React.ReactNode }) {
  const { locale } = useI18n();
  const copy = guideUi(locale);
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-kx-lg border border-kx-stroke/50 bg-kx-card px-4 py-6 text-sm text-kx-muted">
        {icon}
        <span>{copy.services.groupEmpty}</span>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
