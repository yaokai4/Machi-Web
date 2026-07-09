"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { CheckCircle2, X, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const node = (
    // aria-live region so screen readers announce every toast — the app's
    // primary feedback channel for publish/delete/network results. Errors are
    // marked assertive per-toast (below); the container defaults to polite.
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="fixed z-[110] bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
    >
      {toasts.map((t2) => {
        const isError = t2.kind === "error";
        return (
          <div
            key={t2.id}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            aria-atomic="true"
            className={clsx(
              "pointer-events-auto kx-glass-surface rounded-kx-lg px-3.5 py-3 flex items-start gap-2.5 text-sm shadow-kx-glow ring-1 animate-kx-fade-in",
              isError && "ring-kx-danger/25",
              t2.kind === "success" && "ring-kx-repost/25",
              t2.kind === "info" && "ring-kx-stroke/40",
            )}
          >
            {t2.kind === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-kx-repost" aria-hidden="true" />
            ) : isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-kx-danger" aria-hidden="true" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-kx-accent" aria-hidden="true" />
            )}
            <div className="flex-1 text-kx-text leading-snug break-words">{t2.message}</div>
            <button
              onClick={() => dismiss(t2.id)}
              className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-kx-muted transition-colors hover:bg-kx-soft hover:text-kx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/50"
              aria-label={t("aria_close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
  return createPortal(node, document.body);
}
