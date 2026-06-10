import type { KXUser } from "@/lib/types";
import {
  regionFromUser,
  resolveRegion,
  type RegionInfo,
} from "@/lib/regions";

export type CitySlug =
  | "tokyo"
  | "yokohama"
  | "kawasaki"
  | "saitama"
  | "chiba"
  | "osaka"
  | "kyoto"
  | "kobe"
  | "nara"
  | "otsu"
  | "sendai"
  | "nagoya"
  | "fukuoka";
export type NewsCitySlug = CitySlug | "japan";
export type CityAreaSlug = "kanto" | "kansai" | "other";

export interface CityConfig {
  slug: CitySlug;
  name: string;
  englishName: string;
  regionCode: string;
  provinceCode: string;
  flag: string;
  area: CityAreaSlug;
}

export const CITY_CONFIGS: CityConfig[] = [
  { slug: "tokyo", name: "东京", englishName: "Tokyo", regionCode: "jp.tokyo.tokyo", provinceCode: "tokyo", flag: "🇯🇵", area: "kanto" },
  { slug: "yokohama", name: "横滨", englishName: "Yokohama", regionCode: "jp.kanagawa.yokohama", provinceCode: "kanagawa", flag: "🇯🇵", area: "kanto" },
  { slug: "kawasaki", name: "川崎", englishName: "Kawasaki", regionCode: "jp.kanagawa.kawasaki", provinceCode: "kanagawa", flag: "🇯🇵", area: "kanto" },
  { slug: "saitama", name: "埼玉", englishName: "Saitama", regionCode: "jp.saitama.saitama", provinceCode: "saitama", flag: "🇯🇵", area: "kanto" },
  { slug: "chiba", name: "千叶", englishName: "Chiba", regionCode: "jp.chiba.chiba", provinceCode: "chiba", flag: "🇯🇵", area: "kanto" },
  { slug: "osaka", name: "大阪", englishName: "Osaka", regionCode: "jp.osaka.osaka", provinceCode: "osaka", flag: "🇯🇵", area: "kansai" },
  { slug: "kyoto", name: "京都", englishName: "Kyoto", regionCode: "jp.kyoto.kyoto", provinceCode: "kyoto", flag: "🇯🇵", area: "kansai" },
  { slug: "kobe", name: "神户", englishName: "Kobe", regionCode: "jp.hyogo.kobe", provinceCode: "hyogo", flag: "🇯🇵", area: "kansai" },
  { slug: "nara", name: "奈良", englishName: "Nara", regionCode: "jp.nara.nara", provinceCode: "nara", flag: "🇯🇵", area: "kansai" },
  { slug: "otsu", name: "大津", englishName: "Otsu", regionCode: "jp.shiga.otsu", provinceCode: "shiga", flag: "🇯🇵", area: "kansai" },
  { slug: "sendai", name: "仙台", englishName: "Sendai", regionCode: "jp.miyagi.sendai", provinceCode: "miyagi", flag: "🇯🇵", area: "other" },
  { slug: "nagoya", name: "名古屋", englishName: "Nagoya", regionCode: "jp.aichi.nagoya", provinceCode: "aichi", flag: "🇯🇵", area: "other" },
  { slug: "fukuoka", name: "福冈", englishName: "Fukuoka", regionCode: "jp.fukuoka.fukuoka", provinceCode: "fukuoka", flag: "🇯🇵", area: "other" },
];

export const CITY_AREA_GROUPS: Array<{ slug: CityAreaSlug; label: string; subtitle: string; cities: CitySlug[] }> = [
  {
    slug: "kanto",
    label: "关东圈",
    subtitle: "一都三县：东京、神奈川、埼玉、千叶",
    cities: ["tokyo", "yokohama", "kawasaki", "saitama", "chiba"],
  },
  {
    slug: "kansai",
    label: "关西圈",
    subtitle: "京阪神与周边：大阪、京都、神户、奈良、大津",
    cities: ["osaka", "kyoto", "kobe", "nara", "otsu"],
  },
  {
    slug: "other",
    label: "其他热门",
    subtitle: "名古屋、福冈、仙台等城市",
    cities: ["nagoya", "fukuoka", "sendai"],
  },
];

export const DEFAULT_CITY_SLUG: CitySlug = "tokyo";
export const CITY_STORAGE_KEY = "machi_selected_city";

const CITY_BY_SLUG = new Map(CITY_CONFIGS.map((city) => [city.slug, city]));
const CITY_ALIAS: Record<string, CitySlug> = {
  tokyo: "tokyo",
  "jp.tokyo.tokyo": "tokyo",
  东京: "tokyo",
  東京: "tokyo",
  yokohama: "yokohama",
  "jp.kanagawa.yokohama": "yokohama",
  横滨: "yokohama",
  橫濱: "yokohama",
  横浜: "yokohama",
  kawasaki: "kawasaki",
  "jp.kanagawa.kawasaki": "kawasaki",
  川崎: "kawasaki",
  saitama: "saitama",
  "jp.saitama.saitama": "saitama",
  埼玉: "saitama",
  chiba: "chiba",
  "jp.chiba.chiba": "chiba",
  千叶: "chiba",
  千葉: "chiba",
  sendai: "sendai",
  "jp.miyagi.sendai": "sendai",
  仙台: "sendai",
  osaka: "osaka",
  "jp.osaka.osaka": "osaka",
  大阪: "osaka",
  kyoto: "kyoto",
  "jp.kyoto.kyoto": "kyoto",
  京都: "kyoto",
  kobe: "kobe",
  "jp.hyogo.kobe": "kobe",
  神户: "kobe",
  神戶: "kobe",
  神戸: "kobe",
  nara: "nara",
  "jp.nara.nara": "nara",
  奈良: "nara",
  otsu: "otsu",
  "jp.shiga.otsu": "otsu",
  大津: "otsu",
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

export function getCityAreaForSlug(value?: string | null) {
  const slug = normalizeCitySlug(value);
  if (!slug) return undefined;
  return CITY_AREA_GROUPS.find((group) => group.cities.includes(slug));
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
