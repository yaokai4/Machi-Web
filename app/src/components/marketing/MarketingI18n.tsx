"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketingCopy, type MarketingLocale } from "@/data/machi-home";
import { api } from "@/lib/api";
import { applyMarketingCopyOverrides, scopeMarketingCopyOverrides } from "@/lib/marketingCopyOverrides";

type MarketingI18nValue = {
  locale: MarketingLocale;
  setLocale: (locale: MarketingLocale) => void;
  copy: (typeof marketingCopy)[MarketingLocale];
  overrides: Record<string, string>;
};

const MarketingI18nContext = createContext<MarketingI18nValue | null>(null);

const COOKIE = "machi-marketing-locale";
const STORAGE = "machi-marketing-locale";

function isLocale(value: unknown): value is MarketingLocale {
  return value === "zh" || value === "en" || value === "ja";
}

function readClientLocale(): MarketingLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage?.getItem(STORAGE);
    if (isLocale(stored)) return stored;
  } catch {
    // privacy mode — fall through
  }
  try {
    const cookieLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${COOKIE}=`))
      ?.split("=")[1];
    if (isLocale(cookieLocale)) return cookieLocale;
  } catch {
    // ignore
  }
  return null;
}

function detectFromNavigator(): MarketingLocale {
  if (typeof window === "undefined") return "zh";
  try {
    const language = window.navigator.language.toLowerCase();
    if (language.startsWith("ja")) return "ja";
    if (language.startsWith("en")) return "en";
  } catch {
    // ignore
  }
  return "zh";
}

function persistLocale(nextLocale: MarketingLocale) {
  try {
    window.localStorage?.setItem(STORAGE, nextLocale);
  } catch {
    // privacy mode — cookie still works
  }
  try {
    document.cookie = `${COOKIE}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/// `initialLocale` is read at render time from a Server Component (via
/// the URL prefix `/en`, `/ja`, or the cookie set on a previous visit)
/// and passed in. That removes the previous render→hydrate flash where
/// every user saw zh first.
export function MarketingLocaleProvider({
  children,
  initialLocale = "zh",
  preferClientLocale = true,
}: {
  children: React.ReactNode;
  initialLocale?: MarketingLocale;
  preferClientLocale?: boolean;
}) {
  const [locale, setLocaleState] = useState<MarketingLocale>(initialLocale);
  const overrides = useQuery({
    queryKey: ["marketing-copy-overrides", locale],
    queryFn: () => api.marketingCopyOverrides(locale),
    staleTime: 60_000,
  });

  // Client-side: if the user has previously chosen a different locale
  // via the in-page switcher, honour that. Skipped when the server
  // already locked the locale via a URL prefix (e.g. /en) since that
  // is the source of truth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!preferClientLocale) return;
    const stored = readClientLocale();
    if (stored && stored !== locale) {
      setLocaleState(stored);
      return;
    }
    // Only auto-detect when we have NO signal at all.
    if (!stored && locale === "zh") {
      const detected = detectFromNavigator();
      if (detected !== "zh") setLocaleState(detected);
    }
    // We intentionally exclude `locale` from deps — this is a "first
    // mount" sync, not a reactive bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferClientLocale]);

  const value = useMemo<MarketingI18nValue>(() => {
    const setLocale = (nextLocale: MarketingLocale) => {
      setLocaleState(nextLocale);
      persistLocale(nextLocale);
      if (typeof document !== "undefined") {
        document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : nextLocale;
      }
    };
    return {
      locale,
      setLocale,
      overrides: overrides.data?.overrides || {},
      copy: applyMarketingCopyOverrides(
        marketingCopy[locale],
        scopeMarketingCopyOverrides(overrides.data?.overrides, "home."),
      ),
    };
  }, [locale, overrides.data?.overrides]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    }
  }, [locale]);

  return <MarketingI18nContext.Provider value={value}>{children}</MarketingI18nContext.Provider>;
}

export function useMarketingI18n() {
  const context = useContext(MarketingI18nContext);
  if (!context) {
    throw new Error("useMarketingI18n must be used within MarketingLocaleProvider");
  }
  return context;
}

/**
 * Prefix an internal marketing path with the active locale (`/en`, `/ja`) so
 * in-body CTAs keep the visitor in their chosen language — matching how the
 * Header/Footer already localize their links. `zh` is the unprefixed default;
 * external URLs, hashes, and the `/home` app route are left untouched.
 */
export function localizedMarketingHref(href: string, locale: MarketingLocale): string {
  if (locale === "zh") return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (href === "/home" || href.startsWith("/home/") || href.startsWith("/home#")) return href;
  return `/${locale}${href}`;
}
