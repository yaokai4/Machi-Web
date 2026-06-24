"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { guide, type GuideCalendarItem, type GuideTodo } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { GuideQuickAddTodo } from "@/components/guide/GuideOS";
import { GuideCalendarMonth } from "@/components/guide/GuideCalendarMonth";
import { GuideCalendarWeek, GuideCalendarAgenda } from "@/components/guide/GuideCalendarWeek";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

export default function GuideCalendarPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const range = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const end = new Date();
    end.setDate(end.getDate() + 365);
    return { from: isoDate(start), to: isoDate(end) };
  }, []);
  const q = useQuery({
    queryKey: ["guide", "calendar", user?.id || "guest", range.from, range.to],
    queryFn: () => guide.calendar({ ...range, limit: 200 }),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "今日" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <CalendarDays className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后查看 Guide 日历</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">出愿、ES、面试、考试、签证、房租和手机费会按日期出现在这里。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  const items = q.data?.items || [];
  const todos = (items.map((item) => item.todo).filter(Boolean) as GuideTodo[] | undefined) || [];
  const events = items.filter((item) => !item.todo);
  return <CalendarBody todos={todos} events={events} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()} />;
}

type CalView = "month" | "week" | "agenda";
type CalScope = "all" | "7" | "30" | "overdue";
const VIEW_LABELS: Record<CalView, string> = { month: "月", week: "周", agenda: "日程" };

function CalendarBody({ todos, events, loading, error, onRetry }: { todos: GuideTodo[]; events: GuideCalendarItem[]; loading: boolean; error: boolean; onRetry: () => void }) {
  const [view, setView] = useState<CalView>("month");
  const [scope, setScope] = useState<CalScope>("all");
  const visibleTodos = useMemo(() => filterCalendarTodos(todos, scope), [todos, scope]);
  const visibleEvents = useMemo(() => filterCalendarEvents(events, scope), [events, scope]);
  return (
    <GuideShell back={{ href: "/guide", label: "今日" }}>
      <div className="space-y-7 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Guide Calendar</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">日历</h1>
          <p className="mt-2 text-sm leading-7 text-kx-subtle">统一管理生活账单、签证、大学出愿、公司 ES、面试和日语学习任务。</p>
        </header>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-kx-stroke/60 bg-kx-card p-1">
            {(Object.keys(VIEW_LABELS) as CalView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (view === v ? "bg-kx-accent text-white" : "text-kx-muted hover:text-kx-accent")}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="日期范围">
          {([
            ["all", "全部"],
            ["7", "未来 7 天"],
            ["30", "未来 30 天"],
            ["overdue", "逾期"],
          ] as [CalScope, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={(scope === key ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted hover:text-kx-accent") + " min-h-11 rounded-full px-4 text-xs font-black"}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="lg:hidden">
          <GuideQuickAddTodo defaultDate={isoDate(new Date())} />
        </div>
        <CalendarEventComposer />

        {loading ? (
          <InlineLoading />
        ) : error ? (
          <ErrorState title="日历加载失败" subtitle="请稍后重试。" onRetry={onRetry} />
        ) : view === "month" ? (
          <GuideCalendarMonth todos={visibleTodos} events={visibleEvents} />
        ) : view === "week" ? (
          <GuideCalendarWeek todos={visibleTodos} events={visibleEvents} />
        ) : (
          <GuideCalendarAgenda todos={visibleTodos} events={visibleEvents} />
        )}
      </div>
    </GuideShell>
  );
}

function CalendarEventComposer() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((state) => state.push);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [time, setTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [notes, setNotes] = useState("");
  const create = useMutation({
    mutationFn: () => guide.createCalendarEvent({
      title: title.trim(),
      date,
      startAt: allDay || !time ? date : `${date}T${time}`,
      type: "event",
      allDay,
      notes: notes.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      setTitle("");
      setNotes("");
      setOpen(false);
      pushToast({ kind: "success", message: "日程已添加" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "日程添加失败" }),
  });
  return (
    <section className="rounded-2xl border border-kx-stroke/60 bg-kx-card p-4">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between text-left">
        <span><span className="block text-sm font-black text-kx-text">新建日程</span><span className="mt-0.5 block text-xs text-kx-muted">会议、预约和个人安排，不会伪装成 Todo。</span></span>
        <Plus className={"h-5 w-5 text-kx-accent transition " + (open ? "rotate-45" : "")} />
      </button>
      {open ? (
        <form className="mt-4 grid gap-3 border-t border-kx-stroke/60 pt-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (title.trim() && date) create.mutate(); }}>
          <label className="grid gap-1 text-xs font-bold text-kx-muted sm:col-span-2">日程标题<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：大学院线上说明会" className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
          <label className="grid gap-1 text-xs font-bold text-kx-muted">日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
          <label className="grid gap-1 text-xs font-bold text-kx-muted">时间<input type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={allDay} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text disabled:opacity-50" /></label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-kx-text"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />全天</label>
          <label className="grid gap-1 text-xs font-bold text-kx-muted sm:col-span-2">备注<input value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
          <button type="submit" disabled={create.isPending || !title.trim() || !date} className="kx-button-primary min-h-11 self-end px-5 disabled:opacity-60">{create.isPending ? "添加中" : "添加日程"}</button>
        </form>
      ) : null}
    </section>
  );
}

function filterCalendarTodos(todos: GuideTodo[], scope: CalScope) {
  if (scope === "all") return todos;
  const today = isoDate(new Date());
  if (scope === "overdue") {
    return todos.filter((todo) => {
      const date = (todo.plannedDate || todo.dueAt || todo.reminderAt || "").slice(0, 10);
      return date && date < today && todo.status !== "done";
    });
  }
  const end = new Date();
  end.setDate(end.getDate() + Number(scope));
  const endDate = isoDate(end);
  return todos.filter((todo) => {
    const date = (todo.plannedDate || todo.dueAt || todo.reminderAt || "").slice(0, 10);
    return date >= today && date <= endDate;
  });
}

function filterCalendarEvents(events: GuideCalendarItem[], scope: CalScope) {
  if (scope === "all") return events;
  const today = isoDate(new Date());
  if (scope === "overdue") return events.filter((event) => Boolean(event.date && event.date.slice(0, 10) < today));
  const end = new Date();
  end.setDate(end.getDate() + Number(scope));
  const endDate = isoDate(end);
  return events.filter((event) => {
    const date = (event.date || "").slice(0, 10);
    return date >= today && date <= endDate;
  });
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
