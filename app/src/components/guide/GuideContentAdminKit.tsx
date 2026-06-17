"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FilePenLine,
  HelpCircle,
  Home,
  Layers3,
  Loader2,
  Plus,
  Save,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { GuideAdminShell } from "@/components/guide/GuideAdminKit";
import {
  adminGuide,
  type GuideArticle,
  type GuideCategory,
} from "@/lib/guide";
import { useToasts } from "@/lib/store";

type ContentKind = "categories" | "tags" | "topics" | "faq" | "home-modules";
type ContentRow = Record<string, unknown> & { id?: string; key?: string; slug?: string; moduleKey?: string; title?: string; name?: string; question?: string; status?: string; isActive?: boolean };

type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "checkbox";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  required?: boolean;
};

const STATUS_OPTIONS = [
  { value: "published", label: "published" },
  { value: "draft", label: "draft" },
  { value: "hidden", label: "hidden" },
  { value: "archived", label: "archived" },
];

function cleanList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function rowTitle(row: ContentRow): string {
  return String(row.title || row.name || row.question || row.moduleKey || row.key || row.slug || row.id || "未命名");
}

function rowIdentifier(row: ContentRow): string {
  return String(row.id || row.key || row.slug || row.moduleKey || "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}

function StatusBadge({ status, active }: { status?: string; active?: boolean }) {
  const text = status || (active === false ? "inactive" : "active");
  const muted = text === "draft" || text === "hidden" || text === "archived" || text === "inactive";
  return (
    <span className={["rounded-full px-2 py-0.5 text-[11px] font-black", muted ? "bg-kx-soft text-kx-muted" : "bg-emerald-50 text-emerald-700"].join(" ")}>
      {text}
    </span>
  );
}

function TextField({ field, value, onChange }: { field: FieldConfig; value: string | boolean; onChange: (value: string | boolean) => void }) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/40 px-3 py-2 text-sm font-semibold text-kx-text">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-black text-kx-muted">{field.label}</span>
        <select
          className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-black text-kx-muted">{field.label}</span>
        <textarea
          className="min-h-[96px] w-full rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 py-2 text-sm outline-none focus:border-kx-accent"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 4}
          required={field.required}
        />
      </label>
    );
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-kx-muted">{field.label}</span>
      <input
        className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
      />
    </label>
  );
}

function categoryOptions(categories: GuideCategory[], includeBlank = true) {
  const top = categories.filter((c) => !c.parentKey);
  const options = includeBlank ? [{ value: "", label: "不绑定分类" }] : [];
  top.forEach((parent) => {
    options.push({ value: parent.key, label: parent.title || parent.key });
    categories
      .filter((child) => child.parentKey === parent.key)
      .forEach((child) => options.push({ value: child.key, label: `- ${child.title || child.key}` }));
  });
  return options;
}

const COLLECTION_META: Record<ContentKind, { title: string; subtitle: string; icon: typeof BookOpen }> = {
  categories: { title: "指南分类管理", subtitle: "维护六大入口、子分类、图标、颜色、SEO 与前台排序。", icon: Layers3 },
  tags: { title: "指南标签管理", subtitle: "维护文章与专题可复用标签，避免标签随意重复。", icon: Tags },
  topics: { title: "指南专题管理", subtitle: "把文章、商品和服务组合成可运营的专题入口。", icon: BookOpen },
  faq: { title: "Guide FAQ 管理", subtitle: "维护指南首页和分类页常见问题。", icon: HelpCircle },
  "home-modules": { title: "Guide 首页模块", subtitle: "控制首页模块开关、标题、文案和 JSON 配置。", icon: Home },
};

function emptyForm(kind: ContentKind): Record<string, string | boolean> {
  if (kind === "categories") {
    return { key: "", parentKey: "", title: "", subtitle: "", description: "", icon: "BookOpen", color: "#2563EB", seoTitle: "", seoDescription: "", sortOrder: "0", language: "zh-CN", isActive: true };
  }
  if (kind === "tags") {
    return { name: "", key: "", categoryKey: "", description: "", sortOrder: "0", language: "zh-CN", isActive: true };
  }
  if (kind === "topics") {
    return { title: "", slug: "", categoryKey: "", status: "draft", description: "", coverImage: "", tags: "", articleSlugs: "", productSlugs: "", sortOrder: "0", language: "zh-CN" };
  }
  if (kind === "faq") {
    return { question: "", categoryKey: "", status: "published", answer: "", sortOrder: "0", language: "zh-CN" };
  }
  return { moduleKey: "", title: "", subtitle: "", status: "published", contentJson: "{\n  \n}", sortOrder: "0", language: "zh-CN", isActive: true };
}

