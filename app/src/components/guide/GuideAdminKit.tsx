"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileInput,
  GraduationCap,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
  Building2,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { APIError, apiBase, readToken } from "@/lib/api";
import {
  adminGuide,
  guideCityLabel,
  type GuideAdminPaged,
  type GuideCompany,
  type GuideSchool,
} from "@/lib/guide";
import { useSession, useToasts } from "@/lib/store";

type LibraryKind = "schools" | "companies";
type AdminRow = Record<string, unknown> & { id?: string; slug?: string; status?: string; verificationStatus?: string };
type AdminDetail = { status: string; school?: GuideSchool; company?: GuideCompany };

const GUIDE_ADMIN_LINKS = [
  { href: "/admin/pricing", label: "价格管理" },
  { href: "/admin/guide/products", label: "商城商品" },
  { href: "/admin/guide/member-resources", label: "会员资料" },
  { href: "/admin/guide/orders", label: "订单" },
  { href: "/admin/guide/service-requests", label: "服务预约" },
  { href: "/admin/guide/schools", label: "学校库" },
  { href: "/admin/guide/schools/import", label: "学校导入" },
  { href: "/admin/guide/companies", label: "公司库" },
  { href: "/admin/guide/companies/import", label: "公司导入" },
  { href: "/admin/guide/school-programs", label: "学校项目" },
  { href: "/admin/guide/school-admissions", label: "申请信息" },
  { href: "/admin/guide/company-positions", label: "岗位" },
  { href: "/admin/guide/interview-reviews", label: "面试审核" },
  { href: "/admin/guide/company-reviews", label: "工作评论" },
  { href: "/admin/guide/corrections", label: "纠错" },
];

const SCHOOL_FIELDS = [
  "schoolName", "schoolNameJp", "schoolNameEn", "schoolType", "country", "prefecture", "city", "ward",
  "address", "postalCode", "website", "admissionUrl", "internationalAdmissionUrl", "applicationUrl",
  "scholarshipUrl", "careerSupportUrl", "languageSupportUrl", "dormitoryUrl", "description",
  "shortDescription", "fieldsOfStudy", "departments", "faculties", "graduateSchools",
  "isAcceptingInternationalStudents", "hasEnglishProgram", "hasJapaneseProgram", "hasScholarship",
  "hasDormitory", "hasCareerSupport", "hasLanguageSupport", "sourceName", "sourceUrl",
  "sourceLastCheckedAt", "verificationStatus", "dataQualityScore", "isFeatured", "status",
];

const COMPANY_FIELDS = [
  "corporateNumber", "companyName", "companyNameJp", "companyNameEn", "industry", "subIndustry", "country",
  "prefecture", "city", "ward", "address", "postalCode", "website", "careerUrl", "newGraduateUrl",
  "midCareerUrl", "globalCareerUrl", "companySize", "foundedYear", "description", "shortDescription",
  "acceptsForeignApplicants", "supportsWorkVisa", "supportsNewGraduate", "supportsMidCareer",
  "hasEnglishPositions", "hasGlobalRoles", "hasForeignEmployees", "requiredJapaneseLevel",
  "requiredEnglishLevel", "employmentTypes", "sourceName", "sourceUrl", "sourceLastCheckedAt",
  "verificationStatus", "dataQualityScore", "isFeatured", "status",
];

function valueToText(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (value === null || value === undefined) return "";
  return String(value);
}

function authHeaders(): HeadersInit {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function useAdminGuard() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const loading = status === "loading" || status === "idle";
  const denied = !loading && (!user || user.role !== "admin");
  const login = () => router.replace("/login?redirect=/admin/guide");
  return { user, loading, denied, login };
}

function GuideAdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const guard = useAdminGuard();
  if (guard.loading) {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }
  if (guard.denied) {
    return (
      <AppShell>
        <div className="px-6 py-16 text-center">
          <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-kx-accent" />
          <h1 className="text-xl font-bold text-kx-text">需要管理员权限</h1>
          <p className="mt-1 text-sm text-kx-muted">请使用管理员账号登录后维护指南资料库。</p>
          <button className="kx-button-primary mt-5" onClick={guard.login}>去登录</button>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <header className="sticky top-0 z-30 border-b border-kx-stroke/60 bg-kx-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-kx-muted hover:text-kx-accent">
              <ArrowLeft className="h-3.5 w-3.5" /> 管理后台
            </Link>
            <h1 className="text-lg font-black text-kx-text">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-xs text-kx-muted">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GUIDE_ADMIN_LINKS.slice(0, 4).map((item) => (
              <Link key={item.href} href={item.href} className="rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle hover:text-kx-accent">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {GUIDE_ADMIN_LINKS.slice(4).map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-full border border-kx-stroke/60 px-3 py-1.5 text-xs font-semibold text-kx-muted hover:border-kx-accent/50 hover:text-kx-accent">
              {item.label}
            </Link>
          ))}
        </div>
      </header>
      <main className="px-4 py-4">{children}</main>
    </AppShell>
  );
}

