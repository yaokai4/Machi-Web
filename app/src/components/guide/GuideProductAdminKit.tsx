"use client";

// Self-contained admin UI for Machi Guide 商品 / 订单 / 服务预约. Reuses the
// `adminGuide` API client (lib/guide.ts) — Web + iOS share the same backend.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeDollarSign, Image as ImageIcon, LayoutDashboard, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { adminGuide, GUIDE_PRODUCT_TYPE_LABELS, type GuideProduct } from "@/lib/guide";
import { useToasts } from "@/lib/store";
import { api, APIError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { InlineLoading, ErrorState, EmptyState } from "@/components/design/States";

const PRODUCT_TYPES = Object.keys(GUIDE_PRODUCT_TYPE_LABELS);
const PRODUCT_STATUSES = ["draft", "published", "coming_soon", "hidden", "archived"];
const CATEGORY_KEYS = ["jlpt", "study_japan", "study_abroad_japan", "career_japan", "life_japan", "guide_services"];

function AdminShell({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-kx-muted">
            <Link href="/admin" className="inline-flex items-center gap-1 hover:text-kx-accent">
              <ArrowLeft className="h-3.5 w-3.5" /> 管理后台
            </Link>
            <span>/</span>
            <Link href="/admin/guide" className="hover:text-kx-accent">Guide 管理</Link>
          </div>
          <h1 className="text-2xl font-black text-kx-text">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-kx-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-subtle hover:border-kx-accent/50 hover:text-kx-accent">
            <LayoutDashboard className="h-4 w-4" /> 后台
          </Link>
          <Link href="/admin/pricing" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold text-kx-subtle hover:border-kx-accent/50 hover:text-kx-accent">
            <BadgeDollarSign className="h-4 w-4" /> 价格管理
          </Link>
          {right}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------- Product list ------------------------------ */

export function GuideProductsAdminPage({
  initialFilters = {},
  title = "商城商品",
  subtitle = "增删改查、价格、说明、文件、会员权限、Stripe/IAP 字段、上下架。",
}: {
  initialFilters?: Record<string, string>;
  title?: string;
  subtitle?: string;
}) {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const params = useMemo(() => {
    const p: Record<string, string | number> = { pageSize: 100 };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [filters]);
  const q = useQuery({ queryKey: ["admin-guide-products", params], queryFn: () => adminGuide.products(params) });
  const del = useMutation({
    mutationFn: (id: string) => adminGuide.deleteProduct(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-guide-products"] }); pushToast({ kind: "success", message: "已删除" }); },
    onError: () => pushToast({ kind: "error", message: "删除失败" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => adminGuide.updateProduct(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-guide-products"] }); pushToast({ kind: "success", message: "状态已更新" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "更新失败" }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const sel = "h-9 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-2 text-sm text-kx-text outline-none";

  return (
    <AdminShell
      title={title}
      subtitle={subtitle}
      right={<Link href="/admin/guide/products/new" className="kx-button-primary h-10"><Plus className="h-4 w-4" /> 新建商品</Link>}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <input placeholder="搜索标题/标签" className={sel + " min-w-44"} value={filters.keyword || ""} onChange={set("keyword")} />
        <select className={sel} value={filters.status || ""} onChange={set("status")}><option value="">全部状态</option>{PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className={sel} value={filters.categoryKey || ""} onChange={set("categoryKey")}><option value="">全部分类</option>{CATEGORY_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className={sel} value={filters.productType || ""} onChange={set("productType")}><option value="">全部类型</option>{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{GUIDE_PRODUCT_TYPE_LABELS[t]}</option>)}</select>
        <select className={sel} value={filters.isService || ""} onChange={set("isService")}><option value="">资料+服务</option><option value="0">仅资料</option><option value="1">仅服务</option></select>
        <select className={sel} value={filters.isMemberIncluded || ""} onChange={set("isMemberIncluded")}><option value="">全部权限</option><option value="1">会员专属</option><option value="0">非会员专属</option></select>
      </div>

      {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState title="加载失败" onRetry={() => q.refetch()} /> : (q.data?.items.length ?? 0) === 0 ? (
        <EmptyState title="暂无商品" subtitle="点击右上角新建商品。" />
      ) : (
        <div className="overflow-hidden rounded-kx-lg border border-kx-stroke/50">
          <table className="w-full text-sm">
            <thead className="bg-kx-soft/60 text-xs text-kx-muted">
              <tr><th className="px-3 py-2 text-left">标题</th><th className="px-3 py-2 text-left">类型</th><th className="px-3 py-2 text-left">价格</th><th className="px-3 py-2 text-left">权限</th><th className="px-3 py-2 text-left">状态</th><th className="px-3 py-2 text-right">操作</th></tr>
            </thead>
            <tbody>
              {q.data!.items.map((p: GuideProduct) => (
                <tr key={p.id} className="border-t border-kx-stroke/40">
                  <td className="px-3 py-2">
                    <Link href={`/admin/guide/products/${p.id}/edit`} className="font-semibold text-kx-text hover:text-kx-accent">{p.title}</Link>
                    <div className="text-[11px] text-kx-muted">{p.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-kx-subtle">{p.isService ? "服务" : "资料"} · {GUIDE_PRODUCT_TYPE_LABELS[p.productType] || p.productType}</td>
                  <td className="px-3 py-2 text-kx-subtle">{formatPrice(p) || "—"}</td>
                  <td className="px-3 py-2 text-kx-subtle">{p.isMemberIncluded ? "会员专属" : p.isMemberDiscount ? "会员折扣" : "单独购买"}</td>
                  <td className="px-3 py-2">
                    <select value={p.status} onChange={(e) => toggle.mutate({ id: p.id, status: e.target.value })} className="h-8 rounded-kx-sm border border-kx-stroke/60 bg-kx-card px-1.5 text-xs">
                      {PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/guide/products/${p.id}/edit`} className="mr-2 text-xs font-semibold text-kx-accent">编辑</Link>
                    <button onClick={() => { if (confirm(`删除「${p.title}」？`)) del.mutate(p.id); }} className="text-xs text-kx-danger"><Trash2 className="inline h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

/* ------------------------------- Product edit ------------------------------ */

type FieldType = "text" | "number" | "textarea" | "select" | "bool" | "tags";
interface FieldDef { key: keyof GuideProduct | string; label: string; type: FieldType; options?: string[]; hint?: string; }

const PRODUCT_FIELDS: Array<{ section: string; fields: FieldDef[] }> = [
  { section: "基础", fields: [
    { key: "title", label: "标题（必填）", type: "text" },
    { key: "slug", label: "Slug（唯一，留空自动）", type: "text" },
    { key: "subtitle", label: "副标题", type: "text" },
    { key: "categoryKey", label: "分类", type: "select", options: CATEGORY_KEYS },
    { key: "subCategoryKey", label: "子分类 key", type: "text" },
    { key: "productType", label: "商品类型", type: "select", options: PRODUCT_TYPES },
    { key: "tags", label: "标签（逗号分隔）", type: "tags" },
    { key: "relatedArticleSlugs", label: "关联文章 slug（逗号分隔）", type: "tags", hint: "用于从商品反向挂到 Guide 文章路径" },
    { key: "topicSlugs", label: "关联专题 slug（逗号分隔）", type: "tags", hint: "用于专题页聚合商品/服务" },
    { key: "targetAudience", label: "适合人群", type: "text" },
    { key: "coverImage", label: "封面图 URL / 上传文件 ID", type: "text" },
  ] },
  { section: "说明", fields: [
    { key: "description", label: "商品说明（含服务范围/不包含）", type: "textarea" },
    { key: "previewContent", label: "预览内容（未购可见）", type: "textarea" },
    { key: "purchaseContent", label: "购买后内容（购后/会员可见）", type: "textarea" },
    { key: "deliveryMethod", label: "交付方式", type: "text" },
    { key: "refundPolicy", label: "退款/取消规则", type: "textarea" },
    { key: "notes", label: "备注/合规说明", type: "textarea" },
  ] },
  { section: "价格与权限", fields: [
    { key: "price", label: "价格（整数，免费=0）", type: "number" },
    { key: "currency", label: "币种", type: "text" },
    { key: "priceLabel", label: "价格标签（如 后台配置价 / 预约咨询）", type: "text" },
    { key: "originalPrice", label: "原价（可选）", type: "number" },
    { key: "discountLabel", label: "优惠文案", type: "text" },
    { key: "memberPrice", label: "会员价（整数）", type: "number" },
    { key: "memberDiscountPercent", label: "会员折扣百分比", type: "number" },
    { key: "servicePriceType", label: "服务价格类型", type: "select", options: ["", "fixed_price", "starting_from", "appointment_only", "quote_required", "free"] },
    { key: "startingPrice", label: "起价", type: "number" },
    { key: "billingType", label: "计费类型", type: "select", options: ["one_time", "subscription", "service_booking", "free", "member_included"] },
    { key: "billingPeriod", label: "计费周期", type: "select", options: ["none", "monthly", "yearly"] },
    { key: "isService", label: "服务类（人工）", type: "bool", hint: "服务类不能设为会员免费" },
    { key: "isFree", label: "免费", type: "bool" },
    { key: "isMemberIncluded", label: "会员专属（仅数字资料）", type: "bool" },
    { key: "isMemberDiscount", label: "会员折扣", type: "bool" },
    { key: "isPriceHidden", label: "隐藏具体价格", type: "bool" },
    { key: "isAppointmentOnly", label: "仅预约咨询", type: "bool" },
    { key: "isComingSoon", label: "即将开放", type: "bool" },
    { key: "isFeatured", label: "精选/推荐", type: "bool" },
    { key: "status", label: "状态", type: "select", options: PRODUCT_STATUSES },
    { key: "sortOrder", label: "排序（小在前）", type: "number" },
    { key: "taxIncluded", label: "含税", type: "bool" },
    { key: "priceRegion", label: "价格地区/国家", type: "text" },
    { key: "serviceDurationMinutes", label: "服务时长（分钟）", type: "number" },
    { key: "depositRequired", label: "需要定金", type: "bool" },
    { key: "depositAmount", label: "定金金额", type: "number" },
    { key: "cancellationPolicy", label: "取消政策", type: "textarea" },
  ] },
  { section: "文件与支付", fields: [
    { key: "fileUrl", label: "PDF 文件 ID（购后签名下载）", type: "text" },
    { key: "fileName", label: "文件名", type: "text" },
    { key: "fileType", label: "文件类型", type: "text" },
    { key: "stripeProductId", label: "Stripe product id", type: "text" },
    { key: "stripePriceId", label: "Stripe price id", type: "text" },
    { key: "iosIapProductId", label: "iOS IAP product id", type: "text" },
    { key: "appleProductId", label: "Apple product id", type: "text" },
  ] },
  { section: "点数购买（Machi Points）", fields: [
    { key: "walletEligible", label: "允许用点数购买", type: "bool" },
    { key: "walletPricePoints", label: "点数价格（整数）", type: "number" },
    { key: "memberWalletPricePoints", label: "会员点数价（整数，0=同上）", type: "number" },
    { key: "platformPolicy", label: "平台支付策略", type: "select", options: ["digital_iap_required", "web_stripe_allowed", "external_service_allowed", "booking_only"] },
    { key: "fulfillmentType", label: "交付类型", type: "select", options: ["digital_unlock", "file_download", "service_request", "async_review", "offline_booking", "listing_boost", "ai_quota"] },
    { key: "entitlementType", label: "权益类型（默认 guide_product）", type: "text" },
    { key: "appStoreEligible", label: "iOS 可售（App Store IAP）", type: "bool" },
    { key: "googlePlayEligible", label: "Android 可售（Play Billing）", type: "bool" },
    { key: "externalPaymentAllowed", label: "允许外部支付", type: "bool" },
    { key: "pointsPurchaseLimit", label: "点数购买上限（0=不限）", type: "number" },
  ] },
];

export function GuideProductEditPage({ create = false }: { create?: boolean }) {
  const params = useParams();
  const id = String(params?.id || "");
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const [form, setForm] = useState<Record<string, unknown>>({ currency: "CNY", status: "draft", categoryKey: "guide_services", productType: "pdf_material" });
  const [assetUploading, setAssetUploading] = useState<"" | "cover" | "file">("");
  const [assetProgress, setAssetProgress] = useState(0);

  const q = useQuery({ queryKey: ["admin-guide-product", id], queryFn: () => adminGuide.product(id), enabled: !create && id.length > 0 });
  useEffect(() => {
    if (q.data?.product) {
      const p = q.data.product as unknown as Record<string, unknown>;
      setForm({
        ...p,
        tags: Array.isArray(p.tags) ? (p.tags as string[]).join(", ") : p.tags,
        relatedArticleSlugs: Array.isArray(p.relatedArticleSlugs) ? (p.relatedArticleSlugs as string[]).join(", ") : p.relatedArticleSlugs,
        topicSlugs: Array.isArray(p.topicSlugs) ? (p.topicSlugs as string[]).join(", ") : p.topicSlugs,
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const csv = (value: unknown) => typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : value;
      const body = {
        ...form,
        tags: csv(form.tags),
        relatedArticleSlugs: csv(form.relatedArticleSlugs),
        topicSlugs: csv(form.topicSlugs),
      };
      return create ? adminGuide.createProduct(body) : adminGuide.updateProduct(id, body);
    },
    onSuccess: (r) => {
      pushToast({ kind: "success", message: create ? "已创建" : "已保存" });
      if (create && "id" in r) router.push(`/admin/guide/products/${(r as { id: string }).id}/edit`);
    },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "保存失败" }),
  });

  const setV = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const uploadAsset = async (file: File | undefined, kind: "cover" | "file") => {
    if (!file) return;
    setAssetUploading(kind);
    setAssetProgress(0);
    try {
      const isMemberResource = Boolean(form.isMemberIncluded) && !Boolean(form.isService);
      const uploaded = await api.uploadFile(file, {
        purpose: kind === "cover" ? "guide_product_preview" : (isMemberResource ? "member_resource_file" : "guide_product_file"),
        entityType: kind === "file" && isMemberResource ? "member_resource" : "guide_product",
        entityId: create ? "" : id,
        onProgress: (event) => setAssetProgress(event.progress),
      });
      if (kind === "cover") {
        setForm((f) => ({ ...f, coverImage: uploaded.media.url }));
      } else {
        setForm((f) => ({
          ...f,
          fileUrl: uploaded.file.id,
          fileName: file.name,
          fileType: uploaded.file.contentType,
          fileSize: uploaded.file.fileSize,
        }));
      }
      pushToast({ kind: "success", message: kind === "cover" ? "封面已上传" : "PDF 已上传" });
    } catch (e) {
      pushToast({ kind: "error", message: e instanceof APIError ? e.message : "上传失败" });
    } finally {
      setAssetUploading("");
      setAssetProgress(0);
    }
  };
  const input = "h-9 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/30 px-2 text-sm text-kx-text outline-none";
  const area = "min-h-20 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/30 px-2 py-1.5 text-sm text-kx-text outline-none";

  if (!create && q.isLoading) return <AdminShell title="编辑商品"><InlineLoading /></AdminShell>;

  return (
    <AdminShell title={create ? "新建商品" : "编辑商品"} subtitle="服务类不能设为会员免费；付费数字资料上架前需预览内容或文件。">
      <div className="space-y-5">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <h2 className="mb-3 text-sm font-black text-kx-text">S3 文件</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/30 p-3 text-sm font-semibold text-kx-text">
              {assetUploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              <span className="min-w-0 flex-1">上传封面 / 预览图</span>
              <input type="file" accept="image/*" hidden onChange={(e) => uploadAsset(e.target.files?.[0], "cover")} />
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/30 p-3 text-sm font-semibold text-kx-text">
              {assetUploading === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="min-w-0 flex-1">上传 Guide PDF</span>
              <input type="file" accept="application/pdf" hidden onChange={(e) => uploadAsset(e.target.files?.[0], "file")} />
            </label>
          </div>
          {assetUploading ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-kx-soft">
              <div className="h-full rounded-full bg-kx-accent transition-all" style={{ width: `${Math.round(assetProgress * 100)}%` }} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-kx-muted">PDF 不会作为永久公开 URL 暴露，用户购买或会员鉴权后通过短期下载链接访问。</p>
        </section>
        {PRODUCT_FIELDS.map((group) => (
          <section key={group.section} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
            <h2 className="mb-3 text-sm font-black text-kx-text">{group.section}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.fields.map((f) => {
                const val = form[f.key as string];
                if (f.type === "bool") {
                  return (
                    <label key={f.key as string} className="flex items-center gap-2 text-sm text-kx-subtle">
                      <input type="checkbox" checked={!!val} onChange={(e) => setV(f.key as string, e.target.checked)} />
                      <span>{f.label}{f.hint ? <em className="ml-1 text-[11px] not-italic text-kx-muted">（{f.hint}）</em> : null}</span>
                    </label>
                  );
                }
                return (
                  <label key={f.key as string} className={f.type === "textarea" ? "block sm:col-span-2" : "block"}>
                    <span className="mb-1 block text-xs font-semibold text-kx-muted">{f.label}</span>
                    {f.hint ? <span className="mb-1 block text-[11px] font-semibold text-kx-muted/80">{f.hint}</span> : null}
                    {f.type === "select" ? (
                      <select className={input} value={(val as string) || ""} onChange={(e) => setV(f.key as string, e.target.value)}>
                        {(f.options || []).map((o) => <option key={o} value={o}>{f.key === "productType" ? GUIDE_PRODUCT_TYPE_LABELS[o] || o : o}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea className={area} value={(val as string) || ""} onChange={(e) => setV(f.key as string, e.target.value)} />
                    ) : f.type === "number" ? (
                      <input className={input} type="number" value={(val as number) ?? ""} onChange={(e) => setV(f.key as string, Number(e.target.value))} />
                    ) : (
                      <input className={input} value={(val as string) || ""} onChange={(e) => setV(f.key as string, e.target.value)} />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        <div className="flex gap-2">
          <button onClick={() => save.mutate()} disabled={save.isPending} className="kx-button-primary h-10 px-6 disabled:opacity-60">{create ? "创建商品" : "保存"}</button>
          <Link href="/admin/guide/products" className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold text-kx-muted hover:bg-kx-soft">返回</Link>
        </div>
      </div>
    </AdminShell>
  );
}

/* --------------------------------- Orders ---------------------------------- */

const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"];

export function GuideOrdersAdminPage() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["admin-guide-orders", status], queryFn: () => adminGuide.orders(status ? { status } : {}) });
  const upd = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminGuide.updateOrder(id, s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-guide-orders"] }); pushToast({ kind: "success", message: "订单状态已更新" }); },
    onError: () => pushToast({ kind: "error", message: "更新失败" }),
  });
  return (
    <AdminShell title="资料/服务订单" subtitle="查看支付状态、手动标记交付。">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-3 h-9 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-2 text-sm"><option value="">全部状态</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      {q.isLoading ? <InlineLoading /> : (q.data?.items.length ?? 0) === 0 ? <EmptyState title="暂无订单" /> : (
        <div className="overflow-hidden rounded-kx-lg border border-kx-stroke/50">
          <table className="w-full text-sm">
            <thead className="bg-kx-soft/60 text-xs text-kx-muted"><tr><th className="px-3 py-2 text-left">订单号</th><th className="px-3 py-2 text-left">商品</th><th className="px-3 py-2 text-left">用户</th><th className="px-3 py-2 text-left">金额</th><th className="px-3 py-2 text-left">状态</th></tr></thead>
            <tbody>
              {q.data!.items.map((o) => (
                <tr key={o.id} className="border-t border-kx-stroke/40">
                  <td className="px-3 py-2 font-mono text-xs">{o.orderNo}</td>
                  <td className="px-3 py-2">{o.productTitle}</td>
                  <td className="px-3 py-2 text-kx-subtle">{o.userDisplayName || o.userHandle}</td>
                  <td className="px-3 py-2">{o.price > 0 ? formatPrice({ price: o.price, currency: o.currency }) : "免费"}</td>
                  <td className="px-3 py-2"><select value={o.orderStatus} onChange={(e) => upd.mutate({ id: o.id, s: e.target.value })} className="h-8 rounded-kx-sm border border-kx-stroke/60 bg-kx-card px-1.5 text-xs">{ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

/* ----------------------------- Service requests ---------------------------- */

const SR_STATUSES = ["pending", "contacted", "confirmed", "paid", "in_progress", "completed", "cancelled", "refunded"];

export function GuideServiceRequestsAdminPage() {
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["admin-guide-srs", status], queryFn: () => adminGuide.serviceRequests(status ? { status } : {}) });
  const upd = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => adminGuide.updateServiceRequest(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-guide-srs"] }); pushToast({ kind: "success", message: "已更新" }); },
    onError: () => pushToast({ kind: "error", message: "更新失败" }),
  });
  return (
    <AdminShell title="服务预约" subtitle="查看预约、联系方式与需求，修改状态、添加备注。">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="mb-3 h-9 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-2 text-sm"><option value="">全部状态</option>{SR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      {q.isLoading ? <InlineLoading /> : (q.data?.items.length ?? 0) === 0 ? <EmptyState title="暂无预约" /> : (
        <div className="space-y-3">
          {q.data!.items.map((r) => (
            <div key={r.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-kx-text">{r.productTitle || r.serviceType}{r.isMember ? <span className="ml-2 rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] text-kx-accent">会员</span> : null}</div>
                <select value={r.requestStatus} onChange={(e) => upd.mutate({ id: r.id, body: { status: e.target.value } })} className="h-8 rounded-kx-sm border border-kx-stroke/60 bg-kx-card px-1.5 text-xs">{SR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-kx-subtle sm:grid-cols-2">
                <span>用户：{r.userDisplayName || r.userHandle}</span>
                <span>联系：{r.contactMethod} {r.contactValue}</span>
                <span>城市：{r.serviceCity || "—"}</span>
                <span>期望：{r.preferredDate} {r.preferredTime}</span>
                {r.currentSituation ? <span className="sm:col-span-2">情况：{r.currentSituation}</span> : null}
                {r.requestDetail ? <span className="sm:col-span-2">需求：{r.requestDetail}</span> : null}
              </div>
              <input
                defaultValue={r.adminNote}
                placeholder="管理员备注（回车保存）"
                onKeyDown={(e) => { if (e.key === "Enter") upd.mutate({ id: r.id, body: { adminNote: (e.target as HTMLInputElement).value } }); }}
                className="mt-2 h-8 w-full rounded-kx-sm border border-kx-stroke/60 bg-kx-soft/30 px-2 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
