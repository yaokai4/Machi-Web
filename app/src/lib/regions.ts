import type { KXRegion, KXUser } from "./types";

export type RegionLocale = "zh-Hans" | "zh-Hant" | "en" | "ja" | string;

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

// 日本「都市圈」分组：选地区时按生活圈聚合，比一长串都道府县更易定位。
// 关东圈=一都三县及周边；关西圈=京阪神+奈良等；中部以名古屋为核心；其余按九州/北海道/东北/其他归类。
export interface MetroCircle {
  code: string;
  name: string;
  provinceCodes: string[];
}

export const JP_METRO_CIRCLES: MetroCircle[] = [
  { code: "kanto", name: "关东圈", provinceCodes: ["tokyo", "kanagawa", "saitama", "chiba", "ibaraki", "tochigi", "gunma"] },
  { code: "kansai", name: "关西圈", provinceCodes: ["osaka", "kyoto", "hyogo", "nara", "shiga", "mie"] },
  { code: "nagoya", name: "名古屋·中部", provinceCodes: ["aichi", "gifu", "shizuoka", "nagano", "niigata", "ishikawa"] },
  { code: "fukuoka", name: "福冈·九州", provinceCodes: ["fukuoka", "kumamoto", "kagoshima"] },
  { code: "sapporo", name: "札幌·北海道", provinceCodes: ["hokkaido"] },
  { code: "sendai", name: "仙台·东北", provinceCodes: ["miyagi"] },
  { code: "other", name: "其他城市", provinceCodes: ["hiroshima", "okayama", "okinawa"] },
];

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

type RegionNameMap = Partial<Record<"zh-Hans" | "zh-Hant" | "en" | "ja", string>>;

const COUNTRY_NAMES: Record<string, RegionNameMap> = {
  cn: { "zh-Hans": "中国", "zh-Hant": "中國", en: "China", ja: "中国" },
  jp: { "zh-Hans": "日本", "zh-Hant": "日本", en: "Japan", ja: "日本" },
  us: { "zh-Hans": "美国", "zh-Hant": "美國", en: "United States", ja: "アメリカ" },
  sg: { "zh-Hans": "新加坡", "zh-Hant": "新加坡", en: "Singapore", ja: "シンガポール" },
  kr: { "zh-Hans": "韩国", "zh-Hant": "韓國", en: "South Korea", ja: "韓国" },
  uk: { "zh-Hans": "英国", "zh-Hant": "英國", en: "United Kingdom", ja: "イギリス" },
  fr: { "zh-Hans": "法国", "zh-Hant": "法國", en: "France", ja: "フランス" },
  au: { "zh-Hans": "澳大利亚", "zh-Hant": "澳大利亞", en: "Australia", ja: "オーストラリア" },
  ca: { "zh-Hans": "加拿大", "zh-Hant": "加拿大", en: "Canada", ja: "カナダ" },
  th: { "zh-Hans": "泰国", "zh-Hant": "泰國", en: "Thailand", ja: "タイ" },
  my: { "zh-Hans": "马来西亚", "zh-Hant": "馬來西亞", en: "Malaysia", ja: "マレーシア" },
  de: { "zh-Hans": "德国", "zh-Hant": "德國", en: "Germany", ja: "ドイツ" },
  nl: { "zh-Hans": "荷兰", "zh-Hant": "荷蘭", en: "Netherlands", ja: "オランダ" },
};

