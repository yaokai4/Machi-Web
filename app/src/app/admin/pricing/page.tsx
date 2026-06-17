"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  Boxes,
  CreditCard,
  Edit3,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { adminGuide } from "@/lib/guide";
import { formatPrice } from "@/lib/format";
import { useToasts } from "@/lib/store";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";

type PricingRow = {
  id: string;
  name: string;
  type: "product" | "service" | "membership_plan" | string;
  category: string;
  price: number;
  currency: string;
  priceLabel: string;
  memberPrice: number;
  status: string;
  stripePriceId: string;
  iosIapProductId: string;
  updatedAt?: string | null;
  raw?: Record<string, unknown>;
};

type RowDraft = Partial<Pick<PricingRow, "price" | "currency" | "priceLabel" | "memberPrice" | "stripePriceId" | "iosIapProductId">>;
type TypeFilter = "all" | "product" | "service" | "membership_plan";

const FALLBACK_CURRENCIES = ["CNY", "JPY", "USD", "CAD", "EUR", "GBP", "HKD", "TWD", "KRW", "SGD", "AUD"];
const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "product", label: "商品" },
  { key: "service", label: "服务" },
  { key: "membership_plan", label: "会员套餐" },
];

function rowKey(row: PricingRow) {
  return `${row.type}:${row.id}`;
}

function typeLabel(type: PricingRow["type"]) {
  if (type === "membership_plan") return "会员套餐";
  if (type === "service") return "服务";
  return "商品";
}

function productHref(row: PricingRow) {
  const slug = String(row.raw?.slug || "");
  return slug ? `/guide/products/${slug}` : "";
}

