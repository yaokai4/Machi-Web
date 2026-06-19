import type { ComponentType } from "react";
import {
  Book,
  Briefcase,
  CalendarDays,
  EyeOff,
  HelpCircle,
  Home,
  Megaphone,
  MessageSquareText,
  Newspaper,
  ShieldAlert,
  ShoppingBag,
  Store,
  Tag,
  Users,
  Utensils,
} from "lucide-react";
import type { ContentType } from "@/lib/types";
import { getCityBySlug, getDefaultCity, type CitySlug } from "@/config/cities";

export type ChannelKey =
  | "news"
  | "guide"
  | "market"
  | "housing"
  | "jobs"
  | "services"
  | "deals"
  | "groups"
  | "qa";

export type ChannelTone = "blue" | "emerald" | "indigo" | "violet" | "teal" | "rose" | "orange" | "fuchsia" | "slate";

export interface ChannelConfig {
  key: ChannelKey;
  label: string;
  subtitle: string;
  Icon: ComponentType<{ className?: string }>;
  icon: ComponentType<{ className?: string }>;
  tone: ChannelTone;
  contentTypes: ContentType[];
  legacySlugs?: string[];
  slug: ChannelKey;
  title: string;
  href: (citySlug?: string | null, sourceParams?: URLSearchParams | { toString(): string }) => string;
}

function channel(config: Omit<ChannelConfig, "slug" | "title" | "icon" | "href">): ChannelConfig {
  return {
    ...config,
    slug: config.key,
    title: config.label,
    icon: config.Icon,
    href: (citySlug, sourceParams) => buildChannelHref(citySlug, config.key, sourceParams),
  };
}

export const PRIMARY_CHANNELS: ChannelConfig[] = [
  channel({ key: "news", label: "本地快讯", subtitle: "本地新闻、交通和生活提醒", Icon: Newspaper, tone: "blue", contentTypes: ["news", "local_info"], legacySlugs: ["local-news", "local_news"] }),
  channel({ key: "guide", label: "城市指南", subtitle: "攻略、经验、长文和避坑", Icon: Book, tone: "emerald", contentTypes: ["guide", "warning", "long_post"], legacySlugs: ["guides", "warnings", "warning", "longpost"] }),
  channel({ key: "market", label: "二手市场", subtitle: "闲置、求购、搬家出清", Icon: ShoppingBag, tone: "teal", contentTypes: ["secondhand"], legacySlugs: ["secondhand", "marketplace"] }),
  channel({ key: "housing", label: "租房 · 住宿", subtitle: "长租房源、民宿、看房预约", Icon: Home, tone: "indigo", contentTypes: ["housing", "roommate"], legacySlugs: ["rent", "rental", "rentals"] }),
  channel({ key: "jobs", label: "工作", subtitle: "兼职、全职、招聘和内推", Icon: Briefcase, tone: "violet", contentTypes: ["job_seek", "job_post", "referral"], legacySlugs: ["job", "recruiting", "recruit", "referral", "hiring"] }),
  channel({ key: "services", label: "商家与服务", subtitle: "餐厅、旅行票务和生活服务", Icon: Store, tone: "orange", contentTypes: ["service", "merchant"], legacySlugs: ["service", "merchant", "business", "businesses", "local-service", "local_services"] }),
  channel({ key: "deals", label: "商家优惠", subtitle: "折扣福利、本地商家活动", Icon: Tag, tone: "rose", contentTypes: ["coupon"], legacySlugs: ["coupon", "discount", "discounts"] }),
  channel({ key: "groups", label: "活动小组", subtitle: "Food meetup、语言交换、本地小组", Icon: Users, tone: "fuchsia", contentTypes: ["meetup", "dining", "event"], legacySlugs: ["food", "dining", "events", "event", "meetup"] }),
  channel({ key: "qa", label: "问答互助", subtitle: "问答、匿名提问和生活求助", Icon: HelpCircle, tone: "blue", contentTypes: ["question", "anonymous"], legacySlugs: ["question", "treehole", "anonymous"] }),
];

export const SECONDARY_CHANNELS: ChannelConfig[] = [];

export const ALL_CHANNELS: ChannelConfig[] = [...PRIMARY_CHANNELS, ...SECONDARY_CHANNELS];

export const HIGH_VALUE_CHANNELS: ChannelKey[] = ["market", "housing", "jobs", "services"];

