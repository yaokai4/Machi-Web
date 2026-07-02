// Server component wrapper for the school detail page. Prefetches the school
// on the server so crawlers see real content (SSR + generateMetadata +
// JSON-LD) while the interactive page lives in the client component below.
// Any fetch failure degrades to the previous client-side loading — never 500.

import type { Metadata } from "next";
import { cache } from "react";
import SchoolDetailClient, { type SchoolDetailData } from "./SchoolDetailClient";
import { guideLanguageForLocale, prefetchGuideDetail } from "@/lib/server/guidePrefetch";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

// React cache() dedupes the fetch between generateMetadata and the page
// render, so each request hits the backend once.
const loadSchool = cache(async (id: string, language: string) => {
  const data = await prefetchGuideDetail<SchoolDetailData>("schools", id, language);
  return data?.school ? data : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const locale = await resolveMarketingLocale();
  const data = await loadSchool(id, guideLanguageForLocale(locale));
  // Fetch failed / school gone: fall back to the site-wide defaults from the
  // root layout instead of throwing.
  if (!data) return {};
  const school = data.school;
  const title = school.schoolName;
  const description = (school.shortDescription || school.description || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const path = `/guide/schools/${school.slug || school.id}`;
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

export default async function GuideSchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await resolveMarketingLocale();
  const language = guideLanguageForLocale(locale);
  const data = await loadSchool(id, language);
  const school = data?.school;
  const structuredData = school
    ? {
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        name: school.schoolName,
        alternateName: school.schoolNameJp || school.schoolNameEn || undefined,
        url: `${SITE}/guide/schools/${school.slug || school.id}`,
        sameAs: school.website || undefined,
        description: (school.shortDescription || school.description || "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
        address: {
          "@type": "PostalAddress",
          addressCountry: "JP",
          addressRegion: school.prefecture || undefined,
          addressLocality: school.city || undefined,
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
      <SchoolDetailClient initialData={data ?? undefined} initialLanguage={language} />
    </>
  );
}
