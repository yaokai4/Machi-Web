"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Download, ZoomIn, ZoomOut } from "lucide-react";
import { isVideoMedia, mediaPosterOrFallback, mediaSourceUrl } from "@/lib/media";
import type { KXMedia } from "@/lib/types";

interface LightboxProps {
  items: KXMedia[];
  startIndex: number;
  onClose: () => void;
}

/**
 * Full-screen viewer for the images / videos attached to a post or
 * message. The viewer is rendered through a portal mounted on
 * `document.body` so it escapes any ancestor's transform / filter /
 * perspective stacking context (otherwise `position: fixed` would be
 * containing-block-trapped by e.g. the feed-card entrance animation).
 *
 * Supports keyboard navigation (← → Esc), close-on-backdrop-click and
 * image download.
 */
export function Lightbox({ items, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, items.length - 1)));
  const [mounted, setMounted] = useState(false);
  // Fit mode shrinks the media into the viewport; zoom mode renders the image
  // at full viewport width inside a scroll container so long screenshots can
  // be read top-to-bottom instead of being shrunk into an unreadable strip.
  const [zoomed, setZoomed] = useState(false);
  const current = items[index];

  const prev = useCallback(() => {
    setZoomed(false);
    setIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);
  const next = useCallback(() => {
    setZoomed(false);
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  if (!mounted || !current) return null;
  const currentUrl = mediaSourceUrl(current);
  const currentPoster = mediaPosterOrFallback(current);

  const node = (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center select-none animate-kx-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        className="absolute top-4 right-4 z-[101] text-white/85 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>
      <a
        className="absolute top-4 right-16 z-[101] text-white/85 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
        href={currentUrl}
        download
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label="下载"
      >
        <Download className="w-5 h-5" />
      </a>
      {!isVideoMedia(current) ? (
        <button
          className="absolute top-4 right-28 z-[101] text-white/85 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
          onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
          aria-label={zoomed ? "适应屏幕" : "放大查看"}
        >
          {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
        </button>
      ) : null}
      {items.length > 1 ? (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 z-[101] text-white/85 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="上一张"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 z-[101] text-white/85 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="下一张"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      ) : null}
      {zoomed && !isVideoMedia(current) ? (
        <div
          className="absolute inset-0 z-[100] overflow-auto overscroll-contain"
          onClick={onClose}
        >
          <div className="flex min-h-full w-full items-start justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={currentUrl}
              alt=""
              className="w-full max-w-none cursor-zoom-out"
              onClick={() => setZoomed(false)}
            />
          </div>
        </div>
      ) : (
        <div
          className="max-w-[90vw] max-h-[88vh] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {isVideoMedia(current) ? (
            <video
              key={current.id}
              src={currentUrl}
              poster={currentPoster || undefined}
              controls
              autoPlay
              preload="metadata"
              playsInline
              className="max-h-[88vh] max-w-[90vw] rounded-kx-md shadow-kx-glow bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={currentUrl}
              alt=""
              className="max-h-[88vh] max-w-[90vw] object-contain rounded-kx-md shadow-kx-glow cursor-zoom-in"
              onClick={() => setZoomed(true)}
            />
          )}
        </div>
      )}
      {items.length > 1 ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[101] px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold">
          {index + 1} / {items.length}
        </div>
      ) : null}
    </div>
  );

  return createPortal(node, document.body);
}
