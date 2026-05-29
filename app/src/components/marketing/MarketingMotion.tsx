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

  return null;
}