function StatStrip({ stats }: { stats?: Record<string, unknown> }) {
  if (!stats) return null;
  const entries = Object.entries(stats).filter(([, value]) => typeof value !== "object").slice(0, 6);
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-kx-md border border-kx-stroke/60 bg-kx-card px-3 py-2">
          <div className="text-[11px] font-semibold text-kx-muted">{key}</div>
          <div className="mt-1 text-lg font-black text-kx-text">{String(value)}</div>
        </div>
      ))}
    </div>
  );
}

export function GuideAdminHomePage() {
  return (
    <GuideAdminShell title="Machi Guide 管理" subtitle="学校库、公司库、导入、审核与纠错集中维护。">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDE_ADMIN_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4 transition hover:border-kx-accent/50 hover:shadow-kx">
            <ListChecks className="mb-3 h-5 w-5 text-kx-accent" />
            <div className="font-black text-kx-text">{item.label}</div>
            <p className="mt-1 text-xs leading-5 text-kx-muted">进入 {item.label} 的列表、导入或审核流程。</p>
          </Link>
        ))}
      </div>
    </GuideAdminShell>
  );
}

export function GuideAdminListPage({ kind }: { kind: LibraryKind }) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [regionGroup, setRegionGroup] = useState("");
  const [sort, setSort] = useState("data_quality");
  const pushToast = useToasts((s) => s.push);
  const title = kind === "schools" ? "学校库管理" : "公司库管理";
  const Icon = kind === "schools" ? GraduationCap : Building2;

  const params = useMemo(() => ({
    country: "jp",
    keyword: keyword || undefined,
    status: status || undefined,
    regionGroup: regionGroup || undefined,
    sort,
    pageSize: 100,
  }), [keyword, regionGroup, sort, status]);

  const q = useQuery<GuideAdminPaged<AdminRow>>({
    queryKey: ["admin-guide", kind, params],
    queryFn: async () => (
      kind === "schools" ? adminGuide.schools(params) : adminGuide.companies(params)
    ) as unknown as GuideAdminPaged<AdminRow>,
    staleTime: 20_000,
  });

  const exportCsv = async () => {
    const usp = new URLSearchParams();
    Object.entries({ ...params, format: "csv" }).forEach(([k, v]) => {
      if (v !== undefined && v !== "") usp.set(k, String(v));
    });
    try {
      const res = await fetch(`${apiBase}/api/admin/guide/${kind}?${usp.toString()}`, {
        headers: authHeaders(),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guide-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ kind: "success", message: "CSV 已生成" });
    } catch (error) {
      pushToast({ kind: "error", message: error instanceof Error ? error.message : "导出失败" });
    }
  };

  const rows = q.data?.items ?? [];
  return (
    <GuideAdminShell title={title} subtitle="支持搜索、筛选、导出 CSV、进入编辑页；低质量资料可隐藏或标记待核验。">
      <section className="mb-3 rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 text-kx-accent" />
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/50 px-3 py-2">
            <Search className="h-4 w-4 text-kx-muted" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="搜索名称、官网、来源" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <select className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="published">published</option>
            <option value="needs_review">needs_review</option>
            <option value="hidden">hidden</option>
            <option value="draft">draft</option>
          </select>
          <select className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)}>
            <option value="">全部地区</option>
            <option value="capital_area">首都圈</option>
            <option value="kansai_area">关西圈</option>
          </select>
          <select className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="data_quality">数据完整度</option>
            <option value="updated">最近更新</option>
            <option value="name_jp_asc">日文名</option>
            <option value="oldest">最旧更新</option>
          </select>
          <button className="kx-button-ghost h-10" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /> 刷新</button>
          <button className="kx-button-primary h-10" onClick={exportCsv}><Download className="h-4 w-4" /> 导出</button>
          <Link className="kx-button-primary h-10" href={`/admin/guide/${kind}/import`}><Upload className="h-4 w-4" /> 导入</Link>
        </div>
      </section>

      <StatStrip stats={q.data?.stats} />

      <section className="mt-3 overflow-hidden rounded-kx-lg border border-kx-stroke/60 bg-kx-card">
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="暂无数据" subtitle="请调整筛选或使用批量导入补充资料。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-kx-soft/70 text-left text-xs text-kx-muted">
                <tr>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">地区</th>
                  <th className="px-3 py-2">分类</th>
                  <th className="px-3 py-2">来源</th>
                  <th className="px-3 py-2">核验</th>
                  <th className="px-3 py-2 text-right">完整度</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const name = kind === "schools" ? valueToText(row.schoolName) : valueToText(row.companyName);
                  const jpName = kind === "schools" ? valueToText(row.schoolNameJp) : valueToText(row.companyNameJp);
                  const type = kind === "schools" ? valueToText(row.schoolType) : valueToText(row.industry);
                  const href = `/admin/guide/${kind}/${encodeURIComponent(valueToText(row.id || row.slug))}/edit`;
                  const publicHref = kind === "schools" ? `/guide/schools/${row.slug || row.id}` : `/guide/companies/${row.slug || row.id}`;
                  return (
                    <tr key={valueToText(row.id || row.slug)} className="border-t border-kx-stroke/40">
                      <td className="px-3 py-2">
                        <div className="font-bold text-kx-text">{name}</div>
                        <div className="text-xs text-kx-muted">{jpName || valueToText(row.slug)}</div>
                      </td>
                      <td className="px-3 py-2 text-kx-subtle">{valueToText(row.prefecture)} / {guideCityLabel(valueToText(row.city))}</td>
                      <td className="px-3 py-2 text-kx-subtle">{type || "待补充"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-kx-muted">{valueToText(row.sourceUrl) || "来源待补充"}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-kx-soft px-2 py-1 text-xs font-semibold text-kx-subtle">{valueToText(row.verificationStatus) || "需复核"}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold">{valueToText(row.dataQualityScore) || "0"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Link className="rounded-full bg-kx-soft p-2 text-kx-muted hover:text-kx-accent" href={publicHref} target="_blank" aria-label="前台查看"><ExternalLink className="h-4 w-4" /></Link>
                          <Link className="rounded-full bg-kx-accentSoft p-2 text-kx-accent" href={href} aria-label="编辑"><Pencil className="h-4 w-4" /></Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </GuideAdminShell>
  );
}

