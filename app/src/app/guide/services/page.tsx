"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Package, Wrench } from "lucide-react";
import { guide, type GuideProduct } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";

// Primary split: digital materials vs. human services. The shop reads cleaner
// when these are grouped instead of mixed in one flat grid.
const KIND_FILTERS = [
  { value: "all", label: "全部" },
  { value: "material", label: "数字资料" },
  { value: "service", label: "人工服务" },
] as const;
type Kind = (typeof KIND_FILTERS)[number]["value"];

const MATERIAL_TYPES = [
  { value: "", label: "全部资料" },
  { value: "pdf_material", label: "PDF 资料" },
  { value: "template", label: "模板" },
  { value: "checklist", label: "清单" },
  { value: "course", label: "课程" },
];

export default function GuideServicesPage() {
  const country = useGuideCountry();
  const [kind, setKind] = useState<Kind>("all");
  const [materialType, setMaterialType] = useState("");

  const products = useQuery({
    queryKey: ["guide", "services", country],
    queryFn: () => guide.products({ country, pageSize: 60 }),
    staleTime: 30_000,
  });

  const all = useMemo(() => products.data?.items ?? [], [products.data]);
  const materials = useMemo(
    () => all.filter((p) => !p.isService && (!materialType || p.productType === materialType)),
    [all, materialType],
  );
  const services = useMemo(() => all.filter((p) => p.isService), [all]);

  if (products.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  const showMaterials = kind === "all" || kind === "material";
  const showServices = kind === "all" || kind === "service";
  const isEmpty =
    !products.isLoading &&
    !products.isError &&
    (showMaterials ? materials.length : 0) + (showServices ? services.length : 0) === 0;

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D97706] text-white shadow-sm">
            <Package className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">资料与服务</h1>
            <p className="text-xs text-kx-muted">资料包、模板、清单、课程与人工辅导服务</p>
          </div>
        </div>
        <p className="mt-2.5 max-w-2xl text-sm leading-7 text-kx-subtle">
          Machi 编辑部整理的学习与申请资料，以及简历修改、研究计划书修改、申请辅导、接机翻译等人工服务。付费数字资料以页面标价为准；人工服务可「预约咨询」，按服务范围确认后再付款。
        </p>
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-active={kind === f.value}
              onClick={() => setKind(f.value)}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-7 px-4 py-4 sm:px-6">
        {products.isLoading ? (
          <InlineLoading />
        ) : products.isError ? (
          <ErrorState title="资料暂时无法加载" subtitle="请稍后再试。" onRetry={() => products.refetch()} />
        ) : isEmpty ? (
          <EmptyState title="暂无相关资料或服务" subtitle="更多资料正在准备中。" />
        ) : (
          <>
            {showMaterials && materials.length > 0 ? (
              <section>
                <GuideSectionTitle title="数字资料" subtitle="PDF、模板、清单与课程，原创整理" />
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
                      {t.label}
                    </button>
                  ))}
                </div>
                <ProductGrid items={materials} icon={<FileText className="h-4 w-4" />} />
              </section>
            ) : null}

            {showServices && services.length > 0 ? (
              <section>
                <GuideSectionTitle title="人工服务" subtitle="咨询、文书修改、接机翻译与陪同办理（预约咨询）" />
                <ProductGrid items={services} icon={<Wrench className="h-4 w-4" />} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </GuideShell>
  );
}

function ProductGrid({ items, icon }: { items: GuideProduct[]; icon: React.ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-kx-lg border border-kx-stroke/50 bg-kx-card px-4 py-6 text-sm text-kx-muted">
        {icon}
        <span>这个分类正在整理中。</span>
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
