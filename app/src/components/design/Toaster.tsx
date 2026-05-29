"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToasts } from "@/lib/store";
import { CheckCircle2, X, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const node = (
    <div className="fixed z-[110] bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto kx-glass-surface px-3 py-2.5 flex items-start gap-2 text-sm shadow-kx-glow animate-kx-fade-in",
            t.kind === "error" && "text-kx-danger",
            t.kind === "success" && "text-kx-repost",
            t.kind === "info" && "text-kx-text",
          )}
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-kx-repost" />
          ) : t.kind === "error" ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-kx-danger" />
          ) : (
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-kx-accent" />
          )}
          <div className="flex-1 text-kx-text">{t.message}</div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-kx-muted hover:text-kx-text"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
  return createPortal(node, document.body);
}