function formFromRow(kind: ContentKind, row: ContentRow): Record<string, string | boolean> {
  const form = emptyForm(kind);
  Object.keys(form).forEach((key) => {
    const value = row[key];
    if (typeof form[key] === "boolean") {
      form[key] = Boolean(value);
    } else if (key === "contentJson") {
      form[key] = JSON.stringify((row as { contentJson?: unknown }).contentJson ?? {}, null, 2);
    } else {
      form[key] = listText(value);
    }
  });
  return form;
}

function payloadFromForm(kind: ContentKind, form: Record<string, string | boolean>): Record<string, unknown> {
  const payload: Record<string, unknown> = { country: "jp" };
  Object.entries(form).forEach(([key, value]) => {
    if (key === "sortOrder") payload[key] = Number(value || 0);
    else if (["tags", "articleSlugs", "productSlugs"].includes(key)) payload[key] = cleanList(String(value || ""));
    else payload[key] = value;
  });
  if (kind === "home-modules") {
    payload.contentJson = String(form.contentJson || "{}");
  }
  return payload;
}

function fieldsFor(kind: ContentKind, categories: GuideCategory[]): FieldConfig[] {
  const cats = categoryOptions(categories);
  if (kind === "categories") {
    return [
      { key: "title", label: "分类名称", required: true },
      { key: "key", label: "分类 key", placeholder: "study_japan" },
      { key: "parentKey", label: "父级分类", type: "select", options: cats },
      { key: "subtitle", label: "副标题" },
      { key: "description", label: "分类说明", type: "textarea", rows: 4 },
      { key: "icon", label: "图标名", placeholder: "GraduationCap" },
      { key: "color", label: "颜色", placeholder: "#2563EB" },
      { key: "seoTitle", label: "SEO 标题" },
      { key: "seoDescription", label: "SEO 描述", type: "textarea", rows: 3 },
      { key: "sortOrder", label: "排序" },
      { key: "language", label: "语言" },
      { key: "isActive", label: "启用", type: "checkbox" },
    ];
  }
  if (kind === "tags") {
    return [
      { key: "name", label: "标签名称", required: true },
      { key: "key", label: "标签 key" },
      { key: "categoryKey", label: "绑定分类", type: "select", options: cats },
      { key: "description", label: "标签说明", type: "textarea", rows: 3 },
      { key: "sortOrder", label: "排序" },
      { key: "language", label: "语言" },
      { key: "isActive", label: "启用", type: "checkbox" },
    ];
  }
  if (kind === "topics") {
    return [
      { key: "title", label: "专题标题", required: true },
      { key: "slug", label: "专题 slug" },
      { key: "categoryKey", label: "主分类", type: "select", options: cats },
      { key: "status", label: "状态", type: "select", options: STATUS_OPTIONS },
      { key: "description", label: "专题说明", type: "textarea", rows: 4 },
      { key: "coverImage", label: "封面图 URL" },
      { key: "tags", label: "标签", type: "textarea", rows: 2, placeholder: "每行或逗号分隔" },
      { key: "articleSlugs", label: "关联文章 slug", type: "textarea", rows: 3 },
      { key: "productSlugs", label: "关联商品 slug", type: "textarea", rows: 3 },
      { key: "sortOrder", label: "排序" },
      { key: "language", label: "语言" },
    ];
  }
  if (kind === "faq") {
    return [
      { key: "question", label: "问题", required: true },
      { key: "categoryKey", label: "绑定分类", type: "select", options: cats },
      { key: "status", label: "状态", type: "select", options: STATUS_OPTIONS },
      { key: "answer", label: "答案", type: "textarea", rows: 5 },
      { key: "sortOrder", label: "排序" },
      { key: "language", label: "语言" },
    ];
  }
  return [
    { key: "moduleKey", label: "模块 key", required: true },
    { key: "title", label: "模块标题" },
    { key: "subtitle", label: "副标题" },
    { key: "status", label: "状态", type: "select", options: STATUS_OPTIONS },
    { key: "contentJson", label: "内容 JSON", type: "textarea", rows: 12, placeholder: "{\"title\":\"...\"}" },
    { key: "sortOrder", label: "排序" },
    { key: "language", label: "语言" },
    { key: "isActive", label: "启用", type: "checkbox" },
  ];
}

