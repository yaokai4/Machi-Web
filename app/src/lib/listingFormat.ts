import type { KXCityListing, KXListingType } from "./types";

export type ListingLocale = "zh" | "en" | "ja";

type LabelSet = Partial<Record<ListingLocale, string>>;

const FALLBACK: Record<ListingLocale, string> = {
  zh: "待补充",
  en: "To be added",
  ja: "未入力",
};

const EMPTY_VALUES = new Set([
  "",
  "unknown",
  "undefined",
  "null",
  "nan",
  "n/a",
  "na",
  "none",
  "tbd",
  "待定",
  "未知",
  "不明",
]);

const LISTING_TYPE_LABELS: Record<string, LabelSet> = {
  secondhand: { zh: "二手市场", en: "Marketplace", ja: "マーケット" },
  rental: { zh: "租房", en: "Rentals", ja: "住まい" },
  job: { zh: "找工作", en: "Jobs", ja: "仕事探し" },
  hiring: { zh: "招聘", en: "Hiring", ja: "求人" },
  local_service: { zh: "商家与服务", en: "Businesses & local services", ja: "店舗・地域サービス" },
  discount: { zh: "商家优惠", en: "Deals", ja: "お得情報" },
  event: { zh: "活动小组", en: "Events", ja: "イベント" },
};

const LISTING_STATUS_LABELS: Record<string, LabelSet> = {
  draft: { zh: "草稿", en: "Draft", ja: "下書き" },
  pending_review: { zh: "待审核", en: "In review", ja: "審査中" },
  published: { zh: "已发布", en: "Published", ja: "公開中" },
  reserved: { zh: "已预约", en: "Reserved", ja: "予約済み" },
  sold: { zh: "已售出", en: "Sold", ja: "売約済み" },
  rented: { zh: "已租出", en: "Rented", ja: "成約済み" },
  closed: { zh: "已关闭", en: "Closed", ja: "終了" },
  expired: { zh: "已过期", en: "Expired", ja: "期限切れ" },
  rejected: { zh: "已拒绝", en: "Rejected", ja: "却下" },
  hidden: { zh: "已下架", en: "Hidden", ja: "非表示" },
};

const PUBLISHED_BY_TYPE: Record<string, LabelSet> = {
  secondhand: { zh: "出售中", en: "Available", ja: "販売中" },
  rental: { zh: "可咨询", en: "Available", ja: "相談可" },
  job: { zh: "求职中", en: "Open", ja: "募集中" },
  hiring: { zh: "招聘中", en: "Hiring", ja: "募集中" },
  local_service: { zh: "可预约", en: "Bookable", ja: "予約可" },
  discount: { zh: "有效中", en: "Active", ja: "有効" },
  event: { zh: "开放报名", en: "Open", ja: "受付中" },
};

const VERIFICATION_LABELS: Record<string, LabelSet> = {
  unverified: { zh: "未认证", en: "Unverified", ja: "未認証" },
  pending: { zh: "待核验", en: "Pending check", ja: "確認中" },
  verified: { zh: "已认证", en: "Verified", ja: "認証済み" },
  needs_review: { zh: "需复核", en: "Needs review", ja: "再確認が必要" },
  rejected: { zh: "认证拒绝", en: "Rejected", ja: "認証不可" },
};

const EMPLOYMENT_LABELS: Record<string, LabelSet> = {
  full_time: { zh: "全职", en: "Full-time", ja: "正社員" },
  "full-time": { zh: "全职", en: "Full-time", ja: "正社員" },
  part_time: { zh: "兼职", en: "Part-time", ja: "アルバイト" },
  "part-time": { zh: "兼职", en: "Part-time", ja: "アルバイト" },
  contract: { zh: "契约", en: "Contract", ja: "契約社員" },
  dispatch: { zh: "派遣", en: "Dispatch", ja: "派遣" },
  internship: { zh: "实习", en: "Internship", ja: "インターン" },
  freelance: { zh: "自由职业", en: "Freelance", ja: "業務委託" },
  temporary: { zh: "短期", en: "Temporary", ja: "短期" },
};

const SALARY_LABELS: Record<string, LabelSet> = {
  hourly: { zh: "时给", en: "Hourly", ja: "時給" },
  hour: { zh: "时给", en: "Hourly", ja: "時給" },
  daily: { zh: "日给", en: "Daily", ja: "日給" },
  weekly: { zh: "周给", en: "Weekly", ja: "週給" },
  monthly: { zh: "月给", en: "Monthly", ja: "月給" },
  month: { zh: "月给", en: "Monthly", ja: "月給" },
  yearly: { zh: "年薪", en: "Annual", ja: "年収" },
  annual: { zh: "年薪", en: "Annual", ja: "年収" },
  fixed: { zh: "固定价", en: "Fixed", ja: "固定" },
  negotiable: { zh: "可商量", en: "Negotiable", ja: "応相談" },
};

