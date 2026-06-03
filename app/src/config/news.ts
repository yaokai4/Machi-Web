import type { EditorialPost, NewsCategory } from "@/lib/api";
import { getCityBySlug, getDefaultCity, normalizeNewsCitySlug, type NewsCitySlug } from "@/config/cities";

export type NewsImportance = "high" | "medium" | "low";
export type NewsLanguage = "ja" | "zh" | "en";
export type LocalNewsCategory =
  | "today"
  | "traffic"
  | "weather_disaster"
  | "policy_residency"
  | "safety"
  | "events"
  | "life";

export type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  sourceName: string;
  sourceUrl?: string;
  originalLanguage?: NewsLanguage;
  citySlug?: string;
  cityName?: string;
  scope: "city" | "japan";
  category: LocalNewsCategory;
  importance: NewsImportance;
  publishedAt?: string;
  fetchedAt?: string;
  expiresAt?: string;
  status?: "draft" | "published" | "hidden" | "duplicate" | "failed";
  internalHref?: string;
};

export const NEWS_CATEGORY_TABS: Array<{ key: "" | LocalNewsCategory; label: string }> = [
  { key: "", label: "全部" },
  { key: "today", label: "今日提醒" },
  { key: "traffic", label: "交通" },
  { key: "weather_disaster", label: "天气灾害" },
  { key: "policy_residency", label: "政策在留" },
  { key: "safety", label: "安全" },
  { key: "events", label: "活动" },
  { key: "life", label: "生活" },
];

export const LOCAL_NEWS_CATEGORY_LABELS: Record<LocalNewsCategory, string> = {
  today: "今日提醒",
  traffic: "交通",
  weather_disaster: "天气灾害",
  policy_residency: "政策在留",
  safety: "安全",
  events: "活动",
  life: "生活",
};

export const NEWS_IMPORTANCE_LABELS: Record<NewsImportance, string> = {
  high: "重要",
  medium: "提醒",
  low: "参考",
};

const CATEGORY_MAP: Partial<Record<NewsCategory | string, LocalNewsCategory>> = {
  local_news: "today",
  editor_pick: "today",
  weekly_digest: "today",
  traffic_alert: "traffic",
  train_delay: "traffic",
  commute: "traffic",
  weather_alert: "weather_disaster",
  earthquake_alert: "weather_disaster",
  typhoon_alert: "weather_disaster",
  disaster: "weather_disaster",
  disaster_prevention: "weather_disaster",
  policy_update: "policy_residency",
  immigration_visa: "policy_residency",
  legal_notice: "policy_residency",
  residence_card: "policy_residency",
  visa_policy: "policy_residency",
  foreign_resident_notice: "policy_residency",
  labor_policy: "policy_residency",
  resident_service: "policy_residency",
  public_safety: "safety",
  city_event: "events",
  local_event: "events",
  weekend: "events",
  exhibition: "events",
  meetup: "events",
  language_exchange: "events",
  life_notice: "life",
  housing_notice: "life",
  housing_market: "life",
  work_study: "life",
  health: "life",
  food: "life",
  garbage_rule: "life",
  child_support: "life",
  digital_life: "life",
};

export function mapNewsCategory(category?: string | null): LocalNewsCategory | undefined {
  return category ? CATEGORY_MAP[category] : undefined;
}

export function isLifeRelatedNews(category?: string | null): boolean {
  return Boolean(mapNewsCategory(category));
}

export function normalizeNewsPost(post: EditorialPost): NewsItem | undefined {
  const title = String(post.title || "").trim();
  const sourceName = String(post.source_name || post.author_display_name || "").trim();
  if (!title || !sourceName) return undefined;

  const category = mapNewsCategory(post.category) || "today";
  const citySlug = normalizeNewsCitySlug(post.city || "");
  const city = citySlug === "japan" ? undefined : getCityBySlug(citySlug);
  const risk = post.risk_level || "low";
  const importance: NewsImportance = risk === "high"
    ? "high"
    : risk === "medium" || category === "traffic" || category === "weather_disaster" || category === "policy_residency"
      ? "medium"
      : "low";
  const language = normalizeLanguage(post.language);

  return {
    id: post.id,
    title,
    summary: post.summary || undefined,
    sourceName,
    sourceUrl: post.original_url || post.source_url || undefined,
    originalLanguage: language,
    citySlug: city?.slug,
    cityName: city?.name || "Japan-wide",
    scope: city ? "city" : "japan",
    category,
    importance,
    publishedAt: post.published_at || post.source_published_at || undefined,
    fetchedAt: post.created_at || post.updated_at,
    status: post.status === "published" ? "published" : post.status === "hidden" ? "hidden" : post.status === "draft" ? "draft" : undefined,
    internalHref: "/guide",
  };
}