const PROVINCE_NAMES: Record<string, RegionNameMap> = {
  "cn.beijing": { "zh-Hans": "北京", "zh-Hant": "北京", en: "Beijing", ja: "北京" },
  "cn.shanghai": { "zh-Hans": "上海", "zh-Hant": "上海", en: "Shanghai", ja: "上海" },
  "cn.tianjin": { "zh-Hans": "天津", "zh-Hant": "天津", en: "Tianjin", ja: "天津" },
  "cn.chongqing": { "zh-Hans": "重庆", "zh-Hant": "重慶", en: "Chongqing", ja: "重慶" },
  "cn.zhejiang": { "zh-Hans": "浙江", "zh-Hant": "浙江", en: "Zhejiang", ja: "浙江省" },
  "cn.jiangsu": { "zh-Hans": "江苏", "zh-Hant": "江蘇", en: "Jiangsu", ja: "江蘇省" },
  "cn.guangdong": { "zh-Hans": "广东", "zh-Hant": "廣東", en: "Guangdong", ja: "広東省" },
  "cn.hongkong": { "zh-Hans": "香港", "zh-Hant": "香港", en: "Hong Kong", ja: "香港" },
  "cn.sichuan": { "zh-Hans": "四川", "zh-Hant": "四川", en: "Sichuan", ja: "四川省" },
  "cn.shandong": { "zh-Hans": "山东", "zh-Hant": "山東", en: "Shandong", ja: "山東省" },
  "cn.fujian": { "zh-Hans": "福建", "zh-Hant": "福建", en: "Fujian", ja: "福建省" },
  "cn.henan": { "zh-Hans": "河南", "zh-Hant": "河南", en: "Henan", ja: "河南省" },
  "cn.anhui": { "zh-Hans": "安徽", "zh-Hant": "安徽", en: "Anhui", ja: "安徽省" },
  "cn.hunan": { "zh-Hans": "湖南", "zh-Hant": "湖南", en: "Hunan", ja: "湖南省" },
  "cn.shaanxi": { "zh-Hans": "陕西", "zh-Hant": "陝西", en: "Shaanxi", ja: "陝西省" },
  "cn.hubei": { "zh-Hans": "湖北", "zh-Hant": "湖北", en: "Hubei", ja: "湖北省" },
  "jp.tokyo": { "zh-Hans": "东京都", "zh-Hant": "東京都", en: "Tokyo", ja: "東京都" },
  "jp.osaka": { "zh-Hans": "大阪府", "zh-Hant": "大阪府", en: "Osaka", ja: "大阪府" },
  "jp.kyoto": { "zh-Hans": "京都府", "zh-Hant": "京都府", en: "Kyoto", ja: "京都府" },
  "jp.fukuoka": { "zh-Hans": "福冈县", "zh-Hant": "福岡縣", en: "Fukuoka", ja: "福岡県" },
  "jp.aichi": { "zh-Hans": "爱知县", "zh-Hant": "愛知縣", en: "Aichi", ja: "愛知県" },
  "jp.kanagawa": { "zh-Hans": "神奈川县", "zh-Hant": "神奈川縣", en: "Kanagawa", ja: "神奈川県" },
  "jp.saitama": { "zh-Hans": "埼玉县", "zh-Hant": "埼玉縣", en: "Saitama", ja: "埼玉県" },
  "jp.chiba": { "zh-Hans": "千叶县", "zh-Hant": "千葉縣", en: "Chiba", ja: "千葉県" },
  "jp.hyogo": { "zh-Hans": "兵库县", "zh-Hant": "兵庫縣", en: "Hyogo", ja: "兵庫県" },
  "jp.hokkaido": { "zh-Hans": "北海道", "zh-Hant": "北海道", en: "Hokkaido", ja: "北海道" },
  "jp.miyagi": { "zh-Hans": "宫城县", "zh-Hant": "宮城縣", en: "Miyagi", ja: "宮城県" },
  "jp.hiroshima": { "zh-Hans": "广岛县", "zh-Hant": "廣島縣", en: "Hiroshima", ja: "広島県" },
  "jp.okinawa": { "zh-Hans": "冲绳县", "zh-Hant": "沖繩縣", en: "Okinawa", ja: "沖縄県" },
  "jp.shizuoka": { "zh-Hans": "静冈县", "zh-Hant": "靜岡縣", en: "Shizuoka", ja: "静岡県" },
  "jp.ibaraki": { "zh-Hans": "茨城县", "zh-Hant": "茨城縣", en: "Ibaraki", ja: "茨城県" },
  "jp.nara": { "zh-Hans": "奈良县", "zh-Hant": "奈良縣", en: "Nara", ja: "奈良県" },
  "jp.mie": { "zh-Hans": "三重县", "zh-Hant": "三重縣", en: "Mie", ja: "三重県" },
  "jp.kumamoto": { "zh-Hans": "熊本县", "zh-Hant": "熊本縣", en: "Kumamoto", ja: "熊本県" },
  "jp.kagoshima": { "zh-Hans": "鹿儿岛县", "zh-Hant": "鹿兒島縣", en: "Kagoshima", ja: "鹿児島県" },
  "jp.nagano": { "zh-Hans": "长野县", "zh-Hant": "長野縣", en: "Nagano", ja: "長野県" },
  "jp.ishikawa": { "zh-Hans": "石川县", "zh-Hant": "石川縣", en: "Ishikawa", ja: "石川県" },
  "jp.okayama": { "zh-Hans": "冈山县", "zh-Hant": "岡山縣", en: "Okayama", ja: "岡山県" },
  "jp.niigata": { "zh-Hans": "新潟县", "zh-Hant": "新潟縣", en: "Niigata", ja: "新潟県" },
  "jp.tochigi": { "zh-Hans": "栃木县", "zh-Hant": "栃木縣", en: "Tochigi", ja: "栃木県" },
  "jp.gunma": { "zh-Hans": "群马县", "zh-Hant": "群馬縣", en: "Gunma", ja: "群馬県" },
  "jp.shiga": { "zh-Hans": "滋贺县", "zh-Hant": "滋賀縣", en: "Shiga", ja: "滋賀県" },
  "jp.gifu": { "zh-Hans": "岐阜县", "zh-Hant": "岐阜縣", en: "Gifu", ja: "岐阜県" },
  "us.ca": { "zh-Hans": "加利福尼亚", "zh-Hant": "加利福尼亞", en: "California", ja: "カリフォルニア州" },
  "us.ny": { "zh-Hans": "纽约", "zh-Hant": "紐約", en: "New York", ja: "ニューヨーク州" },
  "us.wa": { "zh-Hans": "华盛顿", "zh-Hant": "華盛頓", en: "Washington", ja: "ワシントン州" },
  "us.tx": { "zh-Hans": "德克萨斯", "zh-Hant": "德克薩斯", en: "Texas", ja: "テキサス州" },
  "us.fl": { "zh-Hans": "佛罗里达", "zh-Hant": "佛羅里達", en: "Florida", ja: "フロリダ州" },
  "us.il": { "zh-Hans": "伊利诺伊", "zh-Hant": "伊利諾伊", en: "Illinois", ja: "イリノイ州" },
  "us.ma": { "zh-Hans": "马萨诸塞", "zh-Hant": "馬薩諸塞", en: "Massachusetts", ja: "マサチューセッツ州" },
  "us.nj": { "zh-Hans": "新泽西", "zh-Hant": "紐澤西", en: "New Jersey", ja: "ニュージャージー州" },
};

