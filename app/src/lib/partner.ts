// Self-contained API client for the partner (合作方) backend console.
//
// This is DELIBERATELY independent of src/lib/api.ts: the partner page is NOT
// a Machi-logged-in admin surface. It authenticates with a per-partner ACCESS
// TOKEN (header `X-Partner-Token`) rather than the Machi user session token, so
// we never read/write `machi.token` here. The token lives in localStorage under
// `machi.partner.<key>.token` and is sent on every call except GET /branding.
//
// All requests hit `/api/partner/<key>{path}` and are proxied to the Python
// backend by next.config rewrites (same as the rest of the web client), so a
// relative path works without any base URL.

export const partnerApiBase = ""; // requests proxied through next.config rewrites

// ---- token storage ----

function tokenStorageKey(key: string): string {
  return `machi.partner.${key}.token`;
}

export function readPartnerToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(tokenStorageKey(key));
  } catch {
    return null;
  }
}

export function writePartnerToken(key: string, token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(tokenStorageKey(key), token);
    else window.localStorage.removeItem(tokenStorageKey(key));
  } catch {
    // quota / private mode — non-fatal
  }
}

// ---- error shape ----

export interface PartnerErrorPayload {
  code?: string;
  message?: string;
}

export class PartnerAPIError extends Error {
  status: number;
  code: string;
  constructor(payload: PartnerErrorPayload, status: number) {
    super(payload.message || "请求失败");
    this.status = status;
    this.code = payload.code || "unknown";
  }
}

// A 401 means the partner token is missing / invalid / expired. The page uses
// this to drop the dashboard and fall back to the token gate.
export function isPartnerAuthError(err: unknown): err is PartnerAPIError {
  return err instanceof PartnerAPIError && err.status === 401;
}

const DEFAULT_TIMEOUT_MS = 30_000; // imports + uploads can be slow

