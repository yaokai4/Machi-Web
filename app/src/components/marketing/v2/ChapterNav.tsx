"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";

// 目次 — a fixed right-edge table of contents (xl+ only). The five theater
// acts plus the three info sections make eight entries; the page number
// ticks like an old counter as you scroll. Clicking an act entry scrolls
// to that act's exact offset inside the tall theater section. Pure
// enhancement: hidden below xl and irrelevant to SSR/SEO (aria-hidden'd
// duplicate labels live in the sections themselves).

type Entry = { key: string; label: string; target: () => number | null };

function sectionTop(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.getBoundingClientRect().top + window.scrollY;
}

export function ChapterNav() {
  const { locale } = useMarketingI18n();
  const v2 = v2Copy[locale] ?? v2Copy.zh;
  const [active, setActive] = useState(-1);
  const [visible, setVisible] = useState(false);
  const raf = useRef(0);

  const entries: Entry[] = [
    ...v2.theater.acts.map((a, i) => ({
      key: a.key,
      label: a.name,
      target: () => {
        const el = document.getElementById("theater");
        if (!el) return null;
        const stage = el.querySelector<HTMLElement>(".mcv2-stage-outer");
        if (!stage) return sectionTop("theater");
        const base = stage.getBoundingClientRect().top + window.scrollY;
        const vh = window.innerHeight;
        const total = stage.offsetHeight - vh;
        return base + (total * (i + 0.5)) / 5;
      },
    })),
    { key: "library", label: v2.dualLibrary.label, target: () => sectionTop("library") },
    { key: "cities", label: v2.cityMap.label, target: () => sectionTop("cities") },
    { key: "membership", label: v2.membership.label, target: () => sectionTop("membership") },
  ];

  useEffect(() => {
    const update = () => {
      raf.current = 0;
      const theater = document.getElementById("theater");
      const vh = window.innerHeight;
      const y = window.scrollY;
      setVisible(y > vh * 0.6);

      let idx = -1;
      if (theater) {
        const rect = theater.getBoundingClientRect();
        if (rect.top < vh * 0.5 && rect.bottom > vh * 0.5) {
          idx = Number(theater.dataset.act ?? 0);
        } else if (rect.bottom <= vh * 0.5) {
          idx = 4;
          for (const [j, id] of ["library", "cities", "membership"].entries()) {
            const el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top < vh * 0.55) idx = 5 + j;
          }
        }
      }
      setActive(idx);
    };
    const onScroll = () => {
      if (!raf.current) raf.current = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const jump = (entry: Entry) => {
    const top = entry.target();
    if (top == null) return;
    window.scrollTo({ top: top - 40, behavior: "smooth" });
  };

  return (
    <nav
      aria-label={v2.chapterLabel}
      className={clsx(
        "mcv2-chapter-nav fixed right-6 top-1/2 z-[60] hidden -translate-y-1/2 xl:block",
        visible ? "mcv2-chapter-nav--on" : "pointer-events-none opacity-0",
      )}
    >
      <p className="mb-3 text-right text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
        {v2.chapterLabel}
      </p>
      <ol className="space-y-1.5">
        {entries.map((entry, i) => (
          <li key={entry.key}>
            <button
              type="button"
              onClick={() => jump(entry)}
              className={clsx(
                "group flex w-full items-center justify-end gap-2 rounded-full px-2 py-1 text-right transition",
                active === i
                  ? "text-slate-950 dark:text-white"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
              )}
            >
              <span className={clsx("text-[12px] font-bold tracking-wide transition-opacity", active === i ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                {entry.label}
              </span>
              <span
                aria-hidden="true"
                className={clsx(
                  "h-px transition-all duration-300",
                  active === i ? "w-7 bg-gradient-to-r from-orange-500 to-rose-500" : "w-4 bg-slate-300 group-hover:bg-slate-400 dark:bg-white/20",
                )}
              />
            </button>
          </li>
        ))}
      </ol>
      <p aria-hidden="true" className="mt-3 text-right font-mono text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
        {String(Math.max(active + 1, 1)).padStart(2, "0")} / {String(entries.length).padStart(2, "0")}
      </p>
    </nav>
  );
}
