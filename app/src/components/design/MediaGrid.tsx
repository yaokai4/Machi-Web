"use client";

import { useState, memo } from "react";
import Image from "next/image";
import clsx from "clsx";
import { ImageIcon, Play } from "lucide-react";
import { isVideoMedia, mediaCardAspectRatio, mediaDurationLabel, mediaPreviewImageUrl } from "@/lib/media";
import { useI18n } from "@/lib/i18n";
import type { KXMedia } from "@/lib/types";
import { Lightbox } from "./Lightbox";

interface MediaGridProps {
  items: KXMedia[];
  onOpen?: (media: KXMedia, index: number) => void;
  rounded?: boolean;
  /** Optional context (e.g. post author / title) woven into each image's alt
   *  text so screen-reader users get more than a bare "image N/M". */
  alt?: string;
}

/**
 * Grid layout for 1-9 images/videos with a built-in lightbox.
 * Provide `onOpen` to override the default open-in-lightbox behaviour.
 */
function MediaGridImpl({ items, onOpen, rounded = true, alt }: MediaGridProps) {
  const { t } = useI18n();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!items?.length) return null;
  const count = items.length;
  const shown = Math.min(count, 9);
  const describe = (isVideo: boolean, index: number) => {
    const kind = isVideo ? t("media_video_alt") : t("media_image_alt");
    const position = shown > 1 ? ` ${index + 1}/${shown}` : "";
    return alt ? `${alt} — ${kind}${position}` : `${kind}${position}`;
  };
  const open = (media: KXMedia, index: number) => {
    if (onOpen) onOpen(media, index);
    else setLightboxIndex(index);
  };
  return (
    <>
      <div
        className={clsx(
          "grid gap-[2px] overflow-hidden animate-kx-fade-in",
          rounded && "rounded-kx-md border border-kx-stroke/40",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-2",
          count === 3 && "grid-cols-3",
          count === 4 && "grid-cols-2",
          count > 4 && "grid-cols-3",
        )}
      >
        {items.slice(0, 9).map((media, index) => {
          const isVideo = isVideoMedia(media);
          const previewUrl = mediaPreviewImageUrl(media);
          const duration = mediaDurationLabel(media);
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
                "relative bg-kx-soft overflow-hidden group/media",
                // Single media: aspectRatio (mediaCardAspectRatio, square-floored
                // for photos) governs height; the responsive max-h is a belt so a
                // wide desktop column can't grow a square into a tower.
                count === 1 ? "w-full max-h-[420px] md:max-h-[560px]" : "aspect-square",
              )}
              style={count === 1 ? { aspectRatio: mediaCardAspectRatio(media) } : undefined}
              aria-label={isVideo ? t("media_play_video") : t("media_view_image")}
            >
              {previewUrl ? <MediaImage src={previewUrl} alt={describe(isVideo, index)} /> : <MediaFallback isVideo={isVideo} />}
              {isVideo ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover/media:bg-black/22">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition-transform group-hover/media:scale-110">
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                  {duration ? (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white">
                      {duration}
                    </span>
                  ) : null}
                </span>
              ) : null}
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

function MediaFallback({ isVideo }: { isVideo: boolean }) {
  // For videos without a first-frame poster yet (legacy uploads or a capture
  // that failed), paint an intentional brand-dark gradient — matching
  // fallbackVideoPoster — instead of the washed-out light box that read as a
  // broken/"灰蒙蒙" thumbnail. The caller draws the play button + duration on
  // top, so this only supplies the backdrop.
  if (isVideo) {
    return (
      <span
        className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(56,189,248,0.30),transparent_42%),linear-gradient(135deg,#0f172a_0%,#1e3a8a_54%,#0f766e_100%)]"
        aria-hidden
      />
    );
  }
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)] text-slate-400">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/85 text-kx-accent shadow-sm ring-1 ring-slate-200/70">
        <ImageIcon className="h-5 w-5" />
      </span>
    </span>
  );
}

/** next/image with a blur-up reveal: starts blurred + slightly scaled over the
 *  bg-kx-soft placeholder, then sharpens in on load.
 *
 *  `unoptimized`: the backend already returns sized thumbnails; routing the
 *  highest-traffic surface (feed) through Next's self-hosted sharp optimizer on
 *  the 2-core prod box is a net CPU loss for ~no byte savings — see the note in
 *  next.config.mjs. Every other <Image> in the app already opts out; the feed
 *  grid was the lone omission. */
function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes="(max-width: 768px) 100vw, 640px"
      onLoad={() => setLoaded(true)}
      className={clsx(
        "object-cover transition-[opacity,filter,transform] duration-500 ease-out group-hover/media:scale-[1.03]",
        loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-md scale-[1.04]",
      )}
    />
  );
}

export const MediaGrid = memo(MediaGridImpl);
