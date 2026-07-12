"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Megaphone, RefreshCw, Search, Send, X, Zap } from "lucide-react";
import { api, APIError, type AdminPushCampaign } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog } from "@/components/design/Dialog";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";

// AI/生成用户、已注销、已封禁账号在服务端一律自动排除。
const AUDIENCES = [
  { value: "all", label: "全部真实用户（自动排除AI/注销/封禁）" },
  { value: "verified_members", label: "认证会员" },
  { value: "active_30d", label: "最近 30 天活跃" },
  { value: "selected", label: "指定用户（自己挑）" },
];

const DEEP_LINKS = [
  { value: "", label: "不跳转（仅展示通知）" },
  { value: "post", label: "点击打开帖子" },
  { value: "listing", label: "点击打开信息 / 房源" },
];

export default function AdminPushPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [deepLinkType, setDeepLinkType] = useState("");
  const [deepLinkId, setDeepLinkId] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [pendingSend, setPendingSend] = useState<{ count: number | null } | null>(null);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/push");
  }, [router, status]);

  const q = useQuery({
    queryKey: ["admin-push-campaigns"],
    queryFn: () => api.adminPushCampaigns(80),
    enabled: status === "authed" && user?.role === "admin",
    refetchInterval: 6000,
  });

  // 指定用户 picker.
  const [userIds, setUserIds] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [userSearch, setUserSearch] = useState("");
  const dUserSearch = useDebounce(userSearch, 250);
  const userResults = useQuery({
    queryKey: ["admin-push-user-search", dUserSearch],
    queryFn: () => api.adminUsers({ q: dUserSearch || undefined, filter: "real", limit: 20 }),
    enabled: status === "authed" && user?.role === "admin" && audience === "selected",
  });
  const preview = useQuery({
    queryKey: ["admin-push-preview", audience, userIds],
    queryFn: () => api.adminPushCampaignPreview({ audience, user_ids: userIds }),
    enabled: status === "authed" && user?.role === "admin" && (audience !== "selected" || userIds.length > 0),
  });
  const toggleUser = (u: { id: string; display_name?: string; handle?: string }) => {
    setUserIds((cur) => (cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id]));
    setSelectedLabels((m) => ({ ...m, [u.id]: u.display_name || u.handle || u.id }));
  };

  const save = useMutation({
    mutationFn: () =>
      api.adminCreatePushCampaign({
        title,
        body,
        audience,
        user_ids: audience === "selected" ? userIds : undefined,
        deepLinkType: deepLinkType || undefined,
        deepLinkId: deepLinkType ? deepLinkId : undefined,
        urgent,
        sendNow: true,
      }),
    onSuccess: (campaign) => {
      pushToast({ kind: "success", message: `推送已提交，正在发送给约 ${campaign.recipientCount} 人` });
      setTitle("");
      setBody("");
      setDeepLinkType("");
      setDeepLinkId("");
      setUrgent(false);
      qc.invalidateQueries({ queryKey: ["admin-push-campaigns"] });
    },
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  if (status === "loading" || status === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><main className="px-6 py-16 text-center font-bold">无权访问</main></AppShell>;

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !save.isPending &&
    (audience !== "selected" || userIds.length > 0) &&
    (!deepLinkType || deepLinkId.trim().length > 0);

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <Megaphone className="h-5 w-5 text-kx-accent" /> 推送广播
        </h1>
      </header>

      <main className="space-y-3 px-3 py-3 sm:px-4">
        <section className="kx-card">
          <div>
            <h2 className="text-base font-bold">发送 App 推送通知</h2>
            <p className="mt-1 text-xs text-kx-muted">
              每条推送会写入用户的站内「通知」列表，并向已开启通知的设备发送系统横幅。密钥、验证码等敏感内容不会写入日志。
            </p>
          </div>

          <div className="mt-3 grid gap-3">
            <label className="text-xs font-bold text-kx-muted">
              发送对象
              <select className="kx-input mt-1 h-10" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            {audience === "selected" ? (
              <div className="rounded-xl border border-kx-soft bg-kx-soft/30 p-3">
                <div className="text-xs font-bold text-kx-muted">选择接收用户（只列真实用户，自动排除 AI/注销/封禁）</div>
                {userIds.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {userIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2 py-0.5 text-xs font-semibold text-kx-accent">
                        {selectedLabels[id] || id}
                        <button type="button" onClick={() => setUserIds((c) => c.filter((x) => x !== id))} className="hover:text-kx-danger"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <button type="button" className="text-xs text-kx-muted underline" onClick={() => setUserIds([])}>清空</button>
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-kx-soft bg-kx-bg px-2">
                  <Search className="h-3.5 w-3.5 text-kx-muted" />
                  <input className="h-9 flex-1 bg-transparent text-sm outline-none" placeholder="搜用户名 / 显示名 / 邮箱"
                         value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                </div>
                {userSearch ? (
                  <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-kx-soft">
                    {!userResults.data ? <div className="p-2 text-xs text-kx-muted">搜索中…</div> : userResults.data.items.length === 0 ? (
                      <div className="p-2 text-xs text-kx-muted">没有匹配的真实用户</div>
                    ) : userResults.data.items.map((u) => {
                      const on = userIds.includes(u.id);
                      return (
                        <button key={u.id} type="button" onClick={() => toggleUser(u)}
                          className={clsx("flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-kx-soft/60", on && "bg-kx-accentSoft/50")}>
                          <span className="min-w-0 truncate">
                            {u.display_name} <span className="text-xs text-kx-muted">@{u.handle}{u.email ? ` · ${u.email}` : ""}</span>
                          </span>
                          <span className={clsx("text-xs font-semibold", on ? "text-kx-accent" : "text-kx-muted")}>{on ? "已选" : "选"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs text-kx-muted">
              {audience === "selected" && userIds.length === 0
                ? "请先选择至少一个接收用户。"
                : preview.data
                  ? <>预计送达 <b className="text-kx-text">{preview.data.count}</b> 位真实用户（已排除 AI 生成、已注销、已封禁账号）。</>
                  : "正在计算接收人数…"}
            </p>

            <label className="text-xs font-bold text-kx-muted">
              通知标题
              <input className="kx-input mt-1 h-10" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="例如：系统维护通知" />
            </label>
            <label className="text-xs font-bold text-kx-muted">
              通知内容
              <textarea className="kx-textarea mt-1 min-h-32" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="推送正文…" />
            </label>

            <label className="text-xs font-bold text-kx-muted">
              点击跳转
              <select className="kx-input mt-1 h-10" value={deepLinkType} onChange={(e) => setDeepLinkType(e.target.value)}>
                {DEEP_LINKS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {deepLinkType ? (
              <label className="text-xs font-bold text-kx-muted">
                {deepLinkType === "post" ? "帖子 ID" : "信息 / 房源 ID"}
                <input className="kx-input mt-1 h-10" value={deepLinkId} onChange={(e) => setDeepLinkId(e.target.value)} maxLength={120} placeholder="点开通知后要打开的目标 ID" />
              </label>
            ) : null}

            <label className="flex items-start gap-2 rounded-xl border border-kx-soft bg-kx-soft/30 p-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rose-500" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              <span className="text-xs">
                <span className="inline-flex items-center gap-1 font-bold text-rose-600"><Zap className="h-3.5 w-3.5" /> 紧急推送</span>
                <span className="ml-1 text-kx-muted">忽略免打扰时段（22:00–09:00）和每日推送上限，立即触达设备。仅用于真正重要的通知。</span>
              </span>
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <button className="kx-button-primary h-10" disabled={!canSubmit} onClick={() => setPendingSend({ count: preview.data?.count ?? null })}>
                <Send className="h-4 w-4" /> 立即发送
              </button>
            </div>
          </div>
        </section>

        <section className="kx-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">发送记录</h2>
            <button className="kx-button-ghost h-9 px-3" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" />刷新</button>
          </div>
          {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data ? <InlineLoading /> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-xs text-kx-muted">
                  <tr><th className="py-2">标题</th><th>范围</th><th>状态</th><th>接收</th><th>送达</th><th>紧急</th><th>创建</th></tr>
                </thead>
                <tbody>
                  {q.data.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-kx-stroke/40">
                      <td className="max-w-[18rem] py-2 font-semibold">
                        <div className="truncate">{campaign.title}</div>
                        <div className="truncate text-xs font-normal text-kx-muted">{campaign.body}</div>
                      </td>
                      <td>{audienceLabel(campaign.audience)}</td>
                      <td><Status value={campaign.status} /></td>
                      <td>{campaign.recipientCount ?? 0}</td>
                      <td>{campaign.sentCount ?? 0}</td>
                      <td>{campaign.urgent ? <span className="text-rose-600 font-bold">紧急</span> : <span className="text-kx-muted">-</span>}</td>
                      <td className="text-xs text-kx-muted">{campaign.createdAt ? fullDateTime(campaign.createdAt) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={!!pendingSend}
        title="立即向 App 用户推送？"
        description={
          pendingSend?.count != null
            ? `将向约 ${pendingSend.count} 位真实用户立即推送「${title}」${urgent ? "（紧急：忽略免打扰与每日上限）" : ""}。发送后不可撤回。`
            : `将向所选范围的全部真实用户立即推送「${title}」${urgent ? "（紧急：忽略免打扰与每日上限）" : ""}。发送后不可撤回。`
        }
        destructive
        confirmLabel="确认发送"
        onConfirm={() => { save.mutate(); setPendingSend(null); }}
        onCancel={() => setPendingSend(null)}
      />
    </AppShell>
  );
}

function audienceLabel(value: string) {
  return AUDIENCES.find((item) => item.value === value)?.label || value;
}

function Status({ value }: { value: string }) {
  const tone =
    value === "sent" ? "bg-emerald-50 text-emerald-700" :
    value === "failed" ? "bg-rose-50 text-rose-700" :
    value === "partial" ? "bg-amber-50 text-amber-700" :
    value === "sending" || value === "queued" ? "bg-blue-50 text-blue-700" :
    "bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{value}</span>;
}
