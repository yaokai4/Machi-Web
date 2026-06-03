"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Crown } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideComingSoon, GuideShell, ProductCard, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "jlpt", label: "日语考级" },
  { value: "study_japan", label: "升学申请" },
  { value: "career_japan", label: "日本就职" },
  { value: "life_japan", label: "生活手续" },
  { value: "study_abroad_japan", label: "留学申请" },
  { value: "guide_services", label: "模板清单" },
];

export default function GuideMemberResourcesPage() {
  const country = useGuideCountry();
  const [categoryKey, setCategoryKey] = useState("");
  const resources = useQuery({
    queryKey: ["guide", "member-resources", country, categoryKey],
    queryFn: () => guide.memberResources({ country, categoryKey: categoryKey || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });

  if (resources.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon empty={resources.data.emptyState} />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7C3AED] text-white shadow-sm">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">会员专属资料</h1>
            <p className="text-xs text-kx-muted">日本升学、就职、日语和生活资料库</p>
          </div>
        </div>
        <p className="mt-2.5 max-w-2xl text-sm leading-7 text-kx-subtle">
          为 Machi 认证会员整理的资料包、清单和模板。服务类商品不会进入会员免费权益；数字内容在 iOS 端遵守 Apple IAP 规则。
        </p>
        {!resources.isLoading && resources.data?.membershipActive !== true ? (
          <div className="mt-3 rounded-kx-lg border border-kx-accent/20 bg-kx-accentSoft/70 p-3 text-sm text-kx-subtle">
            <div className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
              <div>
                <p className="font-bold text-kx-text">开通会员后可查看完整会员资料</p>
                <p className="mt-0.5 text-xs leading-5 text-kx-muted">未登录或非会员仍可查看预览内容和资料说明。</p>
              </div>
              <Link href="/membership" className="ml-auto shrink-0 text-xs font-bold text-kx-accent hover:underline">
                开通会员
              </Link>
            </div>
          </div>
        ) : null}
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
          {CATEGORIES.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              data-active={categoryKey === f.value}
              onClick={() => setCategoryKey(f.value)}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        {resources.isLoading ? (
          <InlineLoading />
        ) : resources.isError ? (
          <ErrorState title="会员资料暂时无法加载" subtitle="请稍后再试。" onRetry={() => resources.refetch()} />
        ) : (resources.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="暂无会员资料" subtitle="更多资料正在整理中。" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resources.data!.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
        {resources.data?.disclaimer ? (
          <p className="mt-4 text-[11px] leading-5 text-kx-muted">{resources.data.disclaimer}</p>
        ) : null}
      </div>
    </GuideShell>
  );
}
