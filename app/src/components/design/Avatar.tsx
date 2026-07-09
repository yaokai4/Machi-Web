"use client";

import Link from "next/link";
import clsx from "clsx";
import { avatarPaletteColor } from "@/lib/format";
import { useI18n, type Locale } from "@/lib/i18n";
import type { KXUser } from "@/lib/types";

// Tiny local locale switch so these incidental a11y strings read in all four
// languages without threading new shared i18n keys through the dictionary
// (same local-copy pattern used by PostCard's `localize`). English/Japanese
// screen-reader users no longer hear hard-coded Chinese labels.
function avatarLocale(locale: Locale, zhHans: string, zhHant: string, en: string, ja: string): string {
  switch (locale) {
    case "en":
      return en;
    case "ja":
      return ja;
    case "zh-Hant":
      return zhHant;
    default:
      return zhHans;
  }
}

interface AvatarProps {
  user?: KXUser | null;
  size?: number;
  href?: string;
  className?: string;
}

export function Avatar({ user, size = 40, href, className }: AvatarProps) {
  const { locale } = useI18n();
  const initials = (user?.display_name || user?.handle || "·").slice(0, 1).toUpperCase();
  const bg = avatarPaletteColor(user?.avatar_color || "indigo");
  const inner = (
    <div
      className={clsx(
        "inline-flex items-center justify-center text-white font-semibold",
        "shrink-0 select-none ring-1 ring-kx-stroke/40 overflow-hidden",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: user?.avatar_url
          ? undefined
          : `linear-gradient(140deg, ${bg}, ${shade(bg, -16)})`,
        fontSize: Math.round(size * 0.42),
        borderRadius: size >= 56 ? 18 : size >= 36 ? 12 : 9,
      }}
      aria-label={user?.display_name || avatarLocale(locale, "用户", "用戶", "User", "ユーザー")}
    >
      {user?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt={user.display_name}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {inner}
      </Link>
    );
  }
  return inner;
}

function shade(hex: string, delta: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (n & 0xff) + delta));
  return `rgb(${r}, ${g}, ${b})`;
}

export function VerifiedBadge() {
  const { locale } = useI18n();
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      className="inline-block text-kx-verified shrink-0"
      role="img"
      aria-label={avatarLocale(locale, "已认证", "已認證", "Verified", "認証済み")}
    >
      <path
        fill="currentColor"
        d="M12 2l2.39 1.74 2.96-.04 1 2.79 2.4 1.73-.61 2.9 1 2.79-2.39 1.74-1 2.79-2.96-.04L12 22l-2.39-1.74-2.96.04-1-2.79-2.4-1.73.61-2.9-1-2.79 2.39-1.74 1-2.79 2.96.04L12 2zm-1.05 13.41l5.66-5.66-1.41-1.41-4.24 4.24-1.83-1.83-1.41 1.41 3.23 3.25z"
      />
    </svg>
  );
}

export function OfficialBadge() {
  const { locale } = useI18n();
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      className="inline-block shrink-0 text-emerald-700 dark:text-emerald-300"
      role="img"
      aria-label={avatarLocale(locale, "Machi 官方", "Machi 官方", "Machi Official", "Machi 公式")}
    >
      <path
        fill="currentColor"
        d="M12 2.3 4.6 5.1v5.7c0 4.8 3.1 9.2 7.4 10.9 4.3-1.7 7.4-6.1 7.4-10.9V5.1L12 2.3Zm3.9 7.3-4.7 4.7-2.1-2.1 1.2-1.2.9.9 3.5-3.5 1.2 1.2Z"
      />
    </svg>
  );
}

export function OfficialPill({ label }: { label?: string }) {
  const { locale } = useI18n();
  const text = label ?? avatarLocale(locale, "Machi 官方", "Machi 官方", "Machi Official", "Machi 公式");
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
      <OfficialBadge />
      {text}
    </span>
  );
}
