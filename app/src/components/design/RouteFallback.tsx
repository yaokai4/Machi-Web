"use client";

import { AppShell } from "@/components/shell/AppShell";
import { Skeleton } from "@/components/design/States";
import { useI18n } from "@/lib/i18n";

export function RouteFallback({ title, rows = 3 }: { title?: string; rows?: number }) {
  const { t } = useI18n();
  const heading = title ?? t("loading");
  return (
    <AppShell requireAuth={false}>
      <main className="px-3 py-4 sm:px-4">
        <section className="rounded-[28px] border border-kx-stroke/35 bg-kx-card/80 p-4 shadow-[0_18px_54px_-42px_rgba(15,23,42,0.42)]">
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-kx-text">{heading}</div>
              <Skeleton className="mt-2 h-3 w-44 rounded-full" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <Skeleton key={index} className={index === 0 ? "h-24 rounded-2xl" : "h-16 rounded-2xl"} />
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