const CONDITION_LABELS: Record<string, LabelSet> = {
  new: { zh: "全新", en: "New", ja: "新品" },
  brand_new: { zh: "全新", en: "Brand new", ja: "新品" },
  like_new: { zh: "几乎全新", en: "Like new", ja: "未使用に近い" },
  good: { zh: "良好", en: "Good", ja: "良好" },
  used: { zh: "有使用痕迹", en: "Used", ja: "使用感あり" },
  fair: { zh: "可用", en: "Fair", ja: "使用可" },
};

const LISTING_MODE_LABELS: Record<string, LabelSet> = {
  sale: { zh: "出售", en: "For sale", ja: "販売" },
  sell: { zh: "出售", en: "For sale", ja: "販売" },
  free: { zh: "免费送", en: "Free", ja: "無料" },
  giveaway: { zh: "免费送", en: "Free giveaway", ja: "無料譲渡" },
  wanted: { zh: "求购", en: "Wanted", ja: "探しています" },
  buy: { zh: "求购", en: "Wanted", ja: "探しています" },
};

const DELIVERY_LABELS: Record<string, LabelSet> = {
  pickup: { zh: "自取", en: "Pickup", ja: "引き取り" },
  meetup: { zh: "面交", en: "Meetup", ja: "手渡し" },
  shipping: { zh: "邮寄", en: "Shipping", ja: "配送" },
  pickup_or_shipping: { zh: "自取或邮寄", en: "Pickup or shipping", ja: "引き取りまたは配送" },
  negotiable: { zh: "可商量", en: "Negotiable", ja: "応相談" },
};

const BOOLEAN_TRUE = new Set(["true", "1", "yes", "y", "是", "可", "有", "支持", "allowed", "available"]);
const BOOLEAN_FALSE = new Set(["false", "0", "no", "n", "否", "不可", "无", "不支持", "not_allowed", "unavailable"]);

function labelFrom(map: Record<string, LabelSet>, raw: unknown, locale: ListingLocale, fallback?: string): string {
  const key = normalizedKey(raw);
  if (!key) return fallback ?? FALLBACK[locale];
  const labels = map[key];
  return labels?.[locale] || labels?.zh || fallback || FALLBACK[locale];
}

function normalizedKey(value: unknown): string {
  const text = cleanListingText(value);
  return text ? text.toLowerCase().replace(/\s+/g, "_") : "";
}

export function cleanListingText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  if (!text) return "";
  return EMPTY_VALUES.has(text.toLowerCase()) ? "" : text;
}

export function formatListingType(type?: string | null, locale: ListingLocale = "zh"): string {
  return labelFrom(LISTING_TYPE_LABELS, type, locale, locale === "zh" ? "城市信息" : FALLBACK[locale]);
}

export function formatListingStatus(status?: string | null, type?: string | null, locale: ListingLocale = "zh"): string {
  const key = normalizedKey(status);
  if (key === "published" && type) {
    return labelFrom(PUBLISHED_BY_TYPE, type, locale, LISTING_STATUS_LABELS.published[locale]);
  }
  return labelFrom(LISTING_STATUS_LABELS, key, locale, FALLBACK[locale]);
}

export function formatVerificationStatus(status?: string | null, locale: ListingLocale = "zh"): string {
  return labelFrom(VERIFICATION_LABELS, status, locale, VERIFICATION_LABELS.unverified[locale]);
}

export function formatEmploymentType(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  if (["全职", "兼职", "派遣", "实习", "契约", "短期"].includes(clean)) return clean;
  return labelFrom(EMPLOYMENT_LABELS, clean, locale, FALLBACK[locale]);
}

export function formatSalaryType(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  if (["时给", "月给", "日给", "周给", "年薪", "可商量"].includes(clean)) return clean;
  return labelFrom(SALARY_LABELS, clean, locale, FALLBACK[locale]);
}

export function formatCurrency(currency?: string | null, locale: ListingLocale = "zh"): string {
  const code = cleanListingText(currency).toUpperCase();
  const labels: Record<string, LabelSet> = {
    JPY: { zh: "日元", en: "Japanese yen", ja: "日本円" },
    CNY: { zh: "人民币", en: "Chinese yuan", ja: "人民元" },
    USD: { zh: "美元", en: "US dollar", ja: "米ドル" },
    EUR: { zh: "欧元", en: "Euro", ja: "ユーロ" },
    KRW: { zh: "韩元", en: "Korean won", ja: "韓国ウォン" },
  };
  return labels[code]?.[locale] || labels[code]?.zh || (code || "JPY");
}

function currencySymbol(currency?: string | null): string {
  const code = cleanListingText(currency).toUpperCase() || "JPY";
  if (code === "JPY" || code === "CNY") return "¥";
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  if (code === "KRW") return "₩";
  return `${code} `;
}

function formatAmount(amount: number, currency?: string | null): string {
  const code = cleanListingText(currency).toUpperCase() || "JPY";
  const maximumFractionDigits = code === "JPY" || code === "KRW" ? 0 : 2;
  return `${currencySymbol(code)}${amount.toLocaleString("ja-JP", { maximumFractionDigits })}`;
}

