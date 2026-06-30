/**
 * Sanitise a post-auth `redirect` query param to a same-origin relative path.
 * Rejects absolute URLs, protocol-relative `//host`, and any `scheme://` to
 * prevent open-redirect attacks — falls back to `/home`.
 *
 * Single source of truth: login, register and the Google OAuth callback all
 * import this (previously each defined its own byte-identical copy, which
 * could drift).
 */
export function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/home";
  return raw;
}
