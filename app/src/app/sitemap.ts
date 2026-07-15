import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";
const API_BASE = process.env.KAIX_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";

// Regenerate at most once a day so crawls never round-trip the backend.
export const revalidate = 86400;

interface GuideSitemapEntity {
  slug?: string;
  updated_at?: string;
}

interface GuideSitemapData {
  schools?: GuideSitemapEntity[];
  companies?: GuideSitemapEntity[];
  articles?: GuideSitemapEntity[];
}

// Best-effort fetch of the public Guide entity slugs (schools / companies /
// articles). Returns null on ANY error (e.g. backend offline at build time)
// so the sitemap silently degrades to the static list — it must never fail.
async function loadGuideEntities(): Promise<GuideSitemapData | null> {
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/guide/sitemap`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { ok?: boolean; data?: GuideSitemapData };
    if (!payload?.ok || !payload.data) return null;
    return payload.data;
  } catch {
    return null;
  }
}

// Static sitemap covering the public surface area in all three locales,
// plus Guide entity pages (schools / companies / articles) appended from a
// daily-cached backend snapshot. Per-post and per-user URLs are intentionally
// NOT enumerated here so we don't have to round-trip the backend at every
// crawl; they're discovered by crawlers through homepage links.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  const marketingRoutes = [
    ["", "daily", 1.0],
    ["about", "monthly", 0.7],
    ["features", "monthly", 0.8],
    ["cities", "weekly", 0.8],
    ["guide", "weekly", 0.8],
    ["business", "monthly", 0.8],
    ["ads", "monthly", 0.6],
    ["jobs-promotion", "monthly", 0.6],
    ["housing-promotion", "monthly", 0.6],
    ["partners", "monthly", 0.6],
    ["safety", "monthly", 0.7],
    ["safety-center", "monthly", 0.5],
    ["download", "weekly", 0.8],
    ["updates", "weekly", 0.6],
    ["faq", "monthly", 0.6],
    ["contact", "monthly", 0.5],
    ["legal/privacy", "yearly", 0.4],
    ["legal/terms", "yearly", 0.4],
    ["legal/membership-terms", "yearly", 0.35],
    ["legal/service-terms", "yearly", 0.35],
    ["legal/refund-policy", "yearly", 0.35],
    ["legal/community-guidelines", "yearly", 0.35],
    ["legal/commercial-disclosure", "yearly", 0.35],
    ["legal/fund-settlement-act", "yearly", 0.35],
    ["legal/cookie-policy", "yearly", 0.3],
  ] as const;

  const make = (path: string) => (path ? `${SITE}/${path}` : `${SITE}/`);
  const altMake = (lang: "zh" | "en" | "ja", path: string) =>
    path ? `${SITE}/${lang}/${path}` : `${SITE}/${lang}`;

  const localizedAlternates = (path: string) => ({
    languages: {
      "zh-CN": altMake("zh", path),
      en: altMake("en", path),
      ja: altMake("ja", path),
      "x-default": altMake("en", path),
    },
  });

  const baseEntries: MetadataRoute.Sitemap = marketingRoutes.map(
    ([route, changeFrequency, priority]) => ({
      url: make(route),
      lastModified: now,
      changeFrequency,
      priority,
      alternates: localizedAlternates(route),
    }),
  );

  // Standalone locale landing entries.
  const localeRoots: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/zh`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: localizedAlternates(""),
    },
    {
      url: `${SITE}/en`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: localizedAlternates(""),
    },
    {
      url: `${SITE}/ja`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: localizedAlternates(""),
    },
  ];

  // /login and /register are intentionally NOT listed: they are utility
  // pages (Disallow-ed in robots.ts) and should not compete with the
  // marketing pages for crawl budget or index weight.

  // Guide entity detail pages, appended after the static list.
  const guideData = await loadGuideEntities();
  const guideEntries: MetadataRoute.Sitemap = [];
  if (guideData) {
    const pushEntities = (items: GuideSitemapEntity[] | undefined, prefix: string) => {
      for (const item of Array.isArray(items) ? items : []) {
        const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
        if (!slug) continue;
        const updated = item.updated_at ? new Date(item.updated_at) : null;
        guideEntries.push({
          url: `${SITE}/guide/${prefix}/${encodeURIComponent(slug)}`,
          lastModified: updated && !Number.isNaN(updated.getTime()) ? updated.toISOString() : now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    };
    pushEntities(guideData.schools, "schools");
    pushEntities(guideData.companies, "companies");
    pushEntities(guideData.articles, "articles");
  }

  return [...baseEntries, ...localeRoots, ...guideEntries];
}