export function normalizeNewsItems(posts: EditorialPost[], selectedCity: NewsCitySlug, category: "" | LocalNewsCategory): NewsItem[] {
  const seen = new Set<string>();
  const now = Date.now();
  return posts
    .map(normalizeNewsPost)
    .filter((item): item is NewsItem => Boolean(item))
    .filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > now)
    .filter((item) => {
      if (selectedCity === "japan") return true;
      return item.scope === "japan" || item.citySlug === selectedCity;
    })
    .filter((item) => !category || item.category === category)
    .filter((item) => {
      const key = item.title.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function fallbackNewsForCity(citySlug: NewsCitySlug): NewsItem[] {
  const city = citySlug === "japan" ? undefined : getCityBySlug(citySlug);
  const cityName = city?.name || "日本区";
  const slug = city?.slug;
  const scope = city ? "city" : "japan";
  const now = new Date().toISOString();

  return [
    {
      id: `fallback-weather-${citySlug}`,
      title: `${cityName}今日天气与灾害信息提醒`,
      summary: "出门前建议确认气象厅等官方来源的天气、降雨、强风和灾害预警。遇到警报时优先遵循当地政府和交通机构通知。",
      sourceName: "Machi 日本生活编辑部",
      sourceUrl: "https://www.jma.go.jp/",
      originalLanguage: "ja",
      citySlug: slug,
      cityName,
      scope,
      category: "weather_disaster",
      importance: "high",
      fetchedAt: now,
      status: "published",
    },
    {
      id: `fallback-traffic-${citySlug}`,
      title: `${cityName}交通运行提醒`,
      summary: "通勤、上学或跨城出行前，请提前查看常用线路的运行信息。临时延误、施工和换乘调整可能影响到达时间。",
      sourceName: "Machi 东京编辑部",
      originalLanguage: "zh",
      citySlug: slug,
      cityName,
      scope,
      category: "traffic",
      importance: "medium",
      fetchedAt: now,
      status: "published",
    },
    {
      id: `fallback-residency-${citySlug}`,
      title: "在留、保险和区役所手续提醒",
      summary: "搬家、续签、入职和开学前后，建议确认在留卡地址、国民健康保险、年金和住民票等手续是否需要更新。",
      sourceName: "Machi 日本生活编辑部",
      sourceUrl: "https://www.moj.go.jp/isa/",
      originalLanguage: "ja",
      citySlug: slug,
      cityName,
      scope,
      category: "policy_residency",
      importance: "medium",
      fetchedAt: now,
      status: "published",
    },
    {
      id: `fallback-safety-${citySlug}`,
      title: `${cityName}安全生活提醒`,
      summary: "租房、二手交易、兼职和线下见面请保留沟通记录，避免提前转账。涉及合同、押金和身份信息时请谨慎核实。",
      sourceName: "Machi 本地生活编辑部",
      originalLanguage: "zh",
      citySlug: slug,
      cityName,
      scope,
      category: "safety",
      importance: "medium",
      fetchedAt: now,
      status: "published",
    },
  ];
}

export function newsCityFilters(currentCity: NewsCitySlug): Array<{ slug: NewsCitySlug; label: string }> {
  const base: NewsCitySlug[] = ["japan", "tokyo", "osaka", "kyoto", "nagoya", "fukuoka"];
  const ordered = [currentCity, ...base.filter((slug) => slug !== currentCity)];
  return ordered.map((slug) => ({
    slug,
    label: slug === "japan" ? "Japan-wide" : getCityBySlug(slug)?.name || getDefaultCity().name,
  }));
}

function normalizeLanguage(language?: string | null): NewsLanguage | undefined {
  const raw = String(language || "").toLowerCase();
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("en")) return "en";
  return undefined;
}
