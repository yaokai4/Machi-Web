// Server component wrapper for the guide article page. Prefetches the
// article on the server so crawlers see real content (SSR + generateMetadata
// + JSON-LD) while the interactive page lives in the client component below.
// Any fetch failure degrades to the previous client-side loading — never 500.

import type { Metadata } from "next";
import { cache } from "react";
import ArticleDetailClient, { type ArticleDetailData } from "./ArticleDetailClient";
import { guideLanguageForLocale, prefetchGuideDetail } from "@/lib/server/guidePrefetch";
import { resolveMarketingLocale } from "@/lib/marketing-locale";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

// React cache() dedupes the fetch between generateMetadata and the page
// render, so each request hits the backend once.
const loadArticle = cache(async (slug: string, language: string) => {
  const data = await prefetchGuideDetail<ArticleDetailData>("articles", slug, language);
  return data?.article ? data : null;
});

function absoluteImage(url: string | undefined): string {
  if (!url) return `${SITE}/og-image.png`;
  return url.startsWith("http") ? url : `${SITE}${url}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveMarketingLocale();
  const data = await loadArticle(slug, guideLanguageForLocale(locale));
  // Fetch failed / article gone: fall back to the site-wide defaults from the
  // root layout instead of throwing.
  if (!data) return {};
  const article = data.article;
  const title = article.seoTitle || article.title;
  const description = (article.seoDescription || article.summary || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const path = `/guide/articles/${article.slug || slug}`;
  const image = absoluteImage(article.coverImage);
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
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await resolveMarketingLocale();
  const language = guideLanguageForLocale(locale);
  const data = await loadArticle(slug, language);
  const article = data?.article;
  const structuredData = article
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: (article.seoDescription || article.summary || "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
        mainEntityOfPage: `${SITE}/guide/articles/${article.slug || slug}`,
        image: absoluteImage(article.coverImage),
        datePublished: article.publishedAt || undefined,
        dateModified: article.updatedAt || article.publishedAt || undefined,
        author: {
          "@type": article.authorType === "user" ? "Person" : "Organization",
          name: article.authorName || "Machi",
        },
        publisher: { "@type": "Organization", name: "Machi", url: SITE },
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
      <ArticleDetailClient initialData={data ?? undefined} initialLanguage={language} />
    </>
  );
}
