"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Briefcase,
  CheckCircle2,
  FileCheck2,
  Heart,
  Home,
  MapPin,
  Play,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  X,
} from "lucide-react";
import { api, APIError, isAuthRequiredError, isUploadImageFile, isUploadVideoFile, type UploadPurpose } from "@/lib/api";
import { fallbackVideoPoster, isVideoMedia, mediaDurationLabel, mediaPreviewImageUrl, mediaSourceUrl } from "@/lib/media";
import { listingTypeRequiresMembership, type KXBusinessProfile, type KXCityListing, type KXCreateListingPayload, type KXListingInquiry, type KXListingMedia, type KXListingType, type KXMedia } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, PremiumEmptyState, SectionLoading, Skeleton } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { CITY_AREA_GROUPS, getCityBySlug, getDefaultCity } from "@/config/cities";
import {
  REGION_COUNTRIES,
  cityDisplayName,
  countryDisplayName,
  resolveRegion,
  regionDisplayName,
  regionFromUser,
  provincesFor,
  provinceDisplayName,
  citiesFor,
  composeRegionCode,
  countryByCode,
} from "@/lib/regions";
import { useI18n, appLocaleToMarketingLocale, type Locale } from "@/lib/i18n";
import {
  cleanListingText,
  compactListingFields,
  formatAdminRecordValue,
  formatInquiryStatus,
  formatInquiryType,
  formatListingAttribute,
  formatListingStatus,
  formatListingType,
  formatPrice as formatListingPrice,
  formatVerificationStatus,
  listingDetailFields,
  listingSectionForType,
} from "@/lib/listingFormat";

type ChannelKind = "marketplace" | "rentals" | "jobs" | "services" | "deals";
type ListingScope = "city" | "country";

const videoFallbackArtworkStyle: React.CSSProperties = {
  background:
    "radial-gradient(circle at 28% 18%, rgba(255,255,255,0.26), transparent 34%), linear-gradient(135deg, #0f172a 0%, #1e3a8a 54%, #0f766e 100%)",
};

const CHANNEL: Record<ChannelKind, { type: KXListingType; title: string; subtitle: string; icon: typeof Home; search: string; createLabel: string }> = {
  marketplace: { type: "secondhand", title: "二手市场", subtitle: "图片、价格、地点和交易状态清晰分离", icon: Tag, search: "搜索家具、家电、教材、电子产品、搬家出清", createLabel: "发布二手" },
  rentals: { type: "rental", title: "租房", subtitle: "租金、车站、户型、面积和入住条件结构化展示", icon: Home, search: "搜索地区、车站、学校、公司、房源关键词", createLabel: "发布房源" },
  jobs: { type: "job", title: "工作机会", subtitle: "薪资、地点、日语要求、签证支持和招聘方认证", icon: Briefcase, search: "搜索职位、公司、地点、日语要求", createLabel: "发布职位" },
  services: { type: "local_service", title: "商家与本地服务", subtitle: "点评、预约、优惠、旅行住宿、景点和生活支持", icon: Sparkles, search: "搜索餐饮点评、酒店民宿、景点门票、一日游、接送机、翻译手续", createLabel: "发布服务" },
  deals: { type: "discount", title: "优惠", subtitle: "本地商家优惠、有效期和使用规则", icon: Tag, search: "搜索优惠、折扣、商家、有效期", createLabel: "发布优惠" },
};

// ja/en header copy for each channel. zh above stays the source of truth;
// localizedChannel() overlays these per the active locale so every
// `spec.title` usage keeps working untouched.
const CHANNEL_TEXT: Record<ChannelKind, Record<"title" | "subtitle" | "search" | "createLabel", { ja: string; en: string }>> = {
  marketplace: {
    title: { ja: "フリマ", en: "Marketplace" },
    subtitle: { ja: "写真・価格・場所・取引状況をすっきり整理", en: "Photos, price, location and deal status at a glance" },
    search: { ja: "家具・家電・教材・電子機器・引越し処分を検索", en: "Search furniture, appliances, textbooks, electronics…" },
    createLabel: { ja: "出品する", en: "Sell an item" },
  },
  rentals: {
    title: { ja: "賃貸", en: "Rentals" },
    subtitle: { ja: "家賃・駅・間取り・面積・入居条件を構造化して表示", en: "Rent, station, layout, size and move-in terms, structured" },
    search: { ja: "エリア・駅・学校・会社・物件キーワードを検索", en: "Search area, station, school, company, keywords" },
    createLabel: { ja: "物件を掲載", en: "Post a rental" },
  },
  jobs: {
    title: { ja: "求人", en: "Jobs" },
    subtitle: { ja: "給与・場所・日本語レベル・ビザサポート・採用元認証", en: "Salary, location, Japanese level, visa support, verified employers" },
    search: { ja: "職種・会社・場所・日本語レベルを検索", en: "Search roles, companies, locations, Japanese level" },
    createLabel: { ja: "求人を掲載", en: "Post a job" },
  },
  services: {
    title: { ja: "店舗・地域サービス", en: "Businesses & local services" },
    subtitle: { ja: "口コミ、予約、特典、宿泊、観光、生活サポート", en: "Reviews, bookings, deals, stays, attractions and local support" },
    search: { ja: "飲食、宿泊、観光チケット、送迎、翻訳、手続きを検索", en: "Search dining, stays, attraction tickets, transfers, paperwork…" },
    createLabel: { ja: "サービスを掲載", en: "Offer a service" },
  },
  deals: {
    title: { ja: "クーポン", en: "Deals" },
    subtitle: { ja: "地元店舗の特典・有効期限・利用条件", en: "Local merchant deals, validity and usage rules" },
    search: { ja: "特典・割引・店舗・有効期限を検索", en: "Search deals, discounts, merchants, validity" },
    createLabel: { ja: "特典を掲載", en: "Post a deal" },
  },
};

/// Tiny inline trilingual pick for one-off UI strings in this kit.
function pickText(locale: Locale, zh: string, ja: string, en: string): string {
  const marketing = appLocaleToMarketingLocale(locale);
  return marketing === "ja" ? ja : marketing === "en" ? en : zh;
}

function localizedChannel(kind: ChannelKind, locale: Locale) {
  const base = CHANNEL[kind];
  const marketing = appLocaleToMarketingLocale(locale);
  if (marketing === "zh") return base;
  const text = CHANNEL_TEXT[kind];
  return {
    ...base,
    title: text.title[marketing],
    subtitle: text.subtitle[marketing],
    search: text.search[marketing],
    createLabel: text.createLabel[marketing],
  };
}

const CATEGORY_CHIPS: Record<KXListingType, string[]> = {
  secondhand: ["全部", "家具", "家电", "电子产品", "教材", "衣物", "生活用品", "搬家出清", "免费送", "求购"],
  rental: ["全部", "单人", "合租", "短租", "整租", "家具家电", "近车站"],
  job: ["全部", "兼职", "全职", "时给", "月给", "无经验可", "留学生可", "签证支持", "周末"],
  hiring: ["全部", "兼职", "全职", "派遣", "实习", "签证支持"],
  local_service: ["全部", "餐饮点评", "优惠预约", "酒店民宿", "景点门票", "一日游", "接送机", "翻译手续", "搬家清洁", "维修安装", "认证服务"],
  discount: ["全部", "餐饮", "生活", "学习", "搬家", "限时"],
  event: ["全部", "今天", "本周", "周末", "免费"],
};

// Display-only translations for the category chips. The zh value is the
// CANONICAL wire/storage format (listings store and filter by it — see
// `category = ?` in server.py), so only the label localizes, never the
// value sent to the API.
const CATEGORY_LABELS: Record<string, { ja: string; en: string }> = {
  "全部": { ja: "すべて", en: "All" },
  "家具": { ja: "家具", en: "Furniture" },
  "家电": { ja: "家電", en: "Appliances" },
  "电子产品": { ja: "電子機器", en: "Electronics" },
  "教材": { ja: "教材", en: "Textbooks" },
  "衣物": { ja: "衣類", en: "Clothing" },
  "生活用品": { ja: "生活用品", en: "Daily goods" },
  "搬家出清": { ja: "引越し処分", en: "Moving sale" },
  "免费送": { ja: "無料譲渡", en: "Free giveaway" },
  "求购": { ja: "買います", en: "Wanted" },
  "单人": { ja: "一人暮らし", en: "Single" },
  "合租": { ja: "ルームシェア", en: "Roomshare" },
  "短租": { ja: "短期", en: "Short-term" },
  "整租": { ja: "まるごと賃貸", en: "Entire place" },
  "家具家电": { ja: "家具家電付き", en: "Furnished" },
  "近车站": { ja: "駅近", en: "Near station" },
  "兼职": { ja: "アルバイト", en: "Part-time" },
  "全职": { ja: "正社員", en: "Full-time" },
  "派遣": { ja: "派遣", en: "Temp agency" },
  "实习": { ja: "インターン", en: "Internship" },
  "时给": { ja: "時給", en: "Hourly pay" },
  "月给": { ja: "月給", en: "Monthly pay" },
  "无经验可": { ja: "未経験OK", en: "No experience" },
  "留学生可": { ja: "留学生OK", en: "Students OK" },
  "签证支持": { ja: "ビザサポート", en: "Visa support" },
  "周末": { ja: "週末", en: "Weekend" },
  "搬家": { ja: "引越し", en: "Moving" },
  "签证": { ja: "ビザ", en: "Visa" },
  "维修": { ja: "修理", en: "Repair" },
  "翻译": { ja: "翻訳", en: "Translation" },
  "清洁": { ja: "清掃", en: "Cleaning" },
  "餐饮点评": { ja: "飲食口コミ", en: "Dining reviews" },
  "优惠预约": { ja: "予約特典", en: "Deals & booking" },
  "酒店民宿": { ja: "ホテル・民泊", en: "Hotels & stays" },
  "景点门票": { ja: "観光チケット", en: "Attraction tickets" },
  "一日游": { ja: "日帰りツアー", en: "Day trips" },
  "接送机": { ja: "空港送迎", en: "Airport transfer" },
  "翻译手续": { ja: "翻訳・手続き", en: "Translation & paperwork" },
  "搬家清洁": { ja: "引越し・清掃", en: "Moving & cleaning" },
  "维修安装": { ja: "修理・設置", en: "Repair & installation" },
  "认证服务": { ja: "認定サービス", en: "Verified services" },
  "餐饮": { ja: "飲食", en: "Dining" },
  "生活": { ja: "生活", en: "Living" },
  "学习": { ja: "学習", en: "Study" },
  "限时": { ja: "期間限定", en: "Limited-time" },
  "今天": { ja: "今日", en: "Today" },
  "本周": { ja: "今週", en: "This week" },
  "免费": { ja: "無料", en: "Free" },
};

/// zh stays as-is (canonical); ja/en translate when we know the value;
/// unknown (user-typed) categories fall back to the raw value.
export function categoryLabel(value: string, locale: Locale): string {
  if (locale === "ja") return CATEGORY_LABELS[value]?.ja ?? value;
  if (locale === "en") return CATEGORY_LABELS[value]?.en ?? value;
  return value;
}

function listingUploadPurpose(type: KXListingType, isVideo: boolean): UploadPurpose {
  if (type === "rental") return isVideo ? "rental_video" : "rental_image";
  if (type === "job" || type === "hiring") return isVideo ? "job_video" : "job_image";
  if (type === "local_service") return isVideo ? "service_video" : "service_image";
  if (type === "discount" || type === "event") return isVideo ? "discount_video" : "discount_image";
  return isVideo ? "secondhand_video" : "secondhand_image";
}

function listingImageLimit(type: KXListingType): number {
  if (type === "rental") return 20;
  if (type === "job" || type === "hiring" || type === "discount" || type === "event") return 5;
  return 10;
}

async function readListingVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (result: { duration: number; width: number; height: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    // Some containers/codecs never fire loadedmetadata (and not always onerror
    // either); without a timeout the whole upload stalls at "准备上传".
    const timeout = window.setTimeout(() => done({ duration: 0, width: 0, height: 0 }), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => done({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
    });
    video.onerror = () => done({ duration: 0, width: 0, height: 0 });
    video.src = url;
  });
}

type ListingVideoPoster = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type UploadProgressEntry = {
  name: string;
  progress: number;
  status: string;
  error?: string;
  file?: File;
  previewUrl?: string;
};

function posterFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "video";
  return `${base}-poster.jpg`;
}

async function captureListingVideoPoster(file: File): Promise<ListingVideoPoster | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const cleanup = (result: ListingVideoPoster | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeout = window.setTimeout(() => cleanup(null), 9000);
    const finish = () => {
      window.clearTimeout(timeout);
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (!width || !height) {
        cleanup(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        cleanup(null);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          cleanup(null);
          return;
        }
        const poster = new File([blob], posterFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
        cleanup({ file: poster, previewUrl: URL.createObjectURL(blob), width, height });
      }, "image/jpeg", 0.84);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 1 ? 1 : duration > 0.2 ? 0.1 : 0;
      if (Math.abs(video.currentTime - target) < 0.02) {
        finish();
        return;
      }
      video.currentTime = target;
    };
    video.onseeked = finish;
    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup(null);
    };
    video.src = url;
  });
}

