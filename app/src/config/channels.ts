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
  channel({ key: "housing", label: "租房", subtitle: "合租、短租、房源信息", Icon: Home, tone: "indigo", contentTypes: ["housing", "roommate"], legacySlugs: ["rent", "rental", "rentals"] }),
  channel({ key: "jobs", label: "工作", subtitle: "兼职、全职、招聘和内推", Icon: Briefcase, tone: "violet", contentTypes: ["job_seek", "job_post", "referral"], legacySlugs: ["job", "recruiting", "recruit", "referral", "hiring"] }),
  channel({ key: "services", label: "本地服务", subtitle: "翻译、手续、接机、生活支持", Icon: Wrench, tone: "orange", contentTypes: ["service", "merchant"], legacySlugs: ["service", "merchant", "business", "businesses"] }),
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
      { label: "本地服务", subtitle: "翻译、手续、接机、生活支持", channel: "services", Icon: Wrench },
      { label: "商家", subtitle: "本地店铺和服务商资料", channel: "services", Icon: Store },
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
  market: ["全部", "家具", "家电", "电子产品", "搬家出清", "免费送", "求购"],
  housing: ["全部", "单人", "合租", "短租", "整租", "家具家电"],
  jobs: ["全部", "兼职", "全职", "日语 N3 可", "留学生可", "签证支持"],
  services: ["全部", "翻译电话", "役所手续", "接机", "租房申请", "履历书修改"],
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
