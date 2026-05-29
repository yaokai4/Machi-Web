"use client";

import { useEffect } from "react";

/**
 * Register the offline-capable service worker once the page mounts.
 *
 * Disabled in development AND on localhost / private LAN (even when
 * bundled for production), because both surfaces use HMR-style chunk
 * hashing the worker would otherwise cache and serve stale on the next
 * page load. When a previous prod session left a worker behind, we
 * proactively unregister it and clear our caches so the user never sees
 * a "出了点问题" loop after switching modes.
 *
 * The registrar also installs a one-time guard that catches the
 * specific "ChunkLoadError" thrown when Next.js can't load a JS chunk
 * after a deploy — usually because the browser is still hanging on to
 * a stale HTML/SW cache. We respond by killing the SW and hard-
 * reloading once per session, which is the safe self-heal path.
 */
const SESSION_RELOAD_KEY = "machi.sw.self-heal";

function isDisabledHost(hostname: string): boolean {
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

async function nukeServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "kill-sw" });
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    // best-effort
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // best-effort
  }
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const disabled = isDisabledHost(window.location.hostname);
    const wantsRegister = process.env.NODE_ENV === "production" && !disabled;

    if (!wantsRegister) {
      // Aggressively tear down any worker / cache from a prior session.
      void nukeServiceWorker();
      return;
    }

    let cancelled = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;
        // If a new SW is installing, tell it to take over immediately
        // once it's ready so users on the prior cached version pick up
        // the fix on the next navigation.
        const onUpdate = () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "activated" && navigator.serviceWorker.controller) {
              // A new SW just took over. Don't force-reload here — the
              // user is mid-interaction. The next navigation will get
              // fresh assets naturally.
            }
          });
        };
        reg.addEventListener("updatefound", onUpdate);
        if (reg.installing) onUpdate();
      } catch {
        // SW registration failure should never break the page.
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", () => void register(), { once: true });
    }

    // Self-heal: if Next.js can't find a chunk (classic stale-deploy
    // symptom), nuke the SW and reload once per session.
    const handleChunkError = (message: unknown) => {
      const text = typeof message === "string" ? message : (message as Error | undefined)?.message || "";
      if (!text) return;
      const looksLikeChunkError =
        text.includes("ChunkLoadError") ||
        text.includes("Loading chunk") ||
        text.includes("Loading CSS chunk") ||
        text.includes("Failed to fetch dynamically imported module") ||
        text.includes("Importing a module script failed");
      if (!looksLikeChunkError) return;
      try {
        if (sessionStorage.getItem(SESSION_RELOAD_KEY) === "1") return;
        sessionStorage.setItem(SESSION_RELOAD_KEY, "1");
      } catch {
        // If sessionStorage is unavailable we'd loop, so bail out.
        return;
      }
      void (async () => {
        await nukeServiceWorker();
        window.location.reload();
      })();
    };

    const onError = (event: ErrorEvent) => handleChunkError(event.message || event.error);
    const onRejection = (event: PromiseRejectionEvent) => handleChunkError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      cancelled = true;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
