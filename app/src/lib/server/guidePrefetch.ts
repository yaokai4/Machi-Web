import { cookies } from "next/headers";
import type { MarketingLocale } from "@/data/machi-home";

// Server-side base URL for the Python backend. Mirrors feedPrefetch.ts:
// in prod the API is same-origin behind nginx, but a Server Component must
// use an absolute URL (a relative fetch has no origin on the server).
const API_BASE = process.env.KAIX_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";

/** Map the marketing locale (zh/en/ja) to the Guide API language parameter. */
export function guideLanguageForLocale(locale: MarketingLocale): "zh-CN" | "en" | "ja" {
  return locale === "ja" ? "ja" : locale === "en" ? "en" : "zh-CN";
}

/**
 * Prefetch a public Guide detail payload (school / company / article) on the
 * server so the detail routes can render real content for SEO and seed React
 * Query before the client component mounts.
 *
 * Best-effort: forwards the caller's session cookie so logged-in users get
 * their personalised fields (savedByMe, reading progress), and returns null
 * on ANY error so the client silently falls back to its normal client-side
 * fetch (zero regression, never a 500).
 */
export async function prefetchGuideDetail<T>(
  resource: "schools" | "companies" | "articles",
  idOrSlug: string,
  language: string,
): Promise<T | null> {
  if (!idOrSlug) return null;
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await fetch(
      `${API_BASE.replace(/\/$/, "")}/api/guide/${resource}/${encodeURIComponent(idOrSlug)}?country=jp&language=${encodeURIComponent(language)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
