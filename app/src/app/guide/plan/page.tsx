"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { guide, type GuideTodo } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel, GuideQuickAddTodo, GuideTodoCard } from "@/components/guide/GuideOS";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession } from "@/lib/store";

type TodoView = "my_day" | "important" | "planned" | "all" | "completed";

export default function GuidePlanPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const [view, setView] = useState<TodoView>("my_day");
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPlanId(params.get("planId") || undefined);
  }, []);
  const status = view === "completed" ? "done" : "open";
  const todos = useQuery({
    queryKey: ["guide", "todos", status, planId || "all", user?.id || "guest"],
    queryFn: () => guide.todos({ status, planId, limit: 120 }),
    enabled: Boolean(user),
  });
  const visibleTodos = useMemo(
    () => filterTodos(todos.data?.items || [], view, search, listFilter, tagFilter),
    [todos.data?.items, view, search, listFilter, tagFilter],
  );
  const customLists = useMemo(() => Array.from(new Set((todos.data?.items || []).map((todo) => todo.listName).filter(Boolean) as string[])).sort(), [todos.data?.items]);
  const tags = useMemo(() => Array.from(new Set((todos.data?.items || []).flatMap((todo) => todo.tags || []))).sort(), [todos.data?.items]);

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "今日" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Tasks</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">登录后管理你的待办</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">出愿、ES、面试、JLPT、签证、房租和水电网络手机费都会同步到服务器，iOS 和 Web 都能继续。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "今日" }}>
      <div className="space-y-8 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Tasks</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">待办</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">
            我的今天、重要、已计划和全部任务共用同一份数据；完成、改期和备注会立即同步到日历与 iOS。
          </p>
        </header>

        <GuideQuickAddTodo planId={planId} />

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-black text-kx-text">我的 Todo</h2>
              <p className="mt-0.5 text-xs text-kx-muted">我的一天、计划中、重要、已完成 · 申请、生活、日语都汇入这一套。</p>
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="待办筛选">
            {[
              ["my_day", "我的一天"],
              ["important", "重要"],
              ["planned", "已计划"],
              ["all", "所有任务"],
              ["completed", "已完成"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key as TodoView)}
                className={(view === key ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted hover:text-kx-accent") + " min-h-11 rounded-full px-4 text-xs font-black"}
              >
                {label}
              </button>
            ))}
            </div>
            <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 lg:w-72">
              <Search className="h-4 w-4 shrink-0 text-kx-muted" />
              <span className="sr-only">搜索任务</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索任务、备注或说明"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-kx-text outline-none placeholder:text-kx-muted"
              />
            </label>
          </div>
          {customLists.length || tags.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setListFilter(""); setTagFilter(""); }} className={(!listFilter && !tagFilter ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted") + " min-h-11 rounded-full px-4 text-xs font-black"}>全部清单</button>
              {customLists.map((list) => <button key={list} type="button" onClick={() => { setListFilter(list); setTagFilter(""); }} className={(listFilter === list ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted") + " min-h-11 rounded-full px-4 text-xs font-black"}>{list}</button>)}
              {tags.map((tag) => <button key={tag} type="button" onClick={() => { setTagFilter(tag); setListFilter(""); }} className={(tagFilter === tag ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted") + " min-h-11 rounded-full px-4 text-xs font-black"}>#{tag}</button>)}
            </div>
          ) : null}
          {todos.isLoading ? (
            <InlineLoading />
          ) : todos.isError ? (
            <ErrorState title="待办加载失败" subtitle="请检查网络后重试。" onRetry={() => todos.refetch()} />
          ) : visibleTodos.length ? (
            <div className="space-y-6">
              {groupTodosByWhen(visibleTodos, view).map(([label, items, warn]) =>
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
            <EmptyPanel title="这里还没有 Todo" body="直接输入一条 Todo，或从出愿/ES、生活缴费、日语学习生成任务。" />
          )}
        </section>
      </div>
    </GuideShell>
  );
}

// Spec P2 planning depth: bucket open todos into 逾期 / 今天 / 未来 7 天 / 以后
// so the user sees what's urgent first. Each tuple is [label, items, isWarn].
function filterTodos(items: GuideTodo[], view: TodoView, search: string, listFilter: string, tagFilter: string) {
  const today = isoDate(new Date());
  let scoped = items;
  if (view === "my_day") {
    scoped = items.filter((t) => {
      const when = (t.plannedDate || t.dueAt || "").slice(0, 10);
      return !when || when <= today;
    });
  }
  if (view === "planned") scoped = items.filter((t) => Boolean(t.plannedDate || t.dueAt || t.reminderAt));
  if (view === "important") scoped = items.filter((t) => t.priority === "high");
  if (listFilter) scoped = scoped.filter((todo) => todo.listName === listFilter);
  if (tagFilter) scoped = scoped.filter((todo) => (todo.tags || []).includes(tagFilter));
  const query = search.trim().toLocaleLowerCase();
  if (!query) return scoped;
  return scoped.filter((t) =>
    [t.title, t.summary, t.notes, t.todoType].some((value) => (value || "").toLocaleLowerCase().includes(query)),
  );
}

function groupTodosByWhen(items: GuideTodo[], view: string): [string, GuideTodo[], boolean][] {
  if (view === "completed") return [["已完成", items, false]];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekStr = isoDate(weekEnd);
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

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
