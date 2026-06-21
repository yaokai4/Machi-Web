"use client";

import { useQuery } from "@tanstack/react-query";
import { guide } from "@/lib/guide";
import {
  GuideShell,
  GuideComingSoon,
  GuideSectionTitle,
  JourneyCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

export default function GuideJourneysPage() {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);

  const q = useQuery({
    queryKey: ["guide", "journeys", country, language],
    queryFn: () => guide.journeys(country, language),
    enabled: country === "jp",
    staleTime: 60_000,
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <div className="px-4 py-7 sm:px-7">
        <GuideSectionTitle
          title="你现在想解决什么？"
          subtitle="选一个目标，Machi 把手续、资料、经验、学校和服务整理成可执行步骤"
        />
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState title="加载失败" subtitle="请稍后下拉或点击重试。" onRetry={() => q.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {(q.data?.journeys ?? []).map((journey) => (
              <JourneyCard key={journey.key} journey={journey} />
            ))}
          </div>
        )}
      </div>
    </GuideShell>
  );
}
