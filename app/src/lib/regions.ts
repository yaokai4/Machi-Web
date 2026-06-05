import type { KXRegion, KXUser } from "./types";

export interface RegionCountry {
  code: string;
  name: string;
  emoji: string;
  tier: number;
  has_provinces: boolean;
}

export interface RegionProvince {
  code: string;
  name: string;
}

export interface RegionCity {
  code: string;
  name: string;
}

export interface RegionInfo {
  region_code: string;
  country_code: string;
  country_name: string;
  country_emoji: string;
  province_code: string;
  province_name: string;
  city_code: string;
  city_name: string;
}

export const REGION_COUNTRIES: RegionCountry[] = [
  { code: "cn", name: "中国", emoji: "🇨🇳", tier: 1, has_provinces: true },
  { code: "jp", name: "日本", emoji: "🇯🇵", tier: 1, has_provinces: true },
  { code: "us", name: "美国", emoji: "🇺🇸", tier: 1, has_provinces: true },
  { code: "sg", name: "新加坡", emoji: "🇸🇬", tier: 2, has_provinces: false },
  { code: "kr", name: "韩国", emoji: "🇰🇷", tier: 2, has_provinces: false },
  { code: "uk", name: "英国", emoji: "🇬🇧", tier: 2, has_provinces: false },
  { code: "fr", name: "法国", emoji: "🇫🇷", tier: 2, has_provinces: false },
  { code: "au", name: "澳大利亚", emoji: "🇦🇺", tier: 2, has_provinces: false },
  { code: "ca", name: "加拿大", emoji: "🇨🇦", tier: 2, has_provinces: false },
  { code: "th", name: "泰国", emoji: "🇹🇭", tier: 3, has_provinces: false },
  { code: "my", name: "马来西亚", emoji: "🇲🇾", tier: 3, has_provinces: false },
  { code: "de", name: "德国", emoji: "🇩🇪", tier: 3, has_provinces: false },
  { code: "nl", name: "荷兰", emoji: "🇳🇱", tier: 3, has_provinces: false },
];

export const REGION_PROVINCES: Record<string, RegionProvince[]> = {
  cn: [
    { code: "beijing", name: "北京" },
    { code: "shanghai", name: "上海" },
    { code: "tianjin", name: "天津" },
    { code: "chongqing", name: "重庆" },
    { code: "zhejiang", name: "浙江" },
    { code: "jiangsu", name: "江苏" },
    { code: "guangdong", name: "广东" },
    { code: "hongkong", name: "香港" },
    { code: "sichuan", name: "四川" },
    { code: "shandong", name: "山东" },
    { code: "fujian", name: "福建" },
    { code: "henan", name: "河南" },
    { code: "anhui", name: "安徽" },
    { code: "hunan", name: "湖南" },
    { code: "shaanxi", name: "陕西" },
    { code: "hubei", name: "湖北" },
  ],
  jp: [
    { code: "tokyo", name: "东京都" },
    { code: "osaka", name: "大阪府" },
    { code: "kyoto", name: "京都府" },
    { code: "fukuoka", name: "福冈县" },
    { code: "aichi", name: "爱知县" },
    { code: "kanagawa", name: "神奈川县" },
    { code: "saitama", name: "埼玉县" },
    { code: "chiba", name: "千叶县" },
    { code: "hyogo", name: "兵库县" },
    { code: "hokkaido", name: "北海道" },
    { code: "miyagi", name: "宫城县" },
    { code: "hiroshima", name: "广岛县" },
    { code: "okinawa", name: "冲绳县" },
    { code: "shizuoka", name: "静冈县" },
    { code: "ibaraki", name: "茨城县" },
    { code: "nara", name: "奈良县" },
    { code: "mie", name: "三重县" },
    { code: "kumamoto", name: "熊本县" },
    { code: "kagoshima", name: "鹿儿岛县" },
    { code: "nagano", name: "长野县" },
    { code: "ishikawa", name: "石川县" },
    { code: "okayama", name: "冈山县" },
    { code: "niigata", name: "新潟县" },
    { code: "tochigi", name: "栃木县" },
    { code: "gunma", name: "群马县" },
    { code: "shiga", name: "滋贺县" },
    { code: "gifu", name: "岐阜县" },
  ],
  us: [
    { code: "ca", name: "加利福尼亚" },
    { code: "ny", name: "纽约" },
    { code: "wa", name: "华盛顿" },
    { code: "tx", name: "德克萨斯" },
    { code: "fl", name: "佛罗里达" },
    { code: "il", name: "伊利诺伊" },
    { code: "ma", name: "马萨诸塞" },
    { code: "nj", name: "新泽西" },
  ],
};

