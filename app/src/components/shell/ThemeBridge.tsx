"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/store";

export function ThemeBridge({ children }: { children: React.ReactNode }) {
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);

  // Hydrate appearance from localStorage on mount.
  useEffect(() => {
    const readOne = (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const normalize = (raw: string | null): "light" | "dark" | "system" | null => {
      if (!raw) return null;
      if (raw === "light" || raw === "dark" || raw === "system") return raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed === "light" || parsed === "dark" || parsed === "system") return parsed;
      } catch {
        // fall through
      }
      return null;
    };
    const value = normalize(readOne("machi-appearance")) ?? normalize(readOne("kaix-appearance"));
    if (value) setAppearance(value);
  }, [setAppearance]);

  // React to changes (manual or via settings) and persist.
  useEffect(() => {
    try {
      localStorage.setItem("machi-appearance", JSON.stringify(appearance));
      localStorage.removeItem("kaix-appearance");
    } catch {
      // quota / privacy mode — non-fatal
    }
    const applyTheme = () => {
      try {
        const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const target = appearance === "system" ? (sysDark ? "dark" : "light") : appearance;
        document.documentElement.classList.toggle("dark", target === "dark");
      } catch {
        // ignore
      }
    };
    applyTheme();
    if (appearance === "system") {
      try {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", applyTheme);
        return () => mq.removeEventListener("change", applyTheme);
      } catch {
        return undefined;
      }
    }
  }, [appearance]);

  return <>{children}</>;
}
