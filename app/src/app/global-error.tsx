"use client";

// Last-resort error boundary. Runs when something in the root layout
// itself throws (a provider, a hook crashing on hydration, etc.) and
// the per-page error.tsx can't catch it. Next.js requires this file to
// be its own HTML document.
//
// Importantly, this is also where we trigger SW self-heal when a
// hydration / chunk error reaches the top — the regular registrar may
// not be mounted yet because the layout itself failed.

import { useEffect } from "react";

const SESSION_RELOAD_KEY = "machi.sw.self-heal";

async function nukeAndReload() {
  try {
    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(SESSION_RELOAD_KEY) === "1") return;
      sessionStorage.setItem(SESSION_RELOAD_KEY, "1");
    }
  } catch {
    return; // can't track, don't risk a loop
  }
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }
  try {
    window.location.reload();
  } catch {
    // ignore
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("GlobalError:", error);
    }
    const message = error?.message || "";
    const looksLikeStaleBundle =
      message.includes("ChunkLoadError") ||
      message.includes("Loading chunk") ||
      message.includes("Loading CSS chunk") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("Unexpected token") ||
      message.includes("Hydration");
    if (looksLikeStaleBundle) {
      void nukeAndReload();
    }
  }, [error]);

  const retry = () => {
    if (typeof reset === "function") {
      reset();
      return;
    }
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>页面暂时无法加载 — Machi</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: light; }
              html, body { height: 100%; }
              body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
                background: #f4f5f7;
                color: #1f2329;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
              }
              .card {
                max-width: 28rem;
                width: 100%;
                padding: 32px;
                border-radius: 18px;
                background: #fff;
                box-shadow: 0 10px 40px rgba(0,0,0,0.08);
                text-align: center;
              }
              h1 { margin: 0 0 8px; font-size: 22px; font-weight: 800; }
              p  { margin: 0 0 18px; color: #6b7280; line-height: 1.6; font-size: 14px; }
              .muted { color: #6b7280; font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; word-break: break-all; }
              .row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
              button, a.btn {
                background: #3c40c6;
                color: white;
                border: 0;
                padding: 10px 18px;
                border-radius: 9999px;
                font-weight: 700;
                font-size: 14px;
                cursor: pointer;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 6px;
              }
              .ghost {
                background: transparent;
                color: inherit;
                border: 1px solid currentColor;
                opacity: 0.7;
              }
              button:hover, a.btn:hover { filter: brightness(1.05); }
            `,
          }}
        />
      </head>
      <body>
        <div className="card">
          <h1>页面暂时无法加载</h1>
          <p>请稍后再试。点「重试」或回到首页继续浏览。</p>
          <p>English: This page cannot load right now. Try again or return home.</p>
          <p>日本語: このページは現在読み込めません。再試行するか、ホームへ戻ってください。</p>
          {error?.digest ? <p className="muted">追踪号 {error.digest}</p> : null}
          <div className="row">
            <button onClick={retry}>重试</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn ghost" href="/">回首页</a>
          </div>
        </div>
      </body>
    </html>
  );
}
