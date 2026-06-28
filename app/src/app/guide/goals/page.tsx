"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Plus, Route, Target } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell, JourneyCard, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

export default function GuideGoalsPage() {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const journeys = useQuery({
    queryKey: ["guide", "journeys", country, language],
    queryFn: () => guide.journeys(country, language),
    enabled: country === "jp",
    staleTime: 60_000,
  });
  const plans = useQuery({
    queryKey: ["guide", "plans", user?.id || "guest"],
    queryFn: () => guide.plans(),
    enabled: Boolean(user),
  });
  const create = useMutation({
    mutationFn: () => guide.startPlan({
      planType: "custom",
      title: title.trim(),
      subtitle: "自定义目标",
      targetDate: targetDate || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "plans"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      setTitle("");
      setTargetDate("");
      setShowCreate(false);
      pushToast({ kind: "success", message: "目标已创建，可以从待办中添加下一步。" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "目标创建失败" }),
  });

  return (
    <GuideShell back={{ href: "/my/features", label: "我的工作台" }}>
      <div className="space-y-8 px-4 py-7 sm:px-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Goals</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">路径</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">长期目标只保留一份进度；Todo 是执行主线，日历负责时间，资料只在当前步骤需要时出现。</p>
          </div>
          <button
            type="button"
            onClick={() => user ? setShowCreate((value) => !value) : openAuthPrompt("generic")}
            className="kx-button-primary min-h-11 px-5"
          >
            <Plus className="h-4 w-4" /> 自定义目标
          </button>
        </header>

        {showCreate ? (
          <form className="grid gap-3 rounded-2xl border border-kx-stroke/60 bg-kx-card p-4 sm:grid-cols-[minmax(0,1fr)_190px_auto]" onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) create.mutate();
          }}>
            <label className="grid gap-1 text-xs font-bold text-kx-muted">
              目标名称
              <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：2027 年取得永住" className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-kx-muted">
              目标日期（可选）
              <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text outline-none focus:border-kx-accent" />
            </label>
            <button type="submit" disabled={!title.trim() || create.isPending} className="kx-button-primary min-h-11 self-end px-5 disabled:opacity-60">
              {create.isPending ? "创建中" : "创建"}
            </button>
          </form>
        ) : null}

        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black text-kx-text">进行中目标</h2>
            <p className="mt-1 text-xs text-kx-muted">查看完成进度、最近截止和下一条 Todo。</p>
          </div>
          {!user ? (
            <div className="rounded-2xl border border-kx-stroke/60 bg-kx-card p-5">
              <Target className="h-6 w-6 text-kx-accent" />
              <h3 className="mt-3 text-lg font-black text-kx-text">登录后保存目标进度</h3>
              <p className="mt-1 text-sm leading-6 text-kx-subtle">你仍可以浏览下方路径模板；登录后才会生成 Todo、日历和跨端同步。</p>
            </div>
          ) : plans.isLoading ? (
            <InlineLoading />
          ) : plans.isError ? (
            <ErrorState title="目标加载失败" subtitle="请检查网络后重试。" onRetry={() => plans.refetch()} />
          ) : plans.data?.items.filter((plan) => plan.status === "active").length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {plans.data.items.filter((plan) => plan.status === "active").map((plan) => (
                <article key={plan.id} className="rounded-2xl border border-kx-stroke/60 bg-kx-card p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-kx-accentSoft text-kx-accent"><Route className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-black text-kx-text">{plan.title}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-kx-muted">{plan.subtitle || "自定义目标"}</p>
                    </div>
                    <span className="text-sm font-black text-kx-accent">{plan.progressPercent}%</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-kx-soft">
                    <div className="h-full rounded-full bg-kx-accent" style={{ width: `${plan.progressPercent}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-kx-muted">
                    {plan.targetDate ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{plan.targetDate.slice(0, 10)}</span> : null}
                    {typeof plan.todoTotal === "number" ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{plan.todoDone || 0}/{plan.todoTotal}</span> : null}
                  </div>
                  {plan.nextTodo ? <p className="mt-3 rounded-xl bg-kx-soft px-3 py-2 text-xs font-semibold text-kx-text">下一步：{plan.nextTodo.title}</p> : null}
                  <div className="mt-3 flex gap-2">
                    {plan.sourceJourneyKey ? <Link href={`/guide/goals/${encodeURIComponent(plan.sourceJourneyKey)}`} className="kx-button-secondary min-h-11 px-4">查看路径</Link> : null}
                    <Link href={`/guide/tasks?planId=${encodeURIComponent(plan.id)}`} className="kx-button-primary min-h-11 px-4">查看 Todo</Link>
                  </div>
                  <div className="mt-4 border-t border-kx-stroke/60 pt-4">
                    <GuideAttachmentManager entityType="guide_goal" entityId={plan.id} title="目标附件" compact />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel title="还没有进行中目标" body="从下方选择一个路径，或创建自己的目标；不会自动塞入几十条任务。" />
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black text-kx-text">目标模板</h2>
            <p className="mt-1 text-xs text-kx-muted">JLPT、升学、就职、转职、签证、永住和搬家会生成可执行步骤。</p>
          </div>
          {journeys.isLoading ? <InlineLoading /> : journeys.isError ? (
            <ErrorState title="路径加载失败" subtitle="请稍后重试。" onRetry={() => journeys.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {(journeys.data?.journeys || []).map((journey) => <JourneyCard key={journey.key} journey={journey} />)}
            </div>
          )}
        </section>
      </div>
    </GuideShell>
  );
}