export const SECONDARY_DISCOVER_CHANNELS: ChannelKey[] = ["guide", "news", "deals", "groups", "qa"];

export const MORE_CHANNEL_SUMMARY = "按城市信息、交易生活、机会工作、本地连接和工具分组";

export type ChannelGroupItem = {
  label: string;
  subtitle: string;
  channel: ChannelKey;
  Icon: ComponentType<{ className?: string }>;
  tool?: boolean;
};

export const CHANNEL_GROUPS: Array<{ title: string; items: ChannelGroupItem[] }> = [
  {
    title: "城市信息",
    items: [
      { label: "本地快讯", subtitle: "新闻、公告、交通提醒", channel: "news", Icon: Newspaper },
      { label: "城市指南", subtitle: "攻略、长文、生活经验", channel: "guide", Icon: Book },
      { label: "问答互助", subtitle: "本地求助和匿名提问", channel: "qa", Icon: HelpCircle },
      { label: "避坑经验", subtitle: "风险提醒和踩雷复盘", channel: "guide", Icon: ShieldAlert },
    ],
  },
  {
    title: "交易生活",
    items: [
      { label: "二手市场", subtitle: "闲置、求购、搬家出清", channel: "market", Icon: ShoppingBag },
      { label: "租房", subtitle: "房源库、合租、短租", channel: "housing", Icon: Home },
      { label: "商家优惠", subtitle: "折扣、福利和本地优惠", channel: "deals", Icon: Tag },
    ],
  },
  {
    title: "机会工作",
    items: [
      { label: "找工作", subtitle: "兼职、全职、求职线索", channel: "jobs", Icon: Briefcase },
      { label: "招聘", subtitle: "职位发布和招聘方认证", channel: "jobs", Icon: Megaphone },
      { label: "内推", subtitle: "公司内推和会员可见线索", channel: "jobs", Icon: MessageSquareText },
    ],
  },
  {
    title: "本地连接",
    items: [
      { label: "活动小组", subtitle: "公开城市活动和本地小组", channel: "groups", Icon: Users },
      { label: "语言交换", subtitle: "公开语言学习活动", channel: "groups", Icon: MessageSquareText },
      { label: "Food meetup", subtitle: "餐厅、咖啡和小型饭局", channel: "groups", Icon: Utensils },
      { label: "本地小组", subtitle: "运动、周末活动、城市散步", channel: "groups", Icon: CalendarDays },
    ],
  },
  {
    title: "服务商家",
    items: [
      { label: "商家与服务", subtitle: "餐厅、旅行和生活服务", channel: "services", Icon: Store },
      { label: "景点票务", subtitle: "门票、一日游和本地向导", channel: "services", Icon: Store },
      { label: "认证商家", subtitle: "已提交认证资料的商家", channel: "services", Icon: Store },
    ],
  },
  {
    title: "内容工具",
    items: [
      { label: "投票", subtitle: "作为发帖工具使用", channel: "qa", Icon: HelpCircle, tool: true },
      { label: "长文", subtitle: "作为内容形式使用", channel: "guide", Icon: Book, tool: true },
      { label: "匿名提问", subtitle: "匿名问答/生活吐槽", channel: "qa", Icon: EyeOff, tool: true },
    ],
  },
];

export const CHANNEL_FILTERS: Partial<Record<ChannelKey, string[]>> = {
  market: ["全部", "家具", "家电", "手机数码", "电脑办公", "电子产品", "教材", "书籍教材", "衣物", "生活用品", "母婴儿童", "运动户外", "票券卡券", "搬家出清", "免费送", "求购"],
  housing: ["全部", "单人", "合租", "短租", "整租", "家具家电"],
  jobs: ["全部", "兼职", "全职", "日语 N3 可", "留学生可", "签证支持"],
  services: ["全部", "餐厅", "日本料理", "优惠预约", "景点门票", "一日游", "本地向导", "机场接送", "车站接送", "包车", "材料翻译", "市役所陪同", "租房申请协助", "搬家", "退房清洁", "手机卡开通", "生活跑腿", "美容美发"],
  groups: ["全部", "Food meetup", "语言交换", "周末活动", "运动小组", "城市散步"],
  guide: ["全部", "交通", "生活", "手续", "省钱", "避坑"],
  news: ["全部", "本地", "交通", "天气", "公告"],
  deals: ["全部", "餐饮", "教育", "生活服务", "限时优惠"],
  qa: ["全部", "租房", "手续", "工作", "匿名提问"],
};

