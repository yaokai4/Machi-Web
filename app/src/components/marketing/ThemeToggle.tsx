"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

type Mode = "light" | "dark";
const STORAGE_KEY = "machi_theme";

function applyMode(mode: Mode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.dataset.theme = mode;
}

function readStored(): Mode {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
    localStorage.setItem(STORAGE_KEY, "light");
    localStorage.removeItem("machi-appearance");
    localStorage.removeItem("kaix-appearance");
  } catch {}
  return "light";
}

/// Marketing-site appearance toggle. Persists to the same
/// `machi_theme` key the inline head script reads so there's no
/// flash of incorrect theme on cold load.
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    const initial = readStored();
    setMode(initial);
    applyMode(initial);
  }, []);

  const change = (next: Mode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.removeItem("machi-appearance");
      localStorage.removeItem("kaix-appearance");
    } catch {}
    applyMode(next);
  };

  const options: { value: Mode; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { value: "light", Icon: Sun, label: "Light" },
    { value: "dark", Icon: Moon, label: "Dark" },
  ];

  if (compact) {
    // Single-button cycle through modes — used in tight headers.
    const Icon = mode === "dark" ? Moon : Sun;
    return (
      <button
        type="button"
        aria-label="切换主题"
        onClick={() => change(mode === "light" ? "dark" : "light")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/5 text-slate-700 ring-1 ring-slate-900/10 transition hover:bg-slate-950/10 dark:bg-white/10 dark:text-slate-100 dark:ring-white/15 dark:hover:bg-white/20"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full bg-slate-950/5 p-1 ring-1 ring-slate-900/10 dark:bg-white/10 dark:ring-white/15"
      role="group"
      aria-label="主题"
    >
      {options.map(({ value, Icon, label }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => change(value)}
          className={clsx(
            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition",
            mode === value
              ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-sky-300"
              : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