export function GuideAdminImportPage({ kind }: { kind: LibraryKind }) {
  const pushToast = useToasts((s) => s.push);
  const [mode, setMode] = useState<"json" | "csv">("csv");
  const [content, setContent] = useState("");
  const [single, setSingle] = useState<Record<string, string>>(
    kind === "schools"
      ? { schoolName: "", schoolNameJp: "", schoolType: "university", country: "jp", prefecture: "tokyo", city: "tokyo", website: "", sourceUrl: "", sourceName: "admin_import", status: "needs_review" }
      : { companyName: "", companyNameJp: "", industry: "it_internet", country: "jp", prefecture: "tokyo", city: "tokyo", website: "", careerUrl: "", sourceUrl: "", sourceName: "admin_import", status: "needs_review" }
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "json") {
        const parsed = JSON.parse(content || "[]") as Record<string, unknown>[];
        return kind === "schools" ? adminGuide.importSchools({ items: parsed }) : adminGuide.importCompanies({ items: parsed });
      }
      return kind === "schools" ? adminGuide.importSchools({ csv: content }) : adminGuide.importCompanies({ csv: content });
    },
    onSuccess: (data) => pushToast({ kind: "success", message: `导入完成：${data.created.length} 条，错误 ${data.errors.length} 条` }),
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "导入失败" }),
  });
  const create = useMutation({
    mutationFn: () => kind === "schools" ? adminGuide.createSchool(single) : adminGuide.createCompany(single),
    onSuccess: (data) => pushToast({ kind: "success", message: `已创建：${data.slug}` }),
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "创建失败" }),
  });
  const fields = kind === "schools"
    ? ["schoolName", "schoolNameJp", "schoolType", "prefecture", "city", "website", "sourceUrl", "status"]
    : ["companyName", "companyNameJp", "industry", "prefecture", "city", "website", "careerUrl", "sourceUrl", "status"];
  return (
    <GuideAdminShell title={kind === "schools" ? "学校批量导入" : "公司批量导入"} subtitle="支持 CSV / JSON；导入默认 needs_review，并按来源、官网、名称和地区去重。">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileInput className="h-5 w-5 text-kx-accent" />
            <h2 className="font-black">批量导入</h2>
            <select className="ml-auto h-9 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "json" | "csv")}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <textarea
            className="min-h-[360px] w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 p-3 font-mono text-xs outline-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={mode === "csv" ? "粘贴 CSV，第一行为字段名" : "粘贴 JSON 数组"}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="kx-button-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !content.trim()}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} 开始导入
            </button>
            {mutation.data?.errors.length ? (
              <span className="text-xs text-kx-danger">错误：{mutation.data.errors.slice(0, 3).join(" / ")}</span>
            ) : null}
          </div>
        </section>
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <h2 className="mb-3 font-black">手动创建单条</h2>
          <div className="grid gap-2">
            {fields.map((field) => (
              <label key={field} className="grid gap-1 text-xs font-semibold text-kx-muted">
                {field}
                <input className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none" value={single[field] || ""} onChange={(e) => setSingle((s) => ({ ...s, [field]: e.target.value }))} />
              </label>
            ))}
          </div>
          <button className="kx-button-primary mt-3" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 创建
          </button>
        </section>
      </div>
    </GuideAdminShell>
  );
}

