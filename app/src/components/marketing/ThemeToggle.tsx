"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import clsx from "clsx";

type Mode = "system" | "light" | "dark";
const STORAGE_KEY = "machi-appearance";

function applyMode(mode: Mode) {
  if (typeof document === "undefined") return;
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const target = mode === "system" ? sys : mode;
  document.documentElement.classList.toggle("dark", target === "dark");
}

function readStored(): Mode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed === "light" || parsed === "dark" || parsed === "system") return parsed;
  } catch {}
  return "system";
}

/// Marketing-site appearance toggle. Persists to the same
/// `machi-appearance` key the inline head script reads so there's no
/// flash of incorrect theme on cold load.
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("system");
  const modeRef = useRef<Mode>("system");

  useEffect(() => {
    const initial = readStored();
    modeRef.current = initial;
    setMode(initial);
    applyMode(initial);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (modeRef.current === "system") applyMode("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const change = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    applyMode(next);
  };

  const options: { value: Mode; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { value: "light", Icon: Sun, label: "Light" },
    { value: "system", Icon: Monitor, label: "System" },
    { value: "dark", Icon: Moon, label: "Dark" },
  ];

  if (compact) {
    // Single-button cycle through modes — used in tight headers.
    const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
    return (
      <button
        type="button"
        aria-label="切换主题"
        onClick={() => change(mode === "light" ? "dark" : mode === "dark" ? "system" : "light")}
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
