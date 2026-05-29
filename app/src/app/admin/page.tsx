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
} from "lucide-react";
import { api, APIError, type MarketingCopyBlock } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog } from "@/components/design/Dialog";
import { NavTabs } from "@/components/design/NavTabs";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime, relativeTime, compactNumber } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, type ContentType } from "@/lib/types";
import { marketingPageLabels, type MarketingPageId } from "@/data/marketing-pages";

type Tab = "overview" | "users" | "posts" | "reports" | "feedback" | "visitors" | "site";

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "overview", label: "总览",  icon: Activity },
  { value: "users",    label: "用户",  icon: Users },
  { value: "posts",    label: "帖子",  icon: FileText },
  { value: "reports",  label: "举报",  icon: Flag },
  { value: "feedback", label: "反馈",  icon: MessageSquareWarning },
  { value: "visitors", label: "访客",  icon: MapPin },
  { value: "site",     label: "官网文案", icon: Globe },
];

export default function AdminPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const [tab, setTab] = useState<Tab>("overview");

  // Auth + admin gate. While session bootstrapping, we render nothing
  // so we don't flash 403 to the actual admin.
  useEffect(() => {
    if (status === "unauthed") router.replace("/login?next=/admin");
  }, [status, router]);

  if (status === "loading" || status === "idle") {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }
  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <AppShell>
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
    <AppShell>
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
        {tab === "overview" ? <OverviewPanel /> : null}
        {tab === "users"    ? <UsersPanel /> : null}
        {tab === "posts"    ? <PostsPanel /> : null}
        {tab === "reports"  ? <ReportsPanel /> : null}
        {tab === "feedback" ? <FeedbackPanel /> : null}
        {tab === "visitors" ? <VisitorsPanel /> : null}
        {tab === "site"     ? <SiteCopyPanel /> : null}
      </div>
    </AppShell>
  );
}

