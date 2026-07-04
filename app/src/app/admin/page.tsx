"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  AlertCircle,
  Ban,
  CheckCircle2,
  Flag,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  FileText,
  MessageCircle,
  HardDrive,
  Globe,
  MapPin,
  Sparkles,
  Send,
  Eraser,
  Boxes,
  BookOpen,
  CreditCard,
  BadgeCheck,
  Settings,
  ClipboardList,
  CalendarClock,
  ChevronRight,
  Star,
  Store,
  Building2,
  KeyRound,
  Mail,
  Pencil,
  Eye,
  EyeOff,
  Dice5,
  Layers,
  Wand2,
  UserPlus,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { provincesFor, citiesFor, composeRegionCode, JP_METRO_CIRCLES, regionsForMetroCircle } from "@/lib/regions";
import { AppShell } from "@/components/shell/AppShell";
import { MasterCopyEditorCard } from "@/components/admin/MasterCopyEditorCard";
import { Avatar, OfficialBadge, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog, Dialog } from "@/components/design/Dialog";
import type { KXUser } from "@/lib/types";
import { NavTabs } from "@/components/design/NavTabs";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime, relativeTime, compactNumber } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, showOfficialBadge, showVerifiedBadge, type ContentType } from "@/lib/types";

type Tab = "overview" | "users" | "posts" | "reports" | "feedback" | "visitors" | "seed" | "site";

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "overview", label: "总览",  icon: Activity },
  { value: "users",    label: "用户",  icon: Users },
  { value: "posts",    label: "帖子",  icon: FileText },
  { value: "reports",  label: "举报",  icon: Flag },
  { value: "feedback", label: "反馈",  icon: MessageSquareWarning },
  { value: "visitors", label: "访客",  icon: MapPin },
  { value: "seed",     label: "城市内容助手", icon: Sparkles },
];

export default function AdminPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const [tab, setTab] = useState<Tab>("overview");

  // Auth + admin gate. While session bootstrapping, we render nothing
  // so we don't flash 403 to the actual admin.
  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin");
  }, [status, router]);

  // Allow deep-linking to a specific panel, e.g. /admin?tab=site opens the
  // full 官网文案 (master copy) editor directly from settings.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    const valid: Tab[] = ["overview", "users", "posts", "reports", "feedback", "visitors", "seed", "site"];
    if (requested && valid.includes(requested)) setTab(requested);
  }, []);

  if (status === "loading" || status === "idle") {
    return (
      <AppShell right={null} wide>
        <InlineLoading />
      </AppShell>
    );
  }
  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <AppShell right={null} wide>
        <div className="px-6 py-16 text-center">
          <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">无权访问</h1>
          <p className="text-sm text-kx-subtle mt-1">这个页面仅限管理员。</p>
          <Link href="/home" className="kx-button-primary mt-4 inline-flex">回首页</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-kx-accent" />
        <h1 className="text-lg font-bold">管理后台</h1>
        <span className="text-xs text-kx-muted ml-2">登录为 @{user.handle}</span>
      </header>

      <div className="sticky top-[52px] z-20">
        <NavTabs
          items={TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      <div className="px-3 sm:px-4 py-3">
        {tab === "overview" ? <OverviewPanel onOpenTab={setTab} /> : null}
        {tab === "users"    ? <UsersPanel /> : null}
        {tab === "posts"    ? <PostsPanel /> : null}
        {tab === "reports"  ? <ReportsPanel /> : null}
        {tab === "feedback" ? <FeedbackPanel /> : null}
        {tab === "visitors" ? <VisitorsPanel /> : null}
        {tab === "seed"     ? <SeedBotPanel /> : null}
        {tab === "site"     ? <SiteCopyPanel /> : null}
      </div>
    </AppShell>
  );
}

// Quick links to the full-page admin modules that live on their own
// routes (商品/服务/会员定价、Guide 内容、订单、预约、支付…). The dashboard
// only had in-page tabs before, so these were unreachable without typing
// the URL by hand. Surfacing them here is the admin's main entry point.
const ADMIN_MODULES: {
  href: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { href: "/admin/pricing", label: "商品 / 服务 / 会员定价", desc: "价格、货币、会员价、Stripe / IAP ID", icon: Boxes },
  { href: "/admin/reputation", label: "城市声望", desc: "等级、信任、风险与徽章", icon: ShieldCheck },
  { href: "/admin/listings/review", label: "Listing 审核", desc: "二手 · 租房 · 工作 · 服务 · 优惠", icon: ShieldCheck },
  { href: "/admin/listings/taxonomy", label: "发布分类与字段", desc: "二手 · 租房 · 工作 · 商家服务字段配置", icon: Settings },
  { href: "/admin/listings/reports", label: "Listing 举报", desc: "举报处理、下架与复核", icon: Flag },
  { href: "/admin/listings/promotions", label: "Listing 推广", desc: "置顶、精选、城市首页推荐", icon: Sparkles },
  { href: "/admin/businesses", label: "商家资料", desc: "商家认证和服务商资料", icon: Store },
  { href: "/admin/partners", label: "入驻商后台", desc: "星域等专属房源导入后台", icon: Building2 },
  { href: "/admin/reviews", label: "点评审核", desc: "服务点评的隐藏、恢复与删除", icon: Star },
  { href: "/admin/seller-verifications", label: "认证审核", desc: "卖家、房源方、招聘方和服务商", icon: BadgeCheck },
  { href: "/admin/uploads", label: "文件管理", desc: "S3 / CloudFront 文件、状态和清理", icon: HardDrive },
  { href: "/admin/email", label: "邮件系统", desc: "编辑草稿、群发邮件和广告通知", icon: Send },
  { href: "/admin/guide", label: "Guide 内容管理", desc: "文章 · 商品 · 服务 · 学校 · 公司", icon: BookOpen },
  { href: "/admin/guide/orders", label: "Guide 订单", desc: "数字资料购买订单", icon: ClipboardList },
  { href: "/admin/guide/service-requests", label: "服务预约", desc: "人工服务预约与处理", icon: CalendarClock },
  { href: "/admin/memberships", label: "会员管理", desc: "认证会员开通与到期", icon: BadgeCheck },
  { href: "/admin/payments", label: "支付与订单", desc: "Stripe 支付与对账", icon: CreditCard },
  { href: "/admin/settings", label: "站点设置", desc: "系统与运营配置", icon: Settings },
];

