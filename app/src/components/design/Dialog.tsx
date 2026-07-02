"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, footer, maxWidth = "32rem", mobileFull = false }: DialogProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest onClose in a ref so the keydown/focus effects can stay keyed
  // only on `open` — otherwise a caller passing an inline (non-memoized) onClose
  // would re-run the effects every render and prematurely restore focus while the
  // dialog is still open.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Body scroll lock + Escape + Tab focus-trap. Keyed only on `open`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap Tab within the dialog so focus can't escape to the page behind it.
      const container = surfaceRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus management: capture the opener, move focus into the dialog on open,
  // and restore focus to the opener on close. Keyed only on `open` so it fires
  // exactly on the open/close transition.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    // Move focus into the dialog — unless a child already grabbed it (e.g. a
    // button with `autoFocus`, like ConfirmDialog's confirm action).
    const focusTimer = window.setTimeout(() => {
      const container = surfaceRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? container).focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open]);

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
        ref={surfaceRef}
        tabIndex={-1}
        className={
          "relative kx-glass-surface w-full flex flex-col animate-kx-scale-in shadow-kx-glow outline-none " +
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
              aria-label={t("aria_close")}
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
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="kx-button-ghost" onClick={onCancel}>
            {cancelLabel ?? t("action_cancel")}
          </button>
          <button
            className={destructive ? "kx-button-danger" : "kx-button-primary"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel ?? t("action_confirm")}
          </button>
        </>
      }
    >
      {description ? <p className="text-kx-subtle text-sm leading-relaxed">{description}</p> : null}
    </Dialog>
  );
}
