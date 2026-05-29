"use client";

import Link from "next/link";
import clsx from "clsx";
import { useMarketingI18n } from "./MarketingI18n";

type StoreKind = "app-store" | "google-play";

const STORE_BADGE_STYLE = { width: 170, height: 56 };
const STORE_BADGE_CLASS = "block h-14 w-[170px] shrink-0 select-none rounded-[13px]";
const STORE_BADGE_CLIP_CLASS = "relative block h-14 w-[170px] shrink-0 overflow-hidden rounded-[13px]";
const STORE_BADGE_IMG_CLASS = "absolute select-none";

const availabilityCopy = {
  zh: "即将上架",
  en: "Coming soon",
  ja: "近日公開",
};

// Official Apple Media Services badge URLs — Apple regenerates these
// per-locale so we get the correct "Download on the App Store" wording
// in the user's language. `size=250x83` is the recommended marketing
// size; we scale it down with CSS while keeping the asset crisp on
// retina.
const APP_STORE_BADGE: Record<"zh" | "en" | "ja", string> = {
  zh: "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/zh-cn?size=250x83",
  en: "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83",
  ja: "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/ja-jp?size=250x83",
};

// Official Google Play badge URLs. Google uses underscores in locale
// codes and serves PNG natively at retina sizes already.
const GOOGLE_PLAY_BADGE: Record<"zh" | "en" | "ja", string> = {
  zh: "https://play.google.com/intl/en_us/badges/static/images/badges/zh-cn_badge_web_generic.png",
  en: "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png",
  ja: "https://play.google.com/intl/en_us/badges/static/images/badges/ja_badge_web_generic.png",
};

function appStoreSrc(locale: "zh" | "en" | "ja") {
  return APP_STORE_BADGE[locale] || APP_STORE_BADGE.en;
}
function googlePlaySrc(locale: "zh" | "en" | "ja") {
  return GOOGLE_PLAY_BADGE[locale] || GOOGLE_PLAY_BADGE.en;
}

/// Just the official Apple App Store black badge — no wrapper card.
/// Eagerly loaded so it appears in the first paint and never flashes
/// behind a white fallback box.
function AppStoreBadge({ locale, className }: { locale: "zh" | "en" | "ja"; className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={appStoreSrc(locale)}
      alt="Download on the App Store"
      width={250}
      height={83}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      style={STORE_BADGE_STYLE}
      className={clsx(STORE_BADGE_CLASS, "object-fill", className)}
    />
  );
}

function GooglePlayBadge({ locale, className }: { locale: "zh" | "en" | "ja"; className?: string }) {
  return (
    <span style={STORE_BADGE_STYLE} className={clsx(STORE_BADGE_CLIP_CLASS, className)}>
      {/* Google's official PNG includes transparent padding. Scale and clip it
          inside the same fixed frame as App Store so the visible badge bodies
          are the same size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={googlePlaySrc(locale)}
        alt="Get it on Google Play"
        width={646}
        height={250}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className={clsx(
          STORE_BADGE_IMG_CLASS,
          "left-1/2 top-1/2 h-[72px] w-[186px] -translate-x-1/2 -translate-y-1/2 object-fill",
        )}
      />
    </span>
  );
}

export function AppStoreIcon({ className }: { className?: string }) {
  const { locale } = useMarketingI18n();
  return <AppStoreBadge locale={locale} className={className} />;
}

export function GooglePlayIcon({ className }: { className?: string }) {
  const { locale } = useMarketingI18n();
  return <GooglePlayBadge locale={locale} className={className} />;
}

/// Minimal CTA — just the official badge, with an optional "即将上架"
/// caption above it. No outer pill, no duplicated "App Store" text.
export function StoreButton({
  kind,
  caption,
  href = "#download",
  dark = false,
  className,
}: {
  kind: StoreKind;
  /** Kept in API for back-compat — the badge already says the store name. */
  label?: string;
  caption?: string;
  href?: string;
  dark?: boolean;
  className?: string;
}) {
  const { locale } = useMarketingI18n();
  const eyebrow = caption || availabilityCopy[locale];
  const aria = kind === "app-store" ? "Download on the App Store" : "Get it on Google Play";

  return (
    <Link
      href={href}
      aria-label={aria}
      className={clsx(
        "group inline-flex flex-col items-start gap-1.5",
        "transition duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.985]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500",
        className,
      )}
    >
      <span
        className={clsx(
          "text-[11px] font-black uppercase tracking-wide",
          dark ? "text-white/60" : "text-slate-500 dark:text-slate-400",
        )}
      >
        {eyebrow}
      </span>
      <span
        className={clsx(
          "block shrink-0 transition-shadow duration-200",
          dark
            ? "drop-shadow-[0_12px_30px_rgba(0,0,0,0.35)] group-hover:drop-shadow-[0_16px_36px_rgba(0,0,0,0.44)]"
            : "drop-shadow-[0_8px_22px_rgba(15,23,42,0.18)] group-hover:drop-shadow-[0_12px_28px_rgba(15,23,42,0.28)]",
        )}
      >
        {kind === "app-store" ? (
          <AppStoreBadge locale={locale} />
        ) : (
          <GooglePlayBadge locale={locale} />
        )}
      </span>
    </Link>
  );
}
