"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Bookmark,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  IdCard,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Receipt,
  Route,
  Settings,
  Star,
  Store,
  UserRoundCog,
  Wallet,
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

type WorkbenchKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

const WORK_ITEMS: { href: string; titleKey: WorkbenchKey; subtitleKey: WorkbenchKey; icon: LucideIcon; tone: string; badge: string }[] = [
  { href: "/listings/create", titleKey: "workbench_item_create_title", subtitleKey: "workbench_item_create_sub", icon: BriefcaseBusiness, tone: "text-blue-600 bg-blue-50", badge: "" },
  { href: "/my/listings", titleKey: "workbench_item_listings_title", subtitleKey: "workbench_item_listings_sub", icon: ClipboardList, tone: "text-kx-subtle bg-kx-soft", badge: "" },
  { href: "/my/saved-listings", titleKey: "workbench_item_saved_title", subtitleKey: "workbench_item_saved_sub", icon: Bookmark, tone: "text-emerald-600 bg-emerald-50", badge: "" },
  { href: "/my/saved-searches", titleKey: "workbench_item_saved_search_title", subtitleKey: "workbench_item_saved_search_sub", icon: BellRing, tone: "text-indigo-600 bg-indigo-50", badge: "" },
  { href: "/my/inquiries", titleKey: "workbench_item_inquiries_title", subtitleKey: "workbench_item_inquiries_sub", icon: MessageSquare, tone: "text-cyan-600 bg-cyan-50", badge: "leads" },
  { href: "/my/applications", titleKey: "workbench_item_applications_title", subtitleKey: "workbench_item_applications_sub", icon: ListChecks, tone: "text-violet-600 bg-violet-50", badge: "" },
  { href: "/my/reservations", titleKey: "workbench_item_reservations_title", subtitleKey: "workbench_item_reservations_sub", icon: CalendarClock, tone: "text-orange-600 bg-orange-50", badge: "" },
  { href: "/my/slots", titleKey: "workbench_item_slots_title", subtitleKey: "workbench_item_slots_sub", icon: CalendarClock, tone: "text-teal-600 bg-teal-50", badge: "" },
  { href: "/my/business", titleKey: "workbench_item_business_title", subtitleKey: "workbench_item_business_sub", icon: Store, tone: "text-teal-700 bg-teal-50", badge: "merchant" },
  { href: "/wallet", titleKey: "workbench_item_wallet_title", subtitleKey: "workbench_item_wallet_sub", icon: Coins, tone: "text-amber-600 bg-amber-50", badge: "" },
  { href: "/my/orders", titleKey: "workbench_item_orders_title", subtitleKey: "workbench_item_orders_sub", icon: CreditCard, tone: "text-pink-600 bg-pink-50", badge: "" },
  { href: "/membership", titleKey: "workbench_item_membership_title", subtitleKey: "workbench_item_membership_sub", icon: BadgeCheck, tone: "text-blue-700 bg-blue-50", badge: "membership" },
  { href: "/settings", titleKey: "workbench_item_settings_title", subtitleKey: "workbench_item_settings_sub", icon: Settings, tone: "text-kx-subtle bg-kx-soft", badge: "" },
];

