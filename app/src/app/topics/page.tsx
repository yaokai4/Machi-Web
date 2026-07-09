"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hash, Search } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useI18n, type Locale } from "@/lib/i18n";

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

export default function TopicsPage() {
  const { locale, t } = useI18n();
  const trending = useQuery({
    queryKey: ["topics-page"],
    queryFn: () => api.topics(),
    staleTime: 60_000,
  });

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-kx-accent" />
          <h1 className="text-xl font-black">{t("search_topics")}</h1>
        </div>
        <Link
          href="/search?kind=topic"
          className="mt-3 h-10 rounded-kx-md bg-kx-soft text-kx-muted px-3 flex items-center gap-2 text-sm transition hover:bg-kx-accentSoft hover:text-kx-accent"
        >
          <Search className="w-4 h-4" />
          {t("search_placeholder")}
        </Link>
      </header>

      {trending.isError ? (
        <ErrorState onRetry={() => trending.refetch()} />
      ) : trending.isLoading || !trending.data ? (
        <InlineLoading />
      ) : trending.data.topics.length === 0 ? (
        <div className="p-4 text-sm text-kx-muted">
          {pick(locale, "还没有热门话题。", "まだ人気の話題はありません。", "No trending topics yet.")}
        </div>
      ) : (
        <main className="px-3 sm:px-4 py-3">
          <section className="kx-card">
            <h2 className="kx-section-title mb-3 px-0">{t("explore_topic_rank")}</h2>
            <ul className="divide-y divide-kx-stroke/50">
              {trending.data.topics.map((topic, index) => (
                <li key={topic.tag}>
                  <Link href={`/t/${encodeURIComponent(topic.tag)}`} className="flex items-center gap-3 py-3 group">
                    <span
                      className={
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black " +
                        (index < 3
                          ? "bg-kx-heat/10 text-kx-heat"
                          : "text-kx-accent")
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold group-hover:underline">#{topic.tag}</span>
                    <span className="text-xs text-kx-muted">
                      {compactNumber(topic.post_count)} {t("search_topic_post_suffix")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </AppShell>
  );
}
