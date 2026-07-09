"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { useI18n, type I18nKey } from "@/lib/i18n";

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
      {/* flex-wrap + min-w-0: long localized hints (JA/EN run much longer
          than ZH) drop to their own line instead of pushing past the right
          edge on narrow screens. */}
      <label htmlFor={htmlFor} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-sm font-bold text-kx-text">{label}</span>
        {error ? null : success ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          </span>
        ) : hint ? (
          <span className="ml-auto min-w-0 max-w-full break-words text-right text-[11px] font-semibold leading-4 text-kx-muted">{hint}</span>
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
const PW_STRENGTH_KEYS: I18nKey[] = [
  "pw_strength_tooShort",
  "pw_strength_weak",
  "pw_strength_fair",
  "pw_strength_good",
  "pw_strength_strong",
];

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useI18n();
  const score = passwordScore(value);
  // 0..4
  const bars = [0, 1, 2, 3];
  const label = t(PW_STRENGTH_KEYS[score]);
  const tone =
    score <= 1 ? "bg-rose-400" : score === 2 ? "bg-amber-400" : score === 3 ? "bg-sky-400" : "bg-emerald-500";
  return (
    // role=status + aria-label so screen readers hear the strength ("Password
    // strength: Weak") instead of only seeing the decorative bars. Silent while
    // empty so it doesn't announce on every keystroke of an empty field.
    <div
      className="mt-2 flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={value ? `${t("pw_strength_label")}: ${label}` : undefined}
    >
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {bars.map((i) => (
          <span
            key={i}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-[background-color,transform] duration-300",
              i < score ? `${tone} scale-y-100` : "bg-kx-stroke/40 scale-y-75",
            )}
          />
        ))}
      </div>
      {value ? (
        <span className="text-[11px] font-bold text-kx-muted tabular-nums">{label}</span>
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