const CHANNEL_BY_KEY = new Map(ALL_CHANNELS.map((item) => [item.key, item]));
const CHANNEL_ALIAS = new Map<string, ChannelKey>();

for (const item of ALL_CHANNELS) {
  CHANNEL_ALIAS.set(item.key, item.key);
  CHANNEL_ALIAS.set(item.label, item.key);
  for (const legacy of item.legacySlugs || []) CHANNEL_ALIAS.set(legacy, item.key);
}

for (const [legacy, target] of Object.entries({
  food: "groups",
  dining: "groups",
  events: "groups",
  event: "groups",
  recruiting: "jobs",
  recruit: "jobs",
  referral: "jobs",
  merchant: "services",
  service: "services",
  coupon: "deals",
  warnings: "guide",
  warning: "guide",
  treehole: "qa",
  anonymous: "qa",
  rent: "housing",
  rental: "housing",
  secondhand: "market",
})) {
  CHANNEL_ALIAS.set(legacy, target as ChannelKey);
}

export function normalizeChannelKey(value?: string | null): ChannelKey | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return CHANNEL_ALIAS.get(raw.toLowerCase()) || CHANNEL_ALIAS.get(raw);
}

export function getChannelByKey(value?: string | null): ChannelConfig | undefined {
  const key = normalizeChannelKey(value);
  return key ? CHANNEL_BY_KEY.get(key) : undefined;
}

export function getChannelContentTypes(value?: string | null): ContentType[] | undefined {
  return getChannelByKey(value)?.contentTypes;
}

export type ChannelLocale = "zh-Hans" | "zh-Hant" | "en" | "ja";

const CHANNEL_COPY: Record<ChannelKey, Record<ChannelLocale, { title: string; subtitle: string }>> = {
  news: {
    "zh-Hans": { title: "本地快讯", subtitle: "本地新闻、交通和生活提醒" },
    "zh-Hant": { title: "本地快訊", subtitle: "本地新聞、交通和生活提醒" },
    en: { title: "Local News", subtitle: "Local news, transit updates, and city alerts" },
    ja: { title: "ローカル速報", subtitle: "地域ニュース、交通情報、生活のお知らせ" },
  },
  guide: {
    "zh-Hans": { title: "城市指南", subtitle: "攻略、经验、长文和避坑" },
    "zh-Hant": { title: "城市指南", subtitle: "攻略、經驗、長文和避坑" },
    en: { title: "City Guide", subtitle: "Guides, lived experience, long reads, and warnings" },
    ja: { title: "街のガイド", subtitle: "攻略、体験談、長文、注意喚起" },
  },
  market: {
    "zh-Hans": { title: "二手市场", subtitle: "闲置、求购、搬家出清" },
    "zh-Hant": { title: "二手市場", subtitle: "閒置、求購、搬家出清" },
    en: { title: "Marketplace", subtitle: "Secondhand items, wanted posts, and moving sales" },
    ja: { title: "フリマ", subtitle: "中古品、探し物、引っ越し処分" },
  },
  housing: {
    "zh-Hans": { title: "租房 · 住宿", subtitle: "长租房源、民宿、看房预约" },
    "zh-Hant": { title: "租房 · 住宿", subtitle: "長租房源、民宿、看房預約" },
    en: { title: "Homes & Stays", subtitle: "Long-term rentals, homestays, and viewings" },
    ja: { title: "住まい・宿泊", subtitle: "賃貸物件、民泊・短期滞在、内見予約" },
  },
  jobs: {
    "zh-Hans": { title: "工作", subtitle: "兼职、全职、招聘和内推" },
    "zh-Hant": { title: "工作", subtitle: "兼職、全職、招聘和內推" },
    en: { title: "Jobs", subtitle: "Part-time, full-time, hiring, and referrals" },
    ja: { title: "仕事", subtitle: "アルバイト、正社員、求人、紹介" },
  },
  services: {
    "zh-Hans": { title: "商家与服务", subtitle: "餐厅、旅行票务和生活服务" },
    "zh-Hant": { title: "商家與本地服務", subtitle: "餐廳、旅行票務和生活服務" },
    en: { title: "Businesses & Local Services", subtitle: "Restaurants, travel tickets, transfers, and local support" },
    ja: { title: "店舗・地域サービス", subtitle: "飲食店、旅行チケット、送迎、生活サポート" },
  },
  deals: {
    "zh-Hans": { title: "商家优惠", subtitle: "折扣福利、本地商家活动" },
    "zh-Hant": { title: "商家優惠", subtitle: "折扣福利、本地商家活動" },
    en: { title: "Deals", subtitle: "Discounts, perks, and local business offers" },
    ja: { title: "お得情報", subtitle: "割引、特典、地域店舗のキャンペーン" },
  },
  groups: {
    "zh-Hans": { title: "活动小组", subtitle: "Food meetup、语言交换、本地小组" },
    "zh-Hant": { title: "活動小組", subtitle: "Food meetup、語言交換、本地小組" },
    en: { title: "Groups & Events", subtitle: "Food meetups, language exchange, and local groups" },
    ja: { title: "イベント・グループ", subtitle: "食事会、言語交換、地域グループ" },
  },
  qa: {
    "zh-Hans": { title: "问答互助", subtitle: "问答、匿名提问和生活求助" },
    "zh-Hant": { title: "問答互助", subtitle: "問答、匿名提問和生活求助" },
    en: { title: "Q&A Help", subtitle: "Questions, anonymous posts, and everyday help" },
    ja: { title: "Q&A・相談", subtitle: "質問、匿名相談、生活の困りごと" },
  },
};

