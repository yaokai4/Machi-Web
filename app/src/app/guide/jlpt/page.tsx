"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Repeat, Sparkles } from "lucide-react";
import { guide, type GuideTodo } from "@/lib/guide";
import { GuideCategoryView } from "@/components/guide/GuideCategoryView";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const LEVELS = ["N1", "N2", "N3", "N4", "N5"];

export default function JlptPage() {
  return (
    <div className="space-y-2">
      <JlptStudyPlan />
      <GuideCategoryView categoryKey="jlpt" />
    </div>
  );
}

// Spec P0.2: turn a JLPT target into recurring STUDY HABITS (每日词汇 / 每周语法
// / 周末模考 + 错题复盘) plus registration & sprint milestones — not just a
// timeline. Server-first via POST /api/guide/study-plan.
function JlptStudyPlan() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [level, setLevel] = useState("N2");
  const [examDate, setExamDate] = useState("2026-12-06");
  const [dailyMinutes, setDailyMinutes] = useState("45");
  const [todos, setTodos] = useState<GuideTodo[] | null>(null);

  const gen = useMutation({
    mutationFn: () => guide.studyPlan({ targetLevel: level, examDate, dailyMinutes: Number(dailyMinutes || 30) }),
    onSuccess: (data) => {
      setTodos(data.todos);
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      pushToast({ kind: "success", message: `已生成 ${level} 备考习惯计划` });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "生成失败" }),
  });

  return (
    <section className="px-4 pt-7 sm:px-7">
      <div className="kx-card overflow-hidden p-0">
        <div className="kx-guide-hero p-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">
            <Sparkles className="h-3.5 w-3.5" /> JLPT 学习计划
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.02em] text-kx-text">把考级目标变成每天的学习习惯</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">
            输入目标级别、考试日和每天学习时间，Machi 会生成每日词汇、每周语法、周末模考与错题复盘等循环任务，并加入日历和提醒。
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
          <label className="block">
            <span className="text-sm font-black text-kx-text">目标级别</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-black text-kx-text">考试日期</span>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
          </label>
          <label className="block">
            <span className="text-sm font-black text-kx-text">每天学习（分钟）</span>
            <input type="number" min={10} max={600} value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
          </label>
          <button
            type="button"
            disabled={gen.isPending}
            onClick={() => (user ? gen.mutate() : openAuthPrompt("generic"))}
            className="kx-button-primary h-11 px-5 disabled:opacity-60"
          >
            {gen.isPending ? "生成中…" : "生成学习计划"}
          </button>
        </div>
        {todos?.length ? (
          <div className="border-t border-kx-stroke/50 p-5">
            <h2 className="mb-3 text-sm font-black text-kx-text">已生成 {todos.length} 个学习任务</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {todos.map((t) => (
                <div key={t.id} className="flex items-start gap-2 rounded-2xl border border-kx-stroke/50 bg-kx-card p-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-kx-accentSoft text-kx-accent">
                    {t.recurrence ? <Repeat className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-kx-text">{t.title}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-kx-muted">
                      {t.recurrence === "daily" ? "每日循环" : t.recurrence === "weekly" ? "每周循环" : t.plannedDate || t.dueAt || ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