async function listCollection(kind: ContentKind): Promise<{ items: ContentRow[]; total: number }> {
  if (kind === "categories") {
    const res = await adminGuide.categories();
    return { items: res.items as unknown as ContentRow[], total: res.total };
  }
  if (kind === "tags") {
    const res = await adminGuide.tags();
    return { items: res.items as unknown as ContentRow[], total: res.total };
  }
  if (kind === "topics") {
    const res = await adminGuide.topics();
    return { items: res.items as unknown as ContentRow[], total: res.total };
  }
  if (kind === "faq") {
    const res = await adminGuide.faq();
    return { items: res.items as unknown as ContentRow[], total: res.total };
  }
  const res = await adminGuide.homeModules();
  return { items: res.items as unknown as ContentRow[], total: res.total };
}

async function saveCollection(kind: ContentKind, id: string | null, payload: Record<string, unknown>) {
  if (kind === "categories") return id ? adminGuide.updateCategory(id, payload) : adminGuide.createCategory(payload);
  if (kind === "tags") return id ? adminGuide.updateTag(id, payload) : adminGuide.createTag(payload);
  if (kind === "topics") return id ? adminGuide.updateTopic(id, payload) : adminGuide.createTopic(payload);
  if (kind === "faq") return id ? adminGuide.updateFaq(id, payload) : adminGuide.createFaq(payload);
  return id ? adminGuide.updateHomeModule(id, payload) : adminGuide.createHomeModule(payload);
}

async function deleteCollection(kind: ContentKind, id: string) {
  if (kind === "categories") return adminGuide.deleteCategory(id);
  if (kind === "tags") return adminGuide.deleteTag(id);
  if (kind === "topics") return adminGuide.deleteTopic(id);
  if (kind === "faq") return adminGuide.deleteFaq(id);
  return adminGuide.deleteHomeModule(id);
}

