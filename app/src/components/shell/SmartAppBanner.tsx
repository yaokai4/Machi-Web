"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { APP_STORE_URL } from "@/components/marketing/StoreButtons";

// Web→App handoff banner. Shown only to iOS mobile browsers (and never
// inside a standalone/installed PWA) as a slim strip above the content
// area, pointing at the live App Store listing. Safari additionally gets
// the native smart banner via the `itunes` metadata in layout.tsx; this
// covers Chrome iOS / in-app webviews where that meta tag is ignored.
// Self-contained: local copy map + existing --kx-* tokens only, no
// changes to any other component's styles.

const DISMISS_KEY = "machi-app-banner-dismissed";

// Copy lives here (mirroring StoreButtons' STORE_COPY) instead of the
// shared i18n table so the banner stays fully self-contained.
const BANNER_COPY: Record<Locale, { title: string; subtitle: string; open: string; close: string }> = {
  "zh-Hans": { title: "Machi App", subtitle: "在 App 内体验更流畅", open: "打开", close: "关闭" },
  "zh-Hant": { title: "Machi App", subtitle: "在 App 內體驗更流暢", open: "打開", close: "關閉" },
  en: { title: "Machi App", subtitle: "Better in the app", open: "Open", close: "Close" },
  ja: { title: "Machi App", subtitle: "アプリならもっと快適", open: "開く", close: "閉じる" },
};

function isIOSMobileBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
    // iPadOS 13+ masquerades as macOS Safari but keeps multi-touch.
    || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  // Skip inside an installed PWA — there is no browser chrome to escape.
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function SmartAppBanner() {
  const { locale } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Client-only gate: SSR renders nothing so there is no hydration flash.
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* storage unavailable → still show, dismissal just won't persist */
    }
    if (isIOSMobileBrowser()) setVisible(true);
  }, []);

  if (!visible) return null;

  const copy = BANNER_COPY[locale] ?? BANNER_COPY["zh-Hans"];
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-kx-stroke/35 bg-kx-surface px-3 py-2 md:hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label={copy.close}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-kx-subtle hover:bg-kx-soft"
      >
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-[22%]" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-kx-text">{copy.title}</p>
        <p className="truncate text-xs text-kx-subtle">{copy.subtitle}</p>
      </div>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-kx-accent px-4 py-1.5 text-sm font-semibold text-white"
      >
        {copy.open}
      </a>
    </div>
  );
}
