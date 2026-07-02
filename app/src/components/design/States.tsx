"use client";

import clsx from "clsx";
import type React from "react";
import { AlertCircle, ArrowRight, Inbox, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("kx-skeleton", className)} />;
}

export function PostSkeleton() {
  return (
    <div className="kx-card">
      <div className="flex gap-3 items-start">
        <Skeleton className="w-10 h-10 rounded-kx-sm" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <div className="space-y-2 mt-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  icon: Icon = Inbox,
  action,
  secondaryAction,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: { label: string; onClick?: () => void; href?: string };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  compact?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center text-kx-subtle", compact ? "px-5 py-9" : "px-6 py-14")}>
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-kx-stroke/45 bg-kx-card shadow-[0_14px_36px_-24px_rgb(var(--kx-shadow)/0.42)]">
        <span className="absolute inset-1 rounded-[18px] bg-kx-accentSoft/70" />
        <Icon className="relative h-6 w-6 text-kx-accent" />
      </div>
      <div className="mt-4 text-base font-black text-kx-text">{title}</div>
      {subtitle ? <div className="mt-2 max-w-sm text-sm leading-6 text-kx-subtle">{subtitle}</div> : null}
      {(action || secondaryAction) ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action ? (
            action.href ? (
              <a
                href={action.href}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-kx-accent px-4 text-sm font-black text-white shadow-[0_14px_30px_-18px_rgb(var(--kx-accent)/0.6)] transition hover:-translate-y-px active:translate-y-0"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-kx-accent px-4 text-sm font-black text-white shadow-[0_14px_30px_-18px_rgb(var(--kx-accent)/0.6)] transition hover:-translate-y-px active:translate-y-0"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          ) : null}
          {secondaryAction ? (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="inline-flex h-10 items-center rounded-full border border-kx-stroke/60 bg-kx-card px-4 text-sm font-black text-kx-subtle transition hover:border-kx-accent/35 hover:text-kx-accent"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-10 items-center rounded-full border border-kx-stroke/60 bg-kx-card px-4 text-sm font-black text-kx-subtle transition hover:border-kx-accent/35 hover:text-kx-accent"
              >
                {secondaryAction.label}
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PremiumEmptyState(props: Parameters<typeof EmptyState>[0]) {
  return (
    <div className="rounded-[28px] border border-kx-stroke/35 bg-kx-card/82 shadow-[0_18px_54px_-38px_rgb(var(--kx-shadow)/0.45)] backdrop-blur">
      <EmptyState {...props} />
    </div>
  );
}

export function SectionLoading({
  title,
  rows = 3,
}: {
  title?: string;
  rows?: number;
}) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("states_section_loading");
  return (
    <div className="rounded-[28px] border border-kx-stroke/35 bg-kx-card/82 p-4 shadow-[0_18px_54px_-42px_rgb(var(--kx-shadow)/0.42)]">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-36 rounded-full" />
          <div className="text-xs font-semibold text-kx-muted">{resolvedTitle}</div>
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className={clsx("rounded-2xl", index === 0 ? "h-24" : "h-16")} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  subtitle,
  onRetry,
}: {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3 text-kx-subtle">
      <div className="rounded-full bg-kx-accent/10 p-3">
        <AlertCircle className="w-6 h-6 text-kx-accent/80" />
      </div>
      <div className="text-base font-semibold text-kx-text">{title ?? t("states_error_title")}</div>
      {subtitle ? <div className="text-sm text-kx-subtle max-w-sm">{subtitle}</div> : null}
      {onRetry ? (
        <button onClick={onRetry} className="kx-button-ghost mt-1">
          <RefreshCw className="w-4 h-4" /> {t("action_retry")}
        </button>
      ) : null}
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-kx-bg/80 backdrop-blur-sm z-50">
      <Loader2 className="w-8 h-8 animate-spin text-kx-accent" />
    </div>
  );
}

export function InlineLoading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center py-8 gap-2 text-kx-muted text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> {label ?? t("loading")}
    </div>
  );
}
