import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

// Shared, fully-localized content-type label resolver.
//
// CONTENT_TYPE_LABELS (lib/types.ts) is a static Simplified-Chinese map. The
// feed cards (PostCard/PostSpecificDetail) and /explore all render a
// content-type badge; indexing CONTENT_TYPE_LABELS directly leaks zh-Hans to
// en/ja/zh-Hant viewers. This resolver mirrors the label table /explore
// already ships and adds the previously-missing zh-Hant column so every
// surface reads in the viewer's locale.

const EN_LABELS: Partial<Record<ContentType, string>> = {
  dynamic: "Post",
  image_post: "Image",
  long_post: "Long Post",
  news: "News",
  local_info: "Local Info",
  guide: "Guide",
  question: "Q&A",
  rant: "Rant",
  secondhand: "Secondhand",
  housing: "Housing",
  roommate: "Roommate",
  job_seek: "Job Seeking",
  job_post: "Hiring",
  referral: "Referral",
  meetup: "Meetup",
  dining: "Food",
  event: "Event",
  service: "Service",
  merchant: "Business",
  coupon: "Deal",
  warning: "Warning",
  poll: "Poll",
  anonymous: "Anonymous",
};

const JA_LABELS: Partial<Record<ContentType, string>> = {
  dynamic: "投稿",
  image_post: "画像投稿",
  long_post: "長文",
  news: "ニュース",
  local_info: "地域情報",
  guide: "ガイド",
  question: "Q&A",
  rant: "つぶやき",
  secondhand: "中古",
  housing: "住まい",
  roommate: "ルームメイト",
  job_seek: "仕事探し",
  job_post: "求人",
  referral: "紹介",
  meetup: "グループ",
  dining: "グルメ",
  event: "イベント",
  service: "サービス",
  merchant: "店舗",
  coupon: "お得情報",
  warning: "注意喚起",
  poll: "投票",
  anonymous: "匿名",
};

const ZH_HANT_LABELS: Partial<Record<ContentType, string>> = {
  dynamic: "動態",
  image_post: "圖文",
  long_post: "長文",
  news: "新聞",
  local_info: "本地資訊",
  guide: "攻略",
  question: "問答",
  rant: "吐槽",
  secondhand: "二手",
  housing: "租房",
  roommate: "找室友",
  job_seek: "找工作",
  job_post: "招聘",
  referral: "內推",
  meetup: "小組",
  dining: "美食",
  event: "活動",
  service: "服務",
  merchant: "商家",
  coupon: "優惠",
  warning: "避坑",
  poll: "投票",
  anonymous: "樹洞",
};

export function contentTypeLabel(type: ContentType | string | null | undefined, locale: Locale): string {
  const key = (type || "dynamic") as ContentType;
  const zhHans = CONTENT_TYPE_LABELS[key];
  switch (locale) {
    case "en":
      return EN_LABELS[key] || zhHans || String(type);
    case "ja":
      return JA_LABELS[key] || zhHans || String(type);
    case "zh-Hant":
      return ZH_HANT_LABELS[key] || zhHans || String(type);
    default:
      return zhHans || String(type);
  }
}