export function GuideAdminEditPage({ kind }: { kind: LibraryKind }) {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const q = useQuery<AdminDetail>({
    queryKey: ["admin-guide-detail", kind, id],
    queryFn: async () => (
      kind === "schools" ? adminGuide.school(id) : adminGuide.company(id)
    ) as unknown as AdminDetail,
    enabled: !!id,
  });
  const source = kind === "schools" ? q.data?.school : q.data?.company;
  const [form, setForm] = useState<Record<string, string>>({});
  const fields = kind === "schools" ? SCHOOL_FIELDS : COMPANY_FIELDS;

  useEffect(() => {
    if (!source) return;
    const next: Record<string, string> = {};
    fields.forEach((field) => { next[field] = valueToText((source as unknown as AdminRow)[field]); });
    setForm(next);
  }, [fields, id, source]);

  const save = useMutation({
    mutationFn: () => kind === "schools" ? adminGuide.updateSchool(id, form) : adminGuide.updateCompany(id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-guide-detail", kind, id] });
      pushToast({ kind: "success", message: "已保存" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof APIError ? error.message : "保存失败" }),
  });

  return (
    <GuideAdminShell title={kind === "schools" ? "编辑学校" : "编辑公司"} subtitle="字段缺失可保留待补充或空值；保存时后端会重新计算 data_quality_score。">
      {q.isLoading ? <InlineLoading /> : q.isError || !source ? <ErrorState onRetry={() => q.refetch()} /> : (
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-kx-text">{kind === "schools" ? (source as GuideSchool).schoolName : (source as GuideCompany).companyName}</h2>
              <p className="text-xs text-kx-muted">{valueToText((source as unknown as AdminRow).sourceUrl) || "来源链接待补充"}</p>
            </div>
            <button className="kx-button-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fields.map((field) => {
              const long = ["description", "shortDescription"].includes(field);
              return (
                <label key={field} className={long ? "grid gap-1 text-xs font-semibold text-kx-muted md:col-span-2 xl:col-span-3" : "grid gap-1 text-xs font-semibold text-kx-muted"}>
                  {field}
                  {long ? (
                    <textarea className="min-h-[110px] rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 py-2 text-sm text-kx-text outline-none" value={form[field] || ""} onChange={(e) => setForm((s) => ({ ...s, [field]: e.target.value }))} />
                  ) : (
                    <input className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none" value={form[field] || ""} onChange={(e) => setForm((s) => ({ ...s, [field]: e.target.value }))} />
                  )}
                </label>
              );
            })}
          </div>
        </section>
      )}
    </GuideAdminShell>
  );
}

