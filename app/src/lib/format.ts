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

export type PriceLike = {
  price?: number | null;
  currency?: string | null;
  priceLabel?: string | null;
  price_label?: string | null;
  billingPeriod?: string | null;
  billing_period?: string | null;
  isPriceHidden?: boolean | null;
  is_price_hidden?: boolean | null;
  isAppointmentOnly?: boolean | null;
  is_appointment_only?: boolean | null;
  isComingSoon?: boolean | null;
  status?: string | null;
  isFree?: boolean | null;
  servicePriceType?: string | null;
  service_price_type?: string | null;
  startingPrice?: number | null;
  starting_price?: number | null;
};

export function formatCurrencyAmount(price: number | null | undefined, currency = "CNY"): string {
  const amount = Number(price ?? 0);
  const code = String(currency || "CNY").toUpperCase();
  if (code === "CNY" || code === "JPY") return `¥${Math.round(amount)}`;
  if (code === "USD") {
    return amount % 1 === 0 ? `$${amount.toFixed(0)}` : `$${amount.toFixed(2)}`;
  }
  return `${code} ${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

export function formatPrice(input: PriceLike | number | null | undefined, currency = "CNY"): string {
  if (typeof input === "number") return formatCurrencyAmount(input, currency);
  const p = input || {};
  const explicit = p.priceLabel || p.price_label;
  if (p.isComingSoon || p.status === "coming_soon") return "即将开放";
  if (p.isPriceHidden || p.is_price_hidden || p.isAppointmentOnly || p.is_appointment_only) return "预约咨询";
  if (explicit) return explicit;
  if (p.isFree) return "免费";
  const serviceType = p.servicePriceType || p.service_price_type;
  if (serviceType === "appointment_only") return "预约咨询";
  if (serviceType === "quote_required") return "按需求报价";
  if (serviceType === "free") return "免费";
  const code = p.currency || currency;
  const amount = p.price ?? 0;
  const starting = p.startingPrice ?? p.starting_price ?? amount;
  if (serviceType === "starting_from" && Number(starting) > 0) {
    return `${formatCurrencyAmount(Number(starting), code || "CNY")} 起`;
  }
  if (Number(amount) <= 0) return "";
  const suffix = p.billingPeriod || p.billing_period;
  const rendered = formatCurrencyAmount(Number(amount), code || "CNY");
  if (suffix === "monthly") return `${rendered} / 月`;
  if (suffix === "yearly") return `${rendered} / 年`;
  return rendered;
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
