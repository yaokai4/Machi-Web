"use client";

// Admin · Machi Points wallet. Overview metrics, top-up pack management, a
// per-user ledger lookup and a manual adjustment that ALWAYS posts a ledger
// row (never a direct balance edit). Reuses the kx-* admin shell.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import type { KXWalletLedgerEntry } from "@/lib/types";

export default function AdminWalletPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/wallet");
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
          <Coins className="h-5 w-5 text-amber-500" /> Machi 币钱包
        </h1>
      </header>
      <main className="space-y-3 px-3 py-3 sm:px-4">
        <OverviewCard />
        <AdjustCard />
        <UserLookupCard />
        <PacksCard />
      </main>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <h2 className="mb-3 text-base font-black text-kx-text">{title}</h2>
      {children}
    </section>
  );
}

function OverviewCard() {
  const q = useQuery({ queryKey: ["admin-wallet-overview"], queryFn: () => api.adminWalletOverview() });
  const d = q.data;
  const yuan = (cents: number) => `¥${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <Card title="概览">
      {q.isLoading || !d ? (
        <InlineLoading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="账户数" value={d.accounts.toLocaleString()} />
            <Metric label="平台负债（未消费币）" value={d.platformLiabilityPoints.toLocaleString()} tone="warn" />
            <Metric label="累计充值币" value={d.lifetimePurchasedPoints.toLocaleString()} />
            <Metric label="累计消费币" value={d.lifetimeSpentPoints.toLocaleString()} />
            <Metric label="累计赠送币" value={d.lifetimeBonusPoints.toLocaleString()} />
            <Metric label="充值收入" value={yuan(d.grossTopupCents)} />
            <Metric label="已付充值订单" value={d.paidTopupOrders.toLocaleString()} />
            <Metric label="充值转化率" value={`${d.topupConversionRate}%`} />
            <Metric label="待支付订单" value={d.pendingTopupOrders.toLocaleString()} />
            <Metric label="退款/拒付订单" value={d.refundedTopupOrders.toLocaleString()} tone={d.refundedTopupOrders ? "warn" : undefined} />
            <Metric label="退款金额" value={yuan(d.refundedTopupCents)} />
            <Metric label="受限钱包" value={d.restrictedAccounts.toLocaleString()} tone={d.restrictedAccounts ? "danger" : undefined} />
            <Metric label="验证失败回调" value={d.failedWebhookCount.toLocaleString()} tone={d.failedWebhookCount ? "danger" : undefined} />
          </div>

          {d.providerBreakdown.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1 text-xs font-bold text-kx-muted">按支付渠道（已付）</div>
              <div className="flex flex-wrap gap-2">
                {d.providerBreakdown.map((p) => (
                  <span key={p.provider} className="rounded-lg border border-kx-stroke/50 bg-kx-soft/40 px-3 py-1.5 text-xs">
                    <b className="text-kx-text">{p.provider}</b> · {p.paidOrders} 单 · {yuan(p.grossCents)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="mb-1 text-xs font-bold text-kx-muted">资料商城漏斗</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill label="充值发起" value={d.funnel.topupInitiated} />
              <Pill label="充值成功" value={d.funnel.topupPaid} />
              <Pill label="商品下单" value={d.funnel.guideOrdersCreated} />
              <Pill label="商品解锁" value={d.funnel.guideOrdersFulfilled} />
              <Pill label="币支付订单" value={d.funnel.guidePointsOrders} />
            </div>
          </div>

          {d.failedWebhooks.length > 0 ? (
            <div className="mt-4">
              <div className="mb-1 text-xs font-bold text-rose-600 dark:text-rose-400">最近验证失败回调</div>
              <ul className="divide-y divide-kx-stroke/30 text-xs">
                {d.failedWebhooks.map((w, i) => (
                  <li key={`${w.eventId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span><b>{w.provider}</b> {w.eventType}</span>
                    <span className="text-kx-muted">{w.orderNo || w.eventId} · {w.createdAt?.slice(0, 19).replace("T", " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg border border-kx-stroke/50 bg-kx-soft/40 px-3 py-1.5">
      {label} <b className="text-kx-text">{value.toLocaleString()}</b>
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  const valueClass = tone === "danger"
    ? "text-rose-600 dark:text-rose-400"
    : tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-kx-text";
  return (
    <div className="rounded-xl border border-kx-stroke/50 bg-kx-soft/40 p-3">
      <div className="text-xs text-kx-muted">{label}</div>
      <div className={`mt-1 text-lg font-black ${valueClass}`}>{value}</div>
    </div>
  );
}

function AdjustCard() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const d = parseInt(delta, 10);
    if (!userId.trim() || !reason.trim() || !Number.isFinite(d) || d === 0) {
      pushToast({ kind: "error", message: "用户ID、非零币值和原因均必填" });
      return;
    }
    setBusy(true);
    try {
      const r = await api.adminWalletAdjust({ userId: userId.trim(), pointsDelta: d, reason: reason.trim() });
      pushToast({ kind: "success", message: `已调整，余额 ${r.wallet.balancePoints.toLocaleString()}` });
      setDelta("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-wallet-overview"] });
    } catch (e) {
      pushToast({ kind: "error", message: (e as { message?: string })?.message || "调整失败" });
    } finally {
      setBusy(false);
    }
  };

  const inp = "h-10 w-full rounded-lg border border-kx-stroke/60 bg-kx-card px-3 text-sm";
  return (
    <Card title="人工调整（写入账本）">
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={inp} placeholder="用户 ID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input className={inp} placeholder="Machi 币增减（可为负）" value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" />
        <input className={inp} placeholder="原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button type="button" onClick={submit} disabled={busy} className="kx-button-primary mt-3 h-10 px-5 disabled:opacity-60">
        提交调整
      </button>
      <p className="mt-2 text-xs text-kx-muted">所有调整都会写入不可变账本，扣减不会使余额为负。</p>
    </Card>
  );
}