// 个人生活管理工具。原先散落在 Guide(现 Machi AI)首页,现与 iOS 的「我的工作台」
// 一致地收到这里;底层路由仍在 /guide/* 下,只是入口改到工作台。
const LIFE_ADMIN_ITEMS: { href: string; titleKey: WorkbenchKey; subtitleKey: WorkbenchKey; icon: LucideIcon; tone: string }[] = [
  { href: "/guide/tasks", titleKey: "workbench_life_tasks_title", subtitleKey: "workbench_life_tasks_sub", icon: ListChecks, tone: "text-blue-600 bg-blue-50" },
  { href: "/guide/calendar", titleKey: "workbench_life_calendar_title", subtitleKey: "workbench_life_calendar_sub", icon: CalendarDays, tone: "text-cyan-600 bg-cyan-50" },
  { href: "/guide/finance", titleKey: "workbench_life_finance_title", subtitleKey: "workbench_life_finance_sub", icon: Wallet, tone: "text-emerald-600 bg-emerald-50" },
  { href: "/guide/life", titleKey: "workbench_life_life_title", subtitleKey: "workbench_life_life_sub", icon: Receipt, tone: "text-orange-600 bg-orange-50" },
  { href: "/guide/applications", titleKey: "workbench_life_applications_title", subtitleKey: "workbench_life_applications_sub", icon: ClipboardList, tone: "text-violet-600 bg-violet-50" },
  { href: "/guide/contracts", titleKey: "workbench_life_contracts_title", subtitleKey: "workbench_life_contracts_sub", icon: FileText, tone: "text-rose-600 bg-rose-50" },
  { href: "/guide/documents", titleKey: "workbench_life_documents_title", subtitleKey: "workbench_life_documents_sub", icon: IdCard, tone: "text-teal-600 bg-teal-50" },
  { href: "/guide/goals", titleKey: "workbench_life_goals_title", subtitleKey: "workbench_life_goals_sub", icon: Route, tone: "text-indigo-600 bg-indigo-50" },
];

