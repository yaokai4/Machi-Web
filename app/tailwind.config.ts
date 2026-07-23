import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // KaiX brand palette — mirrors the iOS KXColor namespace.
        kx: {
          bg: "rgb(var(--kx-bg) / <alpha-value>)",
          surface: "rgb(var(--kx-surface) / <alpha-value>)",
          card: "rgb(var(--kx-card) / <alpha-value>)",
          soft: "rgb(var(--kx-soft) / <alpha-value>)",
          stroke: "rgb(var(--kx-stroke) / <alpha-value>)",
          text: "rgb(var(--kx-text) / <alpha-value>)",
          subtle: "rgb(var(--kx-subtle) / <alpha-value>)",
          muted: "rgb(var(--kx-muted) / <alpha-value>)",
          accent: "rgb(var(--kx-accent) / <alpha-value>)",
          accentSoft: "rgb(var(--kx-accent-soft) / <alpha-value>)",
          // Foreground on an accent fill: white in light, page ink in dark
          // (mirrors iOS onAccent) — keeps WCAG AA without dark: overrides.
          onAccent: "rgb(var(--kx-on-accent) / <alpha-value>)",
          heat: "rgb(var(--kx-heat) / <alpha-value>)",
          like: "rgb(var(--kx-like) / <alpha-value>)",
          repost: "rgb(var(--kx-repost) / <alpha-value>)",
          bookmark: "rgb(var(--kx-bookmark) / <alpha-value>)",
          verified: "rgb(var(--kx-verified) / <alpha-value>)",
          danger: "rgb(var(--kx-danger) / <alpha-value>)",
        },
      },
      borderRadius: {
        kx: "18px",
        "kx-sm": "9px",
        "kx-md": "13px",
        "kx-lg": "20px",
        "kx-sheet": "24px",
      },
      boxShadow: {
        // Two semantic elevation tiers only — "resting card" and "floating
        // element". Token-driven so dark mode collapses to a crisp near-black
        // edge automatically. Legacy names alias the same two tiers so older
        // call sites converge without edits.
        "kx-card": "0 1px 2px rgb(var(--kx-shadow) / 0.04), 0 12px 34px -28px rgb(var(--kx-shadow) / 0.45)",
        "kx-float": "0 22px 60px -42px rgb(var(--kx-shadow) / 0.55)",
        kx: "0 1px 2px rgb(var(--kx-shadow) / 0.04), 0 12px 34px -28px rgb(var(--kx-shadow) / 0.45)",
        "kx-glow": "0 22px 60px -42px rgb(var(--kx-shadow) / 0.55)",
        // Upward shadow for bottom-anchored bars/sheets (direction-specific).
        "kx-bar": "0 -4px 18px -10px rgb(var(--kx-shadow) / 0.20)",
      },
      fontFamily: {
        // Kept in sync with the `html, body` stack in globals.css. System
        // faces first (no web-font download), with CJK + Japanese fallbacks
        // so mixed-script UI renders in native metrics.
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'SF Pro Text'",
          "'Segoe UI'",
          "'PingFang SC'",
          "'Hiragino Sans'",
          "'Noto Sans JP'",
          "'Noto Sans SC'",
          "sans-serif",
        ],
      },
      fontSize: {
        "kx-meta": ["12px", "16px"],
        "kx-body": ["15px", "22px"],
        "kx-title": ["21px", "28px"],
        "kx-display": ["30px", "36px"],
      },
      maxWidth: {
        "kx-feed": "640px",
        "kx-shell": "1280px",
      },
      animation: {
        "kx-pulse": "kx-pulse 1.6s ease-in-out infinite",
        "kx-fade-in": "kx-fade-in 220ms ease-out",
        "kx-pop": "kx-pop 320ms cubic-bezier(.34,1.56,.64,1)",
        "kx-scale-in": "kx-scale-in 180ms cubic-bezier(.16,1,.3,1)",
        "kx-slide-up": "kx-slide-up 260ms cubic-bezier(.16,1,.3,1)",
        "kx-shimmer": "kx-shimmer 1.4s linear infinite",
        "kx-spin-slow": "spin 2.4s linear infinite",
        "kx-ring-pulse": "kx-ring-pulse 1.6s ease-out infinite",
        "kx-underline": "kx-underline 220ms cubic-bezier(.16,1,.3,1) both",
      },
      keyframes: {
        "kx-pulse": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "0.92" },
        },
        "kx-fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "kx-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.32)" },
          "100%": { transform: "scale(1)" },
        },
        "kx-scale-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "kx-slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "kx-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "kx-ring-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
        "kx-underline": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
