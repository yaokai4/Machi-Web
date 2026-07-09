import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedMarketingPage } from "@/components/marketing/LocalizedMarketingPage";
import type { MarketingPageId } from "@/data/marketing-pages";
import type { MarketingLocale } from "@/data/machi-home";
import { buildSubPageMetadata, SUPPORTED_LOCALES } from "@/lib/marketing-locale";

const localizedMarketingPages: Array<{ pageId: MarketingPageId; slug: string[] }> = [
  { pageId: "about", slug: ["about"] },
  { pageId: "features", slug: ["features"] },
  { pageId: "cities", slug: ["cities"] },
  { pageId: "guide", slug: ["guide"] },
  { pageId: "business", slug: ["business"] },
  { pageId: "safety", slug: ["safety"] },
  { pageId: "download", slug: ["download"] },
  { pageId: "updates", slug: ["updates"] },
  { pageId: "faq", slug: ["faq"] },
  { pageId: "ads", slug: ["ads"] },
  { pageId: "contact", slug: ["contact"] },
  { pageId: "partners", slug: ["partners"] },
  { pageId: "jobs-promotion", slug: ["jobs-promotion"] },
  { pageId: "housing-promotion", slug: ["housing-promotion"] },
  { pageId: "safety-center", slug: ["safety-center"] },
  { pageId: "privacy", slug: ["legal", "privacy"] },
  { pageId: "terms", slug: ["legal", "terms"] },
  { pageId: "membership-terms", slug: ["legal", "membership-terms"] },
  { pageId: "service-terms", slug: ["legal", "service-terms"] },
  { pageId: "refund-policy", slug: ["legal", "refund-policy"] },
  { pageId: "community-guidelines", slug: ["legal", "community-guidelines"] },
  { pageId: "commercial-disclosure", slug: ["legal", "commercial-disclosure"] },
  { pageId: "cookie-policy", slug: ["legal", "cookie-policy"] },
];

const pathToPageId = new Map(localizedMarketingPages.map(({ pageId, slug }) => [slug.join("/"), pageId]));
const pageIdToPath = new Map(localizedMarketingPages.map(({ pageId, slug }) => [pageId, slug.join("/")]));

type Params = {
  locale: string;
  slug: string[];
};

type PageProps = {
  params: Promise<Params>;
};

function isLocalizedMarketingLocale(value: string): value is MarketingLocale {
  return value === "zh" || value === "en" || value === "ja";
}

function pageIdForParams(params: Params): MarketingPageId | null {
  if (!isLocalizedMarketingLocale(params.locale)) return null;
  return pathToPageId.get(params.slug.join("/")) ?? null;
}

export function generateStaticParams() {
  return localizedMarketingPages.flatMap(({ slug }) =>
    SUPPORTED_LOCALES.map((locale) => ({
      locale,
      slug,
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = await params;
  const pageId = pageIdForParams(resolved);
  if (!pageId) return {};
  const pathSuffix = pageIdToPath.get(pageId) ?? resolved.slug.join("/");
  // `guide` is special: the real Guide product lives at the prefix-less
  // /guide (app/guide/page.tsx → GuideHomeClient) and declares its language
  // versions as /{locale}/guide. This localized marketing intro renders on
  // those same URLs, so it must NOT self-canonicalize as a separate page —
  // that produced two competing canonicals for the Guide cluster. Point its
  // canonical (and OG url) at /guide so every /{locale}/guide consolidates
  // into the one product page, matching the hreflang set /guide already emits.
  const canonicalPath = pageId === "guide" ? "/guide" : `/${resolved.locale}/${pathSuffix}`;
  return buildSubPageMetadata(pageId, pathSuffix, {
    canonicalPath,
  });
}

export default async function Page({ params }: PageProps) {
  const resolved = await params;
  const pageId = pageIdForParams(resolved);
  if (!pageId || !isLocalizedMarketingLocale(resolved.locale)) notFound();

  return <LocalizedMarketingPage pageId={pageId} initialLocale={resolved.locale} />;
}
