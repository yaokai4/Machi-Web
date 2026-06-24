"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Circle, Clock3, FileText, Package, ShieldCheck, Signpost } from "lucide-react";
import { guide, isGuideArticleStale, type GuideJourneyStep } from "@/lib/guide";
import { GuideShell, GuideComingSoon, journeyIconFor, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

export default function GuideJourneyDetailPage() {
  const params = useParams();
  const key = String(params?.key || "");
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["guide", "journey", country, language, key, user?.id || "anon"],
    queryFn: () => guide.journey(key, country, language),
    enabled: country === "jp" && key.length > 0,
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: (vars: { stepKey: string; done: boolean }) =>
      guide.updateProgress({ journeyKey: key, stepKey: vars.stepKey, status: vars.done ? "done" : "not_started" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "journey", country, language, key] });
      queryClient.invalidateQueries({ queryKey: ["guide", "progress"] });
    },
    onError: () => pushToast({ kind: "error", message: "进度未能保存，请稍后再试。" }),
  });
  const scheduleStep = useMutation({
    mutationFn: (vars: { stepKey: string; date: string }) =>
      guide.updateProgress({
        journeyKey: key,
        stepKey: vars.stepKey,
        status: q.data?.progress?.[vars.stepKey]?.status || "in_progress",
        plannedDate: vars.date,
        dueAt: vars.date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "journey", country, language, key] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      pushToast({ kind: "success", message: "已安排到 Guide 日历。" });
    },
    onError: () => pushToast({ kind: "error", message: "安排失败，请稍后再试。" }),
  });
  const startPlan = useMutation({
    mutationFn: () => guide.startPlan({ journeyKey: key, planType: data?.journey.audience || "guide" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      pushToast({ kind: "success", message: "计划已生成，Todo 已加入日历。" });
    },
    onError: () => pushToast({ kind: "error", message: "计划生成失败，请稍后再试。" }),
  });

  const data = q.data;
  const progress = data?.progress ?? {};
  const steps = data?.steps ?? [];
  const done = steps.filter((s) => progress[s.stepKey]?.status === "done").length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const onToggle = (step: GuideJourneyStep) => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    const isDone = progress[step.stepKey]?.status === "done";
    toggle.mutate({ stepKey: step.stepKey, done: !isDone });
  };
  const onSchedule = (step: GuideJourneyStep, date: string) => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    scheduleStep.mutate({ stepKey: step.stepKey, date });
  };

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide/goals", label: "路径" }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide/goals", label: "路径" }}>
      <div className="px-4 py-7 sm:px-7">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState title="路径加载失败" subtitle="请稍后重试。" onRetry={() => q.refetch()} />
        ) : !data ? (
          <div className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-8 text-center text-sm text-kx-muted">
            未找到该路径。
          </div>
        ) : (
          <>
            <JourneyHero
              icon={data.journey.icon}
              color={data.journey.color}
              title={data.journey.heroTitle || data.journey.title}
              subtitle={data.journey.heroSubtitle}
              estimatedDays={data.journey.estimatedDays}
              done={done}
              total={total}
              pct={pct}
              updatedAt={data.updatedAt || data.journey.updatedAt}
              loggedIn={Boolean(user)}
              pendingStart={startPlan.isPending}
              onStart={() => {
                if (!user) {
                  openAuthPrompt("generic");
                  return;
                }
                startPlan.mutate();
              }}
            />
            <div className="mt-6 space-y-3">
              {steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index + 1}
                  isDone={progress[step.stepKey]?.status === "done"}
                  scheduledDate={progress[step.stepKey]?.plannedDate || progress[step.stepKey]?.dueAt}
                  pending={toggle.isPending || scheduleStep.isPending}
                  onToggle={() => onToggle(step)}
                  onSchedule={(date) => onSchedule(step, date)}
                />
              ))}
            </div>
            {data.disclaimer ? (
              <p className="mt-5 text-[11px] leading-5 text-kx-muted">{data.disclaimer}</p>
            ) : null}
          </>
        )}
      </div>
    </GuideShell>
  );
}

