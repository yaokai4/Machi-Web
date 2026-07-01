"use client";

import Link from "next/link";
import clsx from "clsx";
import { siApple, siGoogleplay } from "simple-icons";
import { useMarketingI18n } from "./MarketingI18n";

type StoreKind = "app-store" | "google-play";

// Canonical App Store listing for Machi (你的日本生活). Kept here so every
// store badge across the marketing site points to a single source of truth.
export const APP_STORE_URL =
  "https://apps.apple.com/cn/app/machi-%E4%BD%A0%E7%9A%84%E6%97%A5%E6%9C%AC%E7%94%9F%E6%B4%BB/id6781900781";

// We render the store badges as crisp vector type + logo instead of the
// baked-in PNG marketing badges. That keeps them razor-sharp at any size,
// lets the wording follow the site's own typography, and gives us the
// glossy black "App Store grade" treatment that reads as premium on the
// warm landing palette. Wording mirrors the official localized badges.
const STORE_COPY: Record<"zh" | "en" | "ja", Record<StoreKind, { top: string; name: string }>> = {
  zh: {
    "app-store": { top: "下载于", name: "App Store" },
    "google-play": { top: "立即前往", name: "Google Play" },
  },
  en: {
    "app-store": { top: "Download on the", name: "App Store" },
    "google-play": { top: "GET IT ON", name: "Google Play" },
  },
  ja: {
    "app-store": { top: "ダウンロード", name: "App Store" },
    "google-play": { top: "入手する", name: "Google Play" },
  },
};

const availabilityCopy = {
  zh: "即将上线",
  en: "Coming soon",
  ja: "近日公開",
};

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-[26px] w-[26px] shrink-0">
      <path d={siApple.path} fill="#ffffff" />
    </svg>
  );
}

function GooglePlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-[23px] w-[23px] shrink-0">
      <defs>
        <linearGradient id="mc-gplay-grad" x1="3" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00D2FF" />
          <stop offset="0.4" stopColor="#00E08A" />
          <stop offset="0.72" stopColor="#FFC700" />
          <stop offset="1" stopColor="#FF4B5C" />
        </linearGradient>
      </defs>
      <path d={siGoogleplay.path} fill="url(#mc-gplay-grad)" />
    </svg>
  );
}

// Backwards-compatible glyph-only exports (kept so any future surface can
// reuse the marks without the full badge chrome).
export function AppStoreIcon({ className }: { className?: string }) {
  return <span className={className}><AppleGlyph /></span>;
}
export function GooglePlayIcon({ className }: { className?: string }) {
  return <span className={className}><GooglePlayGlyph /></span>;
}

/// Premium glossy store badge — a single, consistent dark capsule for both
/// stores with the real Apple / Google Play mark, a two-line label, an
/// optional availability caption, and a soft hover lift.
export function StoreButton({
  kind,
  caption,
  href = "#download",
  showCaption = true,
  className,
}: {
  kind: StoreKind;
  /** Kept in the API for back-compat — the badge already names the store. */
  label?: string;
  caption?: string;
  href?: string;
  /** Set false to drop the small "Coming soon" eyebrow. */
  showCaption?: boolean;
  dark?: boolean;
  className?: string;
}) {
  const { locale } = useMarketingI18n();
  const words = STORE_COPY[locale]?.[kind] ?? STORE_COPY.en[kind];
  const eyebrow = caption ?? availabilityCopy[locale];
  const aria = kind === "app-store" ? "Download on the App Store" : "Get it on Google Play";
  // A full URL (the live App Store listing) opens in a new tab; in-page
  // anchors (#download) stay in the current tab.
  const isExternal = /^https?:\/\//.test(href);

  return (
    <Link
      href={href}
      aria-label={aria}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className={clsx(
        "group inline-flex flex-col items-center gap-2 focus-visible:outline-none",
        className,
      )}
    >
      {showCaption && eyebrow ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          {eyebrow}
        </span>
      ) : null}
      <span
        className={clsx(
          "relative inline-flex h-[58px] w-[200px] items-center gap-3.5 overflow-hidden rounded-[16px] px-[18px]",
          "bg-[linear-gradient(180deg,#2a2a30_0%,#08080a_100%)] text-white",
          "ring-1 ring-white/[0.14]",
          "shadow-[0_14px_34px_-16px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.16)]",
          "transition-[transform,box-shadow] duration-300 ease-out",
          "group-hover:-translate-y-0.5 group-hover:shadow-[0_24px_50px_-18px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.22)]",
          "group-active:translate-y-0 group-active:scale-[0.99]",
          "group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-orange-400 group-focus-visible:ring-offset-transparent",
        )}
      >
        {/* top sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.13] to-transparent"
        />
        {/* warm hover glow tying the neutral badge into the brand palette */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-[16px] bg-[radial-gradient(120%_120%_at_15%_0%,rgba(255,118,87,0.22),transparent_55%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <span className="relative flex shrink-0 items-center justify-center">
          {kind === "app-store" ? <AppleGlyph /> : <GooglePlayGlyph />}
        </span>
        <span className="relative flex min-w-0 flex-col items-start leading-none">
          <span className="text-[10.5px] font-medium tracking-[0.02em] text-white/65">{words.top}</span>
          <span className="mt-[3px] whitespace-nowrap text-[19px] font-semibold tracking-[-0.01em] text-white">
            {words.name}
          </span>
        </span>
      </span>
    </Link>
  );
}
