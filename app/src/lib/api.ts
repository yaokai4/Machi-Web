// Single HTTP client for the unified Machi backend. Used by both
// React Query hooks and any imperative call paths. All requests
// go through here so auth header, error normalisation, JSON parsing
// and base URL handling stay consistent.

import type {
  APIErrorPayload,
  KXComment,
  KXConversation,
  KXDevice,
  KXDraft,
  KXMedia,
  KXMessage,
  KXNotification,
  KXPost,
  KXSettings,
  KXTrendingTopic,
  KXUser,
  KXCountry,
  KXProvince,
  KXCity,
  KXRegion,
  FeedMode,
  Paginated,
  ProfileSegment,
  ContentType,
  KXMembershipMe,
  KXMembershipPlan,
  KXCreateOrderResult,
  KXOrderStatus,
  KXMembershipStatus,
  KXMembershipInsights,
  KXWallet,
  KXWalletMe,
  KXClientConfig,
  KXWalletLedgerEntry,
  PaymentProvider,
  KXCityListing,
  KXBusinessDashboard,
  KXBusinessProfile,
  KXBusinessPublic,
  KXListingReview,
  KXListingReviewSummary,
  KXCreateListingPayload,
  KXListingInquiry,
  KXBookingSlot,
  KXBooking,
  KXListingTaxonomyCategory,
  KXListingTaxonomyField,
  KXListingTaxonomyPayload,
  KXListingType,
  KXReputationBadge,
  KXReputationEvent,
  KXReputationLevel,
  KXReputationPrivilege,
  KXReputationProfile,
  KXReputationReward,
  KXRoom,
  KXRoomMessage,
  KXRoomsPage,
  KXEvent,
  KXEventFormField,
  KXEventsPage,
  KXEventAttendee,
} from "./types";

const TOKEN_KEY = "machi.token";
const LEGACY_TOKEN_KEY = "kaix.token";

// Cross-tab session signal. Writing this key fires a `storage` event in EVERY
// OTHER tab of the same origin (never the writer's own tab), which
// SessionBootstrap listens for to re-probe the session — so logging in / out in
// one tab reflects in the others without a manual refresh.
export const SESSION_BUMP_KEY = "machi.session.bump";

export function bumpSessionSignal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_BUMP_KEY, String(Date.now()));
  } catch {
    // quota / privacy mode — non-fatal
  }
}

// The session store lives in `store.ts`; wiring it in via a registered callback
// (instead of a static import) keeps api.ts free of a store dependency and
// avoids any import cycle. SessionBootstrap registers this on mount so a 401
// anywhere can drop the in-memory user immediately, not just the token.
let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export const apiBase = ""; // requests proxied through next.config rewrites

export class APIError extends Error {
  status: number;
  code: string;
  constructor(payload: APIErrorPayload, status: number) {
    super(payload.message || "请求失败");
    this.status = status;
    this.code = payload.code || "unknown";
  }
}

export function isAuthRequiredError(err: unknown): err is APIError {
  return err instanceof APIError && (err.status === 401 || err.code === "AUTH_REQUIRED");
}

// Localised copy for CLIENT-GENERATED APIErrors (network / timeout / 401 /
// parse / http fallback / upload). The I18nProvider registers a localizer that
// maps an error code + status to the viewer's language; until it does (SSR,
// first paint) we fall back to the zh-Hans strings passed at each throw site.
// Server-provided error messages never route through here — they keep the
// backend's own three-language text.
export type ApiErrorLocalizer = (code: string, status: number) => string | null | undefined;
let errorLocalizer: ApiErrorLocalizer | null = null;
export function registerErrorLocalizer(fn: ApiErrorLocalizer | null): void {
  errorLocalizer = fn;
}
function localizedError(code: string, status: number, fallback: string): string {
  if (errorLocalizer) {
    try {
      const msg = errorLocalizer(code, status);
      if (msg) return msg;
    } catch {
      // never let a localizer bug swallow the real error
    }
  }
  return fallback;
}

// Merge our own timeout AbortSignal with any signal the caller (or React Query's
// queryFn) hands in, so an unmount / query-key change cancels the in-flight
// request just like a timeout does. Prefers the native AbortSignal.any and
// degrades to a manual relay where it isn't available.
function combineSignals(
  a: AbortSignal | null | undefined,
  b: AbortSignal | null | undefined,
): AbortSignal | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") {
    try {
      return anyFn([a, b]);
    } catch {
      // fall through to the manual relay
    }
  }
  if (typeof AbortController === "undefined") return a;
  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  };
  if (a.aborted || b.aborted) controller.abort();
  else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
      try {
        window.localStorage.setItem(TOKEN_KEY, legacyToken);
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch {
        // quota / privacy mode — keep using the legacy slot
      }
      return legacyToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    // Browser sessions now live in a backend-issued HttpOnly cookie. Keep
    // this function to clear legacy Bearer tokens after one-time migration.
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // quota / privacy mode — non-fatal
  }
  if (!token) {
    // On logout (or 401-induced token wipe) instruct the service
    // worker to drop its API response cache. Without this, the SW
    // could serve user A's cached /api/auth/me or /api/notifications
    // to user B because cache keys are URLs, not bearer tokens.
    try {
      if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-api-cache" });
      }
    } catch {
      // best-effort
    }
  }
}

export type KXSearchGuideItem = {
  kind: "article" | "product";
  id: string;
  slug: string;
  title: string;
  subtitle: string;
};

export type MarketingCopyBlock = {
  id: string;
  page_key: string;
  locale: string;
  title: string;
  body: string;
  status: "draft" | "published";
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MarketingCopyOverrides = {
  locale: "zh" | "en" | "ja";
  overrides: Record<string, string>;
};

// Returned by /api/auth/login/start. Either the account requires an emailed
// code (two-step), or — when the account has no email and the server isn't
// enforcing codes — a session is issued directly.
export type LoginStartResult =
  | { requires_code: true; challenge_id: string; email_hint: string; expires_in: number }
  | { requires_code: false; token: string; user: KXUser };

export type GoogleAuthStartResult = {
  authorization_url: string;
  url?: string;
  state: string;
  expires_in: number;
};

// Admin-only visitor access-log row. The full IP + resolved region are
// included here intentionally — this endpoint is gated behind require_admin
// on the server and is never reachable by ordinary users.
export type VisitorLogEntry = {
  id: string;
  created_at: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  user_id: string | null;
  user_agent: string;
  referer: string;
  country: string;
  region: string;
  city: string;
  org: string;
};

export type VisitorSummary = {
  total: number;
  unique_visitors: number;
  logged_in_users: number;
  days: number;
  top_countries: Array<{ country: string; count: number }>;
  top_cities: Array<{ city: string; country: string; count: number }>;
  geoip: string;
};

export type AdminEmailCampaign = {
  id: string;
  admin_id?: string;
  adminId?: string;
  subject: string;
  body: string;
  audience: "all" | "verified_members" | "active_30d" | "selected" | string;
  status: "draft" | "queued" | "sending" | "sent" | "partial" | "failed" | string;
  audienceUserIds?: string[];
  audienceUserCount?: number;
  recipient_count: number;
  recipientCount?: number;
  sent_count: number;
  sentCount?: number;
  failed_count: number;
  failedCount?: number;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  updatedAt?: string;
  started_at?: string | null;
  startedAt?: string | null;
  finished_at?: string | null;
  finishedAt?: string | null;
};

export type SiteSettings = Record<
  | "site_title"
  | "site_title_zh"
  | "site_title_en"
  | "site_title_ja"
  | "site_description_zh"
  | "site_description_en"
  | "site_description_ja"
  | "logo_url"
  | "og_image_url"
  | "support_email"
  | "social_x_url"
  | "social_instagram_url"
  | "social_tiktok_url"
  | "social_youtube_url"
  | "social_linkedin_url"
  | "social_xiaohongshu_url"
  | "social_douyin_url"
  | "login_announcement"
  | "discover_entrances"
  | "right_rail_show_trending"
  | "right_rail_show_recommended"
  | "right_rail_pinned_handles"
  | "listing_review_enabled"
  | "explore_happening_days"
  | "explore_hot_days"
  | "explore_topic_days"
  | "explore_like_weight"
  | "explore_comment_weight"
  | "explore_repost_weight"
  | "explore_favorite_weight"
  | "explore_view_weight"
  | "explore_time_decay_weight"
  | "explore_report_penalty"
  | "explore_min_display"
  | "explore_fallback_enabled"
  | "explore_city_isolated"
  | "explore_exclude_reported"
  | "explore_exclude_low_quality"
  | "explore_exclude_banned_users"
  | "engagement_sim_enabled"
  | "engagement_sim_max_days"
  | "engagement_sim_like_min"
  | "engagement_sim_like_max"
  | "engagement_sim_bookmark_ratio"
  | "engagement_sim_comment_max"
  | "engagement_sim_comment_ai"
  | "engagement_sim_follow_max"
  | "engagement_sim_halflife_hours"
  | "seed_post_image_ratio",
  string
>;

export type AdminMediaItem = KXMedia & {
  owner_handle?: string;
  owner_name?: string;
  display_name?: string;
};

export type UploadPurpose =
  | "avatar"
  | "profile_cover"
  | "post_image"
  | "post_video"
  | "post_audio"
  | "article_image"
  | "article_video"
  | "experience_image"
  | "experience_video"
  | "question_image"
  | "group_post_image"
  | "group_post_video"
  | "secondhand_image"
  | "secondhand_video"
  | "rental_image"
  | "rental_video"
  | "job_image"
  | "job_video"
  | "service_image"
  | "service_video"
  | "discount_image"
  | "discount_video"
  | "guide_article_image"
  | "guide_product_preview"
  | "guide_product_file"
  | "member_resource_file"
  | "guide_attachment"
  | "business_logo"
  | "business_cover"
  | "business_verification_file"
  | "message_image"
  | "message_video"
  | "message_file"
  | "video_thumbnail"
  | "video_processed_file";

export type UploadedFile = {
  id: string;
  uploadId: string;
  userId: string;
  bucket: string;
  objectKey: string;
  url: string;
  publicUrl: string;
  cdnUrl: string;
  thumbnailUrl: string;
  contentType: string;
  fileSize: number;
  fileName?: string;
  originalFileName?: string;
  fileType: "image" | "pdf" | "video" | "document" | "other" | string;
  purpose: UploadPurpose | string;
  entityType: string;
  entityId: string;
  status: "pending" | "uploaded" | "processing" | "ready" | "failed" | "deleted" | string;
  isPrivate?: boolean;
  width: number;
  height: number;
  duration: number;
  etag?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type AdminUploadedFileItem = UploadedFile & {
  ownerHandle?: string;
  ownerName?: string;
  objectExists?: boolean;
};

export type UploadProgress = {
  stage: "presign" | "uploading" | "complete" | "success" | "error";
  progress: number;
  file: File;
};

export type UploadFileOptions = {
  purpose?: UploadPurpose;
  entityType?: string;
  entityId?: string;
  threadId?: string;
  groupId?: string;
  width?: number;
  height?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
  onProgress?: (event: UploadProgress) => void;
};

const UPLOAD_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pjpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
};

export function inferUploadContentType(file: Pick<File, "name" | "type">): string {
  const rawType = (file.type || "").split(";", 1)[0].trim().toLowerCase();
  const ext = (file.name || "").split(".").pop()?.trim().toLowerCase() || "";
  const extType = UPLOAD_MIME_BY_EXTENSION[ext];
  if (rawType && rawType !== "application/octet-stream") {
    if (rawType === "image/jpg" || rawType === "image/pjpeg") return "image/jpeg";
    if (rawType === "image/x-png") return "image/png";
    if (rawType === "video/x-m4v") return "video/mp4";
    if (rawType === "application/x-pdf") return "application/pdf";
    return rawType;
  }
  return extType || rawType || "application/octet-stream";
}

export function isUploadImageFile(file: Pick<File, "name" | "type">): boolean {
  return inferUploadContentType(file).startsWith("image/");
}

export function isUploadVideoFile(file: Pick<File, "name" | "type">): boolean {
  return inferUploadContentType(file).startsWith("video/");
}

export type ServerMetrics = {
  server_time: string;
  load_average: { one: number; five: number; fifteen: number };
  cpu: { count: number; load_percent: number };
  memory: { total_bytes: number; available_bytes: number; used_bytes: number; used_percent: number | null };
  disk: { path: string; total_bytes: number; used_bytes: number; free_bytes: number; used_percent: number | null };
  network: { rx_bytes: number; tx_bytes: number };
  process: { pid: number; threads: number };
};



export type EditorialPost = {
  id: string;
  news_item_id?: string | null;
  author_type: "local_desk" | "city_editor" | "tokyo_editorial" | "osaka_editorial" | "japan_editorial" | "admin";
  author_display_name: string;
  country: string;
  city: string;
  language: string;
  category: string;
  title: string;
  summary: string;
  body: string;
  source_name?: string | null;
  source_url?: string | null;
  original_url?: string | null;
  source_published_at?: string | null;
  status: "draft" | "pending_review" | "published" | "hidden" | "deleted";
  review_status: "none" | "needs_review" | "approved" | "rejected";
  reviewed_by_admin_id?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  view_count: number;
  share_count: number;
  click_source_count: number;
  risk_level: "low" | "medium" | "high";
  official_source_required: boolean;
  is_ai_assisted: boolean;
  ai_model?: string | null;
  ai_prompt_version?: string | null;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  save_count: number;
  comment_count: number;
  saved: boolean;
  is_demo?: boolean;
};

export type EditorialComment = {
  id: string;
  editorial_post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: KXUser | null;
};


// 入驻商专属导入后台（如 星域东京）。管理员在 /admin/partners 创建后，
// 把一次性 ACCESS TOKEN + 专属链接 /partner/<key> 交给入驻商，由其在专属
// 后台批量导入房源。tokenHint 仅是口令末四位（用于核对），完整口令永不
// 回传——只在创建 / 重新生成时一次性返回。
export type Partner = {
  key: string;
  name: string;
  nameJa: string;
  nameEn: string;
  website: string;
  brandColor: string;
  accentColor: string;
  logoUrl: string;
  intro: string;
  status: string;
  defaultCitySlug: string;
  defaultRegionCode: string;
  defaultCountryCode: string;
  defaultListingType: string;
  defaultCategory: string;
  saleEnabled: boolean;
  machiRecommendedDefault: boolean;
  defaultBadges: string[];
  sellerUserId: string;
  tokenHint: string;
  tokenRotatedAt: string;
  listingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminPartnerStarealSummary = {
  source: string;
  partnerKey?: string;
  fetched: number;
  mapped: number;
  imageCount: number;
  missingImageCount: number;
  byType: Record<string, number>;
  byIntent: Record<string, number>;
  maxImages: number;
  fullRes: boolean;
};

export type AdminPartnerStarealOptions = {
  types?: Array<"buy" | "rent" | "invest">;
  maxImages?: number;
  fullRes?: boolean;
  rehostUrls?: boolean;
};

export type AdminPartnerStarealPreviewResult = {
  rows: unknown[];
  warnings: string[];
  rowCount: number;
  summary: AdminPartnerStarealSummary;
};

export type AdminPartnerStarealSyncResult = {
  ok: true;
  job: AdminPartnerStarealJob;
  reused: boolean;
};

export type AdminPartnerStarealJob = {
  id: string;
  partnerKey: string;
  source: string;
  status: "queued" | "running" | "succeeded" | "failed" | string;
  stage: string;
  message: string;
  progress: number;
  totalSteps: number;
  processedSteps: number;
  fetched: number;
  mapped: number;
  imageCount: number;
  missingImageCount: number;
  created: number;
  updated: number;
  errors: number;
  errorCode: string;
  errorMessage: string;
  options: AdminPartnerStarealOptions;
  summary: Partial<AdminPartnerStarealSummary>;
  result: {
    created?: number;
    updated?: number;
    total?: number;
    errors?: unknown[];
    results?: unknown[];
  };
  warnings: string[];
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_TIMEOUT_MS = 12_000;

function idempotencyKey(prefix: string): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, signal: externalSignal, ...fetchInit } = init ?? {};
  const timeoutVal = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = readToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Single attempt only. Retrying transient failures is owned by React Query
  // (queryClient.shouldRetry); stacking an inner retry on top of it let one
  // network-stalled GET fan out to four long-hanging fetches — the exact
  // amplification behind the 0629 realtime / rate-limit incident.
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, timeoutVal)
    : null;
  // `...fetchInit` is spread FIRST and method/headers/body/signal are set
  // explicitly last, so a caller passing `{ headers: { "Idempotency-Key": … } }`
  // (uploads, listing-create, booking, message-send, …) no longer clobbers the
  // merged Content-Type / Authorization, and its signal is combined — not
  // replaced — with our timeout signal.
  const signal = combineSignals(controller?.signal, externalSignal);

  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      ...fetchInit,
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    throw new APIError(
      {
        code,
        message: localizedError(
          code,
          0,
          aborted ? "请求超时，请稍后重试。" : "无法连接服务器，请检查网络后重试。",
        ),
      },
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const ct = res.headers.get("Content-Type") || "";
  if (!res.ok) {
    let payload: APIErrorPayload = { code: "http_error", message: localizedError("http_error", res.status, `请求失败（${res.status}）`) };
    if (ct.includes("application/json")) {
      try {
        const data = await res.json();
        if (data?.error) payload = data.error;
        else if (data?.message || data?.code) {
          payload = { code: data.code || "http_error", message: data.message || localizedError("http_error", res.status, `请求失败（${res.status}）`) };
        }
      } catch {
        // fallthrough
      }
    }
    if (res.status === 401) {
      payload = { code: "AUTH_REQUIRED", message: localizedError("AUTH_REQUIRED", res.status, "请登录后继续") };
      writeToken(null);
      // Drop the in-memory user too, so guarded UI reacts immediately instead of
      // waiting for the next session probe. Best-effort; never let it mask the
      // real API error.
      try {
        onUnauthorized?.();
      } catch {
        // ignore
      }
    }
    throw new APIError(payload, res.status);
  }
  if (res.status === 204) return undefined as T;
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new APIError({ code: "parse_error", message: localizedError("parse_error", res.status, "服务器响应格式异常。") }, res.status);
    }
  }
  return (await res.text()) as unknown as T;
}

