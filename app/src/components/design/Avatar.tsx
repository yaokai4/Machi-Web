"use client";

import Link from "next/link";
import clsx from "clsx";
import { avatarPaletteColor } from "@/lib/format";
import type { KXUser } from "@/lib/types";

interface AvatarProps {
  user?: KXUser | null;
  size?: number;
  href?: string;
  className?: string;
}

export function Avatar({ user, size = 40, href, className }: AvatarProps) {
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
      aria-label={user?.display_name || "用户"}
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
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="inline-block text-kx-verified shrink-0" aria-label="已认证">
      <path
        fill="currentColor"
        d="M12 2l2.39 1.74 2.96-.04 1 2.79 2.4 1.73-.61 2.9 1 2.79-2.39 1.74-1 2.79-2.96-.04L12 22l-2.39-1.74-2.96.04-1-2.79-2.4-1.73.61-2.9-1-2.79 2.39-1.74 1-2.79 2.96.04L12 2zm-1.05 13.41l5.66-5.66-1.41-1.41-4.24 4.24-1.83-1.83-1.41 1.41 3.23 3.25z"
      />
    </svg>
  );
}