export const REGION_CITIES: Record<string, RegionCity[]> = {
  shanghai: [{ code: "shanghai", name: "上海" }],
  beijing: [{ code: "beijing", name: "北京" }],
  tianjin: [{ code: "tianjin", name: "天津" }],
  chongqing: [{ code: "chongqing", name: "重庆" }],
  zhejiang: [{ code: "hangzhou", name: "杭州" }, { code: "ningbo", name: "宁波" }],
  jiangsu: [{ code: "nanjing", name: "南京" }, { code: "suzhou", name: "苏州" }],
  guangdong: [
    { code: "guangzhou", name: "广州" },
    { code: "shenzhen", name: "深圳" },
    { code: "foshan", name: "佛山" },
    { code: "dongguan", name: "东莞" },
  ],
  sichuan: [{ code: "chengdu", name: "成都" }],
  shandong: [{ code: "qingdao", name: "青岛" }],
  fujian: [{ code: "xiamen", name: "厦门" }],
  henan: [{ code: "zhengzhou", name: "郑州" }],
  anhui: [{ code: "hefei", name: "合肥" }],
  hubei: [{ code: "wuhan", name: "武汉" }],
  shaanxi: [{ code: "xian", name: "西安" }],
  hunan: [{ code: "changsha", name: "长沙" }],
  hongkong: [{ code: "hongkong", name: "香港" }],
  tokyo: [{ code: "tokyo", name: "东京" }],
  osaka: [{ code: "osaka", name: "大阪" }],
  kyoto: [{ code: "kyoto", name: "京都" }],
  fukuoka: [{ code: "fukuoka", name: "福冈" }],
  aichi: [{ code: "nagoya", name: "名古屋" }],
  kanagawa: [{ code: "yokohama", name: "横滨" }, { code: "kawasaki", name: "川崎" }],
  saitama: [{ code: "saitama", name: "埼玉" }],
  chiba: [{ code: "chiba", name: "千叶" }],
  hyogo: [{ code: "kobe", name: "神户" }],
  hokkaido: [{ code: "sapporo", name: "札幌" }],
  miyagi: [{ code: "sendai", name: "仙台" }],
  hiroshima: [{ code: "hiroshima", name: "广岛" }],
  okinawa: [{ code: "naha", name: "那霸" }],
  shizuoka: [{ code: "shizuoka", name: "静冈" }],
  ibaraki: [{ code: "tsukuba", name: "筑波" }],
  nara: [{ code: "nara", name: "奈良" }],
  mie: [{ code: "yokkaichi", name: "四日市" }],
  kumamoto: [{ code: "kumamoto", name: "熊本" }],
  kagoshima: [{ code: "kagoshima", name: "鹿儿岛" }],
  nagano: [{ code: "nagano", name: "长野" }],
  ishikawa: [{ code: "kanazawa", name: "金泽" }],
  okayama: [{ code: "okayama", name: "冈山" }],
  niigata: [{ code: "niigata", name: "新潟" }],
  tochigi: [{ code: "utsunomiya", name: "宇都宫" }],
  gunma: [{ code: "takasaki", name: "高崎" }],
  shiga: [{ code: "otsu", name: "大津" }],
  gifu: [{ code: "gifu", name: "岐阜" }],
  ca: [
    { code: "sf", name: "旧金山" },
    { code: "la", name: "洛杉矶" },
    { code: "sd", name: "圣地亚哥" },
    { code: "sj", name: "圣何塞" },
    { code: "irvine", name: "尔湾" },
  ],
  ny: [{ code: "nyc", name: "纽约" }, { code: "buffalo", name: "布法罗" }],
  wa: [{ code: "seattle", name: "西雅图" }, { code: "bellevue", name: "贝尔维尤" }],
  tx: [{ code: "austin", name: "奥斯汀" }, { code: "houston", name: "休斯顿" }, { code: "dallas", name: "达拉斯" }],
  fl: [{ code: "miami", name: "迈阿密" }, { code: "orlando", name: "奥兰多" }],
  il: [{ code: "chicago", name: "芝加哥" }],
  ma: [{ code: "boston", name: "波士顿" }],
  nj: [{ code: "newark", name: "纽瓦克" }],
  uk: [
    { code: "london", name: "伦敦" },
    { code: "manchester", name: "曼彻斯特" },
    { code: "edinburgh", name: "爱丁堡" },
    { code: "birmingham", name: "伯明翰" },
    { code: "glasgow", name: "格拉斯哥" },
    { code: "liverpool", name: "利物浦" },
    { code: "leeds", name: "利兹" },
    { code: "bristol", name: "布里斯托" },
    { code: "cambridge", name: "剑桥" },
    { code: "oxford", name: "牛津" },
  ],
  ca_flat: [{ code: "toronto", name: "多伦多" }, { code: "vancouver", name: "温哥华" }, { code: "montreal", name: "蒙特利尔" }],
  au: [
    { code: "sydney", name: "悉尼" },
    { code: "melbourne", name: "墨尔本" },
    { code: "brisbane", name: "布里斯班" },
    { code: "perth", name: "珀斯" },
    { code: "adelaide", name: "阿德莱德" },
    { code: "canberra", name: "堪培拉" },
    { code: "goldcoast", name: "黄金海岸" },
  ],
  sg: [{ code: "singapore", name: "新加坡" }],
  kr: [
    { code: "seoul", name: "首尔" },
    { code: "busan", name: "釜山" },
    { code: "incheon", name: "仁川" },
    { code: "daegu", name: "大邱" },
    { code: "daejeon", name: "大田" },
    { code: "gwangju", name: "光州" },
  ],
  th: [{ code: "bangkok", name: "曼谷" }, { code: "chiangmai", name: "清迈" }, { code: "phuket", name: "普吉" }],
  my: [{ code: "kl", name: "吉隆坡" }, { code: "penang", name: "槟城" }],
  de: [{ code: "berlin", name: "柏林" }, { code: "munich", name: "慕尼黑" }, { code: "hamburg", name: "汉堡" }],
  fr: [
    { code: "paris", name: "巴黎" },
    { code: "lyon", name: "里昂" },
    { code: "marseille", name: "马赛" },
    { code: "toulouse", name: "图卢兹" },
    { code: "nice", name: "尼斯" },
    { code: "bordeaux", name: "波尔多" },
  ],
  nl: [{ code: "amsterdam", name: "阿姆斯特丹" }],
};