const CITY_NAMES: Record<string, RegionNameMap> = {
  "cn.shanghai.shanghai": { "zh-Hans": "上海", "zh-Hant": "上海", en: "Shanghai", ja: "上海" },
  "cn.beijing.beijing": { "zh-Hans": "北京", "zh-Hant": "北京", en: "Beijing", ja: "北京" },
  "cn.tianjin.tianjin": { "zh-Hans": "天津", "zh-Hant": "天津", en: "Tianjin", ja: "天津" },
  "cn.chongqing.chongqing": { "zh-Hans": "重庆", "zh-Hant": "重慶", en: "Chongqing", ja: "重慶" },
  "cn.zhejiang.hangzhou": { "zh-Hans": "杭州", "zh-Hant": "杭州", en: "Hangzhou", ja: "杭州" },
  "cn.zhejiang.ningbo": { "zh-Hans": "宁波", "zh-Hant": "寧波", en: "Ningbo", ja: "寧波" },
  "cn.jiangsu.nanjing": { "zh-Hans": "南京", "zh-Hant": "南京", en: "Nanjing", ja: "南京" },
  "cn.jiangsu.suzhou": { "zh-Hans": "苏州", "zh-Hant": "蘇州", en: "Suzhou", ja: "蘇州" },
  "cn.guangdong.guangzhou": { "zh-Hans": "广州", "zh-Hant": "廣州", en: "Guangzhou", ja: "広州" },
  "cn.guangdong.shenzhen": { "zh-Hans": "深圳", "zh-Hant": "深圳", en: "Shenzhen", ja: "深圳" },
  "cn.guangdong.foshan": { "zh-Hans": "佛山", "zh-Hant": "佛山", en: "Foshan", ja: "仏山" },
  "cn.guangdong.dongguan": { "zh-Hans": "东莞", "zh-Hant": "東莞", en: "Dongguan", ja: "東莞" },
  "cn.sichuan.chengdu": { "zh-Hans": "成都", "zh-Hant": "成都", en: "Chengdu", ja: "成都" },
  "cn.shandong.qingdao": { "zh-Hans": "青岛", "zh-Hant": "青島", en: "Qingdao", ja: "青島" },
  "cn.fujian.xiamen": { "zh-Hans": "厦门", "zh-Hant": "廈門", en: "Xiamen", ja: "厦門" },
  "cn.henan.zhengzhou": { "zh-Hans": "郑州", "zh-Hant": "鄭州", en: "Zhengzhou", ja: "鄭州" },
  "cn.anhui.hefei": { "zh-Hans": "合肥", "zh-Hant": "合肥", en: "Hefei", ja: "合肥" },
  "cn.hubei.wuhan": { "zh-Hans": "武汉", "zh-Hant": "武漢", en: "Wuhan", ja: "武漢" },
  "cn.shaanxi.xian": { "zh-Hans": "西安", "zh-Hant": "西安", en: "Xi'an", ja: "西安" },
  "cn.hunan.changsha": { "zh-Hans": "长沙", "zh-Hant": "長沙", en: "Changsha", ja: "長沙" },
  "cn.hongkong.hongkong": { "zh-Hans": "香港", "zh-Hant": "香港", en: "Hong Kong", ja: "香港" },
  "jp.tokyo.tokyo": { "zh-Hans": "东京", "zh-Hant": "東京", en: "Tokyo", ja: "東京" },
  "jp.osaka.osaka": { "zh-Hans": "大阪", "zh-Hant": "大阪", en: "Osaka", ja: "大阪" },
  "jp.kyoto.kyoto": { "zh-Hans": "京都", "zh-Hant": "京都", en: "Kyoto", ja: "京都" },
  "jp.fukuoka.fukuoka": { "zh-Hans": "福冈", "zh-Hant": "福岡", en: "Fukuoka", ja: "福岡" },
  "jp.aichi.nagoya": { "zh-Hans": "名古屋", "zh-Hant": "名古屋", en: "Nagoya", ja: "名古屋" },
  "jp.kanagawa.yokohama": { "zh-Hans": "横滨", "zh-Hant": "橫濱", en: "Yokohama", ja: "横浜" },
  "jp.kanagawa.kawasaki": { "zh-Hans": "川崎", "zh-Hant": "川崎", en: "Kawasaki", ja: "川崎" },
  "jp.saitama.saitama": { "zh-Hans": "埼玉", "zh-Hant": "埼玉", en: "Saitama", ja: "さいたま" },
  "jp.chiba.chiba": { "zh-Hans": "千叶", "zh-Hant": "千葉", en: "Chiba", ja: "千葉" },
  "jp.hyogo.kobe": { "zh-Hans": "神户", "zh-Hant": "神戶", en: "Kobe", ja: "神戸" },
  "jp.hokkaido.sapporo": { "zh-Hans": "札幌", "zh-Hant": "札幌", en: "Sapporo", ja: "札幌" },
  "jp.miyagi.sendai": { "zh-Hans": "仙台", "zh-Hant": "仙台", en: "Sendai", ja: "仙台" },
  "jp.hiroshima.hiroshima": { "zh-Hans": "广岛", "zh-Hant": "廣島", en: "Hiroshima", ja: "広島" },
  "jp.okinawa.naha": { "zh-Hans": "那霸", "zh-Hant": "那霸", en: "Naha", ja: "那覇" },
  "jp.shizuoka.shizuoka": { "zh-Hans": "静冈", "zh-Hant": "靜岡", en: "Shizuoka", ja: "静岡" },
  "jp.ibaraki.tsukuba": { "zh-Hans": "筑波", "zh-Hant": "筑波", en: "Tsukuba", ja: "つくば" },
  "jp.nara.nara": { "zh-Hans": "奈良", "zh-Hant": "奈良", en: "Nara", ja: "奈良" },
  "jp.mie.yokkaichi": { "zh-Hans": "四日市", "zh-Hant": "四日市", en: "Yokkaichi", ja: "四日市" },
  "jp.kumamoto.kumamoto": { "zh-Hans": "熊本", "zh-Hant": "熊本", en: "Kumamoto", ja: "熊本" },
  "jp.kagoshima.kagoshima": { "zh-Hans": "鹿儿岛", "zh-Hant": "鹿兒島", en: "Kagoshima", ja: "鹿児島" },
  "jp.nagano.nagano": { "zh-Hans": "长野", "zh-Hant": "長野", en: "Nagano", ja: "長野" },
  "jp.ishikawa.kanazawa": { "zh-Hans": "金泽", "zh-Hant": "金澤", en: "Kanazawa", ja: "金沢" },
  "jp.okayama.okayama": { "zh-Hans": "冈山", "zh-Hant": "岡山", en: "Okayama", ja: "岡山" },
  "jp.niigata.niigata": { "zh-Hans": "新潟", "zh-Hant": "新潟", en: "Niigata", ja: "新潟" },
  "jp.tochigi.utsunomiya": { "zh-Hans": "宇都宫", "zh-Hant": "宇都宮", en: "Utsunomiya", ja: "宇都宮" },
  "jp.gunma.takasaki": { "zh-Hans": "高崎", "zh-Hant": "高崎", en: "Takasaki", ja: "高崎" },
  "jp.shiga.otsu": { "zh-Hans": "大津", "zh-Hant": "大津", en: "Otsu", ja: "大津" },
  "jp.gifu.gifu": { "zh-Hans": "岐阜", "zh-Hant": "岐阜", en: "Gifu", ja: "岐阜" },
  "us.ca.sf": { "zh-Hans": "旧金山", "zh-Hant": "舊金山", en: "San Francisco", ja: "サンフランシスコ" },
  "us.ca.la": { "zh-Hans": "洛杉矶", "zh-Hant": "洛杉磯", en: "Los Angeles", ja: "ロサンゼルス" },
  "us.ca.sd": { "zh-Hans": "圣地亚哥", "zh-Hant": "聖地牙哥", en: "San Diego", ja: "サンディエゴ" },
  "us.ca.sj": { "zh-Hans": "圣何塞", "zh-Hant": "聖荷西", en: "San Jose", ja: "サンノゼ" },
  "us.ca.irvine": { "zh-Hans": "尔湾", "zh-Hant": "爾灣", en: "Irvine", ja: "アーバイン" },
  "us.ny.nyc": { "zh-Hans": "纽约", "zh-Hant": "紐約", en: "New York City", ja: "ニューヨーク" },
  "us.ny.buffalo": { "zh-Hans": "布法罗", "zh-Hant": "水牛城", en: "Buffalo", ja: "バッファロー" },
  "us.wa.seattle": { "zh-Hans": "西雅图", "zh-Hant": "西雅圖", en: "Seattle", ja: "シアトル" },
  "us.wa.bellevue": { "zh-Hans": "贝尔维尤", "zh-Hant": "貝爾維尤", en: "Bellevue", ja: "ベルビュー" },
  "us.tx.austin": { "zh-Hans": "奥斯汀", "zh-Hant": "奧斯汀", en: "Austin", ja: "オースティン" },
  "us.tx.houston": { "zh-Hans": "休斯顿", "zh-Hant": "休士頓", en: "Houston", ja: "ヒューストン" },
  "us.tx.dallas": { "zh-Hans": "达拉斯", "zh-Hant": "達拉斯", en: "Dallas", ja: "ダラス" },
  "us.fl.miami": { "zh-Hans": "迈阿密", "zh-Hant": "邁阿密", en: "Miami", ja: "マイアミ" },
  "us.fl.orlando": { "zh-Hans": "奥兰多", "zh-Hant": "奧蘭多", en: "Orlando", ja: "オーランド" },
  "us.il.chicago": { "zh-Hans": "芝加哥", "zh-Hant": "芝加哥", en: "Chicago", ja: "シカゴ" },
  "us.ma.boston": { "zh-Hans": "波士顿", "zh-Hant": "波士頓", en: "Boston", ja: "ボストン" },
  "us.nj.newark": { "zh-Hans": "纽瓦克", "zh-Hant": "紐華克", en: "Newark", ja: "ニューアーク" },
  "uk.london": { "zh-Hans": "伦敦", "zh-Hant": "倫敦", en: "London", ja: "ロンドン" },
  "uk.manchester": { "zh-Hans": "曼彻斯特", "zh-Hant": "曼徹斯特", en: "Manchester", ja: "マンチェスター" },
  "uk.edinburgh": { "zh-Hans": "爱丁堡", "zh-Hant": "愛丁堡", en: "Edinburgh", ja: "エディンバラ" },
  "uk.birmingham": { "zh-Hans": "伯明翰", "zh-Hant": "伯明罕", en: "Birmingham", ja: "バーミンガム" },
  "uk.glasgow": { "zh-Hans": "格拉斯哥", "zh-Hant": "格拉斯哥", en: "Glasgow", ja: "グラスゴー" },
  "uk.liverpool": { "zh-Hans": "利物浦", "zh-Hant": "利物浦", en: "Liverpool", ja: "リバプール" },
  "uk.leeds": { "zh-Hans": "利兹", "zh-Hant": "里茲", en: "Leeds", ja: "リーズ" },
  "uk.bristol": { "zh-Hans": "布里斯托", "zh-Hant": "布里斯托", en: "Bristol", ja: "ブリストル" },
  "uk.cambridge": { "zh-Hans": "剑桥", "zh-Hant": "劍橋", en: "Cambridge", ja: "ケンブリッジ" },
  "uk.oxford": { "zh-Hans": "牛津", "zh-Hant": "牛津", en: "Oxford", ja: "オックスフォード" },
  "ca.toronto": { "zh-Hans": "多伦多", "zh-Hant": "多倫多", en: "Toronto", ja: "トロント" },
  "ca.vancouver": { "zh-Hans": "温哥华", "zh-Hant": "溫哥華", en: "Vancouver", ja: "バンクーバー" },
  "ca.montreal": { "zh-Hans": "蒙特利尔", "zh-Hant": "蒙特婁", en: "Montreal", ja: "モントリオール" },
  "au.sydney": { "zh-Hans": "悉尼", "zh-Hant": "雪梨", en: "Sydney", ja: "シドニー" },
  "au.melbourne": { "zh-Hans": "墨尔本", "zh-Hant": "墨爾本", en: "Melbourne", ja: "メルボルン" },
  "au.brisbane": { "zh-Hans": "布里斯班", "zh-Hant": "布里斯本", en: "Brisbane", ja: "ブリスベン" },
  "au.perth": { "zh-Hans": "珀斯", "zh-Hant": "伯斯", en: "Perth", ja: "パース" },
  "au.adelaide": { "zh-Hans": "阿德莱德", "zh-Hant": "阿德雷德", en: "Adelaide", ja: "アデレード" },
  "au.canberra": { "zh-Hans": "堪培拉", "zh-Hant": "坎培拉", en: "Canberra", ja: "キャンベラ" },
  "au.goldcoast": { "zh-Hans": "黄金海岸", "zh-Hant": "黃金海岸", en: "Gold Coast", ja: "ゴールドコースト" },
  "sg.singapore": { "zh-Hans": "新加坡", "zh-Hant": "新加坡", en: "Singapore", ja: "シンガポール" },
  "kr.seoul": { "zh-Hans": "首尔", "zh-Hant": "首爾", en: "Seoul", ja: "ソウル" },
  "kr.busan": { "zh-Hans": "釜山", "zh-Hant": "釜山", en: "Busan", ja: "釜山" },
  "kr.incheon": { "zh-Hans": "仁川", "zh-Hant": "仁川", en: "Incheon", ja: "仁川" },
  "kr.daegu": { "zh-Hans": "大邱", "zh-Hant": "大邱", en: "Daegu", ja: "大邱" },
  "kr.daejeon": { "zh-Hans": "大田", "zh-Hant": "大田", en: "Daejeon", ja: "大田" },
  "kr.gwangju": { "zh-Hans": "光州", "zh-Hant": "光州", en: "Gwangju", ja: "光州" },
  "th.bangkok": { "zh-Hans": "曼谷", "zh-Hant": "曼谷", en: "Bangkok", ja: "バンコク" },
  "th.chiangmai": { "zh-Hans": "清迈", "zh-Hant": "清邁", en: "Chiang Mai", ja: "チェンマイ" },
  "th.phuket": { "zh-Hans": "普吉", "zh-Hant": "普吉", en: "Phuket", ja: "プーケット" },
  "my.kl": { "zh-Hans": "吉隆坡", "zh-Hant": "吉隆坡", en: "Kuala Lumpur", ja: "クアラルンプール" },
  "my.penang": { "zh-Hans": "槟城", "zh-Hant": "檳城", en: "Penang", ja: "ペナン" },
  "de.berlin": { "zh-Hans": "柏林", "zh-Hant": "柏林", en: "Berlin", ja: "ベルリン" },
  "de.munich": { "zh-Hans": "慕尼黑", "zh-Hant": "慕尼黑", en: "Munich", ja: "ミュンヘン" },
  "de.hamburg": { "zh-Hans": "汉堡", "zh-Hant": "漢堡", en: "Hamburg", ja: "ハンブルク" },
  "fr.paris": { "zh-Hans": "巴黎", "zh-Hant": "巴黎", en: "Paris", ja: "パリ" },
  "fr.lyon": { "zh-Hans": "里昂", "zh-Hant": "里昂", en: "Lyon", ja: "リヨン" },
  "fr.marseille": { "zh-Hans": "马赛", "zh-Hant": "馬賽", en: "Marseille", ja: "マルセイユ" },
  "fr.toulouse": { "zh-Hans": "图卢兹", "zh-Hant": "圖盧茲", en: "Toulouse", ja: "トゥールーズ" },
  "fr.nice": { "zh-Hans": "尼斯", "zh-Hant": "尼斯", en: "Nice", ja: "ニース" },
  "fr.bordeaux": { "zh-Hans": "波尔多", "zh-Hant": "波爾多", en: "Bordeaux", ja: "ボルドー" },
  "nl.amsterdam": { "zh-Hans": "阿姆斯特丹", "zh-Hant": "阿姆斯特丹", en: "Amsterdam", ja: "アムステルダム" },
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

function normalizeRegionLocale(locale?: RegionLocale): keyof RegionNameMap {
  const value = (locale || "zh-Hans").toLowerCase();
  if (value.includes("hant") || value.includes("traditional")) return "zh-Hant";
  if (value.startsWith("ja")) return "ja";
  if (value.startsWith("en")) return "en";
  return "zh-Hans";
}

function pickLocalizedName(names: RegionNameMap | undefined, fallback: string, locale?: RegionLocale): string {
  const normalized = normalizeRegionLocale(locale);
  return names?.[normalized] || names?.["zh-Hans"] || fallback;
}

export function countryName(code?: string, locale?: RegionLocale): string {
  const normalized = code?.toLowerCase();
  const country = countryByCode(normalized);
  return pickLocalizedName(normalized ? COUNTRY_NAMES[normalized] : undefined, country?.name || code?.toUpperCase() || "", locale);
}

export function countryDisplayName(country: RegionCountry, locale?: RegionLocale): string {
  return countryName(country.code, locale) || country.name;
}

export function provinceDisplayName(countryCode?: string, provinceCode?: string, fallback = "", locale?: RegionLocale): string {
  const key = countryCode && provinceCode ? `${countryCode.toLowerCase()}.${provinceCode.toLowerCase()}` : "";
  return pickLocalizedName(key ? PROVINCE_NAMES[key] : undefined, fallback, locale);
}

export function cityDisplayName(
  countryCode?: string,
  provinceCode?: string,
  cityCode?: string,
  fallback = "",
  locale?: RegionLocale,
): string {
  const country = countryCode?.toLowerCase();
  const province = provinceCode?.toLowerCase();
  const city = cityCode?.toLowerCase();
  if (!country || !city) return fallback;
  const key = province ? `${country}.${province}.${city}` : `${country}.${city}`;
  return pickLocalizedName(CITY_NAMES[key], fallback, locale);
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

/// All resolvable city regions inside a Japan metro circle, flattened across its
/// member prefectures. Used by the region picker's 都市圈 → 城市 drilldown.
export function regionsForMetroCircle(circleCode: string): RegionInfo[] {
  const circle = JP_METRO_CIRCLES.find((item) => item.code === circleCode);
  if (!circle) return [];
  const out: RegionInfo[] = [];
  for (const provinceCode of circle.provinceCodes) {
    for (const city of REGION_CITIES[provinceCode] || []) {
      const region = resolveRegion(`jp.${provinceCode}.${city.code}`);
      if (region) out.push(region);
    }
  }
  return out;
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

export function regionDisplayName(region?: RegionInfo, locale?: RegionLocale): string {
  if (!region) {
    if (normalizeRegionLocale(locale) === "ja") return "現在の地域を選択";
    if (normalizeRegionLocale(locale) === "en") return "Choose region";
    if (normalizeRegionLocale(locale) === "zh-Hant") return "選擇目前地區";
    return "选择当前地区";
  }
  const country = countryName(region.country_code, locale) || region.country_name;
  const province = provinceDisplayName(region.country_code, region.province_code, region.province_name, locale);
  const city = cityDisplayName(region.country_code, region.province_code, region.city_code, region.city_name, locale);
  if (!region.province_code || !province || region.province_code === region.city_code) {
    return `${country} · ${city}`;
  }
  return `${country} · ${province} · ${city}`;
}

export function regionHeaderLabel(region?: RegionInfo, locale?: RegionLocale): string {
  if (region) return `${region.country_emoji} ${cityDisplayName(region.country_code, region.province_code, region.city_code, region.city_name, locale)}`;
  if (normalizeRegionLocale(locale) === "ja") return "都市を選択";
  if (normalizeRegionLocale(locale) === "en") return "Choose city";
  if (normalizeRegionLocale(locale) === "zh-Hant") return "選擇城市";
  return "选择城市";
}

export function regionShortLabel(region?: RegionInfo, locale?: RegionLocale): string {
  if (!region) return regionHeaderLabel(undefined, locale);
  const province = provinceDisplayName(region.country_code, region.province_code, region.province_name, locale);
  const city = cityDisplayName(region.country_code, region.province_code, region.city_code, region.city_name, locale);
  if (region.province_code && province && region.province_code !== region.city_code) return `${city} · ${province}`;
  return city;
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
    const countryHit = regionNameMatches(q, country.code, country.name, COUNTRY_NAMES[country.code]);
    if (country.has_provinces) {
      for (const province of provincesFor(country.code)) {
        const provinceHit = countryHit || regionNameMatches(q, province.code, province.name, PROVINCE_NAMES[`${country.code}.${province.code}`]);
        for (const city of citiesFor(country.code, province.code)) {
          const cityHit = provinceHit || regionNameMatches(q, city.code, city.name, CITY_NAMES[`${country.code}.${province.code}.${city.code}`]);
          const region = cityHit ? makeRegion(country.code, province.code, city.code) : undefined;
          if (region) results.push(region);
        }
      }
    } else {
      for (const city of citiesFor(country.code)) {
        const cityHit = countryHit || regionNameMatches(q, city.code, city.name, CITY_NAMES[`${country.code}.${city.code}`]);
        const region = cityHit ? makeRegion(country.code, undefined, city.code) : undefined;
        if (region) results.push(region);
      }
    }
    if (results.length >= 60) break;
  }
  return results;
}

function regionNameMatches(query: string, code: string, fallback: string, localized?: RegionNameMap): boolean {
  const values = new Set([code, fallback, ...Object.values(localized || {})]);
  for (const value of values) {
    if (value.toLowerCase().includes(query)) return true;
  }
  return false;
}
