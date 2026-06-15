"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/store";

export function ThemeBridge({ children }: { children: React.ReactNode }) {
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);

  // Hydrate appearance from the single supported Machi theme key.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("machi-theme") || localStorage.getItem("machi_theme");
      const target = stored === "dark" || stored === "light" ? stored : "light";
      localStorage.setItem("machi-theme", target);
      localStorage.removeItem("machi_theme");
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
      localStorage.setItem("machi-theme", target);
      localStorage.removeItem("machi_theme");
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
