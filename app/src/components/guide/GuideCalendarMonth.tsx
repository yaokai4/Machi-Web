"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GuideTodo } from "@/lib/guide";
import { GuideTodoCard } from "@/components/guide/GuideOS";

// Spec P2 desktop calendar: left month grid (dots on days with tasks) + right
// panel showing the selected day's todos. Mobile keeps the grouped list
// (GuideCalendarPanel); this renders on lg+ only via the page's wrapper.
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function GuideCalendarMonth({ todos }: { todos: GuideTodo[] }) {
  const todayIso = iso(new Date());
  const byDate = useMemo(() => {
    const map: Record<string, GuideTodo[]> = {};
    for (const t of todos) {
      const key = (t.plannedDate || t.dueAt || t.reminderAt || "").slice(0, 10);
      if (key) (map[key] ||= []).push(t);
    }
    return map;
  }, [todos]);

  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(todayIso);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(1 - monthStart.getDay()); // back to the Sunday on/before the 1st
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  const monthLabel = `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月`;
  const dayTodos = byDate[selected] || [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="kx-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-kx-text">{monthLabel}</h2>
          <div className="flex gap-1">
            <button type="button" aria-label="上个月" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-xl border border-kx-stroke/60 text-kx-muted hover:text-kx-accent"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="今天" onClick={() => { setCursor(new Date()); setSelected(todayIso); }} className="rounded-xl border border-kx-stroke/60 px-2.5 text-xs font-bold text-kx-muted hover:text-kx-accent">今天</button>
            <button type="button" aria-label="下个月" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-xl border border-kx-stroke/60 text-kx-muted hover:text-kx-accent"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-kx-muted">
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const key = iso(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const count = byDate[key]?.length || 0;
            const isToday = key === todayIso;
            const isSel = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={[
                  "relative grid aspect-square place-items-center rounded-xl text-sm font-bold transition",
                  inMonth ? "text-kx-text" : "text-kx-muted/40",
                  isSel ? "bg-kx-accent text-white" : isToday ? "bg-kx-accentSoft text-kx-accent" : "hover:bg-kx-soft",
                ].join(" ")}
              >
                {d.getDate()}
                {count > 0 ? (
                  <span className={"absolute bottom-1 h-1.5 w-1.5 rounded-full " + (isSel ? "bg-white" : "bg-kx-accent")} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="mb-3 text-base font-black text-kx-text">{labelDate(selected)} · {dayTodos.length} 项</h3>
        {dayTodos.length ? (
          <div className="space-y-3">
            {dayTodos.map((t) => <GuideTodoCard key={t.id} todo={t} compact />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-kx-stroke/60 bg-kx-card/60 p-5 text-sm text-kx-muted">这一天没有任务。</p>
        )}
      </div>
    </div>
  );
}

function labelDate(date: string): string {
  const today = iso(new Date());
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  if (date === today) return "今天";
  if (date === iso(tmr)) return "明天";
  return date;
}