export default function MyFeaturesPage() {
  const user = useSession((s) => s.user);
  const { locale, t } = useI18n();
  const router = useRouter();
  const region = regionFromUser(user);
  const newLeads = useQuery({
    queryKey: ["workbench-new-leads"],
    queryFn: () => api.myListingInquiries({ role: "received", status: "new" }),
    enabled: !!user,
    staleTime: 60_000,
  });
  // Enabled for any signed-in user (the endpoint returns business:null for
  // non-merchants) so the badge can read the *authoritative* business record
  // instead of trusting possibly-stale denormalized flags on the user object.
  const dashboard = useQuery({
    queryKey: ["business-dashboard"],
    queryFn: () => api.businessDashboard(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const newLeadCount = newLeads.data?.length || 0;
  const merchantMetrics = dashboard.data?.metrics;

  // Single source of truth for the merchant card badge. The business record's
  // verification_status wins when loaded; user flags are only a fallback while
  // the dashboard query is still in flight. Surfaces the full lifecycle so a
  // rejected / suspended / in-review account never reads as a flat "未开通".
  const merchantStatusBadge = ((): string => {
    const status = dashboard.data?.business?.verification_status;
    if (status) {
      switch (status) {
        case "verified": return t("workbench_badge_active");
        case "pending":
        case "needs_review": return t("workbench_badge_review");
        case "rejected": return t("workbench_badge_rejected");
        case "suspended": return t("workbench_badge_suspended");
        case "draft": return t("workbench_badge_draft");
        default: break;
      }
    }
    if (user?.merchant_verified) return t("workbench_badge_active");
    if (user?.is_merchant) return t("workbench_badge_review");
    return t("workbench_badge_inactive");
  })();

  return (
    <AppShell wide right={null}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("workbench_back")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-kx-stroke/60 bg-kx-card text-kx-text shadow-[0_8px_22px_-16px_rgba(15,23,42,0.5)] transition hover:border-kx-accent/40 hover:text-kx-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <section className="rounded-[28px] border border-kx-stroke/50 bg-kx-card/90 p-5 shadow-kx-float">
          <div className="flex items-start gap-4">
            <Avatar user={user || undefined} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black text-kx-text">{t("workbench_title")}</h1>
                {showOfficialBadge(user) ? <OfficialBadge /> : showVerifiedBadge(user) ? <VerifiedBadge /> : null}
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-kx-muted">@{user?.handle || "machi"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-kx-subtle">
                <span className="rounded-full bg-kx-soft px-3 py-1">{t("workbench_stat_posts")} {compactNumber(user?.post_count || 0)}</span>
                <span className="rounded-full bg-kx-soft px-3 py-1">{t("workbench_stat_following")} {compactNumber(user?.following_count || 0)}</span>
                <span className="rounded-full bg-kx-soft px-3 py-1">{t("workbench_stat_followers")} {compactNumber(user?.follower_count || 0)}</span>
                {region ? <span className="rounded-full bg-kx-accentSoft px-3 py-1 text-kx-accent">{region.country_emoji} {regionDisplayName(region, locale)}</span> : null}
              </div>
            </div>
            <Link href="/settings" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-kx-stroke/50 bg-kx-card text-kx-subtle shadow-sm">
              <UserRoundCog className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {merchantMetrics ? (
          <section className="rounded-[26px] border border-teal-200/60 bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/60 p-4 dark:border-kx-accent/25 dark:from-kx-accentSoft dark:via-kx-card dark:to-kx-accentSoft/60">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="flex items-center gap-2 text-sm font-black text-kx-text">
                <Store className="h-4 w-4 text-teal-700" />
                {t("workbench_business_overview")}
                {dashboard.data?.business?.verification_status === "verified" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                    <BadgeCheck className="h-3 w-3" />
                    {t("workbench_verified")}
                  </span>
                ) : null}
              </p>
              <Link href="/my/business" className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-800">
                {t("workbench_enter_business")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniMetric icon={ClipboardList} title={t("workbench_metric_published")} value={String(merchantMetrics.published)} />
              <MiniMetric icon={MessageSquare} title={t("workbench_metric_new_leads")} value={String(merchantMetrics.new_inquiries)} highlight={merchantMetrics.new_inquiries > 0} />
              <MiniMetric icon={Star} title={t("workbench_metric_favorites")} value={String(merchantMetrics.favorites)} />
              <MiniMetric icon={LayoutDashboard} title={t("workbench_metric_views")} value={String(merchantMetrics.views)} />
            </div>
          </section>
        ) : null}

        <div>
          <h2 className="mb-2 px-1 text-sm font-black text-kx-muted">{t("workbench_section_life")}</h2>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LIFE_ADMIN_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="group rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 shadow-kx-card transition hover:-translate-y-0.5 hover:border-kx-accent/40">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-kx-text">{t(item.titleKey)}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-kx-muted">{t(item.subtitleKey)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-kx-subtle/50 transition group-hover:text-kx-accent" />
                  </div>
                </Link>
              );
            })}
          </section>
        </div>

        <h2 className="px-1 text-sm font-black text-kx-muted">{t("workbench_section_listings")}</h2>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORK_ITEMS.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badge === "leads" ? newLeadCount : 0;
            const merchantBadge = item.badge === "merchant"
              ? merchantStatusBadge
              : item.badge === "membership" && user?.is_verified_member
                ? t("workbench_badge_active")
                : "";
            const badgeTone = !merchantBadge
              ? ""
              : merchantBadge === t("workbench_badge_active") || merchantBadge === t("workbench_verified")
                ? "bg-emerald-50 text-emerald-700"
                : merchantBadge === t("workbench_badge_review") || merchantBadge === t("workbench_badge_draft")
                  ? "bg-amber-50 text-amber-700"
                  : merchantBadge === t("workbench_badge_rejected") || merchantBadge === t("workbench_badge_suspended")
                    ? "bg-rose-50 text-rose-700"
                    : "bg-kx-soft text-kx-muted";
            return (
              <Link key={item.href} href={item.href} className="group rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 shadow-kx-card transition hover:-translate-y-0.5 hover:border-kx-accent/40">
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
                    <p className="flex items-center gap-1.5 truncate text-sm font-black text-kx-text">
                      {t(item.titleKey)}
                      {merchantBadge ? (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${badgeTone}`}>
                          {merchantBadge}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-kx-muted">{t(item.subtitleKey)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-kx-subtle/50 transition group-hover:text-kx-accent" />
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
    <div className={`rounded-[20px] border bg-kx-card p-4 ${highlight ? "border-rose-200 ring-1 ring-rose-100 dark:border-rose-500/40 dark:ring-rose-500/20" : "border-kx-stroke/50"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${highlight ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15" : "bg-kx-soft text-kx-subtle"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-black text-kx-muted">{title}</p>
          <p className={`mt-1 text-sm font-black ${highlight ? "text-rose-600 dark:text-rose-400" : "text-kx-text"}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
