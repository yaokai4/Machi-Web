"use client";

import Link from "next/link";
import type React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  GraduationCap,
  IdCard,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { guide, type GuideActivePlanResponse, type GuideProduct, type GuideProfile, type GuideTodo } from "@/lib/guide";
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
      <section className="kx-guide-hero p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accent text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Machi Guide OS</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-kx-text">把日本大事变成你的计划</h2>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">登录后可以保存出愿、ES、面试、JLPT、签证、房租和水电网络手机费的 Todo 与提醒。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-4 h-10 px-4">
              登录后开始计划
            </button>
          </div>
        </div>
      </section>
    );
  }
  if (!plan) {
    return (
      <section className="kx-guide-hero p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Start Here</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-kx-text">你现在想完成哪件日本大事？</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">选择一个行动路径，Machi 会生成 Todo、截止日期、提醒、资料和服务推荐。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/guide/journeys" className="kx-button-primary h-10 px-4">选择计划</Link>
          <Link href="/guide/profile" className="kx-button-secondary h-10 px-4">设置身份</Link>
        </div>
      </section>
    );
  }
  const total = plan.todoTotal ?? 0;
  const done = plan.todoDone ?? 0;
  return (
    <section className="kx-guide-hero p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">继续你的日本计划</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-kx-text">{plan.title}</h2>
          <p className="mt-1 text-sm leading-6 text-kx-subtle">{plan.subtitle || "把关键事项按日期一步步完成。"}</p>
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
        <div className="shrink-0 rounded-2xl border border-kx-stroke/50 bg-white/70 p-4 dark:bg-white/5 lg:w-72">
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

export function GuideTodoCard({ todo, compact = false }: { todo: GuideTodo; compact?: boolean }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const complete = useMutation({
    mutationFn: () => guide.completeTodo(todo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "任务更新失败" }),
  });
  const done = todo.status === "done";
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
            {todo.reminderAt ? <TodoTag icon={<Bell className="h-3 w-3" />} text="已提醒" /> : null}
            {todo.estimatedMinutes ? <TodoTag icon={<Clock3 className="h-3 w-3" />} text={`${todo.estimatedMinutes} 分钟`} /> : null}
          </div>
          <h3 className={"mt-2 text-[15px] font-black leading-snug " + (done ? "text-kx-muted line-through" : "text-kx-text")}>{todo.title}</h3>
          {!compact && todo.summary ? <p className="mt-1 text-sm leading-6 text-kx-subtle">{todo.summary}</p> : null}
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
    ["研究计划书模板", "大学院出愿、教授联系、面试准备", GraduationCap, "/guide/services"],
    ["ES / 职务经歴书修改", "新卒就活和社会人转职都能用", FileText, "/guide/services"],
    ["生活手续清单", "房租、水电网络、手机、签证更新", WalletCards, "/guide/services"],
  ] as const;
  if (recommended.length) {
    return (
      <div className="space-y-3">
        {recommended.map((item) => {
          const Icon = item.isService ? Sparkles : FileText;
          return (
            <Link key={item.id} href={`/guide/products/${item.slug}`} className="kx-card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
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
        })}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {fallback.map(([title, body, Icon, href]) => (
        <Link key={title} href={href} className="kx-card flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/30">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-kx-text">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-kx-muted">{body}</span>
          </span>
        </Link>
      ))}
    </div>
  );
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
