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
  Wrench,
} from "lucide-react";
import type { ContentType } from "@/lib/types";
import { getCityBySlug, getDefaultCity, type CitySlug } from "@/config/cities";

export type ChannelKey =
  | "news"
  | "guide"
  | "housing"
  | "jobs"
  | "market"
  | "food"
  | "buddy"
  | "events"
  | "qa"
  | "services"
  | "recruiting"
  | "referral"
  | "merchant"
  | "deals"
  | "treehole"
  | "warnings";

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
  channel({ key: "news", label: "新闻", subtitle: "本地快讯", Icon: Newspaper, tone: "blue", contentTypes: ["news", "local_info"] }),
  channel({ key: "guide", label: "攻略", subtitle: "生活经验", Icon: Book, tone: "emerald", contentTypes: ["guide"] }),
  channel({ key: "housing", label: "租房", subtitle: "合租转租", Icon: Home, tone: "indigo", contentTypes: ["housing", "roommate"], legacySlugs: ["rent"] }),
  channel({ key: "jobs", label: "找工作", subtitle: "兼职全职", Icon: Briefcase, tone: "violet", contentTypes: ["job_seek", "job_post", "referral"], legacySlugs: ["job"] }),
  channel({ key: "market", label: "二手", subtitle: "闲置求购", Icon: ShoppingBag, tone: "teal", contentTypes: ["secondhand"], legacySlugs: ["secondhand"] }),
  channel({ key: "food", label: "约饭", subtitle: "吃饭咖啡", Icon: Utensils, tone: "rose", contentTypes: ["dining"], legacySlugs: ["dining"] }),
  channel({ key: "buddy", label: "搭子", subtitle: "学习运动", Icon: Users, tone: "orange", contentTypes: ["meetup"], legacySlugs: ["meetup"] }),
  channel({ key: "events", label: "活动", subtitle: "线下聚会", Icon: CalendarDays, tone: "fuchsia", contentTypes: ["event"], legacySlugs: ["event"] }),
];

export const SECONDARY_CHANNELS: ChannelConfig[] = [
  channel({ key: "qa", label: "问答", subtitle: "本地互助", Icon: HelpCircle, tone: "blue", contentTypes: ["question"], legacySlugs: ["question"] }),
  channel({ key: "services", label: "服务", subtitle: "生活服务", Icon: Wrench, tone: "emerald", contentTypes: ["service"], legacySlugs: ["service"] }),
  channel({ key: "recruiting", label: "招聘", subtitle: "本地招人", Icon: Megaphone, tone: "violet", contentTypes: ["job_post"], legacySlugs: ["recruit"] }),
  channel({ key: "referral", label: "内推", subtitle: "工作机会", Icon: MessageSquareText, tone: "indigo", contentTypes: ["referral"] }),
  channel({ key: "merchant", label: "商家", subtitle: "本地商家", Icon: Store, tone: "teal", contentTypes: ["merchant"] }),
  channel({ key: "deals", label: "优惠", subtitle: "折扣福利", Icon: Tag, tone: "rose", contentTypes: ["coupon"], legacySlugs: ["coupon"] }),
  channel({ key: "treehole", label: "树洞", subtitle: "匿名倾诉", Icon: EyeOff, tone: "slate", contentTypes: ["anonymous"], legacySlugs: ["anonymous"] }),
  channel({ key: "warnings", label: "避坑", subtitle: "风险提醒", Icon: ShieldAlert, tone: "orange", contentTypes: ["warning"], legacySlugs: ["warning"] }),
];

export const ALL_CHANNELS: ChannelConfig[] = [...PRIMARY_CHANNELS, ...SECONDARY_CHANNELS];

export const MORE_CHANNEL_SUMMARY = "问答、商家、优惠、服务...";

export const CHANNEL_GROUPS: Array<{ title: string; items: ChannelKey[] }> = [
  { title: "生活发现", items: ["news", "guide", "qa", "events", "services"] },
  { title: "居住与工作", items: ["housing", "jobs", "recruiting", "referral"] },
  { title: "交易与优惠", items: ["market", "merchant", "deals"] },
  { title: "社交连接", items: ["food", "buddy", "treehole"] },
  { title: "本地安全", items: ["warnings"] },
];

export const CHANNEL_FILTERS: Partial<Record<ChannelKey, string[]>> = {
  market: ["全部", "出闲置", "求购", "免费", "可配送", "自取"],
  housing: ["全部", "合租", "转租", "整租", "求租"],
  jobs: ["全部", "兼职", "全职", "远程", "招聘", "求职"],
  food: ["全部", "吃饭", "咖啡", "酒吧", "周末"],
  buddy: ["全部", "学习", "运动", "旅行", "语言交换"],
  events: ["全部", "今天", "本周", "周末", "免费"],
  guide: ["全部", "交通", "生活", "手续", "省钱", "避坑"],
  news: ["全部", "本地", "交通", "天气", "公告"],
};

const CHANNEL_BY_KEY = new Map(ALL_CHANNELS.map((item) => [item.key, item]));
const CHANNEL_ALIAS = new Map<string, ChannelKey>();

for (const item of ALL_CHANNELS) {
  CHANNEL_ALIAS.set(item.key, item.key);
  CHANNEL_ALIAS.set(item.label, item.key);
  for (const legacy of item.legacySlugs || []) CHANNEL_ALIAS.set(legacy, item.key);
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

export function buildChannelHref(
  citySlug: string | null | undefined,
  channelKey: ChannelKey,
  sourceParams?: URLSearchParams | { toString(): string },
): string {
  const city = getCityBySlug(citySlug) || getDefaultCity();
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
      return `搜索${cityName}租房、合租、房源、区域...`;
    case "jobs":
    case "recruiting":
    case "referral":
      return `搜索${cityName}兼职、正社员、招聘、内推...`;
    case "food":
      return `搜索${cityName}约饭、咖啡、探店、饭搭子...`;
    case "guide":
      return `搜索${cityName}攻略、手续、银行卡、生活经验...`;
    case "news":
      return `搜索${cityName}新闻、交通、生活提醒...`;
    default:
      return `搜索${cityName}的租房、工作、约饭、攻略...`;
  }
}

export function channelHrefForSearch(citySlug: CitySlug, channel?: ChannelKey) {
  const params = new URLSearchParams({ city: citySlug });
  if (channel) params.set("channel", channel);
  return `/search?${params.toString()}`;
}
