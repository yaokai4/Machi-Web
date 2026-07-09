/**
 * Sanitise a post-auth `redirect` query param to a same-origin relative path.
 * Rejects absolute URLs, protocol-relative `//host`, backslash tricks and any
 * `scheme://` to prevent open-redirect attacks - falls back to `/home`.
 *
 * Single source of truth: login, register and the Google OAuth callback all
 * import this (previously each defined its own byte-identical copy, which
 * could drift).
 *
 * Why the backslash / whitespace / control-char guard matters: the WHATWG URL
 * parser normalises a backslash to a forward slash, so a value like
 * "/\evil.com" - which starts with "/", is not "//...", and has no "://" -
 * would slip past a naive check and then be treated by the browser as the
 * protocol-relative "//evil.com", redirecting off-site (a phishing vector,
 * especially once the value is handed to the backend for the Google OAuth
 * callback Location header).
 */
export function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/home";
  // Reject backslashes (WHATWG normalises "\" to "/") and any whitespace - none
  // are legitimate in a same-origin path and both can smuggle an off-site
  // destination past the leading-slash checks below.
  if (/[\\\s]/.test(raw)) return "/home";
  // Reject C0 control chars (0x00-0x1F) and DEL (0x7F) as defence in depth,
  // scanning code points so the source never carries literal control bytes.
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return "/home";
  }
  // Must be a single-leading-slash absolute path; reject protocol-relative
  // `//host` and any embedded scheme.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/home";
  return raw;
}