export function getChannelCopy(channel: ChannelKey | ChannelConfig, locale: ChannelLocale = "zh-Hans") {
  const key = typeof channel === "string" ? channel : channel.key;
  return CHANNEL_COPY[key]?.[locale] || CHANNEL_COPY[key]?.["zh-Hans"] || { title: typeof channel === "string" ? channel : channel.title, subtitle: typeof channel === "string" ? "" : channel.subtitle };
}

export function getChannelTitle(channel: ChannelKey | ChannelConfig, locale: ChannelLocale = "zh-Hans") {
  return getChannelCopy(channel, locale).title;
}

export function getChannelSubtitle(channel: ChannelKey | ChannelConfig, locale: ChannelLocale = "zh-Hans") {
  return getChannelCopy(channel, locale).subtitle;
}

const GROUP_TITLE_COPY: Record<string, Record<ChannelLocale, string>> = {
  城市信息: { "zh-Hans": "城市信息", "zh-Hant": "城市資訊", en: "City Info", ja: "街の情報" },
  交易生活: { "zh-Hans": "交易生活", "zh-Hant": "交易生活", en: "Living & Trading", ja: "暮らし・取引" },
  机会工作: { "zh-Hans": "机会工作", "zh-Hant": "機會工作", en: "Jobs & Opportunities", ja: "仕事・機会" },
  本地连接: { "zh-Hans": "本地连接", "zh-Hant": "本地連結", en: "Local Connections", ja: "地域のつながり" },
  服务商家: { "zh-Hans": "服务商家", "zh-Hant": "服務商家", en: "Services & Businesses", ja: "サービス・店舗" },
  内容工具: { "zh-Hans": "内容工具", "zh-Hant": "內容工具", en: "Publishing Tools", ja: "投稿ツール" },
};

