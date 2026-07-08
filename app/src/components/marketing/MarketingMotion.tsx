"use client";

import { useEffect } from "react";

export function MarketingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.querySelector(".machi-site");
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".mc-reveal:not(.mc-revealed)"));
    if (!nodes.length) return;

    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("mc-revealed"));
      return;
    }

    const initialViewportBottom = window.innerHeight * 0.98;
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top < initialViewportBottom && rect.bottom > 0) {
        node.classList.add("mc-revealed");
      }
    });
    root?.classList.add("machi-site-js");

    const frames = new Set<number>();
    const timeouts = new Set<number>();
    const reveal = (target: HTMLElement) => {
      target.classList.add("mc-revealing");
      const frame = requestAnimationFrame(() => {
        frames.delete(frame);
        target.classList.add("mc-revealed");
        const timeout = window.setTimeout(() => {
          target.classList.remove("mc-revealing");
          timeouts.delete(timeout);
        }, 460);
        timeouts.add(timeout);
      });
      frames.add(frame);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const target = entry.target as HTMLElement;
          reveal(target);
          observer.unobserve(target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 },
    );

    nodes.forEach((node) => {
      if (!node.classList.contains("mc-revealed")) observer.observe(node);
    });

    return () => {
      observer.disconnect();
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      root?.classList.remove("machi-site-js");
    };
  }, []);

  // ── Pointer-reactive elevation ─────────────────────────────────────
  // A single passive, rAF-coalesced pointermove listener drives two CSS
  // custom-property channels; all the actual movement is done by CSS
  // transforms/opacity (GPU-composited, never touching layout), and the
  // easing lives in CSS transitions so we do NOT run a per-frame lerp
  // loop — the rAF only fires while the pointer is actually moving, so
  // the page costs nothing when idle. Hard-gated to fine pointers with
  // motion allowed, so touch devices and reduced-motion users are never
  // affected. This is the site's only cursor-driven effect and stays
  // well inside frame budget even on low-end laptops.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const fine = window.matchMedia("(pointer: fine)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const motionOk = window.matchMedia("(prefers-reduced-motion: no-preference)");
    if (!fine.matches || !wide.matches || !motionOk.matches) return;

    const root = document.querySelector<HTMLElement>(".machi-site");
    if (!root) return;

    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTarget: Element | null = null;

    const apply = () => {
      frame = 0;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      // Normalised to -1..1 with the origin at viewport centre.
      const px = Math.max(-1, Math.min(1, (lastX / w) * 2 - 1));
      const py = Math.max(-1, Math.min(1, (lastY / h) * 2 - 1));
      root.style.setProperty("--mc-px", px.toFixed(3));
      root.style.setProperty("--mc-py", py.toFixed(3));

      // Per-card spotlight: only the card currently under the cursor gets
      // its local coordinates written, so this is one closest() lookup per
      // frame regardless of how many cards are on the page.
      const spot = lastTarget ? (lastTarget as Element).closest<HTMLElement>(".mc-spot") : null;
      if (spot) {
        const rect = spot.getBoundingClientRect();
        spot.style.setProperty("--mc-cx", `${(((lastX - rect.left) / rect.width) * 100).toFixed(1)}%`);
        spot.style.setProperty("--mc-cy", `${(((lastY - rect.top) / rect.height) * 100).toFixed(1)}%`);
      }
    };

    const onMove = (event: PointerEvent) => {
      lastX = event.clientX;
      lastY = event.clientY;
      lastTarget = event.target as Element | null;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      if (!frame) frame = requestAnimationFrame(apply);
      lastX = window.innerWidth / 2;
      lastY = window.innerHeight / 2;
      root.style.setProperty("--mc-px", "0");
      root.style.setProperty("--mc-py", "0");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--mc-px");
      root.style.removeProperty("--mc-py");
    };
  }, []);

  return null;
}