type PresignUploadResponse = {
  ok: true;
  data: {
    uploadId: string;
    uploadUrl: string;
    fileKey: string;
    cdnUrl: string;
    expiresIn: number;
    headers: Record<string, string>;
    file: UploadedFile;
  };
};

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void,
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    for (const [key, value] of Object.entries(headers || {})) {
      if (value) xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(0.98, event.loaded / Math.max(1, event.total)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag")?.replaceAll("\"", "") || "" });
      } else {
        reject(new APIError({ code: "upload_failed", message: localizedError("upload_failed", xhr.status, `上传失败（${xhr.status}）`) }, xhr.status));
      }
    };
    xhr.onerror = () => reject(new APIError({ code: "network_error", message: localizedError("network_error", 0, "上传失败，请检查网络后重试。") }, 0));
    xhr.onabort = () => reject(new APIError({ code: "upload_aborted", message: localizedError("upload_aborted", 0, "上传已取消。") }, 0));
    xhr.send(file);
  });
}

// The backend's presign hands back an ABSOLUTE uploadUrl built from the request
// Host header (see api_upload_presign). Behind a CDN / reverse proxy that host
// can be cross-origin, wrong-scheme (http on an https page → mixed content) or
// an internal-only address the browser cannot reach — exactly the class of
// "iOS uploads but Web can't" failures, since native clients hit the backend
// directly and never see the mismatch. For our own streaming endpoint we PUT to
// a SAME-ORIGIN relative path (through the same proxy that served presign), so
// the upload works regardless of how the backend computed its base URL. A true
// S3 / CloudFront presigned URL (a different host that is NOT our /api path)
// must stay absolute and is left untouched.
function resolveBrowserUploadUrl(uploadUrl: string): string {
  if (typeof window === "undefined" || !uploadUrl) return uploadUrl;
  try {
    const target = new URL(uploadUrl, window.location.href);
    if (target.pathname.startsWith("/api/uploads/local/")) {
      return `${target.pathname}${target.search}`;
    }
    return uploadUrl;
  } catch {
    return uploadUrl;
  }
}

async function uploadFileViaPresignedUrl(
  file: File,
  options: UploadFileOptions = {},
): Promise<{ file: UploadedFile; media: KXMedia }> {
  const purpose = options.purpose || "post_image";
  const actionKey = idempotencyKey("upload");
  const contentType = inferUploadContentType(file);
  options.onProgress?.({ stage: "presign", progress: 0, file });
  const presign = await request<PresignUploadResponse>("POST", "/api/uploads/presign", {
    fileName: file.name,
    contentType,
    fileSize: file.size,
    purpose,
    entityType: options.entityType || "",
    entityId: options.entityId || "",
    threadId: options.threadId || "",
    groupId: options.groupId || "",
    duration: options.duration || 0,
    durationSeconds: options.duration || 0,
    metadata: options.metadata || {},
  }, { headers: { "Idempotency-Key": `${actionKey}-presign` } });
  const uploaded = await uploadWithProgress(
    resolveBrowserUploadUrl(presign.data.uploadUrl),
    file,
    presign.data.headers,
    (progress) => options.onProgress?.({ stage: "uploading", progress, file }),
  );
  options.onProgress?.({ stage: "complete", progress: 0.99, file });
  const completed = await request<{ ok: true; data: { file: UploadedFile; media: KXMedia }; file?: UploadedFile; media?: KXMedia }>(
    "POST",
    "/api/uploads/complete",
    {
      uploadId: presign.data.uploadId,
      fileKey: presign.data.fileKey,
      etag: uploaded.etag,
      width: options.width || 0,
      height: options.height || 0,
      duration: options.duration || 0,
      durationSeconds: options.duration || 0,
    },
    { headers: { "Idempotency-Key": `${actionKey}-complete` } },
  );
  const result = {
    file: completed.data?.file || completed.file,
    media: completed.data?.media || completed.media,
  };
  if (!result.file || !result.media) {
    throw new APIError({ code: "upload_complete_malformed", message: localizedError("upload_complete_malformed", 502, "上传确认响应异常，请重试。") }, 502);
  }
  options.onProgress?.({ stage: "success", progress: 1, file });
  return result as { file: UploadedFile; media: KXMedia };
}

// ---- auth ----

// Image-captcha challenge gating the anonymous auth endpoints. When the
// server has enforcement off, `enabled` is false and the UI hides the
// captcha row entirely.
export type KXCaptcha = {
  enabled: boolean;
  captcha_id?: string;
  image?: string; // data:image/png;base64,…
  expires_in?: number;
};
export type KXCaptchaAnswer = { captcha_id: string; captcha_code: string };

// Saved-search subscription row (/api/saved_searches). The server also emits
// camelCase aliases; we type the snake_case fields the web client reads.
export type KXSavedSearch = {
  id: string;
  vertical: string;
  city_slug: string;
  region_code: string;
  country_code: string;
  keyword: string;
  category: string;
  filters: Record<string, unknown>;
  label: string;
  cadence: "instant" | "daily" | "off";
  match_count: number;
  last_notified_at: string;
  created_at: string;
  updated_at: string;
};

// 邀请裂变 (referral / invite growth loop). Mirrors server_referral.referral_summary.
export type KXReferralInvitee = {
  referralId: string;
  status: string; // pending | qualified | rewarded | rejected | held
  handle: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
  rewardedAt: string;
};

export type KXReferralSummary = {
  code: string;
  shareUrl: string;
  invitedCount: number;
  qualifiedCount: number;
  pointsEarned: number;
  inviterReward: number;
  inviteeReward: number;
  recentInvitees: KXReferralInvitee[];
};

