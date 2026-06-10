"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, RefreshCw, Send } from "lucide-react";
import { api, APIError, type AdminEmailCampaign } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";

const AUDIENCES = [
  { value: "all", label: "全部有邮箱用户" },
  { value: "verified_members", label: "认证会员" },
  { value: "active_30d", label: "最近 30 天活跃" },
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

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/email");
  }, [router, status]);

  const q = useQuery({
    queryKey: ["admin-email-campaigns"],
    queryFn: () => api.adminEmailCampaigns(80),
    enabled: status === "authed" && user?.role === "admin",
    refetchInterval: 8000,
  });

  const save = useMutation({
    mutationFn: async (sendNow: boolean) => {
      if (editingId) {
        const campaign = await api.adminUpdateEmailCampaign(editingId, { subject, body, audience });
        return sendNow ? api.adminSendEmailCampaign(campaign.id) : campaign;
      }
      return api.adminCreateEmailCampaign({ subject, body, audience, sendNow });
    },
    onSuccess: (campaign) => {
      pushToast({ kind: "success", message: campaign.status === "draft" ? "邮件草稿已保存" : "邮件任务已提交" });
      setEditingId(campaign.status === "draft" ? campaign.id : "");
      if (campaign.status !== "draft") {
        setSubject("");
        setBody("");
        setAudience("all");
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

  const canSubmit = subject.trim().length > 0 && body.trim().length > 0 && !save.isPending;

  return (
    <AppShell>
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
              <button className="kx-button-primary h-10" disabled={!canSubmit} onClick={() => save.mutate(true)}>
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
                              <button className="kx-button-ghost h-8 px-2 text-xs" onClick={() => loadDraft(campaign, setEditingId, setSubject, setBody, setAudience)}>编辑</button>
                              <button className="kx-button-primary h-8 px-2 text-xs" disabled={sendExisting.isPending} onClick={() => sendExisting.mutate(campaign.id)}>发送</button>
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
    </AppShell>
  );
}

function loadDraft(
  campaign: AdminEmailCampaign,
  setEditingId: (value: string) => void,
  setSubject: (value: string) => void,
  setBody: (value: string) => void,
  setAudience: (value: string) => void,
) {
  setEditingId(campaign.id);
  setSubject(campaign.subject);
  setBody(campaign.body);
  setAudience(campaign.audience || "all");
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
