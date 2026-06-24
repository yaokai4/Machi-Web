"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Download, Sparkles, RefreshCw } from "lucide-react";
import { guide, type GuideFinanceCategory } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "JPY", symbol: "¥", label: "日元 JPY" },
  { code: "CNY", symbol: "CN¥", label: "人民币 CNY" },
  { code: "USD", symbol: "$", label: "美元 USD" },
  { code: "EUR", symbol: "€", label: "欧元 EUR" },
  { code: "KRW", symbol: "₩", label: "韩元 KRW" },
  { code: "GBP", symbol: "£", label: "英镑 GBP" },
];
const CURRENCY_KEY = "kx-finance-currency";

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function GuideFinancePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [month, setMonth] = useState(thisMonth());
  const [currency, setCurrency] = useState("JPY");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(CURRENCY_KEY) : null;
    if (saved) setCurrency(saved);
  }, []);
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "¥";
  const money = (n: number) => symbol + (n || 0).toLocaleString("en-US");

  const cats = useQuery({ queryKey: ["guide", "finance-cats"], queryFn: () => guide.financeCategories(), enabled: Boolean(user), staleTime: 600_000 });
  const summary = useQuery({ queryKey: ["guide", "finance-summary", user?.id || "guest", month], queryFn: () => guide.financeSummary(month), enabled: Boolean(user) });
  const txns = useQuery({ queryKey: ["guide", "transactions", user?.id || "guest", month], queryFn: () => guide.transactions({ month, limit: 200 }), enabled: Boolean(user) });
  const trend = useQuery({ queryKey: ["guide", "finance-trend", user?.id || "guest", month], queryFn: () => guide.financeTrend(6, month), enabled: Boolean(user) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["guide", "finance-summary"] });
    qc.invalidateQueries({ queryKey: ["guide", "transactions"] });
    qc.invalidateQueries({ queryKey: ["guide", "finance-trend"] });
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
    mutationFn: () => guide.createTransaction({ kind, amount: Number(amount || 0), category, occurredOn, note, currency }),
    onSuccess: () => { invalidate(); setAmount(""); setNote(""); pushToast({ kind: "success", message: "已记一笔" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "记账失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteTransaction(id),
    onSuccess: invalidate,
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "删除失败" }),
  });
  const postFixed = useMutation({
    mutationFn: () => guide.postFixedCosts(month),
    onSuccess: (r) => { invalidate(); pushToast({ kind: r.posted > 0 ? "success" : "info", message: r.posted > 0 ? `已记入 ${r.posted} 笔固定费` : "本月固定费已全部记过了" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "操作失败" }),
  });

  const [budgetCat, setBudgetCat] = useState("rent");
  const [budgetLimit, setBudgetLimit] = useState("");
  const saveBudget = useMutation({
    mutationFn: () => guide.setBudget(budgetCat, Number(budgetLimit || 0)),
    onSuccess: () => { invalidate(); setBudgetLimit(""); pushToast({ kind: "success", message: "预算已更新" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "保存失败" }),
  });

  const onCurrencyChange = (c: string) => {
    setCurrency(c);
    if (typeof window !== "undefined") window.localStorage.setItem(CURRENCY_KEY, c);
  };

  const exportCsv = () => {
    const rows = txns.data?.items ?? [];
    if (!rows.length) { pushToast({ kind: "info", message: "本月没有可导出的记录" }); return; }
    const head = "date,kind,category,amount,currency,note";
    const body = rows.map((t) => [t.occurredOn, t.kind, catLabel[t.category] || t.category, t.amount, t.currency, (t.note || "").replace(/[",\n]/g, " ")].join(",")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `machi-finance-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
  const expTrend = s ? s.expense - s.lastMonthExpense : 0;
  const fixedShare = s && s.income > 0 ? Math.round((s.fixedMonthly / s.income) * 100) : 0;
  const savingsRate = s && s.income > 0 ? Math.round((s.net / s.income) * 100) : 0;
  const topCat = s && s.byCategory.length ? s.byCategory[0] : null;
  const trendMax = Math.max(1, ...(trend.data?.months ?? []).flatMap((m) => [m.income, m.expense]));

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

        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="h-10 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text outline-none focus:border-kx-accent" />
          <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}
            className="h-10 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text outline-none focus:border-kx-accent">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <button type="button" onClick={() => postFixed.mutate()} disabled={postFixed.isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text transition hover:border-kx-accent disabled:opacity-60">
            <RefreshCw className="h-4 w-4 text-kx-accent" /> 记入本月固定费
          </button>
          <button type="button" onClick={exportCsv}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text transition hover:border-kx-accent">
            <Download className="h-4 w-4 text-kx-accent" /> 导出 CSV
          </button>
        </div>

        {/* Dashboard */}
        {summary.isLoading ? <InlineLoading /> : summary.isError ? (
          <ErrorState title="加载失败" subtitle="请稍后重试。" onRetry={() => summary.refetch()} />
        ) : s ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Stat label="本月收入" value={money(s.income)} tone="income" icon={<TrendingUp className="h-4 w-4" />} />
              <Stat label="本月支出" value={money(s.expense)} tone="expense" icon={<TrendingDown className="h-4 w-4" />} sub={expTrend !== 0 ? `较上月${expTrend > 0 ? "多" : "少"} ${money(Math.abs(expTrend))}` : undefined} />
              <Stat label="本月结余" value={money(s.net)} tone={s.net >= 0 ? "income" : "expense"} icon={<Wallet className="h-4 w-4" />} sub={s.fixedMonthly > 0 ? `固定支出约 ${money(s.fixedMonthly)}/月` : undefined} />
            </section>
            {(s.income > 0 || topCat) ? (
              <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-kx-accentSoft/50 px-4 py-3 text-sm font-semibold text-kx-text">
                <Sparkles className="h-4 w-4 text-kx-accent" />
                {s.income > 0 ? <span>储蓄率 <b className={savingsRate >= 0 ? "text-kx-accent" : "text-rose-500"}>{savingsRate}%</b></span> : null}
                {s.income > 0 && s.fixedMonthly > 0 ? <span className="text-kx-muted">· 固定费占收入 {fixedShare}%</span> : null}
                {topCat ? <span className="text-kx-muted">· 最大支出 {catLabel[topCat.category] || topCat.category} {money(topCat.amount)}</span> : null}
              </section>
            ) : null}
          </>
        ) : null}

        {/* Trend chart */}
        {trend.data && trend.data.months.length > 1 ? (
          <section className="kx-card p-5">
            <h2 className="mb-4 text-lg font-black text-kx-text">近 6 个月趋势</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: 130 }}>
              {trend.data.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 96 }}>
                    <div className="w-2.5 rounded-t bg-kx-accent/80" style={{ height: `${(m.income / trendMax) * 96}px` }} title={`收入 ${money(m.income)}`} />
                    <div className="w-2.5 rounded-t bg-rose-400" style={{ height: `${(m.expense / trendMax) * 96}px` }} title={`支出 ${money(m.expense)}`} />
                  </div>
                  <span className="text-[10px] font-bold text-kx-muted">{m.month.slice(5)}月</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-kx-muted">
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-kx-accent/80" /> 收入</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" /> 支出</span>
            </div>
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
              <span className="text-sm font-black text-kx-text">金额 {currency}</span>
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
            {/* Category spend */}
            {s && s.byCategory.length ? (
              <section>
                <h2 className="mb-3 text-xl font-black text-kx-text">本月分类支出</h2>
                <CategoryDonut data={s.byCategory} total={s.expense} catLabel={catLabel} money={money} />
                <div className="mt-4 space-y-2.5">
                  {s.byCategory.map((c) => {
                    const b = s.budgets.find((x) => x.category === c.category);
                    const pct = b && b.limit > 0 ? Math.min(100, Math.round((c.amount / b.limit) * 100)) : 0;
                    const over = b && b.limit > 0 && c.amount > b.limit;
                    return (
                      <div key={c.category} className="kx-card p-3">
                        <div className="flex items-center justify-between text-sm font-bold">
                          <span className="text-kx-text">{catLabel[c.category] || c.category}</span>
                          <span className={over ? "text-rose-500" : "text-kx-text"}>{money(c.amount)}{b && b.limit > 0 ? <span className="text-kx-muted"> / {money(b.limit)}</span> : null}</span>
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

            {/* Budget editor */}
            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">分类预算</h2>
              <div className="kx-card flex flex-wrap items-end gap-3 p-4">
                <label className="flex-1 min-w-[120px]">
                  <span className="text-xs font-bold text-kx-muted">分类</span>
                  <select value={budgetCat} onChange={(e) => setBudgetCat(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                    {(cats.data?.expense ?? []).map((c) => <option key={c.code} value={c.code}>{c.zh}</option>)}
                  </select>
                </label>
                <label className="flex-1 min-w-[120px]">
                  <span className="text-xs font-bold text-kx-muted">每月上限 {currency}（0 = 取消）</span>
                  <input value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="0"
                    className="mt-1 h-10 w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold outline-none focus:border-kx-accent" />
                </label>
                <button type="button" onClick={() => saveBudget.mutate()} disabled={saveBudget.isPending} className="kx-button-primary h-10 px-4 disabled:opacity-60">保存</button>
              </div>
            </section>

            {/* Transactions */}
            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">本月明细</h2>
              {txns.isLoading ? <InlineLoading /> : txns.data?.items.length ? (
                <div className="space-y-2">
                  {txns.data.items.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 rounded-2xl bg-kx-card px-3.5 py-2.5 ring-1 ring-kx-stroke/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-kx-text">{catLabel[t.category] || t.category}{t.note ? <span className="font-normal text-kx-muted"> · {t.note}</span> : null}{t.source !== "manual" ? <span className="ml-1 rounded bg-kx-accentSoft px-1.5 py-0.5 text-[10px] font-bold text-kx-accent">固定</span> : null}</span>
                        <span className="text-[11px] text-kx-muted">{t.occurredOn}</span>
                      </span>
                      <span className={"shrink-0 text-sm font-black " + (t.kind === "income" ? "text-kx-accent" : "text-kx-text")}>{t.kind === "income" ? "+" : "-"}{money(t.amount)}</span>
                      <button type="button" onClick={() => remove.mutate(t.id)} className="shrink-0 text-kx-muted opacity-0 transition hover:text-rose-500 group-hover:opacity-100" aria-label="删除">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="本月还没有记录" body="用左边「记一笔」记下第一笔，或点上方「记入本月固定费」一键导入房租、手机等。" />
              )}
            </section>
          </div>
        </section>
      </main>
    </GuideShell>
  );
}

const CAT_COLORS = ["#147067", "#e8893b", "#5b8def", "#d9534f", "#9b59b6", "#3aa17e", "#e0b020", "#7a8aa0", "#c45c8a"];

function CategoryDonut({ data, total, catLabel, money }: { data: { category: string; amount: number }[]; total: number; catLabel: Record<string, string>; money: (n: number) => string }) {
  if (total <= 0) return null;
  const top = data.slice(0, 8);
  const rest = data.slice(8).reduce((sum, d) => sum + d.amount, 0);
  const segs = rest > 0 ? [...top, { category: "__other", amount: rest }] : top;
  let acc = 0;
  const stops = segs.map((d, i) => {
    const from = (acc / total) * 360;
    acc += d.amount;
    const to = (acc / total) * 360;
    return `${CAT_COLORS[i % CAT_COLORS.length]} ${from}deg ${to}deg`;
  });
  return (
    <div className="kx-card flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops.join(",")})` }} />
        <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-kx-card">
          <span className="text-[10px] font-bold text-kx-muted">本月支出</span>
          <span className="text-sm font-black text-kx-text">{money(total)}</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5">
        {segs.map((d, i) => (
          <div key={d.category} className="flex items-center gap-1.5 text-xs font-semibold">
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
            <span className="truncate text-kx-text">{d.category === "__other" ? "其他" : catLabel[d.category] || d.category}</span>
            <span className="ml-auto shrink-0 text-kx-muted">{Math.round((d.amount / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
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
