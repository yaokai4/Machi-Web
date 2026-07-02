// Server component wrapper for the company detail page. Prefetches the
// company on the server so crawlers see real content (SSR + generateMetadata
// + JSON-LD) while the interactive page lives in the client component below.
// Any fetch failure degrades to the previous client-side loading — never 500.

import type { Metadata } from "next";
import { cache } from "react";
import CompanyDetailClient, { type CompanyDetailData } from "./CompanyDetailClient";
import { guideLanguageForLocale, prefetchGuideDetail } from "@/lib/server/guidePrefetch";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

// React cache() dedupes the fetch between generateMetadata and the page
// render, so each request hits the backend once.
const loadCompany = cache(async (id: string, language: string) => {
  const data = await prefetchGuideDetail<CompanyDetailData>("companies", id, language);
  return data?.company ? data : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await resolveMarketingLocale();
  const data = await loadCompany(id, guideLanguageForLocale(locale));
  // Fetch failed / company gone: fall back to the site-wide defaults from the
  // root layout instead of throwing.
  if (!data) return {};
  const company = data.company;
  const title = company.companyName;
  const description = (company.shortDescription || company.description || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const path = `/guide/companies/${company.slug || company.id}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE}${path}`,
      siteName: "Machi",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function GuideCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await resolveMarketingLocale();
  const language = guideLanguageForLocale(locale);
  const data = await loadCompany(id, language);
  const company = data?.company;
  const structuredData = company
    ? {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: company.companyName,
        alternateName: company.companyNameJp || company.companyNameEn || undefined,
        url: `${SITE}/guide/companies/${company.slug || company.id}`,
        sameAs: company.website || undefined,
        description: (company.shortDescription || company.description || "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
        address: {
          "@type": "PostalAddress",
          addressCountry: "JP",
          addressRegion: company.prefecture || undefined,
          addressLocality: company.city || undefined,
        },
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
      <CompanyDetailClient initialData={data ?? undefined} initialLanguage={language} />
    </>
  );
}
