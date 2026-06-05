"use client";

import { Loader2 } from "lucide-react";

/**
 * Official multi-color Google "G" mark (per Google's branding guidelines).
 * Kept as inline SVG so the button needs no external asset and renders
 * crisply in both light and dark themes.
 */
export function GoogleGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

/**
 * "Sign in with Google" button styled to Google's brand spec — white surface,
 * neutral 1px border, the four-color mark, dark label — while matching Machi's
 * rounded controls. Used by both the login and register pages.
 */
export function GoogleSignInButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-kx-lg border border-[#dadce0] bg-white px-4 text-[15px] font-bold text-[#3c4043] shadow-sm transition hover:bg-[#f7f9fc] hover:shadow disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]"
    >
      {loading ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin text-kx-muted" aria-hidden="true" />
      ) : (
        <GoogleGlyph />
      )}
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
}
