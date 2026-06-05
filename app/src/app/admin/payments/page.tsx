"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, RefreshCw } from "lucide-react";
import { api, type AdminPaymentOrderRow } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession } from "@/lib/store";
import { fullDateTime } from "@/lib/format";

export default function AdminPaymentsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const [orderStatus, setOrderStatus] = useState("");
  const [provider, setProvider] = useState("");

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/payments");
  }, [router, status]);

  const q = useQuery({
    queryKey: ["admin-payment-orders", orderStatus, provider],
    queryFn: () => api.adminPaymentOrders({ status: orderStatus || undefined, provider: provider || undefined, limit: 150 }),
    enabled: status === "authed" && user?.role === "admin",
  });
  const summary = useMemo(() => summarizeOrders(q.data || []), [q.data]);

  if (status === "loading" || status === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><main className="px-6 py-16 text-center font-bold">无权访问</main></AppShell>;

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <CreditCard className="h-5 w-5 text-kx-accent" /> 支付与订单
        </h1>
      </header>
      <main className="space-y-3 px-3 py-3 sm:px-4">
        <section className="grid gap-3 sm:grid-cols-4">
          <Metric label="订单数" value={String(summary.total)} />
          <Metric label="已支付" value={String(summary.paid)} />
          <Metric label="待支付" value={String(summary.pending)} />
          <Metric label="已支付金额" value={formatMoney(summary.paidAmount, summary.currency)} />
        </section>

        <section className="kx-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold">会员支付订单</h2>
              <p className="mt-1 text-xs text-kx-muted">用于核对 Stripe / Apple IAP / 开发支付与会员开通状态。</p>
            </div>
            <div className="flex gap-2">
              <select className="kx-input h-9 w-32" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                <option value="">全部状态</option>
                <option value="pending">pending</option>
                <option value="paid">paid</option>
                <option value="closed">closed</option>
                <option value="refunded">refunded</option>
              </select>
              <select className="kx-input h-9 w-36" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">全部渠道</option>
                <option value="stripe">stripe</option>
                <option value="apple_iap">apple_iap</option>
                <option value="mock">开发支付</option>
              </select>
              <button className="kx-button-ghost h-9 px-3" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" />刷新</button>
            </div>
          </div>
          {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <InlineLoading /> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="text-left text-xs text-kx-muted">
                  <tr>
                    <th className="py-2">订单号</th><th>用户</th><th>金额</th><th>状态</th><th>渠道</th><th>交易号</th><th>创建</th><th>支付</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((row) => (
                    <tr key={row.order_no} className="border-t border-kx-stroke/40">
                      <td className="py-2 font-mono text-xs">{row.order_no}</td>
                      <td className="font-semibold">@{row.handle}<div className="text-xs font-normal text-kx-muted">{row.display_name}</div></td>
                      <td>{formatMoney(row.amount, row.currency)}</td>
                      <td><StatusPill value={row.status} /></td>
                      <td>{row.provider || "-"}</td>
                      <td className="max-w-[16rem] truncate font-mono text-xs text-kx-muted">{row.provider_trade_no || "-"}</td>
                      <td className="text-xs text-kx-muted">{row.created_at ? fullDateTime(row.created_at) : "-"}</td>
                      <td className="text-xs text-kx-muted">{row.paid_at ? fullDateTime(row.paid_at) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="kx-card">
      <div className="text-xs font-semibold text-kx-muted">{label}</div>
      <div className="mt-1 text-2xl font-black text-kx-text">{value}</div>
    </div>
  );
}

function summarizeOrders(rows: AdminPaymentOrderRow[]) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (row.status === "paid") {
      acc.paid += 1;
      acc.paidAmount += Number(row.amount || 0);
      acc.currency = row.currency || acc.currency;
    } else if (row.status === "pending") {
      acc.pending += 1;
    }
    return acc;
  }, { total: 0, paid: 0, pending: 0, paidAmount: 0, currency: "CNY" });
}

function formatMoney(amount: number, currency = "CNY") {
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusPill({ value }: { value: string }) {
  const tone = value === "paid" ? "bg-emerald-500/10 text-emerald-700" : value === "pending" ? "bg-amber-500/10 text-amber-700" : "bg-kx-soft text-kx-muted";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{value}</span>;
}