type PriceInput = Partial<KXCityListing> | number | null | undefined;

export function formatPrice(input: PriceInput, currency = "JPY", locale: ListingLocale = "zh"): string {
  if (typeof input === "number") {
    return Number.isFinite(input) ? formatAmount(input, currency) : fallbackPriceLabel(undefined, locale);
  }
  const item = input || {};
  const type = cleanListingText(item.type);
  const priceType = normalizedKey(item.price_type || item.priceType);
  const rawPrice = typeof item.price === "number" ? item.price : item.price == null ? undefined : Number(item.price);

  if (priceType === "free") return locale === "ja" ? "無料" : locale === "en" ? "Free" : "免费";
  if (["appointment_only", "quote_required", "consultation", "negotiable"].includes(priceType)) {
    return type === "local_service" ? "预约咨询" : fallbackPriceLabel(type, locale);
  }
  if (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0) {
    return fallbackPriceLabel(type, locale);
  }

  const rendered = formatAmount(rawPrice, item.currency || currency);
  if (priceType === "starting_from") return `${rendered} 起`;
  if (priceType === "monthly" || priceType === "month") return `${rendered}/月`;
  if (priceType === "hourly" || priceType === "hour") return `${rendered}/小时`;
  if (priceType === "per_night" || priceType === "nightly") {
    return locale === "ja" ? `${rendered}/泊` : locale === "en" ? `${rendered}/night` : `${rendered}/晚`;
  }
  if (priceType === "daily") return `${rendered}/日`;
  if (priceType === "weekly") return `${rendered}/周`;
  if (priceType === "yearly" || priceType === "annual") return `${rendered}/年`;
  return rendered;
}

function fallbackPriceLabel(type?: string, locale: ListingLocale = "zh"): string {
  if (locale !== "zh") {
    if (type === "job" || type === "hiring") return "Salary negotiable";
    if (type === "rental") return "Rent on request";
    if (type === "local_service") return "Book to inquire";
    return "Price on request";
  }
  if (type === "job" || type === "hiring") return "薪资面议";
  if (type === "rental") return "租金咨询";
  if (type === "local_service") return "预约咨询";
  if (type === "discount") return "查看优惠";
  return "价格咨询";
}

export function formatArea(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  const numeric = Number(clean);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "";
    return `${numeric.toLocaleString(locale === "en" ? "en-US" : "ja-JP", { maximumFractionDigits: 1 })} m²`;
  }
  return clean.includes("㎡") || clean.toLowerCase().includes("m²") ? clean : clean;
}

export function formatStationDistance(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  const numeric = Number(clean);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (locale === "en") return `${Math.round(numeric)} min walk`;
    if (locale === "ja") return `徒歩 ${Math.round(numeric)} 分`;
    return `步行 ${Math.round(numeric)} 分钟`;
  }
  return clean;
}