export function GuideAdminResourcePage({ resource }: { resource: "school-programs" | "school-admissions" | "company-positions" }) {
  const q = useQuery<GuideAdminPaged<AdminRow>>({
    queryKey: ["admin-guide-resource", resource],
    queryFn: async () => {
      if (resource === "school-programs") return adminGuide.schoolPrograms() as unknown as GuideAdminPaged<AdminRow>;
      if (resource === "school-admissions") return adminGuide.schoolAdmissions() as unknown as GuideAdminPaged<AdminRow>;
      return adminGuide.companyPositions() as unknown as GuideAdminPaged<AdminRow>;
    },
  });
  const title = resource === "school-programs" ? "学校项目维护" : resource === "school-admissions" ? "申请信息维护" : "公司岗位维护";
  const items = q.data?.items ?? [];
  return (
    <GuideAdminShell title={title} subtitle="展示最近 200 条子表数据；创建和批量维护可通过导入接口或详情页继续补充。">
      <section className="overflow-hidden rounded-kx-lg border border-kx-stroke/60 bg-kx-card">
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : items.length === 0 ? <EmptyState title="暂无数据" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-kx-soft/70 text-left text-xs text-kx-muted">
                <tr><th className="px-3 py-2">标题</th><th className="px-3 py-2">目标</th><th className="px-3 py-2">来源</th><th className="px-3 py-2">核验</th><th className="px-3 py-2">状态</th></tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const titleText = valueToText(row.programName || row.positionTitle || row.admissionType || row.id);
                  return (
                    <tr key={valueToText(row.id)} className="border-t border-kx-stroke/40">
                      <td className="px-3 py-2 font-bold">{titleText}</td>
                      <td className="px-3 py-2 text-kx-muted">{valueToText(row.schoolId || row.companyId)}</td>
                      <td className="max-w-[300px] truncate px-3 py-2 text-kx-muted">{valueToText(row.sourceUrl) || "missing"}</td>
                      <td className="px-3 py-2">{valueToText(row.verificationStatus) || "needs_review"}</td>
                      <td className="px-3 py-2">{valueToText(row.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </GuideAdminShell>
  );
}

export function GuideAdminReviewPage({ kind }: { kind: "interview" | "company" }) {
  const [status, setStatus] = useState("pending_review");
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery<GuideAdminPaged<AdminRow>>({
    queryKey: ["admin-guide-reviews", kind, status],
    queryFn: async () => (
      kind === "interview" ? adminGuide.interviewReviews({ status }) : adminGuide.companyReviews({ status })
    ) as unknown as GuideAdminPaged<AdminRow>,
  });
  const action = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "approve" | "reject" | "hide" }) => adminGuide.reviewAction(kind, id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-guide-reviews", kind] });
      pushToast({ kind: "success", message: "审核状态已更新" });
    },
  });
  const items = q.data?.items ?? [];
  return (
    <GuideAdminShell title={kind === "interview" ? "面试评论审核" : "工作体验评论审核"} subtitle="用户提交默认 pending_review；未审核评论不会在前台展示。">
      <div className="mb-3 flex gap-2">
        {["pending_review", "published", "rejected", "hidden"].map((s) => (
          <button key={s} className={status === s ? "kx-button-primary" : "kx-button-ghost"} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <section className="grid gap-3">
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : items.length === 0 ? <EmptyState title="暂无待处理评论" /> : items.map((row) => {
          return (
            <article key={valueToText(row.id)} className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-black text-kx-text">{valueToText(row.companyName) || valueToText(row.companyId)}</h3>
                  <p className="text-xs text-kx-muted">{valueToText(row.position)} · {valueToText(row.employmentType)} · {valueToText(row.createdAt)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button className="rounded-full bg-emerald-500/10 p-2 text-emerald-600" onClick={() => action.mutate({ id: valueToText(row.id), next: "approve" })}><CheckCircle2 className="h-4 w-4" /></button>
                  <button className="rounded-full bg-kx-soft p-2 text-kx-muted" onClick={() => action.mutate({ id: valueToText(row.id), next: "hide" })}><XCircle className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-kx-subtle">{valueToText(row.questions || row.processDescription || row.pros || row.cons || row.tips) || "无正文"}</p>
            </article>
          );
        })}
      </section>
    </GuideAdminShell>
  );
}

export function GuideAdminCorrectionsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-guide-corrections"], queryFn: () => adminGuide.corrections({ status: "pending" }) });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "reviewed" | "applied" | "rejected" }) => adminGuide.updateCorrection(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-guide-corrections"] });
      pushToast({ kind: "success", message: "纠错状态已更新" });
    },
  });
  const items = (q.data?.items ?? []) as AdminRow[];
  return (
    <GuideAdminShell title="纠错与补充审核" subtitle="学校、公司、项目、申请和岗位的用户补充信息统一进入这里。">
      <section className="grid gap-3">
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : items.length === 0 ? <EmptyState title="暂无待处理纠错" /> : items.map((item) => (
          <article key={valueToText(item.id)} className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-black text-kx-text">{valueToText(item.targetType)} / {valueToText(item.targetId)}</h3>
                <p className="text-xs text-kx-muted">{valueToText(item.fieldName)} · {valueToText(item.sourceUrl)}</p>
              </div>
              <div className="flex gap-1.5">
                <button className="kx-button-ghost" onClick={() => update.mutate({ id: valueToText(item.id), status: "reviewed" })}>已看</button>
                <button className="kx-button-primary" onClick={() => update.mutate({ id: valueToText(item.id), status: "applied" })}>已应用</button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-kx-subtle">{valueToText(item.message) || valueToText(item.suggestedValue)}</p>
          </article>
        ))}
      </section>
    </GuideAdminShell>
  );
}
