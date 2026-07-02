"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Trash2, X } from "lucide-react";
import { guide, type GuideCalendarItem } from "@/lib/guide";
import { useToasts } from "@/lib/store";

export function GuideCalendarEventCard({ event, compact = false }: { event: GuideCalendarItem; compact?: boolean }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((state) => state.push);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState((event.date || "").slice(0, 10));
  const [time, setTime] = useState(extractTime(event.startAt));
  const [notes, setNotes] = useState(event.notes || "");
  const [recurrence, setRecurrence] = useState(event.recurrence || "");
  const [allDay, setAllDay] = useState(event.allDay !== false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
  const update = useMutation({
    mutationFn: () => guide.updateCalendarEvent(event.id, {
      title: title.trim(),
      date,
      startAt: allDay || !time ? date : `${date}T${time}`,
      notes: notes.trim(),
      recurrence,
      allDay,
    }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      pushToast({ kind: "success", message: "日程已更新" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "日程更新失败" }),
  });
  const remove = useMutation({
    mutationFn: () => guide.deleteCalendarEvent(event.id),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      pushToast({ kind: "success", message: "日程已删除" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "删除失败" }),
  });
  const show = () => {
    setTitle(event.title);
    setDate((event.date || "").slice(0, 10));
    setTime(extractTime(event.startAt));
    setNotes(event.notes || "");
    setRecurrence(event.recurrence || "");
    setAllDay(event.allDay !== false);
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={show} className={"w-full rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.07] text-left transition hover:border-indigo-500/30 " + (compact ? "p-3" : "p-4")}>
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/12 text-indigo-600"><CalendarDays className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-kx-text">{event.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-kx-muted">
              <span>{(event.date || "").slice(0, 10)}</span>
              {!event.allDay && extractTime(event.startAt) ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{extractTime(event.startAt)}</span> : <span>全天</span>}
              {event.recurrence ? <span>{recurrenceLabel(event.recurrence)}</span> : null}
            </span>
          </span>
        </div>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[85] grid place-items-end bg-black/30 sm:place-items-center sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="日程详情" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-kx-card p-5 shadow-2xl sm:max-w-xl sm:rounded-kx-sheet">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-kx-text">日程详情</h2>
              <button type="button" onClick={() => setOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-full text-kx-muted hover:bg-kx-soft" aria-label="关闭"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-xs font-bold text-kx-muted">标题<input value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-kx-muted">日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
                <label className="grid gap-1 text-xs font-bold text-kx-muted">时间<input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={allDay} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text disabled:opacity-50" /></label>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-kx-text"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />全天日程</label>
              <label className="grid gap-1 text-xs font-bold text-kx-muted">重复<select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text"><option value="">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="yearly">每年</option></select></label>
              <label className="grid gap-1 text-xs font-bold text-kx-muted">备注<textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 py-2 text-sm text-kx-text" /></label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-kx-stroke/60 pt-4">
              <button type="button" onClick={() => update.mutate()} disabled={update.isPending || !title.trim() || !date} className="kx-button-primary min-h-11 px-5 disabled:opacity-60">{update.isPending ? "保存中" : "保存"}</button>
              <button type="button" onClick={() => window.confirm("删除这个日程？") && remove.mutate()} disabled={remove.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-50 px-4 text-sm font-bold text-rose-600"><Trash2 className="h-4 w-4" />删除</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function extractTime(value?: string | null) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);
  return match?.[1] || "";
}

function recurrenceLabel(value: string) {
  return ({ daily: "每天", weekly: "每周", monthly: "每月", yearly: "每年" } as Record<string, string>)[value] || value;
}