const GROUP_ITEM_COPY: Record<string, Record<ChannelLocale, { label: string; subtitle: string }>> = {
  本地快讯: {
    "zh-Hans": { label: "本地快讯", subtitle: "新闻、公告、交通提醒" },
    "zh-Hant": { label: "本地快訊", subtitle: "新聞、公告、交通提醒" },
    en: { label: "Local News", subtitle: "News, notices, transit alerts" },
    ja: { label: "ローカル速報", subtitle: "ニュース、告知、交通情報" },
  },
  城市指南: {
    "zh-Hans": { label: "城市指南", subtitle: "攻略、长文、生活经验" },
    "zh-Hant": { label: "城市指南", subtitle: "攻略、長文、生活經驗" },
    en: { label: "City Guide", subtitle: "Guides, long reads, lived tips" },
    ja: { label: "街のガイド", subtitle: "攻略、長文、生活の知恵" },
  },
  问答互助: {
    "zh-Hans": { label: "问答互助", subtitle: "本地求助和匿名提问" },
    "zh-Hant": { label: "問答互助", subtitle: "本地求助和匿名提問" },
    en: { label: "Q&A Help", subtitle: "Local questions and anonymous help" },
    ja: { label: "Q&A・相談", subtitle: "地域の相談と匿名質問" },
  },
  避坑经验: {
    "zh-Hans": { label: "避坑经验", subtitle: "风险提醒和踩雷复盘" },
    "zh-Hant": { label: "避坑經驗", subtitle: "風險提醒和踩雷復盤" },
    en: { label: "Warnings", subtitle: "Risk alerts and cautionary stories" },
    ja: { label: "注意喚起", subtitle: "リスク情報と失敗談" },
  },
  二手市场: {
    "zh-Hans": { label: "二手市场", subtitle: "闲置、求购、搬家出清" },
    "zh-Hant": { label: "二手市場", subtitle: "閒置、求購、搬家出清" },
    en: { label: "Marketplace", subtitle: "Secondhand, wanted, moving sales" },
    ja: { label: "フリマ", subtitle: "中古品、探し物、引っ越し処分" },
  },
  租房: {
    "zh-Hans": { label: "租房", subtitle: "房源库、合租、短租" },
    "zh-Hant": { label: "租房", subtitle: "房源庫、合租、短租" },
    en: { label: "Housing", subtitle: "Listings, shares, short stays" },
    ja: { label: "住まい", subtitle: "物件、シェア、短期滞在" },
  },
  商家优惠: {
    "zh-Hans": { label: "商家优惠", subtitle: "折扣、福利和本地优惠" },
    "zh-Hant": { label: "商家優惠", subtitle: "折扣、福利和本地優惠" },
    en: { label: "Deals", subtitle: "Discounts, perks, local offers" },
    ja: { label: "お得情報", subtitle: "割引、特典、地域のオファー" },
  },
  找工作: {
    "zh-Hans": { label: "找工作", subtitle: "兼职、全职、求职线索" },
    "zh-Hant": { label: "找工作", subtitle: "兼職、全職、求職線索" },
    en: { label: "Find Jobs", subtitle: "Part-time, full-time, job leads" },
    ja: { label: "仕事を探す", subtitle: "アルバイト、正社員、求人情報" },
  },
  招聘: {
    "zh-Hans": { label: "招聘", subtitle: "职位发布和招聘方认证" },
    "zh-Hant": { label: "招聘", subtitle: "職位發布和招聘方認證" },
    en: { label: "Hiring", subtitle: "Job posts and employer verification" },
    ja: { label: "採用", subtitle: "求人投稿と雇用主認証" },
  },
  内推: {
    "zh-Hans": { label: "内推", subtitle: "公司内推和会员可见线索" },
    "zh-Hant": { label: "內推", subtitle: "公司內推和會員可見線索" },
    en: { label: "Referrals", subtitle: "Company referrals and member-only leads" },
    ja: { label: "紹介", subtitle: "企業紹介と会員向け情報" },
  },
  活动小组: {
    "zh-Hans": { label: "活动小组", subtitle: "公开城市活动和本地小组" },
    "zh-Hant": { label: "活動小組", subtitle: "公開城市活動和本地小組" },
    en: { label: "Groups & Events", subtitle: "Public events and local groups" },
    ja: { label: "イベント・グループ", subtitle: "公開イベントと地域グループ" },
  },
  语言交换: {
    "zh-Hans": { label: "语言交换", subtitle: "公开语言学习活动" },
    "zh-Hant": { label: "語言交換", subtitle: "公開語言學習活動" },
    en: { label: "Language Exchange", subtitle: "Public language learning events" },
    ja: { label: "言語交換", subtitle: "公開の語学イベント" },
  },
  "Food meetup": {
    "zh-Hans": { label: "Food meetup", subtitle: "餐厅、咖啡和小型饭局" },
    "zh-Hant": { label: "Food meetup", subtitle: "餐廳、咖啡和小型飯局" },
    en: { label: "Food Meetup", subtitle: "Restaurants, coffee, small meals" },
    ja: { label: "食事会", subtitle: "レストラン、カフェ、小さな集まり" },
  },
  本地小组: {
    "zh-Hans": { label: "本地小组", subtitle: "运动、周末活动、城市散步" },
    "zh-Hant": { label: "本地小組", subtitle: "運動、週末活動、城市散步" },
    en: { label: "Local Groups", subtitle: "Sports, weekends, city walks" },
    ja: { label: "地域グループ", subtitle: "運動、週末イベント、街歩き" },
  },
  本地服务: {
    "zh-Hans": { label: "商家与服务", subtitle: "餐厅、旅行、接送和生活服务" },
    "zh-Hant": { label: "商家與本地服務", subtitle: "餐廳、旅行、接送和生活服務" },
    en: { label: "Businesses & Services", subtitle: "Restaurants, travel, transfers, support" },
    ja: { label: "店舗・地域サービス", subtitle: "飲食店、旅行、送迎、生活サポート" },
  },
  商家与服务: {
    "zh-Hans": { label: "商家与服务", subtitle: "预约、票务、接送、手续和生活支持" },
    "zh-Hant": { label: "商家與本地服務", subtitle: "預約、票務、接送、手續和生活支援" },
    en: { label: "Businesses & Services", subtitle: "Bookings, tickets, transfers, paperwork, support" },
    ja: { label: "店舗・地域サービス", subtitle: "予約、チケット、送迎、手続き、生活サポート" },
  },
  景点票务: {
    "zh-Hans": { label: "景点票务", subtitle: "门票、一日游和本地向导" },
    "zh-Hant": { label: "景點票務", subtitle: "門票、一日遊和本地向導" },
    en: { label: "Attractions", subtitle: "Tickets, day trips, local guides" },
    ja: { label: "観光・チケット", subtitle: "入場券、日帰りツアー、ガイド" },
  },
  商家: {
    "zh-Hans": { label: "商家", subtitle: "本地店铺和服务商资料" },
    "zh-Hant": { label: "商家", subtitle: "本地店鋪和服務商資料" },
    en: { label: "Businesses", subtitle: "Local shops and provider profiles" },
    ja: { label: "店舗", subtitle: "地域店舗とサービス事業者" },
  },
  认证商家: {
    "zh-Hans": { label: "认证商家", subtitle: "已提交认证资料的商家" },
    "zh-Hant": { label: "認證商家", subtitle: "已提交認證資料的商家" },
    en: { label: "Verified Businesses", subtitle: "Businesses with submitted credentials" },
    ja: { label: "認証済み店舗", subtitle: "認証資料を提出済みの店舗" },
  },
  投票: {
    "zh-Hans": { label: "投票", subtitle: "作为发帖工具使用" },
    "zh-Hant": { label: "投票", subtitle: "作為發帖工具使用" },
    en: { label: "Poll", subtitle: "Use as a post tool" },
    ja: { label: "投票", subtitle: "投稿ツールとして使用" },
  },
  长文: {
    "zh-Hans": { label: "长文", subtitle: "作为内容形式使用" },
    "zh-Hant": { label: "長文", subtitle: "作為內容形式使用" },
    en: { label: "Long Post", subtitle: "Use as a content format" },
    ja: { label: "長文", subtitle: "コンテンツ形式として使用" },
  },
  匿名提问: {
    "zh-Hans": { label: "匿名提问", subtitle: "匿名问答/生活吐槽" },
    "zh-Hant": { label: "匿名提問", subtitle: "匿名問答/生活吐槽" },
    en: { label: "Anonymous Question", subtitle: "Anonymous Q&A and daily concerns" },
    ja: { label: "匿名質問", subtitle: "匿名Q&A・生活相談" },
  },
};

