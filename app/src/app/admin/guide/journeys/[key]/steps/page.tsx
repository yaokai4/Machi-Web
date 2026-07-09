"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { adminGuide, type GuideJourneyStep } from "@/lib/guide";
import { GuideAdminShell } from "@/components/guide/GuideAdminKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type StepForm = {
  title: string;
  stepKey: string;
  summary: string;
  body: string;
  categoryKey: string;
  actionType: string;
  actionTarget: string;
  articleSlugs: string;
  productSlugs: string;
  deadlineHint: string;
  estimatedMinutes: string;
  sortOrder: string;
  status: string;
  required: boolean;
};

const EMPTY: StepForm = {
  title: "", stepKey: "", summary: "", body: "", categoryKey: "", actionType: "",
  actionTarget: "", articleSlugs: "", productSlugs: "", deadlineHint: "",
  estimatedMinutes: "0", sortOrder: "", status: "published", required: true,
};

const ACTION_TYPES = ["", "article", "product", "school", "company", "journey", "topic"];
const STATUSES = ["published", "draft", "archived"];

function splitList(value: string): string[] {
  return value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function formFromStep(s: GuideJourneyStep): StepForm {
  return {
    title: s.title, stepKey: s.stepKey, summary: s.summary, body: s.body || "",
    categoryKey: s.categoryKey, actionType: s.actionType, actionTarget: s.actionTarget,
    articleSlugs: (s.articleSlugs || []).join(", "), productSlugs: (s.productSlugs || []).join(", "),
    deadlineHint: s.deadlineHint, estimatedMinutes: String(s.estimatedMinutes || 0),
    sortOrder: String(s.sortOrder || 0), status: s.status, required: s.required,
  };
}

function payloadFromForm(form: StepForm, includeKey: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title,
    summary: form.summary,
    body: form.body,
    categoryKey: form.categoryKey,
    actionType: form.actionType,
    actionTarget: form.actionTarget,
    articleSlugs: splitList(form.articleSlugs),
    productSlugs: splitList(form.productSlugs),
    deadlineHint: form.deadlineHint,
    estimatedMinutes: Number(form.estimatedMinutes || 0),
    status: form.status,
    required: form.required,
  };
  if (form.sortOrder.trim() !== "") payload.sortOrder = Number(form.sortOrder);
  if (includeKey && form.stepKey.trim()) payload.stepKey = form.stepKey.trim();
  return payload;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "操作失败";
}

