"use client";

import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  FileText,
  IdCard,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { guide, type GuideActivePlanResponse, type GuideNextAction, type GuideProduct, type GuideProfile, type GuideTodo, type GuideTodoStep } from "@/lib/guide";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";

export function GuideIdentityCard({ profile }: { profile?: GuideProfile | null }) {
  const label = profile?.identityType || "还未设置提醒偏好";
  const meta = [profile?.city, profile?.visaStatus, profile?.japaneseLevel].filter(Boolean).join(" · ");
  return (
    <Link href="/guide/profile" className="kx-card block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
          <IdCard className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-kx-muted">Reminder Settings</p>
          <h3 className="mt-1 text-lg font-black text-kx-text">{label}</h3>
          <p className="mt-1 text-sm leading-6 text-kx-subtle">
            {meta || "只填写希望被提醒的日期和目标偏好，Machi 会生成 Todo、倒数日和日历提醒。"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function GuidePlanSummary({ data }: { data?: GuideActivePlanResponse }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const plan = data?.plan;
  if (!user) {
    return (
      <section className="kx-guide-plan-panel p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accent text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Machi Guide OS</p>
            <h2 className="mt-1.5 text-lg font-black tracking-[-0.01em] text-kx-text">把日本大事变成计划</h2>
            <p className="mt-1 text-sm leading-6 text-kx-subtle">登录后保存出愿、ES、面试、JLPT、签证和生活账单提醒。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-4 h-10 px-4">
              登录后开始计划
            </button>
          </div>
        </div>
      </section>
    );
  }
  if (!plan) {
    // Identity-driven: a logged-in user with a saved identity sees journeys
    // ordered for them (spec P0.1). No identity yet → generic order.
    const suggested = (data?.suggestedJourneys || []).slice(0, 6);
    return (
      <section className="kx-guide-plan-panel p-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Goals</p>
        <h2 className="mt-1.5 text-lg font-black tracking-[-0.01em] text-kx-text">还没有进行中的目标</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">
          {data?.identityType ? "根据你的提醒设置，最相关的目标已经排在前面。" : "从目标路径开始，生成 Todo、截止日期和提醒。"}
        </p>
        {suggested.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggested.map((j, i) => (
              <Link
                key={j.key}
                href={`/guide/goals/${j.key}`}
                className={"kx-card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-kx-accent/30" + (i === 0 ? " ring-1 ring-kx-accent/40" : "")}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: j.color || "var(--kx-accent)" }}>
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-kx-text">{j.title}{i === 0 ? <span className="ml-1.5 text-[11px] font-bold text-kx-accent">为你推荐</span> : null}</span>
                  <span className="block truncate text-xs text-kx-muted">{j.subtitle}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/guide/goals" className="kx-button-primary h-10 px-4">{suggested.length ? "查看全部路径" : "选择目标"}</Link>
          <Link href="/guide/profile" className="kx-button-secondary h-10 px-4">{data?.identityType ? "调整提醒" : "提醒设置"}</Link>
        </div>
      </section>
    );
  }
  const total = plan.todoTotal ?? 0;
  const done = plan.todoDone ?? 0;
  const weekDone = data?.retention?.weekDone ?? 0;
  const streak = data?.retention?.streakDays ?? 0;
  return (
    <section className="kx-guide-plan-panel p-4">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">继续你的日本计划</p>
          <h2 className="mt-1.5 text-lg font-black tracking-[-0.01em] text-kx-text">{plan.title}</h2>
          <p className="mt-1 text-sm leading-6 text-kx-subtle">{plan.subtitle || "把关键事项按日期一步步完成。"}</p>
          {(weekDone > 0 || streak > 0) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-black text-kx-accent">🔥 本周已完成 {weekDone}</span>
              {streak > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-kx-soft px-2.5 py-1 text-xs font-bold text-kx-text">连续打卡 {streak} 天</span> : null}
            </div>
          ) : null}
          <div className="mt-4 max-w-xl">
            <div className="mb-1 flex items-center justify-between text-xs font-bold">
              <span className="text-kx-accent">已完成 {done}/{total}</span>
              <span className="text-kx-muted">{plan.progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-kx-soft">
              <div className="h-full rounded-full bg-kx-accent transition-all" style={{ width: `${plan.progressPercent}%` }} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-kx-stroke/50 bg-white/70 p-4 dark:bg-white/5">
          <p className="text-xs font-bold text-kx-muted">下一步</p>
          <p className="mt-1 text-base font-black text-kx-text">{plan.nextTodo?.title || "所有任务都完成了"}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/guide/tasks" className="kx-button-primary h-9 px-3 text-sm">进入待办</Link>
            <Link href="/guide/calendar" className="kx-button-secondary h-9 px-3 text-sm">日历</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GuideNextActions({ actions = [] }: { actions?: GuideNextAction[] }) {
  const items = actions.slice(0, 4);
  if (!items.length) return null;
  return (
    <section className="kx-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Next</p>
          <h2 className="mt-1 text-lg font-black text-kx-text">为你推荐的下一步</h2>
        </div>
        <Link href="/guide/tasks" className="text-xs font-bold text-kx-accent">全部 Todo</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((action, index) => {
          const isTodo = action.kind === "todo";
          const href = isTodo ? "/guide/tasks" : action.journeyKey ? `/guide/goals/${action.journeyKey}` : "/guide/goals";
          return (
            <Link
              key={`${action.kind}-${action.todoId || action.journeyKey || action.title}`}
              href={href}
              className={
                "group flex items-start gap-3 rounded-kx-lg border p-3 transition hover:-translate-y-0.5 hover:border-kx-accent/40 " +
                (index === 0 ? "border-kx-accent/30 bg-kx-accentSoft/45" : "border-kx-stroke/55 bg-kx-card/70")
              }
            >
              <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl " + (isTodo ? "bg-amber-400/15 text-amber-600" : "bg-kx-accentSoft text-kx-accent")}>
                {isTodo ? <CalendarClock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black leading-5 text-kx-text group-hover:text-kx-accent">{action.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-kx-muted">
                  {isTodo ? (action.dueAt ? `截止 ${action.dueAt.slice(0, 10)}` : "来自你的 Todo，优先处理") : (action.subtitle || "生成 Todo 与日历计划")}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GuideQuickAddTodo({ defaultDate, compact = false, planId }: { defaultDate?: string; compact?: boolean; planId?: string }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [text, setText] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
  };
  const create = useMutation({
    mutationFn: () => guide.createTodo({ content: text.trim(), plannedDate: date || undefined, planId }),
    onSuccess: () => {
      setText("");
      invalidate();
      pushToast({ kind: "success", message: "Todo 已添加" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "添加 Todo 失败" }),
  });
  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    if (!text.trim() || create.isPending) return;
    create.mutate();
  };
  const chips = [
    ["今天", isoShift(0)],
    ["明天", isoShift(1)],
    ["+7 天", isoShift(7)],
  ] as const;
  return (
    <form onSubmit={submit} className={"kx-card p-3 " + (compact ? "" : "sm:p-4")}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3">
          <Plus className="h-4 w-4 shrink-0 text-kx-accent" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="直接输入 Todo：明天提交 ES / 7月25日前交房租"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold text-kx-text outline-none placeholder:text-kx-muted"
          />
        </div>
        <button type="submit" disabled={!text.trim() || create.isPending} className="kx-button-primary h-11 px-4 disabled:opacity-50">
          {create.isPending ? "添加中" : "添加"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {chips.map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => setDate(value)}
            className={(date === value ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted hover:text-kx-accent") + " rounded-full px-2.5 py-1 text-[11px] font-bold"}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 rounded-full border border-kx-stroke/60 bg-kx-card px-2 text-[11px] font-semibold text-kx-muted outline-none focus:border-kx-accent"
        />
        {date ? (
          <button type="button" onClick={() => setDate("")} className="px-1.5 text-[11px] font-semibold text-kx-muted hover:text-kx-accent">
            不设日期
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function GuideTodoCard({ todo, compact = false }: { todo: GuideTodo; compact?: boolean }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [showReschedule, setShowReschedule] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTitle, setDetailTitle] = useState(todo.title);
  const [detailSummary, setDetailSummary] = useState(todo.summary || "");
  const [detailNotes, setDetailNotes] = useState(todo.notes || "");
  const [detailPriority, setDetailPriority] = useState(todo.priority || "normal");
  const [detailPlanned, setDetailPlanned] = useState((todo.plannedDate || "").slice(0, 10));
  const [detailDue, setDetailDue] = useState((todo.dueAt || "").slice(0, 10));
  const [detailRecurrence, setDetailRecurrence] = useState(todo.recurrence || "");
  const [detailListName, setDetailListName] = useState(todo.listName || "");
  const [detailTags, setDetailTags] = useState((todo.tags || []).join(", "));
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
  };
  const complete = useMutation({
    mutationFn: () => guide.completeTodo(todo.id),
    onSuccess: invalidate,
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "任务更新失败" }),
  });
  // Spec P2 planning depth: reschedule a todo's planned date inline (改期).
  const reschedule = useMutation({
    mutationFn: (date: string) => guide.updateTodo(todo.id, { plannedDate: date }),
    onSuccess: () => { invalidate(); setShowReschedule(false); pushToast({ kind: "success", message: "已改期" }); },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "改期失败" }),
  });
  // Microsoft To Do / Notion-style subtask checklist on each todo.
  const [newStep, setNewStep] = useState("");
  const steps = todo.steps ?? [];
  const stepDoneCount = steps.filter((s) => s.done).length;
  const stepsMut = useMutation({
    mutationFn: (next: GuideTodoStep[]) => guide.updateTodo(todo.id, { steps: next }),
    onSuccess: invalidate,
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "子任务更新失败" }),
  });
  const toggleStep = (id: string) => stepsMut.mutate(steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  const removeStep = (id: string) => stepsMut.mutate(steps.filter((s) => s.id !== id));
  const addStep = () => {
    const text = newStep.trim();
    if (!text) return;
    stepsMut.mutate([...steps, { id: crypto.randomUUID(), text, done: false }]);
    setNewStep("");
  };
  // Notion-style free-form note attached to the task.
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(todo.notes || "");
  const notesMut = useMutation({
    mutationFn: (notes: string) => guide.updateTodo(todo.id, { notes }),
    onSuccess: () => { invalidate(); setNoteOpen(false); },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "备注保存失败" }),
  });
  const saveDetail = useMutation({
    mutationFn: () => guide.updateTodo(todo.id, {
      title: detailTitle.trim(),
      summary: detailSummary.trim(),
      notes: detailNotes.trim(),
      priority: detailPriority,
      plannedDate: detailPlanned,
      dueAt: detailDue,
      recurrence: detailRecurrence,
      listName: detailListName.trim(),
      tags: detailTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      invalidate();
      setDetailOpen(false);
      pushToast({ kind: "success", message: "Todo 已更新" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "Todo 更新失败" }),
  });
  const duplicate = useMutation({
    mutationFn: () => guide.createTodo({
      content: `${todo.title}（副本）`,
      summary: todo.summary,
      notes: todo.notes,
      todoType: todo.todoType,
      priority: todo.priority,
      plannedDate: todo.plannedDate || undefined,
      dueAt: todo.dueAt || undefined,
      recurrence: todo.recurrence || undefined,
      listName: todo.listName || undefined,
      tags: todo.tags || undefined,
      planId: todo.planId || undefined,
    }),
    onSuccess: () => {
      invalidate();
      setDetailOpen(false);
      pushToast({ kind: "success", message: "已复制 Todo" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "复制失败" }),
  });
  const archive = useMutation({
    mutationFn: () => guide.updateTodo(todo.id, { status: "archived" }),
    onSuccess: () => {
      invalidate();
      setDetailOpen(false);
      pushToast({ kind: "success", message: "Todo 已归档" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "归档失败" }),
  });
  const remove = useMutation({
    mutationFn: () => guide.deleteTodo(todo.id),
    onSuccess: () => {
      invalidate();
      setDetailOpen(false);
      pushToast({ kind: "success", message: "Todo 已删除" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "删除失败" }),
  });
  const openDetail = () => {
    setDetailTitle(todo.title);
    setDetailSummary(todo.summary || "");
    setDetailNotes(todo.notes || "");
    setDetailPriority(todo.priority || "normal");
    setDetailPlanned((todo.plannedDate || "").slice(0, 10));
    setDetailDue((todo.dueAt || "").slice(0, 10));
    setDetailRecurrence(todo.recurrence || "");
    setDetailListName(todo.listName || "");
    setDetailTags((todo.tags || []).join(", "));
    setDetailOpen(true);
  };
  const done = todo.status === "done";
  const recurring = todo.recurrence === "daily" ? "每日循环" : todo.recurrence === "weekly" ? "每周循环" : "";
  return (
    <>
    <article
      className="kx-card cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/60"
      tabIndex={0}
      aria-label={`打开 Todo 详情：${todo.title}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button,input,textarea,a,select")) return;
        openDetail();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
          event.preventDefault();
          openDetail();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => !done && complete.mutate()}
          disabled={done || complete.isPending}
          className="mt-0.5 shrink-0 text-kx-accent disabled:opacity-60"
          aria-label={done ? "已完成" : "标记完成"}
        >
          {done ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TodoTag icon={<CalendarDays className="h-3 w-3" />} text={todo.plannedDate || todo.dueAt || "待安排"} tone={isOverdue(todo) ? "warn" : "muted"} />
            {recurring ? <TodoTag icon={<Repeat className="h-3 w-3" />} text={recurring} /> : null}
            {todo.reminderAt ? <TodoTag icon={<Bell className="h-3 w-3" />} text="已提醒" /> : null}
            {todo.estimatedMinutes ? <TodoTag icon={<Clock3 className="h-3 w-3" />} text={`${todo.estimatedMinutes} 分钟`} /> : null}
          </div>
          <h3 className={"mt-2 text-[15px] font-black leading-snug " + (done ? "text-kx-muted line-through" : "text-kx-text")}>{todo.title}</h3>
          {!compact && todo.summary ? <p className="mt-1 text-sm leading-6 text-kx-subtle">{todo.summary}</p> : null}
          {steps.length > 0 || (!compact && !done) ? (
            <div className="mt-2.5 space-y-1.5">
              {steps.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-kx-soft">
                    <div className="h-full rounded-full bg-kx-accent transition-all duration-300" style={{ width: `${(stepDoneCount / steps.length) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] font-bold text-kx-muted">{stepDoneCount}/{steps.length}</span>
                </div>
              ) : null}
              {steps.map((s) => (
                <div key={s.id} className="group flex items-center gap-2">
                  <button type="button" onClick={() => toggleStep(s.id)} disabled={stepsMut.isPending} className="shrink-0" aria-label={s.done ? "取消完成" : "完成步骤"}>
                    {s.done ? <CheckCircle2 className="h-[18px] w-[18px] text-kx-accent" /> : <Circle className="h-[18px] w-[18px] text-kx-muted" />}
                  </button>
                  <span className={"flex-1 text-sm leading-6 " + (s.done ? "text-kx-muted line-through" : "text-kx-text")}>{s.text}</span>
                  <button type="button" onClick={() => removeStep(s.id)} className="shrink-0 text-kx-muted opacity-0 transition hover:text-kx-danger group-hover:opacity-100" aria-label="删除步骤">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!compact && !done ? (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Plus className="h-3.5 w-3.5 shrink-0 text-kx-muted" />
                  <input
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }}
                    onBlur={addStep}
                    placeholder="添加步骤…"
                    className="flex-1 bg-transparent text-sm leading-6 outline-none placeholder:text-kx-muted"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {!done ? (
            showReschedule ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => reschedule.mutate(isoShift(0))} disabled={reschedule.isPending} className="rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-bold text-kx-text hover:bg-kx-accentSoft hover:text-kx-accent">今天</button>
                <button type="button" onClick={() => reschedule.mutate(isoShift(1))} disabled={reschedule.isPending} className="rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-bold text-kx-text hover:bg-kx-accentSoft hover:text-kx-accent">明天</button>
                <button type="button" onClick={() => reschedule.mutate(isoShift(7))} disabled={reschedule.isPending} className="rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-bold text-kx-text hover:bg-kx-accentSoft hover:text-kx-accent">+7 天</button>
                <input type="date" onChange={(e) => e.target.value && reschedule.mutate(e.target.value)} className="h-7 rounded-full border border-kx-stroke/60 bg-kx-card px-2 text-[11px] font-semibold outline-none focus:border-kx-accent" />
                <button type="button" onClick={() => setShowReschedule(false)} className="text-[11px] font-semibold text-kx-muted">取消</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowReschedule(true)} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-kx-muted hover:text-kx-accent">
                <CalendarClock className="h-3 w-3" /> 改期
              </button>
            )
          ) : null}
          {!compact ? (
            noteOpen ? (
              <div className="mt-2.5">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="写点备注…（链接、地址、号码、注意事项）"
                  className="w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-3 py-2 text-sm leading-6 outline-none focus:border-kx-accent"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button type="button" onClick={() => notesMut.mutate(noteDraft.trim())} disabled={notesMut.isPending} className="rounded-full bg-kx-accent px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60">保存</button>
                  <button type="button" onClick={() => { setNoteDraft(todo.notes || ""); setNoteOpen(false); }} className="text-[11px] font-semibold text-kx-muted">取消</button>
                </div>
              </div>
            ) : todo.notes ? (
              <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 block w-full whitespace-pre-wrap rounded-xl bg-kx-soft/60 px-3 py-2 text-left text-sm leading-6 text-kx-subtle transition hover:bg-kx-soft">
                {todo.notes}
              </button>
            ) : (
              <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-kx-muted hover:text-kx-accent">
                <FileText className="h-3 w-3" /> 备注
              </button>
            )
          ) : todo.notes ? (
            <p className="mt-1.5 line-clamp-2 rounded-lg bg-kx-soft/60 px-2.5 py-1.5 text-xs leading-5 text-kx-subtle">{todo.notes}</p>
          ) : null}
          {!compact && (todo.relatedProductSlugs.length || todo.relatedServiceSlugs.length) ? (
            <div className="mt-3 rounded-2xl bg-kx-accentSoft px-3 py-2 text-xs font-semibold text-kx-accent">
              完成这个任务有相关资料/服务可用
            </div>
          ) : null}
        </div>
      </div>
    </article>
    {detailOpen ? (
      <div className="fixed inset-0 z-[80] grid place-items-end bg-black/30 p-0 sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDetailOpen(false);
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`todo-detail-${todo.id}`} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-kx-card p-5 shadow-2xl sm:max-w-2xl sm:rounded-[24px] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-kx-muted">Todo Detail</p>
              <h2 id={`todo-detail-${todo.id}`} className="mt-1 text-xl font-black text-kx-text">Todo 详情</h2>
            </div>
            <button type="button" onClick={() => setDetailOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-full text-kx-muted hover:bg-kx-soft" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
              标题
              <input value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm font-semibold text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
              说明
              <textarea value={detailSummary} onChange={(e) => setDetailSummary(e.target.value)} rows={2} className="rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 py-2 text-sm text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                计划日期
                <input type="date" value={detailPlanned} onChange={(e) => setDetailPlanned(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                截止日期
                <input type="date" value={detailDue} onChange={(e) => setDetailDue(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                优先级
                <select value={detailPriority} onChange={(e) => setDetailPriority(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent">
                  <option value="high">高</option><option value="normal">普通</option><option value="low">低</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                重复
                <select value={detailRecurrence} onChange={(e) => setDetailRecurrence(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent">
                  <option value="">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                自定义清单
                <input value={detailListName} onChange={(e) => setDetailListName(e.target.value)} placeholder="例如：工作 / 日本生活" className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
                标签
                <input value={detailTags} onChange={(e) => setDetailTags(e.target.value)} placeholder="用逗号分隔，例如：重要, 电话" className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-bold text-kx-muted">
              备注
              <textarea value={detailNotes} onChange={(e) => setDetailNotes(e.target.value)} rows={4} className="rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 py-2 text-sm text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <GuideAttachmentManager entityType="guide_task" entityId={todo.id} compact title="任务附件" />
            {todo.sourceType ? (
              <div className="rounded-xl bg-kx-soft px-3 py-2 text-xs font-semibold text-kx-muted">来源：{todo.sourceType.replaceAll("_", " ")}{todo.journeyKey ? ` · ${todo.journeyKey}` : ""}</div>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-kx-stroke/60 pt-4">
            <button type="button" onClick={() => saveDetail.mutate()} disabled={saveDetail.isPending || !detailTitle.trim()} className="kx-button-primary min-h-11 px-5 disabled:opacity-60">
              {saveDetail.isPending ? "保存中" : "保存"}
            </button>
            {!done ? <button type="button" onClick={() => complete.mutate()} className="min-h-11 rounded-xl bg-kx-accentSoft px-4 text-sm font-bold text-kx-accent">标记完成</button> : null}
            <button type="button" onClick={() => duplicate.mutate()} disabled={duplicate.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-kx-soft px-4 text-sm font-bold text-kx-text"><Copy className="h-4 w-4" />复制</button>
            <button type="button" onClick={() => archive.mutate()} disabled={archive.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-kx-soft px-4 text-sm font-bold text-kx-text"><Archive className="h-4 w-4" />归档</button>
            <button type="button" onClick={() => {
              if (window.confirm("删除这个 Todo？删除后无法恢复。")) remove.mutate();
            }} disabled={remove.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-50 px-4 text-sm font-bold text-rose-600"><Trash2 className="h-4 w-4" />删除</button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}

export function GuideTodayTodos({ todos }: { todos: GuideTodo[] }) {
  return (
    <section>
      <SectionHeader icon={<CheckCircle2 className="h-4 w-4" />} title="今日待办" href="/guide/tasks" />
      {todos.length ? (
        <div className="space-y-3">
          {todos.slice(0, 3).map((todo) => <GuideTodoCard key={todo.id} todo={todo} compact />)}
        </div>
      ) : (
        <EmptyPanel title="今天没有安排" body="开始一个计划后，出愿、ES、面试、账单、签证和学习任务会出现在这里。" />
      )}
    </section>
  );
}

export function GuideUpcomingDeadlines({ todos }: { todos: GuideTodo[] }) {
  const deadlines = todos.filter((t) => t.dueAt || t.plannedDate).slice(0, 4);
  return (
    <section>
      <SectionHeader icon={<CalendarDays className="h-4 w-4" />} title="最近截止" href="/guide/calendar" />
      {deadlines.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {deadlines.map((todo) => <GuideTodoCard key={todo.id} todo={todo} compact />)}
        </div>
      ) : (
        <EmptyPanel title="还没有截止日期" body="添加大学出愿、公司 ES、面试、JLPT、房租或手机费后，Machi 会帮你倒排提醒。" />
      )}
    </section>
  );
}

export function GuideMaterialServiceRail({
  products = [],
  services = [],
}: {
  products?: GuideProduct[];
  services?: GuideProduct[];
}) {
  const recommended = [...products, ...services].slice(0, 5);
  const fallback = [
    ["先选择目标或添加 Todo", "资料和服务会根据你的 Todo、日期和目标自动浮现", Sparkles, "/guide/goals"],
  ] as const;
  if (recommended.length) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recommended.map((item) => <GuideRecommendationCard key={item.id} item={item} />)}
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {fallback.map(([title, body, Icon, href]) => (
        <Link key={title} href={href} className="kx-guide-context-empty flex items-start gap-3 p-4 transition hover:border-kx-accent/30">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-kx-text">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-kx-muted">{body}</span>
            <span className="mt-3 inline-flex rounded-full bg-kx-accent px-3 py-1.5 text-xs font-bold text-white">查看行动路径</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// A single recommended material / service card — the "tool to finish this task"
// surface that embeds the mall into todos and rails (spec §七/§十四).
export function GuideRecommendationCard({ item }: { item: GuideProduct }) {
  const Icon = item.isService ? Sparkles : FileText;
  return (
    <Link href={`/guide/products/${item.slug}`} className="kx-card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-kx-text">{item.title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-kx-muted">{item.subtitle || item.deliveryMethod || item.ctaLabel}</span>
        <span className="mt-2 inline-flex rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-accent">
          {item.isService ? "推荐服务" : "推荐资料"} · {item.ctaLabel || item.priceLabel || "查看详情"}
        </span>
      </span>
    </Link>
  );
}

// Date-grouped calendar list (今天/明天/未来…/未安排) shared by the calendar
// page and any plan view that wants an inline schedule (spec §十四).
export function GuideCalendarPanel({ todos }: { todos: GuideTodo[] }) {
  const groups = todos.reduce<Record<string, GuideTodo[]>>((acc, todo) => {
    const key = (todo.plannedDate || todo.dueAt || todo.reminderAt || "未安排").slice(0, 10);
    (acc[key] ||= []).push(todo);
    return acc;
  }, {});
  const dateKeys = Object.keys(groups).sort((a, b) => (a === "未安排" ? 1 : b === "未安排" ? -1 : a.localeCompare(b)));
  if (!dateKeys.length) {
    return <EmptyPanel title="日历还没有任务" body="开始一个计划，或添加学校/公司截止日期和生活账单。" />;
  }
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const labelDate = (d: string) => (d === "未安排" ? d : d === today ? "今天" : d === tomorrow ? "明天" : d);
  const datedKeys = dateKeys.filter((d) => d !== "未安排");
  const countdowns = datedKeys
    .map((date) => ({ date, days: daysUntil(date), todos: groups[date] }))
    .filter((item) => item.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);
  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <MonthGrid groups={groups} />
        <div className="kx-card p-4">
          <h2 className="text-lg font-black text-kx-text">最近倒数</h2>
          <div className="mt-3 space-y-2">
            {countdowns.length ? countdowns.map((item) => (
              <Link key={item.date} href="#calendar-list" className="flex items-center justify-between gap-3 rounded-kx-md border border-kx-stroke/50 bg-kx-card/70 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-black text-kx-text">{labelDate(item.date)}</span>
                  <span className="block truncate text-xs text-kx-muted">{item.todos[0]?.title || `${item.todos.length} 项任务`}</span>
                </span>
                <span className={(item.days <= 3 ? "bg-amber-400/15 text-amber-700" : "bg-kx-accentSoft text-kx-accent") + " shrink-0 rounded-full px-2.5 py-1 text-xs font-black"}>
                  {item.days === 0 ? "今天" : `${item.days} 天`}
                </span>
              </Link>
            )) : <p className="text-sm text-kx-muted">暂无可倒数的未来日期。</p>}
          </div>
        </div>
      </section>

      <div id="calendar-list" className="scroll-mt-20" />
      {dateKeys.map((date) => (
        <section key={date}>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-kx-accentSoft text-kx-accent">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-black text-kx-text">{labelDate(date)}</h2>
              <p className="text-xs text-kx-muted">{groups[date].length} 项任务</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {groups[date].map((todo) => <GuideTodoCard key={todo.id} todo={todo} compact />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function MonthGrid({ groups }: { groups: Record<string, GuideTodo[]> }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: Array<{ key: string; label: string; muted?: boolean; iso?: string; count?: number; urgent?: boolean }> = [];
  const startOffset = first.getDay();
  for (let i = 0; i < startOffset; i += 1) {
    cells.push({ key: `blank-${i}`, label: "", muted: true });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const items = groups[iso] || [];
    cells.push({ key: iso, label: String(day), iso, count: items.length, urgent: items.some((t) => t.priority === "high" || t.dueAt) });
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="kx-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black text-kx-text">{year} 年 {month + 1} 月</h2>
        <span className="rounded-full bg-kx-soft px-2.5 py-1 text-xs font-bold text-kx-muted">Guide 日历</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-kx-muted">
        {["日", "一", "二", "三", "四", "五", "六"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={
              "relative flex aspect-square items-start justify-start rounded-kx-sm border p-1.5 text-xs font-black " +
              (cell.iso === today ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : cell.count ? "border-kx-accent/25 bg-kx-card text-kx-text" : "border-transparent bg-kx-soft/45 text-kx-muted")
            }
          >
            {cell.label}
            {cell.count ? (
              <span className={(cell.urgent ? "bg-amber-500" : "bg-kx-accent") + " absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function daysUntil(date: string) {
  const start = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const end = new Date(date).getTime();
  return Math.ceil((end - start) / 86_400_000);
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-kx-lg border border-dashed border-kx-stroke/70 bg-kx-card/60 p-5 text-sm">
      <p className="font-black text-kx-text">{title}</p>
      <p className="mt-1 leading-6 text-kx-muted">{body}</p>
    </div>
  );
}

function SectionHeader({ icon, title, href }: { icon: React.ReactNode; title: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="inline-flex items-center gap-2 text-xl font-black tracking-[-0.01em] text-kx-text">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-kx-accentSoft text-kx-accent">{icon}</span>
        {title}
      </h2>
      {href ? <Link href={href} className="text-sm font-bold text-kx-accent">查看</Link> : null}
    </div>
  );
}

function TodoTag({ text, icon, tone = "muted" }: { text: string; icon?: React.ReactNode; tone?: "muted" | "warn" }) {
  const cls = tone === "warn" ? "bg-amber-400/15 text-amber-600 dark:text-amber-400" : "bg-kx-soft text-kx-muted";
  return <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " + cls}>{icon}{text}</span>;
}

function isOverdue(todo: GuideTodo) {
  const raw = todo.dueAt || todo.plannedDate;
  if (!raw || todo.status === "done") return false;
  return raw.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