// Core request helper. JSON bodies set Content-Type; FormData bodies must NOT
// (the browser sets the multipart boundary itself). `token` overrides the
// stored token (used by the gate's /session probe before we persist it).
export async function partnerRequest<T>(
  key: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs, ...fetchInit } = init ?? {};
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const effectiveToken = token ?? readPartnerToken(key);
  if (effectiveToken) headers["X-Partner-Token"] = effectiveToken;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, timeoutMs ?? DEFAULT_TIMEOUT_MS)
    : null;

  let res: Response;
  try {
    res = await fetch(`${partnerApiBase}/api/partner/${encodeURIComponent(key)}${path}`, {
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
      signal: controller?.signal,
      ...fetchInit,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new PartnerAPIError(
      {
        code: aborted ? "timeout" : "network_error",
        message: aborted ? "请求超时，请稍后重试。" : "无法连接服务器，请检查网络后重试。",
      },
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const ct = res.headers.get("Content-Type") || "";
  if (!res.ok) {
    let payload: PartnerErrorPayload = { code: "http_error", message: `请求失败 (${res.status})` };
    if (ct.includes("application/json")) {
      try {
        const data = await res.json();
        if (data?.error) payload = data.error;
        else if (data?.message || data?.code) {
          payload = { code: data.code || "http_error", message: data.message || payload.message };
        }
      } catch {
        // fallthrough
      }
    }
    if (res.status === 401) {
      payload = { code: payload.code || "AUTH_REQUIRED", message: payload.message || "访问口令无效或已过期。" };
    }
    throw new PartnerAPIError(payload, res.status);
  }
  if (res.status === 204) return undefined as T;
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new PartnerAPIError({ code: "parse_error", message: "服务器响应格式异常。" }, res.status);
    }
  }
  return (await res.text()) as unknown as T;
}

// ============================================================
// Types
// ============================================================

export interface PartnerBranding {
  key: string;
  name: string;
  nameJa?: string;
  nameEn?: string;
  website?: string;
  brandColor?: string;
  accentColor?: string;
  logoUrl?: string;
  intro?: string;
  status?: string;
}

export interface PartnerSessionInfo {
  key: string;
  name: string;
  nameJa?: string;
  saleEnabled?: boolean;
  defaultBadges?: string[];
  defaultCitySlug?: string;
  machiRecommendedDefault?: boolean;
  listingCount?: number;
  tokenHint?: string;
  // tolerate any extra server-provided fields
  [extra: string]: unknown;
}

export interface PartnerContact {
  id: string;
  name: string;
  nameJa?: string;
  title?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  wechatId?: string;
  whatsapp?: string;
  languages?: string;
  photoUrl?: string;
  note?: string;
  isDefault?: boolean;
  sortOrder?: number;
  createdAt?: string;
}

export interface PartnerTemplateColumn {
  header: string;
  hint: string;
}

export interface PartnerSessionResponse {
  partner: PartnerSessionInfo;
  contacts: PartnerContact[];
  templateColumns: PartnerTemplateColumn[];
}

export interface PartnerTemplateCsv {
  filename: string;
  csv: string;
  columns: PartnerTemplateColumn[];
}

// Body accepted by create / update contact. snake_case to match the backend.
export interface PartnerContactPayload {
  name: string;
  name_ja?: string;
  title?: string;
  phone?: string;
  email?: string;
  line_id?: string;
  wechat_id?: string;
  whatsapp?: string;
  languages?: string;
  photo_url?: string;
  note?: string;
  is_default?: boolean;
  sort_order?: number;
}

export interface PartnerUploadResult {
  url: string;
  thumbnailUrl: string;
  filename: string;
}

// One parsed row from /import/parse. Sent back to /import/commit mostly
// unchanged; the page only mutates `image_urls` when merging uploaded images.
export interface PartnerMappedRow {
  row_index: number;
  ext_id: string;
  title: string;
  description: string;
  listing_intent: "rent" | "sale" | "investment";
  category: string;
  city_slug: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  price: number | null;
  price_type: string;
  currency: string;
  status: "published" | "draft";
  attrs: Record<string, unknown>;
  image_urls: string[];
  image_filenames: string[];
  machi_recommended: boolean;
  badges: string[];
  contact: { id: string; name: string; phone: string } | null;
  contact_id: string;
  warnings: string[];
  errors: string[];
}

export interface PartnerParseResult {
  columns: string[];
  rows: PartnerMappedRow[];
  warnings: string[];
  rowCount: number;
}

export interface PartnerCommitRowResult {
  row_index: number;
  status: string;
  listing_id: string;
  title: string;
  warnings: string[];
  imageCount: number;
  machiRecommended: boolean;
}

export interface PartnerCommitRowError {
  row_index: number;
  title: string;
  errors: string[];
}

export interface PartnerCommitResult {
  ok: true;
  result: {
    created: number;
    updated: number;
    total: number;
    errors: PartnerCommitRowError[];
    results: PartnerCommitRowResult[];
  };
}

export interface PartnerListingReservationContact {
  name?: string;
  phone?: string;
  lineId?: string;
  [extra: string]: unknown;
}

export interface PartnerListing {
  id: string;
  title: string;
  priceLabel?: string;
  price?: number | string;
  coverUrl?: string;
  card?: unknown;
  machiRecommended: boolean;
  machiBadges: string[];
  reservationContact?: PartnerListingReservationContact;
  attributes?: Record<string, unknown>;
  type?: string;
  [extra: string]: unknown;
}

// ============================================================
// Endpoint functions
// ============================================================

// GET /branding — public (no token); used for the gate heading.
export function getPartnerBranding(key: string): Promise<{ partner: PartnerBranding }> {
  return partnerRequest<{ partner: PartnerBranding }>(key, "GET", "/branding", undefined, null);
}

// POST /session — token in header (default) OR explicit body { token }.
// Pass `token` to validate a freshly typed token at the gate before persisting.
export function startPartnerSession(key: string, token?: string): Promise<PartnerSessionResponse> {
  const body = token ? { token } : undefined;
  return partnerRequest<PartnerSessionResponse>(key, "POST", "/session", body, token ?? undefined);
}

export function getPartnerTemplate(key: string): Promise<PartnerTemplateCsv> {
  return partnerRequest<PartnerTemplateCsv>(key, "GET", "/template.csv");
}

export function listPartnerContacts(key: string): Promise<{ contacts: PartnerContact[] }> {
  return partnerRequest<{ contacts: PartnerContact[] }>(key, "GET", "/contacts");
}

export function createPartnerContact(key: string, body: PartnerContactPayload): Promise<{ contact: PartnerContact }> {
  return partnerRequest<{ contact: PartnerContact }>(key, "POST", "/contacts", body);
}

export function updatePartnerContact(
  key: string,
  id: string,
  body: PartnerContactPayload,
): Promise<{ contact: PartnerContact; resynced: number }> {
  return partnerRequest<{ contact: PartnerContact; resynced: number }>(
    key,
    "PATCH",
    `/contacts/${encodeURIComponent(id)}`,
    body,
  );
}

export function deletePartnerContact(key: string, id: string): Promise<{ ok: true }> {
  return partnerRequest<{ ok: true }>(key, "DELETE", `/contacts/${encodeURIComponent(id)}`);
}

// POST /uploads — multipart FormData with field `file`.
export function uploadPartnerImage(key: string, file: File): Promise<PartnerUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  return partnerRequest<PartnerUploadResult>(key, "POST", "/uploads", fd);
}

