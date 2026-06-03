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
  PaymentProvider,
} from "./types";

const TOKEN_KEY = "machi.token";
const LEGACY_TOKEN_KEY = "kaix.token";

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
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
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

// Returned by /api/auth/login/start. Either the account requires an emailed
// code (two-step), or — when the account has no email and the server isn't
// enforcing codes — a session is issued directly.
export type LoginStartResult =
  | { requires_code: true; challenge_id: string; email_hint: string; expires_in: number }
  | { requires_code: false; token: string; user: KXUser };

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

export type NewsCategory =
  | "local_news" | "traffic_alert" | "weather_alert" | "earthquake_alert" | "typhoon_alert"
  | "policy_update" | "immigration_visa" | "city_event" | "life_notice" | "housing_notice"
  | "housing_market" | "work_study" | "public_safety" | "economy" | "technology" | "culture"
  | "sports" | "education" | "health" | "travel" | "editor_pick" | "weekly_digest" | "other";

export type NewsSource = {
  id: string;
  name: string;
  source_key: string;
  source_type: "rss" | "webpage" | "html_list" | "manual";
  source_url: string;
  homepage_url: string;
  allowed_domain: string;
  country: string;
  city: string;
  language: string;
  default_category: NewsCategory;
  credibility_level: "official" | "media" | "community" | "commercial";
  copyright_policy_note: string;
  crawl_strategy: "rss" | "meta_only" | "html_list" | "manual";
  list_selector?: string | null;
  item_selector?: string | null;
  title_selector?: string | null;
  link_selector?: string | null;
  summary_selector?: string | null;
  date_selector?: string | null;
  date_format?: string | null;
  timezone: string;
  robots_policy: "respect" | "manual_checked";
  crawl_interval_minutes: number;
  max_items_per_run: number;
  request_timeout_ms: number;
  is_active: boolean;
  require_manual_review: boolean;
  auto_create_draft?: boolean;
  official_auto_publish?: boolean;
  last_fetched_at?: string | null;
  last_success_at?: string | null;
  last_error: string;
  last_fetched_count?: number;
  last_new_count?: number;
  last_duplicate_count?: number;
  last_error_count?: number;
  last_robots_status?: string;
  last_http_status?: number | null;
  last_parser_status?: string;
  deleted_at?: string | null;
  deleted?: boolean;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
};

export type NewsItem = {
  id: string;
  source_id: string;
  external_id?: string | null;
  source_name: string;
  source_url: string;
  original_url: string;
  original_title: string;
  original_summary?: string | null;
  original_language: string;
  published_at?: string | null;
  fetched_at: string;
  country: string;
  city: string;
  category: NewsCategory;
  hash_key: string;
  raw_metadata?: Record<string, unknown>;
  error_message?: string;
  status: "fetched" | "draft_created" | "ignored" | "duplicate" | "error" | "deleted";
  created_at: string;
  updated_at: string;
};

export type EditorialPost = {
  id: string;
  news_item_id?: string | null;
  author_type: "local_desk" | "city_editor" | "tokyo_editorial" | "osaka_editorial" | "japan_editorial" | "admin";
  author_display_name: string;
  country: string;
  city: string;
  language: string;
  category: NewsCategory;
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

export type NewsDeskDashboard = {
  stats: {
    today_fetched: number;
    today_new?: number;
    duplicates?: number;
    pending_items?: number;
    pending_drafts: number;
    published: number;
    failed_sources: number;
    sources?: number;
    active_sources?: number;
    diagnostic_hint?: string;
  };
  recent_posts: EditorialPost[];
  recent_logs: Array<Record<string, unknown>>;
};

export type NewsItemsQuery = {
  source_id?: string;
  country?: string;
  city?: string;
  language?: string;
  category?: string;
  status?: string;
  keyword?: string;
  page?: number;
  limit?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = readToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const upperMethod = method.toUpperCase();
  const maxAttempts = RETRYABLE_METHODS.has(upperMethod) ? 2 : 1;

  let lastError: unknown = null;
  let res: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // ignore
          }
        }, DEFAULT_TIMEOUT_MS)
      : null;
    try {
      res = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        signal: controller?.signal,
        ...init,
      });
      break;
    } catch (err) {
      lastError = err;
      res = null;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!res) {
    const aborted = lastError instanceof DOMException && lastError.name === "AbortError";
    throw new APIError(
      {
        code: aborted ? "timeout" : "network_error",
        message: aborted ? "请求超时，请稍后重试。" : "无法连接服务器，请检查网络后重试。",
      },
      0,
    );
  }

  const ct = res.headers.get("Content-Type") || "";
  if (!res.ok) {
    let payload: APIErrorPayload = { code: "http_error", message: `请求失败 (${res.status})` };
    if (ct.includes("application/json")) {
      try {
        const data = await res.json();
        if (data?.error) payload = data.error;
        else if (data?.message || data?.code) {
          payload = { code: data.code || "http_error", message: data.message || `请求失败 (${res.status})` };
        }
      } catch {
        // fallthrough
      }
    }
    if (res.status === 401) {
      payload = { code: "AUTH_REQUIRED", message: "请登录后继续" };
      writeToken(null);
    }
    throw new APIError(payload, res.status);
  }
  if (res.status === 204) return undefined as T;
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new APIError({ code: "parse_error", message: "服务器响应格式异常。" }, res.status);
    }
  }
  return (await res.text()) as unknown as T;
}

