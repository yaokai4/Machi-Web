// Small formatting helpers shared across the app. Kept here so they
// match the iOS App's DateFormatterUtils / NumberFormatterUtils logic.

export function compactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  const abs = Math.abs(value);
  if (abs < 1_000) return String(value);
  const sign = value < 0 ? "-" : "";
  const fmt = (div: number, unit: string) => {
    const scaled = abs / div;
    const s = scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, "") : String(Math.round(scaled));
    return `${sign}${s}${unit}`;
  };
  // Roll up to the next unit when rounding within a tier would reach 1000
  // (e.g. 999_600 -> "1M", never "1000k"; 999_600_000 -> "1B").
  if (abs < 1_000_000) return Math.round(abs / 1_000) >= 1_000 ? fmt(1_000_000, "M") : fmt(1_000, "k");
  if (abs < 1_000_000_000) return Math.round(abs / 1_000_000) >= 1_000 ? fmt(1_000_000_000, "B") : fmt(1_000_000, "M");
  return fmt(1_000_000_000, "B");
}

// Locales accepted by the time / price helpers below. Mirrors the app i18n
// `Locale` union; callers pass `useI18n().locale` so the same string reads
// three (four) languages.
export type FormatLocale = "zh-Hans" | "zh-Hant" | "en" | "ja";

const RELATIVE_COPY: Record<FormatLocale, { now: string; min: (n: number) => string; hour: (n: number) => string; day: (n: number) => string }> = {
  "zh-Hans": {
    now: "刚刚",
    min: (n) => `${n} 分钟前`,
    hour: (n) => `${n} 小时前`,
    day: (n) => `${n} 天前`,
  },
  "zh-Hant": {
    now: "剛剛",
    min: (n) => `${n} 分鐘前`,
    hour: (n) => `${n} 小時前`,
    day: (n) => `${n} 天前`,
  },
  en: {
    now: "just now",
    min: (n) => `${n}m ago`,
    hour: (n) => `${n}h ago`,
    day: (n) => `${n}d ago`,
  },
  ja: {
    now: "たった今",
    min: (n) => `${n}分前`,
    hour: (n) => `${n}時間前`,
    day: (n) => `${n}日前`,
  },
};

// Absolute-date locale tags for the Intl fallback. All pinned to Asia/Tokyo so
// the string is identical on the Node SSR pass and in the browser (avoiding a
// hydration mismatch on machines whose local timezone isn't JST).
const ABSOLUTE_LOCALE_TAG: Record<FormatLocale, string> = {
  "zh-Hans": "zh-Hans",
  "zh-Hant": "zh-Hant",
  en: "en-CA", // en-CA renders YYYY-MM-DD; stable & unambiguous
  ja: "ja-JP",
};

export function relativeTime(iso: string, locale: FormatLocale = "zh-Hans"): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const copy = RELATIVE_COPY[locale] ?? RELATIVE_COPY["zh-Hans"];
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return copy.now;
  if (diff < 3600) return copy.min(Math.floor(diff / 60));
  if (diff < 86_400) return copy.hour(Math.floor(diff / 3600));
  if (diff < 604_800) return copy.day(Math.floor(diff / 86_400));
  // Absolute date. Fix the timezone to Asia/Tokyo so SSR (server timezone) and
  // client (viewer timezone) always agree — otherwise a post near midnight can
  // render a different Y/M/D on each side and trip a hydration warning.
  try {
    return new Intl.DateTimeFormat(ABSOLUTE_LOCALE_TAG[locale] ?? "zh-Hans", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(then));
  } catch {
    const d = new Date(then);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  }
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

const PRICE_COPY: Record<FormatLocale, {
  comingSoon: string;
  appointment: string;
  quote: string;
  free: string;
  startingSuffix: (rendered: string) => string;
  monthlySuffix: (rendered: string) => string;
  yearlySuffix: (rendered: string) => string;
}> = {
  "zh-Hans": {
    comingSoon: "即将开放",
    appointment: "预约咨询",
    quote: "按需求报价",
    free: "免费",
    startingSuffix: (r) => `${r} 起`,
    monthlySuffix: (r) => `${r} / 月`,
    yearlySuffix: (r) => `${r} / 年`,
  },
  "zh-Hant": {
    comingSoon: "即將開放",
    appointment: "預約諮詢",
    quote: "依需求報價",
    free: "免費",
    startingSuffix: (r) => `${r} 起`,
    monthlySuffix: (r) => `${r} / 月`,
    yearlySuffix: (r) => `${r} / 年`,
  },
  en: {
    comingSoon: "Coming soon",
    appointment: "By appointment",
    quote: "Quote on request",
    free: "Free",
    startingSuffix: (r) => `From ${r}`,
    monthlySuffix: (r) => `${r} / mo`,
    yearlySuffix: (r) => `${r} / yr`,
  },
  ja: {
    comingSoon: "近日公開",
    appointment: "予約制",
    quote: "要見積もり",
    free: "無料",
    startingSuffix: (r) => `${r}〜`,
    monthlySuffix: (r) => `${r} / 月`,
    yearlySuffix: (r) => `${r} / 年`,
  },
};

export function formatPrice(input: PriceLike | number | null | undefined, currency = "CNY", locale: FormatLocale = "zh-Hans"): string {
  if (typeof input === "number") return formatCurrencyAmount(input, currency);
  const copy = PRICE_COPY[locale] ?? PRICE_COPY["zh-Hans"];
  const p = input || {};
  const explicit = p.priceLabel || p.price_label;
  if (p.isComingSoon || p.status === "coming_soon") return copy.comingSoon;
  if (p.isPriceHidden || p.is_price_hidden || p.isAppointmentOnly || p.is_appointment_only) return copy.appointment;
  if (explicit) return explicit;
  if (p.isFree) return copy.free;
  const serviceType = p.servicePriceType || p.service_price_type;
  if (serviceType === "appointment_only") return copy.appointment;
  if (serviceType === "quote_required") return copy.quote;
  if (serviceType === "free") return copy.free;
  const code = p.currency || currency;
  const amount = p.price ?? 0;
  const starting = p.startingPrice ?? p.starting_price ?? amount;
  if (serviceType === "starting_from" && Number(starting) > 0) {
    return copy.startingSuffix(formatCurrencyAmount(Number(starting), code || "CNY"));
  }
  if (Number(amount) <= 0) return "";
  const suffix = p.billingPeriod || p.billing_period;
  const rendered = formatCurrencyAmount(Number(amount), code || "CNY");
  if (suffix === "monthly") return copy.monthlySuffix(rendered);
  if (suffix === "yearly") return copy.yearlySuffix(rendered);
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
