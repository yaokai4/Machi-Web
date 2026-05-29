// Small formatting helpers shared across the app. Kept here so they
// match the iOS App's DateFormatterUtils / NumberFormatterUtils logic.

export function compactNumber(value: number | null | undefined): string {
  if (value == null) return "0";
  const abs = Math.abs(value);
  if (abs < 1_000) return String(value);
  if (abs < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (abs < 100_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(value / 1_000_000)}M`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)} 天前`;
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// Render text with #tags and @mentions as clickable spans (data attributes are used by the parent click handler).
export interface TextSegment {
  kind: "text" | "hashtag" | "mention" | "url";
  value: string;
}

const SEGMENT_RE = /(#[\w一-鿿]+|@[a-z0-9_]{2,24}|https?:\/\/[^\s]+)/giu;

export function tokenizeContent(content: string): TextSegment[] {
  if (!content) return [];
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const matches = content.matchAll(SEGMENT_RE);
  for (const match of matches) {
    const start = match.index ?? 0;
    if (start > lastIndex) segments.push({ kind: "text", value: content.slice(lastIndex, start) });
    const value = match[0];
    if (value.startsWith("#")) segments.push({ kind: "hashtag", value });
    else if (value.startsWith("@")) segments.push({ kind: "mention", value });
    else segments.push({ kind: "url", value });
    lastIndex = start + value.length;
  }
  if (lastIndex < content.length) segments.push({ kind: "text", value: content.slice(lastIndex) });
  return segments;
}

export function avatarPaletteColor(name: string | undefined | null): string {
  const map: Record<string, string> = {
    black: "#1f2329",
    gray: "#7f8694",
    red: "#d94343",
    orange: "#e57a26",
    yellow: "#e4b226",
    green: "#27a85a",
    teal: "#1ea3a1",
    mint: "#37c39f",
    blue: "#3a6dde",
    indigo: "#4f4ad6",
    purple: "#8859d0",
    pink: "#e85cab",
    cyan: "#2aaecc",
    brown: "#9a6f4b",
  };
  return map[(name || "indigo").toLowerCase()] || map.indigo;
}