function ModuleNav({ onOpenSiteCopy }: { onOpenSiteCopy?: () => void }) {
  return (
    <div className="kx-card">
      <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4" /> 管理模块
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {onOpenSiteCopy ? (
          <button
            type="button"
            onClick={onOpenSiteCopy}
            className="group flex items-center gap-3 rounded-kx-md border border-kx-accent/40 bg-kx-accentSoft/40 px-3 py-2.5 text-left transition hover:border-kx-accent/60 hover:bg-kx-accentSoft/60"
          >
            <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-kx-md bg-kx-accent text-white">
              <Globe className="w-4.5 h-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-sm truncate">官网文案</span>
              <span className="block text-xs text-kx-muted truncate">编辑首页 / 落地页文案与覆盖</span>
            </span>
            <ChevronRight className="w-4 h-4 text-kx-muted group-hover:text-kx-accent" />
          </button>
        ) : null}
        {ADMIN_MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group flex items-center gap-3 rounded-kx-md border border-kx-stroke/40 bg-kx-soft/40 px-3 py-2.5 transition hover:border-kx-accent/50 hover:bg-kx-accentSoft/40"
          >
            <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-kx-md bg-kx-accentSoft text-kx-accent">
              <m.icon className="w-4.5 h-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-sm truncate">{m.label}</span>
              <span className="block text-xs text-kx-muted truncate">{m.desc}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-kx-muted group-hover:text-kx-accent" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function OverviewPanel({ onOpenTab }: { onOpenTab: (tab: Tab) => void }) {
  const q = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.adminStats(),
    refetchInterval: 30000,
  });
  const s = (q.data?.stats ?? {}) as Record<string, number | string | string[]>;
  const cards = !q.data ? [] : [
    { label: "用户总数",   value: s.users_total,     sub: `+${s.users_24h} / 24h · +${s.users_7d} / 7d` },
    { label: "帖子总数",   value: s.posts_total,     sub: `+${s.posts_24h} / 24h` },
    { label: "公开帖子",   value: s.posts_active,    sub: `${s.posts_under_review} 待审 · ${s.posts_hidden} 隐藏` },
    { label: "评论总数",   value: s.comments_total,  sub: `+${s.comments_24h} / 24h` },
    { label: "私信总数",   value: s.messages_total,  sub: `+${s.messages_24h} / 24h` },
    { label: "媒体文件",   value: s.media_total,     sub: bytes(Number(s.media_size_bytes)) },
    { label: "活跃会话",   value: s.active_sessions, sub: "在线 token" },
    { label: "待处理举报", value: s.reports_open,    sub: "需要管理员处理" },
    { label: "加热内容",   value: s.boosted_posts,   sub: "商业化预留入口" },
    { label: "用户反馈",   value: s.feedback_total,  sub: "累计提交" },
  ];
  return (
    <div className="space-y-3">
      <ModuleNav onOpenSiteCopy={() => onOpenTab("site")} />
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <InlineLoading />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map((c) => (
              <div key={c.label} className="kx-card animate-kx-fade-in">
                <div className="text-xs text-kx-subtle">{c.label}</div>
                <div className="text-2xl font-bold mt-1">{compactNumber(Number(c.value))}</div>
                <div className="text-xs text-kx-muted mt-1">{c.sub}</div>
              </div>
            ))}
          </div>
          <div className="kx-card">
            <h3 className="kx-section-title mb-3 px-0 inline-flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" /> 系统
            </h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 text-sm">
              <dt className="text-kx-muted">数据库大小</dt><dd className="font-semibold">{bytes(Number(s.db_size_bytes))}</dd>
              <dt className="text-kx-muted">媒体大小</dt><dd className="font-semibold">{bytes(Number(s.media_size_bytes))}</dd>
              <dt className="text-kx-muted">环境</dt><dd className="font-semibold">{String(s.server_env)}</dd>
              <dt className="text-kx-muted">服务时间</dt><dd className="font-semibold">{fullDateTime(String(s.server_time))}</dd>
            </dl>
            <h3 className="kx-section-title mt-4 mb-2 px-0 inline-flex items-center gap-1.5">
              <Globe className="w-4 h-4" /> CORS 允许来源
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {((s.allowed_origins as string[]) ?? []).map((o) => (
                <span key={o} className="px-2 py-1 rounded-full bg-kx-soft text-xs font-mono">{o}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UsersPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [page, setPage] = useState(0);
  const [seedOnly, setSeedOnly] = useState(false);
  const [pendingBan, setPendingBan] = useState<string | null>(null);
  const [manageUser, setManageUser] = useState<KXUser | null>(null);
  const [pendingErase, setPendingErase] = useState<KXUser | null>(null);
  const [pendingClearSeed, setPendingClearSeed] = useState(false);
  const PAGE = 30;
  const list = useQuery({
    queryKey: ["admin-users", dq, page, seedOnly],
    queryFn: () => api.adminUsers({ q: dq || undefined, limit: PAGE, offset: page * PAGE, seed: seedOnly }),
  });
  const users = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const seedTotal = list.data?.seedTotal ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  const update = async (id: string, patch: Parameters<typeof api.adminUpdateUser>[1]) => {
    try {
      await api.adminUpdateUser(id, patch);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: "已更新" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  // Set a user's follower count to a target — materializes real follows from AI
  // persona accounts (real followers untouched; target floors at real count).
  const [followerBusy, setFollowerBusy] = useState<string | null>(null);
  const [followerDraft, setFollowerDraft] = useState<Record<string, string>>({});
  const [randomBusy, setRandomBusy] = useState(false);
  const setFollowers = async (id: string) => {
    const raw = followerDraft[id];
    const target = Math.floor(Number(raw));
    if (raw === undefined || raw === "" || Number.isNaN(target) || target < 0) {
      pushToast({ kind: "error", message: "请输入有效的粉丝数" }); return;
    }
    setFollowerBusy(id);
    try {
      const r = await api.adminSetFollowerCount(id, target);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setFollowerDraft((d) => { const n = { ...d }; delete n[id]; return n; });
      pushToast({ kind: "success", message: `粉丝已设为 ${r.follower_count}${r.pool_exhausted ? "（城市用户已全部用上，达到上限）" : ""}${r.real_followers ? ` · 含真实粉丝 ${r.real_followers}` : ""}` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
    finally { setFollowerBusy(null); }
  };
  const randomizeFollowers = async () => {
    setRandomBusy(true);
    try {
      const r = await api.adminRandomizeFollowers({});
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: `已为 ${r.updated} 个生成用户随机铺粉丝（新增关注 ${r.added}）` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
    finally { setRandomBusy(false); }
  };
  const suspend = async (id: string) => {
    try {
      await api.adminSuspendUser(id);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setPendingBan(null);
      pushToast({ kind: "success", message: "已封禁" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  const restore = async (id: string) => {
    try {
      await api.adminRestoreUser(id);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      pushToast({ kind: "success", message: "已解封" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  // Manually grant / extend a Machi Verified membership by one month.
  const grantMembership = async (id: string) => {
    try {
      await api.adminGrantMembership({ userId: id, months: 1 });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: "已开通 / 延长 1 个月认证会员" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  const saveEmail = async (id: string, email: string): Promise<boolean> => {
    try {
      await api.adminUpdateUser(id, { email });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: email ? "邮箱已更新" : "已清除邮箱" });
      return true;
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); return false; }
  };
  const saveOfficial = async (id: string, patch: { is_official: boolean; official_role: string }): Promise<boolean> => {
    try {
      await api.adminUpdateUser(id, patch);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: patch.is_official ? "官方标识已更新" : "官方标识已撤回" });
      return true;
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); return false; }
  };
  const setUserPassword = async (id: string, password: string): Promise<boolean> => {
    try {
      await api.adminSetUserPassword(id, password);
      pushToast({ kind: "success", message: "密码已重置，该用户需用新密码重新登录" });
      return true;
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); return false; }
  };
  const erase = async (u: KXUser) => {
    try {
      await api.adminEraseUser(u.id);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setPendingErase(null);
      setManageUser(null);
      pushToast({ kind: "success", message: "账号已永久删除" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  const clearGenerated = async () => {
    setPendingClearSeed(false);
    try {
      const r = await api.adminContentPackUsersClear();
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-content-pack-users"] });
      pushToast({ kind: "success", message: `已删除生成用户 ${r.cleared} 个（其房源/帖子已归还回退账号）` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  return (
    <div className="space-y-3">
      <div className="kx-card p-3 flex flex-wrap items-center gap-2">
        <Search className="w-4 h-4 text-kx-muted" />
        <input className="kx-input h-9 flex-1 min-w-[180px]" placeholder="搜用户名 / 显示名 / 邮箱" value={q}
               onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <label className="inline-flex items-center gap-1.5 text-xs text-kx-muted whitespace-nowrap">
          <input type="checkbox" checked={seedOnly} onChange={(e) => { setSeedOnly(e.target.checked); setPage(0); }} />
          只看生成的用户{seedTotal ? `（${seedTotal}）` : ""}
        </label>
        <button className="kx-button-ghost h-9 px-3 text-xs disabled:opacity-40"
                disabled={!seedTotal || randomBusy} onClick={randomizeFollowers}
                title="为所有生成用户随机分配可信的粉丝数（用其他城市用户当粉丝，时间打散）">
          <UserPlus className="w-3.5 h-3.5" /> {randomBusy ? "铺粉中…" : "随机铺粉丝"}
        </button>
        <button className="kx-button-ghost h-9 px-3 text-xs text-kx-danger disabled:opacity-40"
                disabled={!seedTotal} onClick={() => setPendingClearSeed(true)}>
          <Trash2 className="w-3.5 h-3.5" /> 一键删除生成用户
        </button>
        <span className="text-xs text-kx-muted whitespace-nowrap ml-auto">共 {total} 人</span>
      </div>
      {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data ? <InlineLoading /> : (
        <>
          {/* Desktop table */}
          <div className="kx-card p-0 overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-kx-muted bg-kx-soft/60">
                <tr>
                  <th className="px-4 py-2 font-semibold">用户</th>
                  <th className="px-3 py-2 font-semibold">角色</th>
                  <th className="px-3 py-2 font-semibold text-right">粉丝</th>
                  <th className="px-3 py-2 font-semibold text-right">帖子</th>
                  <th className="px-3 py-2 font-semibold">注册</th>
                  <th className="px-3 py-2 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={clsx("border-t border-kx-stroke/30 hover:bg-kx-soft/40", u.deleted_at && "bg-kx-danger/5 opacity-70")}>
                    <td className="px-4 py-2.5">
                      <Link href={`/u/${u.handle}`} className="flex items-center gap-2 group min-w-0">
                        <Avatar user={u} size={32} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate inline-flex items-center gap-1 group-hover:underline">
                            {u.display_name}
                            {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                            {u.deleted_at ? <span className="rounded-full bg-kx-danger/10 px-2 py-0.5 text-[11px] font-bold text-kx-danger">已封禁</span> : null}
                          </div>
                          <div className="text-xs text-kx-muted truncate">
                            @{u.handle}
                            {u.isSeed ? <span className="ml-1 rounded bg-kx-soft px-1 text-[10px] text-kx-subtle">生成</span> : null}
                          </div>
                          <div className="text-xs text-kx-muted truncate">
                            {[u.country, u.province, u.city].filter(Boolean).join(" / ") || "未选地区"} · 🔥 {compactNumber(u.total_heat || 0)}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <select className="kx-input h-7 px-2 text-xs"
                              value={u.role || "member"}
                              onChange={(e) => update(u.id, { role: e.target.value })}>
                        <option value="member">member</option>
                        <option value="creator">creator</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <input className="kx-input h-7 w-16 px-1.5 text-right text-xs tabular-nums"
                               type="number" min={0}
                               value={followerDraft[u.id] ?? String(u.follower_count || 0)}
                               onChange={(e) => setFollowerDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                               onKeyDown={(e) => { if (e.key === "Enter") setFollowers(u.id); }} />
                        <button className="kx-button-ghost h-7 px-2 text-xs disabled:opacity-40"
                                disabled={followerBusy === u.id || (followerDraft[u.id] ?? String(u.follower_count || 0)) === String(u.follower_count || 0)}
                                onClick={() => setFollowers(u.id)}>
                          {followerBusy === u.id ? "…" : "设为"}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{compactNumber(u.post_count || 0)}</td>
                    <td className="px-3 py-2.5 text-xs text-kx-muted whitespace-nowrap">{u.joined_at ? fullDateTime(u.joined_at).split(" ")[0] : ""}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          className="kx-button-ghost h-8 px-3 text-xs"
                          onClick={() => setManageUser(u)}
                          title="修改邮箱 / 密码、删除账号"
                        >
                          <Pencil className="w-3.5 h-3.5" /> 管理
                        </button>
                        <button
                          className={clsx("kx-button-ghost h-8 px-3 text-xs", u.is_verified && "bg-kx-accentSoft text-kx-accent")}
                          onClick={() => update(u.id, { is_verified: !u.is_verified })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {u.is_verified ? "已认证" : "认证"}
                        </button>
                        <button
                          className={clsx("kx-button-ghost h-8 px-3 text-xs", u.merchant_verified && "bg-kx-accentSoft text-kx-accent")}
                          onClick={() => update(u.id, { is_merchant: true, merchant_verified: !u.merchant_verified })}
                        >
                          商家{u.merchant_verified ? "已认证" : "认证"}
                        </button>
                        <button
                          className={clsx("kx-button-ghost h-8 px-3 text-xs", u.is_verified_member && "bg-kx-verified/15 text-kx-verified")}
                          onClick={() => grantMembership(u.id)}
                          title={u.verified_member_until ? `有效期至 ${u.verified_member_until.slice(0, 10)}` : undefined}
                        >
                          会员{u.is_verified_member ? "+1月" : "开通"}
                        </button>
                        {u.deleted_at ? (
                          <button className="kx-button-ghost h-8 px-3 text-xs text-emerald-700" onClick={() => restore(u.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> 解封
                          </button>
                        ) : (
                          <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingBan(u.id)}>
                            <Ban className="w-3.5 h-3.5" /> 封禁
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-kx-muted">没有匹配的用户</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <ul className="md:hidden space-y-2">
            {users.map((u) => (
              <li key={u.id} className={clsx("kx-card", u.deleted_at && "border-kx-danger/20 bg-kx-danger/5 opacity-80")}>
                <div className="flex items-start gap-2.5">
                  <Avatar user={u} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${u.handle}`} className="font-semibold inline-flex items-center gap-1 hover:underline">
                      {u.display_name}
                      {showOfficialBadge(u) ? <OfficialBadge /> : showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                      {u.deleted_at ? <span className="rounded-full bg-kx-danger/10 px-2 py-0.5 text-[11px] font-bold text-kx-danger">已封禁</span> : null}
                    </Link>
                    <div className="text-xs text-kx-muted">@{u.handle}</div>
                    <div className="text-xs text-kx-muted mt-1 flex gap-3">
                      <span>{compactNumber(u.follower_count || 0)} 粉丝</span>
                      <span>{compactNumber(u.post_count || 0)} 帖</span>
                      <span>{u.joined_at ? fullDateTime(u.joined_at).split(" ")[0] : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-xs text-kx-muted">粉丝</span>
                  <input className="kx-input h-7 w-20 px-1.5 text-xs tabular-nums" type="number" min={0}
                         value={followerDraft[u.id] ?? String(u.follower_count || 0)}
                         onChange={(e) => setFollowerDraft((d) => ({ ...d, [u.id]: e.target.value }))} />
                  <button className="kx-button-ghost h-7 px-2 text-xs disabled:opacity-40"
                          disabled={followerBusy === u.id || (followerDraft[u.id] ?? String(u.follower_count || 0)) === String(u.follower_count || 0)}
                          onClick={() => setFollowers(u.id)}>{followerBusy === u.id ? "…" : "设为"}</button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select className="kx-input h-8 px-2 text-xs flex-1 min-w-[7rem]"
                          value={u.role || "member"}
                          onChange={(e) => update(u.id, { role: e.target.value })}>
                    <option value="member">member</option>
                    <option value="creator">creator</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    className="kx-button-ghost h-8 px-3 text-xs"
                    onClick={() => setManageUser(u)}
                  >
                    <Pencil className="w-3.5 h-3.5" /> 管理
                  </button>
                  <button
                    className={clsx("kx-button-ghost h-8 px-3 text-xs", u.is_verified && "bg-kx-accentSoft text-kx-accent")}
                    onClick={() => update(u.id, { is_verified: !u.is_verified })}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {u.is_verified ? "已认证" : "认证"}
                  </button>
                  <button
                    className={clsx("kx-button-ghost h-8 px-3 text-xs", u.is_verified_member && "bg-kx-verified/15 text-kx-verified")}
                    onClick={() => grantMembership(u.id)}
                    title={u.verified_member_until ? `有效期至 ${u.verified_member_until.slice(0, 10)}` : undefined}
                  >
                    会员{u.is_verified_member ? "+1月" : "开通"}
                  </button>
                  {u.deleted_at ? (
                    <button className="kx-button-ghost h-8 px-3 text-xs text-emerald-700" onClick={() => restore(u.id)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> 解封
                    </button>
                  ) : (
                    <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingBan(u.id)}>
                      <Ban className="w-3.5 h-3.5" /> 封禁
                    </button>
                  )}
                </div>
              </li>
            ))}
            {users.length === 0 ? <li className="text-center text-kx-muted py-8">没有匹配的用户</li> : null}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 py-2 text-sm">
              <button className="kx-button-ghost h-8 px-3 disabled:opacity-40" disabled={page <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}>上一页</button>
              <span className="text-kx-muted">第 {page + 1} / {totalPages} 页 · 共 {total} 人</span>
              <button className="kx-button-ghost h-8 px-3 disabled:opacity-40" disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}>下一页</button>
            </div>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={!!pendingBan}
        title="封禁这个用户？"
        description="账号将被软删除，所有 session 立即失效。用户的内容仍保留，可后续恢复。"
        destructive
        confirmLabel="确认封禁"
        onConfirm={() => pendingBan && suspend(pendingBan)}
        onCancel={() => setPendingBan(null)}
      />
      <ConfirmDialog
        open={pendingClearSeed}
        title={`删除全部生成用户（${seedTotal} 个）？`}
        description="只删除由「城市内容包」生成的用户账号（带标记），不会动任何真实用户。被删用户名下的房源会归还回退账号、其生成的帖子会被回收。可随时在城市内容助手重新导入。"
        destructive confirmLabel="确认删除" onConfirm={clearGenerated} onCancel={() => setPendingClearSeed(false)}
      />
      <UserManageDialog
        user={manageUser}
        onClose={() => setManageUser(null)}
        onSaveEmail={saveEmail}
        onSaveOfficial={saveOfficial}
        onSetPassword={setUserPassword}
        onSaveTags={(id, customTags) => update(id, { custom_tags: customTags })}
        onErase={(u) => setPendingErase(u)}
      />
      <ConfirmDialog
        open={!!pendingErase}
        title={pendingErase ? `永久删除 @${pendingErase.handle}？` : "永久删除账号？"}
        description="将清除该用户的资料、邮箱和密码，释放其用户名，隐藏其全部帖子与评论，并退出所有登录会话。与“封禁”不同，此操作不可恢复。"
        destructive
        confirmLabel="永久删除"
        onConfirm={() => pendingErase && erase(pendingErase)}
        onCancel={() => setPendingErase(null)}
      />
    </div>
  );
}

function UserManageDialog({
  user,
  onClose,
  onSaveEmail,
  onSaveOfficial,
  onSetPassword,
  onSaveTags,
  onErase,
}: {
  user: KXUser | null;
  onClose: () => void;
  onSaveEmail: (id: string, email: string) => Promise<boolean>;
  onSaveOfficial: (id: string, patch: { is_official: boolean; official_role: string }) => Promise<boolean>;
  onSetPassword: (id: string, password: string) => Promise<boolean>;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onErase: (user: KXUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [tags, setTags] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [official, setOfficial] = useState(false);
  const [officialRole, setOfficialRole] = useState("");
  const [savingOfficial, setSavingOfficial] = useState(false);

  useEffect(() => {
    setEmail(user?.email || "");
    setPassword("");
    setShowPw(false);
    setTags((user?.custom_tags || []).join("、"));
    setOfficial(!!(user && (user.role === "admin" || user.is_official)));
    setOfficialRole(user?.official_role || (user?.role === "admin" ? "admin" : "official"));
  }, [user]);

  if (!user) return null;
  const id = user.id;
  const emailDirty = email.trim().toLowerCase() !== (user.email || "").trim().toLowerCase();
  const pwValid = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const effectiveOfficial = user.role === "admin" || !!user.is_official;
  const officialDirty = official !== effectiveOfficial || officialRole.trim() !== (user.official_role || (user.role === "admin" ? "admin" : "official"));

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    await onSaveEmail(id, email.trim());
    setSavingEmail(false);
  };
  const handleSetPassword = async () => {
    setSavingPw(true);
    const ok = await onSetPassword(id, password);
    setSavingPw(false);
    if (ok) setPassword("");
  };
  const handleSaveOfficial = async () => {
    setSavingOfficial(true);
    await onSaveOfficial(id, { is_official: official, official_role: official ? (officialRole.trim() || "official") : "" });
    setSavingOfficial(false);
  };

  return (
    <Dialog open={!!user} onClose={onClose} title={`管理用户 @${user.handle}`} maxWidth="30rem">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar user={user} size={44} />
          <div className="min-w-0">
            <div className="font-bold truncate">{user.display_name}</div>
            <div className="text-xs text-kx-muted truncate">@{user.handle} · {user.role || "member"}</div>
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-kx-muted">
            <Mail className="h-3.5 w-3.5" /> 邮箱
          </label>
          <div className="flex gap-2">
            <input
              className="kx-input h-10 flex-1"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <button
              className="kx-button-primary h-10 px-4 text-sm disabled:opacity-50"
              disabled={savingEmail || !emailDirty}
              onClick={handleSaveEmail}
            >
              保存
            </button>
          </div>
          <p className="text-[11px] text-kx-muted">修改后将标记为已验证；留空可清除该用户邮箱。</p>
        </div>

        {/* Official badge — production-visible Machi Official label. */}
        <div className="space-y-2 rounded-kx-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> 官方标识
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold dark:bg-white/5">
            <span>
              显示 Machi 官方标签
              {user.role === "admin" ? <span className="ml-2 text-[11px] text-kx-muted">管理员默认拥有</span> : null}
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={official}
              disabled={user.role === "admin"}
              onChange={(e) => setOfficial(e.target.checked)}
            />
          </label>
          <div className="flex gap-2">
            <input
              className="kx-input h-10 flex-1"
              value={officialRole}
              onChange={(e) => setOfficialRole(e.target.value)}
              placeholder="official / support / editorial / admin"
              disabled={!official}
            />
            <button
              className="kx-button-primary h-10 px-4 text-sm disabled:opacity-50"
              disabled={savingOfficial || !officialDirty}
              onClick={handleSaveOfficial}
            >
              保存
            </button>
          </div>
          <p className="text-[11px] leading-5 text-kx-muted">官方标识会在生产环境的个人主页、Feed、搜索、私信和 iOS 端显示；仅管理员可颁发。</p>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-kx-muted">
            <KeyRound className="h-3.5 w-3.5" /> 重置密码
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="kx-input h-10 w-full pr-10"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位，含字母和数字"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-kx-muted hover:bg-kx-soft hover:text-kx-text"
                aria-label={showPw ? "隐藏密码" : "显示密码"}
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              className="kx-button-primary h-10 px-4 text-sm disabled:opacity-50"
              disabled={savingPw || !pwValid}
              onClick={handleSetPassword}
            >
              设置
            </button>
          </div>
          <p className="text-[11px] text-kx-muted">设置后该用户全部登录会话立即失效，需用新密码重新登录。</p>
        </div>

        {/* Custom tags — bordered chips on the user's profile (优质房东 / 资深卖家…). */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-kx-muted">
            <BadgeCheck className="h-3.5 w-3.5" /> 用户标签
          </label>
          <div className="flex gap-2">
            <input
              className="kx-input h-10 flex-1"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如：优质房东、资深卖家（顿号或逗号分隔，最多 6 个）"
            />
            <button
              className="kx-button-primary h-10 px-4 text-sm disabled:opacity-50"
              disabled={savingTags}
              onClick={async () => {
                setSavingTags(true);
                const list = tags.split(/[、,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
                await onSaveTags(id, list);
                setSavingTags(false);
              }}
            >
              保存
            </button>
          </div>
          <p className="text-[11px] text-kx-muted">标签会以描边胶囊展示在该用户主页（如认证、达人身份）。留空可清除。</p>
        </div>

        {/* Danger zone */}
        <div className="rounded-kx-lg border border-kx-danger/30 bg-kx-danger/5 p-3">
          <div className="text-sm font-bold text-kx-danger">永久删除账号</div>
          <p className="mt-1 text-[11px] leading-5 text-kx-subtle">
            清除资料、邮箱与密码，释放用户名，隐藏其全部内容。与“封禁”不同，删除不可恢复。
          </p>
          <button
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-kx-danger/40 px-3 py-1.5 text-xs font-bold text-kx-danger transition hover:bg-kx-danger/10"
            onClick={() => onErase(user)}
          >
            <Trash2 className="h-3.5 w-3.5" /> 永久删除
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function PostsPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [status, setStatus] = useState("");
  const [contentType, setContentType] = useState<ContentType | "">("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin-posts", dq, status, contentType],
    queryFn: () => api.adminPosts(dq || undefined, {
      status: status || undefined,
      content_type: contentType || undefined,
    }),
  });

  const updatePost = async (id: string, patch: Parameters<typeof api.adminUpdatePost>[1]) => {
    try {
      await api.adminUpdatePost(id, patch);
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      pushToast({ kind: "success", message: "已更新" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const del = async (id: string) => {
    try {
      await api.adminDeletePost(id);
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      pushToast({ kind: "success", message: "已删除" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  return (
    <div className="space-y-3">
      <div className="kx-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-kx-muted" />
        <input className="kx-input h-9" placeholder="搜帖子内容" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="kx-input h-9 max-w-[9rem]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="published">published</option>
          <option value="active">active</option>
          <option value="under_review">under_review</option>
          <option value="hidden">hidden</option>
          <option value="deleted">deleted</option>
        </select>
        <select className="kx-input h-9 max-w-[9rem]" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | "")}>
          <option value="">全部类型</option>
          {CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>{CONTENT_TYPE_LABELS[type]}</option>
          ))}
        </select>
      </div>
      {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data ? <InlineLoading /> : (
        <ul className="space-y-2">
          {list.data.map((p) => (
            <li key={p.id} className={clsx("kx-card", p.deleted_at && "opacity-60")}>
              <div className="flex items-start gap-2.5">
                <Avatar user={p.author || undefined} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold inline-flex items-center gap-1">
                    {p.author?.display_name || "用户"}
                    {showOfficialBadge(p.author) ? <OfficialBadge /> : showVerifiedBadge(p.author) ? <VerifiedBadge /> : null}
                    <span className="text-xs text-kx-muted ml-1">@{p.author?.handle} · {relativeTime(p.created_at)}</span>
                    {p.deleted_at ? <span className="text-xs text-kx-danger ml-1">[已删除]</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-kx-soft font-semibold">{p.status || "published"}</span>
                    <span className="px-2 py-0.5 rounded-full bg-kx-accentSoft text-kx-accent font-semibold">{CONTENT_TYPE_LABELS[p.content_type || "dynamic"]}</span>
                    {[p.country, p.province, p.city].filter(Boolean).join(" / ") ? (
                      <span className="px-2 py-0.5 rounded-full bg-kx-soft text-kx-muted">{[p.country, p.province, p.city].filter(Boolean).join(" / ")}</span>
                    ) : null}
                    {p.report_count ? <span className="px-2 py-0.5 rounded-full bg-kx-danger/10 text-kx-danger">举报 {p.report_count}</span> : null}
                    {p.is_boosted ? <span className="px-2 py-0.5 rounded-full bg-kx-heat/10 text-kx-heat">Boost +{p.boost_weight || 0}</span> : null}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words line-clamp-4">{p.content}</p>
                  <div className="text-xs text-kx-muted mt-1.5 flex gap-3">
                    <span>♥ {compactNumber(p.like_count)}</span>
                    <span>↻ {compactNumber(p.repost_count)}</span>
                    <span>💬 {compactNumber(p.comment_count)}</span>
                    <span>🔥 {compactNumber(p.heat_score)}</span>
                    <Link className="kx-link" href={`/p/${p.id}`}>查看</Link>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <select
                    className="kx-input h-8 px-2 text-xs"
                    value={p.status || "published"}
                    onChange={(e) => updatePost(p.id, { status: e.target.value })}
                  >
                    <option value="published">published</option>
                    <option value="active">active</option>
                    <option value="under_review">under_review</option>
                    <option value="hidden">hidden</option>
                    <option value="deleted">deleted</option>
                  </select>
                  <button
                    className={clsx("kx-button-ghost h-8 px-3 text-xs", p.is_boosted && "bg-kx-heat/10 text-kx-heat")}
                    onClick={() => updatePost(p.id, {
                      is_boosted: !p.is_boosted,
                      boost_weight: p.is_boosted ? 0 : 50,
                      boosted_until: p.is_boosted ? "" : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
                    })}
                  >
                    {p.is_boosted ? "取消加热" : "加热24h"}
                  </button>
                  {!p.deleted_at ? (
                    <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingDelete(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
          {list.data.length === 0 ? <li className="text-center text-kx-muted py-8">没有结果</li> : null}
        </ul>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这条帖子？"
        description="软删除，可在数据库直接恢复。其他用户的引用转发会继续显示原作者。"
        destructive
        confirmLabel="删除"
        onConfirm={() => pendingDelete && del(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ReportsPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const list = useQuery({ queryKey: ["admin-reports"], queryFn: () => api.adminReports() });
  const resolve = async (id: string) => {
    try {
      await api.adminResolveReport(id);
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      pushToast({ kind: "success", message: "已忽略" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };
  if (list.isError) return <ErrorState onRetry={() => list.refetch()} />;
  if (!list.data) return <InlineLoading />;
  if (list.data.length === 0) return <div className="kx-card text-center py-10 text-kx-subtle">暂无待处理举报</div>;
  return (
    <ul className="space-y-2">
      {list.data.map((r) => (
        <li key={r.id} className="kx-card">
          <div className="flex items-start gap-3">
            <Flag className="w-4 h-4 text-kx-danger mt-1" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <strong>{r.reporter?.display_name || "匿名"}</strong>
                <span className="text-kx-muted"> 举报了 {r.target_kind} </span>
                <span className="font-mono text-xs text-kx-muted">{r.target_id.slice(0, 8)}</span>
                <span className="text-kx-muted"> · 原因：</span>
                <span className="font-semibold">{r.reason}</span>
              </div>
              {r.note ? <p className="text-xs text-kx-subtle mt-1">{r.note}</p> : null}
              {r.preview?.content ? (
                <div className="mt-2 p-2.5 rounded-kx-md bg-kx-soft text-sm">
                  {r.preview.author ? (
                    <div className="text-xs text-kx-muted mb-1">@{r.preview.author.handle}</div>
                  ) : null}
                  <p className="line-clamp-3 whitespace-pre-wrap">{r.preview.content}</p>
                </div>
              ) : null}
              <div className="text-xs text-kx-muted mt-2">{fullDateTime(r.created_at)}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {r.target_kind === "post" ? (
                <Link href={`/p/${r.target_id}`} className="kx-button-ghost h-8 px-3 text-xs">查看</Link>
              ) : null}
              {r.target_kind === "user" && r.preview?.author?.handle ? (
                <Link href={`/u/${r.preview.author.handle}`} className="kx-button-ghost h-8 px-3 text-xs">查看</Link>
              ) : null}
              <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => resolve(r.id)}>忽略</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FeedbackPanel() {
  const list = useQuery({ queryKey: ["admin-feedback"], queryFn: () => api.adminFeedback() });
  if (list.isError) return <ErrorState onRetry={() => list.refetch()} />;
  if (!list.data) return <InlineLoading />;
  if (list.data.length === 0) return <div className="kx-card text-center py-10 text-kx-subtle">暂无反馈</div>;
  return (
    <ul className="space-y-2">
      {list.data.map((f) => (
        <li key={f.id} className="kx-card">
          <div className="flex items-start gap-2">
            <MessageCircle className="w-4 h-4 text-kx-accent mt-1" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-semibold">{f.user?.display_name || "匿名"}</span>
                <span className="text-kx-muted"> · {f.category}</span>
                <span className="text-xs text-kx-muted ml-2">{fullDateTime(f.created_at)}</span>
              </div>
              <p className="text-sm text-kx-text mt-1 whitespace-pre-wrap break-words">{f.content}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VisitorsPanel() {
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [days, setDays] = useState(7);
  const list = useQuery({
    queryKey: ["admin-visitors", dq, days],
    queryFn: () => api.adminVisitors({ q: dq || undefined, days, limit: 300 }),
    refetchInterval: 30000,
  });
  const region = (v: { country: string; region: string; city: string }) =>
    zhGeoParts(v).join(" / ");

  return (
    <div className="space-y-3">
      <div className="kx-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-kx-muted" />
        <input className="kx-input h-9" placeholder="搜 IP / 国家 / 地区 / 城市 / 路径" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="kx-input h-9 px-2 text-sm w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>近 1 天</option>
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
        </select>
      </div>
      {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data ? <InlineLoading /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="kx-card animate-kx-fade-in">
              <div className="text-xs text-kx-subtle">访问次数</div>
              <div className="text-2xl font-bold mt-1">{compactNumber(list.data.summary.total)}</div>
              <div className="text-xs text-kx-muted mt-1">近 {list.data.summary.days} 天</div>
            </div>
            <div className="kx-card animate-kx-fade-in">
              <div className="text-xs text-kx-subtle">独立访客</div>
              <div className="text-2xl font-bold mt-1">{compactNumber(list.data.summary.unique_visitors)}</div>
              <div className="text-xs text-kx-muted mt-1">按 IP 去重（哈希）</div>
            </div>
            <div className="kx-card animate-kx-fade-in">
              <div className="text-xs text-kx-subtle">登录用户</div>
              <div className="text-2xl font-bold mt-1">{compactNumber(list.data.summary.logged_in_users)}</div>
              <div className="text-xs text-kx-muted mt-1">已登录会话</div>
            </div>
            <div className="kx-card animate-kx-fade-in">
              <div className="text-xs text-kx-subtle">地理解析</div>
              <div className="text-2xl font-bold mt-1">{list.data.summary.geoip === "none" ? "未启用" : list.data.summary.geoip}</div>
              <div className="text-xs text-kx-muted mt-1">KAIX_GEOIP_TRANSPORT</div>
            </div>
          </div>

          {list.data.summary.top_countries.length > 0 ? (
            <div className="kx-card">
              <h3 className="kx-section-title mb-2 px-0 inline-flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> 来源地区
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {list.data.summary.top_countries.map((c) => (
                  <span key={c.country} className="px-2 py-1 rounded-full bg-kx-soft text-xs">
                    {zhGeoName(c.country)} · {compactNumber(c.count)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Desktop table */}
          <div className="kx-card p-0 overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-kx-muted bg-kx-soft/60">
                <tr>
                  <th className="px-4 py-2 font-semibold">时间</th>
                  <th className="px-3 py-2 font-semibold">IP</th>
                  <th className="px-3 py-2 font-semibold">地区</th>
                  <th className="px-3 py-2 font-semibold">请求</th>
                  <th className="px-3 py-2 font-semibold text-right">状态</th>
                  <th className="px-3 py-2 font-semibold">访客</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((v) => (
                  <tr key={v.id} className="border-t border-kx-stroke/30 hover:bg-kx-soft/40">
                    <td className="px-4 py-2.5 text-xs text-kx-muted whitespace-nowrap" title={fullDateTime(v.created_at)}>{relativeTime(v.created_at)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{v.ip || "—"}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {region(v) || <span className="text-kx-muted">—</span>}
                      {v.org ? <div className="text-kx-muted truncate max-w-[14rem]">{v.org}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className="text-kx-muted">{v.method}</span> <span className="font-mono break-all">{v.path}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      <span className={clsx("font-semibold", v.status >= 500 ? "text-kx-danger" : v.status >= 400 ? "text-amber-600" : "text-emerald-600")}>{v.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {v.user_id
                        ? <span className="inline-flex items-center gap-1 text-kx-accent"><CheckCircle2 className="w-3.5 h-3.5" /> 已登录</span>
                        : <span className="text-kx-muted">访客</span>}
                    </td>
                  </tr>
                ))}
                {list.data.items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-kx-muted">暂无访问记录</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <ul className="md:hidden space-y-2">
            {list.data.items.map((v) => (
              <li key={v.id} className="kx-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{v.ip || "—"}</span>
                  <span className={clsx("text-xs font-semibold tabular-nums", v.status >= 500 ? "text-kx-danger" : v.status >= 400 ? "text-amber-600" : "text-emerald-600")}>{v.status}</span>
                </div>
                <div className="text-xs text-kx-muted mt-1">{region(v) || "—"}</div>
                <div className="text-xs mt-1"><span className="text-kx-muted">{v.method}</span> <span className="font-mono break-all">{v.path}</span></div>
                <div className="text-xs text-kx-muted mt-1 flex items-center gap-2">
                  <span title={fullDateTime(v.created_at)}>{relativeTime(v.created_at)}</span>
                  {v.user_id ? <span className="inline-flex items-center gap-1 text-kx-accent"><CheckCircle2 className="w-3 h-3" /> 已登录</span> : <span>访客</span>}
                </div>
              </li>
            ))}
            {list.data.items.length === 0 ? <li className="text-center text-kx-muted py-8">暂无访问记录</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}

const GEO_ZH: Record<string, string> = {
  japan: "日本",
  "united states": "美国",
  netherlands: "荷兰",
  "united kingdom": "英国",
  taiwan: "中国台湾",
  "south korea": "韩国",
  "hong kong": "中国香港",
  china: "中国",
  canada: "加拿大",
  australia: "澳大利亚",
  germany: "德国",
  france: "法国",
  singapore: "新加坡",
  thailand: "泰国",
  vietnam: "越南",
  philippines: "菲律宾",
  malaysia: "马来西亚",
  indonesia: "印度尼西亚",
  india: "印度",
  brazil: "巴西",
  russia: "俄罗斯",
  tokyo: "东京",
  osaka: "大阪",
  kyoto: "京都",
  kanagawa: "神奈川",
  saitama: "埼玉",
  chiba: "千叶",
  katushika: "葛饰区",
  katsushika: "葛饰区",
  shinjuku: "新宿区",
  shibuya: "涩谷区",
  toshima: "丰岛区",
  minato: "港区",
  setagaya: "世田谷区",
  flevoland: "弗莱福兰省",
  dronten: "德龙滕",
};

function zhGeoName(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return GEO_ZH[raw.toLowerCase()] || raw;
}

function zhGeoParts(v: { country: string; region: string; city: string }) {
  return [
    zhGeoName(v.country),
    zhGeoName(v.region),
    zhGeoName(v.city),
  ].filter(Boolean);
}

function SiteCopyPanel() {
  return (
    <div className="space-y-3">
      <MasterCopyEditorCard />
    </div>
  );
}

const SEED_LANG_OPTIONS = [
  { value: "zh", label: "中文" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" },
];
// 现役 5 类（全部有信息量）+ 综合。旧的 12 类已退役（老帖照常显示，不再生成）。
const SEED_TYPE_OPTIONS = [
  { value: "spotlight", label: "精选攻略 ⭐" },
  { value: "qa", label: "新人真问" },
  { value: "pitfall", label: "亲测避坑 ⚠️" },
  { value: "checklist", label: "实用清单" },
  { value: "experience", label: "经验分享" },
  { value: "mixed", label: "综合分布（推荐）" },
];
// 语气 = 6 个「角度」，每个都真正改变 AI 产出（旧语气是死代码，已重做）。
const SEED_TONE_OPTIONS = [
  { value: "practical", label: "实用清单" },
  { value: "pitfall", label: "亲测避坑" },
  { value: "deep", label: "深度攻略" },
  { value: "compare", label: "对比测评" },
  { value: "newbie", label: "新手必看" },
  { value: "thrifty", label: "省钱攻略" },
];
// 城市发布模式。
const SEED_REGION_MODES = [
  { value: "single", label: "指定城市", icon: MapPin },
  { value: "random", label: "随机一城", icon: Dice5 },
  { value: "spread", label: "多城铺开", icon: Layers },
] as const;
const JP_PREFECTURES = provincesFor("jp");
const SEED_ENGINE_OPTIONS = [
  { value: "auto", label: "自动（优先 AI · 回退离线）" },
  { value: "engine_a", label: "AI 引擎 A" },
  { value: "engine_b", label: "AI 引擎 B" },
  { value: "offline", label: "离线模板库" },
];
// AI generation modes (fallback if the server list isn't loaded yet).
const SEED_MODEL_OPTIONS = [
  { id: "fast", label: "标准（快速）" },
  { id: "think", label: "深度思考" },
  { id: "pro", label: "Pro（更强）" },
];
// City Content Pack (城市精选内容包) — premium curated listings.
const PACK_CITY_OPTIONS = [
  { value: "tokyo", label: "东京" }, { value: "osaka", label: "大阪" },
  { value: "yokohama", label: "横滨" }, { value: "kyoto", label: "京都" },
];
const PACK_TYPE_LABEL: Record<string, string> = {
  secondhand: "二手", rental: "租房", local_service: "商家/民宿", job: "招聘", hiring: "招聘",
};

function seedStatusPill(status: string) {
  const map: Record<string, string> = {
    draft: "bg-amber-500/10 text-amber-700",
    published: "bg-emerald-500/10 text-emerald-700",
    cleared: "bg-kx-soft text-kx-muted",
  };
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", map[status] || "bg-kx-soft text-kx-muted")}>{status}</span>;
}

function SeedBotPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [form, setForm] = useState({
    regionCode: "jp.tokyo.tokyo", language: "zh", contentType: "spotlight", count: 20, tone: "practical", publishNow: true, engine: "auto", model: "think",
    regionMode: "single" as "single" | "random" | "spread", spreadCities: 8, spreadCircles: [] as string[],
  });
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [pendingClear, setPendingClear] = useState<string | null>(null);
  const [cityForm, setCityForm] = useState({ regionCode: "", language: "", contentType: "" });
  const [pendingCityClear, setPendingCityClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [macroBusy, setMacroBusy] = useState(false);
  const [packCities, setPackCities] = useState<string[]>(["tokyo", "osaka", "yokohama", "kyoto"]);
  const [packBusy, setPackBusy] = useState(false);
  const [pendingPackClear, setPendingPackClear] = useState(false);
  const [usersBusy, setUsersBusy] = useState(false);
  const [pendingUsersClear, setPendingUsersClear] = useState(false);

  const batches = useQuery({ queryKey: ["admin-seed-batches"], queryFn: () => api.adminSeedBatches({ limit: 50 }) });
  const logs = useQuery({ queryKey: ["admin-seed-logs"], queryFn: () => api.adminSeedLogs(30) });
  const detail = useQuery({
    queryKey: ["admin-seed-batch", selectedBatchId],
    queryFn: () => api.adminSeedBatch(selectedBatchId as string),
    enabled: !!selectedBatchId,
  });
  const engines = useQuery({ queryKey: ["admin-seed-engines"], queryFn: () => api.adminSeedEngines() });
  const packPreview = useQuery({
    queryKey: ["admin-content-pack", packCities.join(",")],
    queryFn: () => api.adminContentPackPreview(packCities),
  });
  const usersPreview = useQuery({
    queryKey: ["admin-content-pack-users"],
    queryFn: () => api.adminContentPackUsersPreview(),
  });
  const engagement = useQuery({ queryKey: ["admin-engagement"], queryFn: () => api.adminEngagementStatus() });
  const [engForm, setEngForm] = useState<Record<string, string>>({});
  const [engBusy, setEngBusy] = useState(false);
  const engVal = (k: string) => engForm[k] ?? engagement.data?.settings?.[k] ?? "";
  const setEng = (k: string, v: string) => setEngForm((f) => ({ ...f, [k]: v }));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-seed-batches"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-seed-logs"] });
    if (selectedBatchId) await queryClient.invalidateQueries({ queryKey: ["admin-seed-batch", selectedBatchId] });
  };

  // Explicit city codes for 多城铺开 when the operator hand-picks 都市圈;
  // empty => the server randomly samples `spreadCities` cities instead.
  const spreadRegionCodes = () =>
    Array.from(new Set(form.spreadCircles.flatMap((c) => regionsForMetroCircle(c).map((r) => r.region_code))));

  // Build the shared region part of a generate / macro payload.
  const regionPayload = () => {
    const p: {
      regionMode: "single" | "random" | "spread"; regionCode?: string; regionCodes?: string[]; spreadCities?: number;
    } = { regionMode: form.regionMode };
    if (form.regionMode === "single") {
      p.regionCode = form.regionCode;
    } else if (form.regionMode === "spread") {
      const codes = spreadRegionCodes();
      if (codes.length) p.regionCodes = codes; else p.spreadCities = form.spreadCities;
    }
    return p;
  };

  const engModeLabel = (engine?: string, model?: string) => {
    const engineLabel = engine === "offline" ? "离线模板"
      : (SEED_ENGINE_OPTIONS.find((o) => o.value === engine)?.label || engine || form.engine);
    const modeLabel = model ? (SEED_MODEL_OPTIONS.find((m) => m.id === model)?.label || model) : "";
    return `引擎 ${engineLabel}${modeLabel ? " · " + modeLabel : ""}`;
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.adminSeedGenerate({
        ...regionPayload(), language: form.language, contentType: form.contentType,
        count: form.count, tone: form.tone, publishNow: form.publishNow, engine: form.engine, model: form.model,
      });
      const firstBatch = r.batch?.id || r.cities?.[0]?.batch_id || r.batches?.[0]?.id || null;
      if (firstBatch) setSelectedBatchId(firstBatch);
      await refresh();
      const where = r.mode === "spread"
        ? `${r.cities?.length || 0} 城铺开`
        : (r.city_name || form.regionCode);
      pushToast({ kind: "success", message: `已生成 ${r.created} 条 · ${where} · ${engModeLabel(r.engine, r.model)}（请求 ${r.requested}${r.created < r.requested ? "，去重后库存不足" : ""}）` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally { setBusy(false); }
  };

  // 一键铺城: personas -> spotlight drafts -> follower curve -> engagement.
  // Always draft-first so the operator reviews before the region goes live.
  const seedCity = async () => {
    setMacroBusy(true);
    try {
      const r = await api.adminSeedCityMacro({
        ...regionPayload(), language: form.language, contentType: form.contentType,
        count: form.count, tone: form.tone, engine: form.engine, model: form.model, publishNow: false,
      });
      const firstBatch = r.cities?.[0]?.batch_id || r.batches?.[0]?.id || null;
      if (firstBatch) setSelectedBatchId(firstBatch);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["admin-content-pack-users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-engagement"] });
      const e = r.engagement || {};
      pushToast({ kind: "success", message: `铺城完成 · ${r.cities.length} 城 · 草稿 ${r.created} 帖 · 新增用户 ${r.personas_imported} · 粉丝 +${r.followers_granted} · 互动 赞${e.likes || 0}/评${e.comments || 0}/关${e.follows || 0}（审阅后发布）` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally { setMacroBusy(false); }
  };

  const importPack = async () => {
    setPackBusy(true);
    try {
      const r = await api.adminContentPackImport(packCities);
      await queryClient.invalidateQueries({ queryKey: ["admin-content-pack"] });
      pushToast({ kind: "success", message: `已导入精选内容：新增 ${r.result.created}、更新 ${r.result.updated}（共 ${r.result.total} 条）` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally { setPackBusy(false); }
  };

  const clearPack = async () => {
    setPendingPackClear(false);
    try {
      const r = await api.adminContentPackClear(packCities);
      await queryClient.invalidateQueries({ queryKey: ["admin-content-pack"] });
      pushToast({ kind: "success", message: `已清除内容包 ${r.cleared} 条（仅内容包，不动真实用户内容）` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const togglePackCity = (v: string) =>
    setPackCities((cur) => (cur.includes(v) ? cur.filter((c) => c !== v) : [...cur, v]));

  const saveEngagement = async () => {
    setEngBusy(true);
    try {
      await api.adminUpdateSiteSettings(engForm as Parameters<typeof api.adminUpdateSiteSettings>[0]);
      await queryClient.invalidateQueries({ queryKey: ["admin-engagement"] });
      pushToast({ kind: "success", message: "互动模拟设置已保存" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
    finally { setEngBusy(false); }
  };
  const runEngagement = async () => {
    setEngBusy(true);
    try {
      const r = await api.adminEngagementRun();
      await queryClient.invalidateQueries({ queryKey: ["admin-engagement"] });
      const x = r.result;
      pushToast({ kind: "success", message: `本轮 +${x.likes} 赞 · +${x.bookmarks} 收藏 · +${x.comments} 评论 · +${x.follows} 关注` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
    finally { setEngBusy(false); }
  };

  const importUsers = async () => {
    setUsersBusy(true);
    try {
      const r = await api.adminContentPackUsersImport();
      await queryClient.invalidateQueries({ queryKey: ["admin-content-pack-users"] });
      pushToast({ kind: "success", message: `已导入城市用户：新增 ${r.result.created}、已存在跳过 ${r.result.skipped}` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally { setUsersBusy(false); }
  };

  const clearUsers = async () => {
    setPendingUsersClear(false);
    try {
      const r = await api.adminContentPackUsersClear();
      await queryClient.invalidateQueries({ queryKey: ["admin-content-pack-users"] });
      pushToast({ kind: "success", message: `已清除城市用户 ${r.cleared} 个（其房源已归还回退账号）` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const publish = async (id: string) => {
    try {
      const r = await api.adminSeedPublish(id);
      await refresh();
      pushToast({ kind: "success", message: `已发布 ${r.published} 条` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const clearBatch = async () => {
    if (!pendingClear) return;
    try {
      const r = await api.adminSeedClear(pendingClear);
      setPendingClear(null);
      await refresh();
      pushToast({ kind: "success", message: `已清除 ${r.cleared} 条 seed 内容` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const clearCity = async () => {
    setPendingCityClear(false);
    try {
      const r = await api.adminSeedClearCity({
        regionCode: cityForm.regionCode,
        language: cityForm.language || undefined,
        contentType: cityForm.contentType || undefined,
      });
      await refresh();
      pushToast({ kind: "success", message: `已清除 ${r.cleared} 条 seed 内容（${r.region_code}）` });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
  };

  const list = batches.data || [];
  const detailItems = detail.data?.items || [];

  return (
    <div className="space-y-3">
      <div className="kx-card border border-kx-accent/20 bg-kx-accentSoft/40">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
          <p className="text-xs leading-5 text-kx-subtle">
            城市内容助手给新城市铺第一层<b>精选</b>底稿：精选攻略（干货长帖）、新人真问、亲测避坑、实用清单、经验分享——五类都有信息量，一看就实用。
            <b>已导入城市用户时，帖子会随机分配到这些用户名下发布（看起来像真实用户）</b>，没有则回退到官方账号；全部标记为 <code className="rounded bg-kx-soft px-1">seed_content</code>。
            最快路径：直接<b>「一键铺城」</b>（用户+草稿+粉丝+互动一步到位，默认进草稿）；或分步小批量生成、逐条预览，最后发布或按批次回滚。清除只影响系统生成内容，<b>永远不会删除真实用户内容</b>。
          </p>
        </div>
      </div>

      <section className="kx-card border border-kx-accent/30 bg-kx-accentSoft/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-base font-bold"><Sparkles className="h-4 w-4 text-kx-accent" /> 城市精选内容包</h2>
          {packPreview.data ? (
            <span className="text-xs text-kx-muted">已导入 {packPreview.data.alreadyImported} 条 · 版本 {packPreview.data.preview.version}</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-kx-muted">
          一键把人工精选的高质量 <b>房源 / 商家 / 二手 / 民宿</b> 内容导入所选城市，专治冷启动。
          幂等可重复导入（同标题只更新不重复）；清除只回收内容包本身，<b>永不删除真实用户内容</b>。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PACK_CITY_OPTIONS.map((c) => {
            const on = packCities.includes(c.value);
            const n = packPreview.data?.preview.by_city?.[c.value];
            return (
              <button key={c.value} type="button" onClick={() => togglePackCity(c.value)}
                className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition",
                  on ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-soft text-kx-muted")}>
                {c.label}{on && typeof n === "number" ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="kx-button-primary h-10 inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            disabled={packBusy || packCities.length === 0} onClick={importPack}>
            <Sparkles className="h-4 w-4" /> {packBusy ? "导入中…" : `导入精选内容${packPreview.data ? `（约 ${packPreview.data.preview.total} 条）` : ""}`}
          </button>
          <button className="kx-button-ghost h-10 px-4 text-kx-danger disabled:opacity-40"
            disabled={packBusy || packCities.length === 0} onClick={() => setPendingPackClear(true)}>
            <Eraser className="h-4 w-4" /> 清除内容包
          </button>
          {packPreview.data && Object.keys(packPreview.data.preview.by_type || {}).length ? (
            <span className="text-xs text-kx-muted">
              {Object.entries(packPreview.data.preview.by_type).map(([k, v]) => `${PACK_TYPE_LABEL[k] || k} ${v}`).join(" · ")}
            </span>
          ) : null}
        </div>
      </section>

      <section className="kx-card border border-kx-accent/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-base font-bold"><Sparkles className="h-4 w-4 text-kx-accent" /> 城市用户（头像账号）</h2>
          {usersPreview.data ? (
            <span className="text-xs text-kx-muted">已导入 {usersPreview.data.alreadyImported} / 共 {usersPreview.data.pack.total} 个</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-kx-muted">
          一键导入 {usersPreview.data?.pack.total ?? "500"}+ 个带头像的城市用户（在日华人画像，照片 + 插画头像混合），让社区与房源更有人气。
          账号<b>无法登录</b>、可随时清除（清除时其房源会自动归还回退账号）。建议<b>先导入用户、再导入房源</b>，房源发布者会自动分散到这些用户。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="kx-button-primary h-10 inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            disabled={usersBusy} onClick={importUsers}>
            <Sparkles className="h-4 w-4" /> {usersBusy ? "导入中…" : `导入城市用户${usersPreview.data ? `（${usersPreview.data.pack.total} 个）` : ""}`}
          </button>
          <button className="kx-button-ghost h-10 px-4 text-kx-danger disabled:opacity-40"
            disabled={usersBusy} onClick={() => setPendingUsersClear(true)}>
            <Eraser className="h-4 w-4" /> 清除城市用户
          </button>
          {usersPreview.data ? (
            <span className="text-xs text-kx-muted">照片头像 {usersPreview.data.pack.photographic} · 插画头像 {usersPreview.data.pack.illustrated}</span>
          ) : null}
        </div>
      </section>

      <section className="kx-card border border-kx-accent/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-base font-bold"><Sparkles className="h-4 w-4 text-kx-accent" /> 互动模拟（点赞 · 收藏 · 评论 · 关注）</h2>
          {engagement.data ? (
            <span className="text-xs text-kx-muted">
              已模拟 赞 {engagement.data.stats.seed_likes} · 收藏 {engagement.data.stats.seed_bookmarks} · 评论 {engagement.data.stats.seed_comments} · 关注 {engagement.data.stats.persona_follows}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-kx-muted">
          让生成的内容在头 N 天内由城市用户<b>逐步</b>点赞 / 收藏 / 评论 / 互关——按时间增长、每个帖子和用户的数量都不一样，看起来真实自然。可在此调参或关闭；后台每隔几分钟自动跑一轮。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={engVal("engagement_sim_enabled") === "1"} onChange={(e) => setEng("engagement_sim_enabled", e.target.checked ? "1" : "0")} /> 启用
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={engVal("engagement_sim_comment_ai") === "1"} onChange={(e) => setEng("engagement_sim_comment_ai", e.target.checked ? "1" : "0")} /> 评论用 AI 生成
          </label>
          {([["engagement_sim_max_days", "增长天数"], ["engagement_sim_like_max", "单帖最高赞"], ["engagement_sim_follow_max", "单人最高粉"], ["engagement_sim_comment_max", "单帖最多评论"], ["seed_post_image_ratio", "配图比例0-1"]] as const).map(([k, lab]) => (
            <label key={k} className="grid gap-0.5 text-[11px] font-semibold text-kx-muted">
              {lab}
              <input className="kx-input h-8 w-24 text-xs" value={engVal(k)} onChange={(e) => setEng(k, e.target.value)} />
            </label>
          ))}
          <button className="kx-button-ghost h-9 px-3 text-xs disabled:opacity-40" disabled={engBusy} onClick={saveEngagement}>保存设置</button>
          <button className="kx-button-primary h-9 px-3 text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40" disabled={engBusy} onClick={runEngagement}>
            <Sparkles className="h-4 w-4" /> {engBusy ? "运行中…" : "立即模拟一轮"}
          </button>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_1fr]">
        <section className="kx-card">
          <h2 className="text-base font-bold">生成城市底稿</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-1 text-xs font-semibold text-kx-muted">
              城市
              <div className="flex gap-1.5">
                {SEED_REGION_MODES.map((m) => {
                  const on = form.regionMode === m.value;
                  return (
                    <button key={m.value} type="button" onClick={() => setForm((f) => ({ ...f, regionMode: m.value }))}
                      className={clsx("flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition",
                        on ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-soft text-kx-muted")}>
                      <m.icon className="h-3.5 w-3.5" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {form.regionMode === "single" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                    都道府县
                    <select className="kx-input h-10" value={form.regionCode.startsWith("jp.") ? form.regionCode.split(".")[1] : ""}
                            onChange={(e) => {
                              const prov = e.target.value;
                              const first = citiesFor("jp", prov)[0]?.code || prov;
                              setForm((f) => ({ ...f, regionCode: composeRegionCode("jp", prov, first) }));
                            }}>
                      {!form.regionCode.startsWith("jp.") ? <option value="">（自定义）</option> : null}
                      {JP_PREFECTURES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                    城市
                    <select className="kx-input h-10" value={form.regionCode.split(".")[2] || ""}
                            disabled={!form.regionCode.startsWith("jp.")}
                            onChange={(e) => {
                              const prov = form.regionCode.split(".")[1];
                              setForm((f) => ({ ...f, regionCode: composeRegionCode("jp", prov, e.target.value) }));
                            }}>
                      {citiesFor("jp", form.regionCode.split(".")[1]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </label>
                </div>
                <input className="kx-input h-9 text-xs" value={form.regionCode}
                       onChange={(e) => setForm((f) => ({ ...f, regionCode: e.target.value.trim() }))}
                       placeholder="高级：直接填 region_code（如 jp.tokyo.tokyo）" />
              </>
            ) : form.regionMode === "random" ? (
              <p className="rounded-lg bg-kx-soft/60 px-3 py-2 text-xs leading-5 text-kx-muted">
                <Dice5 className="mr-1 inline h-3.5 w-3.5" /> 系统从全部 <b>109 个</b>日本城市随机抽一个；生成后 toast 会告诉你抽到了哪座城。
              </p>
            ) : (
              <div className="grid gap-1.5">
                <p className="text-[11px] leading-4 text-kx-subtle">选都市圈＝在这些地区铺开；不选则从全日本随机抽 N 城。数量按城市均分。</p>
                <div className="flex flex-wrap gap-1.5">
                  {JP_METRO_CIRCLES.map((c) => {
                    const on = form.spreadCircles.includes(c.code);
                    return (
                      <button key={c.code} type="button"
                        onClick={() => setForm((f) => ({ ...f, spreadCircles: on ? f.spreadCircles.filter((x) => x !== c.code) : [...f.spreadCircles, c.code] }))}
                        className={clsx("rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                          on ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-soft text-kx-muted")}>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {form.spreadCircles.length === 0 ? (
                  <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                    随机铺开城市数
                    <input className="kx-input h-9" type="number" min={2} max={40} value={form.spreadCities}
                           onChange={(e) => setForm((f) => ({ ...f, spreadCities: Math.max(2, Math.min(40, Number(e.target.value) || 2)) }))} />
                  </label>
                ) : (
                  <span className="text-[11px] text-kx-muted">已选 {form.spreadCircles.length} 个都市圈 · 约 {spreadRegionCodes().length} 城</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                语言
                <select className="kx-input h-10" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  {SEED_LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                语气
                <select className="kx-input h-10" value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}>
                  {SEED_TONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              内容类型
              <select className="kx-input h-10" value={form.contentType} onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value }))}>
                {SEED_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              生成引擎
              <select className="kx-input h-10" value={form.engine} onChange={(e) => setForm((f) => ({ ...f, engine: e.target.value }))}>
                {SEED_ENGINE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {o.value === "engine_a" && engines.data && !engines.data.engine_a ? "（未配置 key）" : ""}
                    {o.value === "engine_b" && engines.data && !engines.data.engine_b ? "（未配置 key）" : ""}
                  </option>
                ))}
              </select>
            </label>
            {engines.data && !engines.data.ready ? (
              <p className="text-[11px] leading-4 text-amber-600">未检测到 AI key，当前走离线模板库。在服务端配置 AI key 后即可启用 AI 生成。</p>
            ) : null}
            {(form.engine === "auto" || form.engine === "engine_a") ? (
              <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                生成模式
                <select className="kx-input h-10" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
                  {(engines.data?.modes?.length ? engines.data.modes : SEED_MODEL_OPTIONS).map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <span className="text-[11px] font-normal text-kx-subtle">深度思考 / Pro 质量更高、稍慢；标准最快。</span>
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              数量（最多 100）
              <input className="kx-input h-10" type="number" min={1} max={100} value={form.count}
                     onChange={(e) => setForm((f) => ({ ...f, count: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.publishNow} onChange={(e) => setForm((f) => ({ ...f, publishNow: e.target.checked }))} />
              生成后直接发布（否则进入 draft 草稿）
            </label>
            <div className="grid gap-2">
              <button className="kx-button-primary h-10 inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                      disabled={busy || macroBusy || (form.regionMode === "single" && !form.regionCode)} onClick={generate}>
                <Sparkles className="h-4 w-4" /> {busy ? "生成中…" : "一键生成"}
              </button>
              <button className="h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-kx-accent bg-kx-accentSoft/40 text-sm font-semibold text-kx-accent transition hover:bg-kx-accentSoft disabled:opacity-40"
                      disabled={busy || macroBusy || (form.regionMode === "single" && !form.regionCode)} onClick={seedCity}>
                <Wand2 className="h-4 w-4" /> {macroBusy ? "铺城中…" : "一键铺城（用户+粉丝+互动）"}
              </button>
              <p className="text-[11px] leading-4 text-kx-subtle">「一键铺城」= 导入城市用户 → 生成精选草稿 → 铺可信粉丝曲线 → 跑一轮互动，一步越过冷启动；<b>默认进草稿</b>，审阅后再发布。</p>
            </div>
          </div>
        </section>

        <section className="kx-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">内容预览</h2>
            {detail.data ? <span className="flex items-center gap-1.5 text-xs text-kx-muted">{detail.data.region_code} · {detail.data.language} {seedStatusPill(detail.data.status)}</span> : null}
          </div>
          {!selectedBatchId ? (
            <p className="mt-6 text-center text-sm text-kx-subtle">先生成一个批次，在这里读完再决定是否发布。</p>
          ) : detail.isLoading ? <InlineLoading /> : (
            <ul className="mt-3 max-h-[440px] space-y-2 overflow-y-auto pr-1">
              {detailItems.map((it) => (
                <li key={it.id} className="rounded-xl bg-kx-soft/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-kx-muted">
                    <span className="rounded-full bg-kx-accentSoft px-1.5 py-0.5 font-semibold text-kx-accent">{it.content_type}</span>
                    {it.authorName && !it.authorOfficial ? (
                      <span className="inline-flex items-center gap-1">
                        {it.authorAvatar ? <img src={it.authorAvatar} alt="" className="h-4 w-4 rounded-full object-cover" /> : null}
                        {it.authorName}{it.authorHandle ? <span className="text-kx-subtle">@{it.authorHandle}</span> : null}
                      </span>
                    ) : (
                      <span>{it.author_type === "editorial" ? "编辑部整理" : "城市助手"}</span>
                    )}
                    {seedStatusPill(it.status)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-kx-text">{it.content}</p>
                </li>
              ))}
              {detailItems.length === 0 ? <li className="py-6 text-center text-sm text-kx-subtle">该批次没有内容。</li> : null}
            </ul>
          )}
        </section>
      </div>

      <section className="kx-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">批次</h2>
          <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => batches.refetch()}>刷新</button>
        </div>
        {batches.isError ? <ErrorState onRetry={() => batches.refetch()} /> : !batches.data ? <InlineLoading /> : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-kx-subtle">还没有批次，先在左侧生成一批。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-kx-muted">
                <tr>
                  <th className="px-2 py-2">城市 / 语言</th><th className="px-2 py-2">类型</th>
                  <th className="px-2 py-2">数量</th><th className="px-2 py-2">状态</th>
                  <th className="px-2 py-2">创建</th><th className="px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className={clsx("border-t border-kx-soft", selectedBatchId === b.id && "bg-kx-accentSoft/30")}>
                    <td className="px-2 py-2.5"><div className="font-medium">{b.region_code}</div><div className="text-xs text-kx-muted">{b.language} · {b.tone}</div></td>
                    <td className="px-2 py-2.5">{b.content_type}</td>
                    <td className="px-2 py-2.5 tabular-nums">{b.created_count}<span className="text-xs text-kx-muted">/{b.count}</span></td>
                    <td className="px-2 py-2.5">{seedStatusPill(b.status)}</td>
                    <td className="px-2 py-2.5 text-xs text-kx-muted">{relativeTime(b.created_at)}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button className="kx-button-ghost h-8 px-2 text-xs" onClick={() => setSelectedBatchId(b.id)}>预览</button>
                        {b.status !== "cleared" ? (
                          <button className="kx-button-ghost h-8 px-2 text-xs text-emerald-700 disabled:opacity-40" disabled={b.status === "published"} onClick={() => publish(b.id)}>
                            <Send className="h-3.5 w-3.5" /> 发布
                          </button>
                        ) : null}
                        {b.status !== "cleared" ? (
                          <button className="kx-button-ghost h-8 px-2 text-xs text-kx-danger" onClick={() => setPendingClear(b.id)}>
                            <Eraser className="h-3.5 w-3.5" /> 清除
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="kx-card border border-kx-danger/20">
        <h2 className="text-base font-bold text-kx-danger">按城市清除 seed 内容</h2>
        <p className="mt-1 text-xs text-kx-muted">此操作只会清除系统生成的 seed 内容，不会删除真实用户内容。请确认城市、语言和批次。</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input className="kx-input h-10" value={cityForm.regionCode} onChange={(e) => setCityForm((f) => ({ ...f, regionCode: e.target.value.trim() }))} placeholder="region_code，例如 jp.tokyo.tokyo" />
          <select className="kx-input h-10" value={cityForm.language} onChange={(e) => setCityForm((f) => ({ ...f, language: e.target.value }))}>
            <option value="">全部语言</option>
            {SEED_LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="kx-input h-10" value={cityForm.contentType} onChange={(e) => setCityForm((f) => ({ ...f, contentType: e.target.value }))}>
            <option value="">全部类型</option>
            {SEED_TYPE_OPTIONS.filter((o) => o.value !== "mixed").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="kx-button-ghost h-10 px-4 text-kx-danger disabled:opacity-40" disabled={!cityForm.regionCode} onClick={() => setPendingCityClear(true)}>
            <Trash2 className="h-4 w-4" /> 清除
          </button>
        </div>
      </section>

      <section className="kx-card">
        <h2 className="text-base font-bold">操作日志</h2>
        {logs.isError ? <ErrorState onRetry={() => logs.refetch()} /> : !logs.data ? <InlineLoading /> : logs.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-kx-subtle">暂无操作记录。</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-xs">
            {logs.data.map((lg) => (
              <li key={lg.id} className="flex items-center gap-2 text-kx-subtle">
                <span className="rounded bg-kx-soft px-1.5 py-0.5 font-semibold text-kx-text">{lg.action}</span>
                <span>{lg.region_code || "-"}</span>
                <span className="text-kx-muted">{lg.language} {lg.content_type}</span>
                <span className="tabular-nums">×{lg.count}</span>
                <span className="ml-auto text-kx-muted">{relativeTime(lg.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingClear}
        title="清除这个批次的 seed 内容？"
        description="此操作只会清除系统生成的 seed 内容（软删除），不会删除任何真实用户内容。"
        destructive confirmLabel="清除" onConfirm={clearBatch} onCancel={() => setPendingClear(null)}
      />
      <ConfirmDialog
        open={pendingCityClear}
        title={`清除 ${cityForm.regionCode} 的 seed 内容？`}
        description="此操作只会清除该城市系统生成的 seed 内容（软删除），不会删除真实用户内容。请再次确认城市、语言和类型。"
        destructive confirmLabel="确认清除" onConfirm={clearCity} onCancel={() => setPendingCityClear(false)}
      />
      <ConfirmDialog
        open={pendingPackClear}
        title="清除已导入的精选内容包？"
        description="只会软删除由内容包导入的房源 / 商家 / 二手 / 民宿（带内容包标记），不会删除任何真实用户内容。可随时重新导入恢复。"
        destructive confirmLabel="确认清除" onConfirm={clearPack} onCancel={() => setPendingPackClear(false)}
      />
      <ConfirmDialog
        open={pendingUsersClear}
        title="清除已导入的城市用户？"
        description="只会删除由内容包导入的城市用户账号（带标记），不会动任何真实用户。被清除用户名下的内容包房源会自动归还回退账号。可随时重新导入。"
        destructive confirmLabel="确认清除" onConfirm={clearUsers} onCancel={() => setPendingUsersClear(false)}
      />
    </div>
  );
}

function bytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
