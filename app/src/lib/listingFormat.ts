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
  local_service: { zh: "商家与本地服务", en: "Businesses & local services", ja: "店舗・地域サービス" },
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
  "交通费": { ja: "交通費", en: "Transport fee" },
  "外国人友好": { ja: "外国人歓迎", en: "Foreigner friendly" },
  "无经验可": { ja: "未経験OK", en: "No experience OK" },
  "留学生可": { ja: "留学生OK", en: "Students OK" },
  "服务类型": { ja: "サービス種別", en: "Service type" },
  "可服务城市": { ja: "対応エリア", en: "Service area" },
  "价格单位": { ja: "料金単位", en: "Price unit" },
  "可预约时间": { ja: "予約可能時間", en: "Availability" },
  "不包含内容": { ja: "含まれないもの", en: "Not included" },
  "服务流程": { ja: "サービスの流れ", en: "Process" },
  "用户需准备": { ja: "ご準備いただくもの", en: "You prepare" },
  "取消规则": { ja: "キャンセル規定", en: "Cancellation" },
  "不保证结果说明": { ja: "結果保証について", en: "No-guarantee note" },
  "相关攻略/资料": { ja: "関連ガイド", en: "Related guides" },
  "商家": { ja: "店舗", en: "Merchant" },
  "优惠内容": { ja: "特典内容", en: "Deal" },
  "有效期": { ja: "有効期限", en: "Valid until" },
  "使用规则": { ja: "利用条件", en: "Usage rules" },
  "商家认证": { ja: "店舗認証", en: "Merchant verification" },
  "状态": { ja: "ステータス", en: "Status" },
  "发布类型": { ja: "出品タイプ", en: "Listing type" },
  "分类": { ja: "カテゴリ", en: "Category" },
  "新旧程度": { ja: "状態", en: "Condition" },
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
          ["交通费", attr("transportation_fee")],
          ["外国人友好", yesNo("foreigner_friendly")],
          ["无经验可", yesNo("no_experience_ok")],
          ["留学生可", yesNo("student_ok")],
        ]
      : item.type === "local_service"
        ? [
            ["服务类型", attr("service_type")],
            ["可服务城市", attr("service_area")],
            ["营业时间", attr("open_hours")],
            ["价格区间", attr("price_range")],
            ["价格单位", attr("price_unit")],
            ["最近车站", attr("near_station")],
            ["可预约时间", attr("availability")],
            ["服务语言", attr("languages")],
            ["房型", attr("room_type")],
            ["可住人数", attr("max_guests")],
            ["入住时间", attr("check_in_time")],
            ["退房时间", attr("check_out_time")],
            ["含早餐", formatBoolean(item.attributes?.["breakfast_included"], locale)],
            ["票种", attr("ticket_type")],
            ["行程时长", attr("duration")],
            ["集合地点", attr("meeting_point")],
            ["包含内容", attr("included_items")],
            ["含酒店接送", formatBoolean(item.attributes?.["pickup_service"], locale)],
            ["不包含内容", attr("not_included")],
            ["服务流程", attr("service_process")],
            ["用户需准备", attr("user_prepare")],
            ["取消规则", attr("cancellation_rule")],
            ["不保证结果说明", attr("no_result_guarantee")],
            ["相关攻略/资料", attr("related_guides")],
          ]
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
            ["状态", formatListingStatus(item.status, item.type, locale)],
          ];
  return rows
    .filter(([, value]) => !!cleanListingText(value))
    .map(([label, value]) => [labelFrom(DETAIL_FIELD_LABELS, label, locale, label), value]);
}

export function formatInquiryType(type?: string | null): string {
  const labels: Record<string, string> = {
    secondhand_consult: "商品咨询",
    rental_consult: "房源咨询",
    job_apply: "职位申请",
    service_booking: "服务预约",
    discount_consult: "优惠咨询",
    event_consult: "活动咨询",
  };
  return labels[normalizedKey(type)] || "城市咨询";
}

export function formatInquiryStatus(status?: string | null): string {
  const labels: Record<string, string> = { new: "新咨询", replied: "已回复", closed: "已关闭", spam: "骚扰", reported: "已举报" };
  return labels[normalizedKey(status)] || FALLBACK.zh;
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
