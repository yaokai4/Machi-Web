"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { guide, type GuideCalendarItem, type GuideTodo } from "@/lib/guide";
import { GuideTodoCard } from "@/components/guide/GuideOS";
import { GuideCalendarEventCard } from "@/components/guide/GuideCalendarEventCard";
import { useToasts } from "@/lib/store";

// Google Calendar-style week board + an agenda list, complementing the month
// grid (GuideCalendarMonth). Guide todos are date-granular (no time-of-day), so
// the week view stacks each day's items as event chips rather than hour slots.
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function groupByDate(todos: GuideTodo[]): Record<string, GuideTodo[]> {
  const map: Record<string, GuideTodo[]> = {};
  for (const t of todos) {
    const key = (t.plannedDate || t.dueAt || t.reminderAt || "").slice(0, 10);
    if (key) (map[key] ||= []).push(t);
  }
  return map;
}

function groupEventsByDate(events: GuideCalendarItem[]): Record<string, GuideCalendarItem[]> {
  const map: Record<string, GuideCalendarItem[]> = {};
  for (const event of events) {
    const key = (event.date || event.startAt || "").slice(0, 10);
    if (key) (map[key] ||= []).push(event);
  }
  return map;
}

function labelDate(date: string): string {
  const today = iso(new Date());
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  if (date === today) return "今天";
  if (date === iso(tmr)) return "明天";
  const d = new Date(date + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
}

export function GuideCalendarWeek({ todos, events }: { todos: GuideTodo[]; events: GuideCalendarItem[] }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((state) => state.push);
  const move = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => guide.updateTodo(id, { plannedDate: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      pushToast({ kind: "success", message: "已移动到新日期" });
    },
    onError: () => pushToast({ kind: "error", message: "日期调整失败，请重试" }),
  });
  const moveEvent = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => guide.updateCalendarEvent(id, { date, startAt: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      pushToast({ kind: "success", message: "日程已移动到新日期" });
    },
    onError: () => pushToast({ kind: "error", message: "日程调整失败，请重试" }),
  });
  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todayIso = iso(new Date());
  const [cursor, setCursor] = useState(() => new Date());

  const weekStart = new Date(cursor);
  weekStart.setDate(cursor.getDate() - cursor.getDay()); // back to Sunday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  const last = days[6];
  const rangeLabel = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${last.getMonth() + 1}月${last.getDate()}日`;
  const shiftWeek = (n: number) => {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + n * 7);
    setCursor(d);
  };

  return (
    <div className="kx-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black text-kx-text">{rangeLabel}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="上一周" onClick={() => shiftWeek(-1)} className="grid h-8 w-8 place-items-center rounded-xl border border-kx-stroke/60 text-kx-muted hover:text-kx-accent"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCursor(new Date())} className="rounded-xl border border-kx-stroke/60 px-2.5 text-xs font-bold text-kx-muted hover:text-kx-accent">本周</button>
          <button type="button" aria-label="下一周" onClick={() => shiftWeek(1)} className="grid h-8 w-8 place-items-center rounded-xl border border-kx-stroke/60 text-kx-muted hover:text-kx-accent"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-2">
          {days.map((d) => {
            const key = iso(d);
            const list = byDate[key] || [];
            const dayEvents = eventsByDate[key] || [];
            const isToday = key === todayIso;
            return (
              <div
                key={key}
                className="min-w-0 rounded-xl"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const todoId = event.dataTransfer.getData("text/guide-todo");
                  const calendarEventId = event.dataTransfer.getData("text/guide-event");
                  if (todoId) move.mutate({ id: todoId, date: key });
                  if (calendarEventId) moveEvent.mutate({ id: calendarEventId, date: key });
                }}
              >
                <div className={"mb-2 rounded-xl px-1 py-1.5 text-center " + (isToday ? "bg-kx-accent text-white" : "text-kx-text")}>
                  <div className="text-[11px] font-bold opacity-80">周{WEEKDAYS[d.getDay()]}</div>
                  <div className="text-sm font-black">{d.getDate()}</div>
                </div>
                <div className="min-h-[60px] space-y-1.5">
                  {dayEvents.map((calendarEvent) => (
                    <div
                      key={calendarEvent.id}
                      title={calendarEvent.title}
                      draggable
                      onDragStart={(dragEvent) => {
                        dragEvent.dataTransfer.effectAllowed = "move";
                        dragEvent.dataTransfer.setData("text/guide-event", calendarEvent.id);
                      }}
                      className="truncate rounded-lg border-l-2 border-violet-500 bg-violet-500/10 px-2 py-1.5 text-[11px] font-semibold leading-tight text-kx-text"
                    >
                      {calendarEvent.allDay ? "全天 · " : ""}{calendarEvent.title}
                    </div>
                  ))}
                  {list.map((t) => (
                    <div
                      key={t.id}
                      title={t.title}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/guide-todo", t.id);
                      }}
                      className={"truncate rounded-lg border-l-2 px-2 py-1.5 text-[11px] font-semibold leading-tight " + (t.status === "done" ? "border-kx-muted bg-kx-soft/60 text-kx-muted line-through" : "border-kx-accent bg-kx-accentSoft text-kx-text")}
                    >
                      {t.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GuideCalendarAgenda({ todos, events }: { todos: GuideTodo[]; events: GuideCalendarItem[] }) {
  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todayIso = iso(new Date());
  const overdue = useMemo(
    () => Object.keys(byDate).filter((d) => d < todayIso).sort().flatMap((d) => byDate[d]),
    [byDate, todayIso],
  );
  const overdueEvents = useMemo(
    () => Object.keys(eventsByDate).filter((d) => d < todayIso).sort().flatMap((d) => eventsByDate[d]),
    [eventsByDate, todayIso],
  );
  const upcoming = useMemo(
    () => Array.from(new Set([...Object.keys(byDate), ...Object.keys(eventsByDate)])).filter((d) => d >= todayIso).sort(),
    [byDate, eventsByDate, todayIso],
  );

  if (!overdue.length && !overdueEvents.length && !upcoming.length) {
    return <p className="rounded-2xl border border-dashed border-kx-stroke/60 bg-kx-card/60 p-6 text-sm text-kx-muted">接下来没有安排。开始一个计划或添加生活账单后，任务会按日期出现在这里。</p>;
  }
  return (
    <div className="space-y-6">
      {overdue.length || overdueEvents.length ? (
        <section>
          <h3 className="mb-2 text-sm font-black text-rose-500">逾期 <span className="font-bold text-rose-400/80">· {overdue.length + overdueEvents.length}</span></h3>
          <div className="space-y-3">
            {overdueEvents.map((event) => <GuideCalendarEventCard key={event.id} event={event} compact />)}
            {overdue.map((t) => <GuideTodoCard key={t.id} todo={t} compact />)}
          </div>
        </section>
      ) : null}
      {upcoming.map((d) => (
        <section key={d}>
          <h3 className="mb-2 text-sm font-black text-kx-text">{labelDate(d)} <span className="font-bold text-kx-muted">· {(byDate[d]?.length || 0) + (eventsByDate[d]?.length || 0)}</span></h3>
          <div className="space-y-3">
            {(eventsByDate[d] || []).map((event) => <GuideCalendarEventCard key={event.id} event={event} compact />)}
            {(byDate[d] || []).map((t) => <GuideTodoCard key={t.id} todo={t} compact />)}
          </div>
        </section>
      ))}
    </div>
  );
}
