// Shared geometry for the V2 homepage: a stylized particle map of the
// Japanese archipelago plus the 13 live Machi cities. Coordinates are
// (lon, lat) pairs projected into a normalized 0..1 space by `project`.
// The outline is deliberately simplified — it renders as a glowing dot
// field, not a cartographic map — but city anchors use real lon/lat so
// relative positions stay honest.

export type CityGroup = "kanto" | "kansai" | "other";

export type MachiCity = {
  key: string;
  lon: number;
  lat: number;
  group: CityGroup;
  /** display names per marketing locale */
  name: { zh: string; en: string; ja: string };
};

// The 13 live cities (3 metro areas + other hubs) — mirrors the app's
// region catalog. Do not add planned/overseas cities here: everything in
// this list renders as "live" on the map.
export const MACHI_CITIES: MachiCity[] = [
  { key: "tokyo", lon: 139.69, lat: 35.68, group: "kanto", name: { zh: "东京", en: "Tokyo", ja: "東京" } },
  { key: "yokohama", lon: 139.64, lat: 35.44, group: "kanto", name: { zh: "横滨", en: "Yokohama", ja: "横浜" } },
  { key: "kawasaki", lon: 139.7, lat: 35.53, group: "kanto", name: { zh: "川崎", en: "Kawasaki", ja: "川崎" } },
  { key: "saitama", lon: 139.65, lat: 35.86, group: "kanto", name: { zh: "埼玉", en: "Saitama", ja: "さいたま" } },
  { key: "chiba", lon: 140.11, lat: 35.61, group: "kanto", name: { zh: "千叶", en: "Chiba", ja: "千葉" } },
  { key: "osaka", lon: 135.5, lat: 34.69, group: "kansai", name: { zh: "大阪", en: "Osaka", ja: "大阪" } },
  { key: "kyoto", lon: 135.77, lat: 35.01, group: "kansai", name: { zh: "京都", en: "Kyoto", ja: "京都" } },
  { key: "kobe", lon: 135.2, lat: 34.69, group: "kansai", name: { zh: "神户", en: "Kobe", ja: "神戸" } },
  { key: "nara", lon: 135.8, lat: 34.69, group: "kansai", name: { zh: "奈良", en: "Nara", ja: "奈良" } },
  { key: "otsu", lon: 135.87, lat: 35.0, group: "kansai", name: { zh: "大津", en: "Otsu", ja: "大津" } },
  { key: "nagoya", lon: 136.91, lat: 35.18, group: "other", name: { zh: "名古屋", en: "Nagoya", ja: "名古屋" } },
  { key: "fukuoka", lon: 130.4, lat: 33.59, group: "other", name: { zh: "福冈", en: "Fukuoka", ja: "福岡" } },
  { key: "sendai", lon: 140.87, lat: 38.27, group: "other", name: { zh: "仙台", en: "Sendai", ja: "仙台" } },
];

// Stylized coastline polylines (lon, lat). Enough anchor points that the
// scattered particles read as "Japan" at a glance; not survey data.
type Poly = Array<[number, number]>;

const HOKKAIDO: Poly = [
  [140.4, 42.0], [140.0, 42.6], [140.4, 43.3], [141.3, 43.7], [141.6, 44.6],
  [142.0, 45.3], [142.8, 44.8], [143.8, 44.1], [144.8, 43.9], [145.3, 44.3],
  [145.6, 43.8], [145.0, 43.3], [144.3, 42.9], [143.4, 42.3], [142.5, 42.2],
  [141.8, 42.6], [141.0, 42.3], [140.4, 42.0],
];

const HONSHU: Poly = [
  [140.9, 41.5], [141.5, 40.8], [141.7, 40.0], [141.9, 39.2], [141.6, 38.4],
  [141.0, 38.3], [140.9, 37.8], [140.9, 37.0], [140.6, 36.3], [140.8, 35.7],
  [140.3, 35.3], [139.8, 34.9], [139.7, 35.3], [139.3, 35.3], [138.9, 34.8],
  [138.7, 35.1], [138.3, 34.7], [137.5, 34.7], [137.0, 34.6], [136.9, 35.0],
  [136.6, 34.8], [136.9, 34.4], [136.3, 34.2], [135.8, 33.5], [135.3, 33.6],
  [135.1, 34.3], [134.6, 34.7], [134.0, 34.6], [133.4, 34.4], [132.6, 34.2],
  [132.1, 33.9], [131.4, 34.0], [131.0, 34.3], [130.9, 34.7], [131.4, 34.7],
  [132.0, 35.1], [132.7, 35.4], [133.3, 35.5], [134.0, 35.6], [134.8, 35.7],
  [135.4, 35.5], [135.9, 35.6], [136.1, 36.0], [136.8, 36.3], [137.4, 36.8],
  [137.0, 37.1], [137.3, 37.5], [138.0, 37.2], [138.6, 37.6], [139.1, 38.0],
  [139.5, 38.5], [139.9, 39.1], [140.0, 39.9], [139.9, 40.6], [140.3, 41.2],
  [140.9, 41.5],
];

const SHIKOKU: Poly = [
  [134.6, 34.2], [134.7, 33.8], [134.2, 33.3], [133.6, 33.5], [133.0, 32.9],
  [132.6, 32.9], [132.4, 33.4], [132.8, 33.9], [133.6, 34.1], [134.6, 34.2],
];

const KYUSHU: Poly = [
  [130.9, 33.9], [131.1, 33.6], [131.7, 33.6], [131.9, 33.0], [131.5, 32.4],
  [131.3, 31.6], [130.7, 31.0], [130.2, 31.3], [130.2, 32.0], [130.4, 32.6],
  [129.8, 32.7], [129.7, 33.2], [130.1, 33.6], [130.4, 33.9], [130.9, 33.9],
];

export const JAPAN_POLYS: Poly[] = [HOKKAIDO, HONSHU, SHIKOKU, KYUSHU];

// Geographic window used for projection (lon 128.5–146.5, lat 30.5–45.9).
const LON_MIN = 128.5;
const LON_MAX = 146.5;
const LAT_MIN = 30.5;
const LAT_MAX = 45.9;

/** Project (lon, lat) into normalized 0..1 map space (y grows downward). */
export function project(lon: number, lat: number): [number, number] {
  const x = (lon - LON_MIN) / (LON_MAX - LON_MIN);
  // Cheap latitude correction so the archipelago doesn't look squashed.
  const y = 1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
  return [x, y];
}

export const CITY_POINTS = MACHI_CITIES.map((c) => {
  const [x, y] = project(c.lon, c.lat);
  return { ...c, x, y };
});

// Kanto framing target used by the hero scroll "camera".
export const KANTO_CENTER = project(139.75, 35.6);
