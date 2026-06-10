type AnyMedia = {
  media_type?: string;
  mediaType?: string;
  type?: string;
  mime?: string;
  contentType?: string;
  content_type?: string;
  cdnUrl?: string;
  publicUrl?: string;
  url?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  thumbUrl?: string;
  thumb_url?: string;
  posterUrl?: string;
  poster_url?: string;
  duration?: number;
  durationSeconds?: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
} | null | undefined;

export const fallbackVideoPoster =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 750'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%230f172a'/%3E%3Cstop offset='.54' stop-color='%231e3a8a'/%3E%3Cstop offset='1' stop-color='%230f766e'/%3E%3C/linearGradient%3E%3CradialGradient id='r' cx='.25' cy='.18' r='.5'%3E%3Cstop stop-color='%23ffffff' stop-opacity='.24'/%3E%3Cstop offset='1' stop-color='%23ffffff' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='1200' height='750' fill='url(%23g)'/%3E%3Crect width='1200' height='750' fill='url(%23r)'/%3E%3Ccircle cx='600' cy='375' r='86' fill='%23000000' fill-opacity='.42'/%3E%3Cpath d='M575 326v98l84-49-84-49z' fill='white' fill-opacity='.92'/%3E%3C/svg%3E";

/**
 * The backend builds signed/private media URLs (e.g. /api/uploads/download/…)
 * from the incoming request's Host header. Behind a proxy/CDN that absolute
 * base can be wrong-host or wrong-scheme for the browser — same failure class
 * as the upload presign URL. Anything pointing at our own /api/ is rewritten
 * to a same-origin relative URL so it always goes through whatever origin
 * served the page. True CDN URLs (CloudFront) are left untouched.
 */
export function sameOriginApiUrl(url: string): string {
  if (!url || typeof window === "undefined") return url;
  try {
    const target = new URL(url, window.location.href);
    if (target.pathname.startsWith("/api/") || target.pathname.startsWith("/media/")) {
      return `${target.pathname}${target.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

export function mediaType(media: AnyMedia): string {
  return String(media?.type || media?.media_type || media?.mediaType || "image").toLowerCase();
}

export function isVideoMedia(media: AnyMedia): boolean {
  const type = mediaType(media);
  const mime = String(media?.mime || media?.contentType || media?.content_type || "").toLowerCase();
  return type === "video" || mime.startsWith("video/");
}

export function mediaSourceUrl(media: AnyMedia): string {
  return sameOriginApiUrl(String(media?.cdnUrl || media?.publicUrl || media?.url || ""));
}

export function mediaThumbnailUrl(media: AnyMedia): string {
  return sameOriginApiUrl(String(media?.thumbnailUrl || media?.thumbnail_url || media?.thumbUrl || media?.thumb_url || ""));
}

export function mediaPosterUrl(media: AnyMedia): string {
  const source = mediaSourceUrl(media);
  const poster = sameOriginApiUrl(String(media?.posterUrl || media?.poster_url || "")) || mediaThumbnailUrl(media);
  return isVideoMedia(media) && poster === source ? "" : poster;
}

export function mediaPosterOrFallback(media: AnyMedia): string {
  return mediaPosterUrl(media) || (isVideoMedia(media) ? fallbackVideoPoster : "");
}

export function mediaPreviewImageUrl(media: AnyMedia): string {
  if (isVideoMedia(media)) return mediaPosterUrl(media);
  return mediaThumbnailUrl(media) || mediaSourceUrl(media);
}

/**
 * Natural aspect ratio for a single-media card, clamped so extreme
 * panoramas/long screenshots can't blow up feed layout. Long images render
 * cropped in lists (full view lives in the Lightbox); videos keep their
 * orientation instead of being squeezed into one fixed rectangle.
 */
export function mediaCardAspectRatio(media: AnyMedia): string {
  const w = Number(media?.width || 0);
  const h = Number(media?.height || 0);
  const fallback = isVideoMedia(media) ? 16 / 9 : 4 / 3;
  let ratio = w > 0 && h > 0 ? w / h : fallback;
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = fallback;
  const clamped = Math.min(1.92, Math.max(0.62, ratio));
  return `${Math.round(clamped * 1000)} / 1000`;
}

export function isLongImage(media: AnyMedia): boolean {
  const w = Number(media?.width || 0);
  const h = Number(media?.height || 0);
  return !isVideoMedia(media) && w > 0 && h > 0 && h / w >= 1.8;
}

export function mediaDurationLabel(media: AnyMedia): string {
  const seconds = Number(media?.durationSeconds ?? media?.duration_seconds ?? media?.duration ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
