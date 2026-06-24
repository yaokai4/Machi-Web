"use client";

import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bed,
  BedDouble,
  Beer,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Coffee,
  CookingPot,
  FileCheck2,
  Fish,
  Flame,
  Heart,
  Home,
  Hotel,
  Landmark,
  Languages,
  MapPin,
  MessageSquare,
  Pizza,
  Play,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Soup,
  Sparkles,
  Star,
  Store,
  Tag,
  Ticket,
  Train,
  Utensils,
  UtensilsCrossed,
  Waves,
  X,
} from "lucide-react";
import { api, APIError, isAuthRequiredError, isUploadImageFile, isUploadVideoFile, type UploadPurpose } from "@/lib/api";
import { fallbackVideoPoster, isVideoMedia, mediaDurationLabel, mediaPreviewImageUrl, mediaSourceUrl } from "@/lib/media";
import { listingTypeRequiresMembership, showOfficialBadge, showVerifiedBadge, type KXBusinessProfile, type KXCityListing, type KXCreateListingPayload, type KXListingInquiry, type KXListingMedia, type KXListingTaxonomyCategory, type KXListingTaxonomyField, type KXListingTaxonomyPayload, type KXListingType, type KXMedia } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, PremiumEmptyState, SectionLoading, Skeleton } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { ListingBookingSection } from "@/components/listings/ListingBookingSection";
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
type InquiryReceipt = {
  inquiryId?: string;
  conversationId?: string;
  type: string;
  status: string;
  title: string;
  details: { label: string; value: string }[];
  message?: string;
};

const videoFallbackArtworkStyle: React.CSSProperties = {
  background:
    "radial-gradient(circle at 28% 18%, rgba(255,255,255,0.26), transparent 34%), linear-gradient(135deg, #0f172a 0%, #1e3a8a 54%, #0f766e 100%)",
};

