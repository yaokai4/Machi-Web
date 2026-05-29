import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://machicity.com";

// Static sitemap covering the public surface area in all three locales.
// Per-post and per-user URLs are intentionally NOT enumerated here so
// we don't have to round-trip the backend at every crawl; they're
// discovered by crawlers through homepage links.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  const marketingRoutes = [
    ["", "daily", 1.0],
    ["about", "monthly", 0.7],
    ["features", "monthly", 0.8],
    ["cities", "weekly", 0.8],
    ["business", "monthly", 0.8],
    ["ads", "monthly", 0.6],
    ["jobs-promotion", "monthly", 0.6],
    ["housing-promotion", "monthly", 0.6],
    ["partners", "monthly", 0.6],
    ["safety", "monthly", 0.7],
    ["safety-center", "monthly", 0.5],
    ["download", "weekly", 0.8],
    ["contact", "monthly", 0.5],
    ["help", "monthly", 0.5],
  ] as const;

  const make = (path: string) => (path ? `${SITE}/${path}` : `${SITE}/`);
  const altMake = (lang: "en" | "ja", path: string) =>
    path ? `${SITE}/${lang}/${path}` : `${SITE}/${lang}`;

  const localizedAlternates = (path: string) => ({
    languages: {
      "zh-CN": make(path),
      en: altMake("en", path),
      ja: altMake("ja", path),
      "x-default": make(path),
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

  // Standalone /en and /ja landing entries — only the root has
  // dedicated locale routes today; sub-pages serve via cookie/UI.
  const localeRoots: MetadataRoute.Sitemap = [
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

  const utilEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  return [...baseEntries, ...localeRoots, ...utilEntries];
}
