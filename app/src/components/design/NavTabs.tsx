"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

export interface NavTabItem<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /** Optional small badge (e.g. unread count) */
  badge?: number;
  /** Optional leading icon — must be a lucide icon component or similar */
  icon?: React.ComponentType<{ className?: string }>;
}

interface NavTabsProps<V extends string> {
  items: NavTabItem<V>[];
  value: V;
  onChange: (next: V) => void;
  className?: string;
  /** When true, tabs each take an equal share of the width. Default false. */
  equalWidth?: boolean;
}

/**
 * Sliding-indicator tab strip. The accent underline animates between
 * tabs rather than just flashing in. Mirrors what people expect from
 * native iOS UISegmentedControl / Twitter web.
 *
 * Renders inside a horizontally-scrollable container so long tab lists
 * (e.g. 7 notification filters) don't squeeze on small screens.
 */
export function NavTabs<V extends string>({
  items,
  value,
  onChange,
  className,
  equalWidth = false,
}: NavTabsProps<V>) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<Map<V, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0, width: 0, ready: false,
  });

  // Position the sliding indicator under the active tab. useLayoutEffect
  // (sync before paint) keeps the indicator from flickering on first
  // render. ResizeObserver re-positions when the container or tabs
  // change size (orientation change, dynamic content).
  useLayoutEffect(() => {
    const el = tabsRef.current.get(value);
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const rect = el.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scroll = wrap.scrollLeft;
    setIndicator({
      left: rect.left - wrapRect.left + scroll,
      width: rect.width,
      ready: true,
    });
  }, [value, items.length]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const el = tabsRef.current.get(value);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setIndicator({
        left: rect.left - wrapRect.left + wrap.scrollLeft,
        width: rect.width,
        ready: true,
      });
    });
    ro.observe(wrap);
    tabsRef.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [value, items.length]);

  // When user clicks a partially-visible tab, scroll it into view.
  const handleClick = (v: V, el: HTMLButtonElement | null) => {
    onChange(v);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <div
      ref={wrapRef}
      className={clsx(
        "relative flex overflow-x-auto overflow-y-hidden no-scrollbar",
        "border-b border-kx-stroke/40 bg-kx-bg/60 backdrop-blur",
        equalWidth ? "" : "px-1",
        className,
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) tabsRef.current.set(item.value, el);
              else tabsRef.current.delete(item.value);
            }}
            data-active={active}
            onClick={(e) => handleClick(item.value, e.currentTarget)}
            className={clsx(
              "relative inline-flex items-center justify-center gap-1.5 py-3.5 px-3.5 sm:px-4",
              "text-[15px] whitespace-nowrap rounded-kx-md transition-all duration-250 ease-out kx-tap",
              "active:scale-[0.97]",
              active
                ? "text-kx-accent font-semibold"
                : "text-kx-muted font-medium hover:text-kx-text hover:bg-kx-soft/70",
              equalWidth && "flex-1",
            )}
          >
            {Icon ? <Icon className="w-4 h-4" /> : null}
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 ? (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-kx-danger text-white text-[10px] font-bold ml-0.5">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </button>
        );
      })}

      {/* Sliding indicator */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-[3px] rounded-t-md"
        style={{
          left: indicator.left,
          width: indicator.width,
          background:
            "linear-gradient(90deg, rgb(var(--kx-accent)), rgb(var(--kx-accent) / 0.75))",
          boxShadow: "0 0 14px rgb(var(--kx-accent) / 0.45)",
          // Initial render: just appear; subsequent updates: slide.
          transition: indicator.ready
            ? "left 320ms cubic-bezier(.16,1,.3,1), width 320ms cubic-bezier(.16,1,.3,1)"
            : "none",
          opacity: indicator.ready ? 1 : 0,
        }}
      />
    </div>
  );
}
