"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Crown } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideComingSoon, GuideShell, ProductCard, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

const CATEGORIES = ["", "jlpt", "study_japan", "career_japan", "life_japan", "study_abroad_japan", "guide_services"];

function categoryLabel(value: string, locale: "zh-Hans" | "zh-Hant" | "en" | "ja") {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    jlpt: { zh: "日语考级", en: "JLPT", ja: "日本語試験" },
    study_japan: { zh: "升学申请", en: "School applications", ja: "進学申請" },
    career_japan: { zh: "日本就职", en: "Careers in Japan", ja: "日本就職" },
    life_japan: { zh: "生活手续", en: "Life procedures", ja: "生活手続き" },
    study_abroad_japan: { zh: "留学申请", en: "Study-abroad applications", ja: "留学申請" },
    guide_services: { zh: "模板清单", en: "Templates and checklists", ja: "テンプレート・チェックリスト" },
  };
  return value ? table[value]?.[key] || value : key === "en" ? "All" : key === "ja" ? "すべて" : "全部";
}

export default function GuideMemberResourcesPage() {
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const [categoryKey, setCategoryKey] = useState("");
  const resources = useQuery({
    queryKey: ["guide", "member-resources", country, language, categoryKey],
    queryFn: () => guide.memberResources({ country, language, categoryKey: categoryKey || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });

  if (resources.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon empty={resources.data.emptyState} />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7C3AED] text-white shadow-sm">
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{t("guide_member_resources_title")}</h1>
            <p className="text-xs text-kx-muted">{t("guide_member_resources_subtitle")}</p>
          </div>
        </div>
        <p className="mt-2.5 max-w-2xl text-sm leading-7 text-kx-subtle">
          {t("guide_member_resources_card_body")}
        </p>
        {!resources.isLoading && resources.data?.membershipActive !== true ? (
          <div className="mt-3 rounded-kx-lg border border-kx-accent/20 bg-kx-accentSoft/70 p-3 text-sm text-kx-subtle">
            <div className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
              <div>
                <p className="font-bold text-kx-text">{locale === "en" ? "Become a member to unlock full resources" : locale === "ja" ? "メンバーになると資料全文を確認できます" : "开通会员后可查看完整会员资料"}</p>
                <p className="mt-0.5 text-xs leading-5 text-kx-muted">{locale === "en" ? "Visitors and non-members can still read previews and descriptions." : locale === "ja" ? "未ログイン・未加入でもプレビューと説明は確認できます。" : "未登录或非会员仍可查看预览内容和资料说明。"}</p>
              </div>
              <Link href="/membership" className="ml-auto shrink-0 text-xs font-bold text-kx-accent hover:underline">
                {t("mem_cta_open")}
              </Link>
            </div>
          </div>
        ) : null}
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 kx-scroll">
          {CATEGORIES.map((f) => (
            <button
              key={f || "all"}
              type="button"
              data-active={categoryKey === f}
              onClick={() => setCategoryKey(f)}
              className="kx-tab h-8 shrink-0 px-3 text-xs"
            >
              {categoryLabel(f, locale)}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 sm:px-6">
        {resources.isLoading ? (
          <InlineLoading />
        ) : resources.isError ? (
          <ErrorState title={locale === "en" ? "Member resources are temporarily unavailable" : locale === "ja" ? "メンバー資料を読み込めません" : "会员资料暂时无法加载"} subtitle={copy.retryLater} onRetry={() => resources.refetch()} />
        ) : (resources.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={locale === "en" ? "No member resources yet" : locale === "ja" ? "メンバー資料はまだありません" : "暂无会员资料"} subtitle={locale === "en" ? "More resources are being prepared." : locale === "ja" ? "新しい資料を準備中です。" : "更多资料正在整理中。"} />
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