export const POPULAR_REGION_CODES = [
  "cn.shanghai.shanghai", "cn.beijing.beijing",
  "cn.guangdong.shenzhen", "cn.guangdong.guangzhou",
  "cn.zhejiang.hangzhou", "cn.sichuan.chengdu",
  "cn.chongqing.chongqing", "cn.hubei.wuhan",
  "cn.jiangsu.nanjing", "cn.jiangsu.suzhou",
  "cn.shaanxi.xian", "cn.hunan.changsha",
  "cn.shandong.qingdao", "cn.fujian.xiamen",
  "cn.tianjin.tianjin", "cn.henan.zhengzhou",
  "cn.zhejiang.ningbo", "cn.guangdong.foshan",
  "cn.guangdong.dongguan", "cn.anhui.hefei",
  "jp.tokyo.tokyo", "jp.osaka.osaka",
  "jp.kyoto.kyoto", "jp.fukuoka.fukuoka", "jp.aichi.nagoya",
  "jp.kanagawa.yokohama", "jp.kanagawa.kawasaki",
  "jp.saitama.saitama", "jp.chiba.chiba",
  "jp.hyogo.kobe", "jp.hokkaido.sapporo",
  "jp.miyagi.sendai", "jp.hiroshima.hiroshima",
  "jp.okinawa.naha", "jp.shizuoka.shizuoka",
  "us.ny.nyc", "us.ca.la", "us.ca.sf", "us.wa.seattle",
  "ca.toronto", "ca.vancouver", "ca.montreal",
  "au.sydney", "au.melbourne",
  "uk.london",
  "fr.paris",
  "sg.singapore", "kr.seoul",
  "th.bangkok",
];

