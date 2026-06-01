"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  /** When true the dialog goes full-screen on mobile (used by Composer). */
  mobileFull?: boolean;
}

/**
 * Machi modal dialog.
 *
 * Rendered through a portal mounted on `document.body` so it always
 * escapes any ancestor stacking context — `animate-*` keyframes on
 * feed cards use `transform`, which would otherwise trap a
 * `position: fixed` descendant inside the card.
 */
export function Dialog({ open, onClose, title, children, footer, maxWidth = "32rem", mobileFull = false }: DialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const node = (
    <div
      className="fixed inset-x-0 z-[100] flex sm:items-center justify-center sm:px-4 animate-kx-fade-in"
      style={{
        top: "var(--kx-visual-viewport-offset-top, 0px)",
        bottom: "auto",
        height: "var(--kx-visual-viewport-height, 100dvh)",
      }}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={
          "relative kx-glass-surface w-full flex flex-col animate-kx-scale-in shadow-kx-glow " +
          (mobileFull ? "max-sm:h-[100dvh] max-sm:rounded-none" : "max-sm:mt-auto max-sm:rounded-b-none")
        }
        style={{
          maxWidth,
          height: mobileFull ? "var(--kx-visual-viewport-height, 100dvh)" : undefined,
          maxHeight: mobileFull
            ? "var(--kx-visual-viewport-height, 100dvh)"
            : "min(90vh, calc(var(--kx-visual-viewport-height, 100dvh) - 1rem))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-kx-stroke/40">
            <h2 className="font-semibold text-base text-kx-text">{title}</h2>
            <button
              onClick={onClose}
              className="text-kx-muted hover:text-kx-text rounded-full p-1 hover:bg-kx-soft transition"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </header>
        ) : null}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer ? (
          <footer className="px-5 py-3 border-t border-kx-stroke/40 flex flex-wrap justify-end gap-2 items-center"
                  style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="kx-button-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={destructive ? "kx-button-danger" : "kx-button-primary"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {description ? <p className="text-kx-subtle text-sm leading-relaxed">{description}</p> : null}
    </Dialog>
  );
}
