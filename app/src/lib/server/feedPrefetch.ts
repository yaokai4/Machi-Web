import { cookies } from "next/headers";
import type { FeedMode, KXPost, Paginated } from "@/lib/types";

// Server-side base URL for the Python backend. Mirrors next.config.mjs:
// in prod the API is same-origin behind nginx, but a Server Component must
// use an absolute URL (a relative fetch has no origin on the server).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";

/**
 * Prefetch the FIRST page of the default ("recommend") home feed on the
 * server so the home route can hydrate React Query before HomeClient mounts.
 * This removes the HTML → JS → API waterfall on first paint: the feed is
 * already in the dehydrated cache when the client hydrates.
 *
 * Best-effort: forwards the caller's session cookie so logged-in users get
 * their personalised feed, and returns null on ANY error so the client
 * silently falls back to its normal client-side fetch (zero regression).
 */
export async function prefetchRecommendFeedFirstPage(): Promise<
  (Paginated<KXPost> & { mode: FeedMode }) | null
> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await fetch(`${API_BASE}/api/feed?mode=recommend`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Paginated<KXPost> & { mode: FeedMode };
    if (!data || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}