export function formatDate(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return clean;
  const intlLocale = locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(intlLocale, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function formatJapaneseLevel(value?: unknown, locale: ListingLocale = "zh"): string {
  const clean = cleanListingText(value);
  if (!clean) return "";
  const key = clean.toLowerCase().replace(/\s+/g, "_");
  if (["not_required", "none", "no_requirement", "不限"].includes(key)) return locale === "en" ? "No requirement" : locale === "ja" ? "不問" : "不限";
  if (/^n[1-5]$/.test(key)) return key.toUpperCase();
  if (["native", "business", "daily"].includes(key)) {
    const labels: Record<string, LabelSet> = {
      native: { zh: "母语级", en: "Native", ja: "ネイティブ" },
      business: { zh: "商务日语", en: "Business Japanese", ja: "ビジネス日本語" },
      daily: { zh: "日常会话", en: "Daily conversation", ja: "日常会話" },
    };
    return labels[key]?.[locale] || labels[key]?.zh || clean;
  }
  return clean.toUpperCase().startsWith("N") ? clean.toUpperCase() : clean;
}

export function formatListingAttribute(key: string, value: unknown, locale: ListingLocale = "zh"): string {
  const normalized = normalizedKey(key);
  const clean = cleanListingText(value);
  if (!clean) return "";

  if (normalized === "employment_type" || normalized === "job_type") return formatEmploymentType(clean, locale);
  if (normalized === "salary_type") return formatSalaryType(clean, locale);
  if (normalized === "price_unit") return labelFrom(SALARY_LABELS, clean, locale, clean);
  if (normalized === "japanese_level" || normalized === "required_japanese_level") return formatJapaneseLevel(clean, locale);
  if (normalized === "area_sqm" || normalized === "area" || normalized === "size_sqm") return formatArea(clean, locale);
  if (normalized === "station_distance" || normalized === "station_distance_minutes") return formatStationDistance(clean, locale);
  if (normalized === "valid_until" || normalized === "expires_at" || normalized === "move_in_date") return formatDate(clean, locale);
  if (normalized === "condition") return labelFrom(CONDITION_LABELS, clean, locale, clean);
  if (normalized === "listing_mode") return labelFrom(LISTING_MODE_LABELS, clean, locale, clean);
  if (normalized === "delivery_method") return labelFrom(DELIVERY_LABELS, clean, locale, clean);
  if (normalized === "currency") return formatCurrency(clean, locale);
  if (isBooleanLike(clean)) return formatBoolean(clean, locale);
  return clean;
}

export function compactListingFields(item: KXCityListing): string[] {
  const attr = (key: string) => formatListingAttribute(key, item.attributes?.[key]);
  const clean = (value: unknown) => cleanListingText(value);
  const fields = item.type === "rental"
    ? [
        attr("nearest_station"),
        attr("layout"),
        attr("area_sqm"),
        boolAttr(item, "short_term_allowed") ? "短租" : "",
        boolAttr(item, "share_allowed") ? "合租" : "",
        boolAttr(item, "furnished") ? "家具家电" : "",
        item.verification_status !== "verified" ? formatVerificationStatus(item.verification_status) : "",
      ]
    : item.type === "job" || item.type === "hiring"
      ? [
          attr("company_name"),
          attr("employment_type"),
          attr("salary_type"),
          attr("japanese_level") ? `日语 ${attr("japanese_level")}` : "",
          boolAttr(item, "visa_support") ? "签证支持" : "",
          boolAttr(item, "foreigner_friendly") ? "外国人友好" : "",
        ]
      : item.type === "local_service"
        ? [attr("service_type"), attr("service_area"), attr("price_unit"), item.verification_status === "verified" ? "认证服务商" : ""]
        : item.type === "discount"
          ? [attr("merchant_name"), attr("discount_info"), attr("valid_until") ? `有效至 ${attr("valid_until")}` : "", item.verification_status === "verified" ? "认证商家" : ""]
          : [clean(item.category), attr("listing_mode"), attr("condition"), attr("delivery_method")];
  return fields.filter((field) => !!clean(field));
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
  "餐厅美食": "food_restaurant",
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

function serviceVerticalForListing(item: KXCityListing): ServiceVertical | "" {
  const attrs = item.attributes || {};
  const explicit = cleanListingText(attrs.service_vertical);
  if (SERVICE_VERTICALS.has(explicit as ServiceVertical)) return explicit as ServiceVertical;
  const category = cleanListingText(item.category);
  if (SERVICE_VERTICAL_BY_CATEGORY[category]) return SERVICE_VERTICAL_BY_CATEGORY[category];
  const serviceType = cleanListingText(attrs.service_type);
  if (SERVICE_VERTICAL_BY_CATEGORY[serviceType]) return SERVICE_VERTICAL_BY_CATEGORY[serviceType];
  if (attrs.menu || attrs.packages) return "food_restaurant";
  if (attrs.room_type || attrs.max_guests || attrs.check_in_time) return "lodging";
  if (attrs.airport_route || attrs.vehicle_type || attrs.flight_info_note) return "airport_transfer";
  if (attrs.document_type || attrs.no_result_guarantee) return "paperwork_translation";
  if (attrs.property_size || attrs.item_volume || attrs.vehicle_staff) return "moving_cleaning";
  if (attrs.setup_type || attrs.cannot_guarantee) return "life_setup";
  if (attrs.beauty_service || attrs.medical_disclaimer) return "beauty_health";
  if (attrs.service_target) return "pet_family";
  if (attrs.required_materials || attrs.delivery_time) return "paperwork_translation";
  if (attrs.ticket_type && attrs.meeting_point) return attrs.pickup_service ? "day_tour" : "attraction_ticket";
  return "";
}

// Detail-row titles, keyed by the canonical zh string used when building
// the rows below. Values localize the LABEL only — attribute values go
// through their own locale-aware formatters.
const DETAIL_FIELD_LABELS: Record<string, LabelSet> = {
  "地区": { ja: "エリア", en: "Area" },
  "最近车站": { ja: "最寄り駅", en: "Nearest station" },
  "车站距离": { ja: "駅からの距離", en: "To station" },
  "户型": { ja: "間取り", en: "Layout" },
  "面积": { ja: "面積", en: "Size" },
  "押金": { ja: "敷金", en: "Deposit" },
  "礼金": { ja: "礼金", en: "Key money" },
  "管理费": { ja: "管理費", en: "Management fee" },
  "初期费用说明": { ja: "初期費用について", en: "Initial costs" },
  "入住时间": { ja: "入居可能日", en: "Move-in date" },
  "租期": { ja: "契約期間", en: "Lease term" },
  "短租": { ja: "短期", en: "Short-term" },
  "合租": { ja: "ルームシェア", en: "Roomshare" },
  "家具家电": { ja: "家具家電", en: "Furnished" },
  "宠物": { ja: "ペット", en: "Pets" },
  "公司/店铺": { ja: "会社・店舗", en: "Company" },
  "地点": { ja: "場所", en: "Location" },
  "雇佣形式": { ja: "雇用形態", en: "Employment type" },
  "薪资类型": { ja: "給与形態", en: "Salary type" },
  "日语要求": { ja: "日本語レベル", en: "Japanese level" },
  "签证支持说明": { ja: "ビザサポート", en: "Visa support" },
  "工作时间": { ja: "勤務時間", en: "Working hours" },
  "休日休假": { ja: "休日・休暇", en: "Holidays" },
  "试用期": { ja: "試用期間", en: "Trial period" },
  "福利待遇": { ja: "福利厚生", en: "Benefits" },
  "可远程": { ja: "リモート可", en: "Remote OK" },
  "交通费": { ja: "交通費", en: "Transport fee" },
  "外国人友好": { ja: "外国人歓迎", en: "Foreigner friendly" },
  "无经验可": { ja: "未経験OK", en: "No experience OK" },
  "留学生可": { ja: "留学生OK", en: "Students OK" },
  "服务类型": { ja: "サービス種別", en: "Service type" },
  "服务方": { ja: "提供者", en: "Provider" },
  "可服务城市": { ja: "対応エリア", en: "Service area" },
  "服务范围": { ja: "対応範囲", en: "Service scope" },
  "营业时间": { ja: "営業時間", en: "Opening hours" },
  "价格区间": { ja: "価格帯", en: "Price range" },
  "价格单位": { ja: "料金単位", en: "Price unit" },
  "服务语言": { ja: "対応言語", en: "Languages" },
  "可预约时间": { ja: "予約可能時間", en: "Availability" },
  "房型": { ja: "客室タイプ", en: "Room type" },
  "可住人数": { ja: "定員", en: "Guests" },
  "退房时间": { ja: "チェックアウト", en: "Check-out" },
  "最少入住": { ja: "最低宿泊数", en: "Minimum stay" },
  "设施服务": { ja: "設備・サービス", en: "Amenities" },
  "房量与日期": { ja: "空室・日程", en: "Availability notes" },
  "含早餐": { ja: "朝食付き", en: "Breakfast included" },
  "即时确认": { ja: "即時確定", en: "Instant confirmation" },
  "票种": { ja: "チケット種別", en: "Ticket type" },
  "行程时长": { ja: "所要時間", en: "Duration" },
  "集合地点": { ja: "集合場所", en: "Meeting point" },
  "包含内容": { ja: "含まれるもの", en: "Included" },
  "含酒店接送": { ja: "ホテル送迎", en: "Hotel pickup" },
  "不包含内容": { ja: "含まれないもの", en: "Not included" },
  "服务流程": { ja: "サービスの流れ", en: "Process" },
  "用户需准备": { ja: "ご準備いただくもの", en: "You prepare" },
  "取消规则": { ja: "キャンセル規定", en: "Cancellation" },
  "资质/许可说明": { ja: "資格・許認可", en: "License note" },
  "不保证结果说明": { ja: "結果保証について", en: "No-guarantee note" },
  "相关攻略/资料": { ja: "関連ガイド", en: "Related guides" },
  "机场/路线": { ja: "空港・ルート", en: "Airport/route" },
  "车型": { ja: "車種", en: "Vehicle" },
  "人数": { ja: "人数", en: "Passengers" },
  "行李数": { ja: "荷物数", en: "Luggage" },
  "航班号说明": { ja: "便名について", en: "Flight info" },
  "等待规则": { ja: "待機ルール", en: "Waiting rule" },
  "夜间/追加费用": { ja: "追加料金", en: "Surcharges" },
  "文件/手续类型": { ja: "書類・手続き種別", en: "Document/paperwork type" },
  "所需材料": { ja: "必要書類", en: "Required materials" },
  "交付时间": { ja: "納期", en: "Delivery time" },
  "房型/面积": { ja: "間取り・面積", en: "Room/size" },
  "物品量": { ja: "荷物量", en: "Item volume" },
  "车辆/人员": { ja: "車両・人数", en: "Vehicle/staff" },
  "项目类型": { ja: "作業種別", en: "Project type" },
  "品牌/型号": { ja: "ブランド・型番", en: "Brand/model" },
  "上门区域": { ja: "訪問エリア", en: "Service area" },
  "上门费": { ja: "出張費", en: "Call-out fee" },
  "配件费": { ja: "部品代", en: "Parts fee" },
  "保修说明": { ja: "保証", en: "Warranty" },
  "不可服务范围": { ja: "対応不可範囲", en: "Unavailable scope" },
  "商家": { ja: "店舗", en: "Merchant" },
  "优惠内容": { ja: "特典内容", en: "Deal" },
  "有效期": { ja: "有効期限", en: "Valid until" },
  "使用规则": { ja: "利用条件", en: "Usage rules" },
  "商家认证": { ja: "店舗認証", en: "Merchant verification" },
  "状态": { ja: "ステータス", en: "Status" },
  "发布类型": { ja: "出品タイプ", en: "Listing type" },
  "分类": { ja: "カテゴリ", en: "Category" },
  "新旧程度": { ja: "状態", en: "Condition" },
  "原价/参考价": { ja: "元値・参考価格", en: "Original/reference price" },
  "价格可议": { ja: "価格相談", en: "Negotiable" },
  "购买时间": { ja: "購入時期", en: "Purchase time" },
  "配件/包装": { ja: "付属品・箱", en: "Accessories/box" },
  "瑕疵说明": { ja: "傷・不具合", en: "Defects note" },
  "交易地点": { ja: "受け渡し場所", en: "Meetup location" },
  "交易方式": { ja: "受け渡し方法", en: "Delivery method" },
  "品牌": { ja: "ブランド", en: "Brand" },
};

const NOT_SPECIFIED: Record<ListingLocale, string> = { zh: "未注明", ja: "未記入", en: "Not specified" };
const VERIFIED_LABEL: Record<ListingLocale, string> = { zh: "已认证", ja: "認証済み", en: "Verified" };

export function listingDetailFields(item: KXCityListing, locale: ListingLocale = "zh"): Array<[string, string]> {
  const attr = (key: string) => formatListingAttribute(key, item.attributes?.[key], locale);
  const yesNo = (key: string) => formatBoolean(item.attributes?.[key], locale, NOT_SPECIFIED[locale]);
  const location = cleanListingText(item.location_text);
  const category = cleanListingText(item.category);

  const rows: Array<[string, string]> = item.type === "rental"
    ? [
        ["地区", location],
        ["最近车站", attr("nearest_station")],
        ["车站距离", attr("station_distance_minutes")],
        ["户型", attr("layout")],
        ["面积", attr("area_sqm")],
        ["押金", attr("deposit")],
        ["礼金", attr("key_money")],
        ["管理费", attr("management_fee")],
        ["初期费用说明", attr("initial_cost_note")],
        ["入住时间", attr("move_in_date")],
        ["租期", attr("lease_term")],
        ["短租", yesNo("short_term_allowed")],
        ["合租", yesNo("share_allowed")],
        ["家具家电", yesNo("furnished")],
        ["宠物", yesNo("pet_allowed")],
      ]
    : item.type === "job" || item.type === "hiring"
      ? [
          ["公司/店铺", attr("company_name")],
          ["地点", location],
          ["雇佣形式", attr("employment_type")],
          ["薪资类型", attr("salary_type")],
          ["日语要求", attr("japanese_level")],
          ["签证支持说明", attr("visa_support")],
          ["工作时间", attr("working_hours")],
          ["休日休假", attr("holidays")],
          ["试用期", attr("trial_period")],
          ["福利待遇", attr("benefits")],
          ["交通费", attr("transportation_fee")],
          ["可远程", item.attributes?.remote_ok ? formatBoolean(item.attributes.remote_ok, locale) : ""],
          ["外国人友好", yesNo("foreigner_friendly")],
          ["无经验可", yesNo("no_experience_ok")],
          ["留学生可", yesNo("student_ok")],
        ]
      : item.type === "local_service"
        ? (() => {
            const vertical = serviceVerticalForListing(item);
            const common: Array<[string, string]> = [
              ["服务方", attr("business_name")],
              ["服务类型", attr("service_type") || category],
            ];
            if (vertical === "food_restaurant") return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["营业时间", attr("open_hours")],
              ["价格区间", attr("price_range")],
              ["最近车站", attr("near_station")],
              ["服务语言", attr("languages")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "dining_booking") return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["营业时间", attr("open_hours")],
              ["价格区间", attr("price_range")],
              ["最近车站", attr("near_station")],
              ["可预约时间", attr("availability")],
              ["服务流程", attr("service_process")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "lodging") return [
              ...common,
              ["房型", attr("room_type")],
              ["可住人数", attr("max_guests")],
              ["价格单位", attr("price_unit")],
              ["入住时间", attr("check_in_time")],
              ["退房时间", attr("check_out_time")],
              ["最少入住", attr("minimum_stay")],
              ["设施服务", attr("amenities")],
              ["房量与日期", attr("inventory_note")],
              ["含早餐", formatBoolean(item.attributes?.["breakfast_included"], locale)],
              ["即时确认", formatBoolean(item.attributes?.["instant_confirmation"], locale)],
              ["取消规则", attr("cancellation_rule")],
              ["资质/许可说明", attr("license_note")],
            ];
            if (vertical === "attraction_ticket" || vertical === "day_tour") return [
              ...common,
              ["票种", attr("ticket_type")],
              ["可预约时间", attr("availability")],
              ["行程时长", attr("duration")],
              ["集合地点", attr("meeting_point")],
              ["包含内容", attr("included_items")],
              ["含酒店接送", vertical === "day_tour" ? formatBoolean(item.attributes?.["pickup_service"], locale) : ""],
              ["不包含内容", attr("not_included")],
              ["用户需准备", attr("user_prepare")],
              ["取消规则", attr("cancellation_rule")],
              ["资质/许可说明", attr("license_note")],
            ];
            if (vertical === "airport_transfer") return [
              ...common,
              ["机场/路线", attr("airport_route")],
              ["服务范围", attr("service_area") || location],
              ["车型", attr("vehicle_type")],
              ["人数", attr("passenger_count")],
              ["行李数", attr("luggage_count")],
              ["航班号说明", attr("flight_info_note")],
              ["等待规则", attr("waiting_rule")],
              ["夜间/追加费用", attr("surcharge_note")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "paperwork_translation") return [
              ...common,
              ["服务语言", attr("languages")],
              ["文件/手续类型", attr("document_type")],
              ["所需材料", attr("required_materials")],
              ["交付时间", attr("delivery_time")],
              ["服务流程", attr("service_process")],
              ["用户需准备", attr("user_prepare")],
              ["不保证结果说明", attr("no_result_guarantee")],
              ["资质/许可说明", attr("license_note")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "moving_cleaning") return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["房型/面积", attr("property_size")],
              ["物品量", attr("item_volume")],
              ["车辆/人员", attr("vehicle_staff")],
              ["包含内容", attr("included_items")],
              ["不包含内容", attr("not_included")],
              ["用户需准备", attr("user_prepare")],
              ["夜间/追加费用", attr("surcharge_note")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "life_setup") return [
              ...common,
              ["服务区域", attr("service_area") || location],
              ["服务类型", attr("setup_type")],
              ["所需材料", attr("required_materials")],
              ["预计耗时", attr("delivery_time")],
              ["服务方式", attr("service_process")],
              ["用户需准备", attr("user_prepare")],
              ["不可承诺事项", attr("cannot_guarantee")],
              ["价格说明", attr("price_range")],
              ["取消规则", attr("cancellation_rule")],
            ];
            if (vertical === "beauty_health") return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["服务项目", attr("beauty_service")],
              ["营业时间", attr("open_hours")],
              ["价格区间", attr("price_range")],
              ["可预约时间", attr("availability")],
              ["服务时长", attr("duration")],
              ["注意事项", attr("user_prepare")],
              ["医疗免责声明", attr("medical_disclaimer")],
              ["取消规则", attr("cancellation_rule")],
              ["资质/许可说明", attr("license_note")],
            ];
            if (vertical === "pet_family") return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["服务对象", attr("service_target")],
              ["可预约时间", attr("availability")],
              ["价格说明", attr("price_range")],
              ["注意事项", attr("user_prepare")],
              ["安全/资质说明", attr("license_note")],
              ["取消规则", attr("cancellation_rule")],
            ];
            return [
              ...common,
              ["服务范围", attr("service_area") || location],
              ["价格单位", attr("price_unit")],
              ["可预约时间", attr("availability")],
              ["服务流程", attr("service_process")],
              ["取消规则", attr("cancellation_rule")],
            ];
          })()
        : item.type === "discount"
          ? [
              ["商家", attr("merchant_name")],
              ["地点", location],
              ["优惠内容", attr("discount_info")],
              ["有效期", attr("valid_until")],
              ["使用规则", attr("usage_rules")],
              ["商家认证", boolAttr(item, "merchant_verified") || item.verification_status === "verified" ? VERIFIED_LABEL[locale] : formatVerificationStatus(item.verification_status, locale)],
              ["状态", formatListingStatus(item.status, item.type, locale)],
            ]
        : [
            ["发布类型", attr("listing_mode")],
            ["分类", category],
            ["新旧程度", attr("condition")],
            ["交易地点", location],
            ["交易方式", attr("delivery_method")],
            ["品牌", attr("brand")],
            ["原价/参考价", attr("original_price")],
            ["价格可议", item.attributes?.price_negotiable ? formatBoolean(item.attributes.price_negotiable, locale) : ""],
            ["购买时间", attr("purchase_time")],
            ["配件/包装", attr("accessories")],
            ["瑕疵说明", attr("defect_note")],
            ["取货说明", attr("pickup_note")],
            ["状态", formatListingStatus(item.status, item.type, locale)],
          ];
  return rows
    .filter(([, value]) => !!cleanListingText(value))
    .map(([label, value]) => [labelFrom(DETAIL_FIELD_LABELS, label, locale, label), value]);
}

export function formatInquiryType(type?: string | null, locale: ListingLocale = "zh"): string {
  const labels: Record<string, LabelSet> = {
    secondhand_consult: { zh: "商品咨询", ja: "商品相談", en: "Item inquiry" },
    secondhand_trade_request: { zh: "交易咨询", ja: "取引相談", en: "Trade request" },
    rental_consult: { zh: "房源咨询", ja: "物件相談", en: "Rental inquiry" },
    rental_viewing: { zh: "看房预约", ja: "内見予約", en: "Viewing request" },
    rental_application: { zh: "租房申请", ja: "賃貸申込", en: "Rental application" },
    job_apply: { zh: "职位申请", ja: "求人応募", en: "Job application" },
    service_booking: { zh: "服务预约", ja: "サービス予約", en: "Service booking" },
    restaurant_booking: { zh: "餐饮订座", ja: "飲食予約", en: "Restaurant booking" },
    stay_booking: { zh: "住宿预订", ja: "宿泊予約", en: "Stay booking" },
    travel_ticket_booking: { zh: "旅行票务", ja: "旅行・チケット", en: "Travel/ticket booking" },
    transfer_booking: { zh: "接送预约", ja: "送迎予約", en: "Transfer booking" },
    paperwork_booking: { zh: "手续协助", ja: "手続きサポート", en: "Paperwork support" },
    moving_cleaning_booking: { zh: "搬家清洁", ja: "引越し・清掃", en: "Moving/cleaning" },
    life_setup_booking: { zh: "生活开通", ja: "生活セットアップ", en: "Life setup" },
    beauty_health_booking: { zh: "美容健康", ja: "美容・健康予約", en: "Beauty/health" },
    pet_family_booking: { zh: "宠物家庭", ja: "ペット・家庭サポート", en: "Pet/family support" },
    discount_consult: { zh: "优惠咨询", ja: "特典相談", en: "Deal inquiry" },
    discount_claim: { zh: "优惠咨询", ja: "特典相談", en: "Deal inquiry" },
    event_consult: { zh: "活动咨询", ja: "イベント相談", en: "Event inquiry" },
    general_consult: { zh: "城市咨询", ja: "街の相談", en: "General inquiry" },
  };
  return labelFrom(labels, type, locale, labels.general_consult[locale] || labels.general_consult.zh);
}

export function formatInquiryStatus(status?: string | null, locale: ListingLocale = "zh"): string {
  const labels: Record<string, LabelSet> = {
    submitted: { zh: "已提交", ja: "送信済み", en: "Submitted" },
    new: { zh: "新提交", ja: "新規", en: "New" },
    reviewing: { zh: "处理中", ja: "対応中", en: "In review" },
    contacted: { zh: "已联系", ja: "連絡済み", en: "Contacted" },
    replied: { zh: "已回复", ja: "返信済み", en: "Replied" },
    confirmed: { zh: "已确认", ja: "確定済み", en: "Confirmed" },
    rescheduled: { zh: "待改期", ja: "日程調整中", en: "Rescheduling" },
    rejected: { zh: "已拒绝", ja: "お断り済み", en: "Rejected" },
    withdrawn: { zh: "已撤回", ja: "取り下げ済み", en: "Withdrawn" },
    completed: { zh: "已完成", ja: "完了", en: "Completed" },
    closed: { zh: "已关闭", ja: "終了", en: "Closed" },
    spam: { zh: "骚扰", ja: "スパム", en: "Spam" },
    reported: { zh: "已举报", ja: "通報済み", en: "Reported" },
  };
  return labelFrom(labels, status, locale, FALLBACK[locale]);
}

export function formatAdminRecordValue(key: string, value: unknown): string {
  const normalized = normalizedKey(key);
  if (value == null) return "";
  if (normalized === "type" || normalized === "listing_type") return formatListingType(String(value));
  if (normalized === "status" || normalized.endsWith("_status")) {
    if (normalized.includes("verification")) return formatVerificationStatus(String(value));
    return formatListingStatus(String(value));
  }
  if (normalized === "currency") return formatCurrency(String(value));
  if (normalized === "price" || normalized === "amount") return formatPrice(Number(value));
  if (normalized.includes("at") || normalized.includes("date")) return formatDate(value);
  const clean = cleanListingText(value);
  return clean || "";
}

export function listingSectionForType(type?: KXListingType | string | null): string {
  switch (type) {
    case "secondhand":
      return "marketplace";
    case "rental":
      return "rentals";
    case "local_service":
      return "services";
    case "discount":
      return "deals";
    default:
      return "jobs";
  }
}

function boolAttr(item: KXCityListing, key: string): boolean {
  return parseBoolean(item.attributes?.[key]) === true;
}

function formatBoolean(value: unknown, locale: ListingLocale, fallback = ""): string {
  const parsed = parseBoolean(value);
  if (parsed == null) return fallback;
  if (locale === "en") return parsed ? "Yes" : "No";
  if (locale === "ja") return parsed ? "はい" : "いいえ";
  return parsed ? "是" : "否";
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const clean = cleanListingText(value).toLowerCase();
  if (!clean) return null;
  if (BOOLEAN_TRUE.has(clean)) return true;
  if (BOOLEAN_FALSE.has(clean)) return false;
  return null;
}

function isBooleanLike(value: unknown): boolean {
  return parseBoolean(value) != null;
}
