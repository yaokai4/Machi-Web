"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ReceiptText } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";

export default function MembershipOrdersPage() {
  const q = useQuery({ queryKey: ["membership-orders"], queryFn: () => api.membershipOrders() });

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/membership" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label="返回会员页">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <ReceiptText className="h-5 w-5 text-kx-accent" />
        <h1 className="text-lg font-bold">会员订单</h1>
      </header>
      <div className="px-3 py-3 sm:px-4">
        {q.isLoading ? <InlineLoading /> : q.isError || !q.data ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.data.items.length ? (
          <section className="kx-card divide-y divide-kx-stroke/50">
            {q.data.items.map((row) => (
              <div key={String(row.order_no)} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-kx-text">{String(row.order_no)}</div>
                    <div className="mt-1 text-xs text-kx-muted">{String(row.provider || "")} · {String(row.created_at || "")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-kx-text">¥{String(row.amount || "0")}</div>
                    <div className="mt-1 text-xs font-bold text-kx-muted">{String(row.status || "")}</div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="kx-card text-center text-sm text-kx-muted">暂无会员订单。</section>
        )}
      </div>
    </AppShell>
  );
}
