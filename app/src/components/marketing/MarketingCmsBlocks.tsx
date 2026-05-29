"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MarketingPageId } from "@/data/marketing-pages";
import { useMarketingI18n } from "./MarketingI18n";
import { MarketingCard } from "./PageShell";

export function MarketingCmsBlocks({ pageId }: { pageId: MarketingPageId | "home" }) {
  const { locale } = useMarketingI18n();
  const query = useQuery({
    queryKey: ["marketing-copy", pageId, locale],
    queryFn: () => api.marketingCopy(pageId, locale),
    staleTime: 60_000,
  });

  if (!query.data?.length) return null;

  return (
    <>
      {query.data.map((block) => (
        <MarketingCard key={block.id} title={block.title} className="mc-reveal">
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">
            {block.body}
          </p>
        </MarketingCard>
      ))}
    </>
  );
}