function dateLabel(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fieldValue(row: PricingRow, draft: RowDraft, key: keyof RowDraft) {
  return draft[key] ?? row[key as keyof PricingRow] ?? "";
}

export default function AdminPricingPage() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-pricing"], queryFn: () => api.adminPricing() });
  const rows = useMemo(() => (q.data?.items || []) as PricingRow[], [q.data?.items]);
  const currencyOptions = useMemo(() => {
    const items = Array.isArray(q.data?.currencies) && q.data.currencies.length > 0 ? q.data.currencies : FALLBACK_CURRENCIES;
    return Array.from(new Set(items.map((item) => String(item).toUpperCase())));
  }, [q.data?.currencies]);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!keyword) return true;
      const haystack = [
        row.name,
        row.category,
        row.status,
        row.stripePriceId,
        row.iosIapProductId,
        String(row.raw?.slug || ""),
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query, rows, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    product: rows.filter((row) => row.type === "product").length,
    service: rows.filter((row) => row.type === "service").length,
    membership: rows.filter((row) => row.type === "membership_plan").length,
    draft: rows.filter((row) => row.status === "draft").length,
  }), [rows]);

  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(), [rows]);

  const save = useMutation({
    mutationFn: async (row: PricingRow) => {
      const key = rowKey(row);
      const patch = drafts[key] || {};
      if (row.type === "membership_plan") {
        await api.adminUpdateMembershipPlan(row.id, {
          price: Number(patch.price ?? row.price),
          currency: patch.currency ?? row.currency,
          priceLabel: patch.priceLabel ?? row.priceLabel,
          iosIapProductId: patch.iosIapProductId ?? row.iosIapProductId,
          appleProductId: patch.iosIapProductId ?? row.iosIapProductId,
        });
      } else {
        await adminGuide.updateProduct(row.id, {
          price: Number(patch.price ?? row.price),
          currency: patch.currency ?? row.currency,
          priceLabel: patch.priceLabel ?? row.priceLabel,
          memberPrice: Number(patch.memberPrice ?? row.memberPrice ?? 0),
          stripePriceId: patch.stripePriceId ?? row.stripePriceId,
          iosIapProductId: patch.iosIapProductId ?? row.iosIapProductId,
          appleProductId: patch.iosIapProductId ?? row.iosIapProductId,
        });
      }
    },
    onSuccess: async (_data, row) => {
      pushToast({ kind: "success", message: "价格配置已保存" });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[rowKey(row)];
        return next;
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pricing"] }),
        qc.invalidateQueries({ queryKey: ["admin-guide-products"] }),
      ]);
    },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "保存失败" }),
  });

  const remove = useMutation({
    mutationFn: (row: PricingRow) => adminGuide.deleteProduct(row.id),
    onSuccess: async () => {
      pushToast({ kind: "success", message: "商品已删除" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-pricing"] }),
        qc.invalidateQueries({ queryKey: ["admin-guide-products"] }),
      ]);
    },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "删除失败" }),
  });

  const update = (row: PricingRow, key: keyof RowDraft, value: string | number) => {
    const id = rowKey(row);
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const inputClass = "h-10 w-full rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm text-kx-text outline-none transition focus:border-kx-accent/70 focus:ring-2 focus:ring-kx-accent/20";
  const labelClass = "mb-1 block text-[11px] font-bold uppercase text-kx-muted";

  return (
    <div className="min-h-screen bg-kx-bg">
      <header className="border-b border-kx-stroke/60 bg-kx-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-kx-muted hover:text-kx-accent">
              <ArrowLeft className="h-3.5 w-3.5" /> 管理后台
            </Link>
            <h1 className="text-2xl font-black text-kx-text">价格管理</h1>
            <p className="mt-1 text-sm text-kx-muted">统一维护商品、服务与会员套餐价格；Web 会员按金额/货币创建一次性支付。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/guide/products/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-kx-accent px-3 text-sm font-semibold text-white hover:brightness-110">
              <PackagePlus className="h-4 w-4" /> 新建商品
            </Link>
            <Link href="/admin/guide/products" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
              <Boxes className="h-4 w-4" /> 商品管理
            </Link>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent"
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              title="刷新价格配置"
            >
              <RefreshCw className={clsx("h-4 w-4", q.isFetching && "animate-spin")} /> 刷新
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-kx-stroke/60 bg-kx-card px-4 py-3">
            <div className="text-xs font-semibold text-kx-muted">商品</div>
            <div className="mt-1 text-2xl font-black text-kx-text">{stats.product}</div>
          </div>
          <div className="rounded-lg border border-kx-stroke/60 bg-kx-card px-4 py-3">
            <div className="text-xs font-semibold text-kx-muted">服务</div>
            <div className="mt-1 text-2xl font-black text-kx-text">{stats.service}</div>
          </div>
          <div className="rounded-lg border border-kx-stroke/60 bg-kx-card px-4 py-3">
            <div className="text-xs font-semibold text-kx-muted">会员套餐</div>
            <div className="mt-1 text-2xl font-black text-kx-text">{stats.membership}</div>
          </div>
          <div className="rounded-lg border border-kx-stroke/60 bg-kx-card px-4 py-3">
            <div className="text-xs font-semibold text-kx-muted">草稿</div>
            <div className="mt-1 text-2xl font-black text-kx-text">{stats.draft}</div>
          </div>
        </section>

        <section className="mb-4 rounded-lg border border-kx-stroke/60 bg-kx-card p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={clsx(
                    "h-9 rounded-md px-3 text-sm font-semibold transition",
                    typeFilter === tab.key ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-subtle hover:text-kx-accent",
                  )}
                  onClick={() => setTypeFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kx-muted" />
                <input
                  className="h-9 w-full rounded-md border border-kx-stroke/70 bg-kx-soft/35 pl-9 pr-3 text-sm text-kx-text outline-none focus:border-kx-accent/70 focus:ring-2 focus:ring-kx-accent/20"
                  placeholder="搜索名称、分类、Slug 或支付 ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                className="h-9 rounded-md border border-kx-stroke/70 bg-kx-soft/35 px-3 text-sm text-kx-text outline-none focus:border-kx-accent/70"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">全部状态</option>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
        </section>

        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState title="加载失败" onRetry={() => q.refetch()} /> : filteredRows.length === 0 ? (
          <EmptyState title="暂无价格配置" subtitle="调整筛选条件，或先新建商品。" />
        ) : (
          <div className="space-y-3">
            {filteredRows.map((row) => {
              const key = rowKey(row);
              const draft = drafts[key] || {};
              const currentPrice = Number(fieldValue(row, draft, "price") || 0);
              const currentCurrency = String(fieldValue(row, draft, "currency") || "CNY");
              const currentPriceLabel = String(fieldValue(row, draft, "priceLabel") || "");
              const changed = Object.keys(draft).length > 0;
              const publicHref = productHref(row);
              const canDelete = row.type !== "membership_plan";
              return (
                <article key={key} className="rounded-lg border border-kx-stroke/60 bg-kx-card p-4 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={clsx(
                          "inline-flex h-6 items-center rounded-md px-2 text-xs font-bold",
                          row.type === "membership_plan" ? "bg-kx-accentSoft text-kx-accent" : row.type === "service" ? "bg-kx-soft text-kx-heat" : "bg-kx-soft text-kx-subtle",
                        )}>
                          {typeLabel(row.type)}
                        </span>
                        <span className="inline-flex h-6 items-center rounded-md border border-kx-stroke/60 px-2 text-xs font-semibold text-kx-muted">{row.status}</span>
                        <span className="text-xs text-kx-muted">更新 {dateLabel(row.updatedAt)}</span>
                      </div>
                      <h2 className="break-words text-base font-black text-kx-text">{row.name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kx-muted">
                        <span>{row.category || "未分类"}</span>
                        {String(row.raw?.slug || "") ? <span>{String(row.raw?.slug)}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {row.type === "membership_plan" ? (
                        <Link href="/admin/memberships" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 px-3 text-sm font-semibold text-kx-subtle hover:border-kx-accent/50 hover:text-kx-accent">
                          <ShieldCheck className="h-4 w-4" /> 会员后台
                        </Link>
                      ) : (
                        <>
                          <Link href={`/admin/guide/products/${row.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 px-3 text-sm font-semibold text-kx-subtle hover:border-kx-accent/50 hover:text-kx-accent">
                            <Edit3 className="h-4 w-4" /> 编辑
                          </Link>
                          {publicHref ? (
                            <Link href={publicHref} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 px-3 text-sm font-semibold text-kx-subtle hover:border-kx-accent/50 hover:text-kx-accent">
                              <CreditCard className="h-4 w-4" /> 前台
                            </Link>
                          ) : null}
                        </>
                      )}
                      <button
                        className={clsx(
                          "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-white",
                          changed ? "bg-kx-accent hover:brightness-110" : "bg-kx-muted/60",
                        )}
                        disabled={!changed || save.isPending}
                        onClick={() => save.mutate(row)}
                      >
                        <Save className="h-4 w-4" /> 保存
                      </button>
                      {canDelete ? (
                        <button
                          className="inline-flex h-9 items-center justify-center rounded-md border border-kx-danger/30 px-2.5 text-kx-danger hover:bg-kx-danger/10"
                          disabled={remove.isPending}
                          title="删除商品"
                          onClick={() => {
                            if (confirm(`删除「${row.name}」？此操作不可撤销。`)) remove.mutate(row);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[0.8fr_0.75fr_1.1fr_0.8fr_1.2fr_1.2fr]">
                    <label>
                      <span className={labelClass}>当前展示</span>
                      <div className="flex h-10 items-center rounded-md border border-kx-stroke/60 bg-kx-soft/35 px-3 text-sm font-black text-kx-text">
                        {formatPrice({ price: currentPrice, currency: currentCurrency, priceLabel: currentPriceLabel })}
                      </div>
                    </label>
                    <label>
                      <span className={labelClass}>价格</span>
                      <input
                        type="number"
                        className={inputClass}
                        value={Number(fieldValue(row, draft, "price") || 0)}
                        onChange={(event) => update(row, "price", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>货币</span>
                      <select
                        className={inputClass}
                        value={currentCurrency}
                        onChange={(event) => update(row, "currency", event.target.value)}
                      >
                        {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>价格文案</span>
                      <input
                        className={inputClass}
                        value={currentPriceLabel}
                        onChange={(event) => update(row, "priceLabel", event.target.value)}
                        placeholder="如 会员专属 / 预约咨询"
                      />
                    </label>
                    <label>
                      <span className={labelClass}>会员价</span>
                      <input
                        type="number"
                        disabled={row.type === "membership_plan"}
                        className={clsx(inputClass, row.type === "membership_plan" && "opacity-45")}
                        value={Number(fieldValue(row, draft, "memberPrice") || 0)}
                        onChange={(event) => update(row, "memberPrice", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>{row.type === "membership_plan" ? "Stripe Checkout" : "Stripe Price ID"}</span>
                      <input
                        disabled={row.type === "membership_plan"}
                        className={clsx(inputClass, "font-mono text-xs", row.type === "membership_plan" && "opacity-45")}
                        value={String(fieldValue(row, draft, "stripePriceId") || "")}
                        onChange={(event) => update(row, "stripePriceId", event.target.value)}
                        placeholder={row.type === "membership_plan" ? "一次性支付按金额/货币生成" : "price_..."}
                      />
                    </label>
                    <label className="md:col-span-2 xl:col-span-2">
                      <span className={labelClass}>iOS Product ID</span>
                      <input
                        className={clsx(inputClass, "font-mono text-xs")}
                        value={String(fieldValue(row, draft, "iosIapProductId") || "")}
                        onChange={(event) => update(row, "iosIapProductId", event.target.value)}
                        placeholder="com.machi.product"
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/admin/guide/products/new" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
            <Plus className="h-4 w-4" /> 继续新建商品
          </Link>
          <Link href="/admin/guide/products" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
            <Boxes className="h-4 w-4" /> 打开完整商品管理
          </Link>
        </div>
      </main>
    </div>
  );
}
