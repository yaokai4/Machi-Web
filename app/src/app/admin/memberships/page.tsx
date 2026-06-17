"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, RefreshCw, Search, XCircle } from "lucide-react";
import { api, APIError, type AdminMembershipRow } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";
import type { KXMembershipPlan } from "@/lib/types";

export default function AdminMembershipsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/memberships");
  }, [router, status]);

  if (status === "loading" || status === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><main className="px-6 py-16 text-center font-bold">无权访问</main></AppShell>;

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <BadgeCheck className="h-5 w-5 text-kx-accent" /> 会员管理
        </h1>
      </header>
      <main className="space-y-3 px-3 py-3 sm:px-4">
        <GrantMembershipCard />
        <PlansCard />
        <MembershipRows />
      </main>
    </AppShell>
  );
}

function GrantMembershipCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [handle, setHandle] = useState("");
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);

  const grant = async () => {
    if (!handle.trim()) {
      pushToast({ kind: "error", message: "请输入用户 handle" });
      return;
    }
    setBusy(true);
    try {
      await api.adminGrantMembership({ handle, months });
      await queryClient.invalidateQueries({ queryKey: ["admin-memberships"] });
      pushToast({ kind: "success", message: "会员已开通或延长" });
      setHandle("");
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="kx-card">
      <h2 className="text-base font-bold">手动开通会员</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <input className="kx-input" placeholder="@handle 或 handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <input className="kx-input" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Number(e.target.value || 1))} />
        <button className="kx-button-primary" onClick={grant} disabled={busy}>{busy ? "提交中…" : "开通 / 延长"}</button>
      </div>
      <p className="mt-2 text-xs text-kx-muted">用于客服补偿、线下收款、测试账号和人工处理支付异常。</p>
    </section>
  );
}

function PlansCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-membership-plans"], queryFn: () => api.adminMembershipPlans(true) });

  const updatePlan = async (plan: KXMembershipPlan, patch: Record<string, unknown>) => {
    try {
      await api.adminUpdateMembershipPlan(plan.plan_key, patch);
      await queryClient.invalidateQueries({ queryKey: ["admin-membership-plans"] });
      pushToast({ kind: "success", message: "套餐已更新" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;

  return (
    <section className="kx-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">会员套餐</h2>
          <p className="mt-1 text-xs text-kx-muted">Web 会员按这里的金额与货币创建一次性支付；iOS 仍使用 IAP Product ID。</p>
        </div>
        <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" />刷新</button>
      </div>
      <div className="grid gap-2">
        {q.data.map((plan) => (
          <PlanEditor key={plan.plan_key} plan={plan} onSave={(patch) => updatePlan(plan, patch)} />
        ))}
      </div>
    </section>
  );
}

function PlanEditor({ plan, onSave }: { plan: KXMembershipPlan; onSave: (patch: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState({
    name: plan.name || plan.name_zh || "",
    amount: String(plan.amount ?? plan.price ?? 0),
    currency: plan.currency || "CNY",
    iosIapProductId: plan.iosIapProductId || "",
    isActive: Boolean((plan as unknown as { isActive?: boolean }).isActive ?? true),
  });

  return (
    <div className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{plan.plan_key}</div>
          <div className="text-xs text-kx-muted">{plan.billing_period || plan.billingPeriod || plan.billing_cycle}</div>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-kx-muted">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
          上架
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className="kx-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="kx-input" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <input className="kx-input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
        <input className="kx-input font-mono text-xs" placeholder="IAP Product ID" value={draft.iosIapProductId} onChange={(e) => setDraft({ ...draft, iosIapProductId: e.target.value })} />
      </div>
      <p className="mt-2 text-xs text-kx-muted">Stripe Web 支付会按套餐金额即时生成一次性 Checkout，不再读取 Stripe Price ID 或订阅价格。</p>
      <button className="kx-button-primary mt-3 h-9 px-4" onClick={() => onSave({
        name: draft.name,
        amount: Number(draft.amount || 0),
        currency: draft.currency,
        iosIapProductId: draft.iosIapProductId,
        isActive: draft.isActive,
      })}>保存套餐</button>
    </div>
  );
}

function MembershipRows() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin-memberships", status, q],
    queryFn: () => api.adminMemberships({ status: status || undefined, q: q || undefined, limit: 100 }),
  });
  const stats = useMemo(() => summarizeMemberships(list.data || []), [list.data]);

  const cancel = async (row: AdminMembershipRow, immediate = false) => {
    try {
      await api.adminCancelMembership({ userId: row.user_id, immediate });
      await queryClient.invalidateQueries({ queryKey: ["admin-memberships"] });
      pushToast({ kind: "success", message: immediate ? "会员已立即取消" : "已设置到期取消" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  return (
    <section className="kx-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold">会员记录</h2>
          <p className="mt-1 text-xs text-kx-muted">活跃 {stats.active} · 即将取消 {stats.canceling} · 已过期/取消 {stats.inactive}</p>
        </div>
        <div className="flex gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-kx-muted" />
            <input className="kx-input h-9 pl-9" placeholder="用户 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="kx-input h-9 w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="active">active</option>
            <option value="canceled">canceled</option>
            <option value="expired">expired</option>
            <option value="past_due">past_due</option>
          </select>
        </div>
      </div>
      {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data ? <InlineLoading /> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-kx-muted">
              <tr>
                <th className="py-2">用户</th><th>计划</th><th>状态</th><th>到期</th><th>来源</th><th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((row) => (
                <tr key={row.membership_id} className="border-t border-kx-stroke/40">
                  <td className="py-2 font-semibold">@{row.handle}<div className="text-xs font-normal text-kx-muted">{row.display_name}</div></td>
                  <td>{row.plan_key}</td>
                  <td><StatusPill value={row.status} /></td>
                  <td className="text-xs text-kx-muted">{row.current_period_end ? fullDateTime(row.current_period_end) : "-"}</td>
                  <td>{row.source || "-"}</td>
                  <td className="text-right">
                    <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => cancel(row, false)} disabled={row.status !== "active"}>
                      到期取消
                    </button>
                    <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => cancel(row, true)}>
                      <XCircle className="h-3.5 w-3.5" />立即取消
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function summarizeMemberships(rows: AdminMembershipRow[]) {
  return rows.reduce((acc, row) => {
    if (row.status === "active") acc.active += 1;
    else acc.inactive += 1;
    if (row.cancel_at_period_end) acc.canceling += 1;
    return acc;
  }, { active: 0, inactive: 0, canceling: 0 });
}

function StatusPill({ value }: { value: string }) {
  const tone = value === "active" ? "bg-emerald-500/10 text-emerald-700" : value === "past_due" ? "bg-amber-500/10 text-amber-700" : "bg-kx-soft text-kx-muted";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{value}</span>;
}
