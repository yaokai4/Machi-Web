"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock3, FileText, Package, Signpost } from "lucide-react";
import { guide, type GuideJourneyStep } from "@/lib/guide";
import { GuideShell, GuideComingSoon, journeyIconFor, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

export default function GuideJourneyDetailPage() {
  const params = useParams();
  const key = String(params?.key || "");
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
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

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide/journeys", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide/journeys", label: copy.back }}>
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
            />
            <div className="mt-6 space-y-3">
              {steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index + 1}
                  isDone={progress[step.stepKey]?.status === "done"}
                  pending={toggle.isPending}
                  onToggle={() => onToggle(step)}
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
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  estimatedDays: number;
  done: number;
  total: number;
  pct: number;
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
    </header>
  );
}

function StepRow({
  step,
  index,
  isDone,
  pending,
  onToggle,
}: {
  step: GuideJourneyStep;
  index: number;
  isDone: boolean;
  pending: boolean;
  onToggle: () => void;
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
            {step.estimatedMinutes > 0 ? (
              <Tag text={`约 ${step.estimatedMinutes} 分钟`} icon={<Clock3 className="h-3 w-3" />} />
            ) : null}
            {step.deadlineHint ? <Tag text={step.deadlineHint} tone="warn" /> : null}
          </div>
          <h3 className={"mt-1 text-[15px] font-black " + (isDone ? "text-kx-muted line-through" : "text-kx-text")}>
            {step.title}
          </h3>
          {step.summary ? <p className="mt-1 text-sm leading-6 text-kx-subtle">{step.summary}</p> : null}

          {step.relatedArticles?.length ? (
            <div className="mt-3 space-y-1.5">
              {step.relatedArticles.slice(0, 3).map((a) => (
                <Link
                  key={a.id}
                  href={`/guide/articles/${a.slug}`}
                  className="flex items-center gap-2 rounded-xl bg-kx-soft px-3 py-2 text-xs font-semibold text-kx-text hover:text-kx-accent"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-kx-accent" />
                  <span className="truncate">{a.title}</span>
                </Link>
              ))}
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

          {step.actionType === "journey" && step.actionTarget ? (
            <Link
              href={`/guide/journeys/${encodeURIComponent(step.actionTarget)}`}
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

function Tag({ text, icon, tone = "muted" }: { text: string; icon?: React.ReactNode; tone?: "muted" | "warn" }) {
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
