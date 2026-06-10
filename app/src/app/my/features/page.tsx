"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PackageCheck,
  Settings,
  Store,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { useSession } from "@/lib/store";
import { compactNumber } from "@/lib/format";
import { regionDisplayName, regionFromUser } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";
import { showVerifiedBadge } from "@/lib/types";

const WORK_ITEMS = [
  { href: "/listings/create", title: "发布城市信息", subtitle: "二手、租房、招聘、本地服务", icon: BriefcaseBusiness, tone: "text-blue-600 bg-blue-50" },
  { href: "/my/listings", title: "我的发布", subtitle: "审核状态、上下架和详情", icon: ClipboardList, tone: "text-slate-700 bg-slate-100" },
  { href: "/my/saved-listings", title: "我的收藏", subtitle: "收藏的二手、房源和服务", icon: Bookmark, tone: "text-emerald-600 bg-emerald-50" },
  { href: "/my/inquiries", title: "我的咨询", subtitle: "交易、房源和服务沟通", icon: MessageSquare, tone: "text-cyan-600 bg-cyan-50" },
  { href: "/my/applications", title: "我的申请", subtitle: "招聘报名与进度", icon: ListChecks, tone: "text-violet-600 bg-violet-50" },
  { href: "/my/bookings", title: "我的预约", subtitle: "本地服务预约管理", icon: CalendarClock, tone: "text-orange-600 bg-orange-50" },
  { href: "/my/orders", title: "我的订单", subtitle: "会员、Guide 和服务订单", icon: CreditCard, tone: "text-pink-600 bg-pink-50" },
  { href: "/membership", title: "Machi 会员", subtitle: "认证标识与高信任发布权限", icon: BadgeCheck, tone: "text-blue-700 bg-blue-50" },
  { href: "/settings", title: "账号设置", subtitle: "资料、地区、隐私和安全", icon: Settings, tone: "text-slate-700 bg-slate-100" },
];

export default function MyFeaturesPage() {
  const user = useSession((s) => s.user);
  const { locale } = useI18n();
  const region = regionFromUser(user);

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-5">
        <section className="rounded-[28px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.55)]">
          <div className="flex items-start gap-4">
            <Avatar user={user || undefined} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black text-slate-950">我的工作台</h1>
                {showVerifiedBadge(user) ? <VerifiedBadge /> : null}
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORK_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="group rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200">
                <div className="flex items-center gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-950">{item.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
                </div>
              </Link>
            );
          })}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <MiniMetric icon={LayoutDashboard} title="资料完整度" value={user?.bio ? "已完善" : "待完善"} />
          <MiniMetric icon={Store} title="商家状态" value={user?.merchant_verified ? "已认证" : user?.is_merchant ? "审核中" : "未开通"} />
          <MiniMetric icon={PackageCheck} title="会员状态" value={user?.is_verified_member ? "已开通" : "普通成员"} />
        </section>
      </main>
    </AppShell>
  );
}

function MiniMetric({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black text-slate-400">{title}</p>
          <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}