type FilterOption = { value: string; label: string };
type AttributeField = {
  key: string;
  label: string;
  required?: boolean;
  kind?: "text" | "select" | "checkbox" | "textarea";
  placeholder?: string;
  options?: FilterOption[];
};

export function CityListingChannelPage({ citySlug, kind }: { citySlug: string; kind: ChannelKind }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const city = getCityBySlug(citySlug) || getDefaultCity();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [sort, setSort] = useState("latest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<ListingScope>("city");
  const { locale } = useI18n();
  const spec = localizedChannel(kind, locale);
  const scopeCountry = city.regionCode.split(".")[0] || "jp";
  const scopeCountrySpec = countryByCode(scopeCountry);
  const scopeCountryName = scopeCountrySpec ? countryDisplayName(scopeCountrySpec, locale) : "当前国家";
  const scopedCity = getCityBySlug(filters.scope_city || "");
  const scopedArea = CITY_AREA_GROUPS.find((group) => group.slug === filters.scope_area);

  const listings = useQuery({
    queryKey: ["listings", city.slug, kind, spec.type, category, sort, query, scope, filters.scope_area || "", filters.scope_city || "", JSON.stringify(filters)],
    queryFn: async () => {
      const scoped = scopedCity
        ? { city_slug: scopedCity.slug }
        : scopedArea
          ? { city_slugs: scopedArea.cities.join(",") }
          : scope === "country"
            ? { country: scopeCountry }
            : { city_slug: city.slug };
      const shared = { ...scoped, category, sort, q: query, min_price: filters.min_price, max_price: filters.max_price };
      if (kind !== "jobs") return api.listings({ ...shared, type: spec.type });
      const [jobs, hiring] = await Promise.all([
        api.listings({ ...shared, type: "job" }),
        api.listings({ ...shared, type: "hiring" }),
      ]);
      return {
        items: [...jobs.items, ...hiring.items].sort(sortListings),
        next_cursor: jobs.next_cursor || hiring.next_cursor,
        type: spec.type,
      };
    },
    staleTime: 30_000,
  });
  const applySearch = (value: string) => {
    const nextQuery = value.trim();
    if (nextQuery !== query) {
      setQuery(nextQuery);
      return;
    }
    listings.refetch();
  };
  const visibleItems = (listings.data?.items || []).filter((item) => matchesListingFilters(item, filters));
  const activeFilterCount = Object.values(filters).filter((value) => String(value || "").trim()).length;

  return (
    <AppShell requireAuth={false} wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-3">
        <div className="relative flex items-center gap-2 pr-12 sm:pr-0">
          <Link href="/explore" className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white">
            <spec.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black text-slate-950">{city.name} · {spec.title}</h1>
            <p className="truncate text-xs font-semibold text-slate-500">{spec.subtitle}</p>
          </div>
          <Link href="/notifications" className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-kx-soft sm:grid">
            <Bell className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => (user ? window.location.assign(`/listings/create?type=${spec.type}&city=${city.slug}`) : openAuthPrompt("publish"))}
            className="absolute right-0 top-0 inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-blue-600 text-sm font-bold text-white shadow-[0_12px_28px_-18px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 sm:static sm:w-auto sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{spec.createLabel}</span>
          </button>
        </div>
        <form
          className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 text-sm shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch(String(new FormData(event.currentTarget).get("q") || ""));
          }}
        >
          <Search className="h-4 w-4 text-blue-600" />
          <input
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applySearch(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
            placeholder={spec.search}
          />
        </form>
      </header>

      <main className="px-3 py-4 sm:px-4">
        <section className="mx-auto min-w-0 max-w-6xl">
          <section className="mb-4 rounded-[24px] border border-slate-200/70 bg-white/95 p-3 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.55)] ring-1 ring-white/75 sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setScope("city")}
                  data-active={scope === "city"}
                  className="h-9 rounded-full px-3 text-sm font-black text-slate-500 transition data-[active=true]:bg-white data-[active=true]:text-slate-950 data-[active=true]:shadow-sm"
                >
                  {city.name}
                </button>
                <button
                  type="button"
                  onClick={() => setScope("country")}
                  data-active={scope === "country"}
                  className="h-9 rounded-full px-3 text-sm font-black text-slate-500 transition data-[active=true]:bg-white data-[active=true]:text-slate-950 data-[active=true]:shadow-sm"
                >
                  {scopeCountryName}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((value) => !value)}
                data-active={filtersOpen}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-700 data-[active=true]:border-blue-300 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700"
              >
                <SlidersHorizontal className="h-4 w-4" />
                筛选
                {activeFilterCount ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[11px] leading-none text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none transition hover:border-blue-300 focus:border-blue-400">
                <option value="latest">{pickText(locale, "最新发布", "新着順", "Newest")}</option>
                <option value="price_asc">{spec.type === "rental" ? pickText(locale, "租金从低到高", "家賃が安い順", "Rent: low → high") : pickText(locale, "价格从低到高", "価格が安い順", "Price: low → high")}</option>
                <option value="price_desc">{spec.type === "rental" ? pickText(locale, "租金从高到低", "家賃が高い順", "Rent: high → low") : pickText(locale, "价格从高到低", "価格が高い順", "Price: high → low")}</option>
                <option value="popular">{pickText(locale, "最多收藏", "人気順", "Most saved")}</option>
              </select>
              <p className="ml-auto hidden text-xs font-bold text-slate-400 sm:block">
                {visibleItems.length
                  ? pickText(locale, `${visibleItems.length} 条结果`, `${visibleItems.length} 件`, `${visibleItems.length} results`)
                  : pickText(locale, "暂无结果", "結果なし", "No results")}
              </p>
              </div>
              <div className="-mx-1 min-w-0 overflow-x-auto px-1">
                <div className="flex gap-2 pb-0.5">
                  {(CATEGORY_CHIPS[spec.type] || ["全部"]).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setCategory(chip)}
                      data-active={category === chip}
                      className="h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-600 transition data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white hover:border-blue-300 hover:text-blue-700"
                    >
                      {categoryLabel(chip, locale)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filtersOpen ? (
              <div className="mt-3 border-t border-slate-200/70 pt-3">
                <ListingFilterPanel type={spec.type} currentCitySlug={city.slug} filters={filters} onChange={setFilters} variant="inline" />
              </div>
            ) : null}
          </section>

          {listings.isLoading ? (
            <div className="space-y-3">
              <SectionLoading title={`正在加载${city.name}${spec.title}`} rows={1} />
              <ListingSkeletonGrid type={spec.type} />
            </div>
          ) : listings.isError ? (
            <section className="rounded-2xl bg-white p-5">
              <ErrorState title="频道暂时无法加载" subtitle="网络或服务器暂时不可用，请稍后重试。" onRetry={() => listings.refetch()} />
            </section>
          ) : visibleItems.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
              {visibleItems.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}
            </div>
          ) : (
            <ListingEmptyState type={spec.type} cityName={city.name} />
          )}
        </section>
      </main>
    </AppShell>
  );
}