export function countryByCode(code?: string): RegionCountry | undefined {
  return REGION_COUNTRIES.find((country) => country.code === code?.toLowerCase());
}

export function countryFlag(code?: string): string {
  return countryByCode(code)?.emoji || "🌐";
}

export function countryName(code?: string): string {
  return countryByCode(code)?.name || code?.toUpperCase() || "";
}

export function provincesFor(country?: string): RegionProvince[] {
  return country ? REGION_PROVINCES[country.toLowerCase()] || [] : [];
}

export function citiesFor(country?: string, province?: string): RegionCity[] {
  const c = country?.toLowerCase() || "";
  if (!c) return [];
  if (province) return REGION_CITIES[province.toLowerCase()] || [];
  if (c === "ca") return REGION_CITIES.ca_flat || [];
  return REGION_CITIES[c] || [];
}

export function composeRegionCode(country?: string, province?: string, city?: string): string {
  const c = country?.toLowerCase() || "";
  const ci = city?.toLowerCase() || "";
  if (!c || !ci) return "";
  const spec = countryByCode(c);
  const p = province?.toLowerCase() || "";
  return spec?.has_provinces && p ? `${c}.${p}.${ci}` : `${c}.${ci}`;
}

export function resolveRegion(regionCode?: string): RegionInfo | undefined {
  if (!regionCode) return undefined;
  const parts = regionCode.toLowerCase().split(".");
  if (parts.length !== 2 && parts.length !== 3) return undefined;
  const countryCode = parts[0];
  const country = countryByCode(countryCode);
  if (!country) return undefined;
  const provinceCode = parts.length === 3 ? parts[1] : "";
  const cityCode = parts[parts.length - 1];
  const province = country.has_provinces ? provincesFor(countryCode).find((item) => item.code === provinceCode) : undefined;
  if (country.has_provinces && !province) return undefined;
  const city = citiesFor(countryCode, provinceCode || undefined).find((item) => item.code === cityCode);
  if (!city) return undefined;
  return {
    region_code: regionCode.toLowerCase(),
    country_code: countryCode,
    country_name: country.name,
    country_emoji: country.emoji,
    province_code: provinceCode,
    province_name: province?.name || "",
    city_code: cityCode,
    city_name: city.name,
  };
}

export function makeRegion(country?: string, province?: string, city?: string): RegionInfo | undefined {
  return resolveRegion(composeRegionCode(country, province, city));
}

export function regionFromUser(user?: Pick<KXUser, "country" | "province" | "city" | "current_region_code"> | null): RegionInfo | undefined {
  if (!user) return undefined;
  return resolveRegion(user.current_region_code) || makeRegion(user.country, user.province, user.city);
}

export function normalizeRegion(region: RegionInfo | KXRegion): RegionInfo {
  return {
    region_code: region.region_code,
    country_code: region.country_code,
    country_name: region.country_name,
    country_emoji: region.country_emoji,
    province_code: region.province_code,
    province_name: region.province_name,
    city_code: region.city_code,
    city_name: region.city_name,
  };
}

