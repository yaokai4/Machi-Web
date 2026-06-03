import type { KXUser } from "@/lib/types";
import {
  regionFromUser,
  resolveRegion,
  type RegionInfo,
} from "@/lib/regions";

export type CitySlug = "tokyo" | "osaka" | "nagoya" | "kyoto" | "fukuoka";
export type NewsCitySlug = CitySlug | "japan";

export interface CityConfig {
  slug: CitySlug;
  name: string;
  englishName: string;
  regionCode: string;
  provinceCode: string;
  flag: string;
}

export const CITY_CONFIGS: CityConfig[] = [
  { slug: "tokyo", name: "东京", englishName: "Tokyo", regionCode: "jp.tokyo.tokyo", provinceCode: "tokyo", flag: "🇯🇵" },
  { slug: "osaka", name: "大阪", englishName: "Osaka", regionCode: "jp.osaka.osaka", provinceCode: "osaka", flag: "🇯🇵" },
  { slug: "kyoto", name: "京都", englishName: "Kyoto", regionCode: "jp.kyoto.kyoto", provinceCode: "kyoto", flag: "🇯🇵" },
  { slug: "nagoya", name: "名古屋", englishName: "Nagoya", regionCode: "jp.aichi.nagoya", provinceCode: "aichi", flag: "🇯🇵" },
  { slug: "fukuoka", name: "福冈", englishName: "Fukuoka", regionCode: "jp.fukuoka.fukuoka", provinceCode: "fukuoka", flag: "🇯🇵" },
];

export const DEFAULT_CITY_SLUG: CitySlug = "tokyo";
export const CITY_STORAGE_KEY = "machi_selected_city";

const CITY_BY_SLUG = new Map(CITY_CONFIGS.map((city) => [city.slug, city]));
const CITY_ALIAS: Record<string, CitySlug> = {
  tokyo: "tokyo",
  "jp.tokyo.tokyo": "tokyo",
  东京: "tokyo",
  osaka: "osaka",
  "jp.osaka.osaka": "osaka",
  大阪: "osaka",
  kyoto: "kyoto",
  "jp.kyoto.kyoto": "kyoto",
  京都: "kyoto",
  nagoya: "nagoya",
  "jp.aichi.nagoya": "nagoya",
  名古屋: "nagoya",
  fukuoka: "fukuoka",
  "jp.fukuoka.fukuoka": "fukuoka",
  福冈: "fukuoka",
  福岡: "fukuoka",
};

export function normalizeCitySlug(value?: string | null): CitySlug | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return CITY_ALIAS[raw.toLowerCase()] || CITY_ALIAS[raw];
}

export function normalizeNewsCitySlug(value?: string | null): NewsCitySlug {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "japan" || raw === "jp" || raw === "japan-wide" || raw === "nationwide" || raw === "") return "japan";
  return normalizeCitySlug(raw) || DEFAULT_CITY_SLUG;
}

export function getCityBySlug(value?: string | null): CityConfig | undefined {
  const slug = normalizeCitySlug(value);
  return slug ? CITY_BY_SLUG.get(slug) : undefined;
}

export function getDefaultCity(): CityConfig {
  return CITY_BY_SLUG.get(DEFAULT_CITY_SLUG)!;
}

export function regionForCitySlug(value?: string | null): RegionInfo | undefined {
  const config = getCityBySlug(value) || getDefaultCity();
  return resolveRegion(config.regionCode);
}

export function cityFromRegion(region?: RegionInfo | null): CityConfig | undefined {
  if (!region) return undefined;
  return getCityBySlug(region.region_code) || getCityBySlug(region.city_code);
}

export function readStoredCitySlug(): CitySlug | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return normalizeCitySlug(window.localStorage.getItem(CITY_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

export function writeStoredCitySlug(slug?: string | null) {
  if (typeof window === "undefined") return;
  const normalized = normalizeCitySlug(slug);
  if (!normalized) return;
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, normalized);
  } catch {
    // localStorage can be disabled in embedded browsers.
  }
}

export function citySlugFromSearchParams(params: { get(name: string): string | null }): CitySlug | undefined {
  return normalizeCitySlug(params.get("city")) || normalizeCitySlug(params.get("region"));
}

export function resolveCitySlugFromContext(
  params: { get(name: string): string | null },
  user?: Pick<KXUser, "country" | "province" | "city" | "current_region_code"> | null,
): CitySlug {
  return citySlugFromSearchParams(params)
    || cityFromRegion(regionFromUser(user))?.slug
    || DEFAULT_CITY_SLUG;
}

export function cityFilterLabel(slug: NewsCitySlug): string {
  if (slug === "japan") return "日本区";
  return getCityBySlug(slug)?.name || getDefaultCity().name;
}