export const api = {
  async fetchCaptcha(scene: "login" | "register" = "register"): Promise<KXCaptcha> {
    return request("POST", "/api/auth/captcha", { scene });
  },
  async login(handle: string, password: string, captcha?: KXCaptchaAnswer): Promise<{ token: string; user: KXUser }> {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/login", { handle, password, ...(captcha ?? {}) });
    writeToken(data.token);
    bumpSessionSignal();
    return data;
  },
  async googleAuthStart(client: "web" | "ios" = "web", redirect = "/home"): Promise<GoogleAuthStartResult> {
    const params = new URLSearchParams({ client, redirect });
    return request("GET", `/api/auth/google/start?${params.toString()}`);
  },
  // Bind Google to the CURRENT (logged-in) account. The backend captures the
  // active user from the bearer token here, so the later browser callback can
  // only ever attach Google to *this* account — never sign in as someone else.
  async googleLinkStart(redirect = "/settings"): Promise<GoogleAuthStartResult> {
    const params = new URLSearchParams({ client: "web", intent: "link", redirect });
    return request("GET", `/api/auth/google/start?${params.toString()}`);
  },
  async googleUnlink(): Promise<{ ok: boolean; user?: KXUser; message?: string }> {
    return request("POST", "/api/auth/google/unlink");
  },
  async register(payload: {
    handle: string;
    display_name: string;
    password: string;
    email?: string;
    // Email verification code. Required by the backend only when the server
    // enforces verification (KAIX_REQUIRE_EMAIL_VERIFICATION) or whenever a
    // code is supplied; older callers that omit it keep the legacy flow.
    code?: string;
    language?: string;
    country?: string;
    province?: string;
    city?: string;
    current_region_code?: string;
    // 邀请裂变: the inviter's code from ?ref= / /i/{code}. Bound as a *pending*
    // referral server-side (no payout at signup); a bad/blank/self code is
    // silently ignored and never blocks registration.
    referral_code?: string;
  }) {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/register", payload);
    writeToken(data.token);
    bumpSessionSignal();
    return data;
  },
  // 邀请裂变 战绩页 data: this user's stable invite code + share URL + counts +
  // recent invitees. Lazily mints the code on first read (server-side).
  async referralMe(): Promise<KXReferralSummary> {
    const data = await request<{ referral: KXReferralSummary }>("GET", "/api/referral/me");
    return data.referral;
  },
  // Late-bind an invite for an already-registered user who clicked a link after
  // signing up. Capped by UNIQUE(invitee_id) server-side — a no-op if they were
  // ever bound. No payout here.
  async referralBind(code: string): Promise<{ bound: boolean; reason: string }> {
    return request("POST", "/api/referral/bind", { referral_code: code });
  },
  async checkUsername(username: string): Promise<{ available: boolean; message: string; code?: string }> {
    return request("GET", `/api/auth/check-username?username=${encodeURIComponent(username)}`);
  },
  async checkEmail(email: string): Promise<{ available: boolean; message: string; code?: string }> {
    return request("GET", `/api/auth/check-email?email=${encodeURIComponent(email)}`);
  },
  // Request an email verification / reset code. The response never contains
  // the code itself — only whether it was accepted and how long it lasts.
  async sendEmailCode(
    email: string,
    purpose: "register" | "reset" | "change_password" | "change_email_old" | "change_email_new" = "register",
    locale?: string,
    captcha?: KXCaptchaAnswer,
  ): Promise<{ ok: boolean; challenge_id?: string; email_hint?: string; expires_in: number }> {
    return request("POST", "/api/auth/email/send-code", { email, purpose, locale, ...(captcha ?? {}) });
  },
  async verifyEmailCode(email: string, code: string, purpose: "register" | "reset" | "change_password" | "change_email_old" | "change_email_new" = "register", challengeId?: string): Promise<{ ok: boolean; success?: boolean; message?: string }> {
    return request("POST", "/api/auth/verify-code", { email, code, purpose, challenge_id: challengeId });
  },
  async verifyPassword(password: string): Promise<{ ok: boolean; message?: string }> {
    return request("POST", "/api/account/verify-password", { password });
  },
  async changeAccountPassword(payload: {
    current_password?: string;
    code?: string;
    challenge_id?: string;
    new_password: string;
  }): Promise<{ ok: boolean; message?: string }> {
    return request("POST", "/api/account/change-password", payload);
  },
  async changeEmail(payload: {
    current_password?: string;
    old_code?: string;
    old_challenge_id?: string;
    new_email: string;
    new_code: string;
    new_challenge_id?: string;
  }): Promise<KXUser> {
    const { user } = await request<{ ok: boolean; message?: string; user: KXUser }>("POST", "/api/account/change-email", payload);
    return user;
  },
  async updateRegionLanguage(patch: {
    country?: string;
    province?: string;
    city?: string;
    current_region_code?: string;
    recent_region_codes?: string[];
  }): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("PATCH", "/api/account/region-language", patch);
    return user;
  },
  async verifyEmailCodeLegacy(email: string, code: string, purpose: "register" | "reset" = "register"): Promise<{ ok: boolean; success?: boolean; message?: string }> {
    return request("POST", "/api/auth/verify-code", { email, code, purpose });
  },
  // Step 1 of two-step login: verify the password, then (if the account has
  // an email) email a one-time code. Persists the token only on the direct
  // no-code path; the code path persists it in loginVerify.
  async loginStart(payload: {
    handle?: string;
    email?: string;
    password: string;
    locale?: string;
    captcha_id?: string;
    captcha_code?: string;
  }): Promise<LoginStartResult> {
    const data = await request<LoginStartResult>("POST", "/api/auth/login/start", payload);
    if (data.requires_code === false && data.token) {
      writeToken(data.token);
      bumpSessionSignal();
    }
    return data;
  },
  // Step 2 of two-step login: exchange a valid code for a session.
  async loginVerify(challengeId: string, code: string): Promise<{ token: string; user: KXUser }> {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/login/verify", {
      challenge_id: challengeId,
      code,
    });
    writeToken(data.token);
    bumpSessionSignal();
    return data;
  },
  // Change the current user's password. The server verifies the old password,
  // enforces strength, and revokes every OTHER session.
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await request<{ ok: boolean }>("POST", "/api/auth/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  },
  // Request a reset code by email. Always resolves (the server responds
  // generically so this can't be used to enumerate registered addresses).
  async forgotPassword(email: string, locale?: string, captcha?: KXCaptchaAnswer): Promise<{ ok: boolean; expires_in: number }> {
    return request("POST", "/api/auth/forgot-password", { email, locale, ...(captcha ?? {}) });
  },
  // Complete a password reset with the emailed code. Revokes ALL sessions.
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await request<{ ok: boolean }>("POST", "/api/auth/reset-password", {
      email,
      code,
      new_password: newPassword,
    });
  },
  async logout(): Promise<void> {
    try {
      await request<void>("POST", "/api/auth/logout");
    } finally {
      writeToken(null);
      bumpSessionSignal();
    }
  },
  async me(): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("GET", "/api/auth/me");
    return user;
  },
  // Q&A best answer: the question author marks one answer accepted.
  acceptAnswer(commentId: string, on: boolean): Promise<{ ok: boolean; accepted: boolean }> {
    return request(on ? "POST" : "DELETE", `/api/comments/${encodeURIComponent(commentId)}/accept`);
  },
  // Guest-friendly probe used by SessionBootstrap on every page load. Returns
  // 200 with { authenticated: false } for anonymous visitors instead of 401, so
  // a guest hitting /login never produces a console error.
  async session(): Promise<{ authenticated: boolean; user: KXUser | null }> {
    return request<{ authenticated: boolean; user: KXUser | null }>("GET", "/api/auth/session");
  },
  async updateMe(patch: Partial<KXUser> & { password?: string }): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("PATCH", "/api/auth/me", patch);
    return user;
  },
  async deleteMe(): Promise<void> {
    await request<void>("DELETE", "/api/auth/me");
    writeToken(null);
    bumpSessionSignal();
  },

  // ---- bootstrap ----
  async bootstrap(): Promise<{ user: KXUser; feed: KXPost[]; unread_notifications: number; server_time: string }> {
    return request("GET", "/api/bootstrap");
  },

  // ---- realtime ----
  async issueEventsToken(): Promise<{ token: string; expires_in: number }> {
    return request("POST", "/api/events/token");
  },

  // ---- regions ----
  async countries(): Promise<KXCountry[]> {
    const { items } = await request<{ items: KXCountry[] }>("GET", "/api/regions/countries");
    return items;
  },
  async provinces(country: string): Promise<{ country: string; has_provinces: boolean; items: KXProvince[] }> {
    return request("GET", `/api/regions/provinces?country=${encodeURIComponent(country)}`);
  },
  async cities(country: string, province?: string): Promise<{ country: string; province: string; items: KXCity[] }> {
    const params = new URLSearchParams({ country });
    if (province) params.set("province", province);
    return request("GET", `/api/regions/cities?${params.toString()}`);
  },
  async popularRegions(): Promise<KXRegion[]> {
    const { items } = await request<{ items: KXRegion[] }>("GET", "/api/regions/popular");
    return items;
  },
  async marketingCopy(page: string, locale: string): Promise<MarketingCopyBlock[]> {
    const usp = new URLSearchParams({ page, locale });
    const { items } = await request<{ items: MarketingCopyBlock[] }>("GET", `/api/marketing-copy?${usp.toString()}`);
    return items;
  },
  async marketingCopyOverrides(locale: "zh" | "en" | "ja"): Promise<MarketingCopyOverrides> {
    const usp = new URLSearchParams({ locale });
    return request("GET", `/api/marketing-copy-overrides?${usp.toString()}`);
  },
  async resolveRegion(code: string): Promise<KXRegion> {
    return request("GET", `/api/regions/resolve?code=${encodeURIComponent(code)}`);
  },
  async detectRegion(): Promise<KXRegion & { source?: "account" | "ip" | "fallback"; geo_state?: string }> {
    return request("GET", "/api/regions/detect");
  },

  // Machi Guide articles so old rails degrade into Guide content.

  // ---- users ----
  async userDetail(id: string): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("GET", `/api/users/${encodeURIComponent(id)}`);
    return user;
  },
  async userPosts(id: string, opts: { cursor?: string; segment?: ProfileSegment } = {}): Promise<Paginated<KXPost> | Paginated<KXComment>> {
    const segment = opts.segment || "posts";
    const params = new URLSearchParams();
    if (opts.cursor) params.set("cursor", opts.cursor);
    const path = `/api/users/${encodeURIComponent(id)}/${segment}?${params.toString()}`;
    return request("GET", path);
  },
  async follow(id: string, on: boolean): Promise<void> {
    await request<void>(on ? "POST" : "DELETE", `/api/users/${encodeURIComponent(id)}/follow`);
  },
  async block(id: string, on: boolean): Promise<void> {
    await request<void>(on ? "POST" : "DELETE", `/api/users/${encodeURIComponent(id)}/block`);
  },
  async reportUser(id: string, reason: string, note?: string): Promise<void> {
    await request<void>("POST", `/api/users/${encodeURIComponent(id)}/report`, { reason, note });
  },
  async followers(id: string): Promise<KXUser[]> {
    const { items } = await request<{ items: KXUser[] }>("GET", `/api/users/${encodeURIComponent(id)}/followers`);
    return items;
  },
  async following(id: string): Promise<KXUser[]> {
    const { items } = await request<{ items: KXUser[] }>("GET", `/api/users/${encodeURIComponent(id)}/following`);
    return items;
  },
  async blocks(): Promise<KXUser[]> {
    const { items } = await request<{ items: KXUser[] }>("GET", `/api/blocks`);
    return items;
  },

  // ---- feed / posts ----
  async feed(mode: FeedMode, cursor?: string, opts: {
    country?: string;
    province?: string;
    city?: string;
    region_code?: string;
    content_type?: ContentType | ContentType[];
  } = {}): Promise<Paginated<KXPost> & { mode: FeedMode }> {
    const params = new URLSearchParams({ mode });
    if (cursor) params.set("cursor", cursor);
    if (opts.country) params.set("country", opts.country);
    if (opts.province) params.set("province", opts.province);
    if (opts.city) params.set("city", opts.city);
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.content_type) params.set("content_type", Array.isArray(opts.content_type) ? opts.content_type.join(",") : opts.content_type);
    return request("GET", `/api/feed?${params.toString()}`);
  },
  async createPost(payload: {
    content: string;
    media_ids?: string[];
    tags?: string[];
    repost_of_id?: string;
    country?: string;
    province?: string;
    city?: string;
    region_code?: string;
    content_type?: ContentType;
    attributes?: Record<string, unknown>;
    language?: string;
  }): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>("POST", `/api/posts`, payload);
    return post;
  },
  async post(id: string): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>("GET", `/api/posts/${encodeURIComponent(id)}`);
    return post;
  },
  async editPost(id: string, content: string): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>("PATCH", `/api/posts/${encodeURIComponent(id)}`, { content });
    return post;
  },
  async deletePost(id: string): Promise<void> {
    await request<void>("DELETE", `/api/posts/${encodeURIComponent(id)}`);
  },
  async toggleLike(id: string, on: boolean): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>(on ? "POST" : "DELETE", `/api/posts/${encodeURIComponent(id)}/like`);
    return post;
  },
  async toggleBookmark(id: string, on: boolean): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>(on ? "POST" : "DELETE", `/api/posts/${encodeURIComponent(id)}/bookmark`);
    return post;
  },
  async toggleMeetupJoin(id: string, on: boolean): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>(on ? "POST" : "DELETE", `/api/posts/${encodeURIComponent(id)}/join`);
    return post;
  },
  async toggleRepost(id: string, on: boolean): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>(on ? "POST" : "DELETE", `/api/posts/${encodeURIComponent(id)}/repost`);
    return post;
  },
  async votePoll(id: string, optionIndex: number): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>(
      "POST",
      `/api/posts/${encodeURIComponent(id)}/poll/vote`,
      { option_index: optionIndex },
    );
    return post;
  },
  async quoteRepost(originalId: string, content: string): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>("POST", `/api/posts`, { content, repost_of_id: originalId });
    return post;
  },
  async viewPost(id: string): Promise<void> {
    await request<void>("POST", `/api/posts/${encodeURIComponent(id)}/view`);
  },
  async reportPost(id: string, reason: string, note?: string): Promise<void> {
    await request<void>("POST", `/api/posts/${encodeURIComponent(id)}/report`, { reason, note });
  },

  // ---- structured city listings ----
  async listings(opts: {
    type: KXListingType;
    city_slug?: string;
    city_slugs?: string;
    city?: string;
    country?: string;
    country_code?: string;
    region_code?: string;
    region_codes?: string;
    /** 逗号分隔的都道府县(省/州)code,服务端按 region_code 前缀匹配整个县。 */
    province_codes?: string;
    category?: string;
    /** 逗号分隔的多类目过滤（如住宿集合、服务分区集合），优先于 category。 */
    categories?: string;
    q?: string;
    sort?: string;
    min_price?: number | string;
    max_price?: number | string;
    status?: string;
    owner?: "me";
    limit?: number;
    /** keyset 游标（latest 排序下服务端返回 next_cursor）。 */
    cursor?: string;
    /** 详情页「TA 的其他发布」：按卖家过滤公开发布。 */
    seller_id?: string;
    /** 排除某条 id（如当前详情页自身）。 */
    exclude?: string;
    /** 属性级服务端筛选，键为属性名（如 condition），值支持逗号多选。 */
    attrs?: Record<string, string>;
  }): Promise<{
    items: KXCityListing[];
    next_cursor: string | null;
    type: KXListingType;
    /** 空结果回退契约：命中回退时 data.filters.fallback = "metro_circle" | "country"，fallback_label = 展示名。 */
    data?: { filters?: { fallback?: string; fallback_label?: string } };
  }> {
    const params = new URLSearchParams({ type: opts.type });
    for (const [key, value] of Object.entries(opts)) {
      if (key === "type" || key === "attrs" || value == null || value === "") continue;
      params.set(key, String(value));
    }
    for (const [key, value] of Object.entries(opts.attrs || {})) {
      if (!key || !value) continue;
      params.set(`attr_${key}`, value);
    }
    return request("GET", `/api/listings?${params.toString()}`);
  },
  async listing(id: string): Promise<KXCityListing> {
    const { listing } = await request<{ listing: KXCityListing }>("GET", `/api/listings/${encodeURIComponent(id)}`);
    return listing;
  },
  async similarListings(id: string, limit = 8): Promise<KXCityListing[]> {
    const { items } = await request<{ items: KXCityListing[] }>("GET", `/api/listings/${encodeURIComponent(id)}/similar?limit=${limit}`);
    return items;
  },
  async createListing(payload: KXCreateListingPayload): Promise<KXCityListing> {
    const { listing } = await request<{ listing: KXCityListing }>(
      "POST",
      `/api/listings`,
      payload,
      { headers: { "Idempotency-Key": idempotencyKey("listing-create") } },
    );
    return listing;
  },
  async updateListing(id: string, patch: Partial<KXCreateListingPayload> & { status?: string }): Promise<KXCityListing> {
    const { listing } = await request<{ listing: KXCityListing }>("PATCH", `/api/listings/${encodeURIComponent(id)}`, patch);
    return listing;
  },
  async deleteListing(id: string): Promise<void> {
    await request<void>("DELETE", `/api/listings/${encodeURIComponent(id)}`);
  },
  async listingTaxonomy(type: KXListingType | string): Promise<KXListingTaxonomyPayload> {
    return request("GET", `/api/listing-taxonomy?type=${encodeURIComponent(type)}`);
  },
  async adminListingTaxonomy(type?: KXListingType | string): Promise<KXListingTaxonomyPayload | { items: KXListingTaxonomyPayload[] }> {
    return request("GET", `/api/admin/listing-taxonomy${type ? `?type=${encodeURIComponent(type)}` : ""}`);
  },
  async adminCreateTaxonomyCategory(payload: Partial<KXListingTaxonomyCategory>): Promise<{ category: KXListingTaxonomyCategory }> {
    return request("POST", `/api/admin/listing-taxonomy/categories`, payload);
  },
  async adminUpdateTaxonomyCategory(id: string, payload: Partial<KXListingTaxonomyCategory>): Promise<{ category: KXListingTaxonomyCategory }> {
    return request("PATCH", `/api/admin/listing-taxonomy/categories/${encodeURIComponent(id)}`, payload);
  },
  async adminDeleteTaxonomyCategory(id: string): Promise<{ ok: boolean; deleted: boolean }> {
    return request("DELETE", `/api/admin/listing-taxonomy/categories/${encodeURIComponent(id)}`);
  },
  async adminCreateTaxonomyField(payload: Partial<KXListingTaxonomyField>): Promise<{ field: KXListingTaxonomyField }> {
    return request("POST", `/api/admin/listing-taxonomy/fields`, payload);
  },
  async adminUpdateTaxonomyField(id: string, payload: Partial<KXListingTaxonomyField>): Promise<{ field: KXListingTaxonomyField }> {
    return request("PATCH", `/api/admin/listing-taxonomy/fields/${encodeURIComponent(id)}`, payload);
  },
  async adminDeleteTaxonomyField(id: string): Promise<{ ok: boolean; deleted: boolean }> {
    return request("DELETE", `/api/admin/listing-taxonomy/fields/${encodeURIComponent(id)}`);
  },
  async favoriteListing(id: string, on: boolean): Promise<void> {
    await request<void>(on ? "POST" : "DELETE", `/api/listings/${encodeURIComponent(id)}/favorite`);
  },
  async reportListing(id: string, reason: string, note?: string): Promise<void> {
    await request<void>("POST", `/api/listings/${encodeURIComponent(id)}/report`, { reason, note });
  },
  async contactListing(id: string, message: string, contactValue?: string, details?: { label: string; value: string }[]): Promise<{
    ok: boolean;
    message: string;
    conversation_id?: string;
    conversationId?: string;
    inquiry_id?: string;
    inquiryId?: string;
    type?: string;
    status?: string;
    success_title?: string;
    successTitle?: string;
    details?: { label: string; value: string }[];
    metadata?: Record<string, unknown>;
  }> {
    return request(
      "POST",
      `/api/listings/${encodeURIComponent(id)}/inquiry`,
      { message, contact_value: contactValue || "", details: details || [] },
      { headers: { "Idempotency-Key": idempotencyKey("listing-inquiry") } },
    );
  },
  // ---- reservation calendar (no money) ----
  async listingSlots(id: string): Promise<{ items: KXBookingSlot[]; is_owner?: boolean }> {
    return request("GET", `/api/listings/${encodeURIComponent(id)}/slots`);
  },
  async bookSlot(listingId: string, slotId: string, note?: string): Promise<{ ok: boolean; booking?: KXBooking }> {
    return request(
      "POST",
      `/api/listings/${encodeURIComponent(listingId)}/slots/${encodeURIComponent(slotId)}/book`,
      { note: note || "" },
      { headers: { "Idempotency-Key": idempotencyKey("booking") } },
    );
  },
  async createListingSlots(
    listingId: string,
    slots: { start_at: string; end_at?: string; capacity?: number; note?: string }[],
  ): Promise<{ ok: boolean; items: KXBookingSlot[] }> {
    return request("POST", `/api/listings/${encodeURIComponent(listingId)}/slots`, { slots });
  },
  async deleteListingSlot(listingId: string, slotId: string): Promise<void> {
    await request<void>("DELETE", `/api/listings/${encodeURIComponent(listingId)}/slots/${encodeURIComponent(slotId)}`);
  },
  async myReservations(): Promise<KXBooking[]> {
    const { items } = await request<{ items: KXBooking[] }>("GET", `/api/my/reservations`);
    return items;
  },
  async cancelReservation(bookingId: string): Promise<void> {
    await request<void>("POST", `/api/reservations/${encodeURIComponent(bookingId)}/cancel`);
  },
  async myListings(type: KXListingType = "secondhand"): Promise<KXCityListing[]> {
    const { items } = await request<{ items: KXCityListing[] }>("GET", `/api/my/listings?type=${encodeURIComponent(type)}`);
    return items;
  },
  async savedListings(type: KXListingType = "secondhand"): Promise<KXCityListing[]> {
    const { items } = await request<{ items: KXCityListing[] }>("GET", `/api/my/saved-listings?type=${encodeURIComponent(type)}`);
    return items;
  },
  // ---- saved searches (订阅搜索条件,新发布匹配时通知) ----
  async savedSearches(): Promise<KXSavedSearch[]> {
    const { items } = await request<{ items: KXSavedSearch[] }>("GET", "/api/saved_searches");
    return items;
  },
  async createSavedSearch(payload: {
    vertical?: string;
    city_slug?: string;
    region_code?: string;
    country_code?: string;
    keyword?: string;
    category?: string;
    filters?: Record<string, string>;
    cadence?: "instant" | "daily" | "off";
    label?: string;
  }): Promise<KXSavedSearch> {
    const { item } = await request<{ item: KXSavedSearch }>("POST", "/api/saved_searches", payload);
    return item;
  },
  async deleteSavedSearch(id: string): Promise<void> {
    await request<void>("DELETE", `/api/saved_searches/${encodeURIComponent(id)}`);
  },
  async myListingInquiries(opts: { role?: "all" | "sent" | "received"; type?: KXListingType | string; status?: string; bucket?: "consultation" | "reservation" | "application" } = {}): Promise<KXListingInquiry[]> {
    const params = new URLSearchParams();
    if (opts.role) params.set("role", opts.role);
    if (opts.type) params.set("type", opts.type);
    if (opts.status) params.set("status", opts.status);
    if (opts.bucket) params.set("bucket", opts.bucket);
    const { items } = await request<{ items: KXListingInquiry[] }>("GET", `/api/my/listing-inquiries?${params.toString()}`);
    return items;
  },
  async myApplications(): Promise<KXListingInquiry[]> {
    const { items } = await request<{ items: KXListingInquiry[] }>("GET", `/api/my/applications`);
    return items;
  },
  async myBookings(): Promise<{ items: KXListingInquiry[]; guide_service_requests: Array<Record<string, unknown>> }> {
    return request("GET", `/api/my/bookings`);
  },
  async updateListingInquiry(id: string, patch: { status: "new" | "replied" | "closed" | "spam" | "reported" | string }): Promise<KXListingInquiry> {
    const { inquiry } = await request<{ inquiry: KXListingInquiry }>("PATCH", `/api/listing-inquiries/${encodeURIComponent(id)}`, patch);
    return inquiry;
  },
  async deleteListingInquiry(id: string): Promise<KXListingInquiry> {
    const { inquiry } = await request<{ inquiry: KXListingInquiry }>("DELETE", `/api/listing-inquiries/${encodeURIComponent(id)}`);
    return inquiry;
  },
  async myServiceAppointments(): Promise<{ items: KXListingInquiry[]; guide_service_requests: Array<Record<string, unknown>> }> {
    return request("GET", `/api/my/service-appointments`);
  },
  async myOrders(): Promise<{ items: Array<Record<string, unknown>>; membership_orders: Array<Record<string, unknown>>; guide_orders: Array<Record<string, unknown>> }> {
    return request("GET", `/api/my/orders`);
  },

  // ---- listing reviews (local-service ratings on services/deals) ----
  async listingReviews(listingId: string, opts: { limit?: number; offset?: number } = {}): Promise<{
    items: KXListingReview[];
    summary: KXListingReviewSummary;
    my_review?: KXListingReview | null;
    myReview?: KXListingReview | null;
  }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.offset) params.set("offset", String(opts.offset));
    const query = params.toString();
    return request("GET", `/api/listings/${encodeURIComponent(listingId)}/reviews${query ? `?${query}` : ""}`);
  },
  async submitListingReview(listingId: string, payload: { rating: number; content?: string; visit_date?: string }): Promise<{
    review: KXListingReview;
    rating_avg: number;
    rating_count: number;
  }> {
    return request("POST", `/api/listings/${encodeURIComponent(listingId)}/reviews`, payload, {
      headers: { "Idempotency-Key": idempotencyKey("listing-review") },
    });
  },
  async deleteListingReview(listingId: string, reviewId: string): Promise<{ rating_avg: number; rating_count: number }> {
    return request("DELETE", `/api/listings/${encodeURIComponent(listingId)}/reviews/${encodeURIComponent(reviewId)}`);
  },
  async replyListingReview(listingId: string, reviewId: string, content: string): Promise<{ review: KXListingReview }> {
    return request("POST", `/api/listings/${encodeURIComponent(listingId)}/reviews/${encodeURIComponent(reviewId)}/reply`, { content });
  },
  async myBusinessReviews(opts: { status?: string; listingId?: string } = {}): Promise<{
    items: KXListingReview[];
    summary: { count: number; rating_avg: number; unreplied: number };
  }> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.listingId) params.set("listing_id", opts.listingId);
    const query = params.toString();
    return request("GET", `/api/my/business/reviews${query ? `?${query}` : ""}`);
  },

  // ---- public merchant directory ----
  async businessesDirectory(opts: { city?: string; category?: string; q?: string } = {}): Promise<{ items: KXBusinessPublic[]; total: number }> {
    const params = new URLSearchParams();
    if (opts.city) params.set("city", opts.city);
    if (opts.category) params.set("category", opts.category);
    if (opts.q) params.set("q", opts.q);
    const query = params.toString();
    return request("GET", `/api/businesses/directory${query ? `?${query}` : ""}`);
  },
  async businessPublic(businessId: string): Promise<{ business: KXBusinessPublic; listings: KXCityListing[]; reviews: KXListingReview[] }> {
    return request("GET", `/api/businesses/${encodeURIComponent(businessId)}/public`);
  },
  async adminListingReviews(opts: { status?: string; q?: string } = {}): Promise<KXListingReview[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.q) params.set("q", opts.q);
    const query = params.toString();
    const { items } = await request<{ items: KXListingReview[] }>("GET", `/api/admin/listing-reviews${query ? `?${query}` : ""}`);
    return items;
  },
  async adminUpdateListingReview(reviewId: string, status: "published" | "hidden" | "deleted"): Promise<{ review: KXListingReview }> {
    return request("PATCH", `/api/admin/listing-reviews/${encodeURIComponent(reviewId)}`, { status });
  },

  // ---- Machi Reputation ----
  async reputationMe(): Promise<KXReputationProfile> {
    const { data } = await request<{ data: KXReputationProfile }>("GET", `/api/reputation/me`);
    return data;
  },
  async reputationUser(userId: string): Promise<KXReputationProfile> {
    const { data } = await request<{ data: KXReputationProfile }>("GET", `/api/reputation/users/${encodeURIComponent(userId)}`);
    return data;
  },
  async reputationLogsMe(limit = 60): Promise<KXReputationEvent[]> {
    const { items } = await request<{ items: KXReputationEvent[] }>("GET", `/api/reputation/logs/me?limit=${encodeURIComponent(String(limit))}`);
    return items;
  },
  async reputationBadges(): Promise<KXReputationBadge[]> {
    const { items } = await request<{ items: KXReputationBadge[] }>("GET", `/api/reputation/badges`);
    return items;
  },
  async reputationRewardsMe(): Promise<KXReputationReward[]> {
    const { items } = await request<{ items: KXReputationReward[] }>("GET", `/api/reputation/rewards/me`);
    return items;
  },
  async reputationLevels(): Promise<KXReputationLevel[]> {
    const { items } = await request<{ items: KXReputationLevel[] }>("GET", `/api/reputation/levels`);
    return items;
  },
  async reputationPrivileges(): Promise<KXReputationPrivilege[]> {
    const { items } = await request<{ items: KXReputationPrivilege[] }>("GET", `/api/reputation/privileges`);
    return items;
  },

  // ---- comments ----
  async comments(postId: string, sort: "top" | "new" = "top"): Promise<KXComment[]> {
    const { items } = await request<{ items: KXComment[] }>("GET", `/api/posts/${encodeURIComponent(postId)}/comments?sort=${sort}`);
    return items;
  },
  async createComment(postId: string, payload: { content: string; parent_comment_id?: string; reply_to_user_id?: string }): Promise<KXComment> {
    const { comment } = await request<{ comment: KXComment }>("POST", `/api/posts/${encodeURIComponent(postId)}/comments`, payload);
    return comment;
  },
  async deleteComment(id: string): Promise<void> {
    await request<void>("DELETE", `/api/comments/${encodeURIComponent(id)}`);
  },
  async toggleCommentLike(id: string, on: boolean): Promise<void> {
    await request<void>(on ? "POST" : "DELETE", `/api/comments/${encodeURIComponent(id)}/like`);
  },
  async reportComment(id: string, reason: string, note?: string): Promise<void> {
    await request<void>("POST", `/api/comments/${encodeURIComponent(id)}/report`, { reason, note });
  },

  // ---- search / topics ----
  async search(q: string, kind: "all" | "post" | "listing" | "user" | "topic" | "guide" = "all"): Promise<{ posts: KXPost[]; listings: KXCityListing[]; users: KXUser[]; topics: KXTrendingTopic[]; guide?: KXSearchGuideItem[] }> {
    const params = new URLSearchParams({ q, kind });
    return request("GET", `/api/search?${params.toString()}`);
  },
  async searchHistory(): Promise<string[]> {
    const { items } = await request<{ items: string[] }>("GET", `/api/search/history`);
    return items;
  },
  async clearSearchHistory(): Promise<void> {
    await request<void>("DELETE", `/api/search/history`);
  },
  async trending(): Promise<{ posts: KXPost[]; topics: KXTrendingTopic[]; users: KXUser[] }> {
    return request("GET", `/api/trending`);
  },
  async exploreHappening(opts: { limit?: number; region_code?: string; country?: string; province?: string; city?: string } = {}): Promise<{ items: KXPost[]; posts: KXPost[]; days: number; fallbackUsed?: boolean }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country) params.set("country", opts.country);
    if (opts.province) params.set("province", opts.province);
    if (opts.city) params.set("city", opts.city);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/api/explore/happening${suffix}`);
  },
  async exploreHot(opts: { limit?: number; region_code?: string; country?: string; province?: string; city?: string } = {}): Promise<{ items: KXPost[]; posts: KXPost[]; days: number; fallbackUsed?: boolean }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country) params.set("country", opts.country);
    if (opts.province) params.set("province", opts.province);
    if (opts.city) params.set("city", opts.city);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/api/explore/hot${suffix}`);
  },
  async exploreTopics(opts: { limit?: number; region_code?: string; country?: string; province?: string; city?: string } = {}): Promise<{ topics: KXTrendingTopic[]; items: KXTrendingTopic[]; days: number; fallbackUsed?: boolean }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country) params.set("country", opts.country);
    if (opts.province) params.set("province", opts.province);
    if (opts.city) params.set("city", opts.city);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/api/explore/topics${suffix}`);
  },
  async trendingWeeklyLikes(opts: { limit?: number; days?: number; region_code?: string; country?: string; province?: string; city?: string } = {}): Promise<{ items: KXPost[]; posts: KXPost[]; days: number; metric: "weekly_likes" }> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.days) params.set("days", String(opts.days));
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country) params.set("country", opts.country);
    if (opts.province) params.set("province", opts.province);
    if (opts.city) params.set("city", opts.city);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/api/trending/weekly-likes${suffix}`);
  },
  async topics(): Promise<{ topics: KXTrendingTopic[]; items: KXTrendingTopic[] }> {
    return request("GET", `/api/topics`);
  },
  async topic(tag: string): Promise<{ tag: string; items: KXPost[]; following?: boolean }> {
    return request("GET", `/api/topics/${encodeURIComponent(tag.replace(/^#/, ""))}`);
  },
  // Follow / unfollow a topic tag. 404 on older servers => the caller hides the
  // button (feature not yet deployed) rather than surfacing an error.
  async followTopic(tag: string, on: boolean): Promise<void> {
    await request<void>(on ? "POST" : "DELETE", `/api/topics/${encodeURIComponent(tag.replace(/^#/, ""))}/follow`);
  },

  // ---- notifications ----
  async notifications(kind: string = "all"): Promise<{ items: KXNotification[]; unread_count: number }> {
    const params = new URLSearchParams({ kind });
    return request("GET", `/api/notifications?${params.toString()}`);
  },
  async markNotificationsRead(input: { ids?: string[]; all?: boolean }): Promise<void> {
    await request<void>("POST", `/api/notifications/read`, input);
  },
  async deleteNotification(id: string): Promise<void> {
    await request<void>("DELETE", `/api/notifications/${encodeURIComponent(id)}`);
  },

  // ---- conversations / messages ----
  async conversations(): Promise<KXConversation[]> {
    const { items } = await request<{ items: KXConversation[] }>("GET", `/api/conversations`);
    return items;
  },
  async mutualMessageFriends(opts: { q?: string; limit?: number } = {}): Promise<KXUser[]> {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.limit) params.set("limit", String(opts.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const { items } = await request<{ items: KXUser[] }>("GET", `/api/messages/mutual-friends${suffix}`);
    return items;
  },
  async openConversation(peerId: string): Promise<KXConversation> {
    const { conversation } = await request<{ conversation: KXConversation }>("POST", `/api/conversations`, { peer_id: peerId });
    return conversation;
  },
  async deleteConversation(id: string): Promise<void> {
    await request<void>("DELETE", `/api/conversations/${encodeURIComponent(id)}`);
  },
  async messages(conversationId: string): Promise<KXMessage[]> {
    const { items } = await request<{ items: KXMessage[] }>("GET", `/api/conversations/${encodeURIComponent(conversationId)}/messages`);
    return items;
  },
  async sendMessage(conversationId: string, content: string, mediaIds: string[] = [], attachmentIds: string[] = []): Promise<KXMessage> {
    const { message } = await request<{ message: KXMessage }>(
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { content, media_ids: mediaIds, attachment_ids: attachmentIds },
      { headers: { "Idempotency-Key": idempotencyKey("message-send") } },
    );
    return message;
  },
  async deleteMessage(id: string): Promise<void> {
    await request<void>("DELETE", `/api/messages/${encodeURIComponent(id)}`);
  },
  async messageAttachmentViewUrl(messageId: string, attachmentId: string): Promise<{ url: string; expiresIn: number }> {
    const data = await request<{ ok: boolean; data?: { url: string; expiresIn: number }; url?: string; expiresIn?: number }>(
      "POST",
      `/api/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/view-url`,
    );
    return {
      url: data.data?.url || data.url || "",
      expiresIn: data.data?.expiresIn || data.expiresIn || 0,
    };
  },
  async markConversationRead(id: string): Promise<void> {
    await request<void>("POST", `/api/conversations/${encodeURIComponent(id)}/read`);
  },

  // ---- media ----
  async uploadFile(file: File, options: UploadFileOptions = {}): Promise<{ file: UploadedFile; media: KXMedia }> {
    return uploadFileViaPresignedUrl(file, options);
  },
  async uploadMediaBase64(file: File, options: UploadFileOptions = {}): Promise<KXMedia> {
    const uploaded = await uploadFileViaPresignedUrl(file, options);
    return uploaded.media;
  },
  async deleteMedia(id: string): Promise<void> {
    await request<void>("DELETE", `/api/media/${encodeURIComponent(id)}`);
  },
  async deleteUploadedFile(id: string): Promise<void> {
    await request<void>("DELETE", `/api/uploads/${encodeURIComponent(id)}`);
  },

  // ---- settings ----
  async settings(): Promise<KXSettings> {
    const { settings } = await request<{ settings: KXSettings }>("GET", `/api/settings`);
    return settings;
  },
  async updateSettings(patch: Partial<KXSettings>): Promise<KXSettings> {
    const { settings } = await request<{ settings: KXSettings }>("PATCH", `/api/settings`, patch);
    return settings;
  },
  async clearCache(): Promise<void> {
    await request<void>("POST", `/api/cache/clear`);
  },
  async exportData(): Promise<unknown> {
    return request("GET", `/api/export`);
  },
  async submitFeedback(payload: { category: string; content: string }): Promise<void> {
    await request<void>("POST", `/api/feedback`, payload);
  },
  async businessProfile(): Promise<{ business: KXBusinessProfile | null; status: string }> {
    return request("GET", `/api/business/profile`);
  },
  async saveBusinessApplication(payload: Partial<KXBusinessProfile> & {
    businessName?: string;
    businessType?: string;
    legalName?: string;
    representativeName?: string;
    registrationNumber?: string;
    countryCode?: string;
    citySlug?: string;
    serviceCategories?: string[];
    serviceCities?: string[];
    applicationNote?: string;
    uploaded_file_ids?: string[];
    uploadedFileIds?: string[];
    documentTypes?: Record<string, string>;
    submit?: boolean;
  }): Promise<{ business: KXBusinessProfile; user?: KXUser }> {
    return request("POST", `/api/business/application`, payload, { headers: { "Idempotency-Key": idempotencyKey("business-application") } });
  },
  async deleteBusinessDocument(documentId: string): Promise<{ business: KXBusinessProfile; user?: KXUser }> {
    return request("DELETE", `/api/business/documents/${encodeURIComponent(documentId)}`);
  },
  async businessDashboard(): Promise<KXBusinessDashboard> {
    return request("GET", `/api/business/dashboard`);
  },

  // ---- devices ----
  async devices(): Promise<KXDevice[]> {
    const { items } = await request<{ items: KXDevice[] }>("GET", `/api/devices`);
    return items;
  },
  async revokeDevice(id: string): Promise<void> {
    await request<void>("DELETE", `/api/devices/${encodeURIComponent(id)}`);
  },
  async siteSettings(): Promise<SiteSettings> {
    const { settings } = await request<{ settings: SiteSettings }>("GET", `/api/site-settings`);
    return settings;
  },

  // ---- admin ----
  async adminStats(): Promise<{ stats: Record<string, unknown> }> {
    return request("GET", `/api/admin/stats`);
  },
  async adminServerMetrics(): Promise<ServerMetrics> {
    const { metrics } = await request<{ metrics: ServerMetrics }>("GET", `/api/admin/server-metrics`);
    return metrics;
  },
  async adminMedia(opts: { limit?: number; type?: "image" | "video" | "file"; q?: string; scope?: "admin" | "all" } = {}): Promise<AdminMediaItem[]> {
    const usp = new URLSearchParams();
    if (opts.limit) usp.set("limit", String(opts.limit));
    if (opts.type) usp.set("type", opts.type);
    if (opts.q) usp.set("q", opts.q);
    if (opts.scope) usp.set("scope", opts.scope);
    const { items } = await request<{ items: AdminMediaItem[] }>("GET", `/api/admin/media?${usp.toString()}`);
    return items;
  },
  async adminUploadMedia(file: File): Promise<KXMedia> {
    return (await uploadFileViaPresignedUrl(file, { purpose: inferUploadContentType(file) === "application/pdf" ? "guide_product_file" : "guide_article_image" })).media;
  },
  async adminUploads(opts: { limit?: number; status?: string; purpose?: string; userId?: string; q?: string; incomplete?: boolean; large?: boolean; checkObject?: boolean } = {}): Promise<{ items: AdminUploadedFileItem[]; total: number }> {
    const usp = new URLSearchParams();
    if (opts.limit) usp.set("limit", String(opts.limit));
    if (opts.status) usp.set("status", opts.status);
    if (opts.purpose) usp.set("purpose", opts.purpose);
    if (opts.userId) usp.set("userId", opts.userId);
    if (opts.q) usp.set("q", opts.q);
    if (opts.incomplete) usp.set("incomplete", "1");
    if (opts.large) usp.set("large", "1");
    if (opts.checkObject) usp.set("checkObject", "1");
    return request("GET", `/api/admin/uploads?${usp.toString()}`);
  },
  async adminUpdateUpload(id: string, patch: { status?: string; action?: "restore" | "flag" | "mark_abnormal"; reason?: string; metadata?: Record<string, unknown> }): Promise<{ file: UploadedFile }> {
    return request("PATCH", `/api/admin/uploads/${encodeURIComponent(id)}`, patch);
  },
  async uploadPrivateViewUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    return request("POST", `/api/uploads/${encodeURIComponent(id)}/view-url`);
  },
  async adminDeleteUpload(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/uploads/${encodeURIComponent(id)}`);
  },
  async adminCleanupTempUploads(payload: { hours?: number; hardDelete?: boolean } = {}): Promise<{ count: number; deletedObjects: number }> {
    return request("POST", `/api/admin/uploads/cleanup-temp`, payload);
  },
  async adminSiteSettings(): Promise<SiteSettings> {
    const { settings } = await request<{ settings: SiteSettings }>("GET", `/api/admin/site-settings`);
    return settings;
  },
  async adminUpdateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
    const { settings } = await request<{ settings: SiteSettings }>("PATCH", `/api/admin/site-settings`, patch);
    return settings;
  },
  async adminEngagementStatus(): Promise<{
    settings: Record<string, string>;
    stats: { seed_posts: number; seed_likes: number; seed_bookmarks: number; seed_comments: number; persona_follows: number };
  }> {
    return request("GET", `/api/admin/engagement/status`);
  },
  async adminEngagementRun(): Promise<{ ok: boolean; result: { likes: number; bookmarks: number; comments: number; follows: number } }> {
    return request("POST", `/api/admin/engagement/run`, {}, { timeoutMs: 90_000 });
  },
  // Admin-only access log (visitor IP + resolved region + rollups). Requires
  // an admin session; ordinary users get 401/403 from the server.
  async adminVisitors(opts: { limit?: number; days?: number; q?: string } = {}): Promise<{
    items: VisitorLogEntry[];
    summary: VisitorSummary;
  }> {
    const usp = new URLSearchParams();
    if (opts.limit) usp.set("limit", String(opts.limit));
    if (opts.days) usp.set("days", String(opts.days));
    if (opts.q) usp.set("q", opts.q);
    return request("GET", `/api/admin/visitors?${usp.toString()}`);
  },
  async adminEmailCampaigns(limit = 50): Promise<AdminEmailCampaign[]> {
    const { items } = await request<{ items: AdminEmailCampaign[] }>("GET", `/api/admin/email-campaigns?limit=${encodeURIComponent(String(limit))}`);
    return items;
  },
  async adminCreateEmailCampaign(payload: { subject: string; body: string; audience?: string; user_ids?: string[]; sendNow?: boolean }): Promise<AdminEmailCampaign> {
    const { campaign } = await request<{ campaign: AdminEmailCampaign }>("POST", "/api/admin/email-campaigns", payload);
    return campaign;
  },
  async adminUpdateEmailCampaign(id: string, payload: { subject?: string; body?: string; audience?: string; user_ids?: string[]; action?: "send" }): Promise<AdminEmailCampaign> {
    const { campaign } = await request<{ campaign: AdminEmailCampaign }>("PATCH", `/api/admin/email-campaigns/${encodeURIComponent(id)}`, payload);
    return campaign;
  },
  // Preview how many deliverable recipients an audience resolves to (AI/seed +
  // deleted/banned are always excluded server-side).
  async adminEmailCampaignPreview(payload: { audience?: string; user_ids?: string[] }): Promise<{ audience: string; count: number }> {
    return request("POST", "/api/admin/email-campaigns/preview", payload);
  },
  async adminSendEmailCampaign(id: string): Promise<AdminEmailCampaign> {
    const { campaign } = await request<{ campaign: AdminEmailCampaign }>("POST", `/api/admin/email-campaigns/${encodeURIComponent(id)}/send`);
    return campaign;
  },
  async adminReputationUsers(opts: { q?: string; status?: string } = {}): Promise<Array<{ user: KXUser; reputation: KXReputationProfile }>> {
    const usp = new URLSearchParams();
    if (opts.q) usp.set("q", opts.q);
    if (opts.status) usp.set("status", opts.status);
    const { items } = await request<{ items: Array<{ user: KXUser; reputation: KXReputationProfile }> }>("GET", `/api/reputation/admin/users?${usp.toString()}`);
    return items;
  },
  async adminReputationEvents(opts: { user_id?: string; rule_key?: string } = {}): Promise<KXReputationEvent[]> {
    const usp = new URLSearchParams();
    if (opts.user_id) usp.set("user_id", opts.user_id);
    if (opts.rule_key) usp.set("rule_key", opts.rule_key);
    const { items } = await request<{ items: KXReputationEvent[] }>("GET", `/api/reputation/admin/events?${usp.toString()}`);
    return items;
  },
  async adminReputationRisk(minRisk = 31): Promise<Array<Record<string, unknown>>> {
    const { items } = await request<{ items: Array<Record<string, unknown>> }>("GET", `/api/reputation/admin/risk?min_risk=${encodeURIComponent(String(minRisk))}`);
    return items;
  },
  async adminReputationAdjust(payload: { user_id: string; xp_delta?: number; reputation_delta?: number; risk_delta?: number; reason: string }): Promise<KXReputationProfile> {
    const { reputation } = await request<{ reputation: KXReputationProfile }>("POST", `/api/reputation/admin/adjust`, payload);
    return reputation;
  },
  async adminReputationGrantBadge(payload: { user_id: string; badge_key: string; reason: string }): Promise<KXReputationProfile> {
    const { reputation } = await request<{ reputation: KXReputationProfile }>("POST", `/api/reputation/admin/grant-badge`, payload);
    return reputation;
  },
  async adminReputationRevokeBadge(payload: { user_id: string; badge_key: string; reason: string }): Promise<KXReputationProfile> {
    const { reputation } = await request<{ reputation: KXReputationProfile }>("POST", `/api/reputation/admin/revoke-badge`, payload);
    return reputation;
  },
  async adminReputationFreeze(payload: { user_id: string; days?: number; reason: string }): Promise<KXReputationProfile> {
    const { reputation } = await request<{ reputation: KXReputationProfile }>("POST", `/api/reputation/admin/freeze`, payload);
    return reputation;
  },
  async adminReputationUnfreeze(payload: { user_id: string; reason?: string }): Promise<KXReputationProfile> {
    const { reputation } = await request<{ reputation: KXReputationProfile }>("POST", `/api/reputation/admin/unfreeze`, payload);
    return reputation;
  },
  async adminUsers(opts: { q?: string; limit?: number; offset?: number; seed?: boolean; filter?: "all" | "real" | "seed" | "deleted" } = {}): Promise<{
    items: (KXUser & { isSeed?: boolean })[]; total: number; limit: number; offset: number;
    filter?: string; seedTotal: number; realTotal?: number; deletedTotal?: number;
  }> {
    const usp = new URLSearchParams();
    if (opts.q) usp.set("q", opts.q);
    if (opts.limit) usp.set("limit", String(opts.limit));
    if (opts.offset) usp.set("offset", String(opts.offset));
    if (opts.filter) usp.set("filter", opts.filter);
    if (opts.seed) usp.set("seed", "1");
    return request("GET", `/api/admin/users?${usp.toString()}`);
  },
  async adminUpdateUser(id: string, patch: { is_verified?: boolean; is_official?: boolean; official_role?: string; role?: string; membership_tier?: string; creator_badge?: string; custom_tags?: string[]; is_merchant?: boolean; merchant_verified?: boolean; email?: string }): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("PATCH", `/api/admin/users/${encodeURIComponent(id)}`, patch);
    return user;
  },
  async adminSuspendUser(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/users/${encodeURIComponent(id)}`);
  },
  async adminRestoreUser(id: string): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("POST", `/api/admin/users/${encodeURIComponent(id)}/restore`);
    return user;
  },
  // Admin-set a user's password. Plaintext is sent over the existing
  // HTTPS/session-authed channel and never persisted client-side.
  async adminSetUserPassword(id: string, password: string): Promise<void> {
    await request<void>("POST", `/api/admin/users/${encodeURIComponent(id)}/password`, { password });
  },
  // Permanent account erasure (scrubs PII + hides content) — distinct from
  // the recoverable suspend/ban above.
  async adminEraseUser(id: string): Promise<void> {
    await request<void>("POST", `/api/admin/users/${encodeURIComponent(id)}/erase`);
  },
  async adminPosts(q?: string, opts: { status?: string; content_type?: ContentType; country?: string; city?: string; region_code?: string } = {}): Promise<KXPost[]> {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    if (opts.status) usp.set("status", opts.status);
    if (opts.content_type) usp.set("content_type", opts.content_type);
    if (opts.country) usp.set("country", opts.country);
    if (opts.city) usp.set("city", opts.city);
    if (opts.region_code) usp.set("region_code", opts.region_code);
    const { items } = await request<{ items: KXPost[] }>("GET", `/api/admin/posts?${usp.toString()}`);
    return items;
  },
  async adminUpdatePost(id: string, patch: { status?: string; is_boosted?: boolean; boost_weight?: number; boosted_until?: string }): Promise<KXPost> {
    const { post } = await request<{ post: KXPost }>("PATCH", `/api/admin/posts/${encodeURIComponent(id)}`, patch);
    return post;
  },
  async adminDeletePost(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/posts/${encodeURIComponent(id)}`);
  },
  async adminListings(opts: { q?: string; type?: KXListingType | string; status?: string; verification_status?: string; city?: string } = {}): Promise<KXCityListing[]> {
    const usp = new URLSearchParams();
    if (opts.q) usp.set("q", opts.q);
    if (opts.type) usp.set("type", opts.type);
    if (opts.status) usp.set("status", opts.status);
    if (opts.verification_status) usp.set("verification_status", opts.verification_status);
    if (opts.city) usp.set("city", opts.city);
    const { items } = await request<{ items: KXCityListing[] }>("GET", `/api/admin/listings?${usp.toString()}`);
    return items;
  },
  async adminUpdateListing(id: string, patch: { status?: string; verification_status?: string; title?: string; description?: string; price?: number | null; location_text?: string; is_promoted?: boolean; promotion_weight?: number; promotion_type?: string; placement?: string; note?: string }): Promise<KXCityListing> {
    const { listing } = await request<{ listing: KXCityListing }>("PATCH", `/api/admin/listings/${encodeURIComponent(id)}`, patch);
    return listing;
  },
  async adminDeleteListing(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/listings/${encodeURIComponent(id)}`);
  },

  // ---- admin: 入驻商专属后台（星域等房源导入后台）----
  async adminPartners(): Promise<{ partners: Partner[] }> {
    return request("GET", `/api/admin/partners`);
  },
  // 创建后一次性返回明文 accessToken 与专属链接 url；之后只能查看 tokenHint。
  async adminCreatePartner(body: {
    key: string;
    name: string;
    name_ja?: string;
    name_en?: string;
    website?: string;
    brand_color?: string;
    accent_color?: string;
    logo_url?: string;
    intro?: string;
    default_city_slug?: string;
    default_region_code?: string;
    default_country_code?: string;
    default_listing_type?: string;
    default_category?: string;
    sale_enabled?: boolean;
    machi_recommended_default?: boolean;
    default_badges?: string[];
  }): Promise<{ partner: Partner; accessToken: string; url: string }> {
    return request("POST", `/api/admin/partners`, body);
  },
  async adminUpdatePartner(key: string, body: {
    name?: string;
    name_ja?: string;
    name_en?: string;
    website?: string;
    brand_color?: string;
    accent_color?: string;
    logo_url?: string;
    intro?: string;
    status?: string;
    default_city_slug?: string;
    default_region_code?: string;
    default_country_code?: string;
    default_listing_type?: string;
    default_category?: string;
    sale_enabled?: boolean;
    machi_recommended_default?: boolean;
    default_badges?: string[];
  }): Promise<{ partner: Partner }> {
    return request("PATCH", `/api/admin/partners/${encodeURIComponent(key)}`, body);
  },
  // 旧口令立即失效，返回新的一次性明文 accessToken。
  async adminRotatePartnerToken(key: string): Promise<{ accessToken: string }> {
    return request("POST", `/api/admin/partners/${encodeURIComponent(key)}/rotate-token`, {});
  },
  async adminPartnerListings(key: string): Promise<{ listings: KXCityListing[] }> {
    return request("GET", `/api/admin/partners/${encodeURIComponent(key)}/listings`);
  },
  async adminPartnerStarealPreview(
    key: string,
    options: AdminPartnerStarealOptions = {},
  ): Promise<AdminPartnerStarealPreviewResult> {
    return request("POST", `/api/admin/partners/${encodeURIComponent(key)}/stareal/preview`, options, {
      timeoutMs: 120_000,
    });
  },
  async adminPartnerStarealSync(
    key: string,
    options: AdminPartnerStarealOptions = {},
  ): Promise<AdminPartnerStarealSyncResult> {
    return request("POST", `/api/admin/partners/${encodeURIComponent(key)}/stareal/sync`, options, {
      timeoutMs: 30_000,
    });
  },
  async adminPartnerStarealJob(key: string): Promise<{ job: AdminPartnerStarealJob | null }> {
    return request("GET", `/api/admin/partners/${encodeURIComponent(key)}/stareal/job`);
  },

  async adminListingReports(status = "open"): Promise<Array<Record<string, unknown>>> {
    const { items } = await request<{ items: Array<Record<string, unknown>> }>("GET", `/api/admin/listing-reports?status=${encodeURIComponent(status)}`);
    return items;
  },
  async adminListingPromotions(opts: { status?: string; promotion_type?: string; city?: string } = {}): Promise<Array<Record<string, unknown>>> {
    const usp = new URLSearchParams();
    if (opts.status) usp.set("status", opts.status);
    if (opts.promotion_type) usp.set("promotion_type", opts.promotion_type);
    if (opts.city) usp.set("city", opts.city);
    const { items } = await request<{ items: Array<Record<string, unknown>> }>("GET", `/api/admin/listings/promotions?${usp.toString()}`);
    return items;
  },
  async adminCreateListingPromotion(payload: { listing_id: string; promotion_type: string; placement?: string; weight?: number; starts_at?: string; ends_at?: string }): Promise<Record<string, unknown>> {
    const { promotion } = await request<{ promotion: Record<string, unknown> }>("POST", `/api/admin/listings/promotions`, payload);
    return promotion;
  },
  async adminListingVerifications(opts: { status?: string; subject_type?: string } = {}): Promise<Array<Record<string, unknown>>> {
    const usp = new URLSearchParams();
    if (opts.status) usp.set("status", opts.status);
    if (opts.subject_type) usp.set("subject_type", opts.subject_type);
    const { items } = await request<{ items: Array<Record<string, unknown>> }>("GET", `/api/admin/seller-verifications?${usp.toString()}`);
    return items;
  },
  async adminBusinesses(opts: { status?: string; verification_status?: string; q?: string } = {}): Promise<KXBusinessProfile[]> {
    const usp = new URLSearchParams();
    if (opts.status) usp.set("status", opts.status);
    if (opts.verification_status) usp.set("verification_status", opts.verification_status);
    if (opts.q) usp.set("q", opts.q);
    const { items } = await request<{ items: KXBusinessProfile[] }>("GET", `/api/admin/businesses?${usp.toString()}`);
    return items;
  },
  async adminUpdateBusiness(id: string, patch: { status?: string; verification_status?: string; review_note?: string; note?: string }): Promise<KXBusinessProfile> {
    const { business } = await request<{ business: KXBusinessProfile }>("PATCH", `/api/admin/businesses/${encodeURIComponent(id)}`, patch);
    return business;
  },
  async adminComments(): Promise<KXComment[]> {
    const { items } = await request<{ items: KXComment[] }>("GET", `/api/admin/comments`);
    return items;
  },
  async adminDeleteComment(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/comments/${encodeURIComponent(id)}`);
  },
  async adminReports(): Promise<Array<{ id: string; reporter: KXUser | null; target_kind: string; target_id: string; reason: string; note: string; created_at: string; preview: { content?: string; author?: KXUser | null } }>> {
    const { items } = await request<{ items: unknown[] }>("GET", `/api/admin/reports`);
    return items as never;
  },
  async adminResolveReport(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/reports/${encodeURIComponent(id)}`);
  },
  async adminFeedback(): Promise<Array<{ id: string; category: string; content: string; created_at: string; user: KXUser | null }>> {
    const { items } = await request<{ items: unknown[] }>("GET", `/api/admin/feedback`);
    return items as never;
  },
  async adminMarketingCopy(): Promise<MarketingCopyBlock[]> {
    const { items } = await request<{ items: MarketingCopyBlock[] }>("GET", `/api/admin/marketing-copy`);
    return items;
  },
  async adminCreateMarketingCopy(payload: {
    page_key: string;
    locale: string;
    title: string;
    body: string;
    status?: "draft" | "published";
    sort_order?: number;
  }): Promise<MarketingCopyBlock> {
    const { item } = await request<{ item: MarketingCopyBlock }>("POST", `/api/admin/marketing-copy`, payload);
    return item;
  },
  async adminUpdateMarketingCopy(id: string, patch: Partial<Pick<MarketingCopyBlock, "page_key" | "locale" | "title" | "body" | "status" | "sort_order">>): Promise<MarketingCopyBlock> {
    const { item } = await request<{ item: MarketingCopyBlock }>("PATCH", `/api/admin/marketing-copy/${encodeURIComponent(id)}`, patch);
    return item;
  },
  async adminDeleteMarketingCopy(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/marketing-copy/${encodeURIComponent(id)}`);
  },
  async adminMarketingCopyOverrides(locale: "zh" | "en" | "ja"): Promise<MarketingCopyOverrides> {
    const usp = new URLSearchParams({ locale });
    return request("GET", `/api/admin/marketing-copy-overrides?${usp.toString()}`);
  },
  async adminUpdateMarketingCopyOverrides(
    locale: "zh" | "en" | "ja",
    values: Record<string, string>,
  ): Promise<MarketingCopyOverrides> {
    return request("PATCH", `/api/admin/marketing-copy-overrides`, { locale, values });
  },

  // ---- admin: Local News Desk (本地资讯台) ----
  async adminSeedNewsSourcePresets(): Promise<{ total: number; active: number }> {
    return request("POST", `/api/admin/news-sources/seed-presets`, {});
  },
  async adminCreateEditorialDraftFromItem(id: string): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("POST", `/api/admin/news-items/${encodeURIComponent(id)}/create-draft`, {});
    return post;
  },
  async adminCreateEditorialDraftsFromItems(payload: { itemIds: string[]; targetLanguage?: string; authorDisplayName?: string; createMode?: "summary_only" | "editor_template" }): Promise<{ items: EditorialPost[]; created: number; errors: Array<Record<string, string>> }> {
    return request("POST", `/api/admin/news-items/create-drafts`, payload);
  },

  // ---- admin: City Seed Bot (城市内容助手) ----
  async adminSeedGenerate(payload: {
    country?: string; city?: string; regionCode?: string; language: string;
    contentType: string; count: number; tone: string; publishNow: boolean; engine?: string; model?: string;
    regionMode?: "single" | "random" | "spread"; regionCodes?: string[]; spreadCities?: number;
  }): Promise<{
    batch?: SeedBatch; requested: number; created: number; engine?: string; model?: string;
    mode?: string; region_code?: string; city_name?: string; spread_group_id?: string;
    cities?: { region_code: string; city_name: string; batch_id: string; created: number }[];
    batches?: SeedBatch[];
  }> {
    return request("POST", `/api/admin/seed-content/generate`, payload, { timeoutMs: 180_000 });
  },
  // 一键铺城: personas -> spotlight drafts -> follower curve -> engagement tick.
  async adminSeedCityMacro(payload: {
    regionMode?: "single" | "random" | "spread"; regionCode?: string; country?: string; province?: string; city?: string;
    regionCodes?: string[]; spreadCities?: number;
    language: string; contentType: string; count: number; tone: string;
    engine?: string; model?: string; publishNow?: boolean;
  }): Promise<{
    ok: boolean; mode: string; spread_group_id: string;
    personas_imported: number; personas_total: number; followers_granted: number;
    engagement: Record<string, number>;
    cities: { region_code: string; city_name: string; batch_id: string; created: number }[];
    batches: SeedBatch[]; requested: number; created: number; engine?: string; publishNow: boolean;
  }> {
    return request("POST", `/api/admin/seed-content/seed-city`, payload, { timeoutMs: 300_000 });
  },
  // Set a user's follower count to a target by materializing REAL follows from
  // imported persona accounts (real followers untouched; target floors at real).
  async adminSetFollowerCount(id: string, target: number): Promise<{
    ok: boolean; follower_count: number; seed_followers: number; real_followers: number;
    added: number; removed: number; pool_exhausted: boolean; pool_size: number;
  }> {
    return request("POST", `/api/admin/users/${encodeURIComponent(id)}/follower-count`,
      { target: Math.max(0, Math.floor(target)) }, { timeoutMs: 60_000 });
  },
  // Give every imported persona a believable, log-skewed follower count.
  async adminRandomizeFollowers(opts: { min?: number; max?: number } = {}): Promise<{
    ok: boolean; updated: number; added: number; total_follows: number;
  }> {
    return request("POST", `/api/admin/engagement/randomize-followers`,
      { min: opts.min ?? 20, max: opts.max ?? 300 }, { timeoutMs: 120_000 });
  },
  async adminSeedEngines(): Promise<{
    default: string; configured: string[]; engine_a: boolean; engine_b: boolean;
    engines: string[];
    modes: { id: string; label: string }[]; default_mode: string; ready: boolean;
  }> {
    return request("GET", `/api/admin/seed-content/engines`);
  },
  async adminSeedBatches(opts: { region_code?: string; status?: string; limit?: number } = {}): Promise<SeedBatch[]> {
    const usp = new URLSearchParams();
    if (opts.region_code) usp.set("region_code", opts.region_code);
    if (opts.status) usp.set("status", opts.status);
    if (opts.limit) usp.set("limit", String(opts.limit));
    const { items } = await request<{ items: SeedBatch[] }>("GET", `/api/admin/seed-content/batches?${usp.toString()}`);
    return items;
  },
  async adminSeedBatch(id: string): Promise<SeedBatch> {
    const { batch } = await request<{ batch: SeedBatch }>("GET", `/api/admin/seed-content/batches/${encodeURIComponent(id)}`);
    return batch;
  },
  async adminSeedPublish(id: string): Promise<{ published: number; batch: SeedBatch }> {
    return request("POST", `/api/admin/seed-content/batches/${encodeURIComponent(id)}/publish`, {});
  },
  // Clear requires confirm=true server-side; the UI also gates it behind a
  // destructive ConfirmDialog. Only ever soft-deletes is_seed_content rows.
  async adminSeedClear(id: string): Promise<{ cleared: number; batch: SeedBatch }> {
    return request("POST", `/api/admin/seed-content/batches/${encodeURIComponent(id)}/clear`, { confirm: true });
  },
  async adminSeedClearCity(payload: { regionCode?: string; country?: string; city?: string; language?: string; contentType?: string }): Promise<{ cleared: number; region_code: string }> {
    return request("POST", `/api/admin/seed-content/clear-city`, { ...payload, confirm: true });
  },
  async adminSeedLogs(limit = 50): Promise<SeedLog[]> {
    const { items } = await request<{ items: SeedLog[] }>("GET", `/api/admin/seed-content/logs?limit=${limit}`);
    return items;
  },

  // ---- admin: City Content Pack (城市精选内容包) — premium curated listings ----
  async adminContentPackPreview(cities?: string[]): Promise<{
    preview: { version: string; total: number; by_city: Record<string, number>; by_type: Record<string, number>; cities: string[] };
    alreadyImported: number; supportedCities: string[]; cityLabels: Record<string, string>;
  }> {
    const usp = new URLSearchParams();
    if (cities && cities.length) usp.set("cities", cities.join(","));
    return request("GET", `/api/admin/content-pack/preview?${usp.toString()}`);
  },
  async adminContentPackImport(cities?: string[]): Promise<{ ok: boolean; result: {
    created: number; updated: number; total: number;
    by_city: Record<string, number>; by_type: Record<string, number>; pack_version: string;
  } }> {
    return request("POST", `/api/admin/content-pack/import`, { cities: cities && cities.length ? cities : undefined }, { timeoutMs: 120_000 });
  },
  async adminContentPackClear(cities?: string[]): Promise<{ ok: boolean; cleared: number }> {
    return request("POST", `/api/admin/content-pack/clear`, { cities: cities && cities.length ? cities : undefined, confirm: true }, { timeoutMs: 90_000 });
  },
  async adminContentPackUsersPreview(): Promise<{
    pack: { total: number; by_city: Record<string, number>; photographic: number; illustrated: number };
    alreadyImported: number;
  }> {
    return request("GET", `/api/admin/content-pack/users/preview`);
  },
  async adminContentPackUsersImport(): Promise<{ ok: boolean; result: { created: number; skipped: number; total: number; pack_version: string } }> {
    return request("POST", `/api/admin/content-pack/users/import`, {}, { timeoutMs: 120_000 });
  },
  async adminContentPackUsersClear(): Promise<{ ok: boolean; cleared: number }> {
    return request("POST", `/api/admin/content-pack/users/clear`, { confirm: true }, { timeoutMs: 90_000 });
  },

  // ---- drafts ----
  async drafts(): Promise<KXDraft[]> {
    const { items } = await request<{ items: KXDraft[] }>("GET", `/api/drafts`);
    return items;
  },
  async saveDraft(payload: Partial<KXDraft>): Promise<{ id: string }> {
    return request("POST", `/api/drafts`, payload);
  },
  async deleteDraft(id: string): Promise<void> {
    await request<void>("DELETE", `/api/drafts/${encodeURIComponent(id)}`);
  },

  // ---- Machi Verified membership + payments ----
  async membershipPlan(): Promise<{ plan: KXMembershipPlan | null; plans: KXMembershipPlan[]; items: KXMembershipPlan[]; requires_membership_content_types: string[]; apple_product_id: string; available_providers: PaymentProvider[] }> {
    return request("GET", `/api/membership/plan`);
  },
  async membershipMe(): Promise<KXMembershipMe> {
    return request("GET", `/api/membership/me`);
  },
  async membershipBenefits(): Promise<{ benefits: Array<{ key: string; title: string; description: string; title_zh?: string; title_en?: string; title_ja?: string; description_zh?: string; description_en?: string; description_ja?: string }>; plan: KXMembershipPlan | null; disclaimer: string; requires_membership_content_types: string[] }> {
    return request("GET", `/api/membership/benefits`);
  },
  async membershipExclusive(): Promise<{ membership: KXMembershipStatus; items: EditorialPost[]; guides: Array<{ key: string; title: string; description: string }> }> {
    return request("GET", `/api/membership/exclusive`);
  },
  async membershipOrders(): Promise<{ items: Array<Record<string, unknown>> }> {
    return request("GET", `/api/membership/orders`);
  },
  async membershipInsights(): Promise<KXMembershipInsights> {
    return request("GET", `/api/membership/insights`);
  },
  // Per-group monthly high-trust publishing quota for the current member, so the
  // compose form can show "N left this month" before the paywall. Returns 404 on
  // older servers — callers should treat that as "hide the hint" (not an error).
  async membershipListingQuota(): Promise<{ groups: Array<{ key: string; label: string; used: number; limit: number; remaining: number | null }> }> {
    return request("GET", `/api/my/membership/listing-quota`);
  },
  async createPaymentOrder(provider: PaymentProvider, planKey?: string): Promise<KXCreateOrderResult> {
    return request("POST", `/api/payments/create-order`, { provider, clientType: "web", planKey });
  },
  async createMembershipCheckout(planKey: string): Promise<{ checkout_url: string; checkoutUrl: string; orderNo: string; mock?: boolean }> {
    return request("POST", `/api/membership/create-checkout`, { plan_key: planKey });
  },
  async orderStatus(orderNo: string): Promise<KXOrderStatus> {
    return request("GET", `/api/payments/order-status?orderNo=${encodeURIComponent(orderNo)}`);
  },
  // Confirm a Stripe payment on return to the success page (no webhook needed).
  async confirmStripe(sessionId: string): Promise<KXOrderStatus> {
    return request("POST", `/api/payments/stripe/confirm`, { sessionId });
  },
  // Recover any paid-but-pending Stripe order for the current user (called
  // on the membership page so a missed redirect/webhook still activates).
  async reconcileStripe(): Promise<{ membershipActive: boolean; currentPeriodEnd: string; status: string }> {
    return request("POST", `/api/payments/stripe/reconcile`, {});
  },
  // Dev-only: settle a mock order (server refuses outside dev mock mode).
  async mockConfirmOrder(orderNo: string): Promise<KXOrderStatus & { mock: boolean }> {
    return request("POST", `/api/payments/mock/confirm?order_no=${encodeURIComponent(orderNo)}`);
  },

  // ---- Machi Points wallet ----
  // Capability handshake. Read on demand to gate wallet/commerce UI: a backend
  // without this route (404) means "this version has no wallet" — don't render
  // a topup card that would 404 on /api/wallet/me.
  async clientConfig(): Promise<KXClientConfig> {
    return request("GET", `/api/meta/client-config`);
  },
  async walletMe(platform = "web"): Promise<KXWalletMe> {
    return request("GET", `/api/wallet/me?platform=${encodeURIComponent(platform)}`);
  },
  async walletLedger(page = 1, pageSize = 20): Promise<{ wallet: KXWallet; entries: KXWalletLedgerEntry[]; page: number; pageSize: number; hasMore: boolean }> {
    return request("GET", `/api/wallet/ledger?page=${page}&pageSize=${pageSize}`);
  },
  // Web-only: start a Stripe Checkout for a points top-up. iOS/Android use IAP.
  async walletTopupStripeCheckout(packKey: string, returnUrl?: string): Promise<{ status: string; checkoutUrl: string; orderNo: string; points: number; bonusPoints: number; totalPoints: number; amountCents: number; currency: string }> {
    return request("POST", `/api/wallet/topups/stripe-checkout`, { packKey, returnUrl });
  },
  async walletTopupStripeConfirm(sessionId: string): Promise<{ status: string; orderNo?: string; wallet: KXWallet; grantedPoints?: number }> {
    return request("POST", `/api/wallet/topups/stripe-confirm`, { sessionId });
  },

  // ---- admin: Machi Points wallet ----
  async adminWalletOverview(): Promise<{
    accounts: number; outstandingPoints: number; platformLiabilityPoints: number;
    lifetimePurchasedPoints: number; lifetimeBonusPoints: number; lifetimeSpentPoints: number;
    paidTopupOrders: number; grossTopupCents: number; pendingTopupOrders: number;
    refundedTopupOrders: number; refundedTopupCents: number; restrictedAccounts: number;
    topupConversionRate: number;
    providerBreakdown: Array<{ provider: string; paidOrders: number; grossCents: number }>;
    failedWebhookCount: number;
    failedWebhooks: Array<{ provider: string; eventType: string; eventId: string; orderNo: string; createdAt: string }>;
    funnel: { guideOrdersCreated: number; guideOrdersFulfilled: number; guidePointsOrders: number; topupInitiated: number; topupPaid: number };
  }> {
    return request("GET", `/api/admin/wallet/overview`);
  },
  async adminWalletUsers(opts: { q?: string; status?: string; limit?: number } = {}): Promise<Array<{ userId: string; handle: string; displayName: string; email: string; balancePoints: number; lifetimePurchasedPoints: number; lifetimeSpentPoints: number; status: string; updatedAt: string }>> {
    const params = new URLSearchParams();
    if (opts.q) params.set("q", opts.q);
    if (opts.status) params.set("status", opts.status);
    if (opts.limit) params.set("limit", String(opts.limit));
    const { items } = await request<{ items: Array<{ userId: string; handle: string; displayName: string; email: string; balancePoints: number; lifetimePurchasedPoints: number; lifetimeSpentPoints: number; status: string; updatedAt: string }> }>("GET", `/api/admin/wallet/users?${params.toString()}`);
    return items;
  },
  async adminWalletUserLedger(userId: string): Promise<{ wallet: KXWallet; entries: KXWalletLedgerEntry[] }> {
    return request("GET", `/api/admin/wallet/users/${encodeURIComponent(userId)}/ledger`);
  },
  async adminWalletAdjust(payload: { userId: string; pointsDelta: number; reason: string }): Promise<{ status: string; wallet: KXWallet }> {
    return request("POST", `/api/admin/wallet/adjust`, payload);
  },
  async adminWalletTopupProducts(): Promise<Array<{ id: string; packKey: string; title: string; subtitle: string; points: number; bonusPoints: number; amountCents: number; currency: string; priceLabel: string; isActive: boolean }>> {
    const { items } = await request<{ items: Array<{ id: string; packKey: string; title: string; subtitle: string; points: number; bonusPoints: number; amountCents: number; currency: string; priceLabel: string; isActive: boolean }> }>("GET", `/api/admin/wallet/topup-products`);
    return items;
  },
  async adminWalletUpdateTopupProduct(id: string, patch: Record<string, unknown>): Promise<{ status: string }> {
    return request("PATCH", `/api/admin/wallet/topup-products/${encodeURIComponent(id)}`, patch);
  },

  // ---- admin: membership management ----
  async adminMemberships(opts: { status?: string; q?: string; limit?: number } = {}): Promise<AdminMembershipRow[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.q) params.set("q", opts.q);
    if (opts.limit) params.set("limit", String(opts.limit));
    const { items } = await request<{ items: AdminMembershipRow[] }>("GET", `/api/admin/memberships?${params.toString()}`);
    return items;
  },
  async adminGrantMembership(payload: { userId?: string; handle?: string; months?: number }): Promise<{ membership: KXMembershipStatus; user: KXUser }> {
    return request("POST", `/api/admin/memberships/grant`, payload);
  },
  async adminCancelMembership(payload: { userId?: string; handle?: string; immediate?: boolean }): Promise<{ membership: KXMembershipStatus; user: KXUser }> {
    return request("POST", `/api/admin/memberships/cancel`, payload);
  },
  async adminMembershipPlans(includeInactive = true): Promise<KXMembershipPlan[]> {
    const { items } = await request<{ items: KXMembershipPlan[] }>("GET", `/api/admin/membership/plans?includeInactive=${includeInactive ? "1" : "0"}`);
    return items;
  },
  async adminUpdateMembershipPlan(planKey: string, patch: Record<string, unknown>): Promise<{ status: string; plan: KXMembershipPlan }> {
    return request("PATCH", `/api/admin/membership/plans/${encodeURIComponent(planKey)}`, patch);
  },
  async adminCreateMembershipPlan(payload: Record<string, unknown>): Promise<{ status: string; plan: KXMembershipPlan }> {
    return request("POST", `/api/admin/membership/plans`, payload);
  },
  async adminPricing(): Promise<{ items: Array<Record<string, unknown>>; products: unknown[]; plans: KXMembershipPlan[]; currencies: string[] }> {
    return request("GET", `/api/admin/pricing`);
  },
  async adminPaymentOrders(opts: { status?: string; provider?: string; limit?: number } = {}): Promise<AdminPaymentOrderRow[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.provider) params.set("provider", opts.provider);
    if (opts.limit) params.set("limit", String(opts.limit));
    const { items } = await request<{ items: AdminPaymentOrderRow[] }>("GET", `/api/admin/payment-orders?${params.toString()}`);
    return items;
  },

  // ---- 社交房间(交友 · 约局 · 约饭) ----

  async rooms(opts: { city_slug?: string; region_code?: string; country_code?: string; type?: string; mine?: boolean; offset?: number; limit?: number } = {}): Promise<KXRoomsPage> {
    const params = new URLSearchParams();
    if (opts.city_slug) params.set("city_slug", opts.city_slug);
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country_code) params.set("country_code", opts.country_code);
    if (opts.type) params.set("type", opts.type);
    if (opts.mine) params.set("mine", "1");
    if (opts.offset) params.set("offset", String(opts.offset));
    if (opts.limit) params.set("limit", String(opts.limit));
    return request("GET", `/api/rooms?${params.toString()}`);
  },
  async createRoom(payload: {
    title: string; description?: string; room_type?: string; country_code?: string;
    city_slug?: string; region_code?: string; location_hint?: string; starts_at?: string; capacity?: number;
  }): Promise<KXRoom> {
    const data = await request<{ room: KXRoom }>("POST", "/api/rooms", payload);
    return data.room;
  },
  async room(roomId: string): Promise<KXRoom> {
    const data = await request<{ room: KXRoom }>("GET", `/api/rooms/${encodeURIComponent(roomId)}`);
    return data.room;
  },
  async joinRoom(roomId: string): Promise<KXRoom> {
    const data = await request<{ room: KXRoom }>("POST", `/api/rooms/${encodeURIComponent(roomId)}/join`, {});
    return data.room;
  },
  /** Returns null when the host left and the room disbanded. */
  async leaveRoom(roomId: string): Promise<KXRoom | null> {
    const data = await request<{ room?: KXRoom; disbanded?: boolean }>("POST", `/api/rooms/${encodeURIComponent(roomId)}/leave`, {});
    return data.disbanded ? null : (data.room ?? null);
  },
  async deleteRoom(roomId: string): Promise<void> {
    await request("DELETE", `/api/rooms/${encodeURIComponent(roomId)}`);
  },
  async roomMessages(roomId: string, opts: { before?: string; limit?: number } = {}): Promise<{ items: KXRoomMessage[]; next_before?: string | null }> {
    const params = new URLSearchParams();
    if (opts.before) params.set("before", opts.before);
    if (opts.limit) params.set("limit", String(opts.limit));
    return request("GET", `/api/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`);
  },
  async sendRoomMessage(roomId: string, content: string): Promise<KXRoomMessage> {
    const data = await request<{ message: KXRoomMessage }>("POST", `/api/rooms/${encodeURIComponent(roomId)}/messages`, { content });
    return data.message;
  },

  // ---- Machi 活动(Events, Luma 式) ----

  async events(opts: {
    city_slug?: string; region_code?: string; country_code?: string; category?: string;
    when?: string; featured?: boolean; mine?: boolean; offset?: number; limit?: number;
  } = {}): Promise<KXEventsPage> {
    const params = new URLSearchParams();
    if (opts.city_slug) params.set("city_slug", opts.city_slug);
    if (opts.region_code) params.set("region_code", opts.region_code);
    if (opts.country_code) params.set("country_code", opts.country_code);
    if (opts.category) params.set("category", opts.category);
    if (opts.when) params.set("when", opts.when);
    if (opts.featured) params.set("featured", "1");
    if (opts.mine) params.set("mine", "1");
    if (opts.offset) params.set("offset", String(opts.offset));
    if (opts.limit) params.set("limit", String(opts.limit));
    return request("GET", `/api/machi-events?${params.toString()}`);
  },
  async event(idOrSlug: string): Promise<KXEvent> {
    const data = await request<{ event: KXEvent }>("GET", `/api/machi-events/${encodeURIComponent(idOrSlug)}`);
    return data.event;
  },
  async createEvent(payload: Record<string, unknown>): Promise<KXEvent> {
    const data = await request<{ event: KXEvent }>("POST", "/api/machi-events", payload);
    return data.event;
  },
  async updateEvent(idOrSlug: string, payload: Record<string, unknown>): Promise<KXEvent> {
    const data = await request<{ event: KXEvent }>("PATCH", `/api/machi-events/${encodeURIComponent(idOrSlug)}`, payload);
    return data.event;
  },
  async deleteEvent(idOrSlug: string): Promise<void> {
    await request("DELETE", `/api/machi-events/${encodeURIComponent(idOrSlug)}`);
  },
  async registerForEvent(idOrSlug: string, answers: Record<string, string> = {}): Promise<{ status: string; event: KXEvent }> {
    return request("POST", `/api/machi-events/${encodeURIComponent(idOrSlug)}/register`, { answers });
  },
  async cancelEventRegistration(idOrSlug: string): Promise<{ status: string; event: KXEvent }> {
    return request("DELETE", `/api/machi-events/${encodeURIComponent(idOrSlug)}/register`);
  },
  async eventAttendees(idOrSlug: string): Promise<{ items: KXEventAttendee[]; form_fields: KXEventFormField[]; total: number }> {
    return request("GET", `/api/machi-events/${encodeURIComponent(idOrSlug)}/attendees`);
  },
  async replaceEventFormFields(idOrSlug: string, fields: Partial<KXEventFormField>[]): Promise<KXEventFormField[]> {
    const data = await request<{ form_fields: KXEventFormField[] }>("PUT", `/api/machi-events/${encodeURIComponent(idOrSlug)}/form-fields`, { fields });
    return data.form_fields;
  },
  async adminEvents(opts: { when?: string; city_slug?: string; category?: string; organizer_id?: string; offset?: number; limit?: number } = {}): Promise<KXEventsPage> {
    const params = new URLSearchParams();
    if (opts.when) params.set("when", opts.when);
    if (opts.city_slug) params.set("city_slug", opts.city_slug);
    if (opts.category) params.set("category", opts.category);
    if (opts.organizer_id) params.set("organizer_id", opts.organizer_id);
    if (opts.offset) params.set("offset", String(opts.offset));
    if (opts.limit) params.set("limit", String(opts.limit));
    return request("GET", `/api/admin/events?${params.toString()}`);
  },
};

export type AdminMembershipRow = {
  membership_id: string;
  user_id: string;
  handle: string;
  display_name: string;
  email: string;
  status: string;
  plan_key: string;
  source: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  started_at: string | null;
  updated_at: string | null;
};

export type AdminPaymentOrderRow = {
  order_no: string;
  user_id: string;
  handle: string;
  display_name: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string;
  created_at: string | null;
  paid_at: string | null;
};

// ---- City Seed Bot (城市内容助手) ----
export type SeedBatchItem = {
  id: string;
  content: string;
  content_type: string;
  status: string;
  language: string;
  author_type: string;
  created_at: string;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  authorOfficial?: number;
};

export type SeedBatch = {
  id: string;
  country: string;
  province: string;
  city: string;
  region_code: string;
  language: string;
  content_type: string;
  tone: string;
  count: number;
  status: string;
  created_by_admin_id: string;
  created_count: number;
  published_count: number;
  cleared_count: number;
  created_at: string;
  updated_at: string;
  items?: SeedBatchItem[];
};

export type SeedLog = {
  id: string;
  admin_id: string;
  action: string;
  batch_id: string;
  country: string;
  city: string;
  region_code: string;
  language: string;
  content_type: string;
  count: number;
  metadata: Record<string, unknown>;
  created_at: string;
};
