import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://machicity.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/en",
          "/ja",
          "/about",
          "/features",
          "/cities",
          "/business",
          "/ads",
          "/jobs-promotion",
          "/housing-promotion",
          "/partners",
          "/safety",
          "/safety-center",
          "/download",
          "/contact",
          "/help",
          "/legal/",
          "/login",
          "/register",
        ],
        // Don't index private / personal pages or browser-fix endpoints.
        disallow: [
          "/admin",
          "/home",
          "/explore",
          "/search",
          "/messages",
          "/settings",
          "/drafts",
          "/bookmarks",
          "/notifications",
          "/me",
          "/api/",
          "/reset.html",
          "/offline.html",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
