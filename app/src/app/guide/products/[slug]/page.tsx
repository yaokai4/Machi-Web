// Server component wrapper for the guide product page (W2-1). Emits Open
// Graph / Twitter meta (title + description + price) via generateMetadata so
// shared links unfurl into cards and search engines can index the store —
// same pattern as /p/[id]/page.tsx. The interactive page (purchase / points /
// booking / reviews) lives in the client component.

import type { Metadata } from "next";
import { cache } from "react";
import ProductDetailClient from "./ProductDetailClient";
import { guideLanguageForLocale } from "@/lib/server/guidePrefetch";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

export const dynamic = "force-dynamic";

const API_BASE = process.env.KAIX_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

// Public subset of the product payload used for metadata only (the client
// component re-fetches with the viewer's auth for entitlement).
interface FetchedGuideProduct {
  slug?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  priceLabel?: string;
  price?: number;
  currency?: string;
  isFree?: boolean;
  isService?: boolean;
  coverImage?: string;
  publishedAt?: string | null;
}

// React cache() dedupes the fetch between generateMetadata and the page
// render, so each request hits the backend once. Anonymous fetch (no
// cookies): metadata must only ever contain public fields.
const loadProduct = cache(async (slug: string, language: string): Promise<FetchedGuideProduct | null> => {
  if (!slug) return null;
  try {
    const res = await fetch(
      `${API_BASE.replace(/\/$/, "")}/api/guide/products/${encodeURIComponent(slug)}?country=jp&language=${encodeURIComponent(language)}`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.product as FetchedGuideProduct) ?? null;
  } catch {
    return null;
  }
});

function absoluteImage(url: string | undefined): string {
  if (!url) return `${SITE}/og-image.png`;
  return url.startsWith("http") ? url : `${SITE}${url}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveMarketingLocale();
  const p = await loadProduct(slug, guideLanguageForLocale(locale));
  // Fetch failed / product gone: fall back to the site-wide defaults from the
  // root layout instead of throwing.
  if (!p?.title) return {};
  const freeLabel = locale === "en" ? "Free" : locale === "ja" ? "無料" : "免费";
  const priceText = p.isFree ? freeLabel : (p.priceLabel || "").trim();
  const title = priceText ? `${p.title}（${priceText}）` : p.title;
  const description = (p.subtitle || p.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || p.title;
  const path = `/guide/products/${p.slug || slug}`;
  const image = absoluteImage(p.coverImage);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE}${path}`,
      siteName: "Machi",
      images: [image],
      type: "website",
    },
    twitter: {
      card: p.coverImage ? "summary_large_image" : "summary",
      title,
      description,
      images: [image],
    },
  };
}

export default async function GuideProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await resolveMarketingLocale();
  const p = await loadProduct(slug, guideLanguageForLocale(locale));
  // Product JSON-LD so search results can carry price/availability. Points-only
  // and appointment-only products simply omit offers (price is server-side).
  const structuredData = p?.title
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.title,
        description: (p.subtitle || p.description || "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
        image: absoluteImage(p.coverImage),
        url: `${SITE}/guide/products/${p.slug || slug}`,
        ...(p.isFree || (typeof p.price === "number" && p.price > 0 && p.currency)
          ? {
              offers: {
                "@type": "Offer",
                price: p.isFree ? "0" : String(p.price),
                priceCurrency: p.currency || "JPY",
                availability: "https://schema.org/InStock",
              },
            }
          : {}),
      }
    : null;
  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <ProductDetailClient />
    </>
  );
}