export function ListingDetailPage({ listingId }: { listingId: string }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [intakeOpen, setIntakeOpen] = useState(false);
  const listing = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => api.listing(listingId),
  });
  const favorite = useMutation({
    mutationFn: async () => {
      if (!listing.data) return;
      await api.favoriteListing(listing.data.id, !listing.data.favorited);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listing", listingId] }),
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("generic");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  const contact = useMutation({
    mutationFn: (vars: { message: string; details: { label: string; value: string }[] }) =>
      api.contactListing(listingId, vars.message || "我想了解这条信息。", undefined, vars.details),
    onSuccess: (res) => {
      setIntakeOpen(false);
      pushToast({ kind: "success", message: res.message || "已发送联系请求" });
      const convId = res.conversation_id || res.conversationId;
      if (convId) router.push(`/messages/${convId}`);
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("message");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  const openIntake = () => (user ? setIntakeOpen(true) : openAuthPrompt("message"));
  const report = useMutation({
    mutationFn: () => api.reportListing(listingId, "suspicious", "用户从详情页举报"),
    onSuccess: () => pushToast({ kind: "success", message: "已提交举报，后台会审核。" }),
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });

  if (listing.isLoading) return <AppShell requireAuth={false}><main className="p-4"><Skeleton className="h-[520px] rounded-3xl" /></main></AppShell>;
  if (listing.isError || !listing.data) return <AppShell requireAuth={false}><main className="p-4"><ErrorState title="信息不存在或已下架" onRetry={() => listing.refetch()} /></main></AppShell>;
  const item = listing.data;
  const displayTitle = displayListingTitle(item) || item.title;
  const cityName = cityLabel(item.city_slug);
  return (
    <AppShell requireAuth={false} hideBottomNav right={<DetailContactCard item={item} onContact={openIntake} />}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={listingBackHref(item)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">{cityName} · {listingTypeLabel(item.type)}</p>
            <h1 className="truncate text-lg font-black text-slate-950">{displayTitle}</h1>
          </div>
          <button type="button" onClick={() => favorite.mutate()} className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-kx-soft">
            <Heart className={`h-4 w-4 ${item.favorited ? "fill-rose-500 text-rose-500" : "text-slate-700"}`} />
          </button>
        </div>
      </header>
      <main className="px-3 py-4 sm:px-4">
        <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_14px_42px_rgba(15,23,42,0.06)]">
          <div className="grid gap-2 bg-slate-100 p-2 sm:grid-cols-2">
            {(item.media.length ? item.media : listingCoverMedia(item) ? [listingCoverMedia(item)!] : [{ id: "cover", listing_id: item.id, media_type: "image", url: listingCoverPreview(item), sort_order: 0, is_cover: true } satisfies KXListingMedia]).slice(0, 4).map((media, index) => (
              <div key={media.id || index} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200">
                {isVideoMedia(media) ? (
                  mediaSourceUrl(media) ? (
                    <video
                      src={mediaSourceUrl(media)}
                      poster={mediaPreviewImageUrl(media) || fallbackVideoPoster}
                      preload="metadata"
                      controls
                      playsInline
                      className="h-full w-full bg-slate-950 object-contain"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-slate-950 text-white">
                      <Play className="h-8 w-8 fill-current" />
                    </span>
                  )
                ) : mediaPreviewImageUrl(media) ? (
                  <Image src={mediaPreviewImageUrl(media)} alt={displayTitle} fill sizes="(max-width: 768px) 50vw, 360px" className="object-cover" unoptimized />
                ) : (
                  <span className="absolute inset-0 bg-slate-100" />
                )}
              </div>
            ))}
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-3xl font-black text-slate-950">{priceLabel(item)}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{displayTitle}</h2>
                <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-500"><MapPin className="h-4 w-4" />{cleanListingText(item.location_text) || cityName}</p>
              </div>
              <StatusBadge item={item} />
            </div>
            <AttributeGrid item={item} />
            <div className="mt-5 whitespace-pre-line text-[15px] leading-7 text-slate-700">{item.description || "发布者暂未填写详细描述。"}</div>
            <SellerBox item={item} />
            <SafetyNotice type={item.type} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => report.mutate()} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-bold text-slate-600">
                <AlertTriangle className="h-4 w-4" />
                举报
              </button>
              <button
                type="button"
                onClick={async () => {
                  const url = typeof window !== "undefined" ? window.location.href : "";
                  if (typeof navigator !== "undefined" && navigator.share) {
                    try { await navigator.share({ title: item.title, url }); } catch { /* user cancelled */ }
                  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(url);
                    pushToast({ kind: "success", message: "链接已复制" });
                  }
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-bold text-slate-600"
              >
                分享
              </button>
            </div>
          </div>
        </section>
      </main>
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/90 px-3 pt-3 shadow-[0_-12px_40px_-24px_rgba(15,23,42,0.4)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-slate-950/85"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={openIntake}
          className="h-12 w-full rounded-full bg-slate-950 text-sm font-black text-white shadow-[0_16px_34px_-18px_rgba(15,23,42,0.9)] transition active:scale-[0.99] dark:bg-white dark:text-slate-950"
        >
          {contactActionLabel(item)}
        </button>
      </div>
      <IntakeSheet
        item={item}
        open={intakeOpen}
        submitting={contact.isPending}
        onClose={() => setIntakeOpen(false)}
        onSubmit={(msg, details) => contact.mutate({ message: msg, details })}
      />
    </AppShell>
  );
}

export function CreateListingPage({ initialType = "secondhand", initialCitySlug = "tokyo" }: { initialType?: string; initialCitySlug?: string } = {}) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();
  const { locale } = useI18n();
  const [type, setType] = useState<KXListingType>(normalizeListingType(initialType));
  const userRegion = useMemo(
    () => regionFromUser(user),
    [user],
  );
  const initialRegionCode = userRegion?.region_code || getCityBySlug(cleanListingText(initialCitySlug))?.regionCode || "jp.tokyo.tokyo";
  const [country, setCountry] = useState<string>(() => resolveRegion(initialRegionCode)?.country_code || "jp");
  const [regionCode, setRegionCode] = useState<string>(initialRegionCode);
  const [regionSource, setRegionSource] = useState<"account" | "ip" | "fallback" | "initial">("initial");
  const [regionEditing, setRegionEditing] = useState(false);
  const selectedRegion = resolveRegion(regionCode);
  const citySlug = selectedRegion?.city_code || "tokyo";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<KXMedia[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressEntry>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());
  const draftKey = `machi.listingDraft.${type}.${regionCode}`;
  const createLabel = type === "rental" || type === "job" || type === "hiring" || type === "local_service" ? "提交审核" : "发布";
  const createFields = useMemo(() => listingFormFields(type), [type]);
  const imageLimit = listingImageLimit(type);
  const mediaLimit = imageLimit;
  const membershipRequired = listingTypeRequiresMembership(type);
  const membershipChannelLabel = type === "rental" ? "租房" : type === "job" || type === "hiring" ? "招聘" : "本地商家/服务";
  const membershipBlocked = membershipRequired && !user?.is_verified_member;

  const rememberLocalPreviewUrl = (url: string) => {
    if (url.startsWith("blob:")) localPreviewUrlsRef.current.add(url);
    return url;
  };

  useEffect(() => () => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (userRegion) {
      setCountry(userRegion.country_code);
      setRegionCode(userRegion.region_code);
      setRegionSource("account");
      return;
    }
    let cancelled = false;
    api.detectRegion()
      .then((region) => {
        if (cancelled || !region.region_code) return;
        const resolved = resolveRegion(region.region_code);
        if (!resolved) return;
        setCountry(resolved.country_code);
        setRegionCode(resolved.region_code);
        setRegionSource(region.source || "fallback");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userRegion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { title?: string; description?: string; category?: string; price?: string; location?: string; attributes?: Record<string, string> };
      setTitle(draft.title || "");
      setDescription(draft.description || "");
      setCategory(draft.category || "");
      setPrice(draft.price || "");
      setLocation(draft.location || "");
      setAttributes(draft.attributes || {});
    } catch {
      // local draft corruption should not block publishing
    }
  }, [draftKey]);

  const saveDraft = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, JSON.stringify({ title, description, category, price, location, attributes }));
    setDraftSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    pushToast({ kind: "success", message: "草稿已保存" });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "请填写标题";
    if (!category.trim()) next.category = "请选择或填写分类";
    if (!location.trim()) next.location = "请填写展示地点或区域";
    if ((type === "secondhand" || type === "rental" || type === "job" || type === "hiring") && !price.trim()) next.price = type === "rental" ? "请填写月租" : type === "secondhand" ? "请填写价格，免费送可填 0" : "请填写薪资";
    if (price.trim() && Number.isNaN(Number(price))) next.price = "金额只能填写数字";
    createFields.forEach((field) => {
      if (field.required && !String(attributes[field.key] || "").trim()) next[field.key] = `请填写${field.label}`;
    });
    if (!description.trim()) next.description = "请补充描述，说明条件、范围和风险信息";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const upload = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      const selected = Array.from(files);
      if (!user) {
        throw new APIError({ code: "AUTH_REQUIRED", message: "请先登录后再上传媒体。" }, 401);
      }
      const uploaded: KXMedia[] = [];
      let imageCount = media.filter((item) => !isVideoMedia(item)).length;
      let videoCount = media.filter(isVideoMedia).length;
      let mediaCount = media.length;
      for (const file of selected) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        setUploadProgress((current) => ({ ...current, [key]: { name: file.name, progress: 0, status: "准备上传", file } }));
        const isVideo = isUploadVideoFile(file);
        const isImage = isUploadImageFile(file);
        if (!isImage && !isVideo) {
          setUploadProgress((current) => ({ ...current, [key]: { name: file.name, progress: 0, status: "失败", error: "仅支持图片和视频文件", file } }));
          continue;
        }
        if (mediaCount >= mediaLimit) {
          setUploadProgress((current) => ({ ...current, [key]: { name: file.name, progress: 0, status: "失败", error: `媒体最多上传 ${mediaLimit} 个，其中最多 1 个视频`, file } }));
          continue;
        }
        if (isVideo && videoCount >= 1) {
          setUploadProgress((current) => ({ ...current, [key]: { name: file.name, progress: 0, status: "失败", error: "每条信息最多上传 1 个视频", file } }));
          continue;
        }
        if (isImage && imageCount >= imageLimit) {
          setUploadProgress((current) => ({ ...current, [key]: { name: file.name, progress: 0, status: "失败", error: `图片最多上传 ${imageLimit} 张`, file } }));
          continue;
        }
        try {
          const videoMeta = isVideo ? await readListingVideoMetadata(file) : { duration: 0, width: 0, height: 0 };
          if (isVideo && videoMeta.duration > (type === "rental" ? 600 : 300)) {
            throw new APIError({ code: "video_duration_too_long", message: type === "rental" ? "房源视频最长 10 分钟" : "视频最长 5 分钟" }, 400);
          }
          let posterFileId = "";
          let posterUrl = "";
          let localPosterUrl = "";
          if (isVideo) {
            setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress: 0.05, status: "生成封面", file } }));
            const poster = await captureListingVideoPoster(file);
            if (poster) {
              localPosterUrl = rememberLocalPreviewUrl(poster.previewUrl);
              setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress: 0.08, status: "上传封面", file, previewUrl: localPosterUrl } }));
              const posterUpload = await api.uploadFile(poster.file, {
                purpose: "video_thumbnail",
                entityType: "video",
                width: poster.width,
                height: poster.height,
                metadata: { sourceVideoName: file.name },
                onProgress: (event) => {
                  const progress = event.stage === "success" ? 0.22 : 0.08 + Math.min(0.12, event.progress * 0.12);
                  const status = event.stage === "complete" ? "确认封面" : event.stage === "success" ? "封面完成" : "上传封面";
                  setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress, status, file, previewUrl: localPosterUrl } }));
                },
              });
              posterFileId = posterUpload.file.id;
              posterUrl = mediaPreviewImageUrl(posterUpload.media) || mediaSourceUrl(posterUpload.media) || localPosterUrl;
            }
          }
          const uploadedMedia = await api.uploadMediaBase64(file, {
            purpose: listingUploadPurpose(type, isVideo),
            entityType: "listing",
            duration: videoMeta.duration,
            width: videoMeta.width,
            height: videoMeta.height,
            metadata: isVideo ? {
              durationSeconds: videoMeta.duration,
              thumbnailFileId: posterFileId,
              thumbnail_file_id: posterFileId,
              posterFileId,
            } : {},
            onProgress: (event) => {
              const status = event.stage === "uploading" ? "上传中" : event.stage === "complete" ? "确认中" : event.stage === "success" ? "已完成" : "准备上传";
              const base = isVideo ? 0.22 : 0;
              const span = isVideo ? 0.78 : 1;
              setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress: base + event.progress * span, status, file, previewUrl: localPosterUrl || current[key]?.previewUrl } }));
            },
          });
          uploaded.push(isVideo ? {
            ...uploadedMedia,
            thumbnailUrl: uploadedMedia.thumbnailUrl || uploadedMedia.thumbnail_url || posterUrl,
            thumbnail_url: uploadedMedia.thumbnail_url || uploadedMedia.thumbnailUrl || posterUrl,
            thumbUrl: uploadedMedia.thumbUrl || uploadedMedia.thumbnailUrl || posterUrl,
            thumb_url: uploadedMedia.thumb_url || uploadedMedia.thumbnail_url || posterUrl,
            posterUrl: uploadedMedia.posterUrl || uploadedMedia.poster_url || posterUrl,
            poster_url: uploadedMedia.poster_url || uploadedMedia.posterUrl || posterUrl,
          } : uploadedMedia);
          if (isVideo) videoCount += 1;
          else imageCount += 1;
          mediaCount += 1;
          setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress: 1, status: "已完成", file, previewUrl: localPosterUrl || current[key]?.previewUrl } }));
        } catch (err) {
          setUploadProgress((current) => ({ ...current, [key]: { ...current[key], name: file.name, progress: current[key]?.progress || 0, status: "失败", error: (err as APIError).message, file } }));
        }
      }
      return uploaded;
    },
    onSuccess: (items) => {
      setMedia((current) => [...current, ...items].slice(0, mediaLimit));
      if (items.length) pushToast({ kind: "success", message: "媒体已上传" });
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("publish");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  const create = useMutation({
    mutationFn: () => {
      if (!validate()) throw new APIError({ code: "invalid_form", message: "请先补齐必填项。" }, 400);
      if (membershipBlocked) throw new APIError({ code: "MEMBERSHIP_REQUIRED", message: `发布${membershipChannelLabel}信息需要开通 Machi 会员。` }, 403);
      if (upload.isPending) throw new APIError({ code: "upload_in_progress", message: "媒体仍在上传，请稍等完成后再发布。" }, 400);
      const failedUpload = Object.values(uploadProgress).find((item) => item.error);
      if (failedUpload) throw new APIError({ code: "upload_failed", message: "有媒体上传失败，请删除或重新选择后再发布。" }, 400);
      const mediaIds = media.map((item) => item.id);
      const payload: KXCreateListingPayload = {
        type,
        city_slug: citySlug,
        country_code: country,
        region_code: regionCode,
        title,
        description,
        category,
        price: price ? Number(price) : null,
        currency: "JPY",
        price_type: defaultPriceType(type),
        location_text: location,
        contact_method: "app_message",
        attributes,
        media_ids: mediaIds,
        mediaIds,
        cover_media_id: mediaIds[0],
        coverMediaId: mediaIds[0],
      };
      return api.createListing(payload);
    },
    onSuccess: (listing) => {
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
      pushToast({ kind: "success", message: listing.status === "pending_review" ? "已提交管理员审核，审核时间一般在 1 天内，通过后会自动展示，可在「我的发布」查看。" : "发布成功，三端会同步展示。" });
      router.push(listing.status === "pending_review" ? "/my/listings" : detailHref(listing));
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("publish");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });

  return (
    <AppShell requireAuth={false}>
      <main className="px-3 py-4 sm:px-4">
        <section className="rounded-[30px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_58px_-40px_rgba(15,23,42,0.52)] backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/explore" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <h1 className="text-2xl font-black text-slate-950">发布城市信息</h1>
              <p className="text-sm font-semibold text-slate-500">日常动态留在首页；二手、租房、工作、商家与本地服务和优惠会进入各自的城市频道。</p>
            </div>
          </div>
          <div className="mt-5 grid gap-5">
            <section>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">选择发布类型</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {(["secondhand", "rental", "job", "hiring", "local_service", "discount"] as KXListingType[]).map((value) => (
                <button key={value} type="button" onClick={() => { setType(value); setFieldErrors({}); }} data-active={type === value} className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:-translate-y-px hover:border-blue-200 hover:text-blue-700 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white">
                  {listingTypeLabel(value)}
                </button>
              ))}
              </div>
            </section>

            {membershipRequired ? (
              <section className="flex flex-col gap-3 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-blue-600 shadow-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-black text-slate-950">{membershipChannelLabel}发布需要 Machi 会员</p>
                    <p className="mt-1 font-semibold text-slate-600">会员每月可免费发布 3 条{membershipChannelLabel}信息；提交后会按频道规则进入审核或展示。</p>
                  </div>
                </div>
                {membershipBlocked ? (
                  <Link href="/membership" className="h-10 shrink-0 rounded-full bg-blue-600 px-4 text-center text-sm font-black leading-10 text-white shadow-[0_10px_24px_-16px_rgba(37,99,235,0.8)]">
                    开通会员
                  </Link>
                ) : (
                  <span className="h-10 shrink-0 rounded-full bg-white px-4 text-center text-sm font-black leading-10 text-blue-700">会员可发布</span>
                )}
              </section>
            ) : null}

            <section className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4">
              <p className="mb-3 text-sm font-black text-slate-950">基础信息</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="发布地区" required>
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-lg">
                        {selectedRegion?.country_emoji || "🌐"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-950">
                          {selectedRegion ? regionDisplayName(selectedRegion, locale) : regionCode}
                        </div>
                        <div className="truncate text-xs font-semibold text-slate-500">
                          {regionSource === "account" ? "已根据账号当前地区自动选择" : regionSource === "ip" ? "已根据当前位置粗略自动选择" : "已使用默认城市，可手动更改"}
                        </div>
                      </div>
                      <button type="button" className="h-8 shrink-0 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-600" onClick={() => setRegionEditing((v) => !v)}>
                        {regionEditing ? "收起" : "更改"}
                      </button>
                    </div>
                    {regionEditing ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <select
                          value={country}
                          onChange={(e) => {
                            const nextCountry = e.target.value;
                            setCountry(nextCountry);
                            const first = publishCityGroups(nextCountry, locale)[0]?.cities[0]?.code;
                            if (first) setRegionCode(first);
                            setRegionSource("fallback");
                          }}
                          className="kx-input h-10"
                        >
                          {REGION_COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.emoji} {countryDisplayName(c, locale)}</option>
                          ))}
                        </select>
                        <select
                          value={regionCode}
                          onChange={(e) => {
                            setRegionCode(e.target.value);
                            setRegionSource("fallback");
                          }}
                          className="kx-input h-10"
                        >
                          {publishCityGroups(country, locale).map((group) => (
                            group.province ? (
                              <optgroup key={group.province} label={group.province}>
                                {group.cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                              </optgroup>
                            ) : (
                              group.cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)
                            )
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </Field>
                <Field label="分类" required error={fieldErrors.category}>
                  <input value={category} onChange={(e) => { setCategory(e.target.value); clearFieldError(setFieldErrors, "category"); }} className="kx-input h-11" placeholder={categoryPlaceholder(type)} />
                </Field>
                <Field label={type === "job" || type === "hiring" ? "职位标题" : type === "local_service" ? "服务标题" : type === "discount" ? "优惠标题" : "标题"} required error={fieldErrors.title}>
                  <input value={title} onChange={(e) => { setTitle(e.target.value); clearFieldError(setFieldErrors, "title"); }} className="kx-input h-11" placeholder={titlePlaceholder(type)} />
                </Field>
                <Field label={priceFieldLabel(type)} required={type !== "discount"} error={fieldErrors.price}>
                  <input value={price} onChange={(e) => { setPrice(e.target.value.replace(/[^\d.]/g, "")); clearFieldError(setFieldErrors, "price"); }} className="kx-input h-11" placeholder={pricePlaceholder(type)} inputMode="decimal" />
                </Field>
                <Field label="展示地点 / 区域" required error={fieldErrors.location}>
                  <input value={location} onChange={(e) => { setLocation(e.target.value); clearFieldError(setFieldErrors, "location"); }} className="kx-input h-11" placeholder="新宿站附近 / 丰岛区 / 仙台站西口" />
                </Field>
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200/70 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">图片与视频</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">最多 {mediaLimit} 个媒体，其中最多 1 个视频，第一项作为封面；视频会自动截取首帧封面。</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      openAuthPrompt("publish");
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={upload.isPending || media.length >= mediaLimit}
                  className="h-10 rounded-full bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50"
                >
                  {upload.isPending ? "上传中..." : "添加媒体"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    if (!user) {
                      openAuthPrompt("publish");
                      event.currentTarget.value = "";
                      return;
                    }
                    // FileList is a live collection — clearing input.value empties it
                    // before the async mutation reads it. Snapshot to File[] first.
                    const files = Array.from(event.target.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) upload.mutate(files);
                  }}
                />
              </div>
              {media.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {media.map((item, index) => (
                    <div key={item.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                      {mediaPreviewImageUrl(item) ? <Image src={mediaPreviewImageUrl(item)} alt={`上传媒体 ${index + 1}`} fill sizes="128px" className="object-cover" unoptimized /> : null}
                      {isVideoMedia(item) ? (
                        <span className={`absolute inset-0 grid place-items-center text-white ${mediaPreviewImageUrl(item) ? "bg-black/15" : "bg-slate-900"}`}>
                          {!mediaPreviewImageUrl(item) ? (
                            <span className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_48%,#111827_100%)]" aria-hidden />
                          ) : null}
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/18 ring-1 ring-white/25">
                            <Play className="h-4 w-4 fill-current" />
                          </span>
                          {!mediaPreviewImageUrl(item) ? <span className="absolute bottom-2 left-2 rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-black text-white/90 ring-1 ring-white/15">视频已上传</span> : null}
                          {mediaDurationLabel(item) ? <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-black">{mediaDurationLabel(item)}</span> : null}
                        </span>
                      ) : null}
                      <button type="button" onClick={() => setMedia((current) => current.filter((m) => m.id !== item.id))} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {index === 0 ? <span className="absolute bottom-1.5 left-1.5 rounded-full bg-slate-950/85 px-2 py-0.5 text-[10px] font-black text-white">封面</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {Object.keys(uploadProgress).length ? (
                <div className="mt-3 space-y-1.5">
	                  {Object.entries(uploadProgress).map(([key, item]) => (
	                    <div key={key} className="rounded-2xl bg-slate-50 px-3 py-2 text-xs">
	                      <div className="flex items-center gap-2">
	                        {item.previewUrl ? (
	                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-200">
	                            <Image src={item.previewUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
	                            <span className="absolute inset-0 grid place-items-center bg-black/15 text-white"><Play className="h-3.5 w-3.5 fill-current" /></span>
	                          </span>
	                        ) : null}
	                        <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{item.name}</span>
	                        <span className={item.error ? "font-bold text-red-600" : "font-bold text-slate-500"}>
	                          {item.error ? "失败" : `${item.status} ${Math.round(item.progress * 100)}%`}
	                        </span>
	                        {item.error ? (
	                          <div className="flex shrink-0 gap-1">
	                            {item.file ? (
	                              <button
	                                type="button"
	                                onClick={() => upload.mutate([item.file as File])}
	                                className="rounded-full bg-white px-2 py-0.5 font-black text-blue-600 ring-1 ring-blue-100 hover:bg-blue-50"
	                              >
	                                重试
	                              </button>
	                            ) : null}
	                            <button type="button" onClick={() => setUploadProgress((current) => {
	                              const next = { ...current };
	                              delete next[key];
	                              return next;
	                            })} className="rounded-full bg-white px-2 py-0.5 font-black text-slate-500 ring-1 ring-slate-200 hover:text-slate-900">
	                              清除
	                            </button>
	                          </div>
	                        ) : null}
	                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                      </div>
                      {item.error ? <p className="mt-1 text-red-600">{item.error}，请重新选择文件重试。</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4">
              <p className="mb-3 text-sm font-black text-slate-950">{listingTypeLabel(type)}字段</p>
              <ListingAttributeEditor type={type} value={attributes} errors={fieldErrors} onChange={(next) => { setAttributes(next); setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key in next ? String(next[key] || "").trim() === "" : true))); }} />
            </section>

            <Field label="描述" required error={fieldErrors.description}>
              <textarea value={description} onChange={(e) => { setDescription(e.target.value); clearFieldError(setFieldErrors, "description"); }} className="kx-input min-h-32 p-3" placeholder="补充状态、交易方式、入住条件、工作内容、服务范围、预约规则、旅行/景点说明或安全提示。" />
            </Field>
            <SafetyNotice type={type} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold text-slate-500">
                {draftSavedAt ? `草稿已保存于 ${draftSavedAt}` : "草稿会保存在当前浏览器，可随时手动保存。"}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={saveDraft} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">保存草稿</button>
                <button
                  type="button"
                  disabled={create.isPending || upload.isPending}
                  onClick={() => {
                    if (!user) {
                      openAuthPrompt("publish");
                      return;
                    }
                    if (membershipBlocked) {
                      pushToast({ kind: "error", message: `发布${membershipChannelLabel}信息需要开通 Machi 会员。` });
                      return;
                    }
                    create.mutate();
                  }}
                  className="h-11 rounded-full bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-50"
                >
                  {create.isPending ? "提交中..." : createLabel}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

export function MyListingsPage({ saved = false }: { saved?: boolean }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [type, setType] = useState<KXListingType>("secondhand");
  const query = useQuery({
    queryKey: [saved ? "saved-listings" : "my-listings", type],
    queryFn: () => saved ? api.savedListings(type) : api.myListings(type),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateListing(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      pushToast({ kind: "success", message: "状态已更新" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteListing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      pushToast({ kind: "success", message: "已删除" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <h1 className="text-2xl font-black text-slate-950">{saved ? "我的收藏" : "我的发布"}</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(["secondhand", "rental", "job", "hiring", "local_service", "discount"] as KXListingType[]).map((item) => (
            <button key={item} onClick={() => setType(item)} data-active={type === item} className="h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold data-[active=true]:bg-slate-950 data-[active=true]:text-white">
              {listingTypeLabel(item)}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {query.isLoading ? <SectionLoading title={saved ? "正在加载收藏" : "正在加载发布"} rows={3} /> : query.isError ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white">
              <ErrorState title={saved ? "收藏暂时无法加载" : "发布记录暂时无法加载"} onRetry={() => query.refetch()} />
            </section>
          ) : query.data?.length ? query.data.map((item) => (
            saved ? <StructuredListCard key={item.id} listing={item} /> : <ListingManageCard key={item.id} listing={item} onStatus={(status) => update.mutate({ id: item.id, status })} onDelete={() => remove.mutate(item.id)} />
          )) : <ListingEmptyState type={type} cityName="本地" />}
        </div>
      </main>
    </AppShell>
  );
}

export function MyListingInquiriesPage({ mode = "inquiries" }: { mode?: "inquiries" | "applications" | "appointments" | "bookings" }) {
  const appointments = mode === "appointments" || mode === "bookings";
  const applications = mode === "applications";
  const title = applications ? "我的申请" : appointments ? "我的预约" : "我的咨询";
  const loadingTitle = applications ? "正在加载申请记录" : appointments ? "正在加载预约记录" : "正在加载咨询记录";
  const errorTitle = applications ? "申请记录暂时无法加载" : appointments ? "预约记录暂时无法加载" : "咨询记录暂时无法加载";
  const query = useQuery({
    queryKey: [mode === "bookings" ? "my-bookings" : applications ? "my-applications" : appointments ? "my-service-appointments" : "my-listing-inquiries"],
    queryFn: async () => {
      if (applications) {
        return { items: await api.myApplications(), guide: [] as Array<Record<string, unknown>> };
      }
      if (mode === "bookings") {
        const res = await api.myBookings();
        return { items: res.items, guide: res.guide_service_requests };
      }
      if (appointments) {
        const res = await api.myServiceAppointments();
        return { items: res.items, guide: res.guide_service_requests };
      }
      return { items: await api.myListingInquiries({ role: "all" }), guide: [] as Array<Record<string, unknown>> };
    },
  });
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <h1 className="text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">联系记录绑定具体城市信息，避免把高意图咨询混进普通私信。</p>
        <div className="mt-4 space-y-3">
          {query.isLoading ? <SectionLoading title={loadingTitle} rows={3} /> : null}
          {query.isError ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white">
              <ErrorState title={errorTitle} onRetry={() => query.refetch()} />
            </section>
          ) : null}
          {(query.data?.items || []).map((item) => <InquiryCard key={item.id} inquiry={item} />)}
          {(query.data?.guide || []).map((item) => <GuideAppointmentCard key={String(item.id)} item={item} />)}
          {!query.isLoading && !query.isError && !(query.data?.items || []).length && !(query.data?.guide || []).length ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white px-5 py-9 text-center">
              <p className="text-base font-black text-slate-950">暂无记录</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">你发起的咨询、申请、看房预约和服务预约记录会出现在这里。</p>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}

export function MyOrdersPage() {
  const query = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => api.myOrders(),
  });
  const items = query.data?.items || [];
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <h1 className="text-2xl font-black text-slate-950">我的订单</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">会员订单、Guide 资料订单和服务类订单统一追踪。</p>
        <div className="mt-4 space-y-3">
          {query.isLoading ? <SectionLoading title="正在加载订单" rows={3} /> : null}
          {query.isError ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white">
              <ErrorState title="订单暂时无法加载" onRetry={() => query.refetch()} />
            </section>
          ) : null}
          {items.map((item) => <OrderCard key={`${String(item.source || "order")}-${String(item.id || item.order_no || item.orderNo)}`} item={item} />)}
          {!query.isLoading && !query.isError && !items.length ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white px-5 py-9 text-center">
              <p className="text-base font-black text-slate-950">暂无订单</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">购买会员、Guide 资料或提交服务订单后会显示在这里。</p>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}

export function AdminListingsPage({
  initialType = "",
  initialStatus = "",
  initialVerificationStatus = "",
}: {
  initialType?: string;
  initialStatus?: string;
  initialVerificationStatus?: string;
} = {}) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [type, setType] = useState(initialType);
  const [status, setStatus] = useState(initialStatus);
  const [verificationStatus, setVerificationStatus] = useState(initialVerificationStatus);
  const listings = useQuery({
    queryKey: ["admin-listings", type, status, verificationStatus],
    queryFn: () => api.adminListings({ type, status, verification_status: verificationStatus }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.adminUpdateListing>[1] }) => api.adminUpdateListing(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
      pushToast({ kind: "success", message: "审核状态已更新" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-slate-950">Listing 审核</h1>
          <select value={type} onChange={(e) => setType(e.target.value)} className="kx-input h-10 w-40"><option value="">全部类型</option><option value="secondhand">二手</option><option value="rental">租房</option><option value="job,hiring">工作</option><option value="job">找工作</option><option value="hiring">招聘</option><option value="local_service">商家与本地服务</option><option value="discount">商家优惠</option><option value="event">活动</option></select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-44"><option value="">全部状态</option><option value="pending_review">待审核</option><option value="published">已发布</option><option value="hidden">已下架</option><option value="rejected">已拒绝</option></select>
          <select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} className="kx-input h-10 w-44"><option value="">全部核验</option><option value="unverified">未认证</option><option value="pending">待核验</option><option value="verified">已认证</option><option value="needs_review">需复核</option><option value="rejected">核验拒绝</option></select>
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {listings.isLoading ? <div className="p-4"><SectionLoading title="正在加载审核列表" rows={4} /></div> : null}
          {listings.isError ? <ErrorState title="审核列表暂时无法加载" onRetry={() => listings.refetch()} /> : null}
          {(listings.data || []).map((item) => (
            <div key={item.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-0 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{listingTypeLabel(item.type)}</span>
                  <StatusBadge item={item} />
                  <span className="text-xs font-bold text-slate-400">{cityLabel(item.city_slug)} · 举报 {item.report_count || 0}</span>
                </div>
                <h2 className="mt-2 text-base font-black text-slate-950">{item.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => update.mutate({ id: item.id, patch: { status: "published", verification_status: "verified" } })} className="h-9 rounded-full bg-emerald-600 px-3 text-xs font-black text-white">通过</button>
                <button onClick={() => update.mutate({ id: item.id, patch: { status: "rejected", verification_status: "rejected" } })} className="h-9 rounded-full bg-rose-600 px-3 text-xs font-black text-white">拒绝</button>
                <button onClick={() => update.mutate({ id: item.id, patch: { status: "hidden", verification_status: "needs_review" } })} className="h-9 rounded-full bg-slate-900 px-3 text-xs font-black text-white">下架</button>
                <button onClick={() => update.mutate({ id: item.id, patch: { is_promoted: true, promotion_weight: 30, promotion_type: item.type === "rental" ? "recommended_rental" : item.type === "job" || item.type === "hiring" ? "urgent_hiring" : "featured" } })} className="h-9 rounded-full bg-blue-600 px-3 text-xs font-black text-white">精选</button>
              </div>
            </div>
          ))}
          {!listings.isLoading && !listings.isError && !(listings.data || []).length ? <div className="p-8 text-center text-sm font-semibold text-slate-500">暂无城市信息</div> : null}
        </div>
      </main>
    </AppShell>
  );
}

export function AdminListingReportsPage() {
  const [status, setStatus] = useState("open");
  const query = useQuery({ queryKey: ["admin-listing-reports", status], queryFn: () => api.adminListingReports(status) });
  return (
    <AdminRecordPage title="Listing 举报" right={<select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-36"><option value="open">待处理</option><option value="">全部</option><option value="resolved">已处理</option></select>}>
      <AdminRecordQueryState query={query} title="正在加载举报记录" errorTitle="举报记录暂时无法加载" />
      <AdminRecordList rows={query.data || []} empty={!query.isLoading && !query.isError && !(query.data || []).length} />
    </AdminRecordPage>
  );
}

export function AdminListingPromotionsPage() {
  const query = useQuery({ queryKey: ["admin-listing-promotions"], queryFn: () => api.adminListingPromotions() });
  return (
    <AdminRecordPage title="Listing 推广">
      <AdminRecordQueryState query={query} title="正在加载推广记录" errorTitle="推广记录暂时无法加载" />
      <AdminRecordList rows={query.data || []} empty={!query.isLoading && !query.isError && !(query.data || []).length} />
    </AdminRecordPage>
  );
}

export function AdminSellerVerificationsPage() {
  const [status, setStatus] = useState("");
  const query = useQuery({ queryKey: ["admin-listing-verifications", status], queryFn: () => api.adminListingVerifications(status ? { status } : {}) });
  return (
    <AdminRecordPage title="卖家 / 商家认证" right={<select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-40"><option value="">全部</option><option value="pending">待核验</option><option value="verified">已认证</option><option value="rejected">已拒绝</option><option value="needs_review">需复核</option></select>}>
      <AdminRecordQueryState query={query} title="正在加载认证记录" errorTitle="认证记录暂时无法加载" />
      <AdminRecordList rows={query.data || []} empty={!query.isLoading && !query.isError && !(query.data || []).length} />
    </AdminRecordPage>
  );
}

export function AdminBusinessesPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const query = useQuery({
    queryKey: ["admin-businesses", status, q],
    queryFn: () => api.adminBusinesses({ verification_status: status || undefined, q: q || undefined }),
  });
  const review = useMutation({
    mutationFn: ({ id, verification_status, review_note }: { id: string; verification_status: string; review_note: string }) =>
      api.adminUpdateBusiness(id, { verification_status, review_note }),
    onSuccess: (business) => {
      queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
      pushToast({ kind: "success", message: `${business.business_name || "商家"} 已更新为 ${adminBusinessStatusLabel(business.verification_status)}` });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message || "商家审核更新失败" }),
  });
  return (
    <AdminRecordPage
      title="商家服务后台"
      right={(
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="kx-input h-10 w-56"
            placeholder="搜索商家、主体、负责人、邮箱"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-44">
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="needs_review">需补充材料</option>
            <option value="verified">已认证</option>
            <option value="rejected">已拒绝</option>
            <option value="suspended">已暂停</option>
            <option value="draft">草稿</option>
          </select>
        </div>
      )}
    >
      <AdminRecordQueryState query={query} title="正在加载商家资料" errorTitle="商家资料暂时无法加载" />
      <div className="divide-y divide-slate-100">
        {(query.data || []).map((business) => (
          <AdminBusinessCard
            key={business.id}
            business={business}
            pending={review.isPending}
            onReview={(nextStatus, note) => review.mutate({ id: business.id, verification_status: nextStatus, review_note: note })}
          />
        ))}
      </div>
      {!query.isLoading && !query.isError && !(query.data || []).length ? <div className="p-8 text-center text-sm font-semibold text-slate-500">暂无商家申请</div> : null}
    </AdminRecordPage>
  );
}

function AdminBusinessCard({
  business,
  pending,
  onReview,
}: {
  business: KXBusinessProfile;
  pending: boolean;
  onReview: (status: string, note: string) => void;
}) {
  const [note, setNote] = useState(business.review_note || "");
  useEffect(() => {
    setNote(business.review_note || "");
  }, [business.id, business.review_note]);
  const owner = business.owner;
  const categories = business.service_categories?.length ? business.service_categories.join("、") : "未填写";
  const city = business.city_slug || "未填写";
  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <AdminBusinessStatusBadge status={business.verification_status} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">{business.business_type || "商家服务"}</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">{business.document_count || business.documents?.length || 0} 份材料</span>
        </div>
        <h2 className="mt-2 truncate text-lg font-black text-slate-950">{business.business_name || "未命名商家"}</h2>
        <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{business.description || "暂无服务介绍"}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <AdminBusinessField label="主体" value={business.legal_name || "未填写"} />
          <AdminBusinessField label="负责人" value={business.representative_name || "未填写"} />
          <AdminBusinessField label="登记号/许可" value={business.registration_number || "未填写"} />
          <AdminBusinessField label="服务城市" value={`${business.country_code || "--"} / ${city}`} />
          <AdminBusinessField label="电话" value={business.phone || "未填写"} />
          <AdminBusinessField label="邮箱" value={business.email || "未填写"} />
          <AdminBusinessField label="地址" value={business.address || "未填写"} />
          <AdminBusinessField label="分类" value={categories} />
        </div>
        {business.application_note ? (
          <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
            申请备注：{business.application_note}
          </div>
        ) : null}
        {business.documents?.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {business.documents.slice(0, 4).map((doc) => (
              <div key={doc.documentId || doc.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-700">{doc.documentType || "认证材料"}</p>
                  <p className="text-[11px] font-semibold text-slate-400">{doc.contentType || doc.fileType || "文件"} · {doc.status || doc.documentStatus || "submitted"}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <aside className="rounded-[22px] bg-slate-50 p-3">
        <div className="grid grid-cols-3 gap-2">
          <AdminBusinessMetric icon={Store} label="发布" value={business.listing_count || 0} />
          <AdminBusinessMetric icon={CheckCircle2} label="展示" value={business.published_listing_count || 0} />
          <AdminBusinessMetric icon={Bell} label="线索" value={business.inquiry_count || 0} />
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70">
          <p className="text-[11px] font-black text-slate-400">申请人</p>
          <p className="mt-1 truncate text-sm font-black text-slate-800">{owner?.display_name || owner?.username || owner?.handle || business.owner_user_id}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">提交：{business.submitted_at ? formatAdminRecordValue("submitted_at", business.submitted_at) : "未提交"}</p>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="kx-input mt-3 min-h-24 py-3 text-sm"
          placeholder="审核意见：通过说明、需补充材料、拒绝原因等"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AdminBusinessAction disabled={pending} tone="approve" onClick={() => onReview("verified", note)} label="通过认证" />
          <AdminBusinessAction disabled={pending} tone="review" onClick={() => onReview("needs_review", note || "请补充主体资质、许可证或更清晰的证明材料。")} label="补材料" />
          <AdminBusinessAction disabled={pending} tone="reject" onClick={() => onReview("rejected", note || "资料不完整或暂不符合认证要求。")} label="拒绝" />
          <AdminBusinessAction disabled={pending} tone="pause" onClick={() => onReview("suspended", note || "商家服务已暂停展示，请联系后台复核。")} label="暂停" />
        </div>
      </aside>
    </article>
  );
}

function AdminBusinessStatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    needs_review: "bg-blue-50 text-blue-700 ring-blue-200",
    rejected: "bg-rose-50 text-rose-700 ring-rose-200",
    suspended: "bg-slate-100 text-slate-700 ring-slate-200",
    draft: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-black ring-1 ${tone[status] || tone.draft}`}>
      {adminBusinessStatusLabel(status)}
    </span>
  );
}

function AdminBusinessField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-bold text-slate-700">{value}</p>
    </div>
  );
}

function AdminBusinessMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white p-2 text-center ring-1 ring-slate-200/70">
      <Icon className="mx-auto h-4 w-4 text-blue-600" />
      <p className="mt-1 text-[11px] font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function AdminBusinessAction({
  disabled,
  tone,
  label,
  onClick,
}: {
  disabled: boolean;
  tone: "approve" | "review" | "reject" | "pause";
  label: string;
  onClick: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    approve: "bg-emerald-600 text-white hover:bg-emerald-700",
    review: "bg-blue-600 text-white hover:bg-blue-700",
    reject: "bg-rose-600 text-white hover:bg-rose-700",
    pause: "bg-slate-900 text-white hover:bg-slate-800",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-9 rounded-full px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]}`}
    >
      {label}
    </button>
  );
}

function adminBusinessStatusLabel(status: string) {
  const labels: Record<string, string> = {
    not_started: "未申请",
    draft: "草稿",
    pending: "待审核",
    needs_review: "需补充材料",
    verified: "已认证",
    rejected: "已拒绝",
    suspended: "已暂停",
  };
  return labels[status] || status;
}

function MarketplaceCard({ listing }: { listing: KXCityListing }) {
  const fields = compactFields(listing).slice(0, 4);
  const location = cleanListingText(listing.location_text) || "本地";
  const title = displayListingTitle(listing) || "城市信息";
  const description = cleanListingText(listing.description);
  const PlaceholderIcon = listingPlaceholderIcon(listing.type);
  const coverMedia = listingCoverMedia(listing);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const coverSource = coverMedia ? mediaSourceUrl(coverMedia) : "";
  const coverArtwork = coverIsVideo ? (coverPreview || (coverSource ? fallbackVideoPoster : "")) : coverPreview;
  const useVideoFallbackArtwork = coverIsVideo && !coverPreview;
  return (
    <Link href={detailHref(listing)} className="group overflow-hidden rounded-[22px] border border-slate-200/70 bg-white shadow-[0_12px_38px_-32px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_56px_-34px_rgba(15,23,42,0.62)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {useVideoFallbackArtwork ? (
          <span className="absolute inset-0 z-[1]" style={videoFallbackArtworkStyle} />
        ) : coverArtwork ? (
          <Image src={coverArtwork} alt={title} fill sizes="(max-width: 768px) 100vw, 320px" className="relative z-[1] object-cover transition duration-300 group-hover:scale-[1.025]" unoptimized />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)] text-slate-400">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/82 text-kx-accent shadow-sm ring-1 ring-slate-200/70">
              <PlaceholderIcon className="h-5 w-5" />
            </span>
            <span className="text-xs font-black">{formatListingType(listing.type)}</span>
          </span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 z-[2] grid place-items-center bg-black/10">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        ) : null}
        <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm">
          <Heart className="h-4 w-4" />
        </span>
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">
          {formatListingType(listing.type)}
        </span>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-black leading-none text-slate-950">{priceLabel(listing)}</p>
            <h2 className="mt-2 line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950">{title}</h2>
          </div>
          <StatusBadge item={listing} />
        </div>
        <p className="mt-2 flex min-w-0 items-center gap-1 truncate text-xs font-bold text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{location}</span>
        </p>
        {fields.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fields.map((field) => (
              <span key={field} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{field}</span>
            ))}
          </div>
        ) : null}
        {description ? <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
      </div>
    </Link>
  );
}

function listingPlaceholderIcon(type: KXListingType) {
  if (type === "rental") return Home;
  if (type === "job" || type === "hiring") return Briefcase;
  if (type === "local_service") return Sparkles;
  return Tag;
}

function listingCoverMedia(listing: KXCityListing): KXListingMedia | null {
  return listing.card?.coverMedia || listing.coverMedia || listing.cover_media || listing.media?.find((item) => item.is_cover || item.isCover) || listing.media?.[0] || null;
}

function listingCoverPreview(listing: KXCityListing): string {
  const coverMedia = listingCoverMedia(listing);
  const preview = mediaPreviewImageUrl(coverMedia);
  if (preview) return preview;
  if (isVideoMedia(coverMedia)) return "";
  return listing.card?.coverUrl || listing.listingCard?.coverUrl || listing.coverUrl || listing.cover_url || "";
}

function listingCoverIsVideo(listing: KXCityListing): boolean {
  return isVideoMedia(listingCoverMedia(listing));
}

function AdminRecordPage({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-slate-950">{title}</h1>
          {right}
        </div>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {children}
        </div>
      </main>
    </AppShell>
  );
}

function AdminRecordQueryState({
  query,
  title,
  errorTitle,
}: {
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  title: string;
  errorTitle: string;
}) {
  if (query.isLoading) return <div className="p-4"><SectionLoading title={title} rows={3} /></div>;
  if (query.isError) return <ErrorState title={errorTitle} onRetry={() => query.refetch()} />;
  return null;
}

function AdminRecordList({ rows, empty }: { rows: Array<Record<string, unknown>>; empty: boolean }) {
  return (
    <>
      {rows.map((row, index) => (
        <div key={String(row.id || index)} className="border-b border-slate-100 p-4 last:border-0">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(row).slice(0, 8).map(([key, value]) => {
              const rendered = formatAdminRecordValue(key, value);
              if (!rendered) return null;
              return (
                <div key={key} className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-black text-slate-400">{adminFieldLabel(key)}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-700">{rendered}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {empty ? <div className="p-8 text-center text-sm font-semibold text-slate-500">暂无记录</div> : null}
    </>
  );
}

function adminFieldLabel(key: string) {
  const labels: Record<string, string> = {
    id: "记录 ID",
    listing_id: "信息 ID",
    listing_title: "标题",
    title: "标题",
    type: "类型",
    listing_type: "类型",
    status: "状态",
    verification_status: "认证状态",
    reason: "原因",
    note: "备注",
    created_at: "创建时间",
    updated_at: "更新时间",
    starts_at: "开始时间",
    ends_at: "结束时间",
    price: "价格",
    amount: "金额",
    currency: "货币",
    payment_status: "支付状态",
    business_name: "商家名称",
    subject_type: "认证对象",
  };
  return labels[key] || key.replace(/_/g, " ");
}

function StructuredListCard({ listing }: { listing: KXCityListing }) {
  const fields = compactFields(listing);
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const title = displayListingTitle(listing) || "城市信息";
  const description = cleanListingText(listing.description);
  const coverMedia = listingCoverMedia(listing);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const coverSource = coverMedia ? mediaSourceUrl(coverMedia) : "";
  const coverArtwork = coverIsVideo ? (coverPreview || (coverSource ? fallbackVideoPoster : "")) : coverPreview;
  const useVideoFallbackArtwork = coverIsVideo && !coverPreview;
  const PlaceholderIcon = listingPlaceholderIcon(listing.type);
  return (
    <Link href={detailHref(listing)} className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(15,23,42,0.08)] sm:grid-cols-[148px_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 sm:aspect-square">
        {useVideoFallbackArtwork ? (
          <span className="absolute inset-0" style={videoFallbackArtworkStyle} />
        ) : coverArtwork ? (
          <Image src={coverArtwork} alt={title} fill sizes="148px" className="object-cover" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.14),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)] text-slate-400">
            <PlaceholderIcon className="h-5 w-5" />
          </span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 grid place-items-center bg-black/10">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur">
              <Play className="h-4 w-4 fill-current" />
            </span>
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-black text-slate-950">{priceLabel(listing)}</p>
            <h2 className="mt-1 line-clamp-2 text-base font-black text-slate-950">{title}</h2>
          </div>
          <StatusBadge item={listing} />
        </div>
        <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-500"><MapPin className="h-4 w-4" />{location}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {fields.map((field) => <span key={field} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{field}</span>)}
        </div>
        {description ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
    </Link>
  );
}

function ListingManageCard({ listing, onStatus, onDelete }: { listing: KXCityListing; onStatus: (status: string) => void; onDelete: () => void }) {
  const doneStatus = listing.type === "rental" ? "rented" : listing.type === "job" || listing.type === "hiring" ? "closed" : listing.type === "secondhand" ? "sold" : "closed";
  const doneLabel = listing.type === "rental" ? "标记已租出" : listing.type === "job" || listing.type === "hiring" ? "标记已招满" : listing.type === "secondhand" ? "标记已售出" : "关闭";
  const title = displayListingTitle(listing) || "城市信息";
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const coverMedia = listingCoverMedia(listing);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const coverSource = coverMedia ? mediaSourceUrl(coverMedia) : "";
  const coverArtwork = coverIsVideo ? (coverPreview || (coverSource ? fallbackVideoPoster : "")) : coverPreview;
  const useVideoFallbackArtwork = coverIsVideo && !coverPreview;
  const PlaceholderIcon = listingPlaceholderIcon(listing.type);
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="grid gap-3 sm:grid-cols-[148px_1fr]">
        <Link href={detailHref(listing)} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 sm:aspect-square">
          {useVideoFallbackArtwork ? (
            <span className="absolute inset-0" style={videoFallbackArtworkStyle} />
          ) : coverArtwork ? (
            <Image src={coverArtwork} alt={title} fill sizes="148px" className="object-cover" unoptimized />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.14),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)] text-slate-400">
              <PlaceholderIcon className="h-5 w-5" />
            </span>
          )}
          {coverIsVideo ? (
            <span className="absolute inset-0 grid place-items-center bg-black/10">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur">
                <Play className="h-4 w-4 fill-current" />
              </span>
            </span>
          ) : null}
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xl font-black text-slate-950">{priceLabel(listing)}</p>
              <Link href={detailHref(listing)} className="mt-1 line-clamp-2 text-base font-black text-slate-950 hover:text-blue-700">{title}</Link>
            </div>
            <StatusBadge item={listing} />
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">{location}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span>咨询 {listing.inquiry_count || 0}</span>
            <span>收藏 {listing.favorite_count || 0}</span>
            <span>曝光 {listing.view_count || 0}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/listings/create?type=${listing.type}&edit=${listing.id}`} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black leading-9 text-slate-700">编辑</Link>
            <button type="button" onClick={() => onStatus("hidden")} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-700">下架</button>
            <button type="button" onClick={() => onStatus("published")} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-700">重新发布</button>
            {listing.type === "secondhand" ? <button type="button" onClick={() => onStatus("reserved")} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-700">标记已预约</button> : null}
            <button type="button" onClick={() => onStatus(doneStatus)} className="h-9 rounded-full bg-slate-950 px-3 text-xs font-black text-white">{doneLabel}</button>
            <button type="button" onClick={onDelete} className="h-9 rounded-full border border-rose-200 px-3 text-xs font-black text-rose-700">删除</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InquiryCard({ inquiry }: { inquiry: KXListingInquiry }) {
  const item = inquiry.listing;
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{inquiryTypeLabel(inquiry.type)}</span>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{inquiryStatusLabel(inquiry.status)}</span>
        <span className="text-xs font-bold text-slate-400">{inquiry.created_at ? new Date(inquiry.created_at).toLocaleString("zh-CN") : ""}</span>
      </div>
      {item ? <Link href={detailHref(item)} className="mt-2 block text-base font-black text-slate-950 hover:text-blue-700">{displayListingTitle(item) || item.title}</Link> : null}
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{inquiry.message}</p>
      {inquiry.details && inquiry.details.length ? (
        <dl className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
          {inquiry.details.map((d, i) => (
            <div key={i} className="flex gap-2"><dt className="shrink-0 font-black text-slate-500">{d.label}</dt><dd className="text-slate-700">{d.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {inquiry.conversation_id ? (
        <Link href={`/messages/${inquiry.conversation_id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-black text-blue-700 hover:text-blue-800">进入对话 →</Link>
      ) : null}
      <p className="mt-3 text-xs font-semibold text-amber-700">请在确认身份和信息真实性后再交换联系方式；Machi 不代收交易款、押金、保证金或第三方服务款。</p>
    </section>
  );
}

function GuideAppointmentCard({ item }: { item: Record<string, unknown> }) {
  const title = cleanListingText(item.product_title) || cleanListingText(item.service_type) || "服务预约";
  const detail = cleanListingText(item.request_detail) || cleanListingText(item.message) || "已提交预约，后台会处理。";
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-black text-orange-700">Machi 自营服务</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{formatAdminRecordValue("status", item.status || "pending_review")}</span>
      </div>
      <h2 className="mt-2 text-base font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </section>
  );
}

function OrderCard({ item }: { item: Record<string, unknown> }) {
  const source = cleanListingText(item.source) || "order";
  const title = cleanListingText(item.title) || (source === "membership" ? "Machi 认证会员" : "Machi Guide 订单");
  const orderNo = cleanListingText(item.order_no) || cleanListingText(item.orderNo);
  const status = cleanListingText(item.status) || "pending";
  const created = cleanListingText(item.created_at) || cleanListingText(item.createdAt);
  const paid = cleanListingText(item.paid_at) || cleanListingText(item.paidAt);
  const currency = cleanListingText(item.currency) || "CNY";
  const amount = Number(item.amount ?? 0);
  const amountCents = Number(item.amount_cents ?? item.amountCents ?? 0);
  const money = amount > 0
    ? `${currency} ${amount.toLocaleString("zh-CN")}`
    : amountCents > 0
      ? `${currency} ${(amountCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "待确认";
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{source === "membership" ? "会员" : "Guide"}</span>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{formatAdminRecordValue("status", status)}</span>
        {paid ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">已支付</span> : null}
      </div>
      <h2 className="mt-2 text-base font-black text-slate-950">{title}</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-bold text-slate-400">金额</dt>
          <dd className="mt-1 font-black text-slate-800">{money}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-bold text-slate-400">订单号</dt>
          <dd className="mt-1 break-all font-black text-slate-800">{orderNo || "待生成"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs font-semibold text-slate-500">
        {created ? `创建于 ${new Date(created).toLocaleString("zh-CN")}` : "创建时间待同步"}
        {paid ? ` · 支付于 ${new Date(paid).toLocaleString("zh-CN")}` : ""}
      </p>
    </section>
  );
}

function DetailContactCard({ item, onContact }: { item: KXCityListing; onContact: () => void }) {
  const label = contactActionLabel(item);
  const location = cleanListingText(item.location_text) || cityLabel(item.city_slug);
  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
        <p className="text-2xl font-black text-slate-950">{priceLabel(item)}</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">{location}</p>
        <button type="button" onClick={onContact} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white">
          <Send className="h-4 w-4" />
          {label}
        </button>
      </section>
      <SafetyNotice type={item.type} />
    </div>
  );
}

type IntakeField = { key: string; label: string; kind?: "text" | "date" | "textarea" | "select"; options?: string[]; placeholder?: string; required?: boolean };

function intakeConfig(type: string): { title: string; noteLabel: string; fields: IntakeField[] } {
  if (type === "rental") {
    return {
      title: "预约看房",
      noteLabel: "备注",
      fields: [
        { key: "date", label: "希望看房日期", kind: "date", required: true },
        { key: "time", label: "希望时段", kind: "select", options: ["上午", "下午", "晚上", "周末"], required: true },
        { key: "situation", label: "当前情况", kind: "select", options: ["在日本", "海外", "学生", "在职"] },
        { key: "contact", label: "联系方式", placeholder: "微信 / LINE / 电话", required: true },
      ],
    };
  }
  if (type === "job" || type === "hiring") {
    return {
      title: "申请职位",
      noteLabel: "自我介绍",
      fields: [
        { key: "name", label: "姓名", required: true },
        { key: "contact", label: "联系方式", placeholder: "微信 / LINE / 电话", required: true },
        { key: "visa", label: "签证状态", kind: "select", options: ["留学", "工作签证", "永住", "家族滞在", "其他"] },
        { key: "jp", label: "日语水平", kind: "select", options: ["N1", "N2", "N3", "日常会话", "暂不会"] },
        { key: "availability", label: "可工作时间", placeholder: "平日晚上 / 周末" },
      ],
    };
  }
  if (type === "local_service") {
    return {
      title: "预约服务",
      noteLabel: "具体需求",
      fields: [
        { key: "city", label: "服务城市", required: true },
        { key: "date", label: "希望日期", kind: "date" },
        { key: "time", label: "希望时段", kind: "select", options: ["上午", "下午", "晚上", "周末"] },
        { key: "contact", label: "联系方式", placeholder: "微信 / LINE / 电话", required: true },
      ],
    };
  }
  const titles: Record<string, string> = { secondhand: "联系卖家", discount: "联系商家", event: "报名 / 咨询" };
  return { title: titles[type] || "联系发布者", noteLabel: "留言", fields: [] };
}

function IntakeSheet({ item, open, submitting, onClose, onSubmit }: { item: KXCityListing; open: boolean; submitting: boolean; onClose: () => void; onSubmit: (message: string, details: { label: string; value: string }[]) => void }) {
  const config = useMemo(() => intakeConfig(item.type), [item.type]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setValues({}); setNote(""); setError(null); }
  }, [open]);
  if (!open) return null;
  const submit = () => {
    for (const f of config.fields) {
      if (f.required && !(values[f.key] || "").trim()) { setError(`请填写「${f.label}」`); return; }
    }
    const details = config.fields
      .map((f) => ({ label: f.label, value: (values[f.key] || "").trim() }))
      .filter((d) => d.value);
    onSubmit(note.trim(), details);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-950">{config.title}</h3>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">{displayListingTitle(item) || item.title}</p>
        <div className="mt-4 space-y-3">
          {config.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-black text-slate-600">{f.label}{f.required ? <span className="text-rose-500"> *</span> : null}</span>
              {f.kind === "select" ? (
                <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="kx-input mt-1 h-11 w-full px-3 text-sm">
                  <option value="">请选择</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} className="kx-input mt-1 min-h-20 w-full p-3 text-sm" />
              ) : (
                <input type={f.kind === "date" ? "date" : "text"} value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} className="kx-input mt-1 h-11 w-full px-3 text-sm" />
              )}
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-black text-slate-600">{config.noteLabel}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="补充说明（选填）" className="kx-input mt-1 min-h-20 w-full p-3 text-sm" />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-bold text-rose-600">{error}</p> : null}
        <p className="mt-3 text-xs font-semibold text-amber-700">提交后会与发布者开启对话。Machi 不代收交易款、押金、保证金或第三方服务款，请勿提前转账。</p>
        <button type="button" disabled={submitting} onClick={submit} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white disabled:opacity-60">
          <Send className="h-4 w-4" />
          {submitting ? "提交中…" : config.title}
        </button>
      </div>
    </div>
  );
}

function ListingFilterPanel({
  type,
  currentCitySlug,
  filters,
  onChange,
  variant = "panel",
}: {
  type: KXListingType;
  currentCitySlug: string;
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  variant?: "panel" | "inline";
}) {
  const set = (key: string, value: string) => onChange({ ...filters, [key]: value });
  const setScopeArea = (value: string) => onChange({ ...filters, scope_area: value, scope_city: "" });
  const setScopeCity = (value: string) => onChange({ ...filters, scope_area: "", scope_city: value });
  const clearScope = () => onChange({ ...filters, scope_area: "", scope_city: "" });
  const reset = () => onChange({});
  const currentCity = getCityBySlug(currentCitySlug);
  return (
    <section className={variant === "inline" ? "rounded-[20px] bg-slate-50/70 p-3" : "sticky top-24 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)]"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-950">筛选</h3>
        <button type="button" onClick={reset} className="text-xs font-bold text-slate-400 hover:text-slate-900">清空</button>
      </div>
      <div className="mt-3 rounded-[18px] border border-slate-200/70 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-500">城市范围</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">关东圈、关西圈和其他热门城市已收进这里。</p>
          </div>
          <button
            type="button"
            onClick={clearScope}
            data-active={!filters.scope_area && !filters.scope_city}
            className="h-8 rounded-full border border-slate-200 px-3 text-xs font-black text-slate-500 transition hover:border-blue-300 hover:text-blue-700 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white"
          >
            跟随顶部
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CITY_AREA_GROUPS.map((group) => (
            <button
              key={group.slug}
              type="button"
              onClick={() => setScopeArea(group.slug)}
              data-active={filters.scope_area === group.slug}
              className="h-9 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 transition hover:border-blue-300 hover:bg-white hover:text-blue-700 data-[active=true]:border-blue-600 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700"
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CITY_AREA_GROUPS.map((group) => (
            <div key={group.slug} className="rounded-2xl bg-slate-50/80 p-2">
              <p className="px-1 pb-1 text-[11px] font-black text-slate-400">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.cities.map((slug) => {
                  const city = getCityBySlug(slug);
                  if (!city) return null;
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setScopeCity(slug)}
                      data-active={filters.scope_city === slug}
                      className="h-8 rounded-full px-2.5 text-xs font-black text-slate-500 transition hover:bg-white hover:text-blue-700 data-[active=true]:bg-slate-950 data-[active=true]:text-white"
                    >
                      {city.slug === currentCity?.slug ? `${city.name} · 当前` : city.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={variant === "inline" ? "mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "mt-3 grid gap-3"}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={type === "rental" ? "最低租金" : type === "job" || type === "hiring" ? "最低薪资" : "最低价格"}>
            <input value={filters.min_price || ""} onChange={(e) => set("min_price", e.target.value.replace(/[^\d.]/g, ""))} className="kx-input h-10" />
          </Field>
          <Field label={type === "rental" ? "最高租金" : type === "job" || type === "hiring" ? "最高薪资" : "最高价格"}>
            <input value={filters.max_price || ""} onChange={(e) => set("max_price", e.target.value.replace(/[^\d.]/g, ""))} className="kx-input h-10" />
          </Field>
        </div>
        {filterOptions(type).map((group) => (
          <Field key={group.key} label={group.label}>
            <select value={filters[group.key] || ""} onChange={(e) => set(group.key, e.target.value)} className="kx-input h-10">
              <option value="">不限</option>
              {group.options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        ))}
      </div>
    </section>
  );
}

function SellerBox({ item }: { item: KXCityListing }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-3">
        {item.seller ? <Avatar user={item.seller} size={42} /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 font-black text-slate-600">M</span>}
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-black text-slate-950">{item.seller?.display_name || "Machi 用户"}{item.seller?.is_verified ? <VerifiedBadge /> : null}</p>
          <p className="text-xs font-semibold text-slate-500">发布者认证：{verificationLabel(item.verification_status)}</p>
        </div>
      </div>
    </section>
  );
}

function AttributeGrid({ item }: { item: KXCityListing }) {
  const { locale } = useI18n();
  const rows = detailFields(item, locale);
  if (!rows.length) return null;
  return (
    <dl className="mt-5 grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-slate-50 p-3">
          <dt className="text-xs font-bold text-slate-400">{label}</dt>
          <dd className="mt-1 text-sm font-black text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SafetyNotice({ type }: { type: KXListingType }) {
  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-black text-amber-900"><AlertTriangle className="h-4 w-4" /> 安全提醒</h3>
      <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-amber-900/80">
        {safetyTips(type).map((tip) => <li key={tip}>· {tip}</li>)}
      </ul>
    </section>
  );
}

function ListingAttributeEditor({
  type,
  value,
  errors = {},
  onChange,
}: {
  type: KXListingType;
  value: Record<string, string>;
  errors?: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const fields = listingFormFields(type);
  const set = (key: string, nextValue: string) => onChange({ ...value, [key]: nextValue });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <Field key={field.key} label={field.label} required={field.required} error={errors[field.key]}>
          {field.kind === "checkbox" ? (
            <button
              type="button"
              onClick={() => set(field.key, value[field.key] === "true" ? "false" : "true")}
              data-active={value[field.key] === "true"}
              className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition data-[active=true]:border-emerald-200 data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-800"
            >
              <span>{value[field.key] === "true" ? "是" : "否"}</span>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[11px] data-[active=true]:bg-emerald-600 data-[active=true]:text-white" data-active={value[field.key] === "true"}>{value[field.key] === "true" ? "✓" : ""}</span>
            </button>
          ) : field.kind === "select" ? (
            <select value={value[field.key] || ""} onChange={(e) => set(field.key, e.target.value)} className="kx-input h-11">
              <option value="">请选择</option>
              {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : field.kind === "textarea" ? (
            <textarea value={value[field.key] || ""} onChange={(e) => set(field.key, e.target.value)} className="kx-input min-h-24 p-3" placeholder={field.placeholder} />
          ) : (
            <input value={value[field.key] || ""} onChange={(e) => set(field.key, e.target.value)} className="kx-input h-11" placeholder={field.placeholder} />
          )}
        </Field>
      ))}
    </div>
  );
}

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-black text-slate-500">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-bold text-rose-600">{error}</span> : null}
    </label>
  );
}

function ListingSkeletonGrid({ type }: { type: KXListingType }) {
  const count = type === "secondhand" ? 8 : 5;
  return <div className={type === "secondhand" ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "space-y-3"}>{Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={type === "secondhand" ? "h-64 rounded-2xl" : "h-40 rounded-2xl"} />)}</div>;
}

function ListingEmptyState({ type, cityName }: { type: KXListingType; cityName: string }) {
  const title = type === "secondhand" ? "这里还没有二手商品" : type === "rental" ? "这里还没有房源" : type === "job" || type === "hiring" ? "这里还没有工作机会" : type === "local_service" ? "这里还没有商家与本地服务" : type === "discount" ? "这里还没有商家优惠" : "这里还没有城市信息";
  const subtitle = type === "secondhand"
    ? "发布第一个闲置、求购或搬家出清，让同城的人看到它。"
    : type === "rental"
      ? "你可以发布合租、短租或房源信息。Machi 会持续补充该城市的租房内容。"
      : type === "job" || type === "hiring"
        ? "稍后查看新的兼职、全职和招聘信息。认证招聘方可以发布职位。"
        : type === "local_service"
          ? "认证商家和服务方可以发布点评、预约、住宿、景点、翻译、搬家、维修和生活支持。"
          : type === "discount"
            ? "本地商家可以发布折扣、活动和福利信息。"
            : `稍后查看${cityName}新的本地内容。`;
  const action = type === "rental" ? "发布房源" : type === "job" || type === "hiring" ? "发布职位" : type === "local_service" ? "发布服务" : type === "discount" ? "发布优惠" : "发布二手";
  return (
    <PremiumEmptyState
      title={title}
      subtitle={subtitle}
      action={{ label: action, href: `/listings/create?type=${type}` }}
      secondaryAction={{ label: "返回发现", href: "/explore" }}
    />
  );
}

function StatusBadge({ item }: { item: KXCityListing }) {
  const statusTone = item.status === "published"
    ? "border-blue-100 bg-blue-50 text-blue-700"
    : item.status === "pending_review"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-100 text-slate-600";
  const verificationTone = item.verification_status === "verified"
    ? "border-sky-100 bg-sky-50 text-sky-700"
    : item.verification_status === "pending" || item.verification_status === "needs_review"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-100 text-slate-500";
  const showVerification = item.verification_status && item.verification_status !== "unverified";
  const verificationText = item.verification_status === "verified" ? "认证" : verificationLabel(item.verification_status);
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
      <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-black leading-none ${statusTone}`}>
        {listingStatusLabel(item)}
      </span>
      {showVerification ? (
        <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-black leading-none ${verificationTone}`}>
          {item.verification_status === "verified" ? <CheckCircle2 className="h-3 w-3" /> : null}
          {verificationText}
        </span>
      ) : null}
    </span>
  );
}

function priceLabel(item: KXCityListing) {
  return formatListingPrice(item);
}

function sortListings(a: KXCityListing, b: KXCityListing) {
  const boost = Number(b.promotion_weight || 0) - Number(a.promotion_weight || 0);
  if (boost !== 0) return boost;
  return new Date(b.published_at || b.updated_at || b.created_at || 0).getTime() - new Date(a.published_at || a.updated_at || a.created_at || 0).getTime();
}

function attributeText(item: KXCityListing, key: string) {
  return formatListingAttribute(key, item.attributes?.[key]);
}

function compactFields(item: KXCityListing) {
  return compactListingFields(item);
}

function detailFields(item: KXCityListing, locale: Locale = "zh-Hans"): Array<[string, string]> {
  return listingDetailFields(item, appLocaleToMarketingLocale(locale));
}

function listingTypeLabel(type: KXListingType | string) {
  return formatListingType(type);
}

function cityLabel(citySlug?: string | null) {
  const slug = cleanListingText(citySlug);
  return (slug && getCityBySlug(slug)?.name) || "本地";
}

function displayListingTitle(item: KXCityListing) {
  const title = cleanListingText(item.title);
  if (item.type !== "rental") return title;
  return title
    .replace(/，?外国人可咨询/g, "，可预约看房")
    .replace(/，?外国人可/g, "")
    .replace(/，{2,}/g, "，")
    .replace(/，$/g, "")
    .trim();
}

// Build the publish-page city options for a country, grouped by province so
// the picker scales with the selected region instead of a hard-coded short list.
function publishCityGroups(country: string, locale?: string): Array<{ province: string; cities: Array<{ code: string; name: string }> }> {
  const spec = countryByCode(country);
  if (!spec) return [];
  if (spec.has_provinces) {
    return provincesFor(country)
      .map((p) => ({
        province: provinceDisplayName(country, p.code, p.name, locale),
        cities: citiesFor(country, p.code).map((c) => ({
          code: composeRegionCode(country, p.code, c.code),
          name: cityDisplayName(country, p.code, c.code, c.name, locale),
        })),
      }))
      .filter((g) => g.cities.length > 0);
  }
  return [{
    province: "",
    cities: citiesFor(country).map((c) => ({
      code: composeRegionCode(country, undefined, c.code),
      name: cityDisplayName(country, undefined, c.code, c.name, locale),
    })),
  }];
}

function listingStatusLabel(item: KXCityListing) {
  return formatListingStatus(item.status, item.type);
}

function contactActionLabel(item: KXCityListing) {
  if (item.type === "secondhand") return "联系卖家";
  if (item.type === "rental") return "咨询房源";
  if (item.type === "job" || item.type === "hiring") return "联系 / 申请";
  if (item.type === "local_service") return "预约咨询";
  return "联系发布者";
}

function inquiryTypeLabel(type: string) {
  return formatInquiryType(type);
}

function inquiryStatusLabel(status: string) {
  return formatInquiryStatus(status);
}

function verificationLabel(status: string) {
  return formatVerificationStatus(status);
}

function detailHref(item: KXCityListing) {
  return `/cities/${item.city_slug || "tokyo"}/${listingSectionForType(item.type)}/${item.id}`;
}

function listingBackHref(item: KXCityListing) {
  return `/cities/${item.city_slug || "tokyo"}/${listingSectionForType(item.type)}`;
}

function defaultPriceType(type: KXListingType) {
  if (type === "rental" || type === "hiring") return "monthly";
  if (type === "job") return "hourly";
  if (type === "discount") return "discount";
  return "fixed";
}

function titlePlaceholder(type: KXListingType) {
  if (type === "rental") return "仙台青叶区 1K";
  if (type === "job" || type === "hiring") return "居酒屋兼职 / 日中双语运营";
  if (type === "local_service") return "东京周末一日游 / 机场接送 / 认证翻译服务";
  if (type === "discount") return "学生咖啡 10% 优惠";
  return "Apple Magic Keyboard";
}

function categoryPlaceholder(type: KXListingType) {
  if (type === "rental") return "单人 / 合租 / 短租";
  if (type === "job" || type === "hiring") return "兼职 / 全职 / 实习";
  if (type === "local_service") return "餐饮点评 / 酒店民宿 / 景点门票 / 翻译手续";
  if (type === "discount") return "餐饮 / 学习 / 生活";
  return "家具 / 家电 / 电子产品";
}

function priceFieldLabel(type: KXListingType) {
  if (type === "rental") return "月租";
  if (type === "job" || type === "hiring") return "薪资下限";
  if (type === "local_service") return "起步价格";
  if (type === "discount") return "优惠金额";
  return "价格";
}

function pricePlaceholder(type: KXListingType) {
  if (type === "rental") return "58000";
  if (type === "job" || type === "hiring") return "1200";
  if (type === "local_service") return "3000";
  if (type === "discount") return "可留空或填写折扣金额";
  return "8000，免费送填 0";
}

function option(value: string, label: string = value): FilterOption {
  return { value, label };
}

function clearFieldError(setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, key: string) {
  setter((current) => {
    if (!current[key]) return current;
    const next = { ...current };
    delete next[key];
    return next;
  });
}

function listingFormFields(type: KXListingType): AttributeField[] {
  if (type === "rental") return [
    { key: "layout", label: "户型", required: true, kind: "select", options: ["1R", "1K", "1DK", "1LDK", "2K", "2LDK", "合租"].map((item) => option(item)) },
    { key: "area_sqm", label: "面积 m²", required: true, placeholder: "25" },
    { key: "nearest_station", label: "最近车站", required: true, placeholder: "青叶通一番町站" },
    { key: "station_distance_minutes", label: "车站距离", placeholder: "步行 7 分钟" },
    { key: "deposit", label: "押金", placeholder: "1 个月 / 无" },
    { key: "key_money", label: "礼金", placeholder: "0 / 1 个月" },
    { key: "management_fee", label: "管理费", placeholder: "3000" },
    { key: "move_in_date", label: "入住时间", required: true, placeholder: "2026-07-01 或 即可入住" },
    { key: "lease_term", label: "租期", placeholder: "2 年 / 3 个月起" },
    { key: "short_term_allowed", label: "可短租", kind: "checkbox" },
    { key: "share_allowed", label: "可合租", kind: "checkbox" },
    { key: "furnished", label: "家具家电", kind: "checkbox" },
    { key: "pet_allowed", label: "可宠物", kind: "checkbox" },
    { key: "initial_cost_note", label: "初期费用说明", kind: "textarea", placeholder: "说明押金、礼金、管理费、中介费等初期费用。" },
  ];
  if (type === "job" || type === "hiring") return [
    { key: "company_name", label: "公司 / 店铺名", required: true, placeholder: "Machi Coffee" },
    { key: "employment_type", label: "雇佣形式", required: true, kind: "select", options: [option("part_time", "兼职"), option("full_time", "全职"), option("dispatch", "派遣"), option("internship", "实习"), option("contract", "契约")] },
    { key: "salary_type", label: "薪资类型", required: true, kind: "select", options: [option("hourly", "时给"), option("monthly", "月给"), option("daily", "日给"), option("annual", "年薪")] },
    { key: "japanese_level", label: "日语要求", required: true, kind: "select", options: [option("not_required", "不限"), option("N5"), option("N4"), option("N3"), option("N2"), option("N1"), option("business", "商务日语")] },
    { key: "visa_support", label: "签证支持", required: true, kind: "select", options: [option("none", "无"), option("consult", "可咨询"), option("available", "有")] },
    { key: "working_hours", label: "工作时间", required: true, placeholder: "18:00-23:30 / 每周 3 天" },
    { key: "transportation_fee", label: "交通费", kind: "checkbox" },
    { key: "foreigner_friendly", label: "外国人友好", kind: "checkbox" },
    { key: "no_experience_ok", label: "无经验可", kind: "checkbox" },
    { key: "student_ok", label: "留学生可", kind: "checkbox" },
    { key: "night_shift", label: "夜班", kind: "checkbox" },
    { key: "weekend_available", label: "周末", kind: "checkbox" },
    { key: "job_requirements", label: "应聘条件", kind: "textarea", placeholder: "说明经验、语言、签证、排班等要求。" },
  ];
  if (type === "local_service") return [
    { key: "business_name", label: "商家 / 服务方名称", required: true, placeholder: "Machi Travel & Local Support" },
    { key: "service_type", label: "服务类型", required: true, kind: "select", options: ["餐饮点评", "优惠预约", "酒店民宿", "景点门票", "一日游", "接送机", "签证/手续协助", "翻译", "搬家清洁", "维修安装", "生活支持", "租房申请协助"].map((item) => option(item)) },
    { key: "service_area", label: "服务范围", required: true, placeholder: "东京 23 区 / 成田机场 / 富士山周边" },
    { key: "price_unit", label: "价格单位", placeholder: "每小时 / 每次 / 预约咨询" },
    { key: "availability", label: "可预约时间", placeholder: "平日晚上 / 周末" },
    { key: "booking_required", label: "需要预约", kind: "checkbox" },
    { key: "certified_provider", label: "认证商家/服务商", kind: "checkbox" },
    { key: "languages", label: "服务语言", placeholder: "中文 / 日本語 / English" },
    { key: "rating_note", label: "评分/口碑说明", placeholder: "Google 4.6 / 老客推荐 / 平台新店" },
    { key: "service_process", label: "服务流程", kind: "textarea", placeholder: "说明咨询、预约、确认、到店/出行/执行、反馈流程。" },
    { key: "not_included", label: "不包含内容", kind: "textarea", placeholder: "清楚说明不包含的门票、餐费、交通费、材料费或额外项目。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "证件、材料、地址、航班号、人数、日期、照片等。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "说明取消、改期和费用规则。" },
    { key: "license_note", label: "资质/许可说明", kind: "textarea", placeholder: "涉及旅行、住宿、票务、医疗、法律等需说明许可或合作方。" },
    { key: "no_result_guarantee", label: "结果说明", kind: "textarea", placeholder: "不得承诺签证、房源、录取、工作、中奖或收益结果。" },
  ];
  if (type === "discount") return [
    { key: "merchant_name", label: "商家名称", required: true, placeholder: "Machi Coffee" },
    { key: "discount_info", label: "优惠内容", required: true, kind: "textarea", placeholder: "学生证出示 10% off / 套餐优惠 / 限时福利。" },
    { key: "valid_until", label: "有效期", required: true, placeholder: "2026-08-31" },
    { key: "usage_rules", label: "使用规则", kind: "textarea", placeholder: "是否可叠加、是否预约、适用门店和例外情况。" },
    { key: "merchant_verified", label: "商家认证", kind: "checkbox" },
  ];
  return [
    { key: "listing_mode", label: "发布类型", required: true, kind: "select", options: [option("sale", "出售"), option("free", "免费送"), option("wanted", "求购")] },
    { key: "condition", label: "新旧程度", required: true, kind: "select", options: [option("brand_new", "全新"), option("like_new", "几乎全新"), option("good", "良好"), option("used", "有使用痕迹"), option("fair", "可用")] },
    { key: "delivery_method", label: "交易方式", required: true, kind: "select", options: [option("meetup", "面交"), option("pickup", "自取"), option("shipping", "邮寄"), option("negotiable", "可商量")] },
    { key: "brand", label: "品牌", placeholder: "Apple / IKEA / Nitori" },
    { key: "model", label: "型号", placeholder: "Magic Keyboard / MALM" },
    { key: "pickup_available", label: "可自取", kind: "checkbox" },
    { key: "shipping_available", label: "可邮寄", kind: "checkbox" },
  ];
}

function safetyTips(type: KXListingType) {
  if (type === "rental") return ["Machi 只是信息平台，不代收押金、订金或房租。", "地址只展示到区域，具体看房前核实发布者身份。", "高风险房源显示待核验，可举报并由后台下架。"];
  if (type === "job" || type === "hiring") return ["招聘不得收押金、保证金或培训费。", "核实招聘方资质、薪资、工作地点和签证说明。", "禁止成人、灰产或违法兼职。"];
  if (type === "local_service") return ["商家与本地服务默认进入审核，认证状态会展示。", "旅行住宿、景点票务、法律医疗等高信任服务需要补充资质。", "禁止成人服务、高风险线下服务、虚假票务、违规代办和违法服务。", "平台暂不做外卖配送，不代收第三方服务款。"];
  if (type === "discount") return ["确认优惠有效期、适用门店和使用规则。", "不要向未核验商家提前转账或提供敏感信息。", "遇到虚假折扣、诱导消费或强制捆绑请立即举报。"];
  return ["Machi 不代收二手交易款。", "不要提前转账，交易建议选择公共场所。", "核实对方身份，谨慎提供个人信息。", "遇到可疑内容立即举报。"];
}

function filterOptions(type: KXListingType): Array<{ key: string; label: string; options: FilterOption[] }> {
  if (type === "rental") return [
    { key: "layout", label: "户型", options: ["1R", "1K", "1DK", "1LDK", "2K", "2LDK", "合租"].map((item) => option(item)) },
    { key: "short_term_allowed", label: "短租", options: [option("true", "可")] },
    { key: "share_allowed", label: "合租", options: [option("true", "可")] },
    { key: "furnished", label: "家具家电", options: [option("true", "有")] },
    { key: "pet_allowed", label: "宠物", options: [option("true", "可")] },
  ];
  if (type === "job" || type === "hiring") return [
    { key: "employment_type", label: "雇佣形式", options: [option("part_time", "兼职"), option("full_time", "全职"), option("dispatch", "派遣"), option("internship", "实习")] },
    { key: "salary_type", label: "薪资类型", options: [option("hourly", "时给"), option("monthly", "月给")] },
    { key: "japanese_level", label: "日语", options: [option("not_required", "不限"), option("N5"), option("N4"), option("N3"), option("N2"), option("N1")] },
    { key: "no_experience_ok", label: "无经验可", options: [option("true", "可")] },
    { key: "student_ok", label: "留学生可", options: [option("true", "可")] },
    { key: "visa_support", label: "签证支持", options: [option("available", "有"), option("consult", "可咨询"), option("none", "无")] },
  ];
  if (type === "local_service") return [
    { key: "service_type", label: "服务类型", options: ["餐饮点评", "优惠预约", "酒店民宿", "景点门票", "一日游", "接送机", "签证/手续协助", "翻译", "搬家清洁", "维修安装", "生活支持", "租房申请协助"].map((item) => option(item)) },
    { key: "booking_required", label: "预约", options: [option("true", "需要预约")] },
    { key: "certified_provider", label: "认证商家/服务商", options: [option("true", "已认证")] },
  ];
  if (type === "discount") return [
    { key: "merchant_verified", label: "商家认证", options: [option("true", "已认证")] },
    { key: "valid_until", label: "有效期", options: [option("active", "有效中")] },
  ];
  return [
    { key: "condition", label: "新旧程度", options: [option("brand_new", "全新"), option("like_new", "几乎全新"), option("good", "良好"), option("used", "有使用痕迹"), option("fair", "可用")] },
    { key: "delivery_method", label: "交易方式", options: [option("meetup", "面交"), option("pickup", "自取"), option("shipping", "邮寄"), option("negotiable", "可商量")] },
    { key: "listing_mode", label: "发布类型", options: [option("sale", "出售"), option("free", "免费送"), option("wanted", "求购")] },
  ];
}

function matchesListingFilters(item: KXCityListing, filters: Record<string, string>) {
  return filterOptions(item.type).every((group) => {
    const expected = filters[group.key];
    if (!expected) return true;
    if (expected === "active") return true;
    const raw = cleanListingText(item.attributes?.[group.key]).toLowerCase();
    const actual = attributeText(item, group.key).toLowerCase();
    const normalizedExpected = expected.toLowerCase();
    if (expected === "true") return ["可", "true", "1", "是", "有", "yes"].includes(actual) || ["true", "1", "yes", "是", "可", "有"].includes(raw);
    if (expected === "not_required") return raw === "not_required" || actual.includes("不限");
    if (expected === "none") return raw === "none" || actual === "无";
    return raw.includes(normalizedExpected) || actual.includes(normalizedExpected) || actual.includes((group.options.find((itemOption) => itemOption.value === expected)?.label || "").toLowerCase());
  });
}

function normalizeListingType(value?: string | null): KXListingType {
  const normalized = cleanListingText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "marketplace" || normalized === "second_hand" || normalized === "secondhand") return "secondhand";
  if (normalized === "rent" || normalized === "rental" || normalized === "rentals" || normalized === "housing") return "rental";
  if (normalized === "work" || normalized === "job" || normalized === "jobs") return "job";
  if (normalized === "hire" || normalized === "hiring" || normalized === "recruiting") return "hiring";
  if (normalized === "service" || normalized === "services" || normalized === "local_service" || normalized === "local_services" || normalized === "service_booking") return "local_service";
  if (normalized === "deal" || normalized === "deals" || normalized === "discount" || normalized === "discounts" || normalized === "coupon" || normalized === "coupons") return "discount";
  if (normalized === "event" || normalized === "events") return "event";
  return "secondhand";
}