export function regionDisplayName(region?: RegionInfo): string {
  if (!region) return "选择当前地区";
  if (!region.province_name || region.province_name === region.city_name || region.province_code === region.city_code) {
    return `${region.country_name} · ${region.city_name}`;
  }
  return `${region.country_name} · ${region.province_name} · ${region.city_name}`;
}

export function regionHeaderLabel(region?: RegionInfo): string {
  return region ? `${region.country_emoji} ${region.city_name}` : "选择城市";
}

export function regionShortLabel(region?: RegionInfo): string {
  if (!region) return "选择城市";
  if (region.province_name && region.province_code !== region.city_code) return `${region.city_name} · ${region.province_name}`;
  return region.city_name;
}

export function regionAccountPatch(region: RegionInfo): {
  country: string;
  province: string;
  city: string;
  current_region_code: string;
} {
  return {
    country: region.country_code,
    province: region.province_code,
    city: region.city_code,
    current_region_code: region.region_code,
  };
}

export function popularRegions(): RegionInfo[] {
  return POPULAR_REGION_CODES.map((code) => resolveRegion(code)).filter((region): region is RegionInfo => Boolean(region));
}

export function hotCitiesForCountry(country?: string): RegionInfo[] {
  const current = country?.toLowerCase();
  const codes = current === "cn"
    ? [
        "cn.beijing.beijing", "cn.shanghai.shanghai", "cn.guangdong.shenzhen",
        "cn.guangdong.guangzhou", "cn.zhejiang.hangzhou", "cn.sichuan.chengdu",
        "cn.hubei.wuhan", "cn.jiangsu.nanjing", "cn.jiangsu.suzhou", "cn.fujian.xiamen",
      ]
    : current === "jp"
      ? [
          "jp.tokyo.tokyo", "jp.osaka.osaka", "jp.kanagawa.yokohama",
          "jp.kyoto.kyoto", "jp.fukuoka.fukuoka", "jp.aichi.nagoya",
          "jp.hokkaido.sapporo", "jp.hyogo.kobe", "jp.chiba.chiba",
          "jp.saitama.saitama", "jp.miyagi.sendai", "jp.hiroshima.hiroshima",
        ]
      : [
          "cn.beijing.beijing", "cn.shanghai.shanghai", "cn.guangdong.shenzhen",
          "cn.guangdong.guangzhou", "cn.zhejiang.hangzhou", "cn.sichuan.chengdu",
          "jp.tokyo.tokyo", "jp.osaka.osaka", "us.ny.nyc", "us.ca.la",
          "uk.london", "ca.vancouver", "ca.montreal",
        ];
  return codes.map((code) => resolveRegion(code)).filter((region): region is RegionInfo => Boolean(region));
}

export function searchRegions(query: string, allowedCountry?: string): RegionInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const countries = allowedCountry
    ? REGION_COUNTRIES.filter((country) => country.code === allowedCountry.toLowerCase())
    : REGION_COUNTRIES;
  const results: RegionInfo[] = [];
  for (const country of countries) {
    const countryHit = country.name.toLowerCase().includes(q) || country.code.includes(q);
    if (country.has_provinces) {
      for (const province of provincesFor(country.code)) {
        const provinceHit = countryHit || province.name.toLowerCase().includes(q) || province.code.includes(q);
        for (const city of citiesFor(country.code, province.code)) {
          const cityHit = provinceHit || city.name.toLowerCase().includes(q) || city.code.includes(q);
          const region = cityHit ? makeRegion(country.code, province.code, city.code) : undefined;
          if (region) results.push(region);
        }
      }
    } else {
      for (const city of citiesFor(country.code)) {
        const cityHit = countryHit || city.name.toLowerCase().includes(q) || city.code.includes(q);
        const region = cityHit ? makeRegion(country.code, undefined, city.code) : undefined;
        if (region) results.push(region);
      }
    }
    if (results.length >= 60) break;
  }
  return results;
}
