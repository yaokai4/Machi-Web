"use client";

import { useState, memo } from "react";
import clsx from "clsx";
import { Play } from "lucide-react";
import type { KXMedia } from "@/lib/types";
import { Lightbox } from "./Lightbox";

interface MediaGridProps {
  items: KXMedia[];
  onOpen?: (media: KXMedia, index: number) => void;
  rounded?: boolean;
}

/**
 * Grid layout for 1-9 images/videos with a built-in lightbox.
 * Provide `onOpen` to override the default open-in-lightbox behaviour.
 */
function MediaGridImpl({ items, onOpen, rounded = true }: MediaGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!items?.length) return null;
  const count = items.length;
  const open = (media: KXMedia, index: number) => {
    if (onOpen) onOpen(media, index);
    else setLightboxIndex(index);
  };
  return (
    <>
      <div
        className={clsx(
          "grid gap-1.5 overflow-hidden animate-kx-fade-in",
          rounded && "rounded-kx-md border border-kx-stroke/40",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-2",
          count === 3 && "grid-cols-3",
          count === 4 && "grid-cols-2",
          count > 4 && "grid-cols-3",
        )}
      >
        {items.slice(0, 9).map((media, index) => {
          const isVideo = media.type === "video";
          return (
            <button
              key={media.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                open(media, index);
              }}
              className={clsx(
                "relative bg-kx-soft overflow-hidden aspect-square group/media",
                count === 1 && "aspect-[4/3]",
                count === 4 && "aspect-square",
              )}
              aria-label={isVideo ? "播放视频" : "查看图片"}
            >
              {isVideo ? (
                <>
                  <video
                    src={media.url}
                    poster={media.thumb_url && media.thumb_url !== media.url ? media.thumb_url : undefined}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-[1.02]"
                    preload="metadata"
                    muted
                    playsInline
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover/media:bg-black/25 transition">
                    <span className="rounded-full bg-black/60 backdrop-blur p-3 transition-transform group-hover/media:scale-110">
                      <Play className="w-5 h-5 text-white" />
                    </span>
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.thumb_url || media.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-[1.03]"
                />
              )}
              {index === 8 && items.length > 9 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-base font-semibold">
                  +{items.length - 9}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {lightboxIndex != null ? (
        <Lightbox items={items} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      ) : null}
    </>
  );
}

export const MediaGrid = memo(MediaGridImpl);
