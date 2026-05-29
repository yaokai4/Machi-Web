"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ShieldAlert } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { CONTENT_TYPE_LABELS, type ContentType, type KXPost } from "@/lib/types";

/// Mirrors iOS `PostSpecificDetailSection`. Renders the typed
/// attributes a post carries (price / rent / event_time / address /
/// salary / …) as a clean key-value list below the PostCard so detail
/// pages surface the full payload, not just the body.
export function PostSpecificDetailSection({ post }: { post: KXPost }) {
  const rows = detailRows(post);
  const me = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();
  const [openingDm, setOpeningDm] = useState(false);

  const openDm = async () => {
    if (!me) {
      router.push("/login");
      return;
    }
    if (post.author_id === me.id) {
      pushToast({ kind: "info", message: "这是你自己的帖子" });
      return;
    }
    setOpeningDm(true);
    try {
      const c = await api.openConversation(post.author_id);
      router.push(`/messages/${c.id}?ref=post:${post.id}`);
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setOpeningDm(false);
    }
  };

  const reportPost = async () => {
    if (!me) {
      router.push("/login");
      return;
    }
    try {
      await api.reportPost(post.id, "user_report", "from detail page");
      pushToast({ kind: "success", message: "已收到举报,我们会尽快处理" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  if (rows.length === 0) return null;
  const statusLabel = statusBadge(post);
  const showContact = SHOW_CONTACT_BAR.has(post.content_type ?? "dynamic");

  return (
    <section className="kx-card">
      <header className="flex items-center gap-2 mb-2 text-sm font-bold text-kx-text">
        <span>{CONTENT_TYPE_LABELS[post.content_type ?? "dynamic"]}</span>
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
      {showContact ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={openDm}
            disabled={openingDm}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-kx-accent text-white text-sm font-bold hover:opacity-95 disabled:opacity-60"
          >
            <MessageSquare className="w-4 h-4" />
            {openingDm ? "打开中…" : "私信咨询"}
          </button>
          <button
            type="button"
            onClick={reportPost}
            className="kx-button-ghost h-9 px-3 inline-flex items-center gap-1 text-sm"
            title="举报"
            aria-label="举报"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

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

function detailRows(post: KXPost): Row[] {
  const a = (key: string): string => {
    const value = post.attributes?.[key];
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "是" : "否";
    return String(value);
  };
  const collect = (entries: [string, string][]) =>
    entries.filter(([, v]) => v.trim().length > 0).map(([label, value]) => ({ label, value }));
  const regionLabel = [post.country, post.province, post.city].filter(Boolean).join(" · ");

  switch (post.content_type) {
    case "secondhand":
      return collect([
        ["价格", priceLabel(post)],
        ["成色", a("condition")],
        ["交易方式", a("trade_method")],
        ["区域", a("area") || regionLabel],
      ]);
    case "housing":
      return collect([
        ["租金", [a("currency"), a("rent")].filter(Boolean).join(" ")],
        ["房型", a("room_type")],
        ["区域", a("area") || regionLabel],
        ["最近车站", a("nearest_station")],
        ["押金", a("deposit")],
        ["礼金", a("key_money")],
        ["入住时间", a("move_in_date")],
        ["联系方式", a("contact_method")],
      ]);
    case "roommate":
      return collect([
        ["租金范围", a("rent_range")],
        ["区域", a("area") || regionLabel],
        ["入住时间", a("move_in_date")],
        ["生活习惯", a("lifestyle_tags")],
        ["要求", a("requirements")],
        ["联系方式", a("contact_method")],
      ]);
    case "job_post":
    case "referral":
      return collect([
        ["岗位", a("job_title")],
        ["公司", a("company_name")],
        ["薪资", a("salary")],
        ["工作类型", a("job_type")],
        ["语言要求", a("language_requirement")],
        ["签证要求", a("visa_requirement")],
        ["地点", a("work_location") || regionLabel],
        ["联系方式", a("contact_method")],
      ]);
    case "job_seek":
      return collect([
        ["求职方向", a("desired_job")],
        ["技能", a("skills")],
        ["语言", a("languages")],
        ["签证", a("visa_status")],
        ["到岗", a("availability")],
        ["期望薪资", a("expected_salary")],
        ["联系方式", a("contact_method")],
      ]);
    case "meetup":
      return collect([
        ["类型", a("meetup_type")],
        ["时间", a("meetup_time")],
        ["地点", a("location") || regionLabel],
        ["人数", a("people_limit")],
        ["预算", a("budget")],
        ["安全提醒", a("safety_notice")],
      ]);
    case "dining":
      return collect([
        ["地点", a("restaurant_or_area") || regionLabel],
        ["时间", a("meetup_time")],
        ["人数", a("people_limit")],
        ["预算", a("budget")],
      ]);
    case "event":
      return collect([
        ["时间", a("event_time")],
        ["地点", a("location") || regionLabel],
        ["费用", a("fee")],
        ["容量", a("capacity")],
        ["报名方式", a("registration_method")],
      ]);
    case "guide":
      return collect([
        ["摘要", a("summary")],
        ["最后更新", a("last_updated_at")],
        ["收藏", String(post.bookmark_count)],
      ]);
    case "news":
    case "local_info":
      return collect([
        ["来源", a("source") || "KaiX"],
        ["时间", a("event_time") || new Date(post.created_at).toLocaleString()],
        ["地点", a("location") || regionLabel],
        ["外部链接", a("external_url")],
        ["摘要", a("summary")],
      ]);
    case "merchant":
      return collect([
        ["商家", a("merchant_name")],
        ["类型", a("merchant_type")],
        ["地址", a("address") || regionLabel],
        ["营业时间", a("opening_hours")],
        ["评分", a("rating")],
        ["联系方式", a("contact_method")],
        ["认证状态", a("verified_status")],
      ]);
    case "service":
      return collect([
        ["服务类型", a("service_type")],
        ["价格区间", a("price_range")],
        ["联系方式", a("contact_method")],
        ["认证状态", a("verified_status")],
      ]);
    case "coupon":
      return collect([
        ["折扣", a("discount_info")],
        ["有效期", a("valid_until")],
        ["使用规则", a("usage_rules")],
        ["商家", a("merchant_id")],
      ]);
    case "warning":
      return collect([
        ["分类", a("category")],
        ["描述", a("description")],
        ["审核状态", a("review_status")],
      ]);
    case "question":
      return collect([
        ["分类", a("category")],
      ]);
    case "poll":
      {
        const options = parsePollOptions(post.attributes?.options);
        return collect([
          ["问题", a("question")],
          ["选项", options.join(" / ")],
          ["截止", a("expires_at")],
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

function statusBadge(post: KXPost): { label: string; tint: string } | null {
  const status = (post.attributes?.status as string | undefined) || "";
  if (!status) return null;
  const map: Record<string, { label: string; tint: string }> = {
    available: { label: "可售", tint: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/15" },
    reserved: { label: "已预约", tint: "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/15" },
    sold: { label: "已售", tint: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/10" },
    rented: { label: "已出租", tint: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/10" },
    under_review: { label: "待审核", tint: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15" },
    active: { label: "公开", tint: "text-kx-accent bg-kx-accent/15" },
  };
  return map[status] || null;
}
