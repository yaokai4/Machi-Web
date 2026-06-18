"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import type { KXListingTaxonomyCategory, KXListingTaxonomyField, KXListingTaxonomyPayload } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, SectionLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";

const TYPES = [
  { value: "secondhand", label: "二手" },
  { value: "rental", label: "租房" },
  { value: "job", label: "找工作" },
  { value: "hiring", label: "招聘" },
  { value: "local_service", label: "商家与服务" },
];

const FIELD_KINDS = ["text", "textarea", "select", "checkbox", "date"];

export default function AdminListingTaxonomyPage() {
  const { user } = useSession();
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [type, setType] = useState("local_service");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategory, setNewCategory] = useState({ label: "", key: "", sort: "0" });
  const [newField, setNewField] = useState({
    label: "",
    key: "",
    kind: "text",
    placeholder: "",
    options: "",
    sort: "0",
    required: false,
  });

  const query = useQuery({
    queryKey: ["admin-listing-taxonomy", type],
    queryFn: async () => api.adminListingTaxonomy(type) as Promise<KXListingTaxonomyPayload>,
  });

  const payload = query.data;
  const categories = payload?.categories || [];
  const fields = useMemo(() => payload?.fields || [], [payload?.fields]);
  const filteredFields = useMemo(() => {
    if (!selectedCategory) return fields;
    return fields.filter((field) => (field.categoryKey || field.category_key || "") === selectedCategory);
  }, [fields, selectedCategory]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-listing-taxonomy"] });
  const onError = (e: unknown) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "操作失败" });

  const createCategory = useMutation({
    mutationFn: () => api.adminCreateTaxonomyCategory({
      listingType: type,
      label: newCategory.label.trim(),
      categoryKey: (newCategory.key || newCategory.label).trim(),
      sortOrder: Number(newCategory.sort || 0),
      isActive: true,
    }),
    onSuccess: () => {
      setNewCategory({ label: "", key: "", sort: "0" });
      pushToast({ kind: "success", message: "分类已新增" });
      invalidate();
    },
    onError,
  });

  const updateCategory = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<KXListingTaxonomyCategory> }) => api.adminUpdateTaxonomyCategory(vars.id, vars.patch),
    onSuccess: () => {
      pushToast({ kind: "success", message: "分类已保存" });
      invalidate();
    },
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.adminDeleteTaxonomyCategory(id),
    onSuccess: () => {
      setSelectedCategory("");
      pushToast({ kind: "success", message: "分类已删除" });
      invalidate();
    },
    onError,
  });

  const createField = useMutation({
    mutationFn: () => api.adminCreateTaxonomyField({
      listingType: type,
      categoryKey: selectedCategory,
      fieldKey: newField.key.trim(),
      label: newField.label.trim(),
      kind: newField.kind,
      placeholder: newField.placeholder.trim(),
      options: newField.options.split("\n").map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(newField.sort || 0),
      required: newField.required,
      isActive: true,
    }),
    onSuccess: () => {
      setNewField({ label: "", key: "", kind: "text", placeholder: "", options: "", sort: "0", required: false });
      pushToast({ kind: "success", message: "字段已新增" });
      invalidate();
    },
    onError,
  });

  const updateField = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<KXListingTaxonomyField> }) => api.adminUpdateTaxonomyField(vars.id, vars.patch),
    onSuccess: () => {
      pushToast({ kind: "success", message: "字段已保存" });
      invalidate();
    },
    onError,
  });

  const deleteField = useMutation({
    mutationFn: (id: string) => api.adminDeleteTaxonomyField(id),
    onSuccess: () => {
      pushToast({ kind: "success", message: "字段已删除" });
      invalidate();
    },
    onError,
  });

  if (user && user.role !== "admin") {
    return (
      <AppShell requireAuth wide right={null}>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <ErrorState title="没有管理员权限" />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> 管理后台
            </Link>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Listing 分类与字段配置</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">管理二手、租房、找工作、商家与服务的发布分类、字段、排序和启停。</p>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap gap-2">
          {TYPES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => { setType(item.value); setSelectedCategory(""); }}
              data-active={type === item.value}
              className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white"
            >
              {item.label}
            </button>
          ))}
        </div>

        {query.isLoading ? <div className="mt-5"><SectionLoading title="正在加载分类字段" rows={4} /></div> : null}
        {query.isError ? <div className="mt-5"><ErrorState title="分类字段暂时无法加载" onRetry={() => query.refetch()} /></div> : null}

        {payload ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <section className="rounded-[28px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-950">分类</h2>
                <span className="text-xs font-bold text-slate-400">{categories.length} 个</span>
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("")}
                  data-active={!selectedCategory}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-black text-slate-600 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white"
                >
                  通用字段
                </button>
                {categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    active={selectedCategory === (category.categoryKey || category.category_key)}
                    onSelect={() => setSelectedCategory(category.categoryKey || category.category_key)}
                    onSave={(patch) => updateCategory.mutate({ id: category.id, patch })}
                    deleting={deleteCategory.isPending}
                    onDelete={() => {
                      const name = category.label || category.categoryKey || category.category_key || "该分类";
                      if (window.confirm(`确认删除「${name}」？该分类下的字段也会一并删除。`)) {
                        deleteCategory.mutate(category.id);
                      }
                    }}
                  />
                ))}
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-900">新增分类</p>
                <div className="mt-2 grid gap-2">
                  <input className="kx-input h-10" placeholder="分类名称" value={newCategory.label} onChange={(e) => setNewCategory((v) => ({ ...v, label: e.target.value }))} />
                  <input className="kx-input h-10" placeholder="分类 key（默认同名称）" value={newCategory.key} onChange={(e) => setNewCategory((v) => ({ ...v, key: e.target.value }))} />
                  <input className="kx-input h-10" placeholder="排序" value={newCategory.sort} onChange={(e) => setNewCategory((v) => ({ ...v, sort: e.target.value.replace(/[^\d-]/g, "") }))} />
                  <button disabled={!newCategory.label.trim() || createCategory.isPending} onClick={() => createCategory.mutate()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                    <Plus className="h-4 w-4" /> 新增分类
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-slate-950">字段</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{selectedCategory ? `当前分类：${selectedCategory}` : "当前为通用字段"}</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{filteredFields.length} 个</span>
              </div>
              <div className="mt-4 space-y-3">
                {filteredFields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onSave={(patch) => updateField.mutate({ id: field.id, patch })}
                    deleting={deleteField.isPending}
                    onDelete={() => {
                      const name = field.label || field.fieldKey || field.field_key || "该字段";
                      if (window.confirm(`确认删除「${name}」字段？`)) {
                        deleteField.mutate(field.id);
                      }
                    }}
                  />
                ))}
                {!filteredFields.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">暂无字段。</p> : null}
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-900">新增字段</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input className="kx-input h-10" placeholder="字段名称" value={newField.label} onChange={(e) => setNewField((v) => ({ ...v, label: e.target.value }))} />
                  <input className="kx-input h-10" placeholder="field_key，例如 move_in" value={newField.key} onChange={(e) => setNewField((v) => ({ ...v, key: e.target.value }))} />
                  <select className="kx-input h-10" value={newField.kind} onChange={(e) => setNewField((v) => ({ ...v, kind: e.target.value }))}>
                    {FIELD_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                  <input className="kx-input h-10" placeholder="排序" value={newField.sort} onChange={(e) => setNewField((v) => ({ ...v, sort: e.target.value.replace(/[^\d-]/g, "") }))} />
                  <input className="kx-input h-10 md:col-span-2" placeholder="placeholder" value={newField.placeholder} onChange={(e) => setNewField((v) => ({ ...v, placeholder: e.target.value }))} />
                  <textarea className="kx-input min-h-20 p-3 md:col-span-2" placeholder="选项，每行一个，仅 select 使用" value={newField.options} onChange={(e) => setNewField((v) => ({ ...v, options: e.target.value }))} />
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    <input type="checkbox" checked={newField.required} onChange={(e) => setNewField((v) => ({ ...v, required: e.target.checked }))} />
                    必填
                  </label>
                  <button disabled={!newField.label.trim() || !newField.key.trim() || createField.isPending} onClick={() => createField.mutate()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                    <Plus className="h-4 w-4" /> 新增字段
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}

function CategoryRow({ category, active, onSelect, onSave, deleting, onDelete }: {
  category: KXListingTaxonomyCategory;
  active: boolean;
  onSelect: () => void;
  onSave: (patch: Partial<KXListingTaxonomyCategory>) => void;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(category.label);
  const [key, setKey] = useState(category.categoryKey || category.category_key);
  const [sort, setSort] = useState(String(category.sortOrder ?? category.sort_order ?? 0));
  const [isActive, setIsActive] = useState(category.isActive ?? category.is_active ?? true);
  return (
    <div className={`rounded-2xl border p-3 ${active ? "border-slate-950" : "border-slate-200"}`}>
      <button type="button" onClick={onSelect} className="mb-2 text-left text-sm font-black text-slate-950">{category.label}</button>
      <div className="grid gap-2">
        <input className="kx-input h-9" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="kx-input h-9" value={key} onChange={(e) => setKey(e.target.value)} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className="kx-input h-9" value={sort} onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ""))} />
          <label className="flex items-center gap-1 text-xs font-bold text-slate-500">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            启用
          </label>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onSave({ label, categoryKey: key, sortOrder: Number(sort || 0), isActive })} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-slate-950 text-xs font-black text-white">
            <Save className="h-3.5 w-3.5" /> 保存
          </button>
          <button type="button" disabled={deleting} onClick={onDelete} title="删除分类" className="grid h-8 w-8 place-items-center rounded-full border border-rose-200 text-rose-600 disabled:cursor-not-allowed disabled:opacity-45">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ field, onSave, deleting, onDelete }: {
  field: KXListingTaxonomyField;
  onSave: (patch: Partial<KXListingTaxonomyField>) => void;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [fieldKey, setFieldKey] = useState(field.fieldKey || field.field_key);
  const [kind, setKind] = useState(field.kind || field.fieldKind || field.field_kind || "text");
  const [placeholder, setPlaceholder] = useState(field.placeholder || "");
  const [sort, setSort] = useState(String(field.sortOrder ?? field.sort_order ?? 0));
  const [required, setRequired] = useState(Boolean(field.required));
  const [isActive, setIsActive] = useState(field.isActive ?? field.is_active ?? true);
  const [options, setOptions] = useState((field.options || []).join("\n"));
  return (
    <div className="rounded-2xl border border-slate-200 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <input className="kx-input h-9" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="kx-input h-9" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} />
        <select className="kx-input h-9" value={kind} onChange={(e) => setKind(e.target.value)}>
          {FIELD_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="kx-input h-9" value={sort} onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ""))} />
        <input className="kx-input h-9 md:col-span-2" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="placeholder" />
        <textarea className="kx-input min-h-16 p-3 md:col-span-2" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="选项，每行一个" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs font-bold text-slate-500"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />必填</label>
        <label className="flex items-center gap-1 text-xs font-bold text-slate-500"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />启用</label>
        <button type="button" onClick={() => onSave({
          label,
          fieldKey,
          kind,
          placeholder,
          options: options.split("\n").map((item) => item.trim()).filter(Boolean),
          sortOrder: Number(sort || 0),
          required,
          isActive,
        })} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full bg-slate-950 px-3 text-xs font-black text-white">
          <Save className="h-3.5 w-3.5" /> 保存
        </button>
        <button type="button" disabled={deleting} onClick={onDelete} title="删除字段" className="grid h-8 w-8 place-items-center rounded-full border border-rose-200 text-rose-600 disabled:cursor-not-allowed disabled:opacity-45">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
