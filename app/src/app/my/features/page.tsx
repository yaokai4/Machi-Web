"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Coins,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Settings,
  Star,
  Store,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { useSession } from "@/lib/store";
import { compactNumber } from "@/lib/format";
import { regionDisplayName, regionFromUser } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";

const WORK_ITEMS = [
  { href: "/listings/create", title: "发布城市信息", subtitle: "二手、租房、招聘、商家与服务", icon: BriefcaseBusiness, tone: "text-blue-600 bg-blue-50", badge: "" },
  { href: "/my/listings", title: "我的发布", subtitle: "审核状态、上下架和详情", icon: ClipboardList, tone: "text-slate-700 bg-slate-100", badge: "" },
  { href: "/my/saved-listings", title: "我的收藏", subtitle: "收藏的二手、房源和服务", icon: Bookmark, tone: "text-emerald-600 bg-emerald-50", badge: "" },
  { href: "/my/inquiries", title: "我的咨询", subtitle: "交易、房源和服务沟通", icon: MessageSquare, tone: "text-cyan-600 bg-cyan-50", badge: "leads" },
  { href: "/my/applications", title: "我的申请", subtitle: "招聘报名与进度", icon: ListChecks, tone: "text-violet-600 bg-violet-50", badge: "" },
  { href: "/my/bookings", title: "我的预约", subtitle: "本地服务、住宿和行程预订", icon: CalendarClock, tone: "text-orange-600 bg-orange-50", badge: "" },
  { href: "/my/reservations", title: "时段预约", subtitle: "看房、到店与服务的预约时段", icon: CalendarClock, tone: "text-teal-600 bg-teal-50", badge: "" },
  { href: "/my/business", title: "商家服务后台", subtitle: "认证申请、服务管理、线索和点评", icon: Store, tone: "text-teal-700 bg-teal-50", badge: "merchant" },
  { href: "/wallet", title: "Machi 币钱包", subtitle: "Machi 币余额、充值与记录", icon: Coins, tone: "text-amber-600 bg-amber-50", badge: "" },
  { href: "/my/orders", title: "我的订单", subtitle: "会员、Guide 和服务订单", icon: CreditCard, tone: "text-pink-600 bg-pink-50", badge: "" },
  { href: "/membership", title: "Machi 会员", subtitle: "认证标识与高信任发布权限", icon: BadgeCheck, tone: "text-blue-700 bg-blue-50", badge: "membership" },
  { href: "/settings", title: "账号设置", subtitle: "资料、地区、隐私和安全", icon: Settings, tone: "text-slate-700 bg-slate-100", badge: "" },
];

export default function MyFeaturesPage() {
  const user = useSession((s) => s.user);
  const { locale } = useI18n();
  const router = useRouter();
  const region = regionFromUser(user);
  const newLeads = useQuery({
    queryKey: ["workbench-new-leads"],
    queryFn: () => api.myListingInquiries({ role: "received", status: "new" }),
    enabled: !!user,
    staleTime: 60_000,
  });
  const dashboard = useQuery({
    queryKey: ["business-dashboard"],
    queryFn: () => api.businessDashboard(),
    enabled: !!user && !!(user.is_merchant || user.merchant_verified),
    staleTime: 60_000,
  });
  const newLeadCount = newLeads.data?.length || 0;
  const merchantMetrics = dashboard.data?.metrics;

  return (
    <AppShell wide right={null}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="返回"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/60 bg-kx-card text-kx-text shadow-[0_8px_22px_-16px_rgba(15,23,42,0.5)] transition hover:border-kx-accent/40 hover:text-kx-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <section className="rounded-[28px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.55)]">
          <div className="flex items-start gap-4">
            <Avatar user={user || undefined} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black text-slate-950">我的工作台</h1>
                {showOfficialBadge(user) ? <OfficialBadge /> : showVerifiedBadge(user) ? <VerifiedBadge /> : null}
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">@{user?.handle || "machi"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">帖子 {compactNumber(user?.post_count || 0)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">关注 {compactNumber(user?.following_count || 0)}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">粉丝 {compactNumber(user?.follower_count || 0)}</span>
                {region ? <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{region.country_emoji} {regionDisplayName(region, locale)}</span> : null}
              </div>
            </div>
            <Link href="/settings" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm">
              <UserRoundCog className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {merchantMetrics ? (
          <section className="rounded-[26px] border border-teal-200/60 bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="flex items-center gap-2 text-sm font-black text-slate-950">
                <Store className="h-4 w-4 text-teal-700" />
                经营概览
                {dashboard.data?.business?.verification_status === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                    <BadgeCheck className="h-3 w-3" />
                    已认证
                  </span>
                ) : null}
              </p>
              <Link href="/my/business" className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-800">
                进入商家后台
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniMetric icon={ClipboardList} title="在线服务" value={String(merchantMetrics.published)} />
              <MiniMetric icon={MessageSquare} title="新线索" value={String(merchantMetrics.new_inquiries)} highlight={merchantMetrics.new_inquiries > 0} />
              <MiniMetric icon={Star} title="收藏" value={String(merchantMetrics.favorites)} />
              <MiniMetric icon={LayoutDashboard} title="浏览" value={String(merchantMetrics.views)} />
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORK_ITEMS.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badge === "leads" ? newLeadCount : 0;
            const merchantBadge = item.badge === "merchant"
              ? (user?.merchant_verified ? "已认证" : user?.is_merchant ? "审核中" : "未开通")
              : item.badge === "membership" && user?.is_verified_member
                ? "已开通"
                : "";
            return (
              <Link key={item.href} href={item.href} className="group rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200">
                <div className="flex items-center gap-3">
                  <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                    {badgeCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-sm">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-black text-slate-950">
                      {item.title}
                      {merchantBadge ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${merchantBadge === "已认证" || merchantBadge === "已开通" ? "bg-emerald-50 text-emerald-700" : merchantBadge === "审核中" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                          {merchantBadge}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
                </div>
              </Link>
            );
          })}
        </section>
      </main>
    </AppShell>
  );
}

function MiniMetric({ icon: Icon, title, value, highlight }: { icon: LucideIcon; title: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[20px] border bg-white p-4 ${highlight ? "border-rose-200 ring-1 ring-rose-100" : "border-slate-200/70"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${highlight ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-700"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black text-slate-400">{title}</p>
          <p className={`mt-1 text-sm font-black ${highlight ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