const CHANNEL: Record<ChannelKind, { type: KXListingType; title: string; subtitle: string; icon: typeof Home; search: string; createLabel: string }> = {
  marketplace: { type: "secondhand", title: "二手市场", subtitle: "图片、价格、地点、成色和交易方式清晰分离", icon: Tag, search: "搜索家具、家电、手机数码、教材、搬家出清", createLabel: "发布二手" },
  rentals: { type: "rental", title: "租房 · 住宿", subtitle: "长租房源与民宿，价格、位置和入住条件一目了然", icon: Home, search: "搜索地区、车站、民宿、房源关键词", createLabel: "发布房源" },
  jobs: { type: "job", title: "工作机会", subtitle: "薪资、地点、日语要求、签证支持和招聘方认证", icon: Briefcase, search: "搜索职位、公司、地点、日语要求", createLabel: "发布职位" },
  services: { type: "local_service", title: "商家与服务", subtitle: "餐厅、旅行票务、接送交通、翻译手续和生活支持", icon: Sparkles, search: "搜索餐厅、旅行票务、机场接送、翻译手续、生活服务", createLabel: "发布服务" },
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
    title: { ja: "賃貸・宿泊", en: "Homes & Stays" },
    subtitle: { ja: "長期賃貸・民泊を、料金と駅と条件で探せる", en: "Long-term rentals and homestays — price, location and terms at a glance" },
    search: { ja: "エリア・駅・民泊・物件キーワードを検索", en: "Search area, station, homestays, keywords" },
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
    subtitle: { ja: "飲食店・旅行チケット・送迎・生活サポート", en: "Restaurants, travel tickets, transfers and local support" },
    search: { ja: "飲食店、旅行チケット、空港送迎、翻訳・手続き、生活サポートを検索", en: "Search restaurants, travel tickets, transfers, paperwork and local support" },
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

// ── 类目体系（zh 为存储/过滤的规范值，详见 CATEGORY_LABELS 注释）────────────
/// 餐厅：菜系类目（local_service 下）。
export const FOOD_CATEGORIES = ["中华料理", "日本料理", "居酒屋", "烧肉火锅", "拉面", "寿司海鲜", "咖啡甜品", "西餐", "韩国料理"] as const;
const LEGACY_FOOD_CATEGORIES = ["餐厅美食", "餐饮预约"] as const;
const FOOD_SECTION_CATEGORIES = ["餐厅", ...FOOD_CATEGORIES, "优惠预约"];
const LODGING_SECTION_CATEGORIES = ["民宿"] as const;
const LEGACY_LODGING_CATEGORIES = ["酒店", "温泉旅馆", "公寓式酒店", "短住公寓", "酒店民宿"] as const;
const TRAVEL_SECTION_CATEGORIES = ["景点门票", "一日游", "本地向导", "体验活动", "包车行程"] as const;
const TRANSFER_SECTION_CATEGORIES = ["机场接送", "车站接送", "包车", "行李协助"] as const;
const PAPERWORK_SECTION_CATEGORIES = ["材料翻译", "市役所陪同", "银行卡协助", "手机卡协助", "租房申请协助", "签证材料整理"] as const;
const MOVING_SECTION_CATEGORIES = ["搬家", "退房清洁", "粗大垃圾协助", "行李搬运", "家具家电配送协助"] as const;
const LIFE_SETUP_SECTION_CATEGORIES = ["手机卡开通", "网络开通", "水电煤协助", "地址登记协助", "粗大垃圾预约", "生活跑腿", "生活支持"] as const;
const BEAUTY_HEALTH_SECTION_CATEGORIES = ["美容美发", "美甲", "按摩", "皮肤管理", "体检/牙科预约协助"] as const;
const PET_FAMILY_SECTION_CATEGORIES = ["宠物寄养", "遛狗", "临时照看", "儿童用品租赁", "家庭协助", "宠物服务"] as const;
/// 第一阶段正式服务分类。旧伞类目仍保留在映射中兼容已有数据，但不进入新发布主流程。
const LIFE_SECTION_CATEGORIES = [
  ...PAPERWORK_SECTION_CATEGORIES,
  ...MOVING_SECTION_CATEGORIES,
  ...LIFE_SETUP_SECTION_CATEGORIES,
  ...BEAUTY_HEALTH_SECTION_CATEGORIES,
] as const;
/// 住宿：归属租房页「民宿」标签；酒店类目仅保留历史数据兼容，不再作为新入口展示。
export const HOMESTAY_CATEGORIES = ["民宿"] as const;
export const STAY_CATEGORIES = [...HOMESTAY_CATEGORIES] as const;
const LEGACY_STAY_CATEGORY_SET = new Set<string>([...HOMESTAY_CATEGORIES, ...LEGACY_LODGING_CATEGORIES]);
const FOOD_CATEGORY_SET = new Set<string>([...FOOD_SECTION_CATEGORIES, ...LEGACY_FOOD_CATEGORIES]);

const CATEGORY_CHIPS: Record<KXListingType, string[]> = {
  secondhand: ["全部", "家具", "家电", "手机数码", "电脑办公", "电子产品", "教材", "书籍教材", "衣物", "生活用品", "母婴儿童", "运动户外", "票券卡券", "搬家出清", "免费送", "求购"],
  rental: ["全部", "单人", "合租", "整租", "家具家电", "近车站"],
  job: ["全部", "兼职", "全职", "时给", "月给", "无经验可", "留学生可", "签证支持", "周末"],
  hiring: ["全部", "兼职", "全职", "派遣", "实习", "签证支持"],
  local_service: ["全部", ...FOOD_SECTION_CATEGORIES, ...TRAVEL_SECTION_CATEGORIES, ...TRANSFER_SECTION_CATEGORIES, ...LIFE_SECTION_CATEGORIES],
  discount: ["全部", "餐饮", "生活", "学习", "搬家", "限时"],
  event: ["全部", "今天", "本周", "周末", "免费"],
};

type CreateCategoryGroup = { key: string; label: string; description: string; categories: string[] };

const SECONDHAND_CREATE_GROUPS: CreateCategoryGroup[] = [
  { key: "home", label: "家具家居", description: "桌椅床柜、搬家出清、生活用品", categories: ["家具", "家电", "生活用品", "搬家出清", "免费送"] },
  { key: "digital", label: "数码办公", description: "手机、电脑、外设和电子产品", categories: ["手机数码", "电脑办公", "电子产品"] },
  { key: "study", label: "学习票券", description: "教材、书籍、考试资料和票券卡券", categories: ["教材", "书籍教材", "票券卡券"] },
  { key: "fashion", label: "衣物儿童", description: "衣物、母婴、运动户外用品", categories: ["衣物", "母婴儿童", "运动户外"] },
  { key: "wanted", label: "求购", description: "找物品、收二手、可商量", categories: ["求购"] },
];

function createCategoryGroupsFor(type: KXListingType, choices: string[]): CreateCategoryGroup[] {
  const allowed = new Set(choices);
  if (type === "secondhand") {
    return appendUngroupedCategories(
      SECONDHAND_CREATE_GROUPS.map((group) => ({ ...group, categories: group.categories.filter((item) => allowed.has(item)) })).filter((group) => group.categories.length),
      choices,
    );
  }
  if (type === "local_service") {
    const groups = SERVICE_SECTIONS
      .filter((section) => section.key !== "all")
      .map((section) => ({
        key: section.key,
        label: section.zh,
        description: serviceSectionDescription(section.key),
        categories: section.categories.filter((item) => allowed.has(item)),
      }))
      .filter((group) => group.categories.length);
    return appendUngroupedCategories(groups, choices);
  }
  return [];
}

function appendUngroupedCategories(groups: CreateCategoryGroup[], choices: string[]): CreateCategoryGroup[] {
  const grouped = new Set(groups.flatMap((group) => group.categories));
  const rest = choices.filter((item) => !grouped.has(item));
  if (!rest.length) return groups;
  return [...groups, { key: "other", label: "其他", description: "后台新增或自定义分类", categories: rest }];
}

function serviceSectionDescription(key: string): string {
  return {
    food: "餐厅、咖啡、点评与到店预约",
    stay: "民宿",
    travel: "景点门票、一日游、本地向导",
    transfer: "机场/车站接送、包车和行李协助",
    paperwork: "材料翻译、市役所陪同、银行卡/手机卡和租房申请协助",
    moving: "搬家、退房清洁、粗大垃圾和配送协助",
    life: "手机卡、网络、水电煤、地址登记和生活跑腿",
    beauty: "美容美发、美甲、按摩、皮肤管理和体检/牙科预约协助",
  }[key] || "本地实用服务";
}

function createGroupLabel(group: CreateCategoryGroup, locale: Locale): string {
  const labels: Record<string, [string, string, string]> = {
    home: ["家具家居", "家具・暮らし", "Home"],
    digital: ["数码办公", "デジタル・オフィス", "Digital"],
    study: ["学习票券", "学習・チケット", "Study & tickets"],
    fashion: ["衣物儿童", "衣類・キッズ", "Clothing & kids"],
    wanted: ["求购", "探しています", "Wanted"],
    food: ["餐厅", "飲食店", "Restaurants"],
    stay: ["民宿", "民泊", "Homestays"],
    travel: ["旅行票务", "観光・チケット", "Travel"],
    transfer: ["接送交通", "送迎・交通", "Transfer"],
    paperwork: ["翻译手续", "翻訳・手続き", "Paperwork"],
    moving: ["搬家清洁", "引越し・清掃", "Moving"],
    life: ["生活开通", "生活手続き", "Life setup"],
    beauty: ["美容健康", "美容・健康予約", "Beauty"],
    other: ["其他", "その他", "Other"],
  };
  const copy = labels[group.key];
  return copy ? pickText(locale, copy[0], copy[1], copy[2]) : group.label;
}

function createGroupDescription(group: CreateCategoryGroup, locale: Locale): string {
  const descriptions: Record<string, [string, string, string]> = {
    home: ["桌椅床柜、搬家出清、生活用品", "家具・家電・引越し処分", "Furniture, appliances, moving sale"],
    digital: ["手机、电脑、外设和电子产品", "スマホ・PC・電子機器", "Phones, computers and electronics"],
    study: ["教材、书籍、考试资料和票券卡券", "教材・本・チケット", "Textbooks, books and tickets"],
    fashion: ["衣物、母婴、运动户外用品", "衣類・ベビー・アウトドア", "Clothing, kids and outdoors"],
    wanted: ["找物品、收二手、可商量", "探し物・買取相談", "Looking for items"],
    food: ["餐厅、咖啡、点评与到店预约", "飲食店・カフェ・来店予約", "Restaurants, cafes and table booking"],
    stay: ["民宿", "民泊", "Homestays"],
    travel: ["景点门票、一日游、本地向导", "観光チケット・日帰りツアー", "Tickets, day trips and guides"],
    transfer: ["机场/车站接送、包车和行李协助", "空港送迎・貸切・荷物サポート", "Airport transfers, charters and luggage"],
    paperwork: ["材料翻译、市役所陪同、银行卡/手机卡和租房申请协助", "書類翻訳・役所同行・銀行/SIM・賃貸申込サポート", "Documents, city office, bank/SIM and rental application help"],
    moving: ["搬家、退房清洁、粗大垃圾和配送协助", "引越し・退去清掃・粗大ごみ・配送補助", "Moving, move-out cleaning, oversized trash and delivery help"],
    life: ["手机卡、网络、水电煤、地址登记和生活跑腿", "SIM・ネット・ライフライン・住所登録・生活代行", "SIM, internet, utilities, address registration and local errands"],
    beauty: ["美容美发、美甲、按摩、皮肤管理和体检/牙科预约协助", "美容・ネイル・マッサージ・肌ケア・健診/歯科予約", "Hair, nails, massage, skin care and health booking help"],
    other: ["后台新增或自定义分类", "管理画面で追加された分類", "Admin or custom categories"],
  };
  const copy = descriptions[group.key];
  return copy ? pickText(locale, copy[0], copy[1], copy[2]) : group.description;
}

/// 租房页「民宿」标签下的筛选 chips（全部=整个住宿类目集）。
const HOMESTAY_CHIPS = ["全部", "民宿"];

// Display-only translations for the category chips. The zh value is the
// CANONICAL wire/storage format (listings store and filter by it — see
// `category = ?` in server.py), so only the label localizes, never the
// value sent to the API.
const CATEGORY_LABELS: Record<string, { ja: string; en: string }> = {
  "全部": { ja: "すべて", en: "All" },
  "家具": { ja: "家具", en: "Furniture" },
  "家电": { ja: "家電", en: "Appliances" },
  "手机数码": { ja: "スマホ・デジタル", en: "Phones & gadgets" },
  "电脑办公": { ja: "PC・オフィス", en: "Computers & office" },
  "电子产品": { ja: "電子機器", en: "Electronics" },
  "教材": { ja: "教材", en: "Textbooks" },
  "书籍教材": { ja: "本・教材", en: "Books & textbooks" },
  "衣物": { ja: "衣類", en: "Clothing" },
  "生活用品": { ja: "生活用品", en: "Daily goods" },
  "母婴儿童": { ja: "ベビー・キッズ", en: "Baby & kids" },
  "运动户外": { ja: "スポーツ・アウトドア", en: "Sports & outdoors" },
  "票券卡券": { ja: "チケット・ギフト券", en: "Tickets & gift cards" },
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
  "美容美发": { ja: "美容・ヘア", en: "Beauty & hair" },
  "宠物服务": { ja: "ペットサービス", en: "Pet care" },
  "生活支持": { ja: "生活サポート", en: "Life support" },
  "签证/手续协助": { ja: "ビザ・手続きサポート", en: "Visa & paperwork" },
  "租房申请协助": { ja: "賃貸申込サポート", en: "Rental application help" },
  "餐厅": { ja: "飲食店", en: "Restaurants" },
  "餐厅美食": { ja: "飲食店", en: "Restaurants" },
  "餐饮预约": { ja: "飲食店", en: "Restaurants" },
  "餐饮点评": { ja: "飲食口コミ", en: "Dining reviews" },
  "优惠预约": { ja: "予約特典", en: "Deals & booking" },
  "中华料理": { ja: "中華料理", en: "Chinese" },
  "日本料理": { ja: "日本料理", en: "Japanese" },
  "居酒屋": { ja: "居酒屋", en: "Izakaya" },
  "烧肉火锅": { ja: "焼肉・鍋", en: "BBQ & hot pot" },
  "拉面": { ja: "ラーメン", en: "Ramen" },
  "寿司海鲜": { ja: "寿司・海鮮", en: "Sushi & seafood" },
  "咖啡甜品": { ja: "カフェ・スイーツ", en: "Café & desserts" },
  "西餐": { ja: "洋食", en: "Western" },
  "韩国料理": { ja: "韓国料理", en: "Korean" },
  "酒店民宿": { ja: "ホテル・民泊", en: "Hotels & stays" },
  "民宿": { ja: "民泊", en: "Guesthouse" },
  "酒店": { ja: "ホテル", en: "Hotel" },
  "温泉旅馆": { ja: "温泉旅館", en: "Onsen ryokan" },
  "公寓式酒店": { ja: "アパートホテル", en: "Aparthotel" },
  "短住公寓": { ja: "短期アパート", en: "Short-stay apartment" },
  "景点门票": { ja: "観光チケット", en: "Attraction tickets" },
  "一日游": { ja: "日帰りツアー", en: "Day trips" },
  "本地向导": { ja: "ローカルガイド", en: "Local guide" },
  "体验活动": { ja: "体験アクティビティ", en: "Experiences" },
  "包车行程": { ja: "貸切ツアー", en: "Chartered tour" },
  "接送机": { ja: "空港送迎", en: "Airport transfer" },
  "机场接送": { ja: "空港送迎", en: "Airport transfer" },
  "车站接送": { ja: "駅送迎", en: "Station transfer" },
  "包车": { ja: "貸切車", en: "Private car" },
  "行李协助": { ja: "荷物サポート", en: "Luggage help" },
  "翻译手续": { ja: "翻訳・手続き", en: "Translation & paperwork" },
  "材料翻译": { ja: "書類翻訳", en: "Document translation" },
  "市役所陪同": { ja: "役所同行", en: "City-office accompaniment" },
  "银行卡协助": { ja: "銀行口座サポート", en: "Bank account help" },
  "手机卡协助": { ja: "SIMサポート", en: "SIM card help" },
  "签证材料整理": { ja: "ビザ書類整理", en: "Visa document prep" },
  "搬家清洁": { ja: "引越し・清掃", en: "Moving & cleaning" },
  "退房清洁": { ja: "退去清掃", en: "Move-out cleaning" },
  "粗大垃圾协助": { ja: "粗大ごみサポート", en: "Oversized trash help" },
  "行李搬运": { ja: "荷物運搬", en: "Luggage moving" },
  "家具家电配送协助": { ja: "家具家電配送サポート", en: "Furniture delivery help" },
  "手机卡开通": { ja: "SIM開通", en: "SIM setup" },
  "网络开通": { ja: "ネット開通", en: "Internet setup" },
  "水电煤协助": { ja: "ライフライン手続き", en: "Utilities setup" },
  "地址登记协助": { ja: "住所登録サポート", en: "Address registration help" },
  "粗大垃圾预约": { ja: "粗大ごみ予約", en: "Oversized trash booking" },
  "生活跑腿": { ja: "生活代行", en: "Local errands" },
  "美甲": { ja: "ネイル", en: "Nails" },
  "按摩": { ja: "マッサージ", en: "Massage" },
  "皮肤管理": { ja: "肌ケア", en: "Skin care" },
  "体检/牙科预约协助": { ja: "健診・歯科予約サポート", en: "Checkup/dental booking help" },
  "宠物寄养": { ja: "ペット預かり", en: "Pet boarding" },
  "遛狗": { ja: "犬の散歩", en: "Dog walking" },
  "临时照看": { ja: "一時見守り", en: "Temporary care" },
  "儿童用品租赁": { ja: "子ども用品レンタル", en: "Kids item rental" },
  "家庭协助": { ja: "家庭サポート", en: "Family support" },
  "认证服务": { ja: "認定サービス", en: "Verified services" },
  "餐饮": { ja: "飲食", en: "Dining" },
  "生活": { ja: "生活", en: "Living" },
  "学习": { ja: "学習", en: "Study" },
  "限时": { ja: "期間限定", en: "Limited-time" },
  "今天": { ja: "今日", en: "Today" },
  "本周": { ja: "今週", en: "This week" },
  "免费": { ja: "無料", en: "Free" },
};
const CATEGORY_ZH_DISPLAY_OVERRIDES: Record<string, string> = {
  "餐饮预约": "餐厅",
  "餐厅美食": "餐厅",
};

/// zh stays as-is (canonical); ja/en translate when we know the value;
/// unknown (user-typed) categories fall back to the raw value.
export function categoryLabel(value: string, locale: Locale): string {
  if (locale === "ja") return CATEGORY_LABELS[value]?.ja ?? value;
  if (locale === "en") return CATEGORY_LABELS[value]?.en ?? value;
  return CATEGORY_ZH_DISPLAY_OVERRIDES[value] ?? value;
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

const TAXONOMY_LISTING_TYPES = new Set<KXListingType>(["secondhand", "rental", "job", "hiring", "local_service", "discount"]);

function taxonomyCategoryKey(item: KXListingTaxonomyCategory): string {
  return cleanListingText(item.category_key || item.categoryKey || item.label);
}

function taxonomyFieldKey(item: KXListingTaxonomyField): string {
  return cleanListingText(item.field_key || item.fieldKey);
}

function taxonomyFieldCategoryKey(item: KXListingTaxonomyField): string {
  return cleanListingText(item.category_key || item.categoryKey);
}

function taxonomyCategories(payload?: KXListingTaxonomyPayload | null): string[] {
  const values = (payload?.categories || [])
    .filter((item) => item.is_active !== false && item.isActive !== false)
    .sort((a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0))
    .map(taxonomyCategoryKey)
    .filter(Boolean);
  return Array.from(new Set(values));
}

function taxonomyFieldOptions(field: KXListingTaxonomyField, categories: string[]): FilterOption[] {
  const raw = field.options || [];
  const options = raw.length ? raw : taxonomyFieldKey(field) === "service_type" ? categories : [];
  return options.map((item) => {
    const text = String(item);
    const [value, ...labelParts] = text.split("|");
    const label = labelParts.join("|").trim();
    return option(value.trim(), label || value.trim());
  });
}

function taxonomyFieldsFor(
  type: KXListingType,
  category: string,
  attrs: Record<string, unknown>,
  payload?: KXListingTaxonomyPayload | null,
): AttributeField[] {
  const categories = taxonomyCategories(payload);
  const categoryKey = cleanListingText(category);
  const fields = (payload?.fields || [])
    .filter((item) => item.is_active !== false && item.isActive !== false)
    .filter((item) => {
      const target = taxonomyFieldCategoryKey(item);
      return !target || target === categoryKey;
    })
    .sort((a, b) => {
      const cat = taxonomyFieldCategoryKey(a).localeCompare(taxonomyFieldCategoryKey(b), "zh-Hans-CN");
      if (cat !== 0) return cat;
      return (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0);
    })
    .map((item) => {
      const kind = item.kind || item.field_kind || item.fieldKind || "text";
      const normalizedKind: AttributeField["kind"] = kind === "select" || kind === "checkbox" || kind === "textarea" ? kind : "text";
      return {
        key: taxonomyFieldKey(item),
        label: item.label,
        required: !!item.required,
        kind: normalizedKind,
        placeholder: item.placeholder || "",
        options: normalizedKind === "select" ? taxonomyFieldOptions(item, categories) : undefined,
      };
    })
    .filter((field) => field.key && field.label);
  if (fields.length) return fields;
  return listingFormFields(type, category, attrs);
}

function getRentalTabFromUrl(): "homes" | "stays" {
  if (typeof window === "undefined") return "homes";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "stays" || tab === "hotels" ? "stays" : "homes";
}

export function CityListingChannelPage({ citySlug, kind }: { citySlug: string; kind: ChannelKind }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const city = getCityBySlug(citySlug) || getDefaultCity();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [serviceSection, setServiceSection] = useState("all");
  // 住房频道双入口：长租 / 民宿。
  const [rentalTab, setRentalTab] = useState<"homes" | "stays">("homes");
  const [sort, setSort] = useState("latest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<ListingScope>("city");
  // Optional ?seller=<userId> filter — drives the profile's "TA 的发布" view.
  const [sellerFilter, setSellerFilter] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSellerFilter(new URLSearchParams(window.location.search).get("seller") || "");
  }, [kind]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { locale } = useI18n();
  const spec = localizedChannel(kind, locale);
  const staysActive = kind === "rentals" && rentalTab === "stays";
  const lodgingActive = staysActive;
  useEffect(() => {
    // 旧 ?tab=hotels 深链统一归并到民宿。
    if (kind !== "rentals" || typeof window === "undefined") return;
    const tab = getRentalTabFromUrl();
    setRentalTab(tab);
    setCategory("全部");
    setFilters({});
    setFiltersOpen(false);
  }, [kind]);
  const scopeCountry = city.regionCode.split(".")[0] || "jp";
  const scopeCountrySpec = countryByCode(scopeCountry);
  const scopeCountryName = scopeCountrySpec ? countryDisplayName(scopeCountrySpec, locale) : "当前国家";
  const scopedCity = getCityBySlug(filters.scope_city || "");
  const scopedArea = CITY_AREA_GROUPS.find((group) => group.slug === filters.scope_area);

  const sectionCategoriesParam = kind === "services" && category === "全部"
    ? (SERVICE_SECTIONS.find((section) => section.key === serviceSection)?.categories || []).join(",")
    : "";
  // 属性筛选必须传服务端：客户端只过滤已加载页,翻页会漏掉后面页里的匹配项。
  // scope_* 与价格区间走专用参数,其余 key 原样转 attr_<key>。
  const serverAttrs = useMemo(() => Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => String(value || "").trim() && !FILTER_NON_ATTR_KEYS.has(key)),
  ), [filters]);
  // 无限分页：cursor 为字符串；工作频道合并 job+hiring 两条流,
  // 把两个游标编进同一个 JSON pageParam,各自走到尽头为止。
  const listings = useInfiniteQuery({
    queryKey: ["listings", city.slug, kind, spec.type, category, sort, query, scope, filters.scope_area || "", filters.scope_city || "", JSON.stringify(filters), rentalTab, sectionCategoriesParam, sellerFilter],
    initialPageParam: "",
    getNextPageParam: (last: { items: KXCityListing[]; next_cursor: string | null }) => last.next_cursor || undefined,
    queryFn: async ({ pageParam }) => {
      const scoped = scopedCity
        ? { city_slug: scopedCity.slug }
        : scopedArea
          ? { city_slugs: scopedArea.cities.join(",") }
          : scope === "country"
            ? { country: scopeCountry }
            : { city_slug: city.slug };
      const shared = { ...scoped, category, sort, q: query, min_price: filters.min_price, max_price: filters.max_price, attrs: serverAttrs, ...(sellerFilter ? { seller_id: sellerFilter } : {}) };
      if (lodgingActive) {
        return api.listings({
          ...shared,
          type: "local_service",
          category: category === "全部" ? "" : category,
          categories: category === "全部" ? HOMESTAY_CATEGORIES.join(",") : "",
          cursor: pageParam || undefined,
        });
      }
      if (kind === "services" && sectionCategoriesParam) {
        // 服务分区直接按正式类目集合取数，分页不漏。
        return api.listings({ ...shared, type: spec.type, category: "", categories: sectionCategoriesParam, cursor: pageParam || undefined });
      }
      if (kind !== "jobs") return api.listings({ ...shared, type: spec.type, cursor: pageParam || undefined });
      const cursors: { job?: string | null; hiring?: string | null } = pageParam
        ? JSON.parse(pageParam)
        : { job: "", hiring: "" };
      const empty = { items: [] as KXCityListing[], next_cursor: null as string | null, type: spec.type };
      const [jobs, hiring] = await Promise.all([
        cursors.job != null ? api.listings({ ...shared, type: "job", cursor: cursors.job || undefined }) : Promise.resolve(empty),
        cursors.hiring != null ? api.listings({ ...shared, type: "hiring", cursor: cursors.hiring || undefined }) : Promise.resolve(empty),
      ]);
      const nextPair = { job: jobs.next_cursor, hiring: hiring.next_cursor };
      return {
        items: [...jobs.items, ...hiring.items].sort(sortListings),
        next_cursor: nextPair.job || nextPair.hiring ? JSON.stringify(nextPair) : null,
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
  const sectionSpec = SERVICE_SECTIONS.find((section) => section.key === serviceSection);
  // 属性筛选已由服务端完成（serverAttrs），这里只保留服务页的类目归组规则。
  // 跨页按 id 去重：置顶行会同时出现在第 1 页与它的自然 keyset 槽位附近。
  const loadedItems = useMemo(() => {
    const seen = new Set<string>();
    return (listings.data?.pages || []).flatMap((page) => page.items).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [listings.data]);
  const visibleItems = loadedItems.filter((item) => {
    // 住宿类已整体归入租房页「民宿」，服务页不再展示；旧酒店类目也隐藏。
    if (kind === "services" && LEGACY_STAY_CATEGORY_SET.has(item.category || "")) return false;
    // services 分区在已抓页面上按正式类目集合过滤
    if (kind === "services" && category === "全部" && sectionSpec?.categories.length) {
      return sectionSpec.categories.includes(item.category || "");
    }
    return true;
  });
  const activeFilterCount = Object.values(filters).filter((value) => String(value || "").trim()).length;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listings;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "520px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visibleItems.length]);

  return (
    <AppShell requireAuth={false} wide right={null}>
      <div className="kx-listing-page" data-kind={kind}>
      <header className="kx-listing-header sticky top-0 z-30 px-3 pb-3 pt-2">
        <div className="relative flex items-center gap-2 pr-12 sm:pr-0">
          <Link href="/explore" className="kx-listing-icon-button">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="kx-listing-channel-icon">
            <spec.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black text-[rgb(var(--kx-living-ink))]">{city.name} · {spec.title}</h1>
            <p className="truncate text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{spec.subtitle}</p>
          </div>
          <Link href="/notifications" className="kx-listing-icon-button hidden sm:grid">
            <Bell className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                openAuthPrompt("publish");
                return;
              }
              const targetType = lodgingActive ? "local_service" : spec.type;
              const targetCategory = staysActive ? "民宿" : "";
              window.location.assign(`/listings/create?type=${targetType}&city=${city.slug}${targetCategory ? `&category=${encodeURIComponent(targetCategory)}` : ""}`);
            }}
            className="kx-listing-primary-action absolute right-0 top-0 sm:static sm:w-auto sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{spec.createLabel}</span>
          </button>
        </div>
        {kind === "jobs" ? (
          <form
            className="kx-job-search mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch(String(new FormData(event.currentTarget).get("q") || ""));
            }}
          >
            <label className="kx-job-search-field">
              <Search className="h-5 w-5" />
              <input
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
                placeholder={pickText(locale, "职位、公司或关键词", "職種・会社・キーワード", "Role, company or keywords")}
              />
            </label>
            <button type="button" onClick={() => setFiltersOpen(true)} className="kx-job-search-field text-left">
              <MapPin className="h-5 w-5" />
              <span className="min-w-0 flex-1 truncate font-semibold">{scopedCity?.name || city.name}</span>
            </button>
            <button type="submit" className="kx-job-search-submit">
              <Search className="h-4 w-4" />
              {pickText(locale, "搜索工作", "求人検索", "Search jobs")}
            </button>
          </form>
        ) : (
          <form
            className="kx-living-search mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch(String(new FormData(event.currentTarget).get("q") || ""));
            }}
          >
            <Search className="h-5 w-5" />
            <input
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
              placeholder={spec.search}
            />
            <button type="submit" className="kx-living-search-submit" aria-label={pickText(locale, "搜索", "検索", "Search")}>
              <Search className="h-4 w-4" />
            </button>
          </form>
        )}
      </header>

      <main className="px-3 py-5 sm:px-5">
        <section className="mx-auto min-w-0 max-w-6xl">
          {sellerFilter ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-kx-accent/25 bg-kx-accent/[0.07] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-black text-kx-accent">
                <Store className="h-4 w-4" />
                {pickText(locale, "正在查看 TA 的发布", "この出品者の投稿", "This seller’s posts")}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSellerFilter("");
                  if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-kx-card px-3 text-xs font-black text-kx-subtle ring-1 ring-kx-stroke/60 transition hover:text-kx-accent"
              >
                {pickText(locale, "查看全部", "すべて表示", "View all")}
              </button>
            </div>
          ) : null}
          {kind === "rentals" ? (
            // 顶部双标签：长租 / 民宿
            <div className="mb-4 flex justify-center">
              <div className="kx-listing-tabset">
                {([
                  { key: "homes" as const, Icon: Home, label: pickText(locale, "长租", "長期賃貸", "Rentals") },
                  { key: "stays" as const, Icon: BedDouble, label: pickText(locale, "民宿", "民泊", "Homestays") },
                ]).map(({ key, Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setRentalTab(key);
                      setCategory("全部");
                      setFilters({});
                      setFiltersOpen(false);
                      // 评分排序只对住宿（local_service）有意义，切回长租时还原
                      if (key === "homes") setSort((current) => (current === "rating" ? "latest" : current));
                    }}
                    data-active={rentalTab === key}
                    className="kx-listing-tab"
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <section className="kx-listing-controls mb-5">
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
                className="kx-filter-button"
              >
                <SlidersHorizontal className="h-4 w-4" />
                筛选
                {activeFilterCount ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[rgb(var(--kx-living-accent))] px-1 text-[11px] leading-none text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="kx-sort-select">
                <option value="latest">{pickText(locale, "最新发布", "新着順", "Newest")}</option>
                <option value="price_asc">{lodgingActive ? pickText(locale, "每晚价格从低到高", "1泊料金が安い順", "Nightly: low → high") : spec.type === "rental" ? pickText(locale, "租金从低到高", "家賃が安い順", "Rent: low → high") : pickText(locale, "价格从低到高", "価格が安い順", "Price: low → high")}</option>
                <option value="price_desc">{lodgingActive ? pickText(locale, "每晚价格从高到低", "1泊料金が高い順", "Nightly: high → low") : spec.type === "rental" ? pickText(locale, "租金从高到低", "家賃が高い順", "Rent: high → low") : pickText(locale, "价格从高到低", "価格が高い順", "Price: high → low")}</option>
                <option value="popular">{pickText(locale, "最多收藏", "人気順", "Most saved")}</option>
                {kind === "services" || lodgingActive ? (
                  <option value="rating">{pickText(locale, "评分优先", "評価が高い順", "Top rated")}</option>
                ) : null}
              </select>
              <p className="ml-auto hidden text-xs font-bold text-slate-400 sm:block">
                {visibleItems.length
                  ? pickText(locale, `${visibleItems.length}${listings.hasNextPage ? "+" : ""} 条结果`, `${visibleItems.length}${listings.hasNextPage ? "+" : ""} 件`, `${visibleItems.length}${listings.hasNextPage ? "+" : ""} results`)
                  : pickText(locale, "暂无结果", "結果なし", "No results")}
              </p>
              </div>
              {kind === "services" ? (
                <div className="-mx-1 min-w-0 overflow-x-auto px-1">
                  <div className="flex gap-2 pb-0.5">
                    {SERVICE_SECTIONS.map((section) => (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => {
                          setServiceSection(section.key);
                          setCategory("全部");
                        }}
                        data-active={serviceSection === section.key && category === "全部"}
                        className="kx-category-chip"
                      >
                        {pickText(locale, section.zh, section.ja, section.en)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="-mx-1 min-w-0 overflow-x-auto px-1">
                  <div className="flex gap-2 pb-0.5">
                    {(staysActive ? HOMESTAY_CHIPS : CATEGORY_CHIPS[spec.type] || ["全部"]).map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setCategory(chip)}
                        data-active={category === chip}
                        className="kx-category-chip"
                      >
                        {categoryLabel(chip, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {kind === "jobs" ? (
              // 招聘频道快捷筛选：一次点击落到属性筛选,与面板同一份 filters 状态。
              <div className="-mx-1 mt-2 min-w-0 overflow-x-auto px-1">
                <div className="flex gap-2 pb-0.5">
                  {([
                    { key: "no_experience_ok", value: "true", label: pickText(locale, "无经验可", "未経験OK", "No experience") },
                    { key: "student_ok", value: "true", label: pickText(locale, "留学生可", "留学生OK", "Students OK") },
                    { key: "remote_ok", value: "true", label: pickText(locale, "可远程", "リモート可", "Remote") },
                    { key: "visa_support", value: "available,true", label: pickText(locale, "签证支持", "ビザサポート", "Visa support") },
                    { key: "japanese_level", value: "not_required", label: pickText(locale, "日语不限", "日本語不問", "No Japanese") },
                  ]).map((chip) => {
                    const active = filters[chip.key] === chip.value;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setFilters({ ...filters, [chip.key]: active ? "" : chip.value })}
                        data-active={active}
                        className="kx-job-filter-chip"
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {filtersOpen ? (
              <div className="mt-3 border-t border-slate-200/70 pt-3">
                <ListingFilterPanel type={lodgingActive ? "local_service" : spec.type} context={lodgingActive ? "lodging" : "default"} currentCitySlug={city.slug} filters={filters} onChange={setFilters} variant="inline" />
              </div>
            ) : null}
          </section>

          {kind === "services" ? <VerifiedMerchantsStrip citySlug={city.slug} locale={locale} /> : null}

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
            kind === "marketplace" ? (
              // 二手市场：双列起步的高密度图片瀑布，价格压在图上
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((listing) => <SecondhandListingCard key={listing.id} listing={listing} />)}
              </div>
            ) : kind === "rentals" ? (
              // 照片主导网格：长租与民宿共用同一套视觉语言
              <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((listing) => (
                  <StayListingCard key={listing.id} listing={listing} locale={locale} variant={lodgingActive ? "stay" : "home"} />
                ))}
              </div>
            ) : kind === "jobs" ? (
              // 职位行卡：薪资高亮 + 标签 + 快速申请
              <div className="kx-job-list">
                {visibleItems.map((listing, index) => (
                  <Fragment key={listing.id}>
                    <JobRowCard listing={listing} locale={locale} />
                    {index === 1 ? <JobGuideInsert locale={locale} /> : null}
                  </Fragment>
                ))}
              </div>
            ) : kind === "services" ? (
              // 服务卡片：评分 + 类目 + 价位 + 预约 CTA
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((listing) => <ServiceCard key={listing.id} listing={listing} locale={locale} />)}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
                {visibleItems.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}
              </div>
            )
          ) : (
            <ListingEmptyState type={lodgingActive ? "local_service" : spec.type} cityName={city.name} stays={lodgingActive} />
          )}
          {listings.hasNextPage ? (
            <div ref={loadMoreRef} className="mt-6 flex justify-center">
              <button
                type="button"
                disabled={listings.isFetchingNextPage}
                onClick={() => listings.fetchNextPage()}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] transition hover:-translate-y-px hover:border-blue-300 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                {listings.isFetchingNextPage
                  ? pickText(locale, "正在加载…", "読み込み中…", "Loading…")
                  : pickText(locale, "加载更多", "もっと見る", "Load more")}
              </button>
            </div>
          ) : null}
        </section>
      </main>
      </div>
    </AppShell>
  );
}

export function ListingDetailPage({ listingId }: { listingId: string }) {
  const { locale } = useI18n();
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [receipt, setReceipt] = useState<InquiryReceipt | null>(null);
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
    onSuccess: (res, vars) => {
      setIntakeOpen(false);
      pushToast({ kind: "success", message: res.message || "已发送联系请求" });
      const convId = res.conversation_id || res.conversationId;
      setReceipt({
        inquiryId: res.inquiry_id || res.inquiryId,
        conversationId: convId,
        type: res.type || "general_consult",
        status: res.status || "submitted",
        title: res.success_title || res.successTitle || inquirySuccessTitle(res.type || listing.data?.type || "general_consult"),
        details: res.details && res.details.length ? res.details : vars.details,
        message: res.message,
      });
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
  const isOwner = !!(user && item.seller_user_id === user.id);
  return (
    <AppShell requireAuth={false} hideBottomNav right={<DetailContactCard item={item} onContact={openIntake} isOwner={isOwner} />}>
      <header className="kx-living-detail-header sticky top-0 z-30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={listingBackHref(item)} className="kx-listing-icon-button">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[rgb(var(--kx-living-muted))]">{cityName} · {listingTypeLabel(item.type)}</p>
            <h1 className="truncate text-lg font-black text-[rgb(var(--kx-living-ink))]">{displayTitle}</h1>
          </div>
          <button type="button" onClick={() => favorite.mutate()} className="kx-listing-icon-button ml-auto">
            <Heart className={`h-4 w-4 ${item.favorited ? "fill-rose-500 text-rose-500" : "text-slate-700"}`} />
          </button>
        </div>
      </header>
      <main className="kx-listing-detail-page px-3 py-4 sm:px-4" data-kind={item.type}>
        <section className="kx-living-detail-shell">
          {(() => {
            const galleryMedia = (item.media.length ? item.media : listingCoverMedia(item) ? [listingCoverMedia(item)!] : [{ id: "cover", listing_id: item.id, media_type: "image", url: listingCoverPreview(item), sort_order: 0, is_cover: true } satisfies KXListingMedia]).slice(0, 4);
            return (
          <div className={`kx-living-detail-gallery grid gap-2 p-2 ${galleryMedia.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {galleryMedia.map((media, index) => (
              <div key={media.id || index} className={`relative overflow-hidden rounded-[20px] bg-[rgb(var(--kx-living-soft))] ${galleryMedia.length === 1 ? "aspect-[16/9] sm:aspect-[21/9]" : "aspect-[4/3]"}`}>
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
            );
          })()}
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kx-living-detail-price text-3xl font-black">{priceLabel(item)}</p>
                <h2 className="mt-2 text-2xl font-black text-[rgb(var(--kx-living-ink))]">{displayTitle}</h2>
                {Number(item.rating_count || 0) > 0 ? (
                  <p className="mt-2"><RatingStars value={Number(item.rating_avg || 0)} count={Number(item.rating_count || 0)} size="md" /></p>
                ) : null}
                <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-[rgb(var(--kx-living-muted))]"><MapPin className="h-4 w-4" />{cleanListingText(item.location_text) || cityName}</p>
              </div>
              <StatusBadge item={item} />
            </div>
            <AttributeGrid item={item} />
            <div className="mt-5 whitespace-pre-line text-[15px] leading-7 text-[rgb(var(--kx-living-muted))]">{item.description || "发布者暂未填写详细描述。"}</div>
            <MerchantMenuPackages item={item} />
            <ListingBookingSection listingId={item.id} listingType={item.type} />
            <SellerBox item={item} />
            <ListingReviewsSection listing={item} />
            <SafetyNotice type={item.type} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => report.mutate()} className="kx-living-detail-secondary">
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
                className="kx-living-detail-secondary"
              >
                分享
              </button>
            </div>
          </div>
        </section>
        <ListingDetailRecommendations item={item} />
      </main>
      <div
        className="kx-living-detail-bottom fixed inset-x-0 bottom-0 z-50 px-3 pt-3 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        {isOwner ? (
          <Link
            href={`/listings/create?type=${item.type}&edit=${item.id}`}
            className="kx-living-detail-primary flex h-12 w-full items-center justify-center rounded-full text-sm font-black text-white transition active:scale-[0.99]"
          >
            编辑信息
          </Link>
        ) : (
          <button
            type="button"
            onClick={openIntake}
            className="kx-living-detail-primary h-12 w-full rounded-full text-sm font-black text-white transition active:scale-[0.99]"
          >
            {contactActionLabel(item, locale)}
          </button>
        )}
      </div>
      <IntakeSheet
        item={item}
        open={intakeOpen}
        submitting={contact.isPending}
        onClose={() => setIntakeOpen(false)}
        onSubmit={(msg, details) => contact.mutate({ message: msg, details })}
      />
      <InquirySuccessSheet item={item} receipt={receipt} onClose={() => setReceipt(null)} />
    </AppShell>
  );
}

export function CreateListingPage({
  initialType = "secondhand",
  initialCitySlug = "tokyo",
  initialCategory = "",
  editListingId = "",
}: {
  initialType?: string;
  initialCitySlug?: string;
  initialCategory?: string;
  editListingId?: string;
} = {}) {
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
  const [category, setCategory] = useState(cleanListingText(initialCategory));
  const [categoryGroup, setCategoryGroup] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<KXMedia[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressEntry>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [editHydrated, setEditHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localPreviewUrlsRef = useRef<Set<string>>(new Set());
  const isEditing = Boolean(editListingId);
  const draftKey = `machi.listingDraft.${type}.${regionCode}`;
  const createLabel = isEditing ? "保存修改" : type === "rental" || type === "job" || type === "hiring" || type === "local_service" ? "提交审核" : "发布";
  const taxonomyQuery = useQuery({
    queryKey: ["listing-taxonomy", type],
    queryFn: () => api.listingTaxonomy(type),
    enabled: TAXONOMY_LISTING_TYPES.has(type),
    staleTime: 5 * 60 * 1000,
  });
  const categoryChoices = useMemo(() => {
    const configured = taxonomyCategories(taxonomyQuery.data);
    const choices = configured.length ? configured : (CATEGORY_CHIPS[type] || []).filter((chip) => chip !== "全部");
    if (type !== "local_service") return choices;
    return choices.filter((item) => !LEGACY_STAY_CATEGORY_SET.has(item) || item === category);
  }, [category, taxonomyQuery.data, type]);
  const categoryGroups = useMemo(() => createCategoryGroupsFor(type, categoryChoices), [categoryChoices, type]);
  const activeCategoryGroup = categoryGroups.find((group) => group.key === categoryGroup) || categoryGroups[0];
  const visibleCategoryChoices = categoryGroups.length ? activeCategoryGroup?.categories || [] : categoryChoices;
  const createFields = useMemo(
    () => taxonomyFieldsFor(type, category, attributes, taxonomyQuery.data),
    [attributes, category, taxonomyQuery.data, type],
  );
  const serviceVertical = type === "local_service" ? getServiceVertical(category, attributes) : "";
  const imageLimit = listingImageLimit(type);
  const mediaLimit = imageLimit;
  const membershipRequired = listingTypeRequiresMembership(type);
  const membershipChannelLabel = type === "rental" ? "租房" : type === "job" || type === "hiring" ? "招聘" : "本地商家/服务";
  const membershipBlocked = !isEditing && membershipRequired && !user?.is_verified_member;
  const editQuery = useQuery({
    queryKey: ["listing-edit", editListingId],
    queryFn: () => api.listing(editListingId),
    enabled: isEditing && Boolean(user),
  });

  const rememberLocalPreviewUrl = (url: string) => {
    if (url.startsWith("blob:")) localPreviewUrlsRef.current.add(url);
    return url;
  };

  useEffect(() => () => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (isEditing) return;
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
  }, [isEditing, userRegion]);

  useEffect(() => {
    if (!categoryGroups.length) {
      if (categoryGroup) setCategoryGroup("");
      return;
    }
    const selectedGroup = category ? categoryGroups.find((group) => group.categories.includes(category))?.key : "";
    const nextGroup = selectedGroup || (categoryGroups.some((group) => group.key === categoryGroup) ? categoryGroup : categoryGroups[0].key);
    if (nextGroup !== categoryGroup) setCategoryGroup(nextGroup);
  }, [category, categoryGroup, categoryGroups]);

  useEffect(() => {
    const listing = editQuery.data;
    if (!isEditing || !listing || editHydrated) return;
    const nextRegionCode = listing.region_code || listing.regionCode || getCityBySlug(listing.city_slug || listing.citySlug || "")?.regionCode || regionCode;
    const nextRegion = resolveRegion(nextRegionCode);
    setType(listing.type);
    setCountry(listing.country_code || listing.countryCode || nextRegion?.country_code || country);
    setRegionCode(nextRegionCode);
    setRegionSource("initial");
    setTitle(listing.title || "");
    setDescription(listing.description || "");
    setCategory(listing.category || "");
    setPrice(listing.price == null ? "" : String(listing.price));
    setLocation(listing.location_text || listing.locationText || "");
    const hydratedAttributes = Object.fromEntries(
      Object.entries(listing.attributes || {}).map(([key, value]) => {
        // menu / packages 是结构化数组,编辑时还原成「一行一项」文本供 textarea 使用。
        if (key === "menu") return [key, menuToLines(value)];
        if (key === "packages") return [key, packagesToLines(value)];
        return [key, String(value ?? "")];
      }),
    );
    setAttributes(hydratedAttributes);
    setMedia((listing.media || []).flatMap((item) => {
      const id = item.uploaded_file_id || item.uploadedFileId;
      if (!id) return [];
      const rawType = item.media_type || item.mediaType || item.type || "image";
      const mediaType: "image" | "video" | "audio" | "file" = rawType === "video" ? "video" : "image";
      return [{
        id,
        owner_id: "",
        type: mediaType,
        url: item.url || "",
        cdnUrl: item.cdnUrl,
        publicUrl: item.publicUrl,
        thumb_url: item.thumb_url || "",
        thumbUrl: item.thumbUrl,
        thumbnail_url: item.thumbnail_url,
        thumbnailUrl: item.thumbnailUrl,
        poster_url: item.poster_url,
        posterUrl: item.posterUrl,
        mime: item.mime || item.content_type || item.contentType || "",
        duration: item.duration,
        duration_seconds: item.duration_seconds,
        durationSeconds: item.durationSeconds,
        created_at: "",
      }];
    }));
    setEditHydrated(true);
  }, [country, editHydrated, editQuery.data, isEditing, regionCode]);

  useEffect(() => {
    if (isEditing) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as { title?: string; description?: string; category?: string; price?: string; location?: string; attributes?: Record<string, string> };
      setTitle(draft.title || "");
      setDescription(draft.description || "");
      const draftCategory = draft.category || "";
      setCategory(draftCategory);
      setPrice(draft.price || "");
      setLocation(draft.location || "");
      setAttributes(draft.attributes || {});
    } catch {
      // local draft corruption should not block publishing
    }
  }, [draftKey, isEditing, type]);

  const saveDraft = () => {
    if (isEditing) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, JSON.stringify({ title, description, category, price, location, attributes }));
    setDraftSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
    pushToast({ kind: "success", message: "草稿已保存" });
  };

  const applyType = (nextType: KXListingType) => {
    setType(nextType);
    setCategory("");
    setCategoryGroup("");
    setAttributes({});
    setFieldErrors({});
  };

  const applyCategory = (nextCategory: string) => {
    const cleanCategory = cleanListingText(nextCategory);
    setCategory(cleanCategory);
    clearFieldError(setFieldErrors, "category");
    if (type === "local_service") {
      setAttributes((current) => sanitizeServiceAttributesForCategory(cleanCategory, current, taxonomyFieldsFor(type, cleanCategory, current, taxonomyQuery.data)));
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "请填写标题";
    if (!category.trim()) next.category = "请选择或填写分类";
    if (type === "local_service" && !getServiceVertical(category, attributes) && !createFields.length) next.category = "请选择上方标准服务细分类";
    if (!location.trim()) next.location = "请填写展示地点或区域";
    if ((type === "secondhand" || type === "rental" || type === "job" || type === "hiring") && !price.trim()) next.price = type === "rental" ? "请填写月租" : type === "secondhand" ? "请填写价格，免费送可填 0" : "请填写薪资";
    if (price.trim() && Number.isNaN(Number(price))) next.price = "金额只能填写数字";
    createFields.forEach((field) => {
      if (field.required && !String(attributes[field.key] || "").trim()) next[field.key] = `请填写${field.label}`;
    });
    if (!description.trim()) next.description = "请补充描述，说明条件、范围和风险信息";
    setFieldErrors(next);
    const firstError = Object.keys(next)[0];
    if (firstError && typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-field="${firstError}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
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
      // 菜单 / 团购套餐:表单里是「一行一项」的文本,提交时解析成结构化数组
      // (后端按 json 属性存储)。
      const finalAttributes: Record<string, unknown> = type === "local_service"
        ? sanitizeServiceAttributesForCategory(category, attributes, createFields)
        : { ...attributes };
      if (type === "local_service") {
        if (typeof finalAttributes.menu === "string") finalAttributes.menu = parseMenuLines(finalAttributes.menu);
        if (typeof finalAttributes.packages === "string") finalAttributes.packages = parsePackageLines(finalAttributes.packages);
      }
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
        attributes: finalAttributes,
        media_ids: mediaIds,
        mediaIds,
        cover_media_id: mediaIds[0],
        coverMediaId: mediaIds[0],
      };
      return isEditing ? api.updateListing(editListingId, payload) : api.createListing(payload);
    },
    onSuccess: (listing) => {
      if (!isEditing && typeof window !== "undefined") window.localStorage.removeItem(draftKey);
      pushToast({
        kind: "success",
        message: listing.status === "pending_review"
          ? isEditing ? "修改已保存并提交复审，通过后会自动展示。" : "已提交管理员审核，审核时间一般在 1 天内，通过后会自动展示，可在「我的发布」查看。"
          : isEditing ? "修改已保存，Web 与 iOS 会同步更新。" : "发布成功，三端会同步展示。",
      });
      router.push(listing.status === "pending_review" ? "/my/listings" : detailHref(listing));
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("publish");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });

  return (
    <AppShell requireAuth right={null} wide>
      <main className="px-3 py-4 sm:px-4">
        <section className="rounded-[30px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_58px_-40px_rgba(15,23,42,0.52)] backdrop-blur">
          <div className="flex items-center gap-3">
            <Link href="/explore" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
            <div>
              <h1 className="text-2xl font-black text-slate-950">{isEditing ? "编辑城市信息" : "发布城市信息"}</h1>
              <p className="text-sm font-semibold text-slate-500">{isEditing ? "修改后的内容会同步到 Web 与 iOS；重要内容变更可能重新进入审核。" : "日常动态留在首页；二手、租房、工作、商家与服务和优惠会进入各自的城市频道。"}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5">
            <section>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">选择发布类型</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {(["secondhand", "rental", "job", "hiring", "local_service", "discount"] as KXListingType[]).map((value) => (
                <button key={value} type="button" disabled={isEditing} onClick={() => applyType(value)} data-active={type === value} className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:-translate-y-px hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white data-[active=true]:opacity-100">
                  {listingTypeLabel(value)}
                </button>
              ))}
              </div>
            </section>

            {membershipRequired && !isEditing ? (
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                <Field field="category" label="分类" required error={fieldErrors.category}>
                  {categoryGroups.length ? (
                    <div className="mb-3 space-y-2">
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {categoryGroups.map((group) => (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => setCategoryGroup(group.key)}
                            data-active={activeCategoryGroup?.key === group.key}
                            className="group min-w-[132px] shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950"
                          >
                            <span className="block text-sm font-black text-slate-800 group-data-[active=true]:text-white">{createGroupLabel(group, locale)}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-400 group-data-[active=true]:text-white/65">{createGroupDescription(group, locale)}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs font-bold text-slate-400">{pickText(locale, "先选一级方向，再选择具体二级分类，发布后会按都市圈频道展示。", "先に大分類を選び、次に細分類を選択してください。投稿は都市圏チャンネルに表示されます。", "Choose a primary group first, then a specific category. Listings are shown by metro area.")}</p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 pb-1.5">
                    {visibleCategoryChoices.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => applyCategory(chip)}
                        data-active={category === chip}
                        className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white hover:border-blue-300 hover:text-blue-700"
                      >
                        {categoryLabel(chip, locale)}
                      </button>
                    ))}
                  </div>
                  <input value={category} onChange={(e) => applyCategory(e.target.value)} className="kx-input h-11" placeholder={categoryPlaceholder(type)} />
                  {type === "local_service" && serviceVertical ? (
                    <p className="mt-1.5 text-xs font-bold text-slate-500">已切换为 {SERVICE_VERTICAL_LABEL[serviceVertical]} 表单</p>
                  ) : null}
                </Field>
                <Field field="title" label={type === "job" || type === "hiring" ? "职位标题" : type === "local_service" ? "服务标题" : type === "discount" ? "优惠标题" : "标题"} required error={fieldErrors.title}>
                  <input value={title} onChange={(e) => { setTitle(e.target.value); clearFieldError(setFieldErrors, "title"); }} className="kx-input h-11" placeholder={titlePlaceholder(type)} />
                </Field>
                <Field field="price" label={priceFieldLabel(type)} required={type !== "discount"} error={fieldErrors.price}>
                  <input value={price} onChange={(e) => { setPrice(e.target.value.replace(/[^\d.]/g, "")); clearFieldError(setFieldErrors, "price"); }} className="kx-input h-11" placeholder={pricePlaceholder(type)} inputMode="decimal" />
                </Field>
                <Field field="location" label="展示地点 / 区域" required error={fieldErrors.location}>
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
              <ListingAttributeEditor
                type={type}
                category={category}
                fields={createFields}
                value={attributes}
                errors={fieldErrors}
                onCategorySelect={applyCategory}
                onChange={(next) => { setAttributes(next); setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key in next ? String(next[key] || "").trim() === "" : true))); }}
              />
            </section>

            <Field field="description" label="描述" required error={fieldErrors.description}>
              <textarea value={description} onChange={(e) => { setDescription(e.target.value); clearFieldError(setFieldErrors, "description"); }} className="kx-input min-h-32 p-3" placeholder="补充状态、交易方式、入住条件、工作内容、服务范围、预约规则、旅行/景点说明或安全提示。" />
            </Field>
            <SafetyNotice type={type} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold text-slate-500">
                {isEditing ? "正在编辑已发布内容，保存后会立即同步或进入复审。" : draftSavedAt ? `草稿已保存于 ${draftSavedAt}` : "草稿会保存在当前浏览器，可随时手动保存。"}
              </div>
              <div className="flex gap-2">
                {!isEditing ? <button type="button" onClick={saveDraft} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">保存草稿</button> : null}
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

/// 我的发布的状态分组：owner 视图一次拿全量,分组在客户端完成。
const MY_LISTING_STATUS_GROUPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "all", label: "全部", statuses: [] },
  { key: "live", label: "展示中", statuses: ["published", "reserved"] },
  { key: "review", label: "审核中", statuses: ["pending_review"] },
  { key: "paused", label: "已下架", statuses: ["hidden", "draft"] },
  { key: "done", label: "已结束", statuses: ["sold", "rented", "closed", "expired"] },
  { key: "rejected", label: "未通过", statuses: ["rejected"] },
];

/// Shared workbench page header: a back button + title, so every page reached
/// from the 工作台 has a clear way back. Used across all /my/* pages.
function WorkbenchBackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="返回"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kx-stroke/60 bg-kx-card text-kx-text shadow-[0_8px_22px_-16px_rgba(15,23,42,0.5)] transition hover:border-kx-accent/40 hover:text-kx-accent active:scale-95"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-black text-kx-text">{title}</h1>
        {subtitle ? <p className="truncate text-sm font-semibold text-kx-subtle">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function MyListingsPage({ saved = false }: { saved?: boolean }) {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [type, setType] = useState<KXListingType>("secondhand");
  const [statusGroup, setStatusGroup] = useState("all");
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
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <WorkbenchBackHeader title={saved ? "我的收藏" : "我的发布"} />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(["secondhand", "rental", "job", "hiring", "local_service", "discount"] as KXListingType[]).map((item) => (
            <button key={item} onClick={() => { setType(item); setStatusGroup("all"); }} data-active={type === item} className="h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-sm font-bold data-[active=true]:bg-slate-950 data-[active=true]:text-white">
              {listingTypeLabel(item)}
            </button>
          ))}
        </div>
        {!saved && (query.data?.length || 0) > 0 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {MY_LISTING_STATUS_GROUPS.map((group) => {
              const count = group.key === "all"
                ? (query.data || []).length
                : (query.data || []).filter((item) => group.statuses.includes(item.status)).length;
              if (group.key !== "all" && !count) return null;
              return (
                <button key={group.key} onClick={() => setStatusGroup(group.key)} data-active={statusGroup === group.key} className="h-8 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-500 data-[active=true]:border-blue-600 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700">
                  {group.label} {count}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {query.isLoading ? <SectionLoading title={saved ? "正在加载收藏" : "正在加载发布"} rows={3} /> : query.isError ? (
            <section className="rounded-3xl border border-slate-200/70 bg-white">
              <ErrorState title={saved ? "收藏暂时无法加载" : "发布记录暂时无法加载"} onRetry={() => query.refetch()} />
            </section>
          ) : query.data?.length ? (() => {
            const activeGroup = MY_LISTING_STATUS_GROUPS.find((group) => group.key === statusGroup);
            const filtered = (query.data || []).filter((item) => saved || !activeGroup?.statuses.length || activeGroup.statuses.includes(item.status));
            if (!filtered.length) return <ListingEmptyState type={type} cityName="本地" />;
            return filtered.map((item) => (
              saved ? <StructuredListCard key={item.id} listing={item} /> : <ListingManageCard key={item.id} listing={item} onStatus={(status) => update.mutate({ id: item.id, status })} onDelete={() => remove.mutate(item.id)} />
            ));
          })() : <ListingEmptyState type={type} cityName="本地" />}
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
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <WorkbenchBackHeader title={title} subtitle="联系记录绑定具体城市信息，避免把高意图咨询混进普通私信。" />
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
    <AppShell requireAuth wide right={null}>
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <WorkbenchBackHeader title="我的订单" subtitle="会员订单、Guide 资料订单和服务类订单统一追踪。" />
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
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const listings = useQuery({
    queryKey: ["admin-listings", type, status, verificationStatus, q],
    queryFn: () => api.adminListings({ q, type, status, verification_status: verificationStatus }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.adminUpdateListing>[1] }) => api.adminUpdateListing(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
      pushToast({ kind: "success", message: "审核状态已更新" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.adminDeleteListing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
      pushToast({ kind: "success", message: "已删除" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  return (
    <AppShell requireAuth>
      <main className="px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-slate-950">Listing 审核</h1>
          <select value={type} onChange={(e) => setType(e.target.value)} className="kx-input h-10 w-40"><option value="">全部类型</option><option value="secondhand">二手</option><option value="rental">租房</option><option value="job,hiring">工作</option><option value="job">找工作</option><option value="hiring">招聘</option><option value="local_service">商家与服务</option><option value="discount">商家优惠</option><option value="event">活动</option></select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-44"><option value="">全部状态</option><option value="pending_review">待审核</option><option value="published">已发布</option><option value="hidden">已下架</option><option value="rejected">已拒绝</option></select>
          <select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} className="kx-input h-10 w-44"><option value="">全部核验</option><option value="unverified">未认证</option><option value="pending">待核验</option><option value="verified">已认证</option><option value="needs_review">需复核</option><option value="rejected">核验拒绝</option></select>
          <form onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); }} className="flex items-center gap-2">
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="搜索标题 / 描述 / 地点" className="kx-input h-10 w-56" />
            <button type="submit" className="h-10 rounded-full bg-slate-900 px-4 text-xs font-black text-white">搜索</button>
            {q ? <button type="button" onClick={() => { setQ(""); setQInput(""); }} className="h-10 rounded-full bg-slate-100 px-3 text-xs font-black text-slate-600">清除</button> : null}
          </form>
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
                <button onClick={() => { if (window.confirm("确定删除这条信息？删除后会立即从 App 中消失（可在数据库恢复）。")) remove.mutate(item.id); }} disabled={remove.isPending} className="h-9 rounded-full bg-rose-700 px-3 text-xs font-black text-white disabled:opacity-50">删除</button>
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

export function AdminListingReviewsPage() {
  const [status, setStatus] = useState("published");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const query = useQuery({
    queryKey: ["admin-listing-reviews", status, q],
    queryFn: () => api.adminListingReviews({ status: status || undefined, q: q || undefined }),
  });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "published" | "hidden" | "deleted" }) => api.adminUpdateListingReview(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-listing-reviews"] });
      pushToast({ kind: "success", message: "点评状态已更新，评分已重算。" });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message || "点评更新失败" }),
  });
  const rows = query.data || [];
  return (
    <AdminRecordPage
      title="点评审核"
      right={(
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="kx-input h-10 w-56" placeholder="搜索点评内容、服务标题" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10 w-36">
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="hidden">已隐藏</option>
            <option value="deleted">已删除</option>
          </select>
        </div>
      )}
    >
      <AdminRecordQueryState query={query} title="正在加载点评" errorTitle="点评暂时无法加载" />
      <div className="divide-y divide-slate-100">
        {rows.map((review) => (
          <div key={review.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <RatingStars value={review.rating} showValue={false} />
              <span className="text-xs font-black text-slate-500">{review.author?.display_name || review.author?.handle || review.user_id}</span>
              <span className="text-xs font-bold text-slate-400">{(review.created_at || "").slice(0, 16).replace("T", " ")}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${review.status === "published" ? "bg-emerald-50 text-emerald-700" : review.status === "hidden" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                {review.status === "published" ? "已发布" : review.status === "hidden" ? "已隐藏" : "已删除"}
              </span>
              {review.listing_title ? (
                <Link href={`/listings/${encodeURIComponent(review.listing_id)}`} className="truncate text-xs font-black text-blue-600 hover:text-blue-700">
                  {review.listing_title}
                </Link>
              ) : null}
            </div>
            {review.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{review.content}</p> : null}
            {review.owner_reply ? <p className="mt-1.5 rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-500">商家回复：{review.owner_reply}</p> : null}
            <div className="mt-2.5 flex gap-1.5">
              {review.status !== "hidden" ? (
                <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: review.id, next: "hidden" })} className="h-8 rounded-full border border-amber-200 bg-amber-50 px-3 text-[11px] font-black text-amber-700 disabled:opacity-50">
                  隐藏
                </button>
              ) : null}
              {review.status !== "published" ? (
                <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: review.id, next: "published" })} className="h-8 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 disabled:opacity-50">
                  恢复
                </button>
              ) : null}
              {review.status !== "deleted" ? (
                <button type="button" disabled={update.isPending} onClick={() => update.mutate({ id: review.id, next: "deleted" })} className="h-8 rounded-full border border-rose-200 bg-rose-50 px-3 text-[11px] font-black text-rose-600 disabled:opacity-50">
                  删除
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {!query.isLoading && !query.isError && !rows.length ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">暂无点评记录</div>
        ) : null}
      </div>
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
          <AdminBusinessAction disabled={pending} tone="approve" onClick={() => onReview("verified", note.trim())} label="通过认证" />
          <AdminBusinessAction disabled={pending || !note.trim()} tone="review" onClick={() => onReview("needs_review", note.trim())} label="补材料" />
          <AdminBusinessAction disabled={pending || !note.trim()} tone="reject" onClick={() => onReview("rejected", note.trim())} label="拒绝" />
          <AdminBusinessAction disabled={pending} tone="pause" onClick={() => onReview("suspended", note.trim() || "商家服务已暂停展示，请联系后台复核。")} label="暂停" />
        </div>
        {!note.trim() ? (
          <p className="mt-2 text-[11px] font-semibold text-slate-400">拒绝 / 补材料 前请在上方填写给商家的具体说明。</p>
        ) : null}
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

// ── 服务频道分区──────────────────────────────────────────────────────────
// 与发布页第一阶段正式类目保持一致；旧伞类目只做详情/筛选兼容。
const SERVICE_SECTIONS: { key: string; zh: string; ja: string; en: string; categories: string[] }[] = [
  { key: "all", zh: "全部", ja: "すべて", en: "All", categories: [] },
  { key: "food", zh: "餐厅", ja: "飲食店", en: "Restaurants", categories: FOOD_SECTION_CATEGORIES },
  { key: "travel", zh: "旅行票务", ja: "観光・体験", en: "Travel & Tickets", categories: [...TRAVEL_SECTION_CATEGORIES] },
  { key: "transfer", zh: "接送交通", ja: "送迎・交通", en: "Transfer", categories: [...TRANSFER_SECTION_CATEGORIES] },
  { key: "paperwork", zh: "翻译手续", ja: "翻訳・手続き", en: "Paperwork", categories: [...PAPERWORK_SECTION_CATEGORIES] },
  { key: "moving", zh: "搬家清洁", ja: "引越し・清掃", en: "Moving", categories: [...MOVING_SECTION_CATEGORIES] },
  { key: "life", zh: "生活开通", ja: "生活手続き", en: "Life setup", categories: [...LIFE_SETUP_SECTION_CATEGORIES] },
  { key: "beauty", zh: "美容健康", ja: "美容・健康予約", en: "Beauty", categories: [...BEAUTY_HEALTH_SECTION_CATEGORIES] },
];

const SERVICE_CATEGORY_META: Record<string, { Icon: typeof Store; tone: string }> = {
  "中华料理": { Icon: UtensilsCrossed, tone: "bg-rose-500/10 text-rose-600" },
  "日本料理": { Icon: ChefHat, tone: "bg-orange-500/10 text-orange-600" },
  "居酒屋": { Icon: Beer, tone: "bg-amber-500/10 text-amber-700" },
  "烧肉火锅": { Icon: Flame, tone: "bg-red-500/10 text-red-600" },
  "拉面": { Icon: Soup, tone: "bg-yellow-500/10 text-yellow-700" },
  "寿司海鲜": { Icon: Fish, tone: "bg-sky-500/10 text-sky-600" },
  "咖啡甜品": { Icon: Coffee, tone: "bg-amber-500/10 text-amber-800" },
  "西餐": { Icon: Pizza, tone: "bg-lime-500/10 text-lime-700" },
  "韩国料理": { Icon: CookingPot, tone: "bg-rose-500/10 text-rose-700" },
  "餐饮点评": { Icon: Utensils, tone: "bg-rose-500/10 text-rose-600" },
  "优惠预约": { Icon: Tag, tone: "bg-orange-500/10 text-orange-600" },
  "酒店民宿": { Icon: Bed, tone: "bg-cyan-500/10 text-cyan-700" },
  "民宿": { Icon: BedDouble, tone: "bg-cyan-500/10 text-cyan-700" },
  "酒店": { Icon: Hotel, tone: "bg-blue-500/10 text-blue-700" },
  "温泉旅馆": { Icon: Waves, tone: "bg-teal-500/10 text-teal-700" },
  "公寓式酒店": { Icon: Building2, tone: "bg-indigo-500/10 text-indigo-600" },
  "短住公寓": { Icon: Building2, tone: "bg-indigo-500/10 text-indigo-600" },
  "景点门票": { Icon: Ticket, tone: "bg-violet-500/10 text-violet-600" },
  "一日游": { Icon: Landmark, tone: "bg-emerald-500/10 text-emerald-700" },
  "本地向导": { Icon: Landmark, tone: "bg-emerald-500/10 text-emerald-700" },
  "体验活动": { Icon: Sparkles, tone: "bg-violet-500/10 text-violet-600" },
  "包车行程": { Icon: Bus, tone: "bg-blue-500/10 text-blue-600" },
  "接送机": { Icon: Bus, tone: "bg-blue-500/10 text-blue-600" },
  "机场接送": { Icon: Bus, tone: "bg-blue-500/10 text-blue-600" },
  "车站接送": { Icon: Train, tone: "bg-blue-500/10 text-blue-600" },
  "包车": { Icon: Bus, tone: "bg-blue-500/10 text-blue-600" },
  "行李协助": { Icon: Bus, tone: "bg-cyan-500/10 text-cyan-700" },
  "材料翻译": { Icon: Languages, tone: "bg-indigo-500/10 text-indigo-600" },
  "市役所陪同": { Icon: FileCheck2, tone: "bg-indigo-500/10 text-indigo-600" },
  "银行卡协助": { Icon: FileCheck2, tone: "bg-indigo-500/10 text-indigo-600" },
  "手机卡协助": { Icon: FileCheck2, tone: "bg-indigo-500/10 text-indigo-600" },
  "签证材料整理": { Icon: FileCheck2, tone: "bg-indigo-500/10 text-indigo-600" },
  "翻译手续": { Icon: Languages, tone: "bg-indigo-500/10 text-indigo-600" },
  "签证/手续协助": { Icon: FileCheck2, tone: "bg-indigo-500/10 text-indigo-600" },
  "翻译": { Icon: Languages, tone: "bg-indigo-500/10 text-indigo-600" },
  "搬家清洁": { Icon: Sparkles, tone: "bg-teal-500/10 text-teal-700" },
  "搬家": { Icon: Bus, tone: "bg-cyan-500/10 text-cyan-700" },
  "清洁": { Icon: Sparkles, tone: "bg-teal-500/10 text-teal-700" },
  "退房清洁": { Icon: Sparkles, tone: "bg-teal-500/10 text-teal-700" },
  "粗大垃圾协助": { Icon: Sparkles, tone: "bg-teal-500/10 text-teal-700" },
  "行李搬运": { Icon: Bus, tone: "bg-cyan-500/10 text-cyan-700" },
  "家具家电配送协助": { Icon: Bus, tone: "bg-cyan-500/10 text-cyan-700" },
  "手机卡开通": { Icon: Store, tone: "bg-emerald-500/10 text-emerald-700" },
  "网络开通": { Icon: Store, tone: "bg-emerald-500/10 text-emerald-700" },
  "水电煤协助": { Icon: Store, tone: "bg-emerald-500/10 text-emerald-700" },
  "地址登记协助": { Icon: Home, tone: "bg-emerald-500/10 text-emerald-700" },
  "粗大垃圾预约": { Icon: Sparkles, tone: "bg-teal-500/10 text-teal-700" },
  "生活跑腿": { Icon: Store, tone: "bg-emerald-500/10 text-emerald-700" },
  "美容美发": { Icon: Sparkles, tone: "bg-fuchsia-500/10 text-fuchsia-600" },
  "美甲": { Icon: Sparkles, tone: "bg-fuchsia-500/10 text-fuchsia-600" },
  "按摩": { Icon: Sparkles, tone: "bg-fuchsia-500/10 text-fuchsia-600" },
  "皮肤管理": { Icon: Sparkles, tone: "bg-fuchsia-500/10 text-fuchsia-600" },
  "体检/牙科预约协助": { Icon: FileCheck2, tone: "bg-fuchsia-500/10 text-fuchsia-600" },
  "宠物服务": { Icon: Heart, tone: "bg-rose-500/10 text-rose-600" },
  "生活支持": { Icon: Store, tone: "bg-emerald-500/10 text-emerald-700" },
  "租房申请协助": { Icon: Home, tone: "bg-orange-500/10 text-orange-600" },
  "认证服务": { Icon: BadgeCheck, tone: "bg-emerald-500/10 text-emerald-700" },
};

export function RatingStars({ value, count, size = "sm", showValue = true }: { value: number; count?: number; size?: "sm" | "md"; showValue?: boolean }) {
  const stars = Math.max(0, Math.min(5, value || 0));
  const dim = size === "md" ? "h-4.5 w-4.5" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${dim} ${star <= Math.round(stars) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}`}
          />
        ))}
      </span>
      {showValue && stars > 0 ? <span className={`font-black text-amber-600 ${size === "md" ? "text-base" : "text-xs"}`}>{stars.toFixed(1)}</span> : null}
      {typeof count === "number" && count > 0 ? <span className="text-xs font-bold text-slate-400">({count})</span> : null}
    </span>
  );
}

function listingAttr(listing: KXCityListing, key: string): string {
  const raw = (listing.attributes || {})[key];
  if (raw == null) return "";
  const value = String(raw).trim();
  if (!value || value === "false" || value === "0") return "";
  return value;
}

function listingAttrFlag(listing: KXCityListing, key: string): boolean {
  const raw = (listing.attributes || {})[key];
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "是";
}

type MenuDish = { name?: string; price?: string; desc?: string };
type ListingPackage = { title?: string; price?: string; original_price?: string; includes?: string; note?: string };

/// menu / packages come back as parsed arrays (json attribute type); tolerate a
/// raw JSON string too in case an old row stored it that way.
function listingAttrArray<T>(listing: KXCityListing, key: string): T[] {
  const raw = (listing.attributes || {})[key];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// 「一行一项,用 | 分隔」<-> 结构化数组。商家在发布页里按行填写,提交解析成数组;
// 编辑时再把数组还原成多行文本。
function parseMenuLines(text: string): MenuDish[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const p = line.split("|").map((s) => s.trim());
    return { name: p[0] || "", price: p[1] || "", desc: p[2] || "" };
  }).filter((d) => d.name);
}
function parsePackageLines(text: string): ListingPackage[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const p = line.split("|").map((s) => s.trim());
    return { title: p[0] || "", price: p[1] || "", original_price: p[2] || "", includes: p[3] || "" };
  }).filter((x) => x.title);
}
function menuToLines(raw: unknown): string {
  if (!Array.isArray(raw)) return typeof raw === "string" ? raw : "";
  return (raw as MenuDish[]).map((d) => [d.name, d.price, d.desc].filter((x) => (x || "").toString().trim()).join(" | ")).join("\n");
}
function packagesToLines(raw: unknown): string {
  if (!Array.isArray(raw)) return typeof raw === "string" ? raw : "";
  return (raw as ListingPackage[]).map((p) => [p.title, p.price, p.original_price, p.includes].filter((x) => (x || "").toString().trim()).join(" | ")).join("\n");
}

/// 商家详情：团购套餐(先展示、暂不支持购买) + 菜单 + 预约/到店信息。仅商家与服务
/// (local_service) 展示;无数据时不渲染。
function MerchantMenuPackages({ item }: { item: KXCityListing }) {
  if (item.type !== "local_service") return null;
  if (getServiceVertical(item.category || "", item.attributes || {}) !== "food_restaurant") return null;
  const packages = listingAttrArray<ListingPackage>(item, "packages").filter((p) => (p?.title || "").trim());
  const menu = listingAttrArray<MenuDish>(item, "menu").filter((d) => (d?.name || "").trim());
  const reservationRequired = listingAttrFlag(item, "reservation_required");
  const reservationNote = listingAttr(item, "reservation_note");
  const openHours = listingAttr(item, "open_hours");
  const storePhone = listingAttr(item, "store_phone");
  const hasReservation = reservationRequired || !!reservationNote || !!openHours || !!storePhone;
  if (!packages.length && !menu.length && !hasReservation) return null;

  return (
    <div className="mt-6 space-y-5">
      {packages.length ? (
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-[rgb(var(--kx-living-ink))]">团购套餐</h3>
            <span className="rounded-full bg-[rgb(var(--kx-living-soft))] px-2.5 py-1 text-[11px] font-black text-[rgb(var(--kx-living-muted))]">暂不支持线上购买</span>
          </div>
          <div className="mt-3 grid gap-2.5">
            {packages.map((p, i) => (
              <div key={i} className="rounded-2xl border border-[rgb(var(--kx-living-ink))]/10 bg-[rgb(var(--kx-living-surface))] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-black text-[rgb(var(--kx-living-ink))]">{p.title}</p>
                  <div className="shrink-0 text-right">
                    {p.price ? <p className="font-black text-[rgb(var(--kx-living-warm))]">{p.price}</p> : null}
                    {p.original_price ? <p className="text-xs font-semibold text-[rgb(var(--kx-living-muted))] line-through">{p.original_price}</p> : null}
                  </div>
                </div>
                {p.includes ? <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[rgb(var(--kx-living-muted))]">{p.includes}</p> : null}
                {p.note ? <p className="mt-1 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{p.note}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {menu.length ? (
        <section>
          <h3 className="text-base font-black text-[rgb(var(--kx-living-ink))]">菜单</h3>
          <div className="mt-2 divide-y divide-[rgb(var(--kx-living-ink))]/10 rounded-2xl border border-[rgb(var(--kx-living-ink))]/10 bg-[rgb(var(--kx-living-surface))] px-4">
            {menu.map((d, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-bold text-[rgb(var(--kx-living-ink))]">{d.name}</p>
                  {d.desc ? <p className="mt-0.5 text-xs text-[rgb(var(--kx-living-muted))]">{d.desc}</p> : null}
                </div>
                {d.price ? <p className="shrink-0 font-black text-[rgb(var(--kx-living-warm))]">{d.price}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {hasReservation ? (
        <section className="rounded-2xl border border-[rgb(var(--kx-living-ink))]/10 bg-[rgb(var(--kx-living-surface))] p-4">
          <h3 className="text-sm font-black text-[rgb(var(--kx-living-ink))]">预约 · 到店</h3>
          <div className="mt-2 space-y-1.5 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
            {openHours ? <p>营业时间 · {openHours}</p> : null}
            {reservationRequired ? <p>本店采用预约制，建议先预约再到店。</p> : null}
            {reservationNote ? <p className="whitespace-pre-line">{reservationNote}</p> : null}
            {storePhone ? <p>到店电话 · {storePhone}</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/// 二手市场卡：紧凑方图卡，价格压图，状态角标。
function SecondhandListingCard({ listing }: { listing: KXCityListing }) {
  const title = displayListingTitle(listing) || "城市信息";
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const coverMedia = listingCoverMedia(listing);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const coverSource = coverMedia ? mediaSourceUrl(coverMedia) : "";
  const coverArtwork = coverIsVideo ? (coverPreview || (coverSource ? fallbackVideoPoster : "")) : coverPreview;
  const useVideoFallbackArtwork = coverIsVideo && !coverPreview;
  const sold = listing.status === "sold" || listing.status === "rented" || listing.status === "closed";
  const condition = listingAttr(listing, "condition");
  const listingMode = listingAttr(listing, "listing_mode");
  const priceNegotiable = listingAttrFlag(listing, "price_negotiable");
  const deliveryMethod = String((listing.attributes || {}).delivery_method ?? "").trim().toLowerCase();
  const pickup = listingAttrFlag(listing, "pickup_available") || deliveryMethod === "pickup" || deliveryMethod === "pickup_or_shipping";
  const shipping = listingAttrFlag(listing, "shipping_available") || deliveryMethod === "shipping" || deliveryMethod === "pickup_or_shipping";
  const free = listing.price === 0;
  const badges = [listingMode, priceNegotiable ? "可议价" : "", pickup ? "可自取" : "", shipping ? "可邮寄" : "", condition]
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  return (
    <Link href={detailHref(listing)} className="kx-secondhand-card group">
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {useVideoFallbackArtwork ? (
          <span className="absolute inset-0 z-[1]" style={videoFallbackArtworkStyle} />
        ) : coverArtwork ? (
          <Image src={coverArtwork} alt={title} fill sizes="(max-width: 640px) 50vw, 240px" className="relative z-[1] object-cover transition duration-300 group-hover:scale-[1.03]" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[#f0eee8] text-emerald-700/60">
            <Tag className="h-7 w-7" />
          </span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 z-[2] grid place-items-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur">
              <Play className="h-4 w-4 fill-current" />
            </span>
          </span>
        ) : null}
        {/* 价格角标 */}
        <span className={`absolute bottom-2 left-2 z-[2] rounded-lg px-2 py-1 text-sm font-black text-white shadow-lg ${free ? "bg-emerald-600/95" : "bg-slate-950/85"}`}>
          {free ? "免费送" : priceLabel(listing)}
        </span>
        {sold ? (
          <span className="absolute inset-0 z-[3] grid place-items-center bg-slate-950/55">
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-black text-slate-950">{listingStatusText(listing)}</span>
          </span>
        ) : null}
        {condition && !sold ? (
          <span className="absolute left-2 top-2 z-[2] rounded-full bg-white/92 px-2 py-0.5 text-[10px] font-black text-slate-700 shadow-sm">{condition}</span>
        ) : null}
        <ListingHeartButton listing={listing} />
      </div>
      <div className="space-y-1 p-2.5">
        <h2 className="line-clamp-2 text-[13px] font-bold leading-[18px] text-[rgb(var(--kx-living-ink))]">{title}</h2>
        {badges.length ? (
          <div className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span key={badge} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{badge}</span>
            ))}
          </div>
        ) : null}
        <p className="flex items-center gap-1 truncate text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{location}</span>
          {typeof listing.favorite_count === "number" && listing.favorite_count > 0 ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-rose-400"><Heart className="h-3 w-3 fill-current" />{listing.favorite_count}</span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

/// 横向房源行卡，租金大字 + 结构化字段格。
/// 卡片上的心愿收藏：乐观切换，未登录引导。
function ListingHeartButton({ listing }: { listing: KXCityListing }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [favorited, setFavorited] = useState(Boolean(listing.favorited));
  const toggle = useMutation({
    mutationFn: (next: boolean) => api.favoriteListing(listing.id, next),
    onError: (e, next) => {
      setFavorited(!next);
      if (isAuthRequiredError(e)) openAuthPrompt("generic");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  return (
    <button
      type="button"
      aria-label="收藏"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
          openAuthPrompt("generic");
          return;
        }
        const next = !favorited;
        setFavorited(next);
        toggle.mutate(next);
      }}
      className="absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/92 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.18)] backdrop-blur transition hover:scale-105 active:scale-95"
    >
      <Heart className={`h-4.5 w-4.5 transition ${favorited ? "fill-rose-500 text-rose-500" : "text-slate-700"}`} />
    </button>
  );
}

/// 房源/住宿卡：大图主导、心愿收藏、评分内联、价格收尾。
/// variant=home（长租：户型/面积/敷礼金）、stay（民宿：房型/可住人数/每晚价）。
function StayListingCard({ listing, locale, variant }: { listing: KXCityListing; locale: Locale; variant: "home" | "stay" }) {
  const title = displayListingTitle(listing) || (variant === "stay" ? "住宿信息" : "房源信息");
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const ratingAvg = Number(listing.rating_avg ?? listing.ratingAvg ?? 0);
  const ratingCount = Number(listing.rating_count ?? listing.ratingCount ?? 0);
  const station = listingAttr(listing, "nearest_station") || listingAttr(listing, "near_station");
  const deposit = listingAttr(listing, "deposit");
  const keyMoney = listingAttr(listing, "key_money");
  const managementFee = listingAttr(listing, "management_fee");
  const noDeposit = deposit === "0" || /无|なし|0円/i.test(deposit);
  const noKeyMoney = keyMoney === "0" || /无|なし|0円/i.test(keyMoney);
  const maxGuests = listingAttr(listing, "max_guests");
  const subline = variant === "stay"
    ? [
        listingAttr(listing, "room_type") || categoryLabel(listing.category || "", locale),
        maxGuests ? pickText(locale, `可住 ${maxGuests} 人`, `定員 ${maxGuests} 名`, `${maxGuests} guests`) : "",
        listingAttrFlag(listing, "breakfast_included") ? pickText(locale, "含早餐", "朝食付き", "Breakfast") : "",
      ].filter(Boolean).join(" · ")
    : [
        listingAttr(listing, "layout"),
        listingAttr(listing, "area_sqm") ? `${listingAttr(listing, "area_sqm")}㎡` : "",
        listingAttr(listing, "move_in_date") ? pickText(locale, `${listingAttr(listing, "move_in_date")} 入住`, `${listingAttr(listing, "move_in_date")} 入居`, `Move in ${listingAttr(listing, "move_in_date")}`) : "",
      ].filter(Boolean).join(" · ");
  const tags = variant === "home"
    ? [
        noDeposit && deposit ? pickText(locale, "敷金 0", "敷金なし", "No deposit") : "",
        noKeyMoney && keyMoney ? pickText(locale, "礼金 0", "礼金なし", "No key money") : "",
        listingAttrFlag(listing, "furnished") ? pickText(locale, "家具家电", "家具家電付き", "Furnished") : "",
        listingAttrFlag(listing, "short_term_allowed") ? pickText(locale, "可短租", "短期OK", "Short-term OK") : "",
        listingAttrFlag(listing, "pet_allowed") ? pickText(locale, "可养宠", "ペット可", "Pets OK") : "",
      ].filter(Boolean).slice(0, 3)
    : [];
  return (
    <Link href={detailHref(listing)} className="group block">
      <div className="kx-stay-image relative aspect-[4/3] overflow-hidden bg-slate-100">
        {coverPreview ? (
          <Image src={coverPreview} alt={title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px" className="object-cover transition duration-300 group-hover:scale-[1.04]" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[rgb(var(--kx-living-soft))] text-[rgb(var(--kx-living-accent))]/55">
            {variant === "stay" ? <BedDouble className="h-8 w-8" /> : <Home className="h-8 w-8" />}
          </span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white"><Play className="h-4 w-4 fill-current" /></span>
          </span>
        ) : null}
        {listing.verification_status === "verified" ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/94 px-2.5 py-1 text-[11px] font-black text-slate-800 shadow-sm ring-1 ring-slate-900/10 backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-100 dark:ring-white/15">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
            {variant === "stay" ? pickText(locale, "认证房东", "認証ホスト", "Verified host") : pickText(locale, "已核验", "確認済み", "Verified")}
          </span>
        ) : null}
        <ListingHeartButton listing={listing} />
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-1 text-[15px] font-black text-[rgb(var(--kx-living-ink))]">{title}</h2>
          {ratingCount > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-black text-[rgb(var(--kx-living-ink))]">
              <Star className="h-3.5 w-3.5 fill-current" />
              {ratingAvg.toFixed(1)}
              <span className="font-bold text-[rgb(var(--kx-living-muted))]">({ratingCount})</span>
            </span>
          ) : variant === "stay" ? (
            <span className="mt-0.5 shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-600 dark:bg-rose-500/15">{pickText(locale, "新上线", "新着", "New")}</span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-[rgb(var(--kx-living-muted))]">
          <Train className="mr-1 inline h-3.5 w-3.5 align-[-2px] opacity-70" />
          {station || location}
        </p>
        {subline ? <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-[rgb(var(--kx-living-muted))]">{subline}</p> : null}
        <p className="mt-1.5 text-[15px] font-black text-[rgb(var(--kx-living-ink))]">
          {priceLabel(listing)}
          {variant === "home" && managementFee ? (
            <span className="ml-1.5 text-xs font-bold text-[rgb(var(--kx-living-muted))]">{pickText(locale, `管理费 ${managementFee}`, `管理費 ${managementFee}`, `+ mgmt ${managementFee}`)}</span>
          ) : null}
        </p>
        {tags.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => <span key={tag} className="rounded-md bg-[rgb(var(--kx-living-soft))] px-2 py-0.5 text-[11px] font-black text-[rgb(var(--kx-living-muted))]">{tag}</span>)}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/// 职位行卡：薪资高亮 + 条件标签 + 快速申请。
function JobRowCard({ listing, locale }: { listing: KXCityListing; locale: Locale }) {
  const title = displayListingTitle(listing) || "职位信息";
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const company = listingAttr(listing, "company_name");
  const employment = formatListingAttribute("employment_type", listingAttr(listing, "employment_type"), appLocaleToMarketingLocale(locale));
  const japanese = formatListingAttribute("japanese_level", listingAttr(listing, "japanese_level"), appLocaleToMarketingLocale(locale));
  const hours = listingAttr(listing, "working_hours");
  // visa_support 是枚举（none/consult/available）而非布尔,truthy 检查永远为
  // false——按枚举判定。
  const visaSupport = String(listing.attributes?.visa_support ?? "").trim().toLowerCase();
  const tags = [
    employment,
    japanese,
    listingAttrFlag(listing, "remote_ok") ? pickText(locale, "可远程", "リモート可", "Remote OK") : "",
    visaSupport === "available" || visaSupport === "true" ? pickText(locale, "签证支持", "ビザサポート", "Visa support") : visaSupport === "consult" ? pickText(locale, "签证可咨询", "ビザ相談可", "Visa negotiable") : "",
    listingAttrFlag(listing, "no_experience_ok") ? pickText(locale, "无经验可", "未経験OK", "No experience OK") : "",
    listingAttrFlag(listing, "student_ok") ? pickText(locale, "留学生可", "留学生OK", "Students OK") : "",
    listingAttrFlag(listing, "foreigner_friendly") ? pickText(locale, "外国人友好", "外国人歓迎", "Foreigner friendly") : "",
    listingAttrFlag(listing, "transportation_fee") ? pickText(locale, "交通费支给", "交通費支給", "Commute covered") : "",
  ].filter(Boolean);
  const urgent = Number(listing.promotion_weight || 0) > 0;
  const companyMark = (company || title).trim().slice(0, 1).toUpperCase();
  return (
    <Link href={detailHref(listing)} className="kx-job-row group">
      <div className="kx-job-company-mark">{companyMark}</div>
      <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-1 text-[17px] font-black text-[rgb(var(--kx-living-ink))] transition group-hover:text-[rgb(var(--kx-living-accent))]">
            {urgent ? (
              <span className="mr-1.5 inline-flex translate-y-[-2px] items-center rounded-md bg-rose-50 px-1.5 py-0.5 align-middle text-[10px] font-black text-rose-600 ring-1 ring-rose-100">
                {pickText(locale, "急招", "急募", "Urgent")}
              </span>
            ) : null}
            {title}
          </h2>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-bold text-[rgb(var(--kx-living-muted))]">
            {company ? (
              <>
                <span className="truncate">{company}</span>
                {listing.verification_status === "verified" ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-black text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25">
                    <BadgeCheck className="h-3 w-3" />
                    {pickText(locale, "认证雇主", "認証企業", "Verified employer")}
                  </span>
                ) : null}
                <span className="shrink-0 opacity-50">·</span>
              </>
            ) : null}
            <span className="inline-flex shrink-0 items-center gap-1 opacity-90"><MapPin className="h-3.5 w-3.5" />{location}</span>
          </p>
        </div>
        <StatusBadge item={listing} />
      </div>
      <p className="mt-2.5 text-lg font-black text-[rgb(var(--kx-living-accent))]">{priceLabel(listing)}</p>
      {tags.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => <span key={tag} className="rounded-md bg-[rgb(var(--kx-living-soft))] px-2 py-1 text-[11px] font-black text-[rgb(var(--kx-living-muted))]">{tag}</span>)}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-[rgb(var(--kx-stroke))]/15 pt-2.5">
        <span className="flex items-center gap-1 text-xs font-bold text-[rgb(var(--kx-living-muted))]">
          <Clock className="h-3.5 w-3.5" />
          {hours || formatPublishedAt(listing, locale)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-black text-[rgb(var(--kx-living-accent))]">
          {pickText(locale, "查看职位", "求人を見る", "View role")}
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      </div>
    </Link>
  );
}

function JobGuideInsert({ locale }: { locale: Locale }) {
  return (
    <Link href="/guide/career-japan" className="kx-job-guide-insert">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/18 dark:text-violet-300">
        <BookOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-black text-violet-600 dark:text-violet-300">{pickText(locale, "求职指南", "就職ガイド", "Career guide")}</span>
        <span className="mt-0.5 block truncate text-sm font-black text-[rgb(var(--kx-living-ink))]">
          {pickText(locale, "日本求职：第一次面试准备清单", "日本就職：初めての面接準備", "Japan job search: first interview checklist")}
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{pickText(locale, "指南 · 8 分钟阅读", "ガイド · 8分", "Guide · 8 min")}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[rgb(var(--kx-living-muted))]" />
    </Link>
  );
}

/// 服务卡：评分 + 类目 + 价位 + 预约 CTA。
export function ServiceCard({ listing, locale }: { listing: KXCityListing; locale: Locale }) {
  const title = displayListingTitle(listing) || "服务信息";
  const location = cleanListingText(listing.location_text) || cityLabel(listing.city_slug);
  const coverPreview = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const ratingAvg = Number(listing.rating_avg ?? listing.ratingAvg ?? 0);
  const ratingCount = Number(listing.rating_count ?? listing.ratingCount ?? 0);
  const category = listing.category || "";
  const meta = SERVICE_CATEGORY_META[category];
  const priceRange = listingAttr(listing, "price_range");
  const openHours = listingAttr(listing, "open_hours");
  const isStay = LEGACY_STAY_CATEGORY_SET.has(category);
  const isFood = FOOD_CATEGORY_SET.has(category);
  const isTicket = category === "景点门票" || category === "一日游";
  const cta = isStay
    ? pickText(locale, "查房价", "料金を見る", "Check rates")
    : isTicket
      ? pickText(locale, "订门票", "チケット予約", "Book tickets")
      : isFood
        ? pickText(locale, "在线订座", "席を予約", "Reserve a table")
        : pickText(locale, "预约", "予約する", "Book");
  return (
    <Link href={detailHref(listing)} className="kx-service-card group">
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
        {coverPreview ? (
          <Image src={coverPreview} alt={title} fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover transition duration-300 group-hover:scale-[1.03]" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[#f1ede5] text-orange-700/55">
            {meta ? <meta.Icon className="h-8 w-8" /> : <Store className="h-8 w-8" />}
          </span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white"><Play className="h-4 w-4 fill-current" /></span>
          </span>
        ) : null}
        {category ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/94 px-2.5 py-1 text-[11px] font-black text-slate-700 shadow-sm">
            {meta ? <meta.Icon className="h-3.5 w-3.5" /> : null}
            {categoryLabel(category, locale)}
          </span>
        ) : null}
        {listing.verification_status === "verified" ? (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-600/94 px-2 py-1 text-[10px] font-black text-white shadow-sm">
            <BadgeCheck className="h-3 w-3" />
            {pickText(locale, "认证商家", "認証店舗", "Verified")}
          </span>
        ) : null}
      </div>
      <div className="p-3.5">
        <h2 className="line-clamp-1 text-[15px] font-black text-[rgb(var(--kx-living-ink))]">{title}</h2>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {ratingCount > 0 ? (
            <RatingStars value={ratingAvg} count={ratingCount} />
          ) : (
            <span className="text-xs font-bold text-[rgb(var(--kx-living-muted))]">{pickText(locale, "暂无点评 · 期待你的体验", "口コミ募集中", "No reviews yet")}</span>
          )}
          <span className="shrink-0 text-sm font-black text-[rgb(var(--kx-living-warm))]">{priceRange || priceLabel(listing)}</span>
        </div>
        <p className="mt-2 flex items-center gap-1 truncate text-xs font-bold text-[rgb(var(--kx-living-muted))]">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{location}</span>
          {openHours ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1"><Clock className="h-3 w-3" />{openHours}</span>
          ) : null}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-[rgb(var(--kx-stroke))]/15 pt-2.5">
          <span className="text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
            {listing.inquiry_count ? pickText(locale, `${listing.inquiry_count} 人咨询过`, `${listing.inquiry_count} 件の問い合わせ`, `${listing.inquiry_count} inquiries`) : pickText(locale, "在线咨询 · 免费", "オンライン相談無料", "Free to ask")}
          </span>
          <span className="inline-flex h-8 items-center rounded-full bg-[rgb(var(--kx-living-accent))] px-3.5 text-xs font-black text-white shadow-[0_10px_22px_-14px_rgba(20,112,103,0.9)] transition group-hover:brightness-95">
            {cta}
          </span>
        </div>
      </div>
    </Link>
  );
}

function formatPublishedAt(listing: KXCityListing, locale: Locale): string {
  const raw = listing.published_at || listing.created_at || "";
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return pickText(locale, "今天发布", "本日掲載", "Posted today");
  if (days < 30) return pickText(locale, `${days} 天前发布`, `${days}日前に掲載`, `Posted ${days}d ago`);
  return pickText(locale, "30 天以上", "30日以上前", "30d+ ago");
}

function listingStatusText(listing: KXCityListing): string {
  return formatListingStatus(listing.status, listing.type);
}

/// 认证商家横滑条：服务频道里的认证商家入口。
function VerifiedMerchantsStrip({ citySlug, locale }: { citySlug: string; locale: Locale }) {
  const directory = useQuery({
    queryKey: ["businesses-directory", citySlug],
    queryFn: () => api.businessesDirectory({ city: citySlug }),
    staleTime: 120_000,
  });
  const items = directory.data?.items || [];
  if (directory.isLoading || !items.length) return null;
  return (
    <section className="kx-living-contact-card mb-4 !rounded-[24px] p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300">
            <Store className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-black text-[rgb(var(--kx-living-ink))]">{pickText(locale, "认证商家", "認証店舗", "Verified businesses")}</h2>
            <p className="truncate text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{pickText(locale, "资质审核通过的本地商家与服务方", "審査済みの地元店舗・事業者", "Locally vetted shops & providers")}</p>
          </div>
        </div>
        <Link href={`/businesses?city=${encodeURIComponent(citySlug)}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100">
          {pickText(locale, "全部商家", "すべて見る", "View all")}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="-mx-1 mt-3 overflow-x-auto px-1">
        <div className="flex gap-2.5 pb-1">
          {items.slice(0, 12).map((business) => (
            <Link
              key={business.id}
              href={`/businesses/${encodeURIComponent(business.id)}`}
              className="kx-living-mini-card w-[210px] shrink-0 rounded-2xl p-3 transition hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-300">
                  {business.logo_url ? (
                    <Image src={business.logo_url} alt={business.business_name} width={40} height={40} className="h-10 w-10 object-cover" unoptimized />
                  ) : (
                    <Store className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-black text-[rgb(var(--kx-living-ink))]">
                    <span className="truncate">{business.business_name}</span>
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  </p>
                  <p className="truncate text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">{business.business_type || (business.service_categories || [])[0] || ""}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {Number(business.rating_count || 0) > 0 ? (
                  <RatingStars value={Number(business.rating_avg || 0)} count={Number(business.rating_count || 0)} />
                ) : (
                  <span className="text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">{pickText(locale, "暂无点评", "口コミなし", "No reviews")}</span>
                )}
                <span className="text-[11px] font-black text-[rgb(var(--kx-living-muted))]">{pickText(locale, `${business.published_listing_count || 0} 个服务`, `サービス${business.published_listing_count || 0}件`, `${business.published_listing_count || 0} services`)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
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
  const created = inquiry.created_at ? new Date(inquiry.created_at).toLocaleString("zh-CN") : "";
  const conversationId = inquiry.conversation_id || inquiry.conversationId;
  const details = Array.isArray(inquiry.details) ? inquiry.details : [];
  const title = item ? displayListingTitle(item) || item.title : "城市信息记录";
  return (
    <section className="rounded-[28px] border border-slate-200/70 bg-white p-4 shadow-[0_18px_58px_-46px_rgba(15,23,42,0.48)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-black text-emerald-700">
              <FileCheck2 className="h-3.5 w-3.5" />
              正式记录
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{inquiryTypeLabel(inquiry.type)}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{inquiryStatusLabel(inquiry.status)}</span>
          </div>
          {item ? (
            <Link href={detailHref(item)} className="mt-2 block text-base font-black text-slate-950 hover:text-blue-700">{title}</Link>
          ) : (
            <h3 className="mt-2 text-base font-black text-slate-950">{title}</h3>
          )}
        </div>
        {created ? <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-400">{created}</span> : null}
      </div>
      {inquiry.message ? (
        <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{inquiry.message}</p>
      ) : null}
      {details.length ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {details.slice(0, 8).map((d, i) => (
            <div key={`${d.label}-${i}`} className="rounded-2xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
              <dt className="font-black text-amber-700">{d.label}</dt>
              <dd className="mt-0.5 break-words font-semibold leading-5 text-slate-700">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {item ? (
          <Link href={detailHref(item)} className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-slate-400">
            查看发布
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {conversationId ? (
          <Link href={`/messages/${encodeURIComponent(conversationId)}`} className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800">
            <MessageSquare className="h-3.5 w-3.5" />
            补充沟通
          </Link>
        ) : null}
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-amber-700">请在确认身份和信息真实性后再交换联系方式；Machi 不代收交易款、押金、保证金或第三方服务款。</p>
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

function DetailContactCard({ item, onContact, isOwner = false }: { item: KXCityListing; onContact: () => void; isOwner?: boolean }) {
  const { locale } = useI18n();
  const label = contactActionLabel(item, locale);
  const location = cleanListingText(item.location_text) || cityLabel(item.city_slug);
  return (
    <div className="space-y-3">
      <section className="kx-living-contact-card">
        <p className="kx-living-detail-price text-2xl font-black">{priceLabel(item)}</p>
        <p className="mt-1 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">{location}</p>
        {isOwner ? (
          <>
            <Link href={`/listings/create?type=${item.type}&edit=${item.id}`} className="kx-living-detail-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white">
              编辑信息
            </Link>
            <Link href="/my/listings" className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200 text-sm font-black text-slate-700">
              管理我的发布
            </Link>
          </>
        ) : (
          <button type="button" onClick={onContact} className="kx-living-detail-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white">
            <Send className="h-4 w-4" />
            {label}
          </button>
        )}
      </section>
      <SafetyNotice type={item.type} />
    </div>
  );
}

type IntakeField = { key: string; label: string; kind?: "text" | "date" | "textarea" | "select"; options?: string[]; placeholder?: string; required?: boolean };

function intakeConfig(type: string, category?: string, locale: Locale = "zh-Hans"): { title: string; noteLabel: string; optionalPlaceholder: string; fields: IntakeField[] } {
  const text = (zh: string, ja: string, en: string) => pickText(locale, zh, ja, en);
  const options = (items: Array<[string, string, string]>) => items.map(([zh, ja, en]) => text(zh, ja, en));
  if (type === "rental") {
    return {
      title: text("申请看房 / 咨询房源", "内見予約 / 物件相談", "Request viewing / ask about rental"),
      noteLabel: text("备注", "備考", "Note"),
      optionalPlaceholder: text("补充入住条件、希望联系时间或其他说明（选填）", "入居条件や連絡しやすい時間など（任意）", "Add move-in conditions, contact time, or other notes (optional)"),
      fields: [
        { key: "date", label: text("希望看房日期", "希望内見日", "Preferred viewing date"), kind: "date", required: true },
        { key: "time", label: text("希望时段", "希望時間帯", "Preferred time"), kind: "select", options: options([["上午", "午前", "Morning"], ["下午", "午後", "Afternoon"], ["晚上", "夜", "Evening"], ["周末", "週末", "Weekend"]]), required: true },
        { key: "situation", label: text("当前情况", "現在の状況", "Current situation"), kind: "select", options: options([["在日本", "日本在住", "In Japan"], ["海外", "海外在住", "Overseas"], ["学生", "学生", "Student"], ["在职", "就業中", "Working"]]) },
        { key: "move_in", label: text("入住时间", "入居希望時期", "Move-in timing"), placeholder: text("例如 7 月初 / 随时 / 签证下来后", "例：7月上旬 / すぐ / ビザ取得後", "e.g. early July / anytime / after visa") },
        { key: "people", label: text("人数", "入居人数", "People"), kind: "select", options: options([["1 人", "1名", "1 person"], ["2 人", "2名", "2 people"], ["3 人", "3名", "3 people"], ["4 人及以上", "4名以上", "4+ people"]]) },
        { key: "budget", label: text("预算", "予算", "Budget"), placeholder: text("例如 ¥80,000/月以内", "例：月8万円以内", "e.g. under ¥80,000/month") },
        { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
      ],
    };
  }
  if (type === "job" || type === "hiring") {
    return {
      title: text("立即应聘", "応募する", "Apply now"),
      noteLabel: text("自我介绍", "自己紹介", "Self introduction"),
      optionalPlaceholder: text("写清经验、可工作时间、语言能力和为什么适合这个职位。", "経験、勤務可能時間、語学力、応募理由を書いてください。", "Share experience, availability, language level, and why you fit."),
      fields: [
        { key: "name", label: text("姓名", "氏名", "Name"), required: true },
        { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
        { key: "visa", label: text("签证状态", "在留資格", "Visa status"), kind: "select", options: options([["留学", "留学", "Student"], ["工作签证", "就労ビザ", "Work visa"], ["永住", "永住", "Permanent resident"], ["家族滞在", "家族滞在", "Dependent"], ["其他", "その他", "Other"]]) },
        { key: "jp", label: text("日语水平", "日本語レベル", "Japanese level"), kind: "select", options: ["N1", "N2", "N3", text("日常会话", "日常会話", "Daily conversation"), text("暂不会", "まだ話せない", "Not yet")] },
        { key: "availability", label: text("可工作时间", "勤務可能時間", "Availability"), placeholder: text("平日晚上 / 周末", "平日夜 / 週末", "Weekday evenings / weekends") },
        { key: "start_date", label: text("最快入职时间", "最短開始日", "Earliest start"), placeholder: text("例如 立即 / 7 月以后", "例：すぐ / 7月以降", "e.g. immediately / after July") },
      ],
    };
  }
  if (type === "secondhand") {
    return {
      title: text("咨询卖家 / 预约交易", "出品者に相談 / 取引予約", "Ask seller / request trade"),
      noteLabel: text("补充留言", "追加メッセージ", "Additional message"),
      optionalPlaceholder: text("补充想确认的细节，例如瑕疵、配件、可否议价。", "傷、付属品、値下げ可否など確認したい点を書いてください。", "Add questions about defects, accessories, or negotiation."),
      fields: [
        { key: "intent", label: text("咨询意向", "相談内容", "Intent"), kind: "select", options: options([["想购买", "購入したい", "Want to buy"], ["想看实物", "実物を見たい", "Want to inspect"], ["想议价", "価格相談", "Negotiate price"], ["只咨询", "質問のみ", "Question only"]]), required: true },
        { key: "place", label: text("希望交易地点", "希望受け渡し場所", "Preferred meetup"), placeholder: text("例如 新宿站 / 池袋 / 可邮寄", "例：新宿駅 / 池袋 / 配送可", "e.g. Shinjuku Station / Ikebukuro / shipping") },
        { key: "time", label: text("可交易时间", "取引可能時間", "Available time"), placeholder: text("平日晚上 / 周末下午", "平日夜 / 週末午後", "Weekday evenings / weekend afternoons") },
        { key: "method", label: text("交易方式", "取引方法", "Trade method"), kind: "select", options: options([["面交", "手渡し", "Meetup"], ["自取", "引き取り", "Pickup"], ["邮寄", "配送", "Shipping"], ["可商量", "応相談", "Flexible"]]) },
        { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
      ],
    };
  }
  if (type === "local_service") {
    // 结构化预订：按服务类目给出真正可用的字段
    if (LEGACY_STAY_CATEGORY_SET.has(category || "")) {
      return {
        title: text("预订住宿", "宿泊を予約", "Book stay"),
        noteLabel: text("特殊需求", "特別リクエスト", "Special requests"),
        optionalPlaceholder: text("例如儿童、行李、晚到、无烟房等。", "子ども、荷物、遅い到着、禁煙希望など。", "Children, luggage, late arrival, non-smoking, etc."),
        fields: [
          { key: "check_in", label: text("入住日期", "チェックイン", "Check-in"), kind: "date", required: true },
          { key: "check_out", label: text("退房日期", "チェックアウト", "Check-out"), kind: "date", required: true },
          { key: "guests", label: text("入住人数", "人数", "Guests"), kind: "select", options: options([["1 人", "1名", "1 guest"], ["2 人", "2名", "2 guests"], ["3 人", "3名", "3 guests"], ["4 人", "4名", "4 guests"], ["5 人及以上", "5名以上", "5+ guests"]]), required: true },
          { key: "rooms", label: text("房间数", "部屋数", "Rooms"), kind: "select", options: options([["1 间", "1室", "1 room"], ["2 间", "2室", "2 rooms"], ["3 间及以上", "3室以上", "3+ rooms"]]) },
          { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
        ],
      };
    }
    if (FOOD_CATEGORY_SET.has(category || "")) {
      // 餐饮在线订座
      return {
        title: text("在线订座", "席を予約", "Reserve table"),
        noteLabel: text("备注（忌口 / 包间 / 儿童座椅等）", "備考（アレルギー / 個室 / 子ども椅子など）", "Notes (allergy / private room / child seat)"),
        optionalPlaceholder: text("补充忌口、纪念日、包间等需求（选填）", "アレルギー、記念日、個室希望など（任意）", "Allergies, anniversary, private room, etc. (optional)"),
        fields: [
          { key: "date", label: text("用餐日期", "来店日", "Dining date"), kind: "date", required: true },
          { key: "time", label: text("到店时间", "来店時間", "Arrival time"), kind: "select", options: options([["午市 11:00-14:00", "ランチ 11:00-14:00", "Lunch 11:00-14:00"], ["下午 14:00-17:00", "午後 14:00-17:00", "Afternoon 14:00-17:00"], ["晚市 17:00-20:00", "ディナー 17:00-20:00", "Dinner 17:00-20:00"], ["晚市 20:00 之后", "20:00以降", "After 20:00"]]), required: true },
          { key: "party", label: text("用餐人数", "人数", "Party size"), kind: "select", options: options([["1-2 人", "1-2名", "1-2 people"], ["3-4 人", "3-4名", "3-4 people"], ["5-8 人", "5-8名", "5-8 people"], ["8 人以上", "8名以上", "8+ people"]]), required: true },
          { key: "name", label: text("预订姓名", "予約名", "Booking name"), placeholder: text("到店报姓名即可", "来店時に伝える名前", "Name to use at arrival"), required: true },
          { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
        ],
      };
    }
    if (TRAVEL_SECTION_CATEGORIES.includes(category as (typeof TRAVEL_SECTION_CATEGORIES)[number])) {
      return {
        title: category === "一日游" ? text("预订行程", "ツアーを予約", "Book tour") : text("预订门票/体验", "チケット・体験を予約", "Book ticket/experience"),
        noteLabel: text("补充说明", "補足", "Notes"),
        optionalPlaceholder: text("补充集合地点、语言、同行人情况等。", "集合場所、言語、同行者情報など。", "Meeting point, language, companions, etc."),
        fields: [
          { key: "date", label: text("出行日期", "利用日", "Travel date"), kind: "date", required: true },
          { key: "tickets", label: text("人数 / 票数", "人数 / 枚数", "People / tickets"), kind: "select", options: options([["1", "1", "1"], ["2", "2", "2"], ["3", "3", "3"], ["4", "4", "4"], ["5 及以上", "5以上", "5+"]]), required: true },
          { key: "language", label: text("希望语言", "希望言語", "Preferred language"), kind: "select", options: ["中文", "日本語", "English", text("无要求", "指定なし", "No preference")] },
          { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
        ],
      };
    }
    if (TRANSFER_SECTION_CATEGORIES.includes(category as (typeof TRANSFER_SECTION_CATEGORIES)[number])) {
      return {
        title: text("预约接送/交通", "送迎・交通を予約", "Book transfer/transport"),
        noteLabel: text("补充说明", "補足", "Notes"),
        optionalPlaceholder: text("补充儿童座椅、航站楼、等待规则等。", "チャイルドシート、ターミナル、待機条件など。", "Child seat, terminal, waiting rules, etc."),
        fields: [
          { key: "date", label: text("用车日期", "利用日", "Ride date"), kind: "date", required: true },
          { key: "flight", label: text("航班号/路线", "便名 / ルート", "Flight / route"), placeholder: "NH878 / CA181 / Shinjuku -> Narita" },
          { key: "passengers", label: text("人数", "人数", "Passengers"), kind: "select", options: ["1", "2", "3", "4", text("5 及以上", "5以上", "5+")], required: true },
          { key: "luggage", label: text("行李数", "荷物数", "Luggage"), kind: "select", options: options([["1-2 件", "1-2個", "1-2 pieces"], ["3-4 件", "3-4個", "3-4 pieces"], ["5 件及以上", "5個以上", "5+ pieces"]]) },
          { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
        ],
      };
    }
    return {
      title: text("预约服务", "サービスを予約", "Book service"),
      noteLabel: text("具体需求", "具体的な依頼内容", "Request details"),
      optionalPlaceholder: text("写清服务范围、日期、材料和不能承诺的事项。", "範囲、日時、必要書類、保証できない事項を書いてください。", "Describe scope, date, materials, and non-guaranteed items."),
      fields: [
        { key: "city", label: text("服务城市", "対応都市", "Service city"), required: true },
        { key: "date", label: text("希望日期", "希望日", "Preferred date"), kind: "date" },
        { key: "time", label: text("希望时段", "希望時間帯", "Preferred time"), kind: "select", options: options([["上午", "午前", "Morning"], ["下午", "午後", "Afternoon"], ["晚上", "夜", "Evening"], ["周末", "週末", "Weekend"]]) },
        { key: "contact", label: text("联系方式", "連絡先", "Contact"), placeholder: "WeChat / LINE / Tel", required: true },
      ],
    };
  }
  const titles: Record<string, string> = {
    discount: text("联系商家", "店舗に相談", "Contact merchant"),
    event: text("报名 / 咨询", "申込 / 相談", "Join / inquire"),
  };
  return { title: titles[type] || text("联系发布者", "投稿者に連絡", "Contact poster"), noteLabel: text("留言", "メッセージ", "Message"), optionalPlaceholder: text("补充说明（选填）", "補足（任意）", "Additional details (optional)"), fields: [] };
}

function InquirySuccessSheet({ item, receipt, onClose }: { item: KXCityListing; receipt: InquiryReceipt | null; onClose: () => void }) {
  const { locale } = useI18n();
  const listingLocale = appLocaleToMarketingLocale(locale);
  if (!receipt) return null;
  const workbenchHref = inquiryWorkbenchHref(receipt.type, item.type);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <section className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950">{receipt.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{displayListingTitle(item) || item.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={pickText(locale, "关闭", "閉じる", "Close")} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-400">{pickText(locale, "类型", "種類", "Type")}</p>
            <p className="mt-1 font-black text-slate-900">{formatInquiryType(receipt.type, listingLocale)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-400">{pickText(locale, "状态", "ステータス", "Status")}</p>
            <p className="mt-1 font-black text-slate-900">{formatInquiryStatus(receipt.status, listingLocale)}</p>
          </div>
        </div>
        {receipt.details.length ? (
          <dl className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-amber-50/70 p-3 text-xs ring-1 ring-amber-100">
            {receipt.details.map((d, index) => (
              <div key={`${d.label}-${index}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                <dt className="font-black text-amber-700">{d.label}</dt>
                <dd className="break-words font-semibold text-slate-700">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
          {pickText(
            locale,
            "记录已进入工作台；私信只是补充沟通入口。请继续避免提前转账，并在确认身份与服务边界后再线下交易。",
            "記録はワークベンチに保存されました。メッセージは補足連絡用です。本人確認とサービス範囲を確認するまで前払いは避けてください。",
            "The record is saved to your workbench; messages are only for follow-up. Avoid paying in advance until identity and service scope are confirmed.",
          )}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link href={workbenchHref} className="inline-flex h-11 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-black text-white" onClick={onClose}>
            {pickText(locale, "查看记录", "記録を見る", "View record")}
          </Link>
          {receipt.conversationId ? (
            <Link href={`/messages/${encodeURIComponent(receipt.conversationId)}`} className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={onClose}>
              {pickText(locale, "继续私信", "メッセージを続ける", "Continue message")}
            </Link>
          ) : (
            <button type="button" disabled className="h-11 rounded-full border border-slate-200 px-4 text-sm font-black text-slate-300">{pickText(locale, "继续私信", "メッセージを続ける", "Continue message")}</button>
          )}
          <Link href={detailHref(item)} className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-black text-slate-700" onClick={onClose}>
            {pickText(locale, "返回详情", "詳細へ戻る", "Back to detail")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function IntakeSheet({ item, open, submitting, onClose, onSubmit }: { item: KXCityListing; open: boolean; submitting: boolean; onClose: () => void; onSubmit: (message: string, details: { label: string; value: string }[]) => void }) {
  const { locale } = useI18n();
  const config = useMemo(() => intakeConfig(item.type, item.category, locale), [item.type, item.category, locale]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setValues({}); setNote(""); setError(null); }
  }, [open]);
  if (!open) return null;
  const submit = () => {
    for (const f of config.fields) {
      if (f.required && !(values[f.key] || "").trim()) {
        setError(pickText(locale, `请填写「${f.label}」`, `「${f.label}」を入力してください`, `Please fill in "${f.label}"`));
        return;
      }
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
          <button type="button" onClick={onClose} aria-label={pickText(locale, "关闭", "閉じる", "Close")} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">{displayListingTitle(item) || item.title}</p>
        <div className="mt-4 space-y-3">
          {config.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-black text-slate-600">{f.label}{f.required ? <span className="text-rose-500"> *</span> : null}</span>
              {f.kind === "select" ? (
                <select value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="kx-input mt-1 h-11 w-full px-3 text-sm">
                  <option value="">{pickText(locale, "请选择", "選択してください", "Select")}</option>
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
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={config.optionalPlaceholder} className="kx-input mt-1 min-h-20 w-full p-3 text-sm" />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-bold text-rose-600">{error}</p> : null}
        <p className="mt-3 text-xs font-semibold text-amber-700">
          {pickText(locale, "提交后会生成正式记录，私信只用于后续补充沟通。Machi 不代收交易款、押金、保证金或第三方服务款，请勿提前转账。", "送信後は正式な記録が作成され、メッセージは補足連絡用です。Machi は代金・保証金・第三者サービス費を預かりません。前払いは避けてください。", "Submitting creates an official record; messages are only for follow-up. Machi does not hold trade payments, deposits, guarantees, or third-party service fees. Avoid paying in advance.")}
        </p>
        <button type="button" disabled={submitting} onClick={submit} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-black text-white disabled:opacity-60">
          <Send className="h-4 w-4" />
          {submitting ? pickText(locale, "提交中…", "送信中…", "Submitting…") : config.title}
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
  context = "default",
}: {
  type: KXListingType;
  currentCitySlug: string;
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  variant?: "panel" | "inline";
  context?: ListingFilterContext;
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
          <Field label={context === "lodging" ? "每晚最低价" : type === "rental" ? "最低租金" : type === "job" || type === "hiring" ? "最低薪资" : "最低价格"}>
            <input value={filters.min_price || ""} onChange={(e) => set("min_price", e.target.value.replace(/[^\d.]/g, ""))} className="kx-input h-10" />
          </Field>
          <Field label={context === "lodging" ? "每晚最高价" : type === "rental" ? "最高租金" : type === "job" || type === "hiring" ? "最高薪资" : "最高价格"}>
            <input value={filters.max_price || ""} onChange={(e) => set("max_price", e.target.value.replace(/[^\d.]/g, ""))} className="kx-input h-10" />
          </Field>
        </div>
        {filterOptions(type, context).map((group) => (
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

/// 详情页下方两条横滑栏：TA 的其他发布（同卖家）+ 相似推荐（服务端按
/// 同类目同城→同国→同城逐层补足，不含同卖家）。任一为空则不渲染。
function ListingDetailRecommendations({ item }: { item: KXCityListing }) {
  const sellerId = item.seller_user_id || item.sellerUserId || "";
  const similar = useQuery({
    queryKey: ["listing-similar", item.id],
    queryFn: () => api.similarListings(item.id),
    staleTime: 60_000,
  });
  const sellerOthers = useQuery({
    queryKey: ["listing-seller-others", item.id, sellerId],
    queryFn: () => api.listings({ type: item.type, seller_id: sellerId, exclude: item.id, limit: 8 }),
    enabled: Boolean(sellerId),
    staleTime: 60_000,
  });
  const sellerItems = sellerOthers.data?.items || [];
  const similarItems = similar.data || [];
  if (!sellerItems.length && !similarItems.length) return null;
  return (
    <>
      {sellerItems.length ? <ListingRail title="TA 的其他发布" items={sellerItems} /> : null}
      {similarItems.length ? <ListingRail title="相似推荐" items={similarItems} /> : null}
    </>
  );
}

function ListingRail({ title, items }: { title: string; items: KXCityListing[] }) {
  return (
    <section className="mt-7">
      <h3 className="px-1 text-base font-black text-[rgb(var(--kx-living-ink))]">{title}</h3>
      <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
        <div className="flex gap-3">
          {items.map((listing) => <MiniListingCard key={listing.id} listing={listing} />)}
        </div>
      </div>
    </section>
  );
}

function MiniListingCard({ listing }: { listing: KXCityListing }) {
  const title = displayListingTitle(listing) || "城市信息";
  const cover = listingCoverPreview(listing);
  const coverIsVideo = listingCoverIsVideo(listing);
  const PlaceholderIcon = listingPlaceholderIcon(listing.type);
  return (
    <Link href={detailHref(listing)} className="kx-living-mini-card w-44 shrink-0 overflow-hidden rounded-[20px] transition hover:-translate-y-0.5">
      <span className="relative block aspect-square bg-[rgb(var(--kx-living-soft))]">
        {coverIsVideo && !cover ? (
          <span className="absolute inset-0" style={videoFallbackArtworkStyle} />
        ) : cover ? (
          <Image src={cover} alt={title} fill sizes="176px" className="object-cover" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-slate-400"><PlaceholderIcon className="h-5 w-5" /></span>
        )}
        {coverIsVideo ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-black/65 text-white"><Play className="h-3.5 w-3.5 fill-current" /></span>
          </span>
        ) : null}
      </span>
      <span className="block p-2.5">
        <span className="block text-sm font-black text-[rgb(var(--kx-living-ink))]">{priceLabel(listing)}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs font-bold leading-4 text-[rgb(var(--kx-living-muted))]">{title}</span>
      </span>
    </Link>
  );
}

function SellerBox({ item }: { item: KXCityListing }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-3">
        {item.seller ? <Avatar user={item.seller} size={42} /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 font-black text-slate-600">M</span>}
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-black text-slate-950">{item.seller?.display_name || "Machi 用户"}{showOfficialBadge(item.seller) ? <OfficialBadge /> : showVerifiedBadge(item.seller) ? <VerifiedBadge /> : null}</p>
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

// ── 点评区：星级分布 + 写点评 + 商家回复 ───────────────────────────────────
const REVIEWABLE_LISTING_TYPES = new Set<string>(["local_service", "discount", "event"]);

export function ListingReviewsSection({ listing }: { listing: KXCityListing }) {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const reviewable = REVIEWABLE_LISTING_TYPES.has(listing.type);
  const reviews = useQuery({
    queryKey: ["listing-reviews", listing.id],
    queryFn: () => api.listingReviews(listing.id),
    enabled: reviewable,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["listing-reviews", listing.id] });
    queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
  };
  const submit = useMutation({
    mutationFn: () => api.submitListingReview(listing.id, { rating, content: content.trim() }),
    onSuccess: () => {
      setFormOpen(false);
      setContent("");
      pushToast({ kind: "success", message: "点评已发布，感谢分享体验！" });
      invalidate();
    },
    onError: (e) => {
      if (isAuthRequiredError(e)) openAuthPrompt("generic");
      else pushToast({ kind: "error", message: (e as APIError).message });
    },
  });
  const remove = useMutation({
    mutationFn: (reviewId: string) => api.deleteListingReview(listing.id, reviewId),
    onSuccess: () => {
      pushToast({ kind: "success", message: "点评已删除。" });
      invalidate();
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  const reply = useMutation({
    mutationFn: (vars: { reviewId: string; content: string }) => api.replyListingReview(listing.id, vars.reviewId, vars.content),
    onSuccess: () => {
      setReplyFor(null);
      setReplyText("");
      pushToast({ kind: "success", message: "回复已发布。" });
      invalidate();
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  if (!reviewable) return null;
  const summary = reviews.data?.summary;
  const items = reviews.data?.items || [];
  const myReview = reviews.data?.my_review || reviews.data?.myReview || null;
  const isOwner = !!(user && listing.seller_user_id === user.id);
  const ratingAvg = Number(summary?.rating_avg ?? summary?.ratingAvg ?? 0);
  const ratingCount = Number(summary?.rating_count ?? summary?.ratingCount ?? 0);
  const histogram = summary?.histogram || {};
  const histogramMax = Math.max(1, ...Object.values(histogram).map((v) => Number(v) || 0));
  const openForm = () => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    if (myReview) {
      setRating(myReview.rating || 5);
      setContent(myReview.content || "");
    }
    setFormOpen(true);
  };
  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
          <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
          用户点评
          {ratingCount ? <span className="text-sm font-bold text-slate-400">({ratingCount})</span> : null}
        </h3>
        {!isOwner ? (
          <button type="button" onClick={openForm} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-500 px-3.5 text-xs font-black text-white shadow-[0_10px_22px_-14px_rgba(245,158,11,0.95)] transition hover:bg-amber-600">
            <MessageSquare className="h-3.5 w-3.5" />
            {myReview ? "修改我的点评" : "写点评"}
          </button>
        ) : null}
      </div>

      {ratingCount > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-amber-50/80 px-6 py-4 ring-1 ring-amber-100">
            <p className="text-4xl font-black text-amber-600">{ratingAvg.toFixed(1)}</p>
            <RatingStars value={ratingAvg} showValue={false} />
            <p className="mt-1 text-xs font-bold text-slate-500">{ratingCount} 条点评</p>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = Number(histogram[String(star)] || 0);
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-right text-xs font-black text-slate-500">{star} 星</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${(count / histogramMax) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-xs font-bold text-slate-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
          还没有人点评过{listing.type === "local_service" ? "这项服务" : "这条信息"}。体验过的话，写下第一条点评帮助大家做决定。
        </p>
      )}

      {formOpen ? (
        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4">
          <p className="text-sm font-black text-slate-900">{myReview ? "修改点评" : "你的体验如何？"}</p>
          <div className="mt-2 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star} 星`}>
                <Star className={`h-7 w-7 transition ${star <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 hover:fill-amber-200 hover:text-amber-200"}`} />
              </button>
            ))}
            <span className="ml-1 text-sm font-black text-amber-600">{["很差", "较差", "一般", "不错", "超赞"][rating - 1]}</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            placeholder="服务体验、环境、价格、是否会推荐给朋友…"
            className="kx-input mt-3 min-h-24 w-full p-3 text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={submit.isPending} onClick={() => submit.mutate()} className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-60">
              <Send className="h-4 w-4" />
              {submit.isPending ? "发布中…" : "发布点评"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600">
              取消
            </button>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="mt-4 space-y-4">
          {items.map((review) => (
            <article key={review.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <div className="flex items-center gap-2.5">
                <Avatar user={review.author || undefined} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{review.author?.display_name || review.author?.handle || "Machi 用户"}</p>
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <RatingStars value={review.rating} showValue={false} />
                    <span className="font-bold">{(review.created_at || "").slice(0, 10)}</span>
                    {review.visit_date ? <span className="font-bold">体验于 {review.visit_date}</span> : null}
                  </p>
                </div>
                {user && review.user_id === user.id ? (
                  <button type="button" onClick={() => remove.mutate(review.id)} className="shrink-0 text-xs font-bold text-slate-400 transition hover:text-rose-500">
                    删除
                  </button>
                ) : null}
              </div>
              {review.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{review.content}</p> : null}
              {review.owner_reply ? (
                <div className="mt-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <p className="flex items-center gap-1 text-xs font-black text-slate-500"><Store className="h-3.5 w-3.5" /> 商家回复</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{review.owner_reply}</p>
                </div>
              ) : isOwner ? (
                replyFor === review.id ? (
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={1000}
                      placeholder="回复这条点评…"
                      className="kx-input h-10 flex-1 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={reply.isPending || !replyText.trim()}
                      onClick={() => reply.mutate({ reviewId: review.id, content: replyText.trim() })}
                      className="inline-flex h-10 shrink-0 items-center rounded-full bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50"
                    >
                      回复
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setReplyFor(review.id); setReplyText(""); }} className="mt-2 text-xs font-black text-blue-600 transition hover:text-blue-700">
                    回复点评
                  </button>
                )
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ListingAttributeEditor({
  type,
  category,
  fields: configuredFields,
  value,
  errors = {},
  onCategorySelect,
  onChange,
}: {
  type: KXListingType;
  category?: string;
  fields?: AttributeField[];
  value: Record<string, string>;
  errors?: Record<string, string>;
  onCategorySelect?: (category: string) => void;
  onChange: (next: Record<string, string>) => void;
}) {
  const fields = configuredFields?.length ? configuredFields : listingFormFields(type, category || "", value);
  const set = (key: string, nextValue: string) => {
    if (type === "local_service" && key === "service_type" && onCategorySelect) {
      onCategorySelect(nextValue);
      return;
    }
    onChange({ ...value, [key]: nextValue });
  };
  if (type === "local_service" && !fields.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm font-semibold text-slate-500">
        请先在基础信息里选择一个标准服务细分类。选择后这里只显示该行业需要填写的字段。
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <Field key={field.key} field={field.key} label={field.label} required={field.required} error={errors[field.key]}>
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

function Field({ field, label, children, required, error }: { field?: string; label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <label className="block min-w-0" data-field={field}>
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
  if (type === "rental") {
    // 照片网格的骨架
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/3] rounded-[22px]" />
            <Skeleton className="mt-2.5 h-4 w-3/4 rounded-md" />
            <Skeleton className="mt-1.5 h-3.5 w-1/2 rounded-md" />
          </div>
        ))}
      </div>
    );
  }
  const count = type === "secondhand" ? 8 : 5;
  return <div className={type === "secondhand" ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "space-y-3"}>{Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={type === "secondhand" ? "h-64 rounded-2xl" : "h-40 rounded-2xl"} />)}</div>;
}

function ListingEmptyState({ type, cityName, stays = false }: { type: KXListingType; cityName: string; stays?: boolean }) {
  if (stays) {
    return (
      <PremiumEmptyState
        title="这里还没有民宿"
        subtitle="认证服务方可以发布民宿，审核通过后展示给同城旅客。"
        action={{ label: "发布民宿", href: "/listings/create?type=local_service&category=民宿" }}
        secondaryAction={{ label: "返回发现", href: "/explore" }}
      />
    );
  }
  const title = type === "secondhand" ? "这里还没有二手商品" : type === "rental" ? "这里还没有房源" : type === "job" || type === "hiring" ? "这里还没有工作机会" : type === "local_service" ? "这里还没有商家与服务" : type === "discount" ? "这里还没有商家优惠" : "这里还没有城市信息";
  const subtitle = type === "secondhand"
    ? "发布第一个闲置、求购或搬家出清，让同城的人看到它。"
    : type === "rental"
      ? "你可以发布合租、短租或房源信息。Machi 会持续补充该城市的租房内容。"
      : type === "job" || type === "hiring"
        ? "稍后查看新的兼职、全职和招聘信息。认证招聘方可以发布职位。"
        : type === "local_service"
          ? "认证商家和服务方可以发布餐厅、旅行票务、接送交通、翻译手续、搬家清洁和生活服务。"
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

function contactActionLabel(item: KXCityListing, locale: Locale = "zh-Hans") {
  if (item.type === "secondhand") return pickText(locale, "咨询卖家 / 预约交易", "出品者に相談 / 取引予約", "Ask seller / arrange pickup");
  if (item.type === "rental") return pickText(locale, "预约看房", "内見を予約", "Request viewing");
  if (item.type === "job" || item.type === "hiring") return pickText(locale, "立即申请", "応募する", "Apply now");
  if (item.type === "local_service") {
    if (LEGACY_STAY_CATEGORY_SET.has(item.category || "")) return pickText(locale, "预订住宿", "宿泊を予約", "Book stay");
    if (FOOD_CATEGORY_SET.has(item.category || "")) return pickText(locale, "在线订座", "席を予約", "Reserve table");
    return pickText(locale, "预约咨询", "予約相談", "Request booking");
  }
  return pickText(locale, "联系发布者", "投稿者に連絡", "Contact poster");
}

function inquirySuccessTitle(type: string) {
  const normalized = cleanListingText(type);
  if (normalized === "job_apply" || normalized === "rental_application" || normalized === "job" || normalized === "hiring") return "已提交申请";
  if (normalized.endsWith("_booking") || normalized === "rental_viewing" || normalized === "rental" || normalized === "local_service") return "已提交预约";
  return "已发送咨询";
}

function inquiryWorkbenchHref(inquiryType: string, listingType?: string) {
  const type = cleanListingText(inquiryType);
  if (type === "job_apply" || listingType === "job" || listingType === "hiring") return "/my/applications";
  if (type.endsWith("_booking") || type === "rental_viewing" || type === "rental_application" || listingType === "rental" || listingType === "local_service") return "/my/bookings";
  return "/my/inquiries";
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
  if (type === "local_service") return "starting_from";
  if (type === "discount") return "discount";
  return "fixed";
}

function titlePlaceholder(type: KXListingType) {
  if (type === "rental") return "仙台青叶区 1K";
  if (type === "job" || type === "hiring") return "居酒屋兼职 / 日中双语运营";
  if (type === "local_service") return "东京周末一日游 / 机场接送 / 材料翻译协助";
  if (type === "discount") return "学生咖啡 10% 优惠";
  return "日文配列键盘 / 搬家出清书桌";
}

function categoryPlaceholder(type: KXListingType) {
  if (type === "rental") return "单人 / 合租 / 整租";
  if (type === "job" || type === "hiring") return "兼职 / 全职 / 实习";
  if (type === "local_service") return "日本料理 / 景点门票 / 机场接送 / 生活开通";
  if (type === "discount") return "餐饮 / 生活 / 限时";
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

type ServiceVertical =
  | "food_restaurant"
  | "dining_booking"
  | "lodging"
  | "attraction_ticket"
  | "day_tour"
  | "airport_transfer"
  | "paperwork_translation"
  | "moving_cleaning"
  | "life_setup"
  | "beauty_health"
  | "pet_family";

const SERVICE_VERTICAL_BY_CATEGORY: Record<string, ServiceVertical> = {
  "餐厅": "food_restaurant",
  "餐厅美食": "food_restaurant",
  "餐饮预约": "food_restaurant",
  "中华料理": "food_restaurant",
  "日本料理": "food_restaurant",
  "居酒屋": "food_restaurant",
  "烧肉火锅": "food_restaurant",
  "拉面": "food_restaurant",
  "寿司海鲜": "food_restaurant",
  "咖啡甜品": "food_restaurant",
  "西餐": "food_restaurant",
  "韩国料理": "food_restaurant",
  "餐饮点评": "dining_booking",
  "优惠预约": "dining_booking",
  "民宿": "lodging",
  "酒店": "lodging",
  "温泉旅馆": "lodging",
  "公寓式酒店": "lodging",
  "短住公寓": "lodging",
  "酒店民宿": "lodging",
  "景点门票": "attraction_ticket",
  "一日游": "day_tour",
  "本地向导": "day_tour",
  "体验活动": "day_tour",
  "包车行程": "day_tour",
  "接送机": "airport_transfer",
  "机场接送": "airport_transfer",
  "车站接送": "airport_transfer",
  "包车": "airport_transfer",
  "行李协助": "airport_transfer",
  "材料翻译": "paperwork_translation",
  "市役所陪同": "paperwork_translation",
  "银行卡协助": "paperwork_translation",
  "手机卡协助": "paperwork_translation",
  "签证材料整理": "paperwork_translation",
  "翻译手续": "paperwork_translation",
  "签证/手续协助": "paperwork_translation",
  "翻译": "paperwork_translation",
  "租房申请协助": "paperwork_translation",
  "认证服务": "paperwork_translation",
  "退房清洁": "moving_cleaning",
  "粗大垃圾协助": "moving_cleaning",
  "行李搬运": "moving_cleaning",
  "家具家电配送协助": "moving_cleaning",
  "搬家清洁": "moving_cleaning",
  "搬家": "moving_cleaning",
  "清洁": "moving_cleaning",
  "手机卡开通": "life_setup",
  "网络开通": "life_setup",
  "水电煤协助": "life_setup",
  "地址登记协助": "life_setup",
  "粗大垃圾预约": "life_setup",
  "生活跑腿": "life_setup",
  "生活支持": "life_setup",
  "美容美发": "beauty_health",
  "美甲": "beauty_health",
  "按摩": "beauty_health",
  "皮肤管理": "beauty_health",
  "体检/牙科预约协助": "beauty_health",
  "宠物寄养": "pet_family",
  "遛狗": "pet_family",
  "临时照看": "pet_family",
  "儿童用品租赁": "pet_family",
  "家庭协助": "pet_family",
  "宠物服务": "pet_family",
};

const SERVICE_VERTICALS = new Set<ServiceVertical>(Object.values(SERVICE_VERTICAL_BY_CATEGORY));

const SERVICE_TYPE_OPTIONS: Record<ServiceVertical, string[]> = {
  food_restaurant: ["餐厅", ...FOOD_CATEGORIES],
  dining_booking: ["优惠预约"],
  lodging: [...LODGING_SECTION_CATEGORIES],
  attraction_ticket: ["景点门票"],
  day_tour: ["一日游", "本地向导", "体验活动", "包车行程"],
  airport_transfer: [...TRANSFER_SECTION_CATEGORIES],
  paperwork_translation: [...PAPERWORK_SECTION_CATEGORIES],
  moving_cleaning: [...MOVING_SECTION_CATEGORIES],
  life_setup: [...LIFE_SETUP_SECTION_CATEGORIES],
  beauty_health: ["美容美发", "美甲", "按摩", "皮肤管理", "体检/牙科预约协助"],
  pet_family: [...PET_FAMILY_SECTION_CATEGORIES],
};

const SERVICE_VERTICAL_LABEL: Record<ServiceVertical, string> = {
  food_restaurant: "餐厅",
  dining_booking: "餐厅优惠",
  lodging: "民宿",
  attraction_ticket: "景点门票",
  day_tour: "一日游 / 本地向导",
  airport_transfer: "接送与交通",
  paperwork_translation: "翻译 / 手续协助",
  moving_cleaning: "搬家 / 清洁",
  life_setup: "生活开通 / 住后支持",
  beauty_health: "美容健康预约",
  pet_family: "宠物与家庭支持",
};

function getServiceVertical(category: string, attrs: Record<string, unknown> = {}): ServiceVertical | "" {
  const categoryKey = cleanListingText(category);
  if (SERVICE_VERTICAL_BY_CATEGORY[categoryKey]) return SERVICE_VERTICAL_BY_CATEGORY[categoryKey];
  const serviceType = cleanListingText(attrs.service_type);
  if (SERVICE_VERTICAL_BY_CATEGORY[serviceType]) return SERVICE_VERTICAL_BY_CATEGORY[serviceType];
  const explicit = cleanListingText(attrs.service_vertical);
  if (SERVICE_VERTICALS.has(explicit as ServiceVertical)) return explicit as ServiceVertical;
  if (attrs.menu || attrs.packages) return "food_restaurant";
  if (attrs.room_type || attrs.max_guests || attrs.check_in_time) return "lodging";
  if (attrs.airport_route || attrs.vehicle_type || attrs.flight_info_note) return "airport_transfer";
  if (attrs.document_type || attrs.required_materials || attrs.delivery_time || attrs.no_result_guarantee) return "paperwork_translation";
  if (attrs.property_size || attrs.item_volume || attrs.vehicle_staff) return "moving_cleaning";
  if (attrs.setup_type || attrs.required_materials || attrs.cannot_guarantee) return "life_setup";
  if (attrs.beauty_service || attrs.medical_disclaimer) return "beauty_health";
  if (attrs.ticket_type && attrs.meeting_point) return attrs.pickup_service ? "day_tour" : "attraction_ticket";
  return "";
}

function getServiceVerticalForCategorySelection(category: string): ServiceVertical | "" {
  return SERVICE_VERTICAL_BY_CATEGORY[cleanListingText(category)] || "";
}

function serviceFieldsForCategory(category: string, attrs: Record<string, unknown> = {}): AttributeField[] {
  const vertical = getServiceVertical(category, attrs);
  if (!vertical) return [];
  const serviceTypeField: AttributeField = {
    key: "service_type",
    label: "细分类 / 服务类型",
    required: true,
    kind: "select",
    options: SERVICE_TYPE_OPTIONS[vertical].map((item) => option(item)),
  };
  if (vertical === "food_restaurant") return [
    { key: "business_name", label: "商家名称", required: true, placeholder: "Machi Dining" },
    serviceTypeField,
    { key: "service_area", label: "服务范围", required: true, placeholder: "新宿 / 池袋 / 东京 23 区" },
    { key: "open_hours", label: "营业时间", placeholder: "11:00-22:00 / 周一休" },
    { key: "price_range", label: "人均 / 价格区间", placeholder: "人均 ¥2,500-3,500" },
    { key: "near_station", label: "最近车站", placeholder: "新宿站东口徒步 3 分钟" },
    { key: "store_phone", label: "到店电话", placeholder: "03-1234-5678" },
    { key: "reservation_required", label: "仅限预约制", kind: "checkbox" },
    { key: "reservation_note", label: "预约说明", kind: "textarea", placeholder: "如何预约、可预约时段、几人起订、是否需要定金。" },
    { key: "menu", label: "菜单（每行一道：菜名 | 价格 | 备注）", kind: "textarea", placeholder: "麻婆豆腐 | ¥980\n口水鸡 | ¥1,080 | 微辣" },
    { key: "packages", label: "团购套餐（每行一个：套餐名 | 现价 | 原价 | 包含；先展示，暂不支持线上购买）", kind: "textarea", placeholder: "双人套餐 | ¥3,980 | ¥5,200 | 4菜1汤+2饮料" },
    { key: "languages", label: "服务语言", placeholder: "中文 / 日本語 / English" },
    { key: "certified_provider", label: "认证商家", kind: "checkbox" },
  ];
  if (vertical === "dining_booking") return [
    { key: "business_name", label: "商家 / 服务方名称", required: true, placeholder: "Machi Table Booking" },
    serviceTypeField,
    { key: "service_area", label: "服务范围", required: true, placeholder: "东京 23 区 / 线上咨询" },
    { key: "open_hours", label: "营业时间", placeholder: "11:00-22:00 / 周一休" },
    { key: "price_range", label: "价位 / 服务费", placeholder: "预约咨询 / 人均 ¥3,000 起" },
    { key: "near_station", label: "最近车站", placeholder: "高田马场站步行 4 分钟" },
    { key: "store_phone", label: "到店电话", placeholder: "03-1234-5678" },
    { key: "availability", label: "可预约时间", placeholder: "平日晚餐 / 周末需提前 2 天" },
    { key: "booking_required", label: "需要预约", kind: "checkbox" },
    { key: "reservation_note", label: "预约 / 点评说明", kind: "textarea", placeholder: "说明如何预约、到店要求、点评或优惠使用方式。" },
    { key: "service_process", label: "服务流程", kind: "textarea", placeholder: "提交需求、确认时间、到店/体验、反馈。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "说明取消、改期和费用规则。" },
    { key: "languages", label: "服务语言", placeholder: "中文 / 日本語 / English" },
    { key: "certified_provider", label: "认证商家/服务商", kind: "checkbox" },
  ];
  if (vertical === "lodging") return [
    { key: "business_name", label: "商家 / 住宿方名称", required: true, placeholder: "Yanaka Garden Stay" },
    serviceTypeField,
    { key: "room_type", label: "房型", required: true, placeholder: "双床房 / 大床房 / 整套民宿" },
    { key: "max_guests", label: "可住人数", required: true, placeholder: "2" },
    { key: "price_unit", label: "每晚 / 起步价格说明", placeholder: "每晚 / 每间 / 预约咨询" },
    { key: "check_in_time", label: "入住时间", placeholder: "15:00" },
    { key: "check_out_time", label: "退房时间", placeholder: "10:00" },
    { key: "minimum_stay", label: "最少入住晚数", placeholder: "1 晚 / 2 晚起" },
    { key: "amenities", label: "设施服务", placeholder: "Wi-Fi、厨房、洗衣机、停车场、温泉、行李寄存" },
    { key: "inventory_note", label: "房量与日期说明", kind: "textarea", placeholder: "说明可订日期、剩余房量、旺季限制和儿童入住规则。" },
    { key: "breakfast_included", label: "含早餐", kind: "checkbox" },
    { key: "instant_confirmation", label: "即时确认", kind: "checkbox" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "说明免费取消期限、不可退规则和改期方式。" },
    { key: "license_note", label: "资质/许可说明", kind: "textarea", placeholder: "说明旅馆业许可、住宅宿泊备案或合作方。" },
  ];
  if (vertical === "attraction_ticket" || vertical === "day_tour") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Travel" },
    serviceTypeField,
    { key: "ticket_type", label: "票种 / 行程类型", required: true, placeholder: vertical === "day_tour" ? "包车 / 拼团 / 私人向导" : "成人票 / 儿童票 / 亲子套票" },
    { key: "availability", label: "日期 / 有效期", required: true, placeholder: "指定日期 / 2026-08-31 前有效" },
    { key: "duration", label: "时长", placeholder: vertical === "day_tour" ? "一日（约 8 小时）" : "约 2-3 小时" },
    { key: "meeting_point", label: "集合地点", placeholder: "新宿站西口 / 景点入口 / 酒店接送" },
    { key: "included_items", label: "包含内容", kind: "textarea", placeholder: "门票、向导、车费、保险等。" },
    { key: "not_included", label: "不包含内容", kind: "textarea", placeholder: "餐费、个人消费、额外门票等。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "证件、儿童年龄、人数、日期、集合时间等。" },
    ...(vertical === "day_tour" ? [{ key: "pickup_service", label: "含酒店接送", kind: "checkbox" as const }] : []),
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "票务/行程请写清不可退、改期和天气规则。" },
    { key: "license_note", label: "资质/许可说明", kind: "textarea", placeholder: "旅行、票务、用车或合作方资质说明。" },
  ];
  if (vertical === "airport_transfer") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Airport Transfer" },
    serviceTypeField,
    { key: "airport_route", label: "机场 / 路线", required: true, placeholder: "成田机场 -> 东京 23 区 / 羽田接机" },
    { key: "service_area", label: "服务范围", required: true, placeholder: "成田 / 羽田 / 东京 / 箱根" },
    { key: "vehicle_type", label: "车型", placeholder: "普通轿车 / Alphard / 10 人座" },
    { key: "passenger_count", label: "人数", placeholder: "1-4 人 / 5-8 人" },
    { key: "luggage_count", label: "行李数", placeholder: "2 个 28 寸 + 2 个登机箱" },
    { key: "flight_info_note", label: "航班号说明", kind: "textarea", placeholder: "说明是否需要航班号、延误跟踪、儿童座椅等。" },
    { key: "waiting_rule", label: "等待规则", kind: "textarea", placeholder: "免费等待时长、超时费用、无人出现处理。" },
    { key: "surcharge_note", label: "夜间 / 追加费用", kind: "textarea", placeholder: "深夜、远距离、儿童座椅、高速费等。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "出发前多久可取消或改期。" },
  ];
  if (vertical === "paperwork_translation") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Paperwork Support" },
    serviceTypeField,
    { key: "languages", label: "服务语言", required: true, placeholder: "中文 / 日本語 / English" },
    { key: "document_type", label: "文件 / 手续类型", required: true, placeholder: "签证材料 / 住民票 / 契约翻译 / 租房申请" },
    { key: "required_materials", label: "所需材料", kind: "textarea", placeholder: "护照、在留卡、地址、文件照片、申请表等。" },
    { key: "delivery_time", label: "交付时间", placeholder: "1-3 个工作日 / 加急另询" },
    { key: "service_process", label: "服务流程", kind: "textarea", placeholder: "提交材料、确认报价、翻译/协助、交付/陪同。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "证件、原件照片、地址、委托书等。" },
    { key: "no_result_guarantee", label: "结果说明", kind: "textarea", placeholder: "不得承诺签证、房源、录取、工作或收益结果。" },
    { key: "license_note", label: "资质/许可说明", kind: "textarea", placeholder: "行政书士、翻译、合作方或非法律代理说明。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "材料确认前后取消、加急费用等。" },
  ];
  if (vertical === "moving_cleaning") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Move / Clean" },
    serviceTypeField,
    { key: "service_area", label: "服务范围", required: true, placeholder: "东京 / 埼玉 / 千叶" },
    { key: "property_size", label: "房型 / 面积", placeholder: "1K / 25㎡ / 2LDK" },
    { key: "item_volume", label: "物品量", kind: "textarea", placeholder: "床、桌子、冰箱、洗衣机、纸箱数量等。" },
    { key: "vehicle_staff", label: "车辆 / 人员", placeholder: "轻型车一台 / 2 名工作人员" },
    { key: "included_items", label: "包含内容", kind: "textarea", placeholder: "搬运、基础清洁、工具、交通等。" },
    { key: "not_included", label: "不包含内容", kind: "textarea", placeholder: "钢琴、大型保险柜、危险品、特殊垃圾处理等。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "提前封箱、确认电梯、停车位置、贵重物品自管。" },
    { key: "surcharge_note", label: "追加费用", kind: "textarea", placeholder: "楼梯、远距离、夜间、停车、高速、材料费等。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "前一天可改期 / 当日取消费用。" },
  ];
  if (vertical === "life_setup") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Life Setup" },
    serviceTypeField,
    { key: "service_area", label: "服务区域", required: true, placeholder: "东京 23 区 / 横滨 / 线上协助" },
    { key: "setup_type", label: "服务类型", required: true, placeholder: "手机卡 / 网络 / 水电煤 / 地址登记" },
    { key: "required_materials", label: "所需材料", kind: "textarea", placeholder: "在留卡、护照、地址、银行卡、本人到场要求等。" },
    { key: "delivery_time", label: "预计耗时", placeholder: "当天 / 1-3 个工作日 / 需预约窗口" },
    { key: "service_process", label: "服务方式", kind: "textarea", placeholder: "线上确认材料、预约窗口、陪同办理或远程协助。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "证件原件、印章、现金、可接电话时间等。" },
    { key: "cannot_guarantee", label: "不可承诺事项", kind: "textarea", placeholder: "不能保证运营商审核、开户结果、政府窗口受理或第三方时效。" },
    { key: "price_range", label: "价格说明", placeholder: "预约咨询 / ¥3,000 起 / 按事项报价" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "材料确认后、预约日前后取消与改期规则。" },
  ];
  if (vertical === "beauty_health") return [
    { key: "business_name", label: "商家名称", required: true, placeholder: "Machi Beauty" },
    serviceTypeField,
    { key: "service_area", label: "服务区域 / 店铺位置", required: true, placeholder: "新宿 / 原宿 / 线上预约协助" },
    { key: "beauty_service", label: "服务项目", required: true, placeholder: "剪发 / 美甲 / 按摩 / 体检预约协助" },
    { key: "availability", label: "可预约时间", placeholder: "平日晚间 / 周末 / 需提前 2 天" },
    { key: "price_range", label: "价格区间", placeholder: "¥4,000 起 / 按项目报价" },
    { key: "duration", label: "服务时长", placeholder: "45 分钟 / 90 分钟" },
    { key: "user_prepare", label: "注意事项", kind: "textarea", placeholder: "迟到规则、过敏史、禁忌提醒、预约前准备。" },
    { key: "medical_disclaimer", label: "医疗免责声明", kind: "textarea", placeholder: "医疗相关只能做预约协助，不提供诊断、治疗承诺或医疗建议。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "24 小时内取消、迟到、改期等规则。" },
  ];
  if (vertical === "pet_family") return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Family Support" },
    serviceTypeField,
    { key: "service_area", label: "服务区域", required: true, placeholder: "东京 23 区 / 到店 / 上门" },
    { key: "service_target", label: "服务对象", placeholder: "小型犬 / 猫 / 儿童用品 / 家庭协助" },
    { key: "availability", label: "可预约时间", placeholder: "平日晚上 / 周末 / 假期" },
    { key: "price_range", label: "价格说明", placeholder: "按小时 / 按天 / 预约咨询" },
    { key: "user_prepare", label: "注意事项", kind: "textarea", placeholder: "宠物性格、疫苗、用品、紧急联系人、家庭规则等。" },
    { key: "license_note", label: "安全/资质说明", kind: "textarea", placeholder: "经验、保险、照看范围、不可服务边界。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "预约前取消、临时变更、超时费用等。" },
  ];
  return [
    { key: "business_name", label: "服务方名称", required: true, placeholder: "Machi Local Support" },
    serviceTypeField,
    { key: "service_area", label: "服务范围", required: true, placeholder: "原宿店 / 中野区 / 上门服务区域" },
    { key: "open_hours", label: "营业时间", placeholder: "11:00-20:00 / 周三休" },
    { key: "price_range", label: "价格区间", placeholder: "剪发 ¥4,000 起 / 45 分钟 ¥3,000" },
    { key: "availability", label: "可预约时间", placeholder: "平日晚上 / 周末需预约" },
    { key: "included_items", label: "包含内容", kind: "textarea", placeholder: "服务项目、时长、基础材料等。" },
    { key: "not_included", label: "不包含内容", kind: "textarea", placeholder: "额外材料费、远距离交通费、特殊处理等。" },
    { key: "user_prepare", label: "用户需准备", kind: "textarea", placeholder: "宠物信息、发质需求、地址、照片等。" },
    { key: "cancellation_rule", label: "取消规则", kind: "textarea", placeholder: "24 小时内取消、迟到、改期等规则。" },
    { key: "license_note", label: "资质/许可说明", kind: "textarea", placeholder: "美容、宠物照护等请说明资格或经验。" },
  ];
}

function sanitizeServiceAttributesForCategory(category: string, current: Record<string, string>, configuredFields: AttributeField[] = []): Record<string, string> {
  const cleanCategory = cleanListingText(category);
  const selection = cleanCategory || cleanListingText(current.service_type);
  const vertical = getServiceVerticalForCategorySelection(selection);
  const allowed = new Set(
    (configuredFields.length ? configuredFields : serviceFieldsForCategory(selection, { service_vertical: vertical }))
      .map((field) => field.key),
  );
  allowed.add("service_type");
  allowed.add("service_vertical");
  const next: Record<string, string> = {};
  Object.entries(current).forEach(([key, value]) => {
    if (allowed.has(key) && String(value || "").trim()) next[key] = value;
  });
  next.service_type = selection;
  next.service_vertical = vertical || cleanListingText(current.service_vertical);
  return next;
}

function clearFieldError(setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, key: string) {
  setter((current) => {
    if (!current[key]) return current;
    const next = { ...current };
    delete next[key];
    return next;
  });
}

function listingFormFields(type: KXListingType, category = "", attrs: Record<string, unknown> = {}): AttributeField[] {
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
    { key: "holidays", label: "休日休假", placeholder: "完全周休二日 / 轮班制 / 年假 10 天" },
    { key: "trial_period", label: "试用期", placeholder: "3 个月（待遇不变）" },
    { key: "benefits", label: "福利待遇", placeholder: "社保完备、员工餐、升时给、住房补贴" },
    { key: "transportation_fee", label: "交通费", kind: "checkbox" },
    { key: "remote_ok", label: "可远程", kind: "checkbox" },
    { key: "foreigner_friendly", label: "外国人友好", kind: "checkbox" },
    { key: "no_experience_ok", label: "无经验可", kind: "checkbox" },
    { key: "student_ok", label: "留学生可", kind: "checkbox" },
    { key: "night_shift", label: "夜班", kind: "checkbox" },
    { key: "weekend_available", label: "周末", kind: "checkbox" },
    { key: "job_requirements", label: "应聘条件", kind: "textarea", placeholder: "说明经验、语言、签证、排班等要求。" },
  ];
  if (type === "local_service") return serviceFieldsForCategory(category, attrs);
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
    { key: "brand", label: "品牌", placeholder: "可选：品牌名 / 无品牌 / 自有款" },
    { key: "model", label: "型号", placeholder: "可选：13 寸笔记本 / 白色书桌 / 日文配列键盘" },
    { key: "original_price", label: "原价 / 参考价", placeholder: "例如 28000" },
    { key: "price_negotiable", label: "价格可商量", kind: "checkbox" },
    { key: "purchase_time", label: "购买时间", placeholder: "例如 2025 年春 / 使用约 6 个月" },
    { key: "accessories", label: "配件 / 包装", placeholder: "原盒、充电器、说明书、保修卡" },
    { key: "defect_note", label: "瑕疵 / 使用痕迹", kind: "textarea", placeholder: "如有划痕、缺件、维修史请提前说明；没有可写“无明显瑕疵”。" },
    { key: "available_time", label: "可交易时间", placeholder: "平日 19:00 后 / 周末下午" },
    { key: "pickup_note", label: "取货 / 邮寄说明", kind: "textarea", placeholder: "例如 新宿站面交，邮寄需买家承担运费。" },
    { key: "pickup_available", label: "可自取", kind: "checkbox" },
    { key: "shipping_available", label: "可邮寄", kind: "checkbox" },
  ];
}

function safetyTips(type: KXListingType) {
  if (type === "rental") return ["Machi 只是信息平台，不代收押金、订金或房租。", "地址只展示到区域，具体看房前核实发布者身份。", "高风险房源显示待核验，可举报并由后台下架。"];
  if (type === "job" || type === "hiring") return ["招聘不得收押金、保证金或培训费。", "核实招聘方资质、薪资、工作地点和签证说明。", "禁止成人、灰产或违法兼职。"];
  if (type === "local_service") return ["商家与服务默认进入审核，认证状态会展示。", "餐厅、票务、旅行、接送交通和手续协助需写清资质、包含/不包含内容和取消规则。", "暂不开放外卖配送、维修安装、学习咨询；禁止成人服务、高风险线下服务、虚假票务、违规代办和违法服务。", "平台暂不做外卖配送，不代收第三方服务款。"];
  if (type === "discount") return ["确认优惠有效期、适用门店和使用规则。", "不要向未核验商家提前转账或提供敏感信息。", "遇到虚假折扣、诱导消费或强制捆绑请立即举报。"];
  return ["Machi 不代收二手交易款。", "不要提前转账，交易建议选择公共场所。", "核实对方身份，谨慎提供个人信息。", "遇到可疑内容立即举报。"];
}

/// lodging = 租房页「民宿」分区（数据为住宿类 local_service），
/// 筛选维度与生活服务完全不同，靠 context 切换。
export type ListingFilterContext = "default" | "lodging";

function filterOptions(type: KXListingType, context: ListingFilterContext = "default"): Array<{ key: string; label: string; options: FilterOption[] }> {
  if (context === "lodging") return [
    { key: "gte_max_guests", label: "可住人数", options: [option("2", "2 人及以上"), option("3", "3 人及以上"), option("4", "4 人及以上"), option("6", "6 人及以上")] },
    { key: "breakfast_included", label: "含早餐", options: [option("true", "含早餐")] },
    { key: "instant_confirmation", label: "确认方式", options: [option("true", "即时确认")] },
    { key: "booking_required", label: "预约", options: [option("true", "需要预约")] },
    { key: "certified_provider", label: "认证商家", options: [option("true", "已认证")] },
  ];
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
    { key: "remote_ok", label: "远程", options: [option("true", "可远程")] },
    // "available,true" 兼容老数据：早期 iOS 把 visa_support 存成了布尔。
    { key: "visa_support", label: "签证支持", options: [option("available,true", "有"), option("consult", "可咨询"), option("none", "无")] },
  ];
  if (type === "local_service") return [
    { key: "service_type", label: "服务类型", options: [...FOOD_SECTION_CATEGORIES, ...TRAVEL_SECTION_CATEGORIES, ...TRANSFER_SECTION_CATEGORIES, ...LIFE_SECTION_CATEGORIES].map((item) => option(item)) },
    { key: "booking_required", label: "预约", options: [option("true", "需要预约")] },
    { key: "breakfast_included", label: "含早餐", options: [option("true", "含")] },
    { key: "instant_confirmation", label: "确认方式", options: [option("true", "即时确认")] },
    { key: "certified_provider", label: "认证商家/服务商", options: [option("true", "已认证")] },
  ];
  // 优惠类没有可枚举的真实属性筛选（merchant_verified / valid_until 不在
  // 属性白名单内，挂出来就是假筛选），只保留价格区间与城市范围。
  if (type === "discount") return [];
  return [
    { key: "listing_mode", label: "发布类型", options: [option("sale", "出售"), option("free", "免费送"), option("wanted", "求购")] },
    { key: "condition", label: "新旧程度", options: [option("brand_new", "全新"), option("like_new", "几乎全新"), option("good", "良好"), option("used", "有使用痕迹"), option("fair", "可用")] },
    { key: "delivery_method", label: "交易方式", options: [option("meetup", "面交"), option("pickup", "自取"), option("shipping", "邮寄"), option("negotiable", "可商量")] },
    { key: "price_negotiable", label: "价格", options: [option("true", "可议价")] },
    { key: "pickup_available", label: "自取", options: [option("true", "可自取")] },
    { key: "shipping_available", label: "邮寄", options: [option("true", "可邮寄")] },
  ];
}

/// 这些 filter key 走专用查询参数（城市范围 / 价格区间），其余 key 直接
/// 转成 attr_<key> 交给服务端过滤。
const FILTER_NON_ATTR_KEYS = new Set(["scope_area", "scope_city", "min_price", "max_price"]);

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