function UserLookupCard() {
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin-wallet-users", q], queryFn: () => api.adminWalletUsers({ q: q.trim() || undefined }) });
  const [openUser, setOpenUser] = useState<string | null>(null);
  const ledger = useQuery({
    queryKey: ["admin-wallet-ledger", openUser],
    queryFn: () => api.adminWalletUserLedger(openUser as string),
    enabled: !!openUser,
  });
  const inp = "h-10 w-full rounded-lg border border-kx-stroke/60 bg-kx-card px-3 text-sm";
  return (
    <Card title="用户余额 / 账本">
      <input className={inp} placeholder="搜索 handle / 昵称 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-kx-muted">
              <th className="px-2 py-1">用户</th>
              <th className="px-2 py-1">余额</th>
              <th className="px-2 py-1">累计充值</th>
              <th className="px-2 py-1">状态</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.userId} className="border-t border-kx-stroke/30">
                <td className="px-2 py-2">
                  <div className="font-semibold text-kx-text">{u.displayName}</div>
                  <div className="text-xs text-kx-muted">@{u.handle}</div>
                  <div className="text-[10px] text-kx-muted">{u.userId}</div>
                </td>
                <td className="px-2 py-2 font-bold">{u.balancePoints.toLocaleString()}</td>
                <td className="px-2 py-2">{u.lifetimePurchasedPoints.toLocaleString()}</td>
                <td className="px-2 py-2">{u.status}</td>
                <td className="px-2 py-2">
                  <button type="button" className="text-kx-accent hover:underline" onClick={() => setOpenUser(openUser === u.userId ? null : u.userId)}>
                    {openUser === u.userId ? "收起" : "账本"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openUser ? (
        <div className="mt-3 rounded-lg border border-kx-stroke/50 p-3">
          {ledger.isLoading ? (
            <InlineLoading />
          ) : (
            <ul className="divide-y divide-kx-stroke/30 text-sm">
              {(ledger.data?.entries ?? []).map((e: KXWalletLedgerEntry) => (
                <li key={e.id} className="flex items-center justify-between py-1.5">
                  <span className="text-kx-text">{e.entryType}</span>
                  <span className={e.pointsDelta >= 0 ? "text-emerald-600" : "text-kx-subtle"}>{e.displayDelta}</span>
                  <span className="text-xs text-kx-muted">余 {e.balanceAfter.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function PacksCard() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-wallet-packs"], queryFn: () => api.adminWalletTopupProducts() });
  const toggle = async (id: string, isActive: boolean) => {
    try {
      await api.adminWalletUpdateTopupProduct(id, { isActive: !isActive });
      qc.invalidateQueries({ queryKey: ["admin-wallet-packs"] });
    } catch {
      pushToast({ kind: "error", message: "更新失败" });
    }
  };
  return (
    <Card title="充值包">
      {q.isLoading ? (
        <InlineLoading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-kx-muted">
                <th className="px-2 py-1">packKey</th>
                <th className="px-2 py-1">Machi 币</th>
                <th className="px-2 py-1">赠送</th>
                <th className="px-2 py-1">价格</th>
                <th className="px-2 py-1">状态</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-kx-stroke/30">
                  <td className="px-2 py-2 font-mono text-xs">{p.packKey}</td>
                  <td className="px-2 py-2">{p.points.toLocaleString()}</td>
                  <td className="px-2 py-2">{p.bonusPoints.toLocaleString()}</td>
                  <td className="px-2 py-2">{p.priceLabel}</td>
                  <td className="px-2 py-2">{p.isActive ? "上架" : "下架"}</td>
                  <td className="px-2 py-2">
                    <button type="button" className="inline-flex items-center gap-1 text-kx-accent hover:underline" onClick={() => toggle(p.id, p.isActive)}>
                      <RefreshCw className="h-3 w-3" />
                      {p.isActive ? "下架" : "上架"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
