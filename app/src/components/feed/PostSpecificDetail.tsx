"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ShieldAlert, Users, Check } from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n, type Locale } from "@/lib/i18n";
import { type ContentType, type KXPost } from "@/lib/types";
import { contentTypeLabel } from "@/lib/contentTypes";

// Tiny 4-locale switch for the incidental strings in this section (field
// labels, RSVP/contact copy, toasts). Same local-copy pattern used in
// PostCard.tsx's localize(); avoids threading dozens of one-off keys through
// the shared i18n dictionary.
function localize(locale: Locale, zhHans: string, zhHant: string, en: string, ja: string): string {
  switch (locale) {
    case "en":
      return en;
    case "ja":
      return ja;
    case "zh-Hant":
      return zhHant;
    default:
      return zhHans;
  }
}

/// Mirrors iOS `PostSpecificDetailSection`. Renders the typed
/// attributes a post carries (price / rent / event_time / address /
/// salary / …) as a clean key-value list below the PostCard so detail
/// pages surface the full payload, not just the body.
export function PostSpecificDetailSection({ post }: { post: KXPost }) {
  const { t, locale } = useI18n();
  const rows = detailRows(post, locale);
  const me = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();
  const [openingDm, setOpeningDm] = useState(false);

  // 約局 RSVP (meetup / dining / event): join with people_limit capacity.
  const isMeetup = MEETUP_RSVP_TYPES.has(post.content_type ?? "dynamic");
  const capacity = Number(post.attributes?.people_limit ?? post.attributes?.capacity ?? 0) || 0;
  const [joined, setJoined] = useState(Boolean(post.meetupJoined));
  const [going, setGoing] = useState(post.meetupGoing ?? 0);
  const [joining, setJoining] = useState(false);
  const isOwner = me?.id === post.author_id;
  const full = capacity > 0 && going >= capacity && !joined;

  const toggleJoin = async () => {
    if (!me) { openAuthPrompt("generic"); return; }
    if (isOwner) { pushToast({ kind: "info", message: localize(locale, "这是你发起的局", "這是你發起的局", "This is your own meetup", "あなたが主催する会です") }); return; }
    setJoining(true);
    try {
      const updated = await api.toggleMeetupJoin(post.id, !joined);
      setJoined(Boolean(updated.meetupJoined));
      setGoing(updated.meetupGoing ?? 0);
      pushToast({
        kind: "success",
        message: joined
          ? localize(locale, "已退出", "已退出", "You've left", "参加を取り消しました")
          : localize(locale, "报名成功，已通知发起人", "報名成功，已通知發起人", "You're in — the host has been notified", "参加しました。主催者に通知しました"),
      });
    } catch (err) {
      if (isAuthRequiredError(err)) { openAuthPrompt("generic"); return; }
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setJoining(false);
    }
  };

  const openDm = async () => {
    if (!me) {
      openAuthPrompt("message");
      return;
    }
    if (post.author_id === me.id) {
      pushToast({ kind: "info", message: localize(locale, "这是你自己的帖子", "這是你自己的帖子", "This is your own post", "自分の投稿です") });
      return;
    }
    setOpeningDm(true);
    try {
      const c = await api.openConversation(post.author_id);
      router.push(`/messages/${c.id}?ref=post:${post.id}`);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("message");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setOpeningDm(false);
    }
  };

  const reportPost = async () => {
    if (!me) {
      openAuthPrompt("generic");
      return;
    }
    try {
      await api.reportPost(post.id, "user_report", "from detail page");
      pushToast({ kind: "success", message: localize(locale, "已收到举报，我们会尽快处理", "已收到舉報，我們會盡快處理", "Report received — we'll look into it", "通報を受け付けました。確認します") });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  if (rows.length === 0) return null;
  const statusLabel = statusBadge(post, locale);
  const showContact = SHOW_CONTACT_BAR.has(post.content_type ?? "dynamic");

  return (
    <section className="kx-card">
      <header className="flex items-center gap-2 mb-2 text-sm font-bold text-kx-text">
        <span>{contentTypeLabel(post.content_type ?? "dynamic", locale)}</span>
        {statusLabel ? (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusLabel.tint}`}>
            {statusLabel.label}
          </span>
        ) : null}
      </header>
      <dl className="grid grid-cols-1 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
            <dt className="text-xs text-kx-muted font-semibold">{row.label}</dt>
            <dd className="text-sm text-kx-text font-medium break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      {isMeetup ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-kx-accentSoft/60 px-3.5 py-2.5">
          <div className="inline-flex items-center gap-1.5 text-sm font-bold text-kx-text">
            <Users className="h-4 w-4 text-kx-accent" />
            <span>
              {going}{capacity > 0 ? ` / ${capacity}` : ""}{" "}
              {localize(locale, "人已报名", "人已報名", "going", "人が参加")}
            </span>
          </div>
          {isOwner ? (
            <span className="text-xs font-bold text-kx-muted">{localize(locale, "你发起的局", "你發起的局", "Your meetup", "あなたの主催")}</span>
          ) : (
            <button
              type="button"
              onClick={toggleJoin}
              disabled={joining || (full && !joined)}
              className={
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition disabled:opacity-60 " +
                (joined ? "bg-kx-soft text-kx-text hover:bg-kx-stroke/40" : "bg-kx-accent text-kx-onAccent hover:brightness-110")
              }
            >
              {joined ? (
                <><Check className="h-4 w-4" /> {localize(locale, "已报名", "已報名", "Going", "参加済み")}</>
              ) : full ? (
                localize(locale, "名额已满", "名額已滿", "Full", "満員")
              ) : (
                localize(locale, "报名参加", "報名參加", "Join", "参加する")
              )}
            </button>
          )}
        </div>
      ) : null}
      {showContact ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={openDm}
            disabled={openingDm}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-kx-accent text-kx-onAccent text-sm font-bold hover:brightness-110 disabled:opacity-60"
          >
            <MessageSquare className="w-4 h-4" />
            {openingDm
              ? localize(locale, "打开中…", "開啟中…", "Opening…", "開いています…")
              : localize(locale, "私信咨询", "私訊諮詢", "Message", "メッセージで相談")}
          </button>
          <button
            type="button"
            onClick={reportPost}
            className="kx-button-ghost h-9 px-3 inline-flex items-center gap-1 text-sm"
            title={t("action_report")}
            aria-label={t("action_report")}
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

const MEETUP_RSVP_TYPES: Set<ContentType> = new Set(["meetup", "dining", "event"]);

const SHOW_CONTACT_BAR: Set<ContentType> = new Set([
  "secondhand",
  "housing",
  "roommate",
  "job_post",
  "job_seek",
  "referral",
  "meetup",
  "dining",
  "event",
  "service",
  "merchant",
  "coupon",
]);

interface Row { label: string; value: string }

function detailRows(post: KXPost, locale: Locale): Row[] {
  const a = (key: string): string => {
    const value = post.attributes?.[key];
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? localize(locale, "是", "是", "Yes", "はい") : localize(locale, "否", "否", "No", "いいえ");
    return String(value);
  };
  const collect = (entries: [string, string][]) =>
    entries.filter(([, v]) => v.trim().length > 0).map(([label, value]) => ({ label, value }));
  const regionLabel = [post.country, post.province, post.city].filter(Boolean).join(" · ");
  // Localized field-label lookup. Keys mirror the payload fields; each maps to
  // a 4-locale label so an en/ja/zh-Hant reader sees the detail list in their
  // own language instead of Simplified Chinese.
  const L = {
    price: localize(locale, "价格", "價格", "Price", "価格"),
    condition: localize(locale, "成色", "成色", "Condition", "状態"),
    tradeMethod: localize(locale, "交易方式", "交易方式", "Trade method", "取引方法"),
    area: localize(locale, "区域", "區域", "Area", "エリア"),
    rent: localize(locale, "租金", "租金", "Rent", "家賃"),
    roomType: localize(locale, "房型", "房型", "Layout", "間取り"),
    nearestStation: localize(locale, "最近车站", "最近車站", "Nearest station", "最寄り駅"),
    deposit: localize(locale, "押金", "押金", "Deposit", "敷金"),
    keyMoney: localize(locale, "礼金", "禮金", "Key money", "礼金"),
    moveIn: localize(locale, "入住时间", "入住時間", "Move-in date", "入居時期"),
    contact: localize(locale, "联系方式", "聯絡方式", "Contact", "連絡先"),
    rentRange: localize(locale, "租金范围", "租金範圍", "Rent range", "家賃の範囲"),
    lifestyle: localize(locale, "生活习惯", "生活習慣", "Lifestyle", "生活習慣"),
    requirements: localize(locale, "要求", "要求", "Requirements", "希望条件"),
    position: localize(locale, "岗位", "崗位", "Position", "職種"),
    company: localize(locale, "公司", "公司", "Company", "会社"),
    salary: localize(locale, "薪资", "薪資", "Salary", "給与"),
    jobType: localize(locale, "工作类型", "工作類型", "Job type", "雇用形態"),
    languageReq: localize(locale, "语言要求", "語言要求", "Language", "語学要件"),
    visaReq: localize(locale, "签证要求", "簽證要求", "Visa", "ビザ要件"),
    location: localize(locale, "地点", "地點", "Location", "場所"),
    desiredJob: localize(locale, "求职方向", "求職方向", "Desired role", "希望職種"),
    skills: localize(locale, "技能", "技能", "Skills", "スキル"),
    languages: localize(locale, "语言", "語言", "Languages", "言語"),
    visa: localize(locale, "签证", "簽證", "Visa", "ビザ"),
    availability: localize(locale, "到岗", "到崗", "Availability", "着任時期"),
    expectedSalary: localize(locale, "期望薪资", "期望薪資", "Expected salary", "希望給与"),
    type: localize(locale, "类型", "類型", "Type", "タイプ"),
    time: localize(locale, "时间", "時間", "Time", "日時"),
    people: localize(locale, "人数", "人數", "Capacity", "人数"),
    budget: localize(locale, "预算", "預算", "Budget", "予算"),
    safety: localize(locale, "安全提醒", "安全提醒", "Safety note", "安全上の注意"),
    fee: localize(locale, "费用", "費用", "Fee", "参加費"),
    capacity: localize(locale, "容量", "容量", "Capacity", "定員"),
    registration: localize(locale, "报名方式", "報名方式", "How to register", "申込方法"),
    summary: localize(locale, "摘要", "摘要", "Summary", "概要"),
    lastUpdated: localize(locale, "最后更新", "最後更新", "Last updated", "最終更新"),
    bookmarks: localize(locale, "收藏", "收藏", "Bookmarks", "ブックマーク"),
    source: localize(locale, "来源", "來源", "Source", "出典"),
    externalLink: localize(locale, "外部链接", "外部連結", "External link", "外部リンク"),
    merchant: localize(locale, "商家", "商家", "Business", "店舗"),
    address: localize(locale, "地址", "地址", "Address", "住所"),
    hours: localize(locale, "营业时间", "營業時間", "Hours", "営業時間"),
    rating: localize(locale, "评分", "評分", "Rating", "評価"),
    verified: localize(locale, "认证状态", "認證狀態", "Verification", "認証状態"),
    serviceType: localize(locale, "服务类型", "服務類型", "Service type", "サービス種別"),
    priceRange: localize(locale, "价格区间", "價格區間", "Price range", "価格帯"),
    discount: localize(locale, "折扣", "折扣", "Discount", "割引"),
    validUntil: localize(locale, "有效期", "有效期", "Valid until", "有効期限"),
    usageRules: localize(locale, "使用规则", "使用規則", "Terms", "利用条件"),
    category: localize(locale, "分类", "分類", "Category", "カテゴリ"),
    description: localize(locale, "描述", "描述", "Description", "説明"),
    reviewStatus: localize(locale, "审核状态", "審核狀態", "Review status", "審査状況"),
    question: localize(locale, "问题", "問題", "Question", "質問"),
    options: localize(locale, "选项", "選項", "Options", "選択肢"),
    deadline: localize(locale, "截止", "截止", "Closes", "締切"),
  };

  switch (post.content_type) {
    case "secondhand":
      return collect([
        [L.price, priceLabel(post)],
        [L.condition, a("condition")],
        [L.tradeMethod, a("trade_method")],
        [L.area, a("area") || regionLabel],
      ]);
    case "housing":
      return collect([
        [L.rent, [a("currency"), a("rent")].filter(Boolean).join(" ")],
        [L.roomType, a("room_type")],
        [L.area, a("area") || regionLabel],
        [L.nearestStation, a("nearest_station")],
        [L.deposit, a("deposit")],
        [L.keyMoney, a("key_money")],
        [L.moveIn, a("move_in_date")],
        [L.contact, a("contact_method")],
      ]);
    case "roommate":
      return collect([
        [L.rentRange, a("rent_range")],
        [L.area, a("area") || regionLabel],
        [L.moveIn, a("move_in_date")],
        [L.lifestyle, a("lifestyle_tags")],
        [L.requirements, a("requirements")],
        [L.contact, a("contact_method")],
      ]);
    case "job_post":
    case "referral":
      return collect([
        [L.position, a("job_title")],
        [L.company, a("company_name")],
        [L.salary, a("salary")],
        [L.jobType, a("job_type")],
        [L.languageReq, a("language_requirement")],
        [L.visaReq, a("visa_requirement")],
        [L.location, a("work_location") || regionLabel],
        [L.contact, a("contact_method")],
      ]);
    case "job_seek":
      return collect([
        [L.desiredJob, a("desired_job")],
        [L.skills, a("skills")],
        [L.languages, a("languages")],
        [L.visa, a("visa_status")],
        [L.availability, a("availability")],
        [L.expectedSalary, a("expected_salary")],
        [L.contact, a("contact_method")],
      ]);
    case "meetup":
      return collect([
        [L.type, a("meetup_type")],
        [L.time, a("meetup_time")],
        [L.location, a("location") || regionLabel],
        [L.people, a("people_limit")],
        [L.budget, a("budget")],
        [L.safety, a("safety_notice")],
      ]);
    case "dining":
      return collect([
        [L.location, a("restaurant_or_area") || regionLabel],
        [L.time, a("meetup_time")],
        [L.people, a("people_limit")],
        [L.budget, a("budget")],
      ]);
    case "event":
      return collect([
        [L.time, a("event_time")],
        [L.location, a("location") || regionLabel],
        [L.fee, a("fee")],
        [L.capacity, a("capacity")],
        [L.registration, a("registration_method")],
      ]);
    case "guide":
      return collect([
        [L.summary, a("summary")],
        [L.lastUpdated, a("last_updated_at")],
        [L.bookmarks, String(post.bookmark_count)],
      ]);
    case "news":
    case "local_info":
      return collect([
        [L.source, a("source") || "KaiX"],
        [L.time, a("event_time") || formatDateTimeTokyo(post.created_at, locale)],
        [L.location, a("location") || regionLabel],
        [L.externalLink, a("external_url")],
        [L.summary, a("summary")],
      ]);
    case "merchant":
      return collect([
        [L.merchant, a("merchant_name")],
        [L.type, a("merchant_type")],
        [L.address, a("address") || regionLabel],
        [L.hours, a("opening_hours")],
        [L.rating, a("rating")],
        [L.contact, a("contact_method")],
        [L.verified, a("verified_status")],
      ]);
    case "service":
      return collect([
        [L.serviceType, a("service_type")],
        [L.priceRange, a("price_range")],
        [L.contact, a("contact_method")],
        [L.verified, a("verified_status")],
      ]);
    case "coupon":
      return collect([
        [L.discount, a("discount_info")],
        [L.validUntil, a("valid_until")],
        [L.usageRules, a("usage_rules")],
        [L.merchant, a("merchant_id")],
      ]);
    case "warning":
      return collect([
        [L.category, a("category")],
        [L.description, a("description")],
        [L.reviewStatus, a("review_status")],
      ]);
    case "question":
      return collect([
        [L.category, a("category")],
      ]);
    case "poll":
      {
        const options = parsePollOptions(post.attributes?.options);
        return collect([
          [L.question, a("question")],
          [L.options, options.join(" / ")],
          [L.deadline, a("expires_at")],
        ]);
      }
    default:
      return [];
  }
}

function parsePollOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // Fall through.
    }
  }
  return raw.split(/[\n/；;|]+/).map((item) => item.trim()).filter(Boolean);
}

// Format an ISO timestamp as a full date-time. Pinned to Asia/Tokyo (the app's
// canonical timezone) so SSR and client agree and no machine-timezone leaks
// into the rendered string; localized digits/format follow the viewer's locale.
function formatDateTimeTokyo(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const bcp = locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : locale === "zh-Hant" ? "zh-Hant" : "zh-Hans";
  try {
    return new Intl.DateTimeFormat(bcp, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    }).format(d);
  } catch {
    return "";
  }
}

function priceLabel(post: KXPost): string {
  const a = (key: string): string => {
    const value = post.attributes?.[key];
    return value == null ? "" : String(value).trim();
  };
  const price = a("price");
  if (!price) return "";
  const currency = a("currency");
  return currency ? `${currency} ${price}` : price;
}

function statusBadge(post: KXPost, locale: Locale): { label: string; tint: string } | null {
  const status = (post.attributes?.status as string | undefined) || "";
  if (!status) return null;
  // Three token tiers only (mirrors the card chips): accent for "live",
  // --kx-heat for "attention", neutral soft for "done". Dark mode resolves
  // through the tokens — no per-colour dark: patches.
  const map: Record<string, { label: string; tint: string }> = {
    available: { label: localize(locale, "可售", "可售", "Available", "販売中"), tint: "text-kx-accent bg-kx-accentSoft/80 ring-1 ring-inset ring-kx-accent/15" },
    reserved: { label: localize(locale, "已预约", "已預約", "Reserved", "予約済み"), tint: "text-kx-heat bg-kx-heat/10 ring-1 ring-inset ring-kx-heat/20" },
    sold: { label: localize(locale, "已售", "已售", "Sold", "売却済み"), tint: "text-kx-subtle bg-kx-soft ring-1 ring-inset ring-kx-stroke/50" },
    rented: { label: localize(locale, "已出租", "已出租", "Rented", "契約済み"), tint: "text-kx-subtle bg-kx-soft ring-1 ring-inset ring-kx-stroke/50" },
    under_review: { label: localize(locale, "待审核", "待審核", "Under review", "審査中"), tint: "text-kx-heat bg-kx-heat/10 ring-1 ring-inset ring-kx-heat/20" },
    active: { label: localize(locale, "公开", "公開", "Public", "公開中"), tint: "text-kx-accent bg-kx-accentSoft/80 ring-1 ring-inset ring-kx-accent/15" },
  };
  return map[status] || null;
}