function OverviewPanel() {
  const q = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.adminStats(),
    refetchInterval: 30000,
  });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  const s = q.data.stats as Record<string, number | string | string[]>;
  const cards = [
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
          {(s.allowed_origins as string[]).map((o) => (
            <span key={o} className="px-2 py-1 rounded-full bg-kx-soft text-xs font-mono">{o}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [pendingBan, setPendingBan] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin-users", dq],
    queryFn: () => api.adminUsers(dq || undefined),
  });

  const update = async (id: string, patch: Parameters<typeof api.adminUpdateUser>[1]) => {
    try {
      await api.adminUpdateUser(id, patch);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      pushToast({ kind: "success", message: "已更新" });
    } catch (e) { pushToast({ kind: "error", message: (e as APIError).message }); }
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

  return (
    <div className="space-y-3">
      <div className="kx-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-kx-muted" />
        <input className="kx-input h-9" placeholder="搜用户名 / 显示名 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
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
                {list.data.map((u) => (
                  <tr key={u.id} className="border-t border-kx-stroke/30 hover:bg-kx-soft/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/u/${u.handle}`} className="flex items-center gap-2 group min-w-0">
                        <Avatar user={u} size={32} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate inline-flex items-center gap-1 group-hover:underline">
                            {u.display_name}
                            {u.is_verified ? <VerifiedBadge /> : null}
                          </div>
                          <div className="text-xs text-kx-muted truncate">@{u.handle}</div>
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
                    <td className="px-3 py-2.5 text-right tabular-nums">{compactNumber(u.follower_count || 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{compactNumber(u.post_count || 0)}</td>
                    <td className="px-3 py-2.5 text-xs text-kx-muted whitespace-nowrap">{u.joined_at ? fullDateTime(u.joined_at).split(" ")[0] : ""}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
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
                        <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingBan(u.id)}>
                          <Ban className="w-3.5 h-3.5" /> 封禁
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.data.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-kx-muted">没有匹配的用户</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <ul className="md:hidden space-y-2">
            {list.data.map((u) => (
              <li key={u.id} className="kx-card">
                <div className="flex items-start gap-2.5">
                  <Avatar user={u} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${u.handle}`} className="font-semibold inline-flex items-center gap-1 hover:underline">
                      {u.display_name}
                      {u.is_verified ? <VerifiedBadge /> : null}
                    </Link>
                    <div className="text-xs text-kx-muted">@{u.handle}</div>
                    <div className="text-xs text-kx-muted mt-1 flex gap-3">
                      <span>{compactNumber(u.follower_count || 0)} 粉丝</span>
                      <span>{compactNumber(u.post_count || 0)} 帖</span>
                      <span>{u.joined_at ? fullDateTime(u.joined_at).split(" ")[0] : ""}</span>
                    </div>
                  </div>
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
                    className={clsx("kx-button-ghost h-8 px-3 text-xs", u.is_verified && "bg-kx-accentSoft text-kx-accent")}
                    onClick={() => update(u.id, { is_verified: !u.is_verified })}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {u.is_verified ? "已认证" : "认证"}
                  </button>
                  <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingBan(u.id)}>
                    <Ban className="w-3.5 h-3.5" /> 封禁
                  </button>
                </div>
              </li>
            ))}
            {list.data.length === 0 ? <li className="text-center text-kx-muted py-8">没有匹配的用户</li> : null}
          </ul>
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
    </div>
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
                    {p.author?.is_verified ? <VerifiedBadge /> : null}
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
    [v.country, v.region, v.city].filter(Boolean).join(" / ");

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
                    {c.country} · {compactNumber(c.count)}
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

type SitePageKey = MarketingPageId | "home";

const SITE_PAGE_OPTIONS: Array<{ value: SitePageKey; label: string }> = [
  { value: "home", label: "首页" },
  ...(Object.entries(marketingPageLabels) as Array<[MarketingPageId, string]>).map(([value, label]) => ({ value, label })),
];

const SITE_LOCALE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

function SiteCopyPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const list = useQuery({ queryKey: ["admin-marketing-copy"], queryFn: () => api.adminMarketingCopy() });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [form, setForm] = useState({
    page_key: "home" as SitePageKey,
    locale: "zh",
    status: "published" as "draft" | "published",
    sort_order: 0,
    title: "",
    body: "",
  });

  const reset = () => {
    setEditingId(null);
    setForm({ page_key: "home", locale: "zh", status: "published", sort_order: 0, title: "", body: "" });
  };

  const edit = (item: MarketingCopyBlock) => {
    setEditingId(item.id);
    setForm({
      page_key: item.page_key as SitePageKey,
      locale: item.locale,
      status: item.status,
      sort_order: item.sort_order,
      title: item.title,
      body: item.body,
    });
  };

  const save = async () => {
    try {
      if (editingId) {
        await api.adminUpdateMarketingCopy(editingId, form);
      } else {
        await api.adminCreateMarketingCopy(form);
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-copy"] });
      await queryClient.invalidateQueries({ queryKey: ["marketing-copy"] });
      pushToast({ kind: "success", message: editingId ? "官网文案已更新" : "官网文案已创建" });
      reset();
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    try {
      await api.adminDeleteMarketingCopy(pendingDelete);
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-copy"] });
      await queryClient.invalidateQueries({ queryKey: ["marketing-copy"] });
      setPendingDelete(null);
      if (editingId === pendingDelete) reset();
      pushToast({ kind: "success", message: "官网文案已删除" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };

  const items = list.data || [];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="kx-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">官网文案管理</h2>
            <p className="mt-1 text-xs text-kx-muted">为首页和官网子页面添加、修改、删除公开内容。</p>
          </div>
          <button className="kx-button-ghost h-8 px-3 text-xs" onClick={reset}>新建</button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            页面
            <select
              className="kx-input h-10"
              value={form.page_key}
              onChange={(e) => setForm((f) => ({ ...f, page_key: e.target.value as SitePageKey }))}
            >
              {SITE_PAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              语言
              <select className="kx-input h-10" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}>
                {SITE_LOCALE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              状态
              <select className="kx-input h-10" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "draft" | "published" }))}>
                <option value="published">published</option>
                <option value="draft">draft</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              排序
              <input className="kx-input h-10" type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))} />
            </label>
          </div>

          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            标题
            <input className="kx-input h-10" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="例如：东京频道开放计划" />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            正文
            <textarea
              className="kx-input min-h-[180px] resize-y py-3"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="填写要展示在官网对应页面的内容。"
            />
          </label>

          <div className="flex gap-2">
            <button className="kx-button-primary h-10 flex-1" onClick={save}>
              {editingId ? "保存修改" : "发布文案"}
            </button>
            {editingId ? <button className="kx-button-ghost h-10 px-4" onClick={reset}>取消</button> : null}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data ? <InlineLoading /> : null}
        {items.map((item) => (
          <article key={item.id} className="kx-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 font-semibold text-kx-accent">
                    {SITE_PAGE_OPTIONS.find((p) => p.value === item.page_key)?.label || item.page_key}
                  </span>
                  <span className="rounded-full bg-kx-soft px-2 py-0.5 font-semibold text-kx-muted">{item.locale}</span>
                  <span className={clsx("rounded-full px-2 py-0.5 font-semibold", item.status === "published" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>
                    {item.status}
                  </span>
                  <span className="text-kx-muted">排序 {item.sort_order}</span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-kx-text">{item.title}</h3>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-kx-subtle">{item.body}</p>
                <p className="mt-2 text-xs text-kx-muted">更新于 {fullDateTime(item.updated_at)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => edit(item)}>编辑</button>
                <button className="kx-button-ghost h-8 px-3 text-xs text-kx-danger" onClick={() => setPendingDelete(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </div>
            </div>
          </article>
        ))}
        {list.data && items.length === 0 ? <div className="kx-card py-10 text-center text-kx-subtle">暂无官网文案，先创建一条。</div> : null}
      </section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这条官网文案？"
        description="删除后对应官网页面将不再展示这条内容。"
        destructive
        confirmLabel="删除"
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
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
