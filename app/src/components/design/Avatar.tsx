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

export function OfficialBadge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" className="inline-block shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="Machi 官方">
      <path
        fill="currentColor"
        d="M12 2.3 4.6 5.1v5.7c0 4.8 3.1 9.2 7.4 10.9 4.3-1.7 7.4-6.1 7.4-10.9V5.1L12 2.3Zm3.9 7.3-4.7 4.7-2.1-2.1 1.2-1.2.9.9 3.5-3.5 1.2 1.2Z"
      />
    </svg>
  );
}

export function OfficialPill({ label = "Machi 官方" }: { label?: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
      <OfficialBadge />
      {label}
    </span>
  );
}
