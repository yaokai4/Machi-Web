"use client";

import { useEffect, useRef } from "react";
import { useSettings } from "@/lib/store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// Resolve the "system" preference to a concrete light/dark for the DOM class.
function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(DARK_QUERY).matches
      : false;
  } catch {
    return false;
  }
}

// Apply the effective theme to <html>. Never persists — persistence is
// handled only on an explicit light/dark choice (see the appearance effect).
function applyEffective(target: "light" | "dark") {
  try {
    document.documentElement.classList.toggle("dark", target === "dark");
    document.documentElement.dataset.theme = target;
  } catch {
    // ignore — SSR / privacy mode
  }
}

export function ThemeBridge({ children }: { children: React.ReactNode }) {
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  // The pre-paint script in layout.tsx has already applied the correct class
  // before first paint. The store's initial "system" value is only a
  // placeholder until the hydrate effect reads real storage, so the apply
  // effect must skip its first run — otherwise a stored-dark user on a light
  // OS would flash to light for one frame before hydration corrects it.
  const skipFirstApplyRef = useRef(true);

  // Hydrate appearance from the single supported Machi theme key. When no
  // explicit choice was ever stored, follow the OS ("system") WITHOUT writing
  // to storage, so the user keeps tracking OS changes across visits — exactly
  // the contract the pre-paint script encodes.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("machi-theme") || localStorage.getItem("machi_theme");
      // Clean up legacy / duplicate keys once.
      localStorage.removeItem("machi_theme");
      localStorage.removeItem("machi-appearance");
      localStorage.removeItem("kaix-appearance");
      if (stored === "dark" || stored === "light") {
        localStorage.setItem("machi-theme", stored);
        setAppearance(stored);
      } else {
        // No explicit choice → follow the system, don't persist anything.
        localStorage.removeItem("machi-theme");
        setAppearance("system");
      }
    } catch {
      setAppearance("system");
    }
  }, [setAppearance]);

  // React to explicit app theme changes. Only light/dark persist; "system"
  // clears storage so future visits keep following the OS. The first run is
  // skipped (see skipFirstApplyRef) to preserve the pre-paint class.
  useEffect(() => {
    if (skipFirstApplyRef.current) {
      skipFirstApplyRef.current = false;
      return;
    }
    if (appearance === "system") {
      try {
        localStorage.removeItem("machi-theme");
      } catch {
        // ignore
      }
      applyEffective(systemPrefersDark() ? "dark" : "light");
      return;
    }

    const target = appearance === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("machi-theme", target);
      localStorage.removeItem("machi_theme");
      localStorage.removeItem("machi-appearance");
      localStorage.removeItem("kaix-appearance");
    } catch {
      // quota / privacy mode — non-fatal
    }
    applyEffective(target);
  }, [appearance]);

  // While following the system, re-apply whenever the OS scheme flips.
  useEffect(() => {
    if (appearance !== "system") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = () => applyEffective(mql.matches ? "dark" : "light");
    // Safari <14 only supports the deprecated addListener signature.
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else if (mql.addListener) mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else if (mql.removeListener) mql.removeListener(onChange);
    };
  }, [appearance]);

  return <>{children}</>;
}
