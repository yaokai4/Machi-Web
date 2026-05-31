"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/store";

const THEME_KEY = "machi-theme";
const LEGACY_THEME_KEY = "machi_theme";

export function ThemeBridge({ children }: { children: React.ReactNode }) {
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);

  // Hydrate appearance from the single supported Machi theme key. Keep a
  // legacy read for users who already stored `machi_theme`; after the first
  // paint everything is migrated to `machi-theme`.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
      const target = stored === "dark" || stored === "light" ? stored : "light";
      localStorage.setItem(THEME_KEY, target);
      localStorage.removeItem(LEGACY_THEME_KEY);
      localStorage.removeItem("machi-appearance");
      localStorage.removeItem("kaix-appearance");
      setAppearance(target);
    } catch {
      setAppearance("light");
    }
  }, [setAppearance]);

  // React only to explicit app theme changes and persist to machi-theme.
  useEffect(() => {
    const target = appearance === "dark" ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, target);
      localStorage.removeItem(LEGACY_THEME_KEY);
      localStorage.removeItem("machi-appearance");
      localStorage.removeItem("kaix-appearance");
    } catch {
      // quota / privacy mode — non-fatal
    }
    try {
      document.documentElement.classList.toggle("dark", target === "dark");
      document.documentElement.dataset.theme = target;
    } catch {
      // ignore
    }
  }, [appearance]);

  return <>{children}</>;
}