export function getLocalizedChannelGroups(locale: ChannelLocale = "zh-Hans") {
  return CHANNEL_GROUPS.map((group) => ({
    ...group,
    title: GROUP_TITLE_COPY[group.title]?.[locale] || group.title,
    items: group.items.map((item) => {
      const copy = GROUP_ITEM_COPY[item.label]?.[locale];
      return copy ? { ...item, ...copy } : item;
    }),
  }));
}

export function getChannelToolLabel(locale: ChannelLocale = "zh-Hans") {
  switch (locale) {
    case "en":
      return "Tool";
    case "ja":
      return "投稿ツール";
    case "zh-Hant":
      return "發布工具";
    default:
      return "发布工具";
  }
}

export function buildChannelHref(
  citySlug: string | null | undefined,
  channelKey: ChannelKey,
  sourceParams?: URLSearchParams | { toString(): string },
): string {
  const city = getCityBySlug(citySlug) || getDefaultCity();
  if (channelKey === "market") return `/cities/${city.slug}/marketplace`;
  if (channelKey === "housing") return `/cities/${city.slug}/rentals`;
  if (channelKey === "jobs") return `/cities/${city.slug}/jobs`;
  if (channelKey === "services") return `/cities/${city.slug}/services`;
  if (channelKey === "deals") return `/cities/${city.slug}/deals`;
  const params = new URLSearchParams(sourceParams?.toString() || "");
  params.delete("channel");
  params.delete("v");
  params.set("city", city.slug);
  params.set("region", city.regionCode);
  const query = params.toString();
  return `/explore/${channelKey}${query ? `?${query}` : ""}`;
}

