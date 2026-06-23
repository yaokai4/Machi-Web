"use client";

import Link from "next/link";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks, PlusCircle, FileText } from "lucide-react";
import { guide, type GuideTodo } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel, GuidePlanSummary, GuideTodoCard } from "@/components/guide/GuideOS";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession } from "@/lib/store";

export default function GuidePlanPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const active = useQuery({
    queryKey: ["guide", "active-plan", user?.id || "guest"],
    queryFn: () => guide.activePlan(),
    enabled: Boolean(user),
    retry: false,
  });
  const todos = useQuery({
    queryKey: ["guide", "todos", "open", user?.id || "guest"],
    queryFn: () => guide.todos({ status: "open", limit: 80 }),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Guide Plan</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">登录后管理你的日本计划</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">出愿、ES、面试、JLPT、签证、房租和水电网络手机费都会同步到服务器，iOS 和 Web 都能继续。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <div className="space-y-8 px-4 py-7 sm:px-7">
        {active.isLoading ? <InlineLoading /> : active.isError ? <ErrorState title="计划加载失败" subtitle="请稍后重试。" onRetry={() => active.refetch()} /> : <GuidePlanSummary data={active.data} />}

        <section className="grid gap-3 sm:grid-cols-2">
          <PlanLink href="/guide/journeys" icon={<PlusCircle className="h-5 w-5" />} title="开始新计划" body="刚到日本、大学院、就职、转职、JLPT、签证" />
          <PlanLink href="/guide/calendar" icon={<CalendarDays className="h-5 w-5" />} title="计划日历" body="查看今天、本周、本月和逾期任务" />
          <PlanLink href="/guide/life" icon={<ListChecks className="h-5 w-5" />} title="生活日程" body="房租、水电网络、手机、保险和签证" />
          <PlanLink href="/guide/applications" icon={<FileText className="h-5 w-5" />} title="出愿 / ES / 面试" body="学校出愿、新卒、转职、JLPT 倒排计划" />
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-black text-kx-text">全部未完成 Todo</h2>
              <p className="mt-0.5 text-xs text-kx-muted">来自出愿、ES、面试、日语、签证和生活账单 · 可逐项完成或改期。</p>
            </div>
          </div>
          {todos.isLoading ? (
            <InlineLoading />
          ) : todos.data?.items.length ? (
            <div className="space-y-6">
              {groupTodosByWhen(todos.data.items).map(([label, items, warn]) =>
                items.length ? (
                  <div key={label}>
                    <h3 className={"mb-2 text-sm font-black " + (warn ? "text-rose-500" : "text-kx-text")}>
                      {label} <span className="font-bold text-kx-muted">· {items.length}</span>
                    </h3>
                    <div className="space-y-3">
                      {items.map((todo) => <GuideTodoCard key={todo.id} todo={todo} />)}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          ) : (
            <EmptyPanel title="还没有 Todo" body="从一个行动路径开始，或添加生活账单、学校/公司截止日期。" />
          )}
        </section>
      </div>
    </GuideShell>
  );
}

// Spec P2 planning depth: bucket open todos into 逾期 / 今天 / 未来 7 天 / 以后
// so the user sees what's urgent first. Each tuple is [label, items, isWarn].
function groupTodosByWhen(items: GuideTodo[]): [string, GuideTodo[], boolean][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = iso(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekStr = iso(weekEnd);
  const overdue: GuideTodo[] = [], todayList: GuideTodo[] = [], soon: GuideTodo[] = [], later: GuideTodo[] = [];
  for (const t of items) {
    const when = (t.plannedDate || t.dueAt || "").slice(0, 10);
    if (!when) later.push(t);
    else if (when < todayStr) overdue.push(t);
    else if (when === todayStr) todayList.push(t);
    else if (when <= weekStr) soon.push(t);
    else later.push(t);
  }
  const byDate = (a: GuideTodo, b: GuideTodo) => ((a.plannedDate || a.dueAt || "z") < (b.plannedDate || b.dueAt || "z") ? -1 : 1);
  return [
    ["逾期", overdue.sort(byDate), true],
    ["今天", todayList.sort(byDate), false],
    ["未来 7 天", soon.sort(byDate), false],
    ["以后 / 待安排", later.sort(byDate), false],
  ];
}

function PlanLink({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="kx-card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">{icon}</span>
      <span>
        <span className="block text-sm font-black text-kx-text">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-kx-muted">{body}</span>
      </span>
    </Link>
  );
}
