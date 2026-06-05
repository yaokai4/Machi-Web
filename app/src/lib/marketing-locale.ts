import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { MarketingLocale } from "@/data/machi-home";
import { marketingPages, type MarketingPageId } from "@/data/marketing-pages";

export const SUPPORTED_LOCALES: readonly MarketingLocale[] = ["zh", "en", "ja"] as const;
export const DEFAULT_LOCALE: MarketingLocale = "zh";

function isLocale(value: unknown): value is MarketingLocale {
  return value === "zh" || value === "en" || value === "ja";
}

/// Pick the best locale to render given the request context.
/// Priority: explicit caller → URL prefix (/en, /ja) → cookie → Accept-Language → default.
/// URL prefix wins over cookie so /en /ja are predictable for sharing,
/// SEO and visitors arriving from a different language than their
/// previous session.
export async function resolveMarketingLocale(explicit?: MarketingLocale): Promise<MarketingLocale> {
  if (explicit && isLocale(explicit)) return explicit;
  let hdrs: Awaited<ReturnType<typeof headers>> | null = null;
  try {
    hdrs = await headers();
  } catch {
    // outside a request scope
  }
  const fromHeader = hdrs?.get("x-machi-locale");
  if (isLocale(fromHeader)) return fromHeader;
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get("machi-marketing-locale")?.value;
    if (isLocale(fromCookie)) return fromCookie;
  } catch {
    // headers/cookies unavailable in some build contexts
  }
  try {
    const accept = hdrs?.get("accept-language")?.toLowerCase() || "";
    if (accept.startsWith("ja")) return "ja";
    if (accept.startsWith("en")) return "en";
    if (accept.startsWith("zh")) return "zh";
    // fall through to inspect q-weighted values
    const ranked = accept
      .split(",")
      .map((part) => part.trim())
      .map((part) => {
        const [tag, q] = part.split(";q=");
        return { tag: tag.split("-")[0], q: q ? Number(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);
    for (const { tag } of ranked) {
      if (tag === "zh" || tag === "en" || tag === "ja") return tag;
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

const HTML_LANG: Record<MarketingLocale, string> = {
  zh: "zh-CN",
  en: "en",
  ja: "ja",
};

export function htmlLangFor(locale: MarketingLocale): string {
  return HTML_LANG[locale];
}

/// Build the alternates.languages object Next expects, plus x-default.
export function localeAlternates(
  pathSuffix: string,
  baseUrl: string = "https://www.machicity.com",
): Record<string, string> {
  const trimmed = pathSuffix.replace(/^\/+/, "");
  const slash = trimmed ? `/${trimmed}` : "";
  return {
    "zh-CN": `${baseUrl}/zh${slash}`,
    en: `${baseUrl}/en${slash}`,
    ja: `${baseUrl}/ja${slash}`,
    "x-default": `${baseUrl}/en${slash}`,
  };
}

const OG_LOCALE: Record<MarketingLocale, string> = {
  zh: "zh_CN",
  en: "en_US",
  ja: "ja_JP",
};

/// Build a localized Metadata block for a marketing sub-page. Reads the
/// title + intro out of marketing-pages.ts for the resolved locale,
/// falls back to zh, and wires up alternates / openGraph automatically.
export async function buildSubPageMetadata(
  pageId: MarketingPageId,
  pathSuffix: string,
  options: { canonicalPath?: string } = {},
): Promise<Metadata> {
  const locale = await resolveMarketingLocale();
  const page = marketingPages[pageId]?.[locale] ?? marketingPages[pageId]?.zh;
  const fallbackTitle = pageId;
  const titleText = page?.title || fallbackTitle;
  // Strip trailing punctuation for a tighter page title and pair with brand.
  const cleanTitle = titleText.replace(/[。.!？？！]+$/, "");
  const description = page?.intro || titleText;
  const path = options.canonicalPath ?? `/${pathSuffix.replace(/^\/+/, "")}`;
  // `title.absolute` bypasses the root layout's `%s | Machi`
  // template — without it, the page title would double-up to
  // "X | Machi | Machi".
  return {
    title: { absolute: `${cleanTitle} | Machi` },
    description,
    alternates: {
      canonical: path,
      languages: localeAlternates(pathSuffix),
    },
    openGraph: {
      title: `${cleanTitle} | Machi`,
      description,
      url: `https://www.machicity.com${path}`,
      siteName: "Machi",
      locale: OG_LOCALE[locale],
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${cleanTitle} | Machi`,
      description,
      images: ["/og-image.png"],
    },
  };
}
