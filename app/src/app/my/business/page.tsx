"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileUp,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  Store,
  TicketPercent,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api, APIError, isAuthRequiredError, type UploadedFile } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading, SectionLoading } from "@/components/design/States";
import { MerchantLeadsPanel, MerchantListingsPanel, MerchantReviewsPanel } from "@/components/listings/MerchantConsole";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { countryDisplayName, REGION_COUNTRIES } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";
import type { KXBusinessDashboard, KXBusinessProfile } from "@/lib/types";

const CONSOLE_TABS = [
  { key: "application", label: "认证资料" },
  { key: "listings", label: "服务管理" },
  { key: "leads", label: "线索与预订" },
  { key: "reviews", label: "点评管理" },
] as const;

type ConsoleTab = (typeof CONSOLE_TABS)[number]["key"];

const BUSINESS_TYPES = [
  "餐厅",
  "旅行票务",
  "接送交通",
  "翻译手续",
  "搬家清洁",
  "生活开通",
  "美容健康",
];

const SERVICE_CATEGORIES = [
  "餐厅美食",
  "中华料理",
  "日本料理",
  "居酒屋",
  "烧肉火锅",
  "拉面",
  "寿司海鲜",
  "咖啡甜品",
  "西餐",
  "韩国料理",
  "优惠预约",
  "景点门票",
  "一日游",
  "本地向导",
  "机场接送",
  "车站接送",
  "包车",
  "行李协助",
  "材料翻译",
  "市役所陪同",
  "银行卡协助",
  "手机卡协助",
  "租房申请协助",
  "签证材料整理",
  "搬家",
  "退房清洁",
  "粗大垃圾协助",
  "行李搬运",
  "家具家电配送协助",
  "手机卡开通",
  "网络开通",
  "水电煤协助",
  "地址登记协助",
  "粗大垃圾预约",
  "生活跑腿",
  "美容美发",
  "美甲",
  "按摩",
  "皮肤管理",
  "体检/牙科预约协助",
];

function blankForm() {
  return {
    business_name: "",
    business_type: "生活开通",
    legal_name: "",
    representative_name: "",
    registration_number: "",
    country_code: "jp",
    city_slug: "tokyo",
    phone: "",
    email: "",
    website: "",
    address: "",
    postal_code: "",
    contact_method: "",
    description: "",
    application_note: "",
    service_categories: ["生活开通"],
    service_cities: ["tokyo"],
  };
}

type BusinessFormState = ReturnType<typeof blankForm>;

