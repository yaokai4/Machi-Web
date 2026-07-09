"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Download, Sparkles, RefreshCw } from "lucide-react";
import { guide, type GuideFinanceCategory } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

const CURRENCIES: { code: string; symbol: string }[] = [
  { code: "JPY", symbol: "¥" },
  { code: "CNY", symbol: "CN¥" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "KRW", symbol: "₩" },
  { code: "GBP", symbol: "£" },
];
const CURRENCY_KEY = "kx-finance-currency";

function currencyName(locale: Locale, code: string): string {
  const names: Record<string, string> = {
    JPY: pick(locale, "日元", "日本円", "Japanese Yen"),
    CNY: pick(locale, "人民币", "人民元", "Chinese Yuan"),
    USD: pick(locale, "美元", "米ドル", "US Dollar"),
    EUR: pick(locale, "欧元", "ユーロ", "Euro"),
    KRW: pick(locale, "韩元", "韓国ウォン", "Korean Won"),
    GBP: pick(locale, "英镑", "英ポンド", "British Pound"),
  };
  return `${names[code] || code} ${code}`;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Local calendar day (not UTC): the audience is in JST, where new Date().toISOString()
// still reads yesterday during the 00:00–09:00 window — which would silently default
// new entries to the wrong day.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GuideFinancePage() {
  const { locale } = useI18n();
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
  const symbolFor = (code: string) => CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
  const backLabel = pick(locale, "管理", "管理", "Manage");

  const cats = useQuery({ queryKey: ["guide", "finance-cats"], queryFn: () => guide.financeCategories(), enabled: Boolean(user), staleTime: 600_000 });
  const summary = useQuery({ queryKey: ["guide", "finance-summary", user?.id || "guest", month], queryFn: () => guide.financeSummary(month), enabled: Boolean(user) });
  const txns = useQuery({ queryKey: ["guide", "transactions", user?.id || "guest", month], queryFn: () => guide.transactions({ month, limit: 200 }), enabled: Boolean(user) });
  const trend = useQuery({ queryKey: ["guide", "finance-trend", user?.id || "guest", month], queryFn: () => guide.financeTrend(6, month), enabled: Boolean(user) });

  // Totals are summed server-side in the ledger's base currency — label them with
  // that (summary.currency), not the local entry-currency picker, so the displayed
  // symbol always matches the numbers. Each transaction row uses its own stored
  // currency below, so a row saved in another currency is never mislabeled.
  const baseSymbol = symbolFor(summary.data?.currency || currency);
  const money = (n: number) => baseSymbol + (n || 0).toLocaleString("en-US");

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
  // Category names are localized fields on each category — pick the one matching
  // the active locale so ja/en users never see Chinese-only category labels.
  const catName = (c: GuideFinanceCategory) => pick(locale, c.zh, c.ja || c.zh, c.en || c.zh);
  const catLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of [...(cats.data?.expense ?? []), ...(cats.data?.income ?? [])]) m[c.code] = catName(c);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.data, locale]);

  const add = useMutation({
    mutationFn: () => guide.createTransaction({ kind, amount: Number(amount || 0), category, occurredOn, note, currency }),
    onSuccess: () => { invalidate(); setAmount(""); setNote(""); pushToast({ kind: "success", message: pick(locale, "已记一笔", "1件記録しました", "Entry added") }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : pick(locale, "记账失败", "記録に失敗しました", "Could not add entry") }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteTransaction(id),
    onSuccess: invalidate,
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : pick(locale, "删除失败", "削除に失敗しました", "Could not delete") }),
  });
  const postFixed = useMutation({
    mutationFn: () => guide.postFixedCosts(month),
    onSuccess: (r) => {
      invalidate();
      pushToast({
        kind: r.posted > 0 ? "success" : "info",
        message: r.posted > 0
          ? pick(locale, `已记入 ${r.posted} 笔固定费`, `固定費を ${r.posted} 件記録しました`, `Logged ${r.posted} fixed cost${r.posted > 1 ? "s" : ""}`)
          : pick(locale, "本月固定费已全部记过了", "今月の固定費はすべて記録済みです", "This month's fixed costs are already logged"),
      });
    },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : pick(locale, "操作失败", "操作に失敗しました", "Something went wrong") }),
  });

  const [budgetCat, setBudgetCat] = useState("rent");
  const [budgetLimit, setBudgetLimit] = useState("");
  const saveBudget = useMutation({
    mutationFn: () => guide.setBudget(budgetCat, Number(budgetLimit || 0)),
    onSuccess: () => { invalidate(); setBudgetLimit(""); pushToast({ kind: "success", message: pick(locale, "预算已更新", "予算を更新しました", "Budget updated") }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : pick(locale, "保存失败", "保存に失敗しました", "Could not save") }),
  });

  const onCurrencyChange = (c: string) => {
    setCurrency(c);
    if (typeof window !== "undefined") window.localStorage.setItem(CURRENCY_KEY, c);
  };

  const exportCsv = () => {
    const rows = txns.data?.items ?? [];
    if (!rows.length) { pushToast({ kind: "info", message: pick(locale, "本月没有可导出的记录", "今月は書き出せる記録がありません", "No records to export this month") }); return; }
    const head = "date,kind,category,amount,currency,note";
    // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or
    // tab/CR) is prefixed with an apostrophe so Excel/Sheets treat it as text,
    // and every cell is quoted (internal quotes doubled) so commas or newlines in
    // a note or localized category name can't spill into other columns.
    const csvCell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const body = rows.map((t) => [t.occurredOn, t.kind, catLabel[t.category] || t.category, t.amount, t.currency, t.note || ""].map(csvCell).join(",")).join("\n");
    const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `machi-finance-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide/manage", label: backLabel }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <Wallet className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">{pick(locale, "登录后管理你的收支", "ログインして収支を管理", "Sign in to manage your budget")}</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">
              {pick(
                locale,
                "手动记账、看清每月固定费和变动费、设预算控制成本。我们不连接你的银行，只记你填的数。",
                "手動で記録し、毎月の固定費と変動費を把握、予算を設定してコストを管理。銀行とは連携せず、入力した数字だけを記録します。",
                "Track spending by hand, see your fixed and variable costs, and set budgets. We never connect to your bank — only the numbers you enter.",
              )}
            </p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">{pick(locale, "登录后继续", "ログインして続ける", "Sign in to continue")}</button>
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
  const incomeLabel = pick(locale, "收入", "収入", "Income");
  const expenseLabel = pick(locale, "支出", "支出", "Expense");
  const expTrendSub = expTrend !== 0
    ? pick(
        locale,
        `较上月${expTrend > 0 ? "多" : "少"} ${money(Math.abs(expTrend))}`,
        `先月より ${money(Math.abs(expTrend))} ${expTrend > 0 ? "多い" : "少ない"}`,
        `${money(Math.abs(expTrend))} ${expTrend > 0 ? "more" : "less"} than last month`,
      )
    : undefined;

  return (
    <GuideShell back={{ href: "/guide/manage", label: backLabel }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Finance</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">{pick(locale, "收支与生活成本", "収支と生活コスト", "Budget & cost of living")}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm leading-7 text-kx-subtle">
            <Lock className="h-3.5 w-3.5 text-kx-accent" />
            {pick(
              locale,
              "全部在你的账户里、只有你能看 · 我们不连接银行，只记你手动填的数。",
              "すべてあなたのアカウント内、あなただけが閲覧可 · 銀行とは連携せず、手入力した数字だけを記録。",
              "It all stays in your account, visible only to you · No bank connection — only the numbers you enter.",
            )}
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())}
            className="h-10 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text outline-none focus:border-kx-accent" />
          <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)}
            className="h-10 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text outline-none focus:border-kx-accent">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{currencyName(locale, c.code)}</option>)}
          </select>
          <button type="button" onClick={() => postFixed.mutate()} disabled={postFixed.isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text transition hover:border-kx-accent disabled:opacity-60">
            <RefreshCw className="h-4 w-4 text-kx-accent" /> {pick(locale, "记入本月固定费", "今月の固定費を記録", "Log fixed costs")}
          </button>
          <button type="button" onClick={exportCsv}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-text transition hover:border-kx-accent">
            <Download className="h-4 w-4 text-kx-accent" /> {pick(locale, "导出 CSV", "CSV を書き出す", "Export CSV")}
          </button>
        </div>

        {/* Dashboard */}
        {summary.isLoading ? <InlineLoading /> : summary.isError ? (
          <ErrorState
            title={pick(locale, "加载失败", "読み込みに失敗しました", "Failed to load")}
            subtitle={pick(locale, "请稍后重试。", "しばらくしてから再度お試しください。", "Please try again shortly.")}
            onRetry={() => summary.refetch()}
          />
        ) : s ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Stat label={pick(locale, "本月收入", "今月の収入", "Income this month")} value={money(s.income)} tone="income" icon={<TrendingUp className="h-4 w-4" />} />
              <Stat label={pick(locale, "本月支出", "今月の支出", "Spending this month")} value={money(s.expense)} tone="expense" icon={<TrendingDown className="h-4 w-4" />} sub={expTrendSub} />
              <Stat label={pick(locale, "本月结余", "今月の収支", "Net this month")} value={money(s.net)} tone={s.net >= 0 ? "income" : "expense"} icon={<Wallet className="h-4 w-4" />} sub={s.fixedMonthly > 0 ? pick(locale, `固定支出约 ${money(s.fixedMonthly)}/月`, `固定支出 約 ${money(s.fixedMonthly)}/月`, `~${money(s.fixedMonthly)}/mo fixed`) : undefined} />
            </section>
            {(s.income > 0 || topCat) ? (
              <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-kx-accentSoft/50 px-4 py-3 text-sm font-semibold text-kx-text">
                <Sparkles className="h-4 w-4 text-kx-accent" />
                {s.income > 0 ? <span>{pick(locale, "储蓄率", "貯蓄率", "Savings rate")} <b className={savingsRate >= 0 ? "text-kx-accent" : "text-rose-500"}>{savingsRate}%</b></span> : null}
                {s.income > 0 && s.fixedMonthly > 0 ? <span className="text-kx-muted">· {pick(locale, `固定费占收入 ${fixedShare}%`, `固定費は収入の ${fixedShare}%`, `Fixed costs ${fixedShare}% of income`)}</span> : null}
                {topCat ? <span className="text-kx-muted">· {pick(locale, `最大支出 ${catLabel[topCat.category] || topCat.category} ${money(topCat.amount)}`, `最大支出 ${catLabel[topCat.category] || topCat.category} ${money(topCat.amount)}`, `Top spend: ${catLabel[topCat.category] || topCat.category} ${money(topCat.amount)}`)}</span> : null}
              </section>
            ) : null}
          </>
        ) : null}

        {/* Trend chart */}
        {trend.data && trend.data.months.length > 1 ? (
          <section className="kx-card p-5">
            <h2 className="mb-4 text-lg font-black text-kx-text">{pick(locale, "近 6 个月趋势", "直近 6 か月の推移", "Last 6 months")}</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: 130 }}>
              {trend.data.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 96 }}>
                    <div className="w-2.5 rounded-t bg-kx-accent/80" style={{ height: `${(m.income / trendMax) * 96}px` }} title={`${incomeLabel} ${money(m.income)}`} />
                    <div className="w-2.5 rounded-t bg-rose-400" style={{ height: `${(m.expense / trendMax) * 96}px` }} title={`${expenseLabel} ${money(m.expense)}`} />
                  </div>
                  <span className="text-[10px] font-bold text-kx-muted">{m.month.slice(5)}{pick(locale, "月", "月", "")}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-kx-muted">
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-kx-accent/80" /> {incomeLabel}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" /> {expenseLabel}</span>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          {/* Quick add */}
          <form className="kx-card h-fit space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) add.mutate(); }}>
            <h2 className="text-lg font-black text-kx-text">{pick(locale, "记一笔", "記録する", "Add entry")}</h2>
            <div className="inline-flex w-full rounded-full border border-kx-stroke/60 bg-kx-card p-1">
              {(["expense", "income"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setCategory(k === "income" ? "salary" : "rent"); }}
                  className={"flex-1 rounded-full py-1.5 text-sm font-bold transition " + (kind === k ? (k === "expense" ? "bg-rose-500 text-white" : "bg-kx-accent text-white") : "text-kx-muted")}>
                  {k === "expense" ? expenseLabel : incomeLabel}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-sm font-black text-kx-text">{pick(locale, "金额", "金額", "Amount")} {currency}</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="0"
                className="mt-2 h-12 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-2xl font-black text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <label className="block">
              <span className="text-sm font-black text-kx-text">{pick(locale, "分类", "カテゴリ", "Category")}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                {catList.map((c) => <option key={c.code} value={c.code}>{catName(c)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-black text-kx-text">{pick(locale, "日期", "日付", "Date")}</span>
              <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick(locale, "备注（可选）", "メモ（任意）", "Note (optional)")}
              className="h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent" />
            <button type="submit" disabled={add.isPending || Number(amount) <= 0} className="kx-button-primary h-11 w-full disabled:opacity-60">
              <Plus className="h-4 w-4" /> {pick(locale, "记一笔", "記録する", "Add entry")}
            </button>
          </form>

          <div className="space-y-7">
            {/* Category spend */}
            {s && s.byCategory.length ? (
              <section>
                <h2 className="mb-3 text-xl font-black text-kx-text">{pick(locale, "本月分类支出", "今月のカテゴリ別支出", "Spending by category")}</h2>
                <CategoryDonut data={s.byCategory} total={s.expense} catLabel={catLabel} money={money} centerLabel={pick(locale, "本月支出", "今月の支出", "Spent")} otherLabel={pick(locale, "其他", "その他", "Other")} />
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
              <h2 className="mb-3 text-xl font-black text-kx-text">{pick(locale, "分类预算", "カテゴリ予算", "Category budgets")}</h2>
              <div className="kx-card flex flex-wrap items-end gap-3 p-4">
                <label className="flex-1 min-w-[120px]">
                  <span className="text-xs font-bold text-kx-muted">{pick(locale, "分类", "カテゴリ", "Category")}</span>
                  <select value={budgetCat} onChange={(e) => setBudgetCat(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                    {(cats.data?.expense ?? []).map((c) => <option key={c.code} value={c.code}>{catName(c)}</option>)}
                  </select>
                </label>
                <label className="flex-1 min-w-[120px]">
                  <span className="text-xs font-bold text-kx-muted">{pick(locale, `每月上限 ${currency}（0 = 取消）`, `毎月の上限 ${currency}（0 = 解除）`, `Monthly limit ${currency} (0 = off)`)}</span>
                  <input value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="0"
                    className="mt-1 h-10 w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold outline-none focus:border-kx-accent" />
                </label>
                <button type="button" onClick={() => saveBudget.mutate()} disabled={saveBudget.isPending} className="kx-button-primary h-10 px-4 disabled:opacity-60">{pick(locale, "保存", "保存", "Save")}</button>
              </div>
            </section>

            {/* Transactions */}
            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">{pick(locale, "本月明细", "今月の明細", "This month's entries")}</h2>
              {txns.isLoading ? <InlineLoading /> : txns.data?.items.length ? (
                <div className="space-y-2">
                  {txns.data.items.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 rounded-2xl bg-kx-card px-3.5 py-2.5 ring-1 ring-kx-stroke/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-kx-text">{catLabel[t.category] || t.category}{t.note ? <span className="font-normal text-kx-muted"> · {t.note}</span> : null}{t.source !== "manual" ? <span className="ml-1 rounded bg-kx-accentSoft px-1.5 py-0.5 text-[10px] font-bold text-kx-accent">{pick(locale, "固定", "固定", "Fixed")}</span> : null}</span>
                        <span className="text-[11px] text-kx-muted">{t.occurredOn}</span>
                      </span>
                      <span className={"shrink-0 text-sm font-black " + (t.kind === "income" ? "text-kx-accent" : "text-kx-text")}>{t.kind === "income" ? "+" : "-"}{symbolFor(t.currency) + (t.amount || 0).toLocaleString("en-US")}</span>
                      <button type="button" onClick={() => remove.mutate(t.id)} className="shrink-0 text-kx-muted opacity-0 transition hover:text-rose-500 group-hover:opacity-100" aria-label={pick(locale, "删除", "削除", "Delete")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  title={pick(locale, "本月还没有记录", "今月はまだ記録がありません", "No entries yet this month")}
                  body={pick(
                    locale,
                    "用左边「记一笔」记下第一笔，或点上方「记入本月固定费」一键导入房租、手机等。",
                    "左の「記録する」で最初の1件を入力するか、上の「今月の固定費を記録」で家賃・携帯などを一括で追加できます。",
                    "Add your first entry with “Add entry” on the left, or tap “Log fixed costs” above to import rent, phone, and more.",
                  )}
                />
              )}
            </section>
          </div>
        </section>
      </main>
    </GuideShell>
  );
}

const CAT_COLORS = ["#147067", "#e8893b", "#5b8def", "#d9534f", "#9b59b6", "#3aa17e", "#e0b020", "#7a8aa0", "#c45c8a"];

function CategoryDonut({ data, total, catLabel, money, centerLabel, otherLabel }: { data: { category: string; amount: number }[]; total: number; catLabel: Record<string, string>; money: (n: number) => string; centerLabel: string; otherLabel: string }) {
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
          <span className="text-[10px] font-bold text-kx-muted">{centerLabel}</span>
          <span className="text-sm font-black text-kx-text">{money(total)}</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5">
        {segs.map((d, i) => (
          <div key={d.category} className="flex items-center gap-1.5 text-xs font-semibold">
            <i className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
            <span className="truncate text-kx-text">{d.category === "__other" ? otherLabel : catLabel[d.category] || d.category}</span>
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