// ---- auth ----
export const api = {
  async login(handle: string, password: string): Promise<{ token: string; user: KXUser }> {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/login", { handle, password });
    writeToken(data.token);
    return data;
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
    country?: string;
    province?: string;
    city?: string;
    current_region_code?: string;
  }) {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/register", payload);
    writeToken(data.token);
    return data;
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
  ): Promise<{ ok: boolean; challenge_id?: string; email_hint?: string; expires_in: number }> {
    return request("POST", "/api/auth/email/send-code", { email, purpose, locale });
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
  }): Promise<LoginStartResult> {
    const data = await request<LoginStartResult>("POST", "/api/auth/login/start", payload);
    if (data.requires_code === false && data.token) writeToken(data.token);
    return data;
  },
  // Step 2 of two-step login: exchange a valid code for a session.
  async loginVerify(challengeId: string, code: string): Promise<{ token: string; user: KXUser }> {
    const data = await request<{ token: string; user: KXUser }>("POST", "/api/auth/login/verify", {
      challenge_id: challengeId,
      code,
    });
    writeToken(data.token);
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
  async forgotPassword(email: string, locale?: string): Promise<{ ok: boolean; expires_in: number }> {
    return request("POST", "/api/auth/forgot-password", { email, locale });
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
    }
  },
  async me(): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("GET", "/api/auth/me");
    return user;
  },
  async updateMe(patch: Partial<KXUser> & { password?: string }): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("PATCH", "/api/auth/me", patch);
    return user;
  },
  async deleteMe(): Promise<void> {
    await request<void>("DELETE", "/api/auth/me");
    writeToken(null);
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
  async resolveRegion(code: string): Promise<KXRegion> {
    return request("GET", `/api/regions/resolve?code=${encodeURIComponent(code)}`);
  },

  // Compatibility for stale deployed clients/components that still call
  // api.news(). The retired public news API is not used; data is sourced from
  // Machi Guide articles so old rails degrade into Guide content.
  async news(opts: {
    country?: string;
    city?: string;
    language?: string;
    category?: NewsCategory | string;
    sort?: "latest" | "popular";
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: EditorialPost[]; page: number; limit: number; total: number; diagnostics?: Record<string, unknown> }> {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const params = new URLSearchParams({
      country: opts.country || "jp",
      page: String(page),
      pageSize: String(limit),
    });
    if (opts.language) params.set("language", opts.language);
    const response = await request<{
      items: Array<{
        id: string;
        slug: string;
        title: string;
        summary: string;
        categoryKey: string;
        country: string;
        city?: string;
        language?: string;
        tags?: string[];
        authorName?: string;
        publishedAt?: string | null;
        updatedAt?: string | null;
        viewCount?: number;
        saveCount?: number;
        status?: string;
      }>;
      page?: number;
      pageSize?: number;
      total?: number;
    }>("GET", `/api/guide/articles?${params.toString()}`);
    const items = (response.items || []).map((article): EditorialPost => {
      const publishedAt = article.publishedAt || article.updatedAt || null;
      return {
        id: article.slug || article.id,
        news_item_id: null,
        author_type: "japan_editorial",
        author_display_name: article.authorName || "Machi Guide",
        country: article.country || opts.country || "jp",
        city: article.city || opts.city || "",
        language: article.language || opts.language || "zh-CN",
        category: "editor_pick",
        title: article.title,
        summary: article.summary || "",
        body: article.summary || "",
        source_name: "Machi Guide",
        source_url: "/guide",
        original_url: `/guide/articles/${article.slug || article.id}`,
        source_published_at: publishedAt,
        status: article.status === "hidden" ? "hidden" : "published",
        review_status: "approved",
        reviewed_by_admin_id: null,
        reviewed_at: null,
        published_at: publishedAt,
        view_count: article.viewCount || 0,
        share_count: 0,
        click_source_count: 0,
        risk_level: "low",
        official_source_required: false,
        is_ai_assisted: false,
        ai_model: null,
        ai_prompt_version: null,
        created_by_admin_id: "",
        created_at: publishedAt || "",
        updated_at: article.updatedAt || publishedAt || "",
        tags: article.tags || [],
        save_count: article.saveCount || 0,
        comment_count: 0,
        saved: false,
      };
    });
    return {
      items,
      page: response.page || page,
      limit: response.pageSize || limit,
      total: response.total ?? items.length,
      diagnostics: { migratedToGuide: true },
    };
  },

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
  async search(q: string, kind: "all" | "post" | "user" | "topic" = "all"): Promise<{ posts: KXPost[]; users: KXUser[]; topics: KXTrendingTopic[] }> {
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
  async topics(): Promise<{ topics: KXTrendingTopic[]; items: KXTrendingTopic[] }> {
    return request("GET", `/api/topics`);
  },
  async topic(tag: string): Promise<{ tag: string; items: KXPost[] }> {
    return request("GET", `/api/topics/${encodeURIComponent(tag.replace(/^#/, ""))}`);
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
  async sendMessage(conversationId: string, content: string, mediaIds: string[] = []): Promise<KXMessage> {
    const { message } = await request<{ message: KXMessage }>(
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { content, media_ids: mediaIds },
    );
    return message;
  },
  async deleteMessage(id: string): Promise<void> {
    await request<void>("DELETE", `/api/messages/${encodeURIComponent(id)}`);
  },
  async markConversationRead(id: string): Promise<void> {
    await request<void>("POST", `/api/conversations/${encodeURIComponent(id)}/read`);
  },

  // ---- media ----
  async uploadMediaBase64(file: File): Promise<KXMedia> {
    const form = new FormData();
    form.append("file", file, file.name || "upload");
    const { media } = await request<{ media: KXMedia }>("POST", `/api/media/upload`, form);
    return media;
  },
  async deleteMedia(id: string): Promise<void> {
    await request<void>("DELETE", `/api/media/${encodeURIComponent(id)}`);
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

  // ---- devices ----
  async devices(): Promise<KXDevice[]> {
    const { items } = await request<{ items: KXDevice[] }>("GET", `/api/devices`);
    return items;
  },
  async revokeDevice(id: string): Promise<void> {
    await request<void>("DELETE", `/api/devices/${encodeURIComponent(id)}`);
  },

  // ---- admin ----
  async adminStats(): Promise<{ stats: Record<string, unknown> }> {
    return request("GET", `/api/admin/stats`);
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
  async adminUsers(q?: string): Promise<KXUser[]> {
    const usp = new URLSearchParams();
    if (q) usp.set("q", q);
    const { items } = await request<{ items: KXUser[] }>("GET", `/api/admin/users?${usp.toString()}`);
    return items;
  },
  async adminUpdateUser(id: string, patch: { is_verified?: boolean; role?: string; membership_tier?: string; creator_badge?: string; is_merchant?: boolean; merchant_verified?: boolean }): Promise<KXUser> {
    const { user } = await request<{ user: KXUser }>("PATCH", `/api/admin/users/${encodeURIComponent(id)}`, patch);
    return user;
  },
  async adminSuspendUser(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/users/${encodeURIComponent(id)}`);
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

  // ---- admin: Local News Desk (本地资讯台) ----
  async adminNewsDesk(): Promise<NewsDeskDashboard> {
    return request("GET", `/api/admin/news-desk`);
  },
  async adminNewsSources(opts: { q?: string; country?: string; city?: string } = {}): Promise<NewsSource[]> {
    const usp = new URLSearchParams();
    if (opts.q) usp.set("q", opts.q);
    if (opts.country) usp.set("country", opts.country);
    if (opts.city) usp.set("city", opts.city);
    const { items } = await request<{ items: NewsSource[] }>("GET", `/api/admin/news-sources?${usp.toString()}`);
    return items;
  },
  async adminCreateNewsSource(payload: Partial<NewsSource>): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("POST", `/api/admin/news-sources`, payload);
    return source;
  },
  async adminSeedNewsSourcePresets(): Promise<{ total: number; active: number }> {
    return request("POST", `/api/admin/news-sources/seed-presets`, {});
  },
  async adminUpdateNewsSource(id: string, patch: Partial<NewsSource>): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("PATCH", `/api/admin/news-sources/${encodeURIComponent(id)}`, patch);
    return source;
  },
  async adminToggleNewsSource(id: string): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("POST", `/api/admin/news-sources/${encodeURIComponent(id)}/toggle`, {});
    return source;
  },
  async adminFetchNewsSource(id: string): Promise<{ source: NewsSource; log: Record<string, unknown> }> {
    return request("POST", `/api/admin/news-sources/${encodeURIComponent(id)}/fetch`, {});
  },
  async adminFetchAllNewsSources(): Promise<{ items: Array<Record<string, unknown>> }> {
    return request("POST", `/api/admin/news-sources/fetch-all`, {});
  },
  async adminFetchJapanAllNewsSources(): Promise<Record<string, unknown>> {
    return request("POST", `/api/admin/news-sources/fetch-japan-all`, {});
  },
  async adminNewsSourceDetail(id: string): Promise<{ source: NewsSource; recent_logs: Array<Record<string, unknown>> }> {
    return request("GET", `/api/admin/news-sources/${encodeURIComponent(id)}`);
  },
  async adminDeleteNewsSource(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/news-sources/${encodeURIComponent(id)}`);
  },
  async adminNewsItems(opts: NewsItemsQuery = {}): Promise<{ items: NewsItem[]; page: number; limit: number; total: number }> {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && value !== "") usp.set(key, String(value));
    }
    return request("GET", `/api/admin/news-items?${usp.toString()}`);
  },
  async adminCreateEditorialDraftFromItem(id: string): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("POST", `/api/admin/news-items/${encodeURIComponent(id)}/create-draft`, {});
    return post;
  },
  async adminCreateEditorialDraftsFromItems(payload: { itemIds: string[]; targetLanguage?: string; authorDisplayName?: string; createMode?: "summary_only" | "editor_template" }): Promise<{ items: EditorialPost[]; created: number; errors: Array<Record<string, string>> }> {
    return request("POST", `/api/admin/news-items/create-drafts`, payload);
  },
  async adminUpdateNewsItemStatus(id: string, status: "ignored" | "duplicate"): Promise<NewsItem> {
    const { item } = await request<{ item: NewsItem }>("POST", `/api/admin/news-items/${encodeURIComponent(id)}/${status === "ignored" ? "ignore" : "duplicate"}`, {});
    return item;
  },
  async adminDeleteNewsItem(id: string): Promise<NewsItem> {
    const { item } = await request<{ item: NewsItem }>("DELETE", `/api/admin/news-items/${encodeURIComponent(id)}`);
    return item;
  },
  async adminEditorialPosts(opts: {
    status?: string; country?: string; city?: string; language?: string; category?: string; keyword?: string; page?: number; limit?: number;
  } = {}): Promise<{ items: EditorialPost[]; page: number; limit: number; total: number }> {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && value !== "") usp.set(key, String(value));
    }
    return request("GET", `/api/admin/editorial-posts?${usp.toString()}`);
  },
  async adminCreateEditorialPost(payload: Partial<EditorialPost>): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("POST", `/api/admin/editorial-posts`, payload);
    return post;
  },
  async adminUpdateEditorialPost(id: string, patch: Partial<EditorialPost>): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("PATCH", `/api/admin/editorial-posts/${encodeURIComponent(id)}`, patch);
    return post;
  },
  async adminEditorialAiAssist(id: string, payload: { task?: string; language?: string; note?: string; apply?: boolean } = {}): Promise<{ assist: Record<string, unknown>; post: EditorialPost }> {
    return request("POST", `/api/admin/editorial-posts/${encodeURIComponent(id)}/ai-assist`, payload);
  },
  async adminEditorialTransition(id: string, action: "submit-review" | "approve" | "reject" | "publish" | "hide" | "restore"): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("POST", `/api/admin/editorial-posts/${encodeURIComponent(id)}/${action}`, {});
    return post;
  },
  async adminEditorialBulkPublish(payload: { postIds?: string[]; confirmMedia?: boolean } = {}): Promise<{ published: number; skipped: Array<Record<string, string>> }> {
    return request("POST", `/api/admin/editorial-posts/bulk-publish`, payload);
  },
  async adminDeleteEditorialPost(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/editorial-posts/${encodeURIComponent(id)}`);
  },
  async adminNewsDeskLogs(limit = 80): Promise<{ fetch_logs: Array<Record<string, unknown>>; action_logs: Array<Record<string, unknown>> }> {
    return request("GET", `/api/admin/news-desk/logs?limit=${limit}`);
  },
  async japanNewsCrawlerDashboard(): Promise<NewsDeskDashboard> {
    return request("GET", `/api/admin/japan-news-crawler/dashboard`);
  },
  async japanNewsCrawlerSources(opts: { q?: string; country?: string; city?: string } = {}): Promise<NewsSource[]> {
    const usp = new URLSearchParams();
    if (opts.q) usp.set("q", opts.q);
    if (opts.country) usp.set("country", opts.country);
    if (opts.city) usp.set("city", opts.city);
    const { items } = await request<{ items: NewsSource[] }>("GET", `/api/admin/japan-news-crawler/sources?${usp.toString()}`);
    return items;
  },
  async japanNewsCrawlerCreateSource(payload: Partial<NewsSource>): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("POST", `/api/admin/japan-news-crawler/sources`, payload);
    return source;
  },
  async japanNewsCrawlerSeedSourcePresets(): Promise<{ total: number; active: number }> {
    return request("POST", `/api/admin/japan-news-crawler/sources/seed-presets`, {});
  },
  async japanNewsCrawlerUpdateSource(id: string, patch: Partial<NewsSource>): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("PATCH", `/api/admin/japan-news-crawler/sources/${encodeURIComponent(id)}`, patch);
    return source;
  },
  async japanNewsCrawlerDeleteSource(id: string): Promise<void> {
    await request<void>("DELETE", `/api/admin/japan-news-crawler/sources/${encodeURIComponent(id)}`);
  },
  async japanNewsCrawlerToggleSource(id: string): Promise<NewsSource> {
    const { source } = await request<{ source: NewsSource }>("POST", `/api/admin/japan-news-crawler/sources/${encodeURIComponent(id)}/toggle`, {});
    return source;
  },
  async japanNewsCrawlerFetchSource(id: string): Promise<{ source: NewsSource; log: Record<string, unknown> }> {
    return request("POST", `/api/admin/japan-news-crawler/sources/${encodeURIComponent(id)}/fetch`, {});
  },
  async japanNewsCrawlerFetchAll(): Promise<{ items: Array<Record<string, unknown>> }> {
    return request("POST", `/api/admin/japan-news-crawler/fetch-all`, {});
  },
  async japanNewsCrawlerFetchJapanAll(): Promise<Record<string, unknown>> {
    return request("POST", `/api/admin/japan-news-crawler/fetch-japan-all`, {});
  },
  async japanNewsCrawlerItems(opts: NewsItemsQuery = {}): Promise<{ items: NewsItem[]; page: number; limit: number; total: number }> {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(opts || {})) {
      if (value !== undefined && value !== "") usp.set(key, String(value));
    }
    return request("GET", `/api/admin/japan-news-crawler/items?${usp.toString()}`);
  },
  async japanNewsCrawlerCreateDraftFromItem(id: string): Promise<EditorialPost> {
    const { post } = await request<{ post: EditorialPost }>("POST", `/api/admin/japan-news-crawler/items/${encodeURIComponent(id)}/create-draft`, {});
    return post;
  },
  async japanNewsCrawlerCreateDraftsFromItems(payload: { itemIds: string[]; targetLanguage?: string; authorDisplayName?: string; createMode?: "summary_only" | "editor_template" }): Promise<{ items: EditorialPost[]; created: number; errors: Array<Record<string, string>> }> {
    return request("POST", `/api/admin/japan-news-crawler/items/create-drafts`, payload);
  },
  async japanNewsCrawlerUpdateItemStatus(id: string, status: "ignored" | "duplicate"): Promise<NewsItem> {
    const { item } = await request<{ item: NewsItem }>("POST", `/api/admin/japan-news-crawler/items/${encodeURIComponent(id)}/${status === "ignored" ? "ignore" : "duplicate"}`, {});
    return item;
  },
  async japanNewsCrawlerDeleteItem(id: string): Promise<NewsItem> {
    const { item } = await request<{ item: NewsItem }>("DELETE", `/api/admin/japan-news-crawler/items/${encodeURIComponent(id)}`);
    return item;
  },
  async japanNewsCrawlerLogs(limit = 80): Promise<{ fetch_logs: Array<Record<string, unknown>>; action_logs: Array<Record<string, unknown>> }> {
    return request("GET", `/api/admin/japan-news-crawler/logs?limit=${limit}`);
  },

  // ---- admin: City Seed Bot (城市内容助手) ----
  async adminSeedGenerate(payload: {
    country?: string; city?: string; regionCode?: string; language: string;
    contentType: string; count: number; tone: string; publishNow: boolean;
  }): Promise<{ batch: SeedBatch; requested: number; created: number }> {
    return request("POST", `/api/admin/seed-content/generate`, payload);
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
  async membershipBenefits(): Promise<{ benefits: Array<{ key: string; title: string; description: string }>; plan: KXMembershipPlan | null; disclaimer: string; requires_membership_content_types: string[] }> {
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