/** Locked, read-only view of an approved merchant profile (no editing). */
function VerifiedApplication({
  form,
  documents,
}: {
  form: BusinessFormState;
  documents: Array<{ id?: string; documentId?: string; documentType?: string }>;
}) {
  const rows: Array<[string, string]> = [
    ["商家/品牌名称", form.business_name],
    ["商家类型", form.business_type],
    ["主体全称", form.legal_name],
    ["负责人姓名", form.representative_name],
    ["登记号 / 许可编号", form.registration_number],
    ["服务城市", `${form.country_code} / ${form.city_slug}`],
    ["电话或 WhatsApp/Line", form.phone],
    ["联系邮箱", form.email],
    ["官网 / 社媒", form.website],
    ["经营地址", form.address],
    ["公开联系方式", form.contact_method],
  ];
  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4">
        <BadgeCheck className="h-6 w-6 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-black text-emerald-800">已通过认证</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            你的商家已在 Web 与 iOS 显示为认证商家。主体资料已锁定；如需修改主体信息或更新认证材料，请联系平台客服。
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
            <p className="text-[11px] font-bold text-slate-400">{k}</p>
            <p className="mt-0.5 text-sm font-black text-slate-800">{v || "—"}</p>
          </div>
        ))}
      </div>
      {form.service_categories.length ? (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-400">服务分类</p>
          <div className="flex flex-wrap gap-2">
            {form.service_categories.map((c) => (
              <span key={c} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{c}</span>
            ))}
          </div>
        </div>
      ) : null}
      {form.description ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
          <p className="text-[11px] font-bold text-slate-400">服务介绍</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-700">{form.description}</p>
        </div>
      ) : null}
      {documents.length ? (
        <div>
          <p className="mb-2 text-[11px] font-bold text-slate-400">认证材料（已锁定）</p>
          <div className="grid gap-2">
            {documents.map((doc) => (
              <div key={doc.documentId || doc.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
                <FileCheck2 className="h-5 w-5 text-emerald-600" />
                <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{doc.documentType || "认证材料"}</p>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">已加密</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MyBusinessPage() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { locale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<BusinessFormState>(blankForm);
  const [draftFileIds, setDraftFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<ConsoleTab>("application");

  const profile = useQuery({
    queryKey: ["business-profile"],
    queryFn: () => api.businessProfile(),
    enabled: !!user,
  });
  const dashboard = useQuery({
    queryKey: ["business-dashboard"],
    queryFn: () => api.businessDashboard(),
    enabled: !!user,
  });

  const business = profile.data?.business || dashboard.data?.business || null;
  const status = business?.verification_status || "not_started";
  useEffect(() => {
    if (!business) return;
    setForm({
      ...blankForm(),
      business_name: business.business_name || "",
      business_type: business.business_type || "生活开通",
      legal_name: business.legal_name || "",
      representative_name: business.representative_name || "",
      registration_number: business.registration_number || "",
      country_code: business.country_code || "jp",
      city_slug: business.city_slug || "tokyo",
      phone: business.phone || "",
      email: business.email || "",
      website: business.website || "",
      address: business.address || "",
      postal_code: business.postal_code || "",
      contact_method: business.contact_method || "",
      description: business.description || "",
      application_note: business.application_note || "",
      service_categories: business.service_categories?.length ? business.service_categories : ["生活开通"],
      service_cities: business.service_cities?.length ? business.service_cities : [business.city_slug || "tokyo"],
    });
  }, [business]);

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      api.saveBusinessApplication({
        ...form,
        serviceCategories: form.service_categories,
        serviceCities: form.service_cities,
        uploadedFileIds: draftFileIds,
        submit,
      }),
    onSuccess: (res, submit) => {
      if (res.user) setUser(res.user);
      setDraftFileIds([]);
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      queryClient.invalidateQueries({ queryKey: ["business-dashboard"] });
      pushToast({ kind: "success", message: submit ? "商家认证申请已提交，后台会人工审核。" : "商家资料已保存。" });
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("generic");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) => api.deleteBusinessDocument(documentId),
    onSuccess: (res) => {
      if (res.user) setUser(res.user);
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      queryClient.invalidateQueries({ queryKey: ["business-dashboard"] });
      pushToast({ kind: "success", message: "认证材料已撤回。" });
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("generic");
      else pushToast({ kind: "error", message: (e as APIError).message || "撤回认证材料失败" });
    },
  });

  const uploadDocuments = async (files: FileList | null) => {
    if (!business?.id) {
      pushToast({ kind: "error", message: "请先保存商家资料，生成申请档案后再上传认证材料。" });
      return;
    }
    const picked = Array.from(files || []).slice(0, 10);
    if (!picked.length) return;
    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of picked) {
        const result = await api.uploadFile(file, {
          purpose: "business_verification_file",
          entityType: "business",
          entityId: business.id,
        });
        uploaded.push(result.file);
      }
      const ids = uploaded.map((file) => file.id);
      setDraftFileIds((current) => [...current, ...ids]);
      await api.saveBusinessApplication({ ...form, uploadedFileIds: ids, submit: false });
      queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      pushToast({ kind: "success", message: `已上传 ${ids.length} 份认证材料。` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message || "材料上传失败，请重试。" });
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <AppShell wide right={null}>
        <InlineLoading />
      </AppShell>
    );
  }

  return (
    <AppShell wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href="/my/features" className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-sm">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-950">商家服务后台</h1>
            <p className="truncate text-xs font-semibold text-slate-500">认证申请、经营数据、发布入口和线索管理</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <BusinessHero business={business} status={status} />

          <nav className="flex gap-1.5 overflow-x-auto rounded-full border border-slate-200/70 bg-white p-1.5 shadow-sm">
            {CONSOLE_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                data-active={tab === item.key}
                className="h-10 shrink-0 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-black text-slate-500 transition data-[active=true]:bg-slate-950 data-[active=true]:text-white hover:text-slate-900 data-[active=true]:hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "listings" ? <MerchantListingsPanel /> : null}
          {tab === "leads" ? <MerchantLeadsPanel /> : null}
          {tab === "reviews" ? <MerchantReviewsPanel /> : null}

          {tab === "application" && profile.isLoading ? <SectionLoading title="正在加载商家资料" rows={3} /> : null}
          {tab === "application" && profile.isError ? <ErrorState title="商家资料暂时无法加载" onRetry={() => profile.refetch()} /> : null}

          <section className={tab === "application" ? "rounded-[28px] border border-slate-200/70 bg-white/95 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.5)]" : "hidden"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">认证资料</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">资料会进入总后台审核，通过后 Web 与 iOS 同步显示认证商家。</p>
              </div>
              <StatusPill status={status} />
            </div>

            {status === "verified" ? (
              <VerifiedApplication form={form} documents={business?.documents || []} />
            ) : (
              <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="商家/品牌名称" required>
                <input value={form.business_name} onChange={(e) => setFormValue(setForm, "business_name", e.target.value)} className="kx-input h-11" placeholder="Machi Coffee / 东京接送服务" />
              </Field>
              <Field label="商家类型" required>
                <select value={form.business_type} onChange={(e) => setFormValue(setForm, "business_type", e.target.value)} className="kx-input h-11">
                  {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="主体全称" required>
                <input value={form.legal_name} onChange={(e) => setFormValue(setForm, "legal_name", e.target.value)} className="kx-input h-11" placeholder="株式会社 / 个体事业者 / 法人主体" />
              </Field>
              <Field label="负责人姓名" required>
                <input value={form.representative_name} onChange={(e) => setFormValue(setForm, "representative_name", e.target.value)} className="kx-input h-11" placeholder="负责人或联系人" />
              </Field>
              <Field label="登记号 / 许可编号">
                <input value={form.registration_number} onChange={(e) => setFormValue(setForm, "registration_number", e.target.value)} className="kx-input h-11" placeholder="法人番号、营业执照编号、许可编号" />
              </Field>
              <Field label="服务城市" required>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <select value={form.country_code} onChange={(e) => setFormValue(setForm, "country_code", e.target.value)} className="kx-input h-11">
                    {REGION_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.emoji} {countryDisplayName(country, locale)}</option>)}
                  </select>
                  <input value={form.city_slug} onChange={(e) => setFormValue(setForm, "city_slug", e.target.value.toLowerCase())} className="kx-input h-11" placeholder="tokyo / osaka / los-angeles" />
                </div>
              </Field>
              <Field label="电话或 WhatsApp/Line" required>
                <input value={form.phone} onChange={(e) => setFormValue(setForm, "phone", e.target.value)} className="kx-input h-11" placeholder="+81 90..." />
              </Field>
              <Field label="联系邮箱">
                <input value={form.email} onChange={(e) => setFormValue(setForm, "email", e.target.value)} className="kx-input h-11" placeholder="business@example.com" />
              </Field>
              <Field label="官网 / 社媒">
                <input value={form.website} onChange={(e) => setFormValue(setForm, "website", e.target.value)} className="kx-input h-11" placeholder="https://..." />
              </Field>
              <Field label="经营地址" required>
                <input value={form.address} onChange={(e) => setFormValue(setForm, "address", e.target.value)} className="kx-input h-11" placeholder="东京都新宿区..." />
              </Field>
              <Field label="邮编">
                <input value={form.postal_code} onChange={(e) => setFormValue(setForm, "postal_code", e.target.value)} className="kx-input h-11" placeholder="160-0022" />
              </Field>
              <Field label="公开联系方式">
                <input value={form.contact_method} onChange={(e) => setFormValue(setForm, "contact_method", e.target.value)} className="kx-input h-11" placeholder="站内信 / 电话 / Line / 官网表单" />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="服务分类" required>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleListValue(setForm, "service_categories", category)}
                      data-active={form.service_categories.includes(category)}
                      className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:border-blue-300 data-[active=true]:border-blue-600 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-4 grid gap-4">
              <Field label="服务介绍" required>
                <textarea value={form.description} onChange={(e) => setFormValue(setForm, "description", e.target.value)} className="kx-input min-h-28 py-3" placeholder="介绍服务范围、价格区间、服务语言、预约方式、退款/取消规则等。" />
              </Field>
              <Field label="申请备注">
                <textarea value={form.application_note} onChange={(e) => setFormValue(setForm, "application_note", e.target.value)} className="kx-input min-h-20 py-3" placeholder="补充资质、门店照片、平台链接、过往案例等。" />
              </Field>
            </div>

            <div className="mt-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">认证材料</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">支持 PDF 或图片：营业执照、法人登记、许可证明、负责人身份证明等。材料为私密文件，仅本人和后台可查看。</p>
                </div>
                <button
                  type="button"
                  disabled={!business?.id || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FileUp className="h-4 w-4" />
                  {uploading ? "上传中..." : business?.id ? "上传材料" : "先保存资料"}
                </button>
                <input ref={fileInputRef} hidden type="file" multiple accept="application/pdf,image/*" onChange={(e) => { void uploadDocuments(e.currentTarget.files); e.currentTarget.value = ""; }} />
              </div>
              <div className="mt-3 grid gap-2">
                {(business?.documents || []).map((doc) => (
                  <div key={doc.documentId || doc.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
                    <FileCheck2 className="h-5 w-5 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-800">{doc.documentType || "认证材料"}</p>
                      <p className="text-xs font-semibold text-slate-500">{formatBytes(doc.fileSize || 0)} · {doc.status || doc.documentStatus || "ready"}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">已加密</span>
                    <button
                      type="button"
                      disabled={!doc.documentId || deleteDocument.isPending}
                      onClick={() => {
                        if (!doc.documentId) return;
                        if (window.confirm("确认撤回这份认证材料？撤回后如材料不足，申请会回到草稿或复核状态。")) {
                          deleteDocument.mutate(doc.documentId);
                        }
                      }}
                      className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="撤回认证材料"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!business?.documents?.length ? <p className="text-xs font-semibold text-slate-500">保存资料后即可上传材料；正式提交审核时至少需要 1 份材料。</p> : null}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save.mutate(false)}
                disabled={save.isPending || uploading}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm disabled:opacity-50"
              >
                <Building2 className="h-4 w-4" />
                保存资料
              </button>
              <button
                type="button"
                onClick={() => save.mutate(true)}
                disabled={save.isPending || uploading}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-black text-white shadow-[0_16px_34px_-22px_rgba(37,99,235,0.95)] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                提交认证审核
              </button>
            </div>
              </>
            )}
          </section>
        </section>

        <aside className="space-y-4">
          <DashboardCard dashboard={dashboard.data || null} business={business} loading={dashboard.isLoading} />
          <section className="rounded-[24px] border border-slate-200/70 bg-white p-4">
            <h3 className="text-sm font-black text-slate-950">认证后可以做什么</h3>
            <div className="mt-3 grid gap-2">
              <ActionLink href="/listings/create?type=local_service" icon={BriefcaseBusiness} title="发布服务" subtitle="餐饮、住宿、旅行、接送、手续、生活" />
              <ActionLink href="/listings/create?type=discount" icon={TicketPercent} title="发布优惠" subtitle="到店折扣、套餐、体验券" />
              <ActionLink href="/my/inquiries?role=received" icon={MessageSquare} title="管理线索" subtitle="咨询、预约、报名和看房" />
              <ActionLink href="/cities/tokyo/services" icon={Store} title="查看商家与服务" subtitle="用户侧入口预览" />
            </div>
          </section>
          <section className="rounded-[24px] border border-amber-200/70 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">审核标准</p>
                <p className="mt-1 font-semibold leading-6">真实主体、明确联系方式、服务范围清晰、无违法高风险服务。涉及住宿、旅行、票务、医疗、法律等类别时需要补充相应许可或资质说明。</p>
              </div>
            </div>
          </section>
        </aside>
      </main>
    </AppShell>
  );
}

function BusinessHero({ business, status }: { business: KXBusinessProfile | null; status: string }) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-slate-200/70 bg-[radial-gradient(circle_at_12%_0%,rgba(37,99,235,0.14),transparent_35%),linear-gradient(135deg,#ffffff,#f8fbff_52%,#f6fff9)] p-5 shadow-[0_20px_70px_-48px_rgba(15,23,42,0.68)]">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-[24px] bg-slate-950 text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.9)]">
          <Store className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-slate-950">{business?.business_name || "申请认证商家服务"}</h1>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            商家与服务覆盖餐厅、在线订座、优惠、景点票务、接送交通、翻译手续和本地支持。完成认证后，你可以在城市入口内发布服务、优惠和活动，并从工作台管理订座、预约与线索。
          </p>
        </div>
      </div>
    </section>
  );
}

function DashboardCard({ dashboard, business, loading }: { dashboard: KXBusinessDashboard | null; business: KXBusinessProfile | null; loading: boolean }) {
  if (loading) return <SectionLoading title="正在加载经营数据" rows={3} />;
  const metrics = dashboard?.metrics || { listings: 0, published: 0, inquiries: 0, new_inquiries: 0, favorites: 0, views: 0 };
  return (
    <section className="rounded-[24px] border border-slate-200/70 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-slate-950">经营看板</h3>
        {business?.verification_status === "verified" ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <BarChart3 className="h-5 w-5 text-blue-600" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric icon={Store} title="全部发布" value={metrics.listings} />
        <Metric icon={CheckCircle2} title="展示中" value={metrics.published} />
        <Metric icon={MessageSquare} title="全部线索" value={metrics.inquiries} />
        <Metric icon={Sparkles} title="新增线索" value={metrics.new_inquiries} />
        <Metric icon={BadgeCheck} title="收藏" value={metrics.favorites} />
        <Metric icon={BarChart3} title="浏览" value={metrics.views} />
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-400">最近线索</p>
        {dashboard?.recent_inquiries?.length ? (
          <div className="mt-2 space-y-2">
            {dashboard.recent_inquiries.slice(0, 3).map((item) => (
              <div key={item.id} className="text-xs font-semibold text-slate-600">
                {item.type || "咨询"} · {item.status || "new"}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs font-semibold text-slate-500">认证通过并发布服务后，咨询、预约和报名会显示在这里。</p>
        )}
      </div>
    </section>
  );
}

function Metric({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-blue-600" />
      <p className="mt-2 text-[11px] font-black text-slate-400">{title}</p>
      <p className="text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function ActionLink({ href, icon: Icon, title, subtitle }: { href: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 transition hover:border-blue-200 hover:bg-blue-50/60">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-blue-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-950">{title}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{subtitle}</span>
      </span>
    </Link>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-500">{label}{required ? <span className="text-rose-500"> *</span> : null}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    needs_review: "bg-blue-50 text-blue-700 ring-blue-200",
    rejected: "bg-rose-50 text-rose-700 ring-rose-200",
    suspended: "bg-slate-100 text-slate-700 ring-slate-200",
    draft: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-black ring-1 ${map[status] || "bg-slate-100 text-slate-700 ring-slate-200"}`}>
      {businessStatusLabel(status)}
    </span>
  );
}

function businessStatusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: "未申请",
    draft: "草稿",
    pending: "审核中",
    needs_review: "需补充材料",
    verified: "已认证",
    rejected: "未通过",
    suspended: "已暂停",
  };
  return map[status] || status;
}

function setFormValue(setForm: React.Dispatch<React.SetStateAction<BusinessFormState>>, key: keyof BusinessFormState, value: string) {
  setForm((current) => ({ ...current, [key]: value }));
}

function toggleListValue(
  setForm: React.Dispatch<React.SetStateAction<BusinessFormState>>,
  key: "service_categories" | "service_cities",
  value: string,
) {
  setForm((current) => {
    const exists = current[key].includes(value);
    const next = exists ? current[key].filter((item) => item !== value) : [...current[key], value];
    return { ...current, [key]: next.length ? next : [value] };
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return "文件";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
