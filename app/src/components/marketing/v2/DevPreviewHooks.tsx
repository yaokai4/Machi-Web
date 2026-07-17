"use client";

import { useEffect } from "react";

// Development-only preview hooks for headless screenshot verification.
// ?mcv2theme=dark  — force dark mode (fresh headless profiles have no
//                    localStorage and follow prefers-color-scheme).
// ?mcv2act=N       — scroll the window to theater act N on mount so the
//                    sticky stage can be captured at any act.
// Compiled out of production bundles by the NODE_ENV guard.

export function DevPreviewHooks() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);

    if (params.get("mcv2theme") === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.dataset.theme = "dark";
    }

    const act = params.get("mcv2act");
    if (act != null) {
      const n = Math.min(Math.max(Number(act) || 0, 0), 4);
      const id = window.setTimeout(() => {
        const stage = document.querySelector<HTMLElement>(".mcv2-stage-outer");
        if (!stage) return;
        const top = stage.getBoundingClientRect().top + window.scrollY;
        const total = stage.offsetHeight - window.innerHeight;
        window.scrollTo(0, top + (total * (n + 0.5)) / 5);
      }, 600);
      return () => window.clearTimeout(id);
    }
  }, []);

  return null;
}