export default function GuideJourneyStepsAdminPage() {
  const params = useParams();
  const journeyKey = String(params?.key || "");
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StepForm>(EMPTY);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const steps = useQuery({
    queryKey: ["admin-guide", "journey-steps", journeyKey],
    queryFn: () => adminGuide.journeySteps(journeyKey),
    enabled: journeyKey.length > 0,
    staleTime: 20_000,
  });

  const ordered = useMemo(
    () => [...(steps.data?.items ?? [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [steps.data?.items],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-guide", "journey-steps", journeyKey] });

  const save = useMutation({
    mutationFn: () =>
      editingId
        ? adminGuide.updateStep(editingId, payloadFromForm(form, false))
        : adminGuide.createStep(journeyKey, payloadFromForm(form, true)),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(EMPTY);
      pushToast({ kind: "success", message: "已保存" });
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminGuide.deleteStep(id),
    onSuccess: () => {
      invalidate();
      pushToast({ kind: "success", message: "已删除" });
    },
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  // Reorder by swapping the sortOrder of two adjacent steps.
  const swap = useMutation({
    mutationFn: async (vars: { a: GuideJourneyStep; b: GuideJourneyStep }) => {
      await adminGuide.updateStep(vars.a.id, { sortOrder: vars.b.sortOrder });
      await adminGuide.updateStep(vars.b.id, { sortOrder: vars.a.sortOrder });
    },
    onSuccess: () => invalidate(),
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const a = ordered[index];
    const b = ordered[index + dir];
    if (!a || !b) return;
    // If sortOrder values collide, nudge so the swap actually reorders.
    const aOrder = a.sortOrder || 0;
    const bOrder = b.sortOrder || 0;
    if (aOrder === bOrder) {
      swap.mutate({ a: { ...a, sortOrder: aOrder }, b: { ...b, sortOrder: aOrder + dir } });
    } else {
      swap.mutate({ a, b });
    }
  };

  // Drag-and-drop reorder: persist by normalising sortOrder to 0..n across the
  // new order, only PATCHing the steps whose position actually changed.
  const reorder = useMutation({
    mutationFn: async (next: GuideJourneyStep[]) => {
      await Promise.all(
        next.map((s, i) => ((s.sortOrder || 0) !== i ? adminGuide.updateStep(s.id, { sortOrder: i }) : Promise.resolve())),
      );
    },
    onSuccess: () => invalidate(),
    onError: (error) => pushToast({ kind: "error", message: errorMessage(error) }),
  });

  const handleDrop = (target: number) => {
    const from = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === null || from === target) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    reorder.mutate(next);
  };

  const startNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY, sortOrder: String((ordered[ordered.length - 1]?.sortOrder || 0) + 1) });
  };

  const input = "w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 py-2 text-sm outline-none focus:border-kx-accent";
  const label = "mb-1 block text-xs font-bold text-kx-muted";

  return (
    <GuideAdminShell title={`行动路径步骤 · ${journeyKey}`} subtitle="维护该处境路径的有序步骤、说明、关联文章/资料与排序。">
      <div className="mb-3">
        <Link href="/admin/guide/journeys" className="inline-flex items-center gap-1.5 text-sm font-semibold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 返回路径列表
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* List */}
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black text-kx-text">步骤（{ordered.length}）</h2>
            <button type="button" className="kx-button-primary h-10" onClick={startNew}>
              <Plus className="h-4 w-4" /> 新建步骤
            </button>
          </div>
          {steps.isLoading ? (
            <InlineLoading />
          ) : steps.isError ? (
            <ErrorState title="加载失败" subtitle={errorMessage(steps.error)} onRetry={() => steps.refetch()} />
          ) : ordered.length === 0 ? (
            <EmptyState title="暂无步骤" subtitle="从右侧新建该路径的第一步。" />
          ) : (
            <div className="overflow-hidden rounded-kx-md border border-kx-stroke/60">
              {ordered.map((step, index) => (
                <div
                  key={step.id}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== index) setDragOverIndex(index); }}
                  onDrop={() => handleDrop(index)}
                  className={clsx(
                    "flex flex-wrap items-center gap-3 border-b border-kx-stroke/60 px-3 py-3 last:border-b-0 transition-colors",
                    dragIndex === index && "opacity-50",
                    dragOverIndex === index && dragIndex !== index && "bg-kx-accent/10",
                  )}
                >
                  <div
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className="cursor-grab text-kx-muted hover:text-kx-accent active:cursor-grabbing"
                    title={t("aria_drag_sort")}
                    aria-label={t("aria_drag_sort")}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <button type="button" disabled={index === 0 || swap.isPending} onClick={() => move(index, -1)} className="text-kx-muted hover:text-kx-accent disabled:opacity-30">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={index === ordered.length - 1 || swap.isPending} onClick={() => move(index, 1)} className="text-kx-muted hover:text-kx-accent disabled:opacity-30">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <button
                      type="button"
                      className="text-left font-black text-kx-text hover:text-kx-accent"
                      onClick={() => {
                        setEditingId(step.id);
                        setForm(formFromStep(step));
                      }}
                    >
                      {index + 1}. {step.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-kx-muted">
                      <span>{step.stepKey}</span>
                      {!step.required ? <span className="rounded-full bg-kx-soft px-2 py-0.5">可选</span> : null}
                      {step.categoryKey ? <span>{step.categoryKey}</span> : null}
                      {step.deadlineHint ? <span className="text-amber-600">{step.deadlineHint}</span> : null}
                      <span className={step.status === "published" ? "text-emerald-600" : "text-kx-muted"}>{step.status}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => {
                      if (window.confirm("确定删除这一步吗？")) remove.mutate(step.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Form */}
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <h2 className="mb-3 font-black text-kx-text">{editingId ? "编辑步骤" : "新建步骤"}</h2>
          <div className="space-y-3">
            <div>
              <span className={label}>步骤标题 *</span>
              <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            {!editingId ? (
              <div>
                <span className={label}>步骤 key（留空自动生成；创建后不可改）</span>
                <input className={input} value={form.stepKey} onChange={(e) => setForm({ ...form, stepKey: e.target.value })} placeholder="resume" />
              </div>
            ) : null}
            <div>
              <span className={label}>简介</span>
              <textarea className={input} rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div>
              <span className={label}>正文（可选，详情展开）</span>
              <textarea className={input} rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div>
              <span className={label}>分类 key（按此自动拉 3 篇文章）</span>
              <input className={input} value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })} placeholder="career_japan" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>动作类型</span>
                <select className={input} value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>
                  {ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t || "（无）"}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className={label}>动作目标</span>
                <input className={input} value={form.actionTarget} onChange={(e) => setForm({ ...form, actionTarget: e.target.value })} placeholder="如 journey key" />
              </div>
            </div>
            <div>
              <span className={label}>关联文章 slug（逗号/换行分隔，覆盖按分类自动拉取）</span>
              <textarea className={input} rows={2} value={form.articleSlugs} onChange={(e) => setForm({ ...form, articleSlugs: e.target.value })} />
            </div>
            <div>
              <span className={label}>关联资料/商品 slug</span>
              <textarea className={input} rows={2} value={form.productSlugs} onChange={(e) => setForm({ ...form, productSlugs: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>截止提示</span>
                <input className={input} value={form.deadlineHint} onChange={(e) => setForm({ ...form, deadlineHint: e.target.value })} placeholder="投递前完成" />
              </div>
              <div>
                <span className={label}>预计分钟</span>
                <input className={input} value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>排序</span>
                <input className={input} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
              <div>
                <span className={label}>状态</span>
                <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-kx-text">
              <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
              必做步骤
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button type="button" className="kx-button-primary h-10" disabled={save.isPending || !form.title.trim()} onClick={() => save.mutate()}>
                <Save className="h-4 w-4" /> {editingId ? "保存修改" : "创建步骤"}
              </button>
              {editingId ? (
                <button type="button" className="h-10 rounded-kx-md border border-kx-stroke/70 px-4 text-sm font-semibold text-kx-muted hover:text-kx-accent" onClick={() => { setEditingId(null); setForm(EMPTY); }}>
                  取消
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </GuideAdminShell>
  );
}