export function buildExploreHref(citySlug?: string | null, sourceParams?: URLSearchParams | { toString(): string }): string {
  const city = getCityBySlug(citySlug);
  const params = new URLSearchParams(sourceParams?.toString() || "");
  params.delete("channel");
  params.delete("v");
  if (city) {
    params.set("city", city.slug);
    params.set("region", city.regionCode);
  }
  const query = params.toString();
  return `/explore${query ? `?${query}` : ""}`;
}

export function buildNewsHref(citySlug?: string | null): string {
  const city = getCityBySlug(citySlug) || getDefaultCity();
  return `/news?city=${encodeURIComponent(city.slug)}`;
}

export function channelSearchPlaceholder(cityName: string, channel?: ChannelKey) {
  switch (channel) {
    case "housing":
      return `搜索${cityName}租房、车站、学校、合租、短租...`;
    case "jobs":
      return `搜索${cityName}兼职、全职、招聘、内推...`;
    case "market":
      return `搜索${cityName}二手、搬家出清、免费送、求购...`;
    case "services":
      return `搜索${cityName}翻译、手续、接机、生活支持...`;
    case "groups":
      return `搜索${cityName}Food meetup、语言交换、本地小组...`;
    case "guide":
      return `搜索${cityName}攻略、手续、银行卡、生活经验...`;
    case "news":
      return `搜索${cityName}新闻、交通、生活提醒...`;
    default:
      return `搜索${cityName}内容、二手、租房、工作、服务...`;
  }
}

export function channelHrefForSearch(citySlug: CitySlug, channel?: ChannelKey) {
  const params = new URLSearchParams({ city: citySlug });
  if (channel) params.set("channel", channel);
  return `/search?${params.toString()}`;
}

// ── 发现页「城市入口」布局配置 (后台可编辑，存于 site_settings.discover_entrances) ──
export type DiscoverEntranceTier = "primary" | "secondary";

export interface DiscoverEntrance {
  channel: ChannelKey;
  tier: DiscoverEntranceTier;
  enabled: boolean;
  title?: string; // 标题覆盖（留空用频道默认）
  subtitle?: string; // 副标题覆盖
}

export const DEFAULT_DISCOVER_ENTRANCES: DiscoverEntrance[] = [
  ...HIGH_VALUE_CHANNELS.map((channel) => ({ channel, tier: "primary" as const, enabled: true })),
  ...SECONDARY_DISCOVER_CHANNELS.map((channel) => ({ channel, tier: "secondary" as const, enabled: true })),
];

const DISCOVER_CHANNEL_KEY_SET = new Set<ChannelKey>(ALL_CHANNELS.map((c) => c.key));

// 防御式解析后台 JSON：空/损坏一律回退到内置默认，确保发现页永不因坏配置崩溃。
export function parseDiscoverEntrances(raw?: string | null): DiscoverEntrance[] {
  if (!raw || !raw.trim()) return DEFAULT_DISCOVER_ENTRANCES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_DISCOVER_ENTRANCES;
    const seen = new Set<string>();
    const out: DiscoverEntrance[] = [];
    for (const row of parsed) {
      const channel = normalizeChannelKey(row?.channel);
      if (!channel || !DISCOVER_CHANNEL_KEY_SET.has(channel) || seen.has(channel)) continue;
      seen.add(channel);
      out.push({
        channel,
        tier: row?.tier === "secondary" ? "secondary" : "primary",
        enabled: row?.enabled !== false,
        title: typeof row?.title === "string" && row.title.trim() ? row.title.trim() : undefined,
        subtitle: typeof row?.subtitle === "string" && row.subtitle.trim() ? row.subtitle.trim() : undefined,
      });
    }
    return out.length ? out : DEFAULT_DISCOVER_ENTRANCES;
  } catch {
    return DEFAULT_DISCOVER_ENTRANCES;
  }
}

export function serializeDiscoverEntrances(entrances: DiscoverEntrance[]): string {
  return JSON.stringify(
    entrances.map((e) => ({
      channel: e.channel,
      tier: e.tier,
      enabled: e.enabled,
      ...(e.title ? { title: e.title } : {}),
      ...(e.subtitle ? { subtitle: e.subtitle } : {}),
    })),
  );
}
