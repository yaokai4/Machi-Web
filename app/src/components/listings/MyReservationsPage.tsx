"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { api } from "@/lib/api";
import type { KXBooking } from "@/lib/types";
import { useToasts } from "@/lib/store";

/**
 * "我的预约" — slot reservations the user made as a customer (看房 / 到店 /
 * 服务预约). No money. Mirrors the iOS MyReservationsView; same endpoints.
 */
function fmtDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function ReservationCard({ booking, onCancel, cancelling }: { booking: KXBooking; onCancel: (b: KXBooking) => void; cancelling: boolean }) {
  const cancelled = (booking.status || "confirmed") === "cancelled";
  const isPast = booking.start_at ? new Date(booking.start_at).getTime() < Date.now() : false;
  const start = booking.start_at ? new Date(booking.start_at) : null;
  const accent = cancelled || isPast ? "#94a3b8" : "rgb(var(--kx-living-accent))";
  return (
    <section
      className="flex items-center gap-4 rounded-3xl border border-slate-200/70 bg-white p-4 transition"
      style={{ opacity: cancelled ? 0.62 : 1 }}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: `${accent}1f`, color: accent }}>
        <span className="text-lg font-black leading-none">{start ? start.getDate() : "—"}</span>
        <span className="text-[10px] font-bold">{start ? start.toLocaleDateString("zh-CN", { month: "short" }) : ""}</span>
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={booking.listing_id ? `/listings/${encodeURIComponent(booking.listing_id)}` : "#"}
          className="flex items-center gap-1 text-[15px] font-black text-slate-950 hover:text-[rgb(var(--kx-living-accent))]"
        >
          <span className={`truncate ${cancelled ? "line-through" : ""}`}>{booking.listing_title || "预约"}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        </Link>
        <p className="mt-0.5 text-sm font-semibold text-slate-500">{fmtDateTime(booking.start_at)}</p>
        <span
          className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {cancelled ? "已取消" : isPast ? "已结束" : "已确认"}
        </span>
      </div>
      {!cancelled && !isPast ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => onCancel(booking)}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
        >
          {cancelling ? "取消中…" : "取消"}
        </button>
      ) : null}
    </section>
  );
}

export function MyReservationsPage() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["my-reservations"], queryFn: () => api.myReservations() });
  const items = query.data || [];

  async function cancel(booking: KXBooking) {
    try {
      await api.cancelReservation(booking.id);
      await qc.invalidateQueries({ queryKey: ["my-reservations"] });
      pushToast({ kind: "success", message: "已取消预约" });
    } catch {
      pushToast({ kind: "error", message: "取消失败，请稍后再试" });
    }
  }

  return (
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(var(--kx-living-accent),0.12)] text-[rgb(var(--kx-living-accent))]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-black text-slate-950">我的预约</h1>
            <p className="text-sm font-semibold text-slate-500">看房、到店与服务的预约时段</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {query.isLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl bg-slate-100" />
              ))}
            </>
          ) : null}
          {query.isError ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white px-5 py-9 text-center">
              <p className="text-base font-black text-slate-950">预约记录暂时无法加载</p>
              <button type="button" onClick={() => query.refetch()} className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">
                重试
              </button>
            </section>
          ) : null}
          {items.map((b) => (
            <ReservationCard key={b.id} booking={b} onCancel={cancel} cancelling={false} />
          ))}
          {!query.isLoading && !query.isError && items.length === 0 ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white px-5 py-12 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-base font-black text-slate-950">还没有预约</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">在房源、餐厅或服务详情里选择时段即可预约。</p>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
