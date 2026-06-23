"use client";

import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  IdCard,
  Plus,
  Repeat,
  Sparkles,
  X,
} from "lucide-react";
import { guide, type GuideActivePlanResponse, type GuideProduct, type GuideProfile, type GuideTodo, type GuideTodoStep } from "@/lib/guide";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

export function GuideIdentityCard({ profile }: { profile?: GuideProfile | null }) {
  const label = profile?.identityType || "还未设置身份";
  const meta = [profile?.city, profile?.visaStatus, profile?.japaneseLevel].filter(Boolean).join(" · ");
  return (
    <Link href="/guide/profile" className="kx-card block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
          <IdCard className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-kx-muted">Guide Profile</p>
          <h3 className="mt-1 text-lg font-black text-kx-text">{label}</h3>
          <p className="mt-1 text-sm leading-6 text-kx-subtle">
            {meta || "设置身份后，Machi 会按你的阶段推荐升学、就职、日语、签证和生活计划。"}
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
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Start Here</p>
        <h2 className="mt-1.5 text-lg font-black tracking-[-0.01em] text-kx-text">还没有进行中的计划</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">
          {data?.identityType ? "根据你的身份，最相关的路径已经排在前面。" : "从主题或行动路径开始，生成 Todo、截止日期和提醒。"}
        </p>
        {suggested.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggested.map((j, i) => (
              <Link
                key={j.key}
                href={`/guide/journeys/${j.key}`}
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
          <Link href="/guide/journeys" className="kx-button-primary h-10 px-4">{suggested.length ? "查看全部路径" : "选择计划"}</Link>
          <Link href="/guide/profile" className="kx-button-secondary h-10 px-4">{data?.identityType ? "调整身份" : "设置身份"}</Link>
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
            <Link href="/guide/plan" className="kx-button-primary h-9 px-3 text-sm">查看计划</Link>
            <Link href="/guide/calendar" className="kx-button-secondary h-9 px-3 text-sm">日历</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GuideQuickAddTodo({ defaultDate, compact = false }: { defaultDate?: string; compact?: boolean }) {
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
    mutationFn: () => guide.createTodo({ content: text.trim(), plannedDate: date || undefined }),
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
  const done = todo.status === "done";
  const recurring = todo.recurrence === "daily" ? "每日循环" : todo.recurrence === "weekly" ? "每周循环" : "";
  return (
    <article className="kx-card p-4">
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
          {!compact && (todo.relatedProductSlugs.length || todo.relatedServiceSlugs.length) ? (
            <div className="mt-3 rounded-2xl bg-kx-accentSoft px-3 py-2 text-xs font-semibold text-kx-accent">
              完成这个任务有相关资料/服务可用
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function GuideTodayTodos({ todos }: { todos: GuideTodo[] }) {
  return (
    <section>
      <SectionHeader icon={<CheckCircle2 className="h-4 w-4" />} title="今日待办" href="/guide/plan" />
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
    ["先选择主题或生成计划", "资料和服务会根据你的 Todo、身份和目标自动浮现", Sparkles, "/guide/journeys"],
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