export function GuideCollectionAdminPage({ kind }: { kind: ContentKind }) {
  const meta = COLLECTION_META[kind];
  const Icon = meta.icon;
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [keyword, setKeyword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(() => emptyForm(kind));

  const categories = useQuery({
    queryKey: ["admin-guide", "categories", "flat"],
    queryFn: () => adminGuide.categories(),
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: ["admin-guide", kind],
    queryFn: () => listCollection(kind),
    staleTime: 20_000,
  });
  const fields = useMemo(() => fieldsFor(kind, categories.data?.items ?? []), [categories.data?.items, kind]);
  const rows = useMemo(() => {
    const all = list.data?.items ?? [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return all;
    return all.filter((row) => JSON.stringify(row).toLowerCase().includes(kw));
  }, [keyword, list.data?.items]);

  const save = useMutation({
    mutationFn: () => saveCollection(kind, editingId, payloadFromForm(kind, form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-guide", kind] });
      if (kind === "categories") qc.invalidateQueries({ queryKey: ["admin-guide", "categories", "flat"] });
      setEditingId(null);
      setForm(emptyForm(kind));
      pushToast({ kind: "success", message: "已保存" });
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCollection(kind, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-guide", kind] });
      if (kind === "categories") qc.invalidateQueries({ queryKey: ["admin-guide", "categories", "flat"] });
      pushToast({ kind: "success", message: kind === "faq" ? "已删除" : "已停用/归档" });
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  return (
    <GuideAdminShell title={meta.title} subtitle={meta.subtitle}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Icon className="h-5 w-5 text-kx-accent" />
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/50 px-3 py-2">
              <Search className="h-4 w-4 text-kx-muted" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索标题、key、说明" />
            </div>
            <button
              type="button"
              className="kx-button-primary h-10"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm(kind));
              }}
            >
              <Plus className="h-4 w-4" /> 新建
            </button>
          </div>
          {list.isLoading ? (
            <InlineLoading />
          ) : list.isError ? (
            <ErrorState title="加载失败" subtitle={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="暂无内容" subtitle="可以从右侧新建第一条内容。" />
          ) : (
            <div className="overflow-hidden rounded-kx-md border border-kx-stroke/60">
              {rows.map((row) => {
                const id = rowIdentifier(row);
                const active = row.isActive === undefined ? undefined : Boolean(row.isActive);
                return (
                  <div key={id} className="flex flex-wrap items-center gap-3 border-b border-kx-stroke/60 px-3 py-3 last:border-b-0">
                    <div className="min-w-[220px] flex-1">
                      <button
                        type="button"
                        className="text-left font-black text-kx-text hover:text-kx-accent"
                        onClick={() => {
                          setEditingId(id);
                          setForm(formFromRow(kind, row));
                        }}
                      >
                        {rowTitle(row)}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-kx-muted">
                        <span>{String(row.key || row.slug || row.moduleKey || row.categoryKey || id)}</span>
                        <StatusBadge status={String(row.status || "")} active={active} />
                        {typeof row.articleCount === "number" ? <span>{row.articleCount} 篇文章</span> : null}
                        {typeof row.productCount === "number" ? <span>{row.productCount} 个资料/服务</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-kx-stroke/70 px-3 py-1.5 text-xs font-semibold text-kx-muted hover:border-kx-accent/50 hover:text-kx-accent"
                      onClick={() => {
                        setEditingId(id);
                        setForm(formFromRow(kind, row));
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (window.confirm("确定要移除这条内容吗？")) remove.mutate(id);
                      }}
                    >
                      <Trash2 className="mr-1 inline h-3.5 w-3.5" /> 移除
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-kx-text">{editingId ? "编辑内容" : "新建内容"}</h2>
              <p className="text-xs text-kx-muted">保存后前台 Guide 缓存会自动刷新。</p>
            </div>
            {editingId ? (
              <button type="button" className="text-xs font-semibold text-kx-muted hover:text-kx-accent" onClick={() => { setEditingId(null); setForm(emptyForm(kind)); }}>
                清空
              </button>
            ) : null}
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {fields.map((field) => (
              <TextField
                key={field.key}
                field={field}
                value={form[field.key] ?? ""}
                onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
            <button type="submit" className="kx-button-primary h-10 w-full justify-center" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </button>
          </form>
        </aside>
      </div>
    </GuideAdminShell>
  );
}

type ArticleForm = {
  title: string;
  slug: string;
  status: string;
  categoryKey: string;
  subCategoryKey: string;
  summary: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  coverImage: string;
  tags: string;
  relatedArticleSlugs: string;
  relatedProductSlugs: string;
  authorName: string;
  sortOrder: string;
  isFeatured: boolean;
  isFree: boolean;
  isPaid: boolean;
};

const DEFAULT_ARTICLE_FORM: ArticleForm = {
  title: "",
  slug: "",
  status: "draft",
  categoryKey: "study_japan",
  subCategoryKey: "",
  summary: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
  coverImage: "",
  tags: "",
  relatedArticleSlugs: "",
  relatedProductSlugs: "",
  authorName: "Machi 日本指南编辑部",
  sortOrder: "0",
  isFeatured: false,
  isFree: true,
  isPaid: false,
};

function articleForm(article?: GuideArticle): ArticleForm {
  if (!article) return DEFAULT_ARTICLE_FORM;
  return {
    title: article.title || "",
    slug: article.slug || "",
    status: article.status || "draft",
    categoryKey: article.categoryKey || "study_japan",
    subCategoryKey: article.subCategoryKey || "",
    summary: article.summary || "",
    body: article.body || "",
    seoTitle: article.seoTitle || "",
    seoDescription: article.seoDescription || "",
    coverImage: article.coverImage || "",
    tags: (article.tags || []).join(", "),
    relatedArticleSlugs: (article.relatedArticleSlugs || []).join(", "),
    relatedProductSlugs: (article.relatedProductSlugs || []).join(", "),
    authorName: article.authorName || "Machi 日本指南编辑部",
    sortOrder: String(article.sortOrder ?? 0),
    isFeatured: Boolean(article.isFeatured),
    isFree: Boolean(article.isFree),
    isPaid: Boolean(article.isPaid),
  };
}

function articlePayload(form: ArticleForm): Record<string, unknown> {
  return {
    ...form,
    country: "jp",
    language: "zh-CN",
    sortOrder: Number(form.sortOrder || 0),
    tags: cleanList(form.tags),
    relatedArticleSlugs: cleanList(form.relatedArticleSlugs),
    relatedProductSlugs: cleanList(form.relatedProductSlugs),
  };
}

export function GuideArticlesAdminPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const categories = useQuery({ queryKey: ["admin-guide", "categories", "flat"], queryFn: () => adminGuide.categories(), staleTime: 60_000 });
  const articles = useQuery({
    queryKey: ["admin-guide", "articles", keyword, status, categoryKey],
    queryFn: () => adminGuide.articles({ keyword, status, categoryKey, country: "jp", language: "zh-CN", pageSize: 100 }),
    staleTime: 20_000,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminGuide.deleteArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-guide", "articles"] });
      pushToast({ kind: "success", message: "文章已删除" });
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  return (
    <GuideAdminShell
      title="指南文章管理"
      subtitle="管理 Guide 六大入口里的文章、SEO、标签和关联商品服务。"
    >
      <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BookOpen className="h-5 w-5 text-kx-accent" />
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/50 px-3 py-2">
            <Search className="h-4 w-4 text-kx-muted" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索标题、摘要、标签" />
          </div>
          <select className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            {categoryOptions(categories.data?.items ?? []).map((option) => <option key={option.value || "all"} value={option.value}>{option.value ? option.label : "全部分类"}</option>)}
          </select>
          <Link href="/admin/guide/articles/new" className="kx-button-primary h-10">
            <Plus className="h-4 w-4" /> 新建文章
          </Link>
        </div>
        {articles.isLoading ? (
          <InlineLoading />
        ) : articles.isError ? (
          <ErrorState title="加载失败" subtitle={errorMessage(articles.error)} onRetry={() => articles.refetch()} />
        ) : (articles.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="暂无文章" subtitle="先新建一篇清晰的指南文章，让分类页不再空。" />
        ) : (
          <div className="overflow-hidden rounded-kx-md border border-kx-stroke/60">
            {articles.data!.items.map((article) => (
              <div key={article.id} className="flex flex-wrap items-center gap-3 border-b border-kx-stroke/60 px-3 py-3 last:border-b-0">
                <div className="min-w-[260px] flex-1">
                  <Link href={`/admin/guide/articles/${article.id}/edit`} className="font-black text-kx-text hover:text-kx-accent">
                    {article.title}
                  </Link>
                  <p className="mt-1 line-clamp-1 text-xs text-kx-muted">{article.summary || article.slug}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusBadge status={article.status} />
                    <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-semibold text-kx-muted">{article.categoryKey}</span>
                    {article.subCategoryKey ? <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-semibold text-kx-muted">{article.subCategoryKey}</span> : null}
                    {article.isFeatured ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">featured</span> : null}
                  </div>
                </div>
                <Link href={`/admin/guide/articles/${article.id}/edit`} className="rounded-full border border-kx-stroke/70 px-3 py-1.5 text-xs font-semibold text-kx-muted hover:border-kx-accent/50 hover:text-kx-accent">
                  编辑
                </Link>
                <button
                  type="button"
                  className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (window.confirm("确定删除这篇文章吗？")) remove.mutate(article.id);
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </GuideAdminShell>
  );
}

export function GuideArticleEditPage({ create = false }: { create?: boolean }) {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : String(params?.id || "");
  const router = useRouter();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [form, setForm] = useState<ArticleForm>(DEFAULT_ARTICLE_FORM);
  const categories = useQuery({ queryKey: ["admin-guide", "categories", "flat"], queryFn: () => adminGuide.categories(), staleTime: 60_000 });
  const article = useQuery({
    queryKey: ["admin-guide", "article", id],
    queryFn: () => adminGuide.article(id),
    enabled: !create && Boolean(id),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (article.data?.article) setForm(articleForm(article.data.article));
  }, [article.data?.article]);

  const topCategories = (categories.data?.items ?? []).filter((c) => !c.parentKey);
  const childCategories = (categories.data?.items ?? []).filter((c) => c.parentKey === form.categoryKey);

  const save = useMutation({
    mutationFn: async () => {
      const payload = articlePayload(form);
      return create ? adminGuide.createArticle(payload) : adminGuide.updateArticle(id, payload);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin-guide", "articles"] });
      pushToast({ kind: "success", message: "文章已保存" });
      if (create && "id" in result) router.replace(`/admin/guide/articles/${result.id}/edit`);
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  if (!create && article.isLoading) {
    return <GuideAdminShell title="编辑指南文章"><InlineLoading /></GuideAdminShell>;
  }
  if (!create && article.isError) {
    return <GuideAdminShell title="编辑指南文章"><ErrorState title="加载失败" subtitle={errorMessage(article.error)} onRetry={() => article.refetch()} /></GuideAdminShell>;
  }

  return (
    <GuideAdminShell
      title={create ? "新建指南文章" : "编辑指南文章"}
      subtitle="文章应包含清晰步骤、材料清单、时间线、风险提醒和相关服务，不再只写空泛概述。"
    >
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <section className="space-y-3 rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <TextField field={{ key: "title", label: "标题", required: true }} value={form.title} onChange={(value) => setForm((f) => ({ ...f, title: String(value) }))} />
          <TextField field={{ key: "summary", label: "摘要", type: "textarea", rows: 3, required: true }} value={form.summary} onChange={(value) => setForm((f) => ({ ...f, summary: String(value) }))} />
          <TextField field={{ key: "body", label: "正文", type: "textarea", rows: 28, placeholder: "建议包含：适合人群、准备材料、办理步骤、费用、时间线、常见坑、下一步行动。" }} value={form.body} onChange={(value) => setForm((f) => ({ ...f, body: String(value) }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField field={{ key: "seoTitle", label: "SEO 标题" }} value={form.seoTitle} onChange={(value) => setForm((f) => ({ ...f, seoTitle: String(value) }))} />
            <TextField field={{ key: "seoDescription", label: "SEO 描述" }} value={form.seoDescription} onChange={(value) => setForm((f) => ({ ...f, seoDescription: String(value) }))} />
          </div>
        </section>

        <aside className="space-y-3 rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <Link href="/admin/guide/articles" className="inline-flex items-center gap-1 text-xs font-semibold text-kx-muted hover:text-kx-accent">
            <FilePenLine className="h-3.5 w-3.5" /> 返回文章列表
          </Link>
          <TextField field={{ key: "slug", label: "slug" }} value={form.slug} onChange={(value) => setForm((f) => ({ ...f, slug: String(value) }))} />
          <TextField field={{ key: "status", label: "状态", type: "select", options: STATUS_OPTIONS }} value={form.status} onChange={(value) => setForm((f) => ({ ...f, status: String(value) }))} />
          <label className="block">
            <span className="mb-1 block text-xs font-black text-kx-muted">主分类</span>
            <select
              className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent"
              value={form.categoryKey}
              onChange={(event) => setForm((f) => ({ ...f, categoryKey: event.target.value, subCategoryKey: "" }))}
            >
              {topCategories.map((cat) => <option key={cat.key} value={cat.key}>{cat.title || cat.key}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-kx-muted">子分类</span>
            <select
              className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm outline-none focus:border-kx-accent"
              value={form.subCategoryKey}
              onChange={(event) => setForm((f) => ({ ...f, subCategoryKey: event.target.value }))}
            >
              <option value="">不绑定</option>
              {childCategories.map((cat) => <option key={cat.key} value={cat.key}>{cat.title || cat.key}</option>)}
            </select>
          </label>
          <TextField field={{ key: "coverImage", label: "封面图 URL" }} value={form.coverImage} onChange={(value) => setForm((f) => ({ ...f, coverImage: String(value) }))} />
          <TextField field={{ key: "tags", label: "标签", type: "textarea", rows: 2 }} value={form.tags} onChange={(value) => setForm((f) => ({ ...f, tags: String(value) }))} />
          <TextField field={{ key: "relatedArticleSlugs", label: "关联文章 slug", type: "textarea", rows: 2 }} value={form.relatedArticleSlugs} onChange={(value) => setForm((f) => ({ ...f, relatedArticleSlugs: String(value) }))} />
          <TextField field={{ key: "relatedProductSlugs", label: "关联商品 slug", type: "textarea", rows: 2 }} value={form.relatedProductSlugs} onChange={(value) => setForm((f) => ({ ...f, relatedProductSlugs: String(value) }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField field={{ key: "authorName", label: "作者" }} value={form.authorName} onChange={(value) => setForm((f) => ({ ...f, authorName: String(value) }))} />
            <TextField field={{ key: "sortOrder", label: "排序" }} value={form.sortOrder} onChange={(value) => setForm((f) => ({ ...f, sortOrder: String(value) }))} />
          </div>
          <div className="grid gap-2">
            <TextField field={{ key: "isFeatured", label: "精选文章", type: "checkbox" }} value={form.isFeatured} onChange={(value) => setForm((f) => ({ ...f, isFeatured: Boolean(value) }))} />
            <TextField field={{ key: "isFree", label: "免费可读", type: "checkbox" }} value={form.isFree} onChange={(value) => setForm((f) => ({ ...f, isFree: Boolean(value) }))} />
            <TextField field={{ key: "isPaid", label: "付费内容", type: "checkbox" }} value={form.isPaid} onChange={(value) => setForm((f) => ({ ...f, isPaid: Boolean(value) }))} />
          </div>
          <button type="submit" className="kx-button-primary h-10 w-full justify-center" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存文章
          </button>
        </aside>
      </form>
    </GuideAdminShell>
  );
}
