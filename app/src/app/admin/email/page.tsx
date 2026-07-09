"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Mail, RefreshCw, Search, Send, X } from "lucide-react";
import { api, APIError, type AdminEmailCampaign } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog } from "@/components/design/Dialog";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";
import { useDebounce } from "@/lib/hooks";

// AI/生成用户、已注销、已封禁账号在服务端一律自动排除——所有范围都不会发给假邮箱。
const AUDIENCES = [
  { value: "all", label: "全部真实用户（自动排除AI/注销/封禁）" },
  { value: "verified_members", label: "认证会员" },
  { value: "active_30d", label: "最近 30 天活跃" },
  { value: "selected", label: "指定用户（自己挑）" },
];

export default function AdminEmailPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  // 群发是不可逆的批量动作,发送前统一走二次确认。pendingSend 记录待确认的发送
  // 意图:新编辑邮件(new)或收件记录里的草稿(existing)。
  const [pendingSend, setPendingSend] = useState<
    | { kind: "new"; count: number | null }
    | { kind: "existing"; id: string; subject: string; audience: string; count: number | null }
    | null
  >(null);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/email");
  }, [router, status]);

  const q = useQuery({
    queryKey: ["admin-email-campaigns"],
    queryFn: () => api.adminEmailCampaigns(80),
    enabled: status === "authed" && user?.role === "admin",
    refetchInterval: 8000,
  });

  // 指定用户 picker state.
  const [userIds, setUserIds] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [userSearch, setUserSearch] = useState("");
  const dUserSearch = useDebounce(userSearch, 250);
  const userResults = useQuery({
    queryKey: ["admin-email-user-search", dUserSearch],
    queryFn: () => api.adminUsers({ q: dUserSearch || undefined, filter: "real", limit: 20 }),
    enabled: status === "authed" && user?.role === "admin" && audience === "selected",
  });
  // Live recipient count — reassures the operator that AI/注销/封禁 are excluded.
  const preview = useQuery({
    queryKey: ["admin-email-preview", audience, userIds],
    queryFn: () => api.adminEmailCampaignPreview({ audience, user_ids: userIds }),
    enabled: status === "authed" && user?.role === "admin" && (audience !== "selected" || userIds.length > 0),
  });
  const toggleUser = (u: { id: string; display_name?: string; handle?: string }) => {
    setUserIds((cur) => (cur.includes(u.id) ? cur.filter((x) => x !== u.id) : [...cur, u.id]));
    setSelectedLabels((m) => ({ ...m, [u.id]: u.display_name || u.handle || u.id }));
  };

  const save = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const payload = { subject, body, audience, user_ids: audience === "selected" ? userIds : undefined };
      if (editingId) {
        const campaign = await api.adminUpdateEmailCampaign(editingId, payload);
        return sendNow ? api.adminSendEmailCampaign(campaign.id) : campaign;
      }
      return api.adminCreateEmailCampaign({ ...payload, sendNow });
    },
    onSuccess: (campaign) => {
      pushToast({ kind: "success", message: campaign.status === "draft" ? "邮件草稿已保存" : "邮件任务已提交" });
      setEditingId(campaign.status === "draft" ? campaign.id : "");
      if (campaign.status !== "draft") {
        setSubject("");
        setBody("");
        setAudience("all");
        setUserIds([]);
        setSelectedLabels({});
      }
      qc.invalidateQueries({ queryKey: ["admin-email-campaigns"] });
    },
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  const sendExisting = useMutation({
    mutationFn: (id: string) => api.adminSendEmailCampaign(id),
    onSuccess: () => {
      pushToast({ kind: "success", message: "邮件任务已提交" });
      qc.invalidateQueries({ queryKey: ["admin-email-campaigns"] });
    },
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  if (status === "loading" || status === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><main className="px-6 py-16 text-center font-bold">无权访问</main></AppShell>;

  const canSubmit = subject.trim().length > 0 && body.trim().length > 0 && !save.isPending
    && (audience !== "selected" || userIds.length > 0);

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <Mail className="h-5 w-5 text-kx-accent" /> 邮件系统
        </h1>
      </header>

      <main className="space-y-3 px-3 py-3 sm:px-4">
        <section className="kx-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold">编辑群发邮件</h2>
              <p className="mt-1 text-xs text-kx-muted">正文以纯文本发送；验证码、密钥和私密内容不会写入日志。</p>
            </div>
            {editingId ? (
              <button
                type="button"
                className="kx-button-ghost h-9"
                onClick={() => {
                  setEditingId("");
                  setSubject("");
                  setBody("");
                  setAudience("all");
                  setUserIds([]);
                  setSelectedLabels({});
                }}
              >
                新建邮件
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3">
            <label className="text-xs font-bold text-kx-muted">
              收件范围
              <select className="kx-input mt-1 h-10" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            {audience === "selected" ? (
              <div className="rounded-xl border border-kx-soft bg-kx-soft/30 p-3">
                <div className="text-xs font-bold text-kx-muted">选择收件用户（只列真实用户，自动排除 AI/注销/封禁）</div>
                {/* Selected chips */}
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
                {/* Search */}
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
                ? "请先选择至少一个收件用户。"
                : preview.data
                  ? <>预计送达 <b className="text-kx-text">{preview.data.count}</b> 个真实用户（已排除 AI 生成、已注销、已封禁账号）。</>
                  : "正在计算收件人数…"}
            </p>
            <label className="text-xs font-bold text-kx-muted">
              邮件标题
              <input className="kx-input mt-1 h-10" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={180} />
            </label>
            <label className="text-xs font-bold text-kx-muted">
              邮件正文
              <textarea className="kx-textarea mt-1 min-h-56" value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="kx-button-ghost h-10" disabled={!canSubmit} onClick={() => save.mutate(false)}>
                保存草稿
              </button>
              <button className="kx-button-primary h-10" disabled={!canSubmit} onClick={() => setPendingSend({ kind: "new", count: preview.data?.count ?? null })}>
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
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-kx-muted">
                  <tr><th className="py-2">标题</th><th>范围</th><th>状态</th><th>收件</th><th>成功</th><th>失败</th><th>创建</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {q.data.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-kx-stroke/40">
                      <td className="max-w-[18rem] py-2 font-semibold">
                        <div className="truncate">{campaign.subject}</div>
                        <div className="truncate text-xs font-normal text-kx-muted">{campaign.id}</div>
                      </td>
                      <td>{audienceLabel(campaign.audience)}</td>
                      <td><Status value={campaign.status} /></td>
                      <td>{campaign.recipient_count ?? campaign.recipientCount ?? 0}</td>
                      <td>{campaign.sent_count ?? campaign.sentCount ?? 0}</td>
                      <td>{campaign.failed_count ?? campaign.failedCount ?? 0}</td>
                      <td className="text-xs text-kx-muted">{campaign.created_at ? fullDateTime(campaign.created_at) : "-"}</td>
                      <td>
                        <div className="flex gap-1">
                          {campaign.status === "draft" ? (
                            <>
                              <button className="kx-button-ghost h-8 px-2 text-xs" onClick={() => loadDraft(campaign, setEditingId, setSubject, setBody, setAudience, setUserIds, setSelectedLabels)}>编辑</button>
                              <button className="kx-button-primary h-8 px-2 text-xs" disabled={sendExisting.isPending} onClick={() => setPendingSend({ kind: "existing", id: campaign.id, subject: campaign.subject, audience: campaign.audience || "all", count: campaign.recipient_count ?? campaign.recipientCount ?? null })}>发送</button>
                            </>
                          ) : <span className="text-xs text-kx-muted">-</span>}
                        </div>
                      </td>
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
        title="立即群发这封邮件？"
        description={
          pendingSend?.kind === "new"
            ? pendingSend.count != null
              ? `将向约 ${pendingSend.count} 位真实用户立即群发（已排除 AI 生成、已注销、已封禁账号）。发送后不可撤回。`
              : "将向所选范围的全部真实用户立即群发（已排除 AI 生成、已注销、已封禁账号）。发送后不可撤回。"
            : pendingSend
              ? `草稿「${pendingSend.subject}」将立即群发到「${audienceLabel(pendingSend.audience)}」${pendingSend.count ? `（约 ${pendingSend.count} 位收件人）` : ""}。发送后不可撤回。`
              : undefined
        }
        destructive
        confirmLabel="确认发送"
        onConfirm={() => {
          if (!pendingSend) return;
          if (pendingSend.kind === "new") save.mutate(true);
          else sendExisting.mutate(pendingSend.id);
          setPendingSend(null);
        }}
        onCancel={() => setPendingSend(null)}
      />
    </AppShell>
  );
}

function loadDraft(
  campaign: AdminEmailCampaign,
  setEditingId: (value: string) => void,
  setSubject: (value: string) => void,
  setBody: (value: string) => void,
  setAudience: (value: string) => void,
  setUserIds: (value: string[]) => void,
  setSelectedLabels: (value: Record<string, string>) => void,
) {
  setEditingId(campaign.id);
  setSubject(campaign.subject);
  setBody(campaign.body);
  setAudience(campaign.audience || "all");
  const ids = campaign.audienceUserIds || [];
  setUserIds(ids);
  // Labels aren't stored server-side; show ids until the admin re-searches.
  setSelectedLabels(Object.fromEntries(ids.map((id) => [id, id])));
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
