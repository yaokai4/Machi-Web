"use client";

import clsx from "clsx";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

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

export function EmptyState({ title, subtitle, icon: Icon = Inbox }: { title: string; subtitle?: string; icon?: React.ComponentType<{ className?: string }>; }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3 text-kx-subtle">
      <div className="rounded-full bg-kx-soft p-3">
        <Icon className="w-6 h-6 text-kx-muted" />
      </div>
      <div className="text-base font-semibold text-kx-text">{title}</div>
      {subtitle ? <div className="text-sm text-kx-subtle max-w-sm">{subtitle}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "页面暂时无法加载",
  subtitle,
  onRetry,
}: {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3 text-kx-subtle">
      <div className="rounded-full bg-kx-accent/10 p-3">
        <AlertCircle className="w-6 h-6 text-kx-accent/80" />
      </div>
      <div className="text-base font-semibold text-kx-text">{title}</div>
      {subtitle ? <div className="text-sm text-kx-subtle max-w-sm">{subtitle}</div> : null}
      {onRetry ? (
        <button onClick={onRetry} className="kx-button-ghost mt-1">
          <RefreshCw className="w-4 h-4" /> 重新尝试
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

export function InlineLoading({ label = "加载中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8 gap-2 text-kx-muted text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}