function JourneyHero({
  icon,
  color,
  title,
  subtitle,
  estimatedDays,
  done,
  total,
  pct,
  updatedAt,
  loggedIn,
  pendingStart,
  onStart,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  estimatedDays: number;
  done: number;
  total: number;
  pct: number;
  updatedAt?: string | null;
  loggedIn: boolean;
  pendingStart: boolean;
  onStart: () => void;
}) {
  const Icon = journeyIconFor(icon);
  return (
    <header className="kx-card">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ backgroundColor: color || "#147067" }}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-black leading-tight tracking-[-0.01em] text-kx-text">{title}</h1>
          {estimatedDays > 0 ? <p className="mt-0.5 text-xs font-bold text-kx-muted">预计 {estimatedDays} 天</p> : null}
        </div>
      </div>
      {subtitle ? <p className="mt-3 text-sm leading-6 text-kx-subtle">{subtitle}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-kx-md border border-kx-stroke/50 bg-kx-card/70 px-3 py-2 text-[11px] font-semibold leading-5 text-kx-muted">
        <span className="inline-flex items-center gap-1 text-kx-accent">
          <ShieldCheck className="h-3.5 w-3.5" />
          可信路径
        </span>
        {updatedAt ? <span>更新 {compactDate(updatedAt)}</span> : null}
        <span>政策、出愿和官方手续可能变化，执行前请确认最新公告。</span>
      </div>
      {total > 0 ? (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs font-bold">
            <span className="text-kx-accent">已完成 {done}/{total}</span>
            <span className="text-kx-muted">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-kx-soft">
            <div className="h-full rounded-full bg-kx-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onStart} disabled={pendingStart} className="kx-button-primary h-10 px-4 disabled:opacity-60">
          <CalendarPlus className="h-4 w-4" /> {loggedIn ? "生成 Todo 计划" : "登录后生成计划"}
        </button>
        <Link href="/guide/plan" className="kx-button-secondary h-10 px-4">查看我的计划</Link>
      </div>
    </header>
  );
}

function compactDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StepRow({
  step,
  index,
  isDone,
  scheduledDate,
  pending,
  onToggle,
  onSchedule,
}: {
  step: GuideJourneyStep;
  index: number;
  isDone: boolean;
  scheduledDate?: string | null;
  pending: boolean;
  onToggle: () => void;
  onSchedule: (date: string) => void;
}) {
  return (
    <section className="kx-card">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label={isDone ? "标记为未完成" : "标记为完成"}
          className="mt-0.5 shrink-0 text-kx-accent disabled:opacity-50"
        >
          {isDone ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6 text-kx-muted" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black text-kx-accent">第 {index} 步</span>
            {!step.required ? <Tag text="可选" /> : null}
            {step.estimatedMinutes > 0 ? <Tag text={`建议预留 ${Math.min(step.estimatedMinutes, 30)} 分`} icon={<Clock3 className="h-3 w-3" />} /> : null}
            {scheduledDate ? <Tag text={`已安排 ${String(scheduledDate).slice(0, 10)}`} /> : null}
            {step.deadlineHint ? <Tag text={step.deadlineHint} tone="warn" /> : null}
          </div>
          <h3 className={"mt-1 text-[15px] font-black " + (isDone ? "text-kx-muted line-through" : "text-kx-text")}>
            {step.title}
          </h3>
          {step.summary ? <p className="mt-1 text-sm leading-6 text-kx-subtle">{step.summary}</p> : null}

          {step.relatedArticles?.length ? (
            <div className="mt-3 space-y-1.5">
              {step.relatedArticles.slice(0, 3).map((a) => {
                const stamp = (a.verifiedAt || a.publishedAt || a.updatedAt || "").slice(0, 10);
                const stale = isGuideArticleStale(a);
                return (
                  <Link
                    key={a.id}
                    href={`/guide/articles/${a.slug}`}
                    className="flex items-center gap-2 rounded-xl bg-kx-soft px-3 py-2 text-xs font-semibold text-kx-text hover:text-kx-accent"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-kx-accent" />
                    <span className="truncate">{a.title}</span>
                    {stamp ? (
                      <span className={"ml-auto shrink-0 text-[10px] font-medium " + (stale ? "text-amber-600" : "text-kx-subtle")}>
                        {stale ? "需复核 · " : "更新于 "}{stamp}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {step.relatedProducts?.length ? (
            <div className="mt-2 space-y-1.5">
              {step.relatedProducts.slice(0, 2).map((p) => (
                <Link
                  key={p.id}
                  href={`/guide/products/${p.slug}`}
                  className="flex items-center gap-2 rounded-xl bg-kx-accentSoft px-3 py-2 text-xs font-semibold text-kx-text hover:text-kx-accent"
                >
                  <Package className="h-3.5 w-3.5 shrink-0 text-kx-accent" />
                  <span className="truncate">{p.title}</span>
                </Link>
              ))}
            </div>
          ) : null}

          {!isDone ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-bold text-kx-muted">安排到日历</span>
              {[
                ["今天", 0],
                ["明天", 1],
                ["+7 天", 7],
              ].map(([label, days]) => (
                <button
                  key={String(label)}
                  type="button"
                  disabled={pending}
                  onClick={() => onSchedule(isoShift(Number(days)))}
                  className="rounded-full border border-kx-stroke/60 bg-kx-card px-2.5 py-1 text-[11px] font-black text-kx-subtle transition hover:border-kx-accent/40 hover:bg-kx-accentSoft hover:text-kx-accent disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {step.actionType === "journey" && step.actionTarget ? (
            <Link
              href={`/guide/goals/${encodeURIComponent(step.actionTarget)}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-kx-accent hover:underline"
            >
              <Signpost className="h-3.5 w-3.5" /> 查看该路径
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Tag({ text, icon, tone = "muted" }: { text: string; icon?: ReactNode; tone?: "muted" | "warn" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-400/15 text-amber-600 dark:text-amber-400"
      : "bg-kx-soft text-kx-muted";
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " + cls}>
      {icon}
      {text}
    </span>
  );
}
