"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

/// Wraps a form field with a label, an optional right-aligned hint and
/// an inline error message. Centralizes the error visual so login,
/// register, settings and any future form all share identical UX.
export function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  success,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  /** Right-aligned hint shown when there's no error. */
  hint?: React.ReactNode;
  /** Right-aligned green check when the field is valid. */
  success?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-kx-text">{label}</span>
        {error ? null : success ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : hint ? (
          <span className="text-[11px] font-semibold text-kx-muted">{hint}</span>
        ) : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="mt-1.5 flex items-start gap-1 text-xs font-bold text-rose-600 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/// Visual strength meter for password fields. Renders 4 bars that fill
/// based on heuristic strength: length + variety. Pure presentational,
/// the caller passes the raw value.
export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  // 0..4
  const bars = [0, 1, 2, 3];
  const label = ["太短", "较弱", "一般", "良好", "强"][score];
  const tone =
    score <= 1 ? "bg-rose-400" : score === 2 ? "bg-amber-400" : score === 3 ? "bg-sky-400" : "bg-emerald-500";
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {bars.map((i) => (
          <span
            key={i}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < score ? tone : "bg-kx-stroke/50",
            )}
          />
        ))}
      </div>
      {value ? (
        <span className="text-[11px] font-bold text-kx-muted">{label}</span>
      ) : null}
    </div>
  );
}

function passwordScore(v: string): number {
  if (!v || v.length < 6) return 0;
  let score = 1;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  return Math.min(4, score);
}
