import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

// Keep authenticated, administrative and utility surfaces out of the index so
// crawl budget concentrates on the marketing + Guide pages that actually rank.
// Prefixes are chosen so they never swallow a public marketing route (e.g. we
// use "/me/" and "/my/" rather than "/me" so "/membership" stays crawlable).
const DISALLOW = [
  "/admin",
  "/api/",
  "/login",
  "/register",
  "/forgot",
  "/auth/",
  "/settings",
  "/wallet",
  "/messages",
  "/notifications",
  "/drafts",
  "/bookmarks",
  "/feedback",
  "/me/",
  "/my/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
