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
  { pageId: "business", slug: ["business"] },
  { pageId: "safety", slug: ["safety"] },
  { pageId: "download", slug: ["download"] },
  { pageId: "ads", slug: ["ads"] },
  { pageId: "contact", slug: ["contact"] },
  { pageId: "partners", slug: ["partners"] },
  { pageId: "jobs-promotion", slug: ["jobs-promotion"] },
  { pageId: "housing-promotion", slug: ["housing-promotion"] },
  { pageId: "safety-center", slug: ["safety-center"] },
  { pageId: "privacy", slug: ["legal", "privacy"] },
  { pageId: "terms", slug: ["legal", "terms"] },
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
  return buildSubPageMetadata(pageId, pathSuffix, {
    canonicalPath: `/${resolved.locale}/${pathSuffix}`,
  });
}

export default async function Page({ params }: PageProps) {
  const resolved = await params;
  const pageId = pageIdForParams(resolved);
  if (!pageId || !isLocalizedMarketingLocale(resolved.locale)) notFound();

  return <LocalizedMarketingPage pageId={pageId} initialLocale={resolved.locale} />;
}
