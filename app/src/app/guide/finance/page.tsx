"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { guide, type GuideFinanceCategory } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function yen(n: number): string {
  return "¥" + (n || 0).toLocaleString("ja-JP");
}

export default function GuideFinancePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());

  const cats = useQuery({ queryKey: ["guide", "finance-cats"], queryFn: () => guide.financeCategories(), enabled: Boolean(user), staleTime: 600_000 });
  const summary = useQuery({ queryKey: ["guide", "finance-summary", user?.id || "guest", month], queryFn: () => guide.financeSummary(month), enabled: Boolean(user) });
  const txns = useQuery({ queryKey: ["guide", "transactions", user?.id || "guest", month], queryFn: () => guide.transactions({ month, limit: 200 }), enabled: Boolean(user) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["guide", "finance-summary"] });
    qc.invalidateQueries({ queryKey: ["guide", "transactions"] });
  };

  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("rent");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [note, setNote] = useState("");

  const catList: GuideFinanceCategory[] = useMemo(
    () => (kind === "income" ? cats.data?.income : cats.data?.expense) ?? [],
    [cats.data, kind],
  );
  const catLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of [...(cats.data?.expense ?? []), ...(cats.data?.income ?? [])]) m[c.code] = c.zh;
    return m;
  }, [cats.data]);

  const add = useMutation({
    mutationFn: () => guide.createTransaction({ kind, amount: Number(amount || 0), category, occurredOn, note }),
    onSuccess: () => { invalidate(); setAmount(""); setNote(""); pushToast({ kind: "success", message: "已记一笔" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "记账失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteTransaction(id),
    onSuccess: invalidate,
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "删除失败" }),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <Wallet className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后管理你的收支</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">手动记账、看清每月固定费和变动费、设预算控制成本。我们不连接你的银行，只记你填的数。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  const s = summary.data;
  const trend = s ? s.expense - s.lastMonthExpense : 0;

  return (
    <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Finance</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">收支与生活成本</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm leading-7 text-kx-subtle">
            <Lock className="h-3.5 w-3.5 text-kx-accent" /> 全部在你的账户里、只有你能看 · 我们不连接银行，只记你手动填的数。
          </p>
        </header>

        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="h-10 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text outline-none focus:border-kx-accent" />
        </div>

        {/* Dashboard */}
        {summary.isLoading ? <InlineLoading /> : summary.isError ? (
          <ErrorState title="加载失败" subtitle="请稍后重试。" onRetry={() => summary.refetch()} />
        ) : s ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="本月收入" value={yen(s.income)} tone="income" icon={<TrendingUp className="h-4 w-4" />} />
            <Stat label="本月支出" value={yen(s.expense)} tone="expense" icon={<TrendingDown className="h-4 w-4" />} sub={trend !== 0 ? `较上月${trend > 0 ? "多" : "少"} ${yen(Math.abs(trend))}` : undefined} />
            <Stat label="本月结余" value={yen(s.net)} tone={s.net >= 0 ? "income" : "expense"} icon={<Wallet className="h-4 w-4" />} sub={s.fixedMonthly > 0 ? `固定支出约 ${yen(s.fixedMonthly)}/月` : undefined} />
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          {/* Quick add */}
          <form className="kx-card h-fit space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) add.mutate(); }}>
            <h2 className="text-lg font-black text-kx-text">记一笔</h2>
            <div className="inline-flex w-full rounded-full border border-kx-stroke/60 bg-kx-card p-1">
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setCategory(k === "income" ? "salary" : "rent"); }}
                  className={"flex-1 rounded-full py-1.5 text-sm font-bold transition " + (kind === k ? (k === "expense" ? "bg-rose-500 text-white" : "bg-kx-accent text-white") : "text-kx-muted")}>
                  {k === "expense" ? "支出" : "收入"}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-sm font-black text-kx-text">金额 JPY</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="0"
                className="mt-2 h-12 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-2xl font-black text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <label className="block">
              <span className="text-sm font-black text-kx-text">分类</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                {catList.map((c) => <option key={c.code} value={c.code}>{c.zh}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-black text-kx-text">日期</span>
              <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（可选）"
              className="h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent" />
            <button type="submit" disabled={add.isPending || Number(amount) <= 0} className="kx-button-primary h-11 w-full disabled:opacity-60">
              <Plus className="h-4 w-4" /> 记一笔
            </button>
          </form>

          <div className="space-y-7">
            {/* Budgets */}
            {s && s.byCategory.length ? (
              <section>
                <h2 className="mb-3 text-xl font-black text-kx-text">本月分类支出</h2>
                <div className="space-y-2.5">
                  {s.byCategory.map((c) => {
                    const b = s.budgets.find((x) => x.category === c.category);
                    const pct = b && b.limit > 0 ? Math.min(100, Math.round((c.amount / b.limit) * 100)) : 0;
                    const over = b && b.limit > 0 && c.amount > b.limit;
                    return (
                      <div key={c.category} className="kx-card p-3">
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span className="text-kx-text">{catLabel[c.category] || c.category}</span>
                          <span className={over ? "text-rose-500" : "text-kx-text"}>{yen(c.amount)}{b && b.limit > 0 ? <span className="text-kx-muted"> / {yen(b.limit)}</span> : null}</span>
                        </div>
                        {b && b.limit > 0 ? (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-kx-soft">
                            <div className={"h-full rounded-full transition-all " + (over ? "bg-rose-500" : "bg-kx-accent")} style={{ width: `${pct}%` }} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Transactions */}
            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">本月明细</h2>
              {txns.isLoading ? <InlineLoading /> : txns.data?.items.length ? (
                <div className="space-y-2">
                  {txns.data.items.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 rounded-2xl bg-kx-card px-3.5 py-2.5 ring-1 ring-kx-stroke/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-kx-text">{catLabel[t.category] || t.category}{t.note ? <span className="font-normal text-kx-muted"> · {t.note}</span> : null}</span>
                        <span className="text-[11px] text-kx-muted">{t.occurredOn}</span>
                      </span>
                      <span className={"shrink-0 text-sm font-black " + (t.kind === "income" ? "text-kx-accent" : "text-kx-text")}>{t.kind === "income" ? "+" : "-"}{yen(t.amount)}</span>
                      <button type="button" onClick={() => remove.mutate(t.id)} className="shrink-0 text-kx-muted opacity-0 transition hover:text-rose-500 group-hover:opacity-100" aria-label="删除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="本月还没有记录" body="用左边「记一笔」记下第一笔收入或支出，概览会自动汇总。" />
              )}
            </section>
          </div>
        </section>
      </main>
    </GuideShell>
  );
}

function Stat({ label, value, tone, icon, sub }: { label: string; value: string; tone: "income" | "expense"; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="kx-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold text-kx-muted">
        <span className={tone === "income" ? "text-kx-accent" : "text-rose-500"}>{icon}</span> {label}
      </div>
      <div className="mt-1.5 text-2xl font-black tracking-tight text-kx-text">{value}</div>
      {sub ? <div className="mt-1 text-[11px] font-semibold text-kx-muted">{sub}</div> : null}
    </div>
  );
}
