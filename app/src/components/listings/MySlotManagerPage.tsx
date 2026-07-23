"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, House, Store } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { api } from "@/lib/api";
import type { KXCityListing } from "@/lib/types";

/**
 * "时段预约" (host side) — lists the listings that accept online bookings
 * (租房 / 本地服务) so the owner can open one and set or edit its bookable time
 * slots (the per-listing slot editor lives on the detail page). Makes slot
 * configuration discoverable instead of buried. Mirrors iOS MySlotManagerListView.
 */
export function MySlotManagerPage() {
  const rentals = useQuery({ queryKey: ["my-listings", "rental"], queryFn: () => api.myListings("rental") });
  const services = useQuery({ queryKey: ["my-listings", "local_service"], queryFn: () => api.myListings("local_service") });
  const loading = rentals.isLoading || services.isLoading;
  const listings: KXCityListing[] = [
    ...(rentals.data || []),
    ...(services.data || []),
  ].filter((l) => l.status !== "sold");

  return (
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(var(--kx-living-accent),0.12)] text-[rgb(var(--kx-living-accent))]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-black text-kx-text">时段预约</h1>
            <p className="text-sm font-semibold text-kx-muted">为房源 / 服务设置可预约时段,让对方在线选时间</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <>{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-3xl bg-kx-soft" />)}</>
          ) : null}

          {!loading && listings.length > 0 ? (
            <p className="text-sm font-semibold text-kx-muted">选择一条发布,进入详情即可添加 / 删除可预约时段。</p>
          ) : null}

          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/listings/${encodeURIComponent(l.id)}`}
              className="flex items-center gap-3 rounded-3xl border border-kx-stroke/50 bg-kx-card p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[rgba(var(--kx-living-accent),0.12)] text-[rgb(var(--kx-living-accent))]">
                {l.type === "rental" ? <House className="h-5 w-5" /> : <Store className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black text-kx-text">{l.title || "未命名发布"}</p>
                <p className="mt-0.5 text-xs font-semibold text-kx-muted">管理可预约时段</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-kx-subtle" />
            </Link>
          ))}

          {!loading && listings.length === 0 ? (
            <section className="rounded-3xl border border-kx-stroke/50 bg-kx-card px-5 py-12 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-kx-subtle/70" />
              <p className="mt-3 text-base font-black text-kx-text">暂无可设置时段的发布</p>
              <p className="mt-2 text-sm font-semibold text-kx-muted">发布租房或本地服务后,就能在详情页设置可预约时段。</p>
              <Link href="/listings/create" className="mt-4 inline-block rounded-full bg-kx-accent px-4 py-2 text-sm font-bold text-kx-onAccent">去发布</Link>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
