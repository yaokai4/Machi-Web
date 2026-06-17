"use client";

// Top-level error boundary for the App Router. Catches uncaught
// exceptions during rendering and offers a quiet retry. The digest is
// the server-side trace id so support can correlate to logs.
//
// One-shot auto-recovery: the FIRST time a page errors in a session we
// silently call reset() once, which re-renders the page tree. Most
// "出了点问题" reports turn out to be transient — a stale chunk after a
// deploy, a momentary network hiccup, a backend cold start — and a
// quiet retry fixes them without ever showing the user a dialog.
// If reset() succeeds the dialog never appears. If it errors again,
// the user gets the visible UI.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

const AUTO_RECOVER_KEY = "machi.error.auto-recover";
const STALE_BUNDLE_RECOVER_KEY = "machi.error.stale-bundle-recover";

function isStaleBundleError(error: Error) {
  const message = `${error?.name || ""} ${error?.message || ""}`;
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

async function clearCachesAndReload() {
  try {
    if (sessionStorage.getItem(STALE_BUNDLE_RECOVER_KEY) === "1") return;
    sessionStorage.setItem(STALE_BUNDLE_RECOVER_KEY, "1");
  } catch {
    return;
  }
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
  try {
    window.location.reload();
  } catch {
    /* ignore */
  }
}

function RecoveringSurface({ staleBundle }: { staleBundle: boolean }) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="kx-glass-surface max-w-md w-full p-8 text-center space-y-4 animate-kx-scale-in">
        <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-kx-primary/10 text-kx-primary mb-1">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
        <h1 className="text-xl font-bold text-kx-text">正在恢复页面</h1>
        <p className="text-sm text-kx-subtle leading-relaxed">
          {staleBundle
            ? "检测到版本更新，正在刷新到最新页面。"
            : "页面刚刚遇到短暂异常，正在自动重试。"}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-kx-soft">
          <div className="h-full w-1/2 rounded-full bg-kx-primary/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const attempted = useRef(false);
  const staleBundle = isStaleBundleError(error);

  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[machi] route error:", error);
    }
    if (staleBundle) {
      void clearCachesAndReload();
      return;
    }
    if (attempted.current) {
      setShowDialog(true);
      return;
    }
    attempted.current = true;
    // Soft retry once per session — if reset() throws again, the
    // boundary re-mounts us and the second pass shows the dialog.
    let recovered = false;
    try {
      if (sessionStorage.getItem(AUTO_RECOVER_KEY) !== "1") {
        sessionStorage.setItem(AUTO_RECOVER_KEY, "1");
        recovered = true;
        // Defer the reset() to let any pending microtasks settle.
        if (typeof reset === "function") {
          Promise.resolve().then(() => reset());
        } else {
          setShowDialog(true);
        }
      }
    } catch {
      // ignore (privacy mode)
    }
    if (!recovered) setShowDialog(true);
  }, [error, reset, staleBundle]);

  if (!showDialog) {
    return <RecoveringSurface staleBundle={staleBundle} />;
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="kx-glass-surface max-w-md w-full p-8 text-center space-y-4 animate-kx-scale-in">
        <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger mb-1">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-kx-text">页面暂时无法加载</h1>
        <p className="text-sm text-kx-subtle leading-relaxed">
          请稍后再试。可以重试，或者先回首页继续浏览。
        </p>
        <div className="space-y-2 rounded-kx-lg bg-kx-soft/60 p-4 text-left text-xs leading-5 text-kx-subtle">
          <p><strong className="text-kx-text">English:</strong> This page cannot load right now. Try again or return home.</p>
          <p><strong className="text-kx-text">日本語:</strong> このページは現在読み込めません。再試行するか、ホームへ戻ってください。</p>
        </div>
        {error.digest ? (
          <p className="text-xs text-kx-muted font-mono">追踪号 {error.digest}</p>
        ) : null}
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            className="kx-button-primary"
            onClick={() => {
              try {
                sessionStorage.removeItem(AUTO_RECOVER_KEY);
              } catch {
                /* ignore */
              }
              if (typeof reset === "function") {
                reset();
              } else {
                window.location.reload();
              }
            }}
          >
            <RefreshCw className="w-4 h-4" /> 重试
          </button>
          <Link href="/home" className="kx-button-ghost">
            <Home className="w-4 h-4" /> 回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