// POST /import/parse — multipart FormData with field `file` (.xlsx / .csv).
export function parsePartnerImport(key: string, file: File): Promise<PartnerParseResult> {
  const fd = new FormData();
  fd.append("file", file);
  return partnerRequest<PartnerParseResult>(key, "POST", "/import/parse", fd, undefined, {
    timeoutMs: 60_000,
  });
}

// POST /import/commit — the (error-free) parsed rows + options.
export function commitPartnerImport(
  key: string,
  rows: PartnerMappedRow[],
  options: { rehostUrls: boolean },
): Promise<PartnerCommitResult> {
  return partnerRequest<PartnerCommitResult>(key, "POST", "/import/commit", { rows, options }, undefined, {
    timeoutMs: 120_000,
  });
}

export function listPartnerListings(key: string): Promise<{ listings: PartnerListing[] }> {
  return partnerRequest<{ listings: PartnerListing[] }>(key, "GET", "/listings");
}

// Body accepted by single-listing create / update. snake_case to match the
// backend; the server sanitizes/clamps and re-resolves the contact by id.
// For 长租 use listing_intent:"rent" and put rent in `price` (and optionally
// attrs.rent). For 买房 use listing_intent:"sale" (or "investment") and put the
// total sale price in `price` and attrs.sale_price; optional attrs.yield_rate,
// attrs.layout, attrs.area_sqm, attrs.building_age, attrs.structure,
// attrs.land_area, attrs.nearest_station.
export interface PartnerListingDraft {
  ext_id?: string;
  title: string;
  listing_intent: "rent" | "sale" | "investment";
  price: number | null;
  city_slug?: string;
  location_text?: string;
  description?: string;
  category?: string;
  status?: "published" | "draft";
  attrs?: Record<string, unknown>;
  image_urls?: string[];
  contact_id?: string;
  badges?: string[];
  machi_recommended?: boolean;
}

const DEFAULT_LISTING_OPTIONS = { rehostUrls: true };

// POST /listings — create a single listing.
export function partnerCreateListing(
  key: string,
  row: PartnerListingDraft,
  options: { rehostUrls: boolean } = DEFAULT_LISTING_OPTIONS,
): Promise<{ ok: true; listing: PartnerListing; result: Record<string, unknown> }> {
  return partnerRequest<{ ok: true; listing: PartnerListing; result: Record<string, unknown> }>(
    key,
    "POST",
    "/listings",
    { row, options },
    undefined,
    { timeoutMs: 120_000 },
  );
}

// GET /listings/<id> — fetch one listing.
export function partnerGetListing(key: string, id: string): Promise<{ listing: PartnerListing }> {
  return partnerRequest<{ listing: PartnerListing }>(key, "GET", `/listings/${encodeURIComponent(id)}`);
}

// PATCH /listings/<id> — edit one listing. If `row.image_urls` is empty/omitted,
// existing photos are KEPT by the backend.
export function partnerUpdateListing(
  key: string,
  id: string,
  row: PartnerListingDraft,
  options: { rehostUrls: boolean } = DEFAULT_LISTING_OPTIONS,
): Promise<{ ok: true; listing: PartnerListing }> {
  return partnerRequest<{ ok: true; listing: PartnerListing }>(
    key,
    "PATCH",
    `/listings/${encodeURIComponent(id)}`,
    { row, options },
    undefined,
    { timeoutMs: 120_000 },
  );
}

// DELETE /listings/<id> — soft delete.
export function partnerDeleteListing(key: string, id: string): Promise<{ ok: true }> {
  return partnerRequest<{ ok: true }>(key, "DELETE", `/listings/${encodeURIComponent(id)}`);
}
